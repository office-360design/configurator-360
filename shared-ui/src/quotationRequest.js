import { getFirebaseIdToken } from './firebaseAuth.js?v=18';

const FUNCTIONS_REGION = 'europe-west1';
const PROJECT_ID = 'configurator-360';
const QUOTATION_FUNCTION = 'requestCartQuotation';
const SUPPORTED_LOCALES = new Set(['en-US', 'ro-RO', 'de-DE']);
const SUPPORTED_CURRENCIES = new Set(['USD', 'RON', 'EUR']);
const CONTROLLER_FLAG = '__360ConfiguratorQuotationControllerV3';
const FEEDBACK_TIMER_FLAG = '__360ConfiguratorQuotationFeedbackTimer';

const SUCCESS_DURATION_MS = 500;
const ERROR_DURATION_MS = 1500;

const UI_TEXT = Object.freeze({
  'en-US': Object.freeze({
    success: 'Quotation request sent.',
    failure: 'The quotation request could not be sent.',
    empty: 'Your cart is empty.',
    cooldown: (seconds) => `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before sending another quotation request.`,
  }),
  'ro-RO': Object.freeze({
    success: 'Solicitarea de ofertă a fost trimisă.',
    failure: 'Solicitarea de ofertă nu a putut fi trimisă.',
    empty: 'Coșul este gol.',
    cooldown: (seconds) => `Mai așteptați ${seconds} ${seconds === 1 ? 'secundă' : 'secunde'} înainte de a trimite o nouă solicitare de ofertă.`,
  }),
  'de-DE': Object.freeze({
    success: 'Angebotsanfrage wurde gesendet.',
    failure: 'Die Angebotsanfrage konnte nicht gesendet werden.',
    empty: 'Ihr Warenkorb ist leer.',
    cooldown: (seconds) => `Bitte warten Sie noch ${seconds} Sekunde${seconds === 1 ? '' : 'n'}, bevor Sie eine weitere Angebotsanfrage senden.`,
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
    error.details = payload?.error?.details || null;
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function quotationContext(button) {
  const menu = button.closest('[data-cart-menu]');
  const locale = normalizeLocale(menu?.dataset?.quotationLocale);
  const currency = normalizeCurrency(menu?.dataset?.quotationCurrency, locale);
  return { locale, currency };
}

function feedbackElement() {
  return document.querySelector('[data-save-feedback]');
}

function showSharedFeedback(message, type = 'success', durationMs = SUCCESS_DURATION_MS) {
  const feedback = feedbackElement();
  if (!(feedback instanceof HTMLElement)) return;
  const text = feedback.querySelector('[data-save-feedback-text]');
  if (!(text instanceof HTMLElement)) return;

  window.clearTimeout(globalThis[FEEDBACK_TIMER_FLAG]);
  const feedbackType = type === 'error' ? 'is-error' : 'is-success';
  feedback.classList.remove('is-success', 'is-error', 'is-animating');
  void feedback.offsetWidth;
  const duration = Math.max(300, Number(durationMs) || SUCCESS_DURATION_MS);
  feedback.style.animationDuration = `${duration}ms`;
  feedback.classList.add(feedbackType, 'is-animating');
  text.textContent = String(message || '');
  globalThis[FEEDBACK_TIMER_FLAG] = window.setTimeout(() => feedback.classList.remove('is-animating'), duration);
}

function normalizedErrorCode(error) {
  return String(error?.code || '').trim().toLowerCase().replace(/_/g, '-');
}

function retryAfterSeconds(error) {
  const explicit = Number(error?.details?.retryAfterSeconds);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.ceil(explicit));
  const match = String(error?.message || '').match(/(\d+)\s*second/i);
  return match ? Math.max(1, Number(match[1]) || 1) : 0;
}

async function submitQuotation(button) {
  if (button.disabled || button.getAttribute('aria-busy') === 'true') return;
  const { locale, currency } = quotationContext(button);
  const text = UI_TEXT[locale] || UI_TEXT['en-US'];
  const menu = button.closest('[data-cart-menu]');
  if (!menu?.querySelector('[data-cart-item]')) {
    showSharedFeedback(text.empty, 'error', ERROR_DURATION_MS);
    return;
  }

  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try {
    // One click maps to one backend request. The backend reads the immutable
    // shoppingCart snapshots, creates the guest links, sends the email and only
    // then reports success. No configurator-specific Share chain runs here.
    await callQuotationFunction({ locale, currency });
    showSharedFeedback(text.success, 'success', SUCCESS_DURATION_MS);
  } catch (error) {
    console.error('Quotation request failed.', error);
    const code = normalizedErrorCode(error);
    const remaining = retryAfterSeconds(error);
    if (code === 'resource-exhausted' && remaining > 0) {
      showSharedFeedback(text.cooldown(remaining), 'error', ERROR_DURATION_MS);
    } else {
      showSharedFeedback(text.failure, 'error', ERROR_DURATION_MS);
    }
  } finally {
    button.removeAttribute('aria-busy');
    if (button.isConnected) {
      const currentMenu = button.closest('[data-cart-menu]');
      button.disabled = !currentMenu?.querySelector('[data-cart-item]');
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

    // Own the shared cart quotation action before the standalone shell's legacy
    // inert cart-quote branch can see it. stopImmediatePropagation also prevents
    // an older quotation controller from submitting a second request.
    event.preventDefault();
    event.stopImmediatePropagation();
    void submitQuotation(button);
  }, true);
}
