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
// -v2.2.18: Serverbot Logik ausgelagert
// -v2.2.19: Server.js delegiert Bot-State/Decisions vollständig an serverbot.js (keine Bot-Logik mehr im server.js)
// -v2.2.21: broken, bot Startet nicht mehr....
// -v2.2.22: patched version für Modul serverbot.js
// -v2.2.23: https Environment Variable
// -v2.3.1: Auto-Join Compatibility für IOS eingefügt
// -v2.3.2: Snapshot Receive and send für duell
// -v2.3.3: echo-back Cid for native IOS client
// -v2.3.4: IOS-Bot Compatibility
// -v2.3.5: Logging for room-match erweitert.
// -v2.3.6: Bot Leave and Disconnect function
// -v2.3.8: M7 Drift Hardening
// -v2.3.9: P0: state fingerprint + dublicate detector (debug / triage)
// -v2.4.2: P1 Architecture change: Server authoritative but with compatibility for optimistic clients
// -v2.4.3: P1.1 Invariant-Validation + Corruption Guardrails (server-side, red console errors)
// -v2.4.5: P1.2 Initial Deal + Shuffle Server-Authoritative
// ================================================================
// -----------------------------------------------------------------------------
// Versionierung / Patch-Log (BITTE bei JEDEM Patch aktualisieren)
// -----------------------------------------------------------------------------
// Date (YYYY-MM-DD) | Version  | Change
// 2026-02-15        | v2.4.14  | Bugfixing A2: enforce server-side validation for client-originated moves before broadcast
// 2026-02-14        | v2.4.13  | Bugfixing A1: drop flip moves with invalid cardId to prevent UNK drift
// 2026-02-06        | v2.4.12  | AIRBAG: card-conservation invariant recovery (broadcast snapshot on failure)
// 2026-01-25        | v2.4.11  | P1: Gate server-generated (bot) moves through matches.validateAndApplyMove; reject illegal moves server-side (no broadcast), keep protocol stable
// 2026-01-23        | v2.4.10  | Guardrails: route serverbot moves through M7 pipeline (moveId+matchRev+echo), add server-level duplicate bot-move signature suppression
// 2026-01-23        | v2.4.9   | P1.3 wiring: snapshotFromCidForRecipient() to ensure fromCid==selfCid for server snapshots
// 2026-01-23        | v2.4.6   | P1.3 wiring: server-authoritative initial STATE_SNAPSHOT via matches.ensureInitialSnapshot + per-player getSnapshotForPlayer; stop legacy snapshot recycling
// 2026-01-23        | v2.4.5   | Baseline: P1.2 + M7 Drift Hardening (pre P1.3 wiring)
//                  |          | Hinweis: Neue Einträge oben anfügen (neueste zuerst).
// -----------------------------------------------------------------------------
//
// Hinweis: Die lange "-vX.Y.Z" Liste oben gilt als historisch. Bitte neue Einträge nur noch hier pflegen.
// -----------------------------------------------------------------------------


const http   = require('node:http');
const https  = require('node:https');
const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const { WebSocketServer } = require('ws');
const { URL } = require('node:url');


// ---------- Version / CLI ----------
const VERSION = '2.4.14';
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


// ---------- Optional ServerBot module (split bot logic out of server.js) ----------
// NOTE: All bot decision logic lives in serverbot.js; server.js only wires transport + match lifecycle.
let serverbot = null;
let serverbotOk = false;

try {
  // Allow both './serverbot.js' and './serverbot'
  serverbot = require('./serverbot');

  const hasCreate = !!(serverbot && typeof serverbot.createServerBot === 'function');
  const hasIngest = !!(serverbot && typeof serverbot.handleBotStateUpdate === 'function');
  const hasTick = !!(serverbot && (
    typeof serverbot.runBotDecisionTick === 'function' ||
    typeof serverbot.runBotHeartbeatTick === 'function'
  ));

  serverbotOk = hasCreate && hasIngest && hasTick;

  if (serverbotOk) {
    console.log('[BOT] ServerBot module loaded.');
  } else {
    console.log('[BOT] serverbot.js loaded but missing required exports (createServerBot + handleBotStateUpdate + tick) – ServerBot disabled.');
    serverbot = null;
  }
} catch (e) {
  serverbotOk = false;
  serverbot = null;
  console.log('[BOT] serverbot.js missing or invalid – ServerBot disabled.');
}




// Unified tick wrapper (supports both serverbot APIs)
function runServerBotTick(matchId) {
  if (!serverbotOk || !serverbot) return;

  // serverbot.js expects a deps object with at least `broadcastToRoom(room, payload)`.
  // IMPORTANT: our `broadcastToRoom(room, data, excludeWs)` expects `data` to be a STRING.
  const deps = {
    // serverbot.js historically called broadcastToRoom(payload) (single-arg).
    // Newer code may call broadcastToRoom(room, payload).
    // We support BOTH without changing bot logic.
    broadcastToRoom: (roomOrPayload, maybePayload) => {
      // If only one arg was provided, treat it as payload and use current matchId as room.
      const room = (maybePayload === undefined) ? matchId : roomOrPayload;
      const payload = (maybePayload === undefined) ? roomOrPayload : maybePayload;

      try {
        const msg = (typeof payload === 'string') ? payload : JSON.stringify(payload);
        ingestServerGeneratedMove(room, msg);
      } catch (e) {
        // If payload cannot be stringified, do nothing.
      }
    },
    log: (...args) => console.log('[BOT]', ...args)
  };

  try {
    if (typeof serverbot.runBotDecisionTick === 'function') {
      serverbot.runBotDecisionTick(matchId, deps);
      return;
    }
    if (typeof serverbot.runBotHeartbeatTick === 'function') {
      serverbot.runBotHeartbeatTick(matchId, deps);
      return;
    }
  } catch (e) {
    console.error('[BOT] ServerBot tick failed:', e);
  }
}

function ingestServerGeneratedMove(matchId, payload) {
  // payload can be an object or JSON string. Expected: { move: {...}, from: 'bot-...' , meta?: {...} }
  if (!matchId || matchId === 'lobby' || matchId === 'default') return;

  let data = payload;
  try {
    if (typeof payload === 'string') data = JSON.parse(payload);
  } catch {
    return;
  }

  if (!data || typeof data !== 'object' || !data.move) return;

  const sig = computeMoveSig(data.move);
  if (sig && seenServerMoveSig(matchId, sig)) {
    console.log(`[BOT] ${isoNow()} duplicate move suppressed matchId="${matchId}" sig="${sig}" from=${data.from || 'n/a'}`);
    return;
  }

  // Ensure meta exists and is additive
  if (!data.meta) data.meta = {};
  data.meta.matchId = data.meta.matchId || matchId;

  // Always attach a moveId for server-generated moves so M7 de-dup works.
  if (!data.meta.moveId && !data.meta.id) {
    const rid = Math.random().toString(36).slice(2, 8);
    data.meta.moveId = `srvbot-${matchId}-${Date.now()}-${rid}`;
  }

  // ----------------------------------------------------------
  // P1: Server-authoritative validation/apply for server-generated moves (bot)
  // If invalid, DO NOT broadcast. This prevents illegal bot moves from ever reaching clients.
  // Protocol remains unchanged (we only log on reject).
  // ----------------------------------------------------------
  try {
    if (typeof validateAndApplyMove === 'function') {
      const gate = validateAndApplyMove(matchId, data.move, data.from || 'bot', {
        seed: data.meta.seed || null,
        fromCid: 'srv',
        moveId: data.meta.moveId || data.meta.id || null,
        moveSig: sig || null,
        at: isoNow()
      });
      if (!gate || gate.ok !== true) {
        const reason = (gate && gate.reason) ? gate.reason : 'invalid_move';

        // Extra debug for bot: show what the authoritative snapshot contains at the referenced source pile.
        // This helps diagnose "bad_from" / "bad_card" (usually index mapping or cardId shape mismatch).
        try {
          if (reason === 'bad_from' || reason === 'bad_card') {
            const auth = getSnapshot(matchId) || getCachedSnapshot(matchId);
            const st = auth && auth.state ? auth.state : null;
            const mv = data.move || {};

            const fromIdx = (mv.from && (mv.from.uiIndex ?? mv.from.index ?? mv.from.i)) ?? (mv.fromIndex ?? mv.fromIdx ?? mv.from) ?? null;
            const toIdx = (mv.to && (mv.to.uiIndex ?? mv.to.index ?? mv.to.i)) ?? (mv.toIndex ?? mv.toIdx ?? mv.to) ?? null;
            const cardId = mv.cardId || mv.id || null;

            // Determine side based on cardId prefix.
            const sideKey = (typeof cardId === 'string' && cardId.startsWith('Y-')) ? 'you' : 'opp';
            const side = st && st[sideKey];
            const tableau = side && Array.isArray(side.tableau) ? side.tableau : null;

            let pileLen = null;
            let top = null;
            if (tableau && fromIdx != null) {
              const fi = Number(fromIdx);
              if (Number.isFinite(fi) && fi >= 0 && fi < tableau.length) {
                const pile = tableau[fi];
                if (Array.isArray(pile)) {
                  pileLen = pile.length;
                  const t = pile.length ? pile[pile.length - 1] : null;
                  if (t && typeof t === 'object') {
                    top = {
                      id: t.cardId || t.id || t.code || null,
                      rank: t.rank ?? null,
                      suit: t.suit ?? null,
                      up: (t.up ?? t.faceUp ?? null)
                    };
                  } else if (typeof t === 'string') {
                    top = { id: t };
                  }
                }
              }
            }

            console.warn(`[BOT_REJECT_DBG] ${isoNow()} matchId="${matchId}" reason=${reason} kind=${mv.kind || 'n/a'} side=${sideKey} from=${fromIdx} to=${toIdx} cardId=${cardId || '-'} pileLen=${pileLen ?? 'n/a'} top=${top ? JSON.stringify(top) : 'n/a'}`);
          }
        } catch {}

        console.warn(`[MOVE_REJECT] ${isoNow()} matchId="${matchId}" actor=${data.from || 'bot'} kind=${data.move?.kind || 'n/a'} reason=${reason} moveId=${data.meta.moveId || '-'} sig=${sig || '-'}`);
        // Drive convergence even on reject: push authoritative snapshot immediately to all peers.
        try {
          const snap = getSnapshot(matchId) || getCachedSnapshot(matchId);
          if (snap && snap.state) {
            broadcastServerSnapshotToRoom(matchId, snap, `move_reject:${reason}`);
          }
        } catch {}
        requestSnapshotFromRoom(matchId, data.meta.seed || null, `move_reject:${reason}`);
        return; // IMPORTANT: do not broadcast rejected server-generated moves
      }

      if (gate && gate.airbag && gate.airbag.ok === false) {
        const snap = getSnapshot(matchId) || getCachedSnapshot(matchId);
        if (snap && snap.state) {
          broadcastServerSnapshotToRoom(matchId, snap, 'airbag_card_conservation');
        }
        requestSnapshotFromRoom(matchId, data.meta.seed || null, 'airbag_card_conservation');
      }
    }
  } catch (e) {
    console.error('[P1] validateAndApplyMove gate failed (falling back to broadcast)', e);
  }

  const moveId = String(data.meta.moveId || data.meta.id || '');
  if (moveId) {
    const isDup = rememberMoveId(matchId, moveId);
    if (isDup) {
      console.log(`[M7] ${isoNow()} DUP server-move ignored matchId="${matchId}" moveId=${moveId}`);
      return;
    }
  }



  const out = JSON.stringify(data);
  // Server/bot moves must be echoed to all (including host) to keep clients deterministic.
    // NOTE: authoritative state/rev already applied in matches.validateAndApplyMove above (when available).
  broadcastToRoom(matchId, out, null);

  // Drive convergence
  requestSnapshotFromRoom(matchId, data.meta.seed || null, 'after_bot_move');
  maybeTriggerCorruptionAirbag(matchId, 'after_bot_move');
}

// Stop bot heartbeat + unregister bot for a match (best-effort).
function stopServerBot(matchId, reason = 'unknown') {
  if (!serverbotOk || !serverbot || !matchId) return false;

  let bot = null;
  try { bot = serverbot.getServerBot(matchId); } catch {}
  if (!bot) return false;

  // Stop interval/timers
  try {
    if (bot.__interval) {
      clearInterval(bot.__interval);
      bot.__interval = null;
    }
  } catch {}

  // Best-effort unregister (support multiple serverbot API shapes)
  try {
    if (typeof serverbot.deleteServerBot === 'function') {
      serverbot.deleteServerBot(matchId);
    } else if (typeof serverbot.removeServerBot === 'function') {
      serverbot.removeServerBot(matchId);
    } else if (typeof serverbot.unregisterServerBot === 'function') {
      serverbot.unregisterServerBot(matchId);
    }
  } catch {}

  console.log(`[BOT] stopped matchId="${matchId}" reason="${reason}"`);
  return true;
}

function maybeStopBotIfRoomEmpty(room, reason) {
  if (!room || room === 'lobby' || room === 'default') return;
  const remaining = peersInRoom(room);
  if (remaining > 0) return;
  // Only stop if a bot exists for this match.
  try {
    if (serverbotOk && serverbot && typeof serverbot.getServerBot === 'function') {
      const bot = serverbot.getServerBot(room);
      if (bot) stopServerBot(room, reason || 'room_empty');
    }
  } catch {}
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


const {
  createMatchForClient,
  joinMatchForClient,
  markPlayerDisconnected,
  getPublicMatchView,
  cleanupOldMatches,
  updateMatchGameState,

  // M7 drift hardening helpers (match-scoped)
  bumpMatchRev,
  rememberMoveId,
  // cacheSnapshot,   // Optionally remove if not used
  getCachedSnapshot,

  // P1 helpers (server-authoritative snapshot access)
  getSnapshot,
  setAuthoritativeState,
  ensureInitialSnapshot,
  getSnapshotForPlayer,
  getLastInvariant,
  validateAndApplyMove
} = require('./matches');
const STATUS_INTERVAL_MS = 30_000;
const HELLO_SUPPRESS_MS  = 15_000;
let lastGlobalStatusLog = 0;
const lastSysLogByRoom = new Map();
const lastHelloTsByClient = new WeakMap();
// M7: Resync throttle (prevents state_request storms under drift / stress)
const RESYNC_THROTTLE_MS = 1500;
const lastStateRequestByKey = new Map(); // key = `${matchId}|${fromCid}` -> ts
const lastSnapshotSentToKey = new Map(); // key = `${matchId}|${toCid}`   -> ts

// Debug: throttle schema logs so we can inspect snapshot shapes without flooding.
const lastSchemaLogByKey = new Map(); // `${matchId}|${tag}` -> ts
const SCHEMA_LOG_THROTTLE_MS = 15_000;

function logStateSchemaOnce(matchId, tag, state) {
  if (!matchId || !state) return;
  const now = Date.now();
  const key = `${matchId}|${tag}`;
  const last = lastSchemaLogByKey.get(key) || 0;
  if ((now - last) < SCHEMA_LOG_THROTTLE_MS) return;
  lastSchemaLogByKey.set(key, now);

  try {
    const keys = Object.keys(state || {}).slice(0, 40);
    const f = state.foundations;
    const foundationsType = Array.isArray(f) ? 'array' : (f && typeof f === 'object' ? 'object' : typeof f);

    // Try to detect common pile containers (legacy + P1.3)
    const tableaus = state.tableaus || state.tableau || state.piles?.tableaus || state.piles?.tableau;
    const stock = state.stock || state.piles?.stock || state.deck || state.piles?.deck;
    const waste = state.waste || state.piles?.waste || state.discard || state.piles?.discard;

    const tableauLen = Array.isArray(tableaus) ? tableaus.length : (Array.isArray(tableaus?.cards) ? tableaus.cards.length : null);
    const stockLen = Array.isArray(stock) ? stock.length : (Array.isArray(stock?.cards) ? stock.cards.length : null);
    const wasteLen = Array.isArray(waste) ? waste.length : (Array.isArray(waste?.cards) ? waste.cards.length : null);

    console.log(`[SCHEMA] ${isoNow()} tag=${tag} matchId="${matchId}" keys=${keys.join(',')} foundationsType=${foundationsType} tableauLen=${tableauLen} stockLen=${stockLen} wasteLen=${wasteLen}`);
  } catch (e) {
    console.log(`[SCHEMA] ${isoNow()} tag=${tag} matchId="${matchId}" (schema log failed)`);
  }
}

// Bot/server-move de-dup (server-side): prevents repeated identical bot moves when state doesn't change.
const recentServerMoveSigsByMatch = new Map(); // matchId -> [{sig, at}]
const SERVER_MOVE_SIG_WINDOW_MS = 20_000;

function computeMoveSig(move) {
  try {
    const kind = String(move?.kind || '');
    const cardId = String(move?.cardId || '');
    const fromIdx = (move?.from && (move.from.uiIndex ?? move.from.index ?? move.from.i)) ?? '';
    const toIdx = (move?.to && (move.to.uiIndex ?? move.to.index ?? move.to.i ?? move.to.f)) ?? '';
    return `${kind}:${cardId}:${fromIdx}->${toIdx}`;
  } catch {
    return null;
  }
}

function seenServerMoveSig(matchId, sig) {
  if (!matchId || !sig) return false;
  const now = Date.now();
  const arr = recentServerMoveSigsByMatch.get(matchId) || [];
  const seen = arr.some(x => x && x.sig === sig && (now - x.at) <= SERVER_MOVE_SIG_WINDOW_MS);
  // prune + keep small
  const next = arr.filter(x => x && (now - x.at) <= (SERVER_MOVE_SIG_WINDOW_MS * 3)).slice(-24);
  if (!seen) next.push({ sig, at: now });
  recentServerMoveSigsByMatch.set(matchId, next);
  return seen;
}


// P1.1: Corruption airbag (when invariant fails, push canonical snapshot + request resync)
const CORRUPTION_AIRBAG_THROTTLE_MS = 2000;
const lastCorruptionAirbagByRoom = new Map(); // matchId -> ts

function maybeTriggerCorruptionAirbag(matchId, reason = 'invariant_failed') {
  if (!matchId || matchId === 'lobby' || matchId === 'default') return false;
  const nowMs = Date.now();
  const last = lastCorruptionAirbagByRoom.get(matchId) || 0;
  if ((nowMs - last) < CORRUPTION_AIRBAG_THROTTLE_MS) return false;
  lastCorruptionAirbagByRoom.set(matchId, nowMs);

  const inv = getLastInvariant(matchId);
  if (!inv || inv.ok) return false;

  // Prefer canonical cached snapshot
  const snap = getSnapshot(matchId) || getCachedSnapshot(matchId);
  if (snap && snap.state) {
    broadcastServerSnapshotToRoom(matchId, snap, `corruption_airbag:${reason}`);
  }

  // Always request a fresh snapshot afterwards (host may have newer truth)
  requestSnapshotFromRoom(matchId, (snap && snap.seed) ? snap.seed : null, `corruption_airbag:${reason}`);

  // Highlight in console
  const RED = '\x1b[31m';
  const RESET = '\x1b[0m';
  console.warn(`${RED}[AIRBAG] ${isoNow()} matchId="${matchId}" reason=${inv.reason} expected=${inv.expectedTotalCards} found=${inv.foundTotalCards} missing=${inv.missingCount} dupes=${(inv.dupes||[]).length} unk=${(inv.unknownIds||[]).length} hash=${inv.snapshotHash}${RESET}`);
  return true;
}

// P1: server-initiated snapshot requests (throttled)
function requestSnapshotFromRoom(matchId, seed = null, reason = 'server_request') {
  if (!matchId || matchId === 'lobby' || matchId === 'default') return false;
  const nowMs = Date.now();
  const key = `${matchId}|srv`;
  const lastReq = lastStateRequestByKey.get(key) || 0;
  if ((nowMs - lastReq) < RESYNC_THROTTLE_MS) return false;
  lastStateRequestByKey.set(key, nowMs);

  broadcastSysToRoom(matchId, {
    type: 'state_request',
    matchId,
    seed: seed || null,
    at: isoNow(),
    fromCid: 'srv',
    reason
  });
  return true;
}
setInterval(() => cleanupOldMatches(), 10 * 60 * 1000).unref();


function isoNow() { return new Date().toISOString(); }

function snapshotFromCidForRecipient(ws, snap) {
  // iOS swaps you/opp when fromCid != selfCid. Server snapshots must not trigger swaps.
  const recipientCid = ws && ws.__cid ? ws.__cid : null;
  const src = (snap && typeof snap.fromCid === 'string') ? snap.fromCid : null;

  // If we don't know the recipient cid, keep non-srv fromCid or omit.
  if (!recipientCid) return (src && src !== 'srv') ? src : null;

  // For server snapshots (src missing or 'srv'), force recipient cid.
  if (!src || src === 'srv') return recipientCid;

  // Otherwise preserve explicit per-player fromCid if set.
  return src;
}

function broadcastServerSnapshotToRoom(room, snapObj, reason = 'server_snapshot') {
  // Send a server-originated snapshot per recipient so each iOS client gets fromCid==selfCid.
  const set = rooms.get(room);
  if (!set || !snapObj || !snapObj.state) return;

  for (const client of set) {
    if (client.readyState !== client.OPEN) continue;

    sendSys(client, {
      type: 'state_snapshot',
      matchId: room,
      seed: snapObj.seed || null,
      at: isoNow(),
      fromCid: snapshotFromCidForRecipient(client, snapObj) || (client.__cid || null),
      matchRev: snapObj.matchRev || null,
      snapshotHash: snapObj.snapshotHash || null,
      state: snapObj.state,
      reason
    }, { matchId: room });
  }
}

// ------------------------------------------------------------
// DEPRECATED (P1.2): Legacy server initial state builder
// NOTE: As of P1.3, server-authoritative initial STATE_SNAPSHOT is created in matches.js
// via ensureInitialSnapshot() and delivered per-player via getSnapshotForPlayer().
// Keep this function for now to avoid large diffs; do not use it for new flows.
// ------------------------------------------------------------
function buildInitialState({ seed, shuffleMode = 'shared' }) {
  // NOTE: Minimal, deterministic Klondike init.
  // Cards are generated once, server-side. Clients must never deal.

  // Suits: S,H,D,C  Ranks: 0(A)..12(K)
  const suits = ['S', 'H', 'D', 'C'];
  const ranks = [...Array(13).keys()];

  const cards = [];
  let deckCount = (shuffleMode === 'shared') ? 2 : 1; // shared=104, split=52 per player

  for (let d = 0; d < deckCount; d++) {
    for (const s of suits) {
      for (const r of ranks) {
        cards.push({ id: `${s}-${r}-${d}`, suit: s, rank: r });
      }
    }
  }

  // Deterministic shuffle (seeded Fisher-Yates)
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = (h ^ seed.charCodeAt(i)) * 16777619;
  function rnd() {
    h ^= h << 13; h ^= h >> 17; h ^= h << 5;
    return (h >>> 0) / 4294967296;
  }

  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  // Deal Klondike tableau (7 piles)
  const tableaus = Array.from({ length: 7 }, () => []);
  let idx = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col; row++) {
      const c = cards[idx++];
      tableaus[col].push({ ...c, faceUp: row === col });
    }
  }

  const stock = cards.slice(idx).map(c => ({ ...c, faceUp: false }));

  return {
    seed,
    shuffleMode,
    foundations: { S: [], H: [], D: [], C: [] },
    tableaus,
    stock,
    waste: []
  };
}

// ------------------------------------------------------------
// P0: State Fingerprint + Duplicate Detector (Debug / Triage)
// - Extracts card ids heuristically from arbitrary snapshot shapes.
// - Logs duplicates + counts to pinpoint where duplicates appear.
// ------------------------------------------------------------
const CARD_ID_REGEX = /^[A-Za-z]-[A-Za-z0-9]+/; // permissive (e.g., "S-UNK-...", "H-12-...")
function looksLikeCardId(s) {
  if (typeof s !== 'string') return false;
  if (s.length < 3 || s.length > 64) return false;
  return CARD_ID_REGEX.test(s) || (s.includes('-') && s.length <= 32);
}

function collectCardIdsHeuristic(root, maxDepth = 8) {
  const ids = [];
  const seen = new WeakSet();

  function visit(node, depth) {
    if (node == null) return;
    if (depth > maxDepth) return;

    const t = typeof node;

    // String leaf
    if (t === 'string') {
      if (looksLikeCardId(node)) ids.push(node);
      return;
    }

    // Primitive leaf
    if (t !== 'object') return;

    // Prevent cycles
    if (seen.has(node)) return;
    seen.add(node);

    // Array
    if (Array.isArray(node)) {
      for (const v of node) visit(v, depth + 1);
      return;
    }

    // Object: pick common fields first
    // Card objects often have: { id }, { cardId }, { cid }, { code }
    const directKeys = ['cardId', 'id', 'cid', 'code'];
    for (const k of directKeys) {
      if (typeof node[k] === 'string' && looksLikeCardId(node[k])) ids.push(node[k]);
    }

    // Recurse into object props
    for (const [k, v] of Object.entries(node)) {
      if (k === '__proto__' || k === 'constructor') continue;
      visit(v, depth + 1);
    }
  }

  visit(root, 0);
  return ids;
}

function computeDuplicates(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  const dups = [];
  for (const [id, n] of counts.entries()) {
    if (n > 1) dups.push({ id, n });
  }
  // deterministic order: most frequent first, then id
  dups.sort((a, b) => (b.n - a.n) || (a.id < b.id ? -1 : 1));
  return { unique: counts.size, dups };
}

function tryExtractStockTop(state, n = 10) {
  const candidates = [
    state?.stock,
    state?.stock?.cards,
    state?.stockCards,
    state?.piles?.stock,
    state?.piles?.stock?.cards,
    state?.deck,
    state?.deck?.cards
  ].filter(Boolean);

  for (const c of candidates) {
    if (Array.isArray(c)) {
      const top = [];
      for (const item of c) {
        if (typeof item === 'string' && looksLikeCardId(item)) top.push(item);
        else if (item && typeof item === 'object') {
          const id = item.cardId || item.id || item.code;
          if (typeof id === 'string' && looksLikeCardId(id)) top.push(id);
        }
        if (top.length >= n) break;
      }
      if (top.length) return top;
    }
  }
  return [];
}

function logFingerprint(tag, matchId, sysSeed, snapState, extra = {}) {
  try {
    const ids = collectCardIdsHeuristic(snapState);
    const { unique, dups } = computeDuplicates(ids);
    const total = ids.length;

    const stockTop10 = tryExtractStockTop(snapState, 10);

    const payload = {
      at: isoNow(),
      tag,
      matchId,
      seed: sysSeed || snapState?.seed || null,
      shuffleMode: snapState?.shuffleMode || snapState?.mode || null,
      totalCardRefs: total,
      uniqueCardIds: unique,
      duplicateCount: dups.length,
      duplicateIds: dups.slice(0, 12), // cap log size
      stockTop10,
      ...extra
    };

    console.log(`[FPR] ${JSON.stringify(payload)}`);
  } catch (e) {
    console.log(`[FPR] ${isoNow()} tag=${tag} matchId="${matchId}" (fingerprint failed)`);
  }
}
function getRoomOf(ws) { return ws.__room || null; }
function joinRoom(ws, room) {
  const prev = ws.__room || null;
  ws.__room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);

  // Player-Directory aktualisieren, falls Eintrag existiert
  if (ws.__cid && playerDirectory.has(ws.__cid)) {
    const entry = playerDirectory.get(ws.__cid);
    entry.room = room;
    entry.lastSeen = Date.now();
  }

  // ---- DEBUG LOGGING (no behavior change) ----
  if ((process.env.DEBUG_ROOMS || '') === '1') {
    console.log(`[ROOM] ${isoNow()} join cid=${ws.__cid || 'n/a'} from="${prev || ''}" to="${room}" peers=${peersInRoom(room)}`);
  }
  // ---- END DEBUG LOGGING ----
}
function leaveRoom(ws) {
  const room = getRoomOf(ws);
  if (!room) return;
  const before = peersInRoom(room);
  const set = rooms.get(room);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(room);
  }
  ws.__room = null;

  // ---- DEBUG LOGGING (no behavior change) ----
  if ((process.env.DEBUG_ROOMS || '') === '1') {
    const after = peersInRoom(room);
    console.log(`[ROOM] ${isoNow()} leave cid=${ws.__cid || 'n/a'} room="${room}" peers ${before} -> ${after}`);
  }
  // ---- END DEBUG LOGGING ----
}
function peersInRoom(room) {
  const set = rooms.get(room);
  return set ? set.size : 0;
}

function isMatchRoom(room) {
  if (!room) return false;
  return room !== 'lobby' && room !== 'default';
}

function forceEvictRoom(room, reason = 'peer_disconnect') {
  if (!isMatchRoom(room)) return 0;
  const set = rooms.get(room);
  if (!set || set.size === 0) return 0;

  let evicted = 0;
  for (const client of Array.from(set)) {
    try {
      sendSys(client, {
        type: 'match_terminated',
        matchId: room,
        reason,
        at: isoNow()
      }, { matchId: room });
    } catch {}

    try {
      if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
        client.close(4001, `match_terminated:${reason}`);
      }
    } catch {}

    evicted++;
  }

  console.warn(`[ROOM_RESET] ${isoNow()} room="${room}" reason=${reason} evicted=${evicted}`);
  return evicted;
}

function broadcastToRoom(room, data, excludeWs = null) {
  const set = rooms.get(room);

  // ---- DEBUG LOGGING (no behavior change) ----
  // Enable with: DEBUG_BROADCAST=1 node server.js
  const dbg = (process.env.DEBUG_BROADCAST || '') === '1';
  if (dbg) {
    const total = set ? set.size : 0;
    let openCount = 0;
    let targetCount = 0;
    const sample = [];

    if (set) {
      for (const client of set) {
        if (client.readyState === client.OPEN) openCount++;
        if (client !== excludeWs && client.readyState === client.OPEN) {
          targetCount++;
          if (sample.length < 5) {
            sample.push(client.__cid || client.__cid === '' ? String(client.__cid) : (client.__cid ?? client.__cid));
          }
        }
      }
    }

    // Try to classify payload without parsing it (avoid side effects)
    let kind = 'unknown';
    try {
      if (typeof data === 'string') {
        if (data.includes('"move"')) kind = 'move';
        else if (data.includes('"sys"')) kind = 'sys';
      }
    } catch {}

    const bytes = (typeof data === 'string') ? Buffer.byteLength(data, 'utf8') : 0;
    console.log(
      `[BROADCAST] ${isoNow()} room="${room}" kind=${kind} total=${total} open=${openCount} targets=${targetCount}` +
      (sample.length ? ` sampleCid=${sample.join(',')}` : '') +
      ` bytes=${bytes}`
    );
  }
  // ---- END DEBUG LOGGING ----

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
        `from=${data.from || 'n/a'} cid=${ws.__cid || 'n/a'} hasMoveId=${!!(data?.meta && (data.meta.moveId || data.meta.id))}`
      );
      try {
        const payloadStr = JSON.stringify(data.move);
        const isFlip = String(data.move.kind || '') === 'flip';
        const hasCardId = !!data.move.cardId;
        console.log('[MOVE-PAYLOAD]', payloadStr, isFlip && !hasCardId ? '(!) flip missing cardId' : '');
      } catch (e) {
        console.warn('[MOVE-PAYLOAD] JSON stringify failed:', e);
      }

      // ----------------------------------------------------------
      // M7: Move sequencing + best-effort drift hardening (additive)
      // - If meta.moveId exists: de-dup on server (prevents double-apply)
      // - Assign matchRev per match and attach it to meta
      // - Optionally echo moves back to sender ONLY when moveId exists
      //   (safer for idempotent clients; legacy clients keep old behavior)
      // ----------------------------------------------------------
      const matchId = (data?.meta && (data.meta.matchId || data.meta.match_id)) || currentRoom;
      const hasMoveId = !!(data?.meta && (data.meta.moveId || data.meta.id));
      let moveId = hasMoveId ? (data.meta.moveId || data.meta.id) : null;

      // P1 mini-fix: For iOS↔iOS and iOS↔BOT stability we prefer echo-to-sender.
      // If a client sends moves without moveId, generate a server moveId (additive field) so
      // idempotent clients can de-dup and the sender can safely rely on echo.
      // NOTE: This is scoped by heuristics to avoid re-breaking legacy/PWA clients.
      const fromTag = String(data.from || '').toLowerCase();
      const moveKindTag = String(data.move.kind || '').toLowerCase();
      const looksLikeIOS = fromTag.includes('ios') || fromTag.includes('native') || fromTag.includes('iphone') || fromTag.includes('ipad');
      const looksLikeBot = fromTag.includes('bot') || moveKindTag.includes('bot');
      const P1_ECHO_ALL = (process.env.P1_ECHO_ALL_MOVES || '').toLowerCase() === '1';
      const shouldForceEcho = P1_ECHO_ALL || looksLikeIOS || looksLikeBot;

      if (!moveId && shouldForceEcho) {
        if (!data.meta) data.meta = {};
        // stable enough identifier for dedupe (match-scoped on server)
        const rid = Math.random().toString(36).slice(2, 8);
        moveId = `srv-${ws.__cid || 'n/a'}-${Date.now()}-${rid}`;
        data.meta.moveId = moveId;
      }

      // P1 guard: Never forward a flip with missing or malformed cardId.
      // If a client emits flip without a valid cardId, some clients materialize placeholder "UNK" cards in waste.
      // Dropping the move forces convergence via snapshot.
      const isFlipMove = String(data.move.kind || '') === 'flip';
      const flipCardId = String(data.move.cardId || '');
      const isValidFlipCardId = /^([YO])-\d+-(♠️?|♥️?|♦️?|♣️?)-\d+$/.test(flipCardId);
      if (isFlipMove && !isValidFlipCardId) {
        console.warn(`[P1] ${isoNow()} DROP flip-invalid-cardId matchId="${matchId}" cid=${ws.__cid || 'n/a'} moveId=${moveId || '-'} from=${data.from || 'n/a'} cardId=${flipCardId || '-'}`);
        requestSnapshotFromRoom(matchId, (data.meta && data.meta.seed) ? data.meta.seed : null, 'flip_invalid_cardId');
        return;
      }

      if (matchId && matchId !== 'lobby' && matchId !== 'default') {
        if (moveId) {
          const isDup = rememberMoveId(matchId, String(moveId));
          if (isDup) {
            console.log(`[M7] ${isoNow()} DUP move ignored matchId="${matchId}" moveId=${moveId} cid=${ws.__cid || 'n/a'}`);
            return; // hard stop: do not forward duplicates
          }
        }

        // A2: Enforce server-side move validation for client-originated moves as well.
        // If validation rejects, do not broadcast the move.
        let appliedByGate = false;
        try {
          if (typeof validateAndApplyMove === 'function') {
            const gate = validateAndApplyMove(matchId, data.move, data.from || ws.__cid || 'client', {
              seed: (data.meta && data.meta.seed) ? data.meta.seed : null,
              fromCid: ws.__cid || null,
              at: isoNow()
            });
            if (!gate || gate.ok !== true) {
              const reason = (gate && gate.reason) ? gate.reason : 'invalid_move';
              console.warn(`[MOVE_REJECT] ${isoNow()} matchId="${matchId}" actor=${data.from || ws.__cid || 'client'} kind=${data.move?.kind || 'n/a'} reason=${reason} moveId=${moveId || '-'} cid=${ws.__cid || 'n/a'}`);
              try {
                const snap = getSnapshot(matchId) || getCachedSnapshot(matchId);
                if (snap && snap.state) {
                  broadcastServerSnapshotToRoom(matchId, snap, `move_reject:${reason}`);
                }
              } catch {}
              requestSnapshotFromRoom(matchId, (data.meta && data.meta.seed) ? data.meta.seed : null, `move_reject:${reason}`);
              return;
            }
            appliedByGate = true;
          }
        } catch (e) {
          console.error('[A2] validateAndApplyMove gate failed (falling back to legacy forward)', e);
        }

        // Keep additive matchRev for clients. If gated, read authoritative rev; otherwise bump legacy rev.
        let rev = null;
        if (appliedByGate) {
          try {
            const snap = getSnapshot(matchId) || getCachedSnapshot(matchId);
            rev = snap && typeof snap.matchRev === 'number' ? snap.matchRev : null;
          } catch {}
        }
        if (rev == null) {
          rev = bumpMatchRev(matchId);
        }
        if (rev != null) {
          if (!data.meta) data.meta = {};
          data.meta.matchRev = rev;
        }

        // Forward the move with additive meta (rev). Prefer compact re-stringify.
        const out = JSON.stringify(data);

        // P1 mini-fix: Echo-to-sender whenever we have a moveId (including server-generated moveIds for iOS/BOT).
        // Legacy clients without moveId still keep the old behavior unless forced by shouldForceEcho.
        if (moveId) {
          broadcastToRoom(matchId, out, null);
        } else {
          broadcastToRoom(matchId, out, ws);
        }

        // P1 (minimal): after every accepted move, ask the room for a fresh snapshot.
        // This drives convergence even before full server-side rule validation exists.
        requestSnapshotFromRoom(matchId, (data.meta && data.meta.seed) ? data.meta.seed : null, 'after_move');

        // P1.1: If invariant failed on the latest authoritative snapshot, push an emergency resync.
        maybeTriggerCorruptionAirbag(matchId, 'after_move');

        // Maintain status log cadence as before
        if (now - lastGlobalStatusLog >= STATUS_INTERVAL_MS) {
          logStatus();
          lastGlobalStatusLog = now;
        }

        return; // we've handled forwarding
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

        // Echo back the server-assigned client id (cid) so native clients (iOS) can
        // reliably identify themselves for snapshot mirroring (fromCid vs selfCid).
        // Safe for PWA clients: unknown sys messages are ignored.
        sendSys(ws, {
          type: 'hello_ack',
          cid: ws.__cid,
          nick: ws.__nick || 'Player',
          room: roomName,
          at: isoNow(),
          serverVersion: VERSION
        });
      }

      // ------------------------------------------------------------------
      // Auto-Join Compatibility: If a client connects directly to a match room
      // (room name == matchId) and sends hello, treat it like join_match.
      // This helps PWA flows that switch rooms via reconnect without sending
      // an explicit join_match sys message.
      // ------------------------------------------------------------------
      if (sys.type === 'hello') {
        const roomName = getRoomOf(ws) || currentRoom || 'lobby';
        const isLobbyLike = (roomName === 'lobby' || roomName === 'default');

        // Only try once per connection (join_match sets ws.__playerId)
        if (!isLobbyLike && !ws.__playerId) {
          const nick = ws.__nick || sys.nick || 'Player';
          try {
            const match = joinMatchForClient(ws, roomName, nick);
            const publicMatch = getPublicMatchView(match);

            // Reply to the joining client (same shape as explicit join_match)
            sendSys(ws, {
              type: 'match_joined',
              matchId: match.matchId,
              seed: match.seed,
              playerId: ws.__playerId,
              role: 'guest',
              status: match.status,
              hostNick: publicMatch.players[0]?.nick || 'Host'
            }, { matchId: match.matchId });

            // P1.3: Ensure authoritative snapshot exists and serve a per-player view to the joiner
            ensureInitialSnapshot(match.matchId, { seed: match.seed, fromCid: 'srv', shuffleMode: 'shared' });
            const joinerSnap = getSnapshotForPlayer(match.matchId, ws.__playerId) || getSnapshot(match.matchId) || getCachedSnapshot(match.matchId);
            if (joinerSnap && joinerSnap.state) {
              sendSys(ws, {
                type: 'state_snapshot',
                matchId: match.matchId,
                seed: joinerSnap.seed || match.seed,
                at: isoNow(),
                fromCid: snapshotFromCidForRecipient(ws, joinerSnap) || (ws.__cid || null),
                matchRev: joinerSnap.matchRev || null,
                snapshotHash: joinerSnap.snapshotHash || null,
                state: joinerSnap.state,
                reason: 'server_initial_state_on_auto_join'
              }, { matchId: match.matchId });
            }

            // match_update to all players in the match room
            broadcastSysToRoom(match.matchId, {
              type: 'match_update',
              matchId: match.matchId,
              status: match.status,
              players: publicMatch.players
            });

            console.log(
              `[MATCH] auto-join via hello matchId="${match.matchId}" guestNick="${nick}" cid=${ws.__cid}`
            );

            // Auto-start when 2 players are present
            if (match.players.length === 2 && match.status === 'ready') {
              broadcastSysToRoom(match.matchId, {
                type: 'reset',
                matchId: match.matchId,
                seed: match.seed
              });
              match.status = 'running';
              match.lastActivityAt = Date.now();
              console.log(`[MATCH] auto-start (auto-join) matchId="${match.matchId}" seed="${match.seed}"`);
            }
          } catch (err) {
            // Ignore if this room isn't a valid/active match
            // (match_not_found, match_full, match_finished, etc.)
          }
        }
      }
      // ------------------------------------------------------------------
      // GAME STATE SNAPSHOT (Client -> Server -> Room)
      // Allows clients (e.g., PWA host) to provide a full snapshot so other
      // clients (e.g., iOS) can resync and correctly mirror multi-card moves.
      // Envelope shape expected:
      //   { sys: { type:'state_snapshot', matchId, seed?, state: {...} }, from:'pwa' }
      // ------------------------------------------------------------------
      if (sys.type === 'state_snapshot') {
        // Determine matchId robustly
        const roomName = getRoomOf(ws) || currentRoom || 'lobby';
        let matchId = null;
        if (typeof sys.matchId === 'string' && sys.matchId.trim()) {
          matchId = sys.matchId.trim();
        } else if (roomName && roomName !== 'lobby' && roomName !== 'default') {
          matchId = roomName;
        }

        const snap = (sys.state && typeof sys.state === 'object') ? sys.state : null;
        if (!matchId || !snap) {
          // Missing required fields -> ignore
          return;
        }
        // P1.3: If we already have a server-authoritative snapshot, DO NOT overwrite it
        // with client-supplied snapshots (prevents legacy recycling + corruption loops).
        const existingAuthoritative = getSnapshot(matchId) || getCachedSnapshot(matchId);
        if (existingAuthoritative && existingAuthoritative.state && existingAuthoritative.fromCid === 'srv') {
          console.log(`[STATE] ${isoNow()} client snapshot ignored (authoritative exists) matchId="${matchId}" fromCid=${ws.__cid || 'n/a'}`);
          return;
        }
        // P0 Fingerprint (RX): detect duplicates as early as possible (before caching/broadcast)
        logFingerprint('RX', matchId, sys.seed || snap.seed || null, snap, {
          fromCid: ws.__cid || null,
          room: roomName
        });

        // P1: accept snapshot as the server's canonical cached snapshot (compat mode).
        // IMPORTANT: cacheSnapshot/matches.js no longer bumps matchRev; we bump here exactly once.
        setAuthoritativeState(matchId, snap, {
          seed: sys.seed || snap.seed || null,
          fromCid: ws.__cid || null,
          at: isoNow()
        });
        maybeTriggerCorruptionAirbag(matchId, 'after_state_snapshot');

        // Use canonical snapshot envelope from matches.js (includes matchRev + snapshotHash)
        const canonical = getSnapshot(matchId) || getCachedSnapshot(matchId);
        const canonicalState = (canonical && canonical.state) ? canonical.state : snap;
        const matchRevToSend = (canonical && canonical.matchRev) ? canonical.matchRev : null;

        // P0 Fingerprint (TX): log the state that will be broadcast
        logFingerprint('TX', matchId, (canonical && canonical.seed) ? canonical.seed : (sys.seed || snap.seed || null), canonicalState, {
          toRoom: matchId,
          matchRev: matchRevToSend || null,
          snapshotHash: (canonical && canonical.snapshotHash) ? canonical.snapshotHash : null
        });

        // Broadcast snapshot to everyone in the match room (additive fields)
        broadcastSysToRoom(matchId, {
          type: 'state_snapshot',
          matchId,
          seed: (canonical && canonical.seed) ? canonical.seed : (sys.seed || snap.seed || null),
          at: isoNow(),
          fromCid: ws.__cid || null,
          matchRev: matchRevToSend || null,
          snapshotHash: (canonical && canonical.snapshotHash) ? canonical.snapshotHash : null,
          state: canonicalState
        });

        console.log(
          `[STATE] ${isoNow()} snapshot received matchId="${matchId}" fromCid=${ws.__cid || 'n/a'} rev=${matchRevToSend || '-'}`
        );
        return;
      }

      // ------------------------------------------------------------------
      // GAME STATE REQUEST (Server -> Room)
      // Server can request that the host/client emits a `state_snapshot`.
      // ------------------------------------------------------------------
      if (sys.type === 'state_request') {
        // Clients may send this too (manual resync). Throttle forwarding and snapshot-to-requester.
        const roomName = getRoomOf(ws) || currentRoom || 'lobby';
        const matchId = (typeof sys.matchId === 'string' && sys.matchId.trim()) ? sys.matchId.trim() : roomName;
        if (!matchId || matchId === 'lobby' || matchId === 'default') return;

        const fromCid = ws.__cid || null;
        const nowMs = Date.now();
        const key = `${matchId}|${fromCid || 'n/a'}`;
        const lastReq = lastStateRequestByKey.get(key) || 0;
        const throttled = (nowMs - lastReq) < RESYNC_THROTTLE_MS;

        // P1.3: Ensure an authoritative snapshot exists (server-side initial deal).
        // If the last invariant indicates corruption, regenerate (do not keep serving corrupt cache).
        const inv = getLastInvariant ? getLastInvariant(matchId) : null;
        if (inv && inv.ok === false) {
          ensureInitialSnapshot(matchId, { seed: sys.seed || null, fromCid: 'srv', shuffleMode: 'shared' });
        }

        const ensured = ensureInitialSnapshot(matchId, { seed: sys.seed || null, fromCid: 'srv', shuffleMode: 'shared' });
        const haveSnap = !!(ensured && ensured.state) || !!(getSnapshot(matchId) || getCachedSnapshot(matchId));

        if (!throttled && !haveSnap) {
          lastStateRequestByKey.set(key, nowMs);

          broadcastSysToRoom(matchId, {
            type: 'state_request',
            matchId,
            seed: sys.seed || null,
            at: isoNow(),
            fromCid
          });

          console.log(`[STATE] ${isoNow()} state_request forwarded matchId="${matchId}" fromCid=${fromCid || 'n/a'}`);
        } else if (throttled) {
          console.log(`[STATE] ${isoNow()} state_request THROTTLED matchId="${matchId}" fromCid=${fromCid || 'n/a'} (within ${RESYNC_THROTTLE_MS}ms)`);
        } else {
          console.log(`[STATE] ${isoNow()} state_request served-from-cache matchId="${matchId}" toCid=${fromCid || 'n/a'}`);
          maybeTriggerCorruptionAirbag(matchId, 'on_state_request');
        }

        const pid = ws.__playerId || null;
        const lastSnap = (pid ? getSnapshotForPlayer(matchId, pid) : null) || (getSnapshot(matchId) || getCachedSnapshot(matchId));
        if (lastSnap) {
          const snapKey = `${matchId}|${fromCid || 'n/a'}`;
          const lastSent = lastSnapshotSentToKey.get(snapKey) || 0;
          const snapThrottled = (nowMs - lastSent) < RESYNC_THROTTLE_MS;

          if (!snapThrottled) {
            lastSnapshotSentToKey.set(snapKey, nowMs);

            sendSys(ws, {
              type: 'state_snapshot',
              matchId,
              seed: lastSnap.seed || null,
              at: isoNow(),
              fromCid: snapshotFromCidForRecipient(ws, lastSnap) || (ws.__cid || null),
              matchRev: lastSnap.matchRev || null,
              snapshotHash: lastSnap.snapshotHash || null,
              state: lastSnap.state
            }, { matchId });

            console.log(`[M7] ${isoNow()} immediate snapshot-to-requester matchId="${matchId}" rev=${lastSnap.matchRev || '-'} hash=${lastSnap.snapshotHash || '-'}`);
          } else {
            console.log(`[M7] ${isoNow()} snapshot-to-requester THROTTLED matchId="${matchId}" toCid=${fromCid || 'n/a'} (within ${RESYNC_THROTTLE_MS}ms)`);
          }
        }

        return;
      }

      // Explicit leave (iOS UI "Leave" / manual exit):
      // If the client leaves a bot match room, stop the serverbot immediately.
      if (sys.type === 'leave' || sys.type === 'leave_match' || sys.type === 'match_leave') {
        const roomName = getRoomOf(ws) || currentRoom || 'lobby';
        const matchId = (typeof sys.matchId === 'string' && sys.matchId.trim())
          ? sys.matchId.trim()
          : roomName;

        // Stop bot if this was a bot match.
        stopServerBot(matchId, sys.type);

        // Move the client back to lobby-like room (keep the socket open).
        leaveRoom(ws);
        joinRoom(ws, 'lobby');

        sendSys(ws, {
          type: 'left',
          from: sys.type,
          matchId,
          room: 'lobby',
          at: isoNow()
        });

        return;
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

        if (!serverbotOk) {
          return;
        }

        // Only accept bot_state for matches that actually have a server-bot registered.
        const bot = serverbot.getServerBot(matchId);
        if (!bot) {
          return;
        }

        // --- Debug log for bot_state reception ---
        console.log(
          `[BOT] bot_state received matchId="${matchId}" tick=${sys.tick || 'n/a'}`
        );

        // sys.state ist der eigentliche Snapshot aus game.js (botStateVersion, metrics, tableauFull, ...)
        // serverbot.js erwartet genau dieses Objekt.
        const snap = (sys.state && typeof sys.state === 'object') ? sys.state : null;
        if (!snap) {
          console.log(`[BOT] bot_state ignored matchId="${matchId}" (missing sys.state snapshot)`);
          return;
        }

        // Debug: Inspect schema of the bot_state snapshot (client-provided)
        logStateSchemaOnce(matchId, 'bot_state_in', snap);

        // Debug: Inspect schema of the current authoritative snapshot (server-side)
        const auth = getSnapshot(matchId) || getCachedSnapshot(matchId);

        if (auth && auth.state && auth.state.you) {
          console.log('[AUTH.you.keys]', Object.keys(auth.state.you));
        }
        if (auth && auth.state && auth.state.opp) {
          console.log('[AUTH.opp.keys]', Object.keys(auth.state.opp));
        }

        if (auth && auth.state) {
          logStateSchemaOnce(matchId, 'auth_snapshot', auth.state);
        }

        // Tick aus dem Envelope in den Snapshot spiegeln (falls im Snapshot selbst nicht vorhanden)
        if (sys.tick != null && snap.tick == null) snap.tick = sys.tick;

        // Minimal-Metadaten ergänzen (hilft beim Debuggen; bricht keine Logik)
        if (snap.matchId == null) snap.matchId = matchId;
        if (snap.__fromCid == null) snap.__fromCid = ws.__cid;
        if (snap.__at == null) snap.__at = isoNow();

        // tick robust aus Envelope oder Snapshot ableiten
        const tickValue = (sys.tick != null)
          ? sys.tick
          : (snap && snap.tick != null ? snap.tick : null);

        serverbot.handleBotStateUpdate(matchId, snap, ws.__cid, tickValue);
        return;
      }

      // Neue Match-Commands abfangen (Phase 1)
      if (sys.type === 'create_match') {
        const nick = sys.nick || 'Player 1';
        try {
          const match = createMatchForClient(ws, nick, rooms);

          // P1.3: Ensure authoritative initial snapshot exists server-side (deterministic deal)
          ensureInitialSnapshot(match.matchId, { seed: match.seed, fromCid: 'srv', shuffleMode: 'shared' });

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

          // Send initial snapshot to host (owner="Y")
          const hostSnap = getSnapshotForPlayer(match.matchId, 'p1') || getSnapshot(match.matchId) || getCachedSnapshot(match.matchId);
          if (hostSnap && hostSnap.state) {
            sendSys(ws, {
              type: 'state_snapshot',
              matchId: match.matchId,
              seed: hostSnap.seed || match.seed,
              at: isoNow(),
              fromCid: snapshotFromCidForRecipient(ws, hostSnap) || (ws.__cid || null),
              matchRev: hostSnap.matchRev || null,
              snapshotHash: hostSnap.snapshotHash || null,
              state: hostSnap.state,
              reason: 'server_initial_state'
            }, { matchId: match.matchId });
          }

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

          // P1.3: Ensure authoritative snapshot exists and serve a per-player view to the joiner
          ensureInitialSnapshot(match.matchId, { seed: match.seed, fromCid: 'srv', shuffleMode: 'shared' });
          const joinerSnap = getSnapshotForPlayer(match.matchId, ws.__playerId) || getSnapshot(match.matchId) || getCachedSnapshot(match.matchId);
          if (joinerSnap && joinerSnap.state) {
            sendSys(ws, {
              type: 'state_snapshot',
              matchId: match.matchId,
              seed: joinerSnap.seed || match.seed,
              at: isoNow(),
              fromCid: snapshotFromCidForRecipient(ws, joinerSnap) || (ws.__cid || null),
              matchRev: joinerSnap.matchRev || null,
              snapshotHash: joinerSnap.snapshotHash || null,
              state: joinerSnap.state,
              reason: 'server_initial_state_on_join'
            }, { matchId: match.matchId });
          }

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

          // P1.3: Ensure authoritative snapshot exists and serve a per-player view to the joiner
          ensureInitialSnapshot(match.matchId, { seed: match.seed, fromCid: 'srv', shuffleMode: 'shared' });
          const joinerSnap = getSnapshotForPlayer(match.matchId, ws.__playerId) || getSnapshot(match.matchId) || getCachedSnapshot(match.matchId);
          if (joinerSnap && joinerSnap.state) {
            sendSys(ws, {
              type: 'state_snapshot',
              matchId: match.matchId,
              seed: joinerSnap.seed || match.seed,
              at: isoNow(),
              fromCid: snapshotFromCidForRecipient(ws, joinerSnap) || (ws.__cid || null),
              matchRev: joinerSnap.matchRev || null,
              snapshotHash: joinerSnap.snapshotHash || null,
              state: joinerSnap.state,
              reason: 'server_initial_state_on_join'
            }, { matchId: match.matchId });
          }

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

            // P1.3: Ensure authoritative initial snapshot exists for bot matches
            // (matches.js liefert dafür TEMP legacy 52-card format sobald isBot present ist)
            ensureInitialSnapshot(match.matchId, { seed: match.seed, fromCid: 'srv', shuffleMode: 'shared' });

            // Match starten
            match.status = 'running';
            match.lastActivityAt = Date.now();

            // Reset an Room (Clients rendern danach)
            broadcastSysToRoom(match.matchId, {
              type: 'reset',
              matchId: match.matchId,
              seed: match.seed,
              at: isoNow(),
              reason: 'server_initial_start'
            });

            // Host über running informieren
            const publicAfterStart = getPublicMatchView(match);
            sendSys(ws, {
              type: 'match_update',
              matchId: match.matchId,
              status: match.status,
              players: publicAfterStart.players
            }, { matchId: match.matchId });

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

            // P1.3: Send initial snapshot to host right away (owner="Y")
            const hostSnap =
              getSnapshotForPlayer(match.matchId, 'p1') ||
              getSnapshot(match.matchId) ||
              getCachedSnapshot(match.matchId);

            if (hostSnap && hostSnap.state) {
              sendSys(ws, {
                type: 'state_snapshot',
                matchId: match.matchId,
                seed: hostSnap.seed || match.seed,
                at: isoNow(),
                fromCid: snapshotFromCidForRecipient(ws, hostSnap) || (ws.__cid || null),
                matchRev: hostSnap.matchRev || null,
                snapshotHash: hostSnap.snapshotHash || null,
                state: hostSnap.state,
                reason: 'server_initial_state_bot'
              }, { matchId: match.matchId });
            }

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
            // --- ensure ServerBot exists for this bot match (auto-start) ---
            if (serverbotOk && !serverbot.getServerBot(match.matchId)) {
              const bot = serverbot.createServerBot(match.matchId, difficulty || 'easy');
              console.log(`[BOT] serverbot registered matchId="${match.matchId}" botId="${bot.id}" difficulty=${bot.difficulty} nick="${bot.nick}"`);
              // P1.2: Ensure bot starts only after authoritative initial state + reset
              if (!getSnapshot(match.matchId) && !getCachedSnapshot(match.matchId)) {
                console.warn('[BOT] auto-start skipped – no authoritative initial state yet');
                return;
              }
              // Start heartbeat immediately so ticks are generated even without explicit spawn_bot follow-up
              bot.__interval = setInterval(() => {
                runServerBotTick(match.matchId);
              }, 3000);
              console.log(`[BOT] auto-started serverbot for matchId="${match.matchId}"`);
            }
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

        if (!serverbotOk) {
          sendSys(ws, {
            type: 'bot_error',
            for: 'spawn_bot',
            code: 'serverbot_missing',
            message: 'serverbot.js fehlt oder ist ungültig – Bot kann nicht gestartet werden.'
          });
          return;
        }

        // Prüfen, ob bereits ein Bot für dieses Match existiert
        const existing = serverbot.getServerBot(matchId);
        if (existing) {
          // P1.2: Ensure bot starts only after authoritative initial state + reset
          if (!getSnapshot(matchId) && !getCachedSnapshot(matchId)) {
            console.warn('[BOT] auto-start skipped – no authoritative initial state yet');
            return;
          }
          // Heartbeat sicherstellen
          if (!existing.__interval) {
            existing.__interval = setInterval(() => {
              try {
                runServerBotTick(matchId);
              } catch (e) {
                console.error('[BOT] heartbeat tick failed', e);
              }
            }, 3000);
            console.log(`[BOT] heartbeat interval started for matchId="${matchId}"`);
          }

          // WICHTIG: Wenn wir in diesem spawn_bot-Aufruf gerade ein neues Match erzeugt haben,
          // müssen wir den bestehenden Bot auch im Match-Model eintragen und das Match starten.
          if (match) {
            const nowMs = Date.now();
            if (!Array.isArray(match.players)) {
              match.players = match.players ? [match.players] : [];
            }

            const alreadyInPlayers = match.players.some(p => p && p.isBot && (p.id === existing.id || p.nick === existing.nick));
            if (!alreadyInPlayers) {
              match.players.push({
                id: existing.id,
                nick: existing.nick,
                isBot: true,
                joinedAt: nowMs,
                lastSeen: nowMs
              });
            }

            match.status = 'ready';
            match.lastActivityAt = nowMs;

            const publicAfter = getPublicMatchView(match);
            sendSys(ws, {
              type: 'match_update',
              matchId: match.matchId,
              status: match.status,
              players: publicAfter.players
            }, { matchId: match.matchId });

            broadcastSysToRoom(match.matchId, {
              type: 'reset',
              matchId: match.matchId,
              seed: match.seed
            });

            match.status = 'running';
            match.lastActivityAt = Date.now();

            console.log(
              `[MATCH] auto-start bot matchId="${match.matchId}" seed="${match.seed}" hostNick="${effectiveNick}" botNick="${existing.nick}"`
            );
          }

          sendSys(ws, {
            type: 'bot_spawned',
            matchId,
            botId: existing.id,
            difficulty: existing.difficulty,
            nick: existing.nick
          });
          return;
        }

        // Neuen Bot registrieren (Logik liegt im serverbot.js)
        // P1.2: Bot must never start without an authoritative initial state
        if (!getSnapshot(matchId) && !getCachedSnapshot(matchId)) {
          console.warn('[BOT] start delayed – waiting for server initial state');
          return;
        }
        const bot = serverbot.createServerBot(matchId, difficulty);
        console.log(`[BOT] created botId="${bot.id}" matchId="${matchId}" difficulty=${bot.difficulty} nick="${bot.nick}"`);

        // --- ensure serverbot heartbeat is running ---
        if (!bot.__interval) {
          bot.__interval = setInterval(() => {
            try {
              runServerBotTick(matchId);
            } catch (e) {
              console.error('[BOT] heartbeat tick failed', e);
            }
          }, 3000);
          console.log(`[BOT] heartbeat interval started for matchId="${matchId}"`);
        }

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

  // Leave room first, so peersInRoom(roomLeft) reflects remaining humans.
  leaveRoom(ws);

  // Temporary fail-safe requested by project: if one peer disconnects in a match room,
  // terminate the whole room so no one keeps playing on diverged local worlds.
  if (isMatchRoom(roomLeft) && peersInRoom(roomLeft) > 0) {
    forceEvictRoom(roomLeft, 'peer_disconnect');
  }

  // If this was the last client in a bot match room, stop the bot.
  if (roomLeft) {
    maybeStopBotIfRoomEmpty(roomLeft, 'disconnect');
  }

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
    console.log(`\n=== Solitaire HighNoon Server v${VERSION} (${label.toUpperCase()}) — ${label} ACTIVE ===`);
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

// ---- HTTPS optional (configurable) ----
const defaultKey  = path.join(__dirname, 'server.key');
const defaultCert = path.join(__dirname, 'server.crt');

const keyPath  = process.env.SSL_KEY_PATH  || defaultKey;
const certPath = process.env.SSL_CERT_PATH || defaultCert;
const caPath   = process.env.SSL_CA_PATH   || null;

const useHttpsEnv = (process.env.USE_HTTPS || '').toLowerCase();
// Wenn USE_HTTPS=true => HTTPS erzwingen (und klar loggen, falls Files fehlen)
// Sonst: HTTPS automatisch, wenn key+cert existieren
const autoHttpsPossible = fs.existsSync(keyPath) && fs.existsSync(certPath);
const useHttps = (useHttpsEnv === 'true') || autoHttpsPossible;

function logTlsSummary({ enabled, started, reason } = {}) {
  const mode = enabled ? 'ENABLED' : 'DISABLED';
  const state = started ? 'STARTED' : 'NOT STARTED';
  const envNote = useHttpsEnv ? ` (USE_HTTPS=${process.env.USE_HTTPS})` : '';
  console.log(`[TLS] ${mode} / ${state}${envNote}`);
  console.log(`[TLS] keyPath : ${keyPath}`);
  console.log(`[TLS] certPath: ${certPath}`);
  if (caPath) console.log(`[TLS] caPath  : ${caPath}`);
  if (reason) console.log(`[TLS] reason  : ${reason}`);
}

if (useHttps) {
  const keyExists  = fs.existsSync(keyPath);
  const certExists = fs.existsSync(certPath);
  const caExists   = caPath ? fs.existsSync(caPath) : true;

  if (!keyExists || !certExists || !caExists) {
    const missing = [
      (!keyExists ? 'key' : null),
      (!certExists ? 'cert' : null),
      (caPath && !caExists ? 'ca' : null)
    ].filter(Boolean).join(', ');

    logTlsSummary({
      enabled: true,
      started: false,
      reason: `Missing TLS file(s): ${missing}. Falling back to HTTP.`
    });

    startServer(httpServer, 'http');
  } else {
    try {
      const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
        ...(caPath ? { ca: fs.readFileSync(caPath) } : {})
      };

      const httpsServer = https.createServer(options, handleRequest);
      attachUpgradeHandler(httpsServer);

      logTlsSummary({ enabled: true, started: true, reason: 'TLS credentials loaded successfully.' });
      startServer(httpsServer, 'https');
    } catch (err) {
      console.error('[SSL ERROR]', err);
      logTlsSummary({ enabled: true, started: false, reason: 'TLS init failed. Falling back to HTTP.' });
      startServer(httpServer, 'http');
    }
  }
} else {
  logTlsSummary({
    enabled: false,
    started: false,
    reason: 'TLS not enabled (no USE_HTTPS=true and key/cert not found). Starting HTTP.'
  });
  startServer(httpServer, 'http');
}
