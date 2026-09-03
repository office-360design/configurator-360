import {
  buildValidationResults,
  calculateProject,
  formatArea,
  formatDistance,
  formatMoneyFromEur,
  formatVolume,
  GROUND_TYPES,
  SURFACE_TYPES,
  validationSummary,
} from '../domain/calculations.js';
import { interpolateRoute, routeProfileSamples } from '../domain/geometry.js';
import {
  interpolateElevationAtChainage,
  routeElevationKey,
  terrainAdjustedRouteLengthMeters,
} from '../elevation/routeElevation.js';
import { gasT } from '../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function setValue(root, selector, value) {
  const element = root.querySelector(selector);
  if (element && element.value !== String(value)) element.value = String(value);
}

function setText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
}

function setChecked(root, selector, checked) {
  const element = root.querySelector(selector);
  if (element) element.checked = Boolean(checked);
}

function setFieldAssessment(root, inputSelector, hintSelector, status, hint) {
  const input = root.querySelector(inputSelector);
  const hintElement = root.querySelector(hintSelector);
  const needsCorrection = status === 'blocked' || status === 'missing';
  if (input) input.setAttribute('aria-invalid', String(needsCorrection));
  if (hintElement) {
    hintElement.textContent = hint;
    hintElement.className = `gas-field-requirement gas-field-requirement--${status}`;
  }
}

function formatDimension(meters, units, locale) {
  const numeric = Number(meters) || 0;
  const converted = units === 'imperial' ? numeric * 3.28084 : numeric;
  const suffix = units === 'imperial' ? 'ft' : 'm';
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 2 }).format(converted)} ${suffix}`;
}

function formatDistanceDifference(meters, units, locale) {
  const converted = units === 'imperial' ? Number(meters) * 3.28084 : Number(meters);
  const suffix = units === 'imperial' ? 'ft' : 'm';
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(Math.max(0, converted))} ${suffix}`;
}

function svgElement(name, attributes = {}, text = '') {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  if (text) element.textContent = text;
  return element;
}

function appendSvg(parent, name, attributes = {}, text = '') {
  const element = svgElement(name, attributes, text);
  parent.append(element);
  return element;
}

function fallbackProfileElevation(state, progress) {
  const start = Number(state.data.startElevationM) || 0;
  const end = Number(state.data.endElevationM) || 0;
  const base = start + ((end - start) * progress);
  const terrainVariation = Math.sin(progress * Math.PI * 2) * 0.55
    + Math.sin(progress * Math.PI * 5) * 0.16;
  return base + terrainVariation;
}

function resolvedProfileSamples(state, elevationProfile) {
  const hasLiveProfile = (
    elevationProfile?.status === 'ready'
    && elevationProfile.routeKey === routeElevationKey(state.route.points)
    && elevationProfile.samples?.length >= 2
  );
  if (hasLiveProfile) {
    return {
      live: true,
      samples: elevationProfile.samples.map((sample) => ({
        ...sample,
        groundM: Number(sample.elevationM),
      })),
    };
  }
  return {
    live: false,
    samples: routeProfileSamples(state.route.points, 82).map((sample) => ({
      ...sample,
      groundM: fallbackProfileElevation(state, sample.progress),
    })),
  };
}

export function renderProfile(svg, state, calculation, elevationProfile = null) {
  if (!svg) return;
  svg.replaceChildren();

  const width = 720;
  const height = 220;
  const margin = { left: 48, right: 16, top: 20, bottom: 31 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const resolved = resolvedProfileSamples(state, elevationProfile);
  const samples = resolved.samples.map((sample) => ({
    ...sample,
    pipeM: sample.groundM - calculation.coverM - (calculation.outsideDiameterM / 2),
  }));
  const elevations = samples.flatMap((sample) => [sample.groundM, sample.pipeM]);
  const minElevation = Math.min(...elevations);
  const maxElevation = Math.max(...elevations);
  const verticalPadding = Math.max(0.4, (maxElevation - minElevation) * 0.16);
  const yMin = minElevation - verticalPadding;
  const yMax = maxElevation + verticalPadding;
  const xFor = (progress) => margin.left + (progress * plotWidth);
  const yFor = (elevation) => margin.top + ((yMax - elevation) / (yMax - yMin || 1)) * plotHeight;

  const background = appendSvg(svg, 'g', { class: 'gas-profile-grid' });
  for (let index = 0; index <= 4; index += 1) {
    const progress = index / 4;
    const y = margin.top + (progress * plotHeight);
    const elevation = yMax - (progress * (yMax - yMin));
    appendSvg(background, 'line', { x1: margin.left, x2: width - margin.right, y1: y, y2: y });
    const displayElevation = state.preferences.units === 'imperial' ? elevation * 3.28084 : elevation;
    appendSvg(background, 'text', { x: margin.left - 8, y: y + 3, 'text-anchor': 'end' }, new Intl.NumberFormat(state.preferences.locale, { maximumFractionDigits: 1 }).format(displayElevation));
  }

  const groundPoints = samples.map((sample) => `${xFor(sample.progress).toFixed(1)},${yFor(sample.groundM).toFixed(1)}`).join(' ');
  const pipePoints = samples.map((sample) => `${xFor(sample.progress).toFixed(1)},${yFor(sample.pipeM).toFixed(1)}`).join(' ');
  const groundArea = `${margin.left},${height - margin.bottom} ${groundPoints} ${width - margin.right},${height - margin.bottom}`;
  appendSvg(svg, 'polygon', { points: groundArea, class: 'gas-profile-earth' });
  appendSvg(svg, 'polyline', {
    points: groundPoints,
    class: `gas-profile-ground${resolved.live ? '' : ' gas-profile-ground--fallback'}`,
  });
  appendSvg(svg, 'polyline', {
    points: pipePoints,
    class: `gas-profile-pipe${resolved.live ? '' : ' gas-profile-pipe--fallback'}`,
  });

  calculation.segments.slice(0, -1).forEach((segment) => {
    const progress = calculation.routeLengthM > 0 ? segment.endChainageM / calculation.routeLengthM : 0;
    const x = xFor(progress);
    appendSvg(svg, 'line', { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: 'gas-profile-segment-line' });
    appendSvg(svg, 'text', { x: x + 4, y: margin.top + 11, class: 'gas-profile-note' }, String(segment.index + 2));
  });

  if (state.crossing?.enabled) {
    const crossingProgress = calculation.routeLengthM > 0
      ? state.crossing.stationM / calculation.routeLengthM
      : 0;
    const crossingGround = interpolateElevationAtChainage(
      samples.map((sample) => ({ chainageM: sample.chainageM, elevationM: sample.groundM })),
      state.crossing.stationM,
      fallbackProfileElevation(state, crossingProgress),
    );
    const crossingPipe = crossingGround - calculation.coverM - (calculation.outsideDiameterM / 2);
    const crossingX = xFor(crossingProgress);
    const crossingY = yFor(crossingPipe);
    appendSvg(svg, 'line', {
      x1: crossingX,
      x2: crossingX,
      y1: margin.top,
      y2: height - margin.bottom,
      class: 'gas-profile-crossing-line',
    });
    appendSvg(svg, 'path', {
      d: `M${crossingX} ${crossingY - 6}L${crossingX + 6} ${crossingY}L${crossingX} ${crossingY + 6}L${crossingX - 6} ${crossingY}Z`,
      class: 'gas-profile-crossing-point',
    });
    appendSvg(svg, 'text', {
      x: crossingX + 5,
      y: margin.top + 11,
      class: 'gas-profile-crossing-label',
    }, gasT(state.preferences.locale, 'view.utilityCrossing'));
  }

  const station = interpolateRoute(state.route.points, state.route.stationM);
  const stationProgress = calculation.routeLengthM > 0 ? station.chainageM / calculation.routeLengthM : 0;
  const stationGround = interpolateElevationAtChainage(
    samples.map((sample) => ({ chainageM: sample.chainageM, elevationM: sample.groundM })),
    station.chainageM,
    fallbackProfileElevation(state, stationProgress),
  );
  const stationPipe = stationGround - calculation.coverM - (calculation.outsideDiameterM / 2);
  const stationX = xFor(stationProgress);
  const stationY = yFor(stationPipe);
  appendSvg(svg, 'line', { x1: stationX, x2: stationX, y1: margin.top, y2: height - margin.bottom, class: 'gas-profile-station-line' });
  appendSvg(svg, 'circle', { cx: stationX, cy: stationY, r: 5.2, class: 'gas-profile-station-point' });

  appendSvg(svg, 'text', { x: margin.left, y: height - 10, class: 'gas-profile-end-label' }, 'A · 0');
  appendSvg(svg, 'text', { x: width - margin.right, y: height - 10, 'text-anchor': 'end', class: 'gas-profile-end-label' }, `B · ${formatDistance(calculation.routeLengthM, state.preferences.units, state.preferences.locale)}`);
}

function addDimension(svg, {
  x1, y1, x2, y2, label, labelX, labelY, anchor = 'middle', labelClass = 'gas-section-label',
}) {
  appendSvg(svg, 'line', { x1, y1, x2, y2, class: 'gas-section-dimension' });
  const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  if (vertical) {
    appendSvg(svg, 'path', { d: `M${x1 - 4} ${y1 + 5}L${x1} ${y1}L${x1 + 4} ${y1 + 5}M${x2 - 4} ${y2 - 5}L${x2} ${y2}L${x2 + 4} ${y2 - 5}`, class: 'gas-section-arrow' });
  } else {
    appendSvg(svg, 'path', { d: `M${x1 + 5} ${y1 - 4}L${x1} ${y1}L${x1 + 5} ${y1 + 4}M${x2 - 5} ${y2 - 4}L${x2} ${y2}L${x2 - 5} ${y2 + 4}`, class: 'gas-section-arrow' });
  }
  appendSvg(svg, 'text', { x: labelX, y: labelY, 'text-anchor': anchor, class: labelClass }, label);
}

export function renderCrossSection(svg, state, calculation, t) {
  if (!svg) return;
  svg.replaceChildren();

  const selected = calculation.segments.find((segment) => segment.id === state.route.selectedSegmentId)
    || calculation.segments[0];
  const ground = selected?.ground || GROUND_TYPES.common;
  const surface = selected?.surface || SURFACE_TYPES.greenfield;
  const surfaceY = 44;
  const trenchLeft = 126;
  const trenchRight = 356;
  const trenchBottom = 184;
  const verticalScale = 128 / Math.max(0.7, calculation.trenchDepthM);
  const pipeRadius = Math.max(10, Math.min(31, (calculation.outsideDiameterM / calculation.trenchWidthM) * 115));
  const pipeCenterY = Math.min(trenchBottom - calculation.beddingM * verticalScale - pipeRadius, surfaceY + (calculation.coverM * verticalScale) + pipeRadius);
  const beddingTop = Math.max(surfaceY + 12, pipeCenterY - pipeRadius - 10);
  const warningY = surfaceY + Math.min(42, Math.max(20, calculation.coverM * verticalScale * 0.42));

  appendSvg(svg, 'rect', { x: 0, y: surfaceY, width: 480, height: 176, fill: ground.color });
  appendSvg(svg, 'rect', { x: 0, y: surfaceY - 10, width: 480, height: 12, fill: surface.color });
  appendSvg(svg, 'path', {
    d: `M${trenchLeft} ${surfaceY} L${trenchLeft + 13} ${trenchBottom} L${trenchRight - 13} ${trenchBottom} L${trenchRight} ${surfaceY} Z`,
    class: 'gas-section-trench',
  });
  appendSvg(svg, 'path', {
    d: `M${trenchLeft + 8} ${beddingTop} L${trenchLeft + 13} ${trenchBottom} L${trenchRight - 13} ${trenchBottom} L${trenchRight - 8} ${beddingTop} Z`,
    class: 'gas-section-bedding',
  });
  appendSvg(svg, 'line', { x1: trenchLeft + 11, y1: warningY, x2: trenchRight - 11, y2: warningY, class: 'gas-section-warning' });
  appendSvg(svg, 'circle', { cx: 241, cy: pipeCenterY, r: pipeRadius + 4, class: 'gas-section-pipe-halo' });
  appendSvg(svg, 'circle', { cx: 241, cy: pipeCenterY, r: pipeRadius, class: 'gas-section-pipe' });
  appendSvg(svg, 'circle', { cx: 241, cy: pipeCenterY, r: Math.max(3, pipeRadius * 0.66), class: 'gas-section-pipe-inner' });

  appendSvg(svg, 'line', { x1: 241, y1: surfaceY, x2: 241, y2: pipeCenterY - pipeRadius, class: 'gas-section-guide' });
  addDimension(svg, {
    x1: 91, y1: surfaceY, x2: 91, y2: pipeCenterY - pipeRadius,
    label: t('section.cover', { cover: formatDimension(calculation.coverM, state.preferences.units, state.preferences.locale) }),
    labelX: 82, labelY: ((surfaceY + pipeCenterY - pipeRadius) / 2) + 3, anchor: 'end',
  });
  addDimension(svg, {
    x1: trenchLeft, y1: 204, x2: trenchRight, y2: 204,
    label: calculation.trenchWidthAssessment.status === 'not-evaluated'
      ? t('section.widthCaseSpecific', {
        width: formatDimension(calculation.trenchWidthM, state.preferences.units, state.preferences.locale),
      })
      : t('section.widthRequirement', {
        width: formatDimension(calculation.trenchWidthM, state.preferences.units, state.preferences.locale),
        minimum: formatDimension(calculation.requiredTrenchWidthM, state.preferences.units, state.preferences.locale),
      }),
    labelX: 241, labelY: 217,
    labelClass: `gas-section-label gas-section-rule-status--${calculation.trenchWidthAssessment.status}`,
  });

  appendSvg(svg, 'text', { x: 15, y: 31, class: 'gas-section-label' }, t('section.surface'));
  appendSvg(svg, 'line', { x1: 82, y1: 28, x2: 125, y2: surfaceY - 5, class: 'gas-section-leader' });
  appendSvg(svg, 'text', { x: 369, y: warningY + 3, class: 'gas-section-label' }, t('section.warningTape'));
  appendSvg(svg, 'line', { x1: 360, y1: warningY, x2: trenchRight - 10, y2: warningY, class: 'gas-section-leader' });
  appendSvg(svg, 'text', { x: 369, y: beddingTop + 22, class: 'gas-section-label' }, t('section.bedding'));
  appendSvg(svg, 'text', {
    x: 369,
    y: beddingTop + 34,
    class: `gas-section-rule-detail gas-section-rule-status--${calculation.beddingAssessment.status}`,
  }, t('section.beddingRequirement', {
    actual: formatDimension(calculation.beddingM, state.preferences.units, state.preferences.locale),
    minimum: formatDimension(calculation.beddingMinimumM, state.preferences.units, state.preferences.locale),
    maximum: formatDimension(calculation.beddingMaximumM, state.preferences.units, state.preferences.locale),
  }));
  appendSvg(svg, 'line', { x1: 360, y1: beddingTop + 18, x2: trenchRight - 8, y2: beddingTop + 18, class: 'gas-section-leader' });
  appendSvg(svg, 'text', { x: 241, y: pipeCenterY + 4, 'text-anchor': 'middle', class: 'gas-section-pipe-label' }, t('section.pipe', { diameter: `${calculation.diameterMm} mm` }));
}

function renderValidations(root, state, calculation, t, elevationProfile) {
  const results = buildValidationResults(state, calculation, { elevationProfile });
  const summary = validationSummary(results);
  const needsReview = summary.warning + summary.missing + summary.blocked + summary['not-evaluated'];
  setText(root, '#validationSummary', `${needsReview}/${results.length}`);
  const list = root.querySelector('#validationList');
  if (!list) return;
  list.replaceChildren(...results.map((result) => {
    const item = document.createElement('article');
    item.className = `gas-validation-item gas-validation-item--${result.status}`;
    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `${t(result.titleKey)} · ${t(`status.${result.status}`)}`;
    const detail = document.createElement('p');
    detail.textContent = t(result.detailKey, result.detailVariables || {});
    body.append(title);
    if (result.ruleId) {
      const metadata = document.createElement('small');
      metadata.className = 'gas-validation-meta';
      metadata.textContent = `${result.ruleId} · v${result.packVersion}`;
      body.append(metadata);
    }
    body.append(detail);
    if (result.sourceHref && result.sourceLabel) {
      const link = document.createElement('a');
      link.href = result.sourceHref;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = result.sourceLabel;
      body.append(link);
    }
    item.append(body);
    return item;
  }));
}

export function renderGasState(root, state, elevationProfile = null) {
  const calculation = calculateProject(state);
  const locale = state.preferences.locale;
  const units = state.preferences.units;
  const currency = state.preferences.currency;
  const t = (key, variables = {}) => gasT(locale, key, variables);
  const selected = calculation.segments.find((segment) => segment.id === state.route.selectedSegmentId)
    || calculation.segments[0];
  const currentRouteElevationKey = routeElevationKey(state.route.points);
  const elevationStatusMatchesRoute = elevationProfile?.routeKey === currentRouteElevationKey;
  const matchingTerrainProfile = (
    elevationProfile?.status === 'ready'
    && elevationStatusMatchesRoute
    && elevationProfile.samples?.length >= 2
  );
  const terrainAdjustedLengthM = matchingTerrainProfile
    ? terrainAdjustedRouteLengthMeters(elevationProfile.samples)
    : NaN;
  const hasTerrainAdjustedLength = Number.isFinite(terrainAdjustedLengthM);
  const terrainLengthDifferenceM = hasTerrainAdjustedLength
    ? Math.max(0, terrainAdjustedLengthM - calculation.routeLengthM)
    : NaN;

  setText(root, '#headerRouteLength', formatDistance(calculation.routeLengthM, units, locale));
  setText(root, '#headerTerrainLength', hasTerrainAdjustedLength
    ? formatDistance(terrainAdjustedLengthM, units, locale)
    : '—');
  setText(root, '#headerSegmentCount', t('route.segmentCount', { count: calculation.segments.length }));
  const stationDistance = formatDistance(state.route.stationM, units, locale);
  const stationElevation = matchingTerrainProfile
    ? formatDimension(
      interpolateElevationAtChainage(elevationProfile.samples, state.route.stationM),
      units,
      locale,
    )
    : null;
  setText(root, '#profileStationLabel', stationElevation
    ? t('view.stationElevation', { station: stationDistance, elevation: stationElevation })
    : t('view.station', { station: stationDistance }));
  setText(root, '#crossSectionSegmentLabel', selected
    ? t('view.selectedSegment', { number: selected.index + 1 })
    : t('empty.segment'));
  setText(root, '#selectedSegmentLabel', selected
    ? t('view.selectedSegment', { number: selected.index + 1 })
    : t('empty.segment'));
  setText(root, '#selectedSegmentLength', selected ? formatDistance(selected.lengthM, units, locale) : '—');

  const elevationStatus = root.querySelector('#profileDataStatus');
  const elevationRetry = root.querySelector('#retryElevationButton');
  const effectiveElevationStatus = elevationStatusMatchesRoute
    ? elevationProfile?.status || 'idle'
    : 'idle';
  if (elevationStatus) {
    let statusKey = 'view.elevationFallback';
    if (effectiveElevationStatus === 'loading') statusKey = 'view.elevationLoading';
    else if (effectiveElevationStatus === 'ready') statusKey = 'view.elevationReady';
    else if (effectiveElevationStatus === 'error') statusKey = 'view.elevationError';
    elevationStatus.textContent = t(statusKey);
    elevationStatus.className = `gas-elevation-status gas-elevation-status--${effectiveElevationStatus}`;
    elevationStatus.title = effectiveElevationStatus === 'error' ? elevationProfile?.error || '' : '';
  }
  if (elevationRetry) {
    elevationRetry.hidden = effectiveElevationStatus !== 'error';
  }

  const stationInput = root.querySelector('#stationInput');
  if (stationInput) {
    stationInput.max = String(Math.max(1, calculation.routeLengthM));
    stationInput.value = String(Math.round(state.route.stationM));
  }
  setText(root, '#stationValue', formatDistance(state.route.stationM, units, locale));

  setValue(root, '#groundTypeSelect', selected?.setting.groundType || 'common');
  setValue(root, '#surfaceTypeSelect', selected?.setting.surfaceType || 'greenfield');
  setValue(root, '#materialSelect', state.pipe.material);
  setValue(root, '#diameterSelect', state.pipe.diameterMm);
  setValue(root, '#sdrSelect', state.pipe.sdr);
  setValue(root, '#pressureInput', state.pipe.designPressureBar);
  setValue(root, '#coverInput', state.trench.coverM);
  setValue(root, '#trenchWidthInput', state.trench.widthM);
  setValue(root, '#beddingInput', state.trench.beddingM);
  setValue(root, '#beddingMaterialSelect', state.trench.beddingMaterial);
  setValue(root, '#groundSourceSelect', state.data.groundSource);
  setValue(root, '#utilitySourceSelect', state.data.utilitySource);
  setValue(root, '#startElevationInput', state.data.startElevationM);
  setValue(root, '#endElevationInput', state.data.endElevationM);
  setValue(root, '#crossingUtilityTypeSelect', state.crossing.utilityType);
  setValue(root, '#crossingGasPositionSelect', state.crossing.gasPosition);
  setValue(root, '#crossingAngleInput', state.crossing.angleDeg);
  setValue(root, '#crossingClearanceInput', state.crossing.verticalClearanceM);
  setChecked(root, '#osdCapacityInput', state.project.osdCapacityKnown);
  setChecked(root, '#coverOsdAgreementInput', state.regulatory.reducedCover.osdAgreement);
  setChecked(root, '#coverProtectionInput', state.regulatory.reducedCover.additionalProtection);
  setChecked(root, '#crossingEnabledInput', state.crossing.enabled);
  setChecked(root, '#crossingSleeveInput', state.crossing.protectiveSleeve);
  setChecked(root, '#crossingOwnerApprovalInput', state.crossing.ownerApprovalDocumented);

  const trenchWidthInput = root.querySelector('#trenchWidthInput');
  if (trenchWidthInput) trenchWidthInput.min = String(calculation.requiredTrenchWidthM);
  setFieldAssessment(
    root,
    '#trenchWidthInput',
    '#trenchWidthRequirement',
    calculation.trenchWidthAssessment.status,
    t(
      calculation.trenchWidthAssessment.status === 'not-evaluated'
        ? 'field.trenchWidthRequirementCaseSpecific'
        : 'field.trenchWidthRequirement',
      { minimum: formatDimension(calculation.requiredTrenchWidthM, units, locale) },
    ),
  );
  setFieldAssessment(
    root,
    '#beddingInput',
    '#beddingRequirement',
    calculation.beddingAssessment.status,
    t('field.beddingRequirement', {
      minimum: formatDimension(calculation.beddingMinimumM, units, locale),
      maximum: formatDimension(calculation.beddingMaximumM, units, locale),
    }),
  );
  const beddingInput = root.querySelector('#beddingInput');
  if (beddingInput) beddingInput.setAttribute('aria-invalid', String(!calculation.beddingThicknessCompliant));
  const beddingMaterialSelect = root.querySelector('#beddingMaterialSelect');
  if (beddingMaterialSelect) {
    beddingMaterialSelect.setAttribute('aria-invalid', String(!calculation.beddingMaterialCompliant));
  }

  const reducedCoverFields = root.querySelector('#reducedCoverExceptionFields');
  if (reducedCoverFields) reducedCoverFields.hidden = state.trench.coverM >= 0.9;
  const crossingFields = root.querySelector('#crossingFields');
  if (crossingFields) crossingFields.hidden = !state.crossing.enabled;
  const crossingStationInput = root.querySelector('#crossingStationInput');
  if (crossingStationInput) {
    crossingStationInput.max = String(Math.max(1, calculation.routeLengthM));
    crossingStationInput.value = String(Math.round(state.crossing.stationM));
  }
  setText(root, '#crossingStationValue', formatDistance(state.crossing.stationM, units, locale));

  root.querySelectorAll('[data-route-mode]').forEach((button) => {
    const active = button.dataset.routeMode === state.route.editMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  const selectedPoint = state.route.points.find((point) => point.id === state.route.selectedPointId);
  const waypointCount = state.route.points.filter((point) => point.kind === 'waypoint').length;
  const removeButton = root.querySelector('#removeWaypointButton');
  const clearButton = root.querySelector('#clearWaypointsButton');
  if (removeButton) removeButton.disabled = selectedPoint?.kind !== 'waypoint';
  if (clearButton) clearButton.disabled = waypointCount === 0;

  setText(root, '#routeLengthResult', formatDistance(calculation.routeLengthM, units, locale));
  setText(root, '#terrainLengthResult', hasTerrainAdjustedLength
    ? formatDistance(terrainAdjustedLengthM, units, locale)
    : '—');
  setText(root, '#terrainLengthDetail', hasTerrainAdjustedLength
    ? t('metric.terrainLengthDelta', {
      difference: formatDistanceDifference(terrainLengthDifferenceM, units, locale),
    })
    : t('metric.terrainLengthPending'));
  setText(root, '#pipeLengthResult', formatDistance(calculation.pipeLengthM, units, locale));
  setText(root, '#excavationResult', formatVolume(calculation.excavationM3, units, locale));
  setText(root, '#beddingResult', formatVolume(calculation.beddingM3, units, locale));
  setText(root, '#restorationResult', formatArea(calculation.restorationM2, units, locale));
  const verifiedData = state.data.groundSource === 'verifiedSurvey' && state.data.utilitySource === 'fieldVerified';
  setText(root, '#dataConfidenceResult', t(verifiedData ? 'metric.verified' : 'metric.estimated'));
  setText(root, '#costRangeResult', `${formatMoneyFromEur(calculation.estimateLowEur, currency, locale)} – ${formatMoneyFromEur(calculation.estimateHighEur, currency, locale)}`);

  renderProfile(root.querySelector('#profileSvg'), state, calculation, elevationProfile);
  renderCrossSection(root.querySelector('#crossSectionSvg'), state, calculation, t);
  renderValidations(root, state, calculation, t, matchingTerrainProfile ? elevationProfile : null);
  return calculation;
}
