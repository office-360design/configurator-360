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
import {
  getRouteEvents,
  isUtilityCrossingEvent,
  legacyCrossingToRouteEvent,
  matchingRouteEventForObstacle,
  routeEventDisplayIndex,
  routeEventTypeDefinition,
  selectedRouteEvent,
} from '../domain/routeEvents.js';
import { assessNetworkConnection } from '../network/networkConnection.js';
import { routeObstacleRouteKey } from '../obstacles/routeObstacles.js';

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

function formatConnectionCoordinate(coordinate) {
  const longitude = Number(coordinate?.[0]);
  const latitude = Number(coordinate?.[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return '—';
  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
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

function resolvedDepthPoints(state, routeLengthM, fallbackCoverM) {
  const source = Array.isArray(state.depthPoints) ? state.depthPoints : [];
  const points = source
    .map((point) => ({
      stationM: Math.max(0, Math.min(routeLengthM, Number(point?.stationM) || 0)),
      coverM: Math.max(0.3, Number(point?.coverM) || fallbackCoverM),
    }))
    .sort((left, right) => left.stationM - right.stationM);
  if (points.length === 0) {
    return [
      { stationM: 0, coverM: fallbackCoverM },
      { stationM: routeLengthM, coverM: fallbackCoverM },
    ];
  }
  return points;
}

function coverAtChainage(state, chainageM, routeLengthM, fallbackCoverM) {
  const points = resolvedDepthPoints(state, routeLengthM, fallbackCoverM);
  const requested = Math.max(0, Math.min(routeLengthM, Number(chainageM) || 0));
  if (requested <= points[0].stationM) return points[0].coverM;
  for (let index = 1; index < points.length; index += 1) {
    const right = points[index];
    if (requested > right.stationM) continue;
    const left = points[index - 1];
    const span = right.stationM - left.stationM;
    const ratio = span > 0 ? (requested - left.stationM) / span : 0;
    return left.coverM + ((right.coverM - left.coverM) * ratio);
  }
  return points.at(-1).coverM;
}

function configuredRouteEvents(state) {
  const events = getRouteEvents(state);
  if (events.length > 0) return events;
  const legacy = legacyCrossingToRouteEvent(state.crossing);
  return legacy ? [legacy] : [];
}

function obstacleEventLabel(event, state) {
  const typeLabel = gasT(state.preferences.locale, `obstacle.type.${event.type}`);
  const name = event.name || gasT(state.preferences.locale, 'obstacle.unnamed', { type: typeLabel });
  const station = formatDistance(event.stationM, state.preferences.units, state.preferences.locale);
  const detail = event.relation === 'crossing'
    ? gasT(state.preferences.locale, 'obstacle.detail.crossing', {
      station,
      angle: `${new Intl.NumberFormat(state.preferences.locale, { maximumFractionDigits: 0 }).format(event.angleDeg || 0)}°`,
    })
    : gasT(state.preferences.locale, 'obstacle.detail.proximity', {
      station,
      distance: formatDistance(event.distanceM, state.preferences.units, state.preferences.locale),
    });
  return `${name} · ${detail}`;
}

function appendObstacleProfileSymbol(svg, event, x, y, state, margin, height) {
  const relationClass = `gas-profile-obstacle--${event.relation}`;
  const typeClass = `gas-profile-obstacle--${event.type}`;
  const group = appendSvg(svg, 'g', {
    class: `gas-profile-obstacle ${typeClass} ${relationClass}`,
    'data-obstacle-event-id': event.id,
  });
  appendSvg(group, 'title', {}, obstacleEventLabel(event, state));
  appendSvg(group, 'line', {
    x1: x,
    x2: x,
    y1: margin.top,
    y2: height - margin.bottom,
    class: 'gas-profile-obstacle-line',
  });
  if (event.type === 'road') {
    appendSvg(group, 'rect', {
      x: x - 5,
      y: y - 5,
      width: 10,
      height: 10,
      rx: 2,
      class: 'gas-profile-obstacle-point',
    });
  } else if (event.type === 'railway') {
    appendSvg(group, 'path', {
      d: `M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}`,
      class: 'gas-profile-obstacle-point gas-profile-obstacle-point--railway',
    });
  } else {
    appendSvg(group, 'circle', {
      cx: x,
      cy: y,
      r: 5.3,
      class: 'gas-profile-obstacle-point',
    });
  }
}

function appendRouteEventProfileSymbol(svg, event, x, y, state, calculation, margin, height, index) {
  const definition = routeEventTypeDefinition(event.type);
  const selected = state.route.selectedEventId === event.id;
  const group = appendSvg(svg, 'g', {
    class: `gas-profile-route-event gas-profile-route-event--${event.type}${selected ? ' is-selected' : ''}${event.confirmed ? '' : ' is-unconfirmed'}`,
    'data-route-event-id': event.id,
  });
  const station = formatDistance(event.stationM, state.preferences.units, state.preferences.locale);
  const eventNumber = routeEventDisplayIndex(state, event);
  const title = event.label || `${gasT(state.preferences.locale, definition.labelKey)} ${eventNumber}`;
  appendSvg(group, 'title', {}, `${title} · ${station} · ${gasT(state.preferences.locale, `option.routeEventSource.${event.source}`)}`);

  const widthM = Math.max(0, Number(event.crossing?.obstacleWidthM) || 0);
  if (widthM > 0 && calculation.routeLengthM > 0) {
    const plotWidth = 720 - margin.left - margin.right;
    const widthPx = Math.max(4, Math.min(plotWidth, widthM / calculation.routeLengthM * plotWidth));
    appendSvg(group, 'rect', {
      x: x - (widthPx / 2),
      y: margin.top,
      width: widthPx,
      height: height - margin.top - margin.bottom,
      class: 'gas-profile-route-event-band',
    });
  }

  appendSvg(group, 'line', {
    x1: x,
    x2: x,
    y1: margin.top,
    y2: height - margin.bottom,
    class: `gas-profile-route-event-line${isUtilityCrossingEvent(event) ? ' gas-profile-crossing-line' : ''}`,
  });
  appendSvg(group, 'path', {
    d: `M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z`,
    class: `gas-profile-route-event-point${isUtilityCrossingEvent(event) ? ' gas-profile-crossing-point' : ''}`,
  });
  appendSvg(group, 'text', {
    x: x + 5,
    y: margin.top + 11 + ((index % 3) * 13),
    class: 'gas-profile-route-event-label',
  }, `${gasT(state.preferences.locale, definition.profileLabelKey)} ${eventNumber}`);
}

export function renderProfile(svg, state, calculation, elevationProfile = null, obstacleScreening = null) {
  if (!svg) return;
  svg.replaceChildren();

  const width = 720;
  const height = 220;
  const margin = { left: 48, right: 16, top: 20, bottom: 31 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const resolved = resolvedProfileSamples(state, elevationProfile);
  const samples = resolved.samples.map((sample) => {
    const coverM = coverAtChainage(
      state,
      sample.chainageM,
      calculation.routeLengthM,
      calculation.coverM,
    );
    return {
      ...sample,
      coverM,
      pipeM: sample.groundM - coverM - (calculation.outsideDiameterM / 2),
    };
  });
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

  const routeEvents = configuredRouteEvents(state);
  const currentObstacleRouteKey = routeObstacleRouteKey(state.route.points);
  const obstacleEvents = (
    obstacleScreening?.status === 'ready'
    && obstacleScreening.routeKey === currentObstacleRouteKey
  ) ? (obstacleScreening.events || []).filter((event) => !matchingRouteEventForObstacle(state, event)) : [];
  obstacleEvents.forEach((event) => {
    const progress = calculation.routeLengthM > 0 ? event.stationM / calculation.routeLengthM : 0;
    const groundM = interpolateElevationAtChainage(
      samples.map((sample) => ({ chainageM: sample.chainageM, elevationM: sample.groundM })),
      event.stationM,
      fallbackProfileElevation(state, progress),
    );
    const localCoverM = coverAtChainage(
      state,
      event.stationM,
      calculation.routeLengthM,
      calculation.coverM,
    );
    const pipeM = groundM - localCoverM - (calculation.outsideDiameterM / 2);
    appendObstacleProfileSymbol(
      svg,
      event,
      xFor(progress),
      yFor(pipeM),
      state,
      margin,
      height,
    );
  });

  routeEvents.forEach((event, index) => {
    const progress = calculation.routeLengthM > 0 ? event.stationM / calculation.routeLengthM : 0;
    const groundM = interpolateElevationAtChainage(
      samples.map((sample) => ({ chainageM: sample.chainageM, elevationM: sample.groundM })),
      event.stationM,
      fallbackProfileElevation(state, progress),
    );
    const localCoverM = coverAtChainage(
      state,
      event.stationM,
      calculation.routeLengthM,
      calculation.coverM,
    );
    const pipeM = groundM - localCoverM - (calculation.outsideDiameterM / 2);
    appendRouteEventProfileSymbol(
      svg,
      event,
      xFor(progress),
      yFor(pipeM),
      state,
      calculation,
      margin,
      height,
      index,
    );
  });

  const station = interpolateRoute(state.route.points, state.route.stationM);
  const stationProgress = calculation.routeLengthM > 0 ? station.chainageM / calculation.routeLengthM : 0;
  const stationGround = interpolateElevationAtChainage(
    samples.map((sample) => ({ chainageM: sample.chainageM, elevationM: sample.groundM })),
    station.chainageM,
    fallbackProfileElevation(state, stationProgress),
  );
  const stationCoverM = coverAtChainage(
    state,
    station.chainageM,
    calculation.routeLengthM,
    calculation.coverM,
  );
  const stationPipe = stationGround - stationCoverM - (calculation.outsideDiameterM / 2);
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
    const context = result.contextKey
      ? ` · ${t(result.contextKey)}${result.contextIndex ? ` ${result.contextIndex}` : ''}`
      : '';
    title.textContent = `${t(result.titleKey)}${context} · ${t(`status.${result.status}`)}`;
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

function obstacleDisplayName(event, t) {
  const type = t(`obstacle.type.${event.type}`);
  return event.name || t('obstacle.unnamed', { type });
}

function renderPipeCatalog(root, state, calculation, t) {
  const product = calculation.pipeProduct;
  const number = new Intl.NumberFormat(state.preferences.locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
  setText(
    root,
    '#pipeProductLabel',
    `${t(product.materialLabelKey)} · Ø${product.outsideDiameterMm} mm · ${product.sdr}`,
  );
  setText(root, '#pipeProductDimensions', t('pipeCatalog.dimensions', {
    wall: number.format(product.wallThicknessMm),
    inside: number.format(product.internalDiameterMm),
    rate: formatMoneyFromEur(
      product.prototypeUnitRateEurM,
      state.preferences.currency,
      state.preferences.locale,
    ),
  }));
  setText(
    root,
    '#pipeCatalogVersion',
    `${calculation.pipeCatalogVersion} · ${calculation.pipeProductId}`,
  );
  const pressureInput = root.querySelector('#pressureInput');
  if (pressureInput) {
    pressureInput.max = String(product.maximumPrototypeDesignPressureBar);
    pressureInput.title = t('pipeCatalog.pressureLimit', {
      maximum: `${product.maximumPrototypeDesignPressureBar} bar`,
    });
  }
}

function renderRouteEvents(root, state, calculation, t) {
  const events = getRouteEvents(state);
  const selected = selectedRouteEvent(state);
  setText(root, '#routeEventCount', t('routeEvent.count', { count: events.length }));

  const list = root.querySelector('#routeEventList');
  if (list) {
    list.replaceChildren(...events.map((event) => {
      const definition = routeEventTypeDefinition(event.type);
      const index = routeEventDisplayIndex(state, event);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `gas-route-event-item${selected?.id === event.id ? ' is-selected' : ''}`;
      item.dataset.routeEventId = event.id;
      item.setAttribute('aria-pressed', String(selected?.id === event.id));
      item.style.setProperty('--gas-route-event-color', definition.color);

      const marker = document.createElement('span');
      marker.className = 'gas-route-event-item__marker';
      marker.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span');
      body.className = 'gas-route-event-item__body';
      const name = document.createElement('strong');
      name.textContent = event.label || `${t(definition.labelKey)} ${index}`;
      const meta = document.createElement('small');
      meta.textContent = `${t(definition.labelKey)} · ${formatDistance(
        event.stationM,
        state.preferences.units,
        state.preferences.locale,
      )}`;
      const source = document.createElement('em');
      source.textContent = t(`option.routeEventSource.${event.source}`);
      const status = document.createElement('span');
      status.className = `gas-route-event-item__status${event.confirmed ? ' is-confirmed' : ''}`;
      status.textContent = t(event.confirmed ? 'routeEvent.confirmed' : 'routeEvent.needsConfirmation');
      body.append(name, meta, source);
      item.append(marker, body, status);
      return item;
    }));
  }

  const empty = root.querySelector('#routeEventEmpty');
  if (empty) empty.hidden = events.length > 0;
  const fields = root.querySelector('#routeEventFields');
  if (fields) fields.hidden = !selected;
  const removeButton = root.querySelector('#removeRouteEventButton');
  if (removeButton) removeButton.disabled = !selected;
  if (!selected) return;

  const stationInput = root.querySelector('#routeEventStationInput');
  if (stationInput) {
    stationInput.max = String(Math.max(1, calculation.routeLengthM));
    stationInput.value = String(Math.round(selected.stationM));
  }
  setText(
    root,
    '#routeEventStationValue',
    formatDistance(selected.stationM, state.preferences.units, state.preferences.locale),
  );
  setValue(root, '#routeEventLabelInput', selected.label);
  setValue(root, '#routeEventTypeSelect', selected.type);
  setValue(root, '#routeEventSourceSelect', selected.source);
  setValue(root, '#routeEventAngleInput', selected.crossing.angleDeg);
  setValue(root, '#routeEventWidthInput', selected.crossing.obstacleWidthM);
  setValue(root, '#routeEventMethodSelect', selected.crossing.installationMethod);
  setValue(root, '#routeEventUtilityTypeSelect', selected.crossing.utilityType);
  setValue(root, '#routeEventGasPositionSelect', selected.crossing.gasPosition);
  setValue(root, '#routeEventClearanceInput', selected.crossing.verticalClearanceM);
  setChecked(root, '#routeEventSleeveInput', selected.crossing.protectiveSleeve);
  setChecked(root, '#routeEventOwnerApprovalInput', selected.crossing.ownerApprovalDocumented);
  setChecked(root, '#routeEventConfirmedInput', selected.confirmed);

  const utilityFields = root.querySelector('#utilityRouteEventFields');
  if (utilityFields) utilityFields.hidden = !isUtilityCrossingEvent(selected);
}

function renderObstacleScreening(root, state, obstacleScreening, t) {
  const enabled = state.screening?.obstaclesEnabled !== false;
  const routeKey = routeObstacleRouteKey(state.route.points);
  const matchesRoute = obstacleScreening?.routeKey === routeKey;
  const status = enabled && matchesRoute ? obstacleScreening?.status || 'idle' : enabled ? 'idle' : 'disabled';
  const ready = status === 'ready';
  const summary = ready ? obstacleScreening.summary || {} : {};
  const eventCount = Number(summary.eventCount) || 0;
  const crossingCount = Number(summary.crossingCount) || 0;
  const proximityCount = Number(summary.proximityCount) || 0;
  const featureCount = Number(summary.featureCount) || 0;

  setChecked(root, '#obstacleScreeningEnabledInput', enabled);
  setValue(root, '#obstacleProximityInput', state.screening?.proximityThresholdM ?? 25);
  setText(
    root,
    '#obstacleProximityValue',
    formatDistance(state.screening?.proximityThresholdM ?? 25, state.preferences.units, state.preferences.locale),
  );
  setText(root, '#obstacleSummaryBadge', ready ? String(eventCount) : '—');
  setText(root, '#obstacleCrossingCount', ready ? String(crossingCount) : '—');
  setText(root, '#obstacleProximityCount', ready ? String(proximityCount) : '—');
  setText(root, '#obstacleFeatureCount', ready ? String(featureCount) : '—');
  ['road', 'railway', 'waterway'].forEach((type) => {
    const selector = type === 'road'
      ? '#roadObstacleLayerCount'
      : type === 'railway' ? '#railwayObstacleLayerCount' : '#waterwayObstacleLayerCount';
    setText(root, selector, ready ? String(Number(summary.byType?.[type]?.features) || 0) : '—');
  });

  const fields = root.querySelector('#obstacleScreeningFields');
  if (fields) fields.hidden = !enabled;
  const statusElement = root.querySelector('#obstacleScreeningStatus');
  if (statusElement) {
    statusElement.textContent = t(`obstacle.status.${status}`);
    statusElement.className = `gas-obstacle-status gas-obstacle-status--${status}`;
    statusElement.title = status === 'error' ? obstacleScreening?.error || '' : '';
  }
  const retryButton = root.querySelector('#retryObstacleScreeningButton');
  if (retryButton) retryButton.hidden = status !== 'error';
  root.querySelectorAll('[data-map-layer^="obstacle"]').forEach((button) => {
    button.disabled = !enabled;
  });

  const list = root.querySelector('#obstacleEventList');
  if (!list) return;
  if (ready && eventCount > 0) {
    list.replaceChildren(...(obstacleScreening.events || []).map((event) => {
      const item = document.createElement('article');
      item.className = `gas-obstacle-item gas-obstacle-item--${event.type} gas-obstacle-item--${event.relation}`;
      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'gas-obstacle-item__select';
      selectButton.dataset.obstacleEventStation = String(event.stationM);
      selectButton.dataset.obstacleEventSegment = event.segmentId || '';
      const marker = document.createElement('span');
      marker.className = 'gas-obstacle-item__marker';
      marker.setAttribute('aria-hidden', 'true');
      const body = document.createElement('span');
      body.className = 'gas-obstacle-item__body';
      const name = document.createElement('strong');
      name.textContent = obstacleDisplayName(event, t);
      const meta = document.createElement('small');
      meta.textContent = `${t(`obstacle.type.${event.type}`)} · ${t(`obstacle.relation.${event.relation}`)}`;
      const detail = document.createElement('em');
      detail.textContent = event.relation === 'crossing'
        ? t('obstacle.detail.crossing', {
          station: formatDistance(event.stationM, state.preferences.units, state.preferences.locale),
          angle: `${new Intl.NumberFormat(state.preferences.locale, { maximumFractionDigits: 0 }).format(event.angleDeg || 0)}°`,
        })
        : t('obstacle.detail.proximity', {
          station: formatDistance(event.stationM, state.preferences.units, state.preferences.locale),
          distance: formatDistance(event.distanceM, state.preferences.units, state.preferences.locale),
        });
      body.append(name, meta, detail);
      selectButton.append(marker, body);
      item.append(selectButton);

      if (event.relation === 'crossing') {
        const configured = matchingRouteEventForObstacle(state, event);
        const action = document.createElement('button');
        action.type = 'button';
        action.className = `gas-obstacle-item__action${configured ? ' is-configured' : ''}`;
        if (configured) {
          action.dataset.obstacleRouteEventId = configured.id;
          action.textContent = t('routeEvent.alreadyAdded');
          action.title = t('action.openConfiguredCrossing');
        } else {
          action.dataset.obstacleEventAdd = event.id;
          action.textContent = t('action.addDetectedCrossing');
        }
        item.append(action);
      }
      return item;
    }));
    return;
  }

  const empty = document.createElement('p');
  empty.className = `gas-obstacle-empty gas-obstacle-empty--${status}`;
  empty.textContent = ready
    ? t('obstacle.empty')
    : status === 'error' ? t('obstacle.errorHint') : t('obstacle.waiting');
  list.replaceChildren(empty);
}

export function renderGasState(root, state, elevationProfile = null, obstacleScreening = null) {
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
  const networkConnection = assessNetworkConnection(state);
  const networkCandidate = networkConnection.candidate;

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

  const connectionCard = root.querySelector('#networkConnectionCard');
  if (connectionCard) {
    connectionCard.className = `gas-connection-card gas-connection-card--${networkConnection.status}`;
  }
  setText(root, '#networkConnectionStatus', t(`connection.status.${networkConnection.status}`));
  setText(root, '#networkConnectionAsset', networkCandidate?.name || t('connection.noAsset'));
  setText(root, '#networkConnectionGroup', networkCandidate?.serviceGroup || '—');
  setText(root, '#networkConnectionGap', Number.isFinite(networkConnection.distanceM)
    ? formatDistance(networkConnection.distanceM, units, locale)
    : '—');
  setText(root, '#networkConnectionCoordinates', formatConnectionCoordinate(networkCandidate?.coordinate));
  setText(root, '#networkConnectionPlanLength', formatDistance(calculation.routeLengthM, units, locale));
  setText(root, '#networkConnectionTerrainLength', hasTerrainAdjustedLength
    ? formatDistance(terrainAdjustedLengthM, units, locale)
    : '—');
  setText(root, '#networkConnectionCost', `${formatMoneyFromEur(calculation.estimateLowEur, currency, locale)} – ${formatMoneyFromEur(calculation.estimateHighEur, currency, locale)}`);
  const snapButton = root.querySelector('#snapToNearestNetworkButton');
  if (snapButton) snapButton.hidden = networkConnection.connected || !networkConnection.canSnap;
  const connectionHintKey = networkConnection.connected
    ? 'connection.hint.connected'
    : networkCandidate
      ? networkConnection.canSnap
        ? 'connection.hint.snap'
        : 'connection.hint.far'
      : 'connection.hint.missing';
  setText(root, '#networkConnectionHint', t(connectionHintKey));
  const connectionToleranceInput = root.querySelector('#connectionToleranceInput');
  if (connectionToleranceInput) connectionToleranceInput.value = String(networkConnection.snapToleranceM);
  setText(
    root,
    '#connectionToleranceValue',
    formatDistance(networkConnection.snapToleranceM, units, locale),
  );

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
  setChecked(root, '#osdCapacityInput', state.project.osdCapacityKnown);
  setChecked(root, '#coverOsdAgreementInput', state.regulatory.reducedCover.osdAgreement);
  setChecked(root, '#coverProtectionInput', state.regulatory.reducedCover.additionalProtection);
  renderPipeCatalog(root, state, calculation, t);
  renderRouteEvents(root, state, calculation, t);

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

  renderObstacleScreening(root, state, obstacleScreening, t);
  renderProfile(root.querySelector('#profileSvg'), state, calculation, elevationProfile, obstacleScreening);
  renderCrossSection(root.querySelector('#crossSectionSvg'), state, calculation, t);
  renderValidations(root, state, calculation, t, matchingTerrainProfile ? elevationProfile : null);
  return calculation;
}
