'use strict';

const { createCardCatalog } = require('./cards');
const {
  FOUNDATION_SUITS,
  MODES,
  PLAYER_IDS,
  RULES_VERSION,
  SCHEMA_VERSION,
  TABLEAU_COUNT
} = require('./constants');
const { assertInvariants } = require('./invariants');
const { shuffle } = require('./random');
const { stateHash } = require('./canonical');

function dealKlondike(cards) {
  const tableau = [];
  let cursor = 0;

  for (let column = 0; column < TABLEAU_COUNT; column += 1) {
    const count = column + 1;
    const stack = cards.slice(cursor, cursor + count).map((card, index) => ({
      ...card,
      faceDown: index !== count - 1
    }));
    tableau.push(stack);
    cursor += count;
  }

  const stock = cards.slice(cursor).map((card) => ({ ...card, faceDown: true }));
  return { stock, waste: [], tableau };
}

function distributeCards(seed, mode) {
  const catalog = createCardCatalog();

  if (mode === 'split') {
    const decks = [catalog.slice(0, 52), catalog.slice(52)];
    return {
      p1: shuffle(decks[0], `${seed}::split::p1`),
      p2: shuffle(decks[1], `${seed}::split::p2`)
    };
  }

  const shared = shuffle(catalog, `${seed}::shared`);
  return {
    p1: shared.filter((_, index) => index % 2 === 0),
    p2: shared.filter((_, index) => index % 2 === 1)
  };
}

function initMatch(seed, mode) {
  if (typeof seed !== 'string' || seed.length === 0) {
    throw new TypeError('Seed must be a non-empty string');
  }
  if (!MODES.includes(mode)) {
    throw new TypeError(`Mode must be one of: ${MODES.join(', ')}`);
  }

  const distributed = distributeCards(seed, mode);
  const state = {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    seed,
    mode,
    status: 'active',
    winner: null,
    endedReason: null,
    endedBy: null,
    players: Object.fromEntries(PLAYER_IDS.map((playerId) => [playerId, {
      ...dealKlondike(distributed[playerId]),
      score: 0
    }])),
    foundations: FOUNDATION_SUITS.map((suit) => ({ suit, cards: [] }))
  };

  assertInvariants(state);

  const rev = 0;
  return { rev, state, stateHash: stateHash(rev, state) };
}

module.exports = { dealKlondike, initMatch };
