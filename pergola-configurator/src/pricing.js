import { buildPoleGrid } from './layout.js';
import { pergolaPlural, pergolaT, pergolaValueLabel } from './i18n.js';
import { countHeaters, getTotalSpotlights } from './state.js';

const CURRENCY_PROFILES = Object.freeze({
  USD: {
    locale: 'en-US',
    rateFromUsd: 1,
    maximumFractionDigits: 0,
  },
  RON: {
    locale: 'ro-RO',
    // Demo conversion rate. Replace with a backend or live-rate service later.
    rateFromUsd: 4.6,
    maximumFractionDigits: 0,
  },
  EUR: {
    locale: 'de-DE',
    // Demo conversion rate. Replace with a backend or live-rate service later.
    rateFromUsd: 0.92,
    maximumFractionDigits: 0,
  },
});

const modelBase = {
  lite: 6800,
  comfort: 8900,
  premium: 11200,
};

const automationPrices = {
  manual: 0,
  remote: 850,
  'wall-switch': 650,
};

const sideRates = {
  none: 0,
  screen: 480,
  'motorized-screen': 790,
  'privacy-wall': 620,
  glass: 930,
};

const servicePrices = {
  transportation: 550,
  assembly: 1850,
  warranty: 450,
};

export function formatMoney(value, currency = 'USD', locale = null) {
  const profile = CURRENCY_PROFILES[currency] ?? CURRENCY_PROFILES.USD;
  const converted = Number(value) * profile.rateFromUsd;
  return new Intl.NumberFormat(locale || profile.locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: profile.maximumFractionDigits,
  }).format(Math.round(converted));
}

function countPoleMounts(poleMounts = {}, type) {
  return Object.values(poleMounts).reduce(
    (poleTotal, pole) => poleTotal + Object.values(pole ?? {}).reduce(
      (faceTotal, face) => faceTotal + (face?.[type] ? 1 : 0),
      0,
    ),
    0,
  );
}

export function calculatePrice(state) {
  const locale = state.locale ?? 'en-US';
  const area = (state.dimensions.width * state.dimensions.depth) / 1_000_000;
  const baseArea = 12;
  const areaSurcharge = Math.max(0, area - baseArea) * 420;
  const heightSurcharge = Math.max(0, state.dimensions.height - 2500) / 100 * 95;
  const installationSurcharge = state.installation === 'wall-mounted' ? 420 : 0;
  const drainagePrice = state.roof.drainage === 'integrated' ? 380 : 0;

  const lines = [
    {
      key: 'base',
      label: pergolaT(locale, 'pricing.baseStructure', { model: pergolaValueLabel(locale, 'model', state.model) }),
      value: modelBase[state.model] + areaSurcharge,
    },
    {
      key: 'height',
      label: pergolaT(locale, 'pricing.customHeight'),
      value: heightSurcharge,
    },
    {
      key: 'installation',
      label: pergolaT(locale, state.installation === 'wall-mounted' ? 'pricing.wallPreparation' : 'pricing.freestandingPreparation'),
      value: installationSurcharge,
    },
    {
      key: 'automation',
      label: automationLabel(state.automation, locale),
      value: automationPrices[state.automation],
    },
    {
      key: 'drainage',
      label: pergolaT(locale, state.roof.drainage === 'integrated' ? 'pricing.integratedDrainage' : 'pricing.standardDrainage'),
      value: drainagePrice,
    },
  ];

  const grid = buildPoleGrid(state.dimensions);
  grid.segments.forEach((segment) => {
    const config = state.sideSegments?.[segment.id];
    if (!config) return;
    const rate = sideRates[config.type] ?? 0;
    const value = rate * (segment.lengthMm / 1000);
    if (value > 0) {
      const position = segment.boundary
        ? pergolaT(locale, 'pricing.boundarySegment', { side: pergolaValueLabel(locale, 'side', segment.boundary) })
        : pergolaT(locale, segment.axis === 'horizontal' ? 'pricing.interiorHorizontal' : 'pricing.interiorVertical');
      lines.push({
        key: `side-${segment.id}`,
        label: pergolaT(locale, 'pricing.sideLine', { position, side: sideLabel(config.type, locale) }),
        value,
      });
    }
  });

  const heaterCount = countHeaters(state);
  const speakerCount = countPoleMounts(state.poleMounts, 'speaker');
  const outletCount = countPoleMounts(state.poleMounts, 'outlet');
  const rainEnabled = state.accessories.sensors.rain.enabled;
  const windEnabled = state.accessories.sensors.wind.enabled;
  const spotlightCount = getTotalSpotlights(state);

  const accessoryLines = [
    ['perimeterLed', pergolaT(locale, 'pricing.perimeterLed'), state.accessories.perimeterLed.enabled ? 590 : 0],
    ['spotlights', pergolaPlural(locale, 'pricing.spotlights', spotlightCount), spotlightCount * 85],
    ['heaters', pergolaPlural(locale, 'pricing.heaters', heaterCount), heaterCount * 620],
    ['rainSensor', pergolaT(locale, 'pricing.rainSensor'), rainEnabled ? 260 : 0],
    ['windSensor', pergolaT(locale, 'pricing.windSensor'), windEnabled ? 230 : 0],
    ['speakers', pergolaPlural(locale, 'pricing.speakers', speakerCount), speakerCount * 240],
    ['outlets', pergolaPlural(locale, 'pricing.outlets', outletCount), outletCount * 145],
  ];

  accessoryLines.forEach(([key, label, value]) => {
    if (value > 0) lines.push({ key, label, value });
  });

  Object.entries(state.services).forEach(([key, selected]) => {
    if (!selected) return;
    lines.push({
      key: `service-${key}`,
      label: serviceLabel(key, locale),
      value: servicePrices[key] ?? 0,
    });
  });

  const subtotal = lines.reduce((sum, line) => sum + line.value, 0);
  const tax = subtotal * 0.095;
  const total = subtotal + tax;

  return { lines, subtotal, tax, total, area, baseCurrency: 'USD' };
}

export function automationLabel(value, locale = 'en-US') {
  return pergolaT(locale, `pricing.automation.${value}`);
}

export function sideLabel(value, locale = 'en-US') {
  return pergolaT(locale, `pricing.side.${value}`);
}

export function serviceLabel(value, locale = 'en-US') {
  return pergolaT(locale, `pricing.service.${value}`);
}
