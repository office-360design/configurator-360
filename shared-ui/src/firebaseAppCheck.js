const FIREBASE_SDK_VERSION = '12.17.1';
const FIREBASE_APP_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_APP_CHECK_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`;
const FIREBASE_FUNCTIONS_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-functions.js`;
const APP_NAME = '360-configurator-share-app';
const CONFIG_URL = new URL('../firebase-app-check.json', import.meta.url);

let runtimeConfigPromise = null;
let firebaseContextPromise = null;
let missingSiteKeyWarned = false;

function normalizeRuntimeConfig(value = {}) {
  return {
    provider: String(value.provider || 'recaptcha-enterprise').trim().toLowerCase(),
    siteKey: String(value.siteKey || '').trim(),
    functionsRegion: String(value.functionsRegion || 'europe-west1').trim() || 'europe-west1',
    debugOnLocalhost: value.debugOnLocalhost !== false,
  };
}

function isLocalDevelopmentHost() {
  if (typeof location === 'undefined') return false;
  const host = String(location.hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

async function loadRuntimeConfig() {
  if (runtimeConfigPromise) return runtimeConfigPromise;

  runtimeConfigPromise = (async () => {
    const globalOverride = globalThis.FIREBASE_APP_CHECK_CONFIG;
    if (globalOverride && typeof globalOverride === 'object') {
      return normalizeRuntimeConfig(globalOverride);
    }

    try {
      const response = await fetch(CONFIG_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return normalizeRuntimeConfig(await response.json());
    } catch (error) {
      console.warn('Firebase App Check configuration could not be loaded; legacy share transport remains active.', error);
      return normalizeRuntimeConfig();
    }
  })();

  return runtimeConfigPromise;
}

function normalizeFirebaseConfig(firebaseConfig = {}) {
  const config = {
    apiKey: String(firebaseConfig.apiKey || '').trim(),
    projectId: String(firebaseConfig.projectId || '').trim(),
    appId: String(firebaseConfig.appId || '').trim(),
  };

  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error('Firebase App Check requires apiKey, projectId and appId.');
  }

  return config;
}

async function initializeFirebaseContext(firebaseConfig) {
  if (firebaseContextPromise) return firebaseContextPromise;

  firebaseContextPromise = (async () => {
    const runtimeConfig = await loadRuntimeConfig();
    if (!runtimeConfig.siteKey) return null;
    if (runtimeConfig.provider !== 'recaptcha-enterprise') {
      throw new Error(`Unsupported Firebase App Check provider: ${runtimeConfig.provider}.`);
    }

    const config = normalizeFirebaseConfig(firebaseConfig);

    // The web App Check debug provider is useful for localhost development. It is
    // explicitly limited to localhost/loopback so production browsers can never
    // opt themselves into debug attestation through this code path.
    if (
      runtimeConfig.debugOnLocalhost
      && isLocalDevelopmentHost()
      && typeof globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN === 'undefined'
    ) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    const [appModule, appCheckModule, functionsModule] = await Promise.all([
      import(FIREBASE_APP_MODULE_URL),
      import(FIREBASE_APP_CHECK_MODULE_URL),
      import(FIREBASE_FUNCTIONS_MODULE_URL),
    ]);

    const existingApp = appModule.getApps().find((candidate) => candidate.name === APP_NAME);
    const app = existingApp || appModule.initializeApp(config, APP_NAME);

    const appCheck = appCheckModule.initializeAppCheck(app, {
      provider: new appCheckModule.ReCaptchaEnterpriseProvider(runtimeConfig.siteKey),
      isTokenAutoRefreshEnabled: true,
    });

    const functions = functionsModule.getFunctions(app, runtimeConfig.functionsRegion);

    return {
      app,
      appCheck,
      functions,
      httpsCallable: functionsModule.httpsCallable,
      getToken: appCheckModule.getToken,
      runtimeConfig,
    };
  })();

  return firebaseContextPromise;
}

export async function isFirebaseAppCheckConfigured() {
  const config = await loadRuntimeConfig();
  return Boolean(config.siteKey);
}

export async function getFirebaseAppCheckStatus(firebaseConfig = null) {
  const runtimeConfig = await loadRuntimeConfig();
  const status = {
    configured: Boolean(runtimeConfig.siteKey),
    provider: runtimeConfig.provider,
    functionsRegion: runtimeConfig.functionsRegion,
    localDebugMode: Boolean(runtimeConfig.debugOnLocalhost && isLocalDevelopmentHost()),
    tokenAvailable: false,
  };

  if (!firebaseConfig || !runtimeConfig.siteKey) return status;

  try {
    const context = await initializeFirebaseContext(firebaseConfig);
    if (!context) return status;
    const token = await context.getToken(context.appCheck, false);
    status.tokenAvailable = Boolean(token?.token);
  } catch (error) {
    status.error = String(error?.message || error);
  }

  return status;
}

export async function callFirebaseShareFunction(functionName, data, firebaseConfig) {
  const runtimeConfig = await loadRuntimeConfig();
  if (!runtimeConfig.siteKey) {
    if (!missingSiteKeyWarned) {
      missingSiteKeyWarned = true;
      console.info(
        'Firebase App Check is not configured yet. Share links continue to use the legacy Firestore transport until shared-ui/firebase-app-check.json receives a reCAPTCHA Enterprise site key.'
      );
    }
    return null;
  }

  const context = await initializeFirebaseContext(firebaseConfig);
  if (!context) return null;

  // Force token acquisition before the callable request. The Functions SDK also
  // attaches App Check automatically, but doing this first produces an immediate,
  // readable client error if attestation itself is not working.
  await context.getToken(context.appCheck, false);

  const callable = context.httpsCallable(context.functions, functionName);
  const result = await callable(data);
  return result?.data ?? null;
}
