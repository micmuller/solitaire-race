'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  PROTOCOL_VERSION,
  RULES_VERSION,
  applyAction,
  initMatch
} = require('../core');

const GOLDEN_SEEDS = Object.freeze(Array.from({ length: 20 }, (_, index) => `SEED-${String(index + 1).padStart(4, '0')}`));

function zone(zoneName, owner, index) {
  const ref = { zone: zoneName, owner };
  if (index !== undefined) ref.index = index;
  return ref;
}

function action(kind, payload) {
  return { kind, payload };
}

function scenarioDefinitions() {
  return [
    { clientId: 'p1', seq: 0, baseRev: 0, action: action('draw', { source: zone('stock', 'p1'), target: zone('waste', 'p1') }) },
    { clientId: 'p2', seq: 0, baseRev: 1, action: action('draw', { source: zone('stock', 'p2'), target: zone('waste', 'p2') }) },
    { clientId: 'p1', seq: 1, baseRev: 2, action: action('draw', { source: zone('stock', 'p1'), target: zone('stock', 'p1') }) },
    { clientId: 'p1', seq: 1, baseRev: 2, action: action('draw', { source: zone('stock', 'p1'), target: zone('waste', 'p1') }) },
    { clientId: 'p2', seq: 2, baseRev: 3, action: action('draw', { source: zone('stock', 'p2'), target: zone('waste', 'p2') }) },
    { clientId: 'p2', seq: 1, baseRev: 3, action: action('draw', { source: zone('stock', 'p2'), target: zone('waste', 'p2') }) }
  ];
}

function createActionLog(seed, mode) {
  let current = initMatch(seed, mode);
  const lastAcceptedSeq = { p1: -1, p2: -1 };
  const steps = scenarioDefinitions().map((definition, i) => {
    const expectedSeq = lastAcceptedSeq[definition.clientId] + 1;
    let result;
    if (definition.seq > expectedSeq || definition.baseRev !== current.rev) {
      result = { result: 'snapshot', rev: current.rev, stateHash: current.stateHash };
    } else {
      result = applyAction(current, definition.clientId, definition.action);
    }
    const step = {
      i,
      ...definition,
      expectedResult: result.result,
      expectedStateHashAfter: result.stateHash
    };
    if (result.result === 'reject') step.expectedRejectCode = result.code;
    if (result.result === 'ack') {
      lastAcceptedSeq[definition.clientId] = definition.seq;
      current = { rev: result.rev, state: result.state, stateHash: result.stateHash };
    }
    return step;
  });
  return {
    header: { seed, protocolVersion: PROTOCOL_VERSION, rulesVersion: RULES_VERSION, mode },
    steps
  };
}

function buildGoldenArtifacts() {
  const starts = [];
  for (const seed of GOLDEN_SEEDS) {
    for (const mode of ['split', 'shared']) {
      const initial = initMatch(seed, mode);
      starts.push({ seed, mode, rev: initial.rev, stateHash: initial.stateHash });
    }
  }
  return {
    manifest: {
      protocolVersion: PROTOCOL_VERSION,
      rulesVersion: RULES_VERSION,
      starts
    },
    logs: {
      'SEED-0001.split.json': createActionLog('SEED-0001', 'split'),
      'SEED-0001.shared.json': createActionLog('SEED-0001', 'shared')
    }
  };
}

function writeGoldenArtifacts(directory = path.join(__dirname, 'golden')) {
  const artifacts = buildGoldenArtifacts();
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'start-hashes.json'), `${JSON.stringify(artifacts.manifest, null, 2)}\n`);
  for (const [filename, log] of Object.entries(artifacts.logs)) {
    fs.writeFileSync(path.join(directory, filename), `${JSON.stringify(log, null, 2)}\n`);
  }
}

if (require.main === module) writeGoldenArtifacts();

module.exports = { GOLDEN_SEEDS, buildGoldenArtifacts, createActionLog, writeGoldenArtifacts };
