// Haptics: a light tap of feedback on the moments that matter (a toggle, a tab, a sheet
// let go, a stamp landing). Android gets navigator.vibrate. iPhone Safari has no vibrate,
// but since iOS 18 flipping a native <input switch> plays the system "selection" tick, so
// we keep one hidden switch and click it from inside the person's own tap. Elsewhere, a no-op.
const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const PATTERN = { tick:8, tap:12, success:[10,60,14], warn:[18,40,18] };
let label = null;

function iosSwitch(){
  if (label) return label;
  if (typeof document === 'undefined' || !document.body) return null;
  label = document.createElement('label');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px;';
  const input = document.createElement('input');
  input.type = 'checkbox'; input.tabIndex = -1;
  input.setAttribute('switch', '');
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

// kind: 'tick' (selection changed) · 'tap' (a commit: sheet dismissed, back) · 'success' · 'warn'
export function haptic(kind){
  try{
    if (canVibrate){ navigator.vibrate(PATTERN[kind] || PATTERN.tick); return; }
    const l = iosSwitch(); if (!l) return;
    l.click();
    // a second tick reads as a "success" double-tap on iPhone
    if (kind === 'success' || kind === 'warn') setTimeout(()=>{ try{ l.click(); }catch(_){} }, 90);
  }catch(_){ /* feedback is a nicety; never let it break a tap */ }
}
