export class StockClickQueue {
  constructor(max = 8) {
    this.max = max;
    this.count = 0;
  }

  enqueue() {
    if (this.count >= this.max) return false;
    this.count += 1;
    return true;
  }

  take() {
    if (this.count === 0) return false;
    this.count -= 1;
    return true;
  }

  clear() { this.count = 0; }
}
