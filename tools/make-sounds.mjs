// The scrapbook's sounds, synthesised here (so they're ours: no samples, no licence to track) and written to sounds/
// as small mono WAVs: three paper flips, a leather creak, a stamp thud, a soft press and a tape rip.
//   node tools/make-sounds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RATE = 22050;
// a small seeded random, so every run writes the same files
function rng(seed){ let s = seed >>> 0; return ()=>{ s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// one-pole filters over a sample array
const lowpass = (x, hz)=>{ const a = 1 - Math.exp(-2*Math.PI*hz/RATE); let y = 0; return x.map(v=>(y += a*(v - y))); };
const highpass = (x, hz)=>{ const lp = lowpass(x, hz); return x.map((v,i)=>v - lp[i]); };
const env = (n, attack, decay)=>Array.from({ length:n }, (_, i)=>{ const t = i/RATE; return t < attack ? t/attack : Math.exp(-(t - attack)/decay); });
const mix = (...xs)=>xs[0].map((_, i)=>xs.reduce((s, x)=>s + (x[i]||0), 0));
const gain = (x, g)=>x.map(v=>v*g);
const noise = (n, seed)=>{ const r = rng(seed); return Array.from({ length:n }, ()=>r()*2 - 1); };

function wav(name, x){
  const peak = Math.max(...x.map(Math.abs)) || 1, k = 0.85/peak;
  const buf = Buffer.alloc(44 + x.length*2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length*2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE*2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length*2, 40);
  x.forEach((v, i)=>buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v*k*32767))), 44 + i*2));
  fs.writeFileSync(path.join(ROOT, 'sounds', name + '.wav'), buf);
  console.log(name, buf.length, 'bytes');
}

fs.mkdirSync(path.join(ROOT, 'sounds'), { recursive:true });

// paper flip: a swish of filtered noise that rises and falls, with a little flutter at the end
[[1, 0.30, 2400], [2, 0.26, 3000], [3, 0.34, 2000]].forEach(([seed, len, hz])=>{
  const n = Math.round(len*RATE), r = rng(seed*7);
  const swish = highpass(lowpass(noise(n, seed), hz), 400).map((v, i)=>{ const t = i/n; return v * Math.sin(Math.PI*Math.pow(t, 0.7)) ** 2; });
  const flutter = noise(n, seed + 50).map((v, i)=>{ const t = i/n; return t > 0.6 ? v * 0.25 * (r() > 0.92 ? 1 : 0.15) * (1 - t) * 2.5 : 0; });
  wav('flip-' + seed, mix(swish, highpass(flutter, 1200)));
});
// leather creak: a slow, rough rasp (a buzz whose pitch wanders) under a soft rustle
{
  const n = Math.round(0.5*RATE), r = rng(9); let ph = 0;
  const buzz = Array.from({ length:n }, (_, i)=>{ const t = i/n; const f = 90 + 60*Math.sin(t*5) + r()*25; ph += f/RATE; const saw = (ph % 1)*2 - 1; return saw * (r() > 0.3 ? 1 : 0.2) * Math.sin(Math.PI*t); });
  wav('creak', mix(gain(lowpass(highpass(buzz, 120), 1400), 0.8), gain(lowpass(noise(n, 10), 1800).map((v, i)=>v*Math.sin(Math.PI*i/n)), 0.25)));
}
// stamp thud: a low knock with a short wooden click on top
{
  const n = Math.round(0.28*RATE);
  const body = Array.from({ length:n }, (_, i)=>{ const t = i/RATE; return Math.sin(2*Math.PI*(70 + 50*Math.exp(-t*30))*t) * Math.exp(-t*16); });
  const click = highpass(noise(n, 21), 900).map((v, i)=>v*Math.exp(-i/RATE*90));
  wav('stamp', mix(body, gain(click, 0.5)));
}
// soft press: a sticker pressed down, a muffled pat
{
  const n = Math.round(0.12*RATE);
  const pat = lowpass(noise(n, 31), 700).map((v, i)=>v*Math.exp(-i/RATE*45));
  const knock = Array.from({ length:n }, (_, i)=>{ const t = i/RATE; return Math.sin(2*Math.PI*140*t)*Math.exp(-t*40)*0.4; });
  wav('press', mix(pat, knock));
}
// tape rip: crackly noise that speeds up, bright and short
{
  const n = Math.round(0.24*RATE), r = rng(41);
  const e = env(n, 0.01, 0.12);
  const crackle = highpass(noise(n, 40), 1500).map((v, i)=>{ const t = i/n; const rate = 0.55 + 0.4*t; return v * (r() < rate ? 1 : 0.1) * e[i]; });
  wav('rip', crackle);
}
