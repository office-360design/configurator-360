import {
  ACCESSORY_OPTIONS,
  AUTOMATION_OPTIONS,
  DIMENSION_PRESETS,
  FRAME_COLORS,
  LED_COLORS,
  LOUVER_COLORS,
  MODEL_OPTIONS,
  OUTLET_TYPES,
  POLE_FACES,
  PRIVACY_WALL_COLORS,
  SCREEN_COLORS,
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
  getBoundaryHeaterSegments,
  getConnectedSegmentForPoleFace,
  getHeaterConfig,
  getPoleFaceMounts,
  getPoleGrid,
  getPoleLabel,
  getPoleSensor,
  getPergolaConfigurationIssues,
  getRoofRectangles,
  getSpotlightRectangleCapacity,
  getSpotlightRectangleCount,
  getTotalSpotlights,
  countHeaters,
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
import {
  localizeCatalogOptions,
  localizePoleLabel,
  localizeRoofRectangleLabel,
  localizeStep,
  pergolaPlural,
  pergolaT,
  pergolaValueLabel,
} from '../i18n.js';
import { optionCard, segmented, colorSwatches } from './renderHelpers.js';

const POLE_MOUNT_OPTIONS = [
  { value: 'speaker', icon: './assets/icons/accessory-speaker.svg' },
  { value: 'outlet', icon: './assets/icons/accessory-outlet.svg' },
  { value: 'hand-crank', icon: './assets/icons/automation-manual.svg' },
  { value: 'switch', icon: './assets/icons/automation-switch.svg' },
];

function poleMountLabel(type, locale) {
  return pergolaT(locale, `pole.component.${type}`) || pergolaT(locale, 'pole.component.generic');
}

function configurationValidationMessages(state, locale) {
  return getPergolaConfigurationIssues(state).map((issue) => pergolaT(locale, `validation.${issue.code}`));
}


function segmentDisplayLabel(state, segmentOrId, locale) {
  const segment = typeof segmentOrId === 'string' ? getSideSegment(state, segmentOrId) : segmentOrId;
  if (!segment) return pergolaT(locale, 'segment.grid');
  if (segment.boundary) {
    const ordinal = segment.axis === 'horizontal' ? segment.column + 1 : segment.row + 1;
    return pergolaT(locale, 'segment.boundary', {
      side: pergolaValueLabel(locale, 'side', segment.boundary),
      ordinal,
    });
  }
  return segment.axis === 'horizontal'
    ? pergolaT(locale, 'segment.interiorRow', { row: segment.row + 1, segment: segment.column + 1 })
    : pergolaT(locale, 'segment.interiorColumn', { column: segment.column + 1, segment: segment.row + 1 });
}

export function renderPergolaGrid(state, options = {}, locale = state.locale) {
  const grid = getPoleGrid(state);
  const mode = options.mode === 'segments' ? 'segments' : 'poles';
  const conflicts = options.conflicts ?? {};
  const segmentAction = options.segmentAction ?? 'select-side-segment';
  const configuredSegments = options.configuredSegments ?? null;
  const configuredClass = options.configuredClass ?? 'has-closing';
  const aspect = Math.min(3.2, Math.max(0.7, grid.width / grid.depth));
  const xPercent = (column) => grid.columns <= 1 ? 50 : (column / (grid.columns - 1)) * 100;
  // Front is the viewer-facing edge, so it belongs at the bottom of the plan view.
  const yPercent = (row) => grid.rows <= 1 ? 50 : 100 - (row / (grid.rows - 1)) * 100;

  const segmentMarkup = grid.segments.map((segment) => {
    const available = segmentIsAvailable(state, segment.id);
    const configured = configuredSegments
      ? configuredSegments.has(segment.id)
      : getSideSegmentConfig(state, segment.id).type !== 'none';
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
      configured ? configuredClass : '',
      blocked ? 'is-blocked' : '',
      selected ? 'is-selected' : '',
      available ? '' : 'is-unavailable',
    ].filter(Boolean).join(' ');
    if (mode === 'segments') {
      return `<button type="button" class="${classes}" style="${style}" data-action="${segmentAction}" data-segment="${segment.id}" aria-pressed="${selected}" title="${escapeHtml(segmentDisplayLabel(state, segment, locale))}" ${available ? '' : 'disabled aria-disabled="true"'}><span></span></button>`;
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
      return `<button type="button" class="${classes}" style="${style}" data-action="select-pole" data-pole="${pole.id}" aria-pressed="${selected}" title="${escapeHtml(localizePoleLabel(locale, pole.label))}" ${available ? '' : 'disabled aria-disabled="true"'}><span></span></button>`;
    }
    return `<span class="${classes}" style="${style}" title="${escapeHtml(localizePoleLabel(locale, pole.label))}" aria-hidden="true"><span></span></span>`;
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

export function renderRoofRectangleGrid(state, selectedRectangle = null, locale = state.locale) {
  const grid = getPoleGrid(state);
  const rectangles = getRoofRectangles(state);
  const aspect = Math.min(3.2, Math.max(0.7, grid.width / grid.depth));
  const xPercent = (column) => grid.columns <= 1 ? 50 : (column / (grid.columns - 1)) * 100;
  const yPercent = (row) => grid.rows <= 1 ? 50 : 100 - (row / (grid.rows - 1)) * 100;

  const cells = rectangles.map((rectangle) => {
    const left = xPercent(rectangle.column);
    const right = xPercent(rectangle.column + 1);
    const first = yPercent(rectangle.row);
    const second = yPercent(rectangle.row + 1);
    const top = Math.min(first, second);
    const bottom = Math.max(first, second);
    const count = getSpotlightRectangleCount(state, rectangle.id);
    const selected = rectangle.id === selectedRectangle;
    return `
      <button type="button" class="roof-rectangle ${selected ? 'is-selected' : ''} ${count ? 'has-lights' : ''}"
        style="left:${left}%;top:${top}%;width:${right - left}%;height:${bottom - top}%;"
        data-action="select-roof-rectangle" data-rectangle="${rectangle.id}" aria-pressed="${selected}"
        title="${escapeHtml(localizeRoofRectangleLabel(locale, rectangle.label))}">
        <span>${count || ''}</span>
      </button>
    `;
  }).join('');

  const poles = grid.poles.map((pole) => `
    <span class="roof-rectangle-grid__pole" style="left:${xPercent(pole.column)}%;top:${yPercent(pole.row)}%;" aria-hidden="true"></span>
  `).join('');

  return `
    <div class="roof-rectangle-grid" style="--pergola-grid-aspect:${aspect};">
      <div class="roof-rectangle-grid__canvas">
        ${cells}
        ${poles}
      </div>
    </div>
  `;
}

function heaterSegmentLabel(state, segment, locale) {
  return segmentDisplayLabel(state, segment, locale);
}

function heaterDirectionLabels(segment, locale) {
  if (!segment) return { first: pergolaT(locale, 'heater.firstSide'), second: pergolaT(locale, 'heater.secondSide') };
  return segment.axis === 'horizontal'
    ? { first: pergolaT(locale, 'heater.frontFacing'), second: pergolaT(locale, 'heater.backFacing') }
    : { first: pergolaT(locale, 'heater.leftFacing'), second: pergolaT(locale, 'heater.rightFacing') };
}

function renderHeaterSideSelector(state, selectedSegment, locale = state.locale) {
  const configuredSegments = new Set(
    getBoundaryHeaterSegments(state)
      .filter((segment) => Boolean(getHeaterConfig(state, segment.id)))
      .map((segment) => segment.id),
  );
  return `
    ${renderPergolaGrid(state, {
      mode: 'segments',
      selectedSegment,
      segmentAction: 'select-heater-segment',
      configuredSegments,
      configuredClass: 'has-heater',
    }, locale)}
    <div class="pergola-grid__legend heater-grid-legend">
      <span><i class="legend-line"></i> ${escapeHtml(pergolaT(locale, 'accessories.clickBeamSpan'))}</span>
      <span><i class="legend-line has-heater"></i> ${escapeHtml(pergolaT(locale, 'accessories.heaterConfigured'))}</span>
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
    return STEPS.map((rawStep) => {
      const step = localizeStep(this.state.locale, rawStep);
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
    const locale = state.locale;
    const modelOptions = localizeCatalogOptions(locale, 'model', MODEL_OPTIONS);
    const isWallMounted = state.installation === 'wall-mounted';
    const currentPreset = DIMENSION_PRESETS.find(
      ([width, depth]) => width === state.dimensions.width && depth === state.dimensions.depth,
    );
    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>${escapeHtml(this.t('structure.model'))}</h2>
          <p>${escapeHtml(this.t('structure.modelHelp'))}</p>
        </div>
        <div class="option-grid option-grid--models">
          ${modelOptions.map((option) => optionCard(option, state.model === option.value, 'model')).join('')}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('structure.installation'))}</h2></div>
        ${segmented([
          { value: 'freestanding', label: this.t('structure.freestanding') },
          { value: 'wall-mounted', label: this.t('structure.wallMounted') },
        ], state.installation, 'installation')}
        ${isWallMounted ? `
          <div class="subsection">
            <label class="field-label">${escapeHtml(this.t('structure.mountedSide'))}</label>
            ${segmented(SIDE_NAMES.map((side) => ({ value: side, label: pergolaValueLabel(locale, 'side', side) })), state.mountedSide, 'mountedSide')}
          </div>
        ` : ''}
      </section>

      <section class="form-section">
        <div class="section-heading section-heading--row">
          <div>
            <h2>${escapeHtml(this.t('structure.dimensions'))}</h2>
            <p>${escapeHtml(this.t('structure.dimensionsHelp'))}</p>
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
          <span class="preset-button preset-button--custom ${currentPreset ? '' : 'is-selected'}">${escapeHtml(this.t('structure.custom'))}</span>
        </div>

        <div class="dimension-fields">
          ${this.numberField(this.t('structure.width'), 'dimensions.width', state.dimensions.width, 2000, 20000, 100)}
          ${this.numberField(this.t('structure.depth'), 'dimensions.depth', state.dimensions.depth, 2000, 20000, 100)}
          ${this.numberField(this.t('structure.height'), 'dimensions.height', state.dimensions.height, 2000, 3000, 50)}
        </div>
      </section>
    `;
  },

  renderFinishStep() {
    const state = this.state;
    const locale = state.locale;
    const frameColors = localizeCatalogOptions(locale, 'frameColor', FRAME_COLORS);
    const louverColors = localizeCatalogOptions(locale, 'louverColor', LOUVER_COLORS);
    return `
      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('finish.frameColor'))}</h2><p>${escapeHtml(this.t('finish.frameHelp'))}</p></div>
        ${colorSwatches(frameColors, state.roof.frameColor, 'roof.frameColor')}
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('finish.louverColor'))}</h2></div>
        ${colorSwatches(louverColors, state.roof.louverColor, 'roof.louverColor')}
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('finish.louverDirection'))}</h2><p>${escapeHtml(this.t('finish.louverDirectionHelp'))}</p></div>
        <div class="visual-choice-grid">
          ${optionCard({ value: 'width', label: this.t('finish.acrossWidth'), description: this.t('finish.acrossWidthHelp'), icon: './assets/profiles/louver-profile.svg' }, state.roof.orientation === 'width', 'roof.orientation')}
          ${optionCard({ value: 'depth', label: this.t('finish.acrossDepth'), description: this.t('finish.acrossDepthHelp'), icon: './assets/profiles/louver-profile.svg' }, state.roof.orientation === 'depth', 'roof.orientation')}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading section-heading--row">
          <div><h2>${escapeHtml(this.t('finish.louverTilt'))}</h2><p>${escapeHtml(this.t('finish.louverTiltHelp'))}</p></div>
          <strong data-tilt-output>${state.roof.louverTilt}°</strong>
        </div>
        <input class="range-input" type="range" min="0" max="85" step="1" value="${state.roof.louverTilt}" data-path="roof.louverTilt" data-value-type="number" data-continuous="true" />
        <div class="range-labels"><span>${escapeHtml(this.t('finish.closed'))}</span><span>${escapeHtml(this.t('finish.open'))}</span></div>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('finish.drainage'))}</h2></div>
        ${segmented([
          { value: 'standard', label: this.t('finish.standard') },
          { value: 'integrated', label: this.t('finish.integrated') },
        ], state.roof.drainage, 'roof.drainage')}
      </section>
    `;
  },

  renderAutomationStep() {
    const locale = this.state.locale;
    const automation = this.state.automation;
    const automationOptions = localizeCatalogOptions(locale, 'automation', AUTOMATION_OPTIONS);
    const serviceOptions = localizeCatalogOptions(locale, 'service', SERVICE_OPTIONS);
    const crank = findPoleMount(this.state, 'hand-crank');
    const switchCount = countPoleMounts(this.state, 'switch');

    return `
      <section class="form-section">
        <div class="section-heading section-heading--center"><h2>${escapeHtml(this.t('automation.title'))}</h2></div>
        <div class="option-grid option-grid--stacked">
          ${automationOptions.map((option) => optionCard(
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
            <h2>${escapeHtml(this.t('automation.crankPlacement'))}</h2>
            <p>${escapeHtml(this.t('automation.crankRequiredHelp'))}</p>
          </div>
          <div class="pole-placement-notice__status">
            <img src="./assets/icons/automation-manual.svg" alt="" />
            <span><strong>${escapeHtml(this.t(crank ? 'automation.crankPositioned' : 'automation.positionRequired'))}</strong><small>${crank ? `${localizePoleLabel(locale, getPoleLabel(this.state, crank.pole))}, ${this.t('automation.faceSuffix', { face: pergolaValueLabel(locale, 'face', crank.face) })}` : this.t('automation.choosePoleFace')}</small></span>
          </div>
          <button type="button" class="secondary-action secondary-action--full" data-action="open-pole-customization">${escapeHtml(this.t('automation.configurePoleComponents'))}</button>
        </section>
      ` : ''}

      ${automation === 'wall-switch' ? `
        <section class="form-section pole-placement-notice">
          <div class="section-heading">
            <h2>${escapeHtml(this.t('automation.switchPlacement'))}</h2>
            <p>${escapeHtml(this.t('automation.switchRequiredHelp'))}</p>
          </div>
          <div class="pole-placement-notice__status">
            <img src="./assets/icons/automation-switch.svg" alt="" />
            <span><strong>${escapeHtml(pergolaPlural(locale, 'automation.switchCount', switchCount))}</strong><small>${escapeHtml(this.t('automation.componentPerFace'))}</small></span>
          </div>
          <button type="button" class="secondary-action secondary-action--full" data-action="open-pole-customization">${escapeHtml(this.t('automation.configurePoleComponents'))}</button>
        </section>
      ` : ''}

      <section class="form-section">
        <div class="section-heading section-heading--center">
          <h2>${escapeHtml(this.t('automation.services'))}</h2>
          <p>${escapeHtml(this.t('automation.servicesHelp'))}</p>
        </div>
        <div class="option-grid option-grid--stacked">
          ${serviceOptions.map((option) => {
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
    const locale = this.state.locale;
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
    const sideOptions = localizeCatalogOptions(locale, 'side', SIDE_OPTIONS);
    const screenColors = localizeCatalogOptions(locale, 'screenColor', SCREEN_COLORS);
    const privacyColors = localizeCatalogOptions(locale, 'privacyColor', PRIVACY_WALL_COLORS);

    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>${escapeHtml(this.t('sides.chooseSegment'))}</h2>
          <p>${escapeHtml(this.t('sides.chooseSegmentHelp'))}</p>
        </div>
        ${renderPergolaGrid(this.state, { mode: 'segments', selectedSegment: segmentId }, locale)}
        <div class="pergola-grid__legend"><span><i class="legend-line"></i> ${escapeHtml(this.t('sides.clickSegment'))}</span><span><i class="legend-line has-closing"></i> ${escapeHtml(this.t('sides.closingConfigured'))}</span></div>
      </section>

      ${!segmentId ? `
        <div class="info-banner">
          <strong>${escapeHtml(this.t('sides.selectSegment'))}</strong>
          <span>${escapeHtml(this.t('sides.selectSegmentHelp'))}</span>
        </div>
      ` : `
        ${blockedByPoleMounts ? `
          <div class="info-banner info-banner--warning side-pole-conflict-warning">
            <strong>${escapeHtml(this.t('sides.blocked', { segment: segmentDisplayLabel(this.state, segment, locale) }))}</strong>
            <span>${escapeHtml(this.t('sides.blockedHelp'))}</span>
          </div>
        ` : ''}

        <section class="form-section">
          <div class="section-heading"><h2>${escapeHtml(segmentDisplayLabel(this.state, segment, locale))}</h2><p>${escapeHtml(this.t('sides.distance', { meters: Math.round(segment.lengthMm / 10) / 100 }))}</p></div>
          <div class="side-option-grid">
            ${sideOptions.map((option) => optionCard(
              {
                ...option,
                disabled: blockedByPoleMounts && option.value !== 'none',
                disabledReason: this.t('sides.removePoleComponentsFirst'),
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
                <h2>${escapeHtml(this.t('sides.screenPosition'))}</h2>
                <p>${escapeHtml(this.t('sides.screenRemembered', { type: this.t(config.type === 'motorized-screen' ? 'sides.screenTypeMotorized' : 'sides.screenTypePullDown') }))}</p>
              </div>
              <strong data-screen-openness-label>${escapeHtml(this.t('sides.percentOpen', { value: Math.round(settings.openness) }))}</strong>
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
            <div class="range-labels"><span>${escapeHtml(this.t('finish.closed'))}</span><span>${escapeHtml(this.t('finish.open'))}</span></div>
          </section>

          <section class="form-section">
            <div class="section-heading">
              <h2>${escapeHtml(this.t('sides.screenColor'))}</h2>
              <p>${escapeHtml(this.t('sides.screenColorHelp'))}</p>
            </div>
            ${colorSwatches(
              screenColors,
              settings.color,
              `sideSegments.${segmentId}.screenSettings.${config.type}.color`,
            )}
          </section>
        ` : ''}

        ${config.type === 'privacy-wall' ? `
          <section class="form-section">
            <div class="section-heading">
              <h2>${escapeHtml(this.t('sides.privacyColor'))}</h2>
              <p>${escapeHtml(this.t('sides.privacyColorHelp'))}</p>
            </div>
            ${colorSwatches(privacyColors, config.privacyColor, `sideSegments.${segmentId}.privacyColor`)}
          </section>
        ` : ''}
      `}
    `;
  },

  renderAccessoriesStep() {
    const locale = this.state.locale;
    const accessories = this.state.accessories;
    const ledColors = localizeCatalogOptions(locale, 'ledColor', LED_COLORS);
    const rectangles = getRoofRectangles(this.state);
    if (this.activeRoofRectangle && !rectangles.some((rectangle) => rectangle.id === this.activeRoofRectangle)) this.activeRoofRectangle = null;
    if (!this.activeRoofRectangle && rectangles.length === 1) this.activeRoofRectangle = rectangles[0].id;

    const selectedRectangle = rectangles.find((rectangle) => rectangle.id === this.activeRoofRectangle) ?? null;
    const selectedSpotlightCount = selectedRectangle ? getSpotlightRectangleCount(this.state, selectedRectangle.id) : 0;
    const selectedCapacity = selectedRectangle ? getSpotlightRectangleCapacity(this.state, selectedRectangle.id) : { columns: 0, rows: 0, max: 0 };
    const totalSpotlights = getTotalSpotlights(this.state);

    const heaterSegments = getBoundaryHeaterSegments(this.state);
    if (this.activeHeaterSegment && !heaterSegments.some((segment) => segment.id === this.activeHeaterSegment)) this.activeHeaterSegment = null;
    const selectedHeaterSegment = heaterSegments.find((segment) => segment.id === this.activeHeaterSegment) ?? null;
    const selectedHeater = selectedHeaterSegment ? getHeaterConfig(this.state, selectedHeaterSegment.id) : null;
    const selectedHeaterDirections = heaterDirectionLabels(selectedHeaterSegment, locale);
    const heaterCount = countHeaters(this.state);

    return `
      <section class="form-section">
        <div class="section-heading">
          <h2>${escapeHtml(this.t('accessories.lighting'))}</h2>
          <p>${escapeHtml(this.t('accessories.lightingHelp'))}</p>
        </div>
        ${this.accessoryToggleCard(
          'perimeterLed',
          this.t('accessories.led'),
          this.t('accessories.ledHelp'),
          accessories.perimeterLed.enabled,
          'toggle-led',
        )}
        ${accessories.perimeterLed.enabled ? `
          <div class="accessory-detail-panel">
            <div class="detail-heading"><strong>${escapeHtml(this.t('accessories.ledColor'))}</strong><small>${escapeHtml(this.t('accessories.ledColorAll'))}</small></div>
            ${colorSwatches(ledColors, accessories.perimeterLed.color, 'accessories.perimeterLed.color')}
          </div>
        ` : ''}

        <div class="accessory-detail-panel spotlight-rectangle-editor">
          <div class="detail-heading"><strong>${escapeHtml(this.t('accessories.spotlights'))}</strong><small>${escapeHtml(this.t('accessories.spotlightsConfigured', { count: totalSpotlights }))}</small></div>
          <p class="accessory-helper-copy">${escapeHtml(this.t('accessories.spotlightsHelp'))}</p>
          ${renderRoofRectangleGrid(this.state, this.activeRoofRectangle, locale)}
          ${selectedRectangle ? `
            <div class="spotlight-selection-card">
              <div>
                <strong>${escapeHtml(localizeRoofRectangleLabel(locale, selectedRectangle.label))}</strong>
                <small>${escapeHtml(this.t('accessories.rectangleMax', {
                  width: (selectedRectangle.widthMm / 1000).toFixed(2),
                  depth: (selectedRectangle.depthMm / 1000).toFixed(2),
                  max: selectedCapacity.max,
                  columns: selectedCapacity.columns,
                  rows: selectedCapacity.rows,
                }))}</small>
              </div>
              <div class="counter-control">
                <button type="button" data-action="spotlight-counter" data-rectangle="${selectedRectangle.id}" data-delta="-1" aria-label="${escapeHtml(this.t('accessories.decreaseSpotlights'))}" ${selectedSpotlightCount <= 0 ? 'disabled' : ''}>−</button>
                <output>${selectedSpotlightCount}</output>
                <button type="button" data-action="spotlight-counter" data-rectangle="${selectedRectangle.id}" data-delta="1" aria-label="${escapeHtml(this.t('accessories.increaseSpotlights'))}" ${selectedSpotlightCount >= selectedCapacity.max ? 'disabled' : ''}>+</button>
              </div>
            </div>
          ` : `<div class="info-banner pole-mount-empty-note"><strong>${escapeHtml(this.t('accessories.selectRectangle'))}</strong><span>${escapeHtml(this.t('accessories.selectRectangleHelp'))}</span></div>`}
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading">
          <h2>${escapeHtml(this.t('accessories.heaters'))}</h2>
          <p>${escapeHtml(this.t('accessories.heatersHelp'))}</p>
        </div>
        <div class="accessory-summary-line">
          ${this.accessoryModelMark('heaters')}
          <span><strong>${escapeHtml(pergolaPlural(locale, 'accessories.heaterSelected', heaterCount))}</strong><small>${escapeHtml(this.t('accessories.heaterMax'))}</small></span>
        </div>
        ${renderHeaterSideSelector(this.state, this.activeHeaterSegment, locale)}
        ${selectedHeaterSegment ? `
          <div class="heater-segment-editor">
            <div class="detail-heading">
              <strong>${escapeHtml(heaterSegmentLabel(this.state, selectedHeaterSegment, locale))}</strong>
              <small>${escapeHtml(this.t(selectedHeaterSegment.axis === 'horizontal' ? 'accessories.heaterChooseHorizontal' : 'accessories.heaterChooseVertical'))}</small>
            </div>
            <div class="heater-direction-grid">
              ${['first', 'second'].map((direction) => {
                const selected = Boolean(selectedHeater?.[direction]);
                return `
                  <button type="button" class="heater-direction-card ${selected ? 'is-selected' : ''}"
                    data-action="toggle-heater-direction" data-segment="${selectedHeaterSegment.id}" data-direction="${direction}" aria-pressed="${selected}">
                    ${this.accessoryModelMark('heaters')}
                    <span><strong>${escapeHtml(selectedHeaterDirections[direction])}</strong><small>${escapeHtml(this.t(selected ? 'accessories.heaterAdded' : 'accessories.addHeater'))}</small></span>
                    <span class="toggle-indicator" aria-hidden="true"></span>
                  </button>
                `;
              }).join('')}
            </div>
            <small class="heater-position-hint">${escapeHtml(this.t('accessories.heaterPositionHint'))}</small>
          </div>
        ` : `<div class="info-banner pole-mount-empty-note"><strong>${escapeHtml(this.t('accessories.selectBeam'))}</strong><span>${escapeHtml(this.t('accessories.selectBeamHelp'))}</span></div>`}
      </section>

      ${this.renderPoleCustomization()}
    `;
  },

  accessoryModelMark(key) {
    const item = ACCESSORY_OPTIONS.find((option) => option.key === key);
    const label = pergolaT(this.state.locale, `catalog.accessory.${key}.label`);
    return `
      <span class="accessory-model-mark" title="${escapeHtml(label)}">
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


  renderPoleCustomization() {
    const locale = this.state.locale;
    const conflicts = getPoleMountConflictMap(this.state);
    const totalMounts = countPoleMounts(this.state);
    const sensorCount = Number(Boolean(this.state.accessories.sensors.rain.enabled)) + Number(Boolean(this.state.accessories.sensors.wind.enabled));
    const pole = this.activePole && poleIsAvailable(this.state, this.activePole) ? this.activePole : null;
    if (this.activePole && !pole) this.activePole = null;

    const summaryKey = totalMounts === 1
      ? (sensorCount === 1 ? 'pole.summary.oneOne' : 'pole.summary.oneMany')
      : (sensorCount === 1 ? 'pole.summary.manyOne' : 'pole.summary.manyMany');

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
      const poleLabel = localizePoleLabel(locale, getPoleLabel(this.state, pole));
      const faceConflict = conflicts[pole]?.[face] ?? null;
      const conflictingTypes = new Set(faceConflict?.types ?? []);
      const poleSensor = getPoleSensor(this.state, pole);
      const rainSensor = this.state.accessories.sensors.rain;
      const windSensor = this.state.accessories.sensors.wind;
      const localizedFaces = localizeCatalogOptions(locale, 'poleFace', POLE_FACES);

      selectedDetails = `
        <div class="pole-customizer__group pole-top-sensor-group">
          <div class="detail-heading"><strong>${escapeHtml(this.t('pole.weatherSensor'))}</strong><small>${escapeHtml(this.t('pole.sensorMaximum', { pole: poleLabel }))}</small></div>
          <div class="pole-top-sensor-grid">
            ${[
              { type: 'rain', label: this.t('pole.rainSensor'), config: rainSensor, icon: './assets/icons/accessory-rain.svg' },
              { type: 'wind', label: this.t('pole.windSensor'), config: windSensor, icon: './assets/icons/accessory-wind.svg' },
            ].map((sensor) => {
              const selected = sensor.config.enabled && sensor.config.pole === pole;
              const elsewhere = sensor.config.enabled && sensor.config.pole && sensor.config.pole !== pole;
              const note = selected
                ? this.t('pole.mountedHere')
                : elsewhere
                  ? this.t('pole.moveFrom', { pole: localizePoleLabel(locale, getPoleLabel(this.state, sensor.config.pole)) })
                  : this.t('pole.mountHere');
              return `
                <button type="button" class="pole-top-sensor ${selected ? 'is-selected' : ''}" data-action="toggle-pole-sensor" data-sensor="${sensor.type}" aria-pressed="${selected}">
                  <span class="pole-top-sensor__icon"><img src="${sensor.icon}" alt="" /></span>
                  <span><strong>${escapeHtml(sensor.label)}</strong><small>${escapeHtml(note)}</small></span>
                </button>
              `;
            }).join('')}
          </div>
          <small class="pole-top-sensor-note">${escapeHtml(poleSensor
            ? this.t('pole.sensorOccupied', { sensor: pergolaValueLabel(locale, 'sensor', poleSensor) })
            : this.t('pole.sensorFree'))}</small>
        </div>

        <div class="pole-customizer__group">
          <div class="detail-heading"><strong>${escapeHtml(this.t('pole.selectFace'))}</strong><small>${escapeHtml(this.t('pole.faceContext', { pole: poleLabel, face: pergolaValueLabel(locale, 'face', face) }))}</small></div>
          <div class="pole-face-selector">
            ${localizedFaces.map(({ value, label }) => {
              const faceMounts = getPoleFaceMounts(this.state, pole, value);
              const items = Object.entries(faceMounts).filter(([, mount]) => Boolean(mount));
              const available = poleFaceIsAvailable(this.state, pole, value);
              const segmentId = getConnectedSegmentForPoleFace(this.state, pole, value);
              const segment = segmentId ? getSideSegment(this.state, segmentId) : null;
              const invalid = Boolean(conflicts[pole]?.[value]);
              const status = items.length
                ? `${items.map(([type]) => poleMountLabel(type, locale)).join(', ')}${invalid ? ` · ${this.t('pole.overlapping')}` : ''}`
                : available
                  ? (segment ? this.t('pole.segmentOpen', { segment: segmentDisplayLabel(this.state, segment, locale) }) : this.t('pole.exteriorAvailable'))
                  : (segment ? this.t('pole.segmentClosed', { segment: segmentDisplayLabel(this.state, segment, locale) }) : this.t('pole.unavailable'));
              return `
                <button type="button" class="pole-face-selector__button ${face === value ? 'is-selected' : ''} ${items.length ? 'is-occupied' : ''} ${invalid ? 'is-invalid' : ''}"
                  data-action="select-pole-face" data-face="${value}" aria-pressed="${face === value}">
                  <span>${escapeHtml(label)}</span><small>${escapeHtml(status)}</small>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="pole-customizer__group pole-mount-editor ${faceAvailable ? '' : 'is-blocked'} ${faceConflict ? 'is-invalid' : ''}">
          <div class="detail-heading"><strong>${escapeHtml(this.t('pole.chooseComponents'))}</strong><small>${escapeHtml(faceAvailable ? this.t('pole.faceContext', { pole: poleLabel, face: pergolaValueLabel(locale, 'face', face) }) : this.t('pole.faceReserved'))}</small></div>
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
                let note = selected ? this.t('pole.configuredAt', { height: mount.height }) : this.t('pole.addToFace');
                if (!selected && availableHeight === null && allowed) note = this.t('pole.noClearHeight');
                if (option.value === 'hand-crank') note = this.state.automation === 'manual'
                  ? (existingCrank && (existingCrank.pole !== pole || existingCrank.face !== face)
                    ? this.t('pole.moveCrankHere')
                    : (selected ? this.t('pole.configuredAt', { height: mount.height }) : this.t('pole.singleCrank')))
                  : this.t('pole.requiresManual');
                if (option.value === 'switch') note = this.state.automation === 'wall-switch'
                  ? (selected ? this.t('pole.configuredAt', { height: mount.height }) : this.t('pole.addSwitch'))
                  : this.t('pole.requiresSwitch');
                return `
                  <button type="button" class="pole-mount-type ${selected ? 'is-selected' : ''} ${conflictingTypes.has(option.value) ? 'is-invalid' : ''}" data-action="add-pole-mount"
                    data-mount-type="${option.value}" aria-pressed="${selected}" ${allowed ? '' : 'disabled aria-disabled="true"'}>
                    <span class="pole-mount-type__icon"><img src="${option.icon}" alt="" /></span><span><strong>${escapeHtml(poleMountLabel(option.value, locale))}</strong><small>${escapeHtml(note)}</small></span>
                  </button>
                `;
              }).join('')}
            </div>
            <div class="pole-overlap-warning" role="alert" data-pole-overlap-warning ${faceConflict ? '' : 'hidden'}><strong>${escapeHtml(this.t('pole.overlappingItems'))}</strong><span>${escapeHtml(this.t('pole.overlappingItemsHelp'))}</span></div>
            ${configuredMounts.length
              ? `<div class="pole-mounted-items">${configuredMounts.map(([type, mount]) =>
                this.renderPoleMountEditor(pole, face, type, mount, false, conflictingTypes.has(type))).join('')}</div>`
              : `<div class="info-banner pole-mount-empty-note"><strong>${escapeHtml(this.t('pole.faceFree'))}</strong><span>${escapeHtml(this.t('pole.faceFreeHelp'))}</span></div>`}
          ` : `
            <div class="info-banner info-banner--warning"><strong>${escapeHtml(this.t('pole.faceUnavailable'))}</strong><span>${escapeHtml(connectedSegment
              ? this.t('pole.segmentAlreadyClosed', { segment: segmentDisplayLabel(this.state, connectedSegment, locale) })
              : this.t('pole.installationUnavailable'))}</span></div>
          `}
        </div>
      `;
    }

    return `
      <section class="form-section pole-customizer" data-pole-customizer>
        <div class="section-heading">
          <h2>${escapeHtml(this.t('pole.customization'))}</h2>
          <p>${escapeHtml(this.t('pole.customizationHelp'))}</p>
        </div>
        <div class="accessory-summary-line ${hasPoleMountConflicts(this.state) ? 'is-invalid' : ''}">
          <span class="pole-customizer__summary-icon" aria-hidden="true"><img src="./assets/icons/pole-components.svg" alt="" /></span>
          <span><strong>${escapeHtml(this.t(summaryKey, { components: totalMounts, sensors: sensorCount }))}</strong><small>${escapeHtml(this.t('pole.summaryHelp'))}</small></span>
        </div>

        <div class="pole-customizer__group">
          <div class="detail-heading"><strong>${escapeHtml(this.t('pole.select'))}</strong><small>${pole ? escapeHtml(localizePoleLabel(locale, getPoleLabel(this.state, pole))) : escapeHtml(this.t('pole.noneSelected'))}</small></div>
          ${renderPergolaGrid(this.state, { mode: 'poles', selectedPole: pole, conflicts }, locale)}
        </div>

        ${selectedDetails}
      </section>
    `;
  },

  renderPoleMountEditor(pole, face, type, mount, required = false, conflicting = false) {
    const locale = this.state.locale;
    const limits = getPoleMountHeightLimits(type);
    const outletTypes = localizeCatalogOptions(locale, 'outlet', OUTLET_TYPES);
    const automationRequired = (type === 'hand-crank' && this.state.automation === 'manual')
      || (type === 'switch' && this.state.automation === 'wall-switch');
    return `
      <div class="pole-mount-settings ${conflicting ? 'is-invalid' : ''}" data-pole-mount-card="${pole}.${face}.${type}">
        <div class="pole-mount-settings__header">
          <span><strong>${escapeHtml(poleMountLabel(type, locale))}</strong><small>${escapeHtml(this.t(automationRequired ? 'pole.mountRequired' : 'pole.mountOneAllowed'))}</small></span>
          <button type="button" class="pole-mount-remove" data-action="remove-pole-mount" data-mount-type="${type}">${escapeHtml(this.t('pole.remove'))}</button>
        </div>
        ${type === 'outlet' ? `
          <div class="pole-mount-setting-row">
            <span><strong>${escapeHtml(this.t('pole.outletStandard'))}</strong><small>${escapeHtml(this.t('pole.outletStandardHelp'))}</small></span>
            ${segmented(outletTypes, mount.outletType, `poleMounts.${pole}.${face}.${type}.outletType`)}
          </div>
        ` : ''}
        <label class="mount-height-control pole-mount-height-control">
          <div><strong>${escapeHtml(this.t('pole.mountingHeight'))}</strong><output data-pole-mount-height-output="${pole}.${face}.${type}">${mount.height}%</output></div>
          <input class="range-input" type="range" min="${limits.min}" max="${limits.max}" step="1" value="${mount.height}"
            data-path="poleMounts.${pole}.${face}.${type}.height" data-value-type="number" data-continuous="true" />
          <div class="range-labels"><span>${limits.min}%</span><span>${escapeHtml(this.t('pole.roofSafeLimit', { max: limits.max }))}</span></div>
          <small class="pole-mount-height-hint">${escapeHtml(this.t('pole.heightConflictHelp'))}</small>
        </label>
      </div>
    `;
  },

  renderSummaryStep() {
    const locale = this.state.locale;
    const validationMessages = configurationValidationMessages(this.state, locale);
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
        <span>${escapeHtml(this.t('summary.configuration'))}</span>
        <strong>${formatMoney(price.total, this.state.currency, locale)}</strong>
        <small>${escapeHtml(this.t('summary.totalHelp'))}</small>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('summary.overview'))}</h2></div>
        <dl class="configuration-overview">
          <div><dt>${escapeHtml(this.t('summary.model'))}</dt><dd>${escapeHtml(pergolaValueLabel(locale, 'model', this.state.model))}</dd></div>
          <div><dt>${escapeHtml(this.t('summary.installation'))}</dt><dd>${escapeHtml(pergolaValueLabel(locale, 'installation', this.state.installation))}</dd></div>
          <div><dt>${escapeHtml(this.t('summary.size'))}</dt><dd>${this.formatDimensionLine()}</dd></div>
          <div><dt>${escapeHtml(this.t('summary.roof'))}</dt><dd>${escapeHtml(this.t('summary.roofValue', { orientation: pergolaValueLabel(locale, 'orientation', this.state.roof.orientation), tilt: this.state.roof.louverTilt }))}</dd></div>
          <div><dt>${escapeHtml(this.t('summary.automation'))}</dt><dd>${escapeHtml(automationLabel(this.state.automation, locale))}</dd></div>
          <div><dt>${escapeHtml(this.t('summary.poleComponents'))}</dt><dd>${escapeHtml(this.t('summary.configuredCount', { count: countPoleMounts(this.state) }))}</dd></div>
        </dl>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('summary.estimatedPrice'))}</h2></div>
        <div class="price-breakdown">
          ${price.lines.filter((line) => line.value > 0).map((line) => `
            <div><span>${escapeHtml(line.label)}</span><strong>${formatMoney(line.value, this.state.currency, locale)}</strong></div>
          `).join('')}
          <div class="price-breakdown__subtotal"><span>${escapeHtml(this.t('summary.subtotal'))}</span><strong>${formatMoney(price.subtotal, this.state.currency, locale)}</strong></div>
          <div><span>${escapeHtml(this.t('summary.estimatedTax'))}</span><strong>${formatMoney(price.tax, this.state.currency, locale)}</strong></div>
          <div class="price-breakdown__total"><span>${escapeHtml(this.t('summary.total'))}</span><strong>${formatMoney(price.total, this.state.currency, locale)}</strong></div>
        </div>
      </section>

      <section class="form-section">
        <div class="section-heading"><h2>${escapeHtml(this.t('summary.requestQuote'))}</h2><p>${escapeHtml(this.t('summary.requestQuoteHelp'))}</p></div>
        <form class="quote-form" data-quote-form>
          ${this.textField(this.t('summary.fullName'), 'customer.name', this.state.customer.name, 'text', true)}
          ${this.textField(this.t('summary.email'), 'customer.email', this.state.customer.email, 'email', true)}
          ${this.textField(this.t('summary.phone'), 'customer.phone', this.state.customer.phone, 'tel', false)}
          ${this.textField(this.t('summary.postcode'), 'customer.postcode', this.state.customer.postcode, 'text', false)}
          <label class="form-field form-field--full">
            <span>${escapeHtml(this.t('summary.notes'))}</span>
            <textarea data-path="customer.notes" data-continuous="true" rows="4" placeholder="${escapeHtml(this.t('summary.notesPlaceholder'))}">${escapeHtml(this.state.customer.notes)}</textarea>
          </label>
          <button class="primary-button form-field--full" type="submit">${escapeHtml(this.t('summary.sendInquiry'))}</button>
        </form>
      </section>

      <section class="summary-actions">
        <button type="button" class="secondary-button" data-action="download-json">${escapeHtml(this.t('summary.download'))}</button>
        <button type="button" class="secondary-button" data-action="print">${escapeHtml(this.t('summary.print'))}</button>
      </section>
    `;
  },

  renderFooter() {
    const locale = this.state.locale;
    const price = calculatePrice(this.state);
    return `
      <div class="footer-price">
        <small>${escapeHtml(this.t('footer.estimatedTotal'))}</small>
        <strong>${formatMoney(price.total, this.state.currency, locale)}</strong>
      </div>
      <div class="footer-actions">
        <button class="secondary-button" type="button" data-action="snapshot">${escapeHtml(this.t('footer.snapshot'))}</button>
        <button class="primary-button ${configurationValidationMessages(this.state, locale).length ? 'is-invalid' : ''}" type="button" data-action="toggle-step-section" data-step-id="summary">${escapeHtml(this.t('footer.summaryQuote'))}</button>
      </div>
    `;
  },

  renderEnvironmentPanel() {
    const environment = this.state.environment;
    return `
      <div class="environment-panel__header">
        <strong>${escapeHtml(this.t('environment.title'))}</strong>
        <button type="button" data-action="toggle-environment" aria-label="${escapeHtml(this.t('environment.close'))}">×</button>
      </div>

      <label class="environment-control">
        <span><strong>${escapeHtml(this.t('environment.sun'))}</strong><output data-sun-output>${Math.round(environment.sunPosition * 100)}%</output></span>
        <input class="range-input" type="range" min="0" max="1" step="0.01" value="${environment.sunPosition}" data-path="environment.sunPosition" data-value-type="number" data-continuous="true" />
        <small><span>${escapeHtml(this.t('environment.morning'))}</span><span>${escapeHtml(this.t('environment.evening'))}</span></small>
      </label>

      <label class="environment-control">
        <span><strong>${escapeHtml(this.t('environment.north'))}</strong><output data-north-output>${environment.northDirection}°</output></span>
        <input class="range-input" type="range" min="0" max="360" step="1" value="${environment.northDirection}" data-path="environment.northDirection" data-value-type="number" data-continuous="true" />
        <small><span>0°</span><span>360°</span></small>
      </label>

      <div class="environment-control">
        <span><strong>${escapeHtml(this.t('environment.scene'))}</strong></span>
        ${segmented([
          { value: 'winter', label: this.t('environment.winter') },
          { value: 'summer', label: this.t('environment.summer') },
          { value: 'studio', label: this.t('environment.studio') },
        ], environment.season, 'environment.season')}
      </div>

      <button type="button" class="night-toggle ${environment.night ? 'is-selected' : ''}" data-action="toggle-night" aria-pressed="${environment.night}">
        <span>☾</span>
        <span><strong>${escapeHtml(this.t('environment.night'))}</strong><small>${escapeHtml(this.t('environment.nightHelp'))}</small></span>
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
