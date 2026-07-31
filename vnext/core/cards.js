'use strict';

const { CARD_COUNT, SUITS } = require('./constants');

function cardId(deckCopy, suit, rank) {
  return `d${deckCopy}:${suit}:${String(rank).padStart(2, '0')}`;
}

function createCardCatalog() {
  const cards = [];

  for (let deckCopy = 0; deckCopy < 2; deckCopy += 1) {
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank += 1) {
        cards.push(Object.freeze({
          cardId: cardId(deckCopy, suit, rank),
          suit,
          rank,
          faceDown: true
        }));
      }
    }
  }

  if (cards.length !== CARD_COUNT) {
    throw new Error(`Card catalog must contain ${CARD_COUNT} cards`);
  }

  return cards;
}

module.exports = { cardId, createCardCatalog };
