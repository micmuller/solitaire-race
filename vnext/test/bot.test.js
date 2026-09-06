'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { WebSocket } = require('ws');
const { generateActionCandidates } = require('../bot/actionGenerator');
const { formatBotReport } = require('../bot/format');
const { BotActor, actionLogHash, normalizeSpeed, runBotVsBot, speedDelay } = require('../bot/runner');
const { initMatch, PROTOCOL_VERSION } = require('../core');
const { createVNextServer } = require('../server');

const silentLogger = { log() {}, error() {} };

async function waitUntil(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('condition was not reached in time');
}

async function withServer(t) {
  const app = createVNextServer({ logger: silentLogger });
  const address = await app.start({ port: 0 });
  t.after(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await app.close();
  });
  return `http://127.0.0.1:${address.port}`;
}

function connectRaw(url) {
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

test('bot action generator produces deterministic thin-client intents', () => {
  const current = initMatch('BOT-GEN-001', 'split');
  const first = generateActionCandidates(current, 'p1');
  const second = generateActionCandidates(current, 'p1');

  assert.deepEqual(second, first);
  assert.ok(first.length > 0);
  assert.ok(first.every((candidate) => !Object.prototype.hasOwnProperty.call(candidate.payload, 'playerId')));
  assert.ok(first.every((candidate) => candidate.payload.source.owner === 'p1'));
  assert.equal(first.at(-1).kind, current.state.players.p1.stock.length ? 'draw' : 'recycle');
});

test('bot speed profiles are deterministic and strategy-neutral', () => {
  assert.equal(normalizeSpeed('mittel'), 'medium');
  assert.equal(normalizeSpeed('schwer'), 'hard');
  assert.equal(speedDelay('fast', 0, 'p1'), 0);
  assert.ok(speedDelay('easy', 1, 'p1') >= 2500);
  assert.ok(speedDelay('easy', 1, 'p1') <= 3500);
  assert.equal(speedDelay('normal', 7, 'p2'), speedDelay('normal', 7, 'p2'));
  assert.ok(speedDelay('slow', 1, 'p1') >= 900);
  assert.ok(speedDelay('slow', 1, 'p1') <= 1200);
});

test('bot actor avoids immediately reversing recent tableau moves', () => {
  const current = {
    rev: 4,
    stateHash: 'abc',
    state: {
      seed: 'BOT-LOOP',
      mode: 'split',
      players: {
        p1: {
          stock: [{ cardId: 'stock', suit: 'S', rank: 2, faceDown: true }],
          waste: [],
          tableau: [
            [{ cardId: 'king', suit: 'S', rank: 13, faceDown: false }],
            [{ cardId: 'queen', suit: 'H', rank: 12, faceDown: false }],
            [{ cardId: 'block-2', suit: 'C', rank: 2, faceDown: false }],
            [{ cardId: 'block-3', suit: 'C', rank: 2, faceDown: false }],
            [{ cardId: 'block-4', suit: 'C', rank: 2, faceDown: false }],
            [{ cardId: 'block-5', suit: 'C', rank: 2, faceDown: false }],
            [{ cardId: 'block-6', suit: 'C', rank: 2, faceDown: false }]
          ]
        },
        p2: { stock: [], waste: [], tableau: [[], [], [], [], [], [], []] }
      },
      foundations: ['C', 'D', 'H', 'S', 'C', 'D', 'H', 'S'].map((suit) => ({ suit, cards: [] }))
    }
  };
  const actor = new BotActor({ client: { current, clientId: 'p1', nextSeq: 0 } });
  actor.rememberAccepted({
    kind: 'tableauMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 0 },
      target: { zone: 'tableau', owner: 'p1', index: 1 },
      count: 1
    }
  });

  const candidate = actor.nextCandidate();
  assert.equal(candidate.kind, 'draw');
});

test('bot action log hash ignores wall-clock startedAt only', () => {
  const log = {
    header: { seed: 'BOT-HASH', mode: 'split', startedAt: 'one' },
    steps: [{ i: 0, clientId: 'p1', seq: 0, baseRev: 0, action: { kind: 'draw', payload: {} } }]
  };
  const sameRun = structuredClone(log);
  sameRun.header.startedAt = 'two';
  const differentRun = structuredClone(log);
  differentRun.steps[0].seq = 1;

  assert.equal(actionLogHash(sameRun), actionLogHash(log));
  assert.notEqual(actionLogHash(differentRun), actionLogHash(log));
});

test('bot report formatter prints a readable summary', () => {
  const text = formatBotReport({
    mode: 'bot-vs-bot',
    matchId: 'm-readable',
    seed: 'BOT-READABLE',
    gameMode: 'split',
    speed: 'fast',
    stopReason: 'MAX_ACTIONS',
    actionLogSteps: 20,
    maxActions: 20,
    finalRev: 20,
    finalStateHash: 'abc123',
    actionLogHash: 'def456',
    bots: {
      p1: { acks: 10, rejects: 0, snapshots: 0, nextSeq: 10 },
      p2: { acks: 10, rejects: 0, snapshots: 0, nextSeq: 10 }
    }
  });

  assert.match(text, /Bot run: bot-vs-bot/);
  assert.match(text, /Actions: 20\/20/);
  assert.match(text, /p1: 10 ack, 0 reject, 0 snapshot/);
});

test('server-managed bot can join a web-hosted match as p2', async (t) => {
  const baseUrl = await withServer(t);
  const createResponse = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-WEB-START', mode: 'split' })
  });
  const match = await createResponse.json();

  const startResponse = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'fast', maxActions: 5 })
  });
  assert.equal(startResponse.status, 202);
  const started = await startResponse.json();
  assert.equal(started.clientId, 'p2');
  assert.equal(started.speed, 'fast');

  const occupiedResponse = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'fast', maxActions: 5 })
  });
  assert.equal(occupiedResponse.status, 409);

  const stopResponse = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot?clientId=p2`, { method: 'DELETE' });
  assert.equal(stopResponse.status, 200);

  const missingStopResponse = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot?clientId=p2`, { method: 'DELETE' });
  assert.equal(missingStopResponse.status, 404);

  const invalidSpeedResponse = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'turbo', maxActions: 5 })
  });
  assert.equal(invalidSpeedResponse.status, 400);
});

test('server-managed bot reconnects and continues after its websocket is interrupted', async (t) => {
  const app = createVNextServer({ logger: silentLogger });
  const address = await app.start({ port: 0 });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => app.close());
  const match = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-RECONNECT', mode: 'split' })
  }).then((response) => response.json());
  const response = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'normal', maxActions: 5 })
  });
  assert.equal(response.status, 202);
  const managed = app.bots.get(`${match.matchId}:p2`);
  await waitUntil(() => managed.report.status === 'running');
  const firstSocket = await waitUntil(() => [...app.wss.clients].find((socket) => socket.matchId === match.matchId && socket.clientId === 'p2'));
  firstSocket.terminate();
  await managed.done;
  assert.equal(managed.report.status, 'max-actions');
  assert.equal(managed.report.actionCount, 5);
  assert.ok(managed.report.reconnects >= 1);
  assert.equal(managed.report.bot.noCandidate, false);
});

test('human resign immediately stops the server-managed opponent bot', async (t) => {
  const baseUrl = await withServer(t);
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const match = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-HUMAN-RESIGN', mode: 'split' })
  }).then((response) => response.json());
  const human = await connectRaw(`${wsBase}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=p1&clientType=ios`);
  t.after(() => human.socket.close());
  await human.next();

  const started = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'easy', maxActions: 1000 })
  });
  assert.equal(started.status, 202);

  human.socket.send(JSON.stringify({
    matchId: match.matchId,
    clientId: 'p1',
    seq: 0,
    baseRev: 0,
    protocolVersion: PROTOCOL_VERSION,
    kind: 'resign',
    payload: {}
  }));
  const finished = await human.next();
  assert.equal(finished.kind, 'ack');
  assert.equal(finished.state.status, 'finished');
  assert.equal(finished.state.winner, 'p2');

  const stopAfterResign = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot?clientId=p2`, { method: 'DELETE' });
  assert.equal(stopAfterResign.status, 404);
});

test('finished human-vs-bot match is persisted for the authenticated human profile', async (t) => {
  const app = createVNextServer({ logger: silentLogger });
  const address = await app.start({ port: 0 });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsBase = baseUrl.replace(/^http/, 'ws');
  t.after(async () => app.close());

  const profile = await fetch(`${baseUrl}/vnext/profiles/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: 'Human Bot Tester' })
  }).then((response) => response.json());
  const unauthorized = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-PERSISTENCE', mode: 'shared', matchKind: 'human-vs-bot' })
  });
  assert.equal(unauthorized.status, 401);
  const matchResponse = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${profile.sessionToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ seed: 'BOT-PERSISTENCE', mode: 'shared', matchKind: 'human-vs-bot' })
  });
  assert.equal(matchResponse.status, 201);
  const match = await matchResponse.json();
  assert.equal(match.matchKind, 'human-vs-bot');
  const human = await connectRaw(`${wsBase}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=p1&clientType=web`);
  t.after(() => human.socket.close());
  const initial = await human.next();
  const started = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'easy', maxActions: 1000 })
  });
  assert.equal(started.status, 202);
  human.socket.send(JSON.stringify({
    matchId: match.matchId,
    clientId: 'p1',
    seq: 0,
    baseRev: initial.rev,
    protocolVersion: PROTOCOL_VERSION,
    kind: 'resign',
    payload: {}
  }));
  let finished;
  for (let index = 0; index < 20 && !finished; index += 1) {
    const message = await human.next();
    if (message.state?.status === 'finished') finished = message;
  }
  assert.ok(finished);
  assert.equal(finished.state.status, 'finished');

  const history = await fetch(`${baseUrl}/vnext/profiles/me/matches`, {
    headers: { authorization: `Bearer ${profile.sessionToken}` }
  }).then((response) => response.json());
  assert.equal(history.matches.length, 1);
  assert.equal(history.matches[0].matchKind, 'human-vs-bot');
  assert.equal(history.matches[0].won, false);
  const updated = await fetch(`${baseUrl}/vnext/profiles/me`, {
    headers: { authorization: `Bearer ${profile.sessionToken}` }
  }).then((response) => response.json());
  assert.equal(updated.player.stats.gamesPlayed, 1);
  assert.equal(updated.player.stats.gamesWon, 0);
});

test('finished bot-vs-bot match is stored as technical history without profile statistics', async (t) => {
  const app = createVNextServer({ logger: silentLogger });
  const address = await app.start({ port: 0 });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  t.after(async () => app.close());
  const match = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-VERSUS-PERSISTENCE', mode: 'split', matchKind: 'bot-vs-bot' })
  }).then((response) => response.json());
  const session = app.sessions.get(match.matchId);
  const metadata = app.directMatches.get(match.matchId);
  metadata.botSeats.add('p1');
  metadata.botSeats.add('p2');
  const outcome = session.process('p1', {
    matchId: match.matchId,
    clientId: 'p1',
    seq: 0,
    baseRev: 0,
    protocolVersion: PROTOCOL_VERSION,
    kind: 'resign',
    payload: {}
  });
  app.recordFinishedMatch(session, outcome.response.state);

  const stored = app.profileStore.database.prepare(`
    SELECT match_kind FROM match_results WHERE match_id = ?
  `).get(match.matchId);
  const seats = app.profileStore.database.prepare(`
    SELECT player_id FROM match_player_results WHERE result_key = ? ORDER BY seat
  `).all(metadata.resultId);
  assert.equal(stored.match_kind, 'bot-vs-bot');
  assert.deepEqual(seats.map((seat) => seat.player_id), [null, null]);
  assert.equal(app.profileStore.database.prepare('SELECT COUNT(*) AS count FROM players').get().count, 0);
});

test('orphaned human-vs-bot stops after the reconnect grace period', async (t) => {
  const logLines = [];
  const app = createVNextServer({
    logger: { log(line) { logLines.push(line); }, error: silentLogger.error },
    botOrphanGraceMs: 80
  });
  const address = await app.start({ port: 0 });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsBase = baseUrl.replace(/^http/, 'ws');
  t.after(() => app.close());
  const match = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-HUMAN-ORPHAN', mode: 'split' })
  }).then((response) => response.json());
  const human = await connectRaw(`${wsBase}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=p1&clientType=web`);
  await human.next();
  const started = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'easy', maxActions: 1000 })
  });
  assert.equal(started.status, 202);
  await waitUntil(() => app.bots.size === 1);

  human.socket.close();
  await waitUntil(() => logLines.some((line) => line.includes('BOT_ORPHAN_STOP_SCHEDULED')));
  const reconnected = await connectRaw(`${wsBase}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=p1&clientType=web&reconnect=1`);
  await reconnected.next();
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(app.bots.size, 1);
  assert.ok(logLines.some((line) => line.includes('BOT_ORPHAN_STOP_CANCELLED')));

  reconnected.socket.close();
  await waitUntil(() => app.bots.size === 0);
  assert.match(logLines.join('\n'), /BOT_ORPHANED_STOPPED/);
});

test('orphaned bot-vs-bot stops both managed bots when its last observer closes', async (t) => {
  const app = createVNextServer({ logger: silentLogger, botOrphanGraceMs: 30 });
  const address = await app.start({ port: 0 });
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsBase = baseUrl.replace(/^http/, 'ws');
  t.after(() => app.close());
  const match = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-VERSUS-ORPHAN', mode: 'shared' })
  }).then((response) => response.json());
  const observer = await connectRaw(`${wsBase}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=observer&clientType=web`);
  await observer.next();
  for (const clientId of ['p1', 'p2']) {
    const response = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, speed: 'easy', maxActions: 1000 })
    });
    assert.equal(response.status, 202);
  }
  await waitUntil(() => app.bots.size === 2);

  observer.socket.close();
  await waitUntil(() => app.bots.size === 0);
});

test('server-managed bot-vs-bot can be observed over websocket', async (t) => {
  const baseUrl = await withServer(t);
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const createResponse = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'BOT-WEB-VERSUS', mode: 'split' })
  });
  const match = await createResponse.json();
  const observer = await connectRaw(`${wsBase}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=observer`);
  t.after(() => observer.socket.close());
  const initial = await observer.next();
  assert.equal(initial.kind, 'snapshot');
  assert.equal(initial.reason, 'INITIAL_CONNECT');

  const p1Start = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p1', speed: 'fast', maxActions: 2 })
  });
  const p2Start = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: 'p2', speed: 'fast', maxActions: 2 })
  });
  assert.equal(p1Start.status, 202);
  assert.equal(p2Start.status, 202);
  const observed = await observer.next();
  assert.equal(observed.kind, 'ack');
  assert.ok(observed.rev >= 1);

  observer.socket.send(JSON.stringify({
    matchId: match.matchId,
    clientId: 'observer',
    seq: 0,
    baseRev: observed.rev,
    protocolVersion: PROTOCOL_VERSION,
    kind: 'draw',
    payload: {}
  }));
  const rejected = await observer.next();
  assert.equal(rejected.kind, 'reject');
  assert.equal(rejected.code, 'OBSERVER_READ_ONLY');

  const p1Stop = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot?clientId=p1`, { method: 'DELETE' });
  const p2Stop = await fetch(`${baseUrl}/vnext/matches/${match.matchId}/bot?clientId=p2`, { method: 'DELETE' });
  assert.ok([200, 404].includes(p1Stop.status));
  assert.ok([200, 404].includes(p2Stop.status));
});

test('bot-vs-bot runs are deterministic for the same seed and mode', async (t) => {
  const baseUrl = await withServer(t);
  const first = await runBotVsBot({
    baseUrl,
    seed: 'BOT-DETERMINISTIC-001',
    mode: 'split',
    speed: 'fast',
    maxActions: 30
  });
  const second = await runBotVsBot({
    baseUrl,
    seed: 'BOT-DETERMINISTIC-001',
    mode: 'split',
    speed: 'fast',
    maxActions: 30
  });

  assert.equal(first.stopReason, 'MAX_ACTIONS');
  assert.equal(first.finalRev, second.finalRev);
  assert.equal(first.finalStateHash, second.finalStateHash);
  assert.equal(first.actionLogHash, second.actionLogHash);
  assert.equal(first.actionLogSteps, second.actionLogSteps);
});
