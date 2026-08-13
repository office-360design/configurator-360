import { regionPresets } from './state.js?v=7';
import { getActiveLocation, getSolarContext, getSunTimes } from './solarPosition.js?v=2';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const normalizeDeg = (value) => ((value % 360) + 360) % 360;
const signedAngle = (value) => ((normalizeDeg(value) + 180) % 360) - 180;
const seasonalPotentialCache = new Map();
const localBuildingFactorCache = new Map();
const LOCAL_BUILDING_DIFFUSE_RETAINED = 0.18;

function normalizedHorizonProfile(profile) {
  return (Array.isArray(profile) ? profile : [])
    .map((point) => ({
      azimuthDeg: normalizeDeg(Number(point?.azimuthDeg)),
      elevationDeg: Number(point?.elevationDeg),
    }))
    .filter((point) => Number.isFinite(point.azimuthDeg) && Number.isFinite(point.elevationDeg))
    .sort((a, b) => a.azimuthDeg - b.azimuthDeg);
}

export function horizonElevationAtAzimuth(profile, azimuthDeg) {
  const points = normalizedHorizonProfile(profile);
  if (!points.length) return 0;
  if (points.length === 1) return points[0].elevationDeg;
  const azimuth = normalizeDeg(Number(azimuthDeg) || 0);
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const start = current.azimuthDeg;
    const end = index === points.length - 1 ? next.azimuthDeg + 360 : next.azimuthDeg;
    const target = index === points.length - 1 && azimuth < start ? azimuth + 360 : azimuth;
    if (target < start - 1e-9 || target > end + 1e-9) continue;
    const span = Math.max(1e-9, end - start);
    const t = clamp((target - start) / span, 0, 1);
    return current.elevationDeg + (next.elevationDeg - current.elevationDeg) * t;
  }
  return points[0].elevationDeg;
}

export function sunClearsPvgisHorizon(state, sun) {
  if (!state?.pvgisUseHorizon || !Array.isArray(state?.pvgisHorizonProfile) || !state.pvgisHorizonProfile.length) return true;
  if (!sun || !Number.isFinite(Number(sun.azimuthDeg)) || !Number.isFinite(Number(sun.elevationDeg))) return true;
  return Number(sun.elevationDeg) > horizonElevationAtAzimuth(state.pvgisHorizonProfile, sun.azimuthDeg);
}

function localBuildingHorizonAtAzimuth(profile, model, azimuthDeg) {
  const samples = Array.isArray(profile?.samples) ? profile.samples : [];
  const stepDeg = Math.max(0.1, Number(model?.stepDeg) || 2);
  if (!samples.length) return -90;
  const azimuth = normalizeDeg(Number(azimuthDeg) || 0);
  const indexFloat = azimuth / stepDeg;
  const lowerIndex = Math.floor(indexFloat) % samples.length;
  const upperIndex = (lowerIndex + 1) % samples.length;
  const fraction = indexFloat - Math.floor(indexFloat);
  const lower = Number(samples[lowerIndex]);
  const upper = Number(samples[upperIndex]);
  if (!Number.isFinite(lower)) return Number.isFinite(upper) ? upper : -90;
  if (!Number.isFinite(upper)) return lower;
  return lower + (upper - lower) * fraction;
}

function localProfilesForSurface(model, surfaceId = null) {
  const profiles = Array.isArray(model?.profiles) ? model.profiles : [];
  if (!surfaceId) return profiles;
  const matches = profiles.filter((profile) => String(profile?.surfaceId) === String(surfaceId));
  return matches.length ? matches : profiles;
}

export function localBuildingShadeAtSun(state, sun, surfaceId = null) {
  const model = state?.localBuildingShadingModel;
  const enabled = state?.localBuildingShadingEnabled !== false && Array.isArray(model?.profiles) && model.profiles.length > 0;
  const profiles = enabled ? localProfilesForSurface(model, surfaceId) : [];
  if (!enabled || !sun || Number(sun.elevationDeg) <= -0.833 || !profiles.length) {
    return { active: enabled, blockedPanels: 0, totalPanels: profiles.length, blockedFraction: 0, transmission: 1 };
  }
  let blockedPanels = 0;
  profiles.forEach((profile) => {
    const horizon = localBuildingHorizonAtAzimuth(profile, model, sun.azimuthDeg);
    if (Number(sun.elevationDeg) <= horizon) blockedPanels += 1;
  });
  const blockedFraction = blockedPanels / profiles.length;
  const transmission = 1 - blockedFraction * (1 - LOCAL_BUILDING_DIFFUSE_RETAINED);
  return {
    active: true,
    blockedPanels,
    totalPanels: profiles.length,
    blockedFraction,
    transmission: clamp(transmission, LOCAL_BUILDING_DIFFUSE_RETAINED, 1),
  };
}

function lastSundayOfMonth(year, month) {
  const date = new Date(Date.UTC(year, month, 0));
  return date.getUTCDate() - date.getUTCDay();
}

function romanianDstActive(dateString) {
  const match = String(dateString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;
  if (month === 3) return day >= lastSundayOfMonth(year, 3);
  return day < lastSundayOfMonth(year, 10);
}

function googleProfilesForSurface(model, surfaceId = null) {
  const profiles = Array.isArray(model?.profiles) ? model.profiles : [];
  if (!surfaceId) return profiles;
  const matches = profiles.filter((profile) => String(profile?.surfaceId) === String(surfaceId));
  return matches.length ? matches : profiles;
}

export function googleSolarShadeAtSun(state, sun, surfaceId = null) {
  const model = state?.googleSolarShadeModel;
  const enabled = state?.googleSolarShadingEnabled !== false && Array.isArray(model?.profiles) && model.profiles.length > 0;
  const profiles = enabled ? googleProfilesForSurface(model, surfaceId) : [];
  if (!enabled || !sun || Number(sun.elevationDeg) <= -0.833 || !profiles.length) {
    return { active: enabled, provider: 'google', blockedPanels: 0, totalPanels: profiles.length, blockedFraction: 0, transmission: 1 };
  }

  const match = String(sun.dateString || state?.simulationDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { active: false, provider: 'google', blockedPanels: 0, totalPanels: profiles.length, blockedFraction: 0, transmission: 1 };
  const month = clamp(Number(match[2]), 1, 12);
  const maxGoogleDay = month === 2 ? 28 : new Date(Number(match[1]), month, 0).getDate();
  const day = clamp(Number(match[3]), 1, maxGoogleDay);
  const dstAdjustment = romanianDstActive(sun.dateString || state?.simulationDate) ? 1 : 0;
  const standardHour = ((Math.floor(Number(sun.hour) || 0) - dstAdjustment) % 24 + 24) % 24;

  let blockedPanels = 0;
  let validPanels = 0;
  profiles.forEach((profile) => {
    const mask = profile?.masksByMonth?.[month - 1]?.[standardHour];
    if (!Number.isFinite(Number(mask))) return;
    validPanels += 1;
    const bit = 1 << (day - 1);
    const sunny = ((Number(mask) >>> 0) & bit) !== 0;
    if (!sunny) blockedPanels += 1;
  });
  if (!validPanels) {
    return { active: false, provider: 'google', blockedPanels: 0, totalPanels: profiles.length, blockedFraction: 0, transmission: 1 };
  }
  const blockedFraction = blockedPanels / validPanels;
  const transmission = 1 - blockedFraction * (1 - LOCAL_BUILDING_DIFFUSE_RETAINED);
  return {
    active: true,
    provider: 'google',
    blockedPanels,
    totalPanels: validPanels,
    blockedFraction,
    transmission: clamp(transmission, LOCAL_BUILDING_DIFFUSE_RETAINED, 1),
  };
}

export function localObstructionShadeAtSun(state, sun, surfaceId = null) {
  const google = googleSolarShadeAtSun(state, sun, surfaceId);
  if (google.active) return google;
  return { ...localBuildingShadeAtSun(state, sun, surfaceId), provider: 'osm' };
}

function activeLocalShadeModel(state) {
  if (state?.googleSolarShadingEnabled !== false && Array.isArray(state?.googleSolarShadeModel?.profiles) && state.googleSolarShadeModel.profiles.length) {
    return { model: state.googleSolarShadeModel, provider: 'google' };
  }
  if (state?.localBuildingShadingEnabled !== false && Array.isArray(state?.localBuildingShadingModel?.profiles) && state.localBuildingShadingModel.profiles.length) {
    return { model: state.localBuildingShadingModel, provider: 'osm' };
  }
  return { model: null, provider: 'none' };
}

const PROFILE_WEIGHTS = {
  away: [
    0.030, 0.025, 0.022, 0.021, 0.024, 0.035, 0.070, 0.080,
    0.045, 0.030, 0.028, 0.027, 0.027, 0.028, 0.030, 0.034,
    0.045, 0.070, 0.095, 0.105, 0.090, 0.060, 0.045, 0.034,
  ],
  partial: [
    0.028, 0.024, 0.022, 0.021, 0.024, 0.035, 0.058, 0.064,
    0.046, 0.040, 0.038, 0.040, 0.043, 0.042, 0.040, 0.042,
    0.049, 0.064, 0.076, 0.083, 0.078, 0.060, 0.046, 0.037,
  ],
  always: [
    0.036, 0.034, 0.033, 0.033, 0.034, 0.037, 0.041, 0.043,
    0.044, 0.044, 0.044, 0.044, 0.044, 0.044, 0.044, 0.044,
    0.045, 0.047, 0.049, 0.050, 0.049, 0.046, 0.042, 0.038,
  ],
  optimized: [
    0.025, 0.022, 0.021, 0.020, 0.022, 0.028, 0.040, 0.044,
    0.041, 0.046, 0.055, 0.064, 0.069, 0.071, 0.068, 0.060,
    0.050, 0.046, 0.050, 0.058, 0.060, 0.050, 0.040, 0.030,
  ],
};

function normalizedProfile(profile) {
  const raw = PROFILE_WEIGHTS[profile] || PROFILE_WEIGHTS.partial;
  const sum = raw.reduce((acc, value) => acc + value, 0) || 1;
  return raw.map((value) => value / sum);
}

export function estimateDailyConsumption(state) {
  const bill = Math.max(0, Number(state.monthlyBillRon) || 0);
  const tariff = Math.max(0.05, Number(state.energyTariffRon) || 1.3);
  const monthlyKWh = bill / tariff;
  return {
    monthlyKWh,
    dailyKWh: monthlyKWh / 30.4375,
  };
}

export function orientationFactor(azimuth) {
  const distance = Math.abs(signedAngle(azimuth - 180));
  return clamp(1 - 0.42 * Math.pow(distance / 180, 1.45), 0.56, 1);
}

export function tiltFactor(pitch) {
  const delta = Math.abs((Number(pitch) || 30) - 32);
  return clamp(1 - 0.00055 * delta * delta, 0.72, 1);
}

function surfaceDescriptors(solarMetrics) {
  const surfaces = (solarMetrics?.selectedSurfaces || [])
    .filter((surface) => Number(surface.placed) > 0)
    .map((surface) => ({
      id: String(surface.id || 'surface'),
      azimuth: normalizeDeg(Number(surface.azimuth) || 0),
      weight: Math.max(0, Number(surface.placed) || 0),
    }));
  if (surfaces.length) return surfaces;
  return [{ id: 'array', azimuth: normalizeDeg(Number(solarMetrics?.arrayAzimuth) || 180), weight: 1 }];
}

function weightedOrientationFactor(solarMetrics) {
  const surfaces = surfaceDescriptors(solarMetrics);
  const weight = surfaces.reduce((sum, surface) => sum + surface.weight, 0) || 1;
  return surfaces.reduce((sum, surface) => sum + orientationFactor(surface.azimuth) * surface.weight, 0) / weight;
}

export function estimateAnnualProduction(state, solarMetrics) {
  const region = regionPresets[state.region] || regionPresets.muntenia;
  const systemKwp = Math.max(0, solarMetrics.systemKwp || 0);
  const orientation = weightedOrientationFactor(solarMetrics);
  const localSpecificYield = region.specificYield * orientation * tiltFactor(state.pitch);
  const localAnnual = systemKwp * localSpecificYield;
  const pvgisAnnual = Number(state.pvgisAnnualKWh);
  const usePvgis = Number.isFinite(pvgisAnnual) && pvgisAnnual > 0;
  const baseAnnualKWh = usePvgis ? pvgisAnnual : localAnnual;
  const localBuildingFactor = annualLocalBuildingShadingFactor(state, solarMetrics);
  const annualKWh = baseAnnualKWh * localBuildingFactor;
  const location = getActiveLocation(state);
  const activeShade = activeLocalShadeModel(state);
  const buildingText = activeShade.provider === 'google'
    ? ' + Google hourly shade'
    : activeShade.provider === 'osm'
      ? ' + nearby buildings'
      : '';
  return {
    annualKWh,
    baseAnnualKWh,
    dailyAverageKWh: annualKWh / 365,
    specificYield: systemKwp > 0 ? annualKWh / systemKwp : 0,
    source: (usePvgis
      ? `${state.pvgisDatabase || 'PVGIS-SARAH3'} · exact site${state.pvgisUseHorizon ? ' + terrain horizon' : ''}`
      : (location.mode === 'exact' ? 'Regional yield · exact sun geometry' : 'PVGIS-calibrated regional model')) + buildingText,
    orientationFactor: orientation,
    tiltFactor: tiltFactor(state.pitch),
    localBuildingFactor,
    localBuildingLossPct: (1 - localBuildingFactor) * 100,
    localBuildingContributorCount: Number(state.localBuildingShadingModel?.contributorIds?.length) || 0,
    localBuildingPanelCount: Number(activeShade.model?.panelCount) || 0,
    localShadingSource: activeShade.provider,
    region,
    location,
    azimuth: Number.isFinite(solarMetrics.arrayAzimuth) ? solarMetrics.arrayAzimuth : 180,
  };
}

function incidenceFactor(panelAzimuth, pitch, sun) {
  if (!sun || sun.elevationDeg <= -0.833) return 0;
  const elevation = sun.elevationDeg * Math.PI / 180;
  const tilt = clamp(Number(pitch) || 30, 0, 90) * Math.PI / 180;
  const azimuthDelta = signedAngle(sun.azimuthDeg - panelAzimuth) * Math.PI / 180;
  const cosine = Math.sin(elevation) * Math.cos(tilt)
    + Math.cos(elevation) * Math.sin(tilt) * Math.cos(azimuthDelta);
  return Math.max(0, cosine);
}

function aggregateSolarPotential(sun, pitch, surfaces, horizonProfile = null, state = null, includeLocalBuildings = false) {
  if (!sun || sun.elevationDeg <= -0.833) return 0;
  if (horizonProfile?.length && sun.elevationDeg <= horizonElevationAtAzimuth(horizonProfile, sun.azimuthDeg)) return 0;
  const totalWeight = surfaces.reduce((sum, surface) => sum + surface.weight, 0) || 1;
  const incidence = surfaces.reduce((sum, surface) => {
    const buildingTransmission = includeLocalBuildings && state
      ? localObstructionShadeAtSun(state, sun, surface.id).transmission
      : 1;
    return sum + Math.pow(incidenceFactor(surface.azimuth, pitch, sun), 1.08) * surface.weight * buildingTransmission;
  }, 0) / totalWeight;
  const clearSkyEnvelope = Math.pow(Math.max(0, Math.sin(sun.elevationDeg * Math.PI / 180)), 0.72);
  return incidence * clearSkyEnvelope;
}

function productionWeights(state, solarMetrics) {
  const surfaces = surfaceDescriptors(solarMetrics);
  const values = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const sun = getSolarContext(state, hour + 0.5);
    values.push(aggregateSolarPotential(sun, state.pitch, surfaces, state.pvgisUseHorizon ? state.pvgisHorizonProfile : null, state, true));
  }
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
}

function dayPotential(state, solarMetrics, dateString, includeLocalBuildings = false) {
  const surfaces = surfaceDescriptors(solarMetrics);
  let total = 0;
  for (let halfHour = 0; halfHour < 48; halfHour += 1) {
    const hour = halfHour / 2 + 0.25;
    const sun = getSolarContext({ ...state, simulationDate: dateString }, hour);
    total += aggregateSolarPotential(
      sun,
      state.pitch,
      surfaces,
      state.pvgisUseHorizon ? state.pvgisHorizonProfile : null,
      state,
      includeLocalBuildings,
    ) * 0.5;
  }
  return total;
}

function annualLocalBuildingShadingFactor(state, solarMetrics) {
  const activeShade = activeLocalShadeModel(state);
  const model = activeShade.model;
  if (!model || !Array.isArray(model?.profiles) || !model.profiles.length) return 1;
  const location = getActiveLocation(state);
  const year = String(state.simulationDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const surfaceKey = surfaceDescriptors(solarMetrics).map((surface) => `${surface.id}:${surface.azimuth.toFixed(1)}:${surface.weight}`).join(',');
  const horizonKey = state.pvgisUseHorizon && Array.isArray(state.pvgisHorizonProfile)
    ? `${state.pvgisHorizonProfile.length}:${state.pvgisHorizonProfile.map((point) => Number(point.elevationDeg) || 0).reduce((sum, value) => sum + value, 0).toFixed(1)}`
    : 'off';
  const cacheKey = `${activeShade.provider}|${model.revision}|${location.lat.toFixed(4)}|${location.lon.toFixed(4)}|${state.pitch}|${surfaceKey}|${horizonKey}|${year}`;
  if (localBuildingFactorCache.has(cacheKey)) return localBuildingFactorCache.get(cacheKey);

  let clearTotal = 0;
  let shadedTotal = 0;
  for (let month = 1; month <= 12; month += 1) {
    const days = new Date(Number(year), month, 0).getDate();
    const date = monthMidDate(year, month);
    clearTotal += dayPotential(state, solarMetrics, date, false) * days;
    shadedTotal += dayPotential(state, solarMetrics, date, true) * days;
  }
  const factor = clearTotal > 0 ? clamp(shadedTotal / clearTotal, 0.12, 1) : 1;
  localBuildingFactorCache.set(cacheKey, factor);
  if (localBuildingFactorCache.size > 80) localBuildingFactorCache.delete(localBuildingFactorCache.keys().next().value);
  return factor;
}

function selectedDayBuildingFactor(state, solarMetrics) {
  const { model } = activeLocalShadeModel(state);
  if (!model || !Array.isArray(model?.profiles) || !model.profiles.length) return 1;
  const clear = dayPotential(state, solarMetrics, state.simulationDate, false);
  if (!(clear > 0)) return 1;
  const shaded = dayPotential(state, solarMetrics, state.simulationDate, true);
  return clamp(shaded / clear, 0.12, 1);
}

function monthMidDate(year, month) {
  return `${year}-${String(month).padStart(2, '0')}-15`;
}

function annualMeanPotential(state, solarMetrics) {
  const location = getActiveLocation(state);
  const surfaces = surfaceDescriptors(solarMetrics);
  const surfaceKey = surfaces.map((surface) => `${surface.azimuth.toFixed(1)}:${surface.weight}`).join(',');
  const year = String(state.simulationDate || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const horizonKey = state.pvgisUseHorizon && Array.isArray(state.pvgisHorizonProfile)
    ? `${state.pvgisHorizonProfile.length}:${state.pvgisHorizonProfile.map((point) => Number(point.elevationDeg) || 0).reduce((sum, value) => sum + value, 0).toFixed(1)}`
    : 'off';
  const cacheKey = `${location.lat.toFixed(3)}|${location.lon.toFixed(3)}|${state.pitch}|${surfaceKey}|${horizonKey}|${year}`;
  if (seasonalPotentialCache.has(cacheKey)) return seasonalPotentialCache.get(cacheKey);

  let weightedTotal = 0;
  let daysTotal = 0;
  for (let month = 1; month <= 12; month += 1) {
    const days = new Date(Number(year), month, 0).getDate();
    weightedTotal += dayPotential(state, solarMetrics, monthMidDate(year, month)) * days;
    daysTotal += days;
  }
  const mean = weightedTotal / Math.max(1, daysTotal);
  seasonalPotentialCache.set(cacheKey, mean);
  if (seasonalPotentialCache.size > 60) seasonalPotentialCache.delete(seasonalPotentialCache.keys().next().value);
  return mean;
}

export function seasonalDayFactor(state, solarMetrics) {
  const monthly = Array.isArray(state.pvgisMonthlyKWh) ? state.pvgisMonthlyKWh.map(Number) : null;
  const annual = Number(state.pvgisAnnualKWh);
  const dateMatch = String(state.simulationDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let baseFactor = 1;

  if (monthly?.length === 12 && monthly.every(Number.isFinite) && annual > 0 && dateMatch) {
    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const days = new Date(year, month, 0).getDate();
    const monthlyDaily = Math.max(0, monthly[month - 1]) / Math.max(1, days);
    const annualDaily = annual / 365.2425;
    const midDate = monthMidDate(year, month);
    const selectedGeometry = dayPotential(state, solarMetrics, state.simulationDate, false);
    const midGeometry = dayPotential(state, solarMetrics, midDate, false);
    const intraMonth = midGeometry > 0 ? clamp(selectedGeometry / midGeometry, 0.82, 1.18) : 1;
    baseFactor = clamp((monthlyDaily / Math.max(0.001, annualDaily)) * intraMonth, 0.08, 2.6);
  } else {
    const selected = dayPotential(state, solarMetrics, state.simulationDate, false);
    const mean = annualMeanPotential(state, solarMetrics);
    baseFactor = mean > 0 ? clamp(selected / mean, 0.12, 2.2) : 1;
  }

  const annualBuildingFactor = annualLocalBuildingShadingFactor(state, solarMetrics);
  const selectedBuildingFactor = selectedDayBuildingFactor(state, solarMetrics);
  const relativeBuildingFactor = annualBuildingFactor > 0
    ? clamp(selectedBuildingFactor / annualBuildingFactor, 0.25, 2.5)
    : 1;
  return clamp(baseFactor * relativeBuildingFactor, 0.04, 3.2);
}

export function autoBatteryCapacity(dailyConsumptionKWh, systemKwp) {
  const target = Math.max(dailyConsumptionKWh * 0.48, systemKwp * 0.7);
  if (target <= 5) return 5;
  if (target <= 10) return 10;
  if (target <= 15) return 15;
  return 20;
}

export function simulateDay(state, solarMetrics, productionEstimate) {
  const consumption = estimateDailyConsumption(state);
  const loadWeights = normalizedProfile(state.consumptionProfile);
  const generationWeights = productionWeights(state, solarMetrics);
  const selectedDayFactor = seasonalDayFactor(state, solarMetrics);
  const dailyGeneration = Math.max(0, productionEstimate.dailyAverageKWh * selectedDayFactor);
  const dailyLoad = Math.max(0, consumption.dailyKWh);
  const generation = generationWeights.map((weight) => dailyGeneration * weight);
  const load = loadWeights.map((weight) => dailyLoad * weight);

  const batteryEnabled = Boolean(state.batteryEnabled);
  const batteryCapacity = batteryEnabled
    ? (state.batteryAutoSize
      ? autoBatteryCapacity(dailyLoad, solarMetrics.systemKwp)
      : Math.max(1, Number(state.batteryCapacityKWh) || 5))
    : 0;
  const reserve = batteryCapacity * clamp((Number(state.batteryReservePct) || 10) / 100, 0, 0.5);
  const roundTripEfficiency = clamp(Number(state.batteryRoundTripEfficiency) || 0.92, 0.7, 1);
  const chargeEfficiency = Math.sqrt(roundTripEfficiency);
  const dischargeEfficiency = Math.sqrt(roundTripEfficiency);
  let soc = batteryEnabled ? reserve : 0;

  const runDay = (capture = false) => {
    let directUse = 0;
    let batteryToLoad = 0;
    let gridImport = 0;
    let gridExport = 0;
    let batteryCharged = 0;
    let batteryDischarged = 0;
    const hours = [];
    const startSoc = soc;

    for (let hour = 0; hour < 24; hour += 1) {
      const produced = generation[hour];
      const consumed = load[hour];
      let surplus = Math.max(0, produced - consumed);
      let deficit = Math.max(0, consumed - produced);
      const direct = Math.min(produced, consumed);
      directUse += direct;
      let charged = 0;
      let discharged = 0;

      if (batteryEnabled && surplus > 0) {
        const room = Math.max(0, batteryCapacity - soc);
        const inputPossible = room / chargeEfficiency;
        charged = Math.min(surplus, inputPossible);
        soc += charged * chargeEfficiency;
        surplus -= charged;
        batteryCharged += charged;
      }

      if (batteryEnabled && deficit > 0) {
        const available = Math.max(0, soc - reserve);
        const deliverable = available * dischargeEfficiency;
        discharged = Math.min(deficit, deliverable);
        soc -= discharged / dischargeEfficiency;
        deficit -= discharged;
        batteryDischarged += discharged;
        batteryToLoad += discharged;
      }

      gridExport += surplus;
      gridImport += deficit;
      if (capture) {
        hours.push({
          hour,
          production: produced,
          consumption: consumed,
          direct,
          batteryCharge: charged,
          batteryDischarge: discharged,
          gridImport: deficit,
          gridExport: surplus,
          socKWh: soc,
          socPct: batteryCapacity > 0 ? (soc / batteryCapacity) * 100 : 0,
        });
      }
    }

    return {
      hours,
      directUse,
      batteryToLoad,
      gridImport,
      gridExport,
      batteryCharged,
      batteryDischarged,
      startSoc,
      endSoc: soc,
    };
  };

  if (batteryEnabled) {
    for (let day = 0; day < 6; day += 1) runDay(false);
  }
  const result = runDay(true);
  const servedBySolar = result.directUse + result.batteryToLoad;
  const selfSufficiency = dailyLoad > 0 ? (servedBySolar / dailyLoad) * 100 : 0;
  const selfConsumption = dailyGeneration > 0 ? ((dailyGeneration - result.gridExport) / dailyGeneration) * 100 : 0;
  const sunTimes = getSunTimes(state);

  return {
    hours: result.hours,
    dailyGeneration,
    dailyLoad,
    directUse: result.directUse,
    batteryToLoad: result.batteryToLoad,
    gridImport: result.gridImport,
    gridExport: result.gridExport,
    selfSufficiency: clamp(selfSufficiency, 0, 100),
    selfConsumption: clamp(selfConsumption, 0, 100),
    batteryCapacity,
    batteryStartPct: batteryCapacity > 0 ? (result.startSoc / batteryCapacity) * 100 : 0,
    batteryEndPct: batteryCapacity > 0 ? (result.endSoc / batteryCapacity) * 100 : 0,
    batteryCharged: result.batteryCharged,
    batteryDischarged: result.batteryDischarged,
    seasonalFactor: selectedDayFactor,
    sunriseHour: sunTimes.sunriseHour,
    sunsetHour: sunTimes.sunsetHour,
    sunriseLabel: sunTimes.sunriseLabel,
    sunsetLabel: sunTimes.sunsetLabel,
  };
}

export function instantaneousPowerAtHour(simulation, hour) {
  if (!simulation?.hours?.length) return { production: 0, consumption: 0, socPct: 0 };
  const index = Math.max(0, Math.min(23, Math.floor(Number(hour) || 0)));
  return simulation.hours[index];
}

function pvgisEndpointUrl(endpoint, tool, params) {
  const url = new URL(endpoint, globalThis.location?.href || 'http://localhost/');
  url.searchParams.set('tool', tool);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

async function fetchPvgisJson(endpoint, tool, params, signal) {
  if (!endpoint) throw new Error('No PVGIS server proxy configured');
  const response = await fetch(pvgisEndpointUrl(endpoint, tool, params), {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const errorBody = await response.json();
      detail = errorBody?.message || errorBody?.error || '';
    } catch {
      detail = '';
    }
    throw new Error(`PVGIS proxy HTTP ${response.status}${detail ? ` · ${detail}` : ''}`);
  }
  return response.json();
}

function extractDatabaseName(data) {
  const candidates = [
    data?.inputs?.meteo_data?.radiation_db,
    data?.inputs?.meteo_data?.radiation_database,
    data?.meta?.inputs?.raddatabase,
    data?.meta?.radiation_database,
  ];
  const value = candidates.find((candidate) => candidate !== undefined && candidate !== null && candidate !== '');
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') return String(value.value || value.name || value.description || '');
  return '';
}

function extractMonthlyProduction(data) {
  const rows = data?.outputs?.monthly?.fixed;
  const values = Array(12).fill(0);
  if (!Array.isArray(rows)) return values;
  rows.forEach((row, index) => {
    const month = Math.max(1, Math.min(12, Number(row?.month) || index + 1));
    const energy = Number(row?.E_m);
    if (Number.isFinite(energy)) values[month - 1] = energy;
  });
  return values;
}

function parseHorizonProfile(data) {
  const rows = data?.outputs?.horizon_profile;
  if (!Array.isArray(rows)) return [];
  const result = rows.map((row) => {
    const rawAzimuth = Number(row?.A ?? row?.azimuth ?? row?.horizon_azimuth);
    const elevation = Number(row?.H_hor ?? row?.elevation ?? row?.horizon_elevation);
    if (!Number.isFinite(rawAzimuth) || !Number.isFinite(elevation)) return null;
    // PVGIS printhorizon uses 0°=South, -90°=East and +90°=West.
    // Convert to the configurator's compass convention: 0°=North, clockwise positive.
    const azimuthDeg = row?.A !== undefined ? normalizeDeg(rawAzimuth + 180) : normalizeDeg(rawAzimuth);
    return { azimuthDeg, elevationDeg: elevation };
  }).filter(Boolean);
  const deduped = new Map();
  result.forEach((point) => deduped.set(point.azimuthDeg.toFixed(3), point));
  return [...deduped.values()].sort((a, b) => a.azimuthDeg - b.azimuthDeg);
}

function pvgisSurfaceDescriptors(solarMetrics) {
  const modulePowerKw = Math.max(0, Number(solarMetrics?.modulePowerW) || 0) / 1000;
  const surfaces = (solarMetrics?.selectedSurfaces || [])
    .filter((surface) => Number(surface?.placed) > 0)
    .map((surface) => ({
      id: String(surface.id || 'surface'),
      label: String(surface.label || 'Roof plane'),
      azimuth: normalizeDeg(Number(surface.azimuth) || 0),
      placed: Math.max(0, Number(surface.placed) || 0),
      peakpower: Math.max(0.001, (Number(surface.placed) || 0) * modulePowerKw),
    }));
  if (surfaces.length) return surfaces;
  return [{
    id: 'array',
    label: 'Solar array',
    azimuth: normalizeDeg(Number(solarMetrics?.arrayAzimuth) || 180),
    placed: Number(solarMetrics?.placedPanels) || 0,
    peakpower: Math.max(0.001, Number(solarMetrics?.systemKwp) || 0.001),
  }];
}

export async function fetchPvgisSiteEstimate(state, solarMetrics, signal, endpoint) {
  if (!endpoint) throw new Error('No PVGIS server proxy configured');
  const location = getActiveLocation(state);
  if (location.mode !== 'exact') throw new Error('Exact location required for live PVGIS data');
  const surfaces = pvgisSurfaceDescriptors(solarMetrics);
  const common = {
    lat: Number(location.lat).toFixed(6),
    lon: Number(location.lon).toFixed(6),
    pvtechchoice: 'crystSi2025',
    mountingplace: 'free',
    loss: '14',
    angle: String(Math.round(clamp(Number(state.pitch) || 30, 0, 90))),
    usehorizon: state.pvgisUseHorizon ? '1' : '0',
    raddatabase: 'PVGIS-SARAH3',
    outputformat: 'json',
  };

  const surfacePromises = surfaces.map(async (surface) => {
    const aspect = clamp(signedAngle(surface.azimuth - 180), -180, 180);
    const data = await fetchPvgisJson(endpoint, 'PVcalc', {
      ...common,
      peakpower: surface.peakpower.toFixed(4),
      aspect: aspect.toFixed(2),
    }, signal);
    const annualKWh = Number(data?.annualKWh ?? data?.outputs?.totals?.fixed?.E_y);
    if (!Number.isFinite(annualKWh) || annualKWh <= 0) {
      throw new Error(`PVGIS returned no annual yield for ${surface.label}`);
    }
    return {
      ...surface,
      aspect,
      annualKWh,
      monthlyKWh: extractMonthlyProduction(data),
      database: extractDatabaseName(data),
    };
  });

  const horizonPromise = fetchPvgisJson(endpoint, 'printhorizon', {
    lat: common.lat,
    lon: common.lon,
    outputformat: 'json',
  }, signal).then(parseHorizonProfile).catch((error) => {
    if (error?.name === 'AbortError') throw error;
    console.info('[Solar configurator] PVGIS horizon profile unavailable.', error);
    return [];
  });

  const [surfaceResults, horizonProfile] = await Promise.all([
    Promise.all(surfacePromises),
    horizonPromise,
  ]);
  const monthlyKWh = Array(12).fill(0);
  surfaceResults.forEach((surface) => surface.monthlyKWh.forEach((value, index) => {
    monthlyKWh[index] += Number(value) || 0;
  }));
  const annualKWh = surfaceResults.reduce((sum, surface) => sum + surface.annualKWh, 0);
  const database = surfaceResults.map((surface) => surface.database).find(Boolean) || 'PVGIS-SARAH3';
  return {
    annualKWh,
    monthlyKWh,
    horizonProfile,
    surfaceResults,
    database,
    useHorizon: Boolean(state.pvgisUseHorizon),
    location,
  };
}

// Backwards-compatible helper retained for any existing integration code.
export async function fetchPvgisAnnual(state, solarMetrics, signal, endpoint) {
  const result = await fetchPvgisSiteEstimate(state, solarMetrics, signal, endpoint);
  return { annualKWh: result.annualKWh, raw: result };
}
