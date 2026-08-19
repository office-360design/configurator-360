import { LANGUAGE_PROFILES, getLanguageProfile, getLocaleForHostname, getLocalizedConfiguratorUrl } from './config.js';
import { sharedT } from './i18n.js';
import { renderActionFeedback } from './components/feedback.js';
import { renderTopBar } from './components/topBar.js';
import { renderToolsMenu } from './components/toolsMenu.js';

const MAX_PROJECT_NUMBER = 1000;

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
    this.projectMetaKey = `${this.storagePrefix}:project-meta`;
    this.projectCounterKey = `${this.storagePrefix}:next-project-number`;
    this.preferencesKey = `${this.storagePrefix}:preferences`;
    this.savedProjectsKey = `${this.storagePrefix}:saved-projects`;

    const preferences = safeJsonParse(window.localStorage.getItem(this.preferencesKey), {});
    const domainLocale = getLocaleForHostname(window.location.hostname);
    const domainProfile = getLanguageProfile(domainLocale);
    this.state = {
      locale: domainLocale,
      units: domainProfile.units,
      currency: domainProfile.currency,
      quality: 'balanced',
      defaultArPlatform: 'android',
      darkMode: false,
      ...preferences,
      // Country domains are authoritative for language. Unit/currency overrides
      // remain user-configurable and persist independently per origin.
      locale: domainLocale,
    };

    const meta = safeJsonParse(window.localStorage.getItem(this.projectMetaKey), {}) || {};
    this.projectName = meta.name || this.getNextDefaultProjectName();
    this.lastSavedProjectName = meta.savedName || '';
    this.dirty = meta.dirty ?? true;
    this.accountOpen = false;
    this.accountSettingsOpen = false;
    this.languageOpen = false;
    this.toolsOpen = false;
    this.feedbackTimer = 0;
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
    this.sync();
  }

  getNextDefaultProjectName() {
    const stored = Number(window.localStorage.getItem(this.projectCounterKey));
    const number = Number.isFinite(stored) && stored >= 1
      ? Math.min(MAX_PROJECT_NUMBER, Math.floor(stored))
      : 1;
    return `${this.options.productType}#${number}`;
  }

  renderHost() {
    this.host.innerHTML = `
      ${renderTopBar({
        brandSrc: this.options.brandSrc,
        brandAlt: this.options.brandAlt,
        projectName: this.projectName,
        state: this.state,
        capabilities: this.options.capabilities,
      })}
      ${renderActionFeedback(this.state.locale)}
      ${renderToolsMenu(this.toolsOpen, { ...this.options.tools, locale: this.state.locale })}
    `;

    this.projectInput = this.host.querySelector('[data-project-name]');
    this.projectMeasure = this.host.querySelector('[data-project-name-measure]');
    this.dirtyIndicator = this.host.querySelector('[data-project-dirty]');
    this.accountMenu = this.host.querySelector('[data-account-menu]');
    this.languageMenu = this.host.querySelector('[data-language-menu]');
    this.feedback = this.host.querySelector('[data-save-feedback]');
    this.feedbackText = this.host.querySelector('[data-save-feedback-text]');
  }

  bindEvents() {
    this.host.addEventListener('click', (event) => this.handleClick(event));
    this.host.addEventListener('input', (event) => this.handleInput(event));
    this.host.addEventListener('change', (event) => this.handleChange(event));

    this.onDocumentClick = (event) => {
      if (!event.target.closest('[data-account-menu], [data-action="account"]')) {
        this.accountOpen = false;
      }
      if (!event.target.closest('[data-language-menu], [data-action="language"]')) {
        this.languageOpen = false;
      }
      this.syncMenus();
    };
    document.addEventListener('click', this.onDocumentClick);

    this.onKeyDown = (event) => {
      if (event.key === 'Escape') {
        this.accountOpen = false;
        this.languageOpen = false;
        if (this.toolsOpen) {
          this.toolsOpen = false;
          this.syncTools();
          this.options.callbacks.onToolsOpenChange?.(false);
        }
        this.syncMenus();
      }
    };
    document.addEventListener('keydown', this.onKeyDown);
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

  handleClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;

    if (action === 'save-success-demo') {
      this.save(actionTarget);
    } else if (action === 'undo') {
      this.options.callbacks.onUndo?.();
    } else if (action === 'reset') {
      this.options.callbacks.onReset?.();
    } else if (action === 'view-ar') {
      this.options.callbacks.onViewAR?.();
    } else if (action === 'share') {
      this.share(actionTarget);
    } else if (action === 'account') {
      this.accountOpen = !this.accountOpen;
      this.languageOpen = false;
      this.syncMenus();
    } else if (action === 'language') {
      this.languageOpen = !this.languageOpen;
      this.accountOpen = false;
      this.syncMenus();
      if (this.languageOpen) {
        window.setTimeout(() => this.host.querySelector('[data-language-search]')?.focus(), 0);
      }
    } else if (action === 'toggle-tools') {
      this.toolsOpen = !this.toolsOpen;
      this.syncTools();
      this.options.callbacks.onToolsOpenChange?.(this.toolsOpen);
    } else if (action === 'toggle-account-settings') {
      this.accountSettingsOpen = !this.accountSettingsOpen;
      this.syncAccountSettings();
    } else if (action === 'toggle-dark-mode') {
      this.state.darkMode = !this.state.darkMode;
      this.persistPreferences();
      this.options.callbacks.onPreferenceChange?.('darkMode', this.state.darkMode, this.state);
      this.sync();
    } else if (action === 'select-language') {
      const nextLocale = actionTarget.dataset.locale;
      const profile = LANGUAGE_PROFILES[nextLocale];
      if (profile) {
        const targetUrl = getLocalizedConfiguratorUrl(nextLocale, this.options.productType, window.location);
        const isLocalDevelopmentHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
        if (targetUrl && nextLocale !== this.state.locale && !isLocalDevelopmentHost) {
          window.location.assign(targetUrl);
          return;
        }
        const localeChanged = nextLocale !== this.state.locale;
        this.state.locale = nextLocale;
        this.state.units = profile.units;
        this.state.currency = profile.currency;
        this.persistPreferences();
        this.options.callbacks.onPreferenceChange?.('locale', this.state.locale, this.state);
        this.options.callbacks.onPreferenceChange?.('units', this.state.units, this.state);
        this.options.callbacks.onPreferenceChange?.('currency', this.state.currency, this.state);
        if (localeChanged) this.renderHost();
      }
      this.languageOpen = false;
      this.sync();
    } else if (action === 'account-profile') {
      this.options.callbacks.onAccountAction?.('profile');
    } else if (action === 'account-saved') {
      this.options.callbacks.onAccountAction?.('saved');
    } else if (action === 'account-help') {
      this.options.callbacks.onAccountAction?.('help');
    } else if (action === 'cookies-placeholder') {
      this.options.callbacks.onAccountAction?.('cookies');
    } else if (action === 'account-signout') {
      this.options.callbacks.onAccountAction?.('signout');
    }
  }

  handleInput(event) {
    if (event.target.matches('[data-project-name]')) {
      this.projectName = event.target.value;
      this.markDirty();
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

  save(button) {
    button.classList.remove('is-success');
    void button.offsetWidth;
    button.classList.add('is-success');
    this.dirty = false;
    this.lastSavedProjectName = this.projectName;
    this.reserveNextDefaultName();
    this.persistMeta();
    this.persistSavedProject();
    this.options.callbacks.onSave?.({ projectName: this.projectName, preferences: { ...this.state } });
    this.showFeedback(sharedT(this.state.locale, 'feedback.saved'));
    this.sync();
    window.setTimeout(() => button.classList.remove('is-success'), 1050);
  }

  async share(button) {
    let url;
    try {
      url = await Promise.resolve(this.options.callbacks.getShareUrl?.() || window.location.href);
    } catch (error) {
      console.error('Share link could not be created.', error);
      this.showFeedback(sharedT(this.state.locale, 'feedback.shareUnavailable'));
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

  showFeedback(message) {
    window.clearTimeout(this.feedbackTimer);
    this.feedback.classList.remove('is-success', 'is-animating');
    void this.feedback.offsetWidth;
    this.feedback.classList.add('is-success', 'is-animating');
    this.feedbackText.textContent = message;
    this.feedbackTimer = window.setTimeout(() => this.feedback.classList.remove('is-animating'), 1050);
  }

  markDirty() {
    if (this.dirty) return;
    this.dirty = true;
    this.persistMeta();
    this.syncDirty();
  }

  reserveNextDefaultName() {
    const escapedType = this.options.productType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^${escapedType}#(\\d{1,4})$`, 'i').exec(this.projectName.trim());
    if (!match) return;
    const next = Math.min(MAX_PROJECT_NUMBER, Number(match[1]) + 1);
    const stored = Number(window.localStorage.getItem(this.projectCounterKey)) || 1;
    window.localStorage.setItem(this.projectCounterKey, String(Math.max(stored, next)));
  }

  persistMeta() {
    window.localStorage.setItem(this.projectMetaKey, JSON.stringify({
      name: this.projectName,
      savedName: this.lastSavedProjectName,
      dirty: this.dirty,
    }));
  }

  persistPreferences() {
    window.localStorage.setItem(this.preferencesKey, JSON.stringify(this.state));
  }

  persistSavedProject() {
    const projects = safeJsonParse(window.localStorage.getItem(this.savedProjectsKey), {});
    projects[this.projectName] = {
      name: this.projectName,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(this.savedProjectsKey, JSON.stringify(projects));
  }

  sync() {
    this.host.classList.toggle('is-dark-mode', Boolean(this.state.darkMode));
    this.syncDirty();
    this.syncProjectNameWidth();
    this.syncMenus();
    this.syncAccountSettings();
    this.syncLanguage();
    this.syncTools();
    document.body.classList.toggle('shared-ui-dark-mode', Boolean(this.state.darkMode));
    document.querySelector('.app-shell')?.classList.toggle('is-dark-mode', Boolean(this.state.darkMode));
  }

  syncDirty() {
    this.dirtyIndicator?.classList.toggle('is-hidden', !this.dirty);
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
    document.removeEventListener('click', this.onDocumentClick);
    document.removeEventListener('keydown', this.onKeyDown);
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
