import { clone, newPart } from "./project.js?v=builder-game-3";
import { presetRoofLayout } from "../js/presetLayout.js?v=layout-21";
import { slopeLetter } from "../js/sheetPlanner.js?v=sketch-47";
import { resolveProject } from "./geometry.js?v=builder-game-3";
import { faceFingerprint } from "./planner.js?v=builder-game-3";
import { getProduct } from "./catalog.js?v=builder-game-3";

// The parent supplies a cloned captureState result; this adapter only adds a
// builder-owned copy. It never calls restoreState or any original editor API.
export function copySnapshot(project, snapshot) {
  // The upstream 2D sketch has no assembled layout. Never turn it into a
  // default preset and present that guessed roof as a copy of the survey.
  if (snapshot?.roofType === "sketch") throw new Error("copySketchUnsupported");
  if (!snapshot || snapshot.roofType === "custom")
    throw new Error("copyUnsupported");
  const layout =
    snapshot.roofType === "layout"
      ? clone(snapshot.roofLayout)
      : presetRoofLayout(snapshot);
  const minX = Math.min(...layout.vertices.map((v) => v.x)),
    minZ = Math.min(...layout.vertices.map((v) => v.z));
  const width = Math.max(...layout.vertices.map((v) => v.x)) - minX,
    depth = Math.max(...layout.vertices.map((v) => v.z)) - minZ;
  const options = snapshot.sheetPlanOptions,
    productId =
      options?.preset === "clasic"
        ? "clasic"
        : options?.preset === "antic"
          ? "antic"
          : project.productId;
  const right = Math.max(
    0,
    ...resolveProject(project).faces.flatMap((f) =>
      f.boardPolygons.flat().map((p) => p.x),
    ),
  );
  const part = newPart(project, "imported", {
    layout,
    width,
    depth,
    x: project.parts.length ? right + 2 : 0,
    z: 0,
    pitch: snapshot.pitch || 30,
    colour: /^#[0-9a-f]{6}$/i.test(snapshot.roofColor)
      ? snapshot.roofColor
      : project.colour,
    productId,
    finish: getProduct(productId).finishes.includes(project.finish)
      ? project.finish
      : "premium",
    confirmed: false,
    sourceSnapshot: clone(snapshot),
  });
  project.parts.push(part);
  const faces = resolveProject(project).faces.filter(
    (f) => f.part.id === part.id,
  );
  if (options && ["antic", "clasic"].includes(options.preset))
    for (const face of faces) {
      const index = Number(face.role),
        prefix = slopeLetter(index) + "-",
        partitions = {};
      for (const [key, values] of Object.entries(options.partitions || {}))
        if (key.startsWith(prefix))
          partitions["0/A-" + key.slice(prefix.length)] = clone(values);
      const perFace = options.slopes?.[index] || {};
      const settings = {
        direction: perFace.direction || options.direction || "left",
        offset: perFace.offset ?? options.offset ?? 0,
        partitions,
      };
      if (productId !== "simetric" && settings.direction !== "left") {
        settings.direction = "left";
        settings.partitions = {};
        settings.review = true;
      }
      settings.fingerprint = faceFingerprint(face, settings);
      project.faceSettings[face.id] = settings;
    }
  return part;
}
