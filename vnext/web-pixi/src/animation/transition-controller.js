export class TransitionController {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.active = new Map();
    this.generation = 0;
  }

  move(id, from, to, duration, onUpdate, onDone) {
    this.active.set(id, { id, from, to, duration: Math.max(0, duration), start: this.now(), onUpdate, onDone, generation: this.generation });
  }

  tick(time = this.now()) {
    for (const [id, item] of this.active) {
      if (item.generation !== this.generation) { this.active.delete(id); continue; }
      const linear = item.duration === 0 ? 1 : Math.min(1, (time - item.start) / item.duration);
      const eased = 1 - Math.pow(1 - linear, 3);
      item.onUpdate({ x: item.from.x + (item.to.x - item.from.x) * eased, y: item.from.y + (item.to.y - item.from.y) * eased, progress: linear });
      if (linear >= 1) { this.active.delete(id); item.onDone?.(); }
    }
  }

  cancelAndSnap(snap) {
    this.generation += 1;
    this.active.clear();
    snap?.();
  }

  get size() { return this.active.size; }
}
