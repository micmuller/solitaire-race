// matches.js
// In-memory Match Management für Solitaire HighNoon
// Phase 1: create_match / join_match
// -----------------------------------------------------------------------------
// Versionierung / Patch-Log (BITTE bei JEDEM Patch aktualisieren)
// -----------------------------------------------------------------------------
// Date (YYYY-MM-DD) | Version  | Change
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
  getSnapshotForPlayer
};