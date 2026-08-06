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
  SUPPORT_POLES,
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
  getConnectedSideForPoleFace,
  getPoleMountHeightLimits,
  poleFaceIsAvailable,
  poleIsAvailable,
  sideHasMountedItems,
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
          ${this.numberField('Width', 'dimensions.width', state.dimensions.width, 2500, 8000, 100)}
          ${this.numberField('Depth', 'dimensions.depth', state.dimensions.depth, 2000, 6000, 100)}
          ${this.numberField('Height', 'dimensions.height', state.dimensions.height, 2200, 3200, 50)}
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
            <p>Manual control requires exactly one crank for the whole pergola.</p>
          </div>
          <div class="pole-placement-notice__status">
            <img src="./assets/icons/automation-manual.svg" alt="" />
            <span><strong>${crank ? 'Hand crank positioned' : 'Position required'}</strong><small>${crank ? `${SUPPORT_POLES.find((item) => item.value === crank.pole)?.label}, ${capitalize(crank.face)} face` : 'Choose a pole and face before completing the configuration.'}</small></span>
          </div>
          <button type="button" class="secondary-action secondary-action--full" data-action="open-pole-customization">Configure pole components</button>
        </section>
      ` : ''}

      ${automation === 'wall-switch' ? `
        <section class="form-section pole-placement-notice">
          <div class="section-heading">
            <h2>Pergola-switch placement</h2>
            <p>At least one switch is required. Additional switches can be placed on any free pole face.</p>
          </div>
          <div class="pole-placement-notice__status">
            <img src="./assets/icons/automation-switch.svg" alt="" />
            <span><strong>${switchCount} switch${switchCount === 1 ? '' : 'es'} configured</strong><small>Maximum one component on each pole face</small></span>
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
    const config = this.state.sides[this.activeSide];
    const disabledByWall = this.state.installation === 'wall-mounted' && this.state.mountedSide === this.activeSide;
    const blockedByPoleMounts = sideHasMountedItems(this.state, this.activeSide);
    const isScreen = ['screen', 'motorized-screen'].includes(config.type);
    const settings = isScreen ? config.screenSettings[config.type] : null;

    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>Choose a side</h2>
          <p>Each side can use a different closing system.</p>
        </div>
        <div class="side-tabs">
          ${SIDE_NAMES.map((side) => `
            <button
              type="button"
              class="side-tab ${side === this.activeSide ? 'is-selected' : ''}"
              data-action="select-side"
              data-side="${side}"
            >
              <span>${capitalize(side)}</span>
              <small>${sideLabel(this.state.sides[side].type)}</small>
            </button>
          `).join('')}
        </div>
      </section>

      ${disabledByWall ? `
        <div class="info-banner">
          <strong>${capitalize(this.activeSide)} is attached to the building.</strong>
          <span>Side closings are not available on the mounted edge.</span>
        </div>
      ` : `
        ${blockedByPoleMounts ? `
          <div class="info-banner info-banner--warning side-pole-conflict-warning">
            <strong>${capitalize(this.activeSide)} closing is blocked by pole components.</strong>
            <span>Clear the two pole faces that point toward each other across this side before adding a screen, wall or glass panel.</span>
          </div>
        ` : ''}
        <section class="form-section">
          <div class="section-heading"><h2>${capitalize(this.activeSide)} side</h2></div>
          <div class="side-option-grid">
            ${SIDE_OPTIONS.map((option) => optionCard(
              {
                ...option,
                disabled: blockedByPoleMounts && option.value !== 'none',
                disabledReason: 'Remove the components from both connected pole faces first.',
              },
              config.type === option.value,
              `sides.${this.activeSide}.type`,
            )).join('')}
          </div>
        </section>

        ${isScreen ? `
          <section class="form-section">
            <div class="section-heading section-heading--row">
              <div>
                <h2>Screen position</h2>
                <p>${config.type === 'motorized-screen' ? 'Motorized' : 'Pull-down'} screen settings are remembered separately.</p>
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
              data-path="sides.${this.activeSide}.screenSettings.${config.type}.openness"
              data-value-type="number"
              data-continuous="true"
            />
            <div class="range-labels"><span>Closed</span><span>Open</span></div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>Screen color</h2>
              <p>The selected color is stored independently for this screen type and side.</p>
            </div>
            ${colorSwatches(
              SCREEN_COLORS,
              settings.color,
              `sides.${this.activeSide}.screenSettings.${config.type}.color`,
            )}
          </section>
        ` : ''}

        ${config.type === 'privacy-wall' ? `
          <section class="form-section">
            <div class="section-heading">
              <h2>Privacy-wall color</h2>
              <p>The finish is remembered separately for every side.</p>
            </div>
            ${colorSwatches(PRIVACY_WALL_COLORS, config.privacyColor, `sides.${this.activeSide}.privacyColor`)}
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
    let pole = this.activePole;
    if (!poleIsAvailable(this.state, pole)) {
      pole = SUPPORT_POLES.find((item) => poleIsAvailable(this.state, item.value))?.value ?? SUPPORT_POLES[0].value;
      this.activePole = pole;
    }

    const face = POLE_FACES.some((item) => item.value === this.activePoleFace)
      ? this.activePoleFace
      : POLE_FACES[0].value;
    this.activePoleFace = face;

    const mount = this.state.poleMounts[pole]?.[face] ?? null;
    const faceAvailable = poleFaceIsAvailable(this.state, pole, face);
    const connectedSide = getConnectedSideForPoleFace(pole, face);
    const totalMounts = countPoleMounts(this.state);
    const poleLabel = SUPPORT_POLES.find((item) => item.value === pole)?.label ?? pole;
    const mountIsRequired = Boolean(mount) && (
      (mount.type === 'hand-crank' && this.state.automation === 'manual' && countPoleMounts(this.state, 'hand-crank') === 1)
      || (mount.type === 'switch' && this.state.automation === 'wall-switch' && countPoleMounts(this.state, 'switch') === 1)
    );

    return `
      <section class="form-section pole-customizer" data-pole-customizer>
        <div class="section-heading">
          <h2>Pole customization</h2>
          <p>Select a pole, then a face. Every face accepts a maximum of one component and uses a roof-safe height range.</p>
        </div>
        <div class="accessory-summary-line">
          <span class="pole-customizer__summary-icon" aria-hidden="true">▥</span>
          <span><strong>${totalMounts} pole component${totalMounts === 1 ? '' : 's'}</strong><small>Walls and mounted components reserve the same connected pole faces</small></span>
        </div>

        <div class="pole-customizer__group">
          <div class="detail-heading"><strong>1. Select a pole</strong><small>${poleLabel}</small></div>
          <div class="pole-selector">
            ${SUPPORT_POLES.map(({ value, label }) => {
              const available = poleIsAvailable(this.state, value);
              const occupied = Object.values(this.state.poleMounts[value] ?? {}).filter(Boolean).length;
              return `
                <button type="button" class="pole-selector__button ${pole === value ? 'is-selected' : ''}"
                  data-action="select-pole" data-pole="${value}" aria-pressed="${pole === value}"
                  ${available ? '' : 'disabled aria-disabled="true"'}>
                  <span>${label}</span><small>${available ? `${occupied}/4 faces occupied` : 'No pole in this installation'}</small>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pole-customizer__group">
          <div class="detail-heading"><strong>2. Select a face</strong><small>${capitalize(face)} face</small></div>
          <div class="pole-face-selector">
            ${POLE_FACES.map(({ value, label }) => {
              const item = this.state.poleMounts[pole]?.[value] ?? null;
              const available = poleFaceIsAvailable(this.state, pole, value);
              const side = getConnectedSideForPoleFace(pole, value);
              const status = item
                ? `${poleMountLabel(item.type)} · ${item.height}%`
                : available
                  ? (side ? `Open toward ${side} side` : 'Exterior face available')
                  : (side ? `${capitalize(side)} side closing occupies this face` : 'Unavailable');
              return `
                <button type="button" class="pole-face-selector__button ${face === value ? 'is-selected' : ''} ${item ? 'is-occupied' : ''}"
                  data-action="select-pole-face" data-face="${value}" aria-pressed="${face === value}">
                  <span>${label}</span><small>${status}</small>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pole-customizer__group pole-mount-editor ${faceAvailable ? '' : 'is-blocked'}">
          <div class="detail-heading"><strong>3. Choose a component</strong><small>${faceAvailable ? `${poleLabel} · ${capitalize(face)} face` : 'This face is reserved by a side closing'}</small></div>
          ${faceAvailable ? `
            <div class="pole-mount-type-grid">
              <button type="button" class="pole-mount-type ${mount === null ? 'is-selected' : ''}" data-action="set-pole-mount" data-mount-type="none" aria-pressed="${mount === null}"
                ${mountIsRequired ? 'disabled aria-disabled="true" title="Move or add the required automation control before clearing this face"' : ''}>
                <span class="pole-mount-type__icon pole-mount-type__icon--empty">×</span><span><strong>Empty</strong><small>${mountIsRequired ? 'Required automation control' : 'Keep this face free'}</small></span>
              </button>
              ${POLE_MOUNT_OPTIONS.map((option) => {
                const selected = mount?.type === option.value;
                const allowed = canPlacePoleMount(this.state, pole, face, option.value)
                  && (!mountIsRequired || selected);
                const existingCrank = option.value === 'hand-crank' ? findPoleMount(this.state, 'hand-crank') : null;
                let note = 'Place on this face';
                if (option.value === 'hand-crank') note = this.state.automation === 'manual'
                  ? (existingCrank && (existingCrank.pole !== pole || existingCrank.face !== face) ? 'Move the single crank here' : 'Single crank for the pergola')
                  : 'Requires manual automation';
                if (option.value === 'switch') note = this.state.automation === 'wall-switch'
                  ? 'Add a pergola switch'
                  : 'Requires switch automation';
                return `
                  <button type="button" class="pole-mount-type ${selected ? 'is-selected' : ''}" data-action="set-pole-mount"
                    data-mount-type="${option.value}" aria-pressed="${selected}" ${allowed ? '' : 'disabled aria-disabled="true"'}>
                    <span class="pole-mount-type__icon"><img src="${option.icon}" alt="" /></span><span><strong>${option.label}</strong><small>${note}</small></span>
                  </button>
                `;
              }).join('')}
            </div>
            ${mount ? this.renderPoleMountEditor(pole, face, mount, mountIsRequired) : '<div class="info-banner pole-mount-empty-note"><strong>This pole face is free.</strong><span>Select a component above to configure its mounting height.</span></div>'}
          ` : `
            <div class="info-banner info-banner--warning"><strong>Face unavailable</strong><span>Set the ${connectedSide ? `${connectedSide} side` : 'connected side'} to Open side before mounting a component here.</span></div>
          `}
        </div>
      </section>
    `;
  },

  renderPoleMountEditor(pole, face, mount, required = false) {
    const limits = getPoleMountHeightLimits(mount.type);
    return `
      <div class="pole-mount-settings">
        <div class="pole-mount-settings__header">
          <span><strong>${poleMountLabel(mount.type)}</strong><small>${required ? 'Required by the selected automation mode' : 'Maximum one component on this face'}</small></span>
          <button type="button" class="pole-mount-remove" data-action="set-pole-mount" data-mount-type="none"
            ${required ? 'disabled aria-disabled="true" title="Move or add the required automation control first"' : ''}>${required ? 'Required' : 'Remove'}</button>
        </div>
        ${mount.type === 'outlet' ? `
          <div class="pole-mount-setting-row">
            <span><strong>Outlet standard</strong><small>Configured independently for this face</small></span>
            ${segmented(OUTLET_TYPES, mount.outletType, `poleMounts.${pole}.${face}.outletType`)}
          </div>
        ` : ''}
        <label class="mount-height-control pole-mount-height-control">
          <div><strong>Mounting height</strong><output data-pole-mount-height-output="${pole}.${face}">${mount.height}%</output></div>
          <input class="range-input" type="range" min="${limits.min}" max="${limits.max}" step="1" value="${mount.height}"
            data-path="poleMounts.${pole}.${face}.height" data-value-type="number" data-continuous="true" />
          <div class="range-labels"><span>${limits.min}%</span><span>Roof-safe limit ${limits.max}%</span></div>
          <small class="pole-mount-height-hint">Positions that would overlap another component on this pole are blocked.</small>
        </label>
      </div>
    `;
  },

  renderSummaryStep() {
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
        <button class="primary-button" type="button" data-action="toggle-step-section" data-step-id="summary">Summary & quote</button>
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
        <span><strong>Louvers tilt</strong><output data-tilt-output>${this.state.roof.louverTilt}°</output></span>
        <input class="range-input" type="range" min="0" max="85" step="1" value="${this.state.roof.louverTilt}" data-path="roof.louverTilt" data-value-type="number" data-continuous="true" />
        <small><span>Closed</span><span>Open</span></small>
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
