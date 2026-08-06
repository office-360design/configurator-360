import { normalizeCurrency } from './preferences.js?v=1';

const VAT_RATE = 0.19;
const PANEL_EFFECTIVE_AREA = 0.47;
const PANEL_WASTE_FACTOR = 1.05;
const MEMBRANE_WASTE_FACTOR = 1.20;
const MEMBRANE_ROLL_AREA = 75;
const RIDGE_EFFECTIVE_LENGTH = 0.37;
const FLASHING_LENGTH = 1.4;
const GUTTER_LENGTH = 3;

const unitPrices = {
  tile: 40.29,
  screws: 100.39,
  membrane: 0.10,
  ridge: 27.31,
  ridgeCap: 13.83,
  gableTrim: 44.52,
  sideFlashing: 38.01,
  eavesApron: 36.71,
  flatSheet: 70.64,
  gutter: 93.12,
  gutterJoint: 10.25,
  gutterCap: 6.86,
  hanger: 9.85,
  gutterOutlet: 18.61,
  downpipeElbow: 19.55,
  downpipeExtension: 28.40,
  downpipe: 85.17,
  downpipeBracket: 6.42,
  dischargeElbow: 25.12,
};

const productNames = {
  generic: 'Țiglă metalică – preset generic',
  roca: 'Țiglă metalică granulată Lindab Roca Rustica',
  teclado: 'Țiglă metalică granulată Lindab Roca Teclado',
};

const clampQuantity = (value) => Math.max(0, Math.ceil(value - 1e-9));

function roofLengths(state) {
  const { length, depth, pitch, overhang, roofType } = state;
  const slope = Math.tan((pitch * Math.PI) / 180);
  const roofLength = length + 2 * overhang;
  const roofDepth = depth + 2 * overhang;
  const halfSlopeLength = Math.hypot(depth / 2 + overhang, slope * (depth / 2 + overhang));

  if (roofType === 'hip') {
    const longSide = Math.max(roofLength, roofDepth);
    const shortSide = Math.min(roofLength, roofDepth);
    const ridgeHorizontal = Math.max(0, longSide - shortSide);
    const hipPlan = shortSide / Math.sqrt(2);
    const hipRise = slope * shortSide / 2;
    const hipLength = Math.hypot(hipPlan, hipRise);
    return {
      ridge: ridgeHorizontal + 4 * hipLength,
      gable: 0,
      eaves: 2 * (roofLength + roofDepth),
      gutterRuns: 4,
      sideFlashing: 0,
      valley: 0,
      ridgeCaps: 4,
    };
  }

  if (roofType === 'shed') {
    const slopedSide = Math.hypot(roofDepth, slope * roofDepth);
    return {
      ridge: roofLength,
      gable: 2 * slopedSide,
      eaves: roofLength,
      gutterRuns: 1,
      sideFlashing: 2 * slopedSide,
      valley: 0,
      ridgeCaps: 2,
    };
  }

  if (roofType === 'lshape') {
    const mainDepth = depth * 0.56;
    const wingDepth = length * 0.42;
    const mainHalfSlope = Math.hypot(mainDepth / 2 + overhang, slope * (mainDepth / 2 + overhang));
    const wingHalfSlope = Math.hypot(wingDepth / 2 + overhang, slope * (wingDepth / 2 + overhang));
    const mainRidge = length + 2 * overhang;
    const wingRidge = depth + 2 * overhang;
    const overlapAllowance = Math.min(mainDepth, wingDepth) * 0.55;
    const valleyLength = 2 * Math.hypot(Math.min(mainDepth, wingDepth) / 2, slope * Math.min(mainDepth, wingDepth) / 2);
    return {
      ridge: Math.max(0, mainRidge + wingRidge - overlapAllowance),
      gable: 4 * mainHalfSlope + 4 * wingHalfSlope,
      eaves: 2 * (length + depth + 4 * overhang) - overlapAllowance,
      gutterRuns: 4,
      sideFlashing: valleyLength,
      valley: valleyLength,
      ridgeCaps: 4,
    };
  }

  if (roofType === 'dormer') {
    const dormerWidth = Math.min(length * 0.34, 3.2);
    const dormerDepth = Math.min(depth * 0.24, 2.3);
    const dormerPitch = Math.max(pitch, 24);
    const dormerSlope = Math.tan((dormerPitch * Math.PI) / 180);
    const dormerHalfSlope = Math.hypot(dormerWidth / 2 + overhang * 0.25, dormerSlope * (dormerWidth / 2 + overhang * 0.25));
    const dormerValley = 2 * Math.hypot(dormerDepth, dormerHalfSlope * 0.45);
    return {
      ridge: roofLength + dormerDepth,
      gable: 4 * halfSlopeLength + 2 * dormerHalfSlope,
      eaves: 2 * roofLength + dormerWidth,
      gutterRuns: 2,
      sideFlashing: dormerValley,
      valley: dormerValley,
      ridgeCaps: 4,
    };
  }

  return {
    ridge: roofLength,
    gable: 4 * halfSlopeLength,
    eaves: 2 * roofLength,
    gutterRuns: 2,
    sideFlashing: 0,
    valley: 0,
    ridgeCaps: 2,
  };
}

function addLine(lines, key, name, unit, quantity, unitPrice, note = '') {
  if (quantity <= 0) return;
  const value = quantity * unitPrice;
  lines.push({
    key,
    name,
    unit,
    quantity,
    unitPrice,
    value,
    vat: value * VAT_RATE,
    note,
  });
}

export function calculateBom(state, metrics) {
  if (state.roofType === 'custom') {
    return {
      lines: [],
      subtotal: 0,
      vat: 0,
      total: 0,
      vatRate: VAT_RATE,
      assumptions: {
        roofArea: 0,
        ridgeLength: 0,
        eavesLength: 0,
        gableLength: 0,
        valleyLength: 0,
        panelEffectiveArea: PANEL_EFFECTIVE_AREA,
        wastePercent: (PANEL_WASTE_FACTOR - 1) * 100,
      },
      currency: normalizeCurrency(state.currency),
      exchangeRate: Number(state.currencyRate) || 1,
      exchangeRateDate: state.currencyRateDate || null,
      exchangeRateSource: state.currencyRateSource || 'reference currency',
      exchangeRateIsFallback: Boolean(state.currencyRateIsFallback),
    };
  }

  const lengths = roofLengths(state);
  const roofArea = Math.max(0, metrics.roofArea);
  const tileQuantity = clampQuantity((roofArea * PANEL_WASTE_FACTOR) / PANEL_EFFECTIVE_AREA);
  const screwBoxes = clampQuantity(tileQuantity / 44);
  const membraneRolls = clampQuantity((roofArea * MEMBRANE_WASTE_FACTOR) / MEMBRANE_ROLL_AREA);
  const ridgePieces = clampQuantity(lengths.ridge / RIDGE_EFFECTIVE_LENGTH);
  const gableTrimPieces = clampQuantity((lengths.gable / FLASHING_LENGTH) * 1.10);
  const sideFlashingPieces = clampQuantity((lengths.sideFlashing / FLASHING_LENGTH) * 1.10);
  const eavesApronPieces = clampQuantity((lengths.eaves / FLASHING_LENGTH) * 1.10);
  const flatSheetPieces = clampQuantity(roofArea * 0.10 + lengths.valley / FLASHING_LENGTH);
  const gutterPieces = clampQuantity(lengths.eaves / GUTTER_LENGTH);
  const gutterJoints = Math.max(0, gutterPieces - lengths.gutterRuns);
  const gutterCaps = lengths.gutterRuns * 2;
  const hangers = clampQuantity(lengths.eaves / 0.55);
  const downspouts = Math.max(1, clampQuantity(lengths.eaves / 5));
  const downpipePieces = downspouts * Math.max(1, clampQuantity(state.wallHeight / 3));
  const downpipeBrackets = downspouts * Math.max(1, clampQuantity(state.wallHeight / 1.8));

  const lines = [];
  addLine(lines, 'tile', productNames[state.covering] ?? productNames.roca, 'buc.', tileQuantity, unitPrices.tile, 'Preț de referință POC; 5% pierderi incluse');
  addLine(lines, 'screws', 'Șurub autofiletant Lindab pt. lemn', 'cut.', screwBoxes, unitPrices.screws);
  addLine(lines, 'membrane', 'Folie anticondens LAF75', 'rolă', membraneRolls, unitPrices.membrane, '20% suprapuneri incluse');
  addLine(lines, 'ridge', state.roofType === 'shed' ? 'Coamă / închidere superioară' : 'Coamă rotundă', 'buc.', ridgePieces, unitPrices.ridge);
  addLine(lines, 'ridge-cap', 'Capac coamă rotundă', 'buc.', lengths.ridgeCaps, unitPrices.ridgeCap);
  addLine(lines, 'gable-trim', 'Fronton rectangular', 'buc.', gableTrimPieces, unitPrices.gableTrim);
  addLine(lines, 'side-flashing', 'Racord lateral / dolie', 'buc.', sideFlashingPieces, unitPrices.sideFlashing);
  addLine(lines, 'eaves-apron', 'Șorț streașină Lindab Roca', 'buc.', eavesApronPieces, unitPrices.eavesApron);
  addLine(lines, 'flat-sheet', 'Tablă plană granulată', 'buc.', flatSheetPieces, unitPrices.flatSheet);
  addLine(lines, 'gutter', 'Jgheab', 'buc.', gutterPieces, unitPrices.gutter);
  addLine(lines, 'gutter-joint', 'Element îmbinare jgheab', 'buc.', gutterJoints, unitPrices.gutterJoint);
  addLine(lines, 'gutter-cap', 'Capac jgheab', 'buc.', gutterCaps, unitPrices.gutterCap);
  addLine(lines, 'hanger', 'Cârlig', 'buc.', hangers, unitPrices.hanger);
  addLine(lines, 'gutter-outlet', 'Racord jgheab-burlan', 'buc.', downspouts, unitPrices.gutterOutlet);
  addLine(lines, 'downpipe-elbow', 'Cot burlan', 'buc.', downspouts * 2, unitPrices.downpipeElbow);
  addLine(lines, 'downpipe-extension', 'Prelungire burlan 1 m', 'buc.', downspouts, unitPrices.downpipeExtension);
  addLine(lines, 'downpipe', 'Burlan', 'buc.', downpipePieces, unitPrices.downpipe);
  addLine(lines, 'downpipe-bracket', 'Brățară burlan', 'buc.', downpipeBrackets, unitPrices.downpipeBracket);
  addLine(lines, 'discharge-elbow', 'Cot de evacuare', 'buc.', downspouts, unitPrices.dischargeElbow);

  const currency = normalizeCurrency(state.currency);
  const exchangeRate = currency === 'RON' ? 1 : Math.max(0, Number(state.currencyRate) || 1);
  const convertedLines = lines.map((line) => ({
    ...line,
    baseUnitPrice: line.unitPrice,
    baseValue: line.value,
    baseVat: line.vat,
    unitPrice: line.unitPrice * exchangeRate,
    value: line.value * exchangeRate,
    vat: line.vat * exchangeRate,
  }));
  const subtotal = convertedLines.reduce((sum, line) => sum + line.value, 0);
  const vat = subtotal * VAT_RATE;
  return {
    lines: convertedLines,
    subtotal,
    vat,
    total: subtotal + vat,
    vatRate: VAT_RATE,
    currency,
    exchangeRate,
    exchangeRateDate: state.currencyRateDate || null,
    exchangeRateSource: state.currencyRateSource || 'reference currency',
    exchangeRateIsFallback: Boolean(state.currencyRateIsFallback),
    assumptions: {
      roofArea,
      ridgeLength: lengths.ridge,
      eavesLength: lengths.eaves,
      gableLength: lengths.gable,
      valleyLength: lengths.valley,
      panelEffectiveArea: PANEL_EFFECTIVE_AREA,
      wastePercent: (PANEL_WASTE_FACTOR - 1) * 100,
    },
  };
}

export function bomToCsv(bom) {
  const currency = bom.currency || 'RON';
  const rows = [
    ['Nr.', 'Denumire', 'U.M.', 'Cant.', `Preț unitar fără TVA (${currency})`, `Valoare fără TVA (${currency})`, `TVA (${currency})`],
    ...bom.lines.map((line, index) => [
      index + 1,
      line.name,
      line.unit,
      line.quantity,
      line.unitPrice.toFixed(2),
      line.value.toFixed(2),
      line.vat.toFixed(2),
    ]),
    [],
    ['', 'Total fără TVA', '', '', '', bom.subtotal.toFixed(2), ''],
    ['', `TVA ${Math.round(bom.vatRate * 100)}%`, '', '', '', '', bom.vat.toFixed(2)],
    ['', 'Total plată', '', '', '', '', bom.total.toFixed(2)],
    [],
    ['', 'Monedă afișată', '', '', currency, '', ''],
    ['', 'Rată față de RON', '', '', bom.exchangeRate.toFixed(6), '', ''],
    ['', 'Sursă rată', '', '', bom.exchangeRateSource || '', bom.exchangeRateDate || '', ''],
  ];

  return rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '');
    return `"${value.replaceAll('\"', '\"\"')}"`;
  }).join(',')).join('\n');
}
