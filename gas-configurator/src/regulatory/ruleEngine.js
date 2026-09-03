import { REGULATORY_RULES } from './ruleRegistry.js';

function finiteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function metric(value) {
  return `${finiteNumber(value).toFixed(2)} m`;
}

function degrees(value) {
  return `${finiteNumber(value).toFixed(0)}°`;
}

function createResult(rule, status, detailKey, detailVariables = {}) {
  return {
    id: rule.id,
    ruleId: rule.id,
    packVersion: rule.packVersion,
    status,
    titleKey: rule.titleKey,
    detailKey,
    detailVariables,
    sourceLabel: rule.sourceLabel,
    sourceHref: rule.sourceHref,
  };
}

export function evaluateMinimumCover(state) {
  const rule = REGULATORY_RULES.minimumCover;
  const actualM = finiteNumber(state?.trench?.coverM);
  const variables = {
    actual: metric(actualM),
    minimum: metric(rule.minimumM),
  };

  if (actualM >= rule.minimumM) {
    return createResult(rule, 'pass', 'validation.cover.pass', variables);
  }

  const osdAgreement = Boolean(state?.regulatory?.reducedCover?.osdAgreement);
  const additionalProtection = Boolean(state?.regulatory?.reducedCover?.additionalProtection);
  if (osdAgreement && additionalProtection) {
    return createResult(rule, 'warning', 'validation.cover.exception', variables);
  }

  return createResult(rule, 'blocked', 'validation.cover.blocked', variables);
}

export function evaluateCrossingAngle(state) {
  const rule = REGULATORY_RULES.crossingAngle;
  if (!state?.crossing?.enabled) {
    return createResult(rule, 'not-evaluated', 'validation.crossing.notConfigured');
  }

  const actualDeg = finiteNumber(state.crossing.angleDeg);
  const variables = {
    actual: degrees(actualDeg),
    normal: degrees(rule.normalAngleDeg),
    minimum: degrees(rule.exceptionalMinimumAngleDeg),
  };
  if (Math.abs(actualDeg - rule.normalAngleDeg) <= rule.normalToleranceDeg) {
    return createResult(rule, 'pass', 'validation.crossingAngle.pass', variables);
  }
  if (actualDeg >= rule.exceptionalMinimumAngleDeg) {
    return createResult(rule, 'warning', 'validation.crossingAngle.exception', variables);
  }
  return createResult(rule, 'blocked', 'validation.crossingAngle.blocked', variables);
}

export function evaluateCrossingOwnerApproval(state) {
  const rule = REGULATORY_RULES.crossingOwnerApproval;
  if (!state?.crossing?.enabled) {
    return createResult(rule, 'not-evaluated', 'validation.crossing.notConfigured');
  }
  return state.crossing.ownerApprovalDocumented
    ? createResult(rule, 'pass', 'validation.crossingApproval.pass')
    : createResult(rule, 'blocked', 'validation.crossingApproval.blocked');
}

export function evaluateCrossingVerticalSeparation(state) {
  const rule = REGULATORY_RULES.crossingVerticalSeparation;
  if (!state?.crossing?.enabled) {
    return createResult(rule, 'not-evaluated', 'validation.crossing.notConfigured');
  }

  const actualM = finiteNumber(state.crossing.verticalClearanceM);
  const gasPosition = state.crossing.gasPosition === 'below' ? 'below' : 'above';
  const variables = {
    actual: metric(actualM),
    minimum: metric(rule.normalMinimumM),
  };
  if (gasPosition === rule.normalGasPosition && actualM >= rule.normalMinimumM) {
    return createResult(rule, 'pass', 'validation.crossingClearance.pass', variables);
  }
  if (state.crossing.protectiveSleeve) {
    return createResult(rule, 'warning', 'validation.crossingClearance.exception', variables);
  }
  return createResult(rule, 'blocked', 'validation.crossingClearance.blocked', variables);
}

export function evaluateRegulatoryRules(state) {
  return [
    evaluateMinimumCover(state),
    evaluateCrossingOwnerApproval(state),
    evaluateCrossingAngle(state),
    evaluateCrossingVerticalSeparation(state),
  ];
}
