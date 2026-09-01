import { SIDE_OPTIONS } from '../catalog.js';
import {
  getPoleGrid,
  getRoofRectangles,
  getSideSegmentConfig,
  getSpotlightRectangleCapacity,
  getSpotlightRectangleCount,
  getTotalSpotlights,
  segmentIsAvailable,
} from '../state.js';
import { renderPergolaGrid, renderRoofRectangleGrid } from './pergolaRenderers.js';

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

function configuredSpotlights(state) {
  return getRoofRectangles(state).flatMap((rectangle) => {
    const count = getSpotlightRectangleCount(state, rectangle.id);
    return count > 0 ? [{ rectangleId: rectangle.id, count }] : [];
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
      <button type="button" class="pergola-embed-spotlights-button" data-preview-action="toggle-spotlights" aria-expanded="false">Spotlights <span>0</span></button>
    </div>
    <div class="pergola-embed-panel pergola-embed-sides-panel" data-preview-panel="sides" hidden>
      <header><div><strong>Side closings</strong><small>Click the exact perimeter segment, then choose its closing.</small></div><button type="button" data-preview-action="close-panels" aria-label="Close side closings">×</button></header>
      <div class="pergola-embed-side-grid"></div>
      <div class="pergola-grid__legend"><span><i class="legend-line"></i> Click a segment</span><span><i class="legend-line has-closing"></i> Closing configured</span></div>
      <div class="pergola-embed-selected-label"></div>
      <div class="pergola-embed-side-options" role="group" aria-label="Closing type"></div>
      <p class="pergola-embed-control-status" role="status"></p>
    </div>
    <div class="pergola-embed-panel pergola-embed-spotlights-panel" data-preview-panel="spotlights" hidden>
      <header><div><strong>Spotlights</strong><small>Choose a roof section, then set its exact light count.</small></div><button type="button" data-preview-action="close-panels" aria-label="Close spotlights">×</button></header>
      <div class="pergola-embed-spotlight-grid"></div>
      <div class="pergola-embed-spotlight-editor"></div>
      <p class="pergola-embed-spotlight-status" role="status"></p>
    </div>`;
  viewport.appendChild(root);

  let selectedSegmentId = null;
  let selectedRectangleId = null;
  const sidesPanel = root.querySelector('[data-preview-panel="sides"]');
  const spotlightsPanel = root.querySelector('[data-preview-panel="spotlights"]');
  const sideGrid = root.querySelector('.pergola-embed-side-grid');
  const optionsRoot = root.querySelector('.pergola-embed-side-options');
  const selectedLabel = root.querySelector('.pergola-embed-selected-label');
  const sideStatus = root.querySelector('.pergola-embed-control-status');
  const spotlightGrid = root.querySelector('.pergola-embed-spotlight-grid');
  const spotlightEditor = root.querySelector('.pergola-embed-spotlight-editor');
  const spotlightStatus = root.querySelector('.pergola-embed-spotlight-status');

  function closePanels() {
    root.querySelectorAll('[data-preview-panel]').forEach(panel => { panel.hidden = true; });
    root.querySelectorAll('[data-preview-action^="toggle-"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
  }

  function render(state) {
    const night = Boolean(state.environment?.night);
    root.querySelectorAll('[data-preview-light]').forEach((button) => {
      button.setAttribute('aria-pressed', String((button.dataset.previewLight === 'night') === night));
    });

    const sides = configuredSides(state);
    root.querySelector('.pergola-embed-sides-button span').textContent = String(sides.length);
    const boundarySegments = getPoleGrid(state).segments.filter(segment => segment.boundary && segmentIsAvailable(state, segment.id));
    if (!boundarySegments.some(segment => segment.id === selectedSegmentId)) selectedSegmentId = null;
    sideGrid.innerHTML = renderPergolaGrid(state, {
      mode: 'segments', selectedSegment: selectedSegmentId, segmentAction: 'preview-select-side-segment',
    });
    const selectedSegment = boundarySegments.find(segment => segment.id === selectedSegmentId) || null;
    const selectedConfig = selectedSegment ? getSideSegmentConfig(state, selectedSegment.id) : null;
    selectedLabel.innerHTML = selectedSegment
      ? `<strong>${segmentLabel(selectedSegment)}</strong><small>Choose the closing for this highlighted segment.</small>`
      : '<strong>Select a perimeter segment above.</strong><small>The poles are reference points; click a line between them.</small>';
    optionsRoot.hidden = !selectedSegment;
    optionsRoot.innerHTML = selectedSegment ? SIDE_OPTIONS.map(option => `
      <button type="button" data-preview-side-type="${option.value}" aria-pressed="${selectedConfig?.type === option.value}">
        <img src="${option.icon}" alt="" /><span><strong>${option.label}</strong><small>${option.description}</small></span>
      </button>`).join('') : '';

    const spotlights = configuredSpotlights(state);
    const spotlightCount = getTotalSpotlights(state);
    root.querySelector('.pergola-embed-spotlights-button span').textContent = String(spotlightCount);
    const rectangles = getRoofRectangles(state);
    if (!rectangles.some(rectangle => rectangle.id === selectedRectangleId)) selectedRectangleId = rectangles.length === 1 ? rectangles[0].id : null;
    spotlightGrid.innerHTML = renderRoofRectangleGrid(state, selectedRectangleId);
    const selectedRectangle = rectangles.find(rectangle => rectangle.id === selectedRectangleId) || null;
    if (selectedRectangle) {
      const count = getSpotlightRectangleCount(state, selectedRectangle.id);
      const capacity = getSpotlightRectangleCapacity(state, selectedRectangle.id).max;
      spotlightEditor.innerHTML = `<div><strong>${selectedRectangle.label}</strong><small>Maximum ${capacity} spotlights in this roof section.</small></div><div class="pergola-embed-counter"><button type="button" data-preview-action="spotlight-counter" data-delta="-1" aria-label="Decrease spotlights" ${count <= 0 ? 'disabled' : ''}>−</button><output>${count}</output><button type="button" data-preview-action="spotlight-counter" data-delta="1" aria-label="Increase spotlights" ${count >= capacity ? 'disabled' : ''}>+</button></div>`;
    } else {
      spotlightEditor.innerHTML = '<div><strong>Select a roof section above.</strong><small>Each section keeps its own spotlight count.</small></div>';
    }
    spotlightStatus.textContent = spotlightCount ? `${spotlightCount} spotlight${spotlightCount === 1 ? '' : 's'} configured across ${spotlights.length} roof section${spotlights.length === 1 ? '' : 's'}.` : 'No spotlights configured yet.';
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
    if (button.dataset.previewAction === 'toggle-sides' || button.dataset.previewAction === 'toggle-spotlights') {
      const target = button.dataset.previewAction === 'toggle-sides' ? sidesPanel : spotlightsPanel;
      const opening = target.hidden;
      closePanels();
      target.hidden = !opening;
      if (opening) target.scrollTop = 0;
      button.setAttribute('aria-expanded', String(opening));
      return;
    }
    if (button.dataset.previewAction === 'close-panels') {
      closePanels();
      return;
    }
    if (button.dataset.action === 'preview-select-side-segment') {
      selectedSegmentId = button.dataset.segment;
      sideStatus.textContent = '';
      render(store.get());
      return;
    }
    if (button.dataset.previewSideType && selectedSegmentId) {
      const updated = store.update(`sideSegments.${selectedSegmentId}.type`, button.dataset.previewSideType, { path: `sideSegments.${selectedSegmentId}.type`, previewControl: true });
      if (updated === false) {
        sideStatus.textContent = store.getLastError?.() || 'That closing cannot be placed on this segment.';
        return;
      }
      const sides = configuredSides(store.get());
      const segment = getPoleGrid(store.get()).segments.find(item => item.id === selectedSegmentId);
      sideStatus.textContent = `${segmentLabel(segment)} updated.`;
      postAdjustment({ sides }, `${sides.length} exact side closing${sides.length === 1 ? '' : 's'} configured`);
      return;
    }
    if (button.dataset.action === 'select-roof-rectangle') {
      selectedRectangleId = button.dataset.rectangle;
      render(store.get());
      return;
    }
    if (button.dataset.previewAction === 'spotlight-counter' && selectedRectangleId) {
      const state = store.get();
      const capacity = getSpotlightRectangleCapacity(state, selectedRectangleId).max;
      const current = getSpotlightRectangleCount(state, selectedRectangleId);
      const next = Math.min(capacity, Math.max(0, current + (Number(button.dataset.delta) || 0)));
      store.update(`accessories.spotlights.${selectedRectangleId}`, next, { path: `accessories.spotlights.${selectedRectangleId}`, previewControl: true });
      const nextState = store.get();
      const spotlights = configuredSpotlights(nextState);
      const spotlightCount = getTotalSpotlights(nextState);
      postAdjustment({ spotlightCount, spotlights }, `${spotlightCount} spotlight${spotlightCount === 1 ? '' : 's'} placed across ${spotlights.length} roof section${spotlights.length === 1 ? '' : 's'}`);
    }
  });

  const unsubscribe = store.subscribe(state => render(state));
  return { destroy() { unsubscribe?.(); root.remove(); } };
}
