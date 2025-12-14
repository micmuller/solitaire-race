// serverbot.js
// ================================================================
//  Solitaire HighNoon - Server-Bot Modul
//  Enthält:
//   - Bot-Registry (per Match)
//   - Bot-State-Speicher (Snapshots vom Client)
//   - Metrics-Berechnung
//   - Entscheidungslogik & Move-Mapping
// ================================================================

const botsByMatch = new Map();     // matchId -> bot
const botStateByMatch = new Map(); // matchId -> letzter Snapshot-State

const SERVERBOT_API_VERSION = 1;

const BOT_DEBUG = process.env.BOT_DEBUG === '1';
const BOT_LOG_THROTTLE_MS = Number(process.env.BOT_LOG_THROTTLE_MS || 5000);

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
      broadcastFn(envelope);
      matchBot.lastMoveAt = Date.now();
      log(
        `[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="${kindLabel}"` +
        (debugInfo ? ` details=${debugInfo}` : '')
      );
    }

    if (hasDetailedState(decisionState)) {
      const s = decisionState;
      const { tableau, waste } = pickBotSideArrays(s);
      const foundations = Array.isArray(s.foundations)
        ? s.foundations.map(f => Array.isArray(f.cards) ? f.cards : [])
        : [];

      if (BOT_DEBUG) {
        log(`[BOT] decision input matchId="${matchId}" foundations=${foundations.length} tableau=${tableau.length} waste=${waste.length}`);
      }

      // 1. Tableau → Foundation (Suit-Regeln, nur Ass oder Folgekarte)
      outer1:
      for (let t = 0; t < tableau.length; t++) {
        const pile = tableau[t];
        if (!pile || !pile.length) continue;
        const card = pile[pile.length - 1];

        for (let f = 0; f < foundations.length; f++) {
          const destObj   = s.foundations && s.foundations[f];
          if (!destObj) continue;
          const destCards = Array.isArray(destObj.cards) ? destObj.cards : [];
          const destSuit  = destObj.suit;

          if (destSuit && card.suit && destSuit !== card.suit) continue;

          if (
            (!destCards.length && card.rank === 1) || // Ass auf leere passende Foundation
            (destCards.length &&
              destCards[destCards.length - 1].suit === card.suit &&
              destCards[destCards.length - 1].rank === card.rank - 1)
          ) {
            move = {
              kind: 'tableau_to_foundation',
              from: t,
              to: f,
              cardId: card.id || card.cardId || null
            };
            sendMove(
              move,
              'tableau_to_foundation',
              `fromTableau=${t} toFoundation=${f} rank=${card.rank} suit=${card.suit}`
            );
            break outer1;
          }
        }
      }

      // 2. Waste → Foundation (Suit-Regeln, nur Ass oder Folgekarte)
      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        for (let f = 0; f < foundations.length; f++) {
          const destObj   = s.foundations && s.foundations[f];
          if (!destObj) continue;
          const destCards = Array.isArray(destObj.cards) ? destObj.cards : [];
          const destSuit  = destObj.suit;

          if (destSuit && card.suit && destSuit !== card.suit) continue;

          if (
            (!destCards.length && card.rank === 1) ||
            (destCards.length &&
              destCards[destCards.length - 1].suit === card.suit &&
              destCards[destCards.length - 1].rank === card.rank - 1)
          ) {
            move = {
              kind: 'waste_to_foundation',
              to: f,
              cardId: card.id || card.cardId || null
            };
            sendMove(
              move,
              'waste_to_foundation',
              `toFoundation=${f} rank=${card.rank} suit=${card.suit}`
            );
            break;
          }
        }
      }

      // 3. Waste → Tableau (König auf leer, sonst absteigend & Farbe abwechselnd)
      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        for (let t = 0; t < tableau.length; t++) {
          const dest = tableau[t];
          if (!Array.isArray(dest)) continue;

          if (!dest.length) {
            if (card.rank === 13) {
              move = {
                kind: 'waste_to_tableau',
                to: t,
                cardId: card.id || card.cardId || null
              };
              sendMove(
                move,
                'waste_to_tableau',
                `toTableau=${t} (empty) rank=${card.rank} suit=${card.suit}`
              );
              break;
            }
          } else {
            const destCard = dest[dest.length - 1];
            if (
              isRedCard(card) !== isRedCard(destCard) &&
              destCard.rank === card.rank + 1
            ) {
              move = {
                kind: 'waste_to_tableau',
                to: t,
                cardId: card.id || card.cardId || null
              };
              sendMove(
                move,
                'waste_to_tableau',
                `toTableau=${t} rank=${card.rank} suit=${card.suit} on=${destCard.rank}/${destCard.suit}`
              );
              break;
            }
          }
        }
      }

      // 4. Tableau → Tableau (Easy-Mode: nur Könige auf leere Spalten, um Ping-Pong zu vermeiden)
      if (!move) {
        for (let fromT = 0; fromT < tableau.length; fromT++) {
          const pile = tableau[fromT];
          if (!Array.isArray(pile) || !pile.length) continue;
          const card = pile[pile.length - 1];

          if (card.rank !== 13) continue;

          for (let toT = 0; toT < tableau.length; toT++) {
            if (toT === fromT) continue;
            const dest = tableau[toT];
            if (!Array.isArray(dest)) continue;
            if (dest.length) continue;

            move = {
              kind: 'tableau_to_tableau',
              from: fromT,
              to: toT,
              cardId: card.id || card.cardId || null
            };
            sendMove(
              move,
              'tableau_to_tableau',
              `from=${fromT} toEmpty=${toT} rank=${card.rank} suit=${card.suit}`
            );
            break;
          }

          if (move) break;
        }
      }

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

    // 5. Fallback: Flip (throttled)
    if (!move) {
      const nowT = Date.now();
      if (!matchBot.lastFlipAt || nowT - matchBot.lastFlipAt > 10000) {
        const flipMove = {
          owner: botOwner,
          kind: 'flip'
        };
        const envelope = JSON.stringify({
          move: flipMove,
          from: matchBot.id
        });
        broadcastFn(envelope);
        matchBot.lastMoveAt = nowT;
        matchBot.lastFlipAt = nowT;
        log(
          `[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="flip (throttled)"`
        );
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