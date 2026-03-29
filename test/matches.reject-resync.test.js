const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMatchForClient,
  setAuthoritativeState,
  getSnapshot,
  validateAndApplyMove,
  validateMove,
  getLastInvariant
} = require('../matches');

function card(id, suit, rank, up = true) {
  return { id, suit, rank, up };
}

test('reject does not mutate authoritative state; next legal waste->foundation move stays consistent', () => {
  const ws = { __cid: 'c-test-1' };
  const match = createMatchForClient(ws, 'Tester', new Set());
  const matchId = match.matchId;

  const heartsAce = card('Y-0-♥-0', '♥', 0, true);
  const heartsTwo = card('Y-1-♥-1', '♥', 1, true);
  const clubsSix = card('Y-2-♣-5', '♣', 5, true);
  const spadesTen = card('Y-3-♠-9', '♠', 9, true);

  setAuthoritativeState(matchId, {
    owner: 'Y',
    expectedTotalCards: 4,
    foundations: [
      { suit: '♠', cards: [] },
      { suit: '♥', cards: [heartsAce] },
      { suit: '♦', cards: [] },
      { suit: '♣', cards: [] },
      { suit: '♠', cards: [] },
      { suit: '♥', cards: [] },
      { suit: '♦', cards: [] },
      { suit: '♣', cards: [] }
    ],
    you: {
      tableau: [[spadesTen], [], [], [], [], [], []],
      stock: [],
      waste: [clubsSix, heartsTwo]
    },
    opp: {
      tableau: [[], [], [], [], [], [], []],
      stock: [],
      waste: []
    }
  }, { seed: 'test-seed', fromCid: 'srv' });

  const before = JSON.stringify(getSnapshot(matchId).state);

  const invalidMove = {
    owner: 'Y',
    kind: 'toFound',
    cardId: 'Y-3-♠-9',
    count: 1,
    fromZone: 'tableau',
    fromIndex: 0,
    toSuit: 'H'
  };

  const invalidGate = validateAndApplyMove(matchId, invalidMove, 'ios', { fromCid: 'c-test-1' });
  assert.equal(invalidGate.ok, false);
  assert.equal(invalidGate.rejected, true);
  assert.ok(validateMove(matchId, invalidMove, 'ios').reason);
  assert.equal(JSON.stringify(getSnapshot(matchId).state), before, 'reject must not mutate authoritative snapshot');

  const legalMove = {
    owner: 'Y',
    kind: 'toFound',
    cardId: 'Y-1-♥-1',
    count: 1,
    fromZone: 'waste',
    toSuit: 'H'
  };

  const legalGate = validateAndApplyMove(matchId, legalMove, 'ios', { fromCid: 'c-test-1' });
  assert.equal(legalGate.ok, true);

  const after = getSnapshot(matchId).state;
  assert.deepEqual(after.you.waste.map(c => c.id), ['Y-2-♣-5']);
  assert.deepEqual(after.foundations[1].cards.map(c => c.id), ['Y-0-♥-0', 'Y-1-♥-1']);

  const invariant = getLastInvariant(matchId);
  assert.equal(invariant.ok, true);
});
