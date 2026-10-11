function stableSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export class SharedUndoManager {
  constructor({ capture, restore, limit = 60 } = {}) {
    this.capture = capture;
    this.restore = restore;
    this.limit = Math.max(1, Number(limit) || 60);
    this.stack = [];
    this.restoring = false;
    this.boundSources = [];
  }

  record() {
    if (this.restoring || typeof this.capture !== 'function') return false;
    const snapshot = this.capture();
    if (snapshot === null || snapshot === undefined) return false;
    const serialized = stableSerialize(snapshot);
    const previousSerialized = this.stack.length ? stableSerialize(this.stack[this.stack.length - 1]) : '';
    if (!serialized || serialized === previousSerialized) return false;
    this.stack.push(snapshot);
    if (this.stack.length > this.limit) this.stack.shift();
    return true;
  }

  async undo() {
    if (this.restoring || this.stack.length === 0 || typeof this.restore !== 'function') return false;
    const snapshot = this.stack.pop();
    this.restoring = true;
    try {
      await this.restore(snapshot);
      return true;
    } finally {
      this.restoring = false;
    }
  }

  clear() {
    this.stack.length = 0;
  }

  bindSource(root, { selector = 'button, input, select, textarea, summary, label' } = {}) {
    if (!root) return () => {};
    let focusedEditor = null;

    const recordFromPointer = (event) => {
      if (event.target.closest(selector)) this.record();
    };
    const recordFromKey = (event) => {
      const target = event.target.closest(selector);
      if (!target) return;
      if (event.key === 'Tab' || event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta') return;
      if (focusedEditor !== target) {
        focusedEditor = target;
        this.record();
      }
    };
    const releaseEditor = () => { focusedEditor = null; };

    root.addEventListener('pointerdown', recordFromPointer, true);
    root.addEventListener('keydown', recordFromKey, true);
    root.addEventListener('focusout', releaseEditor, true);

    const unbind = () => {
      root.removeEventListener('pointerdown', recordFromPointer, true);
      root.removeEventListener('keydown', recordFromKey, true);
      root.removeEventListener('focusout', releaseEditor, true);
    };
    this.boundSources.push(unbind);
    return unbind;
  }

  destroy() {
    this.boundSources.splice(0).forEach((unbind) => unbind());
    this.clear();
  }
}
