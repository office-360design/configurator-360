# 360 Configurator shared UI

Reusable interface primitives for all product configurators in this repository.

The package contains the common top bar, account menu, language menu, viewport tools,
feedback toast, icons, locale defaults, and shared UI styling. Product-specific panels
remain inside their own configurator folders.

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
