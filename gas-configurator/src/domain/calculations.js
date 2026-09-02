import { buildRouteSegments, routeLengthMeters } from './geometry.js';

export const PIPE_MATERIALS = Object.freeze({
  pe100rc: Object.freeze({ labelKey: 'option.material.pe100rc', costMultiplier: 1.12 }),
  pe100: Object.freeze({ labelKey: 'option.material.pe100', costMultiplier: 1 }),
});

export const PIPE_DIAMETERS_MM = Object.freeze([32, 40, 63, 90, 110]);

export const GROUND_TYPES = Object.freeze({
  common: Object.freeze({ labelKey: 'option.ground.common', excavationEurM3: 28, color: '#a9784b' }),
  cohesive: Object.freeze({ labelKey: 'option.ground.cohesive', excavationEurM3: 36, color: '#8b5f45' }),
  granular: Object.freeze({ labelKey: 'option.ground.granular', excavationEurM3: 31, color: '#c5a56c' }),
  softRock: Object.freeze({ labelKey: 'option.ground.softRock', excavationEurM3: 72, color: '#8c8275' }),
  hardRock: Object.freeze({ labelKey: 'option.ground.hardRock', excavationEurM3: 135, color: '#696d70' }),
});

export const SURFACE_TYPES = Object.freeze({
  greenfield: Object.freeze({ labelKey: 'option.surface.greenfield', restorationEurM2: 9, color: '#73995a' }),
  pavers: Object.freeze({ labelKey: 'option.surface.pavers', restorationEurM2: 38, color: '#a7a69d' }),
  asphalt: Object.freeze({ labelKey: 'option.surface.asphalt', restorationEurM2: 68, color: '#555b60' }),
  concrete: Object.freeze({ labelKey: 'option.surface.concrete', restorationEurM2: 92, color: '#a9afb3' }),
});

const PIPE_EUR_M = Object.freeze({ 32: 4.2, 40: 5.4, 63: 10.8, 90: 18.5, 110: 25.5 });
const CURRENCY_FROM_EUR = Object.freeze({ EUR: 1, RON: 4.98, USD: 1.09 });
const BEDDING_EUR_M3 = 34;
const PRELIMINARY_FIXED_COST_EUR = 1_800;
const PIPE_ALLOWANCE_RATIO = 1.03;

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function segmentSetting(state, segment) {
  return state.segmentSettings?.[segment.id] || { groundType: 'common', surfaceType: 'greenfield' };
}

export function calculateProject(state) {
  const segments = buildRouteSegments(state.route.points);
  const routeLengthM = routeLengthMeters(state.route.points);
  const diameterMm = numberOr(state.pipe.diameterMm, 63);
  const outsideDiameterM = diameterMm / 1_000;
  const coverM = Math.max(0, numberOr(state.trench.coverM, 1));
  const trenchWidthM = Math.max(outsideDiameterM + 0.2, numberOr(state.trench.widthM, 0.55));
  const beddingM = Math.max(0, numberOr(state.trench.beddingM, 0.1));
  const trenchDepthM = coverM + outsideDiameterM + beddingM;
  const material = PIPE_MATERIALS[state.pipe.material] || PIPE_MATERIALS.pe100rc;

  const perSegment = segments.map((segment) => {
    const setting = segmentSetting(state, segment);
    const ground = GROUND_TYPES[setting.groundType] || GROUND_TYPES.common;
    const surface = SURFACE_TYPES[setting.surfaceType] || SURFACE_TYPES.greenfield;
    const excavationM3 = segment.lengthM * trenchWidthM * trenchDepthM;
    const beddingEnvelopeHeightM = beddingM + outsideDiameterM + 0.1;
    const beddingM3 = segment.lengthM * trenchWidthM * beddingEnvelopeHeightM;
    const pipeDisplacementM3 = segment.lengthM * Math.PI * (outsideDiameterM / 2) ** 2;
    const backfillM3 = Math.max(0, excavationM3 - beddingM3 - pipeDisplacementM3);
    const restorationM2 = segment.lengthM * trenchWidthM;
    const excavationCostEur = excavationM3 * ground.excavationEurM3;
    const beddingCostEur = beddingM3 * BEDDING_EUR_M3;
    const restorationCostEur = restorationM2 * surface.restorationEurM2;

    return {
      ...segment,
      setting,
      ground,
      surface,
      excavationM3,
      beddingM3,
      backfillM3,
      restorationM2,
      excavationCostEur,
      beddingCostEur,
      restorationCostEur,
    };
  });

  const pipeLengthM = routeLengthM * PIPE_ALLOWANCE_RATIO;
  const pipeCostEur = pipeLengthM * (PIPE_EUR_M[diameterMm] || PIPE_EUR_M[63]) * material.costMultiplier;
  const excavationM3 = perSegment.reduce((sum, segment) => sum + segment.excavationM3, 0);
  const beddingM3 = perSegment.reduce((sum, segment) => sum + segment.beddingM3, 0);
  const backfillM3 = perSegment.reduce((sum, segment) => sum + segment.backfillM3, 0);
  const restorationM2 = perSegment.reduce((sum, segment) => sum + segment.restorationM2, 0);
  const routeWorkCostEur = perSegment.reduce((sum, segment) => (
    sum + segment.excavationCostEur + segment.beddingCostEur + segment.restorationCostEur
  ), 0);
  const estimateMidEur = pipeCostEur + routeWorkCostEur + PRELIMINARY_FIXED_COST_EUR;

  return {
    segments: perSegment,
    routeLengthM,
    pipeLengthM,
    diameterMm,
    outsideDiameterM,
    coverM,
    trenchWidthM,
    trenchDepthM,
    excavationM3,
    beddingM3,
    backfillM3,
    restorationM2,
    estimateLowEur: estimateMidEur * 0.8,
    estimateMidEur,
    estimateHighEur: estimateMidEur * 1.2,
    costBreakdown: {
      pipeEur: pipeCostEur,
      routeWorkEur: routeWorkCostEur,
      fixedEur: PRELIMINARY_FIXED_COST_EUR,
    },
  };
}

export function buildValidationResults(state, calculation) {
  const results = [];

  results.push({
    id: 'route',
    status: calculation.routeLengthM > 0 ? 'pass' : 'blocked',
    titleKey: 'validation.route.title',
    detailKey: calculation.routeLengthM > 0 ? 'validation.route.pass' : 'validation.route.blocked',
  });

  results.push({
    id: 'rule-pack',
    status: 'warning',
    titleKey: 'validation.rules.title',
    detailKey: 'validation.rules.pending',
    sourceLabel: 'ANRE Order 89/2018, amended by Order 2/2023',
    sourceHref: 'https://arhiva.anre.ro/ro/gaze-naturale/legislatie/reglementari-tehnice/norme-tehnice1387184362',
  });

  const groundStatus = state.data.groundSource === 'verifiedSurvey' ? 'pass' : 'warning';
  results.push({
    id: 'ground',
    status: groundStatus,
    titleKey: 'validation.ground.title',
    detailKey: groundStatus === 'pass' ? 'validation.ground.verified' : 'validation.ground.estimated',
  });

  const utilityStatus = state.data.utilitySource === 'fieldVerified'
    ? 'pass'
    : state.data.utilitySource === 'ownerPlan' ? 'warning' : 'missing';
  results.push({
    id: 'utilities',
    status: utilityStatus,
    titleKey: 'validation.utilities.title',
    detailKey: `validation.utilities.${utilityStatus}`,
  });

  results.push({
    id: 'capacity',
    status: state.project.osdCapacityKnown ? 'warning' : 'missing',
    titleKey: 'validation.capacity.title',
    detailKey: state.project.osdCapacityKnown ? 'validation.capacity.supplied' : 'validation.capacity.missing',
    sourceLabel: 'ANRE Order 7/2022, Article 23',
    sourceHref: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/252209',
  });

  results.push({
    id: 'authorization',
    status: 'missing',
    titleKey: 'validation.authorization.title',
    detailKey: 'validation.authorization.required',
    sourceLabel: 'ANRE Order 7/2022, Art. 3(1)(g)-(h)',
    sourceHref: 'https://legislatie.just.ro/Public/DetaliiDocumentAfis/252209',
  });

  return results;
}

export function validationSummary(results = []) {
  return results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] || 0) + 1;
    return summary;
  }, { pass: 0, warning: 0, missing: 0, blocked: 0 });
}

export function convertFromEur(amountEur, currency = 'EUR') {
  return numberOr(amountEur, 0) * (CURRENCY_FROM_EUR[currency] || 1);
}

export function formatMoneyFromEur(amountEur, currency = 'EUR', locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY_FROM_EUR[currency] ? currency : 'EUR',
    maximumFractionDigits: 0,
  }).format(convertFromEur(amountEur, currency));
}

export function formatDistance(meters, units = 'metric', locale = 'en-US') {
  const value = numberOr(meters, 0);
  if (units === 'imperial') {
    const feet = value * 3.28084;
    if (feet >= 5_280) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(feet / 5_280)} mi`;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(feet)} ft`;
  }
  if (value >= 1_000) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value / 1_000)} km`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} m`;
}

export function formatVolume(cubicMeters, units = 'metric', locale = 'en-US') {
  const value = units === 'imperial' ? numberOr(cubicMeters, 0) * 35.3147 : numberOr(cubicMeters, 0);
  const suffix = units === 'imperial' ? 'ft³' : 'm³';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${suffix}`;
}

export function formatArea(squareMeters, units = 'metric', locale = 'en-US') {
  const value = units === 'imperial' ? numberOr(squareMeters, 0) * 10.7639 : numberOr(squareMeters, 0);
  const suffix = units === 'imperial' ? 'ft²' : 'm²';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${suffix}`;
}
