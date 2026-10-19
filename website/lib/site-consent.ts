'use client';

import { browserStorage, CONSENT_KEY, setChoice } from './website-analytics.js';
import { legacyConsent, migrationCategories } from './consent-migration.js';
import { createConsentConfig } from './consent-config';
import type { Locale } from './i18n';

type Provider = typeof import('vanilla-cookieconsent');
export type ConsentCategory = 'statistics' | 'preferences';
export const CONSENT_EVENTS = ['360:consent-ready', '360:consent-change'] as const;
let provider: Provider | undefined;
let initialization: Promise<void> | undefined;
let ready = false;

export function hasWebsiteConsent(category: ConsentCategory): boolean {
  return Boolean(ready && provider?.validConsent() && provider.acceptedCategory(category));
}

function notify() {
  // The live provider is authoritative. Clear stale legacy grants on expiry or
  // revision changes before any optional service can initialize.
  setChoice(hasWebsiteConsent('statistics') ? 'granted' : 'denied');
  window.dispatchEvent(new Event('360:consent-change'));
}

export function initializeWebsiteConsent(locale: Locale): Promise<void> {
  if (initialization) return initialization;
  const legacy = legacyConsent(browserStorage());
  initialization = import('vanilla-cookieconsent').then(async module => {
    provider = module;
    // run() may fire onConsent; defer notification until migration is finished.
    await module.run(createConsentConfig(locale, () => { if (ready) notify(); }));
    const valid = module.validConsent();
    const accepted = valid ? module.getUserPreferences().acceptedCategories : [];
    const categories = migrationCategories(legacy, valid, accepted);
    if (categories) module.acceptCategory(categories);
    ready = true;
    notify();
    window.dispatchEvent(new Event('360:consent-ready'));
  }).catch(error => {
    ready = false;
    provider = undefined;
    initialization = undefined;
    setChoice('denied');
    window.dispatchEvent(new Event('360:consent-unavailable'));
    throw error;
  });
  return initialization;
}

export function openCookiePreferences() {
  if (ready && provider) provider.showPreferences();
  else window.dispatchEvent(new Event('360:consent-unavailable'));
}

// A standalone configurator can change analytics in another same-origin tab.
export function syncLegacyAnalytics(choice: string | null) {
  if (!ready || !provider?.validConsent() || !['granted', 'denied'].includes(choice || '')) return;
  const categories = provider.getUserPreferences().acceptedCategories.filter(category => category !== 'statistics');
  if (choice === 'granted') categories.push('statistics');
  provider.acceptCategory(categories);
  notify();
}

export function listenForLegacyConsent(event: StorageEvent) {
  if (event.key === CONSENT_KEY) syncLegacyAnalytics(event.newValue);
}
