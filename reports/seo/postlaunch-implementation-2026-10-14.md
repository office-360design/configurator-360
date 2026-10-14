# Website post-launch implementation, 14 October 2026

Base: `origin/main` at `96d9202`. Branch: `codex/website-postlaunch-20261014`.
Scope: marketing website and its delivery layer only. Full applications, geometry,
pricing, authentication, API rules, intentional noindex and tenant entitlement stay unchanged.

## Direction contract: narrow extension of the incumbent website

WORLD: existing technical/editorial website, no new visual identity.
STRUCTURE: small non-modal Analytics preference panel; equal accept/reject actions;
preferences can be reopened from the footer. No new marketing card grid.
FIRST VIEWPORT: retain the existing hero and working product previews. The preference
panel must not cover navigation or the mobile callback launcher.
TYPE: reuse Geist and incumbent canvas/ink/brand tokens; body 15px; controls at least 44px.
COLOR: existing light/dark tokens, equal visual emphasis for both privacy choices.
INTERACTION: analytics disabled before consent, independent forms and callback service,
lazy paving photography and deferred callback script with prompt interaction fallback.
QUALITY BAR: no horizontal overflow at 390px or desktop, keyboard-operable preferences,
no fake conversions, no protected-route caching, unchanged canonical/hreflang/noindex.

## Measurement contract

One existing GA4 property/stream on the three public `www` domains. No new property.
Enhanced Measurement is the single owner of page_view; manual SPA pageviews removed.
Cross-domain linker uses exact public domains, not tenant subdomains. Consent is chosen
separately on each domain; linker continuity requires consent on both ends.

`?360_test=1` persists a browser-local staff marker and blocks website GA entirely;
`?360_test=0` clears it. Apply it on each domain/browser used for demonstrations.
It cannot retroactively distinguish existing internal traffic in GA4 or Search Console.
Localhost and tenant hosts never load this marketing tag.

Events: lite_preview_view (visible), lite_preview_engaged (real configuration/orbit),
lite_preview_error, full_configurator_open (link activation only), contact_intent
(email/phone/contact/callback), demo_request_open, lead_form_start, form_error, generate_lead.
`lead_form_start` is distinct from the existing automatic `form_start`, so the custom
funnel can select its own signal without counting automatic and explicit events twice.
Only `submitContact` success plus delivered=true produces generate_lead. A callback
button click is contact_intent, never a completed call or lead. No form values,
addresses, free text, saved configuration or request IDs are included in custom events.
Automatic GA Enhanced Measurement must be checked separately for URL/PII and form-event
settings; custom events do not imply all automatic collection is sanitized.

## Two release lots and rollback

1. Consent/internal measurement, form delivery and funnel events, public-domain
   linker, gzip/cache, lazy source-derived paving photograph, deferred SwiftCallback,
   localized machine-readable delivery and release regression checks. These shared
   foundations stay together so the intermediate commit is coherent.
2. Bounded localized product-page clarification and this verification/rollback
   runbook. Revert this content commit independently. For a complete rollback,
   revert lot 2 before lot 1 and rebuild the release; do not reset shared history.

Third-party SwiftCallback CSS has a timestamp URL and provider-owned cache behavior;
we do not modify its bundle, backend or vendor consent. Confirmed-call measurement
requires a supported vendor webhook/integration plus reconciliation with actual calls.

## Baseline and interpretation

Private Analytics/Search Console baseline and commercial call counts are retained
in the local audit artifact, not published with this engineering change. Staff
demonstrations across multiple networks cannot be retroactively separated with IP
heuristics. Visits, search impressions and confirmed commercial leads differ.
Mobile PSI COM/RO/DE: 56/56/55, LCP 12.8/11.6/11.8s, no sufficient CrUX field data.
Paving photograph baseline: 1,434,118 bytes, loaded on homepage before viewport gating.

## Verification and follow-up (not automatically scheduled)

Before release: build/static export, rendered SEO tests, source-parity lite tests,
actual Nginx routing/cache/compression fixtures, desktop/mobile privacy UI, callback
opens without Analytics consent, no analytics requests on denial/local/staff visits.
After release: verify gzip and Cache-Control on all domains, query-preserving language
links, exactly one page_view per navigation in a consented non-staff browser, and one
generate_lead from a labelled delivered test (not a click). No real test enquiry is
sent without explicit coordination.
GA4 admin: Enhanced Measurement history pageviews confirmed ON on Oct14; register product/placement/form_id/method/error_code as
event-scoped dimensions and mark generate_lead as key event. Keep permanent internal
filters inactive until a Testing comparison has been validated. Do not apply IP
exclusion heuristics to historical traffic across unrelated networks.
48h: check processed lead/events and cross-domain self-referrals, not only realtime.
2–4 weeks: compare matching dates, countries, hostname, product, source and device;
account for GSC lag and consent-driven changes in measured traffic. AI citations
must be checked independently; llms.txt is optional and not a ranking guarantee.

Implementation/test results are appended after verification.

## Verified implementation status

- Website production build and export: pass, 45 pages and 2 metadata routes.
- Static validation: pass, 53 HTML files and self-canonical/reciprocal hreflang,
  using the validator's explicit source-app mode. Full Window build is not claimed
  as locally validated; deployment still builds and checks compiled sibling apps.
- Analytics/localized-context/rendered-HTML/native-lite tests: 28/28 pass.
- Nginx gzip/cache/localized context/route fixture checks: 1,409/1,409 pass.
- Native paving regression suite: 439/439 pass; website route-isolation check: pass.
- Scoped ESLint for the new/changed measurement and preview modules: pass.
  Repository-wide TypeScript checking still reports existing Three.js, Cloudflare,
  renderer and control typing errors outside this change; no new file is reported.
- Full configurator source code remains unchanged. The website paving test was
  updated to use native clipped polygon `area` and the first non-fragment instance,
  instead of obsolete bounding-box assumptions. No model geometry was corrected.
- Website paving photo: 303,579 bytes including embedded source provenance,
  78.83% below the native original, viewport-gated and same-origin.
- Browser: Analytics denial hides the panel and leaves no Analytics script on
  localhost; SwiftCallback script and launcher remain present. Product-to-contact
  navigation preserves the selected product. No real enquiry or call was submitted.
- Fresh UI review scored the three consent fixes and missing brief evidence
  resolved. This is not whole-site or live-Analytics certification.
- Google Analytics admin: inspected existing history-based pageviews ON. No
  property/stream/admin settings were saved. Registering dimensions/key event and
  verifying processed delivery remain release follow-up tasks. Cross-domain linker
  is implemented in website code, not claimed as saved in the Google tag editor.
- Live compression/cache/PageSpeed gains and real conversion delivery are NOT
  verified before this branch is deployed. No score improvement is promised.

Official implementation references:
[basic consent](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic),
[automatic pageviews](https://developers.google.com/analytics/devguides/collection/ga4/views),
[disable measurement without reload](https://developers.google.com/tag-platform/security/guides/privacy).

## Design continuity evidence

Impeccable documenter compared `google-analytics.tsx`, `analytics-preferences.css`
and `configurator-project-brief.tsx` with the incumbent `app/globals.css`, Geist
setup in `app/layout.tsx`, and `public/styles/homepage-polish.css`. This is an
ordinary extension; no global token or visual-system change was authorized.

- Preferences reuse `--canvas`, `--ink`, `--line-strong`, `--brand` and
  `--brand-core`, inherited Geist, square borders and the existing focus language.
  Both choices have equal styling and a 44px minimum height; the footer reopening
  control also has a 44px minimum height. The scoped hover uses existing
  `--brand-core: #0761aa` with white text (reviewed contrast 6.36:1).
- The project brief reuses `detail-intro`, `solid-section`, `page-frame`,
  `outputs-grid` and `launch-link`: two columns on desktop, one on mobile,
  incumbent uppercase display type and technical CTA treatment. Existing mobile
  link styles provide the 44px minimum target. No new font, palette or card family
  was introduced.
- Opened all six supplied captures: `desktop-final.jpg`, `mobile-final.jpg`,
  `mobile-viewport-final.jpg`, `product-desktop.jpg`, `product-mobile.jpg` and
  `product-mobile-lower.jpg` under `.impeccable/review/`. The contact full-page
  captures include document-top navigation and footer; the product captures are
  explicit scrolled-region views. They show the responsive brief composition,
  mobile preference actions and separation from the callback launcher.
- The finish review returned **ship for the correction list**: mobile overlap,
  hover contrast, blocked-storage session consent and missing brief evidence were
  resolved. This does not certify the whole site or live GA collection.
- Pre-existing variation remains: fixed dark sections, hard-coded neutral/link
  colors and small technical labels coexist with theme tokens. These incumbent
  patterns were recorded, not normalized. `globals.css` and
  `homepage-polish.css` have no diff; the existing font setup is preserved.
  `PRODUCT.md` and `DESIGN.md` are absent; no replacement design files or sidecar
  were created for this narrow extension.
