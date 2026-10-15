import { SEGMENTATION_CONFIG, resolveAnalysisBase } from './segmentationConfig.js?v=tiles-corners-2';
import { prepareWorkingPhoto } from './photoPreparation.js';

const abortError = () => new DOMException('Analysis cancelled.', 'AbortError');
const failure = (code, message) => Object.assign(new Error(message), { code });
export function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(abortError()); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
export function importableBundle(payload) {
  if (!payload?.geometry) return null;
  if (payload.segmentation) return { segmentation: payload.segmentation, geometry: payload.geometry };
  const size = payload.geometry.image?.width * payload.geometry.image?.height;
  if (!Number.isSafeInteger(size) || size < 1 || size > 1100 * 1100)
    throw failure('imageMismatch', 'The service returned invalid image dimensions.');
  // Camera-only recovery: do NOT label all geometric support as grass/paving.
  return { geometry: payload.geometry, selection: {
    encoding: 'binary_rle_zero_first_row_major', counts: [size],
  } };
}

/** One per-tab controller. Tokens captured BEFORE upload survive the entire job.
 * No model response, including errors, may update a different photograph.
 * Applying a retained suggestion is a separate, explicitly authorized user action.
 */
export function createPhotoAnalysis({
  config = SEGMENTATION_CONFIG, getPhoto, getSource, getPavingState, importResult,
  onStatus = () => {}, preparePhoto = prepareWorkingPhoto,
  fetchImpl = globalThis.fetch.bind(globalThis), delay = abortableDelay,
  now = () => Date.now(), apiBase = resolveAnalysisBase(config),
  clientId = globalThis.crypto?.randomUUID?.() || `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
}) {
  let sequence = 0, generation = 0, current = null, retained = null, resultSequence = 0;
  let healthSequence = 0, serviceStatus = { state: 'unchecked', checkedAt: null };
  let status = { phase: 'idle', busy: false, photoId: null, canRestore: false, apiBase };
  const samePhoto = token => getPhoto()?.photoId === token.photoId;
  const currentDesign = token => {
    const live = getPhoto();
    return live?.photoId === token.photoId && live.designRevision === token.designRevision &&
      !live.drawing && !live.draftVertices;
  };
  function publish(patch) {
    status = { ...status, ...patch,
      canRestore: !!(retained?.payload.geometry && retained.payload.segmentation && retained.photoId === getPhoto()?.photoId) };
    onStatus(structuredClone(status));
  }
  async function request(path, options = {}, parentSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (parentSignal?.aborted) throw abortError();
    parentSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs ?? 45000);
    try {
      const response = await fetchImpl(apiBase + path, {
        ...options, signal: controller.signal, cache: 'no-store', credentials: 'omit',
        headers: { 'X-Paving-Client': clientId, ...options.headers },
      });
      const text = await response.text();
      if (text.length > 32 * 1024 * 1024) throw failure('responseTooLarge', 'The model response exceeds the import budget.');
      let body;
      try { body = JSON.parse(text); }
      catch { throw failure('serviceUnavailable', 'The analysis URL did not return JSON. Start the Python service and check its API URL/proxy.'); }
      if (!response.ok) {
        const detail = typeof body?.detail === 'string' ? body.detail : `Analysis service returned HTTP ${response.status}.`;
        throw failure(response.status === 409 || response.status === 410 ? 'superseded' :
          response.status === 429 ? 'queueFull' : 'serviceError', detail);
      }
      return body;
    } catch (error) {
      if (parentSignal?.aborted) throw abortError();
      if (controller.signal.aborted) throw failure('requestTimeout', 'The analysis service did not respond in time. Retry or continue manually.');
      if (error instanceof TypeError) throw failure('connectionFailed', `Cannot reach the analysis service at ${apiBase}. Start the step-3 Python service and check the API address and allowed website origin.`);
      throw error;
    } finally {
      clearTimeout(timer); parentSignal?.removeEventListener('abort', abort);
    }
  }
  async function checkHealth(signal) {
    const ticket = ++healthSequence;
    serviceStatus = { ...serviceStatus, state: 'checking', error: null };
    if (!signal) onStatus(structuredClone(status));
    try {
      const body = await request('/health', {}, signal);
      if (body.service !== 'paving-analysis' || body.job_api_version !== 1)
        throw failure('serviceVersion', 'This service does not support the tiles job API. Start the step-3 segmentation service.');
      if (ticket === healthSequence) serviceStatus = { state: 'reachable', checkedAt: now(),
        service: body.service, apiVersion: body.api_version, jobApiVersion: body.job_api_version,
        busy: body.busy === true, modelsLoaded: body.models_loaded || {}, limits: body.limits || {} };
      return body;
    } catch (error) {
      if (ticket === healthSequence) serviceStatus = { state: signal?.aborted ? 'cancelled' : 'unavailable',
        checkedAt: now(), error: error.message };
      throw error;
    } finally { if (ticket === healthSequence && !signal) onStatus(structuredClone(status)); }
  }
  function invalidateRemote(job) {
    if (!job?.generation) return;
    // A generation tombstone also cancels an upload whose job id was never
    // received. It cannot cancel a newer generation that arrived first.
    request(`/requests/${job.generation}`, { method: 'DELETE', keepalive: true }).catch(() => {});
  }
  function cancel({ clearResult = false, notify = true } = {}) {
    sequence++;
    if (current) {
      const old = current; current = null;
      old.controller.abort(); invalidateRemote(old);
    }
    if (clearResult) retained = null;
    const patch = { phase: clearResult ? 'idle' : 'cancelled', busy: false, error: null,
      photoId: getPhoto()?.photoId || null, errors: {}, timing_s: {} };
    if (notify) publish(patch);
    else status = { ...status, ...patch, canRestore: !!(retained?.payload.geometry && retained.payload.segmentation && retained.photoId === getPhoto()?.photoId) };
  }
  function validateReply(reply, token, working, jobGeneration) {
    if (reply.image_id !== token.photoId || reply.image?.width !== working.width || reply.image?.height !== working.height ||
        jobGeneration !== undefined && reply.generation !== jobGeneration)
      throw failure('imageMismatch', 'The service returned a result for a different upload. It was not applied.');
  }
  async function run({ replaceExisting = false, targets = config.targets || ['grass', 'dirt'] } = {}) {
    const token = getPhoto();
    if (!token || !getSource()) throw failure('noPhoto', 'Load a photograph first.');
    if (token.drawing || token.draftVertices) throw failure('unfinishedDrawing', 'Finish or cancel the current outline before analysis.');
    if (getPavingState().areaRegions.length && replaceExisting !== true)
      throw failure('replaceRequired', 'Confirm replacement before rerunning detection over an existing design.');
    cancel({ notify: false });
    if (retained?.photoId !== token.photoId) retained = null;
    const runId = sequence, controller = new AbortController(), signal = controller.signal;
    const job = { runId, token, controller, generation: ++generation, jobId: null };
    current = job;
    const start = now();
    const active = () => sequence === runId && samePhoto(token) && !signal.aborted;
    const check = () => {
      if (!active()) throw abortError();
      if (now() - start > (config.analysisTimeoutMs ?? 1200000))
        throw failure('analysisTimeout', 'Analysis exceeded the configured limit. Check the server log, retry, or continue manually.');
    };
    const progress = patch => { check(); publish({ ...patch, busy: true, elapsedMs: now() - start }); };
    publish({ phase: 'preparing', busy: true, photoId: token.photoId, error: null, errors: {}, timing_s: {}, elapsedMs: 0 });
    try {
      const working = await preparePhoto(getSource(), token, signal); check();
      progress({ phase: 'connecting' });
      const health = await checkHealth(signal); check();
      if (health.service !== 'paving-analysis' || health.job_api_version !== 1)
        throw failure('serviceVersion', 'This service does not support the tiles job API. Start the step-3 segmentation service.');
      progress({ phase: 'uploading', modelsLoaded: health.models_loaded });
      const form = new FormData();
      form.append('image_id', token.photoId); form.append('client_id', clientId);
      form.append('generation', String(job.generation)); form.append('image', working.blob, 'working-photo.jpg');
      let reply = await request('/jobs', { method: 'POST', body: form }, signal); check();
      validateReply(reply, token, working, job.generation);
      if (typeof reply.job_id !== 'string' || !/^[a-f0-9]{32}$/.test(reply.job_id))
        throw failure('invalidResult', 'The service returned an invalid job identifier.');
      job.jobId = reply.job_id;
      while (true) {
        check(); validateReply(reply, token, working, job.generation);
        if (reply.job_id !== job.jobId) throw failure('imageMismatch', 'The analysis job changed unexpectedly.');
        if (reply.state === 'completed') break;
        if (['failed', 'cancelled'].includes(reply.state))
          throw failure('analysisFailed', reply.errors?.service?.message || 'Analysis was cancelled or failed. Retry or continue manually.');
        if (!['queued', 'running'].includes(reply.state)) throw failure('invalidResult', 'Unexpected analysis job state.');
        progress({ phase: ['segmentation', 'camera'].includes(reply.stage) ? reply.stage : 'queued',
          errors: reply.errors || {}, timing_s: reply.timing_s || {} });
        await delay(config.pollIntervalMs ?? 900, signal); check();
        reply = await request(`/jobs/${job.jobId}`, {}, signal);
      }
      const payload = await request(`/jobs/${job.jobId}/result`, {}, signal); check();
      validateReply(payload, token, working);
      for (const part of [payload.geometry, payload.segmentation].filter(Boolean)) validateReply(part, token, working);
      retained = { photoId: token.photoId, resultId: `${token.photoId}:${++resultSequence}`, payload, targets: [...targets] };
      const bundle = importableBundle(payload);
      if (!bundle) {
        publish({ phase: 'manual_required', busy: false, errors: payload.errors || {}, timing_s: payload.timing_s || {},
          error: 'Automatic camera estimation was unavailable. Use the reference square to continue manually.' });
        return { applied: false, reason: 'camera', payload };
      }
      if (!payload.segmentation && getPavingState().areaRegions.length) {
        publish({ phase: 'partial_kept', busy: false, errors: payload.errors || {}, timing_s: payload.timing_s || {}, error: null });
        return { applied: false, reason: 'segmentation' };
      }
      if (!currentDesign(token)) {
        publish({ phase: 'review', busy: false, errors: payload.errors || {}, timing_s: payload.timing_s || {}, error: null });
        return { applied: false, reason: 'edited' };
      }
      progress({ phase: 'applying' });
      // Give the status DOM a frame before CPU contour conversion and tile building.
      await delay(0, signal); check();
      if (!currentDesign(token)) {
        publish({ phase: 'review', busy: false }); return { applied: false, reason: 'edited' };
      }
      const summary = importResult(bundle, { photoId: token.photoId, designRevision: token.designRevision,
        replaceExisting, targets, analysisResultId: retained.resultId, tolerancePx: config.tolerancePx ?? .75,
        maxCornersPerBoundary: config.maxCornersPerBoundary });
      publish({ phase: payload.segmentation ? 'ready' : 'camera_only', busy: false, summary,
        errors: payload.errors || {}, timing_s: payload.timing_s || {}, error: null, elapsedMs: now() - start });
      return { applied: true, summary };
    } catch (error) {
      if (!active() || error.name === 'AbortError') return { applied: false, reason: 'cancelled' };
      invalidateRemote(job);
      publish({ phase: 'error', busy: false, error: error.message || 'Analysis failed. Check the service connection or continue manually.',
        errorCode: error.code || 'connectionFailed', elapsedMs: now() - start });
      return { applied: false, reason: 'error' };
    } finally { if (current === job) current = null; }
  }
  function restore({ replaceExisting = false, targets = retained?.targets || config.targets } = {}) {
    const token = getPhoto();
    if (!token || !retained || retained.photoId !== token.photoId || !retained.payload.geometry)
      throw failure('noResult', 'There is no retained camera/suggestion for this photograph.');
    if (token.drawing || token.draftVertices) throw failure('unfinishedDrawing', 'Finish or cancel the current outline first.');
    cancel({ notify: false });
    const summary = importResult(importableBundle(retained.payload), {
      photoId: token.photoId, designRevision: token.designRevision, replaceExisting,
      targets, analysisResultId: retained.resultId, tolerancePx: config.tolerancePx ?? .75,
      maxCornersPerBoundary: config.maxCornersPerBoundary,
    });
    publish({ phase: retained.payload.segmentation ? 'ready' : 'camera_only', busy: false,
      photoId: token.photoId, summary, error: null, errors: retained.payload.errors || {} });
    return summary;
  }
  return { run, cancel, restore, checkHealth,
    getServiceStatus: () => structuredClone(serviceStatus),
    getResultInfo: () => retained?.photoId === getPhoto()?.photoId ?
      { resultId: retained.resultId, photoId: retained.photoId, targets: [...retained.targets] } : null,
    getStatus: () => structuredClone(status),
    getResult: () => retained?.photoId === getPhoto()?.photoId ? structuredClone(retained.payload) : null };
}
