export function wasteSelection(owner, cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const card = cards.at(-1);
  return {
    source: { zone: 'waste', owner },
    count: 1,
    cardIds: [card.cardId]
  };
}

export function tableauSelection(owner, index, cardIndex, cards) {
  if (!Array.isArray(cards) || !Number.isInteger(cardIndex) || cardIndex < 0 || cardIndex >= cards.length) return null;
  if (cards[cardIndex]?.faceDown) return null;
  const selected = cards.slice(cardIndex);
  return {
    source: { zone: 'tableau', owner, index },
    count: selected.length,
    cardIds: selected.map((card) => card.cardId)
  };
}

export function dragSelection(owner, source) {
  if (!source || typeof source !== 'object') return null;
  if (source.zone === 'waste') return wasteSelection(owner, source.cards);
  if (source.zone === 'tableau') return tableauSelection(owner, source.index, source.cardIndex, source.cards);
  return null;
}

export function tableauIntent(selection, owner, index) {
  if (!selection || !Number.isInteger(index)) return null;
  return {
    kind: 'tableauMove',
    payload: {
      source: selection.source,
      target: { zone: 'tableau', owner, index },
      count: selection.count
    }
  };
}

export function foundationIntent(selection, index) {
  if (!selection || !Number.isInteger(index)) return null;
  return {
    kind: 'foundationMove',
    payload: {
      source: selection.source,
      target: { zone: 'foundation', owner: 'global', index }
    }
  };
}

export function legalFoundationIndexForCard(foundations, card) {
  if (!Array.isArray(foundations) || !card || card.faceDown) return null;
  for (let index = 0; index < foundations.length; index += 1) {
    const foundation = foundations[index];
    if (!foundation || foundation.suit !== card.suit || !Array.isArray(foundation.cards)) continue;
    const topRank = foundation.cards.length === 0 ? 0 : foundation.cards.at(-1).rank;
    if (card.rank === topRank + 1) return index;
  }
  return null;
}

export function autoFoundationIntent(selection, foundations, card) {
  const index = legalFoundationIndexForCard(foundations, card);
  return index === null ? null : foundationIntent(selection, index);
}

export function dropIntent(selection, owner, target) {
  if (!target || typeof target !== 'object') return null;
  if (target.zone === 'tableau') return tableauIntent(selection, owner, target.index);
  if (target.zone === 'foundation') return foundationIntent(selection, target.index);
  return null;
}
