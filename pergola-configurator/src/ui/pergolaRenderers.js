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
  canPlaceOutlet,
  poleFaceIsAvailable,
  poleIsAvailable,
  resolvePoleMountFace,
  resolveSpeakerFace,
} from '../state.js';
import { escapeHtml } from '../../../shared-ui/src/index.js';
import { optionCard, segmented, colorSwatches } from './renderHelpers.js';

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
    const manual = this.state.automationSettings.manual;
    const switches = this.state.automationSettings.wallSwitches;
    const switchCount = Object.values(switches).filter((value) => value !== null).length;

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
        <section class="form-section automation-mount-panel">
          <div class="section-heading">
            <h2>Hand-crank position</h2>
            <p>The crank uses a dedicated GLB model and is automatically placed on a free pole face.</p>
          </div>
          <div class="pole-grid">
            ${SUPPORT_POLES.map(({ value, label }) => {
              const available = poleIsAvailable(this.state, value)
                && Boolean(resolvePoleMountFace(this.state, 'manual', value, manual.height));
              return `
                <button
                  type="button"
                  class="pole-button ${manual.pole === value ? 'is-selected' : ''}"
                  data-option-path="automationSettings.manual.pole"
                  data-option-value="${value}"
                  aria-pressed="${manual.pole === value}"
                  ${available ? '' : 'disabled aria-disabled="true"'}
                ><span>${label}</span><small>${available ? 'Collision-free face' : 'No free mounting face'}</small></button>
              `;
            }).join('')}
          </div>
          <div class="mount-height-control">
            <div><strong>Mounting height</strong><output data-manual-height-output>${manual.height}%</output></div>
            <input class="range-input" type="range" min="10" max="80" step="1" value="${manual.height}"
              data-path="automationSettings.manual.height" data-value-type="number" data-continuous="true" />
            <div class="range-labels"><span>10%</span><span>80%</span></div>
          </div>
        </section>
      ` : ''}

      ${automation === 'wall-switch' ? `
        <section class="form-section automation-mount-panel">
          <div class="section-heading">
            <h2>Pergola switches</h2>
            <p>Select up to one switch per existing support pole. Each selected switch has a continuous 10–80% height control.</p>
          </div>
          <div class="accessory-summary-line">
            <span class="accessory-model-mark"><img src="./assets/icons/automation-switch.svg" alt="" /></span>
            <span><strong>${switchCount} selected</strong><small>Maximum four</small></span>
          </div>
          <div class="switch-pole-list">
            ${SUPPORT_POLES.map(({ value, label }) => {
              const selected = switches[value] !== null;
              const available = poleIsAvailable(this.state, value);
              const face = selected ? resolvePoleMountFace(this.state, 'switch', value, switches[value]) : null;
              return `
                <article class="switch-pole-row ${selected ? 'is-selected' : ''}">
                  <div>
                    <strong>${label}</strong>
                    <small>${available ? (face ? `${capitalize(face)} face` : 'Enable to place') : 'No support pole'}</small>
                  </div>
                  <button type="button" class="compact-toggle ${selected ? 'is-selected' : ''}"
                    data-action="toggle-wall-switch" data-pole="${value}" aria-pressed="${selected}"
                    ${available ? '' : 'disabled aria-disabled="true"'}>${selected ? 'On' : 'Off'}</button>
                  ${selected ? `
                    <label class="inline-range">
                      <span><output data-switch-height-output="${value}">${switches[value]}%</output></span>
                      <input class="range-input" type="range" min="10" max="80" step="1" value="${switches[value]}"
                        data-path="automationSettings.wallSwitches.${value}" data-value-type="number" data-continuous="true" />
                    </label>
                  ` : ''}
                </article>
              `;
            }).join('')}
          </div>
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
        <section class="form-section">
          <div class="section-heading"><h2>${capitalize(this.activeSide)} side</h2></div>
          <div class="side-option-grid">
            ${SIDE_OPTIONS.map((option) => optionCard(
              option,
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
    const speakerCount = Object.values(accessories.speakers).filter(Boolean).length;
    const outletCount = Object.values(accessories.outlets).reduce(
      (total, faces) => total + Object.values(faces).filter((value) => value !== null).length,
      0,
    );

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

      <section class="form-section">
        <div class="section-heading">
          <h2>Outdoor speakers</h2>
          <p>One speaker per support pole. The configurator chooses an unobstructed vertical mounting face.</p>
        </div>
        <div class="accessory-summary-line">
          ${this.accessoryModelMark('speakers')}
          <span><strong>${speakerCount} selected</strong><small>Wall and outlet collisions are prevented</small></span>
        </div>
        <div class="pole-grid">
          ${SUPPORT_POLES.map(({ value, label }) => {
            const available = poleIsAvailable(this.state, value)
              && (!accessories.speakers[value] || Boolean(resolveSpeakerFace(this.state, value)));
            return `
              <button
                type="button"
                class="pole-button ${accessories.speakers[value] ? 'is-selected' : ''}"
                data-action="toggle-speaker-pole"
                data-pole="${value}"
                aria-pressed="${accessories.speakers[value]}"
                ${available ? '' : 'disabled aria-disabled="true"'}
              ><span>${label}</span><small>${available ? 'Free mounting face' : 'No collision-free face'}</small></button>
            `;
          }).join('')}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading">
          <h2>Electrical outlets</h2>
          <p>Exterior pole faces are always available. Interior faces are available only while the adjacent side is open.</p>
        </div>
        <div class="accessory-summary-line">
          ${this.accessoryModelMark('outlets')}
          <span><strong>${outletCount} selected</strong><small>Each outlet can use its own EU or US standard</small></span>
        </div>
        <div class="outlet-pole-tabs">
          ${SUPPORT_POLES.map(({ value, label }) => {
            const available = poleIsAvailable(this.state, value);
            return `
              <button
                type="button"
                class="outlet-pole-tab ${this.activeOutletPole === value ? 'is-selected' : ''}"
                data-action="select-outlet-pole"
                data-pole="${value}"
                ${available ? '' : 'disabled aria-disabled="true"'}
              >${label}</button>
            `;
          }).join('')}
        </div>
        ${this.renderOutletPole()}
      </section>
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

  renderOutletPole() {
    const pole = this.activeOutletPole;
    const available = poleIsAvailable(this.state, pole);
    if (!available) {
      const firstAvailable = SUPPORT_POLES.find((item) => poleIsAvailable(this.state, item.value));
      if (firstAvailable) {
        this.activeOutletPole = firstAvailable.value;
        return this.renderOutletPole();
      }
      return '<div class="info-banner"><strong>No support poles are available.</strong></div>';
    }

    const faces = this.state.accessories.outlets[pole];
    return `
      <div class="outlet-face-list">
        ${POLE_FACES.map(({ value, label }) => {
          const mount = faces[value];
          const enabled = mount !== null;
          const faceAvailable = poleFaceIsAvailable(this.state, pole, value);
          const collisionFree = enabled || canPlaceOutlet(this.state, pole, value, { height: 50, type: 'eu' });
          const selectable = faceAvailable && collisionFree;
          return `
            <article class="outlet-face-row ${enabled ? 'is-selected' : ''} ${selectable ? '' : 'is-disabled'}">
              <div>
                <strong>${label}</strong>
                <small>${!faceAvailable
                  ? 'Blocked by an adjacent side closing'
                  : !collisionFree
                    ? 'No collision-free default position'
                    : enabled
                      ? `${mount.height}% of pole height · ${mount.type === 'us' ? 'US' : 'EU'} outlet`
                      : 'Available mounting face'}</small>
              </div>
              <button type="button" class="compact-toggle ${enabled ? 'is-selected' : ''}"
                data-action="toggle-outlet-face" data-pole="${pole}" data-face="${value}"
                aria-pressed="${enabled}" ${selectable ? '' : 'disabled aria-disabled="true"'}>${enabled ? 'On' : 'Off'}</button>
              ${enabled ? `
                <div class="inline-field-stack">
                  <div class="outlet-type-row">${segmented(OUTLET_TYPES, mount.type, `accessories.outlets.${pole}.${value}.type`)}</div>
                  <label class="inline-range inline-range--full">
                    <span><output data-outlet-height-output="${pole}.${value}">${mount.height}%</output></span>
                    <input class="range-input" type="range" min="10" max="80" step="1" value="${mount.height}"
                      data-path="accessories.outlets.${pole}.${value}.height" data-value-type="number" data-continuous="true" />
                  </label>
                </div>
              ` : ''}
            </article>
          `;
        }).join('')}
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
