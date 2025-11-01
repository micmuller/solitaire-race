// ===============================
// Solitaire HighNoon WebSocket Server (CommonJS)
// ===============================
const http = require('http');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const PORT = 3001;
const server = http.createServer();

// --- Helper: Log mit ISO-Zeitstempel ---
function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// Räume: roomId -> Set<WebSocket>
const rooms = new Map();

function broadcast(roomId, data, excludeSocket = null) {
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  const clients = rooms.get(roomId);
  if (!clients) return;
  for (const client of clients) {
    if (client !== excludeSocket && client.readyState === 1) {
      client.send(msg);
    }
  }
}

// --- Optionaler HTTP-Status-Endpoint ---
server.on('request', (req, res) => {
  if (req.url.startsWith('/status')) {
    const status = {};
    for (const [roomId, set] of rooms.entries()) {
      status[roomId] = { peers: set.size };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      port: PORT,
      rooms: status,
      ts: new Date().toISOString()
    }));
  } else {
    // kleine Info-Seite
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`HighNoon WS server up on ws://127.0.0.1:${PORT}/ws\nGET /status for JSON\n`);
  }
});

// --- HTTP Upgrade → WebSocket ---
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname !== '/ws') return socket.destroy();

    wss.handleUpgrade(req, socket, head, (ws) => {
      const roomId = u.searchParams.get('room') || 'default';
      ws._roomId = roomId;

      if (!rooms.has(roomId)) rooms.set(roomId, new Set());
      rooms.get(roomId).add(ws);

      log(`🟢 Client connected to room '${roomId}' (peers=${rooms.get(roomId).size})`);
      ws.send(JSON.stringify({ sys: { type: 'welcome', room: roomId } }));

      ws.on('message', (data) => {
        // best effort parse + Logging
        try {
          const text = data.toString();
          const msg = JSON.parse(text);
          if (msg.sys) {
            log(`📡 [${roomId}] SYS`, msg.sys);
          } else if (msg.move) {
            log(`🎮 [${roomId}] MOVE`, msg.move.kind, 'from', msg.move.actor);
          } else {
            log(`📨 [${roomId}] MSG`, Object.keys(msg));
          }
          broadcast(roomId, text, ws); // an alle anderen im Raum
        } catch (err) {
          log('⚠️  JSON parse error:', err.message);
        }
      });

      ws.on('close', () => {
        const set = rooms.get(roomId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) rooms.delete(roomId);
        }
        log(`🔴 Client disconnected from room '${roomId}' (peers=${rooms.get(roomId)?.size || 0})`);
      });
    });
  } catch (e) {
    log('⚠️  upgrade error:', e.message);
    socket.destroy();
  }
});

// --- Start ---
server.listen(PORT, '0.0.0.0', () => {
  log(`🚀 WebSocket server running on ws://127.0.0.1:${PORT}/ws  (GET http://127.0.0.1:${PORT}/status)`);
});