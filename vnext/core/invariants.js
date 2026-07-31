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

  for (const playerId of PLAYER_IDS) {
    const player = state.players && state.players[playerId];
    const path = `$.players.${playerId}`;
    if (!player || typeof player !== 'object' || Array.isArray(player)) {
      violations.push({ code: 'INVALID_PLAYER_ZONE', path, message: 'Player zone must be an object' });
      continue;
    }

    validateStack(player.stock, `${path}.stock`, violations, seen);
    validateStack(player.waste, `${path}.waste`, violations, seen);
    if (!Array.isArray(player.tableau) || player.tableau.length !== TABLEAU_COUNT) {
      violations.push({ code: 'INVALID_TABLEAU', path: `${path}.tableau`, message: `Tableau must contain ${TABLEAU_COUNT} stacks` });
    } else {
      player.tableau.forEach((stack, index) => validateStack(stack, `${path}.tableau[${index}]`, violations, seen));
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
