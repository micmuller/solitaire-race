#!/usr/bin/env node
'use strict';

const { WebSocket } = require('ws');
const { PROTOCOL_VERSION } = require('../core');

const baseUrl = (process.argv[2] || 'http://127.0.0.1:3011').replace(/\/$/, '');

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

async function main() {
  const healthResponse = await fetch(`${baseUrl}/health`);
  if (!healthResponse.ok) throw new Error(`Health check failed: HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();

  const createResponse = await fetch(`${baseUrl}/vnext/matches`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: 'MANUAL-SMOKE-001', mode: 'split' })
  });
  if (!createResponse.ok) throw new Error(`Match creation failed: HTTP ${createResponse.status}`);
  const match = await createResponse.json();

  const wsUrl = baseUrl.replace(/^http/, 'ws');
  const client = await connect(`${wsUrl}/vnext?matchId=${encodeURIComponent(match.matchId)}&clientId=p1`);
  const initial = await client.next();
  const ackPromise = client.next();
  client.socket.send(JSON.stringify({
    matchId: match.matchId,
    clientId: 'p1',
    seq: 0,
    baseRev: initial.rev,
    protocolVersion: PROTOCOL_VERSION,
    kind: 'draw',
    payload: {
      source: { zone: 'stock', owner: 'p1' },
      target: { zone: 'waste', owner: 'p1' }
    }
  }));
  const ack = await ackPromise;
  client.socket.close();

  if (initial.kind !== 'snapshot' || ack.kind !== 'ack' || ack.rev !== 1) {
    throw new Error(`Unexpected smoke result: ${JSON.stringify({ initial: initial.kind, ack: ack.kind, rev: ack.rev })}`);
  }
  console.log(JSON.stringify({
    status: 'PASS',
    server: `${health.appVersion} / protocol ${health.protocolVersion}`,
    matchId: match.matchId,
    initialRev: initial.rev,
    finalRev: ack.rev,
    finalStateHash: ack.stateHash
  }, null, 2));
}

main().catch((error) => {
  console.error(`[smoke] FAIL: ${error.message}`);
  process.exit(1);
});
