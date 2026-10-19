# Website growth and mobile release — 14 October 2026

Follow-up to the initial postlaunch release #563. This document records website
engineering and the review procedure, not private analytics or customer records.
Production domains remain www.360configurator.com, www.360configurator.ro and
www.360konfigurator.de. No new migration, DNS changes or native application changes.

## Scope

- Consent panel is rendered in the initial HTML with the page's actual locale.
  A small pre-paint storage read hides previously decided preferences. It never
  grants consent or loads Analytics. Blocked storage keeps the choices available.
- The incumbent visual stylesheet starts downloading from HTML rather than waiting
  for React. It remains non-render-blocking, handles cached loads and has a noscript
  fallback. No artwork, product controls or renderers were removed for a score.
- Footer logo is lazy-loaded. Scene labels use group semantics without changing
  interaction behaviour. SwiftCallback's script, availability and settings are unchanged.
- Homepage adds a direct B2B project contact path and two inspectable native examples:
  roof quantities/CSV and the nine original cardboard box styles. These are working
  product examples, not invented customer case studies or revenue claims.
- Product pages answer three project-review objections with native details/summary.
  Existing product FAQs and structured data remain intact. New content is server-rendered
  in EN/RO/DE and uses existing layout, type and link conventions.
- Delivered contact events can include an exact enumerated product. Free-text fields,
  personal data and messages never become Analytics parameters.

## Measurement administration and evidence

GA4 event-scoped dimensions were saved for product, placement, form_id, method and
error_code. generate_lead was registered as a key event with no invented monetary
value. Count is once per delivered event, not once per distinct human prospect.
The existing website linker keeps the three canonical domains; an administrative
Google-tag domain-editor save was not confirmed, so do not claim otherwise.

One explicitly authorized, labelled TEST 360Configurator form was sent through the
live RO website. The website confirmed success, the owner confirmed inbox receipt,
and GA4 Realtime showed one generate_lead/key event and one page_view. Do not resend
the test after deployment or count it as a commercial result. Its UTM campaign is
website_validation_20261014, source internal_test, medium qa.

The owner confirms a morning callback. SwiftCallback is shared with 360design.ro;
the dashboard total is not a 360Configurator total. Use the originating hostname
on each vendor record, not the shared script key, to separate brands. Vendor success/
missed labels and the owner's call confirmation are distinct evidence; neither
establishes commercial qualification. No callback test, billing change or vendor
settings change was made.

## Reconciliation for the team

Keep identity and cross-channel deduplication in the existing private operational
system. Supply only aggregates for each complete review period:

| Source | Totals needed | Exclusions / unknowns |
| --- | --- | --- |
| Form inbox/backend | Delivered submissions; distinct confirmed human contacts | Tests, confirmed spam, duplicates; qualification unknown unless reviewed |
| SwiftCallback | Origin hostname; attempts, connected/missed; distinct confirmed callers | 360design records, tests, repeated attempts; vendor status is not sales qualification |
| Team follow-up | Suitable, unsuitable, unknown, opportunities; response time and aggregate objections | Consumer enquiry is not automatically a bot |
| GA4 | Consent-observed generate_lead and contact intent by host/product/source/device | QA campaign, staff demos, consent gaps and processing lag |

Do not invent a vendor webhook/API or scrape widget fields. If hostname or provider
export is unavailable, mark attribution incomplete and ask for minimum aggregates.
Never send customer names, phones, emails, recordings or message text to GA4, GitHub
or the automation prompt. Missing totals are unknown, not zero.

## Validation and rollback

Build and static export: 45 pages, 2 metadata routes. Website tests: 32 passing,
including all nine native box styles, bookshelf/paving parity, consent/storage,
enumerated event payloads and locale HTML/metadata. Scoped ESLint and diff check
passed. Local release validator checks 53 HTML files and composed source links;
compiled Window application validation is delegated to the standard deployment CI.
Desktop/mobile visual inspection confirms the incumbent identity, readable DE copy,
working native disclosure, no horizontal overflow in added sections and preserved
unsent form input when consent changes. Temporary preview is stopped after QA.

Native configurator and backend directories are unchanged. Rollback is a normal
revert of this website release, followed by the existing deployment workflow.
Do not reset shared worktrees or remove unrelated edits. GA dimensions/key-event
registration need not be removed for a UI rollback.

## Performance baseline, not a guarantee

Fresh mobile Lighthouse runs on the preceding production release:
RO 89 (LCP 3.0 s, TBT 70 ms), EN 90 (LCP 2.9 s, TBT 30 ms),
DE 72/73 (LCP 5.2/3.0 s, TBT 220/660 ms). DE's first LCP was consent text;
the repeat exposed initialization long tasks. This variation is why one score
cannot establish a country/domain cause. The three sites share the website code.
No sufficient CrUX field sample was available. After-release measurements must
identify their report URL and timestamp; do not substitute these baseline scores.

## Monthly review loop

- Cadence requested: first 28 October 2026, 10:00 Europe/Bucharest; then each 28th.
- Purpose: more distinct valid commercial contacts and suitable opportunities.
- Act when there is a verified contact defect, meaningful opportunity, or a prior
  intervention has enough evidence for keep/adjust/revert. Sparse samples can remain
  inconclusive; do not manufacture three changes on every run.
- Read the current custom growth-review skill and this playbook; select analytics,
  attribution, CRO, SEO/AI SEO, copywriting or RevOps only for the actual finding.
- Compare complete equivalent 30-day periods and 60/90 days where sparse. The first
  review is only two weeks after this release, not a full-month effect estimate.
- Self-check consent/tracking releases, lag, tests, internal demos, seasonality and
  brand/source separation before interpreting movement. AI referrals, citations and
  leads are separate measures; there is no ranking or monthly-growth guarantee.
- State: read previous dated reports and action decisions. Dedupe issue + page +
  release. Keep private aggregates and run state in ignored website/outputs, not Git.
- Output: a Romanian report and up to three specific proposed changes, each with
  evidence, owner, metric, baseline/unknown, effort, evaluation window and rollback.
- Gate: no autonomous publication, calls/forms, messages, spending, account/privacy
  changes or native configurator modifications. Draft and ask for implementation scope.
- Stop: unavailable/stale data is reported after bounded diagnostics; continue other
  sources. Escalate confirmed contact/indexing regressions promptly. Manual off switch
  is pause/delete the thread review automation in Codex Automations.

Scheduling is a separate product action; this file alone is not proof it is active.
