export function renderConfiguratorPanelFooter(root, {
  estimatedTotalLabel = 'Estimated total',
  priceText = '—',
  addToCartLabel = 'Add to cart',
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

  label.textContent = String(estimatedTotalLabel || 'Estimated total');
  price.textContent = String(priceText || '—');
  button.textContent = String(addToCartLabel || 'Add to cart');
  button.setAttribute('aria-label', String(addToCartLabel || 'Add to cart'));
}
