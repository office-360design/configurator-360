import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const workspaceRoot = path.resolve(root, "..");

const i18nModule = await import(pathToFileURL(path.join(root, "src/client/js/i18n.js")).href);
const sharedConfig = await import(pathToFileURL(path.join(workspaceRoot, "shared-ui/src/config.js")).href);

// Shared locale order: en-US, ro-RO, de-DE, es-ES, fr-FR, it-IT.
const locales = ["en-US", "ro-RO", "de-DE", "es-ES", "fr-FR", "it-IT"];
const localeNames = {
  "ro-RO": "Romanian",
  "de-DE": "German",
  "es-ES": "Spanish",
  "fr-FR": "French",
  "it-IT": "Italian",
};
const messages = Object.fromEntries(
  locales.map((locale) => [locale, i18nModule.getWindowMessages(locale)])
);
const englishKeys = Object.keys(messages["en-US"]).sort();
const failures = [];

if (englishKeys.length < 200) {
  failures.push(`Expected at least 200 Window message keys, found ${englishKeys.length}.`);
}

for (const locale of locales) {
  const keys = Object.keys(messages[locale]).sort();
  const missing = englishKeys.filter((key) => !Object.prototype.hasOwnProperty.call(messages[locale], key));
  const extra = keys.filter((key) => !Object.prototype.hasOwnProperty.call(messages["en-US"], key));
  if (missing.length) failures.push(`${locale} missing keys: ${missing.join(", ")}`);
  if (extra.length) failures.push(`${locale} extra keys: ${extra.join(", ")}`);
  for (const key of keys) {
    const value = messages[locale][key];
    if (typeof value !== "string" || !value.trim()) {
      failures.push(`${locale} has an empty/non-string value for ${key}.`);
    }
  }
}

const criticalKeys = [
  "project.type",
  "profile.cadAssembly",
  "finish.title",
  "accessory.preset",
  "professional.title",
  "selection.source.frame",
  "ar.exportTitle",
  "cad.loading",
  "layout.overlayAria",
  "reset.confirm",
];

for (const key of criticalKeys) {
  for (const locale of locales.filter((code) => code !== "en-US")) {
    if (messages["en-US"][key] === messages[locale][key]) {
      failures.push(`Critical ${localeNames[locale]} translation still matches English for ${key}.`);
    }
  }
}

// Placeholders such as {format} must survive translation unchanged.
const placeholders = (value) => [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(",");
for (const locale of locales) {
  for (const key of englishKeys) {
    if (placeholders(messages[locale][key]) !== placeholders(messages["en-US"][key])) {
      failures.push(`${locale} placeholders differ from English for ${key}.`);
    }
  }
}

const expectedPaths = {
  "en-US": "/window-configurator/",
  "ro-RO": "/configurator-ferestre/",
  "de-DE": "/fenster-konfigurator/",
  "es-ES": "/configurador-ventanas/",
  "fr-FR": "/configurateur-fenetres/",
  "it-IT": "/configuratore-finestre/",
};
for (const locale of locales) {
  const actual = sharedConfig.CONFIGURATOR_PUBLIC_PATHS?.[locale]?.window;
  if (actual !== expectedPaths[locale]) {
    failures.push(`${locale} Window public path should be ${expectedPaths[locale]}, got ${actual}.`);
  }
}

// The new AR copy is shared with Hall, with Window-specific text in each locale.
const { AR_COPY, arT } = await import(pathToFileURL(path.join(workspaceRoot, "shared-ui/src/ar/i18n.js")).href);
const arKeys = Object.keys(AR_COPY.window['en-US']).sort();
// AR copy lives in shared-ui; every locale it provides for Hall must also exist for Window.
const arLocales = locales.filter((locale) => AR_COPY.hall?.[locale]);
const arPending = locales.filter((locale) => !AR_COPY.hall?.[locale]);
if (arPending.length) console.warn(`Shared AR copy does not provide ${arPending.join(", ")} yet; Window AR text checked for ${arLocales.join(", ")}.`);
for (const locale of arLocales) {
  if (!AR_COPY.window[locale]) { failures.push(`${locale} Window AR copy is missing.`); continue; }
  if (JSON.stringify(Object.keys(AR_COPY.window[locale]).sort()) !== JSON.stringify(arKeys)) failures.push(`${locale} AR translation keys differ.`);
  for (const key of arKeys) if (!arT('window', locale, key)?.trim()) failures.push(`${locale} AR text missing for ${key}.`);
  if (AR_COPY.window[locale].title === AR_COPY.hall[locale].title) failures.push(`${locale} Window AR still uses Hall's title.`);
}

const sourceChecks = [
  {
    file: "src/client/shared-shell.js",
    required: [
      "applyWindowTranslations",
    ],
  },
  {
    file: "src/client/js/window-layout-overlay.js",
    required: ["layout.overlayAria", "layout.add", "layout.merge", "window-locale-applied"],
    forbidden: ["Window layout editing controls", "Merge windows"],
  },
  {
    file: "src/client/js/cad-reference.js",
    required: ["cad.checking", "cad.referenceCount", "cad.loading", "cad.loadFailed"],
    forbidden: ["Checking CAD references…", "Loading reference screenshots…"],
  },
  {
    file: "src/client/js/component-selection.js",
    required: ["selection.source.frame", "selection.source.bead", "selection.source.sash"],
    forbidden: ["return 'Frame';", "return 'Glazing bead';", "return 'Sash / Vent';"],
  },
  {
    file: "src/client/js/ar-controller.js",
    required: [
      "createFirebaseARDialog",
      "getWindowLocale",
      "window-locale-applied",
      "product: 'window'",
    ],
    forbidden: [
      "button.textContent = 'HTTPS required'",
      "button.textContent = 'AR not supported'",
      "button.textContent = 'View in AR'",
      "button.textContent = 'Opening camera…'",
    ],
  },
];

const sharedShellSource = fs.readFileSync(path.join(workspaceRoot, 'shared-ui/src/standaloneShell.js'), 'utf8');
if (sharedShellSource.includes('getLanguageSwitchTarget(')) failures.push('Shared UI still contains legacy cross-domain language switching.');
if (!sharedShellSource.includes("callbacks.onPreferenceChange?.('locale'")) failures.push('Shared UI does not apply locale changes in place.');
const windowShellSource = fs.readFileSync(path.join(root, 'src/client/shared-shell.js'), 'utf8');
if (windowShellSource.includes('getLocalizedConfiguratorUrl(nextLocale')) failures.push('Window adapter duplicates shared language switching.');

for (const check of sourceChecks) {
  const absolute = path.join(root, check.file);
  const source = fs.readFileSync(absolute, "utf8");
  for (const token of check.required) {
    if (!source.includes(token)) failures.push(`${check.file} is missing required i18n token: ${token}`);
  }
  for (const token of check.forbidden ?? []) {
    if (source.includes(token)) failures.push(`${check.file} still contains hard-coded visible English: ${token}`);
  }
}

const indexHtml = fs.readFileSync(path.join(root, "src/client/index.html"), "utf8");
const importMapIndex = indexHtml.indexOf('<script type="importmap">');
const firstModuleIndex = indexHtml.indexOf('<script type="module"');
if (importMapIndex === -1 || firstModuleIndex === -1 || importMapIndex > firstModuleIndex) {
  failures.push("Window import map must remain before every module script.");
}

if (failures.length) {
  console.error("Window i18n validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Window i18n validated for ${locales.join(", ")}: ` +
    `${englishKeys.length} message keys, localized routes, runtime UI, AR/CAD/layout controls, ` +
    "and shared in-place language translation."
  );
}
