# Tenant aliases on .com, .ro and .de

One tenant slug has three generated addresses:

- `acme.360configurator.com`
- `acme.360configurator.ro`
- `acme.360konfigurator.de`

`tenants/acme.domain` remains `acme.360configurator.com`, the canonical identity.
`domains` and `firebaseAuthDomains` describe the generated aliases; they are not
customer-editable host allowlists. Legacy documents missing these arrays still
resolve by their validated slug and canonical domain. Do not create additional
`acme-ro` or `acme-de` tenants. An explicitly conflicting canonical domain fails
validation rather than being treated as a new alias.

## Behaviour

All aliases use the same owner, plan, entitlements, saves, cart, audit history,
analytics scope and Solar monthly budget. Disabled configurators and suspended
tenants stay blocked everywhere. A suspended tenant owner may still manage the
account in the dashboard, as before. Unknown aliases are not public demo traffic.

Tenant configurators use the same localized paths as the corresponding public
site. For example, Solar uses `/solar-configurator/` on `.com`,
`/configurator-solar/` on `.ro`, and `/solar-konfigurator/` on `.de`.
Launcher links, Change Site Domain and cart-edit links use the shared public
route catalogue. Tiles and Bookshelf keep their unchanged public paths.

Old English or other-language entry URLs (with/without a trailing slash, or
ending in `/index.html`) redirect to the current tenant domain's localized path.
Query parameters are retained; browsers also retain fragment-based save/share,
cart and authentication transport. JS/CSS/models are not redirected, and localized
asset requests still resolve to the same physical configurator directories.
The public root/www redirects and localized paths are unchanged.
The domain supplies the initial configurator language, currency and units for
new tenant visitors; explicit user preferences are preserved. This change does
not translate the English dashboard/administration interface.

The configurator's **Change Site Domain** action preserves the tenant, current
configuration, saved ID/cart-edit context and the existing one-time Auth handoff.
The address links on the launcher/dashboard/admin are ordinary navigation links;
a first direct visit on another origin may require sign-in there. Local browser
drafts are origin-local, not continuously synchronized across tabs/domains.

## Optional single-configurator homepage

In Tenant Administration (create/edit), or in the customer's dashboard under
**Company & plan → Homepage behavior**, enable **Open the configurator directly
when only one is enabled** and save. `autoOpenSingleConfigurator` is a boolean
stored in the private and public tenant documents by the same transaction. It is
off by default, including for existing tenants with no field; no migration is required.

When the preference is on and the tenant is active with exactly one enabled
configurator, the homepage at `/` uses `location.replace()` to open that
configurator on the same hostname with the same localized path as the public
site. For example, a Solar-only Romanian tenant opens `/configurator-solar/`;
the German alias opens `/solar-konfigurator/`. Query strings and fragments are
preserved. There is no permanent/cached redirect and no plan restriction beyond
checking the currently enabled configurators.

Two or more enabled configurators show the selection page. A pending upgrade or
downgrade does not change the redirect until its configurator selection is
approved. The preference is retained if entitlements change, so it becomes
effective again if only one configurator remains. Suspended, missing and failed
tenant lookups do not redirect. `/dashboard/` and direct configurator URLs are
unaffected. Owners can always return to `/dashboard/` to disable the setting.
Changes are recorded in the existing audit log. Older API clients that omit the
field preserve its value. Only the existing authenticated owner/admin operations
can change it; browsers still cannot write the tenant documents directly.

Deploy the Firebase Functions and frontend from this update. No additional DNS,
IAM, Auth-domain or Firestore rules change is needed for the homepage preference.

## Deployment and existing tenants

The wildcard DNS, certificate-map entries and URL-map API routing must already
cover the three roots. No new Cloud Run service or Firebase app is needed.
Merge/release through the existing process; pushing `tenants` alone does not
publish production. Deploy the Firebase Functions and Firestore rules, Solar
backend and frontend/nginx changes from the same revision. The deployment
workflows check that packaged domain-policy copies match the shared source.

From the updated repository checkout in Cloud Shell (Node 18+ and gcloud):

```bash
# Inspect the proposed changes without writing anything.
bash firebase-share-backend/iam/authorize-existing-tenant-auth-domain.sh --all --dry-run

# Register and backfill one existing test tenant.
bash firebase-share-backend/iam/authorize-existing-tenant-auth-domain.sh tier1-test

# Or migrate all Go Live Now tenants, including suspended accounts.
bash firebase-share-backend/iam/authorize-existing-tenant-auth-domain.sh --all
```

No new IAM role is necessary: the runtime uses the existing datastore and
`tenantAuthDomainManager` permissions. The operator running the migration needs
Firestore and Firebase Auth config permissions plus quota-project usage access.
The helper runs using gcloud's active account, with `configurator-360` as the
explicit project. It never enables another Firebase app or creates tenants.

Provisioning now registers the three exact Auth hostnames in one merge/update,
preserving all other authorized domains. Provisioning and migration cooperate
through `tenantProvisioningSystem/authDomainLock` with an expiring 120-second
lease, so their project-level read/modify/write operations do not overwrite each
other. A busy lock causes a retryable error. Console edits are not covered by
that cooperative lock; avoid editing Auth domains manually during provisioning
or a migration. No background migration runs automatically.

The migration preserves tenant status, ownership, plans and configurators. Its
metadata writes use update masks and document-version preconditions. If an
administrator changes a tenant concurrently, the helper reports a failed
backfill; rerun it for that tenant. Reruns are idempotent. If provider registration
fails, tenant metadata is not marked ready. Existing suspended tenants are never
reactivated by migration.

The existing Firebase `authDomain` selection is unchanged: tenants use the
configured Firebase helper domain, while existing selected public hosts retain
their first-party proxy. Registering tenant aliases is NOT a wildcard OAuth
redirect-URI setup. Browser tests here mock Firebase; test real Google popup and
redirect-fallback login on your supported browsers after deployment.

## Validation

```bash
npm run check:tenant-domains
npm run check:tenant-domains:nginx   # nginx and Python 3 required
npm run check:tenant-domains:browser # root Playwright + Chromium required
```

The policy has one source, `shared-ui/src/tenantDomains.js`. After editing it run
`node scripts/build/sync-tenant-domains.mjs`; commit the generated CommonJS copy
in Firebase Functions and the ES module in Solar together. CI rejects drift.

Tests use synthetic identities and memory-only Firebase/Firestore adapters.
They cover alias parsing, reserved and spoofed domains, the ten configurator URL
builders, owner binding, tenant save/cart/analytics scope, shared Solar quotas,
Auth-domain merge/locking, migration dry runs/versioned writes, and cart/share
transport. nginx tests use local fixture files and stub upstream DNS; no live
upstream request is made. Browser smoke runs the actual launcher/dashboard/admin
pages on all three hostnames with synthetic Firebase responses.

After deployment verify with the same account: save on .com and load on .ro;
change a cart item on .de; use Solar across all aliases; change domains inside a
configurator; suspend/re-enable through admin; and verify public www sites are
unchanged. A new tenant must sign in without any migration script.
