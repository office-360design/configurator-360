/** IndexedDB storage. Manifest and assets commit in ONE transaction.
 * Resolve on transaction.complete, never on an individual request's success.
 * Revision checks prevent a second tab from silently overwriting a saved project.
 */
import { validateProjectDocument, projectError } from './pavingProject.js';
import { verifyAsset } from './projectAssets.js';
const storageError = e => typeof e?.code === 'string' ? e : projectError('storageUnavailable', e?.name === 'QuotaExceededError'
  ? 'Browser storage is full. Download the project file or remove local data; the previous save was not replaced.'
  : 'Browser storage is unavailable. Download a project file to keep this work.');
export class ProjectStore {
  constructor({ indexedDB = globalThis.indexedDB, name = '360-tiles-projects-v1' } = {}) {
    this.factory = indexedDB; this.name = name; this.db = null; this.opening = null; this.writeEpoch = 0;
  }
  async open() {
    if (this.db) return this.db;
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      if (!this.factory) { reject(storageError()); return; }
      let request, finished = false;
      const fail = error => { if (!finished) { finished = true; reject(storageError(error)); } };
      try { request = this.factory.open(this.name, 1); } catch(e) { fail(e); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('assets', { keyPath: 'sha256' });
        db.createObjectStore('projects', { keyPath: 'id' });
      };
      request.onblocked = () => fail(projectError('storageBlocked', 'Close other configurator tabs and retry opening local storage.'));
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (finished) { db.close(); return; }
        finished = true; this.db = db;
        db.onversionchange = () => { db.close(); this.db = null; this.opening = null; };
        resolve(db);
      };
    });
    try { return await this.opening; } finally { this.opening = null; }
  }
  async transaction(stores, mode, operation) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      let tx, result, ownError;
      try { tx = db.transaction(stores, mode); } catch(e) { reject(storageError(e)); return; }
      const abort = e => { ownError = e; try { tx.abort(); } catch { reject(storageError(e)); } };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(storageError(ownError || tx.error));
      tx.onerror = () => {}; // onabort supplies the final transaction outcome.
      try { operation(tx, value => { result = value; }, abort); } catch(e) { abort(e); }
    });
  }
  async cacheAssets(assets) {
    const epoch = this.writeEpoch;
    const list = Object.entries(assets).filter(([,asset])=>asset);
    for (const [role, asset] of list) await verifyAsset(asset, role);
    return this.transaction(['assets'], 'readwrite', (tx,set,abort) => {
      if (epoch !== this.writeEpoch) { abort(projectError('storageChanged','Local storage was cleared during this operation.')); return; }
      for (const [,asset] of list) tx.objectStore('assets').put({ sha256: asset.meta.sha256, meta: asset.meta, blob: asset.blob });
      set(true);
    });
  }
  async asset(ref) {
    if (!ref) return null;
    return this.transaction(['assets'], 'readonly', (tx,set) => {
      const r = tx.objectStore('assets').get(ref.sha256);
      r.onsuccess = () => set(r.result ? { meta: r.result.meta, blob: r.result.blob } : null);
    });
  }
  async save(name, document, assets, { id = crypto.randomUUID(), expectedRevision = null } = {}) {
    const epoch = this.writeEpoch;
    const doc = validateProjectDocument(document), title = String(name || '').trim().slice(0,100);
    if (!title) throw projectError('projectName', 'Enter a project name.');
    for (const role of ['photo','result']) if (assets?.[role]) {
      const ref = await verifyAsset(assets[role], role);
      if (doc[role]?.sha256 !== ref.sha256) throw projectError('assetMismatch', 'The save assets do not match the current project.');
    }
    return this.transaction(['projects','assets'], 'readwrite', (tx,set,abort) => {
      if (epoch !== this.writeEpoch) { abort(projectError('storageChanged','Local storage was cleared during this operation.')); return; }
      const projects = tx.objectStore('projects'), blobs = tx.objectStore('assets');
      const r = projects.get(id);
      r.onsuccess = () => {
        const prior = r.result;
        if ((prior?.revision ?? null) !== expectedRevision) {
          abort(projectError('projectConflict', 'This project changed in another tab. Refresh the list and save a new copy instead.')); return;
        }
        let pending = 0;
        const commit = () => {
          if (pending) return;
          const record = { id, name: title, revision: (prior?.revision || 0) + 1, updatedAt: new Date().toISOString(), document: doc };
          projects.put(record); set({ id, name: title, revision: record.revision, updatedAt: record.updatedAt });
        };
        for (const role of ['photo','result']) if (doc[role]) pending++;
        for (const role of ['photo','result']) {
          const ref = doc[role]; if (!ref) continue;
          const asset = assets?.[role];
          if (asset) { blobs.put({ sha256: ref.sha256, meta: ref, blob: asset.blob }); pending--; }
          else {
            const get = blobs.get(ref.sha256);
            get.onsuccess = () => {
              if (!get.result) { abort(projectError('missingAsset', `The ${role} is not stored. Reattach the photo or download a geometry-only share.`)); return; }
              pending--; commit();
            };
          }
        }
        commit();
      };
    });
  }
  async list() {
    return this.transaction(['projects'], 'readonly', (tx,set) => {
      const request = tx.objectStore('projects').getAll();
      request.onsuccess = () => set(request.result.map(({id,name,revision,updatedAt,document})=>({id,name,revision,updatedAt,
        hasPhoto: !!document.photo, hasResult: !!document.result})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
    });
  }
  async load(id) {
    return this.transaction(['projects','assets'], 'readonly', (tx,set) => {
      const r = tx.objectStore('projects').get(id);
      r.onsuccess = () => {
        if (!r.result) { set(null); return; }
        const record = r.result, assets = { photo: null, result: null };
        set({ ...record, assets });
        for (const role of ['photo','result']) {
          const ref = record.document[role]; if (!ref) continue;
          const a = tx.objectStore('assets').get(ref.sha256);
          a.onsuccess = () => { if (a.result) assets[role] = { meta: a.result.meta, blob: a.result.blob }; };
        }
      };
    });
  }
  async remove(id, expectedRevision) {
    return this.transaction(['projects'], 'readwrite', (tx,set,abort) => {
      const store = tx.objectStore('projects'), r = store.get(id);
      r.onsuccess = () => {
        if (r.result?.revision !== expectedRevision) { abort(projectError('projectConflict', 'The project changed in another tab. Refresh before deleting.')); return; }
        store.delete(id); set(true);
      };
    });
  }
  async clear() {
    this.writeEpoch++;
    return this.transaction(['projects','assets'], 'readwrite', (tx,set) => {
      tx.objectStore('projects').clear(); tx.objectStore('assets').clear(); set(true);
    });
  }
  close() { this.db?.close(); this.db = null; }
}
