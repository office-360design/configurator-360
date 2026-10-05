/** Synchronous, bounded snapshots for this editor; shared UI is not modified. */
export class PavingHistory {
  constructor({ capture, restore, limit = 60 }) {
    this.capture = capture; this.restore = restore; this.limit = limit;
    this.stack = []; this.future = []; this.restoring = false;
  }
  record(snapshot = this.capture()) {
    if (this.restoring) return false;
    this.future.length = 0;
    if (JSON.stringify(snapshot) === JSON.stringify(this.stack.at(-1))) return false;
    this.stack.push(structuredClone(snapshot));
    if (this.stack.length > this.limit) this.stack.shift();
    return true;
  }
  travel(from, to) {
    if (this.restoring || !from.length) return false;
    const current = this.capture(), next = from.at(-1);
    this.restoring = true;
    try {
      if (this.restore(structuredClone(next)) === false) return false;
      from.pop(); to.push(structuredClone(current)); return true;
    } finally { this.restoring = false; }
  }
  undo() { return this.travel(this.stack, this.future); }
  redo() { return this.travel(this.future, this.stack); }
  clear() { this.stack.length = this.future.length = 0; }
}
