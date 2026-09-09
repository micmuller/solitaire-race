// Static, non-playable art fixture. Not a deal algorithm or game-rule source.
const player = owner => {
  const cards = Array.from({ length: 52 }, (_, i) => ({
    cardId: `preview:${owner}:${i}`, suit: ['C', 'D', 'H', 'S'][Math.floor(i / 13)],
    rank: i % 13 + 1, faceDown: true
  }));
  let offset = 0;
  const tableau = Array.from({ length: 7 }, (_, column) => {
    const pile = cards.slice(offset, offset += column + 1);
    pile.at(-1).faceDown = false;
    return pile;
  });
  return { stock: cards.slice(28), waste: [], tableau, score: 0 };
};
export const DEAL_PREVIEW = {
  rev: 0, stateHash: 'non-playable-deal-preview', state: {
    schemaVersion: '1.4.0', rulesVersion: '1.0.0', seed: 'VISUAL-PREVIEW', mode: 'split',
    status: 'active', winner: null, endedReason: null, endedBy: null,
    players: { p1: player('p1'), p2: player('p2') },
    foundations: ['C','C','D','D','H','H','S','S'].map(suit => ({ suit, cards: [] }))
  }
};
