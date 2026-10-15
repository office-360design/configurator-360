import { getFirebaseIdToken } from './firebaseAuth.js?v=platform-18';

// "Pay online" from the cart: the backend signs an EuPlatesc payment for the
// server-side cart total; the browser posts the signed form to EuPlatesc and
// comes back through the payment callback with ?payment=success|failed.
const FUNCTIONS_BASE = 'https://europe-west1-configurator-360.cloudfunctions.net';
// While EuPlatesc runs on the test merchant account, every cart shows a fixed
// 1 RON test product so the whole payment flow can be tried with a real cart
// total. Must match EUPLATESC_MODE in firebase-share-backend/functions.
export const PAYMENT_TEST_MODE = true;
export const PAYMENT_TEST_ITEM = Object.freeze({ key: 'payment-test-item', productId: 'test', costAmount: 1, currency: 'RON' });
const CONTROLLER_FLAG = '__360ConfiguratorPaymentControllerV1';
const SUPPORTED_LOCALES = new Set(['en-US', 'ro-RO', 'de-DE']);

const TEXT = Object.freeze({
  'en-US': { login: 'Sign in with Google to pay online.', empty: 'Your cart is empty.', failure: 'The payment could not be started.', redirecting: 'Redirecting to EuPlătesc…', success: 'Payment received', failed: 'The payment was not completed.', invalid: 'The payment response could not be verified.', order: 'Order' },
  'ro-RO': { login: 'Autentifică-te cu Google pentru a plăti online.', empty: 'Coșul este gol.', failure: 'Plata nu a putut fi inițiată.', redirecting: 'Redirecționare către EuPlătesc…', success: 'Plată reușită', failed: 'Plata nu a fost finalizată.', invalid: 'Răspunsul plății nu a putut fi verificat.', order: 'Comanda' },
  'de-DE': { login: 'Melden Sie sich mit Google an, um online zu bezahlen.', empty: 'Ihr Warenkorb ist leer.', failure: 'Die Zahlung konnte nicht gestartet werden.', redirecting: 'Weiterleitung zu EuPlătesc…', success: 'Zahlung erhalten', failed: 'Die Zahlung wurde nicht abgeschlossen.', invalid: 'Die Zahlungsantwort konnte nicht geprüft werden.', order: 'Bestellung' },
});

const localeOf = value => (SUPPORTED_LOCALES.has(value) ? value : (document.documentElement.lang?.startsWith('ro') ? 'ro-RO' : document.documentElement.lang?.startsWith('de') ? 'de-DE' : 'en-US'));

async function callFunction(name, data) {
  const token = await getFirebaseIdToken();
  if (!token) { const error = new Error('Google login is required.'); error.code = 'auth-required'; throw error; }
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST', mode: 'cors', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Request failed (${response.status}).`);
    error.code = payload?.error?.status || `http-${response.status}`;
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function flash(button, text, ms = 2600) {
  const label = button.querySelector('[data-pay-label]');
  if (!label) return;
  const original = label.dataset.original || label.textContent;
  label.dataset.original = original;
  label.textContent = text;
  button.title = text;
  clearTimeout(button.__payTimer);
  button.__payTimer = setTimeout(() => { label.textContent = original; button.removeAttribute('title'); }, ms);
}

function submitSignedForm(action, fields) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  form.style.display = 'none';
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = String(value);
    form.append(input);
  });
  document.body.append(form);
  form.submit();
}

async function startPayment(button) {
  const menu = button.closest('[data-cart-menu]');
  const locale = localeOf(menu?.dataset.quotationLocale);
  const text = TEXT[locale];
  if (button.getAttribute('aria-busy') === 'true') return;
  button.setAttribute('aria-busy', 'true');
  try {
    const result = await callFunction('createCartPayment', {
      currency: menu?.dataset.quotationCurrency || 'RON',
      returnUrl: window.location.href,
    });
    if (!result?.action || !result?.fields) throw new Error('Invalid payment response.');
    flash(button, text.redirecting, 10000);
    submitSignedForm(result.action, result.fields);
  } catch (error) {
    button.removeAttribute('aria-busy');
    const code = String(error.code || '').toLowerCase();
    flash(button, code === 'auth-required' || code === 'unauthenticated' ? text.login
      : code === 'failed-precondition' ? text.empty : text.failure);
  }
}

// Result banner after EuPlatesc redirects back to the configurator.
async function showReturnBanner() {
  const params = new URLSearchParams(window.location.search);
  const outcome = params.get('payment');
  if (!['success', 'failed', 'invalid'].includes(outcome)) return;
  const orderId = params.get('paymentOrder') || '';
  const text = TEXT[localeOf(document.documentElement.lang === 'ro' ? 'ro-RO' : document.documentElement.lang === 'de' ? 'de-DE' : 'en-US')];
  params.delete('payment'); params.delete('paymentOrder');
  const clean = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', clean);

  const banner = document.createElement('div');
  banner.className = `shared-payment-banner is-${outcome}`;
  banner.setAttribute('role', 'status');
  banner.innerHTML = `<strong></strong><span></span><button type="button" aria-label="Close">×</button>`;
  banner.querySelector('strong').textContent = outcome === 'success' ? text.success : outcome === 'failed' ? text.failed : text.invalid;
  banner.querySelector('span').textContent = orderId ? `${text.order} ${orderId}` : '';
  banner.querySelector('button').addEventListener('click', () => banner.remove());
  document.body.append(banner);
  if (outcome === 'success' && orderId) {
    try {
      const status = await callFunction('getCartPayment', { orderId });
      if (status?.amount) {
        const test = status.mode === 'test' && status.cartTotal != null ? ` (TEST · ${Number(status.cartTotal).toFixed(2)} ${status.currency})` : '';
        banner.querySelector('span').textContent = `${status.amount} ${status.currency}${test} · ${text.order} ${orderId}`;
      }
    } catch { /* the banner already shows the verified redirect result */ }
  }
}

export function installPaymentController() {
  if (globalThis[CONTROLLER_FLAG]) return;
  globalThis[CONTROLLER_FLAG] = true;
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-action="cart-pay"]');
    if (!button || button.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    void startPayment(button);
  }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void showReturnBanner(); }, { once: true });
  else setTimeout(() => { void showReturnBanner(); }, 0);
}
