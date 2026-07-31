'use strict';

const { TextEncoder } = require('node:util');

function fnv1a32(seed) {
  if (typeof seed !== 'string') {
    throw new TypeError('Seed must be a string');
  }

  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(seed)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function createMulberry32(seed) {
  let state = fnv1a32(seed);

  return function nextUint32() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return (value ^ (value >>> 14)) >>> 0;
  };
}

function shuffle(input, seed) {
  if (!Array.isArray(input)) {
    throw new TypeError('Shuffle input must be an array');
  }

  const result = input.slice();
  const nextUint32 = createMulberry32(seed);

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = nextUint32() % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

module.exports = { createMulberry32, fnv1a32, shuffle };
