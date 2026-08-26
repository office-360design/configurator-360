import { LANGUAGE_PROFILES, getLanguageProfile, getLocaleForHostname, getLocalizedConfiguratorUrl } from './config.js';
import { sharedT } from './i18n.js?v=18';
import { renderActionFeedback } from './components/feedback.js?v=17';
import { renderTopBar } from './components/topBar.js?v=18';
import { syncAccountIdentity } from './components/accountMenu.js?v=18';
import { observeGoogleAuth, signInWithGoogle, signOutGoogle } from './firebaseAuth.js?v=17';
import { renderToolsMenu } from './components/toolsMenu.js?v=17';
import { renderSavedConfigurationsDialog } from './components/savedConfigurationsDialog.js?v=17';
import { renderLanguageSwitchLoading } from './components/languageSwitchLoading.js?v=18';
import { deleteUserConfiguration, getUserConfiguration, listUserConfigurations, saveUserConfiguration } from './savedConfigurations.js?v=16';

const MAX_PROJECT_NUMBER = 1000;
const MAX_LOCAL_DRAFT_BYTES = 1_250_000;
const GLOBAL_LOCALE_STORAGE_KEY = '360-configurator:shared-ui:locale';
const SAVED_DOMAIN_ID_PARAM = 'savedConfig';
const SAVED_DOMAIN_OWNER_PARAM = 'savedOwner';
const SAVED_CONFIGURATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DOMAIN_SAVE_FAILURE_MESSAGE = 'Domain change failed because of a saving failure';
const DRAFT_PRODUCTS = new Set(['window', 'roof', 'pergola', 'hall', 'fence', 'solar']);
function readHashParams(target) {
  const raw = target.hash.startsWith('#') ? target.hash.slice(1) : target.hash;
  return new URLSearchParams(raw);
}

function writeHashParams(target, params) {
  const value = params.toString();
  target.hash = value ? `#${value}` : '';
}

function stripConfigurationTransport(target) {
  ['s', 'c', 'config', SAVED_DOMAIN_ID_PARAM, SAVED_DOMAIN_OWNER_PARAM].forEach((key) => target.searchParams.delete(key));
  const hash = readHashParams(target);
  ['s', 'c', 'config', SAVED_DOMAIN_ID_PARAM, SAVED_DOMAIN_OWNER_PARAM].forEach((key) => hash.delete(key));
  writeHashParams(target, hash);
  return target;
}

function savedConfigurationMissing(error) {
  const code = String(error?.code || '').toLowerCase().replace(/_/g, '-');
  const message = String(error?.message || '').toLowerCase();
  return code === 'not-found' || code === '404' || code === 'http-404' || message.includes('saved configuration not found');
}

function normalizeProductId(value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (normalized.includes('window')) return 'window';
  if (normalized.includes('pergola')) return 'pergola';
  if (normalized.includes('roof')) return 'roof';
  if (normalized.includes('hall')) return 'hall';
  if (normalized.includes('fence')) return 'fence';
  if (normalized.includes('solar')) return 'solar';
  return normalized || 'configuration';
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function setSelectValue(root, path, value) {
  const select = root.querySelector(`[data-path="${path}"]`);
  if (select) select.value = value;
}

export class StandaloneConfiguratorShell {
  constructor(options = {}) {
    this.options = {
      productType: 'Configuration',
      productId: '',
      brandSrc: './shared-ui/assets/360CONFIGURATOR.png',
      brandAlt: '360 Configurator',
      storagePrefix: '360-configurator:standalone',
      capabilities: {},
      callbacks: {},
      tools: { items: [], placement: {} },
      settingsPanel: null,
      ...options,
    };

    this.storagePrefix = this.options.storagePrefix;
    this.productId = normalizeProductId(this.options.productId || this.options.productType);
    // The old shell used one project-meta record for every authentication state.
    // Keep its key only for one-time migration; active project pointers are now
    // isolated by Firebase UID so one account can never leak into another/guest.
    this.legacyProjectMetaKey = `${this.storagePrefix}:project-meta`;
    this.projectCounterBaseKey = `${this.storagePrefix}:next-project-number`;
    this.preferencesKey = `${this.storagePrefix}:preferences`;

    const preferences = safeJsonParse(window.localStorage.getItem(this.preferencesKey), {});
    const domainLocale = getLocaleForHostname(window.location.hostname);
    const domainProfile = getLanguageProfile(domainLocale);
    const sharedLocale = window.localStorage.getItem(GLOBAL_LOCALE_STORAGE_KEY);
    const preferredLocale = LANGUAGE_PROFILES[sharedLocale]
      ? sharedLocale
      : (LANGUAGE_PROFILES[preferences.locale] ? preferences.locale : domainLocale);
    this.state = {
      locale: preferredLocale,
      units: domainProfile.units,
      currency: domainProfile.currency,
      quality: 'balanced',
      defaultArPlatform: 'android',
      darkMode: false,
      ...preferences,
      // The current domain only supplies the first-visit default. Once a user
      // chooses a language, keep that preference on this origin and translate
      // the configurator in place instead of navigating to another country site.
      locale: preferredLocale,
    };

    // Guests always start in their own unsaved book. Do not hydrate the previous
    // account's project name/id before Firebase tells us which user is active.
    this.projectName = this.getGuestProjectName();
    this.lastSavedProjectName = '';
    this.currentSavedConfigurationId = '';
    this.currentSavedOwnerUid = '';
    this.currentDraftStateJson = '';
    this.cleanStateJson = '';
    this.cleanProjectName = '';
    this.dirty = false;
    this.activeSessionUid = '';
    this.authInitialized = false;
    this.sessionSwitchToken = 0;
    this.draftPersistTimer = 0;
    this.accountOpen = false;
    this.accountSettingsOpen = false;
    this.domainOpen = false;
    this.domainBusy = false;
    this.authUser = null;
    this.authBusy = false;
    this.authUnsubscribe = null;
    this.languageOpen = false;
    this.toolsOpen = false;
    this.feedbackTimer = 0;
    this.saveBusy = false;
    this.savedLoadBlocked = false;
    this.pendingSavedDomainHandoff = this.readSavedDomainHandoff();
    this.savedDialog = { open: false, loading: false, error: '', items: [] };
    this.settingsPanelCollapsed = false;
    this.settingsPanel = null;
    this.settingsToggle = null;

    this.host = document.createElement('div');
    this.host.className = 'shared-ui-host';
    this.host.dataset.sharedUiHost = '';
    this.renderHost();
    document.body.prepend(this.host);
    document.body.classList.add('shared-ui-mounted');

    this.bindEvents();
    this.bindSettingsPanel();
    // Product-specific translation tables stay in each configurator, while the
    // shared shell owns when the locale changes. Apply the persisted locale once
    // on mount so a language chosen on this domain survives refreshes.
    this.options.callbacks.onPreferenceChange?.('locale', this.state.locale, this.state);
    this.sync();
    this.initializeAuthentication();
    this.dirtyWatchTimer = window.setInterval(() => this.refreshDirtyFromCapturedState(), 300);
  }

  getGuestProjectName() {
    return `${this.options.productType}#1`;
  }

  getProjectMetaKey(uid) {
    return `${this.storagePrefix}:project-meta:user:${encodeURIComponent(String(uid || ''))}`;
  }

  getProjectCounterKey(uid) {
    return `${this.projectCounterBaseKey}:user:${encodeURIComponent(String(uid || ''))}`;
  }

  getNextDefaultProjectName(uid = this.authUser?.uid || this.activeSessionUid) {
    if (!uid) return this.getGuestProjectName();
    const stored = Number(window.localStorage.getItem(this.getProjectCounterKey(uid)));
    const number = Number.isFinite(stored) && stored >= 1
      ? Math.min(MAX_PROJECT_NUMBER, Math.floor(stored))
      : 1;
    return `${this.options.productType}#${number}`;
  }

  readUserMeta(uid) {
    if (!uid) return {};
    const key = this.getProjectMetaKey(uid);
    let meta = safeJsonParse(window.localStorage.getItem(key), null);
    if (meta) return meta;

    // Migrate the pre-account-scoped pointer only when its owner matches the
    // current Firebase account. A guest must never inherit this legacy record.
    const legacy = safeJsonParse(window.localStorage.getItem(this.legacyProjectMetaKey), null);
    if (legacy && String(legacy.savedOwnerUid || '') === String(uid)) {
      meta = legacy;
      window.localStorage.setItem(key, JSON.stringify(meta));
      return meta;
    }
    return {};
  }


  readSavedDomainHandoff() {
    try {
      const target = new URL(window.location.href);
      const hash = readHashParams(target);
      const id = String(hash.get(SAVED_DOMAIN_ID_PARAM) || target.searchParams.get(SAVED_DOMAIN_ID_PARAM) || '').trim();
      if (!SAVED_CONFIGURATION_ID_PATTERN.test(id)) return null;
      const ownerUid = String(hash.get(SAVED_DOMAIN_OWNER_PARAM) || target.searchParams.get(SAVED_DOMAIN_OWNER_PARAM) || '').trim();
      return { id, ownerUid };
    } catch {
      return null;
    }
  }

  clearSavedDomainHandoffUrl() {
    try {
      const target = new URL(window.location.href);
      target.searchParams.delete(SAVED_DOMAIN_ID_PARAM);
      target.searchParams.delete(SAVED_DOMAIN_OWNER_PARAM);
      const hash = readHashParams(target);
      hash.delete(SAVED_DOMAIN_ID_PARAM);
      hash.delete(SAVED_DOMAIN_OWNER_PARAM);
      writeHashParams(target, hash);
      window.history.replaceState(window.history.state, '', target.href);
    } catch {
      // The saved configuration has already been restored; URL cleanup is best effort.
    }
  }

  async restoreSavedDomainHandoff(user) {
    const handoff = this.pendingSavedDomainHandoff;
    const uid = String(user?.uid || '');
    if (!handoff?.id || !uid) return false;

    if (handoff.ownerUid && handoff.ownerUid !== uid) {
      this.savedLoadBlocked = true;
      this.currentSavedConfigurationId = handoff.id;
      this.currentSavedOwnerUid = handoff.ownerUid;
      this.renderHost();
      this.sync();
      this.showFeedback(sharedT(this.state.locale, 'saved.openUnavailable'), 'error');
      return true;
    }

    try {
      const saved = await getUserConfiguration({ id: handoff.id, productType: this.productId });
      const restored = await this.restoreConfiguratorState(saved.state);
      if (!restored) throw new Error('Configurator rejected the domain-handoff saved state.');

      this.projectName = String(saved.name || this.getNextDefaultProjectName(uid)).slice(0, 80);
      this.lastSavedProjectName = this.projectName;
      this.currentSavedConfigurationId = handoff.id;
      this.currentSavedOwnerUid = uid;
      this.currentDraftStateJson = '';
      this.savedLoadBlocked = false;
      this.dirty = false;
      this.captureCleanBaseline();
      this.pendingSavedDomainHandoff = null;
      this.clearSavedDomainHandoffUrl();
      this.persistMeta();
      this.renderHost();
      this.sync();
      return true;
    } catch (error) {
      if (savedConfigurationMissing(error)) {
        console.warn('The saved configuration referenced by the domain handoff no longer exists.', error);
        this.pendingSavedDomainHandoff = null;
        this.clearSavedDomainHandoffUrl();
        return false;
      }

      console.error('The saved configuration could not be restored after the domain change.', error);
      this.savedLoadBlocked = true;
      this.currentSavedConfigurationId = handoff.id;
      this.currentSavedOwnerUid = uid;
      this.renderHost();
      this.sync();
      this.showFeedback(sharedT(this.state.locale, 'saved.openUnavailable'), 'error');
      return true;
    }
  }


  renderHost() {
    this.host.innerHTML = `
      ${renderTopBar({
        brandSrc: this.options.brandSrc,
        brandAlt: this.options.brandAlt,
        projectName: this.projectName,
        state: {
          ...this.state,
          authUser: this.authUser,
          domainOpen: this.domainOpen,
          currentDomainLocale: getLocaleForHostname(window.location.hostname),
        },
        capabilities: this.options.capabilities,
      })}
      ${renderActionFeedback(this.state.locale)}
      ${renderLanguageSwitchLoading(this.state.locale)}
      ${renderToolsMenu(this.toolsOpen, { ...this.options.tools, locale: this.state.locale })}
      ${renderSavedConfigurationsDialog(this.state.locale, this.savedDialog)}
    `;

    this.projectInput = this.host.querySelector('[data-project-name]');
    this.projectMeasure = this.host.querySelector('[data-project-name-measure]');
    this.dirtyIndicator = this.host.querySelector('[data-project-dirty]');
    this.accountMenu = this.host.querySelector('[data-account-menu]');
    this.languageMenu = this.host.querySelector('[data-language-menu]');
    this.feedback = this.host.querySelector('[data-save-feedback]');
    this.feedbackText = this.host.querySelector('[data-save-feedback-text]');
    this.languageSwitchLoading = this.host.querySelector('[data-language-switch-loading]');
  }

  bindEvents() {
    this.host.addEventListener('click', (event) => { void this.handleClick(event); });
    this.host.addEventListener('input', (event) => this.handleInput(event));
    this.host.addEventListener('change', (event) => this.handleChange(event));

    this.onDocumentClick = (event) => {
      if (!event.target.closest('[data-account-menu], [data-action="account"]')) {
        this.accountOpen = false;
        this.domainOpen = false;
      }
      if (!event.target.closest('[data-language-menu], [data-action="language"]')) {
        this.languageOpen = false;
      }
      this.syncMenus();
    };
    document.addEventListener('click', this.onDocumentClick);

    this.onKeyDown = (event) => {
      if (event.key === 'Escape') {
        const savedDialogWasOpen = this.savedDialog.open;
        this.accountOpen = false;
        this.languageOpen = false;
        this.domainOpen = false;
        this.savedDialog.open = false;
        if (this.toolsOpen) {
          this.toolsOpen = false;
          this.syncTools();
          this.options.callbacks.onToolsOpenChange?.(false);
        }
        if (savedDialogWasOpen) this.renderHost();
        this.sync();
      }
    };
    document.addEventListener('keydown', this.onKeyDown);

    this.onBeforeUnload = () => {
      if (!this.authUser?.uid || !this.dirty) return;
      this.captureDraftState();
      this.persistMeta();
    };
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }


  bindSettingsPanel() {
    const config = this.options.settingsPanel;
    if (!config) return;

    this.settingsPanel = document.querySelector(config.panelSelector);
    this.settingsToggle = document.querySelector(config.toggleSelector);
    if (!this.settingsPanel || !this.settingsToggle) return;

    this.onSettingsToggle = () => this.setSettingsPanelCollapsed(!this.settingsPanelCollapsed);
    this.settingsToggle.addEventListener('click', this.onSettingsToggle);
    this.setSettingsPanelCollapsed(Boolean(config.initiallyCollapsed), { silent: true });
  }

  setSettingsPanelCollapsed(collapsed, { silent = false } = {}) {
    const config = this.options.settingsPanel;
    if (!config || !this.settingsPanel || !this.settingsToggle) return;
    this.settingsPanelCollapsed = Boolean(collapsed);
    this.settingsPanel.classList.toggle(config.collapsedClass ?? 'is-collapsed', this.settingsPanelCollapsed);
    if (config.bodyCollapsedClass) {
      document.body.classList.toggle(config.bodyCollapsedClass, this.settingsPanelCollapsed);
    }
    this.settingsToggle.setAttribute('aria-expanded', String(!this.settingsPanelCollapsed));
    const settingsToggleLabel = sharedT(this.state.locale, this.settingsPanelCollapsed ? 'settingsPanel.show' : 'settingsPanel.hide');
    this.settingsToggle.setAttribute('aria-label', settingsToggleLabel);
    this.settingsToggle.setAttribute('title', settingsToggleLabel);
    if (!silent) this.options.callbacks.onSettingsPanelToggle?.(this.settingsPanelCollapsed);
  }

  captureCurrentStateJson() {
    try {
      const snapshot = this.options.callbacks.captureState?.();
      if (snapshot === undefined || snapshot === null) return '';
      return JSON.stringify(snapshot);
    } catch {
      return '';
    }
  }

  captureCleanBaseline() {
    const json = this.captureCurrentStateJson();
    if (!json) return;
    this.cleanStateJson = json;
    this.cleanProjectName = this.projectName;
  }

  refreshDirtyFromCapturedState() {
    if (!this.authUser?.uid || !this.currentSavedConfigurationId || !this.cleanStateJson) return;
    const currentJson = this.captureCurrentStateJson();
    if (!currentJson) return;
    const hasUnsavedChanges = currentJson !== this.cleanStateJson || this.projectName !== this.cleanProjectName;
    if (hasUnsavedChanges === this.dirty) return;

    this.dirty = hasUnsavedChanges;
    if (hasUnsavedChanges) {
      this.scheduleDraftPersistence();
    } else {
      this.currentDraftStateJson = '';
      this.persistMeta();
    }
    this.syncDirty();
  }

  captureDraftState() {
    if (!this.authUser?.uid || !this.dirty || !DRAFT_PRODUCTS.has(this.productId)) return;
    try {
      const snapshot = this.options.callbacks.captureState?.();
      if (snapshot === undefined || snapshot === null) return;
      const json = JSON.stringify(snapshot);
      if (json.length <= MAX_LOCAL_DRAFT_BYTES) this.currentDraftStateJson = json;
    } catch (error) {
      console.warn('The current account draft could not be cached locally.', error);
    }
  }

  scheduleDraftPersistence() {
    if (!this.authUser?.uid || !this.dirty || !DRAFT_PRODUCTS.has(this.productId)) return;
    window.clearTimeout(this.draftPersistTimer);
    this.draftPersistTimer = window.setTimeout(() => {
      this.captureDraftState();
      this.persistMeta();
    }, 180);
  }

  flushDraftPersistence() {
    window.clearTimeout(this.draftPersistTimer);
    this.draftPersistTimer = 0;
    if (!this.authUser?.uid || !this.dirty) return;
    this.captureDraftState();
    this.persistMeta();
  }

  async initializeAuthentication() {
    try {
      this.authUnsubscribe = await observeGoogleAuth((user, error) => {
        if (error) return;
        this.authBusy = false;
        void this.handleAuthStateChange(user, { initial: !this.authInitialized });
      });
    } catch (error) {
      console.error('Google authentication could not be initialized.', error);
      this.authInitialized = true;
      await this.enterGuestSession({ resetModel: false });
    }
  }

  async handleAuthStateChange(user, { initial = false } = {}) {
    const nextUid = String(user?.uid || '');
    const previousUid = this.activeSessionUid;
    this.authInitialized = true;

    if (nextUid && nextUid === previousUid) {
      this.authUser = user;
      this.sync();
      return;
    }
    if (previousUid && nextUid !== previousUid) this.flushDraftPersistence();
    if (!nextUid && !previousUid) {
      this.authUser = null;
      await this.enterGuestSession({ resetModel: false });
      this.options.callbacks.onAuthChange?.(null);
      return;
    }

    if (nextUid) {
      await this.enterUserSession(user);
      this.options.callbacks.onAuthChange?.(user);
      return;
    }

    // A transition from an authenticated account to guest is an explicit book
    // switch: reset the configurator itself, not only the visible project name.
    await this.enterGuestSession({ resetModel: !initial });
    this.options.callbacks.onAuthChange?.(null);
  }

  async restoreConfiguratorState(snapshot) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const callback = this.options.callbacks.restoreState;
      if (typeof callback === 'function') {
        const handled = await Promise.resolve(callback(snapshot));
        if (handled !== false && handled !== undefined && handled !== null) return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 75));
    }
    return false;
  }

  async resetConfiguratorToDefault() {
    // Some configurators expose their default snapshot shortly after their API is
    // created. A reset request during an auth transition must wait for that state
    // instead of silently accepting a false/undefined reset.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      // New Configuration is a shared account/navigation lifecycle. Each
      // configurator only supplies the smallest model-specific primitive: how to
      // restore its own default geometry/state. The shared shell owns everything
      // else (authentication guard, draft detachment, naming, dirty state and
      // persistence).
      const callback = this.options.callbacks.resetConfiguration;
      if (typeof callback === 'function') {
        const handled = await Promise.resolve(callback());
        if (handled !== false) return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 75));
    }
    return false;
  }

  async enterGuestSession({ resetModel = false } = {}) {
    const token = ++this.sessionSwitchToken;
    this.authUser = null;
    this.activeSessionUid = '';
    this.savedLoadBlocked = false;
    this.projectName = this.getGuestProjectName();
    this.lastSavedProjectName = '';
    this.currentSavedConfigurationId = '';
    this.currentSavedOwnerUid = '';
    this.cleanStateJson = '';
    this.cleanProjectName = '';
    this.dirty = false;
    this.savedDialog = { open: false, loading: false, error: '', items: [] };

    if (resetModel) await this.resetConfiguratorToDefault();
    if (token !== this.sessionSwitchToken) return;
    this.projectName = this.getGuestProjectName();
    this.lastSavedProjectName = '';
    this.currentSavedConfigurationId = '';
    this.currentSavedOwnerUid = '';
    this.currentDraftStateJson = '';
    this.cleanStateJson = '';
    this.cleanProjectName = '';
    this.dirty = false;
    this.renderHost();
    this.sync();
  }

  async enterUserSession(user) {
    const uid = String(user?.uid || '');
    if (!uid) return this.enterGuestSession({ resetModel: false });
    const token = ++this.sessionSwitchToken;
    this.authUser = user;
    this.activeSessionUid = uid;
    this.savedLoadBlocked = false;
    this.savedDialog = { open: false, loading: false, error: '', items: [] };

    if (await this.restoreSavedDomainHandoff(user)) return;

    const meta = this.readUserMeta(uid);
    this.projectName = String(meta.name || this.getNextDefaultProjectName(uid)).slice(0, 80);
    this.lastSavedProjectName = String(meta.savedName || '');
    this.currentSavedConfigurationId = String(meta.savedConfigurationId || '');
    this.currentSavedOwnerUid = uid;
    this.currentDraftStateJson = String(meta.draftStateJson || '');
    this.cleanStateJson = '';
    this.cleanProjectName = '';
    this.dirty = Boolean(meta.dirty);
    this.renderHost();
    this.sync();

    if (this.dirty && this.currentDraftStateJson) {
      try {
        const draft = JSON.parse(this.currentDraftStateJson);
        const restored = await this.restoreConfiguratorState(draft);
        if (!restored) throw new Error('Configurator rejected the local account draft.');
        if (token !== this.sessionSwitchToken) return;
        this.persistMeta();
        this.renderHost();
        this.sync();
        return;
      } catch (error) {
        console.warn('The last local account draft could not be restored; falling back to the saved configuration.', error);
        this.currentDraftStateJson = '';
      }
    }

    if (!this.currentSavedConfigurationId) {
      await this.resetConfiguratorToDefault();
      if (token !== this.sessionSwitchToken) return;
      this.projectName = this.getNextDefaultProjectName(uid);
      this.lastSavedProjectName = '';
      this.dirty = true;
      this.captureDraftState();
      this.persistMeta();
      this.renderHost();
      this.sync();
      return;
    }

    try {
      const saved = await getUserConfiguration({
        id: this.currentSavedConfigurationId,
        productType: this.productId,
      });
      if (token !== this.sessionSwitchToken) return;
      const restored = await this.restoreConfiguratorState(saved.state);
      if (!restored) throw new Error('Configurator rejected the saved state.');
      this.projectName = String(saved.name || this.projectName).slice(0, 80);
      this.lastSavedProjectName = this.projectName;
      this.currentSavedOwnerUid = uid;
      this.currentDraftStateJson = '';
      this.savedLoadBlocked = false;
      this.dirty = false;
      this.captureCleanBaseline();
      this.persistMeta();
      this.renderHost();
      this.sync();
    } catch (error) {
      if (token !== this.sessionSwitchToken) return;
      console.error('The last account configuration could not be restored.', error);

      if (!savedConfigurationMissing(error)) {
        // Do not convert a temporary load failure into a permanent local detach.
        // The remote document is persistent and may be perfectly healthy; keep
        // its id so refresh/re-login can retry, and disable Save until a valid
        // account state has been restored.
        this.savedLoadBlocked = true;
        this.currentSavedOwnerUid = uid;
        this.currentDraftStateJson = '';
        this.dirty = false;
        this.renderHost();
        this.sync();
        this.showFeedback(sharedT(this.state.locale, 'saved.openUnavailable'), 'error');
        return;
      }

      this.savedLoadBlocked = false;
      this.currentSavedConfigurationId = '';
      this.currentSavedOwnerUid = uid;
      this.currentDraftStateJson = '';
      this.projectName = this.getNextDefaultProjectName(uid);
      this.lastSavedProjectName = '';
      this.dirty = true;
      await this.resetConfiguratorToDefault();
      this.persistMeta();
      this.renderHost();
      this.sync();
    }
  }

  async loginWithGoogle() {
    if (this.authBusy) return null;
    this.authBusy = true;
    syncAccountIdentity(this.host, this.state.locale, this.authUser, { busy: true });
    try {
      const user = await signInWithGoogle();
      if (user) await this.handleAuthStateChange(user);
      this.accountOpen = true;
      this.options.callbacks.onAccountAction?.('login', user);
      return user;
    } catch (error) {
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        console.error('Google login failed.', error);
        this.showFeedback(sharedT(this.state.locale, 'feedback.loginUnavailable'), 'error');
      }
      return null;
    } finally {
      this.authBusy = false;
      this.sync();
    }
  }

  async logoutFromGoogle() {
    try {
      this.flushDraftPersistence();
      const previousUid = this.activeSessionUid;
      await signOutGoogle();
      // The auth observer normally performs the switch. If it has not fired yet,
      // perform it here exactly once so the model is always reset for the guest.
      if (this.activeSessionUid === previousUid) await this.handleAuthStateChange(null);
      this.accountOpen = true;
      this.options.callbacks.onAccountAction?.('signout');
      this.showFeedback(sharedT(this.state.locale, 'feedback.loggedOut'));
    } catch (error) {
      console.error('Google sign-out failed.', error);
    } finally {
      this.sync();
    }
  }

  showLanguageSwitchLoading() {
    const overlay = this.languageSwitchLoading || this.host.querySelector('[data-language-switch-loading]');
    if (!overlay) return;

    const title = overlay.querySelector('[data-language-switch-loading-title]');
    const detail = overlay.querySelector('[data-language-switch-loading-detail]');
    if (title) title.textContent = sharedT(this.state.locale, 'language.switching');
    if (detail) detail.textContent = sharedT(this.state.locale, 'language.switchingDetail');

    this.host.classList.add('is-language-switching');
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  showDomainSwitchLoading() {
    const overlay = this.languageSwitchLoading || this.host.querySelector('[data-language-switch-loading]');
    if (!overlay) return;
    const title = overlay.querySelector('[data-language-switch-loading-title]');
    const detail = overlay.querySelector('[data-language-switch-loading-detail]');
    if (title) title.textContent = sharedT(this.state.locale, 'domain.switching');
    if (detail) detail.textContent = sharedT(this.state.locale, 'domain.switchingDetail');
    this.host.classList.add('is-language-switching');
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
  }

  hideLanguageSwitchLoading() {
    const overlay = this.languageSwitchLoading || this.host.querySelector('[data-language-switch-loading]');
    if (!overlay) return;
    this.host.classList.remove('is-language-switching');
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
  }

  waitForLanguageSwitchPaint() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }

  ownsCurrentSavedConfiguration() {
    const user = this.authUser;
    const savedId = String(this.currentSavedConfigurationId || '');
    return Boolean(
      user?.uid
      && SAVED_CONFIGURATION_ID_PATTERN.test(savedId)
      && this.currentSavedOwnerUid === user.uid
    );
  }

  buildSavedDomainTarget(targetUrl) {
    const target = stripConfigurationTransport(new URL(targetUrl, window.location.href));
    const hash = readHashParams(target);
    hash.set(SAVED_DOMAIN_ID_PARAM, this.currentSavedConfigurationId);
    hash.set(SAVED_DOMAIN_OWNER_PARAM, this.authUser.uid);
    writeHashParams(target, hash);
    return target.href;
  }

  async buildSharedDomainTarget(nextLocale) {
    const shareUrl = await Promise.resolve(this.options.callbacks.getShareUrl?.() || '');
    if (!shareUrl) throw new Error('A share URL could not be generated for the domain change.');
    const target = getLocalizedConfiguratorUrl(nextLocale, this.productId, new URL(shareUrl, window.location.href));
    if (!target) throw new Error('The destination domain URL could not be generated.');
    return target;
  }

  async changeSiteDomain(nextLocale) {
    if (this.domainBusy || !LANGUAGE_PROFILES[nextLocale]) return;
    const targetUrl = getLocalizedConfiguratorUrl(nextLocale, this.productId, window.location);
    if (!targetUrl) return;

    const currentDomainLocale = getLocaleForHostname(window.location.hostname);
    if (nextLocale === currentDomainLocale) {
      this.domainOpen = false;
      this.sync();
      return;
    }

    this.domainBusy = true;
    this.domainOpen = false;
    this.sync();
    this.showDomainSwitchLoading();
    await this.waitForLanguageSwitchPaint();

    let navigating = false;
    try {
      this.refreshDirtyFromCapturedState();
      if (this.ownsCurrentSavedConfiguration()) {
        if (this.dirty) {
          const saveButton = this.host.querySelector('[data-action="save"]');
          const saved = await this.save(saveButton, { suppressFeedback: true });
          if (!saved) {
            this.hideLanguageSwitchLoading();
            this.showFeedback(DOMAIN_SAVE_FAILURE_MESSAGE, 'error', 2000);
            return;
          }
        }
        const target = this.buildSavedDomainTarget(targetUrl);
        navigating = true;
        window.location.assign(target);
        return;
      }

      const target = await this.buildSharedDomainTarget(nextLocale);
      navigating = true;
      window.location.assign(target);
    } catch (error) {
      console.error('The site domain could not be changed while preserving the configuration.', error);
      this.hideLanguageSwitchLoading();
      this.showFeedback(sharedT(this.state.locale, 'feedback.domainSwitchUnavailable'), 'error', 2000);
    } finally {
      this.domainBusy = false;
      if (!navigating) this.sync();
    }
  }

  async handleClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;

    if (action === 'save') {
      void this.save(actionTarget);
    } else if (action === 'new-configuration') {
      void this.createNewConfiguration();
    } else if (action === 'undo') {
      this.options.callbacks.onUndo?.();
    } else if (action === 'reset') {
      void this.resetConfiguration();
    } else if (action === 'view-ar') {
      this.options.callbacks.onViewAR?.();
    } else if (action === 'share') {
      this.share(actionTarget);
    } else if (action === 'account') {
      this.accountOpen = !this.accountOpen;
      if (!this.accountOpen) this.domainOpen = false;
      this.languageOpen = false;
      this.syncMenus();
    } else if (action === 'language') {
      this.languageOpen = !this.languageOpen;
      this.accountOpen = false;
      this.domainOpen = false;
      this.syncMenus();
      if (this.languageOpen) {
        window.setTimeout(() => this.host.querySelector('[data-language-search]')?.focus(), 0);
      }
    } else if (action === 'toggle-tools') {
      this.toolsOpen = !this.toolsOpen;
      this.syncTools();
      this.options.callbacks.onToolsOpenChange?.(this.toolsOpen);
    } else if (action === 'toggle-domain-menu') {
      this.domainOpen = !this.domainOpen;
      this.accountSettingsOpen = false;
      this.sync();
    } else if (action === 'select-domain') {
      void this.changeSiteDomain(actionTarget.dataset.domainLocale);
    } else if (action === 'toggle-account-settings') {
      this.accountSettingsOpen = !this.accountSettingsOpen;
      this.domainOpen = false;
      this.syncAccountSettings();
      this.syncDomainMenu();
    } else if (action === 'toggle-dark-mode') {
      this.state.darkMode = !this.state.darkMode;
      this.persistPreferences();
      this.options.callbacks.onPreferenceChange?.('darkMode', this.state.darkMode, this.state);
      this.sync();
    } else if (action === 'select-language') {
      const nextLocale = actionTarget.dataset.locale;
      const profile = LANGUAGE_PROFILES[nextLocale];
      if (profile && nextLocale !== this.state.locale) {
        // Language switching is intentionally local to the current page/origin.
        // Do not create a share, load a saved configuration, or navigate between
        // country domains: only translate the current configurator in place.
        this.languageOpen = false;
        this.syncMenus();
        this.showLanguageSwitchLoading();
        await this.waitForLanguageSwitchPaint();

        const previousLocale = this.state.locale;
        try {
          this.state.locale = nextLocale;
          this.persistPreferences();
          await Promise.resolve(this.options.callbacks.onPreferenceChange?.('locale', this.state.locale, this.state));
          this.renderHost();
          this.sync();
          await this.waitForLanguageSwitchPaint();
        } catch (error) {
          this.state.locale = previousLocale;
          this.persistPreferences();
          try {
            await Promise.resolve(this.options.callbacks.onPreferenceChange?.('locale', previousLocale, this.state));
          } catch {
            // Preserve the original translation error below.
          }
          this.renderHost();
          this.sync();
          console.error('The configurator could not be translated.', error);
          this.showFeedback(sharedT(this.state.locale, 'feedback.languageSwitchUnavailable'), 'error');
        } finally {
          this.hideLanguageSwitchLoading();
        }
        return;
      }
      this.languageOpen = false;
      this.sync();
    } else if (action === 'account-login') {
      this.loginWithGoogle();
    } else if (action === 'account-profile') {
      this.options.callbacks.onAccountAction?.('profile');
    } else if (action === 'account-saved') {
      void this.openSavedConfigurations();
    } else if (action === 'saved-close') {
      this.closeSavedConfigurations();
    } else if (action === 'saved-open') {
      void this.openSavedConfiguration(actionTarget.dataset.savedId);
    } else if (action === 'saved-delete') {
      void this.deleteSavedConfiguration(actionTarget.dataset.savedId);
    } else if (action === 'account-help') {
      this.options.callbacks.onAccountAction?.('help');
    } else if (action === 'cookies-placeholder') {
      this.options.callbacks.onAccountAction?.('cookies');
    } else if (action === 'account-signout') {
      this.logoutFromGoogle();
    } else if (actionTarget.dataset.toolId) {
      this.options.callbacks.onToolAction?.({
        action,
        toolId: actionTarget.dataset.toolId,
        target: actionTarget,
      });
    }
  }

  handleInput(event) {
    if (event.target.matches('[data-project-name]')) {
      if (!this.authUser?.uid) return;
      this.projectName = event.target.value;
      this.markDirty();
      this.persistMeta();
      this.syncProjectNameWidth();
      return;
    }

    if (event.target.matches('[data-language-search]')) {
      const query = String(event.target.value).trim().toLocaleLowerCase('ro');
      this.host.querySelectorAll('[data-language-name]').forEach((button) => {
        button.hidden = Boolean(query) && !button.dataset.languageName.includes(query);
      });
    }
  }

  handleChange(event) {
    const field = event.target.closest('[data-path]');
    if (!field) return;
    this.state[field.dataset.path] = field.value;
    this.persistPreferences();
    this.options.callbacks.onPreferenceChange?.(field.dataset.path, field.value, this.state);
  }

  async save(button, { suppressFeedback = false } = {}) {
    if (this.saveBusy) return false;
    if (this.savedLoadBlocked) {
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saveUnavailable'), 'error');
      return false;
    }

    const user = this.authUser;
    if (!user?.uid) {
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saveLoginRequired'), 'error');
      return false;
    }

    const configuration = this.options.callbacks.captureState?.();
    if (configuration === undefined || configuration === null) {
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saveUnavailable'), 'error');
      return false;
    }

    this.saveBusy = true;
    if (button) button.disabled = true;
    try {
      const result = await saveUserConfiguration({
        id: this.currentSavedOwnerUid === user.uid ? this.currentSavedConfigurationId : '',
        productType: this.productId,
        name: this.projectName,
        state: configuration,
      });

      this.currentSavedConfigurationId = String(result?.id || this.currentSavedConfigurationId || '');
      this.currentSavedOwnerUid = user.uid;
      this.currentDraftStateJson = '';
      this.savedLoadBlocked = false;
      if (button) {
        button.classList.remove('is-success');
        void button.offsetWidth;
        button.classList.add('is-success');
      }
      this.dirty = false;
      this.lastSavedProjectName = this.projectName;
      this.captureCleanBaseline();
      this.reserveNextDefaultName();
      this.persistMeta();
      this.options.callbacks.onSave?.({
        projectName: this.projectName,
        preferences: { ...this.state },
        savedConfigurationId: this.currentSavedConfigurationId,
      });
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saved'));
      this.sync();
      if (button) window.setTimeout(() => button.classList.remove('is-success'), 1050);
      return true;
    } catch (error) {
      console.error('Configuration could not be saved to the user account.', error);
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saveUnavailable'), 'error');
      return false;
    } finally {
      this.saveBusy = false;
      this.syncAuthenticationControls();
    }
  }


  async resetConfiguration() {
    if (!window.confirm(sharedT(this.state.locale, 'reset.confirm'))) return;
    try {
      await this.resetConfiguratorToDefault();
    } catch (error) {
      console.error('The configuration could not be reset.', error);
    }
  }


  async createNewConfiguration() {
    if (!this.authUser?.uid) return;
    try {
      const handled = await this.resetConfiguratorToDefault();
      if (!handled) return;
      this.currentSavedConfigurationId = '';
      this.currentSavedOwnerUid = this.authUser.uid;
      this.savedLoadBlocked = false;
      this.currentDraftStateJson = '';
      this.cleanStateJson = '';
      this.cleanProjectName = '';
      this.projectName = this.getNextDefaultProjectName(this.authUser.uid);
      this.lastSavedProjectName = '';
      this.dirty = true;
      this.savedDialog.open = false;
      this.captureDraftState();
      this.persistMeta();
      this.renderHost();
      this.sync();
    } catch (error) {
      console.error('A new configuration could not be started.', error);
    }
  }

  async openSavedConfigurations() {
    if (!this.authUser) return;
    this.accountOpen = false;
    this.savedDialog = { open: true, loading: true, error: '', items: [] };
    this.renderHost();
    this.sync();
    try {
      const items = await listUserConfigurations({ productType: this.productId });
      this.savedDialog = { open: true, loading: false, error: '', items };
    } catch (error) {
      console.error('Saved configurations could not be loaded.', error);
      this.savedDialog = {
        open: true,
        loading: false,
        error: sharedT(this.state.locale, 'saved.loadUnavailable'),
        items: [],
      };
    }
    this.renderHost();
    this.sync();
  }

  closeSavedConfigurations() {
    if (!this.savedDialog.open) return;
    this.savedDialog.open = false;
    this.renderHost();
    this.sync();
  }

  async openSavedConfiguration(id) {
    const savedId = String(id || '');
    if (!savedId || !this.authUser) return;
    try {
      const saved = await getUserConfiguration({ id: savedId, productType: this.productId });
      const restored = await this.restoreConfiguratorState(saved.state);
      if (!restored) throw new Error('Configurator rejected the saved state.');
      this.projectName = String(saved.name || this.projectName).slice(0, 80);
      this.lastSavedProjectName = this.projectName;
      this.currentSavedConfigurationId = savedId;
      this.currentSavedOwnerUid = this.authUser.uid;
      this.currentDraftStateJson = '';
      this.savedLoadBlocked = false;
      this.dirty = false;
      this.captureCleanBaseline();
      this.persistMeta();
      this.savedDialog.open = false;
      this.renderHost();
      this.sync();
      this.showFeedback(sharedT(this.state.locale, 'feedback.opened'));
      this.options.callbacks.onSavedConfigurationOpen?.(saved);
    } catch (error) {
      console.error('Saved configuration could not be opened.', error);
      this.showFeedback(sharedT(this.state.locale, 'saved.openUnavailable'), 'error');
    }
  }

  async deleteSavedConfiguration(id) {
    const savedId = String(id || '');
    if (!savedId || !this.authUser) return;
    if (!window.confirm(sharedT(this.state.locale, 'saved.deleteConfirm'))) return;
    try {
      await deleteUserConfiguration({ id: savedId, productType: this.productId });
      if (this.currentSavedConfigurationId === savedId) {
        this.currentSavedConfigurationId = '';
        this.currentSavedOwnerUid = this.authUser.uid;
        this.cleanStateJson = '';
        this.cleanProjectName = '';
        this.dirty = true;
        this.captureDraftState();
        this.persistMeta();
      }
      await this.openSavedConfigurations();
    } catch (error) {
      console.error('Saved configuration could not be deleted.', error);
      this.showFeedback(sharedT(this.state.locale, 'saved.deleteUnavailable'), 'error');
    }
  }

  async share(button) {
    let url;
    try {
      url = await Promise.resolve(this.options.callbacks.getShareUrl?.() || window.location.href);
    } catch (error) {
      console.error('Share link could not be created.', error);
      this.showFeedback(sharedT(this.state.locale, 'feedback.shareUnavailable'), 'error');
      return;
    }

    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.append(textarea);
      textarea.select();
      copied = document.execCommand('copy');
      textarea.remove();
    }
    if (!copied) return;
    button.classList.add('is-success');
    this.showFeedback(sharedT(this.state.locale, 'feedback.linkCopied'));
    window.setTimeout(() => button.classList.remove('is-success'), 1050);
  }

  showFeedback(message, type = 'success', durationMs = 1050) {
    window.clearTimeout(this.feedbackTimer);
    const feedbackType = type === 'error' ? 'is-error' : 'is-success';
    this.feedback.classList.remove('is-success', 'is-error', 'is-animating');
    void this.feedback.offsetWidth;
    const duration = Math.max(300, Number(durationMs) || 1050);
    this.feedback.style.animationDuration = `${duration}ms`;
    this.feedback.classList.add(feedbackType, 'is-animating');
    this.feedbackText.textContent = message;
    this.feedbackTimer = window.setTimeout(() => this.feedback.classList.remove('is-animating'), duration);
  }

  markDirty() {
    if (!this.authUser?.uid) return;
    const wasDirty = this.dirty;
    this.dirty = true;
    this.scheduleDraftPersistence();
    if (!wasDirty) this.syncDirty();
  }

  reserveNextDefaultName() {
    const uid = this.authUser?.uid || this.activeSessionUid;
    if (!uid) return;
    const escapedType = this.options.productType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^${escapedType}#(\\d{1,4})$`, 'i').exec(this.projectName.trim());
    if (!match) return;
    const next = Math.min(MAX_PROJECT_NUMBER, Number(match[1]) + 1);
    const key = this.getProjectCounterKey(uid);
    const stored = Number(window.localStorage.getItem(key)) || 1;
    window.localStorage.setItem(key, String(Math.max(stored, next)));
  }

  persistMeta() {
    const uid = this.authUser?.uid || this.activeSessionUid;
    if (!uid) return;
    window.localStorage.setItem(this.getProjectMetaKey(uid), JSON.stringify({
      name: this.projectName,
      savedName: this.lastSavedProjectName,
      dirty: this.dirty,
      savedConfigurationId: this.currentSavedConfigurationId,
      savedOwnerUid: uid,
      draftStateJson: this.currentDraftStateJson,
    }));
  }

  persistPreferences() {
    window.localStorage.setItem(this.preferencesKey, JSON.stringify(this.state));
    if (LANGUAGE_PROFILES[this.state.locale]) {
      window.localStorage.setItem(GLOBAL_LOCALE_STORAGE_KEY, this.state.locale);
    }
  }

  sync() {
    this.host.classList.toggle('is-dark-mode', Boolean(this.state.darkMode));
    this.syncDirty();
    this.syncProjectNameWidth();
    this.syncMenus();
    this.syncAccountSettings();
    this.syncDomainMenu();
    this.syncAuthenticationControls();
    syncAccountIdentity(this.host, this.state.locale, this.authUser, { busy: this.authBusy });
    this.syncLanguage();
    this.syncTools();
    document.body.classList.toggle('shared-ui-dark-mode', Boolean(this.state.darkMode));
    document.querySelector('.app-shell')?.classList.toggle('is-dark-mode', Boolean(this.state.darkMode));
  }

  syncDirty() {
    this.dirtyIndicator?.classList.toggle('is-hidden', !this.dirty || !this.authUser?.uid);
  }

  syncProjectNameWidth() {
    if (!this.projectInput || !this.projectMeasure) return;
    if (document.activeElement !== this.projectInput) this.projectInput.value = this.projectName;
    this.projectMeasure.textContent = this.projectName || ' ';
    const measured = Math.ceil(this.projectMeasure.getBoundingClientRect().width);
    const maxWidth = Math.min(520, Math.max(180, window.innerWidth * 0.44));
    this.projectInput.style.width = `${Math.min(maxWidth, Math.max(96, measured + 20))}px`;
  }

  syncMenus() {
    this.accountMenu?.classList.toggle('is-open', this.accountOpen);
    this.languageMenu?.classList.toggle('is-open', this.languageOpen);
    this.host.querySelector('[data-action="account"]')?.setAttribute('aria-expanded', String(this.accountOpen));
    this.host.querySelector('[data-action="language"]')?.setAttribute('aria-expanded', String(this.languageOpen));
  }

  syncDomainMenu() {
    this.host.querySelectorAll('[data-account-domain]').forEach((menu) => menu.classList.toggle('is-open', this.domainOpen));
    this.host.querySelectorAll('[data-action="toggle-domain-menu"]').forEach((button) => button.setAttribute('aria-expanded', String(this.domainOpen)));
    const currentDomainLocale = getLocaleForHostname(window.location.hostname);
    this.host.querySelectorAll('[data-action="select-domain"]').forEach((button) => {
      const selected = button.dataset.domainLocale === currentDomainLocale;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-current', selected ? 'true' : 'false');
      button.disabled = this.domainBusy;
      const check = button.querySelector('.account-domain__check');
      if (check) check.textContent = selected ? '✓' : '';
    });
  }

  syncAuthenticationControls() {
    const authenticated = Boolean(this.authUser?.uid);
    const saveEnabled = authenticated && this.options.capabilities.save !== false && !this.saveBusy && !this.savedLoadBlocked && !this.domainBusy;
    const newEnabled = authenticated && this.options.capabilities.save !== false && !this.domainBusy;
    const saveButton = this.host.querySelector('[data-action="save"]');
    const newButton = this.host.querySelector('[data-action="new-configuration"]');
    if (saveButton) {
      saveButton.disabled = !saveEnabled;
      saveButton.setAttribute('aria-disabled', String(!saveEnabled));
    }
    if (newButton) {
      newButton.disabled = !newEnabled;
      newButton.setAttribute('aria-disabled', String(!newEnabled));
    }
    if (this.projectInput) {
      this.projectInput.readOnly = !authenticated;
      this.projectInput.disabled = !authenticated;
      this.projectInput.tabIndex = authenticated ? 0 : -1;
      this.projectInput.setAttribute('aria-readonly', String(!authenticated));
      this.projectInput.setAttribute('aria-disabled', String(!authenticated));
      this.projectInput.closest('.project-name-shell')?.classList.toggle('is-guest', !authenticated);
    }
  }

  syncAccountSettings() {
    const settings = this.host.querySelector('[data-account-settings]');
    const settingsButton = this.host.querySelector('[data-action="toggle-account-settings"]');
    settings?.classList.toggle('is-open', this.accountSettingsOpen);
    settingsButton?.setAttribute('aria-expanded', String(this.accountSettingsOpen));
    setSelectValue(this.host, 'units', this.state.units);
    setSelectValue(this.host, 'currency', this.state.currency);
    setSelectValue(this.host, 'quality', this.state.quality);
    setSelectValue(this.host, 'defaultArPlatform', this.state.defaultArPlatform);
    const darkButton = this.host.querySelector('[data-action="toggle-dark-mode"]');
    darkButton?.setAttribute('aria-pressed', String(this.state.darkMode));
    darkButton?.querySelector('.settings-switch')?.classList.toggle('is-on', this.state.darkMode);
    const label = darkButton?.querySelector('[data-dark-mode-label]');
    if (label) label.textContent = sharedT(this.state.locale, this.state.darkMode ? 'account.on' : 'account.off');
    syncAccountIdentity(this.host, this.state.locale, this.authUser, { busy: this.authBusy });
  }


  setPreference(name, value, { persist = false } = {}) {
    if (!Object.prototype.hasOwnProperty.call(this.state, name)) return;
    if (this.state[name] === value) return;
    this.state[name] = value;
    if (persist) this.persistPreferences();
    this.sync();
  }

  setActionEnabled(action, enabled) {
    const button = this.host.querySelector(`[data-action="${String(action)}"]`);
    if (!button) return;
    button.disabled = !enabled;
    button.setAttribute('aria-disabled', String(!enabled));
  }

  setToolState(toolId, { active = null, disabled = null, title = null } = {}) {
    const button = this.host.querySelector(`[data-tool-id="${String(toolId)}"]`);
    if (!button) return;
    if (active !== null) {
      button.classList.toggle('is-active', Boolean(active));
      button.setAttribute('aria-pressed', String(Boolean(active)));
    }
    if (disabled !== null) {
      button.disabled = Boolean(disabled);
      button.setAttribute('aria-disabled', String(Boolean(disabled)));
    }
    if (title) {
      button.title = String(title);
      button.setAttribute('aria-label', String(title));
    }
  }

  setToolActive(toolId, active) {
    this.setToolState(toolId, { active });
  }

  setToolDisabled(toolId, disabled) {
    this.setToolState(toolId, { disabled });
  }

  syncTools() {
    const toolbar = this.host.querySelector('.tools-toolbar');
    const panel = this.host.querySelector('.tools-toolbar__panel');
    const launcher = this.host.querySelector('[data-action="toggle-tools"]');
    toolbar?.classList.toggle('is-open', this.toolsOpen);
    panel?.classList.toggle('is-open', this.toolsOpen);
    launcher?.classList.toggle('is-active', this.toolsOpen);
    launcher?.setAttribute('aria-expanded', String(this.toolsOpen));
  }

  syncLanguage() {
    const profile = getLanguageProfile(this.state.locale);
    const button = this.host.querySelector('[data-action="language"]');
    button?.setAttribute('data-tooltip', profile.nativeName);
    button?.setAttribute('aria-label', profile.nativeName);
    const buttonFlag = this.host.querySelector('[data-language-button-flag]');
    const currentFlag = this.host.querySelector('[data-current-language-flag]');
    const currentName = this.host.querySelector('[data-current-language-name]');
    if (buttonFlag) buttonFlag.textContent = profile.flag;
    if (currentFlag) currentFlag.textContent = profile.flag;
    if (currentName) currentName.textContent = profile.nativeName;
    this.host.querySelectorAll('[data-action="select-language"]').forEach((item) => {
      const selected = item.dataset.locale === this.state.locale;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-current', selected ? 'true' : 'false');
    });
  }

  destroy() {
    this.authUnsubscribe?.();
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.clearTimeout(this.draftPersistTimer);
    window.clearInterval(this.dirtyWatchTimer);
    if (this.settingsToggle && this.onSettingsToggle) {
      this.settingsToggle.removeEventListener('click', this.onSettingsToggle);
    }
    this.host.remove();
    document.body.classList.remove('shared-ui-mounted', 'shared-ui-dark-mode');
    document.querySelector('.app-shell')?.classList.remove('is-dark-mode');
  }
}

export function mountStandaloneConfiguratorShell(options) {
  return new StandaloneConfiguratorShell(options);
}
