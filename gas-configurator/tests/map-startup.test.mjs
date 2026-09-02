import assert from 'node:assert/strict';
import test from 'node:test';
import { createMapStartupGuard, mapErrorFrom } from '../src/map/startupGuard.js';

function fakeTimers() {
  let callback = null;
  const cleared = [];
  return {
    cleared,
    run() {
      callback?.();
    },
    setTimer(next) {
      callback = next;
      return 42;
    },
    clearTimer(id) {
      cleared.push(id);
    },
  };
}

test('resource errors do not fail map startup before the timeout', () => {
  const timers = fakeTimers();
  const failures = [];
  const guard = createMapStartupGuard({
    onTimeout: (error) => failures.push(error),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  guard.noteError({ error: new Error('A style layer could not render one feature.') });
  assert.deepEqual(failures, []);

  timers.run();
  assert.equal(failures.length, 1);
  assert.equal(failures[0].message, 'A style layer could not render one feature.');
});

test('style readiness cancels the startup failure timer', () => {
  const timers = fakeTimers();
  const failures = [];
  const guard = createMapStartupGuard({
    onTimeout: (error) => failures.push(error),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  assert.equal(guard.complete(), true);
  assert.deepEqual(timers.cleared, [42]);
  timers.run();
  assert.deepEqual(failures, []);
  assert.equal(guard.complete(), false);
});

test('map errors are normalized for user-facing startup failures', () => {
  assert.equal(mapErrorFrom({ error: { message: 'Style request failed.' } }).message, 'Style request failed.');
  assert.equal(mapErrorFrom(null).message, 'Map initialization failed.');
});
