/** Persistence orchestration. Restoring never invokes inference. Slow reads cannot
 * overwrite edits/new photos made after Open was requested. Images/results are
 * session assets, not repeated in undo or compact account saves.
 */
import { PROJECT_FORMAT, PROJECT_LIMITS, validateProjectDocument, prepareProjectState, projectSavedState, projectFromSavedState, projectError } from './pavingProject.js';
import { makePhotoAsset, makeResultAsset, readResultAsset, encodeProjectFile, decodeProjectFile, verifyAsset } from './projectAssets.js?v=tiles-ground-support-1';
import { ProjectStore } from './projectStore.js';
export function createProjectSession({ capture, getPhoto, getSource, getRevision, getDetection, apply,
  assertSavable = () => {}, beforeOpen = () => {}, onStatus = () => {}, store = new ProjectStore(),
  fetchImpl = globalThis.fetch?.bind(globalThis), decodeImage } = {}) {
  let generation = 0, photoAsset = null, resultAsset = null, assetPhotoId = null, missingDocument = null;
  let cacheEpoch = 0, autoCache = true;
  let photoTask = null, cacheReady = false, resultKey = null, resultTask = null;
  let status = { phase: 'idle', message: '', missingPhoto: false, cached: false, localId: null, localRevision: null };
  const publish = patch => { status = { ...status, ...patch }; onStatus({ ...status }); };
  const stale = () => { throw projectError('staleProject', 'The photograph or design changed while reading the project. Open it again to replace the new work.'); };
  const guardFor = () => {
    const id = ++generation, revision = getRevision();
    return () => id === generation && revision === getRevision();
  };
  function refs() {
    if (getPhoto()?.photoId === assetPhotoId && photoAsset) return { photo: photoAsset.meta, result: resultAsset?.meta || null };
    return { photo: missingDocument?.photo || null, result: missingDocument?.result || null };
  }
  function document() {
    const snap = capture(), ref = refs();
    return validateProjectDocument({ format: PROJECT_FORMAT, version: 1, state: snap.state,
      view: missingDocument?.view || snap.view, referenceCorners: missingDocument?.referenceCorners || snap.referenceCorners,
      ...ref });
  }
  function savedState() {
    assertSavable();
    if (getPhoto() && (!photoAsset || assetPhotoId !== getPhoto().photoId || !cacheReady))
      throw projectError('photoNotCached', 'The photo is not yet saved in this browser. Use Project → Save in browser or Download project.');
    return projectSavedState(document());
  }
  function photoLoaded(photo, source) {
    generation++; assetPhotoId = photo.photoId; photoAsset = resultAsset = null; resultKey = null;
    missingDocument = null; cacheReady = false; resultTask = null;
    publish({ phase: 'caching', message: 'Caching the photograph for reopening…', cached: false, missingPhoto: false, localId: null, localRevision: null });
    const id = photo.photoId, epoch = ++cacheEpoch; autoCache = true;
    photoTask = (async () => {
      let response;
      try {
        const url = new URL(source, globalThis.location?.href || 'http://localhost');
        if (url.protocol !== 'blob:' && url.origin !== globalThis.location?.origin)
          throw projectError('photoSource', 'Only local uploads and same-origin sample photos can be cached.');
        response = await fetchImpl(source);
        if (!response.ok) throw new Error('Photo could not be read.');
        // Read sizes incrementally, rather than trusting a missing/incorrect header.
        const reader = response.body?.getReader(); let blob;
        if (reader) {
          let total = 0; const chunks = [];
          for (;;) { const {done,value} = await reader.read(); if(done) break;
            total += value.byteLength;
            if (total > PROJECT_LIMITS.photoBytes) { await reader.cancel(); throw projectError('photoTooLarge','The photo exceeds the 24 MiB project-file limit.'); }
            chunks.push(value);
          }
          blob = new Blob(chunks);
        } else blob = await response.blob();
        const asset = await makePhotoAsset(blob, photo, decodeImage);
        if (assetPhotoId !== id || getPhoto()?.photoId !== id) return;
        photoAsset = asset;
        try {
          if (epoch !== cacheEpoch || !autoCache) return;
          await store.cacheAssets({ photo: asset });
          if (assetPhotoId !== id || getPhoto()?.photoId !== id || epoch !== cacheEpoch) return;
          cacheReady = true;
          publish({ phase: 'ready', cached: true, message: 'Photo cached. Save a project to keep the edited design and camera.' });
        } catch(e) {
          if (assetPhotoId === id) publish({ phase: 'error', cached: false, message: e.message });
        }
      } catch(e) { if (assetPhotoId === id) publish({ phase: 'error', message: e.message, cached: false }); }
    })();
    return photoTask;
  }
  function detached() {
    generation++; cacheEpoch++; photoAsset = resultAsset = missingDocument = null; assetPhotoId = null; resultKey = null;
    cacheReady = false; photoTask = resultTask = null;
    publish({ phase: 'idle', message: '', missingPhoto: false, cached: false, localId: null, localRevision: null });
  }
  async function rememberDetection() {
    if (photoTask) await photoTask;
    const info = getDetection?.(), photoId = getPhoto()?.photoId;
    if (!photoAsset || assetPhotoId !== photoId || !info?.key || info.key === resultKey) return resultTask;
    const key = info.key, asset = photoAsset, epoch = cacheEpoch;
    resultKey = key;
    resultTask = (async () => {
      try {
        const result = await makeResultAsset(info.getPayload ? info.getPayload() : info.payload, info.targets, asset.meta.sha256, info.includeOutsideGroundSupport);
        if (assetPhotoId !== photoId || resultKey !== key) return;
        resultAsset = result;
        if (epoch === cacheEpoch && autoCache) await store.cacheAssets({ result });
      } catch(e) {
        if (resultKey === key) { resultKey = null; publish({ phase: 'warning', message: `Design remains editable. Optional detection cache: ${e.message}` }); }
      }
    })();
    return resultTask;
  }
  async function collect() {
    assertSavable();
    const revision = getRevision(), photoId = getPhoto()?.photoId;
    if (photoTask) await photoTask;
    await rememberDetection();
    if (revision !== getRevision() || photoId !== getPhoto()?.photoId) stale();
    if (getPhoto() && (!photoAsset || assetPhotoId !== photoId))
      throw projectError('missingPhoto', 'The photo could not be cached. Choose a JPEG, PNG or WebP smaller than 24 MiB before saving.');
    return { document: document(), assets: { photo: photoAsset, result: resultAsset } };
  }
  async function save(name, options = {}) {
    const bundle = await collect();
    const revision = getRevision(), photoId = getPhoto()?.photoId, epoch = cacheEpoch;
    const record = await store.save(name, bundle.document, bundle.assets, options);
    if (epoch !== cacheEpoch || photoId !== getPhoto()?.photoId) return record;
    if (revision !== getRevision()) {
      publish({phase:'unsaved', message:'The previous snapshot was saved. Newer edits remain unsaved.',
        localId:record.id,localRevision:record.revision});
      return record;
    }
    cacheReady = Boolean(bundle.assets.photo); autoCache = true;
    publish({ phase: 'saved', message: 'Saved in this browser. Download a project file for a backup or another device.',
      cached: cacheReady, localId: record.id, localRevision: record.revision });
    return record;
  }
  async function download(options) {
    const bundle = await collect();
    return encodeProjectFile(bundle.document, bundle.assets, options);
  }
  async function restoreBundle(bundle, guard) {
    const prepared = prepareProjectState(bundle.document), doc = prepared.document;
    let photo = bundle.assets?.photo || null, result = bundle.assets?.result || null, detection = null, warning = '';
    if (photo) {
      if (photo.meta.sha256 !== doc.photo?.sha256) throw projectError('photoMismatch','Project/photo mismatch.');
      await verifyAsset(photo,'photo'); await makePhotoAsset(photo.blob,doc.photo,decodeImage);
    }
    if (result) {
      try { if (result.meta.sha256 !== doc.result?.sha256) throw new Error('Result reference mismatch.'); detection = await readResultAsset(result,doc.photo?.sha256); }
      catch(e) { result = null; warning = `The design was kept; optional diagnostics could not be reopened: ${e.message}`; }
    }
    if (!guard()) stale();
    // apply receives validated geometry and decoded assets; it commits camera and
    // design together. It must call guard before changing the viewer's photograph.
    await apply({ ...prepared, assets: { photo, result }, detection }, guard);
    generation++; const epoch = ++cacheEpoch; autoCache = true;
    assetPhotoId = getPhoto()?.photoId || null; photoAsset = photo; resultAsset = result;
    photoTask = resultTask = null; resultKey = null;
    missingDocument = doc.photo && !photo ? doc : null;
    cacheReady = false;
    publish({ phase: missingDocument ? 'missing' : 'opened', missingPhoto: !!missingDocument, cached: false,
      message: missingDocument ? 'The pavement and holes are open in 3D, but the photo is not in this browser. Reattach the exact original photo or open a full project file.'
        : warning || 'Project opened. No models were run.', localId: bundle.id || null, localRevision: bundle.revision || null });
    const id = assetPhotoId;
    if (photo || result) {
      try {
        await store.cacheAssets({photo,result});
        if (assetPhotoId === id && epoch === cacheEpoch) { cacheReady = Boolean(photo); publish({ cached: cacheReady }); }
      } catch(e) { if (assetPhotoId === id) publish({ phase: 'warning', message: `Project opened in memory. ${e.message}` }); }
    }
    return true;
  }
  async function openLocal(id) {
    beforeOpen(); const guard = guardFor();
    const bundle = await store.load(id);
    if (!bundle) throw projectError('missingProject','This local project was deleted. Refresh the list.');
    return restoreBundle(bundle,guard);
  }
  async function openFile(file) {
    beforeOpen(); const guard = guardFor();
    return restoreBundle(await decodeProjectFile(file,decodeImage),guard);
  }
  async function restoreSaved(snapshot) {
    beforeOpen(); const guard = guardFor(), doc = projectFromSavedState(snapshot), assets = {};
    for (const role of ['photo','result']) { try { assets[role] = await store.asset(doc[role]); } catch { assets[role] = null; } }
    return restoreBundle({ document: doc, assets },guard);
  }
  async function reattach(file) {
    if (!missingDocument?.photo) throw projectError('noMissingPhoto','This project does not need a replacement photograph.');
    assertSavable(); beforeOpen(); const guard = guardFor(), doc = document();
    const photo = await makePhotoAsset(file, doc.photo, decodeImage);
    let result = null; try { result = await store.asset(doc.result); } catch { /* optional */ }
    return restoreBundle({ document: doc, assets: {photo,result} },guard);
  }
  async function clearLocalData() {
    cacheEpoch++; autoCache = false;
    await store.clear(); cacheReady = false;
    publish({ phase: 'cleared', cached: false, localId: null, localRevision: null,
      message: 'Local projects and cached photos/results were removed. The open design remains in memory until you save or leave.' });
  }
  function markChanged() {
    if (['saved','opened'].includes(status.phase)) publish({phase:'unsaved',message:'The open project has unsaved changes. Save a new copy, update a selected save, or download a project file.'});
  }
  return { markChanged, photoLoaded, detached, rememberDetection, savedState, save, download, openLocal, openFile, restoreSaved, reattach,
    list: () => store.list(), remove: (id, revision) => store.remove(id,revision), clearLocalData,
    getStatus: () => ({...status}), getDocument: document, close: () => store.close() };
}
