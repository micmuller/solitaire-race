'use strict';

const crypto = require('node:crypto');

const RED_SUITS = new Set(['D', 'H']);

function zone(zoneName, owner, index) {
  const ref = { zone: zoneName, owner };
  if (index !== undefined) ref.index = index;
  return ref;
}

function action(kind, payload) {
  return { kind, payload };
}

function topFaceUp(cards) {
  return cards.length > 0 && !cards.at(-1).faceDown;
}

function faceUpSuffixStarts(cards) {
  const starts = [];
  for (let index = 0; index < cards.length; index += 1) {
    if (!cards[index].faceDown) starts.push(index);
  }
  return starts;
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

function canMoveToFoundation(card, foundations) {
  return foundations.some((foundation) => {
    if (foundation.suit !== card.suit) return false;
    const topRank = foundation.cards.length === 0 ? 0 : foundation.cards.at(-1).rank;
    return card.rank === topRank + 1;
  });
}

function canMoveToTableau(cards, target) {
  if (!validFaceUpSequence(cards)) return false;
  const bottom = cards[0];
  if (target.length === 0) return bottom.rank === 13;
  const targetTop = target.at(-1);
  return !targetTop.faceDown && targetTop.rank === bottom.rank + 1 && oppositeColor(targetTop, bottom);
}

function stableTieKey(seed, botId, rev, index) {
  return crypto
    .createHash('sha256')
    .update(`${seed}|${botId}|${rev}|${index}`)
    .digest('hex');
}

function orderedCandidates(candidates, { seed, botId, rev }) {
  return candidates
    .map((candidate, index) => ({ ...candidate, tieKey: stableTieKey(seed, botId, rev, index) }))
    .sort((a, b) => a.priority - b.priority || a.tieKey.localeCompare(b.tieKey) || a.index - b.index)
    .map(({ priority, index, tieKey, ...candidate }) => candidate);
}

function candidateSignature(candidate) {
  return JSON.stringify(candidate);
}

function generateActionCandidates(current, botId) {
  const { state, rev } = current;
  if (state.status === 'finished') return [];
  const player = state.players[botId];
  if (!player) return [];
  const candidates = [];
  let index = 0;
  const add = (priority, candidate) => {
    candidates.push({ priority, index, ...candidate });
    index += 1;
  };

  const foundationTarget = zone('foundation', 'global', 0);
  if (topFaceUp(player.waste) && canMoveToFoundation(player.waste.at(-1), state.foundations)) {
    add(1, action('foundationMove', {
      source: zone('waste', botId),
      target: foundationTarget
    }));
  }
  player.tableau.forEach((cards, tableauIndex) => {
    if (!topFaceUp(cards)) return;
    if (!canMoveToFoundation(cards.at(-1), state.foundations)) return;
    add(1, action('foundationMove', {
      source: zone('tableau', botId, tableauIndex),
      target: foundationTarget
    }));
  });

  if (topFaceUp(player.waste)) {
    player.tableau.forEach((_, targetIndex) => {
      if (!canMoveToTableau([player.waste.at(-1)], player.tableau[targetIndex])) return;
      add(2, action('tableauMove', {
        source: zone('waste', botId),
        target: zone('tableau', botId, targetIndex),
        count: 1
      }));
    });
  }

  player.tableau.forEach((cards, sourceIndex) => {
    for (const start of faceUpSuffixStarts(cards)) {
      const count = cards.length - start;
      const moving = cards.slice(start);
      player.tableau.forEach((_, targetIndex) => {
        if (targetIndex === sourceIndex) return;
        if (!canMoveToTableau(moving, player.tableau[targetIndex])) return;
        add(3, action('tableauMove', {
          source: zone('tableau', botId, sourceIndex),
          target: zone('tableau', botId, targetIndex),
          count
        }));
      });
    }
  });

  player.tableau.forEach((cards, tableauIndex) => {
    if (cards.length > 0 && cards.at(-1).faceDown) {
      add(4, action('flip', { source: zone('tableau', botId, tableauIndex) }));
    }
  });

  if (player.stock.length > 0) {
    add(5, action('draw', {
      source: zone('stock', botId),
      target: zone('waste', botId)
    }));
  } else if (player.waste.length > 0) {
    add(5, action('recycle', {
      source: zone('waste', botId),
      target: zone('stock', botId)
    }));
  }

  return orderedCandidates(candidates, { seed: state.seed, botId, rev });
}

module.exports = { candidateSignature, generateActionCandidates };
