'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { WebSocket } = require('ws');
const { generateActionCandidates } = require('../bot/actionGenerator');
const { formatBotReport } = require('../bot/format');
const { BotActor, actionLogHash, normalizeSpeed, runBotVsBot, speedDelay } = require('../bot/runner');
const { initMatch } = require('../core');
const { createVNextServer } = require('../server');

const silentLogger = { log() {}, error() {} };

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
    protocolVersion: '2.0.0',
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
