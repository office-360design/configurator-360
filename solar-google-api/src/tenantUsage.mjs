import { Firestore } from '@google-cloud/firestore';

const firestore = new Firestore();
const TENANTS_COLLECTION = 'tenants';
const TENANT_USAGE_COLLECTION = 'tenantUsage';
const TENANT_SUFFIX = '.360configurator.com';
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED_PLATFORM_SUBDOMAINS = new Set([
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
const DEFAULT_PLATFORM_ORIGINS = Object.freeze([
  'https://360configurator.com',
  'https://www.360configurator.com',
  'https://360configurator.ro',
  'https://www.360configurator.ro',
  'https://360konfigurator.de',
  'https://www.360konfigurator.de',
  'https://aks.360configurator.com',
]);

const SOLAR_LIMIT_KEYS = Object.freeze({
  analyses: 'analysesPerMonth',
  buildingInsights: 'buildingInsightsPerMonth',
  dataLayers: 'dataLayersPerMonth',
  pvgis: 'pvgisPerMonth',
});

export class TenantUsageQuotaError extends Error {
  constructor({ metric, limit, current, requested = 1 }) {
    super(`Tenant monthly Solar usage limit reached for ${metric}.`);
    this.name = 'TenantUsageQuotaError';
    this.status = 429;
    this.metric = metric;
    this.limit = limit;
    this.current = current;
    this.requested = requested;
  }
}

function requestOrigin(request) {
  return String(request.headers.get('origin') || '').trim();
}

function configuredPlatformOrigins() {
  const configured = String(
    process.env.PVGIS_ALLOWED_ORIGIN
      || process.env.GOOGLE_SOLAR_ALLOWED_ORIGIN
      || process.env.ALLOWED_ORIGIN
      || '',
  ).trim();
  if (!configured) return [...DEFAULT_PLATFORM_ORIGINS];
  return configured.split(',').map((value) => value.trim()).filter(Boolean);
}

function originIsLocalDevelopment(origin) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const hostname = String(url.hostname || '').toLowerCase();
    const loopback = hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '0.0.0.0'
      || hostname === '::1'
      || hostname === '[::1]';
    return loopback && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

function tenantSlugFromHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!normalized.endsWith(TENANT_SUFFIX)) return '';
  const slug = normalized.slice(0, -TENANT_SUFFIX.length);
  if (!slug || slug.includes('.') || !TENANT_SLUG_PATTERN.test(slug)) return '';
  if (RESERVED_PLATFORM_SUBDOMAINS.has(slug)) return '';
  return slug;
}

function requestHostname(request) {
  try {
    return String(new URL(request.url).hostname || '').toLowerCase();
  } catch {
    return '';
  }
}

export function tenantSlugFromOrigin(origin) {
  if (!origin) return '';
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return '';
    return tenantSlugFromHostname(url.hostname);
  } catch {
    return '';
  }
}

export function originIsPotentiallyAllowed(request) {
  const origin = requestOrigin(request);
  if (!origin) return true;
  const platformOrigins = configuredPlatformOrigins();
  return platformOrigins.includes('*')
    || platformOrigins.includes(origin)
    || originIsLocalDevelopment(origin)
    || Boolean(tenantSlugFromOrigin(origin));
}

export function corsAllowOrigin(request, fallback = 'https://www.360configurator.com') {
  const origin = requestOrigin(request);
  const platformOrigins = configuredPlatformOrigins();
  if (platformOrigins.includes('*')) return '*';
  if (platformOrigins.includes(origin) || originIsLocalDevelopment(origin) || tenantSlugFromOrigin(origin)) {
    return origin || fallback;
  }
  return platformOrigins[0] || fallback;
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.min(1_000_000_000, Math.floor(number));
}

export function normalizeSolarUsageLimits(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    analysesPerMonth: normalizeLimit(source.analysesPerMonth),
    buildingInsightsPerMonth: normalizeLimit(source.buildingInsightsPerMonth),
    dataLayersPerMonth: normalizeLimit(source.dataLayersPerMonth),
    pvgisPerMonth: normalizeLimit(source.pvgisPerMonth),
  };
}

export async function resolveSolarRequestContext(request) {
  const origin = requestOrigin(request);
  const platformOrigins = configuredPlatformOrigins();
  const hostTenantSlug = tenantSlugFromHostname(requestHostname(request));
  const originTenantSlug = tenantSlugFromOrigin(origin);

  // Tenant requests are scoped by the actual request hostname so same-origin GET
  // requests (which may omit the Origin header) are still metered correctly. If
  // an Origin is present, it must name the same tenant.
  if (hostTenantSlug) {
    if (origin && originTenantSlug !== hostTenantSlug) return null;
    const tenantSlug = hostTenantSlug;
    const snapshot = await firestore.collection(TENANTS_COLLECTION).doc(tenantSlug).get();
    const tenant = snapshot.data() || {};
    const expectedDomain = `${tenantSlug}${TENANT_SUFFIX}`;
    const configurators = tenant.configurators && typeof tenant.configurators === 'object'
      ? tenant.configurators
      : {};

    if (
      !snapshot.exists
      || tenant.plan !== 'go_live_now'
      || tenant.status !== 'active'
      || String(tenant.domain || expectedDomain).trim().toLowerCase() !== expectedDomain
      || configurators.solar !== true
    ) {
      return null;
    }

    return {
      kind: 'tenant',
      origin,
      tenantSlug,
      usageLimits: normalizeSolarUsageLimits(tenant.solarUsageLimits),
    };
  }

  // Never allow a tenant browser origin to move its request onto a platform
  // hostname, because that would bypass the tenant usage scope.
  if (originTenantSlug) return null;

  if (!origin || platformOrigins.includes('*') || platformOrigins.includes(origin) || originIsLocalDevelopment(origin)) {
    return { kind: 'platform', origin, tenantSlug: '', usageLimits: normalizeSolarUsageLimits(null) };
  }

  return null;
}

export function currentUsageMonth() {
  return new Date().toISOString().slice(0, 7);
}

function metricLimit(context, metric) {
  if (context?.kind !== 'tenant') return 0;
  const limitKey = SOLAR_LIMIT_KEYS[metric];
  return limitKey ? normalizeLimit(context.usageLimits?.[limitKey]) : 0;
}

function usageRef(context, month = currentUsageMonth()) {
  return firestore.collection(TENANT_USAGE_COLLECTION)
    .doc(context.tenantSlug)
    .collection('months')
    .doc(month);
}

export async function consumeTenantSolarMetric(context, metric, amount = 1, { enforceLimit = true } = {}) {
  if (context?.kind !== 'tenant') return { count: 0, limit: 0, month: currentUsageMonth() };
  const increment = Math.max(1, Math.floor(Number(amount) || 1));
  const month = currentUsageMonth();
  const limit = enforceLimit ? metricLimit(context, metric) : 0;
  const ref = usageRef(context, month);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() || {};
    const solar = existing.solar && typeof existing.solar === 'object' ? existing.solar : {};
    const current = Math.max(0, Number(solar[metric]) || 0);
    if (limit > 0 && current + increment > limit) {
      throw new TenantUsageQuotaError({ metric, limit, current, requested: increment });
    }

    const nextSolar = { ...solar, [metric]: current + increment };
    const now = new Date();
    transaction.set(ref, {
      tenantSlug: context.tenantSlug,
      month,
      solar: nextSolar,
      updatedAt: now,
      ...(snapshot.exists ? {} : { createdAt: now }),
    }, { merge: true });

    return { count: current + increment, limit, month };
  });
}

export function quotaErrorPayload(error) {
  if (!(error instanceof TenantUsageQuotaError)) return null;
  return {
    error: 'Monthly Solar usage limit reached for this customer.',
    usageLimit: {
      metric: error.metric,
      limit: error.limit,
      current: error.current,
      requested: error.requested,
      month: currentUsageMonth(),
    },
  };
}
