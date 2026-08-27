import {
  getFirebaseIdToken,
  observeGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
} from './firebaseAuth.js?v=26';

const FUNCTION_BASE = 'https://europe-west1-configurator-360.cloudfunctions.net';
const FUNCTION_URLS = Object.freeze({
  provisionTenant: `${FUNCTION_BASE}/provisionTenant`,
  listTenants: `${FUNCTION_BASE}/listTenants`,
  getTenant: `${FUNCTION_BASE}/getTenant`,
  updateTenant: `${FUNCTION_BASE}/updateTenant`,
});
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
const CONFIGURATOR_LABELS = Object.freeze({
  window: 'Window',
  pergola: 'Pergola',
  roof: 'Roof',
  solar: 'Solar',
  hall: 'Hall',
  fence: 'Fence',
});
const RESERVED_SLUGS = new Set([
  'www', 'aks', 'admin', 'api', 'app', 'assets', 'auth', 'billing', 'cdn', 'demo',
  'dev', 'ftp', 'mail', 'staging', 'static', 'status', 'support', 'test',
]);

const authState = document.querySelector('#authState');
const authButton = document.querySelector('#authButton');
const adminWorkspace = document.querySelector('#adminWorkspace');

const tenantList = document.querySelector('#tenantList');
const tenantListStatus = document.querySelector('#tenantListStatus');
const tenantSearch = document.querySelector('#tenantSearch');
const refreshTenantsButton = document.querySelector('#refreshTenantsButton');

const tenantEditorCard = document.querySelector('#tenantEditorCard');
const tenantEditorTitle = document.querySelector('#tenantEditorTitle');
const tenantEditorMeta = document.querySelector('#tenantEditorMeta');
const tenantEditorForm = document.querySelector('#tenantEditorForm');
const manageCompanyName = document.querySelector('#manageCompanyName');
const manageDomain = document.querySelector('#manageDomain');
const manageLogo = document.querySelector('#manageLogo');
const manageRemoveLogo = document.querySelector('#manageRemoveLogo');
const manageCurrentLogo = document.querySelector('#manageCurrentLogo');
const manageNoLogo = document.querySelector('#manageNoLogo');
const manageLogoPreviewWrap = document.querySelector('#manageLogoPreviewWrap');
const manageLogoPreview = document.querySelector('#manageLogoPreview');
const manageStatus = document.querySelector('#manageStatus');
const saveTenantButton = document.querySelector('#saveTenantButton');
const tenantStatusButton = document.querySelector('#tenantStatusButton');
const openTenantButton = document.querySelector('#openTenantButton');
const closeTenantEditorButton = document.querySelector('#closeTenantEditorButton');

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
let manageLogoObjectUrl = '';
let tenantSummaries = [];
let currentManagedTenant = null;

function setStatus(element, message = '', kind = '') {
  element.textContent = message;
  if (kind) element.dataset.kind = kind;
  else delete element.dataset.kind;
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

function selectedConfigurators(form, name) {
  const result = Object.fromEntries(Object.keys(CONFIGURATOR_PATHS).map((id) => [id, false]));
  form.querySelectorAll(`input[name="${name}"]:checked`).forEach((input) => {
    if (input.value in result) result[input.value] = true;
  });
  return result;
}

function setConfiguratorSelection(form, name, configurators = {}) {
  form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
    input.checked = configurators?.[input.value] === true;
  });
}

function enabledConfiguratorLabels(configurators = {}) {
  return Object.entries(CONFIGURATOR_LABELS)
    .filter(([id]) => configurators?.[id] === true)
    .map(([, label]) => label);
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

async function callAdminFunction(functionName, data = {}) {
  const token = await getFirebaseIdToken();
  if (!token) throw Object.assign(new Error('Sign in with Google first.'), { code: 'unauthenticated' });

  const response = await fetch(FUNCTION_URLS[functionName], {
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
    const error = new Error(payload?.error?.message || `Tenant administration failed (${response.status}).`);
    error.code = String(payload?.error?.status || `http-${response.status}`).toLowerCase();
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function administrationErrorMessage(error) {
  const code = String(error?.code || '').toLowerCase();
  if (code.includes('already-exists')) return 'That subdomain is already in use.';
  if (code.includes('permission-denied')) {
    return `This Firebase account is not a tenant admin. Current UID: ${currentUser?.uid || 'unknown'}`;
  }
  if (code.includes('unauthenticated')) return 'Sign in with Google first.';
  if (code.includes('not-found')) return 'The tenant no longer exists.';
  if (code.includes('invalid-argument') || code.includes('failed-precondition')) {
    return error.message || 'Check the tenant details and try again.';
  }
  return error?.message || 'Tenant administration failed.';
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
    link.textContent = CONFIGURATOR_LABELS[id];
    resultLinks.append(link);
  });

  resultCard.hidden = false;
  resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function tenantMatchesSearch(tenant, query) {
  if (!query) return true;
  const haystack = `${tenant.companyName || ''} ${tenant.slug || ''} ${tenant.domain || ''}`.toLowerCase();
  return haystack.includes(query);
}

function renderTenantList() {
  const query = tenantSearch.value.trim().toLowerCase();
  const visible = tenantSummaries.filter((tenant) => tenantMatchesSearch(tenant, query));
  tenantList.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'tenant-list-empty';
    empty.textContent = query ? 'No tenants match this search.' : 'No Tier-1 tenants have been created yet.';
    tenantList.append(empty);
    return;
  }

  visible.forEach((tenant) => {
    const row = document.createElement('article');
    row.className = 'tenant-row';
    row.dataset.status = tenant.status;

    const main = document.createElement('div');
    main.className = 'tenant-row__main';
    const titleLine = document.createElement('div');
    titleLine.className = 'tenant-row__title-line';
    const title = document.createElement('strong');
    title.textContent = tenant.companyName || tenant.slug;
    const badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.dataset.status = tenant.status;
    badge.textContent = tenant.status === 'active' ? 'Active' : 'Suspended';
    titleLine.append(title, badge);

    const domain = document.createElement('span');
    domain.className = 'tenant-row__domain';
    domain.textContent = tenant.domain || `${tenant.slug}${TENANT_SUFFIX}`;

    const products = document.createElement('span');
    products.className = 'tenant-row__products';
    const labels = enabledConfiguratorLabels(tenant.configurators);
    products.textContent = labels.length ? labels.join(' · ') : 'No configurators';
    main.append(titleLine, domain, products);

    const actions = document.createElement('div');
    actions.className = 'tenant-row__actions';
    const open = document.createElement('a');
    open.className = 'button button--secondary button--link';
    open.href = tenantUrl(tenant.slug);
    open.target = '_blank';
    open.rel = 'noopener';
    open.textContent = 'Open';
    const manage = document.createElement('button');
    manage.type = 'button';
    manage.className = 'button button--primary';
    manage.textContent = 'Manage';
    manage.addEventListener('click', () => openTenantEditor(tenant.slug));
    actions.append(open, manage);

    row.append(main, actions);
    tenantList.append(row);
  });
}

async function refreshTenantList({ quiet = false } = {}) {
  if (!currentUser) return;
  refreshTenantsButton.disabled = true;
  if (!quiet) setStatus(tenantListStatus, 'Loading tenants…');
  try {
    const result = await callAdminFunction('listTenants');
    tenantSummaries = Array.isArray(result?.tenants) ? result.tenants : [];
    renderTenantList();
    const suffix = result?.truncated ? ' Showing the first 500 tenants.' : '';
    setStatus(tenantListStatus, `${tenantSummaries.length} tenant${tenantSummaries.length === 1 ? '' : 's'}.${suffix}`, 'success');
  } catch (error) {
    console.error('Tenant listing failed.', error);
    setStatus(tenantListStatus, administrationErrorMessage(error), 'error');
  } finally {
    refreshTenantsButton.disabled = false;
  }
}

function clearManageLogoPreview() {
  if (manageLogoObjectUrl) URL.revokeObjectURL(manageLogoObjectUrl);
  manageLogoObjectUrl = '';
  manageLogoPreviewWrap.hidden = true;
  manageLogoPreview.removeAttribute('src');
}

function populateTenantEditor(tenant) {
  currentManagedTenant = tenant;
  tenantEditorTitle.textContent = tenant.companyName || tenant.slug;
  tenantEditorMeta.textContent = `${tenant.slug} · ${tenant.status === 'active' ? 'Active' : 'Suspended'}`;
  manageCompanyName.value = tenant.companyName || '';
  manageDomain.textContent = tenant.domain || `${tenant.slug}${TENANT_SUFFIX}`;
  setConfiguratorSelection(tenantEditorForm, 'manageConfigurator', tenant.configurators);
  manageLogo.value = '';
  manageRemoveLogo.checked = false;
  clearManageLogoPreview();

  if (tenant.logoUrl) {
    manageCurrentLogo.src = tenant.logoUrl;
    manageCurrentLogo.hidden = false;
    manageNoLogo.hidden = true;
  } else {
    manageCurrentLogo.removeAttribute('src');
    manageCurrentLogo.hidden = true;
    manageNoLogo.hidden = false;
  }

  openTenantButton.href = tenantUrl(tenant.slug);
  tenantStatusButton.textContent = tenant.status === 'active' ? 'Suspend tenant' : 'Reactivate tenant';
  tenantStatusButton.dataset.nextStatus = tenant.status === 'active' ? 'suspended' : 'active';
  tenantStatusButton.classList.toggle('button--danger', tenant.status === 'active');
  tenantStatusButton.classList.toggle('button--success', tenant.status !== 'active');
  setStatus(manageStatus);
  tenantEditorCard.hidden = false;
}

async function openTenantEditor(slug) {
  tenantEditorCard.hidden = false;
  tenantEditorTitle.textContent = 'Loading tenant…';
  tenantEditorMeta.textContent = slug;
  tenantEditorForm.hidden = true;
  try {
    const tenant = await callAdminFunction('getTenant', { slug });
    populateTenantEditor(tenant);
    tenantEditorForm.hidden = false;
    tenantEditorCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('Tenant loading failed.', error);
    tenantEditorTitle.textContent = 'Could not load tenant';
    tenantEditorMeta.textContent = administrationErrorMessage(error);
  }
}

async function updateManagedTenant(data, successMessage) {
  if (!currentManagedTenant) return null;
  const result = await callAdminFunction('updateTenant', { slug: currentManagedTenant.slug, ...data });
  populateTenantEditor(result);
  tenantEditorForm.hidden = false;
  setStatus(manageStatus, successMessage, 'success');
  await refreshTenantList({ quiet: true });
  return result;
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

manageLogo.addEventListener('change', () => {
  clearManageLogoPreview();
  const [file] = manageLogo.files || [];
  if (!file) return;
  manageRemoveLogo.checked = false;
  manageLogoObjectUrl = URL.createObjectURL(file);
  manageLogoPreview.src = manageLogoObjectUrl;
  manageLogoPreviewWrap.hidden = false;
});

manageRemoveLogo.addEventListener('change', () => {
  if (!manageRemoveLogo.checked) return;
  manageLogo.value = '';
  clearManageLogoPreview();
});

tenantForm.addEventListener('reset', () => {
  window.setTimeout(() => {
    slugWasEdited = false;
    resultCard.hidden = true;
    setStatus(formStatus);
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
    setStatus(formStatus, 'Sign in with Google first.', 'error');
    return;
  }

  const companyName = companyNameInput.value.trim();
  const slug = normalizeSlugCandidate(slugInput.value);
  const configurators = selectedConfigurators(tenantForm, 'configurator');
  if (!companyName) {
    setStatus(formStatus, 'Enter the company name.', 'error');
    return;
  }
  if (!TENANT_SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
    setStatus(formStatus, 'Choose a valid, non-reserved subdomain.', 'error');
    return;
  }
  if (!Object.values(configurators).some(Boolean)) {
    setStatus(formStatus, 'Enable at least one configurator.', 'error');
    return;
  }

  createButton.disabled = true;
  resultCard.hidden = true;
  setStatus(formStatus, 'Preparing tenant…');

  try {
    const [logoFile] = logoInput.files || [];
    const logoDataUrl = logoFile ? await optimizeLogo(logoFile) : '';
    setStatus(formStatus, 'Creating tenant…');
    const result = await callAdminFunction('provisionTenant', { companyName, slug, configurators, logoDataUrl });
    setStatus(formStatus, 'Tenant created successfully.', 'success');
    renderProvisioned(result);
    await refreshTenantList({ quiet: true });
  } catch (error) {
    console.error('Tenant provisioning failed.', error);
    setStatus(formStatus, administrationErrorMessage(error), 'error');
  } finally {
    createButton.disabled = false;
  }
});

tenantEditorForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!currentManagedTenant) return;

  const companyName = manageCompanyName.value.trim();
  const configurators = selectedConfigurators(tenantEditorForm, 'manageConfigurator');
  if (!companyName) {
    setStatus(manageStatus, 'Enter the company name.', 'error');
    return;
  }
  if (!Object.values(configurators).some(Boolean)) {
    setStatus(manageStatus, 'Keep at least one configurator enabled.', 'error');
    return;
  }

  saveTenantButton.disabled = true;
  tenantStatusButton.disabled = true;
  setStatus(manageStatus, 'Saving changes…');
  try {
    const [logoFile] = manageLogo.files || [];
    let logoMode = 'keep';
    let logoDataUrl = '';
    if (manageRemoveLogo.checked) logoMode = 'remove';
    else if (logoFile) {
      logoMode = 'replace';
      logoDataUrl = await optimizeLogo(logoFile);
    }

    await updateManagedTenant({ companyName, configurators, logoMode, logoDataUrl }, 'Tenant updated successfully.');
  } catch (error) {
    console.error('Tenant update failed.', error);
    setStatus(manageStatus, administrationErrorMessage(error), 'error');
  } finally {
    saveTenantButton.disabled = false;
    tenantStatusButton.disabled = false;
  }
});

tenantStatusButton.addEventListener('click', async () => {
  if (!currentManagedTenant) return;
  const nextStatus = tenantStatusButton.dataset.nextStatus;
  const suspending = nextStatus === 'suspended';
  if (suspending) {
    const confirmed = window.confirm(
      `Suspend ${currentManagedTenant.companyName}? The customer site and tenant saved configurations will become inaccessible until reactivated. No data will be deleted.`,
    );
    if (!confirmed) return;
  }

  saveTenantButton.disabled = true;
  tenantStatusButton.disabled = true;
  setStatus(manageStatus, suspending ? 'Suspending tenant…' : 'Reactivating tenant…');
  try {
    await updateManagedTenant(
      { status: nextStatus },
      suspending ? 'Tenant suspended. No tenant data was deleted.' : 'Tenant reactivated.',
    );
  } catch (error) {
    console.error('Tenant status update failed.', error);
    setStatus(manageStatus, administrationErrorMessage(error), 'error');
  } finally {
    saveTenantButton.disabled = false;
    tenantStatusButton.disabled = false;
  }
});

closeTenantEditorButton.addEventListener('click', () => {
  tenantEditorCard.hidden = true;
  tenantEditorForm.hidden = false;
  currentManagedTenant = null;
  clearManageLogoPreview();
});

tenantSearch.addEventListener('input', renderTenantList);
refreshTenantsButton.addEventListener('click', () => refreshTenantList());

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

await observeGoogleAuth(async (user) => {
  currentUser = user;
  if (user) {
    authState.textContent = `${user.email || user.displayName || 'Signed in'} · UID ${user.uid}`;
    authButton.textContent = 'Sign out';
    authButton.hidden = false;
    adminWorkspace.hidden = false;
    await refreshTenantList();
  } else {
    authState.textContent = 'Sign in with a tenant-admin Google account.';
    authButton.textContent = 'Sign in with Google';
    authButton.hidden = false;
    adminWorkspace.hidden = true;
    tenantEditorCard.hidden = true;
    currentManagedTenant = null;
    tenantSummaries = [];
  }
});

updateSlugState();
