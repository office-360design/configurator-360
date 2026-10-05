import { readFile } from 'node:fs/promises';

const files = Object.fromEntries(await Promise.all([
  ['functions', 'firebase-share-backend/functions/index.js'],
  ['rules', 'firebase-share-backend/firestore.rules'],
  ['analytics', 'shared-ui/src/configuratorAnalytics.js'],
  ['shell', 'shared-ui/src/standaloneShell.js'],
  ['adminJs', 'shared-ui/src/tenantProvisioningAdmin.js'],
  ['adminHtml', 'shared-ui/admin/tenant-provisioning/index.html'],
  ['workflow', '.github/workflows/deploy-firebase-share.yml'],
  ['package', 'package.json'],
].map(async ([key, path]) => [key, await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')])));

const expectations = [
  ['functions', [
    "const CONFIGURATOR_ANALYTICS_COLLECTION = 'configuratorAnalytics'",
    'exports.recordConfiguratorAnalyticsEvent = onCall(',
    'exports.getPlatformAnalytics = onCall(',
    "access: 'accesses'",
    "login: 'logins'",
    "configuration_created: 'configurationsCreated'",
    "scopeId: analyticsScopeIdForTenant(tenantSlug)",
    "event === 'login'",
    'configuratorAnalyticsForScope(PLATFORM_ANALYTICS_SCOPE_ID)',
  ]],
  ['rules', ['match /configuratorAnalytics/{scopeId}/{document=**}', 'allow read, write: if false']],
  ['analytics', ['recordConfiguratorAnalyticsEvent', 'recordConfiguratorAccessOnce', "eventType: 'access'"]],
  ['shell', [
    'recordConfiguratorAccessOnce(this.productId)',
    "eventType: 'login'",
    "eventType: 'configuration_created'",
    'recordConfigurationCreatedAnalytics()',
    'recordInitialConfiguration: initial',
  ]],
  ['adminJs', ['getPlatformAnalytics', 'populateTenantAnalytics', 'refreshPlatformAnalytics', 'configurationsCreated']],
  ['adminHtml', ['Configurator analytics', 'platformAnalyticsMonthBody', 'manageAnalyticsMonthBody', 'Lifetime']],
  ['workflow', ['validate_configurator_analytics.mjs', 'functions:recordConfiguratorAnalyticsEvent', 'functions:getPlatformAnalytics']],
  ['package', ['check:analytics', 'validate_configurator_analytics.mjs']],
];

let failed = false;
for (const [key, needles] of expectations) {
  for (const needle of needles) {
    if (!files[key].includes(needle)) {
      console.error(`Missing analytics integration marker in ${key}: ${needle}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log('Configurator analytics integration validation passed.');
