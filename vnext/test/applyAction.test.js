'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { applyAction, checkInvariants, initMatch, stateHash } = require('../core');
const { APP_VERSION, PROTOCOL_VERSION, RULES_VERSION, SCHEMA_VERSION } = require('../core/constants');

function action(kind, payload) {
  return { kind, payload };
}

function zone(zoneName, owner, index) {
  const ref = { zone: zoneName, owner };
  if (index !== undefined) ref.index = index;
  return ref;
}

function allCards(state) {
  return [
    ...state.players.p1.stock,
    ...state.players.p1.waste,
    ...state.players.p1.tableau.flat(),
    ...state.players.p2.stock,
    ...state.players.p2.waste,
    ...state.players.p2.tableau.flat(),
    ...state.foundations.flatMap((foundation) => foundation.cards)
  ];
}

function controlledMatch(configure) {
  const original = initMatch('ACTION-SCENARIO', 'shared').state;
  const catalog = new Map(allCards(original).map((card) => [card.cardId, card]));
  const used = new Set();
  const state = structuredClone(original);

  for (const playerId of ['p1', 'p2']) {
    state.players[playerId] = { stock: [], waste: [], tableau: Array.from({ length: 7 }, () => []), score: 0 };
  }
  state.foundations = state.foundations.map((foundation) => ({ suit: foundation.suit, cards: [] }));

  function card(cardId, faceDown) {
    const source = catalog.get(cardId);
    if (!source) throw new Error(`Unknown test card ${cardId}`);
    if (used.has(cardId)) throw new Error(`Duplicate test placement ${cardId}`);
    used.add(cardId);
    return { ...source, faceDown };
  }

  configure(state, card);
  state.players.p1.score = state.foundations.reduce((total, foundation) => {
    return total + foundation.cards.reduce((sum, card) => sum + card.rank, 0);
  }, 0);
  state.players.p2.stock.push(
    ...[...catalog.values()]
      .filter((candidate) => !used.has(candidate.cardId))
      .map((candidate) => ({ ...candidate, faceDown: true }))
  );

  assert.deepEqual(checkInvariants(state), { ok: true, violations: [] });
  return { rev: 0, state, stateHash: stateHash(0, state) };
}

test('version axes are exposed independently', () => {
  assert.equal(APP_VERSION, '1.1.0-alpha.13');
  assert.equal(PROTOCOL_VERSION, '2.5.2');
  assert.equal(RULES_VERSION, '1.0.0');
  assert.equal(SCHEMA_VERSION, '1.4.0');
});

test('draw is atomic, turns the stock top face-up and increments revision', () => {
  const current = initMatch('SEED-0004', 'split');
  const original = structuredClone(current);
  const expectedCardId = current.state.players.p1.stock.at(-1).cardId;
  const result = applyAction(current, 'p1', action('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  }));

  assert.equal(result.result, 'ack');
  assert.equal(result.rev, 1);
  assert.equal(result.state.players.p1.waste.at(-1).cardId, expectedCardId);
  assert.equal(result.state.players.p1.waste.at(-1).faceDown, false);
  assert.equal(result.stateHash, stateHash(1, result.state));
  assert.deepEqual(current, original);
});

test('recycle reverses waste into a face-down stock', () => {
  let current = initMatch('SEED-0005', 'split');
  const drawAction = action('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  const originalStockOrder = current.state.players.p1.stock.map((card) => card.cardId);
  while (current.state.players.p1.stock.length > 0) current = applyAction(current, 'p1', drawAction);

  const result = applyAction(current, 'p1', action('recycle', {
    source: zone('waste', 'p1'),
    target: zone('stock', 'p1')
  }));
  assert.equal(result.result, 'ack');
  assert.deepEqual(result.state.players.p1.stock.map((card) => card.cardId), originalStockOrder);
  assert.ok(result.state.players.p1.stock.every((card) => card.faceDown));
  assert.equal(result.state.players.p1.waste.length, 0);
});

test('flip exposes only the top face-down tableau card', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.tableau[2].push(card('d0:C:07', true));
  });
  const result = applyAction(current, 'p1', action('flip', {
    source: zone('tableau', 'p1', 2)
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.state.players.p1.tableau[2][0].faceDown, false);
});

test('tableauMove moves a valid face-up sequence and preserves order', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.tableau[0].push(card('d0:H:12', false), card('d0:S:11', false));
    state.players.p1.tableau[1].push(card('d0:C:13', false));
  });
  const result = applyAction(current, 'p1', action('tableauMove', {
    source: zone('tableau', 'p1', 0),
    target: zone('tableau', 'p1', 1),
    count: 2
  }));
  assert.equal(result.result, 'ack');
  assert.deepEqual(result.state.players.p1.tableau[1].map((card) => card.cardId), [
    'd0:C:13', 'd0:H:12', 'd0:S:11'
  ]);
  assert.equal(result.state.players.p1.tableau[0].length, 0);
});

test('tableauMove atomically reveals the newly exposed source card', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.tableau[0].push(card('d0:D:13', true), card('d0:H:12', false), card('d0:S:11', false));
    state.players.p1.tableau[1].push(card('d0:C:13', false));
  });
  const result = applyAction(current, 'p1', action('tableauMove', {
    source: zone('tableau', 'p1', 0),
    target: zone('tableau', 'p1', 1),
    count: 2
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.state.players.p1.tableau[0].at(-1).cardId, 'd0:D:13');
  assert.equal(result.state.players.p1.tableau[0].at(-1).faceDown, false);
});

test('tableauMove accepts a face-up waste card on a legal target', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.waste.push(card('d0:H:12', false));
    state.players.p1.tableau[1].push(card('d0:C:13', false));
  });
  const result = applyAction(current, 'p1', action('tableauMove', {
    source: zone('waste', 'p1'),
    target: zone('tableau', 'p1', 1),
    count: 1
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.state.players.p1.waste.length, 0);
  assert.equal(result.state.players.p1.tableau[1].at(-1).cardId, 'd0:H:12');
});

test('a King can move to an empty tableau', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.tableau[0].push(card('d0:C:13', false));
  });
  const result = applyAction(current, 'p1', action('tableauMove', {
    source: zone('tableau', 'p1', 0),
    target: zone('tableau', 'p1', 1),
    count: 1
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.state.players.p1.tableau[1][0].cardId, 'd0:C:13');
});

test('only a King-led stack can move to an empty tableau', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.tableau[0].push(card('d0:H:12', false));
  });
  const original = structuredClone(current);
  const result = applyAction(current, 'p1', action('tableauMove', {
    source: zone('tableau', 'p1', 0),
    target: zone('tableau', 'p1', 1),
    count: 1
  }));
  assert.equal(result.result, 'reject');
  assert.equal(result.code, 'RULE_VIOLATION');
  assert.deepEqual(current, original);
  assert.strictEqual(result.state, current.state);
});

test('foundationMove ignores the client lane hint and resolves deterministically', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.waste.push(card('d0:C:01', false));
  });
  const result = applyAction(current, 'p1', action('foundationMove', {
    source: zone('waste', 'p1'),
    target: zone('foundation', 'global', 7)
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.resolvedFoundationIndex, 0);
  assert.equal(result.state.foundations[0].cards[0].cardId, 'd0:C:01');
  assert.equal(result.state.players.p1.score, 1);
  assert.equal(result.state.players.p2.score, 0);
});

test('foundationMove atomically reveals the newly exposed source card', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.tableau[2].push(card('d0:H:02', true), card('d0:C:01', false));
  });
  const result = applyAction(current, 'p1', action('foundationMove', {
    source: zone('tableau', 'p1', 2),
    target: zone('foundation', 'global', 0)
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.state.players.p1.tableau[2].at(-1).cardId, 'd0:H:02');
  assert.equal(result.state.players.p1.tableau[2].at(-1).faceDown, false);
});

test('foundationMove builds the resolved suit lane in ascending order', () => {
  const current = controlledMatch((state, card) => {
    state.foundations[0].cards.push(card('d0:C:01', false));
    state.players.p1.waste.push(card('d0:C:02', false));
  });
  const result = applyAction(current, 'p1', action('foundationMove', {
    source: zone('waste', 'p1'),
    target: zone('foundation', 'global', 1)
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.resolvedFoundationIndex, 0);
  assert.deepEqual(result.state.foundations[0].cards.map((card) => card.rank), [1, 2]);
  assert.equal(result.state.players.p1.score, 3);
});

test('illegal foundation rank rejects without moving the card', () => {
  const current = controlledMatch((state, card) => {
    state.players.p1.waste.push(card('d0:C:02', false));
  });
  const result = applyAction(current, 'p1', action('foundationMove', {
    source: zone('waste', 'p1'),
    target: zone('foundation', 'global', 0)
  }));
  assert.equal(result.result, 'reject');
  assert.equal(result.code, 'RULE_VIOLATION');
  assert.equal(result.state.players.p1.waste.at(-1).cardId, 'd0:C:02');
});

test('resign finishes the match and rejects later actions', () => {
  const current = initMatch('SEED-RESIGN', 'split');
  const result = applyAction(current, 'p2', action('resign', {}));
  assert.equal(result.result, 'ack');
  assert.equal(result.rev, 1);
  assert.equal(result.state.status, 'finished');
  assert.equal(result.state.endedReason, 'resign');
  assert.equal(result.state.endedBy, 'p2');
  assert.equal(result.state.winner, 'p1');
  assert.equal(result.stateHash, stateHash(1, result.state));

  const rejected = applyAction(result, 'p1', action('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  }));
  assert.equal(rejected.result, 'reject');
  assert.equal(rejected.code, 'MATCH_FINISHED');
  assert.equal(rejected.rev, result.rev);
  assert.equal(rejected.stateHash, result.stateHash);
});

test('final player foundationMove completes the Race match with the finisher as winner', () => {
  const current = controlledMatch((state, card) => {
    for (const [foundationIndex, foundation] of state.foundations.entries()) {
      const copy = foundationIndex % 2;
      if (copy !== 0) continue;
      for (let rank = 1; rank <= 13; rank += 1) {
        if (foundation.suit === 'H' && rank === 13) continue;
        foundation.cards.push(card(`d${copy}:${foundation.suit}:${String(rank).padStart(2, '0')}`, false));
      }
    }
    state.players.p1.waste.push(card('d0:H:13', false));
  });
  const result = applyAction(current, 'p1', action('foundationMove', {
    source: zone('waste', 'p1'),
    target: zone('foundation', 'global', 4)
  }));
  assert.equal(result.result, 'ack');
  assert.equal(result.state.status, 'finished');
  assert.equal(result.state.winner, 'p1');
  assert.equal(result.state.endedReason, 'completed');
  assert.equal(result.state.endedBy, 'p1');
  assert.equal(result.state.players.p1.score, 364);

  const rejected = applyAction(result, 'p1', action('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  }));
  assert.equal(rejected.result, 'reject');
  assert.equal(rejected.code, 'MATCH_FINISHED');
});

test('invalid kinds and malformed actions have stable reject codes', () => {
  const current = initMatch('SEED-0006', 'shared');
  assert.equal(applyAction(current, 'p1', action('cheat', {})).code, 'INVALID_ACTION_KIND');
  assert.equal(applyAction(current, 'p1', { kind: 'draw' }).code, 'MALFORMED_MESSAGE');
  assert.equal(applyAction(current, 'spectator', action('draw', {})).code, 'MALFORMED_MESSAGE');
  assert.equal(applyAction(current, 'p1', action('draw', {
    source: { zone: 'stock' },
    target: zone('waste', 'p1')
  })).code, 'INVALID_SOURCE');
  assert.throws(
    () => applyAction(null, 'p1', action('draw', {})),
    (error) => error.code === 'INTERNAL_INVARIANT_BREACH'
  );
});

test('same state and action produce the same next state and hash', () => {
  const current = initMatch('SEED-0008', 'shared');
  const intent = action('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  });
  assert.deepEqual(applyAction(current, 'p1', intent), applyAction(current, 'p1', intent));
});

test('ownership violations reject without mutation or revision change', () => {
  const current = initMatch('SEED-0006', 'shared');
  const before = structuredClone(current);
  const result = applyAction(current, 'p1', action('draw', {
    source: zone('stock', 'p2'),
    target: zone('waste', 'p1')
  }));
  assert.equal(result.result, 'reject');
  assert.equal(result.code, 'OWNERSHIP_VIOLATION');
  assert.equal(result.rev, current.rev);
  assert.equal(result.stateHash, current.stateHash);
  assert.deepEqual(current, before);
});

test('invalid current hash triggers an AIRBAG snapshot', () => {
  const current = initMatch('SEED-0006', 'shared');
  current.stateHash = '0'.repeat(64);
  const result = applyAction(current, 'p1', action('draw', {
    source: zone('stock', 'p1'),
    target: zone('waste', 'p1')
  }));
  assert.equal(result.result, 'snapshot');
  assert.equal(result.reason, 'AIRBAG');
  assert.equal(result.code, 'INTERNAL_INVARIANT_BREACH');
  assert.ok(result.violations.some((violation) => violation.code === 'STATE_HASH_MISMATCH'));
});
