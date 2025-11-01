#!/usr/bin/env node
// ================================================================
//  Solitaire HighNoon - Realtime Game Server
//  Version: 1.5.1  (2025-11-01)
//  Author: micmuller & ChatGPT (GPT-5)
//  ---------------------------------------------------------------
//  Features:
//  - WebSocket Server für Echtzeit-Solitaire-Duelle
//  - Raumverwaltung & Broadcasts (keine Cross-Room-Nachrichten)
//  - Logging throttled (Status alle 30s, Actions sofort)
//  - CLI-Flags:
//      -v / --version    Zeigt Server-Version und beendet
//      -h / --help       Zeigt Hilfe und beendet
//      -p <port>         Startet Server auf angegebenem Port
// ================================================================

const http = require('node:http');
const { WebSocketServer } = require('ws');
const { URL } = require('node:url'); // ✅ moderne WHATWG-URL-API (statt deprecated parse())

// ---------- Version / CLI ----------
const VERSION = '1.5.1';
const HELP = `
Solitaire HighNoon WebSocket Server v${VERSION}

Syntax:
  node server.js [options]

Options:
  -p, --port <num>     Port (default 3001)
  -v, --version        Zeigt Version und beendet
  -h, --help           Zeigt diese Hilfe
`;

if (process.argv.includes('-v') || process.argv.includes('--version')) {
  console.log(`Solitaire HighNoon Server v${VERSION}`);
  process.exit(0);
}
if (process.argv.includes('-h') || process.argv.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}

let PORT = 3001;
const portIdx = process.argv.findIndex(a => a === '-p' || a === '--port');
if (portIdx > -1 && process.argv[portIdx + 1]) {
  const n = parseInt(process.argv[portIdx + 1], 10);
  if (!isNaN(n)) PORT = n;
}

// ---------- Core Setup ----------
const server = http.createServer();
const wss = new WebSocketServer({ noServer: true });

const rooms = new Map();
const STATUS_INTERVAL_MS = 30_000;
const HELLO_SUPPRESS_MS  = 15_000;
let lastGlobalStatusLog = 0;
const lastSysLogByRoom = new Map();
const lastHelloTsByClient = new WeakMap();

function isoNow() { return new Date().toISOString(); }

function getRoomOf(ws) { return ws.__room || null; }
function joinRoom(ws, room) {
  ws.__room = room;
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
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

function logStatus(roomHint = null) {
  const total = wss.clients.size;
  if (total === 0) return;
  const summary = [];
  for (const [room, set] of rooms.entries()) {
    summary.push(`${room}:${set.size}`);
  }
  const roomsStr = summary.length ? summary.join(', ') : '—';
  console.log(`[STATUS] ${isoNow()} — Clients=${total}, Rooms=${rooms.size} [${roomsStr}]${roomHint ? ` (room="${roomHint}")` : ''}`);
}

// ---------- Upgrade + Connection ----------
server.on('upgrade', (req, socket, head) => {
  try {
    const fullUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = fullUrl.pathname;
    const room = fullUrl.searchParams.get('room') || fullUrl.searchParams.get('r') || 'default';

    if (!pathname || !pathname.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, room);
    });
  } catch (err) {
    console.error(`[ERROR] ${isoNow()} upgrade failed:`, err);
    try { socket.destroy(); } catch {}
  }
});

wss.on('connection', (ws, req, room) => {
  const ip = req.socket.remoteAddress || 'unknown';
  joinRoom(ws, room);

  const cid = Math.random().toString(36).slice(2);
  ws.__cid = cid;

  console.log(`[CONNECT] ${isoNow()} room="${room}" ip=${ip} cid=${cid} peers=${peersInRoom(room)}`);
  logStatus(room);

  ws.on('message', (buf) => {
    const now = Date.now();
    const currentRoom = getRoomOf(ws);
    if (!currentRoom) return;

    try {
      const data = JSON.parse(buf.toString());

      // ---- Logging ----
      if (data?.move) {
        const kind = data.move.kind || 'unknown';
        const owner = data.move.owner || '—';
        console.log(`[MOVE] ${isoNow()} room="${currentRoom}" owner=${owner} kind=${kind}`);
      } else if (data?.sys) {
        const type = data.sys.type || 'unknown';

        // Hello-Dedupe pro Client
        if (type === 'hello') {
          const lastH = lastHelloTsByClient.get(ws) || 0;
          if (now - lastH < HELLO_SUPPRESS_MS) return;
          lastHelloTsByClient.set(ws, now);
        }

        // SYS-Logs max. alle 30s pro Raum
        const lastSys = lastSysLogByRoom.get(currentRoom) || 0;
        if (now - lastSys >= STATUS_INTERVAL_MS) {
          console.log(`[SYS] ${isoNow()} room="${currentRoom}" type=${type}`);
          lastSysLogByRoom.set(currentRoom, now);
        }
      }

      // ---- Broadcast ----
      broadcastToRoom(currentRoom, buf.toString(), ws);

      // ---- Global Status (max. alle 30s) ----
      if (wss.clients.size > 0 && (now - lastGlobalStatusLog >= STATUS_INTERVAL_MS)) {
        logStatus();
        lastGlobalStatusLog = now;
      }

    } catch (err) {
      console.error(`[ERROR] ${isoNow()} invalid JSON:`, err);
    }
  });

  ws.on('close', () => {
    const roomLeft = getRoomOf(ws);
    leaveRoom(ws);
    console.log(`[DISCONNECT] ${isoNow()} room="${roomLeft}" cid=${cid} remainingPeers=${peersInRoom(roomLeft)}`);
    logStatus(roomLeft);
  });

  ws.on('error', (err) => {
    console.error(`[WS-ERROR] ${isoNow()} room="${getRoomOf(ws)}" cid=${cid} err=${err?.message || err}`);
  });
});

// ---------- Periodic Status ----------
setInterval(() => {
  if (wss.clients.size > 0) {
    const now = Date.now();
    if (now - lastGlobalStatusLog >= STATUS_INTERVAL_MS) {
      logStatus();
      lastGlobalStatusLog = now;
    }
  }
}, 5000);

// ---------- Start ----------
server.listen(PORT, () => {
  console.log(`\n=== Solitaire HighNoon Server v${VERSION} ===`);
  console.log(`Startzeit: ${isoNow()}`);
  console.log(`Listening on port ${PORT}`);
  console.log('Use  -h  for help or  -v  for version\n');
});