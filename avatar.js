// Pixel avatars: a 10x16 sprite drawn as crisp SVG, plus the markup used for
// avatar circles and stacks everywhere in the app (photo avatars for people who have one).
import { esc } from './data.js';

export const SKINS=['#FBE0C8','#F1C27D','#DDA46F','#B97A4C','#8D5A36','#5E3A22'];
export const HAIR_COLORS=['#1F1612','#4A2E1C','#8A5A2B','#D9B35B','#B8452B','#C9C4BD','#E7A1B0','#6FB7AE','#EADBC0'];
export const TOPS=['#E8B84B','#D9567A','#3FA69A','#4A7FC1','#F4F0E6','#5A8F4E','#C9622D','#3B2A1A'];
export const HAIRS=[['short','Short'],['long','Long'],['buzz','Buzz'],['bun','Bun'],['cap','Cap'],['hijab','Hijab'],['ghutra','Ghutra']];
export const OUTFITS=[['tee','Tee & jeans'],['kandura','Kandura'],['abaya','Abaya'],['dress','Dress']];
export const DEFAULT_AVATAR = {skin:2, hair:'short', hairColor:'#1F1612', outfit:'tee', top:'#E8B84B'};

// 10x16 sprite; letters are palette slots, '.' is empty. An outline is added round the edge.
function spriteRows(av){
  const R=[
    '..........',
    '...HHHH...',
    '..HHHHHH..',
    '..HSSSSH..',
    '..SESSES..',
    '..SSSSSS..',
    '...SMMS...',
    '..TTTTTT..',
    '.TTTTTTTT.',
    '.STTTTTTS.',
    '.STTTTTTS.',
    '..TTTTTT..',
    '..PPPPPP..',
    '..PP..PP..',
    '..PP..PP..',
    '..BB..BB..',
  ];
  const set=(r,s)=>{ R[r]=s; };
  switch(av.hair){
    case 'buzz': set(1,'..........'); set(2,'..HHHHHH..'); break;
    case 'bun':  set(0,'....HH....'); break;
    case 'long': set(3,'.HHSSSSHH.'); set(4,'.HSESSESH.'); set(5,'.HSSSSSSH.'); set(6,'.HHSMMSHH.'); set(7,'.HTTTTTTH.'); break;
    case 'cap':  set(0,'...CCCC...'); set(1,'..CCCCCC..'); set(2,'..CCCCCCCC'); break;
    case 'hijab':
      set(1,'...HHHH...'); set(2,'..HHHHHH..'); set(3,'.HHSSSSHH.'); set(4,'.HSESSESH.');
      set(5,'.HSSSSSSH.'); set(6,'.HHSMMSHH.'); set(7,'.HHHHHHHH.'); break;
    case 'ghutra':
      set(0,'...WWWW...'); set(1,'..AAAAAA..'); set(2,'.WWWWWWWW.'); set(3,'.WWSSSSWW.');
      set(4,'.WSESSESW.'); set(5,'.WSSSSSSW.'); set(6,'.WWSMMSWW.'); set(7,'.WWTTTTWW.'); break;
  }
  const robe = c=>{ // long robe from shoulders to ankles, hands showing
    for (let r=7;r<=14;r++) R[r]=R[r].replace(/[TP]/g,c);
    set(9,'.S'+c.repeat(6)+'S.'); set(10,'.S'+c.repeat(6)+'S.'); set(13,'..'+c.repeat(6)+'..'); set(14,'..'+c.repeat(6)+'..');
    if (av.hair==='ghutra') set(7,'.WW'+c.repeat(4)+'WW.');
    if (av.hair==='hijab' || av.hair==='long') R[7]=R[7].replace(/T/g,c);
  };
  if (av.outfit==='kandura') robe('K');
  else if (av.outfit==='abaya') robe('X');
  else if (av.outfit==='dress'){ set(12,'.TTTTTTTT.'); set(13,'..SS..SS..'); set(14,'..SS..SS..'); }
  return R;
}
export function spriteSvg(av, px){
  const rows=spriteRows(av), H=rows.length, W=rows[0].length;
  const pal={ H:av.hairColor, S:SKINS[av.skin]||SKINS[1], E:'#2A1B10', M:'#B5534A', T:av.top, P:'#3C5A78', B:'#3B2A1A',
              C:av.top, W:'#FBFAF5', A:'#1F1612', K:'#FBFAF5', X:'#231E1B' };
  const filled=(x,y)=> y>=0 && y<H && x>=0 && x<W && rows[y][x]!=='.';
  let out='';
  for (let y=-1;y<=H;y++) for (let x=-1;x<=W;x++){
    let fill=null;
    if (filled(x,y)) fill=pal[rows[y][x]];
    else if (filled(x-1,y)||filled(x+1,y)||filled(x,y-1)||filled(x,y+1)) fill='#3B2A1A';
    if (fill) out+=`<rect x="${x+1}" y="${y+1}" width="1.02" height="1.02" fill="${fill}"/>`;
  }
  return `<svg viewBox="0 0 ${W+2} ${H+2}" width="${(W+2)*px}" height="${(H+2)*px}" shape-rendering="crispEdges" aria-hidden="true">${out}</svg>`;
}

// head-and-shoulders crop of the sprite for small circles
export function spriteHead(av, px){
  const full = spriteSvg(av, px);
  return full.replace(/viewBox="0 0 12 18"/, 'viewBox="0.5 0 11 10"')
             .replace(/width="\d+" height="\d+"/, `width="${11*px}" height="${10*px}"`);
}

const INIT_BG = ['#e5a93c','#feb383','#9cbe85','#ffdbc7','#c9edb0','#fabc4d'];
// user -> circle. size in px.
export function avatarHTML(user, size, extraClass){
  size = size||40;
  const cls = `av ${extraClass||''}`;
  const style = `width:${size}px;height:${size}px`;
  if (!user) return `<span class="${cls}" style="${style}"></span>`;
  const a = user.avatar||{};
  if (a.photo) return `<span class="${cls}" style="${style}"><img src="${esc(a.photo)}" alt=""></span>`;
  if (a.pixel){
    const px = Math.max(1, Math.round(size/9));
    return `<span class="${cls} av-pixel" style="${style}">${spriteHead({...DEFAULT_AVATAR, ...a.pixel}, px)}</span>`;
  }
  const i = (user.name||user.handle||'?').trim().slice(0,2).toUpperCase();
  const bg = INIT_BG[(user.handle||'').length % INIT_BG.length];
  return `<span class="${cls} av-init" style="${style};background:${bg};font-size:${Math.round(size*0.36)}px">${esc(i)}</span>`;
}
export function avatarStack(users, size, max){
  max = max||3; size = size||24;
  const shown = users.slice(0,max), more = users.length-shown.length;
  return `<span class="av-stack">${shown.map(u=>avatarHTML(u,size)).join('')}${more>0?`<span class="av av-more" style="width:${size}px;height:${size}px">+${more}</span>`:''}</span>`;
}
