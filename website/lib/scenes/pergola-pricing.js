import { buildPoleGrid } from './pergola-layout.js';

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

function sideLengthMeters(side, dimensions) {
  return (side === 'front' || side === 'back')
    ? dimensions.width / 1000
    : dimensions.depth / 1000;
}

function countSelected(record = {}) {
  return Object.values(record).filter(Boolean).length;
}

function countOutlets(outlets = {}) {
  return Object.values(outlets).reduce(
    (total, pole) => total + Object.values(pole ?? {}).filter(Boolean).length,
    0,
  );
}

export function calculatePrice(state) {
  const area = (state.dimensions.width * state.dimensions.depth) / 1_000_000;
  const baseArea = 12;
  const areaSurcharge = Math.max(0, area - baseArea) * 420;
  const heightSurcharge = Math.max(0, state.dimensions.height - 2500) / 100 * 95;
  const installationSurcharge = state.installation === 'wall-mounted' ? 420 : 0;
  const drainagePrice = state.roof.drainage === 'integrated' ? 380 : 0;

  const lines = [
    {
      key: 'base',
      label: `${capitalize(state.model)} pergola structure`,
      value: modelBase[state.model] + areaSurcharge,
    },
    {
      key: 'height',
      label: 'Custom height allowance',
      value: heightSurcharge,
    },
    {
      key: 'installation',
      label: state.installation === 'wall-mounted' ? 'Wall-mounted preparation' : 'Freestanding preparation',
      value: installationSurcharge,
    },
    {
      key: 'automation',
      label: automationLabel(state.automation),
      value: automationPrices[state.automation],
    },
    {
      key: 'drainage',
      label: state.roof.drainage === 'integrated' ? 'Integrated drainage' : 'Standard drainage',
      value: drainagePrice,
    },
  ];

  if (state.sideSegments) {
    buildPoleGrid(state.dimensions).segments.forEach((segment) => {
      const config = state.sideSegments[segment.id];
      const rate = sideRates[config?.type] ?? 0;
      const value = rate * (segment.lengthMm / 1000);
      if (value > 0) lines.push({ key: `segment-${segment.id}`, label: sideLabel(config.type), value });
    });
  } else {
    Object.entries(state.sides).forEach(([side, config]) => {
      const rate = sideRates[config.type] ?? 0;
      const value = rate * sideLengthMeters(side, state.dimensions);
      if (value > 0) lines.push({ key: `side-${side}`, label: `${capitalize(side)}: ${sideLabel(config.type)}`, value });
    });
  }

  const heaterCount = countSelected(state.accessories.heaters);
  const speakerCount = countSelected(state.accessories.speakers);
  const outletCount = countOutlets(state.accessories.outlets);
  const rainEnabled = state.accessories.sensors.rain.enabled;
  const windEnabled = state.accessories.sensors.wind.enabled;

  const accessoryLines = [
    ['perimeterLed', 'Perimeter LED strip', state.accessories.perimeterLed.enabled ? 590 : 0],
    ['spotlights', `${state.accessories.spotlights} integrated spotlights`, state.accessories.spotlights * 85],
    ['heaters', `${heaterCount} infrared heater${heaterCount === 1 ? '' : 's'}`, heaterCount * 620],
    ['rainSensor', 'Rain sensor', rainEnabled ? 260 : 0],
    ['windSensor', 'Wind sensor', windEnabled ? 230 : 0],
    ['speakers', `${speakerCount} outdoor speaker${speakerCount === 1 ? '' : 's'}`, speakerCount * 240],
    ['outlets', `${outletCount} electrical outlet${outletCount === 1 ? '' : 's'}`, outletCount * 145],
  ];

  accessoryLines.forEach(([key, label, value]) => {
    if (value > 0) lines.push({ key, label, value });
  });

  Object.entries(state.services).forEach(([key, selected]) => {
    if (!selected) return;
    lines.push({
      key: `service-${key}`,
      label: serviceLabel(key),
      value: servicePrices[key] ?? 0,
    });
  });

  const subtotal = lines.reduce((sum, line) => sum + line.value, 0);
  const tax = subtotal * 0.095;
  const total = subtotal + tax;

  return { lines, subtotal, tax, total, area, baseCurrency: 'USD' };
}

export function automationLabel(value) {
  return {
    manual: 'Manual hand-crank control',
    remote: 'Motorized remote control',
    'wall-switch': 'Motorized wall-switch control',
  }[value] ?? value;
}

export function sideLabel(value) {
  return {
    none: 'Open side',
    screen: 'Pull-down screen',
    'motorized-screen': 'Motorized screen',
    'privacy-wall': 'Privacy wall',
    glass: 'Glass sliding doors',
  }[value] ?? value;
}

export function serviceLabel(value) {
  return {
    transportation: 'Transportation',
    assembly: 'Assembly',
    warranty: '5 Year Warranty',
  }[value] ?? value;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
