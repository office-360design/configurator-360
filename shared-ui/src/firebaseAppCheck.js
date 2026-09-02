const FIREBASE_SDK_VERSION = '12.18.0';
const FIREBASE_APP_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_APP_CHECK_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app-check.js`;
const FIREBASE_FUNCTIONS_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-functions.js`;
const APP_NAME = '360-configurator-share-app';
const CONFIG_URL = new URL('../firebase-app-check.json', import.meta.url);

let runtimeConfigPromise = null;
let protectedFirebaseContextPromise = null;
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
    authDomain: String(firebaseConfig.authDomain || '').trim(),
    projectId: String(firebaseConfig.projectId || '').trim(),
    appId: String(firebaseConfig.appId || '').trim(),
  };

  if (!config.apiKey || !config.projectId || !config.appId) {
    throw new Error('Firebase App Check requires apiKey, projectId and appId.');
  }

  return config;
}

function callableEndpoint(projectId, region, functionName) {
  return `https://${encodeURIComponent(region)}-${encodeURIComponent(projectId)}.cloudfunctions.net/${encodeURIComponent(functionName)}`;
}

async function readCallableResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // handled below
  }

  if (!response.ok || payload?.error) {
    const message = String(payload?.error?.message || `Callable function returned HTTP ${response.status}.`);
    const error = new Error(message);
    error.code = String(payload?.error?.status || response.status || 'unknown');
    throw error;
  }

  return payload?.result ?? payload?.data ?? null;
}

async function initializeProtectedFirebaseContext(firebaseConfig) {
  if (protectedFirebaseContextPromise) return protectedFirebaseContextPromise;

  protectedFirebaseContextPromise = (async () => {
    const runtimeConfig = await loadRuntimeConfig();
    if (!runtimeConfig.siteKey) return null;
    if (runtimeConfig.provider !== 'recaptcha-enterprise') {
      throw new Error(`Unsupported Firebase App Check provider: ${runtimeConfig.provider}.`);
    }

    const config = normalizeFirebaseConfig(firebaseConfig);

    // The debug provider is strictly localhost-only. Production browsers can never
    // opt into debug attestation through this code path.
    if (
      runtimeConfig.debugOnLocalhost
      && isLocalDevelopmentHost()
      && typeof globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN === 'undefined'
    ) {
      globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    // These modules are intentionally imported only after the user presses Share
    // AND the backend says App Check is active. Merely loading a configurator does
    // not initialize reCAPTCHA or consume an assessment.
    const [appModule, appCheckModule, functionsModule] = await Promise.all([
      import(FIREBASE_APP_MODULE_URL),
      import(FIREBASE_APP_CHECK_MODULE_URL),
      import(FIREBASE_FUNCTIONS_MODULE_URL),
    ]);

    const existingApp = appModule.getApps().find((candidate) => candidate.name === APP_NAME);
    const app = existingApp || appModule.initializeApp(config, APP_NAME);

    const appCheck = appCheckModule.initializeAppCheck(app, {
      provider: new appCheckModule.ReCaptchaEnterpriseProvider(runtimeConfig.siteKey),
      // Critical quota optimisation: do not refresh App Check tokens in the
      // background. A new assessment is requested only when another Share action
      // needs a token and the cached token is no longer usable.
      isTokenAutoRefreshEnabled: false,
    });

    const functions = functionsModule.getFunctions(app, runtimeConfig.functionsRegion);

    return {
      appCheck,
      functions,
      httpsCallable: functionsModule.httpsCallable,
      getToken: appCheckModule.getToken,
    };
  })();

  return protectedFirebaseContextPromise;
}

export async function isFirebaseAppCheckConfigured() {
  const config = await loadRuntimeConfig();
  return Boolean(config.siteKey);
}

// This status check deliberately uses raw fetch instead of the Firebase Functions
// SDK. Once App Check has been initialized, the Functions SDK may try to obtain an
// App Check token for a callable request. That would consume an assessment BEFORE
// we know whether the 9,500 monthly safety threshold has already been reached.
export async function getFirebaseShareProtectionStatus(firebaseConfig) {
  const runtimeConfig = await loadRuntimeConfig();
  if (!runtimeConfig.siteKey) {
    return {
      mode: 'legacy',
      reason: 'app-check-not-configured',
      configured: false,
    };
  }

  const config = normalizeFirebaseConfig(firebaseConfig);
  const response = await fetch(
    callableEndpoint(config.projectId, runtimeConfig.functionsRegion, 'getShareProtectionStatus'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: {} }),
    },
  );

  const result = await readCallableResponse(response);
  return {
    configured: true,
    mode: result?.mode === 'app-check' ? 'app-check' : 'legacy',
    reason: String(result?.reason || ''),
    month: String(result?.month || ''),
    hardCap: Number(result?.hardCap || 9500),
    fallbackUntilMs: Number(result?.fallbackUntilMs || 0) || null,
  };
}

export async function callFirebaseProtectedShareFunction(functionName, data, firebaseConfig) {
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

  const context = await initializeProtectedFirebaseContext(firebaseConfig);
  if (!context) return null;

  // No forced refresh: reuse the cached token while it is valid. If it has
  // expired, this Share interaction obtains a new token and causes one new
  // reCAPTCHA Enterprise assessment.
  await context.getToken(context.appCheck, false);

  const callable = context.httpsCallable(context.functions, functionName);
  const result = await callable(data);
  return result?.data ?? null;
}
