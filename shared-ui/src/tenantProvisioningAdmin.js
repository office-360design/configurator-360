import {
  getFirebaseIdToken,
  observeGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
} from './firebaseAuth.js?v=26';

const FUNCTION_URL = 'https://europe-west1-configurator-360.cloudfunctions.net/provisionTenant';
const TENANT_SUFFIX = '.360configurator.com';
const TENANT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const LOGO_TARGET_BYTES = 190_000;
const LOGO_MAX_DIMENSION = 512;
const CONFIGURATOR_PATHS = Object.freeze({
  window: '/window-configurator/',
  pergola: '/pergola-configurator/',
  roof: '/roof-configurator/',
  solar: '/solar-configurator/',
  hall: '/hall-configurator/',
  fence: '/fence-configurator/',
});
const RESERVED_SLUGS = new Set([
  'www', 'aks', 'admin', 'api', 'app', 'assets', 'auth', 'billing', 'cdn', 'demo',
  'dev', 'ftp', 'mail', 'staging', 'static', 'status', 'support', 'test',
]);

const authState = document.querySelector('#authState');
const authButton = document.querySelector('#authButton');
const provisioningCard = document.querySelector('#provisioningCard');
const tenantForm = document.querySelector('#tenantForm');
const companyNameInput = document.querySelector('#companyName');
const slugInput = document.querySelector('#slug');
const slugHint = document.querySelector('#slugHint');
const logoInput = document.querySelector('#logo');
const logoPreview = document.querySelector('#logoPreview');
const logoPreviewWrap = document.querySelector('#logoPreviewWrap');
const tenantPreview = document.querySelector('#tenantPreview');
const formStatus = document.querySelector('#formStatus');
const createButton = document.querySelector('#createButton');
const resultCard = document.querySelector('#resultCard');
const resultTitle = document.querySelector('#resultTitle');
const resultCopy = document.querySelector('#resultCopy');
const resultLinks = document.querySelector('#resultLinks');

let currentUser = null;
let slugWasEdited = false;
let logoObjectUrl = '';

function setStatus(message = '', kind = '') {
  formStatus.textContent = message;
  if (kind) formStatus.dataset.kind = kind;
  else delete formStatus.dataset.kind;
}

function normalizeSlugCandidate(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function tenantUrl(slug) {
  return slug ? `https://${slug}${TENANT_SUFFIX}/` : '';
}

function updateSlugState() {
  const slug = normalizeSlugCandidate(slugInput.value);
  if (slugInput.value !== slug) slugInput.value = slug;

  const valid = Boolean(slug) && TENANT_SLUG_PATTERN.test(slug) && !RESERVED_SLUGS.has(slug);
  const url = tenantUrl(slug);
  tenantPreview.textContent = url || '—';
  tenantPreview.href = valid ? url : '#';
  tenantPreview.toggleAttribute('aria-disabled', !valid);

  if (!slug) {
    slugHint.textContent = 'Lowercase letters, numbers and hyphens only.';
    slugHint.style.color = '';
  } else if (RESERVED_SLUGS.has(slug)) {
    slugHint.textContent = 'This subdomain is reserved.';
    slugHint.style.color = '#b42318';
  } else if (!TENANT_SLUG_PATTERN.test(slug)) {
    slugHint.textContent = 'Subdomain must start and end with a letter or number.';
    slugHint.style.color = '#b42318';
  } else {
    slugHint.textContent = 'Subdomain format is valid; final availability is checked when creating the tenant.';
    slugHint.style.color = '#067647';
  }
}

function selectedConfigurators() {
  const result = Object.fromEntries(Object.keys(CONFIGURATOR_PATHS).map((id) => [id, false]));
  tenantForm.querySelectorAll('input[name="configurator"]:checked').forEach((input) => {
    if (input.value in result) result[input.value] = true;
  });
  return result;
}

function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the optimized logo.'));
    reader.readAsDataURL(blob);
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function optimizeLogo(file) {
  if (!file) return '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Logo must be a PNG, JPEG, or WebP image.');
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, LOGO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));

    for (let sizeAttempt = 0; sizeAttempt < 3; sizeAttempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { alpha: true });
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.9, 0.78, 0.64, 0.5]) {
        const blob = await canvasBlob(canvas, 'image/webp', quality);
        if (blob && blob.size > 0 && blob.size <= LOGO_TARGET_BYTES) {
          return dataUrlFromBlob(blob);
        }
      }

      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
    }
  } finally {
    bitmap.close?.();
  }

  throw new Error('The logo is too complex to optimize below 200 KB. Use a simpler or smaller image.');
}

async function callProvisionTenant(data) {
  const token = await getFirebaseIdToken();
  if (!token) throw Object.assign(new Error('Sign in with Google first.'), { code: 'unauthenticated' });

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });

  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Tenant provisioning failed (${response.status}).`);
    error.code = String(payload?.error?.status || `http-${response.status}`).toLowerCase();
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function renderProvisioned(result) {
  const url = String(result?.url || '');
  const companyName = String(result?.companyName || 'Tenant');
  const configurators = result?.configurators && typeof result.configurators === 'object'
    ? result.configurators
    : {};

  resultTitle.textContent = `${companyName} is live`;
  resultCopy.textContent = url;
  resultLinks.replaceChildren();

  const homeLink = document.createElement('a');
  homeLink.href = url;
  homeLink.target = '_blank';
  homeLink.rel = 'noopener';
  homeLink.textContent = 'Open customer site';
  resultLinks.append(homeLink);

  Object.entries(CONFIGURATOR_PATHS).forEach(([id, path]) => {
    if (configurators[id] !== true) return;
    const link = document.createElement('a');
    link.href = new URL(path, url).href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = id[0].toUpperCase() + id.slice(1);
    resultLinks.append(link);
  });

  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function provisioningErrorMessage(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('already-exists')) return 'That subdomain is already in use.';
  if (code.includes('permission-denied')) {
    return `This Firebase account is not a provisioning admin. Current UID: ${currentUser?.uid || 'unknown'}`;
  }
  if (code.includes('unauthenticated')) return 'Sign in with Google before creating a tenant.';
  if (code.includes('invalid-argument')) return error.message || 'Check the tenant details and try again.';
  return error?.message || 'Tenant provisioning failed.';
}

companyNameInput.addEventListener('input', () => {
  if (!slugWasEdited) {
    slugInput.value = normalizeSlugCandidate(companyNameInput.value);
    updateSlugState();
  }
});

slugInput.addEventListener('input', () => {
  slugWasEdited = true;
  updateSlugState();
});

logoInput.addEventListener('change', () => {
  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
  logoObjectUrl = '';
  const [file] = logoInput.files || [];
  if (!file) {
    logoPreviewWrap.hidden = true;
    logoPreview.removeAttribute('src');
    return;
  }
  logoObjectUrl = URL.createObjectURL(file);
  logoPreview.src = logoObjectUrl;
  logoPreviewWrap.hidden = false;
});

tenantForm.addEventListener('reset', () => {
  window.setTimeout(() => {
    slugWasEdited = false;
    resultCard.hidden = true;
    setStatus();
    updateSlugState();
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    logoObjectUrl = '';
    logoPreviewWrap.hidden = true;
    logoPreview.removeAttribute('src');
  }, 0);
});

tenantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentUser) {
    setStatus('Sign in with Google first.', 'error');
    return;
  }

  const companyName = companyNameInput.value.trim();
  const slug = normalizeSlugCandidate(slugInput.value);
  const configurators = selectedConfigurators();
  if (!companyName) {
    setStatus('Enter the company name.', 'error');
    return;
  }
  if (!TENANT_SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    setStatus('Choose a valid, non-reserved subdomain.', 'error');
    return;
  }
  if (!Object.values(configurators).some(Boolean)) {
    setStatus('Enable at least one configurator.', 'error');
    return;
  }

  createButton.disabled = true;
  resultCard.hidden = true;
  setStatus('Preparing tenant…');

  try {
    const [logoFile] = logoInput.files || [];
    const logoDataUrl = logoFile ? await optimizeLogo(logoFile) : '';
    setStatus('Creating tenant…');
    const result = await callProvisionTenant({ companyName, slug, configurators, logoDataUrl });
    setStatus('Tenant created successfully.', 'success');
    renderProvisioned(result);
  } catch (error) {
    console.error('Tenant provisioning failed.', error);
    setStatus(provisioningErrorMessage(error), 'error');
  } finally {
    createButton.disabled = false;
  }
});

authButton.addEventListener('click', async () => {
  authButton.disabled = true;
  try {
    if (currentUser) await signOutGoogle();
    else await signInWithGoogle();
  } catch (error) {
    console.error('Admin authentication failed.', error);
    authState.textContent = error?.message || 'Authentication failed.';
  } finally {
    authButton.disabled = false;
  }
});

await observeGoogleAuth((user) => {
  currentUser = user;
  if (user) {
    authState.textContent = `${user.email || user.displayName || 'Signed in'} · UID ${user.uid}`;
    authButton.textContent = 'Sign out';
    authButton.hidden = false;
    provisioningCard.hidden = false;
  } else {
    authState.textContent = 'Sign in with a provisioning-admin Google account.';
    authButton.textContent = 'Sign in with Google';
    authButton.hidden = false;
    provisioningCard.hidden = true;
  }
});

updateSlugState();
