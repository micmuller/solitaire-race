// bot.js – einfacher Solitaire HighNoon Bot (lokal, spielt als Gegner)
// Aktivierung: URL-Parameter ?bot=easy (oder bot=medium/hard für später)

(function () {
  const SHN = window.SHN || (window.SHN = {});

  let enabled = false;
  let difficulty = 'easy';
  const BOT_OWNER = 'O';   // Bot gehört zur "O"-Seite
  const BOT_SIDE  = 'opp'; // Bot spielt die Gegner-Seite im UI

  let thinkTimer = null;

  function scheduleNextThink() {
    if (!enabled) return;

    // Basis-Delays je nach Schwierigkeit (in ms)
    let baseDelay;
    switch (difficulty) {
      case 'hard':
        baseDelay = 900;
        break;
      case 'medium':
        baseDelay = 1400;
        break;
      case 'easy':
      default:
        baseDelay = 2200;
        break;
    }
    const jitter = Math.random() * 400; // kleine Zufallskomponente
    const delay = baseDelay + jitter;

    thinkTimer = setTimeout(() => {
      thinkTimer = null;
      thinkOnce();
      scheduleNextThink();
    }, delay);
  }

  function initFromUrl() {
    try {
      const url = new URL(location.href);
      const botParam = url.searchParams.get('bot');
      if (!botParam) return;

      enabled = true;
      if (botParam === 'easy' || botParam === 'medium' || botParam === 'hard') {
        difficulty = botParam;
      } else {
        difficulty = 'easy';
      }

      console.log('[BOT] aktiviert, Schwierigkeit =', difficulty);
    } catch (e) {
      console.warn('[BOT] URL-Analyse fehlgeschlagen', e);
    }
  }

  function isGameOffline() {
    // Bot soll NUR im lokalen/offline Modus laufen – nicht im Online-Duell
    const st = SHN.state;
    if (!st) return false;
    return !st.room; // kein Room = kein Server-Duell
  }

  function chooseRandom(arr) {
    if (!arr || !arr.length) return null;
    const idx = Math.floor(Math.random() * arr.length);
    return arr[idx];
  }

  /**
   * Alle möglichen Bot-Züge für die Gegner-Seite sammeln.
   * Priority:
   *   1. waste → foundation
   *   2. tableau-top → foundation
   *   3. moves auf Tableau (waste→pile, pile→pile)
   *   4. flip / recycle
   */
  function collectMovesForBot() {
    const st = SHN.state;
    const eng = SHN.engine;
    if (!st || !eng) return [];

    const sideKey = BOT_SIDE; // 'opp'
    const owner   = BOT_OWNER; // 'O'
    const side = st[sideKey];
    if (!side) return [];

    const movesFoundation = [];
    const movesTableau    = [];
    const movesStock      = [];

    // 1) waste → foundation
    const waste = side.waste;
    if (waste && waste.length) {
      const card = waste[waste.length - 1];
      st.foundations.forEach((f, idx) => {
        if (eng.canPlaceOnFoundation(f, card)) {
          movesFoundation.push({
            owner,
            kind: 'toFound',
            cardId: card.id,
            count: 1,
            to: { kind: 'found', f: idx }
          });
        }
      });
    }

    // 2) tableau-top → foundation
    for (let p = 0; p < 7; p++) {
      const pile = side.tableau[p];
      if (!pile || !pile.length) continue;
      const top = pile[pile.length - 1];
      if (!top.up) continue;
      st.foundations.forEach((f, idx) => {
        if (eng.canPlaceOnFoundation(f, top)) {
          movesFoundation.push({
            owner,
            kind: 'toFound',
            cardId: top.id,
            count: 1,
            to: { kind: 'found', f: idx }
          });
        }
      });
    }

    // Helper: Tableau-Moves von einer Karte/Sequenz aus
    function addTableauMovesFromCard(card, src) {
      for (let dest = 0; dest < 7; dest++) {
        const destPile = side.tableau[dest];
        const under = destPile[destPile.length - 1];
        if (!eng.canPlaceOnTableau(under, card)) continue;

        if (src.type === 'waste') {
          // Einzelkarte von Waste → Tableau
          movesTableau.push({
            owner,
            kind: 'toPile',
            cardId: card.id,
            count: 1,
            to: { kind: 'pile', sideOwner: owner, uiIndex: dest }
          });
        } else if (src.type === 'pile') {
          const pile = side.tableau[src.pile];
          const canSeq = eng.isFaceUpSequence(sideKey, src.pile, src.idx);
          const count = canSeq ? (pile.length - src.idx) : 1;
          movesTableau.push({
            owner,
            kind: 'toPile',
            cardId: card.id,
            count,
            to: { kind: 'pile', sideOwner: owner, uiIndex: dest }
          });
        }
      }
    }

    // 3a) waste → tableau
    if (waste && waste.length) {
      const card = waste[waste.length - 1];
      if (card.up) {
        addTableauMovesFromCard(card, { type: 'waste' });
      }
    }

    // 3b) tableau → tableau
    for (let p = 0; p < 7; p++) {
      const pile = side.tableau[p];
      if (!pile || !pile.length) continue;

      for (let i = 0; i < pile.length; i++) {
        const card = pile[i];
        if (!card.up) continue;

        addTableauMovesFromCard(card, { type: 'pile', pile: p, idx: i });
      }
    }

    // 4) flip/recycle
    const stock = side.stock;
    if (stock && stock.length) {
      movesStock.push({ owner, kind: 'flip' });
    } else if (!stock.length && waste.length) {
      // Nur recyceln, wenn wirklich möglich – Engine prüft trotzdem nochmal
      movesStock.push({ owner, kind: 'recycle' });
    }

    // Jetzt alles nach Priorität zusammenbauen
    const result = [];
    if (movesFoundation.length) {
      result.push({ priority: 1, moves: movesFoundation });
    }
    if (movesTableau.length) {
      result.push({ priority: 2, moves: movesTableau });
    }
    if (movesStock.length) {
      result.push({ priority: 3, moves: movesStock });
    }

    return result;
  }

  function pickMove(prioritized) {
    if (!prioritized || !prioritized.length) return null;
    // Günstigste Priority wählen
    prioritized.sort((a, b) => a.priority - b.priority);
    const best = prioritized[0];
    if (!best.moves || !best.moves.length) return null;

    // EASY: reiner Random aus bester Kategorie
    return chooseRandom(best.moves);
  }

  function thinkOnce() {
    if (!enabled) return;

    const st = SHN.state;
    const eng = SHN.engine;
    if (!st || !eng) return;
    if (st.over) return;
    if (!isGameOffline()) return; // im Online-Duell NICHT aktiv werden

    // Bot spielt nur, wenn es auf seiner Seite überhaupt Karten gibt
    const side = st[BOT_SIDE];
    if (!side) return;

    const prioritized = collectMovesForBot();
    const move = pickMove(prioritized);
    if (!move) return;

    try {
      // Lokaler Bot → direkt Engine-Apply mit announce=true
      eng.applyMove(move, true);
      // Ein Move pro Tick reicht – der Timer ruft uns regelmäßig wieder auf
    } catch (err) {
      console.error('[BOT] applyMove-Fehler', err);
    }
  }

  function startBotLoop() {
    if (!enabled) return;
    if (thinkTimer) {
      clearTimeout(thinkTimer);
      thinkTimer = null;
    }
    scheduleNextThink();
  }

  // Beim Laden der Seite Bot ggf. aktivieren
  window.addEventListener('DOMContentLoaded', () => {
    initFromUrl();
    if (enabled) {
      console.log('[BOT] einfacher Bot aktiviert (lokal, Gegner-Seite)');
      startBotLoop();
    }
  });

  // Optional: API nach außen
  SHN.bot = {
    isEnabled: () => enabled,
    forceThink: thinkOnce,
    enable: (mode) => {
      if (mode === 'easy' || mode === 'medium' || mode === 'hard') {
        difficulty = mode;
      }
      enabled = true;
      startBotLoop();
    }
  };
})();