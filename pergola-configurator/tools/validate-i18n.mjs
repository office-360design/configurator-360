import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACCESSORY_OPTIONS,
  AUTOMATION_OPTIONS,
  FRAME_COLORS,
  LED_COLORS,
  LOUVER_COLORS,
  MODEL_OPTIONS,
  OUTLET_TYPES,
  POLE_FACES,
  PRIVACY_WALL_COLORS,
  SCREEN_COLORS,
  SERVICE_OPTIONS,
  SIDE_OPTIONS,
  STEPS,
} from '../src/catalog.js';
import {
  PERGOLA_MESSAGES,
  localizeCatalogOptions,
  localizeStep,
  pergolaT,
} from '../src/i18n.js';
import { getSharedMessages } from '../../shared-ui/src/i18n.js';
import {
  getLanguageProfile,
  getLocaleForHostname,
  getLocalizedConfiguratorUrl,
} from '../../shared-ui/src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repoRoot = path.resolve(packageRoot, '..');
const locales = ['en-US', 'ro-RO', 'de-DE'];
const failures = [];

function fail(message) {
  failures.push(message);
}

const englishKeys = Object.keys(PERGOLA_MESSAGES['en-US']).sort();
for (const locale of locales) {
  const keys = Object.keys(PERGOLA_MESSAGES[locale] ?? {}).sort();
  if (keys.length !== englishKeys.length || keys.some((key, index) => key !== englishKeys[index])) {
    fail(`${locale} Pergola dictionary does not have exact key parity with en-US.`);
  }
}

const sharedEnglishKeys = Object.keys(getSharedMessages('en-US')).sort();
for (const locale of locales) {
  const keys = Object.keys(getSharedMessages(locale)).sort();
  if (keys.length !== sharedEnglishKeys.length || keys.some((key, index) => key !== sharedEnglishKeys[index])) {
    fail(`${locale} shared dictionary does not have exact key parity with en-US.`);
  }
}

const sourceFiles = [
  'src/main.js',
  'src/pricing.js',
  'src/scene/PergolaScene.js',
  'src/ui/ConfiguratorUI.js',
  'src/ui/pergolaRenderers.js',
];

const literalKeyPattern = /(?:\bthis\.t|\bpergolaT)\(\s*(?:this\.state\.locale|locale|domainLocale)\s*,\s*['"]([^'"]+)['"]/g;
for (const relative of sourceFiles) {
  const source = fs.readFileSync(path.join(packageRoot, relative), 'utf8');
  for (const match of source.matchAll(literalKeyPattern)) {
    if (!Object.prototype.hasOwnProperty.call(PERGOLA_MESSAGES['en-US'], match[1])) {
      fail(`${relative} references missing Pergola translation key: ${match[1]}`);
    }
  }
}

const catalogGroups = [
  ['model', MODEL_OPTIONS],
  ['frameColor', FRAME_COLORS],
  ['louverColor', LOUVER_COLORS],
  ['screenColor', SCREEN_COLORS],
  ['privacyColor', PRIVACY_WALL_COLORS],
  ['ledColor', LED_COLORS],
  ['automation', AUTOMATION_OPTIONS],
  ['service', SERVICE_OPTIONS],
  ['side', SIDE_OPTIONS],
  ['poleFace', POLE_FACES],
  ['outlet', OUTLET_TYPES],
];

for (const locale of locales) {
  for (const step of STEPS) {
    const localized = localizeStep(locale, step);
    if (!localized.label || localized.label === `steps.${step.id}`) {
      fail(`${locale} is missing step translation for ${step.id}.`);
    }
  }

  for (const [group, options] of catalogGroups) {
    for (const option of localizeCatalogOptions(locale, group, options)) {
      if (!option.label || option.label.startsWith(`catalog.${group}.`)) {
        fail(`${locale} is missing ${group} label for ${option.value}.`);
      }
      if (Object.prototype.hasOwnProperty.call(option, 'description') && !option.description) {
        fail(`${locale} has an empty ${group} description for ${option.value}.`);
      }
    }
  }

  for (const item of ACCESSORY_OPTIONS) {
    const label = pergolaT(locale, `catalog.accessory.${item.key}.label`);
    if (!label || label.startsWith('catalog.accessory.')) {
      fail(`${locale} is missing accessory label for ${item.key}.`);
    }
  }
}

const profileExpectations = {
  'en-US': { hostname: 'www.360configurator.com', units: 'imperial', currency: 'USD', path: '/pergola-configurator/' },
  'ro-RO': { hostname: 'www.360configurator.ro', units: 'metric', currency: 'RON', path: '/configurator-pergola/' },
  'de-DE': { hostname: 'www.360konfigurator.de', units: 'metric', currency: 'EUR', path: '/pergola-konfigurator/' },
};

for (const [locale, expected] of Object.entries(profileExpectations)) {
  const profile = getLanguageProfile(locale);
  if (profile.units !== expected.units || profile.currency !== expected.currency) {
    fail(`${locale} profile should use ${expected.units}/${expected.currency}.`);
  }
  if (getLocaleForHostname(expected.hostname) !== locale) {
    fail(`${expected.hostname} does not resolve to ${locale}.`);
  }
  const url = new URL(getLocalizedConfiguratorUrl(locale, 'pergola', {
    pathname: '/pergola-configurator/',
    search: '?preview=1',
    hash: '#s=abcdefghijklmnop',
  }));
  if (url.hostname !== expected.hostname || url.pathname !== expected.path) {
    fail(`${locale} Pergola URL resolved to ${url.hostname}${url.pathname}, expected ${expected.hostname}${expected.path}.`);
  }
  if (url.search !== '?preview=1' || url.hash !== '#s=abcdefghijklmnop') {
    fail(`${locale} localized URL did not preserve search/hash state.`);
  }
}

const pergolaRendererSource = fs.readFileSync(path.join(packageRoot, 'src/ui/pergolaRenderers.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(packageRoot, 'src/ui/ConfiguratorUI.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(packageRoot, 'src/main.js'), 'utf8');

const forbiddenVisibleEnglish = [
  '>Choose a closing segment<',
  '>Lighting<',
  '>Infrared heaters<',
  '>Pole customization<',
  '>Your configuration<',
  '>Request a quote<',
  '>Light & orientation<',
  'aria-label="Decrease spotlights"',
  'aria-label="Increase spotlights"',
  '<strong>3D preview unavailable</strong>',
];
for (const literal of forbiddenVisibleEnglish) {
  if (`${pergolaRendererSource}\n${uiSource}\n${mainSource}`.includes(literal)) {
    fail(`Hard-coded visible English remains in the Pergola runtime: ${literal}`);
  }
}

if (failures.length) {
  console.error('Pergola i18n validation failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Pergola i18n validated for ${locales.join(', ')}: dictionary parity, catalog labels, host profiles, localized URLs and visible-string guards.`);
}
