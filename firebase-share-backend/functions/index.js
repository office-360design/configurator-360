'use strict';

const { onInit } = require('firebase-functions/v2/core');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { AggregateField, Timestamp, getFirestore } = require('firebase-admin/firestore');

// Firebase CLI loads this module during deployment to discover exported functions.
// Defer Admin/Firestore initialization until the deployed runtime starts so function
// discovery does not need to initialize Firebase services on the developer machine.
let db;
onInit(() => {
  initializeApp();
  db = getFirestore();
});

const SHARES_COLLECTION = 'sharedConfigurations';
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;       // 200 MiB
const CLEANUP_CHUNK_BYTES = 1 * 1024 * 1024;     // 1 MiB
const MAX_SINGLE_SHARE_BYTES = 850_000;           // keep headroom below Firestore's document limit
const SHARE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_QUERY_BATCH = 400;                  // below Firestore's 500-write batch limit

function utf8ByteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

async function currentStoredBytes(collection) {
  const snapshot = await collection.aggregate({
    totalBytes: AggregateField.sum('sizeBytes'),
  }).get();

  return Number(snapshot.data().totalBytes || 0);
}

async function deleteOldestUntilFreed(collection, bytesToFree, protectedShareId) {
  let freedBytes = 0;
  let deletedCount = 0;

  while (freedBytes < bytesToFree) {
    const oldest = await collection
      .orderBy('createdAt', 'asc')
      .limit(CLEANUP_QUERY_BATCH)
      .get();

    if (oldest.empty) break;

    const batch = db.batch();
    let batchDeleteCount = 0;

    for (const doc of oldest.docs) {
      // The newly created share should normally be the newest document anyway,
      // but explicitly protecting it guarantees that the share just returned to
      // the user is not selected for FIFO cleanup.
      if (doc.id === protectedShareId) continue;

      const data = doc.data();
      const bytes = Number.isFinite(Number(data.sizeBytes))
        ? Math.max(0, Number(data.sizeBytes))
        : utf8ByteLength(data.s);

      batch.delete(doc.ref);
      batchDeleteCount += 1;
      deletedCount += 1;
      freedBytes += bytes;

      if (freedBytes >= bytesToFree) break;
    }

    if (batchDeleteCount === 0) break;
    await batch.commit();
  }

  return { freedBytes, deletedCount };
}

exports.enforceSharedConfigurationQuota = onDocumentCreated(
  {
    document: `${SHARES_COLLECTION}/{shareId}`,
    // Serial execution avoids two simultaneous creates independently deciding
    // to evict the same FIFO range and unnecessarily deleting extra links.
    maxInstances: 1,
    concurrency: 1,
    timeoutSeconds: 180,
    memory: '256MiB',
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const shareId = event.params.shareId;
    const data = snapshot.data();
    const serializedState = data.s;

    if (typeof serializedState !== 'string' || serializedState.length === 0) {
      console.warn(`Deleting invalid shared configuration ${shareId}: missing state string.`);
      await snapshot.ref.delete();
      return;
    }

    const sizeBytes = utf8ByteLength(serializedState);

    // The browser rules already restrict the string length, but the server checks
    // actual UTF-8 bytes as well. This catches multibyte payloads and keeps the
    // quota unit consistent.
    if (sizeBytes > MAX_SINGLE_SHARE_BYTES) {
      console.warn(
        `Deleting shared configuration ${shareId}: ${sizeBytes} bytes exceeds ` +
        `${MAX_SINGLE_SHARE_BYTES} bytes.`
      );
      await snapshot.ref.delete();
      return;
    }

    const createdAt = snapshot.createTime || Timestamp.now();
    const expiresAt = Timestamp.fromMillis(createdAt.toMillis() + SHARE_LIFETIME_MS);

    // These fields are trusted server metadata. Existing client create rules may
    // continue accepting only v/p/s; Admin SDK writes bypass client Security Rules.
    await snapshot.ref.update({
      sizeBytes,
      createdAt,
      expiresAt,
      quotaVersion: 1,
    });

    const collection = db.collection(SHARES_COLLECTION);
    const totalBytes = await currentStoredBytes(collection);

    if (totalBytes <= MAX_TOTAL_BYTES) {
      console.log(
        `Share ${shareId} stored (${sizeBytes} bytes). ` +
        `Quota usage: ${totalBytes}/${MAX_TOTAL_BYTES} bytes.`
      );
      return;
    }

    // When the quota is crossed, free at least 1 MiB. If the amount over quota is
    // larger than 1 MiB, free enough data to return below the 200 MiB ceiling.
    const overflowBytes = totalBytes - MAX_TOTAL_BYTES;
    const bytesToFree = Math.max(CLEANUP_CHUNK_BYTES, overflowBytes);

    const cleanup = await deleteOldestUntilFreed(
      collection,
      bytesToFree,
      shareId,
    );

    const remainingBytes = await currentStoredBytes(collection);

    console.log(JSON.stringify({
      event: 'shared-configuration-quota-cleanup',
      shareId,
      totalBytesBeforeCleanup: totalBytes,
      requestedBytesToFree: bytesToFree,
      freedBytes: cleanup.freedBytes,
      deletedCount: cleanup.deletedCount,
      totalBytesAfterCleanup: remainingBytes,
      limitBytes: MAX_TOTAL_BYTES,
    }));

    if (remainingBytes > MAX_TOTAL_BYTES) {
      throw new Error(
        `Shared configuration quota cleanup incomplete: ${remainingBytes} bytes remain ` +
        `above the ${MAX_TOTAL_BYTES}-byte limit.`
      );
    }
  }
);
