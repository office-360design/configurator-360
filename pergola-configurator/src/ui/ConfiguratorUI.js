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
import { escapeHtml } from '../../../shared-ui/src/utils.js?v=12';
import { pergolaRenderers } from './pergolaRenderers.js';
import { pergolaT, translatePergolaRuntimeMessage } from '../i18n.js';

const CAMERA_PRESETS = ['perspective', 'front', 'left', 'right', 'top'];

export class ConfiguratorUI {
  constructor(root, store) {
    this.root = root;
    this.store = store;
    this.state = store.get();
    this.mobileLayoutQuery = window.matchMedia('(max-width: 760px)');
    this.sidebarUserOverride = false;
    this.scene = null;
    this.activeSideSegment = null;
    this.activePole = null;
    this.activePoleFace = 'front';
    this.activeRoofRectangle = null;
    this.activeHeaterSegment = null;
    this.environmentOpen = false;
    this.sidebarHidden = this.mobileLayoutQuery.matches;
    this.expandedStep = null;
    this.toastTimer = null;
    this.saveFeedbackTimer = null;
    this.pendingDimensionChange = null;

    this.root.innerHTML = this.shellTemplate();
    this.stepContent = this.root.querySelector('[data-step-content]');
    this.sidebarFooter = this.root.querySelector('[data-sidebar-footer]');
    this.environmentPanel = this.root.querySelector('[data-environment-panel]');
    this.toast = this.root.querySelector('[data-toast]');
    this.modalRoot = this.root.querySelector('[data-modal-root]');

    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('change', (event) => this.handleChange(event));
    this.root.addEventListener('input', (event) => this.handleInput(event));
    this.root.addEventListener('submit', (event) => this.handleSubmit(event));

    this.onMobileLayoutChange = (event) => {
      if (!this.sidebarUserOverride) {
        this.setSidebarHidden(event.matches);
      } else {
        this.syncMobileShellState();
      }
    };
    this.mobileLayoutQuery.addEventListener?.('change', this.onMobileLayoutChange);

    this.unsubscribe = this.store.subscribe((state, meta) => this.onStateChange(state, meta));
  }

  attachScene(scene) {
    this.scene = scene;
  }

  attachSharedShell(shell) {
    this.sharedShell = shell;
    this.sidebarHidden = Boolean(shell.settingsPanelCollapsed);
    this.syncToolbar();
    this.syncMobileShellState();
    this.syncSharedShell();
  }

  t(key, variables = {}) {
    return pergolaT(this.state.locale, key, variables);
  }

  runtimeMessage(message, fallbackKey = null) {
    const translated = translatePergolaRuntimeMessage(this.state.locale, message);
    if (translated && translated !== message) return translated;
    return fallbackKey ? this.t(fallbackKey) : translated;
  }

  shellTemplate() {
    return `
      <div class="app-shell">
        <main class="configurator-layout">
          <section class="viewport" data-viewport aria-label="${escapeHtml(this.t('app.previewAria'))}">
            <section class="environment-panel" data-environment-panel aria-label="${escapeHtml(this.t('app.environmentAria'))}"></section>
            <div class="toast" data-toast role="status"></div>
          </section>

          <aside class="configurator-sidebar${this.sidebarHidden ? ' is-collapsed' : ''}" aria-label="${escapeHtml(this.t('app.sidebarAria'))}">
            <div class="sidebar-scroll shared-configurator-panel__body" data-step-content></div>
            <footer class="sidebar-footer" data-sidebar-footer></footer>
          </aside>
          <button id="pergolaSidebarToggle" class="sidebar-collapse-handle${this.sidebarHidden ? ' is-hidden-state' : ''}" type="button" aria-label="${escapeHtml(this.t('app.sidebarToggleAria'))}" aria-expanded="${!this.sidebarHidden}" title="${escapeHtml(this.t(this.sidebarHidden ? 'app.sidebarShow' : 'app.sidebarHide'))}">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </main>
        <div data-modal-root></div>
      </div>
    `;
  }

  onStateChange(state, meta = {}) {
    this.state = state;
    if (this.sharedShell && !meta.skipHistory) this.sharedShell.markDirty();
    if (meta.reset) {
      this.activePole = null;
      this.activePoleFace = 'front';
      this.activeSideSegment = null;
      this.activeRoofRectangle = null;
      this.activeHeaterSegment = null;
      this.environmentOpen = false;
      this.sidebarHidden = this.mobileLayoutQuery.matches;
      this.sidebarUserOverride = false;
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
    if (meta.continuous) {
      this.syncContinuousValues();
      this.syncPoleConflictState();
      this.syncSharedShell();
      return;
    }
    this.render();
  }

  render() {
    this.root.querySelector('.app-shell')?.classList.toggle('is-dark-mode', Boolean(this.state.darkMode));

    this.stepContent.innerHTML = this.renderAccordionSections();
    if (this.sharedShell?.refreshConfiguratorPanelFooter) this.sharedShell.refreshConfiguratorPanelFooter();
    else this.sidebarFooter.replaceChildren();
    this.environmentPanel.innerHTML = this.renderEnvironmentPanel();
    this.environmentPanel.classList.toggle('is-open', this.environmentOpen);
    this.syncToolbar();
    this.syncMobileShellState();
    this.syncSharedShell();
  }

  async handleClick(event) {
    if (
      this.mobileLayoutQuery.matches
      && !this.sidebarHidden
      && !event.target.closest('.configurator-sidebar')
    ) {
      this.setSidebarHidden(true, { userOverride: false });
      return;
    }

    const option = event.target.closest('[data-option-path]');
    if (option) {
      const updated = this.store.update(option.dataset.optionPath, option.dataset.optionValue);
      if (updated === false) this.showToast(this.runtimeMessage(this.store.getLastError?.(), 'feedback.optionUnavailable'));
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
    } else if (action === 'toggle-heater-direction') {
      const segment = actionTarget.dataset.segment || this.activeHeaterSegment;
      const direction = actionTarget.dataset.direction;
      if (!segment || !['first', 'second'].includes(direction)) return;
      const current = getHeaterConfig(this.state, segment) ?? { first: false, second: false };
      const next = { ...current, [direction]: !current[direction] };
      this.store.update(`accessories.heaters.${segment}`, next.first || next.second ? next : null);
    } else if (action === 'toggle-pole-sensor') {
      const sensor = actionTarget.dataset.sensor;
      if (!this.activePole) return;
      const updated = this.store.toggleSensorOnPole(sensor, this.activePole);
      if (updated === false) this.showToast(this.runtimeMessage(this.store.getLastError?.(), 'feedback.sensorFallback'));
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
        this.showToast(this.runtimeMessage(
          this.store.getLastError?.(),
          current ? 'feedback.componentRemove' : 'feedback.componentPlace',
        ));
      }
    } else if (action === 'remove-pole-mount') {
      const type = actionTarget.dataset.mountType;
      const path = `poleMounts.${this.activePole}.${this.activePoleFace}.${type}`;
      const updated = this.store.update(path, null);
      if (updated === false) this.showToast(this.runtimeMessage(this.store.getLastError?.(), 'feedback.componentRemove'));
    } else if (action === 'toggle-step-section') {
      const stepId = actionTarget.dataset.stepId;
      this.expandedStep = this.expandedStep === stepId ? null : stepId;
      this.render();
    } else if (action === 'toggle-environment') {
      this.environmentOpen = !this.environmentOpen;
      this.environmentPanel.classList.toggle('is-open', this.environmentOpen);
    } else if (action === 'toggle-night') {
      this.store.update('environment.night', !this.state.environment.night);
    } else if (action === 'save') {
      this.store.notify({ save: true });
      this.showToast(this.t('feedback.savedBrowser'));
    } else if (action === 'snapshot') {
      this.downloadSnapshot();
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
      this.showModal(this.t('modal.loginTitle'), `<p>${escapeHtml(this.t('modal.loginBody'))}</p>`);
    }
  }

  handleChange(event) {
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
    const input = event.target.closest('[data-path][data-continuous="true"]');
    if (!input) return;
    this.updateFromInput(input, true);
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
      this.showToast(this.runtimeMessage(this.store.getLastError?.(), 'feedback.overlapFallback'));
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
    this.closeSidebarForMobile();
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation">
        <section class="modal dimension-warning-modal" role="dialog" aria-modal="true" aria-labelledby="dimension-warning-title">
          <header><h2 id="dimension-warning-title">${escapeHtml(this.t('modal.dimensionTitle'))}</h2><button type="button" data-action="cancel-dimension-change" aria-label="${escapeHtml(this.t('modal.cancel'))}">×</button></header>
          <div class="modal__body">
            <p><strong>${escapeHtml(this.t('modal.dimensionWarningStrong'))}</strong></p>
            <p>${escapeHtml(this.t('modal.dimensionWarningBody'))}</p>
          </div>
          <footer class="dimension-warning-modal__actions">
            <button class="secondary-button" type="button" data-action="cancel-dimension-change">${escapeHtml(this.t('modal.cancel'))}</button>
            <button class="primary-button" type="button" data-action="confirm-dimension-change">${escapeHtml(this.t('modal.changeSize'))}</button>
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
    const total = formatMoney(price.total, this.state.currency, this.state.locale);
    this.showModal(this.t('modal.inquiryTitle'), `
      <p>${escapeHtml(this.t('modal.inquiryStored', { id: inquiry.id }))}</p>
      <p>${escapeHtml(this.t('modal.inquiryTotal', { total }))}</p>
      <p>${escapeHtml(this.t('modal.inquiryBackend'))}</p>
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
      screen.textContent = this.t('sides.percentOpen', { value: Math.round(openness) });
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
    this.syncSharedShell();
    this.root.querySelector('.sidebar-collapse-handle')?.classList.toggle('is-hidden-state', this.sidebarHidden);
  }

  setSidebarHidden(hidden, { userOverride = false, fromSharedShell = false } = {}) {
    const nextHidden = Boolean(hidden);
    if (userOverride) this.sidebarUserOverride = true;

    if (this.sharedShell && !fromSharedShell) {
      this.sharedShell.setSettingsPanelCollapsed(nextHidden);
      return;
    }

    this.sidebarHidden = nextHidden;

    if (this.mobileLayoutQuery.matches && !this.sidebarHidden) {
      this.environmentOpen = false;
      this.environmentPanel?.classList.remove('is-open');
      if (this.sharedShell?.toolsOpen) {
        this.sharedShell.toolsOpen = false;
        this.sharedShell.syncTools?.();
      }
    }

    this.render();
  }

  closeSidebarForMobile() {
    if (!this.mobileLayoutQuery.matches || this.sidebarHidden) return false;
    this.setSidebarHidden(true, { userOverride: false });
    return true;
  }

  syncMobileShellState() {
    const sidebar = this.root.querySelector('.configurator-sidebar');
    const sidebarContent = this.root.querySelector('.sidebar-scroll');
    const sidebarFooter = this.root.querySelector('.sidebar-footer');
    const hiddenForAccessibility = this.mobileLayoutQuery.matches && this.sidebarHidden;

    sidebar?.toggleAttribute('data-mobile-hidden', hiddenForAccessibility);
    if (sidebarContent) {
      sidebarContent.inert = hiddenForAccessibility;
      sidebarContent.setAttribute('aria-hidden', String(hiddenForAccessibility));
    }
    if (sidebarFooter) {
      sidebarFooter.inert = hiddenForAccessibility;
      sidebarFooter.setAttribute('aria-hidden', String(hiddenForAccessibility));
    }

    document.body.classList.add('pergola-sidebar-ready');
    document.body.classList.toggle(
      'pergola-sidebar-open',
      this.mobileLayoutQuery.matches && !this.sidebarHidden,
    );
  }

  syncSharedShell() {
    if (!this.sharedShell) return;
    this.sharedShell.setActionEnabled('undo', Boolean(this.store.canUndo?.()));
    this.sharedShell.setToolActive('dimensions', Boolean(this.state.view.dimensionsVisible));
    this.sharedShell.setToolActive('compass', Boolean(this.state.view.compassVisible));
    this.sharedShell.refreshConfiguratorPanelFooter?.();
  }

  toggleEnvironmentPanel() {
    this.setEnvironmentPanelOpen(!this.environmentOpen);
  }

  setEnvironmentPanelOpen(open) {
    this.environmentOpen = Boolean(open);
    this.environmentPanel?.classList.toggle('is-open', this.environmentOpen);
  }

  cycleCameraPreset() {
    const index = CAMERA_PRESETS.indexOf(this.state.view.cameraPreset);
    const next = CAMERA_PRESETS[(index + 1) % CAMERA_PRESETS.length];
    this.store.update('view.cameraPreset', next);
    this.showToast(this.t('feedback.camera', { camera: pergolaT(this.state.locale, `camera.${next}`) }));
  }

  downloadSnapshot() {
    if (!this.scene) return;
    const anchor = document.createElement('a');
    anchor.href = this.scene.capturePNG();
    anchor.download = `pergola-${Date.now()}.png`;
    anchor.click();
    this.showToast(this.t('feedback.snapshotDownloaded'));
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
    this.closeSidebarForMobile();
    this.modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <header><h2 id="modal-title">${escapeHtml(title)}</h2><button type="button" data-action="close-modal" aria-label="${escapeHtml(this.t('modal.close'))}">×</button></header>
          <div class="modal__body">${body}</div>
          <footer><button class="primary-button" type="button" data-action="close-modal">${escapeHtml(this.t('modal.close'))}</button></footer>
        </section>
      </div>
    `;
  }

  destroy() {
    this.unsubscribe?.();
    this.mobileLayoutQuery.removeEventListener?.('change', this.onMobileLayoutChange);
    document.body.classList.remove('pergola-sidebar-ready', 'pergola-sidebar-open');
  }
}

Object.assign(ConfiguratorUI.prototype, pergolaRenderers);
