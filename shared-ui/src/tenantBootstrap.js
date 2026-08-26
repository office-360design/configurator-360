const FIREBASE_PROJECT_ID = 'configurator-360';
const FIREBASE_DATABASE_ID = '(default)';
const FIREBASE_API_KEY = 'AIzaSyBgS4VLxQYZnqW-YZJPKvuuocf5w_0kRwY';
const TENANT_COLLECTION = 'tenantPublic';
const TENANT_SUFFIX = '.360configurator.com';
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const GLOBAL_CONTEXT_PROMISE_KEY = '__CFG360_TENANT_CONTEXT_PROMISE__';
const GLOBAL_CONTEXT_KEY = '__CFG360_TENANT_CONTEXT__';

const RESERVED_TENANT_SLUGS = new Set([
  'www',
  'aks',
  'admin',
  'api',
  'app',
  'assets',
  'auth',
  'billing',
  'cdn',
  'demo',
  'dev',
  'ftp',
  'mail',
  'staging',
  'static',
  'status',
  'support',
  'test',
]);

export const TENANT_CONFIGURATORS = Object.freeze({
  window: Object.freeze({ id: 'window', label: 'Window Configurator', path: '/window-configurator/' }),
  pergola: Object.freeze({ id: 'pergola', label: 'Pergola Configurator', path: '/pergola-configurator/' }),
  roof: Object.freeze({ id: 'roof', label: 'Roof Configurator', path: '/roof-configurator/' }),
  solar: Object.freeze({ id: 'solar', label: 'Solar Configurator', path: '/solar-configurator/' }),
  hall: Object.freeze({ id: 'hall', label: 'Hall Configurator', path: '/hall-configurator/' }),
  fence: Object.freeze({ id: 'fence', label: 'Fence Configurator', path: '/fence-configurator/' }),
});

function normalizeHostname(hostname = '') {
  return String(hostname).trim().toLowerCase().replace(/\.$/, '');
}

export function getTenantSlugForHostname(hostname = '') {
  const normalized = normalizeHostname(hostname);
  if (!normalized.endsWith(TENANT_SUFFIX)) return '';

  const slug = normalized.slice(0, -TENANT_SUFFIX.length);
  if (!slug || slug.includes('.') || !TENANT_SLUG_PATTERN.test(slug)) return '';
  if (RESERVED_TENANT_SLUGS.has(slug)) return '';
  return slug;
}

export function isTenantHostname(hostname = '') {
  return Boolean(getTenantSlugForHostname(hostname));
}

function firestoreDocumentUrl(slug) {
  const database = encodeURIComponent(FIREBASE_DATABASE_ID);
  const documentPath = `${TENANT_COLLECTION}/${encodeURIComponent(slug)}`;
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/${database}/documents/${documentPath}`,
  );
  url.searchParams.set('key', FIREBASE_API_KEY);
  return url.toString();
}

function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return String(value.stringValue ?? '');
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return String(value.timestampValue ?? '');
  if ('arrayValue' in value) {
    return Array.isArray(value.arrayValue?.values)
      ? value.arrayValue.values.map(decodeFirestoreValue)
      : [];
  }
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue?.fields || {});
  return null;
}

function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]),
  );
}

function safeLogoUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Provisioned Tier-1 logos are small optimized raster data URLs. SVG/data
  // HTML is deliberately unsupported so tenant branding cannot execute script.
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    return raw;
  }

  try {
    const url = new URL(raw, globalThis.location?.origin || 'https://www.360configurator.com');
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeConfigurators(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(
    Object.keys(TENANT_CONFIGURATORS).map((id) => [id, source[id] === true]),
  );
}

function normalizeTenantRecord(slug, data = {}) {
  return Object.freeze({
    isTenant: true,
    exists: true,
    slug,
    companyName: String(data.companyName || slug).trim() || slug,
    status: String(data.status || '').trim().toLowerCase(),
    logoUrl: safeLogoUrl(data.logoUrl),
    configurators: Object.freeze(normalizeConfigurators(data.configurators)),
  });
}

async function fetchTenantRecord(slug) {
  let response;
  try {
    response = await fetch(firestoreDocumentUrl(slug), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    return Object.freeze({
      isTenant: true,
      exists: false,
      slug,
      error: 'network',
      cause: error,
    });
  }

  if (response.status === 404) {
    return Object.freeze({ isTenant: true, exists: false, slug, error: 'not-found' });
  }

  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }

  if (!response.ok) {
    return Object.freeze({
      isTenant: true,
      exists: false,
      slug,
      error: 'unavailable',
      statusCode: response.status,
      message: String(payload?.error?.message || ''),
    });
  }

  return normalizeTenantRecord(slug, decodeFirestoreFields(payload?.fields || {}));
}

export async function resolveTenantContext({ hostname } = {}) {
  const targetHostname = hostname ?? globalThis.location?.hostname ?? '';
  const slug = getTenantSlugForHostname(targetHostname);
  if (!slug) return Object.freeze({ isTenant: false, exists: false, slug: '' });

  if (hostname !== undefined) return fetchTenantRecord(slug);

  if (!globalThis[GLOBAL_CONTEXT_PROMISE_KEY]) {
    globalThis[GLOBAL_CONTEXT_PROMISE_KEY] = fetchTenantRecord(slug).then((context) => {
      globalThis[GLOBAL_CONTEXT_KEY] = context;
      globalThis.CONFIGURATOR_TENANT = context?.isTenant && context?.exists ? context : null;
      return context;
    });
  }
  return globalThis[GLOBAL_CONTEXT_PROMISE_KEY];
}

export function currentTenantContext() {
  return globalThis[GLOBAL_CONTEXT_KEY] || null;
}

function accessMessage(context, productId) {
  if (context?.error === 'not-found') {
    return {
      title: 'Configurator site not found',
      body: 'This 360Configurator customer site does not exist or is no longer available.',
      showHome: false,
    };
  }

  if (context?.error) {
    return {
      title: 'Configurator temporarily unavailable',
      body: 'The customer configuration could not be loaded. Please try again later.',
      showHome: false,
    };
  }

  if (context?.status !== 'active') {
    return {
      title: 'Configurator site unavailable',
      body: `${context?.companyName || 'This customer'} is not currently active on 360Configurator.`,
      showHome: false,
    };
  }

  const product = TENANT_CONFIGURATORS[productId];
  return {
    title: 'Configurator not enabled',
    body: `${product?.label || 'This configurator'} is not enabled for ${context?.companyName || 'this customer'}.`,
    showHome: true,
  };
}

export function renderTenantAccessState(context, { productId = '' } = {}) {
  if (typeof document === 'undefined') return;

  const message = accessMessage(context, productId);
  const companyName = context?.companyName || '360Configurator';
  document.title = `${message.title} | ${companyName}`;
  document.documentElement.dataset.tenantAccessBlocked = 'true';
  document.body?.classList.add('tenant-access-blocked');

  const host = document.createElement('div');
  host.id = 'cfg360TenantAccessState';
  host.innerHTML = `
    <main class="cfg360-tenant-state" role="main">
      <div class="cfg360-tenant-state__card">
        <div class="cfg360-tenant-state__mark">360</div>
        <h1>${escapeHtml(message.title)}</h1>
        <p>${escapeHtml(message.body)}</p>
        ${message.showHome ? '<a href="/">Back to customer configurators</a>' : ''}
      </div>
    </main>
  `;

  const style = document.createElement('style');
  style.textContent = `
    html[data-tenant-access-blocked="true"], html[data-tenant-access-blocked="true"] body { min-height: 100%; margin: 0; }
    html[data-tenant-access-blocked="true"] body > * { display: none !important; }
    html[data-tenant-access-blocked="true"] body > #cfg360TenantAccessState { display: block !important; }
    .cfg360-tenant-state { min-height: 100vh; display: grid; place-items: center; padding: 32px; box-sizing: border-box; background: #f4f5f7; color: #15171a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .cfg360-tenant-state__card { width: min(520px, 100%); padding: 42px; box-sizing: border-box; border-radius: 20px; background: #fff; box-shadow: 0 20px 60px rgba(16, 24, 40, .12); text-align: center; }
    .cfg360-tenant-state__mark { width: 54px; height: 54px; margin: 0 auto 22px; display: grid; place-items: center; border-radius: 14px; background: #111827; color: #fff; font-weight: 800; letter-spacing: -.04em; }
    .cfg360-tenant-state h1 { margin: 0 0 12px; font-size: clamp(28px, 5vw, 38px); line-height: 1.08; }
    .cfg360-tenant-state p { margin: 0; color: #5b6472; font-size: 16px; line-height: 1.6; }
    .cfg360-tenant-state a { display: inline-flex; margin-top: 24px; padding: 11px 18px; border-radius: 10px; background: #111827; color: #fff; text-decoration: none; font-weight: 650; }
  `;

  document.head?.append(style);
  if (document.body) document.body.append(host);
  else document.addEventListener('DOMContentLoaded', () => document.body.append(host), { once: true });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function blockModuleForever() {
  return new Promise(() => {});
}

export async function requireTenantConfiguratorAccess(productId) {
  const normalizedProduct = String(productId || '').trim().toLowerCase();
  const context = await resolveTenantContext();
  if (!context.isTenant) return null;

  const allowed = context.exists
    && context.status === 'active'
    && TENANT_CONFIGURATORS[normalizedProduct]
    && context.configurators?.[normalizedProduct] === true;

  if (allowed) return context;

  renderTenantAccessState(context, { productId: normalizedProduct });
  return blockModuleForever();
}
