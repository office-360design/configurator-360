import test from "node:test";
import assert from "node:assert/strict";
import {
  createProject,
  newPart,
  duplicatePart,
  validateProject,
  ProjectHistory,
} from "../project.js";
import { resolveProject, area } from "../geometry.js";
import { sectionOutline, normalizeOutline } from "../outline.js";
import { previewRoof } from "../experience.js";
import { createSheetReport, faceFingerprint } from "../planner.js";
import { validateProjectFile } from "../files.js";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
const L = [
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 3 },
  { x: 5, y: 3 },
  { x: 5, y: 6 },
  { x: 0, y: 6 },
];
function fixture(kind = "gable", footprint = L) {
  const project = createProject();
  const part = newPart(project, kind, { footprint });
  project.parts.push(part);
  return { project, part };
}
test("free-drawn concave outlines retain footprint area and true sloped area in planning", () => {
  for (const kind of ["gable", "shed"]) {
    const { project, part } = fixture(kind);
    validateProject(project);
    const resolved = resolveProject(project),
      report = createSheetReport(project, resolved);
    near(resolved.area, area(sectionOutline(part)) / Math.cos(Math.PI / 6));
    near(
      report.plans.reduce((sum, p) => sum + p.netArea, 0),
      resolved.area,
    );
    assert.equal(resolved.unassembled.length, 0);
  }
});
test("drawing direction and an arbitrary chosen gutter edge produce planar roof faces", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 10, y: 4 },
    { x: 4, y: 7 },
    { x: 0, y: 4 },
  ];
  for (const kind of ["gable", "shed"])
    for (let waterEdge = 0; waterEdge < points.length; waterEdge++) {
      const { project, part } = fixture(kind, points);
      part.waterEdge = waterEdge;
      validateProject(project);
      const resolved = resolveProject(project);
      near(resolved.area, area(sectionOutline(part)) / Math.cos(Math.PI / 6));
      for (const face of resolved.faces)
        for (const polygon of face.polygons)
          for (const p of polygon) {
            const w = face.toWorld(p);
            assert.ok(Number.isFinite(w.h));
          }
    }
});
test("ridge rotation changes slopes without lifting the roof eaves or its footprint", () => {
  const { project, part } = fixture("gable", [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 8, y: 6 },
    { x: 0, y: 6 },
  ]);
  const before = resolveProject(project),
    fingerprints = before.faces.map((f) => faceFingerprint(f));
  part.ridgeAcross = true;
  const after = resolveProject(project);
  near(before.area, after.area);
  assert.notDeepEqual(
    after.faces.map((f) => faceFingerprint(f)),
    fingerprints,
  );
  near(
    Math.min(
      ...after.faces.flatMap((f) =>
        f.polygons.flat().map((p) => f.toWorld(p).h),
      ),
    ),
    0,
  );
});
test("a convex hipped outline is fully covered; an unsupported concave hip is rejected locally", () => {
  const { project } = fixture("hip", [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 7, y: 5 },
    { x: 0, y: 6 },
  ]);
  validateProject(project);
  const resolved = resolveProject(project);
  near(
    resolved.area,
    area(sectionOutline(project.parts[0])) / Math.cos(Math.PI / 6),
  );
  const original = fixture(),
    history = new ProjectHistory(original.project),
    draft = structuredClone(original.project);
  draft.parts[0].kind = "hip";
  assert.throws(() => validateProject(draft), /hipNeedsWings/);
  assert.deepEqual(history.project, original.project);
});
test("free-drawn outlines preserve exact locked edges through mirroring and file round trips", () => {
  const { project, part } = fixture();
  part.constraints = { 0: 8, 2: 3 };
  const copied = duplicatePart(project, part.id, true);
  validateProject(project);
  near(area(sectionOutline(part)), area(sectionOutline(copied)));
  assert.deepEqual(
    validateProjectFile(JSON.parse(JSON.stringify(project))),
    JSON.parse(JSON.stringify(project)),
  );
  copied.width += 1;
  assert.throws(() => validateProject(project), /lockedMeasurement/);
});
test("presentation estimates never supply a missing surveyed pitch or change sheet planning", () => {
  const project = createProject();
  project.parts.push(newPart(project, "measured", { width: 4, depth: 7 }));
  const original = structuredClone(project);
  const before = createSheetReport(project, resolveProject(project));
  const pictured = previewRoof(project);
  assert.equal(pictured.unassembled.length, 0);
  assert.equal(pictured.faces[0].pitch, 30);
  assert.deepEqual(project, original);
  assert.equal(resolveProject(project).faces[0].pitch, null);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(createSheetReport(project, resolveProject(project))),
    ),
    JSON.parse(JSON.stringify(before)),
  );
});
test("outline normalization rejects crossings and preserves arbitrary angles and dimensions", () => {
  const n = normalizeOutline([
    { x: 12, y: 8 },
    { x: 17, y: 9 },
    { x: 16, y: 14 },
    { x: 10, y: 13 },
  ]);
  near(n.width, 7);
  near(n.depth, 6);
  near(n.x, 10);
  near(n.z, 8);
  assert.throws(() =>
    normalizeOutline([
      { x: 0, y: 0 },
      { x: 8, y: 6 },
      { x: 8, y: 0 },
      { x: 0, y: 6 },
    ]),
  );
});
test("turning an arbitrary ridge preserves the footprint and actual surface area", () => {
  const { project, part } = fixture("gable");
  part.roofAxisAngle = 17;
  validateProject(project);
  const before = resolveProject(project);
  part.roofAxisAngle = 107;
  validateProject(project);
  const after = resolveProject(project);
  near(before.area, after.area);
  assert.notDeepEqual(
    before.faces.map((f) => faceFingerprint(f)),
    after.faces.map((f) => faceFingerprint(f)),
  );
  const copied = duplicatePart(project, part.id, true);
  validateProject(project);
  near(copied.roofAxisAngle, 73);
});
