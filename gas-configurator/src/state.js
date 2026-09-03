import {
  buildRouteSegments,
  clamp,
  haversineDistanceMeters,
  nearestPointOnSegmentRatio,
  normalizeCoordinate,
  routeLengthMeters,
  routeSegmentId,
} from './domain/geometry.js';
import { GROUND_TYPES, PIPE_DIAMETERS_MM, PIPE_MATERIALS, SURFACE_TYPES } from './domain/calculations.js';

const STORAGE_KEY = '360-configurator:gas-prototype:v1';
const MAX_HISTORY = 60;
const ROUTE_MODES = new Set(['inspect', 'setA', 'setB', 'addWaypoint']);
const GROUND_SOURCES = new Set(['assumption', 'publicScreening', 'verifiedSurvey']);
const UTILITY_SOURCES = new Set(['missing', 'ownerPlan', 'fieldVerified']);
const CROSSING_UTILITY_TYPES = new Set(['water', 'sewer', 'electric', 'telecom', 'districtHeating', 'other']);
const CROSSING_GAS_POSITIONS = new Set(['above', 'below']);

export const DEFAULT_STATE = Object.freeze({
  project: {
    name: 'Gas route #1',
    osdCapacityKnown: false,
  },
  route: {
    editMode: 'inspect',
    selectedSegmentId: 'a:b',
    selectedPointId: null,
    stationM: 430,
    points: [
      { id: 'a', kind: 'endpoint', label: 'A', coordinate: [26.0937, 44.4324] },
      { id: 'b', kind: 'endpoint', label: 'B', coordinate: [26.1112, 44.4252] },
    ],
  },
  pipe: {
    material: 'pe100rc',
    diameterMm: 63,
    sdr: 'SDR11',
    designPressureBar: 4,
  },
  trench: {
    coverM: 1,
    widthM: 0.55,
    beddingM: 0.1,
  },
  regulatory: {
    reducedCover: {
      osdAgreement: false,
      additionalProtection: false,
    },
  },
  crossing: {
    enabled: false,
    stationM: 800,
    utilityType: 'water',
    angleDeg: 90,
    gasPosition: 'above',
    verticalClearanceM: 0.25,
    protectiveSleeve: false,
    ownerApprovalDocumented: false,
  },
  data: {
    groundSource: 'assumption',
    utilitySource: 'missing',
    startElevationM: 82,
    endElevationM: 85,
  },
  segmentSettings: {
    'a:b': { groundType: 'common', surfaceType: 'greenfield' },
  },
  preferences: {
    locale: 'en-US',
    units: 'metric',
    currency: 'EUR',
    darkMode: false,
  },
});

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function mergeObjects(target, source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const output = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (
      value && typeof value === 'object' && !Array.isArray(value)
      && target?.[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      output[key] = mergeObjects(target[key], value);
    } else {
      output[key] = value;
    }
  });
  return output;
}

function safeChoice(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeRoutePoints(points) {
  const source = Array.isArray(points) ? points : [];
  const start = source.find((point) => point?.id === 'a') || DEFAULT_STATE.route.points[0];
  const end = source.find((point) => point?.id === 'b') || DEFAULT_STATE.route.points[1];
  const waypointIds = new Set();
  const waypoints = source.filter((point) => {
    if (!point || point.id === 'a' || point.id === 'b') return false;
    const id = String(point.id || '').trim();
    if (!id || waypointIds.has(id)) return false;
    waypointIds.add(id);
    return true;
  }).map((point, index) => ({
    id: String(point.id),
    kind: 'waypoint',
    label: String(index + 1),
    coordinate: normalizeCoordinate(point.coordinate),
  }));

  return [
    { id: 'a', kind: 'endpoint', label: 'A', coordinate: normalizeCoordinate(start.coordinate) },
    ...waypoints,
    { id: 'b', kind: 'endpoint', label: 'B', coordinate: normalizeCoordinate(end.coordinate) },
  ];
}

function normalizeSegmentSettings(points, settings = {}) {
  return Object.fromEntries(buildRouteSegments(points).map((segment) => {
    const incoming = settings?.[segment.id] || {};
    const groundType = Object.hasOwn(GROUND_TYPES, incoming.groundType) ? incoming.groundType : 'common';
    const surfaceType = Object.hasOwn(SURFACE_TYPES, incoming.surfaceType) ? incoming.surfaceType : 'greenfield';
    return [segment.id, { groundType, surfaceType }];
  }));
}

export function normalizeState(incoming = {}) {
  const merged = mergeObjects(clone(DEFAULT_STATE), incoming);
  const points = normalizeRoutePoints(merged.route?.points);
  const segments = buildRouteSegments(points);
  const segmentSettings = normalizeSegmentSettings(points, merged.segmentSettings);
  const segmentIds = new Set(segments.map((segment) => segment.id));
  const waypointIds = new Set(points.filter((point) => point.kind === 'waypoint').map((point) => point.id));
  const diameter = Number(merged.pipe?.diameterMm);
  const locale = ['en-US', 'ro-RO', 'de-DE'].includes(merged.preferences?.locale)
    ? merged.preferences.locale
    : 'en-US';

  const normalized = {
    project: {
      name: String(merged.project?.name || DEFAULT_STATE.project.name).trim().slice(0, 80) || DEFAULT_STATE.project.name,
      osdCapacityKnown: Boolean(merged.project?.osdCapacityKnown),
    },
    route: {
      editMode: safeChoice(merged.route?.editMode, ROUTE_MODES, 'inspect'),
      selectedSegmentId: segmentIds.has(merged.route?.selectedSegmentId)
        ? merged.route.selectedSegmentId
        : segments[0]?.id || null,
      selectedPointId: waypointIds.has(merged.route?.selectedPointId) ? merged.route.selectedPointId : null,
      stationM: 0,
      points,
    },
    pipe: {
      material: Object.hasOwn(PIPE_MATERIALS, merged.pipe?.material) ? merged.pipe.material : 'pe100rc',
      diameterMm: PIPE_DIAMETERS_MM.includes(diameter) ? diameter : 63,
      sdr: ['SDR11', 'SDR17'].includes(merged.pipe?.sdr) ? merged.pipe.sdr : 'SDR11',
      designPressureBar: clamp(finiteNumber(merged.pipe?.designPressureBar, 4), 0.05, 6),
    },
    trench: {
      coverM: clamp(finiteNumber(merged.trench?.coverM, 1), 0.3, 3),
      widthM: clamp(finiteNumber(merged.trench?.widthM, 0.55), 0.3, 2),
      beddingM: clamp(finiteNumber(merged.trench?.beddingM, 0.1), 0.05, 0.5),
    },
    regulatory: {
      reducedCover: {
        osdAgreement: Boolean(merged.regulatory?.reducedCover?.osdAgreement),
        additionalProtection: Boolean(merged.regulatory?.reducedCover?.additionalProtection),
      },
    },
    crossing: {
      enabled: Boolean(merged.crossing?.enabled),
      stationM: 0,
      utilityType: safeChoice(merged.crossing?.utilityType, CROSSING_UTILITY_TYPES, 'water'),
      angleDeg: clamp(finiteNumber(merged.crossing?.angleDeg, 90), 0, 90),
      gasPosition: safeChoice(merged.crossing?.gasPosition, CROSSING_GAS_POSITIONS, 'above'),
      verticalClearanceM: clamp(finiteNumber(merged.crossing?.verticalClearanceM, 0.25), 0, 5),
      protectiveSleeve: Boolean(merged.crossing?.protectiveSleeve),
      ownerApprovalDocumented: Boolean(merged.crossing?.ownerApprovalDocumented),
    },
    data: {
      groundSource: safeChoice(merged.data?.groundSource, GROUND_SOURCES, 'assumption'),
      utilitySource: safeChoice(merged.data?.utilitySource, UTILITY_SOURCES, 'missing'),
      startElevationM: clamp(finiteNumber(merged.data?.startElevationM, 82), -50, 2_500),
      endElevationM: clamp(finiteNumber(merged.data?.endElevationM, 85), -50, 2_500),
    },
    segmentSettings,
    preferences: {
      locale,
      units: ['metric', 'imperial'].includes(merged.preferences?.units) ? merged.preferences.units : 'metric',
      currency: ['EUR', 'RON', 'USD'].includes(merged.preferences?.currency) ? merged.preferences.currency : 'EUR',
      darkMode: Boolean(merged.preferences?.darkMode),
    },
  };

  normalized.route.stationM = clamp(
    finiteNumber(merged.route?.stationM, 0),
    0,
    routeLengthMeters(normalized.route.points),
  );
  normalized.crossing.stationM = clamp(
    finiteNumber(merged.crossing?.stationM, DEFAULT_STATE.crossing.stationM),
    0,
    routeLengthMeters(normalized.route.points),
  );
  return normalized;
}

function loadLocalState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setAtPath(object, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  let target = object;
  parts.slice(0, -1).forEach((part) => {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  });
  target[parts.at(-1)] = value;
}

export class GasConfiguratorStore {
  constructor(initialState = null) {
    this.state = normalizeState(initialState || loadLocalState() || DEFAULT_STATE);
    this.listeners = new Set();
    this.history = [];
  }

  get() {
    return this.state;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.state, { source: 'initial' });
    return () => this.listeners.delete(listener);
  }

  notify(meta = {}) {
    this.listeners.forEach((listener) => listener(this.state, meta));
  }

  persist() {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* optional */ }
  }

  commit(nextState, { recordHistory = true, persist = true, source = 'update' } = {}) {
    const normalized = normalizeState(nextState);
    if (JSON.stringify(normalized) === JSON.stringify(this.state)) return false;
    if (recordHistory) {
      this.history.push(clone(this.state));
      if (this.history.length > MAX_HISTORY) this.history.shift();
    }
    this.state = normalized;
    if (persist) this.persist();
    this.notify({ source });
    return true;
  }

  update(path, value, options = {}) {
    const next = clone(this.state);
    setAtPath(next, path, value);
    return this.commit(next, { source: path, ...options });
  }

  setEditMode(mode) {
    return this.update('route.editMode', mode, { recordHistory: false, source: 'route-mode' });
  }

  selectSegment(segmentId, stationM = null) {
    const next = clone(this.state);
    next.route.selectedSegmentId = segmentId;
    if (stationM !== null) next.route.stationM = stationM;
    return this.commit(next, { recordHistory: false, source: 'route-selection' });
  }

  setStation(stationM) {
    return this.update('route.stationM', stationM, { recordHistory: false, source: 'station' });
  }

  setCrossingStation(stationM) {
    return this.update('crossing.stationM', stationM, { source: 'crossing-station' });
  }

  selectPoint(pointId) {
    return this.update('route.selectedPointId', pointId, { recordHistory: false, source: 'point-selection' });
  }

  movePoint(pointId, coordinate) {
    const next = clone(this.state);
    const point = next.route.points.find((candidate) => candidate.id === pointId);
    if (!point) return false;
    point.coordinate = normalizeCoordinate(coordinate);
    return this.commit(next, { source: 'route-point' });
  }

  setEndpoint(id, coordinate) {
    if (id !== 'a' && id !== 'b') return false;
    const changed = this.movePoint(id, coordinate);
    if (changed) this.setEditMode('inspect');
    return changed;
  }

  addWaypoint(coordinate) {
    const next = clone(this.state);
    const requestedCoordinate = normalizeCoordinate(coordinate);
    const segments = buildRouteSegments(next.route.points);
    const nearestSegment = segments.reduce((nearest, segment) => {
      const ratio = nearestPointOnSegmentRatio(requestedCoordinate, segment);
      const start = segment.startPoint.coordinate;
      const end = segment.endPoint.coordinate;
      const projected = [
        start[0] + ((end[0] - start[0]) * ratio),
        start[1] + ((end[1] - start[1]) * ratio),
      ];
      const distanceM = haversineDistanceMeters(requestedCoordinate, projected);
      return !nearest || distanceM < nearest.distanceM ? { segment, distanceM } : nearest;
    }, null)?.segment || segments.at(-1);
    if (!nearestSegment) return false;
    const insertIndex = nearestSegment.index + 1;
    const before = next.route.points[nearestSegment.index];
    const end = next.route.points[insertIndex];
    const oldSegmentId = nearestSegment.id;
    const inherited = clone(next.segmentSettings?.[oldSegmentId] || { groundType: 'common', surfaceType: 'greenfield' });
    const id = `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const waypoint = { id, kind: 'waypoint', label: '', coordinate: requestedCoordinate };
    next.route.points.splice(insertIndex, 0, waypoint);
    next.route.selectedPointId = id;
    delete next.segmentSettings[oldSegmentId];
    next.segmentSettings[routeSegmentId(before, waypoint)] = clone(inherited);
    next.segmentSettings[routeSegmentId(waypoint, end)] = clone(inherited);
    next.route.selectedSegmentId = routeSegmentId(before, waypoint);
    return this.commit(next, { source: 'waypoint-add' });
  }

  removeSelectedWaypoint() {
    const selectedId = this.state.route.selectedPointId;
    const index = this.state.route.points.findIndex((point) => point.id === selectedId && point.kind === 'waypoint');
    if (index < 1 || index >= this.state.route.points.length - 1) return false;

    const next = clone(this.state);
    const previous = next.route.points[index - 1];
    const removed = next.route.points[index];
    const following = next.route.points[index + 1];
    const inherited = clone(
      next.segmentSettings[routeSegmentId(previous, removed)]
      || next.segmentSettings[routeSegmentId(removed, following)]
      || { groundType: 'common', surfaceType: 'greenfield' },
    );
    next.route.points.splice(index, 1);
    next.route.selectedPointId = null;
    next.segmentSettings[routeSegmentId(previous, following)] = inherited;
    return this.commit(next, { source: 'waypoint-remove' });
  }

  clearWaypoints() {
    const next = clone(this.state);
    const start = next.route.points[0];
    const end = next.route.points.at(-1);
    const selectedSetting = clone(
      next.segmentSettings[next.route.selectedSegmentId]
      || { groundType: 'common', surfaceType: 'greenfield' },
    );
    next.route.points = [start, end];
    next.route.selectedPointId = null;
    next.route.selectedSegmentId = routeSegmentId(start, end);
    next.segmentSettings = { [next.route.selectedSegmentId]: selectedSetting };
    return this.commit(next, { source: 'waypoints-clear' });
  }

  setSegmentSetting(key, value) {
    const segmentId = this.state.route.selectedSegmentId;
    if (!segmentId) return false;
    return this.update(`segmentSettings.${segmentId}.${key}`, value, { source: `segment-${key}` });
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return false;
    this.state = normalizeState(previous);
    this.persist();
    this.notify({ source: 'undo' });
    return true;
  }

  reset() {
    const preferences = clone(this.state.preferences);
    this.commit({ ...clone(DEFAULT_STATE), preferences }, { source: 'reset' });
    return true;
  }

  captureState() {
    return clone(this.state);
  }

  restoreState(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    return this.commit(snapshot, { source: 'restore' });
  }
}
