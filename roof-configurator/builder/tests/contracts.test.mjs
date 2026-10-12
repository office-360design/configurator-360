import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  newPart,
  duplicatePart,
  validateProject,
  ProjectHistory,
  ProjectStorage,
  clone,
} from "../project.js";
import {
  resolveProject,
  shapePoints,
  setEdgeLength,
  setDiagonal,
  attachMeasured,
  plannerLayout,
  area,
  changeDownhill,
  openingCorners,
  nextDiagonalCorner,
  extendSection,
} from "../geometry.js";
import {
  planFace,
  createSheetReport,
  setPartition,
  reconcileSettings,
  faceFingerprint,
  recommendSplit,
  reportCsv,
} from "../planner.js";
import { getProduct, PRODUCTS, profileRelief } from "../catalog.js";
import { parseNumber, translator, unitsFor } from "../i18n.js";
import { presetRoofLayout } from "../../js/presetLayout.js";
import { planRoofSheets, sheetProfiles } from "../../js/sheetPlanner.js";
import { copySnapshot } from "../capture.js";
import { addPaperSketch } from "../examples.js";
import { validateProjectFile } from "../files.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, a + " ≠ " + b);
function fixture(kind = "measured", options = {}) {
  const project = createProject(),
    part = newPart(project, kind, { confirmed: true, ...options });
  project.parts.push(part);
  return { project, part, face: resolveProject(project).faces[0] };
}

test("surface coordinates remain true lengths at every supplied pitch and board position", () => {
  for (const pitch of [null, 0, 20, 45, 60]) {
    const { project, part, face } = fixture("measured", {
      width: 6,
      depth: 4,
      pitch,
    });
    near(face.area, 24);
    const plan = planFace(face);
    near(plan.netArea, 24);
    part.x = 120;
    part.z = -30;
    part.rotation = 38;
    const next = resolveProject(project).faces[0];
    assert.equal(faceFingerprint(next), faceFingerprint(face));
    near(planFace(next).netArea, 24);
    if (pitch !== null) {
      const a = face.toWorld({ x: 0, y: 0 }),
        b = face.toWorld({ x: 0, y: 4 });
      near(Math.hypot(a.x - b.x, a.y - b.y, a.h - b.h), 4);
    }
  }
});
test("missing pitch produces local incomplete assembly without artificial flat-roof warnings", () => {
  const { face } = fixture();
  const plan = planFace(face);
  assert.ok(plan.warnings.includes("pitchMissing"));
  assert.equal(face.assembled, false);
  assert.ok(!plan.warnings.some((w) => /Flat surface|Pitch 0/.test(w)));
  assert.equal(plan.confirmed, false);
});
test("common shape parameters preserve inspection area", () => {
  const triangle = fixture("measured", {
    shape: "triangle",
    width: 6.1,
    depth: 3,
    offset: 2.8,
  }).face;
  near(triangle.area, 9.15);
  const trap = fixture("measured", {
    shape: "trapezoid",
    width: 13.6,
    top: 8.1,
    depth: 3.5,
    offset: 2.75,
  }).face;
  near(trap.area, ((13.6 + 8.1) / 2) * 3.5);
  near(
    planFace(trap).pieces.reduce((n, p) => n + p.netArea, 0),
    trap.area,
  );
});
test("all named coverings have model relief and product-specific installation directions", () => {
  for (const p of PRODUCTS) {
    assert.ok(Number.isFinite(profileRelief(p.id, 0.4, 0.7)));
    const { face } = fixture("measured", { productId: p.id });
    const plan = planFace(face);
    assert.ok(plan.pieces.length);
    assert.equal(plan.confirmed, false);
    if (p.id === "simetric") {
      near(planFace(face, { direction: "right" }).netArea, face.area);
    } else
      assert.throws(
        () => planFace(face, { direction: "right" }),
        /directionInvalid/,
      );
    assert.ok(p.installation.sideSource.endsWith("/520"));
  }
});
test("legacy profile definitions remain unchanged", () => {
  assert.deepEqual(getProduct("antic").profile, sheetProfiles.antic);
  assert.deepEqual(getProduct("clasic").profile, sheetProfiles.clasic);
  assert.equal(sheetProfiles.clasic.module, 365);
});
test("adapter equals legacy rectangle lengths, areas and grouping", () => {
  const { face } = fixture("measured", { width: 6, depth: 4 });
  const adapted = planFace(face),
    layout = {
      version: 1,
      vertices: [
        { x: 0, z: 0, h: 0 },
        { x: 6, z: 0, h: 0 },
        { x: 6, z: 4, h: 0 },
        { x: 0, z: 4, h: 0 },
      ],
      faces: [[0, 1, 2, 3]],
      boundary: [0, 1, 2, 3],
    };
  const reference = planRoofSheets(layout, sheetProfiles.antic);
  near(adapted.netArea, reference.totals.netArea);
  near(adapted.stockArea, reference.totals.stockArea);
  assert.deepEqual(
    adapted.groups.map((g) => [g.modules, g.length, g.count]),
    reference.groups.map((g) => [g.modules, g.length, g.count]),
  );
});
test("rectangular openings remove exactly their area from measured and assembled plans", () => {
  for (const kind of ["measured", "gable", "hip", "shed"]) {
    const { project, part, face } = fixture(kind);
    const before = resolveProject(project).area;
    part.openings.push({
      id: "o",
      type: "window",
      faceId: face.id,
      x: face.bounds.minX + face.bounds.width / 2,
      y: face.bounds.minY + face.bounds.height / 2,
      width: 1,
      length: 1,
    });
    validateProject(project);
    const next = resolveProject(project),
      report = createSheetReport(project, next);
    near(next.area, before - 1);
    assert.deepEqual(report.errors, []);
    near(report.totals.area, next.area);
    near(
      report.plans
        .flatMap((p) => p.pieces)
        .reduce((sum, p) => sum + p.netArea, 0),
      next.area,
    );
  }
});
test("openings that cross a notch or overlap another opening are rejected without history loss", () => {
  const { project, part, face } = fixture("measured", {
    shape: "custom",
    vertices: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 5, y: 4 },
      { x: 5, y: 6 },
      { x: 0, y: 6 },
    ],
  });
  const history = new ProjectHistory(project);
  part.openings.push({
    id: "bad",
    type: "window",
    faceId: face.id,
    x: 5,
    y: 4,
    width: 2,
    length: 2,
  });
  assert.throws(() => history.commit(project), /openingOutside/);
  assert.equal(history.project.parts[0].openings.length, 0);
  assert.equal(history.undoStack.length, 0);
});
test("upper envelope supports unequal-pitch wings, ridges, valleys and disconnected faces", () => {
  const project = createProject();
  project.parts.push(
    newPart(project, "gable", { width: 10, depth: 7, pitch: 30 }),
  );
  project.parts.push(
    newPart(project, "gable", {
      x: 3,
      z: 4,
      width: 8,
      depth: 5,
      rotation: 90,
      pitch: 40,
    }),
  );
  project.parts.push(
    newPart(project, "hip", {
      x: 10,
      z: 0,
      width: 6,
      depth: 5,
      pitch: 27,
      eave: -0.4,
    }),
  );
  project.parts.push(
    newPart(project, "measured", {
      x: 16,
      z: 9,
      width: 6.1,
      depth: 3,
      shape: "triangle",
      offset: 2.8,
    }),
  );
  const resolved = resolveProject(project);
  assert.equal(resolved.faces.length, 9);
  assert.ok(resolved.folds.some((f) => f.type === "valley"));
  assert.ok(resolved.folds.some((f) => f.type === "ridge"));
  assert.ok(resolved.unassembled.length === 1);
  const report = createSheetReport(project, resolved);
  assert.deepEqual(report.errors, []);
  near(report.totals.area, resolved.area);
});
test("dormer helpers retain host IDs and use the same resolved faces for planning", () => {
  const { project, part, face } = fixture("gable", { width: 10, depth: 8 });
  part.dormers.push({
    id: "d",
    type: "dormer",
    faceIndex: 0,
    x: 5,
    y: 1.2,
    width: 1.8,
    length: 1.2,
    wallRise: 0.6,
    pitch: 30,
  });
  const next = resolveProject(project);
  assert.ok(next.faces.some((f) => f.id === face.id));
  assert.deepEqual(
    next.faces.map((f) => f.label),
    ["A.1", "A.2", "A.D1", "A.D2"],
  );
  const report = createSheetReport(project, next);
  assert.deepEqual(report.errors, []);
  near(report.totals.area, next.area);
});
test("incompatible confirmed measurements cannot be silently changed", () => {
  const { project, part } = fixture("measured", { width: 6, depth: 4 });
  part.constraints = { 0: 6, 1: 4 };
  const history = new ProjectHistory(project);
  part.vertices = shapePoints(part);
  part.vertices[1].x = 7;
  assert.throws(() => history.commit(project), /lockedMeasurement/);
  assert.equal(history.project.parts[0].width, 6);
  assert.equal(history.undoStack.length, 0);
});
test("diagonal determines a four-corner shape while preserving every confirmed side", () => {
  const { part } = fixture("measured", { width: 6, depth: 4 });
  part.constraints = { 0: 6, 1: 4, 2: 6, 3: 4 };
  setDiagonal(part, 7);
  const points = shapePoints(part);
  near(Math.hypot(points[0].x - points[2].x, points[0].y - points[2].y), 7);
  for (let i = 0; i < 4; i++)
    near(
      Math.hypot(
        points[i].x - points[(i + 1) % 4].x,
        points[i].y - points[(i + 1) % 4].y,
      ),
      part.constraints[i],
    );
  assert.throws(
    () => setDiagonal(part, 20),
    /invalidOutline|lockedMeasurement/,
  );
});
test("duplication and mirroring produce new IDs without changing measurements or products", () => {
  const { project, part } = fixture("measured", {
    shape: "triangle",
    width: 8,
    depth: 4,
    offset: 2,
    productId: "simetric",
  });
  const mirrored = duplicatePart(project, part.id, true);
  near(resolveProject(project).faces[1].area, 16);
  assert.equal(mirrored.offset, 6);
  assert.notEqual(mirrored.id, part.id);
  assert.equal(mirrored.productId, part.productId);
  project.parts.reverse();
  assert.deepEqual(
    resolveProject(project).faces.map((f) => f.label),
    ["B", "A"],
  );
});
test("measured connections use a rigid 3D placement without stretching either face", () => {
  const { project, part } = fixture("measured", {
    width: 6,
    depth: 4,
    pitch: 30,
  });
  const second = newPart(project, "measured", {
    width: 6,
    depth: 4,
    pitch: 40,
  });
  project.parts.push(second);
  attachMeasured(project, part.id, 0, second.id, 0);
  const [a, b] = resolveProject(project).faces;
  const u = a.toWorld(a.originalToLocal(a.original[0])),
    v = b.toWorld(b.originalToLocal(b.original[1]));
  near(Math.hypot(u.x - v.x, u.h - v.h, u.y - v.y), 0);
  near(a.area, 24);
  near(b.area, 24);
  near(b.normal.y, Math.cos((40 * Math.PI) / 180));
  assert.ok(b.assembled);
  assert.equal(project.connections.length, 1);
});
test("impossible measured connections fail locally and leave the old project valid", () => {
  const { project, part } = fixture("measured");
  const b = newPart(project, "measured", { width: 7 });
  project.parts.push(b);
  const history = new ProjectHistory(project);
  assert.throws(
    () => attachMeasured(project, part.id, 0, b.id, 0),
    /edgeLengthMismatch/,
  );
  assert.deepEqual(history.project, validateProject(history.project));
});
test("manual 11+11 and 7+7+8 splits preserve 22 modules and add an allowance per piece", () => {
  for (const split of [
    [11, 11],
    [7, 7, 8],
  ]) {
    const { project, face } = fixture("measured", { width: 1, depth: 7.7 });
    const initial = planFace(face);
    assert.equal(initial.pieces[0].baseModules, 22);
    setPartition(project, face, initial.pieces[0].key, split);
    const plan = planFace(face, project.faceSettings[face.id]);
    assert.deepEqual(
      plan.pieces.map((p) => p.modules),
      split,
    );
    near(
      plan.pieces.reduce((n, p) => n + p.length, 0),
      7700 + split.length * 100,
    );
    near(plan.netArea, 7.7);
  }
});
test("8 plus remainder recommendations respect the product limits", () => {
  assert.deepEqual(recommendSplit(22), [8, 8, 6]);
  assert.deepEqual(recommendSplit(9), [6, 3]);
  assert.deepEqual(recommendSplit(22, 1, 7), [7, 7, 7, 1]);
});
test("editing C preserves A/B partitions and file saving preserves all decisions", () => {
  const project = createProject();
  for (let i = 0; i < 3; i++)
    project.parts.push(
      newPart(project, "measured", { x: i * 3, width: 1, depth: 7.7 }),
    );
  let resolved = resolveProject(project);
  for (const f of resolved.faces)
    setPartition(project, f, planFace(f).pieces[0].key, [11, 11]);
  const before = clone(project.faceSettings);
  project.parts[2].depth = 7.35;
  resolved = resolveProject(project);
  assert.deepEqual(reconcileSettings(project, resolved), [
    resolved.faces[2].id,
  ]);
  assert.deepEqual(
    project.faceSettings[resolved.faces[0].id],
    before[resolved.faces[0].id],
  );
  assert.deepEqual(
    project.faceSettings[resolved.faces[1].id],
    before[resolved.faces[1].id],
  );
  assert.deepEqual(project.faceSettings[resolved.faces[2].id].partitions, {});
  assert.ok(project.faceSettings[resolved.faces[2].id].review);
  assert.deepEqual(
    validateProject(JSON.parse(JSON.stringify(project))),
    project,
  );
});
test("undo/redo keep independent complete snapshots", () => {
  const { project, part } = fixture();
  const h = new ProjectHistory(project);
  part.width = 9;
  h.commit(project);
  h.undo();
  assert.equal(h.project.parts[0].width, 8);
  h.redo();
  assert.equal(h.project.parts[0].width, 9);
  const cloneProject = clone(h.project);
  cloneProject.parts[0].width = 10;
  assert.equal(h.project.parts[0].width, 9);
});
test("storage is tenant scoped and editing works when storage fails", () => {
  const records = new Map(),
    backend = {
      getItem: (k) => records.get(k),
      setItem: (k, v) => records.set(k, v),
    };
  const a = new ProjectStorage("a", backend),
    b = new ProjectStorage("b", backend);
  const { project } = fixture();
  a.write(project);
  assert.deepEqual(a.read(), project);
  assert.equal(b.read(), null);
  const failed = new ProjectStorage("c", {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  assert.equal(failed.read(), null);
  assert.equal(failed.write(project), false);
  assert.equal(failed.available, false);
});
test("invalid imported settings and geometry are rejected", () => {
  const { project } = fixture();
  for (const change of [
    (p) => (p.version = 99),
    (p) => (p.parts[0].width = Infinity),
    (p) => (p.parts[0].vertices = [{ x: 0, y: 0 }]),
    (p) => (p.faceSettings.bad = { partitions: { sheet: [1.5] } }),
    (p) =>
      (p.connections = [
        { from: p.parts[0].id, to: "missing", type: "section", fromEdge: 0 },
      ]),
  ]) {
    const bad = clone(project);
    change(bad);
    assert.throws(() => validateProject(bad));
  }
  assert.deepEqual(validateProject(project), project);
});
test("quantities, grouped order and CSV reconcile while unresolved products remain provisional", () => {
  const { project } = fixture("measured", { productId: "click" });
  const report = createSheetReport(project, resolveProject(project));
  assert.equal(
    report.totals.count,
    report.groups.reduce((n, g) => n + g.count, 0),
  );
  assert.equal(report.confirmed, false);
  assert.match(reportCsv(report), /provisional/);
  assert.match(reportCsv(report), /Rodach Click/);
});
test("edge roles generate measured accessory lengths without inventing stock counts", () => {
  for (const kind of ["measured", "gable"]) {
    const { project, part } = fixture(kind);
    part.edgeRoles = { 0: "gutter" };
    const report = createSheetReport(project, resolveProject(project)),
      gutters = report.accessories.filter((a) => a.product === "Jgheab");
    assert.ok(gutters.length);
    near(
      gutters.reduce((n, a) => n + a.metres, 0),
      8,
    );
    assert.ok(gutters.every((a) => a.count === null));
  }
});
test("cloned imported legacy window geometry preserves the hole and original inputs", () => {
  const layout = presetRoofLayout({
    roofType: "gable",
    length: 10,
    depth: 8,
    overhang: 0,
    pitch: 30,
  });
  layout.roofWindows = [{ x: 0, z: -2, width: 0.8, length: 1.2 }];
  const before = clone(layout),
    { project } = fixture("imported", { layout, rotation: 35, x: 12 });
  const faces = resolveProject(project).faces;
  near(
    faces.reduce((n, f) => n + f.area, 0),
    80 / Math.cos(Math.PI / 6) - 0.96,
  );
  assert.deepEqual(layout, before);
  assert.deepEqual(
    createSheetReport(project, resolveProject(project)).errors,
    [],
  );
});
test("decimal commas, decimal points and inherited imperial units are supported", () => {
  assert.equal(parseNumber("4,5"), 4.5);
  assert.equal(parseNumber("4.5"), 4.5);
  assert.throws(() => parseNumber("4m"), /numberInvalid/);
  near(unitsFor("imperial").factor, 3.280839895);
  for (const locale of ["ro-RO", "en-US", "de-DE"])
    assert.notEqual(translator(locale)("pitchMissing"), "pitchMissing");
});
test("changing downhill direction preserves the physical opening and true measured area", () => {
  const { project, part } = fixture("measured", { width: 8, depth: 6 });
  part.openings.push({
    id: "window",
    type: "window",
    faceId: part.id + ":0",
    x: 3,
    y: 2,
    width: 0.8,
    length: 1.2,
  });
  const before = resolveProject(project).faces[0],
    corners = openingCorners(part.openings[0]).map(before.toBoard);
  for (const direction of [90, 37, -25, 0]) {
    changeDownhill(part, direction);
    validateProject(project);
    const face = resolveProject(project).faces[0],
      actual = openingCorners(part.openings[0]).map(face.toBoard);
    actual.forEach((p, i) => {
      near(p.x, corners[i].x);
      near(p.y, corners[i].y);
    });
    near(face.area, 47.04);
    near(planFace(face).netArea, 47.04);
  }
});
test("copying a legacy roof clones geometry, colour, overhang and manual decisions", () => {
  const snapshot = {
    roofType: "gable",
    length: 8,
    depth: 6,
    overhang: 0.3,
    pitch: 30,
    roofColor: "#7f1d2d",
    sheetPlanOptions: {
      preset: "antic",
      direction: "left",
      partitions: { "A-1.1": [3, 3] },
      offset: 0,
    },
  };
  const original = clone(snapshot),
    project = createProject(),
    part = copySnapshot(project, snapshot);
  near(part.width, 8.6);
  near(part.depth, 6.6);
  assert.equal(part.colour, "#7f1d2d");
  assert.deepEqual(
    project.faceSettings[part.id + ":0"].partitions["0/A-1.1"],
    [3, 3],
  );
  part.layout.vertices[0].x += 1;
  part.sourceSnapshot.depth = 12;
  assert.deepEqual(snapshot, original);
  const changed = createProject();
  copySnapshot(changed, {
    ...snapshot,
    sheetPlanOptions: { ...snapshot.sheetPlanOptions, direction: "right" },
  });
  assert.deepEqual(Object.values(changed.faceSettings)[0].partitions, {});
  assert.equal(Object.values(changed.faceSettings)[0].review, true);
});
test("unequal eave heights resolve local height steps without breaking sheet planning", () => {
  const project = createProject(),
    a = newPart(project, "shed", { width: 6, depth: 5, eave: 1 }),
    b = newPart(project, "shed", { width: 6, depth: 5, x: 6, eave: 0 });
  project.parts.push(a, b);
  project.connections.push({
    type: "section",
    from: a.id,
    to: b.id,
    fromEdge: 1,
  });
  const resolved = resolveProject(project);
  assert.ok(resolved.folds.some((f) => f.type === "heightStep"));
  assert.deepEqual(createSheetReport(project, resolved).errors, []);
});
test("a notched custom outline accepts successive measured diagonals without changing any side", () => {
  const { project, part } = fixture("measured", {
    shape: "custom",
    vertices: [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 5, y: 4 },
      { x: 5, y: 6 },
      { x: 0, y: 6 },
    ],
  });
  const original = shapePoints(part);
  original.forEach(
    (p, i) =>
      (part.constraints[i] = Math.hypot(
        p.x - original[(i + 1) % 6].x,
        p.y - original[(i + 1) % 6].y,
      )),
  );
  assert.equal(nextDiagonalCorner(part), 2);
  setDiagonal(part, 9, 2);
  for (const corner of [3, 4]) {
    assert.equal(nextDiagonalCorner(part), corner);
    const pts = shapePoints(part);
    setDiagonal(
      part,
      Math.hypot(pts[corner].x - pts[0].x, pts[corner].y - pts[0].y),
      corner,
    );
  }
  assert.equal(nextDiagonalCorner(part), null);
  validateProject(project);
  const pts = shapePoints(part);
  pts.forEach((p, i) =>
    near(
      Math.hypot(p.x - pts[(i + 1) % 6].x, p.y - pts[(i + 1) % 6].y),
      part.constraints[i],
    ),
  );
});
test("multiple dormers retain their host surface coordinates and established labels", () => {
  const { project, part } = fixture("gable", { width: 12, depth: 8 });
  part.dormers = [3, 9].map((x, i) => ({
    id: "d" + i,
    type: "dormer",
    faceIndex: 0,
    x,
    y: 0.9,
    width: 1.5,
    length: 1.2,
    wallRise: 0.4,
    pitch: 30,
    labelOrdinal: i + 1,
  }));
  const resolved = resolveProject(project);
  assert.deepEqual(
    resolved.faces.map((f) => f.label),
    ["A.1", "A.2", "A.D1", "A.D2", "A.D3", "A.D4"],
  );
  part.dormers.shift();
  assert.deepEqual(
    resolveProject(project).faces.map((f) => f.label),
    ["A.1", "A.2", "A.D3", "A.D4"],
  );
  assert.deepEqual(
    createSheetReport(project, resolveProject(project)).errors,
    [],
  );
});
test("paper sketch uses readable locked edges and keeps missing measurements provisional", () => {
  const project = createProject(),
    parts = addPaperSketch(project);
  assert.equal(parts.length, 6);
  assert.equal(parts.at(-1).constraints[0], 13.6);
  assert.equal(parts.at(-1).constraints[2], 8.1);
  assert.ok(
    parts.every((p) => !p.confirmed && p.pitch === null && p.exampleNote),
  );
  validateProject(project);
  assert.deepEqual(
    createSheetReport(project, resolveProject(project)).errors,
    [],
  );
});
test("matching-column splits preserve a different column's existing section structure", () => {
  const { project, part, face } = fixture("measured", {
    width: 4,
    depth: 10.5,
    shape: "custom",
    vertices: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 7.7 },
      { x: 2, y: 7.7 },
      { x: 2, y: 10.5 },
      { x: 0, y: 10.5 },
    ],
  });
  const plan = planFace(face),
    piece = plan.pieces.find((p) => p.column === 1 && p.baseModules === 22);
  assert.ok(piece);
  setPartition(project, face, piece.key, [11, 11], "same");
  const keys = Object.keys(project.faceSettings[face.id].partitions);
  assert.equal(keys.length, 2);
  assert.ok(keys.every((k) => /A-[12]\./.test(k)));
  assert.ok(
    planFace(face, project.faceSettings[face.id]).pieces.some(
      (p) => p.column === 3 && p.modules === 22,
    ),
  );
  validateProject(project);
});
test("file imports reject invalid partitions and placement without replacing valid data", () => {
  const { project, face } = fixture("measured", { width: 1, depth: 7.7 });
  const piece = planFace(face).pieces[0];
  setPartition(project, face, piece.key, [11, 11]);
  assert.deepEqual(validateProjectFile(project), project);
  const bad = clone(project);
  bad.faceSettings[face.id].partitions[piece.key] = [10, 10];
  assert.throws(() => validateProjectFile(bad), /invalidProject/);
  const offset = clone(project);
  offset.faceSettings[face.id].offset = 2000;
  assert.throws(() => validateProjectFile(offset), /invalidProject/);
  assert.deepEqual(
    project.faceSettings[face.id].partitions[piece.key],
    [11, 11],
  );
});
test("extension grows the selected edge and leaves the opposite edge fixed at any rotation", () => {
  for (const rotation of [0, 37, 90])
    for (const edge of [0, 1, 2, 3]) {
      const { project, part } = fixture("gable", {
        width: 8,
        depth: 6,
        rotation,
        x: 12,
        z: 4,
      });
      const opposite = (edge + 2) % 4,
        local = [
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 6 },
          { x: 0, y: 6 },
        ],
        angle = (rotation * Math.PI) / 180;
      const world = (p, l) => ({
        x: p.x + l.x * Math.cos(angle) - l.y * Math.sin(angle),
        y: p.z + l.x * Math.sin(angle) + l.y * Math.cos(angle),
      });
      const before = [
        world(part, local[opposite]),
        world(part, local[(opposite + 1) % 4]),
      ];
      extendSection(part, edge);
      validateProject(project);
      const next = [
          { x: 0, y: 0 },
          { x: part.width, y: 0 },
          { x: part.width, y: part.depth },
          { x: 0, y: part.depth },
        ],
        after = [
          world(part, next[opposite]),
          world(part, next[(opposite + 1) % 4]),
        ];
      after.forEach((p, i) => {
        near(p.x, before[i].x);
        near(p.y, before[i].y);
      });
    }
});
test("coplanar attached sections have no artificial ridge or accessory seam", () => {
  const project = createProject(),
    a = newPart(project, "shed", { width: 6, depth: 5 }),
    b = newPart(project, "shed", { width: 6, depth: 5, x: 6 });
  project.parts.push(a, b);
  project.connections.push({
    type: "section",
    from: a.id,
    to: b.id,
    fromEdge: 1,
  });
  const resolved = resolveProject(project);
  assert.deepEqual(resolved.folds, []);
  assert.deepEqual(resolved.issues, []);
  assert.deepEqual(createSheetReport(project, resolved).accessories, []);
});
test("mirroring a copied asymmetric roof reflects its geometry without changing the source", () => {
  const snapshot = {
    roofType: "lshape",
    length: 10,
    depth: 8,
    pitch: 30,
    overhang: 0,
    wingLength: 4,
    wingDepth: 3,
  };
  const project = createProject(),
    part = copySnapshot(project, snapshot),
    original = clone(part);
  const mirror = duplicatePart(project, part.id, true),
    axis =
      Math.min(...part.layout.vertices.map((v) => v.x)) +
      Math.max(...part.layout.vertices.map((v) => v.x));
  mirror.layout.vertices.forEach((v, i) => {
    near(v.x, axis - original.layout.vertices[i].x);
    near(v.z, original.layout.vertices[i].z);
    near(v.h, original.layout.vertices[i].h);
  });
  assert.deepEqual(part, original);
  validateProject(project);
  const areaByPart = (id) =>
    resolveProject(project)
      .faces.filter((f) => f.part.id === id)
      .reduce((n, f) => n + f.area, 0);
  near(areaByPart(part.id), areaByPart(mirror.id));
  const variant = createProject();
  variant.productId = "simetric";
  variant.finish = "suprem";
  const imported = copySnapshot(variant, {
    ...snapshot,
    sheetPlanOptions: { preset: "clasic" },
  });
  assert.equal(imported.finish, "premium");
  validateProject(variant);
});
test("a missing connected source pitch affects assembly without erasing the target's supplied pitch", () => {
  const { project, part } = fixture("measured", {
      width: 6,
      depth: 4,
      pitch: null,
    }),
    target = newPart(project, "measured", { width: 6, depth: 4, pitch: 40 });
  project.parts.push(target);
  attachMeasured(project, part.id, 0, target.id, 0);
  const resolved = resolveProject(project),
    face = resolved.faces.find((f) => f.part.id === target.id);
  assert.equal(face.pitch, 40);
  assert.equal(face.assembled, false);
  assert.ok(
    resolved.issues.some(
      (i) => i.partId === target.id && i.message === "assemblyIncomplete",
    ),
  );
  assert.ok(!planFace(face).warnings.includes("pitchMissing"));
  near(planFace(face).netArea, 24);
});

test("copying the upstream slope sketch never invents a preset roof or mutates the project", () => {
  const project = createProject(),
    before = structuredClone(project);
  assert.throws(
    () =>
      copySnapshot(project, {
        roofType: "sketch",
        slopeSketch: { version: 1, slopes: [] },
      }),
    /copySketchUnsupported/,
  );
  assert.deepEqual(project, before);
});
