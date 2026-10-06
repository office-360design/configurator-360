// Reuse the editor's action buttons so keyboard shortcuts and geometry actions
// keep a single implementation. Categories only change which tools are shown.
export function setupEditorToolbar(editor) {
  const dialog = editor.dialog;
  const toolbar = dialog.querySelector('.layout-toolbar');
  const categories = {
    perimeter: { label: 'Perimeter', actions: ['draw', 'extend', 'connect'] },
    surfaces: { label: 'Surfaces', actions: ['split', 'insert'] },
    features: { label: 'Add feature', actions: ['window', 'dormer'] },
    view: { label: 'View', actions: ['pan', 'fit', 'slopeArrows', 'axes'] },
  };
  const options = document.createElement('div');
  options.className = 'layout-tool-options';
  options.hidden = true;
  options.id = 'layoutToolOptions';
  options.setAttribute('role', 'group');
  const context = document.createElement('div');
  context.className = 'layout-context-actions';
  context.setAttribute('role', 'group');
  context.setAttribute('aria-label', 'Selection actions');
  const selection = toolbar.querySelector('[data-action="select"]');
  const buttons = new Map();
  let open = null;
  let selectionKey;
  function refreshContext() {
    context.hidden = open !== null || ![...context.children].some(button => !button.hidden);
  }

  function close(focus = false) {
    const previous = open;
    open = null;
    options.hidden = true;
    refreshContext();
    buttons.forEach(button => button.setAttribute('aria-expanded', 'false'));
    if (focus && previous) buttons.get(previous).focus();
  }

  for (const [key, category] of Object.entries(categories)) {
    const panel = document.createElement('div');
    panel.dataset.toolPanel = key;
    panel.hidden = true;
    for (const action of category.actions) panel.append(dialog.querySelector(`[data-action="${action}"]`));
    options.append(panel);
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.toolGroup = key;
    button.textContent = category.label;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', options.id);
    button.addEventListener('click', () => {
      if (open === key) { close(); return; }
      open = key;
      refreshContext();
      options.hidden = false;
      options.setAttribute('aria-label', category.label);
      options.querySelectorAll('[data-tool-panel]').forEach(p => { p.hidden = p.dataset.toolPanel !== key; });
      buttons.forEach((b, name) => b.setAttribute('aria-expanded', String(name === key)));
    });
    buttons.set(key, button);
  }
  for (const action of ['meet', 'splitPlace', 'joinPlace', 'cycleCopy', 'delete', 'finish']) {
    context.append(toolbar.querySelector(`[data-action="${action}"]`));
  }
  toolbar.replaceChildren(selection, ...buttons.values());
  toolbar.after(options, context);
  const instruction = dialog.querySelector('.layout-mode-hint');
  instruction.classList.add('layout-current-tool');
  dialog.querySelector('.layout-workspace').before(instruction);
  dialog.querySelector('.layout-overlays').remove();
  selection.addEventListener('click', () => close());
  options.addEventListener('click', event => {
    if (event.target.closest('[data-action]')) close(true);
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  });
  return {
    close,
    refresh() {
      for (const button of context.querySelectorAll('[data-action]')) {
        if (button.dataset.action !== 'finish') button.hidden = button.disabled;
      }
      const nextSelection = JSON.stringify([editor.selected, editor.selectedEdge]);
      if (selectionKey !== nextSelection) close();
      selectionKey = nextSelection;
      refreshContext();
      selection.setAttribute('aria-pressed', String(editor.mode === 'select' && !editor.windowTool.active && !editor.dormer && !editor.panEnabled && !editor.meet));
      const active = editor.panEnabled ? 'view' : editor.windowTool.active ? 'features' : editor.dormer ? 'features' :
        ['draw', 'extend', 'connect'].includes(editor.mode) ? 'perimeter' :
        ['split', 'insert'].includes(editor.mode) ? 'surfaces' : null;
      buttons.forEach((button, key) => { button.dataset.active = String(key === active); });
    },
  };
}
