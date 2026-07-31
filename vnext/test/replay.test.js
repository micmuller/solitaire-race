'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { initMatch } = require('../core');
const { defaultExpectedConfig, replay } = require('../replay');
const { buildGoldenArtifacts } = require('../replay/generateGolden');

const GOLDEN_DIR = path.join(__dirname, '..', 'replay', 'golden');

function readGolden(filename) {
  return JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, filename), 'utf8'));
}

test('all 20 golden seeds have stable split and shared start hashes', () => {
  const manifest = readGolden('start-hashes.json');
  assert.equal(manifest.starts.length, 40);
  for (const expected of manifest.starts) {
    const actual = initMatch(expected.seed, expected.mode);
    assert.deepEqual(
      { rev: actual.rev, stateHash: actual.stateHash },
      { rev: expected.rev, stateHash: expected.stateHash }
    );
  }
});

test('checked-in golden artifacts exactly match the deterministic generator', () => {
  const generated = buildGoldenArtifacts();
  assert.deepEqual(readGolden('start-hashes.json'), generated.manifest);
  for (const [filename, log] of Object.entries(generated.logs)) {
    assert.deepEqual(readGolden(filename), log);
  }
});

for (const mode of ['split', 'shared']) {
  test(`golden ${mode} ActionLog replays through ack, reject and snapshot`, () => {
    const log = readGolden(`SEED-0001.${mode}.json`);
    const report = replay(log, defaultExpectedConfig('SEED-0001', mode));
    assert.deepEqual(report, {
      status: 'SUCCESS',
      finalRev: 4,
      finalStateHash: log.steps.at(-1).expectedStateHashAfter
    });
    assert.deepEqual(log.steps.map((step) => step.expectedResult), [
      'ack', 'ack', 'reject', 'ack', 'snapshot', 'ack'
    ]);
  });
}

test('replay fails at the first tampered hash', () => {
  const log = structuredClone(readGolden('SEED-0001.split.json'));
  log.steps[2].expectedStateHashAfter = '0'.repeat(64);
  const report = replay(log, defaultExpectedConfig('SEED-0001', 'split'));
  assert.equal(report.status, 'FAIL');
  assert.equal(report.failureStep, 2);
  assert.match(report.failureReason, /Expected stateHash/);
});

test('replay rejects header mismatch before initialization', () => {
  const log = readGolden('SEED-0001.split.json');
  const report = replay(log, defaultExpectedConfig('SEED-0002', 'split'));
  assert.deepEqual(report, {
    status: 'FAIL',
    finalRev: null,
    finalStateHash: null,
    failureReason: 'ActionLog header.seed does not match expected configuration'
  });
});

test('replay rejects malformed and non-contiguous steps deterministically', () => {
  const log = structuredClone(readGolden('SEED-0001.shared.json'));
  log.steps[1].i = 9;
  const first = replay(log, defaultExpectedConfig('SEED-0001', 'shared'));
  const second = replay(log, defaultExpectedConfig('SEED-0001', 'shared'));
  assert.deepEqual(first, second);
  assert.equal(first.failureStep, 1);
  assert.equal(first.failureReason, 'Step index must be 1');
});

test('duplicate sequence is replayed as a stable reject', () => {
  const log = structuredClone(readGolden('SEED-0001.split.json'));
  const hashAfterFirst = log.steps[0].expectedStateHashAfter;
  log.steps = [log.steps[0], {
    i: 1,
    clientId: 'p1',
    seq: 0,
    baseRev: 1,
    action: log.steps[0].action,
    expectedResult: 'reject',
    expectedRejectCode: 'DUPLICATE_SEQ',
    expectedStateHashAfter: hashAfterFirst
  }];
  assert.deepEqual(replay(log, defaultExpectedConfig('SEED-0001', 'split')), {
    status: 'SUCCESS',
    finalRev: 1,
    finalStateHash: hashAfterFirst
  });
});
