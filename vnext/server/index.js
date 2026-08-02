'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { URL } = require('node:url');
const { WebSocket, WebSocketServer } = require('ws');
const { APP_VERSION, MODES, PLAYER_IDS, PROTOCOL_VERSION } = require('../core');
const { createManagedBot } = require('../bot/managedBot');
const { SPEEDS, normalizeSpeed } = require('../bot/runner');
const { MatchSession } = require('./matchSession');

const MAX_BODY_BYTES = 64 * 1024;
const OBSERVER_ID = 'observer';
const WEB_ROOT = path.join(__dirname, '..', 'web');
const WEB_MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8'
});

function localNetworkAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      candidates.push({ name, address: address.address });
    }
  }
  const preferred = candidates.find((candidate) => /^(en|eth|wl)/.test(candidate.name));
  return (preferred || candidates[0])?.address || '127.0.0.1';
}

function publicBaseUrl({ configured, request, port }) {
  if (configured) return configured.replace(/\/$/, '');
  const host = request?.headers?.host;
  if (host && !/^127\.0\.0\.1(?::|$)|^localhost(?::|$)/i.test(host)) return `http://${host}`;
  return `http://${localNetworkAddress()}:${port}`;
}

function sendJson(response, statusCode, value) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        const error = new Error('Request body too large');
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body.length === 0 ? {} : JSON.parse(body));
      } catch {
        const error = new Error('Invalid JSON');
        error.statusCode = 400;
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function serveWebAsset(urlPath, response) {
  const relative = urlPath === '/vnext/web' || urlPath === '/vnext/web/'
    ? 'index.html'
    : decodeURIComponent(urlPath.slice('/vnext/web/'.length));
  const filePath = path.resolve(WEB_ROOT, relative);
  if (!filePath.startsWith(`${WEB_ROOT}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  const body = fs.readFileSync(filePath);
  response.writeHead(200, {
    'content-type': WEB_MIME[path.extname(filePath)] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'no-store'
  });
  response.end(body);
  return true;
}

function createVNextServer({ logger = console, publicUrl } = {}) {
  const sessions = new Map();
  const peers = new Map();
  const bots = new Map();
  let listenPort = 3011;

  function log(event, fields = {}) {
    const details = Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(' ');
    logger.log(`[vNext] ${event}${details ? ` ${details}` : ''}`);
  }

  function shortHash(hash) {
    return typeof hash === 'string' ? hash.slice(0, 12) : undefined;
  }

  function broadcast(matchId, payload) {
    const encoded = JSON.stringify(payload);
    let sent = 0;
    for (const socket of peers.get(matchId)?.values() || []) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(encoded);
        sent += 1;
      }
    }
    return sent;
  }

  function botKey(matchId, clientId) {
    return `${matchId}:${clientId}`;
  }

  function peerKey(clientId) {
    return clientId === OBSERVER_ID ? `${OBSERVER_ID}:${crypto.randomUUID()}` : clientId;
  }

  function localBaseUrl() {
    return `http://127.0.0.1:${listenPort}`;
  }

  function stopBot(matchId, clientId = 'p2') {
    const key = botKey(matchId, clientId);
    const bot = bots.get(key);
    if (!bot) return null;
    bot.stop();
    bots.delete(key);
    return bot.report;
  }

  async function handleRequest(request, response) {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname.startsWith('/vnext/web')) {
      if (!serveWebAsset(url.pathname, response)) sendJson(response, 404, { error: 'web asset not found' });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/vnext/config') {
      sendJson(response, 200, {
        appVersion: APP_VERSION,
        publicBaseUrl: publicBaseUrl({ configured: publicUrl, request, port: listenPort }),
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: APP_VERSION
      });
      return;
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, {
        status: 'ok',
        appVersion: APP_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        matches: sessions.size
      });
      return;
    }
    if (request.method === 'POST' && url.pathname === '/vnext/matches') {
      try {
        const body = await readJson(request);
        if (typeof body.seed !== 'string' || body.seed.length === 0 || !MODES.includes(body.mode)) {
          sendJson(response, 400, { error: 'seed and mode (split|shared) are required' });
          return;
        }
        const matchId = `m-${crypto.randomUUID()}`;
        const session = new MatchSession({ matchId, seed: body.seed, mode: body.mode });
        sessions.set(matchId, session);
        log('MATCH_CREATED', {
          matchId,
          mode: body.mode,
          rev: session.current.rev,
          hash: shortHash(session.current.stateHash)
        });
        sendJson(response, 201, {
          matchId,
          mode: body.mode,
          seed: body.seed,
          protocolVersion: PROTOCOL_VERSION,
          rev: session.current.rev,
          stateHash: session.current.stateHash
        });
      } catch (error) {
        if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.message });
      }
      return;
    }

    const matchPath = url.pathname.match(/^\/vnext\/matches\/([^/]+)(\/replay|\/restart|\/bot)?$/);
    if (request.method === 'POST' && matchPath?.[2] === '/bot') {
      const session = sessions.get(decodeURIComponent(matchPath[1]));
      if (!session) {
        sendJson(response, 404, { error: 'match not found' });
        return;
      }
      try {
        const body = await readJson(request);
        const clientId = typeof body.clientId === 'string' && body.clientId.length > 0 ? body.clientId : 'p2';
        const speed = normalizeSpeed(typeof body.speed === 'string' && body.speed.length > 0 ? body.speed : 'easy');
        const maxActions = Number.isSafeInteger(body.maxActions) && body.maxActions > 0 ? body.maxActions : 1000;
        if (!PLAYER_IDS.includes(clientId)) {
          sendJson(response, 400, { error: 'clientId must be p1 or p2' });
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(SPEEDS, speed)) {
          sendJson(response, 400, { error: 'speed must be easy, medium, hard, slow, normal or fast' });
          return;
        }
        if (peers.get(session.matchId)?.has(clientId) || bots.has(botKey(session.matchId, clientId))) {
          sendJson(response, 409, { error: `${clientId} is already connected` });
          return;
        }
        const managedBot = createManagedBot({
          baseUrl: localBaseUrl(),
          matchId: session.matchId,
          clientId,
          speed,
          maxActions,
          logger
        });
        bots.set(botKey(session.matchId, clientId), managedBot);
        managedBot.done.finally(() => bots.delete(botKey(session.matchId, clientId)));
        log('BOT_STARTED', { matchId: session.matchId, clientId, speed, maxActions });
        sendJson(response, 202, {
          matchId: session.matchId,
          clientId,
          speed,
          maxActions,
          status: managedBot.report.status
        });
      } catch (error) {
        if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.message });
      }
      return;
    }
    if (request.method === 'DELETE' && matchPath?.[2] === '/bot') {
      const session = sessions.get(decodeURIComponent(matchPath[1]));
      if (!session) {
        sendJson(response, 404, { error: 'match not found' });
        return;
      }
      const clientId = url.searchParams.get('clientId') || 'p2';
      const report = stopBot(session.matchId, clientId);
      if (!report) {
        sendJson(response, 404, { error: 'bot not running' });
        return;
      }
      log('BOT_STOPPED', { matchId: session.matchId, clientId, status: report.status, actionCount: report.actionCount });
      sendJson(response, 200, { matchId: session.matchId, clientId, status: 'stopped' });
      return;
    }
    if (request.method === 'POST' && matchPath?.[2] === '/restart') {
      const session = sessions.get(decodeURIComponent(matchPath[1]));
      if (!session) {
        sendJson(response, 404, { error: 'match not found' });
        return;
      }
      try {
        const body = await readJson(request);
        const seed = typeof body.seed === 'string' && body.seed.length > 0 ? body.seed : session.header.seed;
        const mode = typeof body.mode === 'string' && body.mode.length > 0 ? body.mode : session.header.mode;
        if (!MODES.includes(mode)) {
          sendJson(response, 400, { error: 'mode (split|shared) is required' });
          return;
        }
        const restartSnapshot = session.restart({ seed, mode });
        const peersNotified = broadcast(session.matchId, restartSnapshot);
        log('MATCH_RESTARTED', {
          matchId: session.matchId,
          mode,
          peers: peersNotified,
          rev: restartSnapshot.rev,
          hash: shortHash(restartSnapshot.stateHash)
        });
        sendJson(response, 200, restartSnapshot);
      } catch (error) {
        if (!response.headersSent) sendJson(response, error.statusCode || 500, { error: error.message });
      }
      return;
    }
    if (request.method === 'GET' && matchPath) {
      const session = sessions.get(decodeURIComponent(matchPath[1]));
      if (!session) {
        sendJson(response, 404, { error: 'match not found' });
        return;
      }
      if (matchPath[2]) {
        log('REPLAY_EXPORTED', { matchId: session.matchId, steps: session.steps.length });
        sendJson(response, 200, session.actionLog());
      } else {
        log('SNAPSHOT_SENT', {
          matchId: session.matchId,
          transport: 'http',
          reason: 'STATE_REQUEST',
          rev: session.current.rev,
          hash: shortHash(session.current.stateHash)
        });
        sendJson(response, 200, session.initialSnapshot());
      }
      return;
    }
    sendJson(response, 404, { error: 'not found' });
  }

  const server = http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      logger.error('[vNext] request failed', error);
      if (!response.headersSent) sendJson(response, 500, { error: 'internal server error' });
    });
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/vnext') {
      socket.destroy();
      return;
    }
    const matchId = url.searchParams.get('matchId');
    const clientId = url.searchParams.get('clientId');
    const session = sessions.get(matchId);
    const observer = clientId === OBSERVER_ID;
    if (!session || (!observer && !PLAYER_IDS.includes(clientId)) || (!observer && peers.get(matchId)?.has(clientId))) {
      socket.write('HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.matchId = matchId;
      webSocket.clientId = clientId;
      webSocket.peerKey = peerKey(clientId);
      wss.emit('connection', webSocket);
    });
  });

  wss.on('connection', (socket) => {
    const { matchId, clientId, peerKey: connectedPeerKey } = socket;
    if (!peers.has(matchId)) peers.set(matchId, new Map());
    peers.get(matchId).set(connectedPeerKey, socket);
    log('WS_CONNECTED', { matchId, clientId, peers: peers.get(matchId).size });
    socket.send(JSON.stringify(sessions.get(matchId).initialSnapshot()));
    log('SNAPSHOT_SENT', {
      matchId,
      clientId,
      transport: 'websocket',
      reason: 'INITIAL_CONNECT',
      rev: sessions.get(matchId).current.rev,
      hash: shortHash(sessions.get(matchId).current.stateHash)
    });

    socket.on('message', (data, isBinary) => {
      if (!PLAYER_IDS.includes(clientId)) {
        const { rev, stateHash } = sessions.get(matchId).current;
        socket.send(JSON.stringify({
          kind: 'reject',
          matchId,
          clientId,
          protocolVersion: PROTOCOL_VERSION,
          code: 'OBSERVER_READ_ONLY',
          rev,
          stateHash
        }));
        return;
      }
      if (isBinary) {
        socket.send(JSON.stringify({ kind: 'reject', code: 'MALFORMED_MESSAGE', matchId, clientId }));
        return;
      }
      let envelope;
      try {
        envelope = JSON.parse(data.toString('utf8'));
      } catch {
        log('ACTION_REJECT', { matchId, clientId, code: 'MALFORMED_MESSAGE', reason: 'invalid_json' });
        socket.send(JSON.stringify({ kind: 'reject', code: 'MALFORMED_MESSAGE', matchId, clientId }));
        return;
      }
      log('ACTION_RECEIVED', {
        matchId,
        clientId,
        seq: envelope?.seq,
        baseRev: envelope?.baseRev,
        action: envelope?.kind
      });
      const outcome = sessions.get(matchId).process(clientId, envelope);
      if (outcome.response.kind === 'ack') {
        log('ACTION_ACK', {
          matchId,
          clientId,
          seq: envelope.seq,
          action: envelope.kind,
          rev: outcome.response.rev,
          hash: shortHash(outcome.response.stateHash)
        });
      } else if (outcome.response.kind === 'reject') {
        log('ACTION_REJECT', {
          matchId,
          clientId,
          seq: envelope.seq,
          action: envelope.kind,
          code: outcome.response.code,
          rev: outcome.response.rev,
          hash: shortHash(outcome.response.stateHash)
        });
      } else {
        log('SNAPSHOT_SENT', {
          matchId,
          clientId,
          transport: 'websocket',
          reason: outcome.response.reason,
          rev: outcome.response.rev,
          hash: shortHash(outcome.response.stateHash)
        });
      }
      if (outcome.broadcast) broadcast(matchId, outcome.response);
      else socket.send(JSON.stringify(outcome.response));
    });

    socket.on('close', () => {
      const room = peers.get(matchId);
      if (room?.get(connectedPeerKey) === socket) room.delete(connectedPeerKey);
      if (room?.size === 0) peers.delete(matchId);
      log('WS_DISCONNECTED', { matchId, clientId, peers: room?.size || 0 });
    });
  });

  function start({ port = 3011, host = '127.0.0.1' } = {}) {
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        const address = server.address();
        listenPort = address.port;
        const resolvedPublicUrl = publicBaseUrl({ configured: publicUrl, port: address.port });
        log('SERVER_STARTED', {
          appVersion: APP_VERSION,
          protocolVersion: PROTOCOL_VERSION,
          url: `http://${address.address}:${address.port}`,
          publicUrl: resolvedPublicUrl
        });
        resolve(address);
      });
    });
  }

  function close() {
    for (const bot of bots.values()) bot.stop();
    bots.clear();
    for (const room of peers.values()) {
      for (const socket of room.values()) socket.close(1001, 'server shutdown');
    }
    return new Promise((resolve, reject) => {
      wss.close(() => server.close((error) => error ? reject(error) : resolve()));
    });
  }

  return { bots, close, server, sessions, start, wss };
}

module.exports = { createVNextServer };
