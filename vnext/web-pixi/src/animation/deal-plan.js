// Presentation only: consume placements, never generate or change game cards.
export function dealPlan(placements, origins) {
  const cards = placements.filter(p => p.zone === 'tableau');
  const result = [];
  for (const owner of Object.keys(origins)) {
    const hand = cards.filter(p => p.owner === owner)
      .sort((a, b) => a.cardIndex - b.cardIndex || a.pileIndex - b.pileIndex);
    hand.forEach((placement, index) => result.push({ placement, origin: origins[owner], delay: index * 42, duration: 300 }));
  }
  return result;
}

export function dealFrame(elapsed, delay, duration) {
  const progress = Math.max(0, Math.min(1, (elapsed - delay) / duration));
  return { progress, eased: 1 - (1 - progress) ** 3, started: elapsed >= delay };
}
