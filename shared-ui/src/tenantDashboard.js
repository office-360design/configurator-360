import {
  getFirebaseIdToken,
  observeGoogleAuth,
  signInWithGoogle,
  signOutGoogle,
} from './firebaseAuth.js?v=26';

const FUNCTION_BASE = 'https://europe-west1-configurator-360.cloudfunctions.net';
const FUNCTION_URLS = Object.freeze({
  getTenantDashboard: `${FUNCTION_BASE}/getTenantDashboard`,
  updateTenantDashboard: `${FUNCTION_BASE}/updateTenantDashboard`,
  cancelTenantPlanChange: `${FUNCTION_BASE}/cancelTenantPlanChange`,
});
const LOGO_TARGET_BYTES = 190_000;
const LOGO_MAX_DIMENSION = 512;
const CONFIGURATOR_LABELS = Object.freeze({
  window: 'Window', pergola: 'Pergola', roof: 'Roof', solar: 'Solar', hall: 'Hall', fence: 'Fence', cardbox: 'Cardbox',
});

const authState = document.querySelector('#authState');
const authButton = document.querySelector('#authButton');
const signedOutCard = document.querySelector('#signedOutCard');
const signedOutButton = document.querySelector('#signedOutButton');
const accessErrorCard = document.querySelector('#accessErrorCard');
const accessErrorTitle = document.querySelector('#accessErrorTitle');
const accessErrorMessage = document.querySelector('#accessErrorMessage');
const workspace = document.querySelector('#dashboardWorkspace');
const headerCompany = document.querySelector('#headerCompany');
const headerBrandMark = document.querySelector('#headerBrandMark');
const headerLogo = document.querySelector('#headerLogo');
const overviewCompany = document.querySelector('#overviewCompany');
const overviewDomain = document.querySelector('#overviewDomain');
const subscriptionBadge = document.querySelector('#subscriptionBadge');
const metricPlan = document.querySelector('#metricPlan');
const metricPlanDetail = document.querySelector('#metricPlanDetail');
const metricConfigurators = document.querySelector('#metricConfigurators');
const metricAccesses = document.querySelector('#metricAccesses');
const metricConfigurations = document.querySelector('#metricConfigurations');
const settingsForm = document.querySelector('#settingsForm');
const companyName = document.querySelector('#companyName');
const planSelect = document.querySelector('#planSelect');
const planHint = document.querySelector('#planHint');
const currentLogo = document.querySelector('#currentLogo');
const noCurrentLogo = document.querySelector('#noCurrentLogo');
const logoInput = document.querySelector('#logoInput');
const removeLogo = document.querySelector('#removeLogo');
const logoPreviewWrap = document.querySelector('#logoPreviewWrap');
const logoPreview = document.querySelector('#logoPreview');
const settingsStatus = document.querySelector('#settingsStatus');
const saveButton = document.querySelector('#saveButton');
const pendingPlanCard = document.querySelector('#pendingPlanCard');
const pendingPlanTitle = document.querySelector('#pendingPlanTitle');
const pendingPlanDetails = document.querySelector('#pendingPlanDetails');
const cancelPlanChangeButton = document.querySelector('#cancelPlanChangeButton');
const refreshButton = document.querySelector('#refreshButton');
const showAllAnalytics = document.querySelector('#showAllAnalytics');
const analyticsMonth = document.querySelector('#analyticsMonth');
const monthAnalyticsBody = document.querySelector('#monthAnalyticsBody');
const lifetimeAnalyticsBody = document.querySelector('#lifetimeAnalyticsBody');
const solarUsageCard = document.querySelector('#solarUsageCard');
const solarUsageMonth = document.querySelector('#solarUsageMonth');
const solarAnalyses = document.querySelector('#solarAnalyses');
const solarBuildingInsights = document.querySelector('#solarBuildingInsights');
const solarDataLayers = document.querySelector('#solarDataLayers');
const solarPvgis = document.querySelector('#solarPvgis');
const activityList = document.querySelector('#activityList');
const activityEmpty = document.querySelector('#activityEmpty');

let currentUser = null;
let dashboard = null;
let logoObjectUrl = '';

function setStatus(message = '', kind = '') {
  settingsStatus.textContent = message;
  if (kind) settingsStatus.dataset.kind = kind;
  else delete settingsStatus.dataset.kind;
}

async function callDashboardFunction(name, data = {}) {
  const token = await getFirebaseIdToken();
  if (!token) throw Object.assign(new Error('Sign in with Google first.'), { code: 'unauthenticated' });
  const response = await fetch(FUNCTION_URLS[name], {
    method: 'POST', mode: 'cors', credentials: 'omit',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ data }),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* handled below */ }
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error?.message || `Dashboard request failed (${response.status}).`);
    error.code = String(payload?.error?.status || `http-${response.status}`).toLowerCase();
    throw error;
  }
  return payload?.result ?? payload?.data ?? null;
}

function selectedConfigurators() {
  const result = Object.fromEntries(Object.keys(CONFIGURATOR_LABELS).map((id) => [id, false]));
  settingsForm.querySelectorAll('input[name="configurator"]:checked').forEach((input) => { result[input.value] = true; });
  return result;
}

function setConfiguratorSelection(configurators = {}) {
  settingsForm.querySelectorAll('input[name="configurator"]').forEach((input) => {
    input.checked = configurators?.[input.value] === true;
  });
}

function enabledCount(configurators = {}) { return Object.values(configurators).filter(Boolean).length; }
function planById(id) { return dashboard?.plans?.find((plan) => plan.id === id) || null; }
function planDescription(plan) {
  if (!plan) return 'Plan details unavailable.';
  const count = plan.maxConfigurators === 1 ? '1 configurator' : `up to ${plan.maxConfigurators} configurators`;
  const price = Number.isInteger(plan.monthlyPriceCents)
    ? `${(plan.monthlyPriceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${plan.currency}/${plan.billingInterval}`
    : 'Price to be confirmed';
  return `${plan.description || `Includes ${count}.`} · ${count} · ${price}`;
}
function validateSelection(planId, configurators) {
  const plan = planById(planId);
  if (!plan) throw new Error('Choose a valid plan.');
  const count = enabledCount(configurators);
  if (!count) throw new Error('Keep at least one configurator enabled.');
  if (count > plan.maxConfigurators) throw new Error(`${plan.name} allows at most ${plan.maxConfigurators} configurator${plan.maxConfigurators === 1 ? '' : 's'}.`);
}

function analyticsMetric(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
function visibleAnalyticsConfiguratorIds(configurators = {}, showAll = false) {
  return Object.keys(CONFIGURATOR_LABELS).filter((id) => showAll || configurators?.[id] === true);
}
function renderAnalytics(tbody, analytics = {}, configurators = {}, showAll = false) {
  const rows = visibleAnalyticsConfiguratorIds(configurators, showAll).map((id) => {
    const label = CONFIGURATOR_LABELS[id];
    const metric = analytics?.[id] || {};
    return `<tr><td>${label}</td><td>${analyticsMetric(metric.accesses).toLocaleString()}</td><td>${analyticsMetric(metric.logins).toLocaleString()}</td><td>${analyticsMetric(metric.configurationsCreated).toLocaleString()}</td></tr>`;
  });
  tbody.innerHTML = rows.join('');
}
function analyticsTotal(analytics, key, configurators = {}) {
  return visibleAnalyticsConfiguratorIds(configurators, false).reduce((sum, id) => sum + analyticsMetric(analytics?.[id]?.[key]), 0);
}
function renderDashboardAnalytics() {
  if (!dashboard) return;
  const showAll = showAllAnalytics?.checked === true;
  renderAnalytics(monthAnalyticsBody, dashboard.analytics?.currentMonth, dashboard.configurators, showAll);
  renderAnalytics(lifetimeAnalyticsBody, dashboard.analytics?.lifetime, dashboard.configurators, showAll);
}

function activityActorLabel(actorType) {
  return ({
    admin: '360Configurator admin',
    tenant_owner: 'Customer account',
    system: 'System',
  })[actorType] || 'System';
}

function activityTypeLabel(type) {
  return ({
    tenant_created: 'Created',
    dashboard_owner_claimed: 'Owner linked',
    tenant_dashboard_updated: 'Settings',
    tenant_admin_updated: 'Administration',
    subscription_state_changed: 'Subscription',
    plan_change_requested: 'Plan request',
    plan_change_cancelled: 'Plan request',
    plan_change_approved: 'Plan changed',
    plan_change_rejected: 'Plan request',
  })[type] || 'Activity';
}

function formatActivityTime(value) {
  const ms = Number(value) || 0;
  if (!ms) return 'Unknown time';
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function renderActivityLog(events = []) {
  if (!activityList || !activityEmpty) return;
  activityList.replaceChildren();
  const items = Array.isArray(events) ? events : [];
  activityEmpty.hidden = items.length > 0;
  items.forEach((event) => {
    const row = document.createElement('article');
    row.className = 'activity-item';

    const marker = document.createElement('span');
    marker.className = 'activity-item__marker';
    marker.textContent = activityTypeLabel(event.type).slice(0, 1);

    const body = document.createElement('div');
    body.className = 'activity-item__body';
    const title = document.createElement('strong');
    title.textContent = event.summary || 'Tenant activity recorded.';
    const meta = document.createElement('span');
    meta.textContent = `${activityActorLabel(event.actorType)} · ${formatActivityTime(event.createdAtMs)}`;
    body.append(title, meta);

    const badge = document.createElement('span');
    badge.className = 'activity-item__badge';
    badge.textContent = activityTypeLabel(event.type);
    row.append(marker, body, badge);
    activityList.append(row);
  });
}

function clearLogoPreview() {
  if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
  logoObjectUrl = '';
  logoPreviewWrap.hidden = true;
  logoPreview.removeAttribute('src');
}
function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read the optimized logo.'));
    reader.readAsDataURL(blob);
  });
}
function canvasBlob(canvas, type, quality) { return new Promise((resolve) => canvas.toBlob(resolve, type, quality)); }
async function optimizeLogo(file) {
  if (!file) return '';
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Logo must be a PNG, JPEG, or WebP image.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, LOGO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    for (let sizeAttempt = 0; sizeAttempt < 3; sizeAttempt += 1) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      canvas.getContext('2d', { alpha: true }).drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.9, 0.78, 0.64, 0.5]) {
        const blob = await canvasBlob(canvas, 'image/webp', quality);
        if (blob && blob.size > 0 && blob.size <= LOGO_TARGET_BYTES) return dataUrlFromBlob(blob);
      }
      width = Math.max(1, Math.round(width * .75)); height = Math.max(1, Math.round(height * .75));
    }
  } finally { bitmap.close?.(); }
  throw new Error('The logo is too complex to optimize below 200 KB. Use a simpler or smaller image.');
}

function populateDashboard(data) {
  dashboard = data;
  document.title = `${data.companyName} Dashboard`;
  headerCompany.textContent = data.companyName;
  overviewCompany.textContent = data.companyName;
  overviewDomain.textContent = data.domain;
  companyName.value = data.companyName;

  if (data.logoUrl) {
    headerLogo.src = data.logoUrl; headerLogo.alt = data.companyName; headerLogo.hidden = false; headerBrandMark.hidden = true;
    currentLogo.src = data.logoUrl; currentLogo.hidden = false; noCurrentLogo.hidden = true;
  } else {
    headerLogo.hidden = true; headerLogo.removeAttribute('src'); headerBrandMark.hidden = false;
    headerBrandMark.textContent = String(data.companyName || '360').slice(0, 2).toUpperCase();
    currentLogo.hidden = true; currentLogo.removeAttribute('src'); noCurrentLogo.hidden = false;
  }

  planSelect.replaceChildren();
  (data.plans || []).forEach((plan) => {
    const option = document.createElement('option'); option.value = plan.id; option.textContent = plan.name; planSelect.append(option);
  });
  const pending = data.pendingPlanChange || null;
  const editablePlanId = pending?.planId || data.planId;
  planSelect.value = editablePlanId;
  planHint.textContent = pending
    ? `${planDescription(planById(editablePlanId))} · Pending confirmation; your current plan remains ${data.planName || data.planId}.`
    : planDescription(planById(data.planId));
  setConfiguratorSelection(pending?.configurators || data.configurators);
  if (pending) {
    pendingPlanCard.hidden = false;
    pendingPlanTitle.textContent = pending.planName || pending.planId;
    const enabled = Object.entries(CONFIGURATOR_LABELS)
      .filter(([id]) => pending.configurators?.[id] === true)
      .map(([, label]) => label);
    const requestedAt = pending.requestedAtMs ? formatActivityTime(pending.requestedAtMs) : 'recently';
    pendingPlanDetails.textContent = `Requested ${requestedAt} · ${enabled.join(', ') || 'No configurators selected'} · Your current plan stays active until the change is confirmed.`;
  } else {
    pendingPlanCard.hidden = true;
    pendingPlanTitle.textContent = 'Requested plan change';
    pendingPlanDetails.textContent = '—';
  }
  removeLogo.checked = false; logoInput.value = ''; clearLogoPreview();

  subscriptionBadge.textContent = String(data.subscription?.status || data.status || 'unknown').replaceAll('_', ' ');
  subscriptionBadge.dataset.state = data.subscription?.status || data.status || '';
  metricPlan.textContent = data.planName || data.planId;
  metricPlanDetail.textContent = planDescription(planById(data.planId));
  metricConfigurators.textContent = enabledCount(data.configurators).toLocaleString();
  metricAccesses.textContent = analyticsTotal(data.analytics?.currentMonth, 'accesses', data.configurators).toLocaleString();
  metricConfigurations.textContent = analyticsTotal(data.analytics?.currentMonth, 'configurationsCreated', data.configurators).toLocaleString();

  analyticsMonth.textContent = data.analytics?.month ? `${data.analytics.month} UTC` : 'Current UTC month';
  renderDashboardAnalytics();

  solarUsageCard.hidden = data.configurators?.solar !== true;
  if (!solarUsageCard.hidden) {
    solarUsageMonth.textContent = data.usage?.month ? `${data.usage.month} UTC` : 'Current UTC month';
    const usage = data.usage?.solar || {};
    solarAnalyses.textContent = analyticsMetric(usage.analyses).toLocaleString();
    solarBuildingInsights.textContent = analyticsMetric(usage.buildingInsights).toLocaleString();
    solarDataLayers.textContent = analyticsMetric(usage.dataLayers).toLocaleString();
    solarPvgis.textContent = analyticsMetric(usage.pvgis).toLocaleString();
  }
  renderActivityLog(data.auditEvents);
  workspace.hidden = false; accessErrorCard.hidden = true; signedOutCard.hidden = true; setStatus();
}

function showAccessError(error) {
  workspace.hidden = true; signedOutCard.hidden = true; accessErrorCard.hidden = false;
  const code = String(error?.code || '').toLowerCase();
  accessErrorTitle.textContent = code.includes('permission-denied') ? 'Account not authorized' : 'Dashboard unavailable';
  accessErrorMessage.textContent = error?.message || 'This tenant dashboard could not be loaded.';
}

async function refreshDashboard() {
  if (!currentUser) return;
  refreshButton.disabled = true;
  try { populateDashboard(await callDashboardFunction('getTenantDashboard')); }
  catch (error) { console.error('Tenant dashboard loading failed.', error); showAccessError(error); }
  finally { refreshButton.disabled = false; }
}

logoInput.addEventListener('change', () => {
  clearLogoPreview();
  const [file] = logoInput.files || []; if (!file) return;
  removeLogo.checked = false; logoObjectUrl = URL.createObjectURL(file); logoPreview.src = logoObjectUrl; logoPreviewWrap.hidden = false;
});
removeLogo.addEventListener('change', () => { if (removeLogo.checked) { logoInput.value = ''; clearLogoPreview(); } });
planSelect.addEventListener('change', () => {
  const description = planDescription(planById(planSelect.value));
  planHint.textContent = dashboard && planSelect.value !== dashboard.planId
    ? `${description} · Changing plan creates a pending request until billing/admin confirmation.`
    : description;
});
settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!dashboard) return;
  const configurators = selectedConfigurators();
  try { validateSelection(planSelect.value, configurators); } catch (error) { setStatus(error.message, 'error'); return; }
  const name = companyName.value.trim(); if (!name) { setStatus('Enter the company name.', 'error'); return; }
  saveButton.disabled = true; setStatus('Saving changes…');
  try {
    const [file] = logoInput.files || [];
    let logoMode = 'keep'; let logoDataUrl = '';
    if (removeLogo.checked) logoMode = 'remove';
    else if (file) { logoMode = 'replace'; logoDataUrl = await optimizeLogo(file); }
    const requestedPlanChange = planSelect.value !== dashboard.planId;
    const result = await callDashboardFunction('updateTenantDashboard', {
      companyName: name, planId: planSelect.value, configurators, logoMode, logoDataUrl,
    });
    populateDashboard(result);
    setStatus(
      requestedPlanChange ? 'Branding changes saved. Your plan change request is pending confirmation.' : 'Changes saved.',
      'success',
    );
  } catch (error) { console.error('Tenant dashboard update failed.', error); setStatus(error?.message || 'Could not save changes.', 'error'); }
  finally { saveButton.disabled = false; }
});
cancelPlanChangeButton?.addEventListener('click', async () => {
  if (!dashboard?.pendingPlanChange) return;
  const confirmed = window.confirm(`Cancel the pending change to ${dashboard.pendingPlanChange.planName || dashboard.pendingPlanChange.planId}?`);
  if (!confirmed) return;
  cancelPlanChangeButton.disabled = true;
  saveButton.disabled = true;
  setStatus('Cancelling plan change request…');
  try {
    const result = await callDashboardFunction('cancelTenantPlanChange');
    populateDashboard(result);
    setStatus('Plan change request cancelled.', 'success');
  } catch (error) {
    console.error('Plan change cancellation failed.', error);
    setStatus(error?.message || 'Could not cancel the plan change request.', 'error');
  } finally {
    cancelPlanChangeButton.disabled = false;
    saveButton.disabled = false;
  }
});

refreshButton.addEventListener('click', refreshDashboard);
showAllAnalytics?.addEventListener('change', renderDashboardAnalytics);

async function toggleAuth() {
  authButton.disabled = true; signedOutButton.disabled = true;
  try { if (currentUser) await signOutGoogle(); else await signInWithGoogle(); }
  catch (error) { console.error('Dashboard authentication failed.', error); authState.textContent = error?.message || 'Authentication failed.'; }
  finally { authButton.disabled = false; signedOutButton.disabled = false; }
}
authButton.addEventListener('click', toggleAuth); signedOutButton.addEventListener('click', toggleAuth);

await observeGoogleAuth(async (user) => {
  currentUser = user;
  if (!user) {
    authState.textContent = 'Not signed in'; authButton.textContent = 'Sign in with Google'; authButton.hidden = false;
    signedOutCard.hidden = false; accessErrorCard.hidden = true; workspace.hidden = true; dashboard = null; return;
  }
  authState.textContent = user.email || user.displayName || 'Signed in'; authButton.textContent = 'Sign out'; authButton.hidden = false;
  signedOutCard.hidden = true; await refreshDashboard();
});
