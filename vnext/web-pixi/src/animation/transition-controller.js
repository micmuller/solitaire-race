export class TransitionController {
  constructor({ now = () => performance.now() } = {}) {
    this.now = now;
    this.active = new Map();
    this.generation = 0;
  }

  move(id, from, to, duration, onUpdate, onDone) {
    this.tween(id, duration, ({ progress, eased }) => onUpdate({
      x: from.x + (to.x - from.x) * eased,
      y: from.y + (to.y - from.y) * eased,
      progress,
      eased
    }), onDone);
  }

  tween(id, duration, onUpdate, onDone) {
    this.active.set(id, { id, duration: Math.max(0, duration), start: this.now(), onUpdate, onDone, generation: this.generation });
  }

  tick(time = this.now()) {
    for (const [id, item] of this.active) {
      if (item.generation !== this.generation) { this.active.delete(id); continue; }
      const linear = item.duration === 0 ? 1 : Math.min(1, (time - item.start) / item.duration);
      const eased = 1 - Math.pow(1 - linear, 3);
      item.onUpdate({ progress: linear, eased });
      if (linear >= 1) { this.active.delete(id); item.onDone?.(); }
    }
  }

  cancel(id) { this.active.delete(id); }

  has(id) { return this.active.has(id); }

  cancelAndSnap(snap) {
    this.generation += 1;
    this.active.clear();
    snap?.();
  }

  get size() { return this.active.size; }
}
