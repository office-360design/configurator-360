const optionsRoot = document.querySelector('.solar-view-options');
const optionsToggle = document.querySelector('#solarViewOptionsToggle');
const optionsMenu = document.querySelector('#solarViewOptionsMenu');
const technicalEdgesToggle = document.querySelector('#wireframeToggle');

function setViewOptionsOpen(open, { focusMenu = false, returnFocus = false } = {}) {
  if (!optionsRoot || !optionsToggle || !optionsMenu) return;
  const nextOpen = Boolean(open);
  optionsRoot.classList.toggle('is-open', nextOpen);
  optionsToggle.setAttribute('aria-expanded', String(nextOpen));
  optionsMenu.hidden = !nextOpen;

  if (nextOpen && focusMenu) {
    window.requestAnimationFrame(() => {
      optionsMenu.querySelector('button, input')?.focus({ preventScroll: true });
    });
  } else if (!nextOpen && returnFocus) {
    optionsToggle.focus({ preventScroll: true });
  }
}

optionsToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  const open = optionsToggle.getAttribute('aria-expanded') !== 'true';
  setViewOptionsOpen(open, { focusMenu: open });
});

optionsMenu?.addEventListener('click', (event) => {
  if (!event.target.closest('[data-view="reset"]')) return;
  window.setTimeout(() => setViewOptionsOpen(false, { returnFocus: true }), 0);
});

technicalEdgesToggle?.addEventListener('change', () => {
  window.setTimeout(() => setViewOptionsOpen(false, { returnFocus: true }), 0);
});

document.addEventListener('pointerdown', (event) => {
  if (!optionsRoot?.classList.contains('is-open')) return;
  if (optionsRoot.contains(event.target)) return;
  setViewOptionsOpen(false);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !optionsRoot?.classList.contains('is-open')) return;
  event.preventDefault();
  setViewOptionsOpen(false, { returnFocus: true });
});

window.addEventListener('blur', () => setViewOptionsOpen(false));
