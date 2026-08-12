const EARTH_METERS_PER_DEG = 111320;
const TERRAIN_ZOOM = 15;
const DEFAULT_TERRAIN_TEMPLATE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const SAME_ORIGIN_OVERPASS_ENDPOINTS = [
  '/api/solar/overpass-primary',
  '/api/solar/overpass-secondary',
];
const DIRECT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const completedTerrainTiles = new Map();
const completedOsmContexts = new Map();
const OSM_CACHE_TTL_MS = 15 * 60 * 1000;
const OVERPASS_TIMEOUT_MS = 25000;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function configuredTerrainTemplate() {
  return String(window.SOLAR_TERRAIN_TILE_ENDPOINT || DEFAULT_TERRAIN_TEMPLATE).trim() || DEFAULT_TERRAIN_TEMPLATE;
}

function configuredOverpassEndpoints() {
  const configured = window.SOLAR_OVERPASS_ENDPOINTS;
  if (Array.isArray(configured) && configured.length) return configured.map(String).filter(Boolean);
  if (typeof configured === 'string' && configured.trim()) return configured.split(',').map((item) => item.trim()).filter(Boolean);

  // Production deployments must stay same-origin. Falling back from Cloud Run
  // to the public Overpass URLs would re-introduce browser CORS failures.
  const hostname = String(window.location?.hostname || '').toLowerCase();
  const isLocalDevelopment = (
    window.location?.protocol === 'file:'
    || hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname === '::1'
  );

  // Local/static development can still try the public endpoints when no local
  // reverse proxy exists. Cloud Run / production uses only the nginx proxies.
  return isLocalDevelopment
    ? [...SAME_ORIGIN_OVERPASS_ENDPOINTS, ...DIRECT_OVERPASS_ENDPOINTS]
    : [...SAME_ORIGIN_OVERPASS_ENDPOINTS];
}

function terrainUrl(z, x, y) {
  return configuredTerrainTemplate()
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

function lonLatToTileFraction(lon, lat, zoom = TERRAIN_ZOOM) {
  const n = 2 ** zoom;
  const safeLat = clamp(Number(lat), -85.05112878, 85.05112878);
  const x = ((Number(lon) + 180) / 360) * n;
  const latRad = safeLat * Math.PI / 180;
  const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
  return { x, y };
}

async function blobToImageData(blob) {
  let source = null;
  let revokeUrl = null;
  try {
    if ('createImageBitmap' in window) source = await createImageBitmap(blob);
    else {
      const objectUrl = URL.createObjectURL(blob);
      revokeUrl = objectUrl;
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Could not decode terrain tile image.'));
        image.src = objectUrl;
      });
    }
    const width = source.width || 256;
    const height = source.height || 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas 2D context is not available.');
    context.drawImage(source, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    source?.close?.();
    if (revokeUrl) URL.revokeObjectURL(revokeUrl);
  }
}

async function fetchTerrainTile(z, x, y, signal) {
  const n = 2 ** z;
  const wrappedX = ((x % n) + n) % n;
  const clampedY = clamp(y, 0, n - 1);
  const key = `${z}/${wrappedX}/${clampedY}`;
  if (completedTerrainTiles.has(key)) return completedTerrainTiles.get(key);

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(terrainUrl(z, wrappedX, clampedY), {
        signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'force-cache',
      });
      if (!response.ok) throw new Error(`Terrain tile HTTP ${response.status}`);
      const imageData = await blobToImageData(await response.blob());
      const tile = { imageData, width: imageData.width, height: imageData.height };
      completedTerrainTiles.set(key, tile);
      if (completedTerrainTiles.size > 24) completedTerrainTiles.delete(completedTerrainTiles.keys().next().value);
      return tile;
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  }
  throw lastError || new Error('Terrain tile unavailable.');
}

function decodeTerrariumPixel(tile, px, py) {
  const x = clamp(Math.floor(px), 0, tile.width - 1);
  const y = clamp(Math.floor(py), 0, tile.height - 1);
  const offset = (y * tile.width + x) * 4;
  const data = tile.imageData.data;
  return data[offset] * 256 + data[offset + 1] + data[offset + 2] / 256 - 32768;
}

async function loadTerrain({ lat, lon, radiusM, segments, signal }) {
  const latScale = EARTH_METERS_PER_DEG;
  const lonScale = EARTH_METERS_PER_DEG * Math.cos(Number(lat) * Math.PI / 180);
  const dLat = radiusM / latScale;
  const dLon = radiusM / Math.max(1, lonScale);
  const northWest = lonLatToTileFraction(lon - dLon, lat + dLat, TERRAIN_ZOOM);
  const southEast = lonLatToTileFraction(lon + dLon, lat - dLat, TERRAIN_ZOOM);
  const minTileX = Math.floor(Math.min(northWest.x, southEast.x));
  const maxTileX = Math.floor(Math.max(northWest.x, southEast.x));
  const minTileY = Math.floor(Math.min(northWest.y, southEast.y));
  const maxTileY = Math.floor(Math.max(northWest.y, southEast.y));

  const tileRequests = [];
  for (let ty = minTileY; ty <= maxTileY; ty += 1) {
    for (let tx = minTileX; tx <= maxTileX; tx += 1) {
      tileRequests.push(fetchTerrainTile(TERRAIN_ZOOM, tx, ty, signal).then((tile) => [`${tx}/${ty}`, tile]));
    }
  }
  const tiles = new Map(await Promise.all(tileRequests));

  const sampleAt = (sampleLat, sampleLon) => {
    const tileCoord = lonLatToTileFraction(sampleLon, sampleLat, TERRAIN_ZOOM);
    const tx = Math.floor(tileCoord.x);
    const ty = Math.floor(tileCoord.y);
    const tile = tiles.get(`${tx}/${ty}`);
    if (!tile) return NaN;
    const px = (tileCoord.x - tx) * tile.width;
    const py = (tileCoord.y - ty) * tile.height;
    return decodeTerrariumPixel(tile, px, py);
  };

  const centerElevationM = sampleAt(lat, lon);
  if (!Number.isFinite(centerElevationM)) throw new Error('Terrain elevation could not be decoded.');

  const size = Math.max(17, Math.min(97, Math.round(segments) + 1));
  const heights = new Float32Array(size * size);
  let minElevationM = Infinity;
  let maxElevationM = -Infinity;
  for (let row = 0; row < size; row += 1) {
    const z = -radiusM + (row / (size - 1)) * radiusM * 2;
    const northMeters = -z;
    const sampleLat = Number(lat) + northMeters / latScale;
    for (let column = 0; column < size; column += 1) {
      const x = -radiusM + (column / (size - 1)) * radiusM * 2;
      const sampleLon = Number(lon) + x / lonScale;
      const elevation = sampleAt(sampleLat, sampleLon);
      const safeElevation = Number.isFinite(elevation) ? elevation : centerElevationM;
      heights[row * size + column] = safeElevation;
      minElevationM = Math.min(minElevationM, safeElevation);
      maxElevationM = Math.max(maxElevationM, safeElevation);
    }
  }

  return {
    radiusM,
    size,
    heights,
    centerElevationM,
    minElevationM,
    maxElevationM,
    zoom: TERRAIN_ZOOM,
    source: 'Mapzen Terrarium / AWS Open Data',
  };
}

function toLocalMeters(pointLat, pointLon, centerLat, centerLon) {
  const north = (Number(pointLat) - Number(centerLat)) * EARTH_METERS_PER_DEG;
  const east = (Number(pointLon) - Number(centerLon))
    * EARTH_METERS_PER_DEG
    * Math.cos(Number(centerLat) * Math.PI / 180);
  return { x: east, z: -north };
}

function parseLengthMeters(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().toLowerCase().replace(',', '.');
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return null;
  if (/\b(ft|feet|foot)\b|'$/.test(text)) return number * 0.3048;
  if (/\b(cm)\b/.test(text)) return number / 100;
  return number;
}

function buildingHeight(tags = {}) {
  const explicit = parseLengthMeters(tags.height);
  if (Number.isFinite(explicit) && explicit > 1) return clamp(explicit, 2.2, 80);
  const levels = Number.parseFloat(String(tags['building:levels'] || '').replace(',', '.'));
  if (Number.isFinite(levels) && levels > 0) return clamp(levels * 2.9 + 0.7, 2.8, 80);
  const type = String(tags.building || '').toLowerCase();
  if (/garage|shed|carport|roof/.test(type)) return 3.1;
  if (/apartments|office|hotel|commercial|retail/.test(type)) return 10.2;
  if (/industrial|warehouse/.test(type)) return 6.5;
  return 6.4;
}

function treeHeight(tags = {}) {
  const explicit = parseLengthMeters(tags.height);
  if (Number.isFinite(explicit) && explicit > 1) return clamp(explicit, 2.5, 28);
  return 7.5;
}

function roadWidth(tags = {}) {
  const explicit = parseLengthMeters(tags.width);
  if (Number.isFinite(explicit) && explicit > 0.8) return clamp(explicit, 1.5, 18);
  const lanes = Number.parseFloat(tags.lanes);
  if (Number.isFinite(lanes) && lanes > 0) return clamp(lanes * 3.1, 2.5, 18);
  const highway = String(tags.highway || 'residential');
  if (/primary/.test(highway)) return 8.5;
  if (/secondary/.test(highway)) return 7.2;
  if (/tertiary/.test(highway)) return 6.4;
  if (/service/.test(highway)) return 3.2;
  return 5.4;
}

function polygonCentroid(points) {
  if (!points.length) return { x: 0, z: 0 };
  let x = 0;
  let z = 0;
  points.forEach((point) => { x += point.x; z += point.z; });
  return { x: x / points.length, z: z / points.length };
}

function geometryToPoints(geometry, centerLat, centerLon) {
  const points = (geometry || [])
    .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)))
    .map((point) => toLocalMeters(point.lat, point.lon, centerLat, centerLon));
  if (points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 0.05) points.pop();
  }
  return points;
}

function createLinkedTimeoutSignal(parentSignal, timeoutMs = OVERPASS_TIMEOUT_MS) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason || new DOMException('Aborted', 'AbortError'));
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Overpass request timed out.', 'TimeoutError'));
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup() {
      window.clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

async function queryOverpass(endpoint, query, signal) {
  const request = createLinkedTimeoutSignal(signal);
  const body = new URLSearchParams({ data: query });
  const isSameOriginProxy = String(endpoint).startsWith('/');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: request.signal,
      mode: isSameOriginProxy ? 'same-origin' : 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
    });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('json')) {
      throw new Error(`Overpass returned ${contentType || 'an unexpected response'} instead of JSON.`);
    }
    return await response.json();
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (request.timedOut()) throw new Error('Overpass request timed out.');
    throw error;
  } finally {
    request.cleanup();
  }
}

function osmCacheKey(lat, lon, radiusM) {
  return `${Number(lat).toFixed(5)}/${Number(lon).toFixed(5)}/${Math.round(Number(radiusM) || 180)}`;
}

async function loadOsmContext({ lat, lon, radiusM, signal, forceRefresh = false }) {
  const cacheKey = osmCacheKey(lat, lon, radiusM);
  const cached = completedOsmContexts.get(cacheKey);
  const cacheAge = cached ? Date.now() - cached.loadedAt : Infinity;
  if (!forceRefresh && cached && cacheAge < OSM_CACHE_TTL_MS) {
    return { ...cached.data, cacheStatus: 'fresh' };
  }

  const query = `[out:json][timeout:16];\n(\n`
    + `way["building"](around:${Math.round(radiusM)},${lat},${lon});\n`
    + `way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|service)$"](around:${Math.round(radiusM)},${lat},${lon});\n`
    + `node["natural"="tree"](around:${Math.round(radiusM)},${lat},${lon});\n`
    + `);\nout tags geom;`;

  let payload = null;
  let lastError = null;
  for (const endpoint of configuredOverpassEndpoints()) {
    try {
      payload = await queryOverpass(endpoint, query, signal);
      break;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error;
      console.warn(`[Solar configurator] Overpass endpoint failed: ${endpoint}`, error);
    }
  }

  if (!payload) {
    if (cached) {
      return {
        ...cached.data,
        cacheStatus: 'stale',
        cacheWarning: `Live OpenStreetMap refresh failed; reused cached context (${lastError?.message || 'Overpass unavailable'}).`,
      };
    }
    throw lastError || new Error('No Overpass endpoint returned data.');
  }

  const buildings = [];
  const roads = [];
  const trees = [];
  for (const element of payload.elements || []) {
    const tags = element.tags || {};
    if (element.type === 'way' && tags.building) {
      const points = geometryToPoints(element.geometry, lat, lon);
      if (points.length < 3) continue;
      const centroid = polygonCentroid(points);
      buildings.push({
        id: element.id,
        points,
        centroid,
        heightM: buildingHeight(tags),
        type: tags.building || 'yes',
        name: tags.name || '',
      });
    } else if (element.type === 'way' && tags.highway) {
      const points = geometryToPoints(element.geometry, lat, lon);
      if (points.length < 2) continue;
      roads.push({ id: element.id, points, widthM: roadWidth(tags), type: tags.highway });
    } else if (element.type === 'node' && tags.natural === 'tree') {
      if (!Number.isFinite(Number(element.lat)) || !Number.isFinite(Number(element.lon))) continue;
      const point = toLocalMeters(element.lat, element.lon, lat, lon);
      trees.push({ id: element.id, ...point, heightM: treeHeight(tags) });
    }
  }

  buildings.sort((a, b) => Math.hypot(a.centroid.x, a.centroid.z) - Math.hypot(b.centroid.x, b.centroid.z));
  trees.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const data = {
    buildings: buildings.slice(0, 240),
    roads: roads.slice(0, 180),
    trees: trees.slice(0, 220),
    source: 'OpenStreetMap via Overpass API',
  };
  completedOsmContexts.set(cacheKey, { data, loadedAt: Date.now() });
  if (completedOsmContexts.size > 12) completedOsmContexts.delete(completedOsmContexts.keys().next().value);
  return { ...data, cacheStatus: 'network' };
}

export async function loadGeographicEnvironment({
  lat,
  lon,
  radiusM = 180,
  terrainSegments = 64,
  signal,
  forceRefresh = false,
  onProgress,
} = {}) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  const radius = clamp(Number(radiusM) || 180, 80, 400);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Exact coordinates are required.');

  let progressiveTerrain = null;
  let progressiveOsm = null;
  const emitProgress = (stage) => {
    if (signal?.aborted || typeof onProgress !== 'function') return;
    try {
      onProgress({
        center: { lat: latitude, lon: longitude },
        radiusM: radius,
        terrain: progressiveTerrain,
        buildings: progressiveOsm?.buildings || [],
        roads: progressiveOsm?.roads || [],
        trees: progressiveOsm?.trees || [],
        errors: [],
        progressStage: stage,
        loadedAt: Date.now(),
      });
    } catch (error) {
      console.info('[Solar configurator] Environment progress renderer skipped an update.', error);
    }
  };

  const terrainPromise = loadTerrain({
    lat: latitude, lon: longitude, radiusM: radius, segments: terrainSegments, signal,
  }).then((terrain) => {
    progressiveTerrain = terrain;
    emitProgress('terrain');
    return terrain;
  });
  const osmPromise = loadOsmContext({
    lat: latitude, lon: longitude, radiusM: radius, signal, forceRefresh,
  }).then((osm) => {
    progressiveOsm = osm;
    emitProgress('osm');
    return osm;
  });

  const [terrainResult, osmResult] = await Promise.allSettled([terrainPromise, osmPromise]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const errors = [];
  const terrain = terrainResult.status === 'fulfilled' ? terrainResult.value : null;
  const osm = osmResult.status === 'fulfilled' ? osmResult.value : { buildings: [], roads: [], trees: [] };
  if (terrainResult.status === 'rejected') errors.push(`Terrain: ${terrainResult.reason?.message || 'unavailable'}`);
  if (osmResult.status === 'rejected') errors.push(`OSM context: ${osmResult.reason?.message || 'unavailable'}`);
  if (osm.cacheWarning) errors.push(osm.cacheWarning);
  if (!terrain && osmResult.status === 'rejected') {
    const error = new Error(errors.join(' · ') || 'Geographic context unavailable.');
    error.cause = { terrain: terrainResult.reason, osm: osmResult.reason };
    throw error;
  }

  return {
    center: { lat: latitude, lon: longitude },
    radiusM: radius,
    terrain,
    buildings: osm.buildings || [],
    roads: osm.roads || [],
    trees: osm.trees || [],
    errors,
    loadedAt: Date.now(),
  };
}
