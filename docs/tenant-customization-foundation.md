# Tenant customization foundation

The foundation now includes an internal appearance editor in tenant administration
and a shared-shell integration. Published theme tokens, shared action visibility,
desktop toolbar placement and shared floating-panel side settings apply on reload.
The editor has private drafts, a panel-style sample preview, publication and
revision restoration. The preview is a style sample, not a full 3D preview.

Product-specific defaults, geometry limits, catalogue restrictions, mobile layout
presets and the customer self-service editor remain subsequent adapter work.

## Plans and compatibility

Existing `go_live_now_1`, `go_live_now_3`, and `go_live_now_all` IDs retain their
allowances and behavior. New `go_live_custom_1`, `go_live_custom_3`, and
`go_live_custom_all` IDs are provisionable through the existing admin catalog.
The working display name is **Go Live Custom**; pricing remains unconfigured.
Owner plan changes still need the existing administrator approval.

Plan records declare `tier`, `family`, `deploymentMode`, and `capabilities`.
Both families use shared hosting. Hosting is independent of product allowance.
The server derives capabilities from the plan catalog, never from request data.
Legacy public records without customization continue loading without migration.

The lifecycle, dashboard owner guards, Solar usage checks and Auth-domain repair
script accept both managed plan families. Tenant/user isolation is unchanged.

## Configuration contract

Canonical source: `firebase-share-backend/functions/tenant-customization-schema.mjs`.
Browser copy: `shared-ui/src/tenantCustomization.js`.
Run `node scripts/build/sync-tenant-customization.mjs` after editing the canonical
module. CI checks byte equality; the backend needs no import outside its deploy
package. No new production dependency was introduced.

Version 1 accepts only validated theme tokens, approved layout enums, boolean
feature choices, units/currency defaults, and per-product overrides. It rejects
unknown fields, unsupported versions, executable content, unsafe keys and
oversized documents. Product-specific defaults, limits and catalogue selections
are rejected until explicitly registered in `PRODUCT_CUSTOMIZATION_DEFINITIONS`.
The descriptor mechanism supports numeric bounds, enums, booleans and catalogue
membership. Register a product field only when its adapter enforces it across
edits, reset, restoration and relevant commercial actions.

`resolveTenantConfiguratorSettings(productId, options)` in `tenantBootstrap.js`
checks tenant access and resolves built-in → platform → tenant common → tenant
product settings. Pass product `supportedFeatures`; tenant flags can disable
supported features but cannot enable an unsupported one. The result is deeply
frozen. Invalid published settings fail tenant bootstrap closed, rather than
silently reverting to unrestricted behavior. No additional runtime fetch or
cross-tenant settings cache is introduced: publication travels in `tenantPublic`.

Saved-project compatibility and applying user preferences are adapter work.
Do not spread saved project values over policy or use public flags as server-side
authorization. Product bounds must describe the engineering envelope, and backend
quotation/order operations must validate the applicable policy independently.

## Storage

- `tenants/{slug}/customization/state`: private draft, draft version, draft base
  revision and current publication counter.
- `tenants/{slug}/customizationRevisions/{revision}`: immutable private publication
  snapshots, actor/time and optional restored-from revision.
- `tenantPublic/{slug}.customization`: public `{ schemaVersion, revision,
  enabled, settings }` envelope. No drafts, owners or subscription details.
- Existing `tenantAuditLogs/{slug}/events`: draft/publication/rollback activity.

Private tenant subcollections explicitly deny browser reads and writes. Callables
use existing verified owner binding or the internal provisioning-admin allowlist.
An owner request derives its tenant from the current origin. Internal admins
select a tenant using `tenantSlug`, which also requires the internal admin origin.
Ownership is checked again inside each customization transaction.

## Callable contract

All responses/errors use the existing Firebase callable transport. Owners omit
`tenantSlug`; internal administrators include it in every request.

| Callable | Request fields | Result |
| --- | --- | --- |
| `getTenantCustomization` | none | Draft, draftVersion, draftBaseRevision, revision, public settings, plan capabilities, product definitions |
| `saveTenantCustomizationDraft` | settings, expectedRevision, expectedDraftVersion | revision, new draftVersion |
| `previewTenantCustomization` | expectedRevision, expectedDraftVersion | Authenticated draft payload marked preview; no public writes |
| `publishTenantCustomization` | expectedRevision, expectedDraftVersion | New revision and draftVersion |
| `rollbackTenantCustomization` | revision (source), expectedRevision | New revision containing the validated old settings |

Initial revision and draftVersion are both 0. Save replaces the complete draft;
clients should edit the retrieved draft, not send a partial patch. Refresh after
`aborted` conflicts. The preview endpoint supplies the authenticated editor sample; it is not a
public preview link and does not render the complete 3D configurator.

Publish revalidates current plan, tenant status, enabled products and schema.
Publication, immutable revision creation and audit are one transaction. Rollback
creates a new revision, never edits history. A draft based on a pre-rollback
revision must be reviewed and saved again. Changing or disabling products may
make an existing draft unpublishable until its product overrides are removed.

Downgrade approval or a direct administrator downgrade atomically disables and
removes overrides from the public envelope. Private drafts/history are retained.
An upgrade does not silently restore old settings: explicitly publish or restore
a previous revision after reviewing it against current permissions.

## Rollout and verification

1. Run `npm run check:tenant-customization` and the tenant regression suite.
2. Deploy Firebase functions and rules through the existing backend workflow.
   It includes all five new callables and validation of the generated contract.
3. Deploy shared static assets through the usual release process. The Window
   static bundle check now also requires `tenantCustomization.js`.
4. Deploy Solar API with the managed-family compatibility change before enabling
   the new tier for a Solar tenant. No dedicated hosting is required.
5. Existing tenants require no data migration. Use the internal appearance editor
   for shared UI settings. Product adapters for Roof and Pergola follow next.

Tests cover schema validation, permissions, precedence, immutable resolution,
legacy bootstrap, invalid-policy blocking, draft privacy, stale-edit conflicts,
owner changes, downgrade/restore and the real provisioning/plan-change handlers.
Backend tests use transactional in-memory adapters; they do not deploy services
or replace a staging Firebase smoke test.

## Shared UI phase: visual checks

Use tenant administration → open a custom-plan tenant → **Configurator appearance**.
Choose a tenant-wide or per-configurator scope, edit settings and save a draft.
Preview the saved panel style, then publish and reload the actual configurator.
The editor disables publishing while there are unsaved changes. Revision restore
uses the foundation's conflict checks and creates a new publication.

- Primary/surface/text/muted/border/radius affect the shared shell and panel footer;
  shared panel controls inherit the accent. Product-native styling and 3D materials
  remain unchanged. Existing dark-mode surfaces are preserved.
- Cart can be hidden while Save remains available. Cart still depends on Save for
  its immutable snapshots. Bookshelf never gains an Add to cart button.
- Quotation visibility applies to the shared quotation action, not Bookshelf's
  native quotation flow. Price visibility applies only to the shared footer.
  These display choices do not hide all product estimates or replace server-side
  authorization/pricing policy.
- Left/right placement applies to panels declaring `geometry: 'floating-right'`,
  including Pergola. Other panels require their product adapters. Mobile panel placement
  stays unchanged; the toolbar hides while a shared floating panel is expanded
  so it cannot cover the panel title. Custom toolbar corners apply on desktop only.
- Layout and theme changes clean up when the shared shell is destroyed.

Run `npm run check:tenant-ui` and `npm run check:tenant-ui:browser`. The browser
suite mounts the real shared shell with inert authentication, checks desktop and
mobile placement and the draft/preview/publish editor, and writes screenshots to
`artifacts/tenant-ui-*.png` for the tenant CI artifact. Production deployment is
still a separate step.
