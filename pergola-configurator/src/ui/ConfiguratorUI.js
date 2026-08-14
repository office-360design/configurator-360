import { STEPS } from '../catalog.js';
import { calculatePrice, formatMoney } from '../pricing.js';
import {
  createPoleMount,
  findPoleMount,
  getPoleGrid,
  getPoleMountConflictMap,
  getBoundaryHeaterSegments,
  getHeaterConfig,
  getRoofRectangles,
  getSpotlightRectangleCapacity,
  getSpotlightRectangleCount,
  getSideSegmentConfig,
  hasLayoutCustomizations,
  hasPoleMountConflicts,
  normalizeDimensionInput,
  poleIsAvailable,
  segmentIsAvailable,
} from '../state.js';
import {
  LANGUAGE_PROFILES,
  escapeHtml,
  getLanguageProfile,
  renderActionFeedback,
  renderToolsMenu,
  renderTopBar,
} from '../../../shared-ui/src/index.js';
import { pergolaRenderers } from './pergolaRenderers.js';

const CAMERA_PRESETS = ['perspective', 'front', 'left', 'right', 'top'];
const PROJECT_META_KEY = 'pergola-configurator:project-meta';
const PROJECT_COUNTER_KEY = 'pergola-configurator:next-project-number';
const SAVED_PROJECTS_KEY = 'pergola-configurator:saved-projects';
const MAX_PROJECT_NUMBER = 1000;
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export class ConfiguratorUI {
  constructor(root, store) {
    this.root = root;
    this.store = store;
    this.state = store.get();
    this.scene = null;
    this.activeSideSegment = null;
    this.activePole = null;
    this.activePoleFace = 'front';
    this.activeRoofRectangle = null;
    this.activeHeaterSegment = null;
    this.environmentOpen = false;
    this.toolsOpen = false;
    this.sidebarHidden = false;
    this.expandedStep = null;
    this.toastTimer = null;
    this.saveFeedbackTimer = null;
    this.accountMenuOpen = false;
    this.accountSettingsOpen = false;
    this.languageMenuOpen = false;
    this.pendingDimensionChange = null;

    const projectMeta = this.readProjectMeta();
    this.projectName = projectMeta.name || this.getNextDefaultProjectName();
    this.lastSavedProjectName = projectMeta.savedName || '';
    this.lastSavedState = projectMeta.savedState || '';
    this.projectDirty = this.computeProjectDirty();

    this.root.innerHTML = this.shellTemplate();
    this.stepContent = this.root.querySelector('[data-step-content]');
    this.stepTitle = this.root.querySelector('[data-step-title]');
    this.stepCounter = this.root.querySelector('[data-step-counter]');
    this.progress = this.root.querySelector('[data-progress]');
    this.sidebarFooter = this.root.querySelector('[data-sidebar-footer]');
    this.environmentPanel = this.root.querySelector('[data-environment-panel]');
    this.toast = this.root.querySelector('[data-toast]');
    this.modalRoot = this.root.querySelector('[data-modal-root]');
    this.projectNameInput = this.root.querySelector('[data-project-name]');
    this.projectNameMeasure = this.root.querySelector('[data-project-name-measure]');
    this.projectDirtyIndicator = this.root.querySelector('[data-project-dirty]');
    this.saveFeedback = this.root.querySelector('[data-save-feedback]');
    this.saveFeedbackText = this.root.querySelector('[data-save-feedback-text]');
    this.accountMenu = this.root.querySelector('[data-account-menu]');
    this.languageMenu = this.root.querySelector('[data-language-menu]');
    this.languageSearch = this.root.querySelector('[data-language-search]');

    this.handleDocumentClickBound = (event) => this.handleDocumentClick(event);
    document.addEventListener('click', this.handleDocumentClickBound);

    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    this.root.addEventListener('submit', (event) => this.handleSubmit(event));
    this.root.addEventListener('keydown', (event) => this.handleKeyDown(event));

    this.unsubscribe = this.store.subscribe((state, meta) => this.onStateChange(state, meta));
  }

  attachScene(scene) {
    this.scene = scene;
  }

  readProjectMeta() {
    try {
      return JSON.parse(window.localStorage.getItem(PROJECT_META_KEY) || '{}');
    } catch {
      return {};
    }
  }

  getNextDefaultProjectName() {
    const stored = Number(window.localStorage.getItem(PROJECT_COUNTER_KEY));
    const number = Number.isFinite(stored) && stored >= 1
      ? Math.min(MAX_PROJECT_NUMBER, Math.floor(stored))
      : 1;
    return `Pergola#${number}`;
  }

  serializeCurrentState() {
    return JSON.stringify(this.state);
  }

  computeProjectDirty() {
    return this.projectName !== this.lastSavedProjectName
      || this.serializeCurrentState() !== this.lastSavedState;
  }

  persistProjectMeta() {
    try {
      window.localStorage.setItem(PROJECT_META_KEY, JSON.stringify({
        name: this.projectName,
        savedName: this.lastSavedProjectName,
        savedState: this.lastSavedState,
      }));
    } catch {
      // Project metadata persistence is a non-critical local preview feature.
    }
  }

  reserveNextDefaultName() {
    const match = /^Pergola#(\d{1,4})$/i.exec(this.projectName.trim());
    if (!match) return;
    const current = Math.min(MAX_PROJECT_NUMBER, Number(match[1]));
    const stored = Number(window.localStorage.getItem(PROJECT_COUNTER_KEY)) || 1;
    const next = Math.min(MAX_PROJECT_NUMBER, Math.max(stored, current + 1));
    try {
      window.localStorage.setItem(PROJECT_COUNTER_KEY, String(next));
    } catch {
      // Ignore local preview storage failures.
    }
  }

  saveProjectLocallyForPreview() {
    this.lastSavedProjectName = this.projectName;
    this.lastSavedState = this.serializeCurrentState();
    this.projectDirty = false;
    this.reserveNextDefaultName();

    try {
      const savedProjects = JSON.parse(window.localStorage.getItem(SAVED_PROJECTS_KEY) || '{}');
      savedProjects[this.projectName] = {
        name: this.projectName,
        savedAt: new Date().toISOString(),
        configuration: this.state,
      };
      window.localStorage.setItem(SAVED_PROJECTS_KEY, JSON.stringify(savedProjects));
    } catch {
      // The visual success button intentionally remains a deterministic demo.
    }

    this.persistProjectMeta();
    this.syncTopBar();
  }

  runSavePreview(button) {
    button.classList.remove('is-success');
    void button.offsetWidth;
    button.classList.add('is-success');
    this.saveProjectLocallyForPreview();
    this.showActionFeedback('Saved');

    window.setTimeout(() => {
      button.classList.remove('is-success');
    }, 1050);
  }

  runSharePreview(button) {
    button.classList.remove('is-success');
    void button.offsetWidth;
    button.classList.add('is-success');
    this.showActionFeedback('Link copied!');
    window.setTimeout(() => button.classList.remove('is-success'), 1050);
  }

  showActionFeedback(message) {
    if (!this.saveFeedback) return;
    window.clearTimeout(this.saveFeedbackTimer);
    this.saveFeedback.classList.remove('is-success', 'is-failure', 'is-animating');
    void this.saveFeedback.offsetWidth;
    this.saveFeedback.classList.add('is-success', 'is-animating');
    if (this.saveFeedbackText) this.saveFeedbackText.textContent = message;
    this.saveFeedbackTimer = window.setTimeout(() => {
      this.saveFeedback.classList.remove('is-animating');
    }, 1050);
  }

  syncTopBar() {
    if (this.projectNameInput && document.activeElement !== this.projectNameInput) {
      this.projectNameInput.value = this.projectName;
    }
    this.projectDirtyIndicator?.classList.toggle('is-hidden', !this.projectDirty);
    this.syncProjectNameWidth();
    const undoButton = this.root.querySelector('[data-action="undo"]');
    if (undoButton) {
      undoButton.disabled = !this.store.canUndo?.();
      undoButton.setAttribute('aria-disabled', String(undoButton.disabled));
    }
  }

  syncProjectNameWidth() {
    if (!this.projectNameInput || !this.projectNameMeasure) return;
    const displayValue = this.projectName || ' ';
    this.projectNameMeasure.textContent = displayValue;
    const measuredWidth = Math.ceil(this.projectNameMeasure.getBoundingClientRect().width);
    const minWidth = 96;
    const maxWidth = Math.min(520, Math.max(180, window.innerWidth * 0.44));
    this.projectNameInput.style.width = `${Math.min(maxWidth, Math.max(minWidth, measuredWidth + 20))}px`;
  }

  getCurrentLanguageProfile() {
    return getLanguageProfile(this.state.locale);
  }

  shellTemplate() {
    return `
      <div class="app-shell">
        ${renderTopBar({
          brandSrc: './assets/360CONFIGURATOR.png',
          brandAlt: '360 Configurator',
          projectName: this.projectName,
          state: this.state,
        })}

        <main class="configurator-layout">
          <section class="viewport" data-viewport aria-label="3D pergola preview">
            ${renderToolsMenu(this.toolsOpen)}
            <section class="environment-panel" data-environment-panel aria-label="Lighting and orientation controls"></section>
            <div class="toast" data-toast role="status"></div>
          </section>

          <aside class="configurator-sidebar" aria-label="Pergola options">
            <button class="sidebar-collapse-handle" type="button" data-action="toggle-sidebar" aria-label="Hide or show menu" aria-expanded="${!this.sidebarHidden}" title="${this.sidebarHidden ? 'Show configurator options' : 'Hide configurator options'}">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
            <div class="sidebar-header sidebar-header--compact sidebar-header--minimal">
              <div><span class="step-counter" data-step-counter></span><h1 data-step-title></h1></div>
            </div>
            <div class="sidebar-scroll" data-step-content></div>
            <footer class="sidebar-footer" data-sidebar-footer></footer>
          </aside>
        </main>
        ${renderActionFeedback()}
        <div data-modal-root></div>
      </div>
    `;
  }

  onStateChange(state, meta = {}) {
    this.state = state;
    if (meta.reset) {
      this.activePole = null;
      this.activePoleFace = 'front';
      this.activeSideSegment = null;
      this.activeRoofRectangle = null;
      this.activeHeaterSegment = null;
      this.environmentOpen = false;
      this.toolsOpen = false;
      this.sidebarHidden = false;
      this.expandedStep = null;
      this.pendingDimensionChange = null;
      if (this.modalRoot) this.modalRoot.innerHTML = '';
    } else if (meta.dimensionsReset) {
      this.activePole = null;
      this.activePoleFace = 'front';
      this.activeSideSegment = null;
      this.activeRoofRectangle = null;
      this.activeHeaterSegment = null;
    }
    const grid = getPoleGrid(state);
    if (this.activePole && !grid.poles.some((pole) => pole.id === this.activePole)) this.activePole = null;
    if (this.activeSideSegment && !grid.segments.some((segment) => segment.id === this.activeSideSegment)) this.activeSideSegment = null;
    if (this.activeRoofRectangle && !getRoofRectangles(state).some((rectangle) => rectangle.id === this.activeRoofRectangle)) this.activeRoofRectangle = null;
    if (this.activeHeaterSegment && !getBoundaryHeaterSegments(state).some((segment) => segment.id === this.activeHeaterSegment)) this.activeHeaterSegment = null;
    this.projectDirty = this.computeProjectDirty();
    if (meta.continuous) {
      this.syncContinuousValues();
      this.syncPoleConflictState();
      this.syncTopBar();
      return;
    }
    this.render();
  }

  render() {
    this.stepTitle.textContent = '';
    this.stepCounter.textContent = '';
    this.stepCounter.style.display = 'none';
    if (this.progress) this.progress.innerHTML = '';
    this.root.querySelector('.configurator-sidebar')?.classList.toggle('is-hidden', this.sidebarHidden);
    this.root.querySelector('.app-shell')?.classList.toggle('is-dark-mode', Boolean(this.state.darkMode));

    this.stepContent.innerHTML = this.renderAccordionSections();
    this.sidebarFooter.innerHTML = this.renderFooter();
    this.environmentPanel.innerHTML = this.renderEnvironmentPanel();
    this.environmentPanel.classList.toggle('is-open', this.environmentOpen);
    this.syncToolbar();
    this.syncTopBar();
    this.syncAccountMenu();
    this.syncLanguageMenu();
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

    if (action === 'save-success-demo') {
      this.runSavePreview(actionTarget);
    } else if (action === 'undo') {
      if (!this.store.undo?.()) this.showToast('Nothing to undo.');
    } else if (action === 'account') {
      this.toggleAccountMenu();
    } else if (action === 'language') {
      this.toggleLanguageMenu();
    } else if (action === 'toggle-account-settings') {
      this.accountSettingsOpen = !this.accountSettingsOpen;
      this.syncAccountMenu();
    } else if (action === 'account-profile') {
      this.closeHeaderMenus();
      this.showModal('My profile', '<p>The profile page will be connected when authentication is implemented.</p>');
    } else if (action === 'account-saved') {
      this.closeHeaderMenus();
      this.showSavedConfigurations();
    } else if (action === 'account-help') {
      this.closeHeaderMenus();
      this.showModal('Help', '<p>Help articles, tutorials and support contact options will be available here.</p>');
    } else if (action === 'toggle-dark-mode') {
      this.store.update('darkMode', !this.state.darkMode);
    } else if (action === 'cookies-placeholder') {
      this.showToast('Cookie preferences are not connected yet.');
    } else if (action === 'account-signout') {
      this.closeHeaderMenus();
      this.showToast('Sign out will be connected with authentication.');
    } else if (action === 'select-language') {
      const locale = actionTarget.dataset.locale;
      const profile = LANGUAGE_PROFILES[locale];
      if (profile) {
        this.store.patch({
          locale,
          units: profile.units,
          currency: profile.currency,
        }, { path: 'locale' });
        this.showToast(`${profile.nativeName}: ${profile.units === 'imperial' ? 'Imperial' : 'Metric'} · ${profile.currency}`);
      }
      this.closeHeaderMenus();
    } else if (action === 'next-step') {
      this.store.nextStep(STEPS.length - 1);
    } else if (action === 'previous-step') {
      this.store.previousStep();
    } else if (action === 'go-step') {
      this.store.update('step', Number(actionTarget.dataset.step));
    } else if (action === 'dimension-preset') {
      this.requestDimensionChange({
        width: Number(actionTarget.dataset.width),
        depth: Number(actionTarget.dataset.depth),
      }, 'dimension-preset');
    } else if (action === 'toggle-service') {
      const key = actionTarget.dataset.service;
      this.store.update(`services.${key}`, !this.state.services[key]);
    } else if (action === 'select-side-segment') {
      const segmentId = actionTarget.dataset.segment;
      if (segmentIsAvailable(this.state, segmentId)) {
        this.activeSideSegment = this.activeSideSegment === segmentId ? null : segmentId;
        this.render();
      }
    } else if (action === 'select-roof-rectangle') {
      const rectangle = actionTarget.dataset.rectangle;
      if (getRoofRectangles(this.state).some((item) => item.id === rectangle)) {
        this.activeRoofRectangle = this.activeRoofRectangle === rectangle ? null : rectangle;
        this.render();
      }
    } else if (action === 'spotlight-counter') {
      const rectangle = actionTarget.dataset.rectangle || this.activeRoofRectangle;
      if (!rectangle) return;
      const delta = Number(actionTarget.dataset.delta) || 0;
      const capacity = getSpotlightRectangleCapacity(this.state, rectangle).max;
      const current = getSpotlightRectangleCount(this.state, rectangle);
      const next = Math.min(capacity, Math.max(0, current + delta));
      this.store.update(`accessories.spotlights.${rectangle}`, next);
    } else if (action === 'toggle-led') {
      this.store.update('accessories.perimeterLed.enabled', !this.state.accessories.perimeterLed.enabled);
    } else if (action === 'select-heater-segment') {
      const segment = actionTarget.dataset.segment;
      if (getBoundaryHeaterSegments(this.state).some((item) => item.id === segment)) {
        this.activeHeaterSegment = this.activeHeaterSegment === segment ? null : segment;
        this.render();
      }
    } else if (action === 'toggle-heater-segment') {
      const segment = actionTarget.dataset.segment || this.activeHeaterSegment;
      if (!segment) return;
      const current = getHeaterConfig(this.state, segment);
      this.store.update(`accessories.heaters.${segment}`, current ? null : { enabled: true, flipped: false });
    } else if (action === 'flip-heater-position') {
      const segment = actionTarget.dataset.segment || this.activeHeaterSegment;
      if (!segment) return;
      const current = getHeaterConfig(this.state, segment);
      if (current) this.store.update(`accessories.heaters.${segment}.flipped`, !current.flipped);
    } else if (action === 'toggle-pole-sensor') {
      const sensor = actionTarget.dataset.sensor;
      if (!this.activePole) return;
      const updated = this.store.toggleSensorOnPole(sensor, this.activePole);
      if (updated === false) this.showToast(this.store.getLastError?.() || 'That sensor cannot be placed there.');
    } else if (action === 'open-pole-customization') {
      const automationMount = this.state.automation === 'manual'
        ? findPoleMount(this.state, 'hand-crank')
        : this.state.automation === 'wall-switch'
          ? findPoleMount(this.state, 'switch')
          : null;
      if (automationMount) {
        this.activePole = automationMount.pole;
        this.activePoleFace = automationMount.face;
      }
      this.expandedStep = 'accessories';
      this.render();
      window.setTimeout(() => this.stepContent.querySelector('[data-pole-customizer]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } else if (action === 'select-pole') {
      const pole = actionTarget.dataset.pole;
      if (poleIsAvailable(this.state, pole)) {
        this.activePole = this.activePole === pole ? null : pole;
        if (this.activePole) this.activePoleFace = 'front';
        this.render();
      }
    } else if (action === 'select-pole-face') {
      this.activePoleFace = actionTarget.dataset.face;
      this.render();
    } else if (action === 'add-pole-mount') {
      const type = actionTarget.dataset.mountType;
      const path = `poleMounts.${this.activePole}.${this.activePoleFace}.${type}`;
      const current = this.state.poleMounts[this.activePole]?.[this.activePoleFace]?.[type] ?? null;
      let value = null;

      if (!current) {
        const existing = type === 'hand-crank' ? findPoleMount(this.state, 'hand-crank')?.mount : null;
        value = createPoleMount(type, {
          height: existing?.height,
          outletType: type === 'outlet' ? 'eu' : undefined,
        });
      }

      const updated = this.store.update(path, value);
      if (updated === false) {
        this.showToast(this.store.getLastError?.() || (current
          ? 'That component cannot be removed.'
          : 'That component cannot be placed there.'));
      }
    } else if (action === 'remove-pole-mount') {
      const type = actionTarget.dataset.mountType;
      const path = `poleMounts.${this.activePole}.${this.activePoleFace}.${type}`;
      const updated = this.store.update(path, null);
      if (updated === false) this.showToast(this.store.getLastError?.() || 'That component cannot be removed.');
    } else if (action === 'toggle-step-section') {
      const stepId = actionTarget.dataset.stepId;
      this.expandedStep = this.expandedStep === stepId ? null : stepId;
      this.render();
    } else if (action === 'toggle-sidebar') {
      this.sidebarHidden = !this.sidebarHidden;
      this.render();
    } else if (action === 'toggle-tools') {
      this.toolsOpen = !this.toolsOpen;
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
      this.copyShareLink(actionTarget);
    } else if (action === 'reset') {
      if (window.confirm('Reset all pergola options?')) this.store.reset();
    } else if (action === 'snapshot') {
      this.downloadSnapshot();
    } else if (action === 'view-ar') {
      const platform = this.state.defaultArPlatform === 'ios' ? 'iOS' : 'Android';
      this.showModal('AR integration', `
        <p>The preferred AR platform is currently <strong>${platform}</strong>.</p>
        <p>This standalone pergola demo does not publish a GLB or USDZ yet.</p>
      `);
    } else if (action === 'download-json') {
      this.downloadJSON();
    } else if (action === 'print') {
      window.print();
    } else if (action === 'focus-quote') {
      this.root.querySelector('[data-quote-form]')?.scrollIntoView({ behavior: 'smooth' });
    } else if (action === 'confirm-dimension-change') {
      const pending = this.pendingDimensionChange;
      this.pendingDimensionChange = null;
      this.modalRoot.innerHTML = '';
      if (pending) this.store.setDimensions(pending.dimensions, { path: pending.path ?? 'dimensions' });
    } else if (action === 'cancel-dimension-change' || action === 'close-modal') {
      const wasPendingDimensionChange = Boolean(this.pendingDimensionChange);
      this.pendingDimensionChange = null;
      this.modalRoot.innerHTML = '';
      if (wasPendingDimensionChange) this.render();
    } else if (action === 'login') {
      this.showModal('Demo login', '<p>Authentication is not connected in this frontend-only implementation.</p>');
    }
  }

  handleChange(event) {
    const projectNameInput = event.target.closest('[data-project-name]');
    if (projectNameInput) {
      this.updateProjectName(projectNameInput.value);
      return;
    }
    const input = event.target.closest('[data-path]');
    if (!input || input.dataset.continuous === 'true') return;
    this.updateFromInput(input, false);
  }

  handleInput(event) {
    const languageSearch = event.target.closest('[data-language-search]');
    if (languageSearch) {
      this.filterLanguages(languageSearch.value);
      return;
    }
    const projectNameInput = event.target.closest('[data-project-name]');
    if (projectNameInput) {
      this.updateProjectName(projectNameInput.value);
      return;
    }
    const input = event.target.closest('[data-path][data-continuous="true"]');
    if (!input) return;
    this.updateFromInput(input, true);
  }

  updateProjectName(value) {
    const cleaned = String(value).replace(/[\r\n\t]/g, ' ').slice(0, 80);
    this.projectName = cleaned;
    this.projectDirty = this.computeProjectDirty();
    this.persistProjectMeta();
    this.syncTopBar();
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.closeHeaderMenus();
    }
    const projectNameInput = event.target.closest('[data-project-name]');
    if (!projectNameInput) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      projectNameInput.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      projectNameInput.value = this.projectName;
      projectNameInput.blur();
    }
  }

  updateFromInput(input, continuous) {
    let value = input.type === 'checkbox' ? input.checked : input.value;
    if (input.dataset.valueType === 'number') value = Number(value);
    if (input.dataset.dimensionUnit === 'inches') value = Math.round(value * 25.4);

    const dimensionMatch = input.dataset.path.match(/^dimensions\.(width|depth|height)$/);
    if (dimensionMatch) {
      const key = dimensionMatch[1];
      this.requestDimensionChange({ [key]: normalizeDimensionInput(key, value) }, input.dataset.path);
      return;
    }

    const updated = this.store.update(input.dataset.path, value, { continuous });
    if (updated === false) {
      input.value = this.valueAtPath(input.dataset.path) ?? input.value;
      this.showToast(this.store.getLastError?.() || 'That position overlaps another component.');
    }
  }

  requestDimensionChange(partial, path = 'dimensions') {
    const dimensions = { ...this.state.dimensions };
    Object.entries(partial).forEach(([key, value]) => {
      dimensions[key] = normalizeDimensionInput(key, value);
    });
    const changed = ['width', 'depth', 'height'].some((key) => dimensions[key] !== this.state.dimensions[key]);
    if (!changed) {
      this.render();
      return;
    }

    if (hasLayoutCustomizations(this.state)) {
      this.pendingDimensionChange = { dimensions, path };
      this.showDimensionChangeWarning();
      return;
    }
    this.store.setDimensions(dimensions, { path });
  }

  showDimensionChangeWarning() {
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation">
        <section class="modal dimension-warning-modal" role="dialog" aria-modal="true" aria-labelledby="dimension-warning-title">
          <header><h2 id="dimension-warning-title">Change pergola size?</h2><button type="button" data-action="cancel-dimension-change" aria-label="Cancel">×</button></header>
          <div class="modal__body">
            <p><strong>All pole accessories, weather sensors, heaters, spotlights and side closings will be removed.</strong></p>
            <p>This prevents components from being left attached to poles, roof rectangles or side segments that no longer exist after resizing.</p>
          </div>
          <footer class="dimension-warning-modal__actions">
            <button class="secondary-button" type="button" data-action="cancel-dimension-change">Cancel</button>
            <button class="primary-button" type="button" data-action="confirm-dimension-change">Change size</button>
          </footer>
        </section>
      </div>
    `;
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
      <p>Estimated total: <strong>${formatMoney(price.total, this.state.currency, this.state.locale)}</strong></p>
      <p>Connect the submit handler to the project backend, CRM or email workflow when the API is available.</p>
    `);
  }

  syncContinuousValues() {
    const sun = this.environmentPanel.querySelector('[data-sun-output]');
    const tilt = this.root.querySelector('[data-tilt-output]');
    const north = this.environmentPanel.querySelector('[data-north-output]');
    const screen = this.stepContent.querySelector('[data-screen-openness-label]');
    if (sun) sun.textContent = `${Math.round(this.state.environment.sunPosition * 100)}%`;
    if (tilt) tilt.textContent = `${Math.round(this.state.roof.louverTilt)}°`;
    if (north) north.textContent = `${Math.round(this.state.environment.northDirection)}°`;
    if (screen && this.activeSideSegment) {
      const config = getSideSegmentConfig(this.state, this.activeSideSegment);
      const openness = config.screenSettings?.[config.type]?.openness ?? 50;
      screen.textContent = `${Math.round(openness)}% open`;
    }
    this.stepContent.querySelectorAll('[data-pole-mount-height-output]').forEach((output) => {
      const [pole, face, type] = output.dataset.poleMountHeightOutput.split('.');
      output.textContent = `${this.state.poleMounts[pole]?.[face]?.[type]?.height ?? 0}%`;
    });
  }


  syncPoleConflictState() {
    const conflicts = getPoleMountConflictMap(this.state);
    const currentFaceConflict = conflicts[this.activePole]?.[this.activePoleFace] ?? null;
    const currentTypes = new Set(currentFaceConflict?.types ?? []);

    this.stepContent.querySelectorAll('[data-action="select-pole"][data-pole]').forEach((button) => {
      button.classList.toggle('is-invalid', Boolean(conflicts[button.dataset.pole]));
    });
    this.stepContent.querySelectorAll('[data-action="select-pole-face"][data-face]').forEach((button) => {
      button.classList.toggle('is-invalid', Boolean(conflicts[this.activePole]?.[button.dataset.face]));
    });
    this.stepContent.querySelector('.pole-mount-editor')?.classList.toggle('is-invalid', Boolean(currentFaceConflict));
    this.stepContent.querySelector('[data-pole-overlap-warning]')?.toggleAttribute('hidden', !currentFaceConflict);
    this.stepContent.querySelector('.accessory-summary-line')?.classList.toggle('is-invalid', hasPoleMountConflicts(this.state));

    this.stepContent.querySelectorAll('[data-action="add-pole-mount"][data-mount-type]').forEach((button) => {
      button.classList.toggle('is-invalid', currentTypes.has(button.dataset.mountType));
    });
    this.stepContent.querySelectorAll('[data-pole-mount-card]').forEach((card) => {
      const [pole, face, type] = card.dataset.poleMountCard.split('.');
      card.classList.toggle('is-invalid', Boolean(conflicts[pole]?.[face]?.types?.includes(type)));
    });
    this.sidebarFooter.querySelector('[data-step-id="summary"]')?.classList.toggle('is-invalid', hasPoleMountConflicts(this.state));
  }

  syncToolbar() {
    const dimensionButton = this.root.querySelector('[data-action="toggle-dimensions"]');
    const compassButton = this.root.querySelector('[data-action="toggle-compass"]');
    const toolsPanel = this.root.querySelector('.tools-toolbar__panel');
    const toolsLauncher = this.root.querySelector('[data-action="toggle-tools"]');
    dimensionButton?.classList.toggle('is-active', this.state.view.dimensionsVisible);
    compassButton?.classList.toggle('is-active', this.state.view.compassVisible);
    toolsPanel?.classList.toggle('is-open', this.toolsOpen);
    toolsLauncher?.classList.toggle('is-active', this.toolsOpen);
    this.root.querySelector('.sidebar-collapse-handle')?.classList.toggle('is-hidden-state', this.sidebarHidden);
  }

  toggleAccountMenu() {
    this.accountMenuOpen = !this.accountMenuOpen;
    this.languageMenuOpen = false;
    this.pendingDimensionChange = null;
    this.syncAccountMenu();
    this.syncLanguageMenu();
  }

  toggleLanguageMenu() {
    this.languageMenuOpen = !this.languageMenuOpen;
    this.accountMenuOpen = false;
    this.syncLanguageMenu();
    this.syncAccountMenu();
    if (this.languageMenuOpen) window.setTimeout(() => this.languageSearch?.focus(), 0);
  }

  closeHeaderMenus() {
    this.accountMenuOpen = false;
    this.languageMenuOpen = false;
    this.pendingDimensionChange = null;
    this.syncAccountMenu();
    this.syncLanguageMenu();
  }

  syncAccountMenu() {
    this.accountMenu?.classList.toggle('is-open', this.accountMenuOpen);
    this.root.querySelector('[data-action="account"]')?.setAttribute('aria-expanded', String(this.accountMenuOpen));
    const settings = this.root.querySelector('[data-account-settings]');
    const settingsButton = this.root.querySelector('[data-action="toggle-account-settings"]');
    settings?.classList.toggle('is-open', this.accountSettingsOpen);
    settingsButton?.setAttribute('aria-expanded', String(this.accountSettingsOpen));
    const unitsSelect = settings?.querySelector('[data-path="units"]');
    const currencySelect = settings?.querySelector('[data-path="currency"]');
    const qualitySelect = settings?.querySelector('[data-path="quality"]');
    const arPlatformSelect = settings?.querySelector('[data-path="defaultArPlatform"]');
    const darkModeButton = settings?.querySelector('[data-action="toggle-dark-mode"]');
    const darkModeSwitch = darkModeButton?.querySelector('.settings-switch');
    const darkModeLabel = darkModeButton?.querySelector('[data-dark-mode-label]');
    if (unitsSelect) unitsSelect.value = this.state.units;
    if (currencySelect) currencySelect.value = this.state.currency;
    if (qualitySelect) qualitySelect.value = this.state.quality;
    if (arPlatformSelect) arPlatformSelect.value = this.state.defaultArPlatform;
    darkModeButton?.setAttribute('aria-pressed', String(Boolean(this.state.darkMode)));
    darkModeSwitch?.classList.toggle('is-on', Boolean(this.state.darkMode));
    if (darkModeLabel) darkModeLabel.textContent = this.state.darkMode ? 'On' : 'Off';
  }

  syncLanguageMenu() {
    this.languageMenu?.classList.toggle('is-open', this.languageMenuOpen);
    const profile = this.getCurrentLanguageProfile();
    const button = this.root.querySelector('[data-action="language"]');
    button?.setAttribute('aria-expanded', String(this.languageMenuOpen));
    button?.setAttribute('aria-label', profile.nativeName);
    button?.setAttribute('data-tooltip', profile.nativeName);
    const buttonFlag = this.root.querySelector('[data-language-button-flag]');
    const currentFlag = this.root.querySelector('[data-current-language-flag]');
    const currentName = this.root.querySelector('[data-current-language-name]');
    if (buttonFlag) buttonFlag.textContent = profile.flag;
    if (currentFlag) currentFlag.textContent = profile.flag;
    if (currentName) currentName.textContent = profile.nativeName;
    this.root.querySelectorAll('[data-action="select-language"]').forEach((languageButton) => {
      const selected = languageButton.dataset.locale === this.state.locale;
      languageButton.classList.toggle('is-selected', selected);
      languageButton.setAttribute('aria-current', selected ? 'true' : 'false');
    });
  }

  handleDocumentClick(event) {
    if (!event.target.closest('[data-account-menu], [data-action="account"]')) {
      this.accountMenuOpen = false;
      this.syncAccountMenu();
    }
    if (!event.target.closest('[data-language-menu], [data-action="language"]')) {
      this.languageMenuOpen = false;
      this.syncLanguageMenu();
    }
  }

  filterLanguages(query) {
    const normalized = String(query).trim().toLocaleLowerCase('ro');
    this.root.querySelectorAll('[data-language-name]').forEach((button) => {
      button.hidden = normalized && !button.dataset.languageName.includes(normalized);
    });
  }

  showSavedConfigurations() {
    let savedProjects = [];
    try {
      savedProjects = Object.values(JSON.parse(window.localStorage.getItem(SAVED_PROJECTS_KEY) || '{}'));
    } catch {
      savedProjects = [];
    }
    savedProjects.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const content = savedProjects.length
      ? `<div class="saved-project-list">${savedProjects.map((project) => `<article><strong>${escapeHtml(project.name)}</strong><small>${new Date(project.savedAt).toLocaleString()}</small></article>`).join('')}</div>`
      : '<p>No configurations have been saved in this browser yet.</p>';
    this.showModal('Saved configurations', content);
  }

  async copyShareLink(button) {
    let url;
    try {
      url = await this.store.getShareUrl();
    } catch (error) {
      console.error('Share link could not be created.', error);
      this.showToast('Share service unavailable. Please try again.');
      return;
    }

    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      copied = document.execCommand('copy');
      textarea.remove();
    }
    if (copied) this.runSharePreview(button);
    else window.prompt('Copy this link:', url);
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
      <div class="modal-backdrop" role="presentation">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <header><h2 id="modal-title">${escapeHtml(title)}</h2><button type="button" data-action="close-modal" aria-label="Close">×</button></header>
          <div class="modal__body">${body}</div>
          <footer><button class="primary-button" type="button" data-action="close-modal">Close</button></footer>
        </section>
      </div>
    `;
  }

  destroy() {
    this.unsubscribe?.();
    document.removeEventListener('click', this.handleDocumentClickBound);
  }
}

Object.assign(ConfiguratorUI.prototype, pergolaRenderers);
