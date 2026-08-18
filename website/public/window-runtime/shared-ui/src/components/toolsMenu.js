import { normalizeToolsPlacement, resolveSharedTools } from '../tools/registry.js';
import { escapeHtml } from '../utils.js';

const DEFAULT_TOOL_ITEMS = resolveSharedTools([
  'environment',
  { id: 'dimensions', active: true },
  'compass',
  'camera',
]);

/**
 * The launcher can render a chosen subset of the root tool pool. Standalone
 * Window and Roof integrations explicitly pass an empty array, so no tool is
 * enabled there until that configurator's developer opts in.
 */
export function renderToolsMenu(open, { items = DEFAULT_TOOL_ITEMS, placement = {} } = {}) {
  const resolvedPlacement = normalizeToolsPlacement(placement);
  const style = [
    `--shared-tools-offset-x:${Number(resolvedPlacement.offsetX) || 0}px`,
    `--shared-tools-offset-y:${Number(resolvedPlacement.offsetY) || 0}px`,
  ].join(';');

  return `
    <div
      class="viewport-toolbar viewport-toolbar--${escapeHtml(resolvedPlacement.side)} tools-toolbar tools-toolbar--${escapeHtml(resolvedPlacement.side)} tools-toolbar--${escapeHtml(resolvedPlacement.direction)} ${open ? 'is-open' : ''}"
      data-shared-tools
      data-tools-side="${escapeHtml(resolvedPlacement.side)}"
      data-tools-direction="${escapeHtml(resolvedPlacement.direction)}"
      style="${style}"
    >
      <button class="tool-launcher ${open ? 'is-active' : ''}" type="button" data-action="toggle-tools" aria-expanded="${open}" aria-label="Toggle tools">Tools</button>
      <div class="tools-toolbar__panel ${open ? 'is-open' : ''}">
        ${items.map((item) => `
          <button
            class="round-tool ${item.active ? 'is-active' : ''}"
            type="button"
            data-action="${escapeHtml(item.action)}"
            data-tool-id="${escapeHtml(item.id ?? item.action)}"
            aria-label="${escapeHtml(item.label)}"
            title="${escapeHtml(item.label)}"
            ${item.disabled ? 'disabled aria-disabled="true"' : ''}
          ><span aria-hidden="true">${item.icon ?? ''}</span></button>
        `).join('')}
      </div>
    </div>
  `;
}
