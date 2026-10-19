import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const lib = fileURLToPath(new URL('../lib/', import.meta.url));
const legacyKey = '360-analytics-consent-v1';
const markerKey = '360-cookieconsent-migrated-v1';

function runtime({ legacy, migrated = false, valid = false, accepted = [], blocked = false } = {}) {
  const values = new Map();
  if (legacy) values.set(legacyKey, legacy);
  if (migrated) values.set(markerKey, '1');
  const store = {
    getItem(key) { if (blocked) throw Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw Error('blocked'); values.set(key, value); },
  };
  const events = [];
  const window = { localStorage: store, dispatchEvent(event) { events.push(event.type); } };
  const provider = {
    config: null, runs: 0, selections: [],
    run(config) { provider.config = config; provider.runs++; if (valid) config.onConsent(); return Promise.resolve(); },
    validConsent: () => valid,
    acceptedCategory: category => accepted.includes(category),
    getUserPreferences: () => ({ acceptedCategories: [...accepted] }),
    acceptCategory(categories) { accepted = [...categories]; valid = true; provider.selections.push(accepted); provider.config.onChange(); },
    showPreferences() {},
  };
  const context = vm.createContext({ window, Event, Intl, URL, Set, Map, Date, console });
  const cache = new Map();
  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} }; cache.set(filename, module);
    const require = specifier => {
      if (specifier === 'vanilla-cookieconsent') return provider;
      let full = path.resolve(path.dirname(filename), specifier);
      if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!path.extname(full)) full += '.ts';
      return load(full);
    };
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context)(require, module, module.exports);
    return module.exports;
  }
  return { load: name => load(path.join(lib, name)), values, events, provider, window };
}

for (const legacy of ['granted', 'denied']) test(`legacy ${legacy} migrates only its original analytics scope`, async () => {
  const r = runtime({ legacy }); const consent = r.load('site-consent.ts');
  await consent.initializeWebsiteConsent('ro');
  assert.equal(consent.hasWebsiteConsent('statistics'), legacy === 'granted');
  assert.equal(consent.hasWebsiteConsent('preferences'), false);
  assert.equal(r.values.get(legacyKey), legacy); assert.equal(r.values.get(markerKey), '1');
  assert.equal(r.provider.selections.length, 1);
});

test('new, expired and revised consent never resurrects the legacy compatibility grant', async () => {
  for (const options of [{}, { legacy: 'granted', migrated: true }, { legacy: 'denied', migrated: true }]) {
    const r = runtime(options); const consent = r.load('site-consent.ts'); await consent.initializeWebsiteConsent('de');
    assert.equal(consent.hasWebsiteConsent('statistics'), false); assert.equal(consent.hasWebsiteConsent('preferences'), false);
    assert.equal(r.provider.selections.length, 0); assert.equal(r.values.get(legacyKey), 'denied');
  }
});

test('standalone analytics withdrawal preserves the independent callback choice', async () => {
  const r = runtime({ legacy: 'denied', migrated: true, valid: true, accepted: ['necessary', 'statistics', 'preferences'] });
  const consent = r.load('site-consent.ts'); await consent.initializeWebsiteConsent('it');
  assert.equal(consent.hasWebsiteConsent('statistics'), false); assert.equal(consent.hasWebsiteConsent('preferences'), true);
  consent.syncLegacyAnalytics('granted'); assert.equal(consent.hasWebsiteConsent('statistics'), true);
  consent.syncLegacyAnalytics('denied'); assert.equal(consent.hasWebsiteConsent('statistics'), false);
  assert.equal(consent.hasWebsiteConsent('preferences'), true);
});

test('concurrent mounts initialize once and storage failure supports explicit session choices', async () => {
  const r = runtime({ blocked: true }); const consent = r.load('site-consent.ts');
  await Promise.all([consent.initializeWebsiteConsent('fr'), consent.initializeWebsiteConsent('fr')]);
  assert.equal(r.provider.runs, 1); assert.equal(consent.hasWebsiteConsent('statistics'), false);
  r.provider.acceptCategory(['necessary', 'statistics']); assert.equal(consent.hasWebsiteConsent('statistics'), true);
  assert.equal(r.load('website-analytics.js').readChoice(null), 'granted');
  r.provider.acceptCategory(['necessary']); assert.equal(consent.hasWebsiteConsent('statistics'), false);
  assert.equal(r.load('website-analytics.js').readChoice(null), 'denied');
});

test('six domain configurations default off with localized links and independent categories', () => {
  const r = runtime(); const { createConsentConfig } = r.load('consent-config.ts');
  const { consentCopy } = r.load('consent-copy.ts'); const { locales, localizedPath } = r.load('i18n.ts');
  for (const locale of locales) {
    const config = createConsentConfig(locale, () => {});
    assert.equal(config.mode, 'opt-in'); assert.equal(config.cookie.domain, undefined);
    assert.equal(config.cookie.expiresAfterDays, 180); assert.equal(config.cookie.secure, true);
    assert.equal(config.categories.necessary.readOnly, true); assert.equal(config.categories.preferences.enabled, false); assert.equal(config.categories.statistics.enabled, false);
    assert.equal(config.language.default, locale);
    const text = config.language.translations[locale]; assert.equal(text.consentModal.title, consentCopy[locale].title);
    assert.ok(text.consentModal.footer.includes(localizedPath(locale, '/contact')));
    assert.equal(text.preferencesModal.sections.filter(section => section.linkedCategory).length, 3);
  }
});

test('callback adapter applies all four additional languages before native mount', () => {
  const r = runtime(); const { callbackTranslations, installCallbackTranslations } = r.load('swift-callback-locales.ts');
  for (const locale of ['de', 'es', 'fr', 'it']) {
    const translated = callbackTranslations(locale); assert.ok(Object.keys(translated).length >= 49); assert.equal(translated.months.length, 12);
    const uninstall = installCallbackTranslations(locale);
    r.window.swiftCallbackTranslations = { Close: 'Close', Name: 'Name', IntroBtn: 'Wrong language', vendorExtra: 'keep' };
    assert.equal(r.window.swiftCallbackTranslations.Close, translated.Close); assert.equal(r.window.swiftCallbackTranslations.IntroBtn, translated.IntroBtn);
    assert.equal(r.window.swiftCallbackTranslations.vendorExtra, 'keep'); uninstall(); assert.equal(r.window.swiftCallbackTranslations, undefined);
  }
  assert.equal(callbackTranslations('ro').IntroBtn, 'Solicită apel'); assert.equal(callbackTranslations('en').IntroBtn, 'Request a callback');
});
