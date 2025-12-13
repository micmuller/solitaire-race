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
// ================================================================

const http   = require('node:http');
const https  = require('node:https');
const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const { WebSocketServer } = require('ws');
const { URL } = require('node:url');

// ---------- Optional ServerBot module (split bot logic out of server.js) ----------
// NOTE: All bot decision logic lives in serverbot.js; server.js only wires transport + match lifecycle.
let serverbot = null;
let serverbotOk = false;
try {
  serverbot = require('./serverbot');
  serverbotOk = !!serverbot &&
    typeof serverbot.createServerBot === 'function' &&
    typeof serverbot.getServerBot === 'function' &&
    typeof serverbot.handleBotStateUpdate === 'function' &&
    typeof serverbot.runBotHeartbeatTick === 'function';

  console.log(serverbotOk
    ? '[BOT] serverbot.js loaded'
    : '[BOT] serverbot.js loaded but missing required exports'
  );
} catch (e) {
  serverbot = null;
  serverbotOk = false;
  console.log('[BOT] serverbot.js missing – bot features disabled');
}


// ---------- Version / CLI ----------
const VERSION = '2.2.21';
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

        // Tick aus dem Envelope in den Snapshot spiegeln (falls im Snapshot selbst nicht vorhanden)
        if (sys.tick != null && snap.tick == null) snap.tick = sys.tick;

        // Minimal-Metadaten ergänzen (hilft beim Debuggen; bricht keine Logik)
        if (snap.matchId == null) snap.matchId = matchId;
        if (snap.__fromCid == null) snap.__fromCid = ws.__cid;
        if (snap.__at == null) snap.__at = isoNow();

        serverbot.handleBotStateUpdate(matchId, snap);
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
            // --- ensure ServerBot exists for this bot match (auto-start) ---
            if (serverbotOk && !serverbot.getServerBot(match.matchId)) {
              const bot = serverbot.createServerBot(match.matchId, difficulty || 'easy');
              console.log(`[BOT] created botId="${bot.id}" matchId="${match.matchId}" difficulty=${bot.difficulty} nick="${bot.nick}"`);
              // Start heartbeat immediately so ticks are generated even without explicit spawn_bot follow-up
              bot.__interval = setInterval(() => {
                try {
                  serverbot.runBotHeartbeatTick(match.matchId, (envelope) => broadcastToRoom(match.matchId, envelope));
                } catch (e) {
                  console.error('[BOT] heartbeat tick failed', e);
                }
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
          // Heartbeat sicherstellen
          if (!existing.__interval) {
            existing.__interval = setInterval(() => {
              try {
                serverbot.runBotHeartbeatTick(matchId, (envelope) => broadcastToRoom(matchId, envelope));
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
        const bot = serverbot.createServerBot(matchId, difficulty);
        console.log(`[BOT] created botId="${bot.id}" matchId="${matchId}" difficulty=${bot.difficulty} nick="${bot.nick}"`);

        // --- ensure serverbot heartbeat is running ---
        if (!bot.__interval) {
          bot.__interval = setInterval(() => {
            try {
              serverbot.runBotHeartbeatTick(matchId, (envelope) => broadcastToRoom(matchId, envelope));
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