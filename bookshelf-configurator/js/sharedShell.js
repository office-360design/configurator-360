import { mountStandaloneConfiguratorShell } from '../../shared-ui/src/standaloneShell.js?v=tenant-routes-1';
import { SharedUndoManager } from '../../shared-ui/src/history/undoManager.js?v=platform-18';
import { resolveSharedTools } from '../../shared-ui/src/tools/registry.js?v=platform-18';
import { createShareUrl } from '../../shared-ui/src/shareState.js?v=platform-18';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1';

const tenantContext = await requireTenantConfiguratorAccess('bookshelf');
const mobileLayoutQuery = window.matchMedia('(max-width: 760px)');

const history = new SharedUndoManager({
  capture: () => window.BOOKSHELF_CONFIGURATOR_API?.captureState?.(),
  restore: (snapshot) => window.BOOKSHELF_CONFIGURATOR_API?.restoreState?.(snapshot),
});

const toolItems = resolveSharedTools([
  { id: 'dimensions', active: true },
  'camera',
]);

let shell;
shell = mountStandaloneConfiguratorShell({
  productType: 'Bookshelf',
  productId: 'bookshelf',
  storagePrefix: '360-configurator:bookshelf',
  brandSrc: tenantContext?.logoUrl || '../shared-ui/assets/360CONFIGURATOR.png',
  brandAlt: tenantContext?.companyName || '360 Configurator',
  capabilities: { viewAR: false, save: true, undo: true, reset: true, share: true },
  tools: { items: toolItems, placement: { side: 'left', direction: 'down', offsetX: 12, offsetY: 12 } },
  settingsPanel: {
    panelSelector: '.sidebar',
    toggleSelector: '#bookshelfSidebarToggle',
    collapsedClass: 'is-collapsed',
    bodyCollapsedClass: 'bookshelf-sidebar-collapsed',
    initiallyCollapsed: mobileLayoutQuery.matches,
  },
  configuratorPanel: {
    panelSelector: '.sidebar',
    geometry: 'floating-right',
  },
  callbacks: {
    onUndo() { history.undo(); },
    async resetConfiguration() { return (await window.BOOKSHELF_CONFIGURATOR_API?.resetConfiguration?.()) !== false; },
    captureState() { return window.BOOKSHELF_CONFIGURATOR_API?.captureState?.(); },
    restoreState(snapshot) { return window.BOOKSHELF_CONFIGURATOR_API?.restoreState?.(snapshot) !== false; },
    getShareUrl() {
      const snapshot = window.BOOKSHELF_CONFIGURATOR_API?.captureState?.();
      return snapshot ? createShareUrl({ productType: 'bookshelf', state: snapshot }) : window.location.href;
    },
    onPreferenceChange(path, value, preferences) {
      if (path === 'darkMode') window.BOOKSHELF_CONFIGURATOR_API?.setDarkMode?.(Boolean(value));
      if (path === 'locale') {
        window.BOOKSHELF_CONFIGURATOR_API?.setLocale?.(preferences.locale);
        queueMicrotask(syncBookshelfLocalShell);
      }
      if (path === 'units') window.BOOKSHELF_CONFIGURATOR_API?.setUnits?.(preferences.units);
      if (path === 'currency') window.BOOKSHELF_CONFIGURATOR_API?.setCurrency?.(preferences.currency);
    },
    onToolsOpenChange(open) {
      if (mobileLayoutQuery.matches && open) shell?.setSettingsPanelCollapsed?.(true);
    },
    onSettingsPanelToggle(collapsed) {
      syncSidebarAccessibility(collapsed);
      if (mobileLayoutQuery.matches && !collapsed && shell?.toolsOpen) {
        shell.toolsOpen = false;
        shell.syncTools();
      }
    },
  },
});

const BOOKSHELF_QUOTE_LABELS = Object.freeze({
  'en-US': 'Ask for quotation',
  'ro-RO': 'Cere ofertă',
  'de-DE': 'Angebot anfragen',
});

function syncBookshelfLocalShell() {
  const quoteButton = document.querySelector('[data-shared-panel-add-to-cart]');
  if (!quoteButton) return;
  quoteButton.textContent = BOOKSHELF_QUOTE_LABELS[shell.state.locale] || BOOKSHELF_QUOTE_LABELS['en-US'];
  quoteButton.disabled = false;
  quoteButton.setAttribute('aria-disabled', 'false');
  quoteButton.setAttribute('aria-label', quoteButton.textContent);
  quoteButton.title = quoteButton.textContent;
}

const sharedFooterRefresh = shell.refreshConfiguratorPanelFooter?.bind(shell);
if (sharedFooterRefresh) {
  shell.refreshConfiguratorPanelFooter = (...args) => {
    const result = sharedFooterRefresh(...args);
    syncBookshelfLocalShell();
    return result;
  };
}
syncBookshelfLocalShell();

const BOOKSHELF_QUOTATION_FUNCTION = 'requestBookshelfQuotation';
const BOOKSHELF_FUNCTIONS_REGION = 'europe-west1';
const BOOKSHELF_PROJECT_ID = 'configurator-360';
const QUOTATION_DRAFT_STORAGE_KEY = '360-configurator:bookshelf:quotation-draft-v1';
const QUOTATION_FEEDBACK_DURATION_MS = 5000;
const QUOTATION_SUCCESS_COOLDOWN_MS = 30 * 1000;
const QUOTATION_FAILURE_COOLDOWN_MS = 2 * 1000;
let quotationCooldownUntilMs = 0;
let quotationCooldownTimer = 0;

const BOOKSHELF_QUOTATION_COPY = Object.freeze({
  'en-US': Object.freeze({
    title: 'Ask for quotation',
    intro: 'Complete the details below and we will send your bookshelf request to the factory.',
    name: 'Name',
    nameTip: 'Your full name, used by the factory to identify and reply to your request.',
    company: 'Company name',
    companyTip: 'Optional. Enter the company or organisation the quotation should be associated with.',
    phone: 'Phone number',
    phoneTip: 'A phone number where the factory can contact you about the quotation.',
    email: 'Email',
    emailTip: 'The confirmation and quotation correspondence will be sent to this address.',
    address: 'Shipping address',
    addressTip: 'The address where the configured bookcases would need to be delivered.',
    quantity: 'Number of bookcases',
    quantityTip: 'How many copies of this complete configured bookshelf you want. The default is 1.',
    optional: 'optional',
    send: 'Send request',
    sending: 'Sending…',
    close: 'Close quotation form',
    required: 'Please complete all required fields.',
    invalidEmail: 'Please enter a valid email address.',
    invalidPhone: 'Please enter a valid phone number.',
    invalidQuantity: 'Please enter a valid number of bookcases.',
    invalidAddress: 'Please enter a valid shipping address.',
    success: 'Request sent',
    failure: 'The request could not be sent. Please try again.',
    shareFailure: 'The configuration link could not be created. Please try again.',
    cooldown: (seconds) => `Please wait ${seconds} second${seconds === 1 ? '' : 's'} before sending another request.`,
  }),
  'ro-RO': Object.freeze({
    title: 'Cere ofertă',
    intro: 'Completează datele de mai jos, iar solicitarea pentru bibliotecă va fi trimisă fabricii.',
    name: 'Nume',
    nameTip: 'Numele complet, folosit de fabrică pentru identificarea și soluționarea solicitării.',
    company: 'Numele companiei',
    companyTip: 'Opțional. Introdu compania sau organizația pentru care se solicită oferta.',
    phone: 'Număr de telefon',
    phoneTip: 'Numărul de telefon la care fabrica te poate contacta în legătură cu oferta.',
    email: 'E-mail',
    emailTip: 'Confirmarea și corespondența legată de ofertă vor fi trimise la această adresă.',
    address: 'Adresa de livrare',
    addressTip: 'Adresa la care ar trebui livrate bibliotecile configurate.',
    quantity: 'Număr de biblioteci',
    quantityTip: 'Numărul de exemplare ale acestei configurații complete. Valoarea implicită este 1.',
    optional: 'opțional',
    send: 'Trimite solicitarea',
    sending: 'Se trimite…',
    close: 'Închide formularul de ofertă',
    required: 'Completează toate câmpurile obligatorii.',
    invalidEmail: 'Introdu o adresă de e-mail validă.',
    invalidPhone: 'Introdu un număr de telefon valid.',
    invalidQuantity: 'Introdu un număr valid de biblioteci.',
    invalidAddress: 'Introdu o adresă de livrare validă.',
    success: 'Solicitare trimisă',
    failure: 'Solicitarea nu a putut fi trimisă. Încearcă din nou.',
    shareFailure: 'Linkul configurației nu a putut fi creat. Încearcă din nou.',
    cooldown: (seconds) => `Mai așteaptă ${seconds} ${seconds === 1 ? 'secundă' : 'secunde'} înainte de a trimite o nouă solicitare.`,
  }),
  'de-DE': Object.freeze({
    title: 'Angebot anfragen',
    intro: 'Füllen Sie die Angaben aus. Die Anfrage für Ihr Bücherregal wird anschließend an die Fertigung gesendet.',
    name: 'Name',
    nameTip: 'Ihr vollständiger Name, damit die Fertigung Ihre Anfrage zuordnen und beantworten kann.',
    company: 'Firmenname',
    companyTip: 'Optional. Unternehmen oder Organisation, der die Anfrage zugeordnet werden soll.',
    phone: 'Telefonnummer',
    phoneTip: 'Eine Telefonnummer, unter der die Fertigung Sie zur Anfrage erreichen kann.',
    email: 'E-Mail',
    emailTip: 'Die Bestätigung und weitere Korrespondenz werden an diese Adresse gesendet.',
    address: 'Lieferadresse',
    addressTip: 'Die Adresse, an die die konfigurierten Bücherregale geliefert werden sollen.',
    quantity: 'Anzahl Bücherregale',
    quantityTip: 'Wie viele Exemplare dieser vollständigen Konfiguration gewünscht sind. Standardwert ist 1.',
    optional: 'optional',
    send: 'Anfrage senden',
    sending: 'Wird gesendet…',
    close: 'Anfrageformular schließen',
    required: 'Bitte füllen Sie alle Pflichtfelder aus.',
    invalidEmail: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
    invalidPhone: 'Bitte geben Sie eine gültige Telefonnummer ein.',
    invalidQuantity: 'Bitte geben Sie eine gültige Anzahl Bücherregale ein.',
    invalidAddress: 'Bitte geben Sie eine gültige Lieferadresse ein.',
    success: 'Anfrage gesendet',
    failure: 'Die Anfrage konnte nicht gesendet werden. Bitte versuchen Sie es erneut.',
    shareFailure: 'Der Konfigurationslink konnte nicht erstellt werden. Bitte versuchen Sie es erneut.',
    cooldown: (seconds) => `Bitte warten Sie noch ${seconds} Sekunde${seconds === 1 ? '' : 'n'}, bevor Sie eine neue Anfrage senden.`,
  }),
});

function quotationText() {
  return BOOKSHELF_QUOTATION_COPY[shell.state.locale] || BOOKSHELF_QUOTATION_COPY['en-US'];
}

function quotationField({ id, label, tip, type = 'text', optional = false, textarea = false, extra = '' }) {
  const input = textarea
    ? `<textarea id="${id}" name="${id}" rows="3" ${optional ? '' : 'required'} ${extra}></textarea>`
    : `<input id="${id}" name="${id}" type="${type}" ${optional ? '' : 'required'} ${extra} />`;
  const text = quotationText();
  return `
    <label class="bookshelf-quote-field" for="${id}">
      <span class="bookshelf-quote-label">
        <span>${label}${optional ? ` <small>(${text.optional})</small>` : ''}</span>
        <span class="bookshelf-field-help" tabindex="0" aria-label="${tip.replaceAll('\"', '&quot;')}">?
          <span class="bookshelf-field-tooltip" role="tooltip">${tip}</span>
        </span>
      </span>
      ${input}
    </label>`;
}

function quotationDraft(form) {
  const data = new FormData(form);
  return {
    name: String(data.get('bookshelfQuoteName') || ''),
    company: String(data.get('bookshelfQuoteCompany') || ''),
    phone: String(data.get('bookshelfQuotePhone') || ''),
    email: String(data.get('bookshelfQuoteEmail') || ''),
    shippingAddress: String(data.get('bookshelfQuoteAddress') || ''),
    quantity: String(data.get('bookshelfQuoteQuantity') || '1'),
  };
}

function saveQuotationDraft(form) {
  try {
    window.localStorage.setItem(QUOTATION_DRAFT_STORAGE_KEY, JSON.stringify(quotationDraft(form)));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function loadQuotationDraft() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(QUOTATION_DRAFT_STORAGE_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function applyQuotationDraft(form) {
  const draft = loadQuotationDraft();
  if (!draft || !(form instanceof HTMLFormElement)) return;
  const values = {
    bookshelfQuoteName: draft.name,
    bookshelfQuoteCompany: draft.company,
    bookshelfQuotePhone: draft.phone,
    bookshelfQuoteEmail: draft.email,
    bookshelfQuoteAddress: draft.shippingAddress,
    bookshelfQuoteQuantity: draft.quantity,
  };
  Object.entries(values).forEach(([id, value]) => {
    const field = form.elements.namedItem(id);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    if (value == null || value === '') {
      if (id !== 'bookshelfQuoteQuantity') field.value = '';
      return;
    }
    field.value = String(value);
  });
}

function quotationCooldownRemainingMs() {
  return Math.max(0, quotationCooldownUntilMs - Date.now());
}

function setQuotationCooldown(durationMs) {
  quotationCooldownUntilMs = Date.now() + Math.max(0, Number(durationMs) || 0);
  syncQuotationSubmitCooldown();
}

function syncQuotationSubmitCooldown(root = document) {
  window.clearTimeout(quotationCooldownTimer);
  const button = root.querySelector?.('[data-bookshelf-quotation-submit]');
  if (!(button instanceof HTMLButtonElement)) return;
  const remainingMs = quotationCooldownRemainingMs();
  const text = quotationText();
  if (remainingMs <= 0) {
    button.disabled = false;
    button.removeAttribute('aria-disabled');
    button.textContent = text.send;
    return;
  }
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  button.textContent = `${text.send} (${seconds}s)`;
  quotationCooldownTimer = window.setTimeout(() => syncQuotationSubmitCooldown(root), Math.min(1000, remainingMs + 20));
}

function renderQuotationDialog() {
  document.querySelector('[data-bookshelf-quotation-overlay]')?.remove();
  const text = quotationText();
  const overlay = document.createElement('div');
  overlay.className = 'bookshelf-quotation-overlay';
  overlay.dataset.bookshelfQuotationOverlay = '';
  overlay.innerHTML = `
    <section class="bookshelf-quotation-dialog" role="dialog" aria-modal="true" aria-labelledby="bookshelfQuotationTitle">
      <header class="bookshelf-quotation-heading">
        <div>
          <h2 id="bookshelfQuotationTitle">${text.title}</h2>
          <p>${text.intro}</p>
        </div>
        <button class="bookshelf-quotation-close" type="button" data-bookshelf-quotation-close aria-label="${text.close}">×</button>
      </header>
      <form class="bookshelf-quotation-form" data-bookshelf-quotation-form novalidate>
        ${quotationField({ id: 'bookshelfQuoteName', label: text.name, tip: text.nameTip, extra: 'autocomplete="name" maxlength="120"' })}
        ${quotationField({ id: 'bookshelfQuoteCompany', label: text.company, tip: text.companyTip, optional: true, extra: 'autocomplete="organization" maxlength="160"' })}
        ${quotationField({ id: 'bookshelfQuotePhone', label: text.phone, tip: text.phoneTip, type: 'tel', extra: 'autocomplete="tel" maxlength="60" inputmode="tel"' })}
        ${quotationField({ id: 'bookshelfQuoteEmail', label: text.email, tip: text.emailTip, type: 'email', extra: 'autocomplete="email" maxlength="320"' })}
        ${quotationField({ id: 'bookshelfQuoteAddress', label: text.address, tip: text.addressTip, textarea: true, extra: 'autocomplete="street-address" maxlength="1000"' })}
        ${quotationField({ id: 'bookshelfQuoteQuantity', label: text.quantity, tip: text.quantityTip, type: 'number', extra: 'min="1" max="100000" step="1" value="1" inputmode="numeric"' })}
        <button class="bookshelf-quotation-submit" type="submit" data-bookshelf-quotation-submit>${text.send}</button>
      </form>
    </section>`;
  document.body.append(overlay);
  const form = overlay.querySelector('[data-bookshelf-quotation-form]');
  applyQuotationDraft(form);
  syncQuotationSubmitCooldown(overlay);
  requestAnimationFrame(() => overlay.classList.add('is-open'));
  overlay.querySelector('#bookshelfQuoteName')?.focus();
  return overlay;
}

function closeQuotationDialog() {
  const overlay = document.querySelector('[data-bookshelf-quotation-overlay]');
  if (!overlay) return;
  overlay.classList.remove('is-open');
  window.setTimeout(() => overlay.remove(), 180);
}

function showBookshelfFeedback(message, type = 'success', durationMs = QUOTATION_FEEDBACK_DURATION_MS) {
  const duration = Math.max(500, Number(durationMs) || QUOTATION_FEEDBACK_DURATION_MS);
  // Use the exact shared notification implementation used by Save, cart and
  // the rest of the common shell. Do not recreate the toast DOM/classes here:
  // that caused the bookshelf quotation popup to differ visually from the
  // project's normal success/error popup.
  if (typeof shell?.showFeedback === 'function') {
    shell.showFeedback(String(message || ''), type === 'error' ? 'error' : 'success', duration);
  }
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(value || '').trim());
}

function validPhone(value) {
  const phone = String(value || '').trim();
  if (!/^\+?[0-9().\s\/-]+$/.test(phone)) return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function quotationPayload(form) {
  const data = new FormData(form);
  return {
    name: String(data.get('bookshelfQuoteName') || '').trim(),
    company: String(data.get('bookshelfQuoteCompany') || '').trim(),
    phone: String(data.get('bookshelfQuotePhone') || '').trim(),
    email: String(data.get('bookshelfQuoteEmail') || '').trim(),
    shippingAddress: String(data.get('bookshelfQuoteAddress') || '').trim(),
    quantity: Number(data.get('bookshelfQuoteQuantity')),
  };
}

function validateQuotationPayload(payload) {
  const text = quotationText();
  if (!payload.name || !payload.phone || !payload.email || !payload.shippingAddress || !Number.isFinite(payload.quantity)) return text.required;
  if (!validEmail(payload.email)) return text.invalidEmail;
  if (!validPhone(payload.phone)) return text.invalidPhone;
  if (!Number.isInteger(payload.quantity) || payload.quantity < 1 || payload.quantity > 100000) return text.invalidQuantity;
  return '';
}

function callableUrl(name) {
  return `https://${BOOKSHELF_FUNCTIONS_REGION}-${BOOKSHELF_PROJECT_ID}.cloudfunctions.net/${name}`;
}

async function callBookshelfQuotation(data) {
  const response = await fetch(callableUrl(BOOKSHELF_QUOTATION_FUNCTION), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Request failed (${response.status}).`);
    error.code = String(payload?.error?.status || `http-${response.status}`).toLowerCase();
    error.details = payload?.error?.details || null;
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function retryAfterSeconds(error) {
  const explicit = Number(error?.details?.retryAfterSeconds);
  if (Number.isFinite(explicit) && explicit > 0) return Math.max(1, Math.ceil(explicit));
  const match = String(error?.message || '').match(/(\d+)\s*second/i);
  return match ? Math.max(1, Number(match[1]) || 1) : 0;
}

async function submitBookshelfQuotation(form) {
  const text = quotationText();
  const payload = quotationPayload(form);
  saveQuotationDraft(form);

  // The requested form behavior is modal-dismiss-on-submit: once the user
  // presses Send request, close the dialog regardless of the eventual result.
  closeQuotationDialog();

  const validationError = validateQuotationPayload(payload);
  if (validationError) {
    setQuotationCooldown(QUOTATION_FAILURE_COOLDOWN_MS);
    showBookshelfFeedback(validationError, 'error');
    return;
  }

  let shareUrl = '';
  try {
    shareUrl = await Promise.resolve(shell.options?.callbacks?.getShareUrl?.() || window.location.href);
    if (!shareUrl) throw new Error('Share URL unavailable.');
  } catch (error) {
    console.error('Bookshelf share link creation failed.', error);
    setQuotationCooldown(QUOTATION_FAILURE_COOLDOWN_MS);
    showBookshelfFeedback(text.shareFailure, 'error');
    return;
  }

  const configuration = window.BOOKSHELF_CONFIGURATOR_API?.captureState?.();
  if (!configuration) {
    setQuotationCooldown(QUOTATION_FAILURE_COOLDOWN_MS);
    showBookshelfFeedback(text.failure, 'error');
    return;
  }

  try {
    await callBookshelfQuotation({ ...payload, locale: shell.state.locale, shareUrl, configuration });
    setQuotationCooldown(QUOTATION_SUCCESS_COOLDOWN_MS);
    showBookshelfFeedback(text.success, 'success');
  } catch (error) {
    console.error('Bookshelf quotation request failed.', error);
    const remaining = retryAfterSeconds(error);
    if (String(error?.code || '').includes('resource-exhausted') && remaining > 0) {
      // A server-side cooldown can survive a page refresh, so preserve that
      // remaining successful-send cooldown instead of allowing futile retries.
      setQuotationCooldown(Math.max(QUOTATION_FAILURE_COOLDOWN_MS, remaining * 1000));
      showBookshelfFeedback(text.cooldown(remaining), 'error');
    } else if (String(error?.code || '').includes('invalid-argument') && error?.message) {
      setQuotationCooldown(QUOTATION_FAILURE_COOLDOWN_MS);
      showBookshelfFeedback(error.message, 'error');
    } else {
      setQuotationCooldown(QUOTATION_FAILURE_COOLDOWN_MS);
      showBookshelfFeedback(text.failure, 'error');
    }
  }
}

// Keep this workflow local to the bookshelf configurator. Capture the footer
// action before the shared add-to-cart handler so no cart item is created.
document.addEventListener('click', (event) => {
  const quoteButton = event.target.closest?.('[data-shared-panel-add-to-cart]');
  if (quoteButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    renderQuotationDialog();
    return;
  }
  if (event.target.closest?.('[data-bookshelf-quotation-close]')) {
    event.preventDefault();
    closeQuotationDialog();
    return;
  }
  const overlay = event.target.closest?.('[data-bookshelf-quotation-overlay]');
  if (overlay && event.target === overlay) closeQuotationDialog();
}, true);

document.addEventListener('input', (event) => {
  const form = event.target.closest?.('[data-bookshelf-quotation-form]');
  if (form instanceof HTMLFormElement) saveQuotationDraft(form);
}, true);

document.addEventListener('submit', (event) => {
  const form = event.target.closest?.('[data-bookshelf-quotation-form]');
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  void submitBookshelfQuotation(form);
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !document.querySelector('[data-bookshelf-quotation-overlay]')) return;
  event.preventDefault();
  closeQuotationDialog();
});

const sidebar = document.querySelector('.sidebar');
const appShell = document.querySelector('.app-shell');

function syncSidebarAccessibility(collapsed = shell?.settingsPanelCollapsed) {
  if (!sidebar) return;
  const hidden = Boolean(collapsed);
  sidebar.inert = hidden;
  sidebar.setAttribute('aria-hidden', String(hidden));
}
function syncMobileLayout() {
  document.body.classList.toggle('bookshelf-mobile-layout', mobileLayoutQuery.matches);
  shell?.setSettingsPanelCollapsed?.(mobileLayoutQuery.matches);
  syncSidebarAccessibility(shell?.settingsPanelCollapsed);
}

syncSidebarAccessibility(shell?.settingsPanelCollapsed);
document.body.classList.toggle('bookshelf-mobile-layout', mobileLayoutQuery.matches);
mobileLayoutQuery.addEventListener?.('change', syncMobileLayout);

appShell?.addEventListener('pointerdown', (event) => {
  if (!mobileLayoutQuery.matches || shell?.settingsPanelCollapsed) return;
  if (event.target.closest('.sidebar, #bookshelfSidebarToggle')) return;
  shell.setSettingsPanelCollapsed(true);
}, true);

let settingsWasOpenBeforePointer = false;
shell.host?.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('[data-action="toggle-account-settings"]')) return;
  settingsWasOpenBeforePointer = Boolean(shell.host.querySelector('[data-account-settings]')?.classList.contains('is-open'));
}, true);

shell.host?.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'toggle-account-settings') {
    // The shared shell normally handles this itself. If the account menu was
    // re-rendered during the same click and the visible state did not change,
    // recover locally instead of leaving the Settings button inert.
    queueMicrotask(() => {
      const settings = shell.host.querySelector('[data-account-settings]');
      const nowOpen = Boolean(settings?.classList.contains('is-open'));
      if (nowOpen === settingsWasOpenBeforePointer) {
        shell.accountSettingsOpen = !settingsWasOpenBeforePointer;
        shell.renderHost?.();
        shell.sync?.();
      }
    });
    return;
  }
  if (action === 'toggle-dimensions') {
    const active = window.BOOKSHELF_CONFIGURATOR_API?.toggleDimensions?.();
    shell.setToolActive?.('dimensions', Boolean(active));
  } else if (action === 'cycle-camera') {
    window.BOOKSHELF_CONFIGURATOR_API?.cycleCamera?.();
  } else {
    return;
  }
  if (mobileLayoutQuery.matches && shell?.toolsOpen) {
    shell.toolsOpen = false;
    shell.syncTools();
  }
});

window.BOOKSHELF_CONFIGURATOR_SHARED_SHELL = shell;
window.BOOKSHELF_CONFIGURATOR_UNDO_HISTORY = history;
window.BOOKSHELF_CONFIGURATOR_API?.setDarkMode?.(Boolean(shell.state.darkMode));
window.BOOKSHELF_CONFIGURATOR_API?.setLocale?.(shell.state.locale);
window.BOOKSHELF_CONFIGURATOR_API?.setUnits?.(shell.state.units);
window.BOOKSHELF_CONFIGURATOR_API?.setCurrency?.(shell.state.currency);
