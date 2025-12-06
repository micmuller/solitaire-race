// startmenu.js – Start-Menü für Solitaire HighNoon
// nutzt die SHN-API aus game.js

(function () {
  const SHN = window.SHN || {};
  const { engine, state, ui, meta } = SHN;

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
      .shn-startmenu-info {
        font-size: 0.8rem;
        opacity: 0.9;
        line-height: 1.35;
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
      .shn-startmenu-join-row .shn-startmenu-button {
        width: auto;
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
      .shn-startmenu-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.9rem;
      }
      .shn-startmenu-actions button {
        padding: 0.4rem 0.9rem;
        border-radius: 0.45rem;
        border: 1px solid rgba(156,163,175,0.7);
        background: #1f2937;
        color: #e5e7eb;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .shn-startmenu-actions button.primary {
        background: #2563eb;
        border-color: #2563eb;
      }
      .shn-startmenu-actions button.danger {
        background: #7f1d1d;
        border-color: #b91c1c;
      }
      .shn-startmenu-small-link {
        color: #93c5fd;
        cursor: pointer;
        text-decoration: underline;
      }
    `;
    document.head.appendChild(style);
  }
  // ------------------------------------------------------
  // Einladung annehmen/ablehnen Popup
  // ------------------------------------------------------
  function showInvitePopup(invite) {
    ensureStartMenuStyles();

    // Falls bereits ein Invite-Popup offen ist, nicht noch eins öffnen
    if (document.getElementById('shn-invite-overlay')) return;

    const data = invite || (window.SHN && window.SHN.state && window.SHN.state.lastInvite) || {};
    const matchId  = data.matchId || '';
    const hostCid  = data.hostCid || data.fromCid || '';
    const fromNick = data.fromNick || 'Spieler';

    const overlay = document.createElement('div');
    overlay.id = 'shn-invite-overlay';
    overlay.className = 'shn-startmenu-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'shn-startmenu-dialog';

    dialog.innerHTML = `
      <div class="shn-startmenu-header">
        <div class="shn-startmenu-title">Einladung zum Duell</div>
        <div class="shn-startmenu-version">v${meta.VERSION || ''}</div>
      </div>
      <div class="shn-startmenu-field">
        <label>Von</label>
        <div class="shn-startmenu-info">${fromNick}</div>
      </div>
      <div class="shn-startmenu-field">
        <label>Match-ID</label>
        <div class="shn-startmenu-info">${matchId || 'unbekannt'}</div>
      </div>
      <div class="shn-startmenu-actions">
        <button type="button" id="shn-invite-decline" class="danger">Ablehnen</button>
        <button type="button" id="shn-invite-accept" class="primary">Annehmen</button>
      </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const btnAccept = dialog.querySelector('#shn-invite-accept');
    const btnDecline = dialog.querySelector('#shn-invite-decline');

    function closePopup() {
      try {
        overlay.remove();
      } catch (e) {
        console.warn('[StartMenu] Invite-Overlay konnte nicht entfernt werden:', e);
      }
    }

    if (btnAccept) {
      btnAccept.addEventListener('click', () => {
        const netApi = SHN.net;
        const nick = getNickFromMainUi();
        if (!matchId || !hostCid || !netApi) {
          ui.showToast('Einladung ist nicht mehr gültig');
          closePopup();
          return;
        }

        // Nickname VOR dem neuen Connect zentral setzen (UI, State, localStorage),
        // damit das erste hello im Match-Raum nicht wieder "Player" sendet.
        try {
          applyNickEverywhere(nick);
        } catch (e) {
          console.warn('[INVITE] konnte Nick beim Invite-Accept nicht setzen:', e);
        }

        // Room-Kontext auf das eingeladene Match setzen:
        // 1) SHN.state.room aktualisieren
        // 2) Hidden-Input #room anpassen
        // 3) URL-Parameter ?room= aktualisieren
        try {
          if (SHN.state) {
            SHN.state.room = matchId;
          }
        } catch (e) {
          console.warn('[INVITE] konnte SHN.state.room nicht setzen', e);
        }

        const roomIn = document.getElementById('room');
        if (roomIn) {
          roomIn.value = matchId;
        }

        try {
          const urlObj = new URL(window.location.href);
          urlObj.searchParams.set('room', matchId);
          history.replaceState({}, '', urlObj);
        } catch (e) {
          console.warn('[INVITE] konnte URL für Match-Raum nicht aktualisieren', e);
        }

        // Zuerst WS-Verbindung sicherstellen (jetzt mit dem richtigen Room)
        triggerConnectIfPossible();

        if (typeof netApi.acceptInvite !== 'function' || typeof netApi.joinMatch !== 'function') {
          ui.showToast('Invite-Funktion nicht verfügbar');
          closePopup();
          return;
        }

        waitForOnlineThen(() => {
          // Nach erfolgreichem Connect explizit ein hello mit dem korrekten Nick senden,
          // damit ein eventuell vorheriges hello("Player") überschrieben wird.
          try {
            if (netApi && typeof netApi.sendSys === 'function') {
              netApi.sendSys({ type: 'hello', nick });
            }
          } catch (err) {
            console.warn('[INVITE] hello(nick) nach Connect fehlgeschlagen:', err);
          }

          // Host benachrichtigen, dass wir akzeptieren
          netApi.acceptInvite(matchId, hostCid, nick);
          // Dann dem Match beitreten; der Server erledigt den Rest (match_joined/reset)
          netApi.joinMatch(matchId, nick);
          ui.showToast('Verbinde zum Duell …');
          // Invite-Popup schließen
          closePopup();

          // Zusätzlich das Startmenü-Overlay schließen, damit nach dem
          // Annehmen einer Einladung alle Menüs verschwinden und
          // der Fokus auf dem eigentlichen Spiel liegt.
          try {
            const startOverlay = document.getElementById('shn-startmenu-overlay');
            if (startOverlay) {
              startOverlay.remove();
            }
          } catch (e) {
            console.warn('[StartMenu] Konnte Startmenü-Overlay nach Invite-Accept nicht schließen:', e);
          }
        });
      });
    }

    if (btnDecline) {
      btnDecline.addEventListener('click', () => {
        const netApi = SHN.net;
        const nick = getNickFromMainUi();
        if (matchId && hostCid && netApi && typeof netApi.declineInvite === 'function') {
          netApi.declineInvite(matchId, hostCid, nick);
        }
        ui.showToast('Einladung abgelehnt');
        closePopup();
      });
    }
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

  function getNickFromMainUi() {
    const overlayNickEl = document.getElementById('shn-startmenu-nick');
    let val = overlayNickEl && typeof overlayNickEl.value === 'string' ? overlayNickEl.value.trim() : '';
    if (!val) {
      const nickEl = document.getElementById('nick');
      val = nickEl && typeof nickEl.value === 'string' ? nickEl.value.trim() : '';
    }
    return val || 'Player';
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
    const netApi = SHN.net;
    if (netApi && typeof netApi.connectWS === 'function') {
      try {
        netApi.connectWS();
      } catch (e) {
        console.warn('[StartMenu] Connect-Fallback fehlgeschlagen:', e);
      }
    }
  }

  function waitForOnlineThen(action, timeoutMs = 5000) {
    if (typeof action !== 'function') return;
    // Wenn bereits online, direkt ausführen
    if (state && state.netOnline) {
      action();
      return;
    }
    const step = 200;
    let elapsed = 0;
    const id = setInterval(() => {
      if (state && state.netOnline) {
        clearInterval(id);
        action();
      } else {
        elapsed += step;
        if (elapsed >= timeoutMs) {
          clearInterval(id);
          ui.showToast('Online-Verbindung nicht verfügbar (Timeout)');
        }
      }
    }, step);
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

    // Interval-ID für regelmäßiges Aktualisieren der Online-Spielerliste
    let onlineRefreshIntervalId = null;

    function destroyOverlay() {
      if (onlineRefreshIntervalId) {
        clearInterval(onlineRefreshIntervalId);
        onlineRefreshIntervalId = null;
      }
      overlay.remove();
    }

    function updateOnlineDropdown(inviteTargetSelectEl) {
      if (!inviteTargetSelectEl) return;

      // Wenn bereits ein Spieler ausgewählt ist, nicht neu aufbauen,
      // damit die Auswahl durch das 5-Sekunden-Refresh nicht verloren geht.
      if (inviteTargetSelectEl.value) {
        return;
      }

      inviteTargetSelectEl.innerHTML = '<option value="">– Spieler auswählen –</option>';
      const players = Array.isArray(state.onlinePlayers) ? state.onlinePlayers : [];
      const others = players.filter(p => !p.isSelf);
      for (const p of others) {
        const opt = document.createElement('option');
        const shortCid = (p.cid || '').slice(0, 6);
        opt.value = p.cid;
        opt.textContent = `${p.nick || 'Player'} (${shortCid})`;
        inviteTargetSelectEl.appendChild(opt);
      }
    }

    dialog.innerHTML = `
      <div class="shn-startmenu-header">
        <div class="shn-startmenu-title">Solitaire HighNoon</div>
        <div class="shn-startmenu-version">v${meta.VERSION || ''}</div>
      </div>

      <!-- Panel 1: Dein Name -->
      <div class="shn-startmenu-field">
        <label>Dein Name</label>
        <input id="shn-startmenu-nick" class="shn-startmenu-input" type="text" placeholder="z.B. Michi" />
        <div class="shn-startmenu-info">
          Dieser Name wird im Spiel &amp; bei Einladungen verwendet.
        </div>
      </div>

      <!-- Hinweis für Link-basierte Einladungen (URL mit room/seed) -->
      <div id="shn-startmenu-invite-note" class="shn-startmenu-field" style="display:none; margin-top:0.5rem;">
        <label>Einladung</label>
        <div class="shn-startmenu-info">
          Du wurdest zu einem Duell eingeladen.
          Tippe auf „Duell starten" oder „An Spiel teilnehmen", um dem Spiel beizutreten.
        </div>
      </div>

      <!-- Panel 2: Duell starten (Host) -->
      <div class="shn-startmenu-section-title" style="margin-top:1.0rem;">Duell starten (Host)</div>
      <div class="shn-startmenu-info" style="margin-bottom:0.4rem;">
        Du bist der Gastgeber und startest ein neues Duell.
      </div>

      <div class="shn-startmenu-modes" style="margin-bottom:0.5rem;">
        <button type="button" id="shn-startmenu-human" class="shn-startmenu-button primary">
          <span class="shn-startmenu-button-label">
            <span>🔫</span>
            <span>Neues Duell erstellen</span>
          </span>
          <span class="shn-startmenu-chip">Online-Duell</span>
        </button>
      </div>

      <div id="shn-startmenu-human-panel" style="display:none; margin-top:0.25rem;">
        <div class="shn-startmenu-field">
          <label>Dein Match-Code</label>
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
        <div class="shn-startmenu-field" id="shn-startmenu-invite-target-wrapper" style="display:none; margin-top:0.6rem;">
          <label>Gegenspieler auswählen</label>
          <select id="shn-startmenu-target-select" class="shn-startmenu-input">
            <option value="">– Spieler auswählen –</option>
          </select>
          <div class="shn-startmenu-info">
            Optional: Manuelle Spieler-ID, falls der Gegenspieler nicht in der Liste erscheint.
          </div>
          <input id="shn-startmenu-targetcid" class="shn-startmenu-input" type="text" placeholder="Client-ID des Gegners (cid)" />
        </div>
      </div>

      <!-- Panel 3: An Spiel teilnehmen (Guest) -->
      <div id="shn-startmenu-guest-panel">
        <div class="shn-startmenu-section-title" style="margin-top:1.0rem;">An Spiel teilnehmen</div>

        <!-- Modus A: Auf Einladung warten -->
        <div class="shn-startmenu-modes" style="margin-bottom:0.35rem;">
          <button type="button" id="shn-startmenu-join-wait" class="shn-startmenu-button">
            <span class="shn-startmenu-button-label">
              <span>⏳</span>
              <span>Auf Einladung warten</span>
            </span>
            <span class="shn-startmenu-chip">Online, passiv</span>
          </button>
        </div>
        <div id="shn-startmenu-guest-status" class="shn-startmenu-info" style="margin-bottom:0.6rem;">
          Du verbindest dich in die Lobby und wartest auf eine Einladung.
        </div>

        <!-- Modus B: Ich habe einen Match-Code -->
        <div class="shn-startmenu-field" style="margin-top:0.25rem;">
          <label>Ich habe einen Match-Code</label>
          <div class="shn-startmenu-info" style="margin-bottom:0.25rem;">
            Wenn dir jemand einen Match-Code gegeben hat, kannst du direkt beitreten.
          </div>
          <div class="shn-startmenu-join-row" style="display:flex; gap:0.4rem; align-items:center;">
            <input id="shn-startmenu-join-code" class="shn-startmenu-input" type="text" placeholder="z.B. EQ8ZV" style="flex:1;" />
            <button type="button" id="shn-startmenu-join-code-btn" class="shn-startmenu-button" style="flex:0 0 auto; padding-inline:0.7rem;">
              <span class="shn-startmenu-button-label">
                <span>🚪</span>
                <span>Beitreten</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Panel 4: Gegen Bot spielen -->
      <div id="shn-startmenu-bot-panel">
        <div class="shn-startmenu-section-title" style="margin-top:1.0rem;">Sofort spielen (ohne Online-Gegner)</div>
        <div class="shn-startmenu-info" style="margin-bottom:0.3rem;">
          Spiele direkt gegen einen Bot auf diesem Gerät.
        </div>
        <div class="shn-startmenu-modes">
          <button type="button" id="shn-startmenu-bot" class="shn-startmenu-button">
            <span class="shn-startmenu-button-label">
              <span>🤖</span>
              <span>Bot – Einfach</span>
            </span>
            <span class="shn-startmenu-chip">Offline</span>
          </button>
        </div>
      </div>

      <div class="shn-startmenu-footer">
        <span id="shn-startmenu-send-invite" class="shn-startmenu-small-link" style="display:none; margin-right:auto;">
          📩 Spieler einladen
        </span>
        <span id="shn-startmenu-copy-link" class="shn-startmenu-small-link" style="display:none;">
          🔗 Link kopieren
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
    const btnJoinWait = dialog.querySelector('#shn-startmenu-join-wait');
    const btnBot   = dialog.querySelector('#shn-startmenu-bot');
    const panelHuman = dialog.querySelector('#shn-startmenu-human-panel');
    const roomOut  = dialog.querySelector('#shn-startmenu-room');
    const seedOut  = dialog.querySelector('#shn-startmenu-seed');
    const linkOut  = dialog.querySelector('#shn-startmenu-link');
    const copyLink = dialog.querySelector('#shn-startmenu-copy-link');
    const closeBtn = dialog.querySelector('#shn-startmenu-close');
    const nickOverlay = dialog.querySelector('#shn-startmenu-nick');
    const inviteNote = dialog.querySelector('#shn-startmenu-invite-note');
    const inviteTargetWrapper = dialog.querySelector('#shn-startmenu-invite-target-wrapper');
    const inviteTargetSelect = dialog.querySelector('#shn-startmenu-target-select');
    const inviteTargetCidInput = dialog.querySelector('#shn-startmenu-targetcid');
    const sendInviteLink = dialog.querySelector('#shn-startmenu-send-invite');
    // Neue Query-Selectoren für Guest-Status und Match-Code-Join Controls
    const guestStatusEl = dialog.querySelector('#shn-startmenu-guest-status');
    const joinCodeInput = dialog.querySelector('#shn-startmenu-join-code');
    const joinCodeBtn   = dialog.querySelector('#shn-startmenu-join-code-btn');
    const guestPanel    = dialog.querySelector('#shn-startmenu-guest-panel');
    const botPanel      = dialog.querySelector('#shn-startmenu-bot-panel');

    // Zentraler Helper: Nickname in Main-UI, State und localStorage anwenden
    function applyNickEverywhere(n) {
      const nick = (n && String(n).trim()) || 'Player';
      try {
        const mainNickEl = document.getElementById('nick');
        if (mainNickEl) {
          mainNickEl.value = nick;
        }
        if (SHN.state) {
          SHN.state.nick = nick;
        }
        if (window.localStorage) {
          // Sowohl alter als auch neuer Key, damit game.js und ältere Versionen
          // konsistent denselben Wert sehen.
          window.localStorage.setItem('shn_nick', nick);
          window.localStorage.setItem('nick', nick);
        }
      } catch (e) {
        console.warn('[StartMenu] applyNickEverywhere Fehler:', e);
      }
    }

    // Zentral: Nickname vor jeglichem Connect in State & Main-UI spiegeln
    function syncNickEarly() {
      const overlayNickEl = dialog.querySelector('#shn-startmenu-nick');
      const mainNickEl = document.getElementById('nick');

      let n = overlayNickEl && typeof overlayNickEl.value === 'string' ? overlayNickEl.value.trim() : '';
      if (!n && mainNickEl && typeof mainNickEl.value === 'string') {
        n = mainNickEl.value.trim();
      }
      if (!n) n = 'Player';

      applyNickEverywhere(n);
    }

    // Nickname-Sync: Overlay ⇄ Main UI (inkl. localStorage)
    try {
      const mainNickEl = document.getElementById('nick');
      const overlayNickEl = dialog.querySelector('#shn-startmenu-nick');

    // 0) Aus localStorage vorbefüllen, falls vorhanden
    try {
        if (window.localStorage) {
          // Bevorzugt den neuen Key, fällt aber auf den alten zurück,
          // falls nur dort etwas gespeichert ist.
          let stored = window.localStorage.getItem('shn_nick');
          if (!stored || !stored.trim()) {
            stored = window.localStorage.getItem('nick');
          }
          if (stored && stored.trim()) {
            const trimmed = stored.trim();
            if (overlayNickEl && !overlayNickEl.value.trim()) {
              overlayNickEl.value = trimmed;
            }
            if (mainNickEl && !mainNickEl.value.trim()) {
              mainNickEl.value = trimmed;
            }
            // Gleichzeitig den konsolidierten Wert überall anwenden,
            // damit State und beide Keys synchron sind.
            applyNickEverywhere(trimmed);
          }
        }
      } catch (e) {
        console.warn('[StartMenu] Konnte Nick nicht aus localStorage lesen:', e);
      }

      // 1) Overlay befüllen, falls leer
      if (overlayNickEl && mainNickEl) {
        if (!overlayNickEl.value.trim() && mainNickEl.value.trim()) {
          overlayNickEl.value = mainNickEl.value.trim();
        }
      }

      // 2) Sofort beim Öffnen Nickname zurück ins Main-UI spiegeln,
      //    damit "hello" IMMER den korrekten Nick bekommt, egal welche Taste gedrückt wird.
      if (overlayNickEl && mainNickEl) {
        mainNickEl.value = overlayNickEl.value.trim();
      }

      // 3) Live-Sync bei Eingabe
      if (overlayNickEl && mainNickEl) {
        overlayNickEl.addEventListener('input', () => {
          mainNickEl.value = overlayNickEl.value.trim();
        });
      }
    } catch (e) {
      console.warn('[StartMenu] Nick-Sync Fehler:', e);
    }

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
      destroyOverlay();
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
        if (inviteNote) inviteNote.style.display = 'block';

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
        // Nickname zentral vor allem anderen synchronisieren
        syncNickEarly();
        // Wenn der Host ein neues Duell erstellt, die Guest-/Bot-Panels ausblenden,
        // damit der Dialog nicht zu lang wird.
        if (!inviteMode) {
          if (guestPanel) guestPanel.style.display = 'none';
          if (botPanel) botPanel.style.display = 'none';
        }

        // Wenn wir über einen Einladungslink hier sind, sollen wir dem bestehenden Match beitreten.
        if (inviteMode) {
          const existingRoom =
            (roomOut && roomOut.value && roomOut.value.trim()) ||
            state.room ||
            '';
          if (!existingRoom) {
            ui.showToast('Kein Match-Code vorhanden');
            return;
          }

          // Sicherstellen, dass eine WS-Verbindung besteht.
          // Hier NICHT pauschal auf "lobby" zurückfallen, sondern den
          // Match-Room (z.B. ZXZKW) verwenden, der bereits im UI steht.
          const roomIn = document.getElementById('room');
          if (roomIn && !roomIn.value) {
            roomIn.value = existingRoom;
          }

          triggerConnectIfPossible();

          const netApi = SHN.net;
          if (netApi && typeof netApi.joinMatch === 'function') {
            const nick = getNickFromMainUi();

            // Wie beim Host: warten, bis state.netOnline == true ist,
            // damit join_match sicher auf einer offenen WS-Verbindung
            // gesendet wird (sonst wird es im CONNECTING-State verworfen).
          waitForOnlineThen(() => {
            netApi.joinMatch(existingRoom, nick);
            ui.showToast('Verbinde zum Duell …');
            destroyOverlay();
          });
          } else {
            ui.showToast('Online-Duell nicht verfügbar');
          }

          return;
        }

        // Host-Modus: Wenn bereits ein Room/Seed existiert (z.B. Rematch),
        // bisherigen Duell-Status anzeigen / Neustart-Popup nutzen.
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

        // Host-Modus: neues server-zentriertes Match erstellen
        // 1) Basis-Room für die initiale WS-Verbindung setzen, falls leer
        const roomIn = document.getElementById('room');
        if (roomIn && !roomIn.value) {
          roomIn.value = 'lobby';
        }
        // 2) Verbinden (falls noch nicht verbunden)
        triggerConnectIfPossible();

        const netApi = SHN.net;
        if (netApi && typeof netApi.createMatch === 'function') {
          const nick = getNickFromMainUi();

          // Wir warten, bis state.netOnline == true ist, bevor wir create_match schicken,
          // damit die WebSocket-Verbindung sicher offen ist.
          waitForOnlineThen(() => {
            netApi.createMatch(nick);

            // Optional: Online-Spieler-Liste vom Server anfordern
            try {
              if (SHN.net && typeof SHN.net.refreshOnlinePlayers === 'function') {
                SHN.net.refreshOnlinePlayers();
              }
            } catch (e) {
              console.warn('[StartMenu] Konnte Online-Spieler nicht aktualisieren:', e);
            }

            // Panel sichtbar machen, Link-Feld vorbereiten
            if (panelHuman) panelHuman.style.display = 'block';
            if (copyLink) copyLink.style.display = 'inline';

            // Sobald der Server match_created/match_joined geschickt und game.js
            // state.room / state.seed gesetzt hat, können wir die Felder übernehmen.
            let attempts = 0;
            const maxAttempts = 20; // ~5 Sekunden bei 250ms
            const pollId = setInterval(() => {
              attempts++;
              const r = state.room;
              const s = state.seed;
              if (r && s) {
                if (roomOut) roomOut.value = r;
                if (seedOut) seedOut.value = s;
                if (linkOut) linkOut.value = buildShareLink(r, s);
                // Invite-UI für den Host einblenden, sobald ein Match existiert
                if (inviteTargetWrapper) inviteTargetWrapper.style.display = 'flex';
                if (sendInviteLink) sendInviteLink.style.display = 'inline';

                // Dropdown initial mit aktuellen Online-Spielern füllen
                updateOnlineDropdown(inviteTargetSelect);

                // Regelmäßig Online-Spieler-Liste aktualisieren, solange das Startmenü offen ist
                if (!onlineRefreshIntervalId && SHN.net && typeof SHN.net.refreshOnlinePlayers === 'function') {
                  onlineRefreshIntervalId = setInterval(() => {
                    try {
                      SHN.net.refreshOnlinePlayers();
                      updateOnlineDropdown(inviteTargetSelect);
                    } catch (e) {
                      console.warn('[StartMenu] Fehler beim Aktualisieren der Online-Spieler:', e);
                    }
                  }, 5000);
                }

                clearInterval(pollId);
              } else if (attempts >= maxAttempts) {
                clearInterval(pollId);
              }
            }, 250);

            ui.showToast('Duell wird erstellt …');
          });
        } else {
          ui.showToast('Online-Duell nicht verfügbar');
        }
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
        destroyOverlay();
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

    if (sendInviteLink && inviteTargetCidInput) {
      sendInviteLink.addEventListener('click', () => {
        let cid = '';
        // 1) Auswahl aus Dropdown bevorzugen
        if (inviteTargetSelect && inviteTargetSelect.value) {
          cid = inviteTargetSelect.value.trim();
        } else {
          // 2) Fallback: manuelle Eingabe
          cid = (inviteTargetCidInput.value || '').trim();
        }

        if (!cid) {
          ui.showToast('Bitte einen Spieler auswählen oder eine Spieler-ID eingeben');
          return;
        }

        const netApi = SHN.net;
        if (!netApi || typeof netApi.sendInvite !== 'function') {
          ui.showToast('Invite-Funktion nicht verfügbar');
          return;
        }
        const roomCode =
          (roomOut && roomOut.value && roomOut.value.trim()) ||
          state.room ||
          '';
        if (!roomCode) {
          ui.showToast('Kein Match für Einladung');
          return;
        }

        netApi.sendInvite(cid, roomCode, getNickFromMainUi());
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        destroyOverlay();
      });
    }

    if (btnJoinWait) {
      btnJoinWait.addEventListener('click', () => {
        // Nickname zentral vor allem anderen synchronisieren
        syncNickEarly();

        const nick = getNickFromMainUi();

        // Auf "lobby" verbinden, um sichtbar für den Host zu sein
        const roomIn = document.getElementById('room');
        if (roomIn && !roomIn.value) {
          roomIn.value = 'lobby';
        }

        // Verbindung aufbauen
        triggerConnectIfPossible();
        ui.showToast('Verbinde und warte auf Einladung …');

        // Button-Label & -Zustand anpassen, damit klar ist, dass wir warten
        btnJoinWait.classList.add('disabled');
        const labelSpan = btnJoinWait.querySelector('.shn-startmenu-button-label span:nth-child(2)');
        if (labelSpan) labelSpan.textContent = 'Warte auf Einladung …';

        // Status-Text setzen
        if (guestStatusEl) {
          const roomVal = roomIn && roomIn.value ? roomIn.value : 'lobby';
          guestStatusEl.textContent = `Du bist in der Lobby und wartest auf eine Einladung … (Verbunden als ${nick}, Room: ${roomVal})`;
        }
      });
    }

    // Logik für neuen "Match-Code beitreten"-Button
    if (joinCodeBtn && joinCodeInput) {
      joinCodeBtn.addEventListener('click', () => {
        // Nickname früh synchronisieren
        syncNickEarly();
        const code = joinCodeInput.value ? joinCodeInput.value.trim() : '';
        if (!code) {
          ui.showToast('Bitte einen Match-Code eingeben');
          return;
        }

        const nick = getNickFromMainUi();

        // Room/Seed im Haupt-UI & State setzen
        fillInputsAndUrl(code, state.seed || '');

        // Verbindung aufbauen
        triggerConnectIfPossible();

        const netApi = SHN.net;
        if (!netApi || typeof netApi.joinMatch !== 'function') {
          ui.showToast('Online-Duell nicht verfügbar');
          return;
        }

        waitForOnlineThen(() => {
          netApi.joinMatch(code, nick);
          ui.showToast('Verbinde zum Duell …');
          destroyOverlay();
        });
      });
    }

    return overlay;
  }

  // ------------------------------------------------------
  // Init
  // ------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    // Default-Room "lobby" setzen, falls noch kein Room hinterlegt ist,
    // damit ein Verbinden ohne explizite Room-ID möglich ist.
    try {
      const roomIn = document.getElementById('room');
      if (roomIn && !roomIn.value) {
        roomIn.value = 'lobby';
      }
    } catch (e) {
      console.warn('[StartMenu] Konnte Default-Room nicht setzen:', e);
    }

    // Startmenü beim Laden anzeigen
    createStartMenuOverlay();
  });

  // Startmenü-API an SHN hängen, damit z.B. game.js es aufrufen kann
  SHN.startmenu = SHN.startmenu || {};
  SHN.startmenu.open = createStartMenuOverlay;
  SHN.startmenu.showInvitePopup = showInvitePopup;

})();