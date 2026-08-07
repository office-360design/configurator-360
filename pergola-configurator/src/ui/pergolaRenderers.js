import {
  ACCESSORY_OPTIONS,
  AUTOMATION_OPTIONS,
  DIMENSION_PRESETS,
  FRAME_COLORS,
  HEATER_SIDES,
  LED_COLORS,
  LOUVER_COLORS,
  MODEL_OPTIONS,
  OUTLET_TYPES,
  POLE_FACES,
  PRIVACY_WALL_COLORS,
  SCREEN_COLORS,
  SENSOR_POSITIONS,
  SERVICE_OPTIONS,
  SIDE_NAMES,
  SIDE_OPTIONS,
  STEPS,
} from '../catalog.js';
import {
  automationLabel,
  calculatePrice,
  formatMoney,
  sideLabel,
} from '../pricing.js';
import {
  canPlacePoleMount,
  countPoleMounts,
  findPoleMount,
  findAvailablePoleMountHeight,
  getConnectedSegmentForPoleFace,
  getPoleFaceMounts,
  getPoleGrid,
  getPoleLabel,
  getPergolaConfigurationIssues,
  getPoleMountConflictMap,
  getPoleMountHeightLimits,
  getSideSegment,
  getSideSegmentConfig,
  hasPoleMountConflicts,
  poleFaceIsAvailable,
  poleIsAvailable,
  segmentHasMountedItems,
  segmentIsAvailable,
} from '../state.js';
import { escapeHtml } from '../../../shared-ui/src/index.js';
import { optionCard, segmented, colorSwatches } from './renderHelpers.js';

const POLE_MOUNT_OPTIONS = [
  { value: 'speaker', label: 'Speaker', icon: './assets/icons/accessory-speaker.svg' },
  { value: 'outlet', label: 'Outlet', icon: './assets/icons/accessory-outlet.svg' },
  { value: 'hand-crank', label: 'Hand crank', icon: './assets/icons/automation-manual.svg' },
  { value: 'switch', label: 'Switch', icon: './assets/icons/automation-switch.svg' },
];

function poleMountLabel(type) {
  return POLE_MOUNT_OPTIONS.find((option) => option.value === type)?.label ?? 'Component';
}

function capitalize(value) {
  const text = String(value ?? '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function configurationValidationMessages(state) {
  return getPergolaConfigurationIssues(state).map((issue) => issue.message);
}


function segmentDisplayLabel(state, segmentOrId) {
  const segment = typeof segmentOrId === 'string' ? getSideSegment(state, segmentOrId) : segmentOrId;
  if (!segment) return 'Grid segment';
  if (segment.boundary) {
    const ordinal = segment.axis === 'horizontal' ? segment.column + 1 : segment.row + 1;
    return `${capitalize(segment.boundary)} segment ${ordinal}`;
  }
  return segment.axis === 'horizontal'
    ? `Interior row ${segment.row + 1}, segment ${segment.column + 1}`
    : `Interior column ${segment.column + 1}, segment ${segment.row + 1}`;
}

function renderPergolaGrid(state, options = {}) {
  const grid = getPoleGrid(state);
  const mode = options.mode === 'segments' ? 'segments' : 'poles';
  const conflicts = options.conflicts ?? {};
  const aspect = Math.min(3.2, Math.max(0.7, grid.width / grid.depth));
  const xPercent = (column) => grid.columns <= 1 ? 50 : (column / (grid.columns - 1)) * 100;
  // Front is the viewer-facing edge, so it belongs at the bottom of the plan view.
  const yPercent = (row) => grid.rows <= 1 ? 50 : 100 - (row / (grid.rows - 1)) * 100;

  const segmentMarkup = grid.segments.map((segment) => {
    const available = segmentIsAvailable(state, segment.id);
    const configured = getSideSegmentConfig(state, segment.id).type !== 'none';
    const blocked = segmentHasMountedItems(state, segment.id);
    const selected = options.selectedSegment === segment.id;
    let style = '';
    if (segment.axis === 'horizontal') {
      const left = xPercent(segment.column);
      const right = xPercent(segment.column + 1);
      style = `left:${left}%;top:${yPercent(segment.row)}%;width:${right - left}%;`;
    } else {
      const first = yPercent(segment.row);
      const second = yPercent(segment.row + 1);
      const top = Math.min(first, second);
      style = `left:${xPercent(segment.column)}%;top:${top}%;height:${Math.abs(second - first)}%;`;
    }
    const classes = [
      'pergola-grid__segment',
      `is-${segment.axis}`,
      configured ? 'has-closing' : '',
      blocked ? 'is-blocked' : '',
      selected ? 'is-selected' : '',
      available ? '' : 'is-unavailable',
    ].filter(Boolean).join(' ');
    if (mode === 'segments') {
      return `<button type="button" class="${classes}" style="${style}" data-action="select-side-segment" data-segment="${segment.id}" aria-pressed="${selected}" title="${escapeHtml(segmentDisplayLabel(state, segment))}" ${available ? '' : 'disabled aria-disabled="true"'}><span></span></button>`;
    }
    return `<span class="${classes}" style="${style}" aria-hidden="true"><span></span></span>`;
  }).join('');

  const poleMarkup = grid.poles.map((pole) => {
    const available = poleIsAvailable(state, pole.id);
    const invalid = Boolean(conflicts[pole.id]);
    const selected = options.selectedPole === pole.id;
    const classes = [
      'pergola-grid__pole',
      selected ? 'is-selected' : '',
      invalid ? 'is-invalid' : '',
      available ? '' : 'is-unavailable',
    ].filter(Boolean).join(' ');
    const style = `left:${xPercent(pole.column)}%;top:${yPercent(pole.row)}%;`;
    if (mode === 'poles') {
      return `<button type="button" class="${classes}" style="${style}" data-action="select-pole" data-pole="${pole.id}" aria-pressed="${selected}" title="${escapeHtml(pole.label)}" ${available ? '' : 'disabled aria-disabled="true"'}><span></span></button>`;
    }
    return `<span class="${classes}" style="${style}" title="${escapeHtml(pole.label)}" aria-hidden="true"><span></span></span>`;
  }).join('');

  return `
    <div class="pergola-grid pergola-grid--${mode}" style="--pergola-grid-aspect:${aspect};">
      <div class="pergola-grid__canvas">
        ${segmentMarkup}
        ${poleMarkup}
      </div>
    </div>
  `;
}

export const pergolaRenderers = {
  renderCurrentStep() {
    switch (STEPS[this.state.step].id) {
      case 'structure': return this.renderStructureStep();
      case 'finish': return this.renderFinishStep();
      case 'automation': return this.renderAutomationStep();
      case 'sides': return this.renderSidesStep();
      case 'accessories': return this.renderAccessoriesStep();
      case 'summary': return this.renderSummaryStep();
      default: return '';
    }
  },

  renderStepById(id) {
    switch (id) {
      case 'structure': return this.renderStructureStep();
      case 'finish': return this.renderFinishStep();
      case 'automation': return this.renderAutomationStep();
      case 'sides': return this.renderSidesStep();
      case 'accessories': return this.renderAccessoriesStep();
      case 'summary': return this.renderSummaryStep();
      default: return '';
    }
  },

  renderAccordionSections() {
    return STEPS.map((step) => {
      const expanded = this.expandedStep === step.id;
      return `
        <section class="accordion-section ${expanded ? 'is-open' : ''}">
          <button type="button" class="accordion-toggle" data-action="toggle-step-section" data-step-id="${step.id}" aria-expanded="${expanded}">
            <span>${escapeHtml(step.label)}</span>
            <svg class="accordion-toggle__arrow" viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
          ${expanded ? `<div class="accordion-panel">${this.renderStepById(step.id)}</div>` : ''}
        </section>
      `;
    }).join('');
  },

  renderStructureStep() {
    const state = this.state;
    const isWallMounted = state.installation === 'wall-mounted';
    const currentPreset = DIMENSION_PRESETS.find(
      ([width, depth]) => width === state.dimensions.width && depth === state.dimensions.depth,
    );
    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>Model</h2>
          <p>Choose the structural specification for the demo pergola.</p>
        </div>
        <div class="option-grid option-grid--models">
          ${MODEL_OPTIONS.map((option) => optionCard(option, state.model === option.value, 'model')).join('')}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Installation type</h2></div>
        ${segmented([
          { value: 'freestanding', label: 'Freestanding' },
          { value: 'wall-mounted', label: 'Wall-mounted' },
        ], state.installation, 'installation')}
        ${isWallMounted ? `
          <div class="subsection">
            <label class="field-label">Mounted side</label>
            ${segmented(SIDE_NAMES.map((side) => ({ value: side, label: capitalize(side) })), state.mountedSide, 'mountedSide')}
          </div>
        ` : ''}
      </section>

      <section class="form-section">
        <div class="section-heading section-heading--row">
          <div>
            <h2>Dimensions</h2>
            <p>Dimension changes are reflected immediately in 3D.</p>
          </div>
          ${segmented([
            { value: 'metric', label: 'mm' },
            { value: 'imperial', label: 'ft / in' },
          ], state.units, 'units')}
        </div>

        <div class="preset-grid">
          ${DIMENSION_PRESETS.map(([width, depth]) => `
            <button
              class="preset-button ${currentPreset?.[0] === width && currentPreset?.[1] === depth ? 'is-selected' : ''}"
              type="button"
              data-action="dimension-preset"
              data-width="${width}"
              data-depth="${depth}"
            >${this.formatCompactDimension(width)} × ${this.formatCompactDimension(depth)}</button>
          `).join('')}
          <span class="preset-button preset-button--custom ${currentPreset ? '' : 'is-selected'}">Custom</span>
        </div>

        <div class="dimension-fields">
          ${this.numberField('Width', 'dimensions.width', state.dimensions.width, 2000, 20000, 100)}
          ${this.numberField('Depth', 'dimensions.depth', state.dimensions.depth, 2000, 20000, 100)}
          ${this.numberField('Height', 'dimensions.height', state.dimensions.height, 2000, 3000, 50)}
        </div>
      </section>
    `;
  },

  renderFinishStep() {
    const state = this.state;
    return `
      <section class="form-section">
        <div class="section-heading"><h2>Frame color</h2><p>Powder-coated aluminium finish.</p></div>
        ${colorSwatches(FRAME_COLORS, state.roof.frameColor, 'roof.frameColor')}
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Louver color</h2></div>
        ${colorSwatches(LOUVER_COLORS, state.roof.louverColor, 'roof.louverColor')}
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Louver direction</h2><p>Controls the span direction of the roof blades.</p></div>
        <div class="visual-choice-grid">
          ${optionCard({ value: 'width', label: 'Across width', description: 'Louvers run left to right.', icon: './assets/profiles/louver-profile.svg' }, state.roof.orientation === 'width', 'roof.orientation')}
          ${optionCard({ value: 'depth', label: 'Across depth', description: 'Louvers run front to back.', icon: './assets/profiles/louver-profile.svg' }, state.roof.orientation === 'depth', 'roof.orientation')}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading section-heading--row">
          <div><h2>Louver tilt</h2><p>Adjust the opening angle of the roof blades.</p></div>
          <strong data-tilt-output>${state.roof.louverTilt}°</strong>
        </div>
        <input class="range-input" type="range" min="0" max="85" step="1" value="${state.roof.louverTilt}" data-path="roof.louverTilt" data-value-type="number" data-continuous="true" />
        <div class="range-labels"><span>Closed</span><span>Open</span></div>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Drainage</h2></div>
        ${segmented([
          { value: 'standard', label: 'Standard' },
          { value: 'integrated', label: 'Integrated' },
        ], state.roof.drainage, 'roof.drainage')}
      </section>
    `;
  },

  renderAutomationStep() {
    const automation = this.state.automation;
    const crank = findPoleMount(this.state, 'hand-crank');
    const switchCount = countPoleMounts(this.state, 'switch');

    return `
      <section class="form-section">
        <div class="section-heading section-heading--center"><h2>Automation</h2></div>
        <div class="option-grid option-grid--stacked">
          ${AUTOMATION_OPTIONS.map((option) => optionCard(
            option,
            automation === option.value,
            'automation',
            'option-card--large-icon',
          )).join('')}
        </div>
      </section>

      ${automation === 'manual' ? `
        <section class="form-section pole-placement-notice">
          <div class="section-heading">
            <h2>Hand-crank placement</h2>
            <p>Manual control requires one hand crank before the configuration can be completed.</p>
          </div>
          <div class="pole-placement-notice__status">
            <img src="./assets/icons/automation-manual.svg" alt="" />
            <span><strong>${crank ? 'Hand crank positioned' : 'Position required'}</strong><small>${crank ? `${getPoleLabel(this.state, crank.pole)}, ${capitalize(crank.face)} face` : 'Choose a pole and face before completing the configuration.'}</small></span>
          </div>
          <button type="button" class="secondary-action secondary-action--full" data-action="open-pole-customization">Configure pole components</button>
        </section>
      ` : ''}

      ${automation === 'wall-switch' ? `
        <section class="form-section pole-placement-notice">
          <div class="section-heading">
            <h2>Pergola-switch placement</h2>
            <p>At least one switch is required before the configuration can be completed. Additional switches can be placed on any available pole face.</p>
          </div>
          <div class="pole-placement-notice__status">
            <img src="./assets/icons/automation-switch.svg" alt="" />
            <span><strong>${switchCount} switch${switchCount === 1 ? '' : 'es'} configured</strong><small>Each component type can be placed once on each pole face</small></span>
          </div>
          <button type="button" class="secondary-action secondary-action--full" data-action="open-pole-customization">Configure pole components</button>
        </section>
      ` : ''}

      <section class="form-section">
        <div class="section-heading section-heading--center">
          <h2>Services</h2>
          <p>Multiple values can be selected.</p>
        </div>
        <div class="option-grid option-grid--stacked">
          ${SERVICE_OPTIONS.map((option) => {
            const selected = this.state.services[option.value];
            return `
              <button
                class="option-card option-card--large-icon ${selected ? 'is-selected' : ''}"
                type="button"
                data-action="toggle-service"
                data-service="${option.value}"
                aria-pressed="${selected}"
              >
                <span class="option-card__icon"><img src="${option.icon}" alt="" /></span>
                <span class="option-card__copy"><strong>${escapeHtml(option.label)}</strong></span>
                <span class="option-card__check" aria-hidden="true">✓</span>
              </button>
            `;
          }).join('')}
        </div>
      </section>
    `;
  },

  renderSidesStep() {
    const grid = getPoleGrid(this.state);
    if (this.activeSideSegment && !grid.segments.some((segment) => segment.id === this.activeSideSegment && segmentIsAvailable(this.state, segment.id))) {
      this.activeSideSegment = null;
    }

    const segmentId = this.activeSideSegment;
    const segment = segmentId ? getSideSegment(this.state, segmentId) : null;
    const config = segmentId ? getSideSegmentConfig(this.state, segmentId) : null;
    const blockedByPoleMounts = segmentId ? segmentHasMountedItems(this.state, segmentId) : false;
    const isScreen = config ? ['screen', 'motorized-screen'].includes(config.type) : false;
    const settings = isScreen ? config.screenSettings[config.type] : null;

    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>Choose a closing segment</h2>
          <p>Select a line between two adjacent poles. Poles are shown for reference but are not clickable in this section.</p>
        </div>
        ${renderPergolaGrid(this.state, { mode: 'segments', selectedSegment: segmentId })}
        <div class="pergola-grid__legend"><span><i class="legend-line"></i> Click a segment</span><span><i class="legend-line has-closing"></i> Closing configured</span></div>
      </section>

      ${!segmentId ? `
        <div class="info-banner">
          <strong>Select a grid segment.</strong>
          <span>Each horizontal or vertical space between adjacent poles can be configured independently.</span>
        </div>
      ` : `
        ${blockedByPoleMounts ? `
          <div class="info-banner info-banner--warning side-pole-conflict-warning">
            <strong>${escapeHtml(segmentDisplayLabel(this.state, segment))} is blocked by pole components.</strong>
            <span>Clear the two pole faces that point toward this segment before adding a screen, privacy wall or glass panel.</span>
          </div>
        ` : ''}

        <section class="form-section">
          <div class="section-heading"><h2>${escapeHtml(segmentDisplayLabel(this.state, segment))}</h2><p>${Math.round(segment.lengthMm / 10) / 100} m between pole centers.</p></div>
          <div class="side-option-grid">
            ${SIDE_OPTIONS.map((option) => optionCard(
              {
                ...option,
                disabled: blockedByPoleMounts && option.value !== 'none',
                disabledReason: 'Remove the components from both connected pole faces first.',
              },
              config.type === option.value,
              `sideSegments.${segmentId}.type`,
            )).join('')}
          </div>
        </section>

        ${isScreen ? `
          <section class="form-section">
            <div class="section-heading section-heading--row">
              <div>
                <h2>Screen position</h2>
                <p>${config.type === 'motorized-screen' ? 'Motorized' : 'Pull-down'} screen settings are remembered separately for this segment.</p>
              </div>
              <strong data-screen-openness-label>${Math.round(settings.openness)}% open</strong>
            </div>
            <input
              class="range-input"
              type="range"
              min="0"
              max="100"
              step="1"
              value="${settings.openness}"
              data-path="sideSegments.${segmentId}.screenSettings.${config.type}.openness"
              data-value-type="number"
              data-continuous="true"
            />
            <div class="range-labels"><span>Closed</span><span>Open</span></div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>Screen color</h2>
              <p>The selected color is stored independently for this screen type and segment.</p>
            </div>
            ${colorSwatches(
              SCREEN_COLORS,
              settings.color,
              `sideSegments.${segmentId}.screenSettings.${config.type}.color`,
            )}
          </section>
        ` : ''}

        ${config.type === 'privacy-wall' ? `
          <section class="form-section">
            <div class="section-heading">
              <h2>Privacy-wall color</h2>
              <p>The finish is remembered separately for this grid segment.</p>
            </div>
            ${colorSwatches(PRIVACY_WALL_COLORS, config.privacyColor, `sideSegments.${segmentId}.privacyColor`)}
          </section>
        ` : ''}
      `}
    `;
  },

  renderAccessoriesStep() {
    const accessories = this.state.accessories;
    const heaterCount = Object.values(accessories.heaters).filter(Boolean).length;

    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>Lighting</h2>
          <p>Lights are attached to fixed metal rails, independently of the moving louvers.</p>
        </div>
        ${this.accessoryToggleCard(
          'perimeterLed',
          'Perimeter LED strip',
          'Integrated lighting around all four beams.',
          accessories.perimeterLed.enabled,
          'toggle-led',
        )}
        ${accessories.perimeterLed.enabled ? `
          <div class="accessory-detail-panel">
            <div class="detail-heading"><strong>LED color</strong><small>Applied to all four strips</small></div>
            ${colorSwatches(LED_COLORS, accessories.perimeterLed.color, 'accessories.perimeterLed.color')}
          </div>
        ` : ''}

        <article class="accessory-card accessory-card--config ${accessories.spotlights > 0 ? 'is-selected' : ''}">
          ${this.accessoryModelMark('spotlights')}
          <div><strong>Integrated spotlights</strong><small>Downlights mounted below dedicated support rails.</small></div>
          <div class="counter-control">
            <button type="button" data-action="counter" data-key="spotlights" data-delta="-2" aria-label="Decrease spotlights">−</button>
            <output>${accessories.spotlights}</output>
            <button type="button" data-action="counter" data-key="spotlights" data-delta="2" aria-label="Increase spotlights">+</button>
          </div>
        </article>
      </section>

      <section class="form-section">
        <div class="section-heading">
          <h2>Infrared heaters</h2>
          <p>Select up to one inward-facing suspended heater per side. Metal rails keep heaters clear of side closings.</p>
        </div>
        <div class="accessory-summary-line">
          ${this.accessoryModelMark('heaters')}
          <span><strong>${heaterCount} selected</strong><small>Maximum four</small></span>
        </div>
        <div class="position-grid position-grid--four">
          ${HEATER_SIDES.map(({ value, label }) => `
            <button
              type="button"
              class="position-button ${accessories.heaters[value] ? 'is-selected' : ''}"
              data-action="toggle-heater-side"
              data-side="${value}"
              aria-pressed="${accessories.heaters[value]}"
            ><span>${label}</span><small>Suspended rail</small></button>
          `).join('')}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading">
          <h2>Weather sensors</h2>
          <p>Both sensors use fixed mounting plates and cannot occupy the same roof position.</p>
        </div>
        ${this.renderSensorControl('rain', 'Rain sensor')}
        ${this.renderSensorControl('wind', 'Wind sensor')}
      </section>

      ${this.renderPoleCustomization()}
    `;
  },

  accessoryModelMark(key) {
    const item = ACCESSORY_OPTIONS.find((option) => option.key === key);
    return `
      <span class="accessory-model-mark" title="${escapeHtml(item?.label ?? '')}">
        <img src="${item?.icon ?? './assets/icons/accessory-outlet.svg'}" alt="" />
      </span>
    `;
  },

  accessoryToggleCard(key, label, description, selected, action) {
    return `
      <button
        type="button"
        class="accessory-card ${selected ? 'is-selected' : ''}"
        data-action="${action}"
        data-key="${key}"
        aria-pressed="${selected}"
      >
        ${this.accessoryModelMark(key)}
        <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(description)}</small></span>
        <span class="toggle-indicator" aria-hidden="true"></span>
      </button>
    `;
  },

  renderSensorControl(type, label) {
    const sensors = this.state.accessories.sensors;
    const sensor = sensors[type];
    const otherType = type === 'rain' ? 'wind' : 'rain';
    const other = sensors[otherType];
    const markKey = type === 'rain' ? 'rainSensor' : 'windSensor';
    return `
      <div class="sensor-config ${sensor.enabled ? 'is-enabled' : ''}">
        <button
          type="button"
          class="accessory-card ${sensor.enabled ? 'is-selected' : ''}"
          data-action="toggle-sensor"
          data-sensor="${type}"
          aria-pressed="${sensor.enabled}"
        >
          ${this.accessoryModelMark(markKey)}
          <span><strong>${label}</strong><small>${type === 'rain' ? 'Detects precipitation and closes the louvers.' : 'Protects the roof during high winds.'}</small></span>
          <span class="toggle-indicator" aria-hidden="true"></span>
        </button>
        ${sensor.enabled ? `
          <div class="sensor-position-grid">
            ${SENSOR_POSITIONS.map((position) => {
              const occupied = other.enabled && other.position === position.value;
              return `
                <button
                  type="button"
                  class="sensor-position ${sensor.position === position.value ? 'is-selected' : ''} ${occupied ? 'is-occupied' : ''}"
                  data-option-path="accessories.sensors.${type}.position"
                  data-option-value="${position.value}"
                  aria-pressed="${sensor.position === position.value}"
                  ${occupied ? 'disabled aria-disabled="true" title="Occupied by the other sensor"' : ''}
                ><span>${position.label}</span>${occupied ? '<small>Occupied</small>' : ''}</button>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
  },

  renderPoleCustomization() {
    const conflicts = getPoleMountConflictMap(this.state);
    const totalMounts = countPoleMounts(this.state);
    const pole = this.activePole && poleIsAvailable(this.state, this.activePole) ? this.activePole : null;
    if (this.activePole && !pole) this.activePole = null;

    let selectedDetails = '';
    if (pole) {
      const face = POLE_FACES.some((item) => item.value === this.activePoleFace)
        ? this.activePoleFace
        : POLE_FACES[0].value;
      this.activePoleFace = face;

      const mounts = getPoleFaceMounts(this.state, pole, face);
      const configuredMounts = Object.entries(mounts).filter(([, mount]) => Boolean(mount));
      const faceAvailable = poleFaceIsAvailable(this.state, pole, face);
      const connectedSegmentId = getConnectedSegmentForPoleFace(this.state, pole, face);
      const connectedSegment = connectedSegmentId ? getSideSegment(this.state, connectedSegmentId) : null;
      const poleLabel = getPoleLabel(this.state, pole);
      const faceConflict = conflicts[pole]?.[face] ?? null;
      const conflictingTypes = new Set(faceConflict?.types ?? []);

      selectedDetails = `
        <div class="pole-customizer__group">
          <div class="detail-heading"><strong>2. Select a face</strong><small>${escapeHtml(poleLabel)} · ${capitalize(face)} face</small></div>
          <div class="pole-face-selector">
            ${POLE_FACES.map(({ value, label }) => {
              const faceMounts = getPoleFaceMounts(this.state, pole, value);
              const items = Object.entries(faceMounts).filter(([, mount]) => Boolean(mount));
              const available = poleFaceIsAvailable(this.state, pole, value);
              const segmentId = getConnectedSegmentForPoleFace(this.state, pole, value);
              const segment = segmentId ? getSideSegment(this.state, segmentId) : null;
              const invalid = Boolean(conflicts[pole]?.[value]);
              const status = items.length
                ? `${items.map(([type]) => poleMountLabel(type)).join(', ')}${invalid ? ' · overlapping' : ''}`
                : available
                  ? (segment ? `${segmentDisplayLabel(this.state, segment)} is open` : 'Exterior face available')
                  : (segment ? `${segmentDisplayLabel(this.state, segment)} has a closing` : 'Unavailable');
              return `
                <button type="button" class="pole-face-selector__button ${face === value ? 'is-selected' : ''} ${items.length ? 'is-occupied' : ''} ${invalid ? 'is-invalid' : ''}"
                  data-action="select-pole-face" data-face="${value}" aria-pressed="${face === value}">
                  <span>${label}</span><small>${escapeHtml(status)}</small>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pole-customizer__group pole-mount-editor ${faceAvailable ? '' : 'is-blocked'} ${faceConflict ? 'is-invalid' : ''}">
          <div class="detail-heading"><strong>3. Choose components</strong><small>${faceAvailable ? `${escapeHtml(poleLabel)} · ${capitalize(face)} face` : 'This face is reserved by a side closing'}</small></div>
          ${faceAvailable ? `
            <div class="pole-mount-type-grid">
              ${POLE_MOUNT_OPTIONS.map((option) => {
                const mount = mounts[option.value];
                const selected = Boolean(mount);
                const allowed = canPlacePoleMount(this.state, pole, face, option.value);
                const existingCrank = option.value === 'hand-crank' ? findPoleMount(this.state, 'hand-crank') : null;
                const availableHeight = selected
                  ? mount.height
                  : findAvailablePoleMountHeight(this.state, pole, face, option.value);
                let note = selected ? `Configured at ${mount.height}%` : 'Add to this face';
                if (!selected && availableHeight === null && allowed) note = 'Can be added, but no clear height is available';
                if (option.value === 'hand-crank') note = this.state.automation === 'manual'
                  ? (existingCrank && (existingCrank.pole !== pole || existingCrank.face !== face) ? 'Move the single crank here' : (selected ? `Configured at ${mount.height}%` : 'Single crank for the pergola'))
                  : 'Requires manual automation';
                if (option.value === 'switch') note = this.state.automation === 'wall-switch'
                  ? (selected ? `Configured at ${mount.height}%` : 'Add a pergola switch')
                  : 'Requires switch automation';
                return `
                  <button type="button" class="pole-mount-type ${selected ? 'is-selected' : ''} ${conflictingTypes.has(option.value) ? 'is-invalid' : ''}" data-action="add-pole-mount"
                    data-mount-type="${option.value}" aria-pressed="${selected}" ${allowed ? '' : 'disabled aria-disabled="true"'}>
                    <span class="pole-mount-type__icon"><img src="${option.icon}" alt="" /></span><span><strong>${option.label}</strong><small>${note}</small></span>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="pole-overlap-warning" role="alert" data-pole-overlap-warning ${faceConflict ? '' : 'hidden'}><strong>Overlapping items</strong><span>Move the outlined components until their vertical ranges no longer intersect.</span></div>
            ${configuredMounts.length
              ? `<div class="pole-mounted-items">${configuredMounts.map(([type, mount]) =>
                this.renderPoleMountEditor(pole, face, type, mount, false, conflictingTypes.has(type))).join('')}</div>`
              : '<div class="info-banner pole-mount-empty-note"><strong>This pole face is free.</strong><span>Add one or more different component types above.</span></div>'}
          ` : `
            <div class="info-banner info-banner--warning"><strong>Face unavailable</strong><span>${connectedSegment ? `${escapeHtml(segmentDisplayLabel(this.state, connectedSegment))} already contains a side closing.` : 'This face is unavailable for the selected installation.'}</span></div>
          `}
        </div>
      `;
    }

    return `
      <section class="form-section pole-customizer" data-pole-customizer>
        <div class="section-heading">
          <h2>Pole customization</h2>
          <p>Select a pole from the layout grid. Click the selected pole again to deselect it. Pole controls only appear while a pole is selected.</p>
        </div>
        <div class="accessory-summary-line ${hasPoleMountConflicts(this.state) ? 'is-invalid' : ''}">
          <span class="pole-customizer__summary-icon" aria-hidden="true"><img src="./assets/icons/pole-components.svg" alt="" /></span>
          <span><strong>${totalMounts} pole component${totalMounts === 1 ? '' : 's'}</strong><small>Red pole outlines identify poles containing overlapping items</small></span>
        </div>

        <div class="pole-customizer__group">
          <div class="detail-heading"><strong>1. Select a pole</strong><small>${pole ? escapeHtml(getPoleLabel(this.state, pole)) : 'No pole selected'}</small></div>
          ${renderPergolaGrid(this.state, { mode: 'poles', selectedPole: pole, conflicts })}
        </div>

        ${selectedDetails}
      </section>
    `;
  },

  renderPoleMountEditor(pole, face, type, mount, required = false, conflicting = false) {
    const limits = getPoleMountHeightLimits(type);
    const automationRequired = (type === 'hand-crank' && this.state.automation === 'manual')
      || (type === 'switch' && this.state.automation === 'wall-switch');
    return `
      <div class="pole-mount-settings ${conflicting ? 'is-invalid' : ''}" data-pole-mount-card="${pole}.${face}.${type}">
        <div class="pole-mount-settings__header">
          <span><strong>${poleMountLabel(type)}</strong><small>${automationRequired ? 'Required to complete the selected automation mode, but removable while editing' : 'One item of this type is allowed on this face'}</small></span>
          <button type="button" class="pole-mount-remove" data-action="remove-pole-mount" data-mount-type="${type}">Remove</button>
        </div>
        ${type === 'outlet' ? `
          <div class="pole-mount-setting-row">
            <span><strong>Outlet standard</strong><small>Configured independently for this outlet</small></span>
            ${segmented(OUTLET_TYPES, mount.outletType, `poleMounts.${pole}.${face}.${type}.outletType`)}
          </div>
        ` : ''}
        <label class="mount-height-control pole-mount-height-control">
          <div><strong>Mounting height</strong><output data-pole-mount-height-output="${pole}.${face}.${type}">${mount.height}%</output></div>
          <input class="range-input" type="range" min="${limits.min}" max="${limits.max}" step="1" value="${mount.height}"
            data-path="poleMounts.${pole}.${face}.${type}.height" data-value-type="number" data-continuous="true" />
          <div class="range-labels"><span>${limits.min}%</span><span>Roof-safe limit ${limits.max}%</span></div>
          <small class="pole-mount-height-hint">Overlaps are allowed while editing, but the configuration remains invalid until every conflict is resolved.</small>
        </label>
      </div>
    `;
  },

  renderSummaryStep() {
    const validationMessages = configurationValidationMessages(this.state);
    if (validationMessages.length) {
      return `
        <section class="invalid-configuration-message" role="alert">
          ${validationMessages.map((message) => `<strong>${escapeHtml(message)}</strong>`).join('')}
        </section>
      `;
    }
    const price = calculatePrice(this.state);
    return `
      <section class="summary-hero">
        <span>Your configuration</span>
        <strong>${formatMoney(price.total, this.state.currency, this.state.locale)}</strong>
        <small>Estimated total including demonstration tax.</small>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Configuration overview</h2></div>
        <dl class="configuration-overview">
          <div><dt>Model</dt><dd>${capitalize(this.state.model)}</dd></div>
          <div><dt>Installation</dt><dd>${capitalize(this.state.installation)}</dd></div>
          <div><dt>Size</dt><dd>${this.formatDimensionLine()}</dd></div>
          <div><dt>Roof</dt><dd>${capitalize(this.state.roof.orientation)} orientation, ${this.state.roof.louverTilt}° tilt</dd></div>
          <div><dt>Automation</dt><dd>${automationLabel(this.state.automation)}</dd></div>
          <div><dt>Pole components</dt><dd>${countPoleMounts(this.state)} configured</dd></div>
        </dl>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Estimated price</h2></div>
        <div class="price-breakdown">
          ${price.lines.filter((line) => line.value > 0).map((line) => `
            <div><span>${escapeHtml(line.label)}</span><strong>${formatMoney(line.value, this.state.currency, this.state.locale)}</strong></div>
          `).join('')}
          <div class="price-breakdown__subtotal"><span>Subtotal</span><strong>${formatMoney(price.subtotal, this.state.currency, this.state.locale)}</strong></div>
          <div><span>Estimated tax</span><strong>${formatMoney(price.tax, this.state.currency, this.state.locale)}</strong></div>
          <div class="price-breakdown__total"><span>Total</span><strong>${formatMoney(price.total, this.state.currency, this.state.locale)}</strong></div>
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>Request a quote</h2><p>This demo stores the inquiry locally; connect it to your API later.</p></div>
        <form class="quote-form" data-quote-form>
          ${this.textField('Full name', 'customer.name', this.state.customer.name, 'text', true)}
          ${this.textField('Email', 'customer.email', this.state.customer.email, 'email', true)}
          ${this.textField('Phone', 'customer.phone', this.state.customer.phone, 'tel', false)}
          ${this.textField('ZIP / postcode', 'customer.postcode', this.state.customer.postcode, 'text', false)}
          <label class="form-field form-field--full">
            <span>Project notes</span>
            <textarea data-path="customer.notes" data-continuous="true" rows="4" placeholder="Site details, preferred installation date…">${escapeHtml(this.state.customer.notes)}</textarea>
          </label>
          <button class="primary-button form-field--full" type="submit">Send inquiry</button>
        </form>
      </section>

      <section class="summary-actions">
        <button type="button" class="secondary-button" data-action="download-json">Download configuration</button>
        <button type="button" class="secondary-button" data-action="print">Print quote</button>
      </section>
    `;
  },

  renderFooter() {
    const price = calculatePrice(this.state);
    return `
      <div class="footer-price">
        <small>Estimated total</small>
        <strong>${formatMoney(price.total, this.state.currency, this.state.locale)}</strong>
      </div>
      <div class="footer-actions">
        <button class="secondary-button" type="button" data-action="snapshot">Snapshot</button>
        <button class="primary-button ${configurationValidationMessages(this.state).length ? 'is-invalid' : ''}" type="button" data-action="toggle-step-section" data-step-id="summary">Summary & quote</button>
      </div>
    `;
  },

  renderEnvironmentPanel() {
    const environment = this.state.environment;
    return `
      <div class="environment-panel__header">
        <strong>Light & orientation</strong>
        <button type="button" data-action="toggle-environment" aria-label="Close">×</button>
      </div>

      <label class="environment-control">
        <span><strong>Sun position</strong><output data-sun-output>${Math.round(environment.sunPosition * 100)}%</output></span>
        <input class="range-input" type="range" min="0" max="1" step="0.01" value="${environment.sunPosition}" data-path="environment.sunPosition" data-value-type="number" data-continuous="true" />
        <small><span>Morning</span><span>Evening</span></small>
      </label>

      <label class="environment-control">
        <span><strong>North direction</strong><output data-north-output>${environment.northDirection}°</output></span>
        <input class="range-input" type="range" min="0" max="360" step="1" value="${environment.northDirection}" data-path="environment.northDirection" data-value-type="number" data-continuous="true" />
        <small><span>0°</span><span>360°</span></small>
      </label>

      <div class="environment-control">
        <span><strong>Scene</strong></span>
        ${segmented([
          { value: 'winter', label: 'Winter' },
          { value: 'summer', label: 'Summer' },
          { value: 'studio', label: 'Studio' },
        ], environment.season, 'environment.season')}
      </div>

      <button type="button" class="night-toggle ${environment.night ? 'is-selected' : ''}" data-action="toggle-night" aria-pressed="${environment.night}">
        <span>☾</span>
        <span><strong>Night preview</strong><small>Preview the configured lighting.</small></span>
        <span class="toggle-indicator"></span>
      </button>
    `;
  },

  numberField(label, path, value, min, max, step) {
    const imperial = this.state.units === 'imperial';
    const displayValue = imperial ? (value / 25.4).toFixed(1) : value;
    const displayMin = imperial ? (min / 25.4).toFixed(1) : min;
    const displayMax = imperial ? (max / 25.4).toFixed(1) : max;
    const displayStep = imperial ? 1 : step;
    return `
      <label class="form-field">
        <span>${escapeHtml(label)}</span>
        <div class="number-input">
          <input type="number" value="${displayValue}" min="${displayMin}" max="${displayMax}" step="${displayStep}" data-path="${path}" data-value-type="number" ${imperial ? 'data-dimension-unit="inches"' : ''} />
          <small>${imperial ? 'in' : 'mm'}</small>
        </div>
      </label>
    `;
  },

  textField(label, path, value, type = 'text', required = false) {
    return `
      <label class="form-field">
        <span>${escapeHtml(label)}${required ? ' *' : ''}</span>
        <input type="${type}" value="${escapeHtml(value)}" data-path="${path}" data-continuous="true" ${required ? 'required' : ''} />
      </label>
    `;
  },

  formatCompactDimension(mm) {
    if (this.state.units === 'imperial') {
      const feet = mm / 304.8;
      return `${feet.toFixed(1)} ft`;
    }
    return `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)} m`;
  },

  formatDimensionLine() {
    return `${this.formatCompactDimension(this.state.dimensions.width)} × ${this.formatCompactDimension(this.state.dimensions.depth)} × ${this.formatCompactDimension(this.state.dimensions.height)}`;
  }
};
