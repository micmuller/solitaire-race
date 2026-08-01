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
  const selected = cards.slice(cardIndex);
  return {
    source: { zone: 'tableau', owner, index },
    count: selected.length,
    cardIds: selected.map((card) => card.cardId)
  };
}

export function tableauIntent(selection, owner, index) {
  if (!selection) return null;
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
  if (!selection) return null;
  return {
    kind: 'foundationMove',
    payload: {
      source: selection.source,
      target: { zone: 'foundation', owner: 'global', index }
    }
  };
}
