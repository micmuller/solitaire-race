#!/usr/bin/env node
// ================================================================
//  Solitaire HighNoon - Realtime Game Server
//  Version: 1.6.1  (2025-11-07)
//  Author: micmuller & ChatGPT (GPT-5)
// ================================================================

const http   = require('node:http');
const https  = require('node:https');
const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const { WebSocketServer } = require('ws');
const { URL } = require('node:url');

// ---------- Version / CLI ----------
const VERSION = '1.6.1';
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
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime =
      ext === '.js'   ? 'text/javascript' :
      ext === '.css'  ? 'text/css' :
      ext === '.json' ? 'application/json' :
      ext === '.png'  ? 'image/png' :
      ext === '.jpg'  ? 'image/jpeg' :
      ext === '.ico'  ? 'image/x-icon' :
      'text/html';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

const httpServer = http.createServer(handleRequest);

// ================================================================
//  WEBSOCKET SERVER
// ================================================================
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
  console.log(`[STATUS] ${isoNow()} — Clients=${total}, Rooms=${rooms.size} [${summary.join(', ') || '—'}]${roomHint ? ` (room="${roomHint}")` : ''}`);
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
  console.log(`[CONNECT] ${isoNow()} room="${room}" ip=${ip} cid=${cid} peers=${peersInRoom(room)}`);
  logStatus(room);

  ws.on('message', buf => {
    const now = Date.now();
    const currentRoom = getRoomOf(ws);
    if (!currentRoom) return;
    try {
      const data = JSON.parse(buf.toString());
      if (data?.move) console.log(`[MOVE] ${isoNow()} room="${currentRoom}" kind=${data.move.kind}`);
      if (data?.sys) {
        const lastH = lastHelloTsByClient.get(ws) || 0;
        if (data.sys.type === 'hello' && now - lastH < HELLO_SUPPRESS_MS) return;
        lastHelloTsByClient.set(ws, now);
        const lastSys = lastSysLogByRoom.get(currentRoom) || 0;
        if (now - lastSys >= STATUS_INTERVAL_MS) {
          console.log(`[SYS] ${isoNow()} room="${currentRoom}" type=${data.sys.type}`);
          lastSysLogByRoom.set(currentRoom, now);
        }
      }
      broadcastToRoom(currentRoom, buf.toString(), ws);
      if (now - lastGlobalStatusLog >= STATUS_INTERVAL_MS) {
        logStatus(); lastGlobalStatusLog = now;
      }
    } catch (err) {
      console.error('[WS ERROR]', err);
    }
  });

  ws.on('close', () => {
    const roomLeft = getRoomOf(ws);
    leaveRoom(ws);
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
