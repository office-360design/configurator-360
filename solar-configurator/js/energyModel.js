import { regionPresets } from './state.js?v=1';

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const normalizeDeg = (value) => ((value % 360) + 360) % 360;
const signedAngle = (value) => ((normalizeDeg(value) + 180) % 360) - 180;

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

export function estimateAnnualProduction(state, solarMetrics) {
  const region = regionPresets[state.region] || regionPresets.muntenia;
  const systemKwp = Math.max(0, solarMetrics.systemKwp || 0);
  const azimuth = Number.isFinite(solarMetrics.arrayAzimuth) ? solarMetrics.arrayAzimuth : 180;
  const localSpecificYield = region.specificYield * orientationFactor(azimuth) * tiltFactor(state.pitch);
  const localAnnual = systemKwp * localSpecificYield;
  const pvgisAnnual = Number(state.pvgisAnnualKWh);
  const usePvgis = Number.isFinite(pvgisAnnual) && pvgisAnnual > 0;
  const annualKWh = usePvgis ? pvgisAnnual : localAnnual;
  return {
    annualKWh,
    dailyAverageKWh: annualKWh / 365,
    specificYield: systemKwp > 0 ? annualKWh / systemKwp : 0,
    source: usePvgis ? 'PVGIS 5.3 · server proxy' : 'PVGIS-calibrated regional model',
    orientationFactor: orientationFactor(azimuth),
    tiltFactor: tiltFactor(state.pitch),
    region,
    azimuth,
  };
}

function sunPositionForHour(hour) {
  const midpoint = Number(hour) + 0.5;
  if (midpoint <= 6 || midpoint >= 18) return null;
  const progress = (midpoint - 6) / 12;
  const elevationDeg = 8 + Math.sin(progress * Math.PI) * 57;
  const azimuthDeg = 90 + progress * 180;
  return { elevationDeg, azimuthDeg };
}

function incidenceFactor(panelAzimuth, pitch, sun) {
  if (!sun) return 0;
  const elevation = sun.elevationDeg * Math.PI / 180;
  const tilt = clamp(Number(pitch) || 30, 0, 90) * Math.PI / 180;
  const azimuthDelta = signedAngle(sun.azimuthDeg - panelAzimuth) * Math.PI / 180;
  const cosine = Math.sin(elevation) * Math.cos(tilt)
    + Math.cos(elevation) * Math.sin(tilt) * Math.cos(azimuthDelta);
  return Math.max(0, cosine);
}

function productionWeights(azimuth, pitch) {
  const values = [];
  for (let hour = 0; hour < 24; hour += 1) {
    const sun = sunPositionForHour(hour);
    if (!sun) {
      values.push(0);
      continue;
    }
    const incidence = incidenceFactor(azimuth, pitch, sun);
    const clearSkyEnvelope = Math.pow(Math.max(0, Math.sin(sun.elevationDeg * Math.PI / 180)), 0.72);
    values.push(Math.pow(incidence, 1.08) * clearSkyEnvelope);
  }
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  return values.map((value) => value / total);
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
  const generationWeights = productionWeights(productionEstimate.azimuth, state.pitch);
  const dailyGeneration = Math.max(0, productionEstimate.dailyAverageKWh);
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
    // Warm up repeated average days so the reported day does not receive
    // artificial energy from an arbitrary initial state of charge.
    for (let day = 0; day < 6; day += 1) runDay(false);
  }
  const result = runDay(true);
  const servedBySolar = result.directUse + result.batteryToLoad;
  const selfSufficiency = dailyLoad > 0 ? (servedBySolar / dailyLoad) * 100 : 0;
  const selfConsumption = dailyGeneration > 0 ? ((dailyGeneration - result.gridExport) / dailyGeneration) * 100 : 0;

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
  };
}

export function instantaneousPowerAtHour(simulation, hour) {
  if (!simulation?.hours?.length) return { production: 0, consumption: 0, socPct: 0 };
  const index = Math.max(0, Math.min(23, Math.floor(Number(hour) || 0)));
  return simulation.hours[index];
}

export async function fetchPvgisAnnual(state, solarMetrics, signal, endpoint) {
  if (!endpoint) throw new Error('No PVGIS server proxy configured');
  const region = regionPresets[state.region] || regionPresets.muntenia;
  const peakpower = Math.max(0.1, solarMetrics.systemKwp || 0.1);
  const compassAzimuth = Number.isFinite(solarMetrics.arrayAzimuth) ? solarMetrics.arrayAzimuth : 180;
  const aspect = clamp(signedAngle(compassAzimuth - 180), -180, 180);
  const params = new URLSearchParams({
    lat: String(region.lat),
    lon: String(region.lon),
    peakpower: peakpower.toFixed(3),
    pvtechchoice: 'crystSi2025',
    mountingplace: 'building',
    loss: '14',
    angle: String(Math.round(Number(state.pitch) || 30)),
    aspect: aspect.toFixed(1),
    outputformat: 'json',
  });
  const separator = endpoint.includes('?') ? '&' : '?';
  const response = await fetch(`${endpoint}${separator}${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`PVGIS proxy HTTP ${response.status}`);
  const data = await response.json();
  const annual = Number(data?.annualKWh ?? data?.outputs?.totals?.fixed?.E_y);
  if (!Number.isFinite(annual) || annual <= 0) throw new Error('PVGIS proxy returned no annual yield');
  return { annualKWh: annual, raw: data };
}
