'use strict';

const MODES = Object.freeze(['split', 'shared']);
const PLAYER_IDS = Object.freeze(['p1', 'p2']);
const SUITS = Object.freeze(['C', 'D', 'H', 'S']);
const FOUNDATION_SUITS = Object.freeze(SUITS.flatMap((suit) => [suit, suit]));

const CARD_COUNT = 104;
const CARDS_PER_PLAYER = 52;
const TABLEAU_COUNT = 7;
const TABLEAU_CARD_COUNT = 28;
const STOCK_CARD_COUNT = 24;
const SCHEMA_VERSION = '1.1.0';
const RULES_VERSION = 'vNext-1.0';

module.exports = {
  CARD_COUNT,
  CARDS_PER_PLAYER,
  FOUNDATION_SUITS,
  MODES,
  PLAYER_IDS,
  RULES_VERSION,
  SCHEMA_VERSION,
  STOCK_CARD_COUNT,
  SUITS,
  TABLEAU_CARD_COUNT,
  TABLEAU_COUNT
};
