// Drawing a page's sticker layer: every sticker and strip of tape placed on it, absolutely positioned with CSS
// transforms over the automatic layout (which never moves). Positions are 0 to 1 across and down the page, so the
// layer lands on the same spots at any size, and an export renders exactly what's on screen.
// Stickers over the place name or the ribbon (the top of the page) show at 85% so the name stays readable.
import { esc } from './data.js';
import { stickerArt, tapeHTML } from './stickers.js';

export const DIM_ABOVE = 0.24;          // the header band: ribbon, date, place name
export const SCALE_MIN = 0.4, SCALE_MAX = 2.5;
export const clamp01 = v => Math.max(0, Math.min(1, v));

// one decoration's HTML. W, H: the page's design size. opts: { mine (it's yours), locked (someone else's), who }
export function decoHTML(d, W, H, opts){
  opts = opts || {};
  const cls = `deco${opts.mine?' mine':''}${opts.locked?' theirs':''}`;
  const data = `data-deco="${esc(d.id)}" data-user="${esc(d.userId||'')}"`;
  if (d.kind === 'tape'){
    const x1 = d.x*W, y1 = d.y*H, x2 = (d.x2 ?? d.x)*W, y2 = (d.y2 ?? d.y)*H;
    const len = Math.hypot(x2-x1, y2-y1), ang = Math.atan2(y2-y1, x2-x1)*180/Math.PI;
    return `<span class="${cls} deco-tape" ${data} style="left:${((x1+x2)/2).toFixed(1)}px;top:${((y1+y2)/2).toFixed(1)}px;z-index:${(d.z||0)+1000};--r:${ang.toFixed(2)}deg">${tapeHTML(d.tapeStyle, len)}</span>`;
  }
  const dim = d.y < DIM_ABOVE ? ' dim' : '';
  // opts.pct: placed by percentages (the List view's cards aren't the page's shape)
  const at = opts.pct ? `left:${(d.x*100).toFixed(2)}%;top:${(d.y*100).toFixed(2)}%` : `left:${(d.x*W).toFixed(1)}px;top:${(d.y*H).toFixed(1)}px`;
  return `<span class="${cls} deco-sticker${dim}" ${data} style="${at};z-index:${(d.z||0)+1};--r:${(+d.rotation||0).toFixed(2)}deg;--s:${(+d.scale||1).toFixed(3)};--fx:${d.flip?-1:1}">${stickerArt(d.stickerId)}</span>`;
}
// the whole layer; opts: { meId, mineOnly (hide other people's), W, H }
export function decoLayerHTML(decos, opts){
  opts = opts || {};
  const W = opts.W || 360, H = opts.H || 600;
  return (decos||[]).filter(d=>!opts.mineOnly || d.userId===opts.meId)
    .map(d=>decoHTML(d, W, H, { mine:opts.meId && d.userId===opts.meId, locked:opts.editing && d.userId!==opts.meId, pct:opts.pct })).join('');
}
