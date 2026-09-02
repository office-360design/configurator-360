export const MAP_STARTUP_TIMEOUT_MS = 15_000;

export function mapErrorFrom(value) {
  const candidate = value?.error ?? value;
  if (candidate instanceof Error) return candidate;

  const message = typeof candidate === 'string'
    ? candidate
    : candidate?.message;
  return new Error(message || 'Map initialization failed.');
}

export function createMapStartupGuard({
  onTimeout,
  timeoutMs = MAP_STARTUP_TIMEOUT_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  if (typeof onTimeout !== 'function') {
    throw new TypeError('A map startup timeout handler is required.');
  }

  let active = true;
  let lastError = null;
  const timerId = setTimer(() => {
    if (!active) return;
    onTimeout(lastError || new Error('The map style did not finish loading in time.'));
  }, timeoutMs);

  return {
    noteError(value) {
      if (active) lastError = mapErrorFrom(value);
    },
    complete() {
      if (!active) return false;
      active = false;
      clearTimer(timerId);
      return true;
    },
    cancel() {
      if (!active) return;
      active = false;
      clearTimer(timerId);
    },
  };
}
