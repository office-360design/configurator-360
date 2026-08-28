import { LANGUAGE_PROFILES, getLanguageProfile, getLocaleForHostname, getLocalizedConfiguratorUrl } from './config.js';
import { sharedT } from './i18n.js?v=24';
import { renderActionFeedback } from './components/feedback.js?v=17';
import { renderTopBar } from './components/topBar.js?v=20';
import { syncAccountIdentity } from './components/accountMenu.js?v=18';
import { createDomainAuthHandoff, observeGoogleAuth, redeemDomainAuthHandoff, signInWithDomainCustomToken, signInWithGoogle, signOutGoogle } from './firebaseAuth.js?v=18';
import { renderToolsMenu } from './components/toolsMenu.js?v=17';
import { renderSavedConfigurationsDialog } from './components/savedConfigurationsDialog.js?v=17';
import { renderLanguageSwitchLoading } from './components/languageSwitchLoading.js?v=18';
import { renderConfiguratorPanelFooter } from './components/configuratorPanel.js?v=2';
import { renderCartMenu } from './components/cartMenu.js?v=3';
import { getUserCart, mutateUserCart } from './userCart.js?v=4';
import { deleteUserConfiguration, getUserConfiguration, listUserConfigurations, saveUserConfiguration } from './savedConfigurations.js?v=16';
import { readShareState } from './shareState.js?v=4';
import { getTenantSlugForHostname } from './tenantBootstrap.js?v=2';
import { recordConfiguratorAccessOnce, recordConfiguratorAnalyticsEvent } from './configuratorAnalytics.js?v=1';

const MAX_PROJECT_NUMBER = 1000;
const MAX_LOCAL_DRAFT_BYTES = 1_250_000;
const GLOBAL_LOCALE_STORAGE_KEY = '360-configurator:shared-ui:locale';
const CART_STORAGE_BASE_KEY = '360-configurator:cart';
const MAX_CART_ITEMS = 100;
const CART_FX_RATES_FROM_EUR = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });
const SAVED_DOMAIN_ID_PARAM = 'savedConfig';
const SAVED_DOMAIN_OWNER_PARAM = 'savedOwner';
const DOMAIN_AUTH_STATE_PARAM = 'domainAuthState';
const DOMAIN_AUTH_HANDOFF_PARAM = 'domainAuthHandoff';
const DOMAIN_AUTH_GUEST_STATE = 'guest';
const DOMAIN_AUTH_USER_STATE = 'user';
const DOMAIN_AUTH_HANDOFF_ID_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;
const SAVED_CONFIGURATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CART_EDIT_ITEM_PARAM = 'cartItem';
const CART_EDIT_PRODUCT_PARAM = 'cartProduct';
const CART_EDIT_ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;
const CART_EDIT_PRODUCTS = new Set(['window', 'roof', 'pergola', 'hall', 'solar', 'fence']);
const DOMAIN_SAVE_FAILURE_MESSAGE = 'Domain change failed because of a saving failure';
const DRAFT_PRODUCTS = new Set(['window', 'roof', 'pergola', 'hall', 'fence', 'solar']);

function savedConfigurationScopeForHostname(hostname = '') {
  const tenantSlug = getTenantSlugForHostname(hostname);
  return tenantSlug ? `tenant:${tenantSlug}` : 'platform';
}
function readHashParams(target) {
  const raw = target.hash.startsWith('#') ? target.hash.slice(1) : target.hash;
  return new URLSearchParams(raw);
}

function writeHashParams(target, params) {
  const value = params.toString();
  target.hash = value ? `#${value}` : '';
}

function stripConfigurationTransport(target) {
  ['s', 'c', 'config', SAVED_DOMAIN_ID_PARAM, SAVED_DOMAIN_OWNER_PARAM, DOMAIN_AUTH_STATE_PARAM, DOMAIN_AUTH_HANDOFF_PARAM, CART_EDIT_ITEM_PARAM, CART_EDIT_PRODUCT_PARAM].forEach((key) => target.searchParams.delete(key));
  const hash = readHashParams(target);
  ['s', 'c', 'config', SAVED_DOMAIN_ID_PARAM, SAVED_DOMAIN_OWNER_PARAM, DOMAIN_AUTH_STATE_PARAM, DOMAIN_AUTH_HANDOFF_PARAM, CART_EDIT_ITEM_PARAM, CART_EDIT_PRODUCT_PARAM].forEach((key) => hash.delete(key));
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

function cartCurrencyFromText(value, fallback = 'USD') {
  const text = String(value || '').toUpperCase();
  if (text.includes('RON') || text.includes(' LEI') || text.endsWith('LEI')) return 'RON';
  if (text.includes('EUR') || text.includes('€')) return 'EUR';
  if (text.includes('USD') || text.includes('$')) return 'USD';
  const normalizedFallback = String(fallback || '').toUpperCase();
  return ['USD', 'EUR', 'RON'].includes(normalizedFallback) ? normalizedFallback : 'USD';
}

export function convertCartMoneyAmount(value, fromCurrency, toCurrency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const from = cartCurrencyFromText(fromCurrency, 'EUR');
  const to = cartCurrencyFromText(toCurrency, 'EUR');
  if (from === to) return amount;
  const fromRate = Number(CART_FX_RATES_FROM_EUR[from]) || 1;
  const toRate = Number(CART_FX_RATES_FROM_EUR[to]) || 1;
  return (amount / fromRate) * toRate;
}

function parseCartMoneyText(value, fallbackCurrency = 'USD') {
  const raw = String(value || '').trim();
  const currency = cartCurrencyFromText(raw, fallbackCurrency);
  if (!raw) return { amount: 0, currency };

  let numeric = raw.replace(/[^0-9.,-]/g, '');
  if (!/[0-9]/.test(numeric)) return { amount: 0, currency };
  const negative = numeric.startsWith('-');
  numeric = numeric.replace(/-/g, '');

  const lastDot = numeric.lastIndexOf('.');
  const lastComma = numeric.lastIndexOf(',');
  const separator = lastDot > lastComma ? '.' : (lastComma > lastDot ? ',' : '');
  if (separator) {
    const occurrences = numeric.split(separator).length - 1;
    const digitsAfter = numeric.length - numeric.lastIndexOf(separator) - 1;
    const other = separator === '.' ? ',' : '.';
    numeric = numeric.split(other).join('');
    if (occurrences > 1 || digitsAfter === 3 || digitsAfter === 0) {
      numeric = numeric.split(separator).join('');
    } else {
      const index = numeric.lastIndexOf(separator);
      numeric = `${numeric.slice(0, index).split(separator).join('')}.${numeric.slice(index + 1)}`;
    }
  }

  const amount = Number(numeric);
  return {
    amount: Number.isFinite(amount) ? (negative ? -amount : amount) : 0,
    currency,
  };
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
      configuratorPanel: null,
      ...options,
    };

    this.storagePrefix = this.options.storagePrefix;
    this.productId = normalizeProductId(this.options.productId || this.options.productType);
    void recordConfiguratorAccessOnce(this.productId).catch((error) => {
      console.warn('Configurator access analytics could not be recorded.', error);
    });
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
    this.initialConfigurationAnalyticsRecorded = false;
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
    this.cartOpen = false;
    this.cartBusy = false;
    this.cartItems = [];
    this.cartLastRemoteSyncAt = 0;
    this.cartSyncPromise = null;
    this.currentCartEdit = null;
    this.pendingCartEditTransport = this.readCartEditTransport();
    this.toolsOpen = false;
    this.feedbackTimer = 0;
    this.saveBusy = false;
    this.savedLoadBlocked = false;
    this.pendingDomainAuthTransport = this.readDomainAuthTransport();
    this.pendingSavedDomainHandoff = this.readSavedDomainHandoff();
    // A Share transport is configuration state, regardless of authentication.
    // It must win over the destination domain's local/default account state.
    // The shared shell restores it through the configurator's restoreState hook,
    // so every configurator gets the same cross-domain behavior.
    this.pendingSharedConfigurationTransport = Boolean(
      this.hasSharedConfigurationTransport()
      && !this.pendingSavedDomainHandoff
      && !this.pendingCartEditTransport
    );
    this.savedDialog = { open: false, loading: false, error: '', items: [] };
    this.settingsPanelCollapsed = false;
    this.settingsPanel = null;
    this.settingsToggle = null;
    this.configuratorPanel = null;
    this.configuratorPanelBody = null;
    this.configuratorPanelFooter = null;
    this.onConfiguratorPanelFooterClick = null;

    this.host = document.createElement('div');
    this.host.className = 'shared-ui-host';
    this.host.dataset.sharedUiHost = '';
    this.renderHost();
    document.body.prepend(this.host);
    document.body.classList.add('shared-ui-mounted');

    this.bindEvents();
    this.bindSettingsPanel();
    this.bindConfiguratorPanel();
    // Product-specific translation tables stay in each configurator, while the
    // shared shell owns when the locale changes. Apply the persisted locale once
    // on mount so a language chosen on this domain survives refreshes.
    this.options.callbacks.onPreferenceChange?.('locale', this.state.locale, this.state);
    this.sync();
    this.initializeAuthentication();
    this.dirtyWatchTimer = window.setInterval(() => {
      this.refreshDirtyFromCapturedState();
      this.refreshConfiguratorPanelFooter();
    }, 300);
  }

  getGuestProjectName() {
    return `${this.options.productType}#1`;
  }

  getProjectMetaKey(uid) {
    const encodedUid = encodeURIComponent(String(uid || ''));
    const tenantSlug = getTenantSlugForHostname(window.location.hostname);
    if (tenantSlug) {
      return `${this.storagePrefix}:project-meta:tenant:${encodeURIComponent(tenantSlug)}:user:${encodedUid}`;
    }
    return `${this.storagePrefix}:project-meta:user:${encodedUid}`;
  }

  getProjectCounterKey(uid) {
    const encodedUid = encodeURIComponent(String(uid || ''));
    const tenantSlug = getTenantSlugForHostname(window.location.hostname);
    if (tenantSlug) {
      return `${this.projectCounterBaseKey}:tenant:${encodeURIComponent(tenantSlug)}:user:${encodedUid}`;
    }
    return `${this.projectCounterBaseKey}:user:${encodedUid}`;
  }

  getCartStorageKey(uid = this.authUser?.uid) {
    const normalizedUid = String(uid || '').trim();
    return normalizedUid ? `${CART_STORAGE_BASE_KEY}:user:${encodeURIComponent(normalizedUid)}` : '';
  }

  normalizeCartItem(item) {
    const productId = normalizeProductId(item?.productId || 'configuration');
    const savedConfigurationId = String(item?.savedConfigurationId || '').slice(0, 128);
    // Each cart row is a detached Firestore snapshot. It keeps its own id even
    // when the source saved configuration is later edited or deleted.
    const itemKey = String(item?.key || item?.cartItemId || '').slice(0, 180);
    const explicitAmount = Number(item?.costAmount);
    const parsed = Number.isFinite(explicitAmount)
      ? { amount: explicitAmount, currency: cartCurrencyFromText(item?.currency, this.state.currency) }
      : parseCartMoneyText(item?.costText, item?.currency || this.state.currency);
    return {
      key: itemKey,
      cartItemId: itemKey,
      productId,
      savedConfigurationId,
      name: String(item?.name || '').slice(0, 80),
      sourceName: String(item?.sourceName || '').slice(0, 80),
      costAmount: Math.max(0, Number(parsed.amount) || 0),
      currency: parsed.currency,
      addedAt: Number(item?.addedAt) || Date.now(),
    };
  }

  setCartItems(items, { persist = true } = {}) {
    const normalized = Array.isArray(items)
      ? items.slice(0, MAX_CART_ITEMS).map((item) => this.normalizeCartItem(item))
        .filter((item) => CART_EDIT_PRODUCTS.has(item.productId) && item.key)
      : [];
    this.cartItems = normalized;
    if (persist) this.persistCart();
  }

  loadCart(uid = this.authUser?.uid) {
    const key = this.getCartStorageKey(uid);
    if (!key) {
      this.cartItems = [];
      return;
    }
    const stored = safeJsonParse(window.localStorage.getItem(key), []);
    this.setCartItems(Array.isArray(stored) ? stored : [], { persist: false });
  }

  persistCart() {
    const key = this.getCartStorageKey();
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(this.cartItems.slice(0, MAX_CART_ITEMS)));
    } catch (error) {
      console.warn('Cart state could not be persisted locally.', error);
    }
  }

  cartItemForBackend(item) {
    return {
      productId: normalizeProductId(item?.productId || 'configuration'),
      savedConfigurationId: String(item?.savedConfigurationId || ''),
      costAmount: Math.max(0, Number(item?.costAmount) || 0),
      currency: cartCurrencyFromText(item?.currency, this.state.currency),
    };
  }

  convertMoneyAmount(value, fromCurrency = 'EUR', toCurrency = this.state.currency) {
    return convertCartMoneyAmount(value, fromCurrency, toCurrency);
  }

  formatCartMoney(value, currency = this.state.currency, decimals = 0) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '—';
    try {
      return new Intl.NumberFormat(this.state.locale || 'en-US', {
        style: 'currency',
        currency: cartCurrencyFromText(currency, this.state.currency),
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(amount);
    } catch {
      return `${amount.toFixed(decimals)} ${cartCurrencyFromText(currency, this.state.currency)}`;
    }
  }

  cartRenderItems() {
    const hasWindow = this.cartItems.some((item) => item.productId === 'window');
    return this.cartItems.map((item) => ({
      ...item,
      // Cart snapshots keep the exact currency captured when the item was added.
      // Do not silently re-price historical rows when the account currency changes.
      costText: this.formatCartMoney(
        item.costAmount,
        item.currency,
        (item.productId === 'window' && hasWindow) ? 2 : 0
      ),
    }));
  }

  cartTotalText() {
    const selectedCurrency = cartCurrencyFromText(this.state.currency, 'USD');
    const hasWindow = this.cartItems.some((item) => item.productId === 'window');
    const decimals = hasWindow ? 2 : 0;
    if (!this.cartItems.length) return this.formatCartMoney(0, selectedCurrency, decimals);

    const totalsByCurrency = new Map();
    this.cartItems.forEach((item) => {
      const currency = cartCurrencyFromText(item.currency, selectedCurrency);
      const amount = Math.max(0, Number(item.costAmount) || 0);
      totalsByCurrency.set(currency, (totalsByCurrency.get(currency) || 0) + amount);
    });
    return [...totalsByCurrency.entries()]
      .map(([currency, amount]) => this.formatCartMoney(amount, currency, decimals))
      .join(' · ');
  }

  async refreshCartFromBackend(uid = this.authUser?.uid, { force = false } = {}) {
    const expectedUid = String(uid || '');
    if (!expectedUid || expectedUid !== String(this.authUser?.uid || '')) return false;
    if (!force && Date.now() - this.cartLastRemoteSyncAt < 5000) return true;
    if (this.cartSyncPromise) return this.cartSyncPromise;

    this.cartSyncPromise = (async () => {
      try {
        const remote = await getUserCart();
        if (expectedUid !== String(this.authUser?.uid || '')) return false;
        // Firestore shoppingCart snapshots are the source of truth. Local storage
        // is only an origin-local cache and must never recreate deleted rows.
        this.setCartItems(remote.items);
        this.cartLastRemoteSyncAt = Date.now();
        this.renderHost();
        this.sync();
        return true;
      } catch (error) {
        console.warn('The account shopping cart could not be synchronized.', error);
        return false;
      } finally {
        this.cartSyncPromise = null;
      }
    })();
    return this.cartSyncPromise;
  }

  canAddToCart() {
    return Boolean(
      this.authUser?.uid
      && this.options.capabilities.save !== false
      && !this.saveBusy
      && !this.cartBusy
      && !this.savedLoadBlocked
      && !this.domainBusy
      && !this.currentCartEdit
    );
  }

  async addCurrentConfigurationToCart(button) {
    if (!this.canAddToCart()) return false;

    this.cartBusy = true;
    this.refreshConfiguratorPanelFooter();
    try {
      // Cart entries always reference a persistent user save. Save first so a
      // cart item can never point at an unsaved or stale configurator state.
      const saveButton = this.host.querySelector('[data-action="save"]');
      const saved = await this.save(saveButton, { suppressFeedback: true });
      if (!saved || !this.currentSavedConfigurationId) {
        this.showFeedback(sharedT(this.state.locale, 'feedback.cartSaveFailed'), 'error', 2000);
        return false;
      }

      const price = this.resolveConfiguratorPanelPrice();
      const item = {
        productId: this.productId,
        savedConfigurationId: this.currentSavedConfigurationId,
        costAmount: Math.max(0, Number(price.amount) || 0),
        currency: price.currency,
      };

      // The backend reads the just-saved configuration and creates a new
      // shoppingCart document containing a full copy of that state. This is an
      // append operation, never an upsert: adding ABC twice yields ABC + ABC (1).
      const result = await mutateUserCart({ action: 'add', item: this.cartItemForBackend(item) });
      this.setCartItems(result.items);
      this.cartLastRemoteSyncAt = Date.now();
      this.renderHost();
      this.sync();
      this.showFeedback(sharedT(this.state.locale, 'feedback.addedToCart'));
      this.options.callbacks.onAddToCart?.(result.addedItem ? { ...result.addedItem } : { ...item });
      return true;
    } catch (error) {
      console.error('The configuration could not be added to the synchronized cart.', error);
      this.showFeedback(sharedT(this.state.locale, 'feedback.cartUpdateFailed'), 'error', 2000);
      return false;
    } finally {
      this.cartBusy = false;
      this.refreshConfiguratorPanelFooter();
    }
  }

  buildCartEditTarget(productId, itemKey, baseUrl = window.location.href) {
    const product = normalizeProductId(productId);
    if (!CART_EDIT_PRODUCTS.has(product) || !CART_EDIT_ITEM_ID_PATTERN.test(String(itemKey || ''))) return null;

    const tenantSlug = getTenantSlugForHostname(window.location.hostname);
    let target;
    if (tenantSlug) {
      target = new URL(`/${product}-configurator/`, window.location.origin);
    } else {
      const domainLocale = getLocaleForHostname(window.location.hostname);
      const localized = getLocalizedConfiguratorUrl(domainLocale, product, baseUrl);
      if (!localized) return null;
      target = new URL(localized, window.location.href);
    }
    target.search = '';
    target.hash = '';
    const hash = readHashParams(target);
    hash.set(CART_EDIT_PRODUCT_PARAM, product);
    hash.set(CART_EDIT_ITEM_PARAM, String(itemKey));
    writeHashParams(target, hash);
    return target.href;
  }

  async editCartItem(key, button = null) {
    const itemKey = String(key || '');
    if (!this.authUser?.uid || this.cartBusy || !CART_EDIT_ITEM_ID_PATTERN.test(itemKey)) return false;
    const item = this.cartItems.find((candidate) => candidate.key === itemKey);
    if (!item || !CART_EDIT_PRODUCTS.has(item.productId)) return false;

    button?.setAttribute('disabled', '');
    if (item.productId === this.productId) {
      try {
        // Preserve any normal account draft before temporarily replacing the
        // current model with the cart snapshot. Cart edit mode itself never
        // overwrites that account draft pointer.
        this.flushDraftPersistence();
        const target = this.buildCartEditTarget(item.productId, item.key);
        if (target) window.history.replaceState(window.history.state, '', target);
        this.pendingCartEditTransport = { key: item.key, productId: item.productId };
        this.cartOpen = false;
        return await this.restoreCartEditTransport(this.authUser);
      } catch (error) {
        console.error('The cart configuration could not be opened for editing.', error);
        this.showFeedback(sharedT(this.state.locale, 'feedback.cartOpenFailed'), 'error', 2000);
        return false;
      } finally {
        button?.removeAttribute('disabled');
      }
    }

    // Open the correct configurator immediately so the browser treats this as a
    // user-initiated tab. The auth handoff then guarantees the same Firebase
    // account even if that tab has no usable local auth session yet.
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      button?.removeAttribute('disabled');
      this.showFeedback(sharedT(this.state.locale, 'feedback.cartOpenFailed'), 'error', 2000);
      return false;
    }
    try {
      const target = this.buildCartEditTarget(item.productId, item.key);
      if (!target) throw new Error('The cart configurator URL could not be generated.');
      const handoffId = await createDomainAuthHandoff(new URL(target).origin);
      const authenticatedTarget = this.withDomainAuthentication(target, DOMAIN_AUTH_USER_STATE, handoffId);
      tab.location.replace(authenticatedTarget);
      return true;
    } catch (error) {
      console.error('The cart configuration could not be opened in its configurator.', error);
      try { tab.close(); } catch { /* best effort */ }
      this.showFeedback(sharedT(this.state.locale, 'feedback.cartOpenFailed'), 'error', 2000);
      return false;
    } finally {
      button?.removeAttribute('disabled');
    }
  }

  async removeCartItem(key, button = null) {
    const itemKey = String(key || '');
    if (!itemKey || !this.authUser?.uid || this.cartBusy) return;
    const index = this.cartItems.findIndex((item) => item.key === itemKey);
    if (index < 0) return;

    this.cartBusy = true;
    button?.setAttribute('disabled', '');
    try {
      const result = await mutateUserCart({ action: 'remove', key: itemKey, productId: this.cartItems[index].productId });
      const row = button?.closest('[data-cart-item]')
        || this.host.querySelector(`[data-cart-item][data-cart-key="${CSS.escape(itemKey)}"]`);
      row?.classList.add('is-removing');
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      this.setCartItems(result.items);
      this.cartLastRemoteSyncAt = Date.now();
      this.renderHost();
      this.sync();
    } catch (error) {
      console.error('The cart item could not be removed.', error);
      button?.removeAttribute('disabled');
      this.showFeedback(sharedT(this.state.locale, 'feedback.cartUpdateFailed'), 'error', 2000);
    } finally {
      this.cartBusy = false;
    }
  }

  async emptyCart() {
    if (!this.authUser?.uid || this.cartBusy || !this.cartItems.length) return false;
    this.cartBusy = true;
    this.renderHost();
    this.sync();
    try {
      const result = await mutateUserCart({ action: 'empty' });
      this.setCartItems(result.items);
      this.cartLastRemoteSyncAt = Date.now();
      this.renderHost();
      this.sync();
      return true;
    } catch (error) {
      console.error('The cart could not be emptied.', error);
      this.showFeedback(sharedT(this.state.locale, 'feedback.cartUpdateFailed'), 'error', 2000);
      return false;
    } finally {
      this.cartBusy = false;
      this.renderHost();
      this.sync();
    }
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

    // Tenant domains have their own local draft/save pointer namespace. Never
    // inherit a pre-Tier-1 platform pointer into a customer tenant.
    if (getTenantSlugForHostname(window.location.hostname)) return {};

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


  hasSharedConfigurationTransport(url = window.location.href) {
    try {
      const target = new URL(url, window.location.href);
      const hash = readHashParams(target);
      return ['s', 'c', 'config'].some((key) => target.searchParams.has(key) || hash.has(key));
    } catch {
      return false;
    }
  }

  readDomainAuthTransport() {
    try {
      const target = new URL(window.location.href);
      const hash = readHashParams(target);
      const mode = String(hash.get(DOMAIN_AUTH_STATE_PARAM) || target.searchParams.get(DOMAIN_AUTH_STATE_PARAM) || '').trim();
      if (mode === DOMAIN_AUTH_GUEST_STATE) return { mode };
      const handoffId = String(hash.get(DOMAIN_AUTH_HANDOFF_PARAM) || target.searchParams.get(DOMAIN_AUTH_HANDOFF_PARAM) || '').trim();
      if (mode === DOMAIN_AUTH_USER_STATE && DOMAIN_AUTH_HANDOFF_ID_PATTERN.test(handoffId)) {
        return { mode, handoffId };
      }
      return null;
    } catch {
      return null;
    }
  }

  clearDomainAuthTransportUrl() {
    try {
      const target = new URL(window.location.href);
      target.searchParams.delete(DOMAIN_AUTH_STATE_PARAM);
      target.searchParams.delete(DOMAIN_AUTH_HANDOFF_PARAM);
      const hash = readHashParams(target);
      hash.delete(DOMAIN_AUTH_STATE_PARAM);
      hash.delete(DOMAIN_AUTH_HANDOFF_PARAM);
      writeHashParams(target, hash);
      window.history.replaceState(window.history.state, '', target.href);
    } catch {
      // Authentication handoff already completed; URL cleanup is best effort.
    }
  }

  readCartEditTransport() {
    try {
      const target = new URL(window.location.href);
      const hash = readHashParams(target);
      const key = String(hash.get(CART_EDIT_ITEM_PARAM) || target.searchParams.get(CART_EDIT_ITEM_PARAM) || '').trim();
      const productId = normalizeProductId(hash.get(CART_EDIT_PRODUCT_PARAM) || target.searchParams.get(CART_EDIT_PRODUCT_PARAM) || '');
      if (!CART_EDIT_ITEM_ID_PATTERN.test(key) || !CART_EDIT_PRODUCTS.has(productId)) return null;
      return { key, productId };
    } catch {
      return null;
    }
  }

  clearCartEditTransportUrl() {
    try {
      const target = new URL(window.location.href);
      target.searchParams.delete(CART_EDIT_ITEM_PARAM);
      target.searchParams.delete(CART_EDIT_PRODUCT_PARAM);
      const hash = readHashParams(target);
      hash.delete(CART_EDIT_ITEM_PARAM);
      hash.delete(CART_EDIT_PRODUCT_PARAM);
      writeHashParams(target, hash);
      window.history.replaceState(window.history.state, '', target.href);
    } catch {
      // Cart edit mode is already detached; URL cleanup is best effort.
    }
  }

  exitCartEditMode({ clearUrl = true } = {}) {
    this.currentCartEdit = null;
    this.pendingCartEditTransport = null;
    if (clearUrl) this.clearCartEditTransportUrl();
  }

  async restoreCartEditTransport(user) {
    const transport = this.pendingCartEditTransport || this.readCartEditTransport();
    const uid = String(user?.uid || '');
    if (!transport?.key || !uid) return false;
    if (transport.productId !== this.productId) return false;

    try {
      const result = await getUserCart({ key: transport.key, productId: transport.productId });
      const item = result.editingItem;
      if (!item?.state) throw new Error('The shopping cart snapshot is empty.');
      // Enter cart-edit mode before restoring the model so product-specific
      // restore hooks cannot accidentally persist a normal account draft while
      // they dispatch their internal change events.
      this.currentCartEdit = {
        key: String(item.key || transport.key),
        productId: transport.productId,
        name: String(item.name || this.projectName).slice(0, 80),
      };
      this.projectName = this.currentCartEdit.name;
      const restored = await this.restoreConfiguratorState(item.state);
      if (!restored) throw new Error('Configurator rejected the shopping cart state.');

      this.setCartItems(result.items);
      this.pendingCartEditTransport = null;
      this.lastSavedProjectName = '';
      this.currentSavedConfigurationId = '';
      this.currentSavedOwnerUid = uid;
      this.currentDraftStateJson = '';
      this.savedLoadBlocked = false;
      this.dirty = false;
      this.captureCleanBaseline();
      this.cartOpen = false;
      this.renderHost();
      this.sync();
      return true;
    } catch (error) {
      console.error('The shopping cart configuration could not be restored.', error);
      this.pendingCartEditTransport = null;
      this.currentCartEdit = null;
      this.clearCartEditTransportUrl();
      this.showFeedback(sharedT(this.state.locale, 'feedback.cartOpenFailed'), 'error', 2000);
      return false;
    }
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

  clearSharedConfigurationTransportUrl() {
    try {
      const target = new URL(window.location.href);
      ['s', 'c', 'config'].forEach((key) => target.searchParams.delete(key));
      const hash = readHashParams(target);
      ['s', 'c', 'config'].forEach((key) => hash.delete(key));
      writeHashParams(target, hash);
      window.history.replaceState(window.history.state, '', target.href);
    } catch {
      // The shared configuration has already been restored; URL cleanup is best effort.
    }
  }

  async restorePendingSharedConfiguration() {
    if (!this.pendingSharedConfigurationTransport) return null;
    const sharedState = await readShareState({ productType: this.productId });
    if (!sharedState || typeof sharedState !== 'object') {
      throw new Error('The shared configuration referenced by the domain handoff could not be loaded.');
    }
    const restored = await this.restoreConfiguratorState(sharedState);
    if (!restored) {
      throw new Error('Configurator rejected the shared domain-handoff state.');
    }
    this.pendingSharedConfigurationTransport = false;
    return sharedState;
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
          cartCount: this.cartItems.length,
          cartOpen: this.cartOpen,
        },
        capabilities: this.options.capabilities,
      })}
      ${renderCartMenu(this.state.locale, this.cartRenderItems(), { open: this.cartOpen, busy: this.cartBusy, totalText: this.cartTotalText() })}
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
    this.cartMenu = this.host.querySelector('[data-cart-menu]');
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
      if (!event.target.closest('[data-cart-menu], [data-action="cart"]')) {
        this.cartOpen = false;
      }
      this.syncMenus();
    };
    document.addEventListener('click', this.onDocumentClick);

    this.onKeyDown = (event) => {
      if (event.key === 'Escape') {
        const savedDialogWasOpen = this.savedDialog.open;
        this.accountOpen = false;
        this.languageOpen = false;
        this.cartOpen = false;
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

    // The cart is shared across configurators on this origin. Synchronize
    // already-open tabs when another configurator adds or removes an item.
    this.onStorage = (event) => {
      const uid = this.authUser?.uid;
      if (!uid || event.key !== this.getCartStorageKey(uid)) return;
      this.loadCart(uid);
      this.renderHost();
      this.sync();
    };
    window.addEventListener('storage', this.onStorage);

    this.onCartVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !this.authUser?.uid) return;
      void this.refreshCartFromBackend(this.authUser.uid);
    };
    document.addEventListener('visibilitychange', this.onCartVisibilityChange);
  }


  bindConfiguratorPanel() {
    const config = this.options.configuratorPanel;
    if (!config?.panelSelector) return;

    const panel = document.querySelector(config.panelSelector);
    if (!panel) return;

    this.configuratorPanel = panel;
    panel.classList.add('shared-configurator-panel');
    panel.dataset.sharedPanelLayout = config.nativeLayout ? 'native' : 'managed';

    if (config.geometry === 'floating-right') {
      panel.dataset.sharedPanelGeometry = 'floating-right';
      this.configuratorPanelHost = panel.closest('.app-shell');
      this.configuratorPanelHost?.classList.add('shared-configurator-panel-host--floating-right');

      const toggleSelector = this.options.settingsPanel?.toggleSelector;
      this.configuratorPanelToggle = toggleSelector ? document.querySelector(toggleSelector) : null;
      this.configuratorPanelToggle?.classList.add('shared-configurator-panel__toggle--floating-right');
      this.syncFloatingConfiguratorPanelToggle();
    }

    let footer = config.footerSelector
      ? panel.querySelector(config.footerSelector)
      : panel.querySelector(':scope > [data-shared-configurator-panel-footer]');

    if (!config.nativeLayout) {
      let body = panel.querySelector(':scope > .shared-configurator-panel__body');
      if (!body) {
        const computed = window.getComputedStyle(panel);
        body = document.createElement('div');
        body.className = 'shared-configurator-panel__body';
        body.style.paddingTop = computed.paddingTop;
        body.style.paddingRight = computed.paddingRight;
        body.style.paddingBottom = computed.paddingBottom;
        body.style.paddingLeft = computed.paddingLeft;

        const movable = Array.from(panel.childNodes).filter((node) => node !== footer);
        movable.forEach((node) => body.append(node));
        panel.style.setProperty('padding', '0', 'important');
        panel.prepend(body);
      }
      this.configuratorPanelBody = body;
    } else if (config.bodySelector) {
      this.configuratorPanelBody = panel.querySelector(config.bodySelector);
    }

    if (!footer) {
      footer = document.createElement('footer');
      footer.dataset.sharedConfiguratorPanelFooter = '';
      panel.append(footer);
    }
    footer.classList.add('shared-configurator-panel__footer');
    footer.dataset.sharedConfiguratorPanelFooter = '';
    this.configuratorPanelFooter = footer;

    this.onConfiguratorPanelFooterClick = (event) => {
      const button = event.target.closest('[data-shared-panel-add-to-cart]');
      if (!button || button.disabled) return;
      void this.addCurrentConfigurationToCart(button);
    };
    footer.addEventListener('click', this.onConfiguratorPanelFooterClick);
    this.refreshConfiguratorPanelFooter();
  }

  syncFloatingConfiguratorPanelToggle() {
    if (!this.configuratorPanelToggle || this.options.configuratorPanel?.geometry !== 'floating-right') return;

    const compact = window.matchMedia('(max-width: 760px)').matches;
    const toggle = this.configuratorPanelToggle;
    const right = this.settingsPanelCollapsed
      ? '0px'
      : (compact ? 'min(352px, calc(100vw - 44px))' : '380px');

    toggle.style.setProperty('position', 'fixed', 'important');
    toggle.style.setProperty('top', compact
      ? 'calc(var(--shared-topbar-height, 47px) + 26px)'
      : 'calc(var(--shared-topbar-height, 47px) + 34px)', 'important');
    toggle.style.setProperty('right', right, 'important');
    toggle.style.setProperty('left', 'auto', 'important');
    toggle.style.setProperty('width', '34px', 'important');
    toggle.style.setProperty('height', '42px', 'important');
    toggle.style.setProperty('margin', '0', 'important');
    toggle.style.setProperty('border-radius', '10px 0 0 10px', 'important');
  }

  formatConfiguratorPanelPrice(value, currency = this.state.currency, locale = this.state.locale) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    try {
      return new Intl.NumberFormat(locale || 'en-US', {
        style: 'currency',
        currency: currency || 'EUR',
        maximumFractionDigits: 0,
      }).format(number);
    } catch {
      return String(Math.round(number));
    }
  }

  resolveConfiguratorPanelPrice() {
    const config = this.options.configuratorPanel;
    if (!config) return { amount: 0, currency: this.state.currency, text: '—' };

    try {
      const result = config.getEstimatedTotal?.({
        locale: this.state.locale,
        currency: this.state.currency,
      });
      if (typeof result === 'string' && result.trim()) {
        const parsed = parseCartMoneyText(result, this.state.currency);
        return { ...parsed, text: result.trim() };
      }
      if (typeof result === 'number') {
        return {
          amount: result,
          currency: this.state.currency,
          text: this.formatConfiguratorPanelPrice(result),
        };
      }
      if (result && typeof result === 'object' && Number.isFinite(Number(result.value))) {
        const currency = cartCurrencyFromText(result.currency, this.state.currency);
        return {
          amount: Number(result.value),
          currency,
          text: this.formatConfiguratorPanelPrice(
            result.value,
            currency,
            result.locale || this.state.locale,
          ),
        };
      }
    } catch {
      // The product can still expose an already-rendered price below.
    }

    if (config.priceSelector) {
      const rendered = document.querySelector(config.priceSelector)?.textContent?.trim();
      if (rendered) {
        const parsed = parseCartMoneyText(rendered, this.state.currency);
        return { ...parsed, text: rendered };
      }
    }

    if (Number.isFinite(Number(config.fallbackValue))) {
      const amount = Number(config.fallbackValue);
      const currency = cartCurrencyFromText(config.fallbackCurrency, this.state.currency);
      return {
        amount,
        currency,
        text: this.formatConfiguratorPanelPrice(amount, currency),
      };
    }
    return { amount: 0, currency: this.state.currency, text: '—' };
  }

  resolveConfiguratorPanelPriceText() {
    return this.resolveConfiguratorPanelPrice().text;
  }

  refreshConfiguratorPanelFooter() {
    if (!this.configuratorPanelFooter) return;
    renderConfiguratorPanelFooter(this.configuratorPanelFooter, {
      estimatedTotalLabel: sharedT(this.state.locale, 'panel.estimatedTotal'),
      priceText: this.resolveConfiguratorPanelPriceText(),
      addToCartLabel: sharedT(this.state.locale, 'panel.addToCart'),
      addToCartDisabled: !this.canAddToCart(),
    });
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
    this.syncFloatingConfiguratorPanelToggle();
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
    if (!this.authUser?.uid || (!this.currentSavedConfigurationId && !this.currentCartEdit) || !this.cleanStateJson) return;
    const currentJson = this.captureCurrentStateJson();
    if (!currentJson) return;
    const hasUnsavedChanges = currentJson !== this.cleanStateJson || this.projectName !== this.cleanProjectName;
    if (hasUnsavedChanges === this.dirty) return;

    this.dirty = hasUnsavedChanges;
    if (hasUnsavedChanges) {
      if (!this.currentCartEdit) this.scheduleDraftPersistence();
    } else if (!this.currentCartEdit) {
      this.currentDraftStateJson = '';
      this.persistMeta();
    }
    this.syncDirty();
  }

  captureDraftState() {
    if (!this.authUser?.uid || this.currentCartEdit || !this.dirty || !DRAFT_PRODUCTS.has(this.productId)) return;
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
    if (!this.authUser?.uid || this.currentCartEdit || !this.dirty || !DRAFT_PRODUCTS.has(this.productId)) return;
    window.clearTimeout(this.draftPersistTimer);
    this.draftPersistTimer = window.setTimeout(() => {
      this.captureDraftState();
      this.persistMeta();
    }, 180);
  }

  flushDraftPersistence() {
    window.clearTimeout(this.draftPersistTimer);
    this.draftPersistTimer = 0;
    if (!this.authUser?.uid || this.currentCartEdit || !this.dirty) return;
    this.captureDraftState();
    this.persistMeta();
  }

  async applyPendingDomainAuthentication() {
    const transport = this.pendingDomainAuthTransport;
    if (!transport) return;
    this.authBusy = true;
    this.sync();
    try {
      if (transport.mode === DOMAIN_AUTH_GUEST_STATE) {
        await signOutGoogle();
      } else {
        const customToken = await redeemDomainAuthHandoff(transport.handoffId);
        await signInWithDomainCustomToken(customToken);
      }
      this.pendingDomainAuthTransport = null;
      this.clearDomainAuthTransportUrl();
    } catch (error) {
      console.error('The authentication state could not be transferred to the new domain.', error);
      // Never keep an unrelated destination-domain account active when a domain
      // handoff was explicitly requested. Failing closed avoids opening another
      // user's local account book or saved-configuration pointer.
      try { await signOutGoogle(); } catch { /* best effort */ }
      this.pendingDomainAuthTransport = null;
      // Keep any Share transport intact. Even if authentication transfer fails,
      // the destination must still be able to restore the configuration as guest.
      this.clearDomainAuthTransportUrl();
      this.showFeedback(sharedT(this.state.locale, 'feedback.loginUnavailable'), 'error', 2000);
    } finally {
      this.authBusy = false;
      this.sync();
    }
  }

  async initializeAuthentication() {
    try {
      await this.applyPendingDomainAuthentication();
      this.authUnsubscribe = await observeGoogleAuth((user, error) => {
        if (error) return;
        this.authBusy = false;
        void this.handleAuthStateChange(user, { initial: !this.authInitialized });
      });
    } catch (error) {
      console.error('Google authentication could not be initialized.', error);
      this.authInitialized = true;
      await this.enterGuestSession({ resetModel: false, recordInitialConfiguration: true });
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
      await this.enterGuestSession({ resetModel: false, recordInitialConfiguration: initial });
      this.options.callbacks.onAuthChange?.(null);
      return;
    }

    if (nextUid) {
      await this.enterUserSession(user, { recordInitialConfiguration: initial });
      this.options.callbacks.onAuthChange?.(user);
      return;
    }

    // A transition from an authenticated account to guest is an explicit book
    // switch: reset the configurator itself, not only the visible project name.
    await this.enterGuestSession({ resetModel: !initial });
    this.options.callbacks.onAuthChange?.(null);
  }

  async restoreConfiguratorState(snapshot) {
    for (let attempt = 0; attempt < 80; attempt += 1) {
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

  recordConfigurationCreatedAnalytics({ initial = false } = {}) {
    let initialSessionKey = '';
    if (initial) {
      if (this.initialConfigurationAnalyticsRecorded) return;
      this.initialConfigurationAnalyticsRecorded = true;
      initialSessionKey = `360-configurator:analytics:initial-configuration:${window.location.hostname.toLowerCase()}:${this.productId}`;
      try {
        if (window.sessionStorage.getItem(initialSessionKey) === '1') return;
        window.sessionStorage.setItem(initialSessionKey, '1');
      } catch { /* analytics remains best effort when storage is unavailable */ }
    }
    void recordConfiguratorAnalyticsEvent({
      productType: this.productId,
      eventType: 'configuration_created',
    }).catch((error) => {
      if (initialSessionKey) {
        try { window.sessionStorage.removeItem(initialSessionKey); } catch { /* best effort */ }
      }
      console.warn('Configuration-created analytics could not be recorded.', error);
    });
  }

  async enterGuestSession({ resetModel = false, recordInitialConfiguration = false } = {}) {
    const token = ++this.sessionSwitchToken;
    this.authUser = null;
    this.activeSessionUid = '';
    this.cartOpen = false;
    this.cartItems = [];
    this.currentCartEdit = null;
    this.savedLoadBlocked = false;
    this.projectName = this.getGuestProjectName();
    this.lastSavedProjectName = '';
    this.currentSavedConfigurationId = '';
    this.currentSavedOwnerUid = '';
    this.cleanStateJson = '';
    this.cleanProjectName = '';
    this.dirty = false;
    this.savedDialog = { open: false, loading: false, error: '', items: [] };
    const restoringSharedConfiguration = this.pendingSharedConfigurationTransport;

    if (this.pendingSharedConfigurationTransport) {
      try {
        await this.restorePendingSharedConfiguration();
      } catch (error) {
        console.error('The shared configuration could not be restored for the guest session.', error);
        this.showFeedback(sharedT(this.state.locale, 'feedback.shareUnavailable'), 'error', 2000);
      }
    } else if (resetModel) {
      await this.resetConfiguratorToDefault();
    }
    if (token !== this.sessionSwitchToken) return;
    this.projectName = this.getGuestProjectName();
    this.lastSavedProjectName = '';
    this.currentSavedConfigurationId = '';
    this.currentSavedOwnerUid = '';
    this.currentDraftStateJson = '';
    this.cleanStateJson = '';
    this.cleanProjectName = '';
    this.dirty = false;
    if (recordInitialConfiguration && !restoringSharedConfiguration) {
      this.recordConfigurationCreatedAnalytics({ initial: true });
    }
    this.renderHost();
    this.sync();
  }

  async enterUserSession(user, { recordInitialConfiguration = false } = {}) {
    const uid = String(user?.uid || '');
    if (!uid) return this.enterGuestSession({ resetModel: false });
    const token = ++this.sessionSwitchToken;
    this.authUser = user;
    this.activeSessionUid = uid;
    this.cartOpen = false;
    this.loadCart(uid);
    void this.refreshCartFromBackend(uid, { force: true });
    this.savedLoadBlocked = false;
    this.savedDialog = { open: false, loading: false, error: '', items: [] };

    if (this.pendingCartEditTransport && await this.restoreCartEditTransport(user)) return;
    if (await this.restoreSavedDomainHandoff(user)) return;

    if (this.pendingSharedConfigurationTransport) {
      this.projectName = this.getNextDefaultProjectName(uid);
      this.lastSavedProjectName = '';
      this.currentSavedConfigurationId = '';
      this.currentSavedOwnerUid = uid;
      this.currentDraftStateJson = '';
      this.cleanStateJson = '';
      this.cleanProjectName = '';
      this.savedLoadBlocked = false;
      this.dirty = true;
      try {
        const sharedState = await this.restorePendingSharedConfiguration();
        if (token !== this.sessionSwitchToken) return;
        // A Share opened while authenticated is an unsaved draft, not a saved
        // configuration. Persist the exact transferred snapshot locally before
        // removing the bearer Share id from the URL.
        this.currentDraftStateJson = JSON.stringify(sharedState);
        this.persistMeta();
        this.clearSharedConfigurationTransportUrl();
      } catch (error) {
        console.error('The shared configuration could not be restored for the authenticated draft.', error);
        this.showFeedback(sharedT(this.state.locale, 'feedback.shareUnavailable'), 'error', 2000);
      }
      if (token !== this.sessionSwitchToken) return;
      this.renderHost();
      this.sync();
      return;
    }

    this.currentCartEdit = null;
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
      if (recordInitialConfiguration) this.recordConfigurationCreatedAnalytics({ initial: true });
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
      if (recordInitialConfiguration) this.recordConfigurationCreatedAnalytics({ initial: true });
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
      if (user) {
        await this.handleAuthStateChange(user);
        void recordConfiguratorAnalyticsEvent({
          productType: this.productId,
          eventType: 'login',
          requireAuth: true,
        }).catch((error) => {
          console.warn('Configurator login analytics could not be recorded.', error);
        });
      }
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

  withDomainAuthentication(targetUrl, mode, handoffId = '') {
    const target = new URL(targetUrl, window.location.href);
    target.searchParams.delete(DOMAIN_AUTH_STATE_PARAM);
    target.searchParams.delete(DOMAIN_AUTH_HANDOFF_PARAM);
    const hash = readHashParams(target);
    hash.delete(DOMAIN_AUTH_STATE_PARAM);
    hash.delete(DOMAIN_AUTH_HANDOFF_PARAM);
    hash.set(DOMAIN_AUTH_STATE_PARAM, mode);
    if (mode === DOMAIN_AUTH_USER_STATE && handoffId) hash.set(DOMAIN_AUTH_HANDOFF_PARAM, handoffId);
    writeHashParams(target, hash);
    return target.href;
  }

  buildSavedDomainTarget(targetUrl) {
    const target = stripConfigurationTransport(new URL(targetUrl, window.location.href));
    const hash = readHashParams(target);
    hash.set(SAVED_DOMAIN_ID_PARAM, this.currentSavedConfigurationId);
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
      if (this.currentCartEdit) {
        if (this.dirty) {
          const saveButton = this.host.querySelector('[data-action="save"]');
          const saved = await this.save(saveButton, { suppressFeedback: true });
          if (!saved) {
            this.hideLanguageSwitchLoading();
            this.showFeedback(DOMAIN_SAVE_FAILURE_MESSAGE, 'error', 2000);
            return;
          }
        }
        const handoffId = await createDomainAuthHandoff(new URL(targetUrl).origin);
        const cartTarget = this.buildCartEditTarget(this.currentCartEdit.productId, this.currentCartEdit.key, targetUrl);
        if (!cartTarget) throw new Error('The cart edit destination could not be generated.');
        navigating = true;
        window.location.assign(this.withDomainAuthentication(cartTarget, DOMAIN_AUTH_USER_STATE, handoffId));
        return;
      }
      const ownsSavedConfiguration = this.ownsCurrentSavedConfiguration();
      if (ownsSavedConfiguration && this.dirty) {
        const saveButton = this.host.querySelector('[data-action="save"]');
        const saved = await this.save(saveButton, { suppressFeedback: true });
        if (!saved) {
          this.hideLanguageSwitchLoading();
          this.showFeedback(DOMAIN_SAVE_FAILURE_MESSAGE, 'error', 2000);
          return;
        }
      }

      let authHandoffId = '';
      if (this.authUser?.uid) {
        authHandoffId = await createDomainAuthHandoff(new URL(targetUrl).origin);
      }

      const sameSavedScope = savedConfigurationScopeForHostname(window.location.hostname)
        === savedConfigurationScopeForHostname(new URL(targetUrl, window.location.href).hostname);
      let target = ownsSavedConfiguration && sameSavedScope
        ? this.buildSavedDomainTarget(targetUrl)
        : await this.buildSharedDomainTarget(nextLocale);
      target = this.authUser?.uid
        ? this.withDomainAuthentication(target, DOMAIN_AUTH_USER_STATE, authHandoffId)
        : this.withDomainAuthentication(target, DOMAIN_AUTH_GUEST_STATE);
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
    } else if (action === 'cart') {
      this.cartOpen = !this.cartOpen;
      this.accountOpen = false;
      this.languageOpen = false;
      this.domainOpen = false;
      this.syncMenus();
      if (this.cartOpen && this.authUser?.uid) {
        void this.refreshCartFromBackend(this.authUser.uid, { force: true });
      }
    } else if (action === 'cart-edit') {
      void this.editCartItem(actionTarget.dataset.cartKey, actionTarget);
    } else if (action === 'cart-remove') {
      void this.removeCartItem(actionTarget.dataset.cartKey, actionTarget);
    } else if (action === 'cart-empty') {
      void this.emptyCart();
    } else if (action === 'cart-quote') {
      // Quotation workflow will be implemented later; keep this control inert for now.
      return;
    } else if (action === 'account') {
      this.accountOpen = !this.accountOpen;
      if (!this.accountOpen) this.domainOpen = false;
      this.languageOpen = false;
      this.cartOpen = false;
      this.syncMenus();
    } else if (action === 'language') {
      this.languageOpen = !this.languageOpen;
      this.accountOpen = false;
      this.cartOpen = false;
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
    if (field.dataset.path === 'currency') {
      // Re-render the current configurator price immediately. Existing cart rows
      // keep their captured currencies and mixed-currency totals remain separate.
      this.renderHost();
      this.sync();
    }
  }

  async saveCartEditedConfiguration(button, { suppressFeedback = false } = {}) {
    if (this.saveBusy || !this.currentCartEdit || !this.authUser?.uid) return false;
    const configuration = this.options.callbacks.captureState?.();
    if (configuration === undefined || configuration === null) {
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saveUnavailable'), 'error');
      return false;
    }

    this.saveBusy = true;
    if (button) button.disabled = true;
    try {
      const price = this.resolveConfiguratorPanelPrice();
      const result = await mutateUserCart({
        action: 'update',
        item: {
          key: this.currentCartEdit.key,
          productId: this.currentCartEdit.productId,
          name: this.projectName,
          stateJson: JSON.stringify(configuration),
          costAmount: Math.max(0, Number(price.amount) || 0),
          currency: price.currency,
        },
      });
      this.setCartItems(result.items);
      if (result.updatedItem?.name) {
        this.projectName = String(result.updatedItem.name).slice(0, 80);
        this.currentCartEdit.name = this.projectName;
      }
      this.dirty = false;
      this.currentDraftStateJson = '';
      this.captureCleanBaseline();
      this.cartLastRemoteSyncAt = Date.now();
      if (button) {
        button.classList.remove('is-success');
        void button.offsetWidth;
        button.classList.add('is-success');
      }
      this.renderHost();
      this.sync();
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saved'));
      if (button) window.setTimeout(() => button.classList.remove('is-success'), 1050);
      return true;
    } catch (error) {
      console.error('Shopping cart configuration could not be saved.', error);
      if (!suppressFeedback) this.showFeedback(sharedT(this.state.locale, 'feedback.saveUnavailable'), 'error');
      return false;
    } finally {
      this.saveBusy = false;
      this.syncAuthenticationControls();
    }
  }

  async save(button, { suppressFeedback = false } = {}) {
    if (this.currentCartEdit) return this.saveCartEditedConfiguration(button, { suppressFeedback });
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
    this.exitCartEditMode();
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
      this.recordConfigurationCreatedAnalytics();
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
      this.exitCartEditMode();
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
    if (!this.currentCartEdit) this.scheduleDraftPersistence();
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
    // Cart editing is a detached working session. Never overwrite the user's
    // normal saved/draft pointer while a shoppingCart snapshot is open.
    if (this.currentCartEdit) return;
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
    this.refreshConfiguratorPanelFooter();
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
    this.cartMenu?.classList.toggle('is-open', this.cartOpen);
    this.host.querySelector('[data-action="account"]')?.setAttribute('aria-expanded', String(this.accountOpen));
    this.host.querySelector('[data-action="language"]')?.setAttribute('aria-expanded', String(this.languageOpen));
    this.host.querySelector('[data-action="cart"]')?.setAttribute('aria-expanded', String(this.cartOpen));
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
    window.removeEventListener('storage', this.onStorage);
    document.removeEventListener('visibilitychange', this.onCartVisibilityChange);
    window.clearTimeout(this.draftPersistTimer);
    window.clearInterval(this.dirtyWatchTimer);
    if (this.settingsToggle && this.onSettingsToggle) {
      this.settingsToggle.removeEventListener('click', this.onSettingsToggle);
    }
    if (this.configuratorPanelFooter && this.onConfiguratorPanelFooterClick) {
      this.configuratorPanelFooter.removeEventListener('click', this.onConfiguratorPanelFooterClick);
    }
    this.configuratorPanelHost?.classList.remove('shared-configurator-panel-host--floating-right');
    if (this.configuratorPanelToggle) {
      this.configuratorPanelToggle.classList.remove('shared-configurator-panel__toggle--floating-right');
      ['position', 'top', 'right', 'left', 'width', 'height', 'margin', 'border-radius'].forEach((property) => {
        this.configuratorPanelToggle.style.removeProperty(property);
      });
    }
    if (this.configuratorPanel?.dataset.sharedPanelGeometry === 'floating-right') {
      delete this.configuratorPanel.dataset.sharedPanelGeometry;
    }
    this.host.remove();
    document.body.classList.remove('shared-ui-mounted', 'shared-ui-dark-mode');
    document.querySelector('.app-shell')?.classList.remove('is-dark-mode');
  }
}

export function mountStandaloneConfiguratorShell(options) {
  return new StandaloneConfiguratorShell(options);
}
