import { getFirebaseIdToken } from './firebaseAuth.js?v=18';

const FUNCTIONS_REGION = 'europe-west1';
const PROJECT_ID = 'configurator-360';

function callableUrl(name) {
  return `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}

async function callCartFunction(name, data = {}) {
  const token = await getFirebaseIdToken();
  if (!token) {
    const error = new Error('Google login is required.');
    error.code = 'auth-required';
    throw error;
  }

  const response = await fetch(callableUrl(name), {
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
    const message = payload?.error?.message || `Cart request failed (${response.status}).`;
    const error = new Error(message);
    error.code = payload?.error?.status || `http-${response.status}`;
    throw error;
  }

  return payload?.result ?? payload?.data ?? null;
}

export async function getUserCart({ key = '', productId = '' } = {}) {
  const result = await callCartFunction('getUserCart', {
    key: String(key || ''),
    productId: String(productId || ''),
  });
  let editingItem = null;
  if (result?.editingItem && typeof result.editingItem === 'object') {
    editingItem = { ...result.editingItem };
    if (editingItem.stateJson) {
      try { editingItem.state = JSON.parse(editingItem.stateJson); } catch { editingItem = null; }
    }
  }
  return {
    exists: Boolean(result?.exists),
    items: Array.isArray(result?.items) ? result.items : [],
    editingItem,
    updatedAtMs: Number(result?.updatedAtMs) || 0,
  };
}

export async function mutateUserCart({ action, item = null, items = null, key = '', productId = '' } = {}) {
  const result = await callCartFunction('mutateUserCart', {
    action: String(action || ''),
    item,
    items,
    key: String(key || ''),
    productId: String(productId || ''),
  });
  return {
    exists: Boolean(result?.exists),
    items: Array.isArray(result?.items) ? result.items : [],
    addedItem: result?.addedItem && typeof result.addedItem === 'object' ? result.addedItem : null,
    updatedItem: result?.updatedItem && typeof result.updatedItem === 'object' ? result.updatedItem : null,
    updatedAtMs: Number(result?.updatedAtMs) || 0,
  };
}
