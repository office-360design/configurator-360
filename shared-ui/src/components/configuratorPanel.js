export function renderConfiguratorPanelFooter(root, {
  estimatedTotalLabel = 'Estimated total',
  priceText = '—',
  addToCartLabel = 'Add to cart',
  addToCartDisabled = false,
  showAddToCart = true,
  quotationLabel = '',
} = {}) {
  if (!root) return;

  let price = root.querySelector('[data-shared-panel-price]');
  let label = root.querySelector('[data-shared-panel-price-label]');
  let button = root.querySelector('[data-shared-panel-add-to-cart]');

  if (!price || !label || !button) {
    root.replaceChildren();

    const priceWrap = document.createElement('div');
    priceWrap.className = 'shared-configurator-panel__price';

    label = document.createElement('small');
    label.dataset.sharedPanelPriceLabel = '';

    price = document.createElement('strong');
    price.dataset.sharedPanelPrice = '';

    priceWrap.append(label, price);

    button = document.createElement('button');
    button.type = 'button';
    button.className = 'shared-configurator-panel__add-button';
    button.dataset.sharedPanelAddToCart = '';

    root.append(priceWrap, button);
  }

  button.hidden = !showAddToCart;
  let quote = root.querySelector('[data-shared-panel-quotation]');
  if (quotationLabel && !quote) {
    quote = document.createElement('button');
    quote.type = 'button';
    quote.className = 'shared-configurator-panel__add-button shared-configurator-panel__quote-button';
    quote.dataset.sharedPanelQuotation = '';
    root.append(quote);
  }
  if (quote) { quote.textContent = quotationLabel; quote.hidden = !quotationLabel; }
  root.classList.toggle('shared-configurator-panel__footer--quotation', Boolean(quotationLabel));
  root.classList.toggle('shared-configurator-panel__footer--quote-only', !showAddToCart);

  label.textContent = String(estimatedTotalLabel || 'Estimated total');
  price.textContent = String(priceText || '—');
  button.textContent = String(addToCartLabel || 'Add to cart');
  button.setAttribute('aria-label', String(addToCartLabel || 'Add to cart'));
  button.disabled = Boolean(addToCartDisabled);
  button.setAttribute('aria-disabled', String(Boolean(addToCartDisabled)));
}
