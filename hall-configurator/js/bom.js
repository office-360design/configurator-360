export function buildBom(state, build) {
  const { metrics, counts } = build;
  const lines = [
    { name: 'Portal-frame columns', unit: 'pcs', quantity: counts.primaryColumns, notes: `${build.metrics.frameCount} portal frames` },
    { name: 'Portal-frame rafters', unit: 'pcs', quantity: counts.rafters, notes: 'Two sloped rafters per frame' },
    { name: 'Concrete column footings', unit: 'pcs', quantity: counts.footings, notes: 'Visualization footings' },
    { name: 'Longitudinal primary ties', unit: 'm', quantity: (state.length * 3).toFixed(1), notes: 'Two eave beams + ridge tie' },
  ];

  if (state.secondaryStructure) {
    lines.push(
      { name: 'Roof purlin lines', unit: 'm', quantity: (counts.roofPurlinLines * state.length).toFixed(1), notes: `${counts.roofPurlinLines} continuous lines` },
      { name: 'Wall girt lines', unit: 'm', quantity: ((counts.wallGirtLines / 2) * (state.length + state.width)).toFixed(1), notes: `${counts.wallGirtLines} wall girt lines` },
      { name: 'End-wall support posts', unit: 'pcs', quantity: counts.endPosts, notes: 'Secondary gable-wall posts' },
    );
  }

  lines.push(
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
