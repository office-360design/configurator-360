import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getHallMessages, hallOpeningLabel, hallT, hallValueLabel, hallWallLabel } from '../js/i18n.js';
import { CONFIGURATOR_PUBLIC_PATHS } from '../../shared-ui/src/config.js';
import { buildBom, bomToCsv } from '../js/bom.js';
import { estimateHallPrice } from '../js/pricing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const locales = ['en-US', 'ro-RO', 'de-DE'];
const baseKeys = Object.keys(getHallMessages('en-US')).sort();
const failures = [];

for (const locale of locales) {
  const keys = Object.keys(getHallMessages(locale)).sort();
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length) failures.push(`${locale} missing keys: ${missing.join(', ')}`);
  if (extra.length) failures.push(`${locale} extra keys: ${extra.join(', ')}`);
  if (!CONFIGURATOR_PUBLIC_PATHS[locale]?.hall) failures.push(`${locale} missing Hall public path`);
}

const html = fs.readFileSync(path.join(root, 'hall-configurator', 'index.html'), 'utf8');
for (const match of html.matchAll(/data-hall-i18n(?:-aria-label|-title)?="([^"]+)"/g)) {
  if (!baseKeys.includes(match[1])) failures.push(`index.html references unknown key ${match[1]}`);
}

const state = {
  length: 24, width: 12, eaveHeight: 5, structurePreset: 'standard', claddingProfile: 'sandwich',
  secondaryStructure: true, slab: true, roofSkylights: true, gutters: true, highBayLighting: true,
  fireSprinklers: true, climateSystem: 'comfort',
  openings: [{ id: 'w', type: 'window', side: 'front', offset: 0, bottom: 1, width: 1.8, height: 1.25, color: '#8ec6df' }],
};
const build = {
  metrics: { frameCount: 5, footprint: 288, roofArea: 310, netWallArea: 330, skylightCount: 8, highBayFixtureCount: 12, sprinklerHeadCount: 24, refrigerationUnitCount: 2 },
  counts: { primaryColumns: 10, rafters: 10, footings: 10, foundationPiers: 10, borderMembers: 18, roofPurlinLines: 10, wallGirtLines: 20, endPosts: 4, wallBraces: 8, roofBraces: 4, compressionBars: 4, stays: 20, connectionPlates: 30, purlinCleats: 20, anchorRods: 40, fasteners: 100, washers: 80 },
  profileSchedule: { columns: 'HEB280', rafters: 'IPE400', purlins: 'ZZ200-3.0', border: 'RHS150×50×5', braces: 'RHS80×4 / D20', stays: 'L60×6' },
};

for (const locale of locales) {
  const lines = buildBom(structuredClone(state), build, locale);
  if (!lines.length) failures.push(`${locale} BOM is empty`);
  const csv = bomToCsv(lines, locale);
  if (!csv.includes(hallT(locale, 'csv.component'))) failures.push(`${locale} CSV header not localized`);
  const estimate = estimateHallPrice(structuredClone(state), build, locale);
  if (!estimate.items.some((item) => item.label === hallT(locale, 'pricing.primary'))) failures.push(`${locale} pricing labels not localized`);
  if (!hallOpeningLabel('window', locale) || !hallWallLabel('front', { locale })) failures.push(`${locale} opening/wall labels missing`);
  if (!hallValueLabel('buildingUse', 'general', locale)) failures.push(`${locale} value labels missing`);
}

const scene = fs.readFileSync(path.join(root, 'hall-configurator', 'js', 'scene.js'), 'utf8');
if (!scene.includes('hallCompassLabels')) failures.push('scene compass is not localized');
if (!scene.includes("'dimension.ridge'")) failures.push('ridge dimension label is not localized');
const shell = fs.readFileSync(path.join(root, 'hall-configurator', 'js', 'sharedShell.js'), 'utf8');
const sharedShell = fs.readFileSync(path.join(root, 'shared-ui', 'src', 'standaloneShell.js'), 'utf8');
if (!sharedShell.includes('getLanguageSwitchTarget(nextLocale, fallbackTarget)')) failures.push('shared cross-domain language switching is missing');
if (shell.includes('getLocalizedConfiguratorUrl(nextLocale')) failures.push('Hall duplicates shared language switching');

if (failures.length) {
  console.error('Hall i18n validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Hall i18n validated for ${locales.join(', ')}: ${baseKeys.length} message keys, localized UI/BOM/pricing/CSV, compass, openings and country-domain switching.`);
}
