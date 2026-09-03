'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { ProtocolClient, createMatch, restartMatch, validateAuthoritativeResponse } = require('../client/protocolClient');
const { PROTOCOL_VERSION } = require('../core');
const { createVNextServer } = require('../server');
const { runTwoPlayerSimulation } = require('../simulator/twoPlayer');

const silentLogger = { log() {}, error() {} };

function zone(zoneName, owner) {
  return { zone: zoneName, owner };
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

function waitForRev(client, rev, timeoutMs = 2000) {
  if (client.current?.rev >= rev) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`client did not reach revision ${rev}`));
    }, timeoutMs);
    const unsubscribe = client.subscribe((event) => {
      if (event.type === 'state' && event.current.rev >= rev) {
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      }
    });
  });
}

test('node protocol client times out a lost action response and keeps its sequence', async () => {
  class SilentWebSocket {
    static OPEN = 1;
    constructor() { this.readyState = SilentWebSocket.OPEN; }
    send() {}
  }
  const client = new ProtocolClient({ baseUrl: 'http://example.test', matchId: 'm-timeout', clientId: 'p1', WebSocketImpl: SilentWebSocket, actionTimeoutMs: 5 });
  client.socket = new SilentWebSocket();
  client.current = { rev: 4, stateHash: 'hash', state: {} };
  await assert.rejects(client.sendIntent('draw', { source: zone('stock', 'p1'), target: zone('waste', 'p1') }), (error) => error.code === 'ACTION_TIMEOUT');
  assert.equal(client.pending, null);
  assert.equal(client.nextSeq, 0);
});

test('two-player simulator converges both thin clients', async (t) => {
  const baseUrl = await withServer(t);
  const report = await runTwoPlayerSimulation(baseUrl);
  assert.equal(report.status, 'PASS');
  assert.equal(report.finalRev, 2);
  assert.equal(report.p1Seq, 1);
  assert.equal(report.p2Seq, 1);
  assert.equal(report.rejectCode, 'INVALID_TARGET');
});

test('client keeps state and sequence on reject, then reuses the sequence', async (t) => {
  const baseUrl = await withServer(t);
  const match = await createMatch(baseUrl, { seed: 'CLIENT-REJECT', mode: 'split' });
  const client = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p1' });
  t.after(() => client.close());
  await client.connect();

  const initial = client.current;
  const rejected = await client.sendIntent('draw', {
    source: zone('stock', 'p1'),
    target: zone('stock', 'p1')
  });
  assert.equal(rejected.kind, 'reject');
  assert.equal(client.nextSeq, 0);
  assert.deepEqual(client.current, initial);

  const accepted = await client.sendIntent('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  assert.equal(accepted.kind, 'ack');
  assert.equal(accepted.seq, 0);
  assert.equal(client.nextSeq, 1);
  assert.equal(client.current.rev, 1);
});

test('client recovers next sequence after duplicate sequence reject', async (t) => {
  const baseUrl = await withServer(t);
  const match = await createMatch(baseUrl, { seed: 'CLIENT-DUPLICATE-SEQ', mode: 'split' });
  const client = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p1' });
  t.after(() => client.close());
  await client.connect();

  await client.sendIntent('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  assert.equal(client.nextSeq, 1);

  client.nextSeq = 0;
  const duplicate = await client.sendIntent('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  assert.equal(duplicate.kind, 'reject');
  assert.equal(duplicate.code, 'DUPLICATE_SEQ');
  assert.equal(duplicate.expectedSeq, 1);
  assert.equal(client.nextSeq, 1);

  const accepted = await client.sendIntent('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  assert.equal(accepted.kind, 'ack');
  assert.equal(accepted.seq, 1);
  assert.equal(client.nextSeq, 2);
});

test('stale client action is rebased against the latest authoritative state', async (t) => {
  const baseUrl = await withServer(t);
  const match = await createMatch(baseUrl, { seed: 'CLIENT-RECOVERY', mode: 'shared' });
  const p1 = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p1' });
  const p2 = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p2' });
  t.after(() => { p1.close(); p2.close(); });
  await Promise.all([p1.connect(), p2.connect()]);

  await p1.sendIntent('draw', { source: zone('stock', 'p1'), target: zone('waste', 'p1') });
  await waitForRev(p2, 1);
  p2.current = { ...p2.current, rev: 0 };

  const ack = await p2.sendIntent('draw', {
    source: zone('stock', 'p2'),
    target: zone('waste', 'p2')
  });
  assert.equal(ack.kind, 'ack');
  assert.equal(ack.seq, 0);
  assert.equal(ack.rev, 2);
  assert.equal(ack.state.players.p1.waste.length, 1);
  assert.equal(ack.state.players.p2.waste.length, 1);
  assert.equal(p2.nextSeq, 1);
});

test('restart snapshot resets both thin clients even when revision goes back to zero', async (t) => {
  const baseUrl = await withServer(t);
  const match = await createMatch(baseUrl, { seed: 'CLIENT-RESTART', mode: 'split' });
  const p1 = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p1' });
  const p2 = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p2' });
  t.after(() => { p1.close(); p2.close(); });
  await Promise.all([p1.connect(), p2.connect()]);

  await p1.sendIntent('draw', { source: zone('stock', 'p1'), target: zone('waste', 'p1') });
  await waitForRev(p2, 1);
  assert.equal(p1.nextSeq, 1);
  assert.equal(p2.current.rev, 1);

  const p1Restart = new Promise((resolve) => {
    const unsubscribe = p1.subscribe((event) => {
      if (event.type === 'state' && event.current.state.seed === 'CLIENT-RESTART-NEW') {
        unsubscribe();
        resolve(event.current);
      }
    });
  });
  const p2Restart = new Promise((resolve) => {
    const unsubscribe = p2.subscribe((event) => {
      if (event.type === 'state' && event.current.state.seed === 'CLIENT-RESTART-NEW') {
        unsubscribe();
        resolve(event.current);
      }
    });
  });
  const restarted = await restartMatch(baseUrl, match.matchId, { seed: 'CLIENT-RESTART-NEW', mode: 'shared' });
  assert.equal(restarted.reason, 'RESTART');
  const [p1Current, p2Current] = await Promise.all([p1Restart, p2Restart]);

  for (const current of [p1Current, p2Current]) {
    assert.equal(current.rev, 0);
    assert.equal(current.state.seed, 'CLIENT-RESTART-NEW');
    assert.equal(current.state.mode, 'shared');
    assert.equal(current.stateHash, restarted.stateHash);
  }
  assert.equal(p1.nextSeq, 0);
  assert.equal(p2.nextSeq, 0);

  const ack = await p2.sendIntent('draw', { source: zone('stock', 'p2'), target: zone('waste', 'p2') });
  assert.equal(ack.kind, 'ack');
  assert.equal(ack.seq, 0);
  assert.equal(p2.nextSeq, 1);
});

test('p2 resign broadcasts finished state and blocks later actions', async (t) => {
  const baseUrl = await withServer(t);
  const match = await createMatch(baseUrl, { seed: 'CLIENT-RESIGN', mode: 'split' });
  const p1 = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p1' });
  const p2 = new ProtocolClient({ baseUrl, matchId: match.matchId, clientId: 'p2' });
  t.after(() => { p1.close(); p2.close(); });
  await Promise.all([p1.connect(), p2.connect()]);

  const p1Finished = new Promise((resolve) => {
    const unsubscribe = p1.subscribe((event) => {
      if (event.type === 'state' && event.current.state.status === 'finished') {
        unsubscribe();
        resolve(event.current);
      }
    });
  });
  const resigned = await p2.sendIntent('resign', {});
  assert.equal(resigned.kind, 'ack');
  assert.equal(resigned.state.status, 'finished');
  assert.equal(resigned.state.endedBy, 'p2');
  assert.equal(resigned.state.winner, 'p1');

  const p1Current = await p1Finished;
  assert.equal(p1Current.state.status, 'finished');
  assert.equal(p1Current.stateHash, resigned.stateHash);

  const rejected = await p1.sendIntent('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  assert.equal(rejected.kind, 'reject');
  assert.equal(rejected.code, 'MATCH_FINISHED');
});

test('client rejects malformed or mismatched authoritative responses', () => {
  assert.equal(validateAuthoritativeResponse(null, 'm-1'), 'response must be an object');
  assert.equal(validateAuthoritativeResponse({
    kind: 'reject',
    matchId: 'm-other',
    protocolVersion: PROTOCOL_VERSION,
    rev: 0,
    stateHash: '0'.repeat(64),
    code: 'RULE_VIOLATION'
  }, 'm-1'), 'response matchId does not match');
});
