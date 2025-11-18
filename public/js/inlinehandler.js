// inlinehandler.js – Inline-Script für spezielle UI-Elemente
// gestartet aus index.html

document.addEventListener('DOMContentLoaded', function () {
    // Overlay-Button
    const btn = document.getElementById('toggleOverlayBtn');
    const overlay = document.getElementById('overlay');
    if (btn && overlay) {
      btn.addEventListener('click', function () {
        overlay.classList.toggle('overlay-hidden');
      });
    }

    // iPad-PWA-Hinweis
    const hint = document.getElementById('pwa-hint');
    const hintClose = document.getElementById('pwa-hint-close');

    if (hint) {
      const ua = navigator.userAgent || navigator.vendor || window.opera;

      // Moderne iOS-/iPad-Erkennung:
      const isIOSUserAgent = /iPad|iPhone|iPod/i.test(ua);
      const isMacLikeTouch =
        navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
      const isIOS = isIOSUserAgent || isMacLikeTouch;

      const isStandalone =
        (window.matchMedia &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true;

      // Hinweis nur auf iOS + nur, wenn NICHT als PWA gestartet
      if (isIOS && !isStandalone) {
        hint.classList.add('show');
      }

      if (hintClose) {
        hintClose.addEventListener('click', function () {
          hint.classList.remove('show');
        });
      }
    }
  });