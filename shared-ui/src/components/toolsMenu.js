export function renderToolsMenu(open) {
  return `
    <div class="viewport-toolbar viewport-toolbar--left tools-toolbar ${open ? 'is-open' : ''}">
      <button class="tool-launcher" type="button" data-action="toggle-tools" aria-expanded="${open}" aria-label="Toggle tools">Tools</button>
      <div class="tools-toolbar__panel ${open ? 'is-open' : ''}">
        <button class="round-tool" type="button" data-action="toggle-environment" aria-label="Sun and orientation settings" title="Sun and orientation"><span aria-hidden="true">☀</span></button>
        <button class="round-tool is-active" type="button" data-action="toggle-dimensions" aria-label="Toggle dimensions" title="Toggle dimensions"><span aria-hidden="true">↔</span></button>
        <button class="round-tool" type="button" data-action="toggle-compass" aria-label="Toggle compass" title="Toggle compass"><span aria-hidden="true">🧭</span></button>
        <button class="round-tool" type="button" data-action="cycle-camera" aria-label="Change camera" title="Change camera"><span aria-hidden="true">⌖</span></button>
      </div>
    </div>
  `;
}
