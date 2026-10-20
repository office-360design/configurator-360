'use strict';

const STANDARD_CAPABILITIES = Object.freeze({
  customization: false,
  theme: false,
  layout: false,
  features: false,
  defaults: false,
  limits: false,
  catalogue: false,
});
const CUSTOM_CAPABILITIES = Object.freeze(
  Object.fromEntries(Object.keys(STANDARD_CAPABILITIES).map(key => [key, true])),
);

// Keep commercial tier, product allowance and hosting independent. Existing
// plan IDs remain valid; no data migration is needed for Go Live Now tenants.
function buildTenantPlanCatalog(standardPlans) {
  const catalog = {};
  for (const [id, plan] of Object.entries(standardPlans)) {
    catalog[id] = Object.freeze({
      ...plan,
      tier: 'standard',
      family: 'go_live_now',
      deploymentMode: 'shared',
      capabilities: STANDARD_CAPABILITIES,
    });
    const customId = id.replace('go_live_now_', 'go_live_custom_');
    catalog[customId] = Object.freeze({
      ...plan,
      id: customId,
      name: plan.name.replace('Go Live Now', 'Go Live Custom'),
      shortName: `Custom — ${plan.shortName}`,
      description: 'Shared-cloud configurators with managed customization.',
      tier: 'custom',
      family: 'go_live_custom',
      deploymentMode: 'shared',
      capabilities: CUSTOM_CAPABILITIES,
      displayOrder: plan.displayOrder + 100,
      recommended: false,
      features: Object.freeze([...plan.features, 'Managed customization']),
      // Pricing is intentionally unconfigured until the commercial launch.
      monthlyPriceCents: null,
      annualPriceCents: null,
      stripePriceId: '',
      stripeAnnualPriceId: '',
    });
  }
  return Object.freeze(catalog);
}

function isManagedTenant(tenant) {
  return ['go_live_now', 'go_live_custom'].includes(tenant?.plan);
}

// The public document keeps the published revision but never exposes a draft.
// A downgrade deactivates overrides atomically with the plan change, preserving
// the immutable private revision for an explicit later restore.
function tenantPublicPolicy(plan, previous = {}) {
  return {
    planId: plan.id,
    tier: plan.tier,
    deploymentMode: plan.deploymentMode,
    capabilities: { ...plan.capabilities },
    customization: {
      schemaVersion: 1,
      revision: previous.customization?.revision || 0,
      enabled: plan.capabilities.customization && previous.customization?.enabled === true,
      settings: plan.capabilities.customization
        ? previous.customization?.settings || { schemaVersion: 1 }
        : { schemaVersion: 1 },
    },
  };
}

module.exports = { buildTenantPlanCatalog, isManagedTenant, tenantPublicPolicy };
