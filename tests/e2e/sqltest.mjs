import { PGlite } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import fs from 'fs';
const db = new PGlite({ extensions:{ citext } });
const ok = (m)=>console.log('ok  ', m), bad = (m)=>{ console.log('FAIL', m); process.exitCode = 1; };
// Supabase stand-ins
await db.exec(`
  create role authenticated; create role anon;
  create schema auth; create table auth.users(id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid() primary key, bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  create publication supabase_realtime;
`);
const sql = fs.readFileSync(new URL('../../supabase/migrations/0001_koko.sql', import.meta.url),'utf8');
try{ await db.exec(sql); ok('migration runs'); } catch(e){ bad('migration: '+e.message); process.exit(1); }
const sql2 = fs.readFileSync(new URL('../../supabase/migrations/0002_share.sql', import.meta.url),'utf8');
try{ await db.exec(sql2); ok('share migration runs'); } catch(e){ bad('share migration: '+e.message); process.exit(1); }
try{ await db.exec(sql2); ok('share migration runs a second time'); } catch(e){ bad('share migration rerun: '+e.message); process.exit(1); }
// ---- several crews (0003), run over data made under the one-crew rules ----
const L1='30000000-0000-0000-0000-0000000000a1', L2='30000000-0000-0000-0000-0000000000a2';
await db.exec(`grant usage on schema public, storage, auth to authenticated; grant all on all tables in schema public to authenticated;
  insert into auth.users values ('${L1}','l1@x'),('${L2}','l2@x');`);
const asPre = async (u, q, params)=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`); return db.query(q, params); };
const lc = (await asPre(L1, `select * from create_crew('Old Crew','')`)).rows[0];
await asPre(L2, `select join_crew($1)`, [lc.code]);
await asPre(L1, `insert into venues(id,name,zone) values ('lv1','Old','satwa')`);
await asPre(L1, `insert into entries(id,venue_id,kind,private) values ('le1','lv1','visit',false),('le2','lv1','visit',true)`);
await db.exec('reset role');
const sql3 = fs.readFileSync(new URL('../../supabase/migrations/0003_multi_crew.sql', import.meta.url),'utf8');
try{ await db.exec(sql3); ok('multi-crew migration runs over existing data'); } catch(e){ bad('multi-crew migration: '+e.message); process.exit(1); }
try{ await db.exec(sql3); ok('multi-crew migration runs a second time'); } catch(e){ bad('multi-crew rerun: '+e.message); process.exit(1); }
const oldCode = lc.code;
const sql6 = fs.readFileSync(new URL('../../supabase/migrations/0006_security.sql', import.meta.url),'utf8');
try{ await db.exec(sql6); await db.exec(sql6); ok('security migration runs (twice)'); } catch(e){ bad('security migration: '+e.message); process.exit(1); }
const newCode = (await db.query(`select code from crews where id=$1`, [lc.id])).rows[0].code;
/^[A-Z]{3,5}\d\d$/.test(oldCode) && /^[0-9A-F]{10}$/.test(newCode) ? ok('old guessable crew code '+oldCode+' replaced with '+newCode) : bad('code rotation '+oldCode+' -> '+newCode);
const back = (await asPre(L2, `select id, crew_ids from entries`)).rows;
back.length===1 && back[0].id==='le1' && back[0].crew_ids[0]===lc.id ? ok('existing shared visit moved to its crew; private one stays private') : bad('backfill '+JSON.stringify(back));
await db.exec('reset role');

// Supabase grants table access to the API roles; policies do the rest
await db.exec(`grant usage on schema public, storage, auth to authenticated; grant all on all tables in schema public to authenticated; grant all on storage.objects to authenticated;`);
const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', C='00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users values ('${A}','a@x'),('${B}','b@x'),('${C}','c@x');`);
const as = async (u, q, params)=>{ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${u}',false); set role authenticated;`); return db.query(q, params); };
const expectErr = async (label, u, q)=>{ try{ await as(u, q); bad(label+' (should have been refused)'); }catch(e){ ok(label+' → refused'); } };
const count = async (u, q)=> (await as(u, q)).rows.length;

(await count(A, `select * from profiles`))===1 ? ok('trigger made a profile, A sees only self') : bad('profiles');
await as(A, `update profiles set handle='alice', name='Alice' where id=auth.uid()`);
(await as(B, `select handle_available('alice') as a`)).rows[0].a===false ? ok('handle taken check') : bad('handle_available');
const crew = (await as(A, `select * from create_crew('Karak Crew','chai')`)).rows[0];
/^[0-9A-F]{10}$/.test(crew.code) ? ok('create_crew gives a random code '+crew.code) : bad('code '+crew.code);
(await as(A, `update crews set code='EASY12' where id=$1 returning code`, [crew.id])).rows[0]?.code===crew.code ? ok('the owner cannot pick a guessable code') : bad('code change');
(await as(C, `select crew_preview($1) as p`, [crew.code])).rows[0].p.count===1 ? ok('invite preview works for an outsider') : bad('preview');
(await as(B, `select join_crew($1) as r`, [crew.code])).rows[0].r==='ok' ? ok('B joins with the code') : bad('join');
(await as(C, `select join_crew('NOPE12') as r`)).rows[0].r==='invalid' ? ok('bad code → invalid') : bad('invalid');
await as(A, `insert into venues(id,name,zone) values ('v1','Ravi','satwa')`);
await as(A, `insert into entries(id,venue_id,kind,rating,private) values ('e1','v1','visit',4.5,false),('e2','v1','visit',3,true)`); await as(A, `update entries set crew_ids=array['${crew.id}']::uuid[] where id='e1'`);
(await count(B, `select * from entries`))===1 ? ok('crewmate sees the shared visit, not the private one') : bad('B entries');
(await count(C, `select * from entries`))===0 ? ok('outsider sees nothing') : bad('C entries');
(await count(C, `select * from venues`))===0 ? ok('outsider sees no places') : bad('C venues');
(await count(B, `select * from venues`))===1 ? ok('crewmate sees the place') : bad('B venues');
(await count(B, `select * from profiles`))===2 ? ok('crewmates see each other') : bad('B profiles');
await expectErr('B writes a visit as A', B, `insert into entries(id,venue_id,user_id,kind) values ('e3','v1','${A}','visit')`);
(await as(B, `update entries set notes='hacked' where id='e1' returning id`)).rows.length===0 ? ok('B cannot edit A\'s visit') : bad('edit other');
(await as(B, `delete from entries where id='e1' returning id`)).rows.length===0 ? ok('B cannot delete A\'s visit') : bad('delete other');
await as(A, `insert into photos(id,venue_id,entry_id,path,private,crew_ids) values ('p1','v1','e1','${A}/p1.jpg',false,array['${crew.id}']::uuid[]),('p2','v1','e2','${A}/p2.jpg',true,'{}')`);
await as(A, `insert into storage.objects(bucket_id,name) values ('photos','${A}/p1.jpg'),('photos','${A}/p2.jpg')`);
(await count(B, `select * from storage.objects`))===1 ? ok('crewmate can open the shared photo file only') : bad('B storage');
(await count(C, `select * from storage.objects`))===0 ? ok('outsider can open no photo files') : bad('C storage');
await expectErr('B uploads into A\'s folder', B, `insert into storage.objects(bucket_id,name) values ('photos','${A}/evil.jpg')`);
(await as(B, `select toggle_bookmark('p1') as b`)).rows[0].b===true ? ok('crewmate bookmarks a shared photo') : bad('bookmark');
(await as(C, `select toggle_bookmark('p1') as b`)).rows[0].b===false ? ok('outsider cannot bookmark') : bad('C bookmark');
await as(A, `insert into events(id,crew_id,venue_id,starts_at,rsvps) values ('ev1','${crew.id}','v1','2026-10-02T21:30','{}')`);
await as(B, `select rsvp('ev1','going')`);
(await as(A, `select rsvps from events where id='ev1'`)).rows[0].rsvps[B]==='going' ? ok('RSVP recorded') : bad('rsvp');
(await count(C, `select * from events`))===0 ? ok('outsider sees no plans') : bad('C events');
await as(A, `insert into books(id,crew_id,kind,title) values ('crewbook-x','${crew.id}','crew','Karak Crew Scrapbook')`);
(await as(B, `update books set pages='{"2026-09-30":{"layout":"grid"}}' where id='crewbook-x' returning id`)).rows.length===1 ? ok('crewmate edits a crew book page') : bad('crew book');
await expectErr('second crew book for the same crew', B, `insert into books(id,crew_id,kind) values ('crewbook-y','${crew.id}','crew')`);
await expectErr('B joins nothing but writes a crew', B, `insert into crews(name,code,owner_id) values ('x','ABCD12','${B}')`);
(await as(B, `delete from crew_members where user_id='${A}' returning user_id`)).rows.length===0 ? ok('non-owner cannot remove members') : bad('remove');
await as(B, `select leave_crew($1)`, [crew.id]);
(await count(B, `select * from entries`))===0 ? ok('after leaving, B no longer sees A\'s visits') : bad('leave');
await as(A, `select leave_crew($1)`, [crew.id]);
(await as(A, `select count(*)::int as n from crews`)).rows[0].n===0 ? ok('last one out: crew deleted') : bad('crew delete');
// 15 member cap
const ids = Array.from({length:16}, (_,i)=>'10000000-0000-0000-0000-'+String(i).padStart(12,'0'));
await db.exec(`reset role; insert into auth.users(id,email) select unnest(array[${ids.map(i=>`'${i}'::uuid`).join(',')}]), 'x';`);
const c2 = (await as(ids[0], `select * from create_crew('Big','')`)).rows[0];
let last; for (let i=1;i<16;i++) last = (await as(ids[i], `select join_crew($1) as r`, [c2.code])).rows[0].r;
last==='full' ? ok('the 16th person is refused: crew full') : bad('cap: '+last);
// ---- share to Koko: the source link is the owner's alone ----
const D='20000000-0000-0000-0000-00000000000d', E='20000000-0000-0000-0000-00000000000e';
await db.exec(`reset role; insert into auth.users values ('${D}','d@x'),('${E}','e@x');`);
const c3 = (await as(D, `select * from create_crew('Share Crew','')`)).rows[0];
await as(E, `select join_crew($1)`, [c3.code]);
await as(D, `insert into venues(id,name,zone,google_place_id) values ('sv1','Trio','downtown','ChIJtrio')`);
await as(D, `insert into entries(id,venue_id,kind,private,source_type) values ('se1','sv1','want',false,'tiktok'),('se2','sv1','want',true,'tiktok')`);
await as(D, `update entries set crew_ids=array['${c3.id}']::uuid[] where id='se1'`);
await as(D, `insert into entry_sources(entry_id,source_url) values ('se1','https://vm.tiktok.com/abc/'),('se2','https://vm.tiktok.com/def/')`);
(await as(E, `select source_type from entries where id='se1'`)).rows[0]?.source_type==='tiktok' ? ok('crewmate sees "from TikTok" on a shared save') : bad('source type');
(await count(E, `select * from entry_sources`))===0 ? ok('crewmate can never read the source link') : bad('entry_sources leak');
(await count(E, `select * from entries where id='se2'`))===0 ? ok('a private save from a share stays invisible to the crew') : bad('private share leak');
(await count(D, `select * from entry_sources`))===2 ? ok('owner reads their own links') : bad('owner sources');
await expectErr('crewmate writes a link onto the owner\'s visit', E, `insert into entry_sources(entry_id,source_url) values ('se1','x')`);
await as(D, `insert into share_inbox(id,source_url,status) values ('in1','https://vm.tiktok.com/x/','pending')`);
(await count(E, `select * from share_inbox`))===0 ? ok('inbox is owner-only') : bad('inbox leak');
(await as(E, `delete from share_inbox where id='in1' returning id`)).rows.length===0 ? ok("nobody else can remove your Inbox items") : bad('inbox delete by other');
(await as(D, `delete from share_inbox where id='in1' returning id`)).rows.length===1 ? ok('you can remove your own (adding a share removes it)') : bad('inbox delete own');
let n; for (let i=0;i<3;i++) n=(await as(D, `select share_rate_hit() as n`)).rows[0].n;
n===3 ? ok('rate limit counts this hour\'s calls') : bad('rate '+n);
(await count(E, `select * from share_rate`))===0 ? ok('nobody reads the rate table directly') : bad('rate table');
await as(D, `select share_cache_put('k1','{"finalUrl":"https://www.google.com/maps/place/X"}')`);
(await as(D, `select share_cache_get('k1') as v`)).rows[0].v?.finalUrl ? ok('link cache works for the person who filled it') : bad('cache own');
(await as(E, `select share_cache_get('k1') as v`)).rows[0].v===null ? ok('one person cannot plant link-cache answers for others') : bad('cache shared');
(await count(E, `select * from share_cache`))===0 ? ok('cache table not readable directly') : bad('cache table');
(await count(E, `select * from place_type_categories`))>30 ? ok('category map readable') : bad('categories');

// ---- several crews: X is in Family and Work; Y is in Family only; Z is in Work only ----
const X='40000000-0000-0000-0000-0000000000f1', Y='40000000-0000-0000-0000-0000000000f2', Z='40000000-0000-0000-0000-0000000000f3';
await db.exec(`reset role; insert into auth.users values ('${X}','x@x'),('${Y}','y@x'),('${Z}','z@x');`);
const fam = (await as(X, `select * from create_crew('Family','')`)).rows[0];
const work = (await as(X, `select * from create_crew('Work','')`)).rows[0];
(await as(X, `select count(*)::int n from crews`)).rows[0].n===2 ? ok('one person in two crews (creating a second keeps the first)') : bad('two crews');
await as(Y, `select join_crew($1)`, [fam.code]); await as(Z, `select join_crew($1)`, [work.code]);
await as(X, `insert into venues(id,name,zone) values ('mv1','Date night','jbr')`);
await as(X, `insert into entries(id,venue_id,kind,private,crew_ids) values ('me1','mv1','visit',false,array['${fam.id}']::uuid[]),('me2','mv1','want',false,array['${fam.id}','${work.id}']::uuid[])`);
(await count(Y, `select * from entries where id in ('me1','me2')`))===2 ? ok('Family sees what was shared with Family') : bad('Y sees');
(await count(Z, `select * from entries where id in ('me1','me2')`))===1 ? ok('Work sees only what was shared with Work') : bad('Z sees');
(await count(Y, `select * from profiles where id='${Z}'`))===0 ? ok("people in different crews of mine don't see each other") : bad('Y sees Z');
(await count(Y, `select * from crews`))===1 ? ok('a crew is visible to its members only') : bad('Y crews');
await expectErr('sharing into a crew you are not in', Y, `insert into entries(id,venue_id,kind,private,crew_ids) values ('me3','mv1','visit',false,array['${work.id}']::uuid[])`);
await as(Y, `insert into entries(id,venue_id,kind,private) values ('me4','mv1','visit',true)`);
await expectErr('moving your visit into a crew you are not in', Y, `update entries set crew_ids=array['${work.id}']::uuid[], private=false where id='me4'`);
await as(Z, `select leave_crew($1)`, [work.id]);
(await count(Z, `select * from entries where id in ('me1','me2')`))===0 ? ok("after leaving Work, Z sees none of X's posts") : bad('Z after leave');
await as(X, `select leave_crew($1)`, [fam.id]);
const me1 = (await as(X, `select crew_ids, private from entries where id='me1'`)).rows[0];
me1.crew_ids.length===0 && me1.private===true ? ok('leaving a crew takes your posts out of it (now only yours)') : bad('unshare '+JSON.stringify(me1));
(await count(Y, `select * from entries where id in ('me1','me2')`))===0 ? ok('Family no longer sees the posts of someone who left') : bad('Y after X left');
await as(X, `insert into events(id,crew_id,venue_id,starts_at) values ('xev','${work.id}','mv1','2026-10-09T20:00')`);
await expectErr('moving your plan into a crew you are not in', X, `update events set crew_id='${fam.id}' where id='xev'`);
const W='40000000-0000-0000-0000-0000000000f4';
await db.exec(`reset role; insert into auth.users values ('${W}','w@x');`);
for (let i=0;i<5;i++) await as(W, `select * from create_crew('W${i}','')`);
(await as(W, `select count(*)::int n from crews`)).rows[0].n===5 ? ok('five crews allowed') : bad('five');
await expectErr('a sixth crew is refused', W, `select * from create_crew('Six','')`);
(await as(W, `select join_crew($1) r`, [work.code])).rows[0].r==='max' ? ok('joining a sixth crew → max') : bad('join max');

// ---- tagging: T tags U (crewmate) on a "Just me" visit; V (not a crewmate) can't be tagged ----
const T='50000000-0000-0000-0000-0000000000a1', U='50000000-0000-0000-0000-0000000000a2', V='50000000-0000-0000-0000-0000000000a3', Q='50000000-0000-0000-0000-0000000000a4';
await db.exec(`reset role; insert into auth.users values ('${T}','t@x'),('${U}','u@x'),('${V}','v@x'),('${Q}','q@x');`);
const tc = (await as(T, `select * from create_crew('Matcha Gang','')`)).rows[0];
await as(U, `select join_crew($1)`, [tc.code]); await as(Q, `select join_crew($1)`, [tc.code]);
await as(T, `insert into venues(id,name,zone) values ('tv1','Matcha Bar','jumeirah')`);
await as(T, `insert into entries(id,venue_id,kind,private,tagged_ids) values ('te1','tv1','visit',true,array['${U}']::uuid[])`);
await as(T, `insert into photos(id,venue_id,entry_id,path,private) values ('tp1','tv1','te1','${T}/tp1.jpg',true)`);
(await count(U, `select * from entries where id='te1'`))===1 ? ok('a tagged friend sees the visit (even a Just me one)') : bad('U tagged');
(await count(U, `select * from photos where id='tp1'`))===1 ? ok('a tagged friend sees its photos') : bad('U photo');
(await count(U, `select * from venues where id='tv1'`))===1 ? ok('a tagged friend sees the place') : bad('U venue');
(await count(Q, `select * from entries where id='te1'`))===0 ? ok('an untagged crewmate does not see a Just me visit') : bad('Q sees');
await expectErr('tagging someone who shares no crew with you', T, `insert into entries(id,venue_id,kind,private,tagged_ids) values ('te2','tv1','visit',true,array['${V}']::uuid[])`);
(await as(U, `update entries set tagged_ids='{}' where id='te1' returning id`)).rows.length===0 ? ok('a tagged friend cannot edit the visit') : bad('U edit');
await as(U, `select untag_me('te1')`);
(await count(U, `select * from entries where id='te1'`))===0 ? ok('taking yourself off the tag hides it again') : bad('untag');
// ---- meals (0004) ----
await db.exec('reset role');
const sql4 = fs.readFileSync(new URL('../../supabase/migrations/0004_meals.sql', import.meta.url),'utf8');
try{ await db.exec(sql4); await db.exec(sql4); ok('meals migration runs (twice)'); } catch(e){ bad('meals migration: '+e.message); }
await as(T, `insert into entries(id,venue_id,kind,private,meals) values ('mm1','tv1','visit',true,array['breakfast','dinner'])`);
(await as(T, `select meals from entries where id='mm1'`)).rows[0].meals.length===2 ? ok('a visit can be tagged breakfast and dinner') : bad('meals');
await expectErr('an unknown meal is refused', T, `insert into entries(id,venue_id,kind,private,meals) values ('mm2','tv1','visit',true,array['brunch'])`);
// ---- more categories (0005) ----
await db.exec('reset role');
const sql5 = fs.readFileSync(new URL('../../supabase/migrations/0005_categories.sql', import.meta.url),'utf8');
try{ await db.exec(sql5); await db.exec(sql5); ok('categories migration runs (twice)'); } catch(e){ bad('categories migration: '+e.message); }
(await as(T, `select category from place_type_categories where google_type='ice_cream_shop'`)).rows[0]?.category==='icecream' ? ok('ice cream shops map to Ice cream') : bad('icecream map');
// ---- delete my account: mine goes, shared things carry on ----
const Rm='60000000-0000-0000-0000-0000000000d1', Sf='60000000-0000-0000-0000-0000000000d2';
await db.exec(`reset role; insert into auth.users values ('${Rm}','rm@x'),('${Sf}','sf@x');`);
const rc = (await as(Rm, `select * from create_crew('Leaving Crew','')`)).rows[0];
await as(Sf, `select join_crew($1)`, [rc.code]);
await as(Rm, `insert into venues(id,name,zone) values ('dv1','Shared spot','satwa'),('dv2','Only mine','satwa')`);
await as(Rm, `insert into entries(id,venue_id,kind,private) values ('de1','dv1','visit',true),('de2','dv2','visit',true)`);
await as(Rm, `insert into books(id,crew_id,kind,title) values ('crewbook-del','${rc.id}','crew','Leaving Crew Scrapbook')`);
await as(Sf, `insert into entries(id,venue_id,kind,private,crew_ids,tagged_ids) values ('de3','dv1','visit',false,array['${rc.id}']::uuid[],array['${Rm}']::uuid[])`);
await as(Rm, `select delete_me()`);
await db.exec('reset role');
const left = (await db.query(`select (select count(*)::int from profiles where id='${Rm}') p, (select count(*)::int from entries where user_id='${Rm}') e,
  (select owner_id from crews where id='${rc.id}') owner, (select created_by from venues where id='dv1') v1, (select count(*)::int from venues where id='dv2') v2,
  (select owner_id from books where id='crewbook-del') book, (select tagged_ids from entries where id='de3') tags, (select count(*)::int from entries where id='de3') friend`)).rows[0];
left.p===0 && left.e===0 ? ok('delete my account: profile and visits gone') : bad('delete '+JSON.stringify(left));
left.owner===Sf ? ok('a crew you owned passes to the next member') : bad('crew owner '+left.owner);
left.v1===Sf && left.v2===0 ? ok("places friends logged stay (now theirs); places only you used go") : bad('venues '+JSON.stringify(left));
left.book===Sf ? ok('the crew book passes to a member') : bad('book '+left.book);
left.friend===1 && left.tags.length===0 ? ok("your friend's visit stays, without your tag") : bad('friend entry '+JSON.stringify(left));
// ---- feedback, error reports, place-suggestion limit (0007) ----
await db.exec('reset role');
const sql7 = fs.readFileSync(new URL('../../supabase/migrations/0007_feedback_places.sql', import.meta.url),'utf8');
try{ await db.exec(sql7); await db.exec(sql7); ok('feedback migration runs (twice)'); } catch(e){ bad('feedback migration: '+e.message); }
const F1='70000000-0000-0000-0000-0000000000e1', F2='70000000-0000-0000-0000-0000000000e2';
await db.exec(`reset role; insert into auth.users values ('${F1}','f1@x'),('${F2}','f2@x');`);
await as(F1, `insert into feedback(id,kind,message,app_info) values ('fb1','bug','The map froze on JBR','{"v":"1"}')`);
(await count(F1, `select * from feedback`))===1 ? ok('you can send feedback and see your own') : bad('feedback own');
(await count(F2, `select * from feedback`))===0 ? ok("nobody else can read your feedback") : bad('feedback leak');
await expectErr('feedback as someone else', F2, `insert into feedback(id,user_id,kind,message) values ('fb2','${F1}','idea','x')`);
await expectErr('feedback with an unknown kind', F1, `insert into feedback(id,kind,message) values ('fb3','rant','x')`);
await as(F1, `insert into client_errors(id,message,stack,where_) values ('ce1','TypeError: x is undefined','at paint (place.js:10)','/')`);
{ let n=0; try{ n=await count(F1, `select * from client_errors`); }catch(_){ n=0; } n===0 ? ok('error reports go in but cannot be read back from the app') : bad('errors readable'); }
for (let i=2;i<=50;i++) await as(F1, `insert into client_errors(id,message) values ('ce${i}','e')`);
await expectErr('the 51st error report in a day', F1, `insert into client_errors(id,message) values ('ce51','e')`);
let ph; for (let i=0;i<3;i++) ph=(await as(F1, `select places_rate_hit() as n`)).rows[0].n;
ph===3 ? ok('place-suggestion counter counts per person') : bad('places rate '+ph);

// ---- scrapbook pages (0008): a page is as visible as its visit, in the books it belongs to ----
await db.exec('reset role');
const sql8 = fs.readFileSync(new URL('../../supabase/migrations/0008_pages.sql', import.meta.url),'utf8');
try{ await db.exec(sql8); await db.exec(sql8); ok('pages migration runs (twice)'); } catch(e){ bad('pages migration: '+e.message); }
await db.exec(`grant all on all tables in schema public to authenticated;`);
const P1='80000000-0000-0000-0000-0000000000f1', P2='80000000-0000-0000-0000-0000000000f2', P3='80000000-0000-0000-0000-0000000000f3';
await db.exec(`reset role; insert into auth.users values ('${P1}','p1@x'),('${P2}','p2@x'),('${P3}','p3@x');`);
const cx = (await as(P1, `select * from create_crew('Crew X','')`)).rows[0], cy = (await as(P1, `select * from create_crew('Crew Y','')`)).rows[0];
await as(P2, `select join_crew($1)`, [cx.code]); await as(P3, `select join_crew($1)`, [cy.code]);
await as(P1, `insert into venues(id,name,zone) values ('pv1','Ravi','satwa')`);
await as(P1, `insert into entries(id,venue_id,kind,private,crew_ids,date) values
  ('pe1','pv1','visit',false,array['${cx.id}']::uuid[],'2026-09-01'),('pe2','pv1','visit',true,'{}','2026-09-02'),('pe3','pv1','visit',false,array['${cy.id}']::uuid[],'2026-09-03')`);
await as(P1, `insert into books(id,crew_id,kind,title) values ('cb-x','${cx.id}','crew','X book'),('cb-y','${cy.id}','crew','Y book')`);
await as(P1, `insert into books(id,kind,title) values ('pb-1','personal','Mine')`);
await as(P2, `insert into books(id,kind,title) values ('tb-2','tagged','Tagged')`);
const pg = (b, e, extra)=>`insert into book_pages(id,book_id,entry_id,layout,note) values ('${b}|${e}','${b}','${e}','grid','${extra||'hi'}')`;
await as(P1, pg('cb-x','pe1'));
(await count(P2, `select * from book_pages where id='cb-x|pe1'`))===1 ? ok('a crewmate sees the dressed-up page in the crew book') : bad('P2 crew page');
(await count(P3, `select * from book_pages`))===0 ? ok("someone in another crew sees none of crew X's pages") : bad('P3 pages');
await expectErr('a Just me visit as a crew-book page', P1, pg('cb-x','pe2'));
await expectErr('a visit shared with crew Y as a page in crew X’s book', P1, pg('cb-x','pe3'));
await expectErr("a crewmate adding a page to someone's personal book", P2, pg('pb-1','pe1'));
await as(P1, pg('pb-1','pe2','just me'));
(await count(P2, `select * from book_pages where book_id='pb-1'`))===0 ? ok('personal-book pages are yours only') : bad('personal pages leak');
(await as(P2, `update book_pages set note='nice', updated_by=auth.uid() where id='cb-x|pe1' returning id`)).rows.length===1 ? ok('a crewmate can write the crew page note') : bad('crew note');
await expectErr('writing a page note as someone else', P2, `update book_pages set updated_by='${P1}' where id='cb-x|pe1'`);
// tagging shares with a crew you're both in
await as(P1, `insert into entries(id,venue_id,kind,private,crew_ids,tagged_ids,date) values ('pe4','pv1','visit',true,'{}',array['${P2}']::uuid[],'2026-09-04')`);
{ const r=(await as(P1, `select private, crew_ids from entries where id='pe4'`)).rows[0]; !r.private && r.crew_ids.length===1 && r.crew_ids[0]===cx.id ? ok('tagging a crewmate on a Just me visit shares it with the crew you are both in') : bad('tag share '+JSON.stringify(r)); }
await as(P2, pg('tb-2','pe4')); await as(P2, pg('cb-x','pe4'));
(await count(P2, `select * from book_pages where id in ('tb-2|pe4','cb-x|pe4')`))===2 ? ok('the tagged visit is a page in the crew book and in their Tagged book') : bad('tagged pages');
(await count(P3, `select * from entries where id='pe4'`))===0 ? ok('the tagged visit is not shown to the other crew') : bad('pe4 leak');
// an older private visit with a tag stays private when edited without adding anyone
await db.exec(`reset role; alter table entries disable trigger entries_share_with_tagged;
  insert into entries(id,venue_id,user_id,kind,private,crew_ids,tagged_ids,date) values ('pe5','pv1','${P1}','visit',true,'{}',array['${P2}']::uuid[],'2026-09-05');
  alter table entries enable trigger entries_share_with_tagged;`);
await as(P1, `update entries set notes='edited', tagged_ids=array['${P2}']::uuid[], private=true where id='pe5'`);
(await as(P1, `select private from entries where id='pe5'`)).rows[0].private===true ? ok('an existing private tagged visit keeps who it was for') : bad('pe5 shared');
(await count(P2, `select * from entries where id='pe5'`))===1 && (await count(P3, `select * from entries where id='pe5'`))===0 ? ok('…the tagged person still sees it, nobody else') : bad('pe5 visibility');
// taking yourself off, un-sharing, leaving: the page rows go with the visit
await as(P2, `select untag_me('pe4')`);
await db.exec('reset role');
(await db.query(`select count(*)::int n from book_pages where id='tb-2|pe4'`)).rows[0].n===0 ? ok('untagging yourself removes the page from your Tagged book') : bad('tagged page stays');
await as(P1, `update entries set crew_ids='{}', private=true where id='pe1'`);
await db.exec('reset role');
(await db.query(`select count(*)::int n from book_pages where id='cb-x|pe1'`)).rows[0].n===0 ? ok('un-sharing a visit removes its crew-book page') : bad('crew page stays after unshare');
await as(P2, `insert into entries(id,venue_id,kind,private,crew_ids,date) values ('pe6','pv1','visit',false,array['${cx.id}']::uuid[],'2026-09-06')`);
await as(P1, pg('cb-x','pe6'));
await as(P2, `select leave_crew($1)`, [cx.id]);
await db.exec('reset role');
(await db.query(`select count(*)::int n from book_pages where id='cb-x|pe6'`)).rows[0].n===0 ? ok("leaving a crew takes your visits' pages out of its book") : bad('page stays after leave');
(await count(P1, `select * from entries where id='pe6'`))===0 ? ok('…and the crew no longer sees that visit') : bad('pe6 visible');
// the old per-day settings: copied once, never twice
await db.exec(`reset role; delete from book_pages where book_id='pb-1';
  update books set pages='{"2026-09-02":{"layout":"hero","note":"old note","stickers":["first"]},"2026-01-01":{"layout":"grid"}}' where id='pb-1';`);
const n1=(await db.query(`select backfill_book_pages() n`)).rows[0].n, n2=(await db.query(`select backfill_book_pages() n`)).rows[0].n;
const bp=(await db.query(`select * from book_pages where book_id='pb-1'`)).rows;
n2===0 && bp.length===1 && bp[0].entry_id==='pe2' && bp[0].layout==='hero' && bp[0].note==='old note' ? ok(`old page settings copied onto the day's visit once (${n1} then ${n2})`) : bad('backfill '+JSON.stringify({n1,n2,bp}));
(await db.query(`select pages from books where id='pb-1'`)).rows[0].pages['2026-09-02'] ? ok('the old settings are left in place') : bad('old pages removed');
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nall checks passed');

