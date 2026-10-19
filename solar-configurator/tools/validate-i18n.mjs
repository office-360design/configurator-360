import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getSolarAttributeTranslations,
  getSolarMessages,
  getSolarStaticTranslations,
  SOLAR_TRANSLATION_COLUMNS,
  solarCompassLabels,
  solarModuleLabel,
  solarRegionCity,
  solarRoofName,
  solarT,
} from '../js/i18n.js?v=site-analytics-1';
import { getLocalizedConfiguratorUrl } from '../../shared-ui/src/config.js?v=localized-slugs-1';
import { calculateSolarEstimate, estimateToCsv } from '../js/estimate.js?v=site-analytics-1';
import { state as baseState } from '../js/state.js?v=site-analytics-1';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const locales = ['en-US', 'ro-RO', 'de-DE', 'es-ES', 'fr-FR', 'it-IT'];
const failures = [];

const placeholders = (text) => [...String(text ?? '').matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(',');
const messageSets = Object.fromEntries(locales.map((locale) => [locale, getSolarMessages(locale)]));
const baseKeys = Object.keys(messageSets['en-US']).sort();
for (const locale of locales) {
  const keys = Object.keys(messageSets[locale]).sort();
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length) failures.push(`${locale} missing message keys: ${missing.join(', ')}`);
  if (extra.length) failures.push(`${locale} has extra message keys: ${extra.join(', ')}`);
  if (locale !== 'en-US' && messageSets[locale] === messageSets['en-US']) failures.push(`${locale} has no message catalogue (falls back to English)`);
  for (const key of baseKeys) {
    if (!String(messageSets[locale][key] ?? '').trim()) failures.push(`${locale} has empty message: ${key}`);
    if (placeholders(messageSets[locale][key]) !== placeholders(messageSets['en-US'][key])) failures.push(`${locale} placeholder mismatch: ${key}`);
  }
}

const staticTranslations = getSolarStaticTranslations();
const attributeTranslations = getSolarAttributeTranslations();
if (Object.keys(staticTranslations).length < 190) failures.push('Static Solar UI translation coverage unexpectedly dropped below 190 strings.');
if (Object.keys(attributeTranslations).length < 25) failures.push('Solar accessibility/attribute translation coverage unexpectedly dropped below 25 strings.');
const expectedColumns = locales.filter((locale) => locale !== 'en-US');
if (JSON.stringify(SOLAR_TRANSLATION_COLUMNS) !== JSON.stringify(expectedColumns)) failures.push(`Static translation columns ${SOLAR_TRANSLATION_COLUMNS.join(', ')} do not match ${expectedColumns.join(', ')}.`);
for (const [english, translations] of Object.entries(staticTranslations)) {
  if (!Array.isArray(translations) || translations.length !== expectedColumns.length || translations.some((value) => !String(value).trim())) {
    failures.push(`Invalid static translation entry: ${english}`);
  }
}
for (const [english, translations] of Object.entries(attributeTranslations)) {
  if (!Array.isArray(translations) || translations.length !== expectedColumns.length || translations.some((value) => !String(value).trim())) {
    failures.push(`Invalid attribute translation entry: ${english}`);
  }
}

const expectedUrls = {
  'en-US': 'https://www.360configurator.com/solar-configurator/',
  'ro-RO': 'https://www.360configurator.ro/configurator-solar/',
  'de-DE': 'https://www.360konfigurator.de/solar-konfigurator/',
  'es-ES': 'https://www.360configurador.es/configurador-solar/',
  'fr-FR': 'https://www.360configurateur.fr/configurateur-solaire/',
  'it-IT': 'https://www.360configuratore.it/configuratore-fotovoltaico/',
};
for (const locale of locales) {
  const actual = getLocalizedConfiguratorUrl(locale, 'solar', { pathname: '/', search: '', hash: '' });
  if (actual !== expectedUrls[locale]) failures.push(`${locale} Solar URL mismatch: ${actual}`);
}

const expectedCompass = {
  'en-US': { north: 'N', east: 'E', south: 'S', west: 'W' },
  'ro-RO': { north: 'N', east: 'E', south: 'S', west: 'V' },
  'de-DE': { north: 'N', east: 'O', south: 'S', west: 'W' },
  'es-ES': { north: 'N', east: 'E', south: 'S', west: 'O' },
  'fr-FR': { north: 'N', east: 'E', south: 'S', west: 'O' },
  'it-IT': { north: 'N', east: 'E', south: 'S', west: 'O' },
};
for (const locale of locales) {
  const actual = solarCompassLabels(locale);
  if (JSON.stringify(actual) !== JSON.stringify(expectedCompass[locale])) failures.push(`${locale} compass labels are incorrect.`);
}

for (const locale of locales) {
  if (solarRoofName('gable', locale) === 'roof.gable') failures.push(`${locale} roof name did not resolve.`);
  if (solarModuleLabel('standard475', locale) === 'module.standard475.label') failures.push(`${locale} module label did not resolve.`);
  if (!solarRegionCity('muntenia', locale)) failures.push(`${locale} region city did not resolve.`);
}

const metrics = { placedPanels: 12, systemKwp: 5.7, arrayAreaM2: 23.9 };
const simulation = { batteryCapacity: 5 };
for (const locale of locales) {
  const snapshot = { ...baseState, modulePreset: 'standard475', gridConnection: 'three', currency: { 'en-US': 'USD', 'ro-RO': 'RON', 'de-DE': 'EUR', 'es-ES': 'EUR', 'fr-FR': 'EUR', 'it-IT': 'EUR' }[locale], currencyRate: 1 };
  const estimate = calculateSolarEstimate(snapshot, metrics, simulation, locale);
  const csv = estimateToCsv(estimate, locale);
  if (!estimate.lines.length) failures.push(`${locale} estimate produced no lines.`);
  if (!csv.includes(solarT(locale, 'csv.item'))) failures.push(`${locale} CSV header was not localized.`);
  if (!estimate.lines.some((line) => line.name.includes(solarModuleLabel('standard475', locale)))) failures.push(`${locale} panel estimate line was not localized.`);
}

const sourceGuards = [
  ['solar-configurator/js/sharedShell.js', 'applySolarTranslations(snapshot.locale)'],
  ['solar-configurator/js/ui.js', 'solarModuleNote(this.state.modulePreset, this.locale)'],
  ['solar-configurator/js/ui.js', "this.t('simulation.date'"],
  ['solar-configurator/js/estimate.js', "t('estimate.line.mounting')"],
  ['solar-configurator/js/scene.js', 'solarCompassLabels(resolveSolarLocale())'],
  ['solar-configurator/js/app.js', "t('pvgis.ready'"],
  ['solar-configurator/js/ui.js', "this.t('estimate.assumption.grid')"],
  ['solar-configurator/js/ui.js', 'formatCurrency(estimate.total, estimate.currency, this.locale)'],
  ['solar-configurator/js/sharedShell.js', "front: t('view.front'), top: t('view.top')"],
  ['solar-configurator/js/sharedShell.js', 'LOCATION_SEARCH_REGIONS[resolveSolarLocale('],
];
const sharedShellSource = fs.readFileSync(path.join(root, 'shared-ui/src/standaloneShell.js'), 'utf8');
if (sharedShellSource.includes('getLanguageSwitchTarget(')) failures.push('Shared UI still contains legacy cross-domain language switching.');
if (!sharedShellSource.includes("callbacks.onPreferenceChange?.('locale'")) failures.push('Shared UI does not apply Solar locale changes in place.');
const solarShellSource = fs.readFileSync(path.join(root, 'solar-configurator/js/sharedShell.js'), 'utf8');
if (solarShellSource.includes('getLocalizedConfiguratorUrl(nextLocale')) failures.push('Solar duplicates shared language switching.');

for (const [relative, needle] of sourceGuards) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!source.includes(needle)) failures.push(`${relative} is missing i18n guard: ${needle}`);
}

if (failures.length) {
  console.error('Solar i18n validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Solar i18n validated for ${locales.join(', ')}: ${baseKeys.length} message keys, ${Object.keys(staticTranslations).length} static UI strings, localized estimate/CSV, compass, PVGIS/environment states, and in-place language switching.`);
}
