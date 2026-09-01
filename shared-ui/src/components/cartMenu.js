import { sharedT } from '../i18n.js?v=25';
import { sharedIcon } from '../icons.js?v=20';
import { installQuotationRequestController } from '../quotationRequest.js?v=4';
import { escapeHtml } from '../utils.js';

installQuotationRequestController();

const CART_FX_RATES_FROM_EUR = Object.freeze({ EUR: 1, USD: 1.09, RON: 4.98 });
const SUPPORTED_CURRENCIES = new Set(['EUR', 'USD', 'RON']);

function normalizedCurrency(value = '', fallback = 'USD') {
  const normalized = String(value || '').trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.has(normalized)) return normalized;
  const normalizedFallback = String(fallback || '').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(normalizedFallback) ? normalizedFallback : 'USD';
}

function localeDefaultCurrency(locale = 'en-US') {
  if (locale === 'ro-RO') return 'RON';
  if (locale === 'de-DE') return 'EUR';
  return 'USD';
}

function selectedCartCurrency(locale = 'en-US') {
  // The shared account selector is the single source of truth for the cart
  // presentation currency. renderHost() is called after this select changes,
  // so its live value is available before the replacement DOM is committed.
  const control = document.querySelector('.shared-ui-host [data-path="currency"]')
    || document.querySelector('[data-path="currency"]');
  const selected = String(control?.value || '').trim().toUpperCase();
  return SUPPORTED_CURRENCIES.has(selected) ? selected : localeDefaultCurrency(locale);
}

function convertMoney(value, fromCurrency, toCurrency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const from = normalizedCurrency(fromCurrency, 'EUR');
  const to = normalizedCurrency(toCurrency, 'EUR');
  if (from === to) return amount;
  const fromRate = Number(CART_FX_RATES_FROM_EUR[from]) || 1;
  const toRate = Number(CART_FX_RATES_FROM_EUR[to]) || 1;
  return (amount / fromRate) * toRate;
}

function parseMoneyText(value = '') {
  let numeric = String(value || '').replace(/[^0-9.,-]/g, '');
  if (!/[0-9]/.test(numeric)) return 0;
  const negative = numeric.startsWith('-');
  numeric = numeric.replace(/-/g, '');
  const lastDot = numeric.lastIndexOf('.');
  const lastComma = numeric.lastIndexOf(',');
  const separator = lastDot > lastComma ? '.' : (lastComma > lastDot ? ',' : '');
  if (separator) {
    const other = separator === '.' ? ',' : '.';
    numeric = numeric.split(other).join('');
    const index = numeric.lastIndexOf(separator);
    const digitsAfter = numeric.length - index - 1;
    if (digitsAfter === 1 || digitsAfter === 2) {
      numeric = `${numeric.slice(0, index).split(separator).join('')}.${numeric.slice(index + 1)}`;
    } else {
      numeric = numeric.split(separator).join('');
    }
  }
  const amount = Number(numeric);
  return Number.isFinite(amount) ? (negative ? -amount : amount) : 0;
}

function cartItemAmount(item) {
  const explicit = Number(item?.costAmount);
  return Number.isFinite(explicit)
    ? Math.max(0, explicit)
    : Math.max(0, parseMoneyText(item?.costText));
}

function formatMoney(value, currency, locale) {
  const amount = Number(value) || 0;
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function cartDisplayModel(locale, items) {
  const currency = selectedCartCurrency(locale);
  let total = 0;
  const displayItems = items.map((item) => {
    const converted = Math.max(0, convertMoney(cartItemAmount(item), item?.currency, currency));
    total += converted;
    return {
      ...item,
      costText: formatMoney(converted, currency, locale),
    };
  });
  return {
    currency,
    displayItems,
    totalText: formatMoney(total, currency, locale),
  };
}

function renderCartItem(locale, item) {
  const key = escapeHtml(String(item?.key || ''));
  const productId = escapeHtml(String(item?.productId || ''));
  const name = escapeHtml(String(item?.name || sharedT(locale, 'cart.unnamed')));
  const cost = escapeHtml(String(item?.costText || '—'));
  const editLabel = escapeHtml(sharedT(locale, 'cart.edit'));
  const removeLabel = escapeHtml(sharedT(locale, 'cart.remove'));
  return `
    <article class="cart-menu__item" data-cart-item data-cart-key="${key}" data-cart-product="${productId}">
      <div class="cart-menu__item-copy">
        <strong>${name}</strong>
        <span>${cost}</span>
      </div>
      <div class="cart-menu__item-actions">
        <button class="cart-menu__edit" type="button" data-action="cart-edit" data-cart-key="${key}" data-cart-product="${productId}" aria-label="${editLabel}" data-tooltip="${editLabel}">
          <span class="cart-menu__edit-icon">${sharedIcon('edit')}</span>
        </button>
        <button class="cart-menu__remove" type="button" data-action="cart-remove" data-cart-key="${key}" aria-label="${removeLabel}" data-tooltip="${removeLabel}">
          <span class="cart-menu__trash-icon">${sharedIcon('trash')}</span>
        </button>
      </div>
    </article>
  `;
}

export function renderCartMenu(locale, items = [], { open = false, busy = false } = {}) {
  const normalized = Array.isArray(items) ? items : [];
  const model = cartDisplayModel(locale, normalized);
  const emptyLabel = escapeHtml(sharedT(locale, 'cart.emptyCart'));
  const quoteLabel = escapeHtml(sharedT(locale, 'cart.quote'));
  const quotationLocale = escapeHtml(String(locale || 'en-US'));
  const quotationCurrency = escapeHtml(model.currency);
  return `
    <section class="cart-menu ${open ? 'is-open' : ''}" data-cart-menu data-quotation-locale="${quotationLocale}" data-quotation-currency="${quotationCurrency}" aria-label="${escapeHtml(sharedT(locale, 'cart.title'))}">
      <div class="cart-menu__header">
        <strong>${escapeHtml(sharedT(locale, 'cart.title'))}</strong>
        <div class="cart-menu__header-actions">
          <button class="cart-menu__empty-button" type="button" data-action="cart-empty" ${busy || normalized.length === 0 ? 'disabled' : ''}>${emptyLabel}</button>
          <span class="cart-menu__count">${normalized.length}</span>
        </div>
      </div>
      <div class="cart-menu__items" data-cart-items>
        ${model.displayItems.length
          ? model.displayItems.map((item) => renderCartItem(locale, item)).join('')
          : `<p class="cart-menu__empty">${escapeHtml(sharedT(locale, 'cart.empty'))}</p>`}
      </div>
      <div class="cart-menu__footer">
        <div class="cart-menu__total">
          <span>${escapeHtml(sharedT(locale, 'cart.total'))}</span>
          <strong>${escapeHtml(model.totalText)}</strong>
        </div>
        <button class="cart-menu__quote" type="button" data-action="cart-quote" ${busy || normalized.length === 0 ? 'disabled' : ''}>
          <span class="cart-menu__quote-icon" aria-hidden="true">
            <span class="cart-menu__quote-mail">${sharedIcon('mail')}</span>
            <span class="cart-menu__quote-loader"><i></i><i></i><i></i></span>
          </span>
          <span>${quoteLabel}</span>
        </button>
      </div>
    </section>
  `;
}
