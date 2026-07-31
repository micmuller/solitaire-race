'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { WebSocket } = require('ws');
const { PROTOCOL_VERSION } = require('../core');
const { defaultExpectedConfig, replay } = require('../replay');
const { createVNextServer } = require('../server');
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

test('out-of-sync envelope returns an unchanged replayable snapshot', () => {
  const session = new MatchSession({ matchId: 'm-sync', seed: 'SYNC-SEED', mode: 'shared' });
  const outcome = session.process('p2', drawEnvelope('m-sync', 'p2', 1, 0));
  assert.equal(outcome.response.kind, 'snapshot');
  assert.equal(outcome.response.reason, 'OUT_OF_SYNC');
  assert.equal(outcome.response.rev, 0);
  assert.equal(outcome.broadcast, false);
  assert.equal(replay(session.actionLog(), defaultExpectedConfig('SYNC-SEED', 'shared')).status, 'SUCCESS');
});

test('vNext HTTP and WebSocket shell creates a match and broadcasts authoritative ack', async (t) => {
  const app = createVNextServer({ logger: silentLogger });
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

  const duplicatePromise = p1.next();
  p1.socket.send(JSON.stringify(drawEnvelope(created.matchId, 'p1', 0, 1)));
  const duplicate = await duplicatePromise;
  assert.equal(duplicate.kind, 'reject');
  assert.equal(duplicate.code, 'DUPLICATE_SEQ');
  assert.equal(duplicate.rev, 1);

  const log = await fetch(`${httpBase}/vnext/matches/${created.matchId}/replay`).then((response) => response.json());
  assert.equal(log.steps.length, 2);
  assert.equal(replay(log, defaultExpectedConfig('SMOKE-SEED', 'shared')).status, 'SUCCESS');
});
