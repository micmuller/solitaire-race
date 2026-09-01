export class RetainedCardStore {
  constructor() { this.items = new Map(); }
  getOrCreate(cardId, create) {
    if (!this.items.has(cardId)) this.items.set(cardId, create(cardId));
    return this.items.get(cardId);
  }
  prune(seen, remove = () => {}) {
    for (const [cardId, item] of this.items) {
      if (seen.has(cardId)) continue;
      remove(item, cardId); this.items.delete(cardId);
    }
  }
}
