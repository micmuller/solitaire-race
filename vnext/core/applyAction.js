'use strict';

const { PLAYER_IDS } = require('./constants');
const { checkInvariants } = require('./invariants');
const { stateHash } = require('./canonical');

const ACTION_KINDS = Object.freeze([
  'draw',
  'recycle',
  'flip',
  'tableauMove',
  'foundationMove',
  'resign'
]);

const RED_SUITS = new Set(['D', 'H']);

function reject(current, code, details = {}) {
  return { result: 'reject', code, rev: current.rev, state: current.state, stateHash: current.stateHash, ...details };
}

function airbag(current, violations) {
  return {
    result: 'snapshot',
    reason: 'AIRBAG',
    code: 'INTERNAL_INVARIANT_BREACH',
    rev: current.rev,
    state: current.state,
    stateHash: current.stateHash,
    violations
  };
}

function validateCurrent(current) {
  if (!current || typeof current !== 'object' || !Number.isSafeInteger(current.rev) || current.rev < 0) {
    return [{ code: 'INVALID_MATCH_VALUE', path: '$', message: 'Invalid match revision' }];
  }
  const report = checkInvariants(current.state);
  if (!report.ok) return report.violations;
  if (current.stateHash !== stateHash(current.rev, current.state)) {
    return [{ code: 'STATE_HASH_MISMATCH', path: '$.stateHash', message: 'StateHash does not match rev and state' }];
  }
  return [];
}

function validZoneRef(ref, zone, owner, needsIndex = false) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false;
  if (ref.zone !== zone || ref.owner !== owner) return false;
  if (needsIndex) return Number.isInteger(ref.index);
  return ref.index === undefined;
}

function validTableauIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 7;
}

function validFoundationIndex(index) {
  return Number.isInteger(index) && index >= 0 && index < 8;
}

function ownershipViolation(ref, expectedOwner) {
  return ref
    && typeof ref === 'object'
    && Object.prototype.hasOwnProperty.call(ref, 'owner')
    && ref.owner !== expectedOwner;
}

function oppositeColor(first, second) {
  return RED_SUITS.has(first.suit) !== RED_SUITS.has(second.suit);
}

function validFaceUpSequence(cards) {
  if (cards.length === 0 || cards.some((card) => card.faceDown)) return false;
  for (let index = 1; index < cards.length; index += 1) {
    const below = cards[index - 1];
    const above = cards[index];
    if (below.rank !== above.rank + 1 || !oppositeColor(below, above)) return false;
  }
  return true;
}

function applyDraw(state, action) {
  const { playerId, payload } = action;
  if (ownershipViolation(payload.source, playerId) || ownershipViolation(payload.target, playerId)) return { code: 'OWNERSHIP_VIOLATION' };
  if (!validZoneRef(payload.source, 'stock', playerId)) return { code: 'INVALID_SOURCE' };
  if (!validZoneRef(payload.target, 'waste', playerId)) return { code: 'INVALID_TARGET' };
  const player = state.players[playerId];
  if (player.stock.length === 0) return { code: 'RULE_VIOLATION' };
  const card = player.stock.pop();
  player.waste.push({ ...card, faceDown: false });
  return {};
}

function applyRecycle(state, action) {
  const { playerId, payload } = action;
  if (ownershipViolation(payload.source, playerId) || ownershipViolation(payload.target, playerId)) return { code: 'OWNERSHIP_VIOLATION' };
  if (!validZoneRef(payload.source, 'waste', playerId)) return { code: 'INVALID_SOURCE' };
  if (!validZoneRef(payload.target, 'stock', playerId)) return { code: 'INVALID_TARGET' };
  const player = state.players[playerId];
  if (player.stock.length !== 0 || player.waste.length === 0) return { code: 'RULE_VIOLATION' };
  player.stock = player.waste.slice().reverse().map((card) => ({ ...card, faceDown: true }));
  player.waste = [];
  return {};
}

function applyFlip(state, action) {
  const { playerId, payload } = action;
  if (ownershipViolation(payload.source, playerId)) return { code: 'OWNERSHIP_VIOLATION' };
  if (!validZoneRef(payload.source, 'tableau', playerId, true) || !validTableauIndex(payload.source.index)) {
    return { code: 'INVALID_SOURCE' };
  }
  const stack = state.players[playerId].tableau[payload.source.index];
  if (stack.length === 0 || !stack.at(-1).faceDown) return { code: 'CARD_NOT_ACCESSIBLE' };
  stack[stack.length - 1] = { ...stack.at(-1), faceDown: false };
  return {};
}

function takeTableauCards(player, source, count) {
  if (source.zone === 'waste') {
    if (count !== 1 || player.waste.length === 0) return null;
    const card = player.waste.at(-1);
    return card.faceDown ? null : [card];
  }
  const stack = player.tableau[source.index];
  if (count > stack.length) return null;
  const cards = stack.slice(stack.length - count);
  return validFaceUpSequence(cards) ? cards : null;
}

function revealTableauTop(player, source) {
  if (source.zone !== 'tableau') return;
  const stack = player.tableau[source.index];
  if (stack.length > 0 && stack.at(-1).faceDown) {
    stack[stack.length - 1] = { ...stack.at(-1), faceDown: false };
  }
}

function applyTableauMove(state, action) {
  const { playerId, payload } = action;
  if (ownershipViolation(payload.source, playerId) || ownershipViolation(payload.target, playerId)) return { code: 'OWNERSHIP_VIOLATION' };
  const sourceValid = validZoneRef(payload.source, 'waste', playerId)
    || (validZoneRef(payload.source, 'tableau', playerId, true) && validTableauIndex(payload.source.index));
  if (!sourceValid) return { code: 'INVALID_SOURCE' };
  if (!validZoneRef(payload.target, 'tableau', playerId, true) || !validTableauIndex(payload.target.index)) {
    return { code: 'INVALID_TARGET' };
  }
  if (!Number.isInteger(payload.count) || payload.count < 1) return { code: 'MALFORMED_MESSAGE' };
  if (payload.source.zone === 'tableau' && payload.source.index === payload.target.index) {
    return { code: 'INVALID_TARGET' };
  }

  const player = state.players[playerId];
  const moving = takeTableauCards(player, payload.source, payload.count);
  if (!moving) return { code: 'CARD_NOT_ACCESSIBLE' };

  const destination = player.tableau[payload.target.index];
  const bottom = moving[0];
  if (destination.length === 0) {
    if (bottom.rank !== 13) return { code: 'RULE_VIOLATION' };
  } else {
    const target = destination.at(-1);
    if (target.faceDown || target.rank !== bottom.rank + 1 || !oppositeColor(target, bottom)) {
      return { code: 'RULE_VIOLATION' };
    }
  }

  if (payload.source.zone === 'waste') player.waste.pop();
  else player.tableau[payload.source.index].splice(-payload.count, payload.count);
  destination.push(...moving);
  revealTableauTop(player, payload.source);
  return {};
}

function resolveFoundationIndex(foundations, card) {
  const legal = [];
  for (let index = 0; index < foundations.length; index += 1) {
    const foundation = foundations[index];
    if (foundation.suit !== card.suit) continue;
    const topRank = foundation.cards.length === 0 ? 0 : foundation.cards.at(-1).rank;
    if (card.rank === topRank + 1) legal.push({ index, topRankAfter: card.rank });
  }
  legal.sort((a, b) => b.topRankAfter - a.topRankAfter || a.index - b.index);
  return legal.length === 0 ? null : legal[0].index;
}

function cardPointValue(card) {
  return card.rank;
}

function playerRemainingCardCount(player) {
  return player.stock.length
    + player.waste.length
    + player.tableau.reduce((total, stack) => total + stack.length, 0);
}

function finishCompletedMatch(state, playerId) {
  if (playerRemainingCardCount(state.players[playerId]) > 0) return;
  state.status = 'finished';
  state.winner = playerId;
  state.endedReason = 'completed';
  state.endedBy = playerId;
}

function applyFoundationMove(state, action) {
  const { playerId, payload } = action;
  if (ownershipViolation(payload.source, playerId) || ownershipViolation(payload.target, 'global')) return { code: 'OWNERSHIP_VIOLATION' };
  const sourceValid = validZoneRef(payload.source, 'waste', playerId)
    || (validZoneRef(payload.source, 'tableau', playerId, true) && validTableauIndex(payload.source.index));
  if (!sourceValid) return { code: 'INVALID_SOURCE' };
  if (!validZoneRef(payload.target, 'foundation', 'global', true) || !validFoundationIndex(payload.target.index)) {
    return { code: 'INVALID_TARGET' };
  }

  const player = state.players[playerId];
  const source = payload.source.zone === 'waste' ? player.waste : player.tableau[payload.source.index];
  if (source.length === 0 || source.at(-1).faceDown) return { code: 'CARD_NOT_ACCESSIBLE' };
  const card = source.at(-1);
  const resolvedFoundationIndex = resolveFoundationIndex(state.foundations, card);
  if (resolvedFoundationIndex === null) return { code: 'RULE_VIOLATION' };

  source.pop();
  state.foundations[resolvedFoundationIndex].cards.push({ ...card, faceDown: false });
  player.score += cardPointValue(card);
  revealTableauTop(player, payload.source);
  finishCompletedMatch(state, playerId);
  return { resolvedFoundationIndex };
}

function applyResign(state, action) {
  const { playerId } = action;
  const winner = playerId === 'p1' ? 'p2' : 'p1';
  state.status = 'finished';
  state.winner = winner;
  state.endedReason = 'resign';
  state.endedBy = playerId;
  return {};
}

function applyAction(current, actorId, action) {
  if (!current || typeof current !== 'object') {
    const error = new Error('Authoritative match value is required');
    error.code = 'INTERNAL_INVARIANT_BREACH';
    throw error;
  }
  const currentViolations = validateCurrent(current);
  if (currentViolations.length > 0) return airbag(current, currentViolations);

  if (!PLAYER_IDS.includes(actorId)) {
    return reject(current, 'MALFORMED_MESSAGE');
  }
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return reject(current, 'MALFORMED_MESSAGE');
  }
  if (!ACTION_KINDS.includes(action.kind)) return reject(current, 'INVALID_ACTION_KIND');
  if (!action.payload || typeof action.payload !== 'object' || Array.isArray(action.payload)) {
    return reject(current, 'MALFORMED_MESSAGE');
  }
  if (current.state.status === 'finished') return reject(current, 'MATCH_FINISHED');

  const trustedAction = { ...action, playerId: actorId };
  const candidate = structuredClone(current.state);
  let outcome;
  switch (action.kind) {
    case 'draw': outcome = applyDraw(candidate, trustedAction); break;
    case 'recycle': outcome = applyRecycle(candidate, trustedAction); break;
    case 'flip': outcome = applyFlip(candidate, trustedAction); break;
    case 'tableauMove': outcome = applyTableauMove(candidate, trustedAction); break;
    case 'foundationMove': outcome = applyFoundationMove(candidate, trustedAction); break;
    case 'resign': outcome = applyResign(candidate, trustedAction); break;
  }

  if (outcome.code) return reject(current, outcome.code);
  const invariantReport = checkInvariants(candidate);
  if (!invariantReport.ok) return airbag(current, invariantReport.violations);

  const rev = current.rev + 1;
  const next = {
    result: 'ack',
    rev,
    state: candidate,
    stateHash: stateHash(rev, candidate)
  };
  if (outcome.resolvedFoundationIndex !== undefined) {
    next.resolvedFoundationIndex = outcome.resolvedFoundationIndex;
  }
  return next;
}

module.exports = { ACTION_KINDS, applyAction, resolveFoundationIndex };
