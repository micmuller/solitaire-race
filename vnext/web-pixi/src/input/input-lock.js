export class InputLock {
  constructor() { this.reasons = new Set(); }
  lock(reason) { this.reasons.add(reason); }
  unlock(reason) { this.reasons.delete(reason); }
  has(reason) { return this.reasons.has(reason); }
  only(reason) { return this.reasons.size === 1 && this.reasons.has(reason); }
  clear() { this.reasons.clear(); }
  get locked() { return this.reasons.size > 0; }
}
