// scaling.js – Solitaire HighNoon responsive board scaler
// Depends on: DOM (.board-wrapper in index.html)
// Optional: global VERSION string (from game.js)

(() => {
  const BASE_W = 1200; // must match CSS .board-wrapper width
  const BASE_H = 800;  // must match CSS .board-wrapper height

  const wrapper = document.querySelector('.board-wrapper');
  const verBadge = document.getElementById('ver');
  // Intentionally NOT touching #ov-version here — game.js writes mirror status there

  if (!wrapper) {
    console.warn('[HighNoon][scaling] .board-wrapper not found');
    return;
  }

  function viewportBox(){
    const headerH = document.querySelector('header')?.offsetHeight || 64;
    const w = Math.min(window.innerWidth, document.documentElement.clientWidth) - 16;
    const h = Math.min(window.innerHeight, document.documentElement.clientHeight) - headerH - 16;
    return { w: Math.max(320, w), h: Math.max(320, h) };
  }

  function applyScale(){
    const box = viewportBox();
    const sx = box.w / BASE_W;
    const sy = box.h / BASE_H;
    const scale = Math.min(1, Math.min(sx, sy));
    wrapper.style.transform = `scale(${scale})`;
  }

  function setHeaderVersion(){
    const v = (typeof VERSION !== 'undefined' && VERSION) || window.VERSION || null;
    if (v && verBadge) verBadge.textContent = v.startsWith('v') ? v : 'v' + v;
  }

  // Public API (optional)
  window.HighNoon = window.HighNoon || {};
  window.HighNoon.resize = {
    getScale: () => {
      const { w, h } = viewportBox();
      return Math.min(1, Math.min(w / BASE_W, h / BASE_H));
    },
    apply: applyScale,
    base: { w: BASE_W, h: BASE_H }
  };

  window.addEventListener('resize', applyScale, { passive: true });
  window.addEventListener('orientationchange', () => setTimeout(applyScale, 50), { passive: true });
  document.fonts && document.fonts.ready.then(applyScale);
  window.addEventListener('load', () => { applyScale(); setHeaderVersion(); });

  // Initial
  applyScale();
  setHeaderVersion();
  console.info('[HighNoon][scaling] responsive scaling enabled');
})();