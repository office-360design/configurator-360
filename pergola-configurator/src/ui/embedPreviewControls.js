import { SIDE_OPTIONS } from '../catalog.js';
import { getPoleGrid, getSideSegmentConfig, segmentIsAvailable } from '../state.js';

const PREVIEW_MESSAGE_TYPE = '360configurator:preview-adjustment';

function segmentLabel(segment) {
  const ordinal = segment.axis === 'horizontal' ? segment.column + 1 : segment.row + 1;
  const side = String(segment.boundary || 'interior');
  return `${side.charAt(0).toUpperCase()}${side.slice(1)} ${ordinal}`;
}

function configuredSides(state) {
  return getPoleGrid(state).segments.flatMap((segment) => {
    const config = getSideSegmentConfig(state, segment.id);
    if (!config?.type || config.type === 'none') return [];
    const item = { segmentId: segment.id, side: segment.boundary, type: config.type };
    if (config.type === 'screen' || config.type === 'motorized-screen') {
      const settings = config.screenSettings?.[config.type] || {};
      item.openness = Number(settings.openness) || 0;
      item.color = settings.color;
    }
    if (config.type === 'privacy-wall') item.privacyColor = config.privacyColor;
    return [item];
  });
}

function postAdjustment(adjustments, label) {
  if (window.parent === window) return;
  window.parent.postMessage({ type: PREVIEW_MESSAGE_TYPE, product: 'pergola', adjustments, label }, '*');
}

export function mountPergolaEmbedPreviewControls({ store, viewport }) {
  if (new URLSearchParams(window.location.search).get('embed') !== 'preview' || !viewport) return null;

  const root = document.createElement('section');
  root.className = 'pergola-embed-controls';
  root.setAttribute('aria-label', 'Pergola preview controls');
  root.innerHTML = `
    <div class="pergola-embed-toolbar">
      <div class="pergola-embed-day-night" role="group" aria-label="Preview lighting">
        <button type="button" data-preview-light="day">☀ Day</button>
        <button type="button" data-preview-light="night">☾ Night</button>
      </div>
      <button type="button" class="pergola-embed-sides-button" data-preview-action="toggle-sides" aria-expanded="false">Side closings <span>0</span></button>
    </div>
    <div class="pergola-embed-sides-panel" hidden>
      <header><div><strong>Side closings</strong><small>Choose a segment, then its closing.</small></div><button type="button" data-preview-action="close-sides" aria-label="Close side closings">×</button></header>
      <div class="pergola-embed-segments" role="group" aria-label="Pergola boundary segments"></div>
      <div class="pergola-embed-side-options" role="group" aria-label="Closing type"></div>
      <p class="pergola-embed-control-status" role="status"></p>
    </div>`;
  viewport.appendChild(root);

  let selectedSegmentId = null;
  const panel = root.querySelector('.pergola-embed-sides-panel');
  const segmentsRoot = root.querySelector('.pergola-embed-segments');
  const optionsRoot = root.querySelector('.pergola-embed-side-options');
  const status = root.querySelector('.pergola-embed-control-status');

  function render(state) {
    const night = Boolean(state.environment?.night);
    root.querySelectorAll('[data-preview-light]').forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.previewLight === 'night') === night));
    });
    const configured = configuredSides(state);
    const count = root.querySelector('.pergola-embed-sides-button span');
    if (count) count.textContent = String(configured.length);

    const boundarySegments = getPoleGrid(state).segments.filter(segment => segment.boundary && segmentIsAvailable(state, segment.id));
    if (!boundarySegments.some(segment => segment.id === selectedSegmentId)) selectedSegmentId = boundarySegments[0]?.id || null;
    if (segmentsRoot) segmentsRoot.innerHTML = boundarySegments.map(segment => {
      const config = getSideSegmentConfig(state, segment.id);
      const selected = segment.id === selectedSegmentId;
      return `<button type="button" data-preview-segment="${segment.id}" aria-pressed="${selected}" class="${config.type !== 'none' ? 'has-closing' : ''}">${segmentLabel(segment)}<small>${config.type === 'none' ? 'Open' : String(config.type).replace(/-/g, ' ')}</small></button>`;
    }).join('');

    const selectedConfig = selectedSegmentId ? getSideSegmentConfig(state, selectedSegmentId) : null;
    if (optionsRoot) optionsRoot.innerHTML = SIDE_OPTIONS.map(option => `
      <button type="button" data-preview-side-type="${option.value}" aria-pressed="${selectedConfig?.type === option.value}">
        <img src="${option.icon}" alt="" /><span><strong>${option.label}</strong><small>${option.description}</small></span>
      </button>`).join('');
  }

  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.previewLight) {
      const night = button.dataset.previewLight === 'night';
      store.update('environment.night', night, { path: 'environment.night', previewControl: true });
      postAdjustment({ nightPreview: night }, `${night ? 'night' : 'day'} preview selected`);
      return;
    }
    if (button.dataset.previewAction === 'toggle-sides') {
      panel.hidden = !panel.hidden;
      button.setAttribute('aria-expanded', String(!panel.hidden));
      return;
    }
    if (button.dataset.previewAction === 'close-sides') {
      panel.hidden = true;
      root.querySelector('[data-preview-action="toggle-sides"]')?.setAttribute('aria-expanded', 'false');
      return;
    }
    if (button.dataset.previewSegment) {
      selectedSegmentId = button.dataset.previewSegment;
      status.textContent = '';
      render(store.get());
      return;
    }
    if (button.dataset.previewSideType && selectedSegmentId) {
      const updated = store.update(`sideSegments.${selectedSegmentId}.type`, button.dataset.previewSideType, { path: `sideSegments.${selectedSegmentId}.type`, previewControl: true });
      if (updated === false) {
        status.textContent = store.getLastError?.() || 'That closing cannot be placed on this segment.';
        return;
      }
      const sides = configuredSides(store.get());
      status.textContent = `${segmentLabel(getPoleGrid(store.get()).segments.find(segment => segment.id === selectedSegmentId))} updated.`;
      postAdjustment({ sides }, `${sides.length} side closing${sides.length === 1 ? '' : 's'} configured`);
    }
  });

  const unsubscribe = store.subscribe(state => render(state));
  return { destroy() { unsubscribe?.(); root.remove(); } };
}
