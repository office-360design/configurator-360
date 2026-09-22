const FIREBASE_SDK_VERSION = '12.18.0';
const FIREBASE_APP_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_AUTH_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`;
const APP_NAME = '360-configurator-share-app';
const FUNCTIONS_REGION = 'europe-west1';
const PROJECT_ID = 'configurator-360';
const FIREBASE_FALLBACK_AUTH_DOMAIN = 'configurator-360.firebaseapp.com';
const FIRST_PARTY_AUTH_DOMAINS = new Set([
  'www.360configurator.com',
  'www.360configurator.ro',
  'www.360konfigurator.de',
  'aks.360configurator.com',
]);
const REDIRECT_PENDING_STORAGE_KEY = '360-configurator:google-redirect-pending';
const REDIRECT_RESULT_TIMEOUT_MS = 8000;

// Same Firebase Web App used by App Check and shared configurations. These web
// identifiers are public Firebase client configuration, not credentials.
const DEFAULT_FIREBASE_AUTH_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBgS4VLxQYZnqW-YZJPKvuuocf5w_0kRwY',
  authDomain: FIREBASE_FALLBACK_AUTH_DOMAIN,
  projectId: 'configurator-360',
  appId: '1:719238533149:web:9e0b8a97375731b8eaf6f4',
});

let authContextPromise = null;

function currentFirstPartyAuthDomain() {
  if (typeof location === 'undefined' || location.protocol !== 'https:') return '';
  const hostname = String(location.hostname || '').toLowerCase().replace(/\.$/, '');
  return FIRST_PARTY_AUTH_DOMAINS.has(hostname) ? hostname : '';
}

function firebaseAuthConfig() {
  const override = globalThis.FIREBASE_AUTH_CONFIG && typeof globalThis.FIREBASE_AUTH_CONFIG === 'object'
    ? globalThis.FIREBASE_AUTH_CONFIG
    : {};
  const configuredAuthDomain = String(override.authDomain || DEFAULT_FIREBASE_AUTH_CONFIG.authDomain);
  return {
    apiKey: String(override.apiKey || DEFAULT_FIREBASE_AUTH_CONFIG.apiKey),
    // Production platform domains proxy /__/auth/* to Firebase Hosting. Using
    // the current first-party hostname prevents redirect auth from depending on
    // third-party storage, which Safari/Firefox/Opera can partition or block.
    authDomain: currentFirstPartyAuthDomain() || configuredAuthDomain,
    projectId: String(override.projectId || DEFAULT_FIREBASE_AUTH_CONFIG.projectId),
    appId: String(override.appId || DEFAULT_FIREBASE_AUTH_CONFIG.appId),
  };
}


function callableUrl(name) {
  return `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

async function callDomainAuthFunction(name, data = {}, { requireAuth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (requireAuth) {
    const token = await getFirebaseIdToken();
    if (!token) {
      const error = new Error('Google login is required.');
      error.code = 'auth-required';
      throw error;
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(callableUrl(name), {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers,
    body: JSON.stringify({ data }),
  });

  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Domain authentication request failed (${response.status}).`;
    const error = new Error(message);
    error.code = payload?.error?.status || `http-${response.status}`;
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function normalizeUser(user) {
  if (!user) return null;
  return Object.freeze({
    uid: String(user.uid || ''),
    displayName: String(user.displayName || '').trim(),
    email: String(user.email || '').trim(),
    photoURL: String(user.photoURL || '').trim(),
  });
}

function isOperaBrowser() {
  if (typeof navigator === 'undefined') return false;
  const brands = navigator.userAgentData?.brands;
  if (Array.isArray(brands) && brands.some((entry) => /opera/i.test(String(entry?.brand || '')))) return true;
  return /\bOPR\//i.test(String(navigator.userAgent || '')) || /\bOpera\b/i.test(String(navigator.userAgent || ''));
}

function browserStorages() {
  if (typeof window === 'undefined') return [];
  const storages = [];
  for (const name of ['sessionStorage', 'localStorage']) {
    try {
      const storage = window[name];
      if (storage) storages.push(storage);
    } catch {
      // Storage can be unavailable in hardened/private browser contexts.
    }
  }
  return storages;
}

function readRedirectPending() {
  for (const storage of browserStorages()) {
    try {
      const raw = storage.getItem(REDIRECT_PENDING_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // Try the next first-party storage mechanism.
    }
  }
  return null;
}

function rememberRedirectPending(reason = 'fallback') {
  const value = JSON.stringify({
    reason,
    startedAt: new Date().toISOString(),
    returnUrl: typeof location !== 'undefined' ? location.href : '',
  });
  for (const storage of browserStorages()) {
    try {
      storage.setItem(REDIRECT_PENDING_STORAGE_KEY, value);
      return;
    } catch {
      // Fall back from sessionStorage to localStorage only when needed.
    }
  }
}

function clearRedirectPending() {
  for (const storage of browserStorages()) {
    try { storage.removeItem(REDIRECT_PENDING_STORAGE_KEY); } catch { /* best effort */ }
  }
}

function redirectResultWithTimeout(authModule, auth) {
  const resultPromise = authModule.getRedirectResult(auth)
    .then((result) => ({ status: 'done', result }))
    .catch((error) => ({ status: 'error', error }));
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve({ status: 'timeout', result: null }), REDIRECT_RESULT_TIMEOUT_MS);
  });
  return Promise.race([resultPromise, timeoutPromise]);
}

async function settleGoogleRedirect(auth, authModule) {
  const pending = readRedirectPending();
  // Only touch redirect storage when this tab actually started a redirect.
  // This keeps ordinary popup/page-load authentication fast and prevents a
  // broken helper endpoint from delaying every visitor by the timeout window.
  if (!pending) return null;
  const outcome = await redirectResultWithTimeout(authModule, auth);
  if (outcome.status === 'error') {
    const details = authErrorDetails(outcome.error);
    rememberAuthError({ ...details, flow: 'redirect-result' });
    console.error('Firebase Google redirect result failed.', details, outcome.error);
    clearRedirectPending();
    return null;
  }
  if (outcome.status === 'timeout') {
    if (pending) {
      const details = {
        code: 'auth/redirect-result-timeout',
        message: `Firebase redirect result did not settle within ${REDIRECT_RESULT_TIMEOUT_MS}ms.`,
        sdkVersion: FIREBASE_SDK_VERSION,
        authDomain: firebaseAuthConfig().authDomain,
        visibilityState: typeof document !== 'undefined' ? String(document.visibilityState || '') : '',
        userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '',
        flow: 'redirect-result',
      };
      rememberAuthError(details);
      console.warn('Firebase Google redirect result timed out; continuing with the auth-state observer.', details);
    }
    return null;
  }

  await auth.authStateReady?.();
  const user = auth.currentUser || outcome.result?.user || null;
  if (user) clearRedirectPending();
  else if (pending) {
    const details = {
      code: 'auth/redirect-result-missing',
      message: 'A Google redirect was pending but returned without a Firebase user.',
      sdkVersion: FIREBASE_SDK_VERSION,
      authDomain: firebaseAuthConfig().authDomain,
      visibilityState: typeof document !== 'undefined' ? String(document.visibilityState || '') : '',
      userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '',
      flow: 'redirect-result',
    };
    rememberAuthError(details);
    console.warn('Firebase Google redirect completed without an authenticated user.', details);
    clearRedirectPending();
  }
  return normalizeUser(user);
}

async function getAuthContext() {
  if (authContextPromise) return authContextPromise;

  authContextPromise = (async () => {
    const [appModule, authModule] = await Promise.all([
      import(FIREBASE_APP_MODULE_URL),
      import(FIREBASE_AUTH_MODULE_URL),
    ]);

    const existingApp = appModule.getApps().find((candidate) => candidate.name === APP_NAME);
    const app = existingApp || appModule.initializeApp(firebaseAuthConfig(), APP_NAME);
    const auth = authModule.getAuth(app);
    const provider = new authModule.GoogleAuthProvider();
    const redirectResultPromise = settleGoogleRedirect(auth, authModule);

    return { app, auth, authModule, provider, redirectResultPromise };
  })();

  return authContextPromise;
}

export async function observeGoogleAuth(callback) {
  const { auth, authModule, redirectResultPromise } = await getAuthContext();
  // getRedirectResult() must be consumed after returning from a full-page OAuth
  // redirect. Bound the wait so a browser bug can never leave the configurator
  // indefinitely stuck in its authentication loading state.
  await redirectResultPromise;
  return authModule.onAuthStateChanged(
    auth,
    (user) => {
      if (user) clearRedirectPending();
      callback?.(normalizeUser(user));
    },
    (error) => {
      console.error('Firebase Authentication state listener failed.', error);
      callback?.(null, error);
    },
  );
}

function authErrorDetails(error) {
  return {
    code: String(error?.code || 'auth/unknown'),
    message: String(error?.message || 'Unknown Firebase Authentication error.'),
    name: String(error?.name || 'Error'),
    sdkVersion: FIREBASE_SDK_VERSION,
    authDomain: firebaseAuthConfig().authDomain,
    visibilityState: typeof document !== 'undefined' ? String(document.visibilityState || '') : '',
    userAgent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '',
  };
}

function rememberAuthError(details) {
  try {
    sessionStorage.setItem('360-configurator:last-auth-error', JSON.stringify({
      ...details,
      recordedAt: new Date().toISOString(),
    }));
  } catch {
    // Diagnostics must never interfere with authentication.
  }
}

function waitForAuthSettle(delayMs = 350) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function startGoogleRedirect(auth, authModule, provider, reason) {
  rememberRedirectPending(reason);
  try {
    // This navigates the current tab away. In normal operation the promise does
    // not resolve before navigation; getRedirectResult() consumes the result when
    // the configurator loads again.
    await authModule.signInWithRedirect(auth, provider);
    return null;
  } catch (error) {
    clearRedirectPending();
    const details = authErrorDetails(error);
    rememberAuthError({ ...details, flow: 'redirect-start', reason });
    console.error('Firebase Google redirect sign-in could not be started.', details, error);
    throw error;
  }
}

export async function signInWithGoogle() {
  const { auth, authModule, provider, redirectResultPromise } = await getAuthContext();
  await redirectResultPromise;

  // Opera has been observed to leave Firebase popup auth waiting forever after
  // account selection while logging COOP window.frames warnings. Avoid popup
  // window communication entirely there and use the first-party redirect flow.
  if (isOperaBrowser() && currentFirstPartyAuthDomain()) {
    return startGoogleRedirect(auth, authModule, provider, 'opera-preferred');
  }

  try {
    const result = await authModule.signInWithPopup(auth, provider);
    await auth.authStateReady?.();
    const user = auth.currentUser || result.user;
    if (!user) {
      const error = new Error('Google sign-in completed without an authenticated Firebase user.');
      error.code = 'auth/popup-auth-state-missing';
      throw error;
    }
    return normalizeUser(user);
  } catch (error) {
    const code = String(error?.code || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      await waitForAuthSettle();
      if (auth.currentUser) return normalizeUser(auth.currentUser);
    }

    // If the environment refuses popup mechanics, retry through a full-page
    // redirect. Do not redirect after a deliberate popup close: that would turn
    // the user's cancellation into an unexpected navigation.
    const redirectFallbackCodes = new Set([
      'auth/popup-blocked',
      'auth/operation-not-supported-in-this-environment',
      'auth/web-storage-unsupported',
      'auth/internal-error',
    ]);
    if (redirectFallbackCodes.has(code) && currentFirstPartyAuthDomain()) {
      const details = authErrorDetails(error);
      rememberAuthError({ ...details, flow: 'popup-to-redirect' });
      console.warn('Firebase popup sign-in failed; retrying with redirect.', details, error);
      return startGoogleRedirect(auth, authModule, provider, `popup-fallback:${code}`);
    }

    const details = authErrorDetails(error);
    rememberAuthError({ ...details, flow: 'popup' });
    console.error('Firebase Google popup sign-in failed.', details, error);
    throw error;
  }
}

export async function signOutGoogle() {
  const { auth, authModule } = await getAuthContext();
  await authModule.signOut(auth);
}

export async function getFirebaseIdToken() {
  const { auth } = await getAuthContext();
  const user = auth.currentUser;
  if (!user) return '';
  return user.getIdToken();
}

export async function createDomainAuthHandoff(targetOrigin) {
  const result = await callDomainAuthFunction(
    'createDomainAuthHandoff',
    { targetOrigin: String(targetOrigin || '') },
    { requireAuth: true },
  );
  const handoffId = String(result?.handoffId || '');
  if (!handoffId) throw new Error('The domain authentication handoff could not be created.');
  return handoffId;
}

export async function redeemDomainAuthHandoff(handoffId) {
  const result = await callDomainAuthFunction('redeemDomainAuthHandoff', {
    handoffId: String(handoffId || ''),
  });
  const customToken = String(result?.customToken || '');
  if (!customToken) throw new Error('The domain authentication handoff could not be redeemed.');
  return customToken;
}

export async function signInWithDomainCustomToken(customToken) {
  const { auth, authModule } = await getAuthContext();
  const result = await authModule.signInWithCustomToken(auth, String(customToken || ''));
  return normalizeUser(result.user);
}

