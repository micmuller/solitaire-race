'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { canonicalize, createMulberry32, fnv1a32, stateHash } = require('../core');

test('FNV-1a hashes UTF-8 seed bytes', () => {
  assert.equal(fnv1a32('hello'), 0x4f9f2cab);
  assert.equal(fnv1a32('HighNoon'), fnv1a32('HighNoon'));
  assert.notEqual(fnv1a32('HighNoon'), fnv1a32('highnoon'));
});

test('Mulberry32 returns a deterministic uint32 stream', () => {
  const first = createMulberry32('SEED-0001');
  const second = createMulberry32('SEED-0001');
  const a = Array.from({ length: 8 }, () => first());
  const b = Array.from({ length: 8 }, () => second());
  assert.deepEqual(a, b);
  assert.deepEqual(a, [
    1951003405,
    1124236144,
    868520129,
    3340147635,
    16346525,
    1830979399,
    1322396601,
    1876149909
  ]);
  assert.ok(a.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff));
});

test('canonical JSON sorts object keys and preserves array order', () => {
  assert.equal(
    canonicalize({ z: 1, a: { y: 2, x: [3, 1] } }),
    '{"a":{"x":[3,1],"y":2},"z":1}'
  );
  assert.throws(() => canonicalize({ missing: undefined }), /Undefined canonical field/);
  assert.throws(() => canonicalize({ float: 1.5 }), /safe integer/);
});

test('stateHash is stable and revision-sensitive', () => {
  const state = { mode: 'split', seed: 'SEED-0001' };
  assert.equal(stateHash(0, state), stateHash(0, { seed: 'SEED-0001', mode: 'split' }));
  assert.notEqual(stateHash(0, state), stateHash(1, state));
  assert.match(stateHash(0, state), /^[0-9a-f]{64}$/);
});
