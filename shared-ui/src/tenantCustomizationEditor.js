import { validateCustomization } from './tenantCustomization.js?v=foundation-1';
import { primaryTextColor } from './tenantShellCustomization.js?v=shared-ui-1';

const COLORS = { primary: 'Accent', surface: 'Panel background', text: 'Text', muted: 'Secondary text', border: 'Border' };
const FEATURES = { cart: 'Shared cart actions', quotation: 'Shared quotation button', price: 'Shared footer price', save: 'Save', share: 'Share', viewAR: 'Augmented reality' };
const option = (value, text) => `<option value="${value}">${text}</option>`;

export function mountTenantCustomizationEditor(root, { call, products }) {
  if (!root) return { setTenant() {} };
  root.innerHTML = `
    <h3>Configurator appearance</h3>
    <p>Shared UI settings. Product-specific controls and mobile layouts retain their current behavior.</p>
    <p data-custom-plan></p>
    <fieldset data-custom-fields disabled>
      <label>Apply to <select data-custom-scope><option value="">All enabled configurators</option></select></label>
      <div class="tenant-custom-grid">
        ${Object.entries(COLORS).map(([key, label]) => `<label>${label}<input data-custom-color="${key}" placeholder="Inherit (e.g. #166534)" maxlength="7" spellcheck="false"></label>`).join('')}
        <label>Corner style<select data-custom-radius>${option('', 'Inherit')}${['none','small','medium','large'].map(x => option(x,x)).join('')}</select></label>
        <label>Desktop toolbar<select data-custom-tools>${option('', 'Keep existing position')}${['top-left','top-right','bottom-left','bottom-right'].map(x => option(x,x.replace('-', ' '))).join('')}</select></label>
        <label>Desktop floating panel<select data-custom-panel>${option('', 'Keep existing position')}${option('left','Left')}${option('right','Right')}</select></label>
        ${Object.entries(FEATURES).map(([key,label]) => `<label>${label}<select data-custom-feature="${key}">${option('','Inherit')}${option('true','Show / allow')}${option('false','Hide / disable')}</select></label>`).join('')}
      </div>
      <p class="tenant-custom-note">Panel side applies to shared floating panels (including Pergola). Desktop toolbar positions apply where the shared toolbar is present. Bookshelf keeps its product-specific quotation flow. Price visibility here affects the shared footer, not product-specific estimates.</p>
      <div class="actions">
        <button type="button" class="button button--secondary" data-custom-clear>Clear overrides for this scope</button>
        <button type="button" class="button button--secondary" data-custom-action="save">Save draft</button>
        <button type="button" class="button button--secondary" data-custom-action="preview">Preview saved draft</button>
        <button type="button" class="button button--primary" data-custom-action="publish">Publish saved draft</button>
      </div>
      <div class="tenant-custom-restore">
        <label>Restore revision<input data-custom-revision type="number" min="1" step="1" placeholder="Revision number"></label>
        <button type="button" class="button button--secondary" data-custom-action="rollback">Restore as new publication</button>
      </div>
    </fieldset>
    <button type="button" class="button button--secondary" data-custom-action="reload">Reload saved settings</button>
    <p data-custom-status role="status" aria-live="polite"></p>
    <section class="tenant-custom-preview" data-custom-preview hidden>
      <h4>Shared panel style preview</h4>
      <p>This sample previews colors and shared footer actions. Open the tenant configurator after publishing to verify its full layout.</p>
      <div class="tenant-custom-sample"><strong>Configuration</strong><p>Dimensions and product options</p><hr><div data-sample-price>Estimated total <strong>1,250 EUR</strong></div><div class="tenant-custom-sample-actions"><button type="button" disabled data-sample-cart>Add to cart</button><button type="button" disabled data-sample-quote>Ask for quotation</button></div></div>
    </section>`;

  const find = selector => root.querySelector(selector);
  const fields = find('[data-custom-fields]');
  const scope = find('[data-custom-scope]');
  const status = find('[data-custom-status]');
  let tenant = null;
  let loaded = null;
  let settings = { schemaVersion: 1 };
  let currentScope = '';
  let generation = 0;
  let busy = false;
  let dirty = false;
  const message = text => { status.textContent = text; };
  function permissions() {
    fields.disabled = busy || !loaded?.capabilities?.customization || tenant?.status !== 'active';
    find('[data-custom-action="reload"]').disabled = busy || !tenant;
    for (const action of ['preview','publish']) find(`[data-custom-action="${action}"]`).disabled = dirty || !loaded?.draft;
  }
  function layer() {
    if (!currentScope) return settings;
    settings.products ||= {};
    return settings.products[currentScope] ||= {};
  }
  function collect() {
    const current = layer();
    const theme = { ...current.theme };
    for (const input of root.querySelectorAll('[data-custom-color]')) {
      const value = input.value.trim();
      if (value) theme[input.dataset.customColor] = value;
      else delete theme[input.dataset.customColor];
    }
    if (find('[data-custom-radius]').value) theme.radius = find('[data-custom-radius]').value;
    else delete theme.radius;
    current.theme = theme;
    const desktop = { ...current.layout?.desktop };
    for (const [key, selector] of [['toolbarPosition','[data-custom-tools]'],['panelSide','[data-custom-panel]']]) {
      const value = find(selector).value;
      if (value) desktop[key] = value; else delete desktop[key];
    }
    current.layout = { ...current.layout, desktop };
    current.features = { ...current.features };
    for (const select of root.querySelectorAll('[data-custom-feature]')) {
      if (select.value === '') delete current.features[select.dataset.customFeature];
      else current.features[select.dataset.customFeature] = select.value === 'true';
    }
    if (Object.keys(current.layout.desktop).length === 0) delete current.layout.desktop;
    for (const category of ['theme', 'layout', 'features']) {
      if (Object.keys(current[category]).length === 0) delete current[category];
    }
    if (currentScope && Object.keys(current).length === 0) delete settings.products[currentScope];
    return validateCustomization(settings);
  }
  function renderLayer() {
    const current = currentScope ? settings.products?.[currentScope] || {} : settings;
    for (const input of root.querySelectorAll('[data-custom-color]')) input.value = current.theme?.[input.dataset.customColor] || '';
    find('[data-custom-radius]').value = current.theme?.radius || '';
    find('[data-custom-tools]').value = current.layout?.desktop?.toolbarPosition || '';
    find('[data-custom-panel]').value = current.layout?.desktop?.panelSide || '';
    for (const select of root.querySelectorAll('[data-custom-feature]')) {
      const value = current.features?.[select.dataset.customFeature];
      select.value = typeof value === 'boolean' ? String(value) : '';
    }
  }
  async function reload() {
    if (!tenant) return;
    const ticket = ++generation;
    const slug = tenant.slug;
    busy = true; permissions(); message('Loading customization…');
    try {
      const result = await call('getTenantCustomization', { tenantSlug: slug });
      if (ticket !== generation) return;
      loaded = result;
      settings = structuredClone(result.draft || result.published.settings);
      dirty = false;
      currentScope = '';
      scope.replaceChildren(new Option('All enabled configurators', ''));
      const ids = new Set([
        ...Object.keys(tenant.configurators || {}).filter(id => tenant.configurators[id]),
        ...Object.keys(settings.products || {}),
      ]);
      for (const id of ids) {
        const suffix = tenant.configurators?.[id] ? '' : ' (disabled — clear overrides before publishing)';
        scope.append(new Option((products[id]?.label || id) + suffix, id));
      }
      renderLayer();
      message(`Published revision ${result.revision} · Draft version ${result.draftVersion}${result.published.enabled ? '' : ' · Customization inactive'}`);
    } catch (error) {
      if (ticket === generation) { loaded = null; message(error.message); }
    } finally { if (ticket === generation) { busy = false; permissions(); } }
  }
  function preview(result) {
    const common = result.settings;
    const product = currentScope ? common.products?.[currentScope] || {} : {};
    const theme = { ...common.theme, ...product.theme };
    const features = { ...common.features, ...product.features };
    const sample = find('.tenant-custom-sample');
    sample.style.background = theme.surface || '#FFFFFF';
    sample.style.color = theme.text || '#172027';
    sample.style.borderColor = theme.border || '#DBE3E7';
    sample.style.borderRadius = { none:'0px',small:'6px',medium:'12px',large:'18px' }[theme.radius] || '12px';
    for (const button of sample.querySelectorAll('button')) {
      button.style.background = theme.primary || '#0878C9';
      button.style.color = primaryTextColor(theme.primary || '#0878C9');
    }
    find('[data-sample-price]').hidden = features.price === false;
    find('[data-sample-cart]').hidden = features.cart === false || features.save === false || currentScope === 'bookshelf';
    find('[data-sample-quote]').hidden = features.quotation === false || currentScope === 'bookshelf';
    find('[data-custom-preview]').hidden = false;
  }
  find('[data-custom-clear]').addEventListener('click', () => {
    if (currentScope) delete settings.products?.[currentScope];
    else settings = { schemaVersion: 1, ...(settings.products ? { products: settings.products } : {}) };
    dirty = true;
    renderLayer(); permissions();
    find('[data-custom-preview]').hidden = true;
    message('Overrides cleared in this editor. Save and publish to apply the change.');
  });
  scope.addEventListener('change', () => {
    try { collect(); currentScope = scope.value; renderLayer(); }
    catch (error) { scope.value = currentScope; message(error.message); }
  });
  fields.addEventListener('input', event => {
    if (event.target === scope || event.target.matches('[data-custom-revision]')) return;
    dirty = true; permissions();
    find('[data-custom-preview]').hidden = true;
    message('Unsaved changes. Save the draft before previewing or publishing.');
  });
  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-custom-action]');
    if (!button || button.disabled || busy || !tenant) return;
    const action = button.dataset.customAction;
    if (action === 'reload') { await reload(); return; }
    const slug = tenant.slug;
    const ticket = generation;
    try {
      const data = { tenantSlug: slug, expectedRevision: loaded.revision, expectedDraftVersion: loaded.draftVersion };
      if (action === 'save') data.settings = collect();
      if (action === 'rollback') {
        data.revision = Number(find('[data-custom-revision]').value);
        if (!Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error('Enter a published revision number.');
      }
      busy = true; permissions(); message('Working…');
      const names = { save:'saveTenantCustomizationDraft',preview:'previewTenantCustomization',publish:'publishTenantCustomization',rollback:'rollbackTenantCustomization' };
      const result = await call(names[action], data);
      if (ticket !== generation) return;
      if (action === 'preview') { preview(result); message(`Previewing saved draft ${result.draftVersion}.`); }
      else { await reload(); message(action === 'save' ? 'Draft saved. The live site is unchanged.' : `Published revision ${result.revision}. Reload the tenant configurator to see it.`); }
    } catch (error) {
      if (ticket === generation) message(`${error.message} Changes have not been published. Reload if another editor changed the settings.`);
    } finally { if (ticket === generation || tenant?.slug === slug) { busy = false; permissions(); } }
  });
  return {
    setTenant(next) {
      const same = tenant?.slug === next?.slug && tenant?.planId === next?.planId
        && tenant?.status === next?.status
        && JSON.stringify(tenant?.configurators) === JSON.stringify(next?.configurators);
      tenant = next;
      if (!next) { ++generation; loaded = null; busy = false; root.hidden = true; return; }
      root.hidden = false;
      if (same) return;
      loaded = null;
      find('[data-custom-preview]').hidden = true;
      scope.replaceChildren(new Option('All enabled configurators',''));
      for (const [id, enabled] of Object.entries(next.configurators || {})) {
        if (enabled) scope.append(new Option(products[id]?.label || id, id));
      }
      find('[data-custom-plan]').textContent = next.capabilities?.customization
        ? 'Custom plan: appearance can be published when this tenant is active.'
        : 'This plan does not include customization. Stored drafts remain available after an upgrade.';
      void reload();
    },
  };
}
