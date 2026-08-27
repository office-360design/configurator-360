import { sharedT } from '../i18n.js?v=24';
import { sharedIcon } from '../icons.js?v=20';
import { escapeHtml } from '../utils.js';

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

export function renderCartMenu(locale, items = [], { open = false, busy = false, totalText = '' } = {}) {
  const normalized = Array.isArray(items) ? items : [];
  const emptyLabel = escapeHtml(sharedT(locale, 'cart.emptyCart'));
  const quoteLabel = escapeHtml(sharedT(locale, 'cart.quote'));
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
      <div class="cart-menu__footer">
        <div class="cart-menu__total">
          <span>${escapeHtml(sharedT(locale, 'cart.total'))}</span>
          <strong>${escapeHtml(String(totalText || '—'))}</strong>
        </div>
        <button class="cart-menu__quote" type="button" data-action="cart-quote">
          <span class="cart-menu__quote-icon">${sharedIcon('mail')}</span>
          <span>${quoteLabel}</span>
        </button>
      </div>
    </section>
  `;
}
