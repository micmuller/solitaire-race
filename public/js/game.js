// game.js – main script for Solitaire HighNoon
// Version wird hier gesetzt; scaling.js / UI lesen sie aus
const VERSION = '2.13.6';   // neue Version
window.VERSION = VERSION;

/* ============================================================
   Solitaire HighNoon
   - v2.12.13: End Game Button + Overlay Meldung
   - v2.13.1: Start Modularisierung
   - v2.13.2: Move code cleanup
   - v2.13.3: komplettes Startmenu in eigenem Modul
   - v2.13.4: scaling.js Verbesserungen
   - v2.13.5: GUI-Feinschliff (Abstände Gegner-Tableaus)
   - v2.13.6: Touch-Input ,doubel-tap, Verbesserungen
   ============================================================ */
(function(){
  // NEU: globaler Namespace für unser Spiel

  // ======================================================
  // 1) PLATFORM / TOUCH / MIRROR / LAYOUT
  // ======================================================

  const SHN = window.SHN || (window.SHN = {});


  const IS_TOUCH_DEVICE =
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0) ||
    (navigator.msMaxTouchPoints > 0);

  // iOS Zoom (Double-Tap & Pinch) global unterbinden
  if (IS_TOUCH_DEVICE) {
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;

    // Double-Tap früh abfangen (touchstart), bevor Safari zoomt
    document.addEventListener('touchstart', function (e) {
      // Mehrfinger-Geste (Pinch) direkt blocken
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }

      const t = e.touches[0];
      const now = Date.now();
      const dx = Math.abs(t.clientX - lastTapX);
      const dy = Math.abs(t.clientY - lastTapY);

      // Zweiter Tap kurz danach an fast gleicher Position => Browser-DblTap verhindern
      if (now - lastTapTime <= 350 && dx < 40 && dy < 40) {
        e.preventDefault();
      }

      lastTapTime = now;
      lastTapX = t.clientX;
      lastTapY = t.clientY;
    }, { passive: false });

    // Fallback: auch auf touchend noch einmal absichern
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function (e) {
      // Auf dem Spielbrett selbst nicht in den Double-Tap-Flow eingreifen,
      // damit TouchInput sauber arbeiten kann.
      const target = e.target;
      if (target && target.closest && target.closest('#board')) {
        lastTouchEnd = Date.now();
        return;
      }

      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }, { passive: false });

    // iOS-Pinch-Zoom komplett unterbinden
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(evt => {
      document.addEventListener(evt, function (e) {
        e.preventDefault();
      }, { passive: false });
    });
  }

  // --- URL / Mirror-Flag ---
  const url = new URL(location.href);
  if (!url.searchParams.has('mirror')) {
    url.searchParams.set('mirror', '1');
    history.replaceState({}, '', url);
  }
  const MIRROR_PARAM = url.searchParams.get('mirror');
  let MIRROR_ON = MIRROR_PARAM === '1'; // mutabel für Toggle

  // --- Layout-Konstanten (müssen zu CSS-Variablen passen) ---
  const CARD_H   = 120; // entspricht --card-h
  const STACK_YD = 24;  // entspricht --stack-yd

  let touchInput = null;

  // ======================================================
  // 2) UI-HILFSFUNKTIONEN (Toast, DOM-Shortcuts, Popups)
  // ======================================================

  function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 1800);
  }
  
  
  const el = s => document.querySelector(s);
  
  function showEndPopup(message) {
    const popup = document.getElementById('end-popup');
    if (!popup) return;
    const msgNode = popup.querySelector('.end-popup-message');
    if (msgNode) {
      msgNode.textContent = message || 'Das Spiel wurde beendet.';
    }
    popup.classList.add('show');
  }

  function hideEndPopup() {
    const popup = document.getElementById('end-popup');
    if (!popup) return;
    popup.classList.remove('show');
  }

  const mk = (t, c) => {
    const e = document.createElement(t);
    if (c) e.className = c;
    return e;
  };

  // ======================================================
  // 3) DECK / RNG / KARTEN-UTILS
  // ======================================================

  function canRecycle(side) {
    return state[side].stock.length === 0 && state[side].waste.length > 0;
  }

  // Mirror UI/State
  function updateMirrorUI() {
    const versionText = `v${VERSION}`;

    const ov = document.getElementById('ov-version');
    if (ov) ov.textContent = versionText + (MIRROR_ON ? ' · mirror:on' : ' · mirror:off');

    const badge = document.getElementById('ver');
    if (badge) badge.textContent = versionText;

    document.body.classList.toggle('mirror', !!MIRROR_ON);
  }
  function setMirror(on, { persist = true } = {}) {
    MIRROR_ON = !!on;
    try {
      const u = new URL(location.href);
      u.searchParams.set('mirror', MIRROR_ON ? '1' : '0');
      if (persist) history.replaceState({}, '', u);
    } catch {}
    updateMirrorUI();
  }
  function toggleMirror() {
    setMirror(!MIRROR_ON, { persist: true });
    showToast(MIRROR_ON ? 'Mirror aktiviert' : 'Mirror deaktiviert');
  }

  // RNG / Deck
  function rng(seedStr) {
    function xmur3(str) {
      for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
      }
      return function () {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^ h >>> 16) >>> 0;
      };
    }
    function mulberry32(a) {
      return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const seed = xmur3(seedStr || '')();
    return { random: mulberry32(seed) };
  }

  function generateSeed() {
    // einfacher, aber stabiler Zufalls-Seed
    return Math.random().toString(36).slice(2, 10);
  }

  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

  function newDoubleDeck(tag) {
    const deck = [];
    for (let d = 0; d < 2; d++) {
      for (const s of SUITS) {
        for (let r = 0; r < RANKS.length; r++) {
          deck.push({ suit: s, rank: r, up: false, id: `${tag}-${d}-${s}-${r}` });
        }
      }
    }
    return deck;
  }
  function shuffle(a, r) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function isRed(s) { return s === "♥" || s === "♦"; }
  function cardLabel(c) { return `${RANKS[c.rank]}${c.suit}`; }

  // ======================================================
  // 4) GAME STATE & DEAL
  // ======================================================


  const state = {
    seed: url.searchParams.get('seed') || '',
    room: url.searchParams.get('room') || '',
    you: { stock: [], waste: [], tableau: [[], [], [], [], [], [], []] },
    opp: { stock: [], waste: [], tableau: [[], [], [], [], [], [], []] },
    foundations: Array.from({ length: 8 }, (_, i) => ({ suit: SUITS[i % 4], cards: [] })),
    moves: 0,
    over: false
  };

  // ---------- Owner ----------
  let localOwner = 'Y';
  let hasSetPerspective = false;
  function resetSessionPerspective() {
    // Neue Session / neuer Room: Basis-Perspektive wieder auf 'Y'
    localOwner = 'Y';
    hasSetPerspective = false;
  }
  function ownerToSide(owner) { return owner === localOwner ? 'you' : 'opp'; }
  const PILES = 7;

  // ---------- Deal ----------
  function deal(seedStr) {
    const r = rng(seedStr || '');
    const base = shuffle(newDoubleDeck('B'), r.random);

    const deckYou = [], deckOpp = [];
    for (let i = 0; i < base.length; i++) {
      const c = { ...base[i] };
      if (i % 2 === 0) { c.id = `Y-${i}-${c.suit}-${c.rank}`; deckYou.push(c); }
      else { c.id = `O-${i}-${c.suit}-${c.rank}`; deckOpp.push(c); }
    }

    let i = 0;
    for (let p = 0; p < 7; p++) {
      for (let k = 0; k <= p; k++) {
        const c = deckYou[i++]; c.up = (k === p); state.you.tableau[p].push(c);
      }
    }
    state.you.stock = deckYou.slice(i);

    i = 0;
    for (let p = 0; p < 7; p++) {
      for (let k = 0; k <= p; k++) {
        const c = deckOpp[i++]; c.up = (k === p); state.opp.tableau[p].push(c);
      }
    }
    state.opp.stock = deckOpp.slice(i);
  }

  // ======================================================
  // 5) RENDERING / UI-DARSTELLUNG
  // ======================================================
  function renderAll() {
    const mv = document.getElementById('moves');
    if (mv) mv.textContent = String(state.moves);

    ['you','opp'].forEach(side => {
      el(`#${side}-tableau`)?.replaceChildren();
      el(`#${side}-stock`)?.replaceChildren();
      el(`#${side}-waste`)?.replaceChildren();
    });
    el('#foundations')?.replaceChildren();

    state.foundations.forEach((f,i) => {
      const slot = mk('div','foundation');
      slot.dataset.f = i;
      el('#foundations')?.appendChild(slot);
      f.cards.forEach((c,idx) => {
        const card = renderCard(c);
        card.style.top = `${idx*2}px`;
        slot.appendChild(card);
      });
    });

    renderStack('you');
    renderStack('opp');

    ['you','opp'].forEach(side => {
      const cont = el(`#${side}-tableau`);
      if (!cont) return;
      for (let p = 0; p < PILES; p++) {
        const pileEl = mk('div','pile');
        pileEl.dataset.zone = `${side}-pile-${p}`;
        cont.appendChild(pileEl);
        const pile = state[side].tableau[p];
        pile.forEach((c,idx) => {
          const card = renderCard(c);
          card.style.top = `${idx*STACK_YD}px`;
          pileEl.appendChild(card);
        });
      }
    });

    resizeTableauHeights();
    setupDrops();
    updateOverlay();
  }

  function resizeTableauHeights() {
    ['you','opp'].forEach(side => {
      const cont = document.querySelector(`#${side}-tableau`);
      if (!cont) return;
      cont.querySelectorAll('.pile').forEach((pileEl, uiIdx) => {
        const pile = state[side].tableau[uiIdx] || [];
        const needed = Math.max(CARD_H, CARD_H + Math.max(0, pile.length - 1) * STACK_YD);
        pileEl.style.height = needed + 'px';
      });
    });
  }

  function renderStack(side) {
    const stockEl = el(`#${side}-stock`);
    const wasteEl = el(`#${side}-waste`);
    const s = state[side].stock;

    if (stockEl) {
      if (s.length) {
        const top = s[s.length-1];
        const back = renderCard({ ...top, up:false });
        stockEl.appendChild(back);
      }
    }
    if (wasteEl) {
      state[side].waste.slice(-3).forEach((c,i) => {
        const card = renderCard(c);
        card.style.left = `${i*16}px`;
        wasteEl.appendChild(card);
      });
    }
  }

  function renderCard(c) {
    const e = mk('div', 'card');
    e.dataset.cardId = c.id;

    if (!c.up) {
      // Rückseite wie bisher
      e.classList.add('faceDown');
    } else {
      // Vorderseite: rot/schwarz und Innenlayout
      e.classList.add(isRed(c.suit) ? 'red' : 'black');

      const label = cardLabel(c);      // z.B. "Q♠" oder "10♥"
      const suit = label.slice(-1);    // letztes Zeichen = Suit
      const rank = label.slice(0, -1); // Rest = Rank (inkl. "10")

      e.innerHTML = `
        <div class="card-inner">
          <!-- 4 Ecken -->
          <div class="card-corner tl">
            <span class="card-rank">${rank}</span>
            <span class="card-suit-small">${suit}</span>
          </div>
          <div class="card-corner tr">
            <span class="card-rank">${rank}</span>
            <span class="card-suit-small">${suit}</span>
          </div>
          <div class="card-corner bl">
            <span class="card-rank">${rank}</span>
            <span class="card-suit-small">${suit}</span>
          </div>
          <div class="card-corner br">
            <span class="card-rank">${rank}</span>
            <span class="card-suit-small">${suit}</span>
          </div>

          <!-- große Mitte: Rank + Suit kombiniert -->
          <div class="card-center">${rank}${suit}</div>
        </div>
      `;
    }

    // Maus/PC: HTML5 Drag & Double-Click behalten
    if (!IS_TOUCH_DEVICE) {
      e.draggable = !!c.up;
      e.addEventListener('dragstart', onDragStart);
      e.addEventListener('dragend', onDragEnd);
      e.addEventListener('dblclick', onDoubleClickAutoMove);
    } else {
      // Auf Touch: kein HTML5-Drag, keine dblclick-Handler
      e.draggable = false;
    }

    return e;
  }

  // ======================================================
  // 6) REGELN / ENGINE-HELPER
  // ======================================================
  function canPlaceOnTableau(under, card) {
    if (!under) return card.rank === 12;
    const alt = isRed(under.suit) !== isRed(card.suit);
    return under.rank === card.rank + 1 && alt;
  }
  function canPlaceOnFoundation(f, card) {
    if (f.cards.length === 0) return card.rank === 0;
    const top = f.cards[f.cards.length-1];
    return top && top.suit === card.suit && card.rank === top.rank + 1;
  }
  function locOfCard(id) {
    for (const side of ['you','opp']) {
      const w = state[side].waste.findIndex(c => c.id === id);
      if (w > -1) return { type:'waste', side, idx:w };
      for (let p = 0; p < 7; p++) {
        const idx = state[side].tableau[p].findIndex(c => c.id === id);
        if (idx > -1) return { type:'pile', side, pile:p, idx };
      }
    }
    for (let f = 0; f < state.foundations.length; f++) {
      const idx = state.foundations[f].cards.findIndex(c => c.id === id);
      if (idx > -1) return { type:'found', f, idx };
    }
    return null;
  }
  function isFaceUpSequence(side, pileIndex, startIdx) {
    const pile = state[side].tableau[pileIndex];
    for (let i = startIdx; i < pile.length - 1; i++) {
      const a = pile[i], b = pile[i+1];
      if (!a.up || !b.up) return false;
      if (isRed(a.suit) === isRed(b.suit)) return false;
      if (a.rank !== b.rank + 1) return false;
    }
    return pile[startIdx]?.up === true;
  }

  // ======================================================
  // 9) ENGINE-KERN (MOVES / applyMove / checkWin)
  // ======================================================
  function applyMove(move, announce = true) {
    try {
      // Multiplayer-Schutz:
    // Wenn wir in einem Room sind und keine aktive WS-Verbindung haben,
    // KEINE lokalen Züge mehr erlauben → verhindert Desync.
    if (announce) {
      if (state.over) {
        showToast('Spiel ist beendet');
        return;
      }
      if (state.room && (!ws || ws.readyState !== WebSocket.OPEN)) {
        showToast('Keine Verbindung – Zug verworfen');
        return;
      }
    }
      
      const side = ownerToSide(move.owner);

      if (move.kind === 'flip') {
        const s = state[side].stock;
        if (s.length) {
          const c = s.pop();
          c.up = true;
          state[side].waste.push(c);
        }
        if (announce) state.moves++;
        renderAll();
        if (announce) send(move);
        return;
      }

      if (move.kind === 'recycle') {
        if (state[side].stock.length === 0 && state[side].waste.length > 0) {
          const rev = [...state[side].waste].reverse();
          rev.forEach(c => c.up = false);
          state[side].stock = rev;
          state[side].waste = [];
        } else {
          showToast('Nichts zu recyceln');
        }
        if (announce) state.moves++;
        renderAll();
        if (announce) send(move);
        return;
      }

      const loc = move.cardId ? locOfCard(move.cardId) : null;
      if (!loc) return;
      if (announce && loc.side !== ownerToSide(move.owner)) return;

      if (!announce) console.debug('[NET] move', move);

      let cards = [];
      if (loc.type === 'waste') {
        if (loc.idx !== state[loc.side].waste.length-1) return;
        cards.push(state[loc.side].waste.pop());
      } else if (loc.type === 'pile') {
        const pile = state[loc.side].tableau[loc.pile];
        const count = move.count || 1;
        cards = pile.splice(loc.idx, count);
        if (pile.length > 0) pile[pile.length-1].up = true;
      } else if (loc.type === 'found') {
        if (loc.idx !== state.foundations[loc.f].cards.length-1) return;
        cards.push(state.foundations[loc.f].cards.pop());
      }
      if (!cards.length) return;

      if (move.to && move.to.kind === 'found') {
        state.foundations[move.to.f].cards.push(cards[0]);
      } else if (move.to && move.to.kind === 'pile') {
        const ownerRef = move.to.sideOwner || move.owner;
        const targetSide = ownerToSide(ownerRef);
        const uiIndex =
          (move.to.uiIndex != null)
            ? move.to.uiIndex
            : (move.to.pile != null ? move.to.pile : 0);
        state[targetSide].tableau[uiIndex].push(...cards);
      }

      if (announce) state.moves++;
      renderAll();
      if (announce) send(move);
      checkWin();
    } catch (err) {
      console.error('applyMove error', err);
      showToast('Move-Fehler: ' + (err?.message || String(err)));
    }
  }

function checkWin() {
    const total = state.foundations.reduce((a, f) => a + f.cards.length, 0);
    if (total === 208) {
      state.over = true;
      showToast('Alle Karten abgetragen!');
      showEndPopup('Alle Karten abgetragen!');  // zentrales Pop-up
      updateOverlay();
    }
}

  // ======================================================
  // 7) INPUT (TOUCH & MOUSE)
  // ======================================================
  // --- Touch / Pointer Handling ---
  const TOUCH_DRAG_CLASS = 'dragging';

  const touchDragState = {
    active: false,
    cards: [],
    originLoc: null,
    startClient: null,
    currentClient: null
  };

  function getClientPointFromEvent(ev) {
    if (!ev) return null;
    if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
      return { x: ev.clientX, y: ev.clientY };
    }
    if (ev.changedTouches && ev.changedTouches.length) {
      const t = ev.changedTouches[0];
      return { x: t.clientX, y: t.clientY };
    }
    if (ev.touches && ev.touches.length) {
      const t = ev.touches[0];
      return { x: t.clientX, y: t.clientY };
    }
    return null;
  }

  function elementFromClientPoint(pt) {
    if (!pt) return null;
    if (document.elementsFromPoint) {
      const list = document.elementsFromPoint(pt.x, pt.y);
      const cardEl = list.find(el => el.classList && el.classList.contains('card'));
      if (cardEl) return cardEl;
      const slot = list.find(el => el.classList && (el.classList.contains('foundation') || el.classList.contains('pile') || el.classList.contains('stack')));
      if (slot) return slot;
      return list[0] || null;
    }
    return document.elementFromPoint(pt.x, pt.y);
  }

  function findCardAtPoint(pt) {
    const base = elementFromClientPoint(pt);
    if (!base) return null;
    const cardEl = base.classList && base.classList.contains('card')
      ? base
      : (base.closest ? base.closest('.card') : null);
    if (!cardEl) return null;
    const id = cardEl.dataset.cardId;
    if (!id) return null;
    const loc = locOfCard(id);
    if (!loc) return null;
    return { cardEl, cardId:id, loc };
  }

  function findDropTargetAtPoint(pt) {
    const base = elementFromClientPoint(pt);
    if (!base) return null;

    if (base.classList.contains('foundation')) {
      const idx = Number(base.dataset.f);
      return { type:'foundation', index:idx, el:base };
    }

    const pileEl = base.dataset && base.dataset.zone ? base : (base.closest ? base.closest('[data-zone]') : null);
    if (pileEl && pileEl.dataset.zone) {
      return { type:'pile', zone:pileEl.dataset.zone, el:pileEl };
    }
    return null;
  }

  // --- Touch-Auswahl (Tap → Tap Moves) ---
  let touchSelection = null;

  function clearTouchSelection() {
    if (!touchSelection) return;
    const ids = touchSelection.cardIds || [touchSelection.cardId];
    ids.forEach(id => {
      const el = document.querySelector(`.card[data-card-id="${id}"]`);
      if (el) el.classList.remove('selected');
    });
    touchSelection = null;
  }

  function selectCardsForTouch(loc) {
    const side = loc.side;
    let cards = [];

    if (loc.type === 'waste') {
      const w = state[side].waste;
      if (loc.idx !== w.length - 1) return; // nur oberste Karte
      cards = [w[loc.idx]];
    } else if (loc.type === 'pile') {
      const pile = state[side].tableau[loc.pile];
      if (!pile[loc.idx] || !pile[loc.idx].up) return;
      if (isFaceUpSequence(side, loc.pile, loc.idx)) {
        cards = pile.slice(loc.idx); // komplette Sequenz
      } else {
        cards = [pile[loc.idx]];
      }
    } else {
      return;
    }

    clearTouchSelection();
    const ids = cards.map(c => c.id);
    ids.forEach(id => {
      const el = document.querySelector(`.card[data-card-id="${id}"]`);
      if (el) el.classList.add('selected');
    });
    touchSelection = { loc, cardId: cards[0].id, cardIds: ids };
  }

  function setupTouchControls(boardEl) {
    if (!IS_TOUCH_DEVICE) return;
    if (!window.TouchInput || !boardEl) return;
    if (touchInput) return;

    touchInput = new TouchInput(boardEl, {
      dragThreshold: 10,
      doubleTapDelay: 300,
      onTap: handleTouchTap,
      onDoubleTap: handleTouchDoubleTap,
      onDragStart: handleTouchDragStart,
      onDragMove: handleTouchDragMove,
      onDragEnd: handleTouchDragEnd
    });
  }

  function handleTouchTap(pos, ev) {
    const pt = getClientPointFromEvent(ev);
    if (!pt) return;

    const targetEl = elementFromClientPoint(pt);
    if (!targetEl) {
      clearTouchSelection();
      return;
    }

    const mySide = ownerToSide(localOwner);
    const myStock = document.getElementById(`${mySide}-stock`);
    const myWaste = document.getElementById(`${mySide}-waste`);

    // --- 1) Stock: Flip oder Recycle ---
    if (myStock && (targetEl === myStock || (targetEl.closest && targetEl.closest('#' + myStock.id)))) {
      const side = mySide;
      const s = state[side].stock;
      if (s.length) {
        applyMove({ owner: localOwner, kind:'flip' }, true);
      } else if (canRecycle(side)) {
        applyMove({ owner: localOwner, kind:'recycle' }, true);
      }
      clearTouchSelection();
      return;
    }

    // --- 2) Waste: ggf. Auto-Move zur Foundation oder als Auswahl ---
    if (myWaste && (targetEl === myWaste || (targetEl.closest && targetEl.closest('#' + myWaste.id)))) {
      const side = mySide;
      const w = state[side].waste;
      if (!w.length) { clearTouchSelection(); return; }
      const card = w[w.length - 1];

      // Auto-Move zur Foundation, falls möglich
      const t = state.foundations.findIndex(f => canPlaceOnFoundation(f, card));
      if (t > -1) {
        applyMove({
          owner: localOwner,
          kind:'toFound',
          cardId: card.id,
          count: 1,
          to: { kind:'found', f:t }
        }, true);
        clearTouchSelection();
      } else {
        const loc = locOfCard(card.id);
        if (loc && isMine(loc)) selectCardsForTouch(loc);
      }
      return;
    }

    // --- 3) Allgemein: Karten & Piles ---
    const tappedCard = findCardAtPoint(pt);
    const dropTarget = findDropTargetAtPoint(pt);

    // 3a) Wenn bereits etwas ausgewählt ist → Move versuchen
    if (touchSelection && dropTarget) {
      const selLoc = locOfCard(touchSelection.cardId);
      if (!selLoc || !isMine(selLoc)) { clearTouchSelection(); return; }

      const selSide = selLoc.side;
      let cards = [];

      if (selLoc.type === 'waste') {
        const w = state[selSide].waste;
        if (selLoc.idx !== w.length - 1) { clearTouchSelection(); return; }
        cards = [w[selLoc.idx]];
      } else if (selLoc.type === 'pile') {
        const pile = state[selSide].tableau[selLoc.pile];
        if (!pile[selLoc.idx] || !pile[selLoc.idx].up) { clearTouchSelection(); return; }
        cards = isFaceUpSequence(selSide, selLoc.pile, selLoc.idx)
          ? pile.slice(selLoc.idx)
          : [pile[selLoc.idx]];
      }

      if (!cards.length) { clearTouchSelection(); return; }

      // → Ziel: Foundation
      if (dropTarget.type === 'foundation') {
        const card = cards[0];
        const f = state.foundations[dropTarget.index];
        if (canPlaceOnFoundation(f, card)) {
          applyMove({
            owner: localOwner,
            kind:'toFound',
            cardId: card.id,
            count: 1,
            to: { kind:'found', f: dropTarget.index }
          }, true);
          clearTouchSelection();
          return;
        }
      }
      // → Ziel: Tableau-Pile
      else if (dropTarget.type === 'pile') {
        const z = dropTarget.zone;        // z.B. "you-pile-3"
        const parts = z.split('-');       // ["you","pile","3"]
        const sideKey = parts[0];
        const pileIdx = Number(parts[2] || 0);
        const mySide2 = ownerToSide(localOwner);

        if (sideKey === mySide2) {
          const destPile = state[mySide2].tableau[pileIdx];
          const under = destPile[destPile.length - 1];
          const srcTop = cards[0];

          if (srcTop.up && canPlaceOnTableau(under, srcTop)) {
            const count = cards.length;
            applyMove({
              owner: localOwner,
              kind:'toPile',
              cardId: srcTop.id,
              count,
              from: { kind:'pile', sideOwner: localOwner, uiIndex:(selLoc.type==='pile'?selLoc.pile:-1) },
              to:   { kind:'pile', sideOwner: localOwner, uiIndex:pileIdx }
            }, true);
            clearTouchSelection();
            return;
          }
        }
      }
    }

    // 3b) Keine (oder erfolglose) Auswahl → neue Auswahl setzen oder löschen
    if (tappedCard && tappedCard.loc && isMine(tappedCard.loc)) {
      selectCardsForTouch(tappedCard.loc);
    } else {
      clearTouchSelection();
    }
  }

  function autoMoveCardToFoundation(cardId, loc) {
    if (!loc || !isMine(loc)) return;

    let card;
    if (loc.type === 'pile') {
      const pile = state[loc.side].tableau[loc.pile];
      if (loc.idx !== pile.length - 1) return;
      card = pile[loc.idx];
    } else if (loc.type === 'waste') {
      if (loc.idx !== state[loc.side].waste.length - 1) return;
      card = state[loc.side].waste[loc.idx];
    } else {
      return;
    }

    if (!card || !card.up) return;

    const t = state.foundations.findIndex(f => canPlaceOnFoundation(f, card));
    if (t > -1) {
      applyMove({
        owner: localOwner,
        kind: 'toFound',
        cardId,
        count: 1,
        to: { kind: 'found', f: t }
      }, true);
    }
  }

  function onDoubleClickAutoMove(e) {
    const id = e.currentTarget.dataset.cardId;
    const loc = locOfCard(id);
    autoMoveCardToFoundation(id, loc);
  }

  function handleTouchDoubleTap(pos, ev) {
    try {
      const pt = getClientPointFromEvent(ev);
      if (!pt) return;

      const found = findCardAtPoint(pt);
      if (!found || !found.cardEl) {
        clearTouchSelection();
        return;
      }

      const cardEl = found.cardEl;
      const cardId = cardEl.dataset.cardId;
      if (!cardId) {
        clearTouchSelection();
        return;
      }

      const loc = locOfCard(cardId);
      if (!loc || !isMine(loc)) {
        clearTouchSelection();
        return;
      }

      // vorhandene Auswahl ist nach erfolgreichem Auto-Move hinfällig
      clearTouchSelection();
      autoMoveCardToFoundation(cardId, loc);
    } catch (err) {
      console.error('handleTouchDoubleTap error', err);
      showToast('Doppeltap-Fehler');
    }
  }

  function isMine(loc) {
    return loc && loc.side === ownerToSide(localOwner);
  }

  function handleTouchDragStart(pos, ev) {
    const pt = getClientPointFromEvent(ev);
    if (!pt) return;
    const found = findCardAtPoint(pt);
    if (!found) return;
    const { cardEl, cardId, loc } = found;
    if (!isMine(loc)) return;

    const side = loc.side;
    let cardObjs = [];
    if (loc.type === 'waste') {
      if (loc.idx !== state[side].waste.length-1) return;
      cardObjs = [ state[side].waste[loc.idx] ];
    } else if (loc.type === 'pile') {
      const pile = state[side].tableau[loc.pile];
      if (!pile[loc.idx] || !pile[loc.idx].up) return;
      const canSeq = isFaceUpSequence(loc.side, loc.pile, loc.idx);
      cardObjs = canSeq ? pile.slice(loc.idx) : [ pile[loc.idx] ];
    } else {
      return;
    }

    const cardEls = [];
    for (const c of cardObjs) {
      const sel = document.querySelector(`.card[data-card-id="${c.id}"]`);
      if (sel) cardEls.push(sel);
    }
    if (!cardEls.length) return;

    touchDragState.active = true;
    touchDragState.cards = cardEls;
    touchDragState.originLoc = loc;
    touchDragState.startClient = pt;
    touchDragState.currentClient = pt;

    cardEls.forEach(el => {
      el.classList.add(TOUCH_DRAG_CLASS);
      el.style.willChange = 'transform';
    });
  }

  function handleTouchDragMove(pos, ev) {
    if (!touchDragState.active) return;
    const pt = getClientPointFromEvent(ev);
    if (!pt) return;
    touchDragState.currentClient = pt;

    const dx = pt.x - touchDragState.startClient.x;
    const dy = pt.y - touchDragState.startClient.y;

    touchDragState.cards.forEach(el => {
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    });
  }

  function handleTouchDragEnd(pos, ev) {
    if (!touchDragState.active) return;
    const pt = getClientPointFromEvent(ev) || touchDragState.currentClient;
    const { cards } = touchDragState;

    let moveApplied = false;

    if (pt) {
      const target = findDropTargetAtPoint(pt);
      if (target) {
        if (target.type === 'foundation') {
          const cardId = cards.length ? cards[0].dataset.cardId : null;
          const loc = cardId ? locOfCard(cardId) : null;
          if (cardId && loc && isMine(loc)) {
            const card =
              loc.type === 'waste'
                ? state[loc.side].waste[loc.idx]
                : (loc.type === 'pile'
                    ? state[loc.side].tableau[loc.pile][loc.idx]
                    : null);
            const f = state.foundations[target.index];
            if (card && f && canPlaceOnFoundation(f, card)) {
              applyMove({
                owner: localOwner,
                kind: 'toFound',
                cardId,
                count: 1,
                to: { kind:'found', f: target.index }
              }, true);
              moveApplied = true;
            }
          }
        } else if (target.type === 'pile') {
          const z = target.zone;      // z.B. "you-pile-3"
          const parts = z.split('-'); // ["you","pile","3"]
          const sideKey = parts[0];
          const pileIdx = Number(parts[2] || 0);

          const mySide = ownerToSide(localOwner);
          if (sideKey === mySide) {
            const cardId = cards.length ? cards[0].dataset.cardId : null;
            const loc = cardId ? locOfCard(cardId) : null;
            if (cardId && loc && isMine(loc)) {
              const destPile = state[mySide].tableau[pileIdx];
              const under = destPile[destPile.length-1];
              const srcTop =
                loc.type === 'waste'
                  ? state[loc.side].waste[loc.idx]
                  : state[loc.side].tableau[loc.pile][loc.idx];

              if (srcTop && srcTop.up && canPlaceOnTableau(under, srcTop)) {
                const count =
                  (loc.type === 'pile' && isFaceUpSequence(loc.side, loc.pile, loc.idx))
                    ? state[loc.side].tableau[loc.pile].length - loc.idx
                    : 1;

                applyMove({
                  owner: localOwner,
                  kind:'toPile',
                  cardId,
                  count,
                  from: { kind:'pile', sideOwner: localOwner, uiIndex:(loc.type==='pile'?loc.pile:-1) },
                  to:   { kind:'pile', sideOwner: localOwner, uiIndex:pileIdx }
                }, true);
                moveApplied = true;
              }
            }
          }
        }
      }
    }

    cards.forEach(el => {
      el.classList.remove(TOUCH_DRAG_CLASS);
      el.style.transform = '';
      el.style.willChange = '';
    });

    touchDragState.active = false;
    touchDragState.cards = [];
    touchDragState.originLoc = null;
    touchDragState.startClient = null;
    touchDragState.currentClient = null;

    if (!moveApplied) {
      renderAll();
    }
  }

  // --- Maus / Desktop-Drag & Drop ---
  let drag = { origin:null, count:1 };

  function onDragStart(e) {
    const id = e.target.dataset.cardId;
    const loc = locOfCard(id);
    drag.origin = null;
    drag.count = 1;

    if (!loc || !isMine(loc)) {
      e.preventDefault();
      return;
    }
    drag.origin = loc;
    e.dataTransfer.setData('text/plain', id);
    e.target.classList.add('dragging');

    if (loc.type === 'pile') {
      const pile = state[loc.side].tableau[loc.pile];
      if (isFaceUpSequence(loc.side, loc.pile, loc.idx)) {
        drag.count = pile.length - loc.idx;
      }
    }
  }

  function onDragEnd(e) {
    e.target.classList.remove('dragging');
  }



  function setupDrops() {
    document.querySelectorAll('.foundation').forEach(slot => {
      if (!IS_TOUCH_DEVICE) {
        slot.addEventListener('dragover', ev => ev.preventDefault());
        slot.addEventListener('drop', ev => {
          ev.preventDefault();
          const id = ev.dataTransfer.getData('text/plain');
          const loc = locOfCard(id);
          if (!loc || !isMine(loc)) return;

          const fIdx = Number(slot.dataset.f);
          const f = state.foundations[fIdx];
          const card =
            loc.type === 'waste' ? state[loc.side].waste[loc.idx]
          : loc.type === 'pile'  ? state[loc.side].tableau[loc.pile][loc.idx]
          : loc.type === 'found' ? state.foundations[loc.f].cards[loc.idx]
          : null;

          if (card && canPlaceOnFoundation(f, card)) {
            applyMove({
              owner: localOwner,
              kind:'toFound',
              cardId:id,
              count:1,
              to:{ kind:'found', f:fIdx }
            }, true);
          }
        });
      }
    });

    const mySide = ownerToSide(localOwner);
    const myStock = el(`#${mySide}-stock`);
    const myWaste = el(`#${mySide}-waste`);

    for (let ui = 0; ui < 7; ui++) {
      const pileEl = document.querySelector(`[data-zone="${mySide}-pile-${ui}"]`);
      if (!pileEl) continue;

      if (!IS_TOUCH_DEVICE) {
        pileEl.addEventListener('dragover', ev => ev.preventDefault());
        pileEl.addEventListener('drop', ev => {
          ev.preventDefault();
          const id = ev.dataTransfer.getData('text/plain');
          const loc = locOfCard(id);
          if (!loc || !isMine(loc)) return;

          const destPile = state[mySide].tableau[ui];
          const under = destPile[destPile.length-1];

          const srcTop =
            loc.type === 'waste'
              ? state[loc.side].waste[loc.idx]
              : state[loc.side].tableau[loc.pile][loc.idx];

          if (!srcTop?.up) return;
          if (!canPlaceOnTableau(under, srcTop)) return;

          const count =
            (loc.type === 'pile' && isFaceUpSequence(loc.side, loc.pile, loc.idx))
              ? state[loc.side].tableau[loc.pile].length - loc.idx
              : 1;

          applyMove({
            owner: localOwner,
            kind:'toPile',
            cardId:id,
            count,
            from:{ kind:'pile', sideOwner: localOwner, uiIndex:(loc.type==='pile'?loc.pile:-1) },
            to:{   kind:'pile', sideOwner: localOwner, uiIndex: ui }
          }, true);
        });
      }
    }

    // Click-/Keyboard-Shortcuts nur auf Nicht-Touch
    if (!IS_TOUCH_DEVICE) {
      if (myStock) {
        myStock.onclick = () => {
          const side = ownerToSide(localOwner);
          const s = state[side].stock;
          if (s.length) applyMove({ owner:localOwner, kind:'flip' }, true);
        };
        myStock.ondblclick = () => {
          const side = ownerToSide(localOwner);
          if (canRecycle(side)) {
            applyMove({ owner:localOwner, kind:'recycle' }, true);
          }
        };
      }
      if (myWaste) {
        myWaste.ondblclick = () => {
          const side = ownerToSide(localOwner);
          if (canRecycle(side)) {
            applyMove({ owner:localOwner, kind:'recycle' }, true);
          }
        };
      }

      document.onkeydown = (ev) => {
        if (state.over) return;
        const side = ownerToSide(localOwner);
        if (ev.key === ' ') {
          ev.preventDefault();
          const s = state[side].stock;
          if (s.length) applyMove({ owner:localOwner, kind:'flip' }, true);
        } else if (ev.key === 'r' || ev.key === 'R') {
          if (canRecycle(side)) applyMove({ owner:localOwner, kind:'recycle' }, true);
        } else if (ev.key === 'f' || ev.key === 'F') {
          const w = state[side].waste;
          if (!w.length) return;
          const card = w[w.length-1];
          const t = state.foundations.findIndex(f => canPlaceOnFoundation(f, card));
          if (t > -1) {
            applyMove({ owner:localOwner, kind:'toFound', cardId:card.id, count:1, to:{ kind:'found', f:t } }, true);
          }
        }
      };
    }
  }

  // ======================================================
  // 8) ANIMATION (GEGNER-GHOST-MOVE)
  // ======================================================
  function spawnGhostMove(cardId, fromRect) {
    try {
      const board = document.getElementById('board');
      if (!board || !fromRect) return;

      const boardRect = board.getBoundingClientRect();

      // Start relativ zum Board
      const startX = fromRect.left - boardRect.left;
      const startY = fromRect.top - boardRect.top;

      // Zielkarte nach applyMove/renderAll
      const target = document.querySelector(`.card[data-card-id="${cardId}"]`);
      if (!target) return;
      const tRect = target.getBoundingClientRect();
      const endX = tRect.left - boardRect.left;
      const endY = tRect.top - boardRect.top;

      // Zeitparameter
      const duration = 800;   // 0.8s Flug
      const pause    = 200;   // kurze Pause am Ziel
      const fadeOut  = 250;   // 0.25s ausblenden

      // Ghost-Karte erzeugen
      const ghost = target.cloneNode(true);
      ghost.classList.add('card-ghost');
      ghost.style.position = 'absolute';

      // Wir animieren jetzt *top/left*, NICHT transform
      ghost.style.left = startX + 'px';
      ghost.style.top  = startY + 'px';

      ghost.style.transition =
        `top ${duration}ms ease-out, left ${duration}ms ease-out, opacity ${fadeOut}ms ease-out`;
      ghost.style.pointerEvents = 'none';
      ghost.style.opacity = '1';

      board.appendChild(ghost);

      // Animation: von Start → Ziel
      requestAnimationFrame(() => {
        ghost.style.left = endX + 'px';
        ghost.style.top  = endY + 'px';

        // kleine Pause am Ziel, dann ausblenden & entfernen
        setTimeout(() => {
          ghost.style.opacity = '0';
          setTimeout(() => {
            if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          }, fadeOut);
        }, duration + pause);
      });

      // Zielkarte etwas länger highlighten
      target.classList.add('selected');
      setTimeout(
        () => target.classList.remove('selected'),
        duration + pause + fadeOut
      );
    } catch (e) {
      console.warn('ghost move error', e);
    }
  }


  // ======================================================
  // 10) NETZWERK / WEBSOCKET-SYNC
  // ======================================================
  const peers = new Map();
  let clientId = Math.random().toString(36).slice(2);
  let ws = null, pingTimer = null, lastMsgAt = 0, latencyMs = null;

    // Debug: zuletzt genutzte WS-URL & Fehlertext
  let lastWsUrl = '';
  let lastWsError = '';

  // NEU: Timeout & Retry-Zähler
  let connectRetryTimer = null;
  let connectAttempts = 0;

  function setText(id, txt) {
    const n = document.getElementById(id);
    if (n) n.textContent = txt;
  }

  function updateOverlay() {
    const online     = ws && ws.readyState === 1;
    const connecting = ws && ws.readyState === 0;
    const dot = document.getElementById('dot');
    const ovSync = document.getElementById('ov-sync');

    if (dot) {
      dot.classList.toggle('ok', !!online);
    }

    if (ovSync) {
      if (state.over) {
        ovSync.textContent = 'beendet';
      } else {
        const attemptSuffix = connecting && connectAttempts > 1
          ? ` (${connectAttempts})`
          : '';
        ovSync.textContent = online
          ? 'online'
          : (connecting ? `verbinden…${attemptSuffix}` : 'offline');
      }
    }

    setText('ov-room', state.room || '—');
    setText('ov-seed', state.seed || '—');
    setText('ov-peers', String(peers.size));
    setText('ov-latency', latencyMs != null ? `${Math.max(0,Math.round(latencyMs))} ms` : '—');
    setText('ov-last', lastMsgAt > 0 ? (Math.floor((Date.now()-lastMsgAt)/1000)||0)+'s ago' : '—');
    
    // Debug-Info
    setText('ov-ws-url', lastWsUrl || '—');
    setText('ov-ws-err', lastWsError || '—');
  }

  setInterval(() => {
    const now = Date.now();
    for (const [id, ts] of peers) {
      if (now - ts > 15000) peers.delete(id);
    }
    updateOverlay();
  }, 1000);

  function clearConnectRetryTimer() {
    if (connectRetryTimer) {
      clearTimeout(connectRetryTimer);
      connectRetryTimer = null;
    }
  }

  function sendSys(o) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ sys:o, from:clientId }));
  }
  function send(m) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ move:m, from:clientId }));
  }

  function buildWsUrl() {
    // 1) Vollständige Override-URL via ?ws=...
    const override = url.searchParams.get('ws');
    if (override) return override;

    const isHttps = location.protocol === 'https:';
    const proto = isHttps ? 'wss:' : 'ws:';

    // location.host enthält hostname + port (z.B. "192.168.0.14:3001")
    let hostPort = location.host || '';

    // Optional: Port per ?ws_port= überschreiben
    const wsPortOverride = url.searchParams.get('ws_port');
    if (wsPortOverride && hostPort) {
      const hostOnly = hostPort.split(':')[0];     // alles vor dem :
      hostPort = `${hostOnly}:${wsPortOverride}`;  // z.B. 192.168.0.14:4000
    }

    // Falls aus irgendeinem Grund hostPort leer ist (exotischer iOS/PWA-Fall)
    if (!hostPort) {
      console.warn('[WS] location.host leer, fallback auf ws://localhost:3001');
      hostPort = 'localhost:3001';
    }

    const room = encodeURIComponent(state.room.trim());
    const wsUrl = `${proto}//${hostPort}/ws?room=${room}`;

    // Debug: merken + Overlay updaten
    lastWsUrl = wsUrl;
    updateOverlay();
    console.log('[WS] connecting to', wsUrl);

    return wsUrl;
  }

  function connectWS() {
  const room = state.room.trim();
  if (!room) {
    showToast('Room-ID fehlt');
    return;
  }

  const maxAttempts = 4;       // weniger Versuche
  const timeoutMs   = 2000;    // kürzeres Timeout

  // alten Retry-Timer stoppen
  if (connectRetryTimer) {
    clearTimeout(connectRetryTimer);
    connectRetryTimer = null;
  }

  // alte Verbindung IMMER hart schließen
  if (ws) {
    try { ws.close(); } catch {}
  }
  ws = null;

  // Grundzustand
  peers.clear();
  latencyMs = null;
  lastMsgAt = 0;

  // neuer Versuch
  connectAttempts++;
  console.log('[WS] Versuch', connectAttempts, 'von', maxAttempts);

  if (connectAttempts > maxAttempts) {
    showToast('Verbindung gescheitert');
    updateOverlay();
    return;
  }

  const wsUrl = buildWsUrl();
  ws = new WebSocket(wsUrl);

  updateOverlay();

  // Timeout: ALLES außer OPEN (1) ist ein Fehlschlag
  connectRetryTimer = setTimeout(() => {
    if (!ws) return;

    if (ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Timeout / kein OPEN, retry… state =', ws.readyState);

      try { ws.close(); } catch {}
      ws = null;

      peers.clear();
      latencyMs = null;
      lastMsgAt = 0;
      updateOverlay();

      // nächster Versuch
      connectWS();
    }
  }, timeoutMs);

  ws.onopen = () => {
    console.log('[WS] OPEN');
    if (connectRetryTimer) {
      clearTimeout(connectRetryTimer);
      connectRetryTimer = null;
    }

    // erfolgreicher Connect → Counter zurücksetzen
    connectAttempts = 0;

    showToast('Verbunden');
    sendSys({ type:'hello' });
    updateOverlay();

    pingTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        const ts = Date.now();
        sendSys({ type:'ping', ts });
      }
    }, 5000);
  };

  ws.onerror = (err) => {
    console.error('WS error', err);
    lastWsError = (err && err.message) ? err.message : 'WS error';
    updateOverlay();
    // der Timeout kümmert sich um Retry oder Abbruch
  };

  ws.onmessage = (ev) => {
    lastMsgAt = Date.now();

    try {
      const msg = JSON.parse(ev.data);

      if (msg.from) {
        peers.set(msg.from, Date.now());
      }

      // ------ SYS ------
            if (msg.sys) {

        // Eigene hello/hello-ack ignorieren
        if (msg.from === clientId &&
            (msg.sys.type === 'hello' || msg.sys.type === 'hello-ack')) {
          updateOverlay();
          return;
        }

        if (msg.sys.type === 'hello') {
          if (!hasSetPerspective) {
            const iAmY = clientId.localeCompare(msg.from) < 0;
            const desired = iAmY ? 'Y' : 'O';
            if (localOwner !== desired) {
              localOwner = desired;
              [state.you, state.opp] = [state.opp, state.you];
              renderAll();
              showToast('Perspektive: ' + localOwner);
            }
            hasSetPerspective = true;
          }
          sendSys({ type:'hello-ack', from: clientId });
        }
        else if (msg.sys.type === 'hello-ack') {
          if (!hasSetPerspective) {
            const iAmY = clientId.localeCompare(msg.from) < 0;
            const desired = iAmY ? 'Y' : 'O';
            if (localOwner !== desired) {
              localOwner = desired;
              [state.you, state.opp] = [state.opp, state.you];
              renderAll();
              showToast('Perspektive: ' + localOwner);
            }
            hasSetPerspective = true;
          }
        }
        else if (msg.sys.type === 'ping' && typeof msg.sys.ts === 'number') {
          sendSys({ type:'pong', ts: msg.sys.ts });
        }
        else if (msg.sys.type === 'pong' && typeof msg.sys.ts === 'number') {
          latencyMs = Date.now() - msg.sys.ts;
        }
        // ⬇️ NEU: synchroner Restart
        else if (msg.sys.type === 'reset' && typeof msg.sys.seed === 'string') {
          state.seed = msg.sys.seed;
          const seedIn = document.getElementById('seed');
          if (seedIn) seedIn.value = state.seed;

          // URL aktualisieren, damit Reload denselben Seed hat
          try {
            url.searchParams.set('seed', state.seed);
            history.replaceState({}, '', url);
          } catch {}

          showToast('Neues Spiel gestartet');
          state.over = false;
          newGame();
        }
        // ⬇️ NEU: gemeinsames Beenden
        else if (msg.sys.type === 'quit') {
          state.over = true;
          showToast('Gegner hat das Spiel beendet');
          showEndPopup('Der Gegner hat das Spiel beendet');
        }


        updateOverlay();
        return;
      }

      // ------ MOVES ------
      if (msg.move) {
        const isRemote = msg.from && msg.from !== clientId;
        let fromRect = null;

        if (isRemote &&
            msg.move.cardId &&
            msg.move.kind !== 'flip' &&
            msg.move.kind !== 'recycle') {

          const board = document.getElementById('board');
          const cardEl = document.querySelector(`.card[data-card-id="${msg.move.cardId}"]`);
          if (board && cardEl) {
            fromRect = cardEl.getBoundingClientRect();
          }
        }

        applyMove(msg.move, false);

        if (isRemote && fromRect) {
          spawnGhostMove(msg.move.cardId, fromRect);
        }
      }

      updateOverlay();

    } catch (e) {
      console.error('WS parse error', e);
    }
  };
}

  // ======================================================
  // 11) BOOTSTRAP / DOMContentLoaded
  // ======================================================
function newGame() {
    state.you = { stock:[], waste:[], tableau:[[],[],[],[],[],[],[]] };
    state.opp = { stock:[], waste:[], tableau:[[],[],[],[],[],[],[]] };
    state.foundations = Array.from({length:8},(_,i)=>({suit:SUITS[i%4],cards:[]}));
    state.moves = 0;
    state.over = false;
    hideEndPopup();              // ggf. altes „Beendet“-Pop-up schließen

    deal(state.seed || '');

    // WICHTIG: Perspektive behalten.
    // Wenn dieser Client laut Handshake der „O“-Spieler ist,
    // müssen wir die Decks wieder tauschen.
    if (localOwner === 'O') {
      [state.you, state.opp] = [state.opp, state.you];
    }

    renderAll();
}

  window.addEventListener('DOMContentLoaded', () => {
    const seedIn = el('#seed');
    const roomIn = el('#room');

    if (seedIn) seedIn.value = state.seed;
    if (roomIn) roomIn.value = state.room;

        el('#newGame')?.addEventListener('click', () => {
      let seedVal = (seedIn?.value || '').trim();
      if (!seedVal) {
        seedVal = generateSeed();
        if (seedIn) seedIn.value = seedVal;
      }

      state.seed = seedVal;

      try {
        url.searchParams.set('seed', state.seed);
        history.replaceState({}, '', url);
      } catch {}

      state.over = false;
      newGame();

      const endBtn = el('#endGame');
      if (endBtn) {
        endBtn.addEventListener('click', () => {
          if (state.over) return;

          state.over = true;
          showToast('Spiel beendet');
          showEndPopup('Du hast das Spiel beendet');
          updateOverlay();

          // Wenn im Room & verbunden → dem Gegner Bescheid sagen
          if (state.room && ws && ws.readyState === WebSocket.OPEN) {
            sendSys({ type:'quit' });
          }

          updateOverlay();
        });
      }

      // Wenn wir im Room und verbunden sind → Reset an alle senden
      if (state.room && ws && ws.readyState === WebSocket.OPEN) {
        sendSys({ type:'reset', seed: state.seed });
      }
    });

    el('#connect')?.addEventListener('click', () => {
      // iOS / PWA Bug: Input-Werte müssen erst geforced werden:
      const roomValue = roomIn.value.trim();
      const seedValue = seedIn.value.trim();

      if (!roomValue) {
        showToast("Room-ID fehlt");
        return;
      }

      state.room = roomValue;
      state.seed = seedValue;

      url.searchParams.set('room', state.room);
      url.searchParams.set('seed', state.seed);
      history.replaceState({}, '', url);

      resetSessionPerspective();
      setMirror(true, { persist: true });

      // WICHTIG: WS vorher killen
      if (ws) { try { ws.close(); } catch {} }
      ws = null;

      connectAttempts = 0;

      // iOS-PWA braucht kurzen Delay, damit state.room sicher übernommen wird:
      setTimeout(() => {
        console.log("CONNECT pressed → room =", state.room);
        connectWS();
      }, 50);
    });

    const mirrorBtn = document.getElementById('toggleMirror');
    if (mirrorBtn) mirrorBtn.addEventListener('click', toggleMirror);

    const endPopupClose = document.getElementById('end-popup-close');
    if (endPopupClose) {
      endPopupClose.addEventListener('click', hideEndPopup);
    }

    document.title = `Solitaire HighNoon — v${VERSION}`;

    // Header + Overlay aktualisieren
    updateMirrorUI();

    newGame();

    const boardEl = document.getElementById('board');
    if (IS_TOUCH_DEVICE) {
      setupTouchControls(boardEl);
    }
  });

  // ======================================================
  // 12) SHN-MODULE / ÖFFENTLICHE API
  // ======================================================
    // ----------------------------------------------------
  // Am Ende: Module / öffentliche API an SHN hängen
  // ----------------------------------------------------

  // 1) State nach außen sichtbar machen (für spätere Bots/Tests)
  SHN.state = state;

  // 2) Engine-API: alles, was den reinen Spielzustand betrifft
  SHN.engine = {
    newGame,
    deal,
    applyMove,
    checkWin,
    canPlaceOnTableau,
    canPlaceOnFoundation,
    locOfCard,
    isFaceUpSequence,
    generateSeed,
    rng
  };

  // 3) UI-API: Darstellung & einfache UI-Helfer
  SHN.ui = {
    renderAll,
    renderStack,
    resizeTableauHeights,
    renderCard,
    updateOverlay,
    updateMirrorUI,
    setMirror,
    toggleMirror,
    showToast,
    showEndPopup,
    hideEndPopup
  };

  // 4) Netzwerk-API
  SHN.net = {
    connectWS,
    send,
    sendSys
  };

  // 5) Input-API
  SHN.input = {
    setupTouchControls,
    handleTouchTap,
    handleTouchDoubleTap
    // (Drag-Handler lassen wir intern, die ruft nur TouchInput)
  };

  // 6) Meta/Version
  SHN.meta = {
    VERSION,
    IS_TOUCH_DEVICE
  };

})();
