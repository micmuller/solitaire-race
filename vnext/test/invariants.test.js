'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { assertInvariants, checkInvariants, initMatch } = require('../core');

function clone(value) {
  return structuredClone(value);
}

test('invariants detect missing cards', () => {
  const state = clone(initMatch('SEED-0002', 'split').state);
  state.players.p1.stock.pop();
  const report = checkInvariants(state);
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((violation) => violation.code === 'CARD_CONSERVATION'));
});

test('invariants detect duplicate cards', () => {
  const state = clone(initMatch('SEED-0002', 'shared').state);
  state.players.p1.stock[0] = { ...state.players.p1.stock[1] };
  const report = checkInvariants(state);
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((violation) => violation.code === 'DUPLICATE_CARD'));
});

test('invariants detect card metadata that disagrees with cardId', () => {
  const state = clone(initMatch('SEED-0002', 'split').state);
  const card = state.players.p1.stock[0];
  card.rank = card.rank === 13 ? 12 : 13;
  const report = checkInvariants(state);
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((violation) => violation.code === 'CARD_IDENTITY_MISMATCH'));
});

test('assertInvariants exposes the airbag reject code', () => {
  const state = clone(initMatch('SEED-0003', 'split').state);
  state.foundations.pop();
  assert.throws(
    () => assertInvariants(state),
    (error) => error.code === 'INTERNAL_INVARIANT_BREACH' && error.violations.length > 0
  );
});

test('invariants validate active and finished match result fields', () => {
  const active = clone(initMatch('SEED-STATUS', 'split').state);
  active.winner = 'p1';
  assert.ok(checkInvariants(active).violations.some((violation) => violation.code === 'INVALID_ACTIVE_MATCH_RESULT'));

  const finished = clone(initMatch('SEED-STATUS', 'split').state);
  finished.status = 'finished';
  finished.winner = 'p1';
  finished.endedReason = 'resign';
  finished.endedBy = 'p2';
  assert.deepEqual(checkInvariants(finished), { ok: true, violations: [] });
});

test('invariants reject player scores that drift from foundations', () => {
  const state = structuredClone(initMatch('SCORE-DRIFT', 'shared').state);
  state.players.p1.score = 1;
  const report = checkInvariants(state);
  assert.equal(report.ok, false);
  assert.ok(report.violations.some((violation) => violation.code === 'SCORE_MISMATCH'));
});
