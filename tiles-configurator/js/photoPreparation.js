/** Prepare exactly one oriented, proportionally resized raster for BOTH models.
 * HTMLImageElement applies EXIF orientation; drawing it removes EXIF metadata.
 * The original image stays the backdrop. No cropping, flipping, or second rotation.
 */
export function workingImageSize(width, height, maxSide = 1100) {
  if (![width, height].every(v => Number.isSafeInteger(v) && v >= 32))
    throw new Error('The photo must be at least 32 pixels on each side.');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const size = { width: Math.round(width * scale), height: Math.round(height * scale) };
  if (Math.min(size.width, size.height) < 32)
    throw new Error('This photo is too panoramic for automatic analysis. Use manual calibration or a less extreme aspect ratio.');
  return size;
}
const abortError = () => new DOMException('Photo preparation cancelled.', 'AbortError');
export async function prepareWorkingPhoto(source, token, signal) {
  if (signal?.aborted) throw abortError();
  const image = new Image();
  // Same-origin/blob photos do not need this; explicit CORS avoids a silently
  // tainted canvas when callers provide an allowed remote sample photo.
  if (!String(source).startsWith('blob:')) image.crossOrigin = 'anonymous';
  await new Promise((resolve, reject) => {
    const cleanup = () => { image.onload = image.onerror = null; signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); image.src = ''; reject(abortError()); };
    image.onload = () => { cleanup(); resolve(); };
    image.onerror = () => { cleanup(); reject(new Error('Could not prepare this photo for analysis. Continue manually or select another image.')); };
    signal?.addEventListener('abort', abort, { once: true });
    image.src = source;
  });
  if (signal?.aborted) throw abortError();
  if (image.naturalWidth !== token.width || image.naturalHeight !== token.height)
    throw new Error('The photo changed while preparing the working image.');
  const size = workingImageSize(token.width, token.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not prepare the photo canvas.');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(image, 0, 0, size.width, size.height);
  const blob = await new Promise((resolve, reject) => {
    try { canvas.toBlob(v => v ? resolve(v) : reject(new Error('Photo encoding failed.')), 'image/jpeg', .94); }
    catch (e) { reject(e); }
  });
  canvas.width = canvas.height = 1;
  if (signal?.aborted) throw abortError();
  if (blob.size > 8 * 1024 * 1024) throw new Error('The prepared photo exceeds the service upload limit.');
  return { blob, ...size };
}
