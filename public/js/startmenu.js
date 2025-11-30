// startmenu.js – Start-Menü für Solitaire HighNoon
// nutzt die SHN-API aus game.js

(function () {
  const SHN = window.SHN || {};
  const { engine, state, ui, meta, net } = SHN;

  if (!engine || !state || !ui || !meta) {
    console.warn('[StartMenu] SHN-API nicht vollständig verfügbar – startmenu.js wird übersprungen.');
    return;
  }

  // ------------------------------------------------------
  // Hilfsfunktionen
  // ------------------------------------------------------
  function ensureStartMenuStyles() {
    if (document.getElementById('shn-startmenu-styles')) return;

    const style = document.createElement('style');
    style.id = 'shn-startmenu-styles';
    style.textContent = `
      .shn-startmenu-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
      }
      .shn-startmenu-dialog {
        background: #111827;
        color: #e5e7eb;
        padding: 1.5rem 1.75rem;
        border-radius: 0.75rem;
        box-shadow: 0 12px 40px rgba(0,0,0,0.6);
        max-width: 420px;
        width: calc(100% - 2rem);
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .shn-startmenu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }
      .shn-startmenu-title {
        font-size: 1.1rem;
        font-weight: 600;
      }
      .shn-startmenu-version {
        font-size: 0.8rem;
        opacity: 0.75;
      }
      .shn-startmenu-section-title {
        font-size: 0.95rem;
        font-weight: 500;
        margin: 0.75rem 0 0.4rem;
      }
      .shn-startmenu-modes {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
      }
      .shn-startmenu-button {
        width: 100%;
        padding: 0.55rem 0.85rem;
        border-radius: 0.5rem;
        border: 1px solid rgba(156,163,175,0.7);
        background: #1f2937;
        color: #e5e7eb;
        cursor: pointer;
        font-size: 0.9rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
      .shn-startmenu-button.primary {
        background: #2563eb;
        border-color: #2563eb;
      }
      .shn-startmenu-button.primary:hover {
        background: #1d4ed8;
      }
      .shn-startmenu-button.disabled {
        opacity: 0.5;
        cursor: default;
      }
      .shn-startmenu-button-label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .shn-startmenu-chip {
        font-size: 0.8rem;
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        background: rgba(31,41,55,0.9);
        border: 1px solid rgba(107,114,128,0.6);
      }
      .shn-startmenu-field {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin-top: 0.45rem;
      }
      .shn-startmenu-field label {
        font-size: 0.8rem;
        opacity: 0.8;
      }
      .shn-startmenu-input {
        width: 100%;
        padding: 0.45rem 0.6rem;
        border-radius: 0.4rem;
        border: 1px solid rgba(55,65,81,0.9);
        background: #030712;
        color: #e5e7eb;
        font-size: 0.8rem;
      }
      .shn-startmenu-input:read-only {
        opacity: 0.85;
      }
      .shn-startmenu-footer {
        display: flex;
        justify-content: flex-end;
        margin-top: 0.9rem;
        gap: 0.5rem;
        font-size: 0.8rem;
        opacity: 0.75;
      }
      .shn-startmenu-small-link {
        color: #93c5fd;
        cursor: pointer;
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }

  function buildShareLink(room, seed) {
    const u = new URL(window.location.href);
    u.searchParams.set('room', room);
    u.searchParams.set('seed', seed || '');
    u.searchParams.set('mirror', '1'); // Standard für Duell
    return u.toString();
  }

  function generateRoomId() {
    // simple, aber lesbarer Room-Name
    const base = Math.random().toString(36).slice(2, 7);
    return 'duell-' + base;
  }

  function fillInputsAndUrl(room, seed) {
    const seedIn = document.getElementById('seed');
    const roomIn = document.getElementById('room');

    if (seedIn) seedIn.value = seed;
    if (roomIn) roomIn.value = room;

    state.seed = seed;
    state.room = room;

    try {
      const url = new URL(window.location.href);
      url.searchParams.set('room', room);
      url.searchParams.set('seed', seed);
      history.replaceState({}, '', url);
    } catch (e) {
      console.warn('[StartMenu] Konnte URL nicht aktualisieren:', e);
    }
  }

  function triggerNewGameIfPossible() {
    const newGameBtn = document.getElementById('newGame');
    if (newGameBtn) {
      newGameBtn.click();
    } else {
      // Fallback: direkt über Engine, wenn Button mal umgebaut wird
      engine.newGame();
    }
  }

  function triggerConnectIfPossible() {
    const connectBtn = document.getElementById('connect');
    if (connectBtn) {
      connectBtn.click();
      return;
    }
    // Fallback, falls der Button einmal umgebaut wird und eine direkte API existiert
    if (net && typeof net.connectWS === 'function') {
      try {
        net.connectWS();
      } catch (e) {
        console.warn('[StartMenu] Connect-Fallback fehlgeschlagen:', e);
      }
    }
  }

  // ------------------------------------------------------
  // Start-Menü-Overlay
  // ------------------------------------------------------
  function createStartMenuOverlay() {
    ensureStartMenuStyles();

    // Falls schon vorhanden, nicht doppelt bauen
    let overlay = document.getElementById('shn-startmenu-overlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'shn-startmenu-overlay';
    overlay.className = 'shn-startmenu-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'shn-startmenu-dialog';

    dialog.innerHTML = `
      <div class="shn-startmenu-header">
        <div class="shn-startmenu-title">Solitaire HighNoon</div>
        <div class="shn-startmenu-version">v${meta.VERSION || ''}</div>
      </div>

      <div class="shn-startmenu-section-title">Spielmodus wählen</div>

      <div class="shn-startmenu-modes">
        <button type="button" id="shn-startmenu-human" class="shn-startmenu-button primary">
          <span class="shn-startmenu-button-label">
            <span>🧍 vs 🧍</span>
            <span>Gegen menschlichen Gegner</span>
          </span>
          <span class="shn-startmenu-chip">Online-Duell</span>
        </button>

        <button type="button" id="shn-startmenu-bot" class="shn-startmenu-button">
          <span class="shn-startmenu-button-label">
            <span>🧍 vs 🤖</span>
            <span>Gegen Bot spielen</span>
          </span>
          <span class="shn-startmenu-chip">Offline (lokal)</span>
        </button>
      </div>

      <div id="shn-startmenu-human-panel" style="display:none;">
        <div class="shn-startmenu-field">
          <label>Room-ID</label>
          <input id="shn-startmenu-room" class="shn-startmenu-input" type="text" readonly />
        </div>
        <div class="shn-startmenu-field">
          <label>Seed</label>
          <input id="shn-startmenu-seed" class="shn-startmenu-input" type="text" readonly />
        </div>
        <div class="shn-startmenu-field">
          <label>Einladungslink (zum Senden an den Gegner)</label>
          <input id="shn-startmenu-link" class="shn-startmenu-input" type="text" readonly />
        </div>
      </div>

      <div class="shn-startmenu-footer">
        <span id="shn-startmenu-copy-link" class="shn-startmenu-small-link" style="display:none;">
          Link kopieren
        </span>
        <span id="shn-startmenu-close" class="shn-startmenu-small-link">
          Startmenü schließen
        </span>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    // Events verdrahten
    const btnHuman = dialog.querySelector('#shn-startmenu-human');
    const btnBot   = dialog.querySelector('#shn-startmenu-bot');
    const panelHuman = dialog.querySelector('#shn-startmenu-human-panel');
    const roomOut  = dialog.querySelector('#shn-startmenu-room');
    const seedOut  = dialog.querySelector('#shn-startmenu-seed');
    const linkOut  = dialog.querySelector('#shn-startmenu-link');
    const copyLink = dialog.querySelector('#shn-startmenu-copy-link');
    const closeBtn = dialog.querySelector('#shn-startmenu-close');

    // Restart-Popup-Buttons (global im DOM)
    const restartSameBtn = document.getElementById('restart-same');
    const restartNewBtn  = document.getElementById('restart-new');

    let inviteMode = false;
    let hostExistingShownOnce = false; // steuert, ob vorhandenes Duell bereits einmal ohne Popup gezeigt wurde

    function startHostGameWithSeed(room, seed) {
      // Room/Seed in Main-UI & URL schreiben
      fillInputsAndUrl(room, seed);

      // Spiel neu starten und verbinden (falls möglich)
      triggerNewGameIfPossible();
      triggerConnectIfPossible();

      ui.showToast('Duell gestartet – verbinde …');

      // Startmenü und ggf. Restart-Popup schließen
      if (typeof ui.hideRestartPopup === 'function') {
        ui.hideRestartPopup();
      } else {
        const rp = document.getElementById('restart-popup');
        if (rp) rp.classList.remove('show');
      }
      overlay.remove();
    }

    // Falls Room/Seed bereits in der URL stehen (z.B. via Einladungslink),
    // Startmenü-Felder damit vorbefüllen und in einen "Join"-Modus schalten.
    try {
      const currentUrl = new URL(window.location.href);
      const existingRoom = currentUrl.searchParams.get('room');
      const existingSeed = currentUrl.searchParams.get('seed') || '';
      if (existingRoom) {
        inviteMode = true;

        if (roomOut) roomOut.value = existingRoom;
        if (seedOut) seedOut.value = existingSeed;
        if (linkOut) linkOut.value = buildShareLink(existingRoom, existingSeed);
        if (panelHuman) panelHuman.style.display = 'block';
        if (copyLink) copyLink.style.display = 'none'; // für Joiner eher nicht nötig

        // State & Hidden-Inputs im Haupt-UI auch aktualisieren
        fillInputsAndUrl(existingRoom, existingSeed);

        // UI für Einladungsmodus anpassen:
        if (btnHuman) {
          const label = btnHuman.querySelector('.shn-startmenu-button-label span:nth-child(2)');
          const chip  = btnHuman.querySelector('.shn-startmenu-chip');
          if (label) label.textContent = 'An Spiel teilnehmen';
          if (chip)  chip.textContent  = 'Einladung';
        }
        if (btnBot) {
          btnBot.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('[StartMenu] Konnte bestehende Room/Seed-Parameter nicht lesen:', e);
    }

    if (btnHuman) {
      btnHuman.addEventListener('click', () => {
        // Wenn wir über einen Einladungslink hier sind, dürfen wir NICHT
        // neuen Room/Seed erzeugen, sondern einfach dem Spiel beitreten.
        if (inviteMode) {
          // Room/Seed wurden bereits aus der URL übernommen und in Inputs/State gesetzt.
          triggerNewGameIfPossible();
          triggerConnectIfPossible();
          ui.showToast('Seed & Room übernommen – verbinde zum Duell …');
          overlay.remove();
          return;
        }

        // Host-Modus: Wenn bereits ein Room/Seed existiert (z.B. Rematch),
        // bisherigen Duell-Status anzeigen. Beim ersten Mal nur Link anzeigen,
        // erst bei weiteren Klicks das Neustart-Popup anbieten.
        if (state.room && state.seed && state.over) {
          const room = state.room;
          const seed = state.seed;

          if (roomOut) roomOut.value = room;
          if (seedOut) seedOut.value = seed;
          if (linkOut) linkOut.value = buildShareLink(room, seed);
          if (panelHuman) panelHuman.style.display = 'block';
          if (copyLink) copyLink.style.display = 'inline';

          // Erstes Mal: nur bestehenden Status anzeigen wie früher
          if (!hostExistingShownOnce) {
            hostExistingShownOnce = true;
            ui.showToast('Duell ist bereits vorbereitet – benutze diesen Link.');
            return;
          }

          // Ab dem zweiten Mal: Neustart-Popup mit Rematch-Optionen anbieten
          if (restartSameBtn && !restartSameBtn._shnHostBound) {
            restartSameBtn._shnHostBound = true;
            restartSameBtn.addEventListener('click', () => {
              // Gleiches Spiel: bestehenden Seed weiterverwenden
              const r = state.room || room;
              const s = state.seed || seed;
              startHostGameWithSeed(r, s);
            });
          }

          if (restartNewBtn && !restartNewBtn._shnHostBound) {
            restartNewBtn._shnHostBound = true;
            restartNewBtn.addEventListener('click', () => {
              // Neue Karten: gleicher Room, neuer Seed
              const r = state.room || room || generateRoomId();
              const s = engine.generateSeed();

              const shareLink = buildShareLink(r, s);

              if (roomOut) roomOut.value = r;
              if (seedOut) seedOut.value = s;
              if (linkOut) linkOut.value = shareLink;
              if (panelHuman) panelHuman.style.display = 'block';
              if (copyLink) copyLink.style.display = 'inline';

              startHostGameWithSeed(r, s);
            });
          }

          if (typeof ui.showRestartPopup === 'function') {
            ui.showRestartPopup();
          } else {
            const rp = document.getElementById('restart-popup');
            if (rp) rp.classList.add('show');
          }

          return;
        }

        // Host-Modus: neuen Room + Seed erzeugen und Link bauen
        const room = generateRoomId();
        const seed = engine.generateSeed();

        const shareLink = buildShareLink(room, seed);

        if (roomOut) roomOut.value = room;
        if (seedOut) seedOut.value = seed;
        if (linkOut) linkOut.value = shareLink;
        if (panelHuman) panelHuman.style.display = 'block';
        if (copyLink) copyLink.style.display = 'inline';

        fillInputsAndUrl(room, seed);
        triggerNewGameIfPossible();
        triggerConnectIfPossible();

        ui.showToast('Duell vorbereitet – verbinde und Link an Gegner senden.');
      });
    }

    if (btnBot) {
      btnBot.addEventListener('click', () => {
        // Lokales Spiel gegen Bot (offline, ohne Room/Connect)
        const seed = engine.generateSeed();
        state.seed = seed;
        state.room = '';

        // Seed/Room-Inputs im Haupt-UI aktualisieren
        const seedIn = document.getElementById('seed');
        const roomIn = document.getElementById('room');
        if (seedIn) seedIn.value = seed;
        if (roomIn) roomIn.value = '';

        // URL anpassen: kein room, aber bot=easy setzen
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('room');
          url.searchParams.set('seed', seed);
          url.searchParams.set('bot', 'easy');
          history.replaceState({}, '', url);
        } catch (e) {
          console.warn('[StartMenu] Konnte URL für Bot-Modus nicht aktualisieren:', e);
        }

        // Neues lokales Spiel starten (ohne Connect)
        triggerNewGameIfPossible();

        // Bot aktivieren, falls verfügbar
        if (window.SHN && window.SHN.bot && typeof window.SHN.bot.enable === 'function') {
          window.SHN.bot.enable('easy');
        }

        ui.showToast('Bot-Spiel (Easy) gestartet – du spielst unten, der Bot oben.');
        overlay.remove();
      });
    }

    function fallbackCopy(inputEl, text) {
      try {
        // Versuche, das vorhandene Input-Element zu selektieren und zu kopieren
        if (inputEl && inputEl.select) {
          inputEl.focus();
          inputEl.select();
          document.execCommand('copy');
          ui.showToast('Link kopiert');
          return;
        }

        // Fallback über temporäres Textarea
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ui.showToast(ok ? 'Link kopiert' : 'Kopieren nicht möglich');
      } catch (err) {
        console.warn('[StartMenu] Fallback-Copy fehlgeschlagen:', err);
        ui.showToast('Kopieren nicht möglich');
      }
    }

    if (copyLink && linkOut) {
      copyLink.addEventListener('click', () => {
        const val = linkOut.value || '';
        if (!val) {
          ui.showToast('Kein Link zum Kopieren');
          return;
        }

        // Primär: moderne Clipboard-API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(val)
            .then(() => {
              ui.showToast('Link kopiert');
            })
            .catch(err => {
              console.warn('[StartMenu] Clipboard API fehlgeschlagen, versuche Fallback:', err);
              fallbackCopy(linkOut, val);
            });
        } else {
          // Fallback für ältere Browser
          fallbackCopy(linkOut, val);
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        overlay.remove();
      });
    }

    return overlay;
  }

  // ------------------------------------------------------
  // Init
  // ------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    // Startmenü beim Laden anzeigen
    createStartMenuOverlay();
  });

  // Startmenü-API an SHN hängen, damit z.B. game.js es aufrufen kann
  SHN.startmenu = SHN.startmenu || {};
  SHN.startmenu.open = createStartMenuOverlay;

})();