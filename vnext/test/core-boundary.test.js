'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const CORE_DIR = path.resolve(__dirname, '../core');

test('greenfield core imports only node built-ins and files inside vnext/core', () => {
  const files = fs.readdirSync(CORE_DIR).filter((file) => file.endsWith('.js'));

  for (const file of files) {
    const source = fs.readFileSync(path.join(CORE_DIR, file), 'utf8');
    const imports = [...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);

    for (const specifier of imports) {
      if (specifier.startsWith('node:')) continue;
      assert.match(specifier, /^\.\//, `${file} imports non-core module ${specifier}`);
      const resolved = path.resolve(CORE_DIR, specifier);
      assert.ok(resolved.startsWith(`${CORE_DIR}${path.sep}`), `${file} escapes vnext/core via ${specifier}`);
    }
  }
});
