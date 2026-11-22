// Injected before the page's own scripts. Until __vstart() everything runs in real
// time; afterwards time only moves when the recorder calls __vstep(ms), so every
// captured frame is exactly 1/fps apart however slowly the machine renders.
(() => {
  const R = {
    now: performance.now.bind(performance), dateNow: Date.now,
    raf: window.requestAnimationFrame.bind(window), caf: window.cancelAnimationFrame.bind(window),
    st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window),
    si: window.setInterval.bind(window), ci: window.clearInterval.bind(window),
  };
  let virtual = false, vnow = 0, dateBase = 0, nextId = 1e7;
  const rafs = new Map(), timers = new Map(), anims = new WeakMap();
  performance.now = () => (virtual ? vnow : R.now());
  const RealDate = Date;
  class VDate extends RealDate {
    constructor(...a) { if (a.length === 0 && virtual) super(dateBase + vnow); else super(...a); }
    static now() { return virtual ? dateBase + vnow : R.dateNow(); }
  }
  window.Date = VDate;
  window.requestAnimationFrame = cb => { if (!virtual) return R.raf(cb); const id = ++nextId; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { if (!rafs.delete(id)) R.caf(id); };
  window.setTimeout = (cb, ms = 0, ...args) => {
    if (!virtual) return R.st(cb, ms, ...args);
    const id = ++nextId; timers.set(id, { at: vnow + Math.max(0, +ms || 0), cb, args }); return id;
  };
  window.setInterval = (cb, ms = 0, ...args) => {
    if (!virtual) return R.si(cb, ms, ...args);
    const every = Math.max(1, +ms || 0), id = ++nextId; timers.set(id, { at: vnow + every, cb, args, every }); return id;
  };
  window.clearTimeout = id => { if (!timers.delete(id)) R.ct(id); };
  window.clearInterval = id => { if (!timers.delete(id)) R.ci(id); };

  // Overlay: a cursor and click rings, drawn above everything and never hit-tested.
  let cursor = null, layer = null; const rings = [];
  function ensureLayer() {
    if (layer) return;
    layer = document.createElement("div");
    layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;overflow:hidden";
    document.documentElement.append(layer);
  }
  window.__cursor = (x, y, kind) => {
    ensureLayer();
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.style.cssText = "position:absolute;left:0;top:0;width:24px;height:30px;will-change:transform";
      cursor.innerHTML = '<svg width="24" height="30" viewBox="0 0 16 20"><path d="M1 1 L1 15.5 L4.6 12.2 L7.1 18.2 L9.5 17.2 L7 11.3 L12 11.3 Z" fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/></svg>';
      layer.append(cursor);
    }
    cursor.style.display = kind === "none" ? "none" : "block";
    cursor.style.transform = `translate(${x - 1.5}px, ${y - 1.5}px)`;
  };
  window.__ring = (x, y, color = "rgba(255,255,255,.9)", size = 34) => {
    ensureLayer();
    const r = document.createElement("div");
    r.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px;border-radius:50%;border:2.5px solid ${color};box-sizing:border-box;opacity:0`;
    layer.append(r); rings.push({ el: r, t0: vnow });
  };
  function drawRings() {
    for (let k = rings.length - 1; k >= 0; k--) {
      const g = rings[k], u = (vnow - g.t0) / 380;
      if (u >= 1) { g.el.remove(); rings.splice(k, 1); continue; }
      g.el.style.opacity = String(0.85 * (1 - u));
      g.el.style.transform = `scale(${0.45 + 0.75 * u})`;
    }
  }

  window.__vstart = () => {
    if (virtual) return;
    vnow = R.now(); dateBase = R.dateNow() - vnow; virtual = true;
  };
  window.__vnow = () => vnow;
  window.__vstep = ms => {
    const target = vnow + ms;
    for (let guard = 0; guard < 10000; guard++) {
      let best = null;
      for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best[1].at)) best = [id, t];
      if (!best) break;
      const [id, t] = best;
      vnow = Math.max(vnow, t.at);
      if (t.every) t.at += t.every; else timers.delete(id);
      try { typeof t.cb === "function" ? t.cb(...t.args) : (0, eval)(t.cb); } catch (e) { console.error(e); }
    }
    vnow = target;
    const callbacks = [...rafs.values()]; rafs.clear();
    for (const cb of callbacks) try { cb(vnow); } catch (e) { console.error(e); }
    for (const a of document.getAnimations()) {
      let s = anims.get(a);
      if (!s) { s = { t0: vnow - ms, c0: Number(a.currentTime) || 0 }; anims.set(a, s); try { a.pause(); } catch {} }
      try { a.currentTime = s.c0 + (vnow - s.t0); } catch {}
    }
    drawRings();
  };
})();
