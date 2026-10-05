export const DEFAULT_GUEST_REGION = Object.freeze({
  countryCode: '',
  locale: 'en-US',
  currency: 'EUR',
  units: 'metric',
});

export const COUNTRY_REGION_DEFAULTS = Object.freeze({
  RO: Object.freeze({ countryCode: 'RO', locale: 'ro-RO', currency: 'RON', units: 'metric' }),
  DE: Object.freeze({ countryCode: 'DE', locale: 'de-DE', currency: 'EUR', units: 'metric' }),
  US: Object.freeze({ countryCode: 'US', locale: 'en-US', currency: 'USD', units: 'imperial' }),
});

export function guestRegionForCountry(countryCode = '') {
  const code = String(countryCode || '').trim().toUpperCase();
  return COUNTRY_REGION_DEFAULTS[code] || { ...DEFAULT_GUEST_REGION, countryCode: code };
}

export async function fetchGuestRegion({ fetchImpl = globalThis.fetch, endpoint = '/api/region-defaults', timeoutMs = 1600 } = {}) {
  if (typeof fetchImpl !== 'function') return { ...DEFAULT_GUEST_REGION, source: 'fallback' };
  const endpoints = [endpoint];
  if (typeof location !== 'undefined' && location.hostname && !/^(?:www\.)?360configurator\.com$/i.test(location.hostname)) {
    endpoints.push('https://www.360configurator.com/api/region-defaults');
  }
  for (const candidate of [...new Set(endpoints)]) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), Math.max(250, timeoutMs)) : null;
    try {
      const response = await fetchImpl(candidate, { credentials: 'omit', cache: 'no-store', signal: controller?.signal });
      if (!response?.ok) throw new Error(`Region endpoint returned ${response?.status || 'an error'}.`);
      const payload = await response.json();
      const profile = guestRegionForCountry(payload?.countryCode);
      return { ...profile, source: 'ip' };
    } catch {
      // Try the canonical edge endpoint before falling back to global defaults.
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { ...DEFAULT_GUEST_REGION, source: 'fallback' };
}
