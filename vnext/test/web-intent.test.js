'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

let mapping;
test.before(async () => {
  mapping = await import('../web/intent-mapping.mjs');
});

const cards = [
  { cardId: 'd0:S:9' },
  { cardId: 'd0:H:8' },
  { cardId: 'd0:C:7' }
];

test('waste selection maps only the accessible top card', () => {
  assert.deepEqual(mapping.wasteSelection('p1', cards), {
    source: { zone: 'waste', owner: 'p1' },
    count: 1,
    cardIds: ['d0:C:7']
  });
  assert.equal(mapping.wasteSelection('p1', []), null);
});

test('tableau selection maps the selected suffix without evaluating rules', () => {
  assert.deepEqual(mapping.tableauSelection('p2', 4, 1, cards), {
    source: { zone: 'tableau', owner: 'p2', index: 4 },
    count: 2,
    cardIds: ['d0:H:8', 'd0:C:7']
  });
});

test('selected source maps to structured tableau and foundation intents', () => {
  const selection = mapping.tableauSelection('p1', 2, 1, cards);
  assert.deepEqual(mapping.tableauIntent(selection, 'p1', 5), {
    kind: 'tableauMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 2 },
      target: { zone: 'tableau', owner: 'p1', index: 5 },
      count: 2
    }
  });
  assert.deepEqual(mapping.foundationIntent(selection, 7), {
    kind: 'foundationMove',
    payload: {
      source: { zone: 'tableau', owner: 'p1', index: 2 },
      target: { zone: 'foundation', owner: 'global', index: 7 }
    }
  });
});
