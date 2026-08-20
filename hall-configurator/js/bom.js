import { normalizeOpenings } from './openings.js?v=13';
import { hallOpeningLabel, hallT, hallValueLabel, hallWallLabel, resolveHallLocale } from './i18n.js?v=1';

const unit = (value, locale) => value === 'pcs' ? hallT(locale, 'bom.unit.pcs') : value;

export function buildBom(state, build, locale = resolveHallLocale()) {
  const { metrics, counts, profileSchedule } = build;
  const lines = [
    { name: hallT(locale, 'bom.line.primaryColumns', { profile: profileSchedule.columns }), unit: unit('pcs', locale), quantity: counts.primaryColumns, notes: hallT(locale, 'bom.note.portalFrames', { count: metrics.frameCount }) },
    { name: hallT(locale, 'bom.line.primaryRafters', { profile: profileSchedule.rafters }), unit: unit('pcs', locale), quantity: counts.rafters, notes: hallT(locale, 'bom.note.twoRafters') },
    { name: hallT(locale, 'bom.line.foundationPads'), unit: unit('pcs', locale), quantity: counts.footings, notes: hallT(locale, 'bom.note.onePad') },
    { name: hallT(locale, 'bom.line.foundationPedestals'), unit: unit('pcs', locale), quantity: counts.foundationPiers, notes: hallT(locale, 'bom.note.pedestals') },
    { name: hallT(locale, 'bom.line.borderMembers', { profile: profileSchedule.border }), unit: unit('pcs', locale), quantity: counts.borderMembers, notes: hallT(locale, 'bom.note.borderMembers') },
  ];

  if (state.secondaryStructure) {
    lines.push(
      { name: hallT(locale, 'bom.line.purlins', { profile: profileSchedule.purlins }), unit: 'm', quantity: (counts.roofPurlinLines * state.length).toFixed(1), notes: hallT(locale, 'bom.note.purlinLines', { count: counts.roofPurlinLines }) },
      { name: hallT(locale, 'bom.line.wallGirts'), unit: 'm', quantity: ((counts.wallGirtLines / 4) * (2 * state.length + 2 * state.width)).toFixed(1), notes: hallT(locale, 'bom.note.girtLines', { count: counts.wallGirtLines }) },
      { name: hallT(locale, 'bom.line.endPosts'), unit: unit('pcs', locale), quantity: counts.endPosts, notes: hallT(locale, 'bom.note.endPosts') },
      { name: hallT(locale, 'bom.line.windBracing', { profile: profileSchedule.braces }), unit: unit('pcs', locale), quantity: counts.wallBraces + counts.roofBraces, notes: hallT(locale, 'bom.note.windBracing', { walls: counts.wallBraces, roofs: counts.roofBraces }) },
      { name: hallT(locale, 'bom.line.compressionBars'), unit: unit('pcs', locale), quantity: counts.compressionBars, notes: hallT(locale, 'bom.note.compressionBars') },
      { name: hallT(locale, 'bom.line.stays', { profile: profileSchedule.stays }), unit: unit('pcs', locale), quantity: counts.stays, notes: hallT(locale, 'bom.note.stays') },
    );
  }

  lines.push(
    { name: hallT(locale, 'bom.line.connectionPlates'), unit: unit('pcs', locale), quantity: counts.connectionPlates, notes: hallT(locale, 'bom.note.cleats', { count: counts.purlinCleats }) },
    { name: hallT(locale, 'bom.line.anchorRods'), unit: unit('pcs', locale), quantity: counts.anchorRods, notes: hallT(locale, 'bom.note.anchorRods') },
    { name: hallT(locale, 'bom.line.fasteners'), unit: unit('pcs', locale), quantity: counts.fasteners, notes: hallT(locale, 'bom.note.fasteners') },
    { name: hallT(locale, 'bom.line.washers'), unit: unit('pcs', locale), quantity: counts.washers, notes: hallT(locale, 'bom.note.washers') },
    { name: hallT(locale, 'bom.line.roofCladding'), unit: 'm²', quantity: metrics.roofArea.toFixed(1), notes: hallValueLabel('claddingProfile', state.claddingProfile, locale) },
    { name: hallT(locale, 'bom.line.wallCladding'), unit: 'm²', quantity: metrics.netWallArea.toFixed(1), notes: hallT(locale, 'bom.note.netOpenings') },
  );

  if (state.slab) lines.push({ name: hallT(locale, 'bom.line.slab'), unit: 'm²', quantity: metrics.footprint.toFixed(1), notes: hallT(locale, 'bom.note.footprint') });
  normalizeOpenings(state).forEach((opening) => lines.push({
    name: hallT(locale, 'bom.line.openingAssembly', { type: hallOpeningLabel(opening.type, locale) }),
    unit: unit('pcs', locale), quantity: 1,
    notes: `${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m · ${hallWallLabel(opening.side, { locale })}`,
  }));
  if (state.roofSkylights) lines.push({ name: hallT(locale, 'bom.line.skylights'), unit: unit('pcs', locale), quantity: metrics.skylightCount, notes: hallT(locale, 'bom.note.skylights') });
  if (state.gutters) lines.push(
    { name: hallT(locale, 'bom.line.gutters'), unit: 'm', quantity: (state.length * 2).toFixed(1), notes: hallT(locale, 'bom.note.bothEaves') },
    { name: hallT(locale, 'bom.line.downpipes'), unit: unit('pcs', locale), quantity: 4, notes: hallT(locale, 'bom.note.downpipes') },
  );
  if (state.highBayLighting) lines.push({ name: hallT(locale, 'bom.line.luminaires'), unit: unit('pcs', locale), quantity: metrics.highBayFixtureCount, notes: hallT(locale, 'bom.note.luminaires') });
  if (state.fireSprinklers) lines.push(
    { name: hallT(locale, 'bom.line.sprinklerHeads'), unit: unit('pcs', locale), quantity: metrics.sprinklerHeadCount, notes: hallT(locale, 'bom.note.sprinklerHeads') },
    { name: hallT(locale, 'bom.line.sprinklerPipe'), unit: 'm', quantity: (state.length * 2 + state.width * Math.max(2, Math.ceil(state.length / 6))).toFixed(1), notes: hallT(locale, 'bom.note.sprinklerPipe') },
  );
  if (state.climateSystem !== 'none') lines.push({
    name: hallT(locale, state.climateSystem === 'frozen' || state.climateSystem === 'chilled' ? 'bom.line.refrigerationUnits' : 'bom.line.hvacUnits'),
    unit: unit('pcs', locale), quantity: metrics.refrigerationUnitCount || Math.max(1, Math.ceil(metrics.footprint / 280)), notes: hallValueLabel('climateSystem', state.climateSystem, locale),
  });

  return lines;
}

export function bomToCsv(lines, locale = resolveHallLocale()) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    [hallT(locale, 'csv.number'), hallT(locale, 'csv.component'), hallT(locale, 'csv.unit'), hallT(locale, 'csv.quantity'), hallT(locale, 'csv.notes')],
    ...lines.map((line, index) => [index + 1, line.name, line.unit, line.quantity, line.notes]),
  ].map((row) => row.map(escape).join(',')).join('\r\n');
}
