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
/^KARAK\d\d$/.test(crew.code) ? ok('create_crew code '+crew.code) : bad('code '+crew.code);
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
let n; for (let i=0;i<3;i++) n=(await as(D, `select share_rate_hit() as n`)).rows[0].n;
n===3 ? ok('rate limit counts this hour\'s calls') : bad('rate '+n);
(await count(E, `select * from share_rate`))===0 ? ok('nobody reads the rate table directly') : bad('rate table');
await as(D, `select share_cache_put('k1','{"finalUrl":"https://www.google.com/maps/place/X"}')`);
(await as(E, `select share_cache_get('k1') as v`)).rows[0].v?.finalUrl ? ok('link cache is shared (it only holds where links lead)') : bad('cache');
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
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nall checks passed');

