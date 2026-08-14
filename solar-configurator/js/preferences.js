const METERS_TO_FEET = 3.280839895013123;
const METERS_TO_INCHES = 39.37007874015748;
const SQUARE_METERS_TO_SQUARE_FEET = 10.763910416709722;
const FX_CACHE_KEY = '360-configurator:roof:fx:RON';
const FX_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FALLBACK_RATES_FROM_RON = Object.freeze({
  RON: 1,
  USD: 0.22,
  EUR: 0.20,
});

export function normalizeUnits(value) {
  return value === 'imperial' ? 'imperial' : 'metric';
}

export function normalizeCurrency(value) {
  return ['USD', 'EUR'].includes(value) ? value : 'RON';
}


function formatNumber(value, locale, options = {}) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatLength(meters, units, { metricDecimals = 0, inchDecimals = 1 } = {}) {
  const safeMeters = Number.isFinite(Number(meters)) ? Number(meters) : 0;
  if (normalizeUnits(units) === 'metric') {
    const millimeters = safeMeters * 1000;
    return `${formatNumber(millimeters, 'en-US', {
      minimumFractionDigits: metricDecimals,
      maximumFractionDigits: metricDecimals,
    })} mm`;
  }

  const totalInches = Math.max(0, safeMeters * METERS_TO_INCHES);
  let feet = Math.floor(totalInches / 12);
  let inches = totalInches - feet * 12;
  const multiplier = 10 ** inchDecimals;
  inches = Math.round(inches * multiplier) / multiplier;
  if (inches >= 12) {
    feet += 1;
    inches = 0;
  }

  return `${feet}′ ${inches.toFixed(inchDecimals)}″`;
}

export function formatArea(squareMeters, units, decimals = 1) {
  const safeArea = Number.isFinite(Number(squareMeters)) ? Number(squareMeters) : 0;
  if (normalizeUnits(units) === 'imperial') {
    return `${formatNumber(safeArea * SQUARE_METERS_TO_SQUARE_FEET, 'en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })} ft²`;
  }
  return `${formatNumber(safeArea, 'en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} m²`;
}

export function toDisplayLength(meters, units) {
  const safeMeters = Number.isFinite(Number(meters)) ? Number(meters) : 0;
  return normalizeUnits(units) === 'imperial'
    ? safeMeters * METERS_TO_FEET
    : safeMeters * 1000;
}

export function fromDisplayLength(value, units) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return NaN;
  return normalizeUnits(units) === 'imperial'
    ? numeric / METERS_TO_FEET
    : numeric / 1000;
}

export function displayLengthInputConfig(minMeters, maxMeters, stepMeters, units) {
  if (normalizeUnits(units) === 'imperial') {
    return {
      min: toDisplayLength(minMeters, units),
      max: toDisplayLength(maxMeters, units),
      step: 0.01,
      decimals: 2,
      ariaUnit: 'decimal feet',
    };
  }

  return {
    min: toDisplayLength(minMeters, units),
    max: toDisplayLength(maxMeters, units),
    step: Math.max(1, stepMeters * 1000),
    decimals: 0,
    ariaUnit: 'millimeters',
  };
}

export function formatCurrency(value, currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  const locale = normalizedCurrency === 'RON' ? 'ro-RO' : normalizedCurrency === 'EUR' ? 'de-DE' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: normalizedCurrency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function getFallbackCurrencyRate(currency) {
  return FALLBACK_RATES_FROM_RON[normalizeCurrency(currency)] ?? 1;
}

function readCachedRate(currency) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FX_CACHE_KEY) || 'null');
    if (!parsed || parsed.currency !== currency || !Number.isFinite(parsed.rate)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedRate(payload) {
  try {
    window.localStorage.setItem(FX_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be disabled; the live rate still works for the current page.
  }
}

export async function resolveCurrencyRate(currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  if (normalizedCurrency === 'RON') {
    return {
      currency: 'RON',
      rate: 1,
      date: null,
      source: 'reference currency',
      isFallback: false,
    };
  }

  const cached = readCachedRate(normalizedCurrency);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < FX_CACHE_TTL_MS) {
    return { ...cached, source: 'cached daily reference rate', isFallback: false };
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=RON&symbols=${encodeURIComponent(normalizedCurrency)}`);
    if (!response.ok) throw new Error(`FX request failed with ${response.status}`);
    const payload = await response.json();
    const rate = Number(payload?.rates?.[normalizedCurrency]);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid FX rate');

    const result = {
      currency: normalizedCurrency,
      rate,
      date: payload.date || null,
      fetchedAt: now,
    };
    writeCachedRate(result);
    return { ...result, source: 'Frankfurter daily reference rate', isFallback: false };
  } catch {
    if (cached) {
      return { ...cached, source: 'cached daily reference rate', isFallback: false };
    }
    return {
      currency: normalizedCurrency,
      rate: getFallbackCurrencyRate(normalizedCurrency),
      date: null,
      source: 'offline fallback estimate',
      isFallback: true,
    };
  }
}
