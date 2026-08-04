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

const CAMERA_PRESETS = ['perspective', 'front', 'left', 'right', 'top'];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function optionCard({ value, label, description = '', icon = '', badge = '' }, selected, path, extraClass = '') {
  return `
    <button
      class="option-card ${selected ? 'is-selected' : ''} ${extraClass}"
      type="button"
      data-option-path="${path}"
      data-option-value="${value}"
      aria-pressed="${selected}"
    >
      ${icon ? `<span class="option-card__icon"><img src="${icon}" alt="" /></span>` : ''}
      <span class="option-card__copy">
        <strong>${escapeHtml(label)}</strong>
        ${description ? `<small>${escapeHtml(description)}</small>` : ''}
      </span>
      ${badge ? `<span class="option-card__badge">${escapeHtml(badge)}</span>` : ''}
      <span class="option-card__check" aria-hidden="true">✓</span>
    </button>
  `;
}

function segmented(options, selected, path) {
  return `
    <div class="segmented-control" role="group">
      ${options.map((option) => `
        <button
          type="button"
          class="segmented-control__item ${selected === option.value ? 'is-selected' : ''}"
          data-option-path="${path}"
          data-option-value="${option.value ?? 'off'}"
          aria-pressed="${selected === option.value}"
          ${option.disabled ? 'disabled aria-disabled="true"' : ''}
        >${escapeHtml(option.label)}</button>
      `).join('')}
    </div>
  `;
}

function colorSwatches(colors, selected, path) {
  return `
    <div class="color-grid">
      ${colors.map((color) => `
        <button
          type="button"
          class="color-swatch ${selected === color.value ? 'is-selected' : ''}"
          data-option-path="${path}"
          data-option-value="${color.value}"
          title="${escapeHtml(color.label)}"
          aria-label="${escapeHtml(color.label)}"
          aria-pressed="${selected === color.value}"
        >
          <span style="--swatch:${color.value}"></span>
          <small>${escapeHtml(color.label)}</small>
        </button>
      `).join('')}
    </div>
  `;
}

export class ConfiguratorUI {
  constructor(root, store) {
    this.root = root;
    this.store = store;
    this.state = store.get();
    this.scene = null;
    this.activeSide = 'front';
    this.activeOutletPole = 'frontLeft';
    this.environmentOpen = false;
    this.sidebarHidden = false;
    this.expandedStep = null;
    this.toastTimer = null;

    this.root.innerHTML = this.shellTemplate();
    this.stepContent = this.root.querySelector('[data-step-content]');
    this.stepTitle = this.root.querySelector('[data-step-title]');
    this.stepCounter = this.root.querySelector('[data-step-counter]');
    this.progress = this.root.querySelector('[data-progress]');
    this.sidebarFooter = this.root.querySelector('[data-sidebar-footer]');
    this.environmentPanel = this.root.querySelector('[data-environment-panel]');
    this.toast = this.root.querySelector('[data-toast]');
    this.modalRoot = this.root.querySelector('[data-modal-root]');

    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    this.root.addEventListener('submit', (event) => this.handleSubmit(event));

    this.unsubscribe = this.store.subscribe((state, meta) => this.onStateChange(state, meta));
  }

  attachScene(scene) {
    this.scene = scene;
  }

  shellTemplate() {
    return `
      <div class="app-shell">
        <header class="site-header">
          <a class="brand" href="#" aria-label="Pergola configurator home">
            <img src="./assets/360CONFIGURATOR.png" alt="360 Configurator" />
          </a>
          <div class="site-header__actions">
            <button class="text-button" type="button" data-action="save">Save</button>
            <button class="text-button" type="button" data-action="share">Share</button>
            <button class="text-button" type="button" data-action="reset">Reset</button>
            <button class="login-button" type="button" data-action="login">Login</button>
          </div>
        </header>

        <main class="configurator-layout">
          <section class="viewport" data-viewport aria-label="3D pergola preview">
            <div class="viewport-toolbar viewport-toolbar--left">
              <button class="round-tool" type="button" data-action="toggle-environment" aria-label="Sun and orientation settings" title="Sun and orientation">
                <span aria-hidden="true">☀</span>
              </button>
              <button class="round-tool is-active" type="button" data-action="toggle-dimensions" aria-label="Toggle dimensions" title="Toggle dimensions">
                <span aria-hidden="true">↔</span>
              </button>
              <button class="round-tool" type="button" data-action="toggle-compass" aria-label="Toggle compass" title="Toggle compass">
                <span aria-hidden="true">🧭</span>
              </button>
              <button class="round-tool" type="button" data-action="cycle-camera" aria-label="Change camera" title="Change camera">
                <span aria-hidden="true">⌖</span>
              </button>
            </div>

            <div class="viewport-toolbar viewport-toolbar--bottom">
              <button class="tool-pill" type="button" data-action="snapshot">Download image</button>
              <button class="tool-pill" type="button" data-action="view-ar">View in AR</button>
            </div>

            <section class="environment-panel" data-environment-panel aria-label="Lighting and orientation controls"></section>
            <div class="toast" data-toast role="status"></div>
          </section>

          <aside class="configurator-sidebar" aria-label="Pergola options">
            <button class="sidebar-collapse-handle" type="button" data-action="toggle-sidebar" aria-label="Hide or show menu">❯</button>
            <div class="sidebar-header sidebar-header--compact">
              <div>
                <span class="step-counter" data-step-counter></span>
                <h1 data-step-title>Pergola options</h1>
              </div>
            </div>

            <div class="sidebar-scroll" data-step-content></div>
            <footer class="sidebar-footer" data-sidebar-footer></footer>
          </aside>
        </main>
        <div data-modal-root></div>
      </div>
    `;
  }

  onStateChange(state, meta = {}) {
    this.state = state;
    if (meta.continuous) {
      this.syncContinuousValues();
      return;
    }
    this.render();
  }

  render() {
    this.stepTitle.textContent = 'Pergola options';
    this.stepCounter.textContent = '6 configurable groups';
    if (this.progress) this.progress.innerHTML = '';
    this.root.querySelector('.configurator-sidebar')?.classList.toggle('is-hidden', this.sidebarHidden);
    this.root.querySelector('.configurator-layout')?.classList.toggle('menu-hidden', this.sidebarHidden);

    this.stepContent.innerHTML = this.renderAccordionSections();
    this.sidebarFooter.innerHTML = this.renderFooter();
    this.environmentPanel.innerHTML = this.renderEnvironmentPanel();
    this.environmentPanel.classList.toggle('is-open', this.environmentOpen);
    this.syncToolbar();
  }

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
  }


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
  }

  renderAccordionSections() {
    return STEPS.map((step) => {
      const expanded = this.expandedStep === step.id;
      return `
        <section class="accordion-section ${expanded ? 'is-open' : ''}">
          <button type="button" class="accordion-toggle" data-action="toggle-step-section" data-step-id="${step.id}" aria-expanded="${expanded}">
            <span>${escapeHtml(step.label)}</span>
            <span class="accordion-toggle__arrow">▾</span>
          </button>
          ${expanded ? `<div class="accordion-panel">${this.renderStepById(step.id)}</div>` : ''}
        </section>
      `;
    }).join('');
  }

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
  }

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
  }

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
  }


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
  }


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
  }


  accessoryModelMark(key) {
    const item = ACCESSORY_OPTIONS.find((option) => option.key === key);
    return `
      <span class="accessory-model-mark" title="${escapeHtml(item?.label ?? '')}">
        <img src="${item?.icon ?? './assets/icons/accessory-outlet.svg'}" alt="" />
      </span>
    `;
  }


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
  }

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
  }


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
  }


  renderSummaryStep() {
    const price = calculatePrice(this.state);
    return `
      <section class="summary-hero">
        <span>Your configuration</span>
        <strong>${formatMoney(price.total)}</strong>
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
            <div><span>${escapeHtml(line.label)}</span><strong>${formatMoney(line.value)}</strong></div>
          `).join('')}
          <div class="price-breakdown__subtotal"><span>Subtotal</span><strong>${formatMoney(price.subtotal)}</strong></div>
          <div><span>Estimated tax</span><strong>${formatMoney(price.tax)}</strong></div>
          <div class="price-breakdown__total"><span>Total</span><strong>${formatMoney(price.total)}</strong></div>
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
  }

  renderFooter() {
    const price = calculatePrice(this.state);
    return `
      <div class="footer-price">
        <small>Estimated total</small>
        <strong>${formatMoney(price.total)}</strong>
      </div>
      <div class="footer-actions">
        <button class="secondary-button" type="button" data-action="snapshot">Snapshot</button>
        <button class="primary-button" type="button" data-action="toggle-step-section" data-step-id="summary">Summary & quote</button>
      </div>
    `;
  }

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
  }

  numberField(label, path, value, min, max, step) {
    return `
      <label class="form-field">
        <span>${escapeHtml(label)}</span>
        <div class="number-input">
          <input type="number" value="${value}" min="${min}" max="${max}" step="${step}" data-path="${path}" data-value-type="number" />
          <small>mm</small>
        </div>
      </label>
    `;
  }

  textField(label, path, value, type = 'text', required = false) {
    return `
      <label class="form-field">
        <span>${escapeHtml(label)}${required ? ' *' : ''}</span>
        <input type="${type}" value="${escapeHtml(value)}" data-path="${path}" data-continuous="true" ${required ? 'required' : ''} />
      </label>
    `;
  }

  formatCompactDimension(mm) {
    if (this.state.units === 'imperial') {
      const feet = mm / 304.8;
      return `${feet.toFixed(1)} ft`;
    }
    return `${(mm / 1000).toFixed(mm % 1000 === 0 ? 0 : 1)} m`;
  }

  formatDimensionLine() {
    return `${this.formatCompactDimension(this.state.dimensions.width)} × ${this.formatCompactDimension(this.state.dimensions.depth)} × ${this.formatCompactDimension(this.state.dimensions.height)}`;
  }

  handleClick(event) {
    const option = event.target.closest('[data-option-path]');
    if (option) {
      const updated = this.store.update(option.dataset.optionPath, option.dataset.optionValue);
      if (updated === false) this.showToast(this.store.getLastError?.() || 'That option cannot be placed there.');
      return;
    }

    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const { action } = actionTarget.dataset;

    if (action === 'next-step') {
      this.store.nextStep(STEPS.length - 1);
    } else if (action === 'previous-step') {
      this.store.previousStep();
    } else if (action === 'go-step') {
      this.store.update('step', Number(actionTarget.dataset.step));
    } else if (action === 'dimension-preset') {
      this.store.patch({ dimensions: {
        ...this.state.dimensions,
        width: Number(actionTarget.dataset.width),
        depth: Number(actionTarget.dataset.depth),
      } });
    } else if (action === 'toggle-service') {
      const key = actionTarget.dataset.service;
      this.store.update(`services.${key}`, !this.state.services[key]);
    } else if (action === 'select-side') {
      this.activeSide = actionTarget.dataset.side;
      this.render();
    } else if (action === 'counter') {
      const key = actionTarget.dataset.key;
      const delta = Number(actionTarget.dataset.delta);
      const current = Number(this.state.accessories[key]) || 0;
      const next = Math.min(12, Math.max(0, current + delta));
      this.store.update(`accessories.${key}`, next);
    } else if (action === 'toggle-led') {
      this.store.update('accessories.perimeterLed.enabled', !this.state.accessories.perimeterLed.enabled);
    } else if (action === 'toggle-heater-side') {
      const side = actionTarget.dataset.side;
      this.store.update(`accessories.heaters.${side}`, !this.state.accessories.heaters[side]);
    } else if (action === 'toggle-sensor') {
      const sensor = actionTarget.dataset.sensor;
      this.store.update(`accessories.sensors.${sensor}.enabled`, !this.state.accessories.sensors[sensor].enabled);
    } else if (action === 'toggle-speaker-pole') {
      const pole = actionTarget.dataset.pole;
      if (poleIsAvailable(this.state, pole)) {
        const updated = this.store.update(`accessories.speakers.${pole}`, !this.state.accessories.speakers[pole]);
        if (updated === false) this.showToast(this.store.getLastError?.() || 'That speaker cannot be placed there.');
      }
    } else if (action === 'select-outlet-pole') {
      this.activeOutletPole = actionTarget.dataset.pole;
      this.render();
    } else if (action === 'toggle-outlet-face') {
      const { pole, face } = actionTarget.dataset;
      const current = this.state.accessories.outlets[pole][face];
      const updated = this.store.update(`accessories.outlets.${pole}.${face}`, current === null ? { height: 50, type: 'eu' } : null);
      if (updated === false) this.showToast(this.store.getLastError?.() || 'That outlet cannot be placed there.');
    } else if (action === 'toggle-wall-switch') {
      const pole = actionTarget.dataset.pole;
      const current = this.state.automationSettings.wallSwitches[pole];
      const updated = this.store.update(`automationSettings.wallSwitches.${pole}`, current === null ? 55 : null);
      if (updated === false) this.showToast(this.store.getLastError?.() || 'That switch cannot be placed there.');
    } else if (action === 'toggle-step-section') {
      const stepId = actionTarget.dataset.stepId;
      this.expandedStep = this.expandedStep === stepId ? null : stepId;
      this.render();
    } else if (action === 'toggle-sidebar') {
      this.sidebarHidden = !this.sidebarHidden;
      this.render();
    } else if (action === 'toggle-environment') {
      this.environmentOpen = !this.environmentOpen;
      this.environmentPanel.classList.toggle('is-open', this.environmentOpen);
    } else if (action === 'toggle-dimensions') {
      this.store.update('view.dimensionsVisible', !this.state.view.dimensionsVisible);
    } else if (action === 'toggle-compass') {
      this.store.update('view.compassVisible', !this.state.view.compassVisible);
    } else if (action === 'cycle-camera') {
      const index = CAMERA_PRESETS.indexOf(this.state.view.cameraPreset);
      const next = CAMERA_PRESETS[(index + 1) % CAMERA_PRESETS.length];
      this.store.update('view.cameraPreset', next);
      this.showToast(`Camera: ${capitalize(next)}`);
    } else if (action === 'toggle-night') {
      this.store.update('environment.night', !this.state.environment.night);
    } else if (action === 'save') {
      this.store.notify({ save: true });
      this.showToast('Configuration saved in this browser.');
    } else if (action === 'share') {
      this.copyShareLink();
    } else if (action === 'reset') {
      if (window.confirm('Reset all pergola options?')) this.store.reset();
    } else if (action === 'snapshot') {
      this.downloadSnapshot();
    } else if (action === 'view-ar') {
      this.showModal('AR integration', `
        <p>This standalone pergola demo does not publish a GLB or USDZ yet.</p>
        <p>The button is intentionally present so the existing project AR pipeline can be connected in a later update.</p>
      `);
    } else if (action === 'download-json') {
      this.downloadJSON();
    } else if (action === 'print') {
      window.print();
    } else if (action === 'focus-quote') {
      this.root.querySelector('[data-quote-form]')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'close-modal') {
      this.modalRoot.innerHTML = '';
    } else if (action === 'login') {
      this.showModal('Demo login', '<p>Authentication is not connected in this frontend-only implementation.</p>');
    }
  }

  handleChange(event) {
    const input = event.target.closest('[data-path]');
    if (!input || input.dataset.continuous === 'true') return;
    this.updateFromInput(input, false);
  }

  handleInput(event) {
    const input = event.target.closest('[data-path][data-continuous="true"]');
    if (!input) return;
    this.updateFromInput(input, true);
  }

  updateFromInput(input, continuous) {
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (input.dataset.valueType === 'number') value = Number(value);
    const updated = this.store.update(input.dataset.path, value, { continuous });
    if (updated === false) {
      input.value = this.valueAtPath(input.dataset.path) ?? input.value;
      this.showToast(this.store.getLastError?.() || 'That position overlaps another component.');
    }
  }

  valueAtPath(path) {
    return path.split('.').reduce((value, key) => value?.[key], this.state);
  }

  handleSubmit(event) {
    if (!event.target.matches('[data-quote-form]')) return;
    event.preventDefault();
    const price = calculatePrice(this.state);
    const inquiry = {
      id: `PER-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      customer: this.state.customer,
      configuration: this.state,
      price,
    };
    window.localStorage.setItem('pergola-configurator:last-inquiry', JSON.stringify(inquiry));
    this.showModal('Inquiry prepared', `
      <p><strong>${escapeHtml(inquiry.id)}</strong> has been stored locally as a demo inquiry.</p>
      <p>Estimated total: <strong>${formatMoney(price.total)}</strong></p>
      <p>Connect the submit handler to the project backend, CRM or email workflow when the API is available.</p>
    `);
  }

  syncContinuousValues() {
    const sun = this.environmentPanel.querySelector('[data-sun-output]');
    const tilt = this.environmentPanel.querySelector('[data-tilt-output]');
    const north = this.environmentPanel.querySelector('[data-north-output]');
    const screen = this.stepContent.querySelector('[data-screen-openness-label]');
    if (sun) sun.textContent = `${Math.round(this.state.environment.sunPosition * 100)}%`;
    if (tilt) tilt.textContent = `${Math.round(this.state.roof.louverTilt)}°`;
    if (north) north.textContent = `${Math.round(this.state.environment.northDirection)}°`;
    if (screen) {
      const config = this.state.sides[this.activeSide];
      const openness = config.screenSettings?.[config.type]?.openness ?? 50;
      screen.textContent = `${Math.round(openness)}% open`;
    }
    const manualHeight = this.stepContent.querySelector('[data-manual-height-output]');
    if (manualHeight) manualHeight.textContent = `${this.state.automationSettings.manual.height}%`;
    this.stepContent.querySelectorAll('[data-switch-height-output]').forEach((output) => {
      const value = this.state.automationSettings.wallSwitches[output.dataset.switchHeightOutput];
      output.textContent = `${value}%`;
    });
    this.stepContent.querySelectorAll('[data-outlet-height-output]').forEach((output) => {
      const [pole, face] = output.dataset.outletHeightOutput.split('.');
      output.textContent = `${this.state.accessories.outlets[pole][face]?.height ?? 0}%`;
    });
  }

  syncToolbar() {
    const dimensionButton = this.root.querySelector('[data-action="toggle-dimensions"]');
    const compassButton = this.root.querySelector('[data-action="toggle-compass"]');
    dimensionButton?.classList.toggle('is-active', this.state.view.dimensionsVisible);
    compassButton?.classList.toggle('is-active', this.state.view.compassVisible);
    this.root.querySelector('.sidebar-collapse-handle')?.classList.toggle('is-hidden-state', this.sidebarHidden);
  }

  async copyShareLink() {
    const url = this.store.getShareUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.showToast('Share link copied.');
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  downloadSnapshot() {
    if (!this.scene) return;
    const anchor = document.createElement('a');
    anchor.href = this.scene.capturePNG();
    anchor.download = `pergola-${Date.now()}.png`;
    anchor.click();
    this.showToast('Preview image downloaded.');
  }

  downloadJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      configuration: this.state,
      estimate: calculatePrice(this.state),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `pergola-configuration-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  showToast(message) {
    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('is-visible'), 2600);
  }

  showModal(title, body) {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" data-action="close-modal">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onclick="event.stopPropagation()">
          <header><h2 id="modal-title">${escapeHtml(title)}</h2><button type="button" data-action="close-modal" aria-label="Close">×</button></header>
          <div class="modal__body">${body}</div>
          <footer><button class="primary-button" type="button" data-action="close-modal">Close</button></footer>
        </section>
      </div>
    `;
  }

  destroy() {
    this.unsubscribe?.();
  }
}
