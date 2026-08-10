'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { WebSocket } = require('ws');
const { APP_VERSION, PROTOCOL_VERSION } = require('../core');
const { defaultExpectedConfig, replay } = require('../replay');
const { createVNextServer } = require('../server');
const { LobbyStore } = require('../server/lobbyStore');
const { MatchSession } = require('../server/matchSession');

const silentLogger = { log() {}, error() {} };

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const queued = [];
    const waiters = [];
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString('utf8'));
      if (waiters.length > 0) waiters.shift()(message);
      else queued.push(message);
    });
    socket.once('open', () => resolve({
      socket,
      next: () => queued.length > 0
        ? Promise.resolve(queued.shift())
        : new Promise((nextResolve) => waiters.push(nextResolve))
    }));
    socket.once('error', reject);
  });
}

function drawEnvelope(matchId, clientId, seq, baseRev) {
  return {
    matchId,
    clientId,
    seq,
    baseRev,
    protocolVersion: PROTOCOL_VERSION,
    kind: 'draw',
    payload: {
      source: { zone: 'stock', owner: clientId },
      target: { zone: 'waste', owner: clientId }
    }
  };
}

test('MatchSession produces a replayable authoritative ActionLog', () => {
  const session = new MatchSession({ matchId: 'm-test', seed: 'SESSION-SEED', mode: 'split' });
  const ack = session.process('p1', drawEnvelope('m-test', 'p1', 0, 0));
  assert.equal(ack.response.kind, 'ack');
  assert.equal(ack.broadcast, true);

  const duplicate = session.process('p1', drawEnvelope('m-test', 'p1', 0, 1));
  assert.equal(duplicate.response.kind, 'reject');
  assert.equal(duplicate.response.code, 'DUPLICATE_SEQ');
  assert.equal(duplicate.response.expectedSeq, 1);

  const log = session.actionLog();
  assert.deepEqual(replay(log, defaultExpectedConfig('SESSION-SEED', 'split')), {
    status: 'SUCCESS',
    finalRev: 1,
    finalStateHash: session.current.stateHash
  });
});

test('server shell imports no frozen gameplay modules', () => {
  const directory = path.join(__dirname, '..', 'server');
  for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(directory, filename), 'utf8');
    assert.doesNotMatch(source, /require\(['"](?:\.\.\/\.\.\/)?(?:matches|serverbot|server)['"]\)/);
  }
});

test('vNext Web adapter imports neither v1 scripts nor gameplay authority', () => {
  const directory = path.join(__dirname, '..', 'web');
  const source = fs.readdirSync(directory)
    .filter((name) => /\.(?:html|mjs)$/.test(name))
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /public\/js|game\.js|bot\.js|startmenu\.js/);
  assert.doesNotMatch(source, /applyAction|initMatch|canPlaceOn|shuffle\s*\(/);
});

test('out-of-sync envelope returns an unchanged replayable snapshot', () => {
  const session = new MatchSession({ matchId: 'm-sync', seed: 'SYNC-SEED', mode: 'shared' });
  const outcome = session.process('p2', drawEnvelope('m-sync', 'p2', 1, 0));
  assert.equal(outcome.response.kind, 'snapshot');
  assert.equal(outcome.response.reason, 'OUT_OF_SYNC');
  assert.equal(outcome.response.rev, 0);
  assert.equal(outcome.broadcast, false);
  assert.equal(replay(session.actionLog(), defaultExpectedConfig('SYNC-SEED', 'shared')).status, 'SUCCESS');
});

test('independent simultaneous moves are rebased and both accepted', () => {
  const session = new MatchSession({ matchId: 'm-race', seed: 'RACE-SEED', mode: 'shared' });

  const first = session.process('p1', drawEnvelope('m-race', 'p1', 0, 0));
  const second = session.process('p2', drawEnvelope('m-race', 'p2', 0, 0));

  assert.equal(first.response.kind, 'ack');
  assert.equal(first.response.rev, 1);
  assert.equal(second.response.kind, 'ack');
  assert.equal(second.response.rev, 2);
  assert.equal(second.response.state.players.p1.waste.length, 1);
  assert.equal(second.response.state.players.p2.waste.length, 1);
  assert.equal(session.lastAcceptedSeq.p1, 0);
  assert.equal(session.lastAcceptedSeq.p2, 0);
  assert.equal(replay(session.actionLog(), defaultExpectedConfig('RACE-SEED', 'shared')).status, 'SUCCESS');
});

test('future base revision still returns an unchanged recovery snapshot', () => {
  const session = new MatchSession({ matchId: 'm-future', seed: 'FUTURE-SEED', mode: 'shared' });
  const outcome = session.process('p1', drawEnvelope('m-future', 'p1', 0, 1));

  assert.equal(outcome.response.kind, 'snapshot');
  assert.equal(outcome.response.reason, 'OUT_OF_SYNC');
  assert.equal(outcome.response.rev, 0);
  assert.equal(session.lastAcceptedSeq.p1, -1);
});

test('LobbyStore maps nickname sessions to games and reserves player history fields', () => {
  let nextId = 0;
  const lobby = new LobbyStore({
    idFactory: () => `id-${nextId += 1}`,
    clock: () => '2026-08-10T12:00:00.000Z'
  });

  const host = lobby.createOrUpdatePlayer({ nickname: '  Michael   M.  ' });
  const guest = lobby.createOrUpdatePlayer({ nickname: 'Sandra' });
  assert.equal(host.nickname, 'Michael M.');
  assert.deepEqual(host.stats, {
    gamesPlayed: 0,
    gamesWon: 0,
    totalScore: 0,
    bestScore: 0,
    lastGameAt: null
  });

  const game = lobby.createGame({
    sessionId: host.sessionId,
    matchId: 'm-lobby',
    seed: 'LOBBY-SEED',
    mode: 'split',
    name: 'iPad Abendrunde'
  });
  assert.equal(game.status, 'waiting');
  assert.equal(game.players.p1.nickname, 'Michael M.');
  assert.equal(game.players.p2, null);
  assert.equal(game.historyPrepared, true);

  const joined = lobby.joinGame({ gameId: game.gameId, sessionId: guest.sessionId });
  assert.equal(joined.role, 'p2');
  assert.equal(joined.matchId, 'm-lobby');
  assert.equal(joined.game.status, 'active');
  assert.equal(joined.game.players.p2.nickname, 'Sandra');

  const finished = lobby.markMatchFinished('m-lobby', {
    winner: 'p1',
    endedReason: 'completed',
    players: {
      p1: { score: 52 },
      p2: { score: 41 }
    }
  });
  assert.equal(finished.status, 'finished');
});

test('LobbyStore lets only p1 end a lobby game by match id', () => {
  let nextId = 0;
  const lobby = new LobbyStore({
    idFactory: () => `id-${nextId += 1}`,
    clock: () => '2026-08-10T12:30:00.000Z'
  });
  const host = lobby.createOrUpdatePlayer({ nickname: 'Host' });
  const guest = lobby.createOrUpdatePlayer({ nickname: 'Guest' });
  const game = lobby.createGame({
    sessionId: host.sessionId,
    matchId: 'm-end',
    seed: 'END-SEED',
    mode: 'split',
    name: 'End Test'
  });
  lobby.joinGame({ gameId: game.gameId, sessionId: guest.sessionId });

  assert.throws(
    () => lobby.endGameByMatch({ matchId: 'm-end', sessionId: guest.sessionId }),
    /only p1 can end/
  );
  const ended = lobby.endGameByMatch({ matchId: 'm-end', sessionId: host.sessionId });
  assert.equal(ended.status, 'finished');
});

test('vNext HTTP and WebSocket shell creates a match and broadcasts authoritative ack', async (t) => {
  const logLines = [];
  const app = createVNextServer({
    logger: { log(line) { logLines.push(line); }, error: silentLogger.error }
  });
  const address = await app.start({ port: 0 });
  const httpBase = `http://127.0.0.1:${address.port}`;
  const wsBase = `ws://127.0.0.1:${address.port}`;
  const sockets = [];
  t.after(async () => {
    for (const socket of sockets) socket.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await app.close();
  });

  const health = await fetch(`${httpBase}/health`).then((response) => response.json());
  assert.equal(health.status, 'ok');
  assert.equal(health.protocolVersion, PROTOCOL_VERSION);

  const webConfig = await fetch(`${httpBase}/vnext/config`).then((response) => response.json());
  assert.equal(webConfig.appVersion, APP_VERSION);
  assert.equal(webConfig.serverVersion, APP_VERSION);
  assert.equal(webConfig.protocolVersion, PROTOCOL_VERSION);
  assert.match(webConfig.publicBaseUrl, /^http:\/\/.+:\d+$/);

  const webResponse = await fetch(`${httpBase}/vnext/web/`);
  assert.equal(webResponse.status, 200);
  const webHtml = await webResponse.text();
  assert.match(webHtml, /Solitaire HighNoon/);
  assert.match(webHtml, /\.\/app\.mjs/);
  assert.doesNotMatch(webHtml, /public\/js|game\.js|bot\.js/);

  const browserClient = await fetch(`${httpBase}/vnext/web/protocol-client.mjs`);
  assert.equal(browserClient.status, 200);
  assert.match(browserClient.headers.get('content-type'), /text\/javascript/);

  const createResponse = await fetch(`${httpBase}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'SMOKE-SEED', mode: 'shared' })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const p1 = await connect(`${wsBase}/vnext?matchId=${created.matchId}&clientId=p1`);
  sockets.push(p1.socket);
  const p1Initial = await p1.next();
  assert.equal(p1Initial.kind, 'snapshot');
  assert.equal(p1Initial.reason, 'INITIAL_CONNECT');

  const p2 = await connect(`${wsBase}/vnext?matchId=${created.matchId}&clientId=p2`);
  sockets.push(p2.socket);
  const p2Initial = await p2.next();
  assert.equal(p2Initial.stateHash, p1Initial.stateHash);

  const p1AckPromise = p1.next();
  const p2AckPromise = p2.next();
  p1.socket.send(JSON.stringify(drawEnvelope(created.matchId, 'p1', 0, 0)));
  const [p1Ack, p2Ack] = await Promise.all([p1AckPromise, p2AckPromise]);
  assert.equal(p1Ack.kind, 'ack');
  assert.equal(p1Ack.rev, 1);
  assert.deepEqual(p2Ack, p1Ack);

  const p1RebasedAckPromise = p1.next();
  const p2RebasedAckPromise = p2.next();
  p2.socket.send(JSON.stringify(drawEnvelope(created.matchId, 'p2', 0, 0)));
  const [p1RebasedAck, p2RebasedAck] = await Promise.all([p1RebasedAckPromise, p2RebasedAckPromise]);
  assert.equal(p2RebasedAck.kind, 'ack');
  assert.equal(p2RebasedAck.clientId, 'p2');
  assert.equal(p2RebasedAck.rev, 2);
  assert.equal(p2RebasedAck.state.players.p1.waste.length, 1);
  assert.equal(p2RebasedAck.state.players.p2.waste.length, 1);
  assert.deepEqual(p1RebasedAck, p2RebasedAck);

  const duplicatePromise = p1.next();
  p1.socket.send(JSON.stringify(drawEnvelope(created.matchId, 'p1', 0, 2)));
  const duplicate = await duplicatePromise;
  assert.equal(duplicate.kind, 'reject');
  assert.equal(duplicate.code, 'DUPLICATE_SEQ');
  assert.equal(duplicate.rev, 2);

  const log = await fetch(`${httpBase}/vnext/matches/${created.matchId}/replay`).then((response) => response.json());
  assert.equal(log.steps.length, 3);
  assert.equal(replay(log, defaultExpectedConfig('SMOKE-SEED', 'shared')).status, 'SUCCESS');

  const p1RestartPromise = p1.next();
  const p2RestartPromise = p2.next();
  const restartResponse = await fetch(`${httpBase}/vnext/matches/${created.matchId}/restart`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'SMOKE-SEED-RESTART', mode: 'split' })
  });
  assert.equal(restartResponse.status, 200);
  const httpRestart = await restartResponse.json();
  const [p1Restart, p2Restart] = await Promise.all([p1RestartPromise, p2RestartPromise]);
  for (const message of [httpRestart, p1Restart, p2Restart]) {
    assert.equal(message.kind, 'snapshot');
    assert.equal(message.reason, 'RESTART');
    assert.equal(message.rev, 0);
    assert.equal(message.state.seed, 'SMOKE-SEED-RESTART');
    assert.equal(message.state.mode, 'split');
  }
  assert.equal(p1Restart.stateHash, httpRestart.stateHash);
  assert.equal(p2Restart.stateHash, httpRestart.stateHash);

  const runtimeLog = logLines.join('\n');
  for (const event of [
    'SERVER_STARTED',
    'MATCH_CREATED',
    'MATCH_RESTARTED',
    'WS_CONNECTED',
    'SNAPSHOT_SENT',
    'ACTION_RECEIVED',
    'ACTION_ACK',
    'ACTION_REJECT',
    'REPLAY_EXPORTED'
  ]) {
    assert.match(runtimeLog, new RegExp(`\\[vNext\\] ${event}`));
  }
  assert.doesNotMatch(runtimeLog, /"state"|"players"|"foundations"/);
});

test('vNext lobby API creates a host game and lets a nickname join as P2', async (t) => {
  const app = createVNextServer({ logger: silentLogger });
  const address = await app.start({ port: 0 });
  const httpBase = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());

  const hostResponse = await fetch(`${httpBase}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Host iPad' })
  });
  assert.equal(hostResponse.status, 200);
  const host = await hostResponse.json();

  const guestResponse = await fetch(`${httpBase}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Guest iPad' })
  });
  assert.equal(guestResponse.status, 200);
  const guest = await guestResponse.json();

  const createResponse = await fetch(`${httpBase}/vnext/lobby/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: host.player.sessionId,
      name: 'Test Lobby',
      seed: 'LOBBY-HTTP-SEED',
      mode: 'shared'
    })
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.role, 'p1');
  assert.equal(created.game.status, 'waiting');
  assert.equal(created.game.players.p1.nickname, 'Host iPad');
  assert.equal(app.sessions.has(created.matchId), true);

  const gamesBeforeJoin = await fetch(`${httpBase}/vnext/lobby/games`).then((response) => response.json());
  assert.equal(gamesBeforeJoin.games.length, 1);
  assert.equal(gamesBeforeJoin.games[0].players.p2, null);

  const joinResponse = await fetch(`${httpBase}/vnext/lobby/games/${encodeURIComponent(created.game.gameId)}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: guest.player.sessionId })
  });
  assert.equal(joinResponse.status, 200);
  const joined = await joinResponse.json();
  assert.equal(joined.role, 'p2');
  assert.equal(joined.matchId, created.matchId);
  assert.equal(joined.game.status, 'active');
  assert.equal(joined.game.players.p2.nickname, 'Guest iPad');
});

test('vNext lobby API allows only p1 to end a lobby game', async (t) => {
  const app = createVNextServer({ logger: silentLogger });
  const address = await app.start({ port: 0 });
  const httpBase = `http://127.0.0.1:${address.port}`;
  t.after(() => app.close());

  const host = await fetch(`${httpBase}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Host' })
  }).then((response) => response.json());
  const guest = await fetch(`${httpBase}/vnext/lobby/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Guest' })
  }).then((response) => response.json());
  const created = await fetch(`${httpBase}/vnext/lobby/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: host.player.sessionId,
      name: 'End Lobby',
      seed: 'END-HTTP-SEED',
      mode: 'split'
    })
  }).then((response) => response.json());
  await fetch(`${httpBase}/vnext/lobby/games/${encodeURIComponent(created.game.gameId)}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: guest.player.sessionId })
  });

  const guestEnd = await fetch(`${httpBase}/vnext/lobby/matches/${encodeURIComponent(created.matchId)}/end`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: guest.player.sessionId })
  });
  assert.equal(guestEnd.status, 403);

  const hostEnd = await fetch(`${httpBase}/vnext/lobby/matches/${encodeURIComponent(created.matchId)}/end`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: host.player.sessionId })
  });
  assert.equal(hostEnd.status, 200);
  const ended = await hostEnd.json();
  assert.equal(ended.kind, 'lobbyEnd');
  assert.equal(ended.reason, 'HOST_ENDED');
  assert.equal(ended.game.status, 'finished');
});
