import { CONSENT_KEY } from './website-analytics.js';
export const MIGRATION_KEY = '360-cookieconsent-migrated-v1';

// The old key stays as a compatibility mirror for the standalone configurators.
// Mark the upgrade once, including new visitors: an expired/revised consent must
// never be recreated from that mirror. Analytics permission never grants callback.
export function legacyConsent(store) {
  try {
    const choice = store?.getItem(CONSENT_KEY);
    const migrated = store?.getItem(MIGRATION_KEY) === '1';
    store?.setItem(MIGRATION_KEY, '1');
    return { choice: choice === 'granted' || choice === 'denied' ? choice : null, migrated };
  } catch { return { choice: null, migrated: true }; }
}

export function migrationCategories({ choice, migrated }, validConsent, accepted = []) {
  if (!choice || (!validConsent && migrated)) return null;
  // Respect a newer analytics choice made in a standalone configurator, without
  // changing the independently accepted callback category.
  const categories = validConsent ? accepted.filter(category => category !== 'statistics') : ['necessary'];
  if (choice === 'granted') categories.push('statistics');
  return categories;
}
