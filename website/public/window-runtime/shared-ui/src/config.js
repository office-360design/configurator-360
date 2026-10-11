export const LANGUAGE_PROFILES = Object.freeze({
  'en-US': {
    label: 'English (US)',
    nativeName: 'English (US)',
    flag: '🇺🇸',
    searchTerms: 'english united states usa',
    units: 'imperial',
    currency: 'USD',
  },
  'ro-RO': {
    label: 'Romanian',
    nativeName: 'Română',
    flag: '🇷🇴',
    searchTerms: 'română romania romanian',
    units: 'metric',
    currency: 'RON',
  },
});

export const UNIT_OPTIONS = Object.freeze([
  { value: 'imperial', label: 'Imperial (ft / in)' },
  { value: 'metric', label: 'Metric (mm)' },
]);

export const CURRENCY_OPTIONS = Object.freeze([
  { value: 'USD', label: 'US Dollar (USD)' },
  { value: 'RON', label: 'Romanian Leu (RON)' },
]);

export const QUALITY_OPTIONS = Object.freeze([
  { value: 'low', label: 'Low' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'high', label: 'High' },
]);

export const AR_PLATFORM_OPTIONS = Object.freeze([
  { value: 'android', label: 'Android' },
  { value: 'ios', label: 'iOS' },
]);

export function getLanguageProfile(locale) {
  return LANGUAGE_PROFILES[locale] ?? LANGUAGE_PROFILES['en-US'];
}
