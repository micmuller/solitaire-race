'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { generateActionCandidates } = require('../bot/actionGenerator');
const { formatBotReport } = require('../bot/format');
const { actionLogHash, runBotVsBot, speedDelay } = require('../bot/runner');
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
  assert.equal(speedDelay('fast', 0, 'p1'), 0);
  assert.equal(speedDelay('normal', 7, 'p2'), speedDelay('normal', 7, 'p2'));
  assert.ok(speedDelay('slow', 1, 'p1') >= 900);
  assert.ok(speedDelay('slow', 1, 'p1') <= 1200);
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
