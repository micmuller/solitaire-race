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
// -v1.1: Erste Version, Basis-Funktionalität easy Bot - brocken
// ================================================================


const botsByMatch = new Map();     // matchId -> bot
const botStateByMatch = new Map(); // matchId -> letzter Snapshot-State

const SERVERBOT_API_VERSION = 1;

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
  // Accept both symbol and word forms
  switch (s) {
    case '♥': case 'hearts': return '♥';
    case '♦': case 'diamonds': return '♦';
    case '♣': case 'clubs': return '♣';
    case '♠': case 'spades': return '♠';
    default: return String(s);
  }
}

function rankN(c) {
  const n = Number(c && c.rank);
  return Number.isFinite(n) ? n : null;
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
    if (min === 0) return 'zeroBased';
    if (max === 13) return 'oneBased';

    // Heuristic fallback: if we never see 0, but see values >= 12 a lot, assume oneBased
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
  // Unknown: be conservative (prefer not to treat rank 1 as Ace, to avoid playing 2 first in zeroBased games)
  return r === 0;
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

function pickBotSideArrays(snapshot) {
  if (!snapshot) {
    return { tableau: [], waste: [] };
  }
  const tFull = snapshot.tableauFull || {};
  const wFull = snapshot.wasteFull || {};
  const tableau =
    Array.isArray(tFull.opp) ? tFull.opp :
    Array.isArray(tFull.you) ? tFull.you : [];
  const waste =
    Array.isArray(wFull.opp) ? wFull.opp :
    Array.isArray(wFull.you) ? wFull.you : [];
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
  return !!c && (
    c.suit === 'hearts' || c.suit === 'diamonds' ||
    c.suit === '♥' || c.suit === '♦'
  );
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

  // Infer/carry rank scheme (0-based vs 1-based) to avoid mis-identifying 2 as Ace
  const snapshotForScheme = botStateByMatch.get(matchId) || matchBot.state || null;
  const inferredScheme = inferRankSchemeFromSnapshot(snapshotForScheme);
  if (inferredScheme !== 'unknown') {
    matchBot.rankScheme = inferredScheme;
  }
  const scheme = matchBot.rankScheme || 'unknown';

  // Allow recycle clicks (stock empty) to proceed even if we are within the normal pacing window.
  const st = botStateByMatch.get(matchId) || matchBot.state || null;
  const mx = st ? computeBotMetrics(st) : null;
  const recycleFastPath = mx && mx.stockCount === 0 && mx.wasteSize > 0;

  if (!recycleFastPath && matchBot.nextActionAt && Date.now() < matchBot.nextActionAt) {
    return;
  }

  const nowHb = Date.now();
  if (BOT_DEBUG || !matchBot.lastHeartbeatLogAt || (nowHb - matchBot.lastHeartbeatLogAt) >= BOT_LOG_THROTTLE_MS) {
    matchBot.lastHeartbeatLogAt = nowHb;
    log(`[BOT] heartbeat matchId="${matchId}" botId="${matchBot.id}" diff=${matchBot.difficulty}`);
  }

  const state =
    botStateByMatch.get(matchId) ||
    matchBot.state ||
    null;

  const metrics = state ? computeBotMetrics(state) : null;

  const nowMx = Date.now();
  if (BOT_DEBUG || !matchBot.lastMetricsLogAt || (nowMx - matchBot.lastMetricsLogAt) >= BOT_LOG_THROTTLE_MS) {
    matchBot.lastMetricsLogAt = nowMx;
    if (metrics) {
      log(
        `[BOT] metrics matchId="${matchId}" f=${metrics.foundationCards} w=${metrics.wasteSize} s=${metrics.stockCount} ` +
        `t=${metrics.tableauPiles} nt=${metrics.nonEmptyTableauPiles}`
      );
    } else {
      log(`[BOT] metrics matchId="${matchId}" (noch kein Snapshot vom Client)`);
    }
  }

  try {
    const decisionState =
      botStateByMatch.get(matchId) ||
      matchBot.state ||
      null;

    let move = null;

    // Aus Sicht des Snapshots ist "you" normalerweise der Mensch, "opp" der Bot
    const humanOwner =
      (decisionState && typeof decisionState.owner === 'string' && decisionState.owner) ||
      'Y';
    const botOwner = humanOwner === 'Y' ? 'O' : 'Y';

    // Foundations are sent as 8 piles (4 per player). Client move payload expects f=0..3 per owner.
    // Convention: indices 0..3 belong to owner 'Y', indices 4..7 belong to owner 'O'.
    function foundationBaseForOwner(owner, total) {
      if (total >= 8) return owner === 'O' ? 4 : 0;
      // Fallback (older snapshots): treat as single 4-pile set
      return 0;
    }

    function ownerFoundationRange(owner, total) {
      if (total >= 8) {
        const base = foundationBaseForOwner(owner, total);
        return { base, start: base, end: base + 4 };
      }
      return { base: 0, start: 0, end: total };
    }

    function toLocalFoundationIndex(owner, globalIndex, total) {
      const base = foundationBaseForOwner(owner, total);
      return Math.max(0, globalIndex - base);
    }

    // Helper: "Intent" → Move-Payload + Broadcast
    function sendMove(intent, kindLabel, debugInfo) {
      const defaultOwner = botOwner;
      let movePayload = null;

      switch (intent.kind) {
        case 'tableau_to_foundation': {
          const owner = inferOwnerFromCardId(intent.cardId, defaultOwner);
          movePayload = {
            owner,
            kind: 'toFound',
            cardId: intent.cardId,
            count: 1,
            from: {
              kind: 'pile',
              sideOwner: owner,
              uiIndex: intent.from
            },
            to: {
              kind: 'found',
              f: intent.to
            }
          };
          break;
        }

        case 'waste_to_foundation': {
          const owner = inferOwnerFromCardId(intent.cardId, defaultOwner);
          movePayload = {
            owner,
            kind: 'toFound',
            cardId: intent.cardId,
            count: 1,
            from: {
              kind: 'pile',
              sideOwner: owner,
              uiIndex: -1
            },
            to: {
              kind: 'found',
              f: intent.to
            }
          };
          break;
        }

        case 'waste_to_tableau': {
          const owner = inferOwnerFromCardId(intent.cardId, defaultOwner);
          movePayload = {
            owner,
            kind: 'toPile',
            cardId: intent.cardId,
            count: 1,
            from: {
              kind: 'pile',
              sideOwner: owner,
              uiIndex: -1
            },
            to: {
              kind: 'pile',
              sideOwner: owner,
              uiIndex: intent.to
            }
          };
          break;
        }

        case 'tableau_to_tableau': {
          const owner = inferOwnerFromCardId(intent.cardId, defaultOwner);
          movePayload = {
            owner,
            kind: 'toPile',
            cardId: intent.cardId,
            count: 1,
            from: {
              kind: 'pile',
              sideOwner: owner,
              uiIndex: intent.from
            },
            to: {
              kind: 'pile',
              sideOwner: owner,
              uiIndex: intent.to
            }
          };
          break;
        }

        default: {
          movePayload = intent;
          break;
        }
      }

      const envelope = JSON.stringify({
        move: movePayload,
        from: matchBot.id
      });

      // Loop protection: remember recent move signatures to avoid ping-pong
      try {
        const sig = `${movePayload.kind}:${movePayload.cardId || ''}:${(movePayload.from && movePayload.from.uiIndex) ?? ''}->${(movePayload.to && (movePayload.to.uiIndex ?? movePayload.to.f)) ?? ''}`;
        const now = Date.now();
        if (!Array.isArray(matchBot.recentMoveSigs)) matchBot.recentMoveSigs = [];
        matchBot.recentMoveSigs.push({ sig, at: now });
        // keep last ~10 entries within 20s
        matchBot.recentMoveSigs = matchBot.recentMoveSigs
          .filter(x => x && (now - x.at) < 20000)
          .slice(-10);
      } catch {}

      broadcastFn(envelope);
      matchBot.lastMoveAt = Date.now();
      scheduleNextAction(matchBot);
      log(
        `[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="${kindLabel}"` +
        (debugInfo ? ` details=${debugInfo}` : '')
      );
    }

    if (hasDetailedState(decisionState)) {
      const s = decisionState;
      const { tableau, waste } = pickBotSideArrays(s);
      const foundations = Array.isArray(s.foundations) ? s.foundations : [];
      const fRange = ownerFoundationRange(botOwner, foundations.length);

      if (BOT_DEBUG) {
        log(`[BOT] decision input matchId="${matchId}" foundations=${foundations.length} (ownerRange=${fRange.start}-${fRange.end-1}) tableau=${tableau.length} waste=${waste.length}`);
      }

      // 1) Priority: any ACE to foundation (tableau first, then waste)
      outerAceTableau:
      for (let t = 0; t < tableau.length; t++) {
        const pile = tableau[t];
        if (!Array.isArray(pile) || !pile.length) continue;
        const card = pile[pile.length - 1];
        if (!card || card.up === false) continue;
        if (!isAceCard(card, scheme)) continue;

        for (let f = fRange.start; f < fRange.end; f++) {
          const destObj = foundations[f];
          if (!destObj) continue;
          if (!canPlaceOnFoundation(card, destObj, scheme)) continue;

          const toLocal = toLocalFoundationIndex(botOwner, f, foundations.length);
          move = {
            kind: 'tableau_to_foundation',
            from: t,
            to: toLocal,
            cardId: card.id || card.cardId || null
          };
          sendMove(move, 'tableau_to_foundation', `ACE fromTableau=${t} toFoundation=${toLocal} suit=${card.suit}`);
          break outerAceTableau;
        }
      }

      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        if (card && card.up !== false && isAceCard(card, scheme)) {
          for (let f = fRange.start; f < fRange.end; f++) {
            const destObj = foundations[f];
            if (!destObj) continue;
            if (!canPlaceOnFoundation(card, destObj, scheme)) continue;

            const toLocal = toLocalFoundationIndex(botOwner, f, foundations.length);
            move = {
              kind: 'waste_to_foundation',
              to: toLocal,
              cardId: card.id || card.cardId || null
            };
            sendMove(move, 'waste_to_foundation', `ACE toFoundation=${toLocal} suit=${card.suit}`);
            break;
          }
        }
      }

      // 2) Foundation progress (non-ACE): tableau/waste to foundation ONLY if legal sequence
      if (!move) {
        outerFoundTableau:
        for (let t = 0; t < tableau.length; t++) {
          const pile = tableau[t];
          if (!Array.isArray(pile) || !pile.length) continue;
          const card = pile[pile.length - 1];
          if (!card || card.up === false) continue;

          for (let f = fRange.start; f < fRange.end; f++) {
            const destObj = foundations[f];
            if (!destObj) continue;
            if (!canPlaceOnFoundation(card, destObj, scheme)) continue;

            const toLocal = toLocalFoundationIndex(botOwner, f, foundations.length);
            move = {
              kind: 'tableau_to_foundation',
              from: t,
              to: toLocal,
              cardId: card.id || card.cardId || null
            };
            sendMove(
              move,
              'tableau_to_foundation',
              `fromTableau=${t} toFoundation=${toLocal} rank=${card.rank} suit=${card.suit}`
            );
            break outerFoundTableau;
          }
        }
      }

      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        if (card && card.up !== false) {
          for (let f = fRange.start; f < fRange.end; f++) {
            const destObj = foundations[f];
            if (!destObj) continue;
            if (!canPlaceOnFoundation(card, destObj, scheme)) continue;

            const toLocal = toLocalFoundationIndex(botOwner, f, foundations.length);
            move = {
              kind: 'waste_to_foundation',
              to: toLocal,
              cardId: card.id || card.cardId || null
            };
            sendMove(
              move,
              'waste_to_foundation',
              `toFoundation=${toLocal} rank=${card.rank} suit=${card.suit}`
            );
            break;
          }
        }
      }

      // 3) Tableau cleanup/uncovering: move top cards to other tableau piles if it reveals a face-down
      //    (we keep it conservative to avoid ping-pong). No stock/waste here.
      if (!move) {
        let best = null;

        for (let fromT = 0; fromT < tableau.length; fromT++) {
          const pile = tableau[fromT];
          if (!Array.isArray(pile) || pile.length < 1) continue;
          const card = pile[pile.length - 1];
          if (!card || card.up === false) continue;

          // Heuristic: prefer moves that would reveal a face-down card beneath the moved card
          const wouldRevealFaceDown = (pile.length >= 2) && (pile[pile.length - 2].up === false);

          for (let toT = 0; toT < tableau.length; toT++) {
            if (toT === fromT) continue;
            const dest = tableau[toT];
            if (!Array.isArray(dest)) continue;
            const destTop = dest.length ? dest[dest.length - 1] : null;
            if (!canPlaceOnTableau(card, destTop, scheme)) continue;
            // Avoid immediate ping-pong: if we just moved this card from toT -> fromT recently, skip
            try {
              const recent = Array.isArray(matchBot.recentMoveSigs) ? matchBot.recentMoveSigs : [];
              const reverseSig = `toPile:${card.id || card.cardId || ''}:${toT}->${fromT}`;
              const now = Date.now();
              const seenReverse = recent.some(x => x && x.sig === reverseSig && (now - x.at) < 8000);
              if (seenReverse) continue;
            } catch {}

            const score = (wouldRevealFaceDown ? 100 : 0) + (destTop ? 10 : 0) + (13 - card.rank);
            if (!best || score > best.score) {
              best = {
                score,
                fromT,
                toT,
                card
              };
            }
          }
        }

        if (best) {
          move = {
            kind: 'tableau_to_tableau',
            from: best.fromT,
            to: best.toT,
            cardId: best.card.id || best.card.cardId || null
          };
          sendMove(
            move,
            'tableau_to_tableau',
            `from=${best.fromT} to=${best.toT} rank=${best.card.rank} suit=${best.card.suit}`
          );
        }
      }

      // 4) Waste usage as LAST resort: waste → tableau (to reduce waste) when no better moves exist
      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        if (card && card.up !== false) {
          for (let t = 0; t < tableau.length; t++) {
            const dest = tableau[t];
            if (!Array.isArray(dest)) continue;
            const destTop = dest.length ? dest[dest.length - 1] : null;
            if (!canPlaceOnTableau(card, destTop, scheme)) continue;

            move = {
              kind: 'waste_to_tableau',
              to: t,
              cardId: card.id || card.cardId || null
            };
            sendMove(
              move,
              'waste_to_tableau',
              `toTableau=${t} rank=${card.rank} suit=${card.suit}`
            );
            break;
          }
        }
      }

      // If we are stuck repeating moves, break the loop by preferring a flip
      try {
        const recent = Array.isArray(matchBot.recentMoveSigs) ? matchBot.recentMoveSigs : [];
        const now = Date.now();
        const last10 = recent.filter(x => x && (now - x.at) < 20000);
        const freq = new Map();
        for (const x of last10) {
          if (!x.sig) continue;
          freq.set(x.sig, (freq.get(x.sig) || 0) + 1);
        }
        const maxRepeat = Math.max(0, ...Array.from(freq.values()));
        if (maxRepeat >= 3 && BOT_DEBUG) {
          log(`[BOT] loop-breaker engaged for matchId="${matchId}" (maxRepeat=${maxRepeat})`);
        }
        // No direct action here; the flip fallback below will fire.
      } catch {}
      if (!move) {
        if (BOT_DEBUG) {
          log(`[BOT] no deterministic move for matchId="${matchId}" → fallback Flip`);
        }
      }
    } else if (decisionState) {
      log(
        `[BOT] decision skipped matchId="${matchId}" – Snapshot enthält keine detaillierten Karten-Arrays`
      );
    }

    // 5) Stock/Waste as last resort:
    //    - Flip when no other moves exist.
    //    - If stock is empty but waste still has cards, keep flipping to force the client-side reset/recycle.
    if (!move) {
      const nowT = Date.now();
      const stockCount = (metrics && typeof metrics.stockCount === 'number') ? metrics.stockCount : null;
      const wasteSize  = (metrics && typeof metrics.wasteSize === 'number') ? metrics.wasteSize : null;

      const wantsRecycle = (stockCount === 0) && (wasteSize != null && wasteSize > 0);

      // When stock is empty but waste still has cards, we must actively trigger the client's recycle by flipping.
      // Use a shorter cooldown and DO NOT let nextActionAt stall recycle for too long.
      const minFlipCooldown = wantsRecycle ? 1500 : 4000;
      const canFlipNow = !matchBot.lastFlipAt || (nowT - matchBot.lastFlipAt) > minFlipCooldown;

      if (canFlipNow) {
        const flipMove = { owner: botOwner, kind: 'flip' };
        const envelope = JSON.stringify({ move: flipMove, from: matchBot.id });
        broadcastFn(envelope);
        matchBot.lastMoveAt = nowT;
        matchBot.lastFlipAt = nowT;

        // For recycle attempts, schedule the next action sooner so we keep clicking until stock refills.
        if (wantsRecycle) {
          matchBot.nextActionAt = nowT + randInt(900, 1800);
        } else {
          scheduleNextAction(matchBot);
        }

        log(`[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="flip"` + (wantsRecycle ? ' (recycle)' : ''));
      }
    }
  } catch (err) {
    warn(
      `[BOT] error while sending move for matchId="${matchId}":`,
      err
    );
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