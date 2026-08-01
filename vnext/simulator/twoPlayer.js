#!/usr/bin/env node
'use strict';

const { ProtocolClient, createMatch } = require('../client/protocolClient');

const baseUrl = (process.argv[2] || 'http://127.0.0.1:3011').replace(/\/$/, '');

function zone(zoneName, owner) {
  return { zone: zoneName, owner };
}

function waitForRev(client, rev, timeoutMs = 2000) {
  if (client.current?.rev >= rev) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error(`${client.clientId} did not reach revision ${rev}`));
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

async function runTwoPlayerSimulation(url = baseUrl) {
  const match = await createMatch(url, { seed: 'TWO-PLAYER-SIM-001', mode: 'shared' });
  const p1 = new ProtocolClient({ baseUrl: url, matchId: match.matchId, clientId: 'p1' });
  const p2 = new ProtocolClient({ baseUrl: url, matchId: match.matchId, clientId: 'p2' });
  try {
    await Promise.all([p1.connect(), p2.connect()]);
    const p1Ack = await p1.sendIntent('draw', {
      source: zone('stock', 'p1'),
      target: zone('waste', 'p1')
    });
    await waitForRev(p2, 1);

    const p2Ack = await p2.sendIntent('draw', {
      source: zone('stock', 'p2'),
      target: zone('waste', 'p2')
    });
    await waitForRev(p1, 2);

    const beforeReject = p1.current;
    const rejected = await p1.sendIntent('draw', {
      source: zone('stock', 'p1'),
      target: zone('stock', 'p1')
    });
    if (p1Ack.kind !== 'ack' || p2Ack.kind !== 'ack' || rejected.kind !== 'reject') {
      throw new Error('Simulator did not receive expected ack/ack/reject sequence');
    }
    if (p1.current.rev !== 2 || p2.current.rev !== 2 || p1.current.stateHash !== p2.current.stateHash) {
      throw new Error('Client states did not converge');
    }
    if (beforeReject.rev !== p1.current.rev || beforeReject.stateHash !== p1.current.stateHash) {
      throw new Error('Rejected action changed authoritative client state');
    }
    return {
      status: 'PASS',
      matchId: match.matchId,
      p1Seq: p1.nextSeq,
      p2Seq: p2.nextSeq,
      finalRev: p1.current.rev,
      finalStateHash: p1.current.stateHash,
      rejectCode: rejected.code
    };
  } finally {
    p1.close();
    p2.close();
  }
}

if (require.main === module) {
  runTwoPlayerSimulation().then((report) => {
    console.log(JSON.stringify(report, null, 2));
  }).catch((error) => {
    console.error(`[simulator] FAIL: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runTwoPlayerSimulation };
