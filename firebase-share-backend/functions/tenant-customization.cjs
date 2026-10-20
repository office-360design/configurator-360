'use strict';

// Inject the existing tenant authorization and audit helpers. No independent
// identity model or browser-supplied tenant identity for owner requests.
function createTenantCustomizationHandlers(deps) {
  const {
    getDb, HttpsError, Timestamp, authorize, isManagedTenant, tenantPlan,
    validateTenantPlanId, tenantPublicPolicy, createAudit, auditRef,
  } = deps;
  const schema = import('./tenant-customization-schema.mjs');
  const error = (code, message) => { throw new HttpsError(code, message); };
  function version(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) error('invalid-argument', `${name} must be a non-negative integer.`);
    return value;
  }
  function schemaOperation(operation) {
    try { return operation(); }
    catch (cause) { error('invalid-argument', cause.message); }
  }
  function checkLease(input, meta, includeDraft) {
    if (version(input.expectedRevision, 'expectedRevision') !== (meta.revision || 0)) {
      error('aborted', 'Published settings changed. Reload before retrying.');
    }
    if (includeDraft && version(input.expectedDraftVersion, 'expectedDraftVersion') !== (meta.draftVersion || 0)) {
      error('aborted', 'The draft changed. Reload before retrying.');
    }
  }

  async function execute(request, operation) {
    const access = await authorize(request);
    const contract = await schema;
    const input = request.data || {};
    const db = getDb();
    const tenantRef = db.collection('tenants').doc(access.slug);
    const publicRef = db.collection('tenantPublic').doc(access.slug);
    const metaRef = tenantRef.collection('customization').doc('state');
    const revisions = tenantRef.collection('customizationRevisions');

    return db.runTransaction(async transaction => {
      const tenantSnapshot = await transaction.get(tenantRef);
      const publicSnapshot = await transaction.get(publicRef);
      const metaSnapshot = await transaction.get(metaRef);
      const tenant = tenantSnapshot.data() || {};
      const publicData = publicSnapshot.data() || {};
      const meta = metaSnapshot.data() || { revision: 0, draftVersion: 0 };
      if (!tenantSnapshot.exists || !publicSnapshot.exists || !isManagedTenant(tenant)) {
        error('not-found', 'Managed tenant not found.');
      }
      // Recheck ownership within the transaction: reassignment cannot race a write.
      if (access.actorType === 'tenant_owner' && tenant.ownerUid !== access.uid) {
        error('permission-denied', 'This account no longer owns the tenant.');
      }
      const plan = tenantPlan(validateTenantPlanId(tenant.planId, tenant.configurators));
      if (operation === 'get') {
        return {
          schemaVersion: 1,
          revision: meta.revision || 0,
          draftVersion: meta.draftVersion || 0,
          draftBaseRevision: meta.draftBaseRevision ?? null,
          draft: meta.draft || null,
          published: tenantPublicPolicy(plan, publicData).customization,
          capabilities: { ...plan.capabilities },
          definitions: contract.PRODUCT_CUSTOMIZATION_DEFINITIONS,
        };
      }
      if (tenant.status !== 'active') error('failed-precondition', 'The tenant must be active to customize.');
      if (plan.capabilities.customization !== true) error('permission-denied', 'Customization is not included in this plan.');
      checkLease(input, meta, ['save', 'publish', 'preview'].includes(operation));

      let settings;
      if (operation === 'save') settings = input.settings;
      else if (operation === 'rollback') {
        const target = version(input.revision, 'revision');
        if (!target) error('invalid-argument', 'Choose a published revision.');
        const snapshot = await transaction.get(revisions.doc(String(target)));
        if (!snapshot.exists) error('not-found', 'Customization revision not found.');
        settings = snapshot.data().settings;
      } else {
        if (!meta.draft) error('failed-precondition', 'Save a draft first.');
        if (meta.draftBaseRevision !== (meta.revision || 0)) {
          error('aborted', 'This draft predates the current publication. Review and save it again.');
        }
        settings = meta.draft;
      }
      settings = schemaOperation(() => contract.validateCustomization(settings));
      schemaOperation(() => contract.assertCustomizationPermissions(settings, plan.capabilities, tenant.configurators));
      if (operation === 'preview') {
        // Returned only to the authorized caller; never stored in public data.
        return { schemaVersion: 1, preview: true, draftVersion: meta.draftVersion,
          baseRevision: meta.revision || 0, settings, capabilities: { ...plan.capabilities } };
      }
      const now = Timestamp.now();
      let response;
      if (operation === 'save') {
        const draftVersion = (meta.draftVersion || 0) + 1;
        transaction.set(metaRef, {
          ...meta, draft: settings, draftVersion, draftBaseRevision: meta.revision || 0,
          updatedAt: now, updatedByUid: access.uid,
        });
        response = { revision: meta.revision || 0, draftVersion };
      } else {
        const revision = (meta.revision || 0) + 1;
        transaction.create(revisions.doc(String(revision)), {
          schemaVersion: 1, revision, settings,
          source: operation, restoredFromRevision: operation === 'rollback' ? input.revision : null,
          createdAt: now, createdByUid: access.uid,
        });
        const nextMeta = { ...meta, revision, updatedAt: now, updatedByUid: access.uid };
        // A consumed draft remains editable, but its version changes to prevent
        // an old tab from publishing the same content over a newer publication.
        if (operation === 'publish') {
          nextMeta.draftVersion = (meta.draftVersion || 0) + 1;
          nextMeta.draftBaseRevision = revision;
        }
        transaction.set(metaRef, nextMeta);
        transaction.update(publicRef, {
          ...tenantPublicPolicy(plan, publicData),
          customization: { schemaVersion: 1, revision, enabled: true, settings },
          updatedAt: now,
        });
        response = { revision, draftVersion: nextMeta.draftVersion || 0 };
      }
      transaction.create(auditRef(access.slug), createAudit({
        type: `customization_${operation}`,
        summary: operation === 'save' ? 'Customization draft saved.' : `Customization revision ${response.revision} published.`,
        actorType: access.actorType, actor: access,
        details: { ...response, ...(operation === 'rollback' ? { restoredFromRevision: input.revision } : {}) },
        createdAt: now,
      }));
      return response;
    });
  }

  return {
    getTenantCustomization: request => execute(request, 'get'),
    saveTenantCustomizationDraft: request => execute(request, 'save'),
    previewTenantCustomization: request => execute(request, 'preview'),
    publishTenantCustomization: request => execute(request, 'publish'),
    rollbackTenantCustomization: request => execute(request, 'rollback'),
  };
}

module.exports = { createTenantCustomizationHandlers };
