import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { AggregateField, FieldValue, Firestore, Timestamp } from '@google-cloud/firestore';
import type { JsonObject, ProductId } from './catalog.js';

const COLLECTION = 'sharedConfigurations';
const RATE_COLLECTION = 'chatgptPluginRateLimits';
const MAX_STATE_BYTES = 850_000;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
const SHARE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;

export type StoredShare = {
  id: string;
  product: ProductId;
  state: JsonObject;
  answers: JsonObject;
  expiresAtMs: number;
  sizeBytes: number;
};

let cachedDb: Firestore | null = null;
const usingGcloudRest = process.env.MCP_USE_GCLOUD_CREDENTIALS === '1';

function gcloudAccessToken() {
  let token = '';
  try {
    token = execFileSync('gcloud', ['auth', 'print-access-token'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000,
    }).trim();
  } catch {
    throw new Error('The local Google Cloud login has expired. Run `gcloud auth login`, then retry the configuration.');
  }
  if (!token) throw new Error('The active gcloud account did not return an access token.');
  return token;
}

function firestoreRestUrl(path: string, query: Record<string, string> = {}) {
  const project = encodeURIComponent(process.env.GOOGLE_CLOUD_PROJECT || 'configurator-360');
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function firestoreRest(path: string, init: RequestInit = {}, query: Record<string, string> = {}) {
  const response = await fetch(firestoreRestUrl(path, query), {
    ...init,
    headers: { authorization: `Bearer ${gcloudAccessToken()}`, 'content-type': 'application/json', ...init.headers },
  });
  if (response.status === 404) return { response, payload: null };
  const payload = await response.json().catch(() => null) as JsonObject | null;
  return { response, payload };
}

function db(): Firestore {
  if (cachedDb) return cachedDb;
  cachedDb = new Firestore({ projectId: process.env.GOOGLE_CLOUD_PROJECT || 'configurator-360' });
  return cachedDb;
}

function shareId() { return randomBytes(12).toString('base64url'); }
function bytes(value: string) { return Buffer.byteLength(value, 'utf8'); }
function timestampMs(value: unknown): number {
  if (typeof value === 'string') return Date.parse(value) || 0;
  return value && typeof (value as Timestamp).toMillis === 'function' ? (value as Timestamp).toMillis() : 0;
}

export async function enforceRateLimit(clientKey: string) {
  // The local personal plugin is already limited to the signed-in workstation.
  // Public HTTP traffic always uses the transactional Cloud Run path below.
  if (usingGcloudRest) return;
  const now = Date.now();
  const hour = new Date(now).toISOString().slice(0, 13);
  const day = new Date(now).toISOString().slice(0, 10);
  const hash = createHash('sha256').update(clientKey || 'unknown').digest('hex').slice(0, 32);
  const limits = [{ key: `ip-hour-${hash}-${hour}`, max: Number(process.env.MCP_IP_HOURLY_LIMIT || 30) }, { key: `ip-day-${hash}-${day}`, max: Number(process.env.MCP_IP_DAILY_LIMIT || 100) }, { key: `global-day-${day}`, max: Number(process.env.MCP_GLOBAL_DAILY_LIMIT || 2000) }];
  await db().runTransaction(async transaction => {
    const refs = limits.map(limit => db().collection(RATE_COLLECTION).doc(limit.key));
    const snapshots = await Promise.all(refs.map(ref => transaction.get(ref)));
    limits.forEach((limit, index) => {
      const snapshot = snapshots[index];
      const count = Number(snapshot.data()?.count || 0);
      if (count >= limit.max) throw new Error('RATE_LIMITED');
      transaction.set(refs[index], { count: count + 1, expiresAt: Timestamp.fromMillis(now + 48 * 60 * 60 * 1000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
  });
}

async function cleanupFor(incomingBytes: number) {
  const collection = db().collection(COLLECTION);
  const aggregate = await collection.aggregate({ total: AggregateField.sum('sizeBytes') }).get();
  let total = Number(aggregate.data().total || 0);
  if (total + incomingBytes <= MAX_TOTAL_BYTES) return;
  while (total + incomingBytes > MAX_TOTAL_BYTES) {
    const oldest = await collection.orderBy('createdAt', 'asc').limit(100).get();
    if (oldest.empty) break;
    const batch = db().batch();
    for (const doc of oldest.docs) {
      total -= Number(doc.data().sizeBytes || 0);
      batch.delete(doc.ref);
      if (total + incomingBytes <= MAX_TOTAL_BYTES - 1024 * 1024) break;
    }
    await batch.commit();
  }
  if (total + incomingBytes > MAX_TOTAL_BYTES) throw new Error('SHARE_STORAGE_FULL');
}

export async function createShare(product: ProductId, state: JsonObject, answers: JsonObject): Promise<StoredShare> {
  const stateJson = JSON.stringify(state);
  const sizeBytes = bytes(stateJson);
  if (sizeBytes > MAX_STATE_BYTES) throw new Error('STATE_TOO_LARGE');
  if (!usingGcloudRest) await cleanupFor(sizeBytes);
  const createdAt = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + SHARE_TTL_MS);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = shareId();
    try {
      if (usingGcloudRest) {
        const { response, payload } = await firestoreRest(COLLECTION, {
          method: 'POST',
          body: JSON.stringify({ fields: {
            v: { integerValue: '1' }, p: { stringValue: product }, s: { stringValue: stateJson },
            chatgptAnswers: { stringValue: JSON.stringify(answers) }, sizeBytes: { integerValue: String(sizeBytes) },
            createdAt: { timestampValue: createdAt.toDate().toISOString() }, expiresAt: { timestampValue: expiresAt.toDate().toISOString() },
            quotaVersion: { integerValue: '2' }, source: { stringValue: 'chatgpt-plugin' },
          } }),
        }, { documentId: id });
        if (response.ok) return { id, product, state, answers, sizeBytes, expiresAtMs: expiresAt.toMillis() };
        if (response.status === 409) continue;
        throw new Error(String((payload?.error as JsonObject | undefined)?.message || `Firestore returned HTTP ${response.status}.`));
      }
      await db().collection(COLLECTION).doc(id).create({
        v: 1, p: product, s: stateJson, chatgptAnswers: JSON.stringify(answers), sizeBytes,
        createdAt, expiresAt, quotaVersion: 2, source: 'chatgpt-plugin',
      });
      return { id, product, state, answers, sizeBytes, expiresAtMs: expiresAt.toMillis() };
    } catch (error) {
      if (String((error as { code?: unknown }).code) === '6' || String((error as { code?: unknown }).code) === 'already-exists') continue;
      throw error;
    }
  }
  throw new Error('SHARE_ID_COLLISION');
}

export async function getShare(id: string): Promise<StoredShare | null> {
  if (!ID_PATTERN.test(id)) return null;
  let data: Record<string, unknown>;
  if (usingGcloudRest) {
    const { response, payload } = await firestoreRest(`${COLLECTION}/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(String((payload?.error as JsonObject | undefined)?.message || `Firestore returned HTTP ${response.status}.`));
    const fields = (payload?.fields || {}) as Record<string, JsonObject>;
    data = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key,
      field.stringValue ?? field.integerValue ?? field.timestampValue ?? field.booleanValue ?? null,
    ]));
  } else {
    const snapshot = await db().collection(COLLECTION).doc(id).get();
    if (!snapshot.exists) return null;
    data = snapshot.data() || {};
  }
  const expiresAtMs = timestampMs(data.expiresAt);
  if (expiresAtMs && expiresAtMs <= Date.now()) return null;
  const state = JSON.parse(String(data.s || '{}')) as JsonObject;
  let answers: JsonObject;
  try { answers = JSON.parse(String(data.chatgptAnswers || data.s || '{}')) as JsonObject; } catch { answers = state; }
  return { id, product: String(data.p) as ProductId, state, answers, sizeBytes: Number(data.sizeBytes || bytes(String(data.s || ''))), expiresAtMs };
}

export function parseShareId(value: string): string | null {
  if (ID_PATTERN.test(value)) return value;
  try {
    const url = new URL(value);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const id = hash.get('s') || url.searchParams.get('s');
    return id && ID_PATTERN.test(id) ? id : null;
  } catch { return null; }
}
