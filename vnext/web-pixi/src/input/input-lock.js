export class InputLock {
  constructor() { this.reasons = new Set(); }
  lock(reason) { this.reasons.add(reason); }
  unlock(reason) { this.reasons.delete(reason); }
  clear() { this.reasons.clear(); }
  get locked() { return this.reasons.size > 0; }
}
