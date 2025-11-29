// scaling.js – Solitaire HighNoon responsive board scaler
// Depends on: DOM (.board-wrapper in index.html)
// Optional: global VERSION string (from game.js)

(() => {
  const BASE_W = 1200; // must match CSS .board-wrapper width
  const BASE_H = 900;  // <-- WAR 800, jetzt 900: muss zum CSS passen!

  const wrapper = document.querySelector('.board-wrapper');
  const verBadge = document.getElementById('ver');
  const root = document.documentElement;

  if (!wrapper) {
    console.warn('[HighNoon][scaling] .board-wrapper not found');
    return;
  }

  function viewportBox(){
    const headerH = document.querySelector('header')?.offsetHeight || 64;
    // Minimaler Sicherheitsrand, damit nichts hart abgeschnitten wird
    const SAFE_MARGIN_X = 2;
    const SAFE_MARGIN_Y = 4;

    const w = Math.min(window.innerWidth, document.documentElement.clientWidth) - SAFE_MARGIN_X * 2;
    const h = Math.min(window.innerHeight, document.documentElement.clientHeight) - headerH - SAFE_MARGIN_Y * 2;

    return { w: Math.max(320, w), h: Math.max(320, h) };
  }

  function applyScale(){
    const box = viewportBox();
    const sx = box.w / BASE_W;
    const sy = box.h / BASE_H;

    const isPortrait = box.h > box.w;

    // Im Portrait-Mode soll die Breite limitieren (Foundations möglichst randlos),
    // im Landscape weiter wie bisher min(sx, sy).
    const rawScale = isPortrait ? sx : Math.min(sx, sy);

    // scale inkl. weicher Untergrenze (fühlt sich auf 13" besser an)
    const scale = Math.max(0.55, Math.min(1, rawScale));

    // Board skalieren
    wrapper.style.transform = `scale(${scale})`;

    // NEU: UI (Header/Controls/Badge/Toast) proportional mitskalieren
    // nutzt die CSS-Variablen, die ich dir gegeben habe (--ui-scale, etc.)
    root.style.setProperty('--ui-scale', scale.toFixed(3));
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
      const sx = w / BASE_W;
      const sy = h / BASE_H;
      const isPortrait = h > w;
      const rawScale = isPortrait ? sx : Math.min(sx, sy);
      return Math.max(0.55, Math.min(1, rawScale));
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
  console.info('[HighNoon][scaling] responsive scaling enabled (BASE 1200x900, UI linked)');
})();