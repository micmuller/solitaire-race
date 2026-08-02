'use strict';

const {
  CARD_COUNT,
  FOUNDATION_SUITS,
  MODES,
  PLAYER_IDS,
  RULES_VERSION,
  SCHEMA_VERSION,
  SUITS,
  TABLEAU_COUNT
} = require('./constants');
const { createCardCatalog } = require('./cards');

const EXPECTED_CARDS = new Map(createCardCatalog().map((card) => [card.cardId, card]));
const RED_SUITS = new Set(['D', 'H']);

function oppositeColor(first, second) {
  return RED_SUITS.has(first.suit) !== RED_SUITS.has(second.suit);
}

function validateCard(card, path, violations, seen) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) {
    violations.push({ code: 'INVALID_CARD', path, message: 'Card must be an object' });
    return;
  }

  const expectedCard = EXPECTED_CARDS.get(card.cardId);
  if (!expectedCard) {
    violations.push({ code: 'INVALID_CARD_ID', path, message: `Unexpected cardId ${card.cardId}` });
  } else if (seen.has(card.cardId)) {
    violations.push({ code: 'DUPLICATE_CARD', path, message: `Duplicate cardId ${card.cardId}` });
  } else {
    seen.add(card.cardId);
  }

  if (!SUITS.includes(card.suit)) {
    violations.push({ code: 'INVALID_SUIT', path, message: `Invalid suit ${card.suit}` });
  } else if (expectedCard && card.suit !== expectedCard.suit) {
    violations.push({ code: 'CARD_IDENTITY_MISMATCH', path, message: `cardId ${card.cardId} does not match suit ${card.suit}` });
  }
  if (!Number.isInteger(card.rank) || card.rank < 1 || card.rank > 13) {
    violations.push({ code: 'INVALID_RANK', path, message: `Invalid rank ${card.rank}` });
  } else if (expectedCard && card.rank !== expectedCard.rank) {
    violations.push({ code: 'CARD_IDENTITY_MISMATCH', path, message: `cardId ${card.cardId} does not match rank ${card.rank}` });
  }
  if (typeof card.faceDown !== 'boolean') {
    violations.push({ code: 'INVALID_FACE_STATE', path, message: 'faceDown must be boolean' });
  }
}

function validateStack(stack, path, violations, seen) {
  if (!Array.isArray(stack)) {
    violations.push({ code: 'INVALID_STACK', path, message: 'Stack must be an array' });
    return;
  }
  stack.forEach((card, index) => validateCard(card, `${path}[${index}]`, violations, seen));
}

function validateTableauStack(stack, path, violations, seen) {
  validateStack(stack, path, violations, seen);
  if (!Array.isArray(stack)) return;

  let faceUpStarted = false;
  for (let index = 0; index < stack.length; index += 1) {
    const card = stack[index];
    if (!card || typeof card !== 'object') continue;
    if (!card.faceDown) faceUpStarted = true;
    else if (faceUpStarted) {
      violations.push({ code: 'INVALID_TABLEAU_VISIBILITY', path: `${path}[${index}]`, message: 'Face-down card above face-up card' });
    }
    const below = index > 0 ? stack[index - 1] : null;
    if (below && typeof below === 'object' && !card.faceDown && !below.faceDown) {
      if (below.rank !== card.rank + 1 || !oppositeColor(below, card)) {
        violations.push({ code: 'INVALID_TABLEAU_SEQUENCE', path: `${path}[${index}]`, message: 'Face-up tableau sequence must descend with alternating colors' });
      }
    }
  }
}

function checkInvariants(state) {
  const violations = [];
  const seen = new Set();

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {
      ok: false,
      violations: [{ code: 'INVALID_STATE', path: '$', message: 'State must be an object' }]
    };
  }

  if (state.schemaVersion !== SCHEMA_VERSION) {
    violations.push({ code: 'INVALID_SCHEMA_VERSION', path: '$.schemaVersion', message: 'Unexpected schemaVersion' });
  }
  if (state.rulesVersion !== RULES_VERSION) {
    violations.push({ code: 'INVALID_RULES_VERSION', path: '$.rulesVersion', message: 'Unexpected rulesVersion' });
  }
  if (typeof state.seed !== 'string') {
    violations.push({ code: 'INVALID_SEED', path: '$.seed', message: 'Seed must be a string' });
  }
  if (!MODES.includes(state.mode)) {
    violations.push({ code: 'INVALID_MODE', path: '$.mode', message: 'Mode must be split or shared' });
  }
  if (!['active', 'finished'].includes(state.status)) {
    violations.push({ code: 'INVALID_MATCH_STATUS', path: '$.status', message: 'Status must be active or finished' });
  }
  if (state.winner !== null && !PLAYER_IDS.includes(state.winner)) {
    violations.push({ code: 'INVALID_MATCH_WINNER', path: '$.winner', message: 'Winner must be p1, p2 or null' });
  }
  if (state.endedReason !== null && state.endedReason !== 'resign') {
    violations.push({ code: 'INVALID_ENDED_REASON', path: '$.endedReason', message: 'Ended reason must be resign or null' });
  }
  if (state.endedBy !== null && !PLAYER_IDS.includes(state.endedBy)) {
    violations.push({ code: 'INVALID_ENDED_BY', path: '$.endedBy', message: 'EndedBy must be p1, p2 or null' });
  }
  if (state.status === 'active' && (state.winner !== null || state.endedReason !== null || state.endedBy !== null)) {
    violations.push({ code: 'INVALID_ACTIVE_MATCH_RESULT', path: '$', message: 'Active matches cannot have result fields' });
  }
  if (state.status === 'finished' && (!PLAYER_IDS.includes(state.winner) || state.endedReason === null || state.endedBy === null)) {
    violations.push({ code: 'INVALID_FINISHED_MATCH_RESULT', path: '$', message: 'Finished matches require winner, endedReason and endedBy' });
  }

  for (const playerId of PLAYER_IDS) {
    const player = state.players && state.players[playerId];
    const path = `$.players.${playerId}`;
    if (!player || typeof player !== 'object' || Array.isArray(player)) {
      violations.push({ code: 'INVALID_PLAYER_ZONE', path, message: 'Player zone must be an object' });
      continue;
    }

    validateStack(player.stock, `${path}.stock`, violations, seen);
    if (Array.isArray(player.stock) && player.stock.some((card) => card && card.faceDown !== true)) {
      violations.push({ code: 'INVALID_STOCK_VISIBILITY', path: `${path}.stock`, message: 'Stock cards must be face-down' });
    }
    validateStack(player.waste, `${path}.waste`, violations, seen);
    if (Array.isArray(player.waste) && player.waste.some((card) => card && card.faceDown !== false)) {
      violations.push({ code: 'INVALID_WASTE_VISIBILITY', path: `${path}.waste`, message: 'Waste cards must be face-up' });
    }
    if (!Array.isArray(player.tableau) || player.tableau.length !== TABLEAU_COUNT) {
      violations.push({ code: 'INVALID_TABLEAU', path: `${path}.tableau`, message: `Tableau must contain ${TABLEAU_COUNT} stacks` });
    } else {
      player.tableau.forEach((stack, index) => validateTableauStack(stack, `${path}.tableau[${index}]`, violations, seen));
    }
  }

  if (!Array.isArray(state.foundations) || state.foundations.length !== FOUNDATION_SUITS.length) {
    violations.push({ code: 'INVALID_FOUNDATIONS', path: '$.foundations', message: 'Foundations must contain 8 stacks' });
  } else {
    state.foundations.forEach((foundation, index) => {
      const path = `$.foundations[${index}]`;
      if (!foundation || foundation.suit !== FOUNDATION_SUITS[index]) {
        violations.push({ code: 'INVALID_FOUNDATION_SUIT', path, message: `Expected suit ${FOUNDATION_SUITS[index]}` });
        return;
      }
      validateStack(foundation.cards, `${path}.cards`, violations, seen);
      if (Array.isArray(foundation.cards)) {
        foundation.cards.forEach((card, cardIndex) => {
          if (!card || typeof card !== 'object') return;
          if (card.suit !== foundation.suit || card.rank !== cardIndex + 1 || card.faceDown !== false) {
            violations.push({ code: 'INVALID_FOUNDATION_SEQUENCE', path: `${path}.cards[${cardIndex}]`, message: 'Foundation must be face-up and ascend from Ace in its suit' });
          }
        });
      }
    });
  }

  if (seen.size !== CARD_COUNT) {
    violations.push({ code: 'CARD_CONSERVATION', path: '$', message: `Expected ${CARD_COUNT} unique cards, found ${seen.size}` });
  }

  return { ok: violations.length === 0, violations };
}

function assertInvariants(state) {
  const report = checkInvariants(state);
  if (!report.ok) {
    const error = new Error(`State invariant violation: ${report.violations[0].code}`);
    error.code = 'INTERNAL_INVARIANT_BREACH';
    error.violations = report.violations;
    throw error;
  }
  return state;
}

module.exports = { assertInvariants, checkInvariants };
