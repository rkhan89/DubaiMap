// Koko style guide: theme switch, colour swatches with computed contrast, the icon comparison and the label crops.
const root = document.documentElement;
const pref = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
function setTheme(t){ root.dataset.theme = t; document.querySelectorAll('[data-theme-set]').forEach(b=>b.classList.toggle('on', b.dataset.themeSet === t)); paintSwatches(); }
document.querySelectorAll('[data-theme-set]').forEach(b=>b.onclick = ()=>setTheme(b.dataset.themeSet));

// WCAG 2.x contrast
const lum = hex => { const v = hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4); return .2126*v[0]+.7152*v[1]+.0722*v[2]; };
const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((p,q)=>q-p); return (x+.05)/(y+.05); };
const tok = n => getComputedStyle(root).getPropertyValue(n).trim();
const SW = [
  ['--paper','Paper','App background','--ink'], ['--raised','Raised','Sheets, cards, inputs','--ink'],
  ['--ink','Ink','Text, primary buttons, selected states, outlines','--paper'], ['--ink-3','Ink 3','Secondary text','--paper'],
  ['--line','Line','Input borders, switch tracks, chip outlines (3:1)','--paper'],
  ['--gold','Gold','Check in and ratings only','#1D1712'], ['--crew','Crew teal','Shared with a crew, with the crew icon','--on-crew'],
  ['--danger','Danger','Destructive text','--paper'],
];
function paintSwatches(){
  const el = document.getElementById('sgSwatches'); if (!el) return;
  el.innerHTML = SW.map(([t,name,use,fg])=>{
    const bg = tok(t), fgv = fg.startsWith('--') ? tok(fg) : fg, paper = tok('--paper');
    const onPaper = t==='--paper' ? '' : `${ratio(bg, paper).toFixed(2)}:1 on paper`;
    return `<div class="sw-card"><span class="sw-chip" style="background:${bg};color:${fgv}">Aa ${ratio(bg,fgv).toFixed(1)}:1</span><div><b>${name}</b> ${bg}<small>${use}</small><small>${onPaper}</small></div></div>`;
  }).join('');
}

// icons: the same names in three sets
fetch('/styleguide/icons/names.txt').then(r=>r.text()).then(t=>{
  const names = t.split(',').map(s=>s.trim()).filter(Boolean);
  const el = document.getElementById('sgIcons');
  el.innerHTML = '<span class="hd">Icon</span><span class="hd">Material (today)</span><span class="hd">Phosphor</span><span class="hd">Lucide</span>'
    + names.map(n=>`<span class="nm">${n}</span><span><span class="ms">${n}</span></span><span><img alt="" src="/styleguide/icons/phosphor/${n}.svg"></span><span><img alt="" src="/styleguide/icons/lucide/${n}.svg"></span>`).join('');
});

// map label comparison crops (made from the real map by the capture script)
const crops = [['crop-wide','Whole city'],['crop-mid','Mid zoom']];
document.getElementById('sgPixel').innerHTML = crops.map(([f,l])=>`<figure><img alt="Silkscreen, ${l}" src="/styleguide/${f}-silkscreen.png"><figcaption>Silkscreen · ${l}</figcaption></figure><figure><img alt="Geist Pixel, ${l}" src="/styleguide/${f}-geist.png"><figcaption>Geist Pixel · ${l}</figcaption></figure>`).join('');
fetch('/styleguide/pixel-verdict.txt').then(r=>r.ok?r.text():'').then(t=>{ if (t) document.getElementById('sgPixelVerdict').textContent = t; });

// what this browser is, for the device checks
const ua = navigator.userAgent;
document.getElementById('sgEnv').textContent = 'This browser: ' + (/iPhone|iPad/.test(ua) ? 'iPhone or iPad Safari / WebKit' : /Android/.test(ua) ? (/; wv\)/.test(ua) ? 'Android System WebView' : 'Chrome on Android') : 'desktop') + '.';
setTheme(pref);
