import { AR_FUNCTION_BASE, AR_SESSION_ID, arModelUrl, requireProduct } from './links.js?v=firebase-ar-8';
function coded(code) { const error = new Error(code); error.code = code; return error; }
export async function publishAR(asset, { product = 'hall', signal, onProgress = () => {} } = {}) {
  requireProduct(product);
  const session = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${AR_FUNCTION_BASE}/publishHallAR?product=${product}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.setRequestHeader('X-Hall-AR-Format', asset.format);
    xhr.timeout = 180000;
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener('abort', abort);
    if (signal?.aborted) { reject(new DOMException('Aborted','AbortError')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded/event.total); };
    xhr.onerror = () => { cleanup(); reject(coded('network')); };
    xhr.ontimeout = () => { cleanup(); reject(coded('network')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Aborted','AbortError')); };
    xhr.onload = () => {
      cleanup(); let data;
      try { data = JSON.parse(xhr.responseText); } catch { reject(coded('service-unavailable')); return; }
      if (xhr.status < 200 || xhr.status >= 300 || data?.error) { reject(coded(data?.error?.code || 'service-unavailable')); return; }
      if ((data?.product || 'hall') !== product || !AR_SESSION_ID.test(data?.id) || data.format !== asset.format || data.byteLength !== asset.blob.size || !(data.expiresAtMs > Date.now())) {
        reject(coded('service-unavailable')); return;
      }
      resolve(data);
    };
    xhr.send(asset.blob);
  });
  // Never display a QR until the uploaded native-viewer asset is reachable.
  onProgress(1);
  const check = new AbortController();
  const abortCheck = () => check.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', abortCheck, { once: true });
  const timer = setTimeout(abortCheck, 20000);
  try {
    const response = await fetch(arModelUrl(session.id, session.format, product), { method: 'HEAD', signal: check.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok || Number(response.headers.get('content-length')) !== asset.blob.size) throw coded('service-unavailable');
    return session;
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (error.name === 'AbortError') throw coded('network');
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abortCheck); }
}
