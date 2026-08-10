export function buildBom(state, build) {
  const { metrics, counts, profileSchedule } = build;
  const lines = [
    { name: `Primary columns · ${profileSchedule.columns}`, unit: 'pcs', quantity: counts.primaryColumns, notes: `${metrics.frameCount} portal frames` },
    { name: `Primary rafters · ${profileSchedule.rafters}`, unit: 'pcs', quantity: counts.rafters, notes: 'Two sloped rafters per frame' },
    { name: 'Concrete column footings', unit: 'pcs', quantity: counts.footings, notes: 'One footing per primary column' },
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
    { name: 'Anchor rods', unit: 'pcs', quantity: counts.anchorRods, notes: 'M27-style detailed visualization' },
    { name: 'Connection nuts / bolts', unit: 'pcs', quantity: counts.fasteners, notes: 'Detailed exploded-view fasteners' },
    { name: 'Roof cladding', unit: 'm²', quantity: metrics.roofArea.toFixed(1), notes: state.claddingProfile },
    { name: 'Wall cladding', unit: 'm²', quantity: metrics.netWallArea.toFixed(1), notes: 'Net of configured openings' },
  );

  if (state.slab) lines.push({ name: 'Concrete floor slab', unit: 'm²', quantity: metrics.footprint.toFixed(1), notes: 'Model footprint' });
  if (state.rollerDoor) lines.push({ name: 'Roller shutter door', unit: 'pcs', quantity: 1, notes: `${state.rollerDoorWidth.toFixed(2)} × ${state.rollerDoorHeight.toFixed(2)} m` });
  if (state.personnelDoor) lines.push({ name: 'Personnel door', unit: 'pcs', quantity: 1, notes: '1.00 × 2.10 m' });
  if (state.windows) lines.push({ name: 'Side windows', unit: 'pcs', quantity: 4, notes: 'Two per long wall' });

  return lines;
}

export function bomToCsv(lines) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [
    ['Nr.', 'Component', 'Unit', 'Quantity', 'Notes'],
    ...lines.map((line, index) => [index + 1, line.name, line.unit, line.quantity, line.notes]),
  ].map((row) => row.map(escape).join(',')).join('\r\n');
}
