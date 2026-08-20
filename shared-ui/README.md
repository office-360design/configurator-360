# 360 Configurator shared UI

Reusable interface primitives for all product configurators in this repository.

The package contains the common top bar, account menu, language menu, viewport tools,
feedback toast, icons, locale defaults, and shared UI styling. Product-specific panels
remain inside their own configurator folders.

A configurator can import the JavaScript API from `shared-ui/src/index.js` and the shared
CSS from `shared-ui/styles/index.css`. Its Vite development server must allow imports
from the repository root; see the pergola configurator's `vite.config.js`.

## Standalone/static configurators

`mountStandaloneConfiguratorShell()` mounts the same shared navigation bar on static
configurators that do not use the pergola Vite application shell. The window and roof
configurators use this adapter, while their product controls and Three.js logic remain
unchanged.

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

`src/configuratorSeo.js` supplies lightweight, domain-aware SEO metadata for the five standalone configurator applications. It derives the locale from the hostname and sets the document language, localized title and description, `index, follow`, self-canonical URL, Open Graph basics, and reciprocal EN/RO/DE `hreflang` links.

The marketing website remains the richer SEO surface. The standalone configurators stay indexable, but use this helper for a smaller, product-focused SEO identity.

## Firebase App Check for share links

`src/firebaseAppCheck.js` provides the common browser App Check client for Window, Roof, Pergola and Hall share links. It uses Firebase JS SDK 12.17.1 from Google's official CDN and the reCAPTCHA Enterprise provider.

The runtime configuration is `firebase-app-check.json`. Leave `siteKey` empty while preparing the backend; an empty key keeps the legacy Firestore transport active. Once the second `360configurator` Firebase web app is registered for App Check, paste its public reCAPTCHA Enterprise site key there. From that point on, `shareState.js` uses the App Check-enforced callable Functions instead of direct Firestore requests.

Localhost uses Firebase's App Check debug mode when `debugOnLocalhost` is true. Register the debug token printed in the browser console in Firebase App Check before testing secure shares locally.
