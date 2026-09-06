'use strict';

const { PLAYER_IDS } = require('./constants');
const { assertInvariants } = require('./invariants');
const { stateHash } = require('./canonical');

function expireForInactivity(current, playerId) {
  if (!current || current.state?.status !== 'active' || !PLAYER_IDS.includes(playerId)) {
    throw new TypeError('Active match and playerId are required');
  }
  const state = structuredClone(current.state);
  state.status = 'finished';
  state.winner = playerId === 'p1' ? 'p2' : 'p1';
  state.endedReason = 'inactivity';
  state.endedBy = playerId;
  assertInvariants(state);
  const rev = current.rev + 1;
  return { result: 'ack', rev, state, stateHash: stateHash(rev, state) };
}

module.exports = { expireForInactivity };
