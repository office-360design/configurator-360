import { CONFIGURATOR_PUBLIC_PATHS, getLocalizedConfiguratorUrl } from './config.js';
import { getFirebaseIdToken } from './firebaseAuth.js?v=18';
import { createShareUrl } from './shareState.js?v=4';
import { getTenantSlugForHostname } from './tenantBootstrap.js?v=2';
import { getUserCart } from './userCart.js?v=4';

const FUNCTIONS_REGION = 'europe-west1';
const PROJECT_ID = 'configurator-360';
const QUOTATION_FUNCTION = 'requestCartQuotation';
const SUPPORTED_LOCALES = new Set(['en-US', 'ro-RO', 'de-DE']);
const SUPPORTED_CURRENCIES = new Set(['USD', 'RON', 'EUR']);
const PRODUCT_IDS = new Set(['window', 'roof', 'pergola', 'hall', 'solar', 'fence']);
const CONTROLLER_FLAG = '__360ConfiguratorQuotationController';

const UI_TEXT = Object.freeze({
  'en-US': Object.freeze({
    success: 'Quotation request sent.',
    failure: 'The quotation request could not be sent. Please try again.',
    empty: 'Your cart is empty.',
  }),
  'ro-RO': Object.freeze({
    success: 'Solicitarea de ofertă a fost trimisă.',
    failure: 'Solicitarea de ofertă nu a putut fi trimisă. Încercați din nou.',
    empty: 'Coșul este gol.',
  }),
  'de-DE': Object.freeze({
    success: 'Angebotsanfrage wurde gesendet.',
    failure: 'Die Angebotsanfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
    empty: 'Ihr Warenkorb ist leer.',
  }),
});

function normalizeLocale(value = '') {
  const locale = String(value || '').trim();
  return SUPPORTED_LOCALES.has(locale) ? locale : 'en-US';
}

function normalizeCurrency(value = '', locale = 'en-US') {
  const currency = String(value || '').trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.has(currency)) return currency;
  if (locale === 'ro-RO') return 'RON';
  if (locale === 'de-DE') return 'EUR';
  return 'USD';
}

function callableUrl(name) {
  return `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

async function callQuotationFunction(data) {
  const token = await getFirebaseIdToken();
  if (!token) {
    const error = new Error('Google login is required.');
    error.code = 'auth-required';
    throw error;
  }

  const response = await fetch(callableUrl(QUOTATION_FUNCTION), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });

  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Quotation request failed (${response.status}).`;
    const error = new Error(message);
    error.code = payload?.error?.status || `http-${response.status}`;
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function normalizedProductId(value = '') {
  const product = String(value || '').trim().toLowerCase();
  return PRODUCT_IDS.has(product) ? product : '';
}

function quotationBaseUrl(locale, productId) {
  const product = normalizedProductId(productId);
  if (!product) throw new Error('Unsupported cart product.');

  const tenantSlug = getTenantSlugForHostname(window.location.hostname);
  if (tenantSlug) {
    // Tenant sites use the canonical configurator routes on their own host.
    // Country-specific aliases intentionally redirect to the public country
    // domains, so using them here would lose the tenant context.
    const path = CONFIGURATOR_PUBLIC_PATHS['en-US']?.[product];
    if (!path) throw new Error('The configurator link could not be generated.');
    return new URL(path, window.location.origin).href;
  }

  const localized = getLocalizedConfiguratorUrl(locale, product, window.location);
  if (!localized) throw new Error('The configurator link could not be generated.');
  return localized;
}

function forceGuestShareUrl(url) {
  const target = new URL(url, window.location.href);
  const hash = new URLSearchParams(target.hash.startsWith('#') ? target.hash.slice(1) : target.hash);
  hash.set('domainAuthState', 'guest');
  hash.delete('domainAuthHandoff');
  hash.delete('savedConfig');
  hash.delete('savedOwner');
  hash.delete('cartItem');
  hash.delete('cartProduct');
  target.hash = hash.toString();
  return target.href;
}

async function cartItemDetail(summary) {
  const productId = normalizedProductId(summary?.productId);
  const key = String(summary?.key || summary?.cartItemId || '').trim();
  if (!productId || !key) throw new Error('A cart item is invalid.');

  const result = await getUserCart({ key, productId });
  const detail = result?.editingItem;
  if (!detail?.state || typeof detail.state !== 'object') {
    throw new Error('A cart configuration could not be loaded.');
  }
  return {
    key,
    productId,
    name: String(summary?.name || detail?.name || '').trim(),
    state: detail.state,
  };
}

async function buildGuestLinks(locale) {
  const cart = await getUserCart();
  const items = Array.isArray(cart?.items) ? cart.items : [];
  if (!items.length) return [];

  // Keep share creation sequential. It avoids unnecessary parallel App Check
  // assessments and makes failures deterministic for the user.
  const links = [];
  for (const summary of items) {
    const detail = await cartItemDetail(summary);
    const baseUrl = quotationBaseUrl(locale, detail.productId);
    const shareUrl = await createShareUrl({
      productType: detail.productId,
      state: detail.state,
      url: baseUrl,
    });
    links.push({
      key: detail.key,
      productId: detail.productId,
      url: forceGuestShareUrl(shareUrl),
    });
  }
  return links;
}

function showQuotationToast(message, { error = false } = {}) {
  const previous = document.querySelector('[data-quotation-toast]');
  previous?.remove();

  const toast = document.createElement('div');
  toast.dataset.quotationToast = '';
  toast.setAttribute('role', error ? 'alert' : 'status');
  toast.textContent = String(message || '');
  Object.assign(toast.style, {
    position: 'fixed',
    left: '50%',
    bottom: '28px',
    transform: 'translateX(-50%)',
    zIndex: '100000',
    maxWidth: 'min(520px, calc(100vw - 32px))',
    padding: '11px 16px',
    borderRadius: '12px',
    border: error ? '1px solid #dc2626' : '1px solid #15803d',
    background: error ? '#fef2f2' : '#f0fdf4',
    color: error ? '#991b1b' : '#166534',
    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.18)',
    font: '600 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    textAlign: 'center',
  });
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function quotationContext(button) {
  const menu = button.closest('[data-cart-menu]');
  const locale = normalizeLocale(menu?.dataset?.quotationLocale);
  const currency = normalizeCurrency(menu?.dataset?.quotationCurrency, locale);
  return { locale, currency };
}

async function submitQuotation(button) {
  if (button.disabled || button.getAttribute('aria-busy') === 'true') return;
  const { locale, currency } = quotationContext(button);
  const text = UI_TEXT[locale] || UI_TEXT['en-US'];

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    const links = await buildGuestLinks(locale);
    if (!links.length) {
      showQuotationToast(text.empty, { error: true });
      return;
    }
    await callQuotationFunction({ locale, currency, links });
    showQuotationToast(text.success);
  } catch (error) {
    console.error('Quotation request failed.', error);
    showQuotationToast(text.failure, { error: true });
  } finally {
    button.removeAttribute('aria-busy');
    // The cart may have been re-rendered while the request was running. Only
    // re-enable this exact element if it is still connected and has items.
    if (button.isConnected) {
      const menu = button.closest('[data-cart-menu]');
      const hasItems = Boolean(menu?.querySelector('[data-cart-item]'));
      button.disabled = !hasItems;
    }
  }
}

export function installQuotationRequestController() {
  if (globalThis[CONTROLLER_FLAG]) return;
  globalThis[CONTROLLER_FLAG] = true;

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-action="cart-quote"]')
      : null;
    if (!(button instanceof HTMLButtonElement)) return;

    // The legacy shell deliberately treats cart-quote as inert. Intercept in
    // capture phase so this shared controller owns the action without requiring
    // product-specific integrations or a large standaloneShell rewrite.
    event.preventDefault();
    event.stopPropagation();
    void submitQuotation(button);
  }, true);
}
