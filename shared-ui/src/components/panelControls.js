/**
 * Presentation-only helpers for native settings controls.
 * Product state, units, validation and rebuild scheduling belong to the caller.
 */
export function bindPanelAccordions(root) {
  const cleanups = [];

  root?.querySelectorAll('.accordion-section').forEach((section) => {
    const button = section.querySelector('.accordion-toggle');
    const panel = section.querySelector('.accordion-panel');
    if (!button || !panel) return;

    const toggle = () => {
      const open = !section.classList.contains('is-open');
      section.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
    };

    button.addEventListener('click', toggle);
    cleanups.push(() => button.removeEventListener('click', toggle));
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}

/**
 * Keep a native range, optional number input and output in sync.
 * Read limits on every event: product code may change them after a rebuild.
 * Preserve input/change/blur notifications, including the final commit event.
 */
export function bindPanelRange(control, {
  format = String,
  immediateOnInput = false,
  onChange = () => {},
} = {}) {
  const range = control.querySelector('input[type="range"]');
  const number = control.querySelector('input[type="number"]');
  const output = control.querySelector('output');
  const cleanups = [];

  const update = (raw, source, immediate) => {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;

    const min = Number(source?.min ?? range?.min ?? number?.min ?? -Infinity);
    const max = Number(source?.max ?? range?.max ?? number?.max ?? Infinity);
    const value = Math.min(max, Math.max(min, parsed));

    if (range) {
      range.max = String(max);
      range.value = String(value);
    }
    if (number) {
      number.max = String(max);
      number.value = String(value);
    }
    if (output) output.value = format(value);

    onChange(value, { immediate });
  };

  const listen = (input, event, immediate) => {
    if (!input) return;
    const handler = () => update(input.value, input, immediate);
    input.addEventListener(event, handler);
    cleanups.push(() => input.removeEventListener(event, handler));
  };

  listen(range, 'input', immediateOnInput);
  listen(range, 'change', true);
  listen(number, 'input', false);
  listen(number, 'change', true);
  listen(number, 'blur', true);

  return () => cleanups.forEach((cleanup) => cleanup());
}
