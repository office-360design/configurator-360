const FIREBASE_SDK_VERSION = '12.17.1';
const FIREBASE_APP_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
const FIREBASE_AUTH_MODULE_URL = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`;
const APP_NAME = '360-configurator-share-app';
const FUNCTIONS_REGION = 'europe-west1';
const PROJECT_ID = 'configurator-360';

// Same Firebase Web App used by App Check and shared configurations. These web
// identifiers are public Firebase client configuration, not credentials.
const DEFAULT_FIREBASE_AUTH_CONFIG = Object.freeze({
  apiKey: 'AIzaSyBgS4VLxQYZnqW-YZJPKvuuocf5w_0kRwY',
  authDomain: 'configurator-360.firebaseapp.com',
  projectId: 'configurator-360',
  appId: '1:719238533149:web:9e0b8a97375731b8eaf6f4',
});

let authContextPromise = null;

function firebaseAuthConfig() {
  const override = globalThis.FIREBASE_AUTH_CONFIG && typeof globalThis.FIREBASE_AUTH_CONFIG === 'object'
    ? globalThis.FIREBASE_AUTH_CONFIG
    : {};
  return {
    apiKey: String(override.apiKey || DEFAULT_FIREBASE_AUTH_CONFIG.apiKey),
    authDomain: String(override.authDomain || DEFAULT_FIREBASE_AUTH_CONFIG.authDomain),
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

    return { app, auth, authModule, provider };
  })();

  return authContextPromise;
}

export async function observeGoogleAuth(callback) {
  const { auth, authModule } = await getAuthContext();
  return authModule.onAuthStateChanged(
    auth,
    (user) => callback?.(normalizeUser(user)),
    (error) => {
      console.error('Firebase Authentication state listener failed.', error);
      callback?.(null, error);
    },
  );
}

export async function signInWithGoogle() {
  const { auth, authModule, provider } = await getAuthContext();
  const result = await authModule.signInWithPopup(auth, provider);
  return normalizeUser(result.user);
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

