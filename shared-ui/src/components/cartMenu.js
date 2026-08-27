import { sharedT } from '../i18n.js?v=22';
import { sharedIcon } from '../icons.js?v=19';
import { escapeHtml } from '../utils.js';

function renderCartItem(locale, item) {
  const key = escapeHtml(String(item?.key || ''));
  const name = escapeHtml(String(item?.name || sharedT(locale, 'cart.unnamed')));
  const cost = escapeHtml(String(item?.costText || '—'));
  const removeLabel = escapeHtml(sharedT(locale, 'cart.remove'));
  return `
    <article class="cart-menu__item" data-cart-item data-cart-key="${key}">
      <div class="cart-menu__item-copy">
        <strong>${name}</strong>
        <span>${cost}</span>
      </div>
      <button class="cart-menu__remove" type="button" data-action="cart-remove" data-cart-key="${key}" aria-label="${removeLabel}" data-tooltip="${removeLabel}">
        <span class="cart-menu__trash-icon">${sharedIcon('trash')}</span>
      </button>
    </article>
  `;
}

export function renderCartMenu(locale, items = [], { open = false, busy = false, totalText = '' } = {}) {
  const normalized = Array.isArray(items) ? items : [];
  const emptyLabel = escapeHtml(sharedT(locale, 'cart.emptyCart'));
  return `
    <section class="cart-menu ${open ? 'is-open' : ''}" data-cart-menu aria-label="${escapeHtml(sharedT(locale, 'cart.title'))}">
      <div class="cart-menu__header">
        <strong>${escapeHtml(sharedT(locale, 'cart.title'))}</strong>
        <div class="cart-menu__header-actions">
          <button class="cart-menu__empty-button" type="button" data-action="cart-empty" ${busy || normalized.length === 0 ? 'disabled' : ''}>${emptyLabel}</button>
          <span class="cart-menu__count">${normalized.length}</span>
        </div>
      </div>
      <div class="cart-menu__items" data-cart-items>
        ${normalized.length
          ? normalized.map((item) => renderCartItem(locale, item)).join('')
          : `<p class="cart-menu__empty">${escapeHtml(sharedT(locale, 'cart.empty'))}</p>`}
      </div>
      <div class="cart-menu__total">
        <span>${escapeHtml(sharedT(locale, 'cart.total'))}</span>
        <strong>${escapeHtml(String(totalText || '—'))}</strong>
      </div>
    </section>
  `;
}
