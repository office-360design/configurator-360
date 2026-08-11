import { normalizeOpenings, openingType, wallLabel } from './openings.js?v=10';

export function buildBom(state, build) {
  const { metrics, counts, profileSchedule } = build;
  const lines = [
    { name: `Primary columns · ${profileSchedule.columns}`, unit: 'pcs', quantity: counts.primaryColumns, notes: `${metrics.frameCount} portal frames` },
    { name: `Primary rafters · ${profileSchedule.rafters}`, unit: 'pcs', quantity: counts.rafters, notes: 'Two sloped rafters per frame' },
    { name: 'Concrete foundation pads', unit: 'pcs', quantity: counts.footings, notes: 'One foundation pad per primary column' },
    { name: 'Concrete foundation pedestals', unit: 'pcs', quantity: counts.foundationPiers, notes: 'Raised anchor-cage pedestals / pylons' },
    { name: `RHS border / longitudinal members · ${profileSchedule.border}`, unit: 'pcs', quantity: counts.borderMembers, notes: 'Eave, ridge and gable border members' },
  ];

  if (state.secondaryStructure) {
    lines.push(
      { name: `Roof purlin lines · ${profileSchedule.purlins}`, unit: 'm', quantity: (counts.roofPurlinLines * state.length).toFixed(1), notes: `${counts.roofPurlinLines} longitudinal Z-profile lines` },
      { name: 'Wall girts', unit: 'm', quantity: ((counts.wallGirtLines / 4) * (2 * state.length + 2 * state.width)).toFixed(1), notes: `${counts.wallGirtLines} girt lines` },
      { name: 'End-wall support posts · RHS150×50', unit: 'pcs', quantity: counts.endPosts, notes: 'Gable-wall secondary posts' },
      { name: `Wind bracing · ${profileSchedule.braces}`, unit: 'pcs', quantity: counts.wallBraces + counts.roofBraces, notes: `${counts.wallBraces} wall + ${counts.roofBraces} roof braces` },
      { name: 'Compression bars · RHS80×4', unit: 'pcs', quantity: counts.compressionBars, notes: 'Braced bay compression members' },
      { name: `Purlin / frame stays · ${profileSchedule.stays}`, unit: 'pcs', quantity: counts.stays, notes: 'Representative angle stays' },
    );
  }

  lines.push(
    { name: 'Connection / gusset / base plates', unit: 'pcs', quantity: counts.connectionPlates, notes: `${counts.purlinCleats} shown as purlin cleats` },
    { name: 'Anchor rods · D27', unit: 'pcs', quantity: counts.anchorRods, notes: 'Four per base plate in the visualized anchor cage' },
    { name: 'Connection nuts / bolts', unit: 'pcs', quantity: counts.fasteners, notes: 'M20/M24/M12-style detailed exploded-view fasteners' },
    { name: 'Structural washers', unit: 'pcs', quantity: counts.washers, notes: 'Anchor and connection washer visualization' },
    { name: 'Roof cladding', unit: 'm²', quantity: metrics.roofArea.toFixed(1), notes: state.claddingProfile },
    { name: 'Wall cladding', unit: 'm²', quantity: metrics.netWallArea.toFixed(1), notes: 'Net of configured openings' },
  );

  if (state.slab) lines.push({ name: 'Concrete floor slab', unit: 'm²', quantity: metrics.footprint.toFixed(1), notes: 'Model footprint' });
  normalizeOpenings(state).forEach((opening) => {
    lines.push({
      name: `${openingType(opening.type).label} assembly`,
      unit: 'pcs',
      quantity: 1,
      notes: `${opening.width.toFixed(2)} × ${opening.height.toFixed(2)} m · ${wallLabel(opening.side)}`,
    });
  });
  if (state.roofSkylights) lines.push({ name: 'Roof skylight modules', unit: 'pcs', quantity: metrics.skylightCount, notes: 'Translucent roof daylight modules' });
  if (state.gutters) lines.push({ name: 'Eave gutters', unit: 'm', quantity: (state.length * 2).toFixed(1), notes: 'Both eaves' }, { name: 'Downpipes', unit: 'pcs', quantity: 4, notes: 'Corner rainwater downpipes' });
  if (state.highBayLighting) lines.push({ name: 'High-bay LED luminaires', unit: 'pcs', quantity: metrics.highBayFixtureCount, notes: 'Suspended internal fixtures' });
  if (state.fireSprinklers) lines.push({ name: 'Sprinkler heads', unit: 'pcs', quantity: metrics.sprinklerHeadCount, notes: 'Indicative ceiling grid' }, { name: 'Sprinkler main / branch pipework', unit: 'm', quantity: (state.length * 2 + state.width * Math.max(2, Math.ceil(state.length / 6))).toFixed(1), notes: 'Visualized internal pipe network' });
  if (state.climateSystem !== 'none') lines.push({ name: state.climateSystem === 'frozen' || state.climateSystem === 'chilled' ? 'Refrigeration condensing units' : 'HVAC condenser units', unit: 'pcs', quantity: metrics.refrigerationUnitCount || Math.max(1, Math.ceil(metrics.footprint / 280)), notes: state.climateSystem });

  return lines;
}

export function bomToCsv(lines) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    ['Nr.', 'Component', 'Unit', 'Quantity', 'Notes'],
    ...lines.map((line, index) => [index + 1, line.name, line.unit, line.quantity, line.notes]),
  ].map((row) => row.map(escape).join(',')).join('\r\n');
}
