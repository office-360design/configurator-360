# 360 Configurator shared UI

Reusable interface primitives for all product configurators in this repository.

The package contains the common top bar, account menu, language menu, viewport tools,
feedback toast, icons, locale defaults, and shared UI styling. Product-specific panel
markup and state remain inside each configurator; common control styling and
presentation helpers can be adopted independently.

A configurator can import the JavaScript API from `shared-ui/src/index.js` and the shared
CSS from `shared-ui/styles/index.css`. Its Vite development server must allow imports
from the repository root; see the pergola configurator's `vite.config.js`.

## Standalone/static configurators

`mountStandaloneConfiguratorShell()` mounts the same shared navigation, account, language,
feedback and tools shell for every configurator. Window, Roof, Hall, Solar, Pergola, Fence and Cardbox all
use this shell; only product-specific callbacks and scene/control logic remain inside each
configurator folder.

Product settings panels use the shared `shared-settings-panel` and
`shared-settings-toggle` classes so all configurators place their controls at the same
right-side coordinates and use the same collapse geometry.

## Settings control foundation (Hall, Fence and Roof)

`styles/panelControls.css` is an opt-in stylesheet based on Hall's existing panel.
Load it after `styles/standalone.css` and before product-specific styles, and add
`shared-panel-controls` to the settings container. Hall, Fence and Roof now opt in;
other configurators do not load or opt into it yet. It does not change the shell's panel position, width, collapse
button, footer, or stacking order.

The shared styles cover the introduction (`panel-section`, `intro-section`,
`eyebrow`, `section-copy`), accordions (`accordion-section`, `accordion-toggle`,
`accordion-panel`), range/number pairs (`range-control`, `control-label`,
`range-row`, `number-input`), native selects (`select-label`) and checkbox switches
(`toggle-stack`, `toggle-row`). Existing responsive rules, dark themes and switch/
chevron transitions are preserved. `--shared-panel-accent`, `--shared-panel-accent-dark`,
`--shared-panel-ink`, `--shared-panel-muted` and `--shared-panel-border` expose the
base palette. The zero-specificity `:where(.shared-panel-controls)` scope keeps
the original selector priorities and prevents changes outside the adopted panel.

Import presentation helpers directly from `src/components/panelControls.js`:

```js
import { bindPanelAccordions, bindPanelRange } from './components/panelControls.js';

const unbindAccordions = bindPanelAccordions(panel);
const unbindRange = bindPanelRange(control, {
  format: (value) => `${value.toFixed(1)} m`,
  immediateOnInput: false,
  onChange(value, { immediate }) {
    // The product adapter owns state, validation and rebuild scheduling.
  },
});
```

Accordion sections remain independent: clicking one never closes its siblings.
The helper updates `is-open`, `aria-expanded` and native `hidden` together. Keep
those three initial values consistent in the markup. Native buttons retain
keyboard activation. Both binders return listener cleanup functions; call the
cleanup before rebinding a mounted control.

Range controls keep their native inputs, dynamically read min/max bounds, and
preserve input/change/blur notifications. They do not define units, round values
to steps, infer product state, or schedule model rebuilds. Hall still owns its
opening constraints, presets, translations, BOM, pricing and all scene callbacks.
Fence also adopts shared `choice-grid` / `choice-card` icon buttons and
`finish-row` / `finish-swatch` labelled color choices, including responsive and
dark-mode styles. Layout-specific grid columns and panel preview drawings stay
in Fence. Choice selection, published finish data and archived finish handling
remain product-owned; the shared stylesheet never changes a selected value.

Fence uses `bindPanelAccordions` but deliberately retains its numeric adapter:
sliders commit on input, number fields commit on change (Enter blurs the field),
and values convert between metric and imperial units before normalization. The
Hall range binder has different notification timing and is not substituted.
Dynamic gate controls use the same shared range/select styling while retaining
their delegated handlers, capacity checks, run selection and placement rules.
Gate-card spacing and full-width position sliders remain Fence layout rules.
Generic image choices and other configurators can be added in later passes.

Roof groups its existing settings into Roof type, Dimensions and Covering
accordions, with Roof type initially open. Its custom-plan upload stays in Roof
type. It reuses choice-card styling through `aria-pressed="true"`; callers may
use either that native button state or the existing `selected` class. Roof's
translation bindings use stable IDs instead of positional section selectors.
Its native numeric adapter still owns millimeter/decimal-foot display, slider
values in meters, change/blur timing and material-specific pitch minimums.
`range-row--wide` gives longer display values a 100px number field without
changing the default Hall/Fence range layout.

Run `node shared-ui/tests/hall-panel-preservation.mjs` after installing the root
dependencies and Chromium (`npx playwright install chromium`). The test compares
Hall with pre-extraction commit `c520a637` using native Chromium controls: state,
callback order/arguments, metrics, price estimates, bounds, keyboard activation,
EN/RO/DE text and computed styles at four viewport sizes in three theme states.
It exercises HallUI with recorded scene callbacks; it does not render WebGL or
contact authentication/backends. `HALL_PANEL_BASELINE_DIR` can point to an unpacked
baseline for shallow checkouts; `CHROMIUM_PATH` can select an installed browser.

Run `node shared-ui/tests/fence-panel-preservation.mjs` for Fence's before/after
comparison against `5f8e75e`. It checks state, callback timing, derived metrics,
pricing/BOM and CSV output across layouts, panel styles, metric/imperial controls,
numeric bounds, finishes, foundations, dynamic gates, capacity, EN/RO/DE and
currencies. It also checks panel overflow at five viewport sizes in both themes.
`FENCE_PANEL_BASELINE_DIR` supplies an unpacked baseline when needed. This test
also records scene callbacks without starting WebGL, authentication or backends.

Run `node shared-ui/tests/roof-panel-preservation.mjs` for Roof's comparison
against `4e1a470` (or supply `ROOF_PANEL_BASELINE_DIR`). It checks the existing
control state and callback behavior, units, covering pitch rules, custom-file
selection/drop/removal, translations and BOM inclusion/CSV. Fixed model metrics
isolate the UI/BOM contract from geometry. New accordion keyboard behavior and
layout checks cover five viewports in light/dark mode and EN/RO/DE. Like the
other UI checks, it does not start the WebGL scene or backend services.

## Shared tools

`shared-ui/src/tools/registry.js` defines reusable tool contracts. Tools are
opt-in: each configurator selects only the tools its developer supports. The
shared definition owns the launcher icon, label, active/disabled presentation,
and generic configuration defaults; the configurator owns scene behavior such
as compass position, scale, rotation, and height.

Window and Roof currently pass `items: []`, so their Tools launcher is empty.
Pergola continues to use the existing four tools through the shared defaults.

## Undo

`SharedUndoManager` provides the common history stack and event grouping. Each
configurator must provide `captureState()` and `restoreState()` adapters because
product state and rebuild logic are configurator-specific.

## Configurator SEO helper

`src/configuratorSeo.js` supplies lightweight, domain-aware SEO metadata for the standalone configurator applications. It derives the locale from the hostname and sets the document language, localized title and description, `index, follow`, self-canonical URL, Open Graph basics, and reciprocal EN/RO/DE `hreflang` links.

The marketing website remains the richer SEO surface. The standalone configurators stay indexable, but use this helper for a smaller, product-focused SEO identity.

## Share App Check behaviour

`src/firebaseAppCheck.js` implements lazy reCAPTCHA Enterprise/App Check for share creation. It does not initialize App Check on page load and disables background token auto-refresh. `shareState.js` first asks the Firebase backend whether the current month's reCAPTCHA safety budget permits App Check. Below 9,500 assessments it uses the App Check-protected callable create function; at/above the threshold it transparently uses the existing reCAPTCHA-free Firestore share path. Opening an existing shared link stays reCAPTCHA-free.

The public reCAPTCHA Enterprise site key is configured in `firebase-app-check.json`.


## Google account login

The shared account menu uses Firebase Authentication with the Google provider. Guests are shown as `Hello, guest`; successful Google sign-in replaces the greeting with the Google account display name. Authentication is owned entirely by the shared shell and is therefore identical across Window, Roof, Hall, Solar, Pergola, Fence and Cardbox through the same Firebase Web App used by App Check. Configurators do not implement their own account/login state.

Firebase Console setup required: enable **Authentication → Sign-in method → Google** and add every production hostname to **Authentication → Settings → Authorized domains**.


## Shared shell adapters

Configurator-local shell files are adapters only. They may provide product-specific callbacks
such as `captureState()`, `restoreState()`, reset/undo behavior or tool actions, but they must not
render or own the common top bar, account menu, Google authentication, language menu, language
selection/state, feedback UI or shared tool interaction lifecycle. Those remain in `shared-ui`.

## Saved configurations

The shared shell owns account-based configuration saving for every configurator. The top-bar **Save** button captures the product-specific state through the configurator adapter and stores it under the signed-in Firebase/Google user. **Saved configurations** in the account menu opens the same shared modal in Window, Roof, Hall, Solar, Pergola, Fence and Cardbox.

Saved configuration pointers and local drafts are tenant-scoped on `*.360configurator.com`. The public `.com/.ro/.de` sites keep their existing shared platform scope. Crossing between scopes with **Change site domain** uses Share transport rather than attempting to reuse a private saved-document id from the source scope.

Configurator adapters only provide `productId`, `captureState()` and `restoreState()`; they do not implement their own saved-project UI or storage. Saving account data uses Firebase Authentication but intentionally does not initialize or refresh App Check, so reCAPTCHA assessments remain exclusive to the **Share** action.


### Account save persistence and language switching

Private account saves have no application TTL and are not part of the public Share FIFO quota.
Only an explicit Saved configurations → Delete action calls `deleteUserConfiguration`; the
90-day expiry and 200 MiB cleanup apply only to `sharedConfigurations`. Temporary load failures
do not clear the local pointer to a private save.

Language switching is owned by the shared shell and is now translation-only. Selecting English,
Romanian or German keeps the current URL, hostname, account/save association and configurator
state untouched; the shell changes only its persisted locale and asks the product adapter to
apply that locale to product-specific strings. The current hostname supplies only the first-visit
default language. The selected locale is stored by Common UI for the current origin so the same
language is reused by the other configurators on that site. Language changes never create a Share
record and never navigate to another country-domain configurator. Units and currency remain
independent user preferences and are not changed by the language selector.

### Direct configuration quotations

The shared configurator footer offers **Ask for quotation** beside **Add to cart**.
The form works for guests and signed-in users and collects contact details, a
project/delivery address and quantity. It sends the current configuration snapshot
as a JSON attachment, plus a share link when the configurator supports sharing.
Gas offers quotation only because its save/cart capability is disabled. Bookshelf
keeps its existing quotation-only UI and `requestBookshelfQuotation` factory flow.

The new callable `requestConfigurationQuotation` sends other product requests to
`office@360configurator.com` and a confirmation to the customer. It validates
origins, customer fields, product IDs and snapshot size, and applies a per-IP
cooldown. Requests are archived in the server-only
`configurationQuotationRequests` collection. Deploy the Firebase share workflow
with the frontend change; its function list includes the new callable.

Run `node --test scripts/validation/configuration-quotation.test.cjs` from the
repository root for mocked delivery, validation and footer checks. These tests
never send email.
