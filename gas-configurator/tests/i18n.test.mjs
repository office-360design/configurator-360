import assert from 'node:assert/strict';
import test from 'node:test';
import { GAS_DICTIONARIES, gasT } from '../src/i18n.js';
import { normalizeState } from '../src/state.js';
import { renderGasLayout } from '../src/ui/layout.js';

const LOCALES = ['en-US', 'ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT'];

function layoutTranslationKeys() {
  const root = { innerHTML: '' };
  renderGasLayout(root);
  return [...root.innerHTML.matchAll(/data-gas-i18n(?:-title|-aria-label)?="([^"]+)"/g)]
    .map((match) => match[1]);
}

test('every translation key rendered by the gas layout exists in every supported locale', () => {
  const keys = [...new Set(layoutTranslationKeys())];
  assert.ok(keys.length > 100);
  LOCALES.forEach((locale) => {
    const missing = keys.filter((key) => gasT(locale, key) === key);
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(', ')}`);
  });
});

test('dynamic catalogue, obstacle and route-event labels exist in every supported locale', () => {
  const keys = [
    'pipeCatalog.pressureLimit',
    'routeEvent.confirmed',
    'routeEvent.needsConfirmation',
    'routeEvent.alreadyAdded',
    'action.addDetectedCrossing',
    'option.routeEventType.utilityCrossing',
    'option.routeEventType.roadCrossing',
    'option.routeEventType.railwayCrossing',
    'option.routeEventType.watercourseCrossing',
    'option.routeEventSource.manual',
    'option.routeEventSource.publicScreening',
    'option.routeEventSource.ownerPlan',
    'option.routeEventSource.fieldVerified',
    'option.installationMethod.notSpecified',
    'option.installationMethod.openTrench',
    'option.installationMethod.trenchless',
    'obstacle.status.disabled',
    'obstacle.status.idle',
    'obstacle.status.loading',
    'obstacle.status.ready',
    'obstacle.status.error',
    'option.depthPointSource.default',
    'option.depthPointSource.manual',
    'option.depthPointSource.surveyed',
    'depthProfile.zoneStatus.ready',
    'depthProfile.zoneStatus.missing',
    'depthProfile.zoneStatus.partial',
    'depthProfile.zoneStatus.stale',
    'depthProfile.zoneStatus.missing-width',
    'depthProfile.zoneRole.entry',
    'depthProfile.zoneRole.center',
    'depthProfile.zoneRole.exit',
    'depthProfile.warning.duplicates',
    'depthProfile.warning.abrupt',
    'depthProfile.warning.missingZones',
    'depthProfile.warning.fallbackTerrain',
    'validation.depthProfile.title',
    'validation.depthProfile.duplicates',
    'validation.depthProfile.abrupt',
    'validation.depthProfile.crossingMissing',
    'validation.depthProfile.crossingStale',
    'validation.depthProfile.pass',
  ];
  LOCALES.forEach((locale) => {
    const missing = keys.filter((key) => gasT(locale, key) === key);
    assert.deepEqual(missing, [], `${locale} is missing: ${missing.join(', ')}`);
  });
});

test('every supported locale has exact key parity, non-empty values and the English placeholders', () => {
  const placeholders = (value) => [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(',');
  const english = GAS_DICTIONARIES['en-US'];
  const englishKeys = Object.keys(english).sort();
  assert.deepEqual(Object.keys(GAS_DICTIONARIES), LOCALES);
  LOCALES.forEach((locale) => {
    const dictionary = GAS_DICTIONARIES[locale];
    assert.deepEqual(Object.keys(dictionary).sort(), englishKeys, `${locale} key parity`);
    englishKeys.forEach((key) => {
      assert.ok(String(dictionary[key]).trim(), `${locale} has an empty value for ${key}`);
      assert.equal(placeholders(dictionary[key]), placeholders(english[key]), `${locale} placeholders for ${key}`);
    });
  });
});

test('saved state keeps every supported locale and falls back to en-US otherwise', () => {
  LOCALES.forEach((locale) => {
    assert.equal(normalizeState({ preferences: { locale } }).preferences.locale, locale);
  });
  assert.equal(normalizeState({ preferences: { locale: 'pt-PT' } }).preferences.locale, 'en-US');
});
