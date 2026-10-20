/**
 * Optional Templates launcher + chooser shared by opt-in configurators only.
 * No UI is created unless enabled is explicitly true. Products supply their
 * own catalog and apply callback; an empty catalog renders only the empty state.
 */
export function mountTemplatesMenu({
  enabled = false,
  host = document.querySelector('.shared-ui-host'),
  idPrefix = 'configurator',
  items = [],
  labels = {},
  classes = {},
  cardDataKey = 'templateId',
  beforeOpen = null,
  onSelect = null,
  onError = null,
} = {}) {
  if (!enabled || !host) return null;
  const controllerKey = `templatesMenu:${idPrefix}`;
  if (host[controllerKey]) return host[controllerKey];
  const styleId = 'shared-templates-menu-styles';
  if (!document.getElementById(styleId)) {
    const link = document.createElement('link');
    link.id = styleId;
    link.rel = 'stylesheet';
    link.href = new URL('../../styles/templates.css?v=templates-1', import.meta.url).href;
    document.head.appendChild(link);
  }

  let copy = { launcher: 'Templates', title: 'Templates', close: 'Close templates', empty: 'No templates available yet.', ...labels };
  let catalog = [...items];
  let open = false;
  let destroyed = false;
  let frame = 0;
  let observedTools = null;
  const className = (key, common) => `${common} ${classes[key] || ''}`.trim();
  const phone = () => window.matchMedia('(max-width: 760px)').matches;
  const toolsLauncher = () => host.querySelector('[data-shared-tools] > .tool-launcher[data-action="toggle-tools"]');

  const launcher = document.createElement('button');
  launcher.id = `${idPrefix}-templates-launcher`;
  launcher.type = 'button';
  launcher.className = className('launcher', 'tool-launcher shared-templates-launcher');
  launcher.dataset.action = `toggle-${idPrefix}-templates`;
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-haspopup', 'dialog');
  launcher.setAttribute('aria-controls', `${idPrefix}-templates-popover`);

  const panel = document.createElement('section');
  panel.id = `${idPrefix}-templates-popover`;
  panel.className = className('panel', 'shared-templates-popover');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-labelledby', `${idPrefix}-templates-title`);
  const header = document.createElement('div');
  header.className = className('header', 'shared-templates-popover__header');
  const heading = document.createElement('strong');
  heading.id = `${idPrefix}-templates-title`;
  const headingWrap = document.createElement('div');
  headingWrap.appendChild(heading);
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = className('close', 'shared-templates-popover__close');
  closeButton.textContent = '×';
  header.append(headingWrap, closeButton);
  const grid = document.createElement('div');
  grid.className = className('grid', 'shared-templates-grid');
  const empty = document.createElement('p');
  empty.className = 'shared-templates-empty';
  empty.setAttribute('role', 'status');
  panel.append(header, grid, empty);

  function setLabels(next = {}) {
    copy = { ...copy, ...next };
    launcher.textContent = copy.launcher;
    launcher.setAttribute('aria-label', copy.title);
    heading.textContent = copy.title;
    closeButton.setAttribute('aria-label', copy.close);
    empty.textContent = copy.empty;
    schedulePosition();
  }

  function setItems(next = []) {
    catalog = Array.isArray(next) ? [...next] : [];
    grid.replaceChildren();
    empty.hidden = catalog.length !== 0;
    grid.hidden = catalog.length === 0;
    catalog.forEach((item) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = className('card', 'shared-template-card');
      card.dataset[cardDataKey] = item.id;
      const imageWrap = document.createElement('span');
      imageWrap.className = className('imageWrap', 'shared-template-card__image-wrap');
      if (item.image) {
        const image = document.createElement('img');
        image.className = className('image', 'shared-template-card__image');
        image.src = item.image;
        image.alt = '';
        image.loading = 'eager';
        imageWrap.appendChild(image);
      }
      const textWrap = document.createElement('span');
      textWrap.className = className('copy', 'shared-template-card__copy');
      const title = document.createElement('strong');
      title.textContent = item.name;
      textWrap.appendChild(title);
      card.append(imageWrap, textWrap);
      card.addEventListener('click', async () => {
        if (!onSelect) return;
        card.disabled = true;
        try {
          if ((await onSelect(item)) !== false) close();
        } catch (error) {
          onError?.(error);
        } finally {
          card.disabled = false;
        }
      });
      grid.appendChild(card);
    });
    schedulePosition();
  }

  function reposition() {
    frame = 0;
    const tools = toolsLauncher();
    if (destroyed || !tools || !launcher.isConnected) return;
    const toolsRect = tools.getBoundingClientRect();
    if (phone()) {
      launcher.style.removeProperty('top');
      launcher.style.removeProperty('left');
    } else {
      launcher.style.top = `${Math.round(toolsRect.top)}px`;
      launcher.style.left = `${Math.round(toolsRect.right + 10)}px`;
    }
    if (!open) return;
    const margin = 12;
    const rect = launcher.getBoundingClientRect();
    const width = Math.min(720, Math.max(0, window.innerWidth - margin * 2));
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.round(rect.bottom + 10));
    panel.style.width = `${width}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${top}px`;
    panel.style.maxHeight = `${Math.max(0, window.innerHeight - top - margin)}px`;
  }

  function schedulePosition() {
    if (!destroyed && !frame) frame = requestAnimationFrame(reposition);
  }

  function close({ restoreFocus = false } = {}) {
    open = false;
    panel.hidden = true;
    launcher.classList.remove('is-active');
    launcher.setAttribute('aria-expanded', 'false');
    if (restoreFocus && launcher.isConnected) launcher.focus({ preventScroll: true });
  }

  function toggle() {
    if (open) { close(); return; }
    const tools = toolsLauncher();
    if (tools?.getAttribute('aria-expanded') === 'true') tools.click();
    beforeOpen?.();
    open = true;
    panel.hidden = false;
    launcher.classList.add('is-active');
    launcher.setAttribute('aria-expanded', 'true');
    reposition();
    (grid.querySelector('button') || closeButton).focus({ preventScroll: true });
  }

  // The shell can re-render its host after a language/authentication change.
  // Reattach these same nodes rather than duplicate launchers or lose handlers.
  const sizeObserver = new ResizeObserver(schedulePosition);
  function ensureMounted() {
    if (destroyed) return;
    const tools = toolsLauncher();
    if (!tools) return;
    const toolbar = tools.closest('[data-shared-tools]');
    if (launcher.parentNode !== toolbar) toolbar.appendChild(launcher);
    if (panel.parentNode !== host) host.appendChild(panel);
    if (observedTools !== tools) {
      sizeObserver.disconnect();
      sizeObserver.observe(tools);
      observedTools = tools;
    }
    schedulePosition();
  }
  const observer = new MutationObserver(ensureMounted);
  observer.observe(host, { childList: true, subtree: true });
  const onOutside = (event) => {
    if (open && !panel.contains(event.target) && !launcher.contains(event.target)) close();
  };
  const onTools = (event) => {
    if (event.target.closest('[data-action="toggle-tools"]')) close();
  };
  const onKey = (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close({ restoreFocus: true });
    }
  };
  launcher.addEventListener('click', toggle);
  closeButton.addEventListener('click', () => close({ restoreFocus: true }));
  document.addEventListener('pointerdown', onOutside, true);
  document.addEventListener('click', onTools, true);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', schedulePosition, { passive: true });
  window.addEventListener('scroll', schedulePosition, { passive: true });

  const controller = {
    close, reposition: schedulePosition, setLabels, setItems,
    get isOpen() { return open; },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('click', onTools, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', schedulePosition);
      window.removeEventListener('scroll', schedulePosition);
      launcher.remove();
      panel.remove();
      delete host[controllerKey];
    },
  };
  host[controllerKey] = controller;
  setLabels();
  setItems(catalog);
  ensureMounted();
  return controller;
}
