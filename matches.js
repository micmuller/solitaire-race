// matches.js
// In-memory Match Management für Solitaire HighNoon
// Phase 1: create_match / join_match
// -----------------------------------------------------------------------------
// Versionierung / Patch-Log (BITTE bei JEDEM Patch aktualisieren)
// -----------------------------------------------------------------------------
// Date (YYYY-MM-DD) | Version  | Change
// 2026-02-06        | v2.4.12  | AIRBAG: Card-conservation invariant after apply (dup/missing guard + snapshot recovery trigger)
// 2026-01-25        | v2.4.10  | P1: Fix bot toPile moves with numeric from/to (no zones): normalize indices and default zones to tableau; prevents bad_from loops
// 2026-02-22        | v2.4.21  | Foundation rules fix: global 8-lane deterministic placement (no side split) + resolved index repair
// 2026-02-22        | v2.4.20  | Foundation canonicalization: expose resolvedFoundationIndex in applied toFound moves
// 2026-01-25        | v2.4.9   | P1: Add server-side validate/apply helpers for legacy (iOS↔BOT) moves (toFound/toPile/flip/draw); export validateMove/applyMove/validateAndApplyMove
// 2026-01-23        | v2.4.8   | Fix: Invariant collector double-counted card ids (id fields were traversed twice) causing false duplicate_card_ids (expected=52 found=208); skip id keys after capture
// 2026-01-23        | v2.4.7   | TEMP: Legacy bot snapshot format (52-card, tableaus/stock/waste/foundations{S,H,D,C}, faceUp) for iOS↔BOT; ensureInitialSnapshot selects legacy when isBot present
// 2026-01-23        | v2.4.6   | P1.3: Server-side Initial Deal + Authoritative STATE_SNAPSHOT helpers (ensureInitialSnapshot, getSnapshotForPlayer)
// 2026-01-23        | v2.4.5   | Baseline: Drift-Hardening Helpers, Snapshot-Cache, Invariant Checks (P1.1/P1.2)
//                  |          | Hinweis: Neue Einträge oben anfügen (neueste zuerst).
//
// Konvention:
// - Jede funktionale Änderung an matches.js bekommt hier einen Eintrag.
// - Nur kurze, präzise Bullet-Infos (max. 1–2 Zeilen).
// - Diese Datei bleibt abwärtskompatibel zum Protokoll; Breaking Changes nur via ADR + Protocol-Version-Bump.
// -----------------------------------------------------------------------------

const matches = new Map(); // key = matchId, value = Match-Objekt

// Optional: Bot-Unterstützung auf Match-Ebene.
// Ein Bot wird wie ein Spieler in der players-Liste geführt, kann aber
// zusätzlich mit isBot/difficulty gekennzeichnet werden.
// Historische Versionshinweise sind jetzt im Patch-Log oben geführt.
// (Bitte keine neuen vX.Y.Z-Kommentare mehr hier hinzufügen.)

function generateMatchId() {
  // Kurzer, menschenlesbarer Code wie "DUEL4"
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateSeed() {
  // Ähnlich wie im Client: zufälliger String, 8 Zeichen
  return Math.random().toString(36).slice(2, 10);
}

function generateUniqueMatchId(rooms) {
  // Verhindert Kollisionen mit existierenden Matches oder Rooms
  let attempts = 0;
  while (attempts < 1000) {
    const id = generateMatchId();
    if (!matches.has(id) && !rooms.has(id)) return id;
    attempts++;
  }
  // Fallback, falls wirklich alles schiefgeht
  return `M${Date.now().toString(36).toUpperCase()}`;
}

// ------------------------------------------------------------
// P1.3: Server-side Initial Deal + Authoritative STATE_SNAPSHOT (v1)
// ------------------------------------------------------------

// Deterministic seeded PRNG (Mulberry32) derived from a string seed
function _seedToUint32(seedStr) {
  const s = String(seedStr || '');
  let h = 2166136261 >>> 0; // FNV-1a 32-bit basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function _mulberry32(a) {
  let t = a >>> 0;
  return function rand() {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function _shuffleInPlace(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function _makeCardId(owner, idx, suit, rank) {
  // v1 normativ: <Owner>-<Index>-<Suit>-<Rank>
  return `${owner}-${idx}-${suit}-${rank}`;
}

function _buildDeck(owner, rand, shuffleMode, baseSeed) {
  const suits = ['♠', '♥', '♦', '♣'];
  const deck = [];
  let idx = 0;

  for (const suit of suits) {
    for (let rank = 0; rank <= 12; rank++) {
      deck.push({
        id: _makeCardId(owner, idx, suit, rank),
        suit,
        rank,
        up: false
      });
      idx++;
    }
  }

  // In shared-mode both sides must receive identical order (same seed)
  // In split-mode each side may differ (seed is derived per owner)
  const salt = (String(shuffleMode).toLowerCase() === 'split') ? `::${owner}` : '';
  const r = rand || _mulberry32(_seedToUint32(`${baseSeed}${salt}`));
  return _shuffleInPlace(deck, r);
}


function _dealKlondikeFromDeck(deck) {
  // Returns { tableau: CardLite[][], stock: CardLite[] }
  const tableau = Array.from({ length: 7 }, () => []);
  let cursor = 0;

  for (let col = 0; col < 7; col++) {
    const n = col + 1;
    const pile = [];
    for (let k = 0; k < n; k++) {
      const c = deck[cursor++];
      pile.push({ ...c, up: k === n - 1 }); // only top card face-up
    }
    tableau[col] = pile;
  }

  const stock = [];
  while (cursor < deck.length) {
    const c = deck[cursor++];
    stock.push({ ...c, up: false });
  }

  return { tableau, stock };
}

// ------------------------------------------------------------
// TEMP (iOS↔BOT): Legacy bot snapshot format (pre v1 schema)
// NOTE: This is a compatibility bridge. Remove once iOS can render v1 schema.
// ------------------------------------------------------------

function _buildLegacyDeck52(seedStr) {
  const suits = ['S', 'H', 'D', 'C']; // legacy suit codes
  const deck = [];
  let idx = 0;

  for (const suit of suits) {
    for (let rank = 0; rank <= 12; rank++) {
      // Legacy id shape: keep 3 parts, stable and unique
      // Example: "S-10-37" (suit-rank-uniqueIdx)
      deck.push({
        id: `${suit}-${rank}-${idx}`,
        suit,
        rank,
        faceUp: false
      });
      idx++;
    }
  }

  const rand = _mulberry32(_seedToUint32(String(seedStr || '')));
  return _shuffleInPlace(deck, rand);
}

function _dealLegacyKlondike52(deck) {
  const tableaus = Array.from({ length: 7 }, () => []);
  let cursor = 0;

  for (let col = 0; col < 7; col++) {
    const n = col + 1;
    const pile = [];
    for (let k = 0; k < n; k++) {
      const c = deck[cursor++];
      pile.push({ ...c, faceUp: k === n - 1 }); // only top face-up
    }
    tableaus[col] = pile;
  }

  const stock = [];
  while (cursor < deck.length) {
    const c = deck[cursor++];
    stock.push({ ...c, faceUp: false });
  }

  return { tableaus, stock };
}

function createInitialBotStateLegacy(matchId, seed, shuffleMode = 'shared') {
  const mode = String(shuffleMode || 'shared').toLowerCase() === 'split' ? 'split' : 'shared';
  const baseSeed = String(seed || '');

  const deck = _buildLegacyDeck52(baseSeed);
  const dealt = _dealLegacyKlondike52(deck);

  // Legacy foundations object (single set)
  const foundations = { S: [], H: [], D: [], C: [] };

  return {
    seed: baseSeed,
    shuffleMode: mode,
    owner: 'Y',

    // Helps invariant validation
    expectedTotalCards: 52,

    foundations,
    tableaus: dealt.tableaus,
    stock: dealt.stock,
    waste: []
  };
}

function createInitialGameState(matchId, seed, shuffleMode = 'shared') {
  const mode = String(shuffleMode || 'shared').toLowerCase() === 'split' ? 'split' : 'shared';
  const baseSeed = String(seed || '');

  // Build two decks (one per side). In shared-mode: identical order; in split-mode: per-side derived seed.
  const randBase = _mulberry32(_seedToUint32(baseSeed));
  const deckY = _buildDeck('Y', randBase, mode, baseSeed);
  const deckO = _buildDeck('O', randBase, mode, baseSeed);

  const dealtY = _dealKlondikeFromDeck(deckY);
  const dealtO = _dealKlondikeFromDeck(deckO);

  // 8 foundations: first 4 belong to "you", last 4 belong to "opp" (both sets are suit-bound)
  const suits = ['♠', '♥', '♦', '♣'];
  const foundations = [
    ...suits.map(suit => ({ suit, cards: [] })),
    ...suits.map(suit => ({ suit, cards: [] }))
  ];

  // NOTE: owner is perspective. Canonical state is stored as host-perspective (owner="Y").
  // For guest delivery, use getSnapshotForPlayer which will swap you/opp and swap foundation halves.
  const state = {
    version: 1,
    room: matchId,
    seed: baseSeed,
    owner: 'Y',
    shuffleMode: mode,

    // Helps invariant validation avoid false negatives even if heuristics change.
    expectedTotalCards: 104,

    foundations,
    you: {
      stock: dealtY.stock,
      waste: [],
      tableau: dealtY.tableau
    },
    opp: {
      stock: dealtO.stock,
      waste: [],
      tableau: dealtO.tableau
    },
    moves: 0,
    over: false
  };

  return state;
}

function ensureInitialSnapshot(matchId, opts = {}) {
  const match = matches.get(matchId);
  if (!match) return null;

  // If an authoritative snapshot exists, keep it.
  if (match.lastSnapshot && match.lastSnapshot.state) return match.lastSnapshot;

  const mode = opts.shuffleMode || match.shuffleMode || 'shared';
  const seed = opts.seed || match.seed || '';

  const hasBot = Array.isArray(match.players) && match.players.some(p => p && p.isBot);
  const state = hasBot
    ? createInitialBotStateLegacy(matchId, seed, mode)
    : createInitialGameState(matchId, seed, mode);

  // Authoritative revision bump + cache
  bumpMatchRev(matchId);
  return setAuthoritativeState(matchId, state, {
    seed,
    fromCid: opts.fromCid || null,
    at: opts.at || new Date().toISOString()
  });
}

function _swapFoundationHalves(foundations) {
  if (!Array.isArray(foundations) || foundations.length !== 8) return foundations;
  const a = foundations.slice(0, 4);
  const b = foundations.slice(4, 8);
  return [...b, ...a];
}

// Produces a per-player snapshot from canonical host-perspective state.
// playerId: "p1" -> owner "Y", "p2" -> owner "O", "bot" defaults to "O".
function getSnapshotForPlayer(matchId, playerId) {
  const snap = getSnapshot(matchId);
  if (!snap || !snap.state) return null;

  const wantedOwner = (playerId === 'p2' || playerId === 'bot') ? 'O' : 'Y';
  const state = snap.state;

  // If already correct owner, return as-is (but ensure owner field is set)
  if (wantedOwner === 'Y') {
    if (state.owner !== 'Y') {
      // Shallow clone with corrected owner
      return { ...snap, state: { ...state, owner: 'Y' } };
    }
    return snap;
  }

  // Build swapped view for owner "O"
  const swapped = {
    ...state,
    owner: 'O',
    you: state.opp,
    opp: state.you,
    foundations: _swapFoundationHalves(state.foundations)
  };

  return { ...snap, state: swapped };
}

// ------------------------------------------------------------
// P1 (minimal): Server-authoritative move validation + apply
// - Initial scope: legacy bot-state (iOS↔BOT) only.
// - This keeps protocol stable; invalid moves are rejected server-side.
// ------------------------------------------------------------

function _detectStateSchema(state) {
  // Returns: 'legacy_root' | 'v1_sided' | null
  if (!state || typeof state !== 'object') return null;

  // Legacy root schema: foundations is object {S,H,D,C}, piles at root.
  if (state.foundations && !Array.isArray(state.foundations)
    && typeof state.foundations === 'object'
    && Array.isArray(state.tableaus)
    && Array.isArray(state.stock)
    && Array.isArray(state.waste)) {
    return 'legacy_root';
  }

  // v1 sided schema (P1.3): foundations is an array, and both sides exist.
  if (Array.isArray(state.foundations)
    && state.you && typeof state.you === 'object'
    && state.opp && typeof state.opp === 'object'
    && Array.isArray(state.you.stock)
    && Array.isArray(state.you.waste)
    && Array.isArray(state.you.tableau)
    && Array.isArray(state.opp.stock)
    && Array.isArray(state.opp.waste)
    && Array.isArray(state.opp.tableau)) {
    return 'v1_sided';
  }

  return null;
}

function _legacySuitCode(suit) {
  // Accept legacy codes and v1 suit glyphs, normalize to legacy codes.
  const s = (typeof suit === 'string') ? suit.replace(/\uFE0F/g, '') : suit;
  if (s === 'S' || s === 'H' || s === 'D' || s === 'C') return s;
  if (s === '♠') return 'S';
  if (s === '♥') return 'H';
  if (s === '♦') return 'D';
  if (s === '♣') return 'C';
  return null;
}

function _suitGlyphFromCode(code) {
  const c = _legacySuitCode(code);
  if (c === 'S') return '♠';
  if (c === 'H') return '♥';
  if (c === 'D') return '♦';
  if (c === 'C') return '♣';
  return null;
}

function _legacyColor(suitCode) {
  return (suitCode === 'S' || suitCode === 'C') ? 'black' : 'red';
}

function _isFaceUp(card) {
  if (!card || typeof card !== 'object') return false;
  // legacy uses faceUp, v1 often uses up; iOS model can carry isFaceUp
  if (card.faceUp === true) return true;
  if (card.up === true) return true;
  if (card.isFaceUp === true) return true;
  return false;
}

function _setFaceUp(card, v) {
  if (!card || typeof card !== 'object') return;
  if ('up' in card) card.up = !!v;
  else if ('faceUp' in card) card.faceUp = !!v;
  else if ('isFaceUp' in card) card.isFaceUp = !!v;
  else card.faceUp = !!v;
}

function _pickSideKeyFromMove(move, card) {
  // Explicit internal override (used by validator/apply fallback logic)
  if (move && (move.__forceSideKey === 'you' || move.__forceSideKey === 'opp')) {
    return move.__forceSideKey;
  }

  // For v1: choose state.you vs state.opp based on cardId prefix.
  const cid = (move && (move.cardId || move.id)) || (card && (card.id || card.cardId)) || null;
  if (typeof cid === 'string') {
    if (cid.startsWith('Y-')) return 'you';
    if (cid.startsWith('O-')) return 'opp';
  }
  // fallback: if move.fromSide exists
  const s = (move && (move.side || move.fromSide || move.owner || (move.from && move.from.sideOwner) || (move.to && move.to.sideOwner))) || null;
  if (typeof s === 'string') {
    const sl = s.toLowerCase();
    if (sl === 'you' || sl === 'y') return 'you';
    if (sl === 'opp' || sl === 'o' || sl === 'opponent') return 'opp';
  }
  // default: bot is usually opp
  return 'opp';
}

function _idx(v) {
  // Accept: number | numeric string | {uiIndex,index,i,f}
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'object') {
    const c = (v.uiIndex ?? v.index ?? v.i ?? v.f);
    return _idx(c);
  }
  return null;
}

function _moveFromTo(move) {
  // Normalizes from/to indices for bot + client move variants.
  const m = move || {};
  const from = _idx(m.fromIndex ?? m.fromIdx ?? m.from);
  const to   = _idx(m.toIndex   ?? m.toIdx   ?? m.to);
  return { from, to };
}

function _peek(arr) {
  return Array.isArray(arr) && arr.length ? arr[arr.length - 1] : null;
}

function _pop(arr) {
  return Array.isArray(arr) && arr.length ? arr.pop() : null;
}

function _push(arr, v) {
  if (!Array.isArray(arr)) return false;
  arr.push(v);
  return true;
}

function _getPileRef(state, zone, idx, move, card) {
  const z = String(zone || '').toLowerCase();
  const schema = _detectStateSchema(state);

  // --- legacy_root ---
  if (schema === 'legacy_root') {
    if (z === 'waste') return state.waste;
    if (z === 'stock') return state.stock;
    if (z === 'tableau') {
      const i = typeof idx === 'number' ? idx : Number(idx);
      if (!Number.isFinite(i) || i < 0 || i >= state.tableaus.length) return null;
      return state.tableaus[i];
    }
    if (z === 'foundation' || z === 'foundations') {
      const suit = _legacySuitCode(idx);
      if (!suit) return null;
      const f = state.foundations;
      if (!f || typeof f !== 'object') return null;
      if (!Array.isArray(f[suit])) f[suit] = [];
      return f[suit];
    }
    return null;
  }

  // --- v1_sided (P1.3) ---
  if (schema === 'v1_sided') {
    const sideKey = _pickSideKeyFromMove(move, card);
    const side = state[sideKey];
    if (!side || typeof side !== 'object') return null;

    if (z === 'waste') return side.waste;
    if (z === 'stock') return side.stock;
    if (z === 'tableau') {
      const i = typeof idx === 'number' ? idx : Number(idx);
      if (!Number.isFinite(i) || i < 0 || i >= side.tableau.length) return null;
      return side.tableau[i];
    }
    if (z === 'foundation' || z === 'foundations') {
      const suitCode = _legacySuitCode(idx);
      if (!suitCode) return null;
      const glyph = _suitGlyphFromCode(suitCode);
      if (!glyph) return null;

      // Foundations are GLOBAL (all 8), no ownership split by you/opp.
      const arr = Array.isArray(state.foundations) ? state.foundations : [];
      const candidates = [];
      for (let i = 0; i < arr.length; i++) {
        const f = arr[i];
        if (!(f && typeof f === 'object' && f.suit === glyph && Array.isArray(f.cards))) continue;
        const top = _peek(f.cards);
        const topRank = (top && typeof top.rank === 'number') ? top.rank : -1;
        const legal = card ? _canPlaceOnFoundationLegacy(card, f.cards).ok : true;
        candidates.push({ i, cards: f.cards, topRank, legal });
      }

      const legalCands = candidates.filter(c => c.legal);
      if (!legalCands.length) return null;

      // Deterministic tie-break (GAME_RULES.md): higher topRank, then lower index.
      legalCands.sort((a, b) => {
        if (a.topRank !== b.topRank) return b.topRank - a.topRank;
        return a.i - b.i;
      });
      return legalCands[0].cards;
    }
    return null;
  }

  return null;
}

function _foundationIndexByRef(state, pileRef) {
  if (!state || !Array.isArray(state.foundations) || !pileRef) return -1;
  for (let i = 0; i < state.foundations.length; i++) {
    const f = state.foundations[i];
    if (f === pileRef) return i;
    if (f && typeof f === 'object' && f.cards === pileRef) return i;
  }
  return -1;
}

function _canPlaceOnFoundationLegacy(card, foundationPile) {
  if (!card) return { ok: false, reason: 'no_card' };
  const suit = _legacySuitCode(card.suit);
  if (!suit) return { ok: false, reason: 'bad_suit' };
  const top = _peek(foundationPile);
  if (!top) {
    // Ace starts (rank 0)
    return card.rank === 0
      ? { ok: true }
      : { ok: false, reason: 'foundation_requires_ace' };
  }
  const topSuit = _legacySuitCode(top.suit);
  if (topSuit !== suit) return { ok: false, reason: 'foundation_suit_mismatch' };
  if (card.rank !== (top.rank + 1)) return { ok: false, reason: 'foundation_rank_not_next' };
  return { ok: true };
}

function _canPlaceOnTableauLegacy(card, tableauPile) {
  if (!card) return { ok: false, reason: 'no_card' };
  const top = _peek(tableauPile);
  if (!top) {
    // Only King (rank 12) can go to empty tableau
    return card.rank === 12
      ? { ok: true }
      : { ok: false, reason: 'tableau_empty_requires_king' };
  }
  const suitA = _legacySuitCode(card.suit);
  const suitB = _legacySuitCode(top.suit);
  if (!suitA || !suitB) return { ok: false, reason: 'bad_suit' };
  if (_legacyColor(suitA) === _legacyColor(suitB)) return { ok: false, reason: 'tableau_color_same' };
  if (card.rank !== (top.rank - 1)) return { ok: false, reason: 'tableau_rank_not_desc' };
  return { ok: true };
}

function _normalizeMoveKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'tofound' || k === 'tofoundation' || k === 'foundation') return 'toFound';
  if (k === 'topile' || k === 'totableau' || k === 'tableau') return 'toPile';
  if (k === 'flip' || k === 'fliptableau') return 'flip';
  if (k === 'draw' || k === 'stocktowaste' || k === 'deal') return 'draw';
  if (k === 'recycle' || k === 'wastetostock') return 'recycle';
  return String(kind || '');
}

function _extractLegacyMoveFields(move) {
  // Support multiple shapes:
  // A) { kind, fromZone, fromIndex, toZone, toIndex, toSuit }
  // B) { kind, from:{zone,idx}, to:{zone,idx|suit} }
  // C) historical: { kind, from:'waste'|'t3', to:'f:S'|'t5' }
  // D) iOS/PWA-style: { from:{kind:'pile'|'stock'|'waste', uiIndex, sideOwner}, to:{kind:'pile'|'found', uiIndex|f} }
  const kind = _normalizeMoveKind(move && move.kind);

  const mapZone = (z) => {
    const s = String(z || '').toLowerCase();
    if (!s) return null;
    if (s === 'pile' || s === 'tableau' || s === 'tab') return 'tableau';
    if (s === 'found' || s === 'foundation' || s === 'foundations' || s === 'fnd') return 'foundation';
    if (s === 'waste' || s === 'stock') return s;
    return z || null;
  };

  const fromObj = (move && typeof move.from === 'object' && move.from) ? move.from : null;
  const toObj = (move && typeof move.to === 'object' && move.to) ? move.to : null;

  const fromZone = (move && (move.fromZone || (fromObj && (fromObj.zone || fromObj.kind)))) || null;
  const fromIndex = (move && (move.fromIndex ?? (fromObj && (fromObj.idx ?? fromObj.index ?? fromObj.uiIndex ?? fromObj.i ?? fromObj.f)))) ?? null;
  const toZone = (move && (move.toZone || (toObj && (toObj.zone || toObj.kind)))) || null;
  const toIndex = (move && (move.toIndex ?? (toObj && (toObj.idx ?? toObj.index ?? toObj.uiIndex ?? toObj.i ?? toObj.f)))) ?? null;
  const toSuit = (move && (move.toSuit || (toObj && (toObj.suit ?? toObj.code)))) || null;

  // Parse compact strings if present
  let fz = mapZone(fromZone);
  let fi = fromIndex;
  let tz = mapZone(toZone);
  let ti = toIndex;
  let ts = toSuit;

  if (!fz && typeof (move && move.from) === 'string') {
    const s = move.from;
    if (s === 'waste' || s === 'stock') fz = s;
    else if (/^t\d+$/.test(s)) { fz = 'tableau'; fi = Number(s.slice(1)); }
  }

  if (!tz && typeof (move && move.to) === 'string') {
    const s = move.to;
    if (/^t\d+$/.test(s)) { tz = 'tableau'; ti = Number(s.slice(1)); }
    else if (/^f[:=]/.test(s)) { tz = 'foundation'; ts = s.split(/[:=]/)[1]; }
  }

  // Normalize foundation index/suit hints.
  // In iOS payloads `to.f` is a lane index (0..3 / 4..7), not a suit glyph/code.
  if ((String(tz || '').toLowerCase() === 'foundation' || String(tz || '').toLowerCase() === 'foundations') && ts == null && ti != null) {
    if (typeof ti === 'string' && !/^\d+$/.test(ti)) {
      ts = ti;
      ti = null;
    }
  }

  // iOS uses `kind: flip` for stock->waste draw. Normalize to draw for validator/apply.
  let normalizedKind = kind;
  if (kind === 'flip' && fz === 'stock' && (tz === 'waste' || tz == null)) {
    normalizedKind = 'draw';
  }

  return {
    kind: normalizedKind,
    fromZone: fz,
    fromIndex: fi,
    toZone: tz,
    toIndex: ti,
    toSuit: ts
  };
}

function _normalizeCardIdForCompare(v) {
  if (v == null) return null;
  return String(v).replace(/\uFE0F/g, ''); // strip emoji variation selector (e.g. ♠️ -> ♠)
}

function _sameCardId(a, b) {
  const na = _normalizeCardIdForCompare(a);
  const nb = _normalizeCardIdForCompare(b);
  if (!na || !nb) return false;
  return na === nb;
}

function _otherSideKey(sideKey) {
  return sideKey === 'you' ? 'opp' : (sideKey === 'opp' ? 'you' : null);
}

function validateMove(matchId, move, actor = 'unknown') {
  const snap = getSnapshot(matchId);
  const state = snap && snap.state ? snap.state : null;

  const report = {
    ok: false,
    reason: null,
    kind: move && move.kind ? String(move.kind) : null,
    actor: String(actor || 'unknown')
  };

  if (!state) {
    report.reason = 'state_missing';
    return report;
  }

  const schema = _detectStateSchema(state);
  if (!schema) {
    report.reason = 'unsupported_state_schema';
    return report;
  }

  const m = _extractLegacyMoveFields(move || {});
  const kind = m.kind;

  if (kind === 'flip') {
    const idx = typeof m.fromIndex === 'number' ? m.fromIndex : Number(m.fromIndex);
    const pile = _getPileRef(state, 'tableau', idx, move, null);
    if (!pile) { report.reason = 'bad_tableau_index'; return report; }
    const top = _peek(pile);
    if (!top) { report.reason = 'flip_no_cards'; return report; }
    if (_isFaceUp(top)) { report.reason = 'flip_not_needed'; return report; }
    report.ok = true;
    return report;
  }

  if (kind === 'draw') {
    let stock = _getPileRef(state, 'stock', null, move, null);
    let waste = _getPileRef(state, 'waste', null, move, null);

    if ((!Array.isArray(stock) || stock.length <= 0) && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, null);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altStock = _getPileRef(state, 'stock', null, altMove, null);
        const altWaste = _getPileRef(state, 'waste', null, altMove, null);
        if (Array.isArray(altStock) && Array.isArray(altWaste) && altStock.length > 0) {
          stock = altStock;
          waste = altWaste;
        }
      }
    }

    if (!Array.isArray(stock) || !Array.isArray(waste)) { report.reason = 'bad_piles'; return report; }
    if (stock.length <= 0) { report.reason = 'stock_empty'; return report; }

    // Intentionally do NOT hard-reject draw by cardId mismatch.
    // iOS can be ahead locally (optimistic) and still be semantically valid as long as stock has cards.
    report.ok = true;
    return report;
  }

  if (kind === 'recycle') {
    let stock = _getPileRef(state, 'stock', null, move, null);
    let waste = _getPileRef(state, 'waste', null, move, null);

    if ((!Array.isArray(waste) || waste.length <= 0) && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, null);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altStock = _getPileRef(state, 'stock', null, altMove, null);
        const altWaste = _getPileRef(state, 'waste', null, altMove, null);
        if (Array.isArray(altStock) && Array.isArray(altWaste) && altWaste.length > 0) {
          stock = altStock;
          waste = altWaste;
        }
      }
    }

    if (!Array.isArray(stock) || !Array.isArray(waste)) { report.reason = 'bad_piles'; return report; }
    if (waste.length <= 0) { report.reason = 'waste_empty'; return report; }

    report.ok = true;
    return report;
  }

  if (kind !== 'toFound' && kind !== 'toPile') {
    report.reason = 'unsupported_move_kind';
    return report;
  }

  // source pile
  let srcZone = m.fromZone;
  let srcIdx = m.fromIndex;

  // Bot moves often use numeric from/to without explicit zones (assume tableau indices)
  if (!srcZone && (kind === 'toPile' || kind === 'toFound')) {
    const ft = _moveFromTo(move);
    if (ft.from != null) {
      srcZone = 'tableau';
      srcIdx = ft.from;
    }
  }

  let src = _getPileRef(state, srcZone, srcIdx, move, null);
  if (!src || !Array.isArray(src)) { report.reason = 'bad_from'; return report; }

  let card = _peek(src);

  // If the move specifies a cardId, it must match the current top-card of the source pile.
  // Otherwise bots can repeatedly propose a move for a card that isn't actually movable yet.
  const wantId = (move && (move.cardId || move.id)) || null;

  // v1 fallback: if side mapping guessed the wrong half, retry on the opposite side.
  // This protects against perspective drift between requester/authoritative snapshots.
  if (schema === 'v1_sided' && wantId) {
    const topId = (card && (card.id || card.cardId || card.code)) || null;
    if (!card || !_sameCardId(topId, wantId)) {
      const guessed = _pickSideKeyFromMove(move, card);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altSrc = _getPileRef(state, srcZone, srcIdx, altMove, null);
        const altCard = _peek(altSrc);
        const altTopId = (altCard && (altCard.id || altCard.cardId || altCard.code)) || null;
        if (altSrc && Array.isArray(altSrc) && altCard && _sameCardId(altTopId, wantId)) {
          src = altSrc;
          card = altCard;
        }
      }
    }
  }

  if (!card) {
    // draw/flip stock-empty rejects were observed with side mismatch; try opposite side once.
    if (schema === 'v1_sided' && srcZone === 'stock') {
      const guessed = _pickSideKeyFromMove(move, null);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altSrc = _getPileRef(state, srcZone, srcIdx, altMove, null);
        const altCard = _peek(altSrc);
        if (altSrc && Array.isArray(altSrc) && altCard) {
          src = altSrc;
          card = altCard;
        }
      }
    }
  }

  if (!card) { report.reason = 'from_empty'; return report; }

  if (kind === 'toFound') {
    let movingCard = card;
    if (wantId) {
      const topId = (card && (card.id || card.cardId || card.code)) || null;
      if (!_sameCardId(topId, wantId)) {
        // Waste orientation/drift tolerance: accept cardId if it's currently present in waste.
        if (String(srcZone || '').toLowerCase() === 'waste' && Array.isArray(src) && src.length > 0) {
          const idx = src.findIndex(c => _sameCardId((c && (c.id || c.cardId || c.code)) || null, wantId));
          if (idx >= 0) {
            movingCard = src[idx];
          } else {
            report.reason = 'card_not_on_top';
            return report;
          }
        } else {
          report.reason = 'card_not_on_top';
          return report;
        }
      }
    }
    // cannot move face-down cards
    if (!_isFaceUp(movingCard)) { report.reason = 'card_face_down'; return report; }

    const suit = _legacySuitCode(m.toSuit || (movingCard && movingCard.suit));
    let dst = _getPileRef(state, 'foundation', suit, move, movingCard);
    if (!dst) { report.reason = 'bad_foundation'; return report; }
    let can = _canPlaceOnFoundationLegacy(movingCard, dst);

    // Side fallback: if the inferred side points to an empty/wrong foundation lane,
    // retry on the opposite side (perspective drift between Y/O vs you/opp mapping).
    if (!can.ok && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, movingCard);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altDst = _getPileRef(state, 'foundation', suit, altMove, movingCard);
        if (altDst) {
          const altCan = _canPlaceOnFoundationLegacy(movingCard, altDst);
          if (altCan.ok) {
            dst = altDst;
            can = altCan;
          }
        }
      }
    }

    if (!can.ok) { report.reason = can.reason; return report; }
    report.ok = true;
    return report;
  }

  // kind === 'toPile'
  let movingCard = card;
  const rawCount = Number((move && move.count) || 1);
  const moveCount = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;
  const srcZoneLower = String(srcZone || '').toLowerCase();

  if (srcZoneLower === 'waste') {
    // Waste -> tableau is always a single-card move.
    if (moveCount !== 1) { report.reason = 'bad_count'; return report; }
    if (wantId && Array.isArray(src) && src.length > 0) {
      const idx = src.findIndex(c => _sameCardId((c && (c.id || c.cardId || c.code)) || null, wantId));
      if (idx >= 0) {
        movingCard = src[idx];
      } else {
        report.reason = 'card_not_on_top';
        return report;
      }
    }
  } else if (wantId) {
    // Allow multi-card tableau moves where cardId identifies the first moved card (not the top card).
    let idx = -1;
    for (let i = src.length - 1; i >= 0; i--) {
      const id = src[i] && (src[i].id || src[i].cardId || src[i].code);
      if (_sameCardId(id, wantId)) { idx = i; break; }
    }
    if (idx < 0) { report.reason = 'card_not_on_top'; return report; }

    const available = src.length - idx;
    if (moveCount > available) { report.reason = 'bad_count'; return report; }

    if (moveCount > 1 || idx !== src.length - 1) {
      // For stack moves, requested card must start the moved tail.
      if (available !== moveCount) { report.reason = 'bad_count'; return report; }
    }

    movingCard = src[idx];
  }

  if (!_isFaceUp(movingCard)) { report.reason = 'card_face_down'; return report; }

  const ft = _moveFromTo(move);
  const dstZone = m.toZone || 'tableau';
  const dstIdx = (m.toIndex != null) ? m.toIndex : ft.to;
  const dst = _getPileRef(state, dstZone, dstIdx, move, movingCard);
  if (!dst || !Array.isArray(dst)) { report.reason = 'bad_to'; return report; }

  const can = _canPlaceOnTableauLegacy(movingCard, dst);
  if (!can.ok) { report.reason = can.reason; return report; }

  report.ok = true;
  return report;
}

function applyMove(matchId, move, meta = {}) {
  const snap = getSnapshot(matchId);
  const state = snap && snap.state ? snap.state : null;
  if (!state) return { ok: false, reason: 'state_missing' };
  const schema = _detectStateSchema(state);
  if (!schema) return { ok: false, reason: 'unsupported_state_schema' };

  const m = _extractLegacyMoveFields(move || {});
  const kind = m.kind;

  // NOTE: mutate canonical state in-place (authoritative). Call-site must bumpMatchRev before setAuthoritativeState if desired.

  if (kind === 'flip') {
    const idx = typeof m.fromIndex === 'number' ? m.fromIndex : Number(m.fromIndex);
    const pile = _getPileRef(state, 'tableau', idx, move, null);
    const top = _peek(pile);
    if (!top) return { ok: false, reason: 'flip_no_cards' };
    _setFaceUp(top, true);
    return { ok: true, state };
  }

  if (kind === 'draw') {
    let stock = _getPileRef(state, 'stock', null, move, null);
    let waste = _getPileRef(state, 'waste', null, move, null);

    if ((!Array.isArray(stock) || stock.length <= 0) && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, null);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altStock = _getPileRef(state, 'stock', null, altMove, null);
        const altWaste = _getPileRef(state, 'waste', null, altMove, null);
        if (Array.isArray(altStock) && Array.isArray(altWaste) && altStock.length > 0) {
          stock = altStock;
          waste = altWaste;
        }
      }
    }

    if (!Array.isArray(stock) || !Array.isArray(waste)) return { ok: false, reason: 'bad_piles' };

    const wantId = (move && (move.cardId || move.id)) || null;
    let c = null;

    if (wantId && stock.length > 0) {
      const top = stock[stock.length - 1];
      const topId = (top && (top.id || top.cardId || top.code)) || null;
      if (_sameCardId(topId, wantId)) {
        c = _pop(stock);
      } else {
        // Drift-tolerant fallback: if client names another card currently in stock,
        // move that exact card to waste so follow-up move (waste->pile/foundation) stays consistent.
        const idx = stock.findIndex(x => _sameCardId((x && (x.id || x.cardId || x.code)) || null, wantId));
        if (idx >= 0) {
          c = stock.splice(idx, 1)[0];
        }
      }
    }

    if (!c) c = _pop(stock);
    if (!c) return { ok: false, reason: 'stock_empty' };
    _setFaceUp(c, true);
    _push(waste, c);
    return { ok: true, state };
  }

  if (kind === 'recycle') {
    let stock = _getPileRef(state, 'stock', null, move, null);
    let waste = _getPileRef(state, 'waste', null, move, null);

    if ((!Array.isArray(waste) || waste.length <= 0) && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, null);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altStock = _getPileRef(state, 'stock', null, altMove, null);
        const altWaste = _getPileRef(state, 'waste', null, altMove, null);
        if (Array.isArray(altStock) && Array.isArray(altWaste) && altWaste.length > 0) {
          stock = altStock;
          waste = altWaste;
        }
      }
    }

    if (!Array.isArray(stock) || !Array.isArray(waste)) return { ok: false, reason: 'bad_piles' };
    if (waste.length <= 0) return { ok: false, reason: 'waste_empty' };

    // Move all waste cards back to stock, face-down, preserving order for next draws.
    while (waste.length > 0) {
      const c = waste.pop();
      if (!c) break;
      _setFaceUp(c, false);
      stock.push(c);
    }
    return { ok: true, state };
  }

  let srcZone = m.fromZone;
  let srcIdx = m.fromIndex;

  // Bot moves often use numeric from/to without explicit zones (assume tableau indices)
  if (!srcZone && (kind === 'toPile' || kind === 'toFound')) {
    const ft = _moveFromTo(move);
    if (ft.from != null) {
      srcZone = 'tableau';
      srcIdx = ft.from;
    }
  }

  let src = _getPileRef(state, srcZone, srcIdx, move, null);
  if (!src) return { ok: false, reason: 'bad_from' };

  const maybeAutoFlipSourceTableau = () => {
    if (String(srcZone || '').toLowerCase() !== 'tableau') return;
    const topAfter = _peek(src);
    if (topAfter && !_isFaceUp(topAfter)) _setFaceUp(topAfter, true);
  };

  // If the move specifies a cardId, it must match the moved card.
  const wantId = (move && (move.cardId || move.id)) || null;
  const rawCount = Number((move && move.count) || 1);
  const moveCount = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 1;

  if (kind === 'toFound') {
    let wastePickIndex = -1;
    if (wantId) {
      let top = _peek(src);
      let topId = (top && (top.id || top.cardId || top.code)) || null;

      if (schema === 'v1_sided' && (!_sameCardId(topId, wantId))) {
        const guessed = _pickSideKeyFromMove(move, top);
        const alt = _otherSideKey(guessed);
        if (alt) {
          const altMove = { ...(move || {}), __forceSideKey: alt };
          const altSrc = _getPileRef(state, srcZone, srcIdx, altMove, null);
          const altTop = _peek(altSrc);
          const altTopId = (altTop && (altTop.id || altTop.cardId || altTop.code)) || null;
          if (altSrc && _sameCardId(altTopId, wantId)) {
            src = altSrc;
            top = altTop;
            topId = altTopId;
          }
        }
      }

      if (!_sameCardId(topId, wantId)) {
        // Waste orientation/drift tolerance: remove requested card if present in waste.
        if (String(srcZone || '').toLowerCase() === 'waste' && Array.isArray(src) && src.length > 0) {
          wastePickIndex = src.findIndex(c => _sameCardId((c && (c.id || c.cardId || c.code)) || null, wantId));
          if (wastePickIndex < 0) {
            return { ok: false, reason: 'card_not_on_top' };
          }
        } else {
          return { ok: false, reason: 'card_not_on_top' };
        }
      }
    }

    const card = (wastePickIndex >= 0) ? src.splice(wastePickIndex, 1)[0] : _pop(src);
    if (!card) return { ok: false, reason: 'from_empty' };

    const suit = _legacySuitCode(m.toSuit || (card && card.suit));
    let dst = _getPileRef(state, 'foundation', suit, move, card);
    if (!dst) {
      // rollback
      if (wastePickIndex >= 0) src.splice(wastePickIndex, 0, card);
      else _push(src, card);
      return { ok: false, reason: 'bad_foundation' };
    }

    let can = _canPlaceOnFoundationLegacy(card, dst);
    if (!can.ok && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, card);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altDst = _getPileRef(state, 'foundation', suit, altMove, card);
        if (altDst) {
          const altCan = _canPlaceOnFoundationLegacy(card, altDst);
          if (altCan.ok) {
            dst = altDst;
            can = altCan;
          }
        }
      }
    }

    if (!can.ok) {
      if (wastePickIndex >= 0) src.splice(wastePickIndex, 0, card);
      else _push(src, card);
      return { ok: false, reason: can.reason || 'foundation_invalid' };
    }

    // A2: canonicalize foundation lane in outgoing move payload to actual resolved pile index.
    // This avoids client drift when requested lane (e.g. f=1) is remapped server-side to another legal lane.
    const resolvedF = _foundationIndexByRef(state, dst);
    if (resolvedF >= 0) {
      if (!move.to || typeof move.to !== 'object') move.to = {};
      move.to.kind = 'found';
      move.to.f = resolvedF;
    }

    _push(dst, card);
    maybeAutoFlipSourceTableau();
    return { ok: true, state, resolvedFoundationIndex: resolvedF };
  }

  // toPile (supports single- and multi-card stack moves)
  const srcZoneLower = String(srcZone || '').toLowerCase();

  if (srcZoneLower === 'waste') {
    if (moveCount !== 1) return { ok: false, reason: 'bad_count' };

    let wastePickIndex = -1;
    if (wantId && Array.isArray(src) && src.length > 0) {
      wastePickIndex = src.findIndex(c => _sameCardId((c && (c.id || c.cardId || c.code)) || null, wantId));
      if (wastePickIndex < 0) return { ok: false, reason: 'card_not_on_top' };
    }

    const movingCard = (wastePickIndex >= 0) ? src.splice(wastePickIndex, 1)[0] : _pop(src);
    if (!movingCard) return { ok: false, reason: 'from_empty' };

    const ft = _moveFromTo(move);
    const dst = _getPileRef(state, m.toZone || 'tableau', (m.toIndex != null) ? m.toIndex : ft.to, move, movingCard);
    if (!dst) {
      if (wastePickIndex >= 0) src.splice(wastePickIndex, 0, movingCard);
      else _push(src, movingCard);
      return { ok: false, reason: 'bad_to' };
    }

    _push(dst, movingCard);
    return { ok: true, state };
  }

  let startIdx = src.length - 1;
  if (wantId) {
    let idx = -1;
    for (let i = src.length - 1; i >= 0; i--) {
      const id = src[i] && (src[i].id || src[i].cardId || src[i].code);
      if (_sameCardId(id, wantId)) { idx = i; break; }
    }

    if (idx < 0 && schema === 'v1_sided') {
      const guessed = _pickSideKeyFromMove(move, null);
      const alt = _otherSideKey(guessed);
      if (alt) {
        const altMove = { ...(move || {}), __forceSideKey: alt };
        const altSrc = _getPileRef(state, srcZone, srcIdx, altMove, null);
        if (altSrc && Array.isArray(altSrc)) {
          for (let i = altSrc.length - 1; i >= 0; i--) {
            const id = altSrc[i] && (altSrc[i].id || altSrc[i].cardId || altSrc[i].code);
            if (_sameCardId(id, wantId)) { idx = i; src = altSrc; break; }
          }
        }
      }
    }

    if (idx < 0) return { ok: false, reason: 'card_not_on_top' };
    const available = src.length - idx;
    if (moveCount > available) return { ok: false, reason: 'bad_count' };
    if ((moveCount > 1 || idx !== src.length - 1) && available !== moveCount) return { ok: false, reason: 'bad_count' };
    startIdx = idx;
  } else {
    if (moveCount > 1) {
      if (moveCount > src.length) return { ok: false, reason: 'bad_count' };
      startIdx = src.length - moveCount;
    }
  }

  const moving = src.slice(startIdx);
  if (!moving.length) return { ok: false, reason: 'from_empty' };

  const anchor = moving[0];
  const ft = _moveFromTo(move);
  const dst = _getPileRef(state, m.toZone || 'tableau', (m.toIndex != null) ? m.toIndex : ft.to, move, anchor);
  if (!dst) return { ok: false, reason: 'bad_to' };

  src.splice(startIdx, moving.length);
  for (const c of moving) _push(dst, c);

  // Reveal the new source top card after a valid tableau move (Klondike rule).
  maybeAutoFlipSourceTableau();
  return { ok: true, state };
}

function _cardIdFromCard(card) {
  if (!card) return null;
  if (typeof card === 'string') return card;
  if (typeof card === 'object') {
    return card.id || card.cardId || card.code || null;
  }
  return null;
}

function computeCardStats(state) {
  const stats = {
    total: 0,
    unique: 0,
    duplicates: [],
    countsByZone: {},
    expectedTotal: (state && typeof state.expectedTotalCards === 'number') ? state.expectedTotalCards : null,
    missing: null
  };

  const counts = new Map();
  const dupes = new Set();

  function addCard(card) {
    stats.total++;
    const id = _cardIdFromCard(card);
    if (!id) return;
    const n = (counts.get(id) || 0) + 1;
    counts.set(id, n);
    if (n === 2) dupes.add(id);
  }

  function collectPile(pile) {
    if (!Array.isArray(pile)) return 0;
    let c = 0;
    for (const card of pile) {
      c++;
      addCard(card);
    }
    return c;
  }

  function collectTableau(tableau) {
    if (!Array.isArray(tableau)) return 0;
    let c = 0;
    for (const pile of tableau) {
      c += collectPile(pile);
    }
    return c;
  }

  const schema = _detectStateSchema(state);

  if (schema === 'legacy_root') {
    const stock = collectPile(state.stock);
    const waste = collectPile(state.waste);
    const tableau = collectTableau(state.tableaus);

    let foundations = 0;
    if (state.foundations && typeof state.foundations === 'object') {
      for (const k of Object.keys(state.foundations)) {
        foundations += collectPile(state.foundations[k]);
      }
    }

    stats.countsByZone = {
      you: { stock, waste, tableau, foundations }
    };
  } else if (schema === 'v1_sided') {
    const youStock = collectPile(state.you && state.you.stock);
    const youWaste = collectPile(state.you && state.you.waste);
    const youTab = collectTableau(state.you && state.you.tableau);

    const oppStock = collectPile(state.opp && state.opp.stock);
    const oppWaste = collectPile(state.opp && state.opp.waste);
    const oppTab = collectTableau(state.opp && state.opp.tableau);

    let youFnd = 0;
    let oppFnd = 0;
    if (Array.isArray(state.foundations)) {
      for (let i = 0; i < state.foundations.length; i++) {
        const f = state.foundations[i];
        const pile = Array.isArray(f) ? f : (f && Array.isArray(f.cards) ? f.cards : null);
        const n = collectPile(pile);
        if (i < 4) youFnd += n;
        else oppFnd += n;
      }
    }

    stats.countsByZone = {
      you: { stock: youStock, waste: youWaste, tableau: youTab, foundations: youFnd },
      opp: { stock: oppStock, waste: oppWaste, tableau: oppTab, foundations: oppFnd }
    };
  }

  stats.unique = counts.size;
  stats.duplicates = Array.from(dupes);

  if (typeof stats.expectedTotal === 'number' && stats.expectedTotal > 0) {
    stats.missing = Math.max(0, stats.expectedTotal - stats.unique);
  }

  return stats;
}

function assertCardConservation(state, ctx = {}) {
  const stats = computeCardStats(state);
  const expected = stats.expectedTotal;
  const hasExpected = (typeof expected === 'number' && expected > 0);

  const hasDupes = stats.duplicates.length > 0;
  const hasMissing = hasExpected && stats.unique !== expected;

  const ok = !(hasDupes || hasMissing);

  const matchId = ctx.matchId || 'n/a';
  const rev = (ctx.rev != null) ? ctx.rev : (ctx.matchRev != null ? ctx.matchRev : 'n/a');
  const kind = (ctx.move && ctx.move.kind) ? ctx.move.kind : 'n/a';
  const sig = ctx.moveSig || ctx.sig || null;

  if (!ok) {
    const dupesShort = stats.duplicates.slice(0, 10);
    const countsStr = (() => {
      try { return JSON.stringify(stats.countsByZone || {}); } catch { return '{}'; }
    })();
    console.warn(
      `[AIRBAG] card_conservation_failed matchId=${matchId} rev=${rev} kind=${kind} sig=${sig || '-'} ` +
      `total=${stats.total} unique=${stats.unique} expected=${hasExpected ? expected : '-'} ` +
      `missing=${hasExpected ? stats.missing : '-'} duplicates=${dupesShort.length ? dupesShort.join(',') : '-'} ` +
      `countsByZone=${countsStr}`
    );
  } else if ((process.env.AIRBAG_DEBUG_COUNTS || '').toLowerCase() === '1') {
    const y = (stats.countsByZone && stats.countsByZone.you) || {};
    const o = (stats.countsByZone && stats.countsByZone.opp) || {};
    console.log(
      `[COUNTS] matchId=${matchId} rev=${rev} ` +
      `you:stock=${y.stock ?? 0} waste=${y.waste ?? 0} tab=${y.tableau ?? 0} fnd=${y.foundations ?? 0} | ` +
      `opp:stock=${o.stock ?? 0} waste=${o.waste ?? 0} tab=${o.tableau ?? 0} fnd=${o.foundations ?? 0}`
    );
  }

  return { ok, stats };
}

function validateAndApplyMove(matchId, move, actor = 'unknown', sys = {}) {
  const v = validateMove(matchId, move, actor);
  if (!v.ok) return { ok: false, reason: v.reason, rejected: true };

  // bump revision for authoritative action
  bumpMatchRev(matchId);

  const res = applyMove(matchId, move, sys);
  if (!res.ok) return { ok: false, reason: res.reason };

  // A2: carry canonical foundation lane into outbound move payload.
  if (res && Number.isInteger(res.resolvedFoundationIndex)) {
    if (!move.to || typeof move.to !== 'object') move.to = {};
    move.to.kind = move.to.kind || 'found';
    move.to.f = res.resolvedFoundationIndex;
    move.to.resolvedFoundationIndex = res.resolvedFoundationIndex;
    move.resolvedFoundationIndex = res.resolvedFoundationIndex;
  }

  // persist authoritative snapshot
  setAuthoritativeState(matchId, res.state, {
    seed: sys.seed || null,
    fromCid: sys.fromCid || null,
    at: sys.at || new Date().toISOString()
  });

  const match = matches.get(matchId);
  const rev = match ? match.matchRev : null;
  const airbag = assertCardConservation(res.state, {
    matchId,
    rev,
    move,
    moveSig: sys.moveSig || sys.sig || null
  });

  try {
    const m = move || {};
    const kind = m.kind || 'n/a';
    const cardId = m.cardId || m.id || '-';
    const moveId = sys.moveId || sys.id || '-';
    const sig = sys.moveSig || sys.sig || '-';
    const snapshotHash = (match && match.lastInvariant && match.lastInvariant.snapshotHash) ? match.lastInvariant.snapshotHash : '-';
    const stats = airbag && airbag.stats ? airbag.stats : null;
    const y = (stats && stats.countsByZone && stats.countsByZone.you) || {};
    const o = (stats && stats.countsByZone && stats.countsByZone.opp) || {};
    const countsSummary =
      `you:stock=${y.stock ?? 0} waste=${y.waste ?? 0} tab=${y.tableau ?? 0} fnd=${y.foundations ?? 0} | ` +
      `opp:stock=${o.stock ?? 0} waste=${o.waste ?? 0} tab=${o.tableau ?? 0} fnd=${o.foundations ?? 0}`;
    console.log(
      `[MOVE_APPLY] matchId=${matchId} rev=${rev ?? '-'} kind=${kind} cardId=${cardId} ` +
      `moveId=${moveId} sig=${sig} hash=${snapshotHash} counts=${countsSummary}`
    );
  } catch {}

  return { ok: true, airbag };
}

// ------------------------------------------------------------
// M7 Drift Hardening helpers (kept in matches.js to avoid global state)
// ------------------------------------------------------------

function fnv1a64(str) {
  let h = 14695981039346656037n;
  const prime = 1099511628211n;
  for (let i = 0; i < str.length; i++) {
    h ^= BigInt(str.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

// ------------------------------------------------------------
// P1.1: State invariant validation (anti-corruption guardrails)
// ------------------------------------------------------------
function _safeJson(obj) {
  try { return JSON.stringify(obj); } catch { return null; }
}

function _defaultExpectedTotalCards(state) {
  // If the client/server encodes an explicit expectedTotalCards, use that.
  if (state && typeof state.expectedTotalCards === 'number') return state.expectedTotalCards;
  // Heuristic defaults:
  const mode = state && (state.shuffleMode || state.shuffle || state.mode);
  if (String(mode).toLowerCase() === 'split') return 104; // 2 decks (one per player)
  return 52; // shared deck
}

function _looksLikeCardId(id) {
  if (typeof id !== 'string') return false;
  if (id.length < 2 || id.length > 64) return false;
  // exclude common non-card identifiers
  if (id === 'p1' || id === 'p2' || id === 'bot') return false;
  return true;
}

function _collectCardIdsDeep(root, opts = {}) {
  const maxNodes = typeof opts.maxNodes === 'number' ? opts.maxNodes : 20000;
  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 50;

  const ids = [];
  const unknownIds = [];

  const seen = new Set();
  const stack = [{ v: root, d: 0 }];
  let nodes = 0;

  while (stack.length) {
    const { v, d } = stack.pop();
    if (v == null) continue;
    if (d > maxDepth) continue;

    const t = typeof v;
    if (t === 'string') {
      // some states may inline cardIds in arrays
      if (_looksLikeCardId(v) && /[A-Z0-9]/i.test(v)) {
        // Only treat as cardId if it contains typical card markers or UNK markers
        if (v.includes('UNK') || v.includes('-') || v.includes('_')) {
          ids.push(v);
          if (v.includes('UNK') || v.includes('0UNK')) unknownIds.push(v);
        }
      }
      continue;
    }
    if (t !== 'object') continue;

    // cycle protection
    if (seen.has(v)) continue;
    seen.add(v);

    nodes++;
    if (nodes > maxNodes) break;

    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) {
        stack.push({ v: v[i], d: d + 1 });
      }
      continue;
    }

    // Common card shapes: { id: '...', rank: .., suit: .. }
    // IMPORTANT: Avoid double-counting by NOT traversing id fields again after capturing.
    // Otherwise each card object contributes its id twice (object.id + traversed string leaf),
    // which leads to false-positive duplicate_card_ids (e.g. expected=52 found=208).
    const idKeys = ['id', 'cardId', 'code', 'cid'];
    let capturedId = null;

    for (const k of idKeys) {
      if (typeof v[k] === 'string' && _looksLikeCardId(v[k])) {
        capturedId = v[k];
        break;
      }
    }

    if (capturedId) {
      ids.push(capturedId);
      if (capturedId.includes('UNK') || capturedId.includes('0UNK')) unknownIds.push(capturedId);
    }

    // push properties
    const keys = Object.keys(v);
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i];
      // Avoid traversing huge transient/derived blobs if present
      if (k === 'ui' || k === 'debug' || k === 'telemetry') continue;
      // Avoid re-traversing id fields (prevents double counts)
      if (idKeys.includes(k)) continue;
      stack.push({ v: v[k], d: d + 1 });
    }
  }

  return { ids, unknownIds, truncated: nodes > maxNodes };
}

function validateInvariant(state, opts = {}) {
  // Returns a report object (never throws)
  const report = {
    ok: true,
    reason: null,
    expectedTotalCards: null,
    foundTotalCards: 0,
    dupes: [],
    missingCount: null,
    unknownIds: [],
    truncated: false,
    snapshotHash: null
  };

  if (!state || typeof state !== 'object') {
    report.ok = false;
    report.reason = 'state_missing_or_invalid';
    return report;
  }

  // Hash for correlation
  const js = _safeJson(state);
  if (js) {
    try { report.snapshotHash = fnv1a64(js); } catch {}
  }

  const expected = _defaultExpectedTotalCards(state);
  report.expectedTotalCards = expected;

  const { ids, unknownIds, truncated } = _collectCardIdsDeep(state, opts);
  report.truncated = !!truncated;
  report.foundTotalCards = ids.length;

  // unknown/placeholder ids are always a corruption signal for P1
  if (unknownIds.length > 0) {
    report.ok = false;
    report.reason = 'unknown_card_ids_present';
    report.unknownIds = Array.from(new Set(unknownIds)).slice(0, 50);
  }

  // duplicate ids
  const seen = new Set();
  const dupes = new Set();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    else seen.add(id);
  }
  if (dupes.size > 0) {
    report.ok = false;
    report.reason = report.reason || 'duplicate_card_ids';
    report.dupes = Array.from(dupes).slice(0, 50);
  }

  // missing cards: only if we are not truncated and have a sensible expectation
  if (!report.truncated && typeof expected === 'number' && expected > 0) {
    report.missingCount = Math.max(0, expected - seen.size);
    if (report.missingCount > 0) {
      report.ok = false;
      report.reason = report.reason || 'missing_cards';
    }
  }

  return report;
}

function bumpMatchRev(matchId) {
  const match = matches.get(matchId);
  if (!match) return null;
  match.matchRev = (typeof match.matchRev === 'number' ? match.matchRev : 0) + 1;
  match.lastActivityAt = Date.now();
  return match.matchRev;
}

function rememberMoveId(matchId, moveId, cap = 500) {
  if (!moveId) return false;
  const match = matches.get(matchId);
  if (!match) return false;
  if (!match.recentMoveIds) match.recentMoveIds = new Set();
  if (!match.recentMoveIdsQueue) match.recentMoveIdsQueue = [];

  const id = String(moveId);
  if (match.recentMoveIds.has(id)) return true;
  match.recentMoveIds.add(id);
  match.recentMoveIdsQueue.push(id);
  if (match.recentMoveIdsQueue.length > cap) {
    const old = match.recentMoveIdsQueue.shift();
    if (old) match.recentMoveIds.delete(old);
  }
  match.lastActivityAt = Date.now();
  return false;
}

function cacheSnapshot(matchId, snap, sys = {}) {
  const match = matches.get(matchId);
  if (!match || !snap) return null;
  // NOTE (P1): cacheSnapshot must NOT mutate matchRev. matchRev is advanced by authoritative actions (MOVE apply, RESET, SNAPSHOT accept) at the call-site.
  const rev = (typeof match.matchRev === 'number' ? match.matchRev : 0);
  match.lastActivityAt = Date.now();
  let snapshotHash = null;
  try {
    snapshotHash = fnv1a64(JSON.stringify(snap));
  } catch {}

  match.lastSnapshot = {
    state: snap,
    seed: sys.seed || snap.seed || null,
    snapshotHash,
    fromCid: sys.fromCid || null,
    at: sys.at || new Date().toISOString(),
    matchRev: rev
  };
  return match.lastSnapshot;
}

function getCachedSnapshot(matchId) {
  const match = matches.get(matchId);
  return match ? match.lastSnapshot || null : null;
}

// ------------------------------------------------------------
// P1: Server-authoritative snapshot accessors (minimal)
// ------------------------------------------------------------
function getSnapshot(matchId) {
  const match = matches.get(matchId);
  if (!match) return null;
  if (match.lastSnapshot && match.lastSnapshot.state) return match.lastSnapshot;

  // Fallback: wrap lastGameState as snapshot
  const state = match.lastGameState;
  if (!state) return null;
  let snapshotHash = null;
  try { snapshotHash = fnv1a64(JSON.stringify(state)); } catch {}

  return {
    state,
    seed: match.seed || state.seed || null,
    snapshotHash,
    fromCid: null,
    at: new Date().toISOString(),
    matchRev: (typeof match.matchRev === 'number' ? match.matchRev : 0)
  };
}

function setAuthoritativeState(matchId, state, sys = {}) {
  const match = matches.get(matchId);
  if (!match || !state) return null;

  match.lastGameState = state;

  // P1.1: validate invariants on authoritative state updates
  try {
    const inv = validateInvariant(state);
    match.lastInvariant = { ...inv, at: sys.at || new Date().toISOString() };
    if (!inv.ok) {
      match.isCorrupt = true;
      const RED = '\x1b[31m';
      const RESET = '\x1b[0m';
      console.warn(`${RED}[CORRUPTION] matchId=${matchId} rev=${typeof match.matchRev === 'number' ? match.matchRev : 0} reason=${inv.reason} expected=${inv.expectedTotalCards} found=${inv.foundTotalCards} missing=${inv.missingCount} dupes=${(inv.dupes||[]).length} unk=${(inv.unknownIds||[]).length} truncated=${inv.truncated} hash=${inv.snapshotHash}${RESET}`);
    } else {
      match.isCorrupt = false;
    }
  } catch (e) {
    match.lastInvariant = { ok: false, reason: 'invariant_check_failed', error: String(e && e.message ? e.message : e), at: sys.at || new Date().toISOString() };
    match.isCorrupt = true;
    const RED = '\x1b[31m';
    const RESET = '\x1b[0m';
    console.warn(`${RED}[CORRUPTION] matchId=${matchId} reason=invariant_check_failed error=${String(e && e.message ? e.message : e)}${RESET}`);
  }

  match.lastActivityAt = Date.now();

  // Caller is responsible for bumpMatchRev(matchId) BEFORE calling this if a new revision is desired.
  return cacheSnapshot(matchId, state, {
    seed: sys.seed || match.seed || state.seed || null,
    fromCid: sys.fromCid || null,
    at: sys.at || new Date().toISOString()
  });
}

function createMatchForClient(ws, nick, rooms) {
  const matchId = generateUniqueMatchId(rooms);
  const seed = generateSeed();
  const now = Date.now();

  const match = {
    matchId,
    seed,
    status: 'waiting', // 'waiting' | 'ready' | 'running' | 'finished'
    createdAt: now,
    lastActivityAt: now,
    lastGameState: null,
    // M7 Drift Hardening (Phase 1.5): server-side sequencing/cache on match object
    matchRev: 0,
    lastSnapshot: null, // { state, seed, snapshotHash, fromCid, at, matchRev }
    lastInvariant: null, // { ok, reason, expectedTotalCards, foundTotalCards, dupes, missingCount, unknownIds, truncated, snapshotHash }
    recentMoveIds: new Set(),
    recentMoveIdsQueue: [],
    botState: null,
    botStateTick: 0,
    players: [
      {
        playerId: 'p1',
        clientId: ws.__cid,
        nick: nick || 'Player 1',
        role: 'host',
        connected: true,
        isBot: false,
        difficulty: null
      }
    ]
  };


  matches.set(matchId, match);
  ws.__matchId = matchId;
  ws.__playerId = 'p1';
  return match;
}

function joinMatchForClient(ws, matchId, nick) {
  const match = matches.get(matchId);
  if (!match) {
    const err = new Error('match_not_found');
    err.code = 'match_not_found';
    throw err;
  }
  if (match.players.length >= 2) {
    const err = new Error('match_full');
    err.code = 'match_full';
    throw err;
  }
  if (match.status === 'finished') {
    const err = new Error('match_finished');
    err.code = 'match_finished';
    throw err;
  }

  const playerId = 'p' + (match.players.length + 1);
  const player = {
    playerId,
    clientId: ws.__cid,
    nick: nick || `Player ${match.players.length + 1}`,
    role: match.players.length === 0 ? 'host' : 'guest',
    connected: true,
    isBot: false,
    difficulty: null
  };

  match.players.push(player);
  match.status = 'ready';
  match.lastActivityAt = Date.now();

  ws.__matchId = matchId;
  ws.__playerId = playerId;

  return match;
}

function addBotToMatch(matchId, difficulty = 'easy') {
  const match = matches.get(matchId);
  if (!match) {
    const err = new Error('match_not_found');
    err.code = 'match_not_found';
    throw err;
  }
  if (match.players.length >= 2) {
    const err = new Error('match_full');
    err.code = 'match_full';
    throw err;
  }
  if (match.status === 'finished') {
    const err = new Error('match_finished');
    err.code = 'match_finished';
    throw err;
  }

  const playerId = 'bot';
  const nick =
    difficulty === 'hard'   ? 'Bot-Hard'   :
    difficulty === 'medium' ? 'Bot-Medium' :
    'Bot-Easy';

  const player = {
    playerId,
    clientId: null, // Bot hängt nicht an einem echten WebSocket
    nick,
    role: match.players.length === 0 ? 'host' : 'guest',
    connected: true,
    isBot: true,
    difficulty
  };

  match.players.push(player);
  match.status = 'ready';
  match.lastActivityAt = Date.now();

  return match;
}

function markPlayerDisconnected(ws) {
  const matchId = ws.__matchId;
  const playerId = ws.__playerId;
  if (!matchId || !playerId) return;
  const match = matches.get(matchId);
  if (!match) return;
  const player = match.players.find(p => p.playerId === playerId);
  if (!player) return;
  player.connected = false;
  match.lastActivityAt = Date.now();
}

function updateMatchGameState(matchId, gameState, meta = {}) {
  const match = matches.get(matchId);
  if (!match) return;

  // P1.2: Legacy client-supplied state is no longer authoritative.
  // Ignore empty or client-pushed full states to prevent corruption.
  if (!gameState || typeof gameState !== 'object') {
    return;
  }

  // If server has an authoritative snapshot, never overwrite it with client state
  if (match.lastSnapshot && match.lastSnapshot.state) {
    return;
  }

  match.lastGameState = gameState;

  // P1.2: legacy path retained for compatibility, but guarded above
  const at = meta.at || new Date().toISOString();
  try {
    const inv = validateInvariant(gameState);
    match.lastInvariant = { ...inv, at };
    if (!inv.ok) {
      match.isCorrupt = true;
      const RED = '\x1b[31m';
      const RESET = '\x1b[0m';
      console.warn(`${RED}[CORRUPTION] matchId=${matchId} rev=${typeof match.matchRev === 'number' ? match.matchRev : 0} reason=${inv.reason} expected=${inv.expectedTotalCards} found=${inv.foundTotalCards} missing=${inv.missingCount} dupes=${(inv.dupes||[]).length} unk=${(inv.unknownIds||[]).length} truncated=${inv.truncated} hash=${inv.snapshotHash}${RESET}`);
    } else {
      match.isCorrupt = false;
    }
  } catch (e) {
    match.lastInvariant = { ok: false, reason: 'invariant_check_failed', error: String(e && e.message ? e.message : e), at };
    match.isCorrupt = true;
    const RED = '\x1b[31m';
    const RESET = '\x1b[0m';
    console.warn(`${RED}[CORRUPTION] matchId=${matchId} reason=invariant_check_failed error=${String(e && e.message ? e.message : e)}${RESET}`);
  }

  match.lastActivityAt = Date.now();

  // P1 note: updateMatchGameState is legacy (client-supplied state). In server-authoritative mode, only setAuthoritativeState/applyMove should update canonical state.

    const seed = meta.seed || match.seed || (gameState && gameState.seed) || null;
  const fromCid = meta.fromCid || null;
  try {
    cacheSnapshot(matchId, gameState, { seed, fromCid, at });
  } catch {}  

}
function getLastInvariant(matchId) {
  const match = matches.get(matchId);
  return match ? match.lastInvariant || null : null;
}

function updateBotState(matchId, botState) {
  const match = matches.get(matchId);
  if (!match) return;
  if (!botState || typeof botState !== 'object') return;

  // Normalisierte, für den Bot relevante Sicht auf den Spielzustand speichern.
  // Erwartete Struktur (vom Client geliefert):
  // {
  //   tick: number,
  //   stockCount: number,
  //   wasteTop: { rank: number, suit: string } | null,
  //   foundation: { [suit: string]: number }, // höchste Ränge pro Farbe
  //   tableauHeights: number[],               // Kartenanzahl pro Tableau-Stack
  //   movesSinceLastFlip: number
  // }
  const prevTick = match.botState && typeof match.botState.tick === 'number'
    ? match.botState.tick
    : 0;

  const normalized = {
    tick: typeof botState.tick === 'number' ? botState.tick : prevTick + 1,
    stockCount:
      typeof botState.stockCount === 'number'
        ? botState.stockCount
        : null,
    wasteTop:
      botState.wasteTop && typeof botState.wasteTop === 'object'
        ? {
            rank: botState.wasteTop.rank ?? null,
            suit: botState.wasteTop.suit ?? null
          }
        : null,
    foundation:
      botState.foundation && typeof botState.foundation === 'object'
        ? botState.foundation
        : null,
    tableauHeights:
      Array.isArray(botState.tableauHeights)
        ? botState.tableauHeights.slice()
        : null,
    movesSinceLastFlip:
      typeof botState.movesSinceLastFlip === 'number'
        ? botState.movesSinceLastFlip
        : null
  };

  match.botState = normalized;
  match.botStateTick = normalized.tick;
  match.lastActivityAt = Date.now();
}

function getBotState(matchId) {
  const match = matches.get(matchId);
  return match ? match.botState || null : null;
}

function getMatch(matchId) {
  return matches.get(matchId) || null;
}

function getPublicMatchView(match) {
  return {
    matchId: match.matchId,
    seed: match.seed,
    status: match.status,
    createdAt: match.createdAt,
    players: match.players.map(p => ({
      playerId: p.playerId,
      nick: p.nick,
      role: p.role,
      connected: !!p.connected,
      isBot: !!p.isBot,
      difficulty: p.difficulty || null
    }))
  };
}

function cleanupOldMatches(ttlMs = 60 * 60 * 1000) {
  const now = Date.now();
  let removed = 0;
  for (const [id, match] of matches.entries()) {
    if (now - match.lastActivityAt > ttlMs) {
      matches.delete(id);
      // Note: match-scoped Sets (recentMoveIds) and cached snapshots are freed with the match object.
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[MATCH] Cleaned up ${removed} old matches`);
  }
}

module.exports = {
  createMatchForClient,
  joinMatchForClient,
  addBotToMatch,
  markPlayerDisconnected,
  getPublicMatchView,
  cleanupOldMatches,
  getMatch,
  updateMatchGameState,
  updateBotState,
  getBotState,

  // M7 drift hardening helpers
  fnv1a64,
  bumpMatchRev,
  rememberMoveId,
  cacheSnapshot,
  getCachedSnapshot,
  validateInvariant,
  getLastInvariant,

  // P1 helpers
  getSnapshot,
  setAuthoritativeState,
  createInitialGameState,
  createInitialBotStateLegacy,
  ensureInitialSnapshot,
  getSnapshotForPlayer,
  // P1 move helpers (legacy iOS↔BOT validation/apply)
  validateMove,
  applyMove,
  validateAndApplyMove
};
