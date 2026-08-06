const DEFAULT_TOOL_ITEMS = [
  { action: 'toggle-environment', label: 'Sun and orientation', icon: '☀' },
  { action: 'toggle-dimensions', label: 'Toggle dimensions', icon: '↔', active: true },
  { action: 'toggle-compass', label: 'Toggle compass', icon: '🧭' },
  { action: 'cycle-camera', label: 'Change camera', icon: '⌖' },
];

export function renderToolsMenu(open, { items = DEFAULT_TOOL_ITEMS } = {}) {
  return `
    <div class="viewport-toolbar viewport-toolbar--left tools-toolbar ${open ? 'is-open' : ''}" data-shared-tools>
      <button class="tool-launcher ${open ? 'is-active' : ''}" type="button" data-action="toggle-tools" aria-expanded="${open}" aria-label="Toggle tools">Tools</button>
      <div class="tools-toolbar__panel ${open ? 'is-open' : ''}">
        ${items.map((item) => `
          <button class="round-tool ${item.active ? 'is-active' : ''}" type="button" data-action="${item.action}" aria-label="${item.label}" title="${item.label}"><span aria-hidden="true">${item.icon}</span></button>
        `).join('')}
      </div>
    </div>
  `;
}
