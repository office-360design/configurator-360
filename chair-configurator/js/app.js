import { applyConfiguratorSeo } from '../../shared-ui/src/configuratorSeo.js?v=platform-19';
import { requireTenantConfiguratorAccess } from '../../shared-ui/src/tenantBootstrap.js?v=platform-19';
import { ChairScene } from './scene.js?v=chair-22';
import { WOOD_TYPES, FABRIC_TYPES, WOOD_COLOURS, FABRIC_COLOURS, materialLabel } from './materials.js?v=chair-22';
import { chairT, formatDimension } from './i18n.js?v=chair-22';
import { mountChairShell } from './sharedShell.js?v=chair-22';

applyConfiguratorSeo('chair');
const tenantContext = await requireTenantConfiguratorAccess('chair');

const defaultState = () => ({
  version: 1,
  woodType: 'wenge', woodColor: '#2c211c',
  fabricType: 'linen', fabricColor: '#b88162',
  locale: 'en-US', currency: 'EUR', units: 'metric', quality: 'balanced', darkMode: false,
});
let state = defaultState();

const viewer = document.querySelector('[data-chair-viewer]');
const sidebar = document.querySelector('.chair-sidebar');
const sidebarBody = sidebar?.querySelector('.chair-sidebar__body');
if (!viewer || !sidebar || !sidebarBody) throw new Error('Chair configurator mount elements are missing.');

const scene = new ChairScene(viewer, { state });

function byId(id) { return document.getElementById(id); }
function normalizeHex(value, fallback) { return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback; }
function itemById(items, id) { return items.find((item) => item.id === id) || items[0]; }

function optionHtml(items, current) {
  return items.map((item) => `<option value="${item.id}" ${item.id === current ? 'selected' : ''}>${materialLabel(item, state.locale)}</option>`).join('');
}
function swatchesHtml(colours, selected, kind) {
  return colours.map((colour) => `<button type="button" class="material-swatch ${colour.toLowerCase() === selected.toLowerCase() ? 'is-selected' : ''}" data-swatch-kind="${kind}" data-colour="${colour}" style="--swatch:${colour}" aria-label="${colour}"></button>`).join('');
}

function renderSidebar() {
  const t = (key) => chairT(state.locale, key);
  sidebarBody.innerHTML = `
      <section class="chair-intro">
        <span class="eyebrow">360Configurator</span>
        <h1>${t('title')}</h1>
        <p>${t('subtitle')}</p>
      </section>
      <section class="material-card">
        <div class="material-card__heading"><span>01</span><h2>${t('wood')}</h2></div>
        <label>${t('woodType')}<select id="woodType">${optionHtml(WOOD_TYPES, state.woodType)}</select></label>
        <label>${t('woodColour')}</label>
        <div class="swatch-grid" data-wood-swatches>${swatchesHtml(WOOD_COLOURS, state.woodColor, 'wood')}</div>
        <label class="colour-input-label">${t('customColour')}<input id="woodColor" type="color" value="${state.woodColor}"></label>
      </section>
      <section class="material-card">
        <div class="material-card__heading"><span>02</span><h2>${t('upholstery')}</h2></div>
        <label>${t('fabricType')}<select id="fabricType">${optionHtml(FABRIC_TYPES, state.fabricType)}</select></label>
        <label>${t('fabricColour')}</label>
        <div class="swatch-grid" data-fabric-swatches>${swatchesHtml(FABRIC_COLOURS, state.fabricColor, 'fabric')}</div>
        <label class="colour-input-label">${t('customColour')}<input id="fabricColor" type="color" value="${state.fabricColor}"></label>
      </section>
      <section class="dimension-card">
        <h2>${t('dimensions')}</h2>
        <dl>
          <div><dt>${t('width')}</dt><dd>${formatDimension(500, state.units, state.locale)}</dd></div>
          <div><dt>${t('depth')}</dt><dd>${formatDimension(470, state.units, state.locale)}</dd></div>
          <div><dt>${t('height')}</dt><dd>${formatDimension(790, state.units, state.locale)}</dd></div>
        </dl>
      </section>
      <p class="chair-note">${t('qualityHint')}</p>
      <p class="chair-note chair-note--license">${t('originalGeometry')}</p>`;
  bindSidebar();
}

function commitChange(partial, { markDirty = true } = {}) {
  state = { ...state, ...partial };
  scene.setState(state);
  renderSidebar();
  if (markDirty) window.CHAIR_CONFIGURATOR_SHARED_SHELL?.markDirty?.();
}

function bindSidebar() {
  byId('woodType')?.addEventListener('change', (event) => {
    const item = itemById(WOOD_TYPES, event.target.value);
    commitChange({ woodType: item.id, woodColor: item.color });
  });
  byId('fabricType')?.addEventListener('change', (event) => {
    const item = itemById(FABRIC_TYPES, event.target.value);
    commitChange({ fabricType: item.id, fabricColor: item.color });
  });
  byId('woodColor')?.addEventListener('input', (event) => commitChange({ woodColor: normalizeHex(event.target.value, state.woodColor) }));
  byId('fabricColor')?.addEventListener('input', (event) => commitChange({ fabricColor: normalizeHex(event.target.value, state.fabricColor) }));
  sidebarBody.querySelectorAll('[data-swatch-kind]').forEach((button) => button.addEventListener('click', () => {
    const kind = button.dataset.swatchKind;
    commitChange(kind === 'wood' ? { woodColor: button.dataset.colour } : { fabricColor: button.dataset.colour });
  }));
}

const api = {
  captureState() { return { woodType: state.woodType, woodColor: state.woodColor, fabricType: state.fabricType, fabricColor: state.fabricColor }; },
  restoreState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const wood = itemById(WOOD_TYPES, snapshot.woodType);
    const fabric = itemById(FABRIC_TYPES, snapshot.fabricType);
    state = { ...state, woodType: wood.id, woodColor: normalizeHex(snapshot.woodColor, wood.color), fabricType: fabric.id, fabricColor: normalizeHex(snapshot.fabricColor, fabric.color) };
    scene.setState(state); renderSidebar(); return true;
  },
  resetConfiguration() { state = { ...state, ...defaultState(), locale: state.locale, currency: state.currency, units: state.units, quality: state.quality, darkMode: state.darkMode }; scene.setState(state); renderSidebar(); },
  setPreference(name, value) {
    if (name === 'locale') { state.locale = value; renderSidebar(); }
    else if (name === 'units') { state.units = value; renderSidebar(); }
    else if (name === 'currency') state.currency = value;
    else if (name === 'quality') { state.quality = value; scene.setQuality(value); }
    else if (name === 'darkMode') { state.darkMode = Boolean(value); scene.setDarkMode(state.darkMode); }
  },
  setSidebarCollapsed(collapsed) { document.body.classList.toggle('chair-sidebar-collapsed', collapsed); },
  cycleCamera() { scene.cycleCamera(); },
  getDiagnostics() { return scene.diagnostics(); },
};
window.CHAIR_CONFIGURATOR_API = api;
renderSidebar();
const shell = mountChairShell(api, tenantContext);
window.CHAIR_CONFIGURATOR_SHARED_SHELL = shell;

// Apply shell-selected/geo-resolved preferences immediately; guest IP defaults may update them again asynchronously.
for (const key of ['locale','currency','units','quality','darkMode']) api.setPreference(key, shell.state[key]);
if (tenantContext?.companyName) document.documentElement.style.setProperty('--tenant-name', JSON.stringify(tenantContext.companyName));
window.addEventListener('beforeunload', () => scene.dispose(), { once: true });
