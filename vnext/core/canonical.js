'use strict';

const { createHash } = require('node:crypto');

function canonicalize(value, path = '$') {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError(`Canonical number at ${path} must be a safe integer`);
    }
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item, index) => canonicalize(item, `${path}[${index}]`)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Canonical object at ${path} must be a plain object`);
    }

    const keys = Object.keys(value).sort();
    const fields = keys.map((key) => {
      if (value[key] === undefined) {
        throw new TypeError(`Undefined canonical field at ${path}.${key}`);
      }
      return `${JSON.stringify(key)}:${canonicalize(value[key], `${path}.${key}`)}`;
    });
    return `{${fields.join(',')}}`;
  }

  throw new TypeError(`Unsupported canonical value at ${path}`);
}

function stateHash(rev, state) {
  if (!Number.isSafeInteger(rev) || rev < 0) {
    throw new TypeError('Revision must be a non-negative safe integer');
  }

  const input = canonicalize({ rev, state });
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

module.exports = { canonicalize, stateHash };
