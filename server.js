#!/usr/bin/env node
// ================================================================
//  Solitaire HighNoon - Realtime Game Server
//  Author: micmuller & ChatGPT (GPT-5)
// -v1.6.3: Mehr Logging bei SYS/MOVE Nachrichten
// -v2.0.0: Komplett überarbeiteter Match-/WebSocket-Server
// -v2.1.5: Invite-System (Push-Einladungen)
// -v2.2.0: Bot-Grundgerüst (Server-seitige Bot-Registry, Option 1)
// -v2.2.2: Bot-Logik erstellt.
// -v2.2.5: Bot-Metrics & stabileres Bot-State-Handling und logging
// -v2.2.6: Bot-Metrics nutzen aggregierte Snapshot-Felder (foundationsTotal etc.)
// -v2.2.7: Bot-Entscheidungsbaum nutzt Snapshot-State für einfache Karten-Züge & Debug-Logging
// -v2.2.10: MOVE-Logging mit vollständigem Payload-Dump
// -v2.2.12: Bot-Moves werden in das reguläre Client-MOVE-Format (toFound/toPile/flip) gemappt
// -v2.2.14: Bot nutzt Suit-basierte Foundation-Regeln & nur noch King-auf-leere-Spalte Tableau-Moves (Ping-Pong-Schutz)
// -v2.2.15: Bot-Foundation-Logik: Ass-Erkennung korrigiert (Ace = rank 0)
// -v2.2.16: Bot-Entscheidungslogik in Helper-Funktion runBotDecisionTick() ausgelagert
// -v2.2.17: ServerBot-Modul (serverbot.js) optional eingebunden + Server-Info für Clients
// ================================================================

const http   = require('node:http');
const https  = require('node:https');
const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const { WebSocketServer } = require('ws');
const { URL } = require('node:url');

// ---------- Optional ServerBot module (split bot logic out of server.js) ----------
let serverbot = null;
try {
  // serverbot.js is optional; server.js keeps a compatible fallback implementation.
  serverbot = require('./serverbot');
  console.log('[BOT] serverbot.js loaded');
} catch (e) {
  serverbot = null;
  console.log('[BOT] serverbot.js not present – using built-in bot logic');
}


// ---------- Version / CLI ----------
const VERSION = '2.2.17';
let PORT = 3001;
const HELP = `
Solitaire HighNoon Server v${VERSION}

Options:
  -p, --port <num>     Port (default 3001)
  -v, --version        Zeigt Version
  -h, --help           Zeigt Hilfe
`;

if (process.argv.includes('-v') || process.argv.includes('--version')) {
  console.log(`Solitaire HighNoon Server v${VERSION}`);
  process.exit(0);
}
if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
const portIdx = process.argv.findIndex(a => a === '-p' || a === '--port');
if (portIdx > -1 && process.argv[portIdx + 1]) {
  const n = parseInt(process.argv[portIdx + 1], 10);
  if (!isNaN(n)) PORT = n;
}

// ================================================================
//  HTTP REQUEST HANDLER (STATIC FILES)
// ================================================================
const PUBLIC_DIR = path.join(__dirname, 'public');

function handleRequest(req, res) {
  let reqUrl;
  try {
    // WHATWG URL – Query-String wird getrennt
    reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    // Fallback, falls Host-Header komisch ist
    reqUrl = { pathname: req.url || '/' };
  }

  let pathname = reqUrl.pathname || '/';

  // Root → index.html (gilt auch für /?mirror=1, /?foo=bar etc.)
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, pathname);

  // Security: Pfad darf nicht aus PUBLIC_DIR herausführen
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Optional: kleines Logging für Debug
      // console.warn(`[404] ${req.method} ${req.url} -> ${filePath}`);
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.js'   ? 'text/javascript' :
      ext === '.css'  ? 'text/css' :
      ext === '.json' ? 'application/json' :
      ext === '.png'  ? 'image/png' :
      ext === '.jpg'  ? 'image/jpeg' :
      ext === '.jpeg' ? 'image/jpeg' :
      ext === '.ico'  ? 'image/x-icon' :
      'text/html';

    // DEV: Caching hart deaktivieren, damit Versionen & JS sofort neu geladen werden
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(data);
  });
}

const httpServer = http.createServer(handleRequest);

// ================================================================
//  WEBSOCKET SERVER
// ================================================================
const wss = new WebSocketServer({ noServer: true });
const rooms = new Map();
const clientsById = new Map(); // cid -> ws

// Einfaches Player-Verzeichnis für Presence / Online-Liste
// cid -> { cid, nick, room, lastSeen }
const playerDirectory = new Map();

// Einfache Bot-Registry (Option 1): matchId -> Bot-Metadaten
// Der Bot ist hier zunächst nur als Metadaten geplant; die eigentliche
// Entscheidungslogik folgt in einem späteren Schritt.
const botsByMatch = new Map();

// Letzter bekannter Spielfeld-Zustand pro Match (vom Client gemeldet)
const botStateByMatch = new Map();

// --- Bot Metrics Helper ---
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
  // foundationCards: akzeptiere auch String-Werte und alternative Feldnamen
  if (!metrics.foundationCards && state && (state.foundationsTotal != null || state.foundationCards != null)) {
    const raw = state.foundationsTotal != null ? state.foundationsTotal : state.foundationCards;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      metrics.foundationCards = n;
    }
  }

  // wasteSize
  if (!metrics.wasteSize && state && state.wasteSize != null) {
    const n = Number(state.wasteSize);
    if (Number.isFinite(n) && n >= 0) {
      metrics.wasteSize = n;
    }
  }

  // tableauPiles
  if (!metrics.tableauPiles && state && state.tableauPiles != null) {
    const n = Number(state.tableauPiles);
    if (Number.isFinite(n) && n >= 0) {
      metrics.tableauPiles = n;
    }
  }

  // nonEmptyTableauPiles
  if (!metrics.nonEmptyTableauPiles && state && state.nonEmptyTableauPiles != null) {
    const n = Number(state.nonEmptyTableauPiles);
    if (Number.isFinite(n) && n >= 0) {
      metrics.nonEmptyTableauPiles = n;
    }
  }

  // stockCount
  if (!metrics.stockCount && state && state.stockCount != null) {
    const n = Number(state.stockCount);
    if (Number.isFinite(n) && n >= 0) {
      metrics.stockCount = n;
    }
  }

  // Optionales Debug-Logging für foundationsTotal / foundationCards,
  // um Probleme beim Mapping schneller zu sehen
  if (state && (state.foundationsTotal != null || state.foundationCards != null)) {
    const raw = state.foundationsTotal != null ? state.foundationsTotal : state.foundationCards;
    console.log(
      '[BOT] debug foundations snapshot',
      'raw=', raw,
      'metrics.foundationCards=', metrics.foundationCards
    );
  }

  return metrics;
}

// --- Bot Decision Helper ---
function runBotDecisionTickBuiltIn(matchId) {
  const matchBot = getServerBot(matchId);
  if (!matchBot) {
    return;
  }

  // Basis-Logging des Heartbeats
  console.log(
    `[BOT] heartbeat botId="${matchBot.id}" matchId="${matchId}" difficulty=${matchBot.difficulty}`
  );

  // Bot-Metriken aus State ableiten und loggen
  const state =
    botStateByMatch.get(matchId) ||
    matchBot.state ||
    null;

  const metrics = state ? computeBotMetrics(state) : null;

  if (metrics) {
    console.log(
      `[BOT] heartbeat metrics matchId="${matchId}" ` +
      `foundationCards=${metrics.foundationCards} ` +
      `wasteSize=${metrics.wasteSize} stockCount=${metrics.stockCount} ` +
      `tableauPiles=${metrics.tableauPiles} nonEmptyTableauPiles=${metrics.nonEmptyTableauPiles}`
    );
  } else {
    console.log(
      `[BOT] heartbeat metrics matchId="${matchId}" (noch kein Snapshot-State vom Client)`
    );
  }

  // Verbesserte Bot-Logik (Entscheidungsbaum):
  // 1. Versuche Tableau → Foundation
  // 2. Versuche Waste → Foundation
  // 3. Versuche Waste → Tableau
  // 4. Versuche Tableau → Tableau
  // 5. Fallback: Flip (draw/flip)
  // Erwartet, dass das Spielfeld im State-Objekt Arrays mit Karten enthält.
  try {
    // Verwende den zuletzt vom Client gemeldeten Spielzustand (bot_state).
    // Priorität: globale Map -> Bot-intern -> kein State
    const decisionState =
      botStateByMatch.get(matchId) ||
      matchBot.state ||
      null;

    let move = null;

    // Aus Sicht des Snapshots ist "you" normalerweise der menschliche Spieler
    // und "opp" der Bot. Wir leiten daraus die Bot-Seite ab.
    const humanOwner =
      (decisionState && typeof decisionState.owner === 'string' && decisionState.owner) ||
      'Y';
    const botOwner = humanOwner === 'Y' ? 'O' : 'Y';

    function pickBotSideArrays(snapshot) {
      if (!snapshot) {
        return { tableau: [], waste: [] };
      }
      const tFull = snapshot.tableauFull || {};
      const wFull = snapshot.wasteFull || {};
      // Bevorzugt die Gegner-Seite ("opp"), fallweise Fallback auf "you",
      // falls aus irgendeinem Grund kein opp-Array vorhanden ist.
      const tableau =
        Array.isArray(tFull.opp) ? tFull.opp :
        Array.isArray(tFull.you) ? tFull.you : [];
      const waste =
        Array.isArray(wFull.opp) ? wFull.opp :
        Array.isArray(wFull.you) ? wFull.you : [];
      return { tableau, waste };
    }

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

    // Hilfsfunktion: Owner aus CardId ableiten ('Y-' oder 'O-')
    function inferOwnerFromCardId(cardId, fallbackOwner = 'Y') {
      if (typeof cardId === 'string') {
        if (cardId.startsWith('Y-')) return 'Y';
        if (cardId.startsWith('O-')) return 'O';
      }
      return fallbackOwner;
    }

    // Helper: Bot-Intent → reguläres Client-MOVE-Format + Senden
    function sendMove(intent, kindLabel, debugInfo) {
      // Der Bot soll mit seinen eigenen Karten spielen → owner = botOwner
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
          // Fallback: Intent ist bereits im richtigen Format (z.B. flip)
          movePayload = intent;
          break;
        }
      }

      const envelope = JSON.stringify({
        move: movePayload,
        from: matchBot.id
      });
      broadcastToRoom(matchId, envelope, null);
      matchBot.lastMoveAt = Date.now();
      console.log(
        `[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="${kindLabel}"` +
        (debugInfo ? ` details=${debugInfo}` : '')
      );
    }

    if (hasDetailedState(decisionState)) {
      const s = decisionState;

      // Aus dem Snapshot die relevanten Arrays extrahieren:
      // - Bot-Seite ("opp" falls vorhanden, sonst "you") für Bot-Entscheidungen
      // - Foundations werden aus s.foundations[*].cards abgeleitet
      const { tableau, waste } = pickBotSideArrays(s);
      const foundations = Array.isArray(s.foundations)
        ? s.foundations.map(f => Array.isArray(f.cards) ? f.cards : [])
        : [];

      console.log(
        `[BOT] decision input matchId="${matchId}" ` +
        `foundations=${foundations.length} tableau=${tableau.length} waste=${waste.length}`
      );

      // 1. Tableau → Foundation (nur gleiche Suit, Ass auf leer oder Folgekarte)
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

          // Nur Foundations derselben Suit verwenden, um z.B. 2♥ nicht auf eine andere Suit zu legen
          if (destSuit && card.suit && destSuit !== card.suit) continue;

          if (
            (!destCards.length && card.rank === 0) || // Ass auf leere Foundation (Ace ist rank 0)
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

      // 2. Waste → Foundation (nur gleiche Suit, Ass auf leer oder Folgekarte)
      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        for (let f = 0; f < foundations.length; f++) {
          const destObj   = s.foundations && s.foundations[f];
          if (!destObj) continue;
          const destCards = Array.isArray(destObj.cards) ? destObj.cards : [];
          const destSuit  = destObj.suit;

          if (destSuit && card.suit && destSuit !== card.suit) continue;

          if (
            (!destCards.length && card.rank === 0) || // Ass auf leere Foundation (Ace ist rank 0)
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

      // 3. Waste → Tableau
      if (!move && Array.isArray(waste) && waste.length) {
        const card = waste[waste.length - 1];
        const isRed = c => !!c && (
          c.suit === 'hearts' || c.suit === 'diamonds' ||
          c.suit === '♥' || c.suit === '♦'
        );

        for (let t = 0; t < tableau.length; t++) {
          const dest = tableau[t];
          if (!Array.isArray(dest)) continue;

          if (!dest.length) {
            // König auf leere Spalte
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
              isRed(card) !== isRed(destCard) &&
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

      // 4. Tableau → Tableau (Easy-Mode): nur Könige auf leere Spalten,
      // um endlose Hin-und-Her-Züge zu vermeiden.
      if (!move) {
        for (let fromT = 0; fromT < tableau.length; fromT++) {
          const pile = tableau[fromT];
          if (!Array.isArray(pile) || !pile.length) continue;
          const card = pile[pile.length - 1];

          // Nur Könige verschieben
          if (card.rank !== 13) continue;

          for (let toT = 0; toT < tableau.length; toT++) {
            if (toT === fromT) continue;
            const dest = tableau[toT];
            if (!Array.isArray(dest)) continue;
            if (dest.length) continue; // nur leere Spalten

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
        console.log(
          `[BOT] no deterministic card-move found for matchId="${matchId}" – fallback auf Flip`
        );
      }
    } else if (decisionState) {
      // Wir haben zwar ein State-Objekt, aber (noch) keine detaillierten Arrays
      console.log(
        `[BOT] decision skipped matchId="${matchId}" – Snapshot enthält keine detaillierten Karten-Arrays`
      );
    }

    // 5. Fallback: Flip (draw/flip) — throttled to avoid Spam
    if (!move) {
      const nowT = Date.now();
      if (!matchBot.lastFlipAt || nowT - matchBot.lastFlipAt > 10000) {
        // Flip soll auf der Bot-Seite passieren
        const flipMove = {
          owner: botOwner,
          kind: 'flip'
        };

        const envelope = JSON.stringify({
          move: flipMove,
          from: matchBot.id
        });

        broadcastToRoom(matchId, envelope, null);
        matchBot.lastMoveAt = nowT;
        matchBot.lastFlipAt = nowT;
        console.log(
          `[BOT] move sent botId="${matchBot.id}" matchId="${matchId}" kind="flip (throttled)"`
        );
      }
    }
  } catch (err) {
    console.warn(
      `[BOT] error while sending move for matchId="${matchId}":`,
      err
    );
  }
}

// Wrapper: prefer serverbot.js implementation when available
function runBotDecisionTick(matchId) {
  try {
    if (serverbot && typeof serverbot.runBotDecisionTick === 'function') {
      // Provide minimal deps so serverbot.js can broadcast moves / compute metrics.
      // If serverbot.js ignores the 2nd arg, that's fine.
      return serverbot.runBotDecisionTick(matchId, {
        getServerBot,
        botStateByMatch,
        broadcastToRoom,
        computeBotMetrics,
        isoNow
      });
    }
  } catch (e) {
    console.warn('[BOT] serverbot.runBotDecisionTick failed – falling back to built-in logic:', e);
  }
  return runBotDecisionTickBuiltIn(matchId);
}


function createServerBot(matchId, difficulty = 'easy') {
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
    state: null,
    lastSeenStateAt: 0
  };

  botsByMatch.set(matchId, bot);

  console.log(
    `[BOT] created botId="${botId}" matchId="${matchId}" difficulty=${difficulty} nick="${botNick}"`
  );

  return bot;
}

function getServerBot(matchId) {
  return botsByMatch.get(matchId) || null;
}

function removeServerBot(matchId) {
  if (botsByMatch.delete(matchId)) {
    console.log(`[BOT] removed bot for matchId="${matchId}"`);
  }
}

const {
  createMatchForClient,
  joinMatchForClient,
  markPlayerDisconnected,
  getPublicMatchView,
  cleanupOldMatches
} = require('./matches');
const STATUS_INTERVAL_MS = 30_000;
const HELLO_SUPPRESS_MS  = 15_000;
let lastGlobalStatusLog = 0;
const lastSysLogByRoom = new Map();
const lastHelloTsByClient = new WeakMap();
setInterval(() => cleanupOldMatches(), 10 * 60 * 1000).unref();

function isoNow() { return new Date().toISOString(); }
function getRoomOf(ws) { return ws.__room || null; }
function joinRoom(ws, room) {
  ws.__room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);

  // Player-Directory aktualisieren, falls Eintrag existiert
  if (ws.__cid && playerDirectory.has(ws.__cid)) {
    const entry = playerDirectory.get(ws.__cid);
    entry.room = room;
    entry.lastSeen = Date.now();
  }
}
function leaveRoom(ws) {
  const room = getRoomOf(ws);
  if (!room) return;
  const set = rooms.get(room);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(room);
  }
  ws.__room = null;
}
function peersInRoom(room) {
  const set = rooms.get(room);
  return set ? set.size : 0;
}
function broadcastToRoom(room, data, excludeWs = null) {
  const set = rooms.get(room);
  if (!set) return;
  for (const client of set) {
    if (client !== excludeWs && client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

function sendSys(ws, sysPayload, extra = {}) {
  if (ws.readyState !== ws.OPEN) return;
  const envelope = {
    sys: sysPayload,
    from: 'srv',
    ...extra
  };
  ws.send(JSON.stringify(envelope));
}

function broadcastSysToRoom(room, sysPayload, extra = {}) {
  const set = rooms.get(room);
  if (!set) return;
  const envelope = JSON.stringify({
    sys: sysPayload,
    from: 'srv',
    matchId: sysPayload.matchId || extra.matchId || room,
    ...extra
  });
  for (const client of set) {
    if (client.readyState === client.OPEN) {
      client.send(envelope);
    }
  }
}

function logStatus(roomHint = null) {
  const total = wss.clients.size;
  if (total === 0) return;
  const summary = [];
  for (const [room, set] of rooms.entries()) {
    summary.push(`${room}:${set.size}`);
  }
  console.log(
    `[STATUS] ${isoNow()} — Clients=${total}, Rooms=${rooms.size} ` +
    `[${summary.join(', ') || '—'}]` +
    (roomHint ? ` (room="${roomHint}")` : '')
  );
}

// --- Upgrade
function attachUpgradeHandler(server) {
  server.on('upgrade', (req, socket, head) => {
    try {
      const fullUrl = new URL(req.url, `http://${req.headers.host}`);
      const pathname = fullUrl.pathname;
      const room = fullUrl.searchParams.get('room') || 'default';
      if (!pathname.startsWith('/ws')) return socket.destroy();
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req, room));
    } catch (err) {
      console.error('[UPGRADE ERROR]', err);
      socket.destroy();
    }
  });
}
attachUpgradeHandler(httpServer);

// --- Connection logic
wss.on('connection', (ws, req, room) => {
  const ip = req.socket.remoteAddress || 'unknown';
  joinRoom(ws, room);
  const cid = Math.random().toString(36).slice(2);
  ws.__cid = cid;
  clientsById.set(cid, ws);
  // Initialer Eintrag im Player-Verzeichnis (Nick folgt bei "hello")
  playerDirectory.set(cid, {
    cid,
    nick: 'Player',
    room,
    lastSeen: Date.now()
  });

// Provide server metadata to the client (game.js can display it in the status overlay)
  sendSys(ws, {
   type: 'server_info',
    version: VERSION,
    at: isoNow()
  });
  console.log(`[CONNECT] ${isoNow()} room="${room}" ip=${ip} cid=${cid} peers=${peersInRoom(room)}`);
  logStatus(room);

ws.on('message', buf => {
  const now = Date.now();
  const currentRoom = getRoomOf(ws);
  if (!currentRoom) return;
  try {
    const raw = buf.toString();
    const data = JSON.parse(raw);

    // MOVE-Logging wie bisher + detaillierter Payload-Dump
    if (data?.move) {
      console.log(
        `[MOVE] ${isoNow()} room="${currentRoom}" kind=${data.move.kind} ` +
        `from=${data.from || 'n/a'} cid=${ws.__cid || 'n/a'}`
      );
      try {
        console.log('[MOVE-PAYLOAD]', JSON.stringify(data.move));
      } catch (e) {
        console.warn('[MOVE-PAYLOAD] JSON stringify failed:', e);
      }
    }

    // SYS-Logging / Handling
    if (data?.sys) {
      const sys = data.sys;
      const lastH = lastHelloTsByClient.get(ws) || 0;

      // "hello" weiterhin zeitlich entdoppeln – aber NICHT komplett abbrechen,
      // damit spätere hello-Nachrichten (z.B. mit korrigiertem Nick) trotzdem
      // den Nick im Player-Verzeichnis aktualisieren können.
      if (sys.type === 'hello') {
        if (now - lastH < HELLO_SUPPRESS_MS) {
          // nur das generische [SYS]-Logging throtteln, aber kein return mehr
        }
        lastHelloTsByClient.set(ws, now);
      }

      const lastSys = lastSysLogByRoom.get(currentRoom) || 0;
      if (now - lastSys >= STATUS_INTERVAL_MS) {
        const nickLog = ws.__nick || sys.nick || 'Player';
        console.log(
          `[SYS] ${isoNow()} room="${currentRoom}" type=${sys.type} ` +
          `from=${data.from || 'n/a'} cid=${ws.__cid || 'n/a'} nick="${nickLog}"`
        );
        lastSysLogByRoom.set(currentRoom, now);
      }

      // "hello" nutzt der Client, um sich mit Nick zu melden → Player-Verzeichnis aktualisieren
      // WICHTIG: kein "return" hier, damit die Nachricht weiterhin an die anderen Clients
      // im Raum gebroadcastet wird (Mirror-Handshake hello/hello-ack in game.js).
      if (sys.type === 'hello') {
        const cid = ws.__cid;
        const roomName = getRoomOf(ws) || currentRoom || 'lobby';

        // Nick-Kandidat aus der Nachricht
        const candidate = (typeof sys.nick === 'string' && sys.nick.trim()) || '';
        const previous  = (typeof ws.__nick === 'string' && ws.__nick.trim()) || '';

        let nick;

        if (candidate && candidate !== 'Player') {
          // Bevorzugt: ein expliziter, nicht-default Nick aus der Nachricht
          nick = candidate;
        } else if (previous && previous !== 'Player') {
          // Falls wir bereits früher einen besseren Nick hatten, NICHT durch "Player" überschreiben
          nick = previous;
        } else if (candidate) {
          // Kandidat ist zwar "Player" oder leer, aber besser als gar nichts
          nick = candidate;
        } else {
          nick = previous || 'Player';
        }

        ws.__nick = nick;

        playerDirectory.set(cid, {
          cid,
          nick,
          room: roomName,
          lastSeen: now
        });

        // Explizites Debug-Logging für hello, unabhängig vom 30s-SYS-Intervall
        console.log(
          `[SYS-HELLO] ${isoNow()} room="${roomName}" cid=${cid} nick="${nick}"`
        );
      }

      // Presence-Abfrage: Wer ist online?
      if (sys.type === 'who_is_online') {
        const meCid = ws.__cid;
        const players = [];

        for (const [cid, info] of playerDirectory.entries()) {
          players.push({
            cid,
            nick: info.nick || 'Player',
            room: info.room || 'lobby',
            isSelf: cid === meCid
          });
        }

        sendSys(ws, {
          type: 'player_list',
          players
        });

        return;
      }

      // --- BOT STATE HANDLING (robuster & mit separater State-Map) ---
      if (sys.type === 'bot_state') {
        // MatchId möglichst robust ermitteln
        let matchId = null;

        if (typeof sys.matchId === 'string' && sys.matchId.trim()) {
          matchId = sys.matchId.trim();
        } else if (ws.__room && ws.__room !== 'lobby' && ws.__room !== 'default') {
          matchId = ws.__room;
        } else if (getRoomOf(ws) && getRoomOf(ws) !== 'lobby' && getRoomOf(ws) !== 'default') {
          matchId = getRoomOf(ws);
        }

        // Wenn wir kein sinnvolles Match identifizieren können, ignorieren wir die Nachricht still.
        if (!matchId) {
          return;
        }

        const bot = getServerBot(matchId);
        // WICHTIG: Nur wenn ein Server-Bot für dieses Match existiert, interessiert uns der State.
        // In normalen Mensch-gegen-Mensch-Spielen wird bot_state damit still ignoriert und
        // erzeugt keine Log-Spam mehr.
        if (!bot) {
          return;
        }

        const state = sys.state;

        if (!state || typeof state !== 'object') {
          console.log(
            `[BOT] state update ignored matchId="${matchId}" (no or non-object state)`
          );
          return;
        }

        // Globalen State-Puffer aktualisieren
        botStateByMatch.set(matchId, state);

        // Metriken aus dem State ableiten
        const metrics = computeBotMetrics(state);

        bot.state = state;
        bot.lastSeenStateAt = now;
        bot.stateMetrics = metrics;

        console.log(
          `[BOT] state update matchId="${matchId}" from cid=${ws.__cid} ` +
          `tick="${sys.tick ?? 'n/a'}" (haveBot=true) ` +
          `foundationCards=${metrics.foundationCards} ` +
          `wasteSize=${metrics.wasteSize} stockCount=${metrics.stockCount} ` +
          `moves=${metrics.movesPlayed ?? 'n/a'} score=${metrics.score ?? 'n/a'}`
        );
        return;
      }

      // Neue Match-Commands abfangen (Phase 1)
      if (sys.type === 'create_match') {
        const nick = sys.nick || 'Player 1';
        try {
          const match = createMatchForClient(ws, nick, rooms);

          // WebSocket in ein dediziertes Match-Room verschieben
          leaveRoom(ws);
          joinRoom(ws, match.matchId);

          const publicMatch = getPublicMatchView(match);

          // Antwort an Host
          sendSys(ws, {
            type: 'match_created',
            matchId: match.matchId,
            seed: match.seed,
            playerId: 'p1',
            role: 'host',
            status: match.status,
            hostNick: nick,
            match: publicMatch
          }, { matchId: match.matchId });

          // Erstes match_update nur an Host (noch keine weiteren Spieler im Raum)
          sendSys(ws, {
            type: 'match_update',
            matchId: match.matchId,
            status: match.status,
            players: publicMatch.players
          }, { matchId: match.matchId });

          console.log(
            `[MATCH] created matchId="${match.matchId}" seed="${match.seed}" hostNick="${nick}" cid=${ws.__cid}`
          );
        } catch (err) {
          console.error('[MATCH ERROR] create_match failed', err);
          sendSys(ws, {
            type: 'match_error',
            for: 'create_match',
            code: err.code || 'internal_error',
            message: err.message || 'Interner Fehler beim Erstellen des Matches'
          });
        }
        return; // NICHT in den Raum broadcasten
      }

      if (sys.type === 'join_match') {
        const matchId = sys.matchId;
        const nick = sys.nick || 'Player';

        if (!matchId) {
          sendSys(ws, {
            type: 'match_error',
            for: 'join_match',
            code: 'missing_match_id',
            message: 'Kein Match-Code angegeben.'
          });
          return;
        }

        try {
          const match = joinMatchForClient(ws, matchId, nick);

          // WebSocket in den Match-Room verschieben
          leaveRoom(ws);
          joinRoom(ws, match.matchId);

          const publicMatch = getPublicMatchView(match);

          // Antwort an Guest selbst
          sendSys(ws, {
            type: 'match_joined',
            matchId: match.matchId,
            seed: match.seed,
            playerId: ws.__playerId,
            role: 'guest',
            status: match.status,
            hostNick: publicMatch.players[0]?.nick || 'Host'
          }, { matchId: match.matchId });

          // match_update an alle Spieler im Match-Room
          broadcastSysToRoom(match.matchId, {
            type: 'match_update',
            matchId: match.matchId,
            status: match.status,
            players: publicMatch.players
          });

          console.log(
            `[MATCH] join matchId="${match.matchId}" guestNick="${nick}" cid=${ws.__cid}`
          );

          // V1: Spiel automatisch starten, sobald 2 Spieler da sind
          if (match.players.length === 2 && match.status === 'ready') {
            broadcastSysToRoom(match.matchId, {
              type: 'reset',
              matchId: match.matchId,
              seed: match.seed
            });
            match.status = 'running';
            match.lastActivityAt = Date.now();
            console.log(`[MATCH] auto-start matchId="${match.matchId}" seed="${match.seed}"`);
          }
        } catch (err) {
          console.error('[MATCH ERROR] join_match failed', err);
          let code = err.code || 'internal_error';
          let message = err.message || 'Interner Fehler beim Beitreten zum Match';
          if (code === 'match_not_found') {
            message = 'Dieses Match existiert nicht oder ist bereits beendet.';
          } else if (code === 'match_full') {
            message = 'Dieses Match ist bereits voll.';
          } else if (code === 'match_finished') {
            message = 'Dieses Match ist bereits beendet.';
          }
          sendSys(ws, {
            type: 'match_error',
            for: 'join_match',
            code,
            message,
            matchId
          });
        }
        return; // NICHT in den Raum broadcasten
      }

      // -------- BOT-STEUERUNG (Option 2: eigenes Match mit Bot als Gegner) --------
      if (sys.type === 'spawn_bot') {
        const difficulty = sys.difficulty || 'easy';

        // Robuste Nick-Bestimmung für den menschlichen Spieler
        const effectiveNick =
          (typeof sys.nick === 'string' && sys.nick.trim()) ||
          (typeof ws.__nick === 'string' && ws.__nick.trim()) ||
          'Player';

        let matchId = sys.matchId || currentRoom || null;
        let match = null;

        // Fall A: Wir hängen in der Lobby / default-Raum → eigenes Bot-Match anlegen
        const isLobbyLike = !matchId || matchId === 'lobby' || matchId === 'default';

        if (isLobbyLike) {
          try {
            // Neues Match für diesen Client anlegen (Host = Mensch)
            match = createMatchForClient(ws, effectiveNick, rooms);

            // WebSocket in den Match-Room verschieben
            leaveRoom(ws);
            joinRoom(ws, match.matchId);
            matchId = match.matchId;

            const publicMatch = getPublicMatchView(match);

            // Host informieren, dass ein Match erstellt wurde
            sendSys(ws, {
              type: 'match_created',
              matchId: match.matchId,
              seed: match.seed,
              playerId: 'p1',
              role: 'host',
              status: match.status,
              hostNick: effectiveNick,
              match: publicMatch
            }, { matchId: match.matchId });

            // Erstes match_update nur an Host
            sendSys(ws, {
              type: 'match_update',
              matchId: match.matchId,
              status: match.status,
              players: publicMatch.players
            }, { matchId: match.matchId });

            console.log(
              `[MATCH] created (bot) matchId="${match.matchId}" seed="${match.seed}" hostNick="${effectiveNick}" cid=${ws.__cid}`
            );
          } catch (err) {
            console.error('[BOT MATCH ERROR] spawn_bot create_match failed', err);
            sendSys(ws, {
              type: 'bot_error',
              for: 'spawn_bot',
              code: err.code || 'internal_error',
              message: err.message || 'Interner Fehler beim Erstellen des Bot-Matches'
            });
            return;
          }
        }

        // Wenn wir hier immer noch kein Match haben, brechen wir sauber ab
        if (!matchId) {
          sendSys(ws, {
            type: 'bot_error',
            for: 'spawn_bot',
            code: 'missing_match_id',
            message: 'Kein Match für den Bot angegeben.'
          });
          return;
        }

        // Prüfen, ob bereits ein Bot für dieses Match existiert
        const existing = getServerBot(matchId);
        if (existing) {
          // Bereits ein Bot registriert – wir schicken nur die Info zurück
          sendSys(ws, {
            type: 'bot_spawned',
            matchId,
            botId: existing.id,
            difficulty: existing.difficulty,
            nick: existing.nick
          });
          return;
        }

        // Neuen Bot registrieren
        const bot = createServerBot(matchId, difficulty);

        // Bot im Match-Modell sichtbar machen, falls wir einen Match-Ref haben
        if (match) {
          const nowMs = Date.now();
          if (!Array.isArray(match.players)) {
            match.players = match.players ? [match.players] : [];
          }
          match.players.push({
            id: bot.id,
            nick: bot.nick,
            isBot: true,
            joinedAt: nowMs,
            lastSeen: nowMs
          });

          match.status = 'ready';
          match.lastActivityAt = nowMs;

          const publicAfter = getPublicMatchView(match);

          // Aktualisierte Match-View an Host
          sendSys(ws, {
            type: 'match_update',
            matchId: match.matchId,
            status: match.status,
            players: publicAfter.players
          }, { matchId: match.matchId });

          // Spiel direkt starten (Reset für Host)
          broadcastSysToRoom(match.matchId, {
            type: 'reset',
            matchId: match.matchId,
            seed: match.seed
          });

          match.status = 'running';
          match.lastActivityAt = Date.now();

          console.log(
            `[MATCH] auto-start bot matchId="${match.matchId}" seed="${match.seed}" hostNick="${effectiveNick}" botNick="${bot.nick}"`
          );
        }

        // --- BOT AUTO‑TICK (nutzt Snapshot-State für einfache Züge) ---
        if (!bot.__interval) {
          bot.__interval = setInterval(() => {
            runBotDecisionTick(matchId);
          }, 5000);
        }

        // Rückmeldung an den Host, dass der Bot aktiv ist
        sendSys(ws, {
          type: 'bot_spawned',
          matchId,
          botId: bot.id,
          difficulty: bot.difficulty,
          nick: bot.nick
        });

        // WICHTIG: Option 2 erzeugt ein echtes Match mit Bot-Gegner; die
        // eigentliche Spiel-Logik des Bots folgt später.
        return; // nicht broadcasten
      }

      // -------- PUSH-INVITES (Phase 1: reine Weiterleitung) --------
      if (sys.type === 'invite') {
        const matchId   = sys.matchId;
        const targetCid = sys.targetCid;
        const fromNick  = sys.fromNick || sys.nick || 'Player';

        if (!matchId || !targetCid) {
          sendSys(ws, {
            type: 'invite_error',
            for: 'invite',
            code: 'missing_fields',
            message: 'Match-ID oder Ziel-Spieler fehlen.'
          });
          return;
        }

        const target = clientsById.get(targetCid);
        if (!target || target.readyState !== target.OPEN) {
          sendSys(ws, {
            type: 'invite_error',
            for: 'invite',
            code: 'target_offline',
            message: 'Der eingeladene Spieler ist nicht online.',
            matchId,
            targetCid
          });
          return;
        }

        // Invite zum Zielspieler pushen
        sendSys(target, {
          type: 'invite',
          matchId,
          fromCid: ws.__cid,
          fromNick,
          createdAt: isoNow()
        }, { matchId });

        // Bestätigung an den Host
        sendSys(ws, {
          type: 'invite_sent',
          matchId,
          targetCid,
          targetRoom: getRoomOf(target) || null
        }, { matchId });

        console.log(
          `[INVITE] ${isoNow()} from=${ws.__cid} to=${targetCid} matchId="${matchId}"`
        );
        return; // Nicht an Raum broadcasten
      }

      if (sys.type === 'invite_accept') {
        const matchId = sys.matchId;
        const hostCid = sys.hostCid;
        const fromNick = sys.fromNick || sys.nick || 'Player';

        if (!matchId || !hostCid) {
          sendSys(ws, {
            type: 'invite_error',
            for: 'invite_accept',
            code: 'missing_fields',
            message: 'Match-ID oder Host-Spieler fehlen.'
          });
          return;
        }

        const host = clientsById.get(hostCid);
        if (host && host.readyState === host.OPEN) {
          sendSys(host, {
            type: 'invite_accept',
            matchId,
            fromCid: ws.__cid,
            fromNick,
            at: isoNow()
          }, { matchId });
        }

        console.log(
          `[INVITE] accept matchId="${matchId}" hostCid=${hostCid} fromCid=${ws.__cid}`
        );
        // WICHTIG: der eigentliche Match-Beitritt erfolgt weiterhin
        // über ein separates "join_match" vom Client, damit die bestehende
        // Logik in joinMatchForClient() verwendet wird.
        return;
      }

      if (sys.type === 'invite_decline') {
        const matchId = sys.matchId;
        const hostCid = sys.hostCid;
        const fromNick = sys.fromNick || sys.nick || 'Player';

        if (!matchId || !hostCid) {
          sendSys(ws, {
            type: 'invite_error',
            for: 'invite_decline',
            code: 'missing_fields',
            message: 'Match-ID oder Host-Spieler fehlen.'
          });
          return;
        }

        const host = clientsById.get(hostCid);
        if (host && host.readyState === host.OPEN) {
          sendSys(host, {
            type: 'invite_decline',
            matchId,
            fromCid: ws.__cid,
            fromNick,
            at: isoNow()
          }, { matchId });
        }

        console.log(
          `[INVITE] decline matchId="${matchId}" hostCid=${hostCid} fromCid=${ws.__cid}`
        );
        return;
      }
    }

    // Standardverhalten beibehalten: alles andere wie bisher an den Room broadcasten
    broadcastToRoom(currentRoom, raw, ws);

    if (now - lastGlobalStatusLog >= STATUS_INTERVAL_MS) {
      logStatus();
      lastGlobalStatusLog = now;
    }
  } catch (err) {
    console.error('[WS ERROR]', err);
  }
});

ws.on('close', () => {
  const roomLeft = getRoomOf(ws);
  markPlayerDisconnected(ws);
  leaveRoom(ws);
  clientsById.delete(cid);
  playerDirectory.delete(cid);
  console.log(`[DISCONNECT] ${isoNow()} room="${roomLeft}" cid=${cid}`);
  logStatus(roomLeft);
});
});

// ================================================================
//  START SERVER (HTTP + optional HTTPS)
// ================================================================
function getLocalIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  return results;
}
function startServer(server, label) {
  const ips = getLocalIPs();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=== Solitaire HighNoon Server v${VERSION} (${label.toUpperCase()}) ===`);
    console.log(`Startzeit: ${isoNow()}`);
    console.log(`Serving from: ${PUBLIC_DIR}`);
    console.log(`Listening on 0.0.0.0:${PORT}`);
    if (ips.length) {
      console.log('LAN erreichbar unter:');
      ips.forEach(ip => console.log(`  →  ${label}://${ip}:${PORT}`));
    }
    console.log();
  });
}

// ---- HTTPS optional ----
const keyPath = path.join(__dirname, 'key.pem');
const certPath = path.join(__dirname, 'cert.pem');
if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
  try {
    const options = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
    const httpsServer = https.createServer(options, handleRequest);
    attachUpgradeHandler(httpsServer);
    startServer(httpsServer, 'https');
  } catch (err) {
    console.error('[SSL ERROR]', err);
    console.log('Fallback auf HTTP...');
    startServer(httpServer, 'http');
  }
} else {
  startServer(httpServer, 'http');
}