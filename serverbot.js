// serverbot.js
// ================================================================
//  Solitaire HighNoon - Server-Bot Modul
//  Enthält:
//   - Bot-Registry (per Match)
//   - Bot-State-Speicher (Snapshots vom Client)
//   - Metrics-Berechnung
//   - Entscheidungslogik & Move-Mapping
// ================================================================
// Changelog:
// -v1.5: fix Foundation moves
// -v1.6: improve Waste→Tableau moves
// ================================================================


const botsByMatch = new Map();     // matchId -> bot
const botStateByMatch = new Map(); // matchId -> letzter Snapshot-State

const SERVERBOT_API_VERSION = 2;

const BOT_DEBUG = process.env.BOT_DEBUG === '1';

const BOT_LOG_THROTTLE_MS = Number(process.env.BOT_LOG_THROTTLE_MS || 5000);

// Decision pacing (ms) – keep bot moves human-like
const BOT_MOVE_DELAY_MIN_MS = Number(process.env.BOT_MOVE_DELAY_MIN_MS || 2000);
const BOT_MOVE_DELAY_MAX_MS = Number(process.env.BOT_MOVE_DELAY_MAX_MS || 5000);

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function randInt(min, max) {
  const a = Math.floor(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}

function nextMoveDelayMs(bot) {
  // Difficulty can later scale this; for now, configurable and shared
  const min = clamp(BOT_MOVE_DELAY_MIN_MS, 250, 60000);
  const max = clamp(BOT_MOVE_DELAY_MAX_MS, min, 60000);
  return randInt(min, max);
}

function scheduleNextAction(bot) {
  bot.nextActionAt = Date.now() + nextMoveDelayMs(bot);
}

function normalizeSuit(s) {
  if (!s) return '';
  // Accept both symbol and word forms (singular and plural)
  switch (s) {
    case '♥': case 'hearts': case 'heart': return '♥';
    case '♦': case 'diamonds': case 'diamond': return '♦';
    case '♣': case 'clubs': case 'club': return '♣';
    case '♠': case 'spades': case 'spade': return '♠';
    default: return String(s);
  }
}

function parseRankValue(v) {
  if (v == null) return null;

  // If it's already numeric, keep it.
  const n = Number(v);
  if (Number.isFinite(n)) return n;

  // For face cards, use ONE-BASED values (A=1..K=13). This avoids
  // mis-inferring zeroBased when ranks are provided as strings.
  const s = String(v).trim().toUpperCase();
  if (!s) return null;
  if (s === 'A' || s === 'ACE') return 1;
  if (s === 'J' || s === 'JACK') return 11;
  if (s === 'Q' || s === 'QUEEN') return 12;
  if (s === 'K' || s === 'KING') return 13;

  // For numeric strings that weren't finite above (e.g. weird formats), try parseInt.
  const i = parseInt(s, 10);
  return Number.isFinite(i) ? i : null;
}

function rankN(c) {
  return parseRankValue(c && c.rank);
}

// Infer whether the client uses 0-based ranks (A=0..K=12) or 1-based (A=1..K=13)
function inferRankSchemeFromSnapshot(snapshot) {
  try {
    const ranks = [];

    // Detailed arrays preferred
    if (snapshot && snapshot.tableauFull) {
      const tFull = snapshot.tableauFull;
      const piles = ([])
        .concat(Array.isArray(tFull.you) ? tFull.you : [])
        .concat(Array.isArray(tFull.opp) ? tFull.opp : []);
      for (const pile of piles) {
        if (!Array.isArray(pile)) continue;
        for (const c of pile) {
          const r = rankN(c);
          if (r != null) ranks.push(r);
        }
      }
    }

    if (snapshot && snapshot.wasteFull) {
      const wFull = snapshot.wasteFull;
      const cards = ([])
        .concat(Array.isArray(wFull.you) ? wFull.you : [])
        .concat(Array.isArray(wFull.opp) ? wFull.opp : []);
      for (const c of cards) {
        const r = rankN(c);
        if (r != null) ranks.push(r);
      }
    }

    if (snapshot && Array.isArray(snapshot.foundations)) {
      for (const f of snapshot.foundations) {
        const cards = Array.isArray(f && f.cards) ? f.cards : [];
        for (const c of cards) {
          const r = rankN(c);
          if (r != null) ranks.push(r);
        }
      }
    }

    // If we didn't see ranks, fall back to unknown
    if (!ranks.length) return 'unknown';

    const min = Math.min(...ranks);
    const max = Math.max(...ranks);

    // Strong signals
    // - zeroBased clients typically use 0..12 (A=0, K=12)
    // - oneBased clients typically use 1..13 (A=1, K=13)
    if (ranks.includes(0) || min === 0) return 'zeroBased';
    if (ranks.includes(13) || max === 13) return 'oneBased';

    // If we only see 1..12, default to oneBased (safer for foundation progression: A(1)->2(2)).
    if (min >= 1 && max <= 13) return 'oneBased';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

function isAceCard(c, scheme = 'unknown') {
  const r = rankN(c);
  if (r == null) return false;
  if (scheme === 'zeroBased') return r === 0;
  if (scheme === 'oneBased') return r === 1;
  // Unknown: prefer oneBased (A=1) because it enables correct foundation progression (A->2).
  // zeroBased will be inferred as soon as we see any 0-rank numeric cards.
  return r === 1;
}

function isKingCard(c, scheme = 'unknown') {
  const r = rankN(c);
  if (r == null) return false;
  if (scheme === 'zeroBased') return r === 12;
  if (scheme === 'oneBased') return r === 13;
  // Unknown conservative
  return r === 12;
}

function canPlaceOnFoundation(card, foundationObj, scheme = 'unknown') {
  if (!card || !foundationObj) return false;
  const destCards = Array.isArray(foundationObj.cards) ? foundationObj.cards : [];
  const destSuit  = normalizeSuit(foundationObj.suit);
  const cardSuit  = normalizeSuit(card.suit);

  // If foundation has a declared suit, it must match.
  if (destSuit && cardSuit && destSuit !== cardSuit) return false;

  // Empty foundation: ONLY an Ace can start (Ace may be rank 0 or 1 depending on client)
  if (!destCards.length) return isAceCard(card, scheme);

  // Safety: never allow an Ace onto a non-empty foundation (guards against bad rank-scheme inference)
  if (isAceCard(card, scheme)) return false;

  const top = destCards[destCards.length - 1];
  const topSuit = normalizeSuit(top && top.suit);
  if (topSuit && cardSuit && topSuit !== cardSuit) return false;

  const topR = rankN(top);
  const cardR = rankN(card);
  if (topR == null || cardR == null) return false;

  // Standard ascending-by-1 within same suit (works for both 0..12 and 1..13 rank schemes)
  return cardR === topR + 1;
}

function canPlaceOnTableau(card, destTop, scheme = 'unknown') {
  if (!card) return false;

  const cardR = rankN(card);
  if (cardR == null) return false;

  // Empty tableau pile: only King (can be 12 or 13 depending on client)
  if (!destTop) return isKingCard(card, scheme);

  const destR = rankN(destTop);
  if (destR == null) return false;

  // Alternating colors & descending by 1
  return (isRedCard(card) !== isRedCard(destTop)) && (destR === cardR + 1);
}

function log(...args) {
  console.log(...args);
}

function warn(...args) {
  console.warn(...args);
}

function isoNow() {
  return new Date().toISOString();
}

// --- Metrics aus Snapshot-State ableiten (kopiert aus server.js, leicht angepasst) ---
function computeBotMetrics(state) {
  const metrics = {
    foundationCards: 0,
    foundationPiles: 0,
    wasteSize: 0,
    tableauPiles: 0,
    nonEmptyTableauPiles: 0,
    stockCount: 0,
    movesPlayed: typeof state?.moves === 'number' ? state.moves : null,
    score: typeof state?.score === 'number' ? state.score : null,
    timeElapsed: typeof state?.timeElapsed === 'number' ? state.timeElapsed : null
  };

  // ältere/alternative Snapshot-Schemas tolerieren
  if (Array.isArray(state?.foundation)) {
    metrics.foundationPiles = state.foundation.length;
    for (const pile of state.foundation) {
      if (Array.isArray(pile)) {
        metrics.foundationCards += pile.length;
      }
    }
  }

  if (Array.isArray(state?.waste)) {
    metrics.wasteSize = state.waste.length;
  }

  if (Array.isArray(state?.tableau)) {
    metrics.tableauPiles = state.tableau.length;
    for (const pile of state.tableau) {
      if (Array.isArray(pile) && pile.length > 0) {
        metrics.nonEmptyTableauPiles++;
      }
    }
  }

  if (typeof state?.stockCount === 'number') {
    metrics.stockCount = state.stockCount;
  }

  // --- Fallbacks: Aggregierte Snapshot-Felder ---
  if (!metrics.foundationCards && state && (state.foundationsTotal != null || state.foundationCards != null)) {
    const raw = state.foundationsTotal != null ? state.foundationsTotal : state.foundationCards;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      metrics.foundationCards = n;
    }
  }

  if (!metrics.wasteSize && state && state.wasteSize != null) {
    const n = Number(state.wasteSize);
    if (Number.isFinite(n) && n >= 0) {
      metrics.wasteSize = n;
    }
  }

  if (!metrics.tableauPiles && state && state.tableauPiles != null) {
    const n = Number(state.tableauPiles);
    if (Number.isFinite(n) && n >= 0) {
      metrics.tableauPiles = n;
    }
  }

  if (!metrics.nonEmptyTableauPiles && state && state.nonEmptyTableauPiles != null) {
    const n = Number(state.nonEmptyTableauPiles);
    if (Number.isFinite(n) && n >= 0) {
      metrics.nonEmptyTableauPiles = n;
    }
  }

  if (!metrics.stockCount && state && state.stockCount != null) {
    const n = Number(state.stockCount);
    if (Number.isFinite(n) && n >= 0) {
      metrics.stockCount = n;
    }
  }

  // Debug für Foundations (nur bei BOT_DEBUG)
  if (BOT_DEBUG && state && (state.foundationsTotal != null || state.foundationCards != null)) {
    const raw = state.foundationsTotal != null ? state.foundationsTotal : state.foundationCards;
    log('[BOT] debug foundations snapshot raw=', raw, 'metrics.foundationCards=', metrics.foundationCards);
  }

  return metrics;
}

// --- Bot-Registry ---
function createServerBot(matchId, difficulty = 'easy', opts = {}) {
  const botId = 'bot-' + Math.random().toString(36).slice(2);
  const botNick =
    difficulty === 'hard'   ? 'Bot-Hard'   :
    difficulty === 'medium' ? 'Bot-Medium' :
    'Bot-Easy';

  const bot = {
    id: botId,
    matchId,
    difficulty,
    nick: botNick,
    createdAt: Date.now(),
    lastMoveAt: 0,
    lastFlipAt: 0,
    state: null,
    stateMetrics: null,
    lastSeenStateAt: 0
    ,lastHeartbeatLogAt: 0
    ,lastMetricsLogAt: 0
    ,lastStateLogAt: 0
    ,nextActionAt: 0
    ,lastWasteResetAt: 0
    ,rankScheme: 'unknown'
    ,recentMoveSigs: []
  };

  botsByMatch.set(matchId, bot);

  if (!opts || opts.silent !== true) {
    // Klarer, damit man es von server.js Logs unterscheiden kann
    log(
      `[BOT] serverbot created botId="${botId}" matchId="${matchId}" difficulty=${difficulty} nick="${botNick}"`
    );
  }

  return bot;
}

function getServerBot(matchId) {
  return botsByMatch.get(matchId) || null;
}

function removeServerBot(matchId) {
  if (botsByMatch.delete(matchId)) {
    botStateByMatch.delete(matchId);
    log(`[BOT] removed bot for matchId="${matchId}"`);
  }
}

// --- State-Updates vom Client ---
function handleBotStateUpdate(matchId, state, cid, tickValue) {
  const bot = getServerBot(matchId);
  if (!bot) {
    // kein Bot für dieses Match → ignorieren
    return;
  }

  if (!state || typeof state !== 'object') {
    log(
      `[BOT] state update ignored matchId="${matchId}" (no or non-object state)`
    );
    return;
  }

  botStateByMatch.set(matchId, state);

  const metrics = computeBotMetrics(state);

  bot.state = state;
  bot.stateMetrics = metrics;
  bot.lastSeenStateAt = Date.now();

  const tick = tickValue ?? state.tick ?? 'n/a';

  const now = Date.now();
  if (BOT_DEBUG || !bot.lastStateLogAt || (now - bot.lastStateLogAt) >= BOT_LOG_THROTTLE_MS) {
    bot.lastStateLogAt = now;
    log(
      `[BOT] state update matchId="${matchId}" cid=${cid} tick="${tick}" ` +
      `f=${metrics.foundationCards} w=${metrics.wasteSize} s=${metrics.stockCount} ` +
      `moves=${metrics.movesPlayed ?? 'n/a'} score=${metrics.score ?? 'n/a'}`
    );
  }
}

// --- Hilfsfunktionen für die Entscheidungslogik ---

function hasDetailedState(s) {
  return !!(
    s &&
    s.tableauFull &&
    Array.isArray(s.tableauFull.you) &&
    s.wasteFull &&
    Array.isArray(s.wasteFull.you) &&
    Array.isArray(s.foundations)
  );
}

function pickBotSideArrays(snapshot, botSideKey) {
  if (!snapshot) return { tableau: [], waste: [] };
  const tFull = snapshot.tableauFull || {};
  const wFull = snapshot.wasteFull || {};

  const t = (botSideKey === 'opp') ? tFull.opp : tFull.you;
  const w = (botSideKey === 'opp') ? wFull.opp : wFull.you;

  const tableau = Array.isArray(t) ? t : [];
  const waste   = Array.isArray(w) ? w : [];
  return { tableau, waste };
}

function inferOwnerFromCardId(cardId, fallbackOwner = 'Y') {
  if (typeof cardId === 'string') {
    if (cardId.startsWith('Y-')) return 'Y';
    if (cardId.startsWith('O-')) return 'O';
  }
  return fallbackOwner;
}

function isRedCard(c) {
  const s = normalizeSuit(c && c.suit);
  return s === '♥' || s === '♦';
}

// --- Herzstück: ein Decision-Tick für einen Bot (exported as runBotDecisionTick) ---
function runBotDecisionTick(matchId, deps) {
  const broadcastFn = deps && typeof deps.broadcastToRoom === 'function'
    ? deps.broadcastToRoom
    : null;

  if (!broadcastFn) {
    warn('[BOT] serverbot.runBotDecisionTick: deps.broadcastToRoom missing (cannot send moves)');
    return;
  }

  const matchBot = getServerBot(matchId);
  if (!matchBot) return;

  const state = botStateByMatch.get(matchId) || matchBot.state || null;

  // Infer/carry rank scheme (0-based vs 1-based) so we don't mis-detect A/2.
  const inferredScheme = inferRankSchemeFromSnapshot(state);
  if (inferredScheme !== 'unknown') matchBot.rankScheme = inferredScheme;
  const scheme = matchBot.rankScheme || 'unknown';

  // snapshot.owner is the "local" player (human host on this device)
  const humanOwner = (state && typeof state.owner === 'string' && state.owner) ? state.owner : 'Y';
  const botOwner   = humanOwner === 'Y' ? 'O' : 'Y';

  // In the client snapshot, `owner` denotes the local/human owner on that device.
  // The bot is the opponent of that local owner.
  const botSideKey = botOwner === 'O' ? 'opp' : 'you';

  // Prefer authoritative counts from detailed arrays (bot side), then fall back to metrics.
  const botSide = (state && state[botSideKey] && typeof state[botSideKey] === 'object') ? state[botSideKey] : null;

  const botStockCount = (botSide && Array.isArray(botSide.stock))
    ? botSide.stock.length
    : (state && state.metrics && state.metrics[botSideKey] && Number.isFinite(Number(state.metrics[botSideKey].stockCount))
        ? Number(state.metrics[botSideKey].stockCount)
        : 0);

  const botWasteCount = (botSide && Array.isArray(botSide.waste))
    ? botSide.waste.length
    : (state && state.metrics && state.metrics[botSideKey] && Number.isFinite(Number(state.metrics[botSideKey].wasteCount))
        ? Number(state.metrics[botSideKey].wasteCount)
        : 0);

  // Allow recycle to bypass pacing if bot stock is empty but bot waste still has cards
  const wantsRecycleFastPath = (botStockCount === 0) && (botWasteCount > 0);
  if (!wantsRecycleFastPath && matchBot.nextActionAt && Date.now() < matchBot.nextActionAt) return;

  const nowHb = Date.now();
  if (BOT_DEBUG || !matchBot.lastHeartbeatLogAt || (nowHb - matchBot.lastHeartbeatLogAt) >= BOT_LOG_THROTTLE_MS) {
    matchBot.lastHeartbeatLogAt = nowHb;
    log(`[BOT] heartbeat matchId="${matchId}" botId="${matchBot.id}" diff=${matchBot.difficulty}`);
  }

  const metrics = state ? computeBotMetrics(state) : null;
  const nowMx = Date.now();
  if (BOT_DEBUG || !matchBot.lastMetricsLogAt || (nowMx - matchBot.lastMetricsLogAt) >= BOT_LOG_THROTTLE_MS) {
    matchBot.lastMetricsLogAt = nowMx;
    if (metrics) {
      log(
        `[BOT] metrics matchId="${matchId}" f=${metrics.foundationCards} w=${metrics.wasteSize} s=${metrics.stockCount} ` +
        `t=${metrics.tableauPiles} nt=${metrics.nonEmptyTableauPiles} ` +
        `| botSide=${botSideKey} botStock=${botStockCount ?? 'n/a'} botWaste=${botWasteCount ?? 'n/a'}`
      );
    } else {
      log(`[BOT] metrics matchId="${matchId}" (noch kein Snapshot vom Client)`);
    }
  }

  function sendMovePayload(movePayload, kindLabel, debugInfo) {
    const envelope = JSON.stringify({ move: movePayload, from: matchBot.id });
    broadcastFn(envelope);

    try {
      const sig = `${movePayload.kind}:${movePayload.cardId || ''}:${(movePayload.from && movePayload.from.uiIndex) ?? ''}->${(movePayload.to && (movePayload.to.uiIndex ?? movePayload.to.f)) ?? ''}`;
      const now = Date.now();
      if (!Array.isArray(matchBot.recentMoveSigs)) matchBot.recentMoveSigs = [];
      matchBot.recentMoveSigs.push({ sig, at: now });
      matchBot.recentMoveSigs = matchBot.recentMoveSigs.filter(x => x && (now - x.at) < 20000).slice(-10);
    } catch {}

    matchBot.lastMoveAt = Date.now();
    scheduleNextAction(matchBot);

    log(
      `[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="${kindLabel}"` +
      (debugInfo ? ` details=${debugInfo}` : '')
    );
  }

  // Foundations are SHARED between bot and player.
  // IMPORTANT (per game.js applyMove): `move.to.f` is used as a direct index into
  // `state.foundations[targetF]`. Your client snapshot exposes 8 foundation slots,
  // so the bot must consider indices 0..7 (NOT 0..3).

  function pickBestFoundationIndexForCard(foundationsArr, card) {
    if (!card) return null;

    const cardSuit = normalizeSuit(card.suit);
    if (!cardSuit) return null;

    let bestIdx = null;
    let bestLen = -1;
    let bestTopR = -1;

    for (let i = 0; i < foundationsArr.length; i++) {
      const fObj = foundationsArr[i];
      if (!fObj) continue;

      // Suit gating: if a foundation declares a suit, it must match.
      const destSuit = normalizeSuit(fObj.suit);
      if (destSuit && cardSuit && destSuit !== cardSuit) continue;

      // Validate legality with the same rules we use everywhere.
      if (!canPlaceOnFoundation(card, fObj, scheme)) continue;

      const cards = Array.isArray(fObj.cards) ? fObj.cards : [];
      const top = cards.length ? cards[cards.length - 1] : null;
      const topR = top ? (rankN(top) ?? -1) : -1;

      // Selection policy:
      // 1) Prefer continuing an existing (non-empty) foundation over starting a new one.
      // 2) Within that, prefer the foundation with the highest top rank (most progressed).
      // 3) If multiple match, keep first.
      if (cards.length > bestLen || (cards.length === bestLen && topR > bestTopR)) {
        bestIdx = i;
        bestLen = cards.length;
        bestTopR = topR;
      }
    }

    return bestIdx;
  }

  let decided = false;

  if (state && hasDetailedState(state)) {
    const s = state;
    const { tableau, waste } = pickBotSideArrays(s, botSideKey);
    const foundations = Array.isArray(s.foundations) ? s.foundations : [];

    // Decide which foundation index (0..7) a card can go to.
    function findFoundationDestination(card) {
      const idx = pickBestFoundationIndexForCard(foundations, card);
      return (idx != null) ? { localIndex: idx, rangeLabel: 'shared', globalIndex: idx } : null;
    }

    // 1) Aces first (tableau → foundation, then waste → foundation)
    for (let t = 0; t < tableau.length && !decided; t++) {
      const pile = tableau[t];
      if (!Array.isArray(pile) || !pile.length) continue;
      const card = pile[pile.length - 1];
      if (!card || card.up === false) continue;
      if (!isAceCard(card, scheme)) continue;

      const dest = findFoundationDestination(card);
      if (!dest) continue;

      const cardId = card.id || card.cardId;
      const owner = inferOwnerFromCardId(cardId, botOwner);

      sendMovePayload({
        owner,
        kind: 'toFound',
        cardId,
        count: 1,
        from: { kind: 'pile', sideOwner: owner, uiIndex: t },
        to: { kind: 'found', f: dest.localIndex }
      }, 'toFound', `ACE fromTableau=${t} f=${dest.localIndex} (${dest.rangeLabel}) suit=${card.suit}`);

      decided = true;
    }

    if (!decided && Array.isArray(waste) && waste.length) {
      const card = waste[waste.length - 1];
      if (card && card.up !== false && isAceCard(card, scheme)) {
        const dest = findFoundationDestination(card);
        if (dest) {
          const cardId = card.id || card.cardId;
          const owner = inferOwnerFromCardId(cardId, botOwner);

          sendMovePayload({
            owner,
            kind: 'toFound',
            cardId,
            count: 1,
            from: { kind: 'pile', sideOwner: owner, uiIndex: -1 },
            to: { kind: 'found', f: dest.localIndex }
          }, 'toFound', `ACE fromWaste f=${dest.localIndex} (${dest.rangeLabel}) suit=${card.suit}`);

          decided = true;
        }
      }
    }

    // 2) Foundation progress (legal sequence)
    for (let t = 0; t < tableau.length && !decided; t++) {
      const pile = tableau[t];
      if (!Array.isArray(pile) || !pile.length) continue;
      const card = pile[pile.length - 1];
      if (!card || card.up === false) continue;

      const dest = findFoundationDestination(card);
      if (!dest) continue;

      const cardId = card.id || card.cardId;
      const owner = inferOwnerFromCardId(cardId, botOwner);

      sendMovePayload({
        owner,
        kind: 'toFound',
        cardId,
        count: 1,
        from: { kind: 'pile', sideOwner: owner, uiIndex: t },
        to: { kind: 'found', f: dest.localIndex }
      }, 'toFound', `fromTableau=${t} f=${dest.localIndex} rank=${card.rank} suit=${card.suit}`);

      decided = true;
    }

    if (!decided && Array.isArray(waste) && waste.length) {
      const card = waste[waste.length - 1];
      if (card && card.up !== false) {
        const dest = findFoundationDestination(card);
        if (dest) {
          const cardId = card.id || card.cardId;
          const owner = inferOwnerFromCardId(cardId, botOwner);

          sendMovePayload({
            owner,
            kind: 'toFound',
            cardId,
            count: 1,
            from: { kind: 'pile', sideOwner: owner, uiIndex: -1 },
            to: { kind: 'found', f: dest.localIndex }
          }, 'toFound', `fromWaste f=${dest.localIndex} rank=${card.rank} suit=${card.suit}`);

          decided = true;
        }
      }
    }

    // 3) Tableau cleanup/uncover (avoid ping-pong)
    if (!decided) {
      let best = null;

      for (let fromT = 0; fromT < tableau.length; fromT++) {
        const pile = tableau[fromT];
        if (!Array.isArray(pile) || pile.length < 1) continue;
        const card = pile[pile.length - 1];
        if (!card || card.up === false) continue;

        // If this card can already be placed onto a foundation, don't waste moves bouncing it in tableau.
        // The foundation-progress step will take it.
        if (findFoundationDestination(card)) continue;

        const wouldRevealFaceDown = (pile.length >= 2) && (pile[pile.length - 2].up === false);

        for (let toT = 0; toT < tableau.length; toT++) {
          if (toT === fromT) continue;
          const dest = tableau[toT];
          if (!Array.isArray(dest)) continue;

          const destTop = dest.length ? dest[dest.length - 1] : null;
          if (!canPlaceOnTableau(card, destTop, scheme)) continue;

          try {
            const recent = Array.isArray(matchBot.recentMoveSigs) ? matchBot.recentMoveSigs : [];
            const reverseSig = `toPile:${card.id || card.cardId || ''}:${toT}->${fromT}`;
            const now = Date.now();
            const seenReverse = recent.some(x => x && x.sig === reverseSig && (now - x.at) < 8000);
            if (seenReverse) continue;
          } catch {}

          const r = rankN(card) ?? 99;
          const score = (wouldRevealFaceDown ? 100 : 0) + (destTop ? 10 : 0) + (20 - r);
          if (!best || score > best.score) best = { score, fromT, toT, card };
        }
      }

      if (best) {
        const cardId = best.card.id || best.card.cardId;
        const owner = inferOwnerFromCardId(cardId, botOwner);

        sendMovePayload({
          owner,
          kind: 'toPile',
          cardId,
          count: 1,
          from: { kind: 'pile', sideOwner: owner, uiIndex: best.fromT },
          to: { kind: 'pile', sideOwner: owner, uiIndex: best.toT }
        }, 'toPile', `tableau from=${best.fromT} to=${best.toT} rank=${best.card.rank} suit=${best.card.suit}`);

        decided = true;
      }
    }

    // 4) Waste → tableau last
    if (!decided && Array.isArray(waste) && waste.length) {
      const card = waste[waste.length - 1];
      if (card && card.up !== false) {
        for (let t = 0; t < tableau.length; t++) {
          const dest = tableau[t];
          if (!Array.isArray(dest)) continue;
          const destTop = dest.length ? dest[dest.length - 1] : null;
          if (!canPlaceOnTableau(card, destTop, scheme)) continue;

          const cardId = card.id || card.cardId;
          const owner = inferOwnerFromCardId(cardId, botOwner);

          sendMovePayload({
            owner,
            kind: 'toPile',
            cardId,
            count: 1,
            from: { kind: 'pile', sideOwner: owner, uiIndex: -1 },
            to: { kind: 'pile', sideOwner: owner, uiIndex: t }
          }, 'toPile', `waste toTableau=${t} rank=${card.rank} suit=${card.suit}`);

          decided = true;
          break;
        }
      }
    }
  } else if (state) {
    log(`[BOT] decision skipped matchId="${matchId}" – Snapshot enthält keine detaillierten Karten-Arrays`);
  }

  // Stock/Waste as last resort:
  // - if bot stock has cards: flip
  // - else if bot waste has cards: recycle
  // - else: do nothing (tableau-only endgame)
  if (!decided) {
    const nowT = Date.now();

    const wantsRecycle = (botStockCount === 0) && (botWasteCount > 0);
    const wantsFlip    = (botStockCount > 0);

    // throttle:
    const minCooldown = wantsRecycle ? 1200 : 2500;
    const canActNow = !matchBot.lastFlipAt || (nowT - matchBot.lastFlipAt) > minCooldown;

    if (canActNow && (wantsFlip || wantsRecycle)) {
      const kind = wantsRecycle ? 'recycle' : 'flip';

      // Best-effort: enrich moves so mirror clients (iOS) can update Stock/Waste without snapshot spam.
      // Keep it backward compatible: extra fields are ignored by older clients.
      const move = { owner: botOwner, kind };

      try {
        if (kind === 'flip') {
          move.from = { kind: 'stock', sideOwner: botOwner };
          move.to   = { kind: 'waste', sideOwner: botOwner };
          move.count = 1;

          // Try to attach the flipped cardId if we have a detailed snapshot.
          // In snapshots, stock is typically ordered [base ... top], so the last card is the next to draw.
          const botSideNow = (state && state[botSideKey] && typeof state[botSideKey] === 'object') ? state[botSideKey] : null;
          if (botSideNow && Array.isArray(botSideNow.stock) && botSideNow.stock.length) {
            const top = botSideNow.stock[botSideNow.stock.length - 1];
            const cardId = (top && (top.id || top.cardId)) ? (top.id || top.cardId) : null;
            if (cardId) move.cardId = cardId;
          }

          // Post-move counts
          move.stockCount = Math.max(0, botStockCount - 1);
          move.wasteCount = Math.max(0, botWasteCount + 1);
        } else {
          // recycle
          move.from = { kind: 'waste', sideOwner: botOwner };
          move.to   = { kind: 'stock', sideOwner: botOwner };
          // indicates multi-card recycle; clients can ignore
          move.count = 0;

          // Post-move counts: all waste goes back to stock
          move.stockCount = Math.max(0, botStockCount + botWasteCount);
          move.wasteCount = 0;
        }
      } catch (e) {
        // Never break sending a move because of enrich failures.
      }

      broadcastFn(JSON.stringify({ move, from: matchBot.id }));

      matchBot.lastMoveAt = nowT;
      matchBot.lastFlipAt = nowT;

      // After recycle, act again sooner to start flipping from refreshed stock.
      matchBot.nextActionAt = wantsRecycle
        ? (nowT + randInt(700, 1400))
        : (nowT + nextMoveDelayMs(matchBot));

      log(`[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="${kind}"`);
    }
  }
}

function runBotHeartbeatTick(matchId, broadcastCb) {
  // Backwards-compatible alias: wrap legacy signature into the new deps signature
  return runBotDecisionTick(matchId, { broadcastToRoom: broadcastCb });
}

module.exports = {
  // API metadata
  SERVERBOT_API_VERSION,

  // Registry
  createServerBot,
  getServerBot,
  removeServerBot,

  // State ingest
  handleBotStateUpdate,

  // Decision tick (what server.js expects)
  runBotDecisionTick,

  // legacy alias
  runBotHeartbeatTick,

  // Expose internal maps for debugging/advanced use (optional)
  botsByMatch,
  botStateByMatch,

  // Utilities (optional)
  computeBotMetrics
};