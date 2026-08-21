import { sharedT } from '../i18n.js';
import { sharedIcon } from '../icons.js';
import { escapeHtml } from '../utils.js';

function formatSavedDate(locale, value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function renderTrashIcon() {
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true" class="trash-hover-icon">
      <g class="trash-hover-icon__lid">
        <path d="M8.6 6.7V5.5a1.5 1.5 0 0 1 1.5-1.5h3.8a1.5 1.5 0 0 1 1.5 1.5v1.2" />
        <path d="M5.8 7.2h12.4" />
      </g>
      <path d="M7.4 8.3 8.2 19a1.8 1.8 0 0 0 1.8 1.6h4a1.8 1.8 0 0 0 1.8-1.6l.8-10.7" />
      <path d="M9.7 10.8v7.4" />
      <path d="M12 10.8v7.4" />
      <path d="M14.3 10.8v7.4" />
    </svg>
  `;
}

function itemMarkup(locale, item) {
  const name = escapeHtml(item.name || sharedT(locale, 'saved.unnamed'));
  const date = escapeHtml(formatSavedDate(locale, item.updatedAtMs));
  return `
    <article class="saved-configurations__item" data-saved-item="${escapeHtml(item.id)}">
      <span class="saved-configurations__item-icon">${sharedIcon('folder')}</span>
      <div class="saved-configurations__item-copy">
        <strong>${name}</strong>
        <span>${date}</span>
      </div>
      <div class="saved-configurations__item-actions">
        <button type="button" class="saved-configurations__open" data-action="saved-open" data-saved-id="${escapeHtml(item.id)}">${escapeHtml(sharedT(locale, 'saved.open'))}</button>
        <button type="button" class="saved-configurations__delete" data-action="saved-delete" data-saved-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(sharedT(locale, 'saved.delete'))}" title="${escapeHtml(sharedT(locale, 'saved.delete'))}">${renderTrashIcon()}</button>
      </div>
    </article>
  `;
}

export function renderSavedConfigurationsDialog(locale, state = {}) {
  const open = Boolean(state.open);
  const loading = Boolean(state.loading);
  const error = String(state.error || '');
  const items = Array.isArray(state.items) ? state.items : [];

  let content = '';
  if (loading) {
    content = `<div class="saved-configurations__state">${escapeHtml(sharedT(locale, 'saved.loading'))}</div>`;
  } else if (error) {
    content = `<div class="saved-configurations__state saved-configurations__state--error">${escapeHtml(error)}</div>`;
  } else if (!items.length) {
    content = `<div class="saved-configurations__state">${escapeHtml(sharedT(locale, 'saved.empty'))}</div>`;
  } else {
    content = `<div class="saved-configurations__list">${items.map((item) => itemMarkup(locale, item)).join('')}</div>`;
  }

  return `
    <div class="saved-configurations ${open ? 'is-open' : ''}" data-saved-configurations-dialog aria-hidden="${open ? 'false' : 'true'}">
      <button class="saved-configurations__backdrop" type="button" data-action="saved-close" aria-label="${escapeHtml(sharedT(locale, 'saved.close'))}"></button>
      <section class="saved-configurations__dialog" role="dialog" aria-modal="true" aria-labelledby="saved-configurations-title">
        <div class="saved-configurations__header">
          <div class="saved-configurations__header-copy">
            <h2 id="saved-configurations-title">${escapeHtml(sharedT(locale, 'saved.title'))}</h2>
          </div>
          <button class="saved-configurations__close" type="button" data-action="saved-close" aria-label="${escapeHtml(sharedT(locale, 'saved.close'))}">×</button>
        </div>
        ${content}
      </section>
    </div>
  `;
}
