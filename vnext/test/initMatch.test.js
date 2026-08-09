'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { checkInvariants, initMatch, stateHash } = require('../core');

function allCards(state) {
  const cards = [];
  for (const player of Object.values(state.players)) {
    cards.push(...player.stock, ...player.waste, ...player.tableau.flat());
  }
  for (const foundation of state.foundations) cards.push(...foundation.cards);
  return cards;
}

for (const mode of ['split', 'shared']) {
  test(`initMatch is deterministic and valid in ${mode} mode`, () => {
    const first = initMatch('SEED-0001', mode);
    const second = initMatch('SEED-0001', mode);

    assert.deepEqual(first, second);
    assert.equal(first.rev, 0);
    assert.equal(first.state.status, 'active');
    assert.equal(first.state.winner, null);
    assert.equal(first.state.endedReason, null);
    assert.equal(first.state.endedBy, null);
    assert.equal(first.stateHash, stateHash(first.rev, first.state));
    assert.deepEqual(checkInvariants(first.state), { ok: true, violations: [] });
    assert.equal(allCards(first.state).length, 104);

    for (const player of Object.values(first.state.players)) {
      assert.equal(player.tableau.length, 7);
      assert.deepEqual(player.tableau.map((stack) => stack.length), [1, 2, 3, 4, 5, 6, 7]);
      assert.equal(player.stock.length, 24);
      assert.equal(player.waste.length, 0);
      for (const stack of player.tableau) {
        assert.equal(stack.at(-1).faceDown, false);
        assert.ok(stack.slice(0, -1).every((card) => card.faceDown));
      }
    }
  });
}

test('golden seed start hashes remain stable', () => {
  assert.equal(
    initMatch('SEED-0001', 'split').stateHash,
    'aba5f1244ad285f849bf72edc118d44805ab67415937cd7cf07cf67cba4c4683'
  );
  assert.equal(
    initMatch('SEED-0001', 'shared').stateHash,
    '4e2c55bcbd0972e8f11b0cdb59a38a7249d078c1d7879194fba2750231413d0f'
  );
});

test('split assigns one deck copy to each player', () => {
  const { state } = initMatch('SEED-0007', 'split');
  const p1Ids = allCards({ ...state, players: { p1: state.players.p1 }, foundations: [] }).map((card) => card.cardId);
  const p2Ids = allCards({ ...state, players: { p2: state.players.p2 }, foundations: [] }).map((card) => card.cardId);
  assert.ok(p1Ids.every((id) => id.startsWith('d0:')));
  assert.ok(p2Ids.every((id) => id.startsWith('d1:')));
});

test('shared alternates one shuffled double deck across both players', () => {
  const { state } = initMatch('SEED-0007', 'shared');
  const p1Ids = [...state.players.p1.tableau.flat(), ...state.players.p1.stock].map((card) => card.cardId);
  const p2Ids = [...state.players.p2.tableau.flat(), ...state.players.p2.stock].map((card) => card.cardId);
  assert.equal(p1Ids.length, 52);
  assert.equal(p2Ids.length, 52);
  assert.ok(p1Ids.some((id) => id.startsWith('d0:')) && p1Ids.some((id) => id.startsWith('d1:')));
  assert.ok(p2Ids.some((id) => id.startsWith('d0:')) && p2Ids.some((id) => id.startsWith('d1:')));
});

test('invalid setup inputs are rejected', () => {
  assert.throws(() => initMatch('', 'split'), /non-empty string/);
  assert.throws(() => initMatch('SEED-0001', 'unknown'), /Mode must be one of/);
});
