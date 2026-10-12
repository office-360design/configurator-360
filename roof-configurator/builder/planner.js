import {
  planRoofSheets,
  validateSheetPartition,
  groupSheetLengths,
  partitionTargets,
} from "../js/sheetPlanner.js?v=navigation-32";
import {
  getProduct,
  ACCESSORIES,
  CATALOG_VERSION,
} from "./catalog.js?v=builder-game-3";
import {
  plannerLayout,
  clip,
  area,
  boundaryRings,
} from "./geometry.js?v=builder-game-3";

const precise = (value) =>
  typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value;
export function faceFingerprint(face, options = {}) {
  return JSON.stringify(
    {
      polygons: face.polygons,
      product: face.part.productId,
      finish: face.part.finish,
      colour: face.part.colour,
      placement:
        face.part.kind === "measured"
          ? null
          : [face.part.x, face.part.z, face.part.rotation, face.part.eave],
      catalog: CATALOG_VERSION,
      direction: options.direction || "left",
      offset: options.offset || 0,
    },
    (_, value) => precise(value),
  );
}
export function reconcileSettings(project, resolved) {
  const changed = [];
  for (const face of resolved.faces) {
    const settings = project.faceSettings[face.id];
    if (!settings) continue;
    const fingerprint = faceFingerprint(face, settings);
    if (settings.fingerprint && fingerprint !== settings.fingerprint) {
      settings.partitions = {};
      settings.review = true;
      changed.push(face.id);
    }
    settings.fingerprint = fingerprint;
  }
  return changed;
}
export function recommendSplit(count, min = 3, max = 22) {
  const target = Math.min(8, max),
    pieces = [];
  while (count > target) {
    pieces.push(target);
    count -= target;
  }
  if (count < min && pieces.length) {
    pieces[pieces.length - 1] -= min - count;
    count = min;
  }
  pieces.push(count);
  if (pieces.some((n) => n < min || n > max)) throw new Error("splitInvalid");
  return pieces;
}
function continuousPlan(face, product, settings) {
  const p = product.continuous,
    step = p.usefulWidth / 1000,
    offset = (settings.offset || 0) / 1000;
  if (!Number.isFinite(offset) || offset < 0 || offset >= step)
    throw new Error("offsetInvalid");
  const width = face.bounds.maxX - face.bounds.minX,
    pieces = [],
    columns = Math.ceil((width + offset) / step);
  for (let column = 0; column < columns; column++) {
    const x = face.bounds.minX + column * step - offset;
    const strips = face.polygons
      .map((poly) =>
        clip(
          clip(poly, (q) => q.x - x),
          (q) => x + step - q.x,
        ),
      )
      .filter((poly) => poly.length > 2 && area(poly) > 1e-8);
    const intervals = strips
      .map((poly) => [
        Math.min(...poly.map((p) => p.y)),
        Math.max(...poly.map((p) => p.y)),
      ])
      .sort((a, b) => a[0] - b[0]);
    const runs = [];
    for (const interval of intervals) {
      const last = runs.at(-1);
      if (last && interval[0] <= last[1] + 1e-7)
        last[1] = Math.max(last[1], interval[1]);
      else runs.push(interval);
    }
    let segment = 0;
    for (const [start, end] of runs) {
      const length = (end - start) * 1000,
        count = Math.ceil(length / p.maxLength);
      if (length < p.minLength && length > 1e-4) {
        /* minimum stock is allowed to extend beyond the cut */
      }
      let y = start;
      for (let i = 0; i < count; i++) {
        const coverageLength = Math.min(p.maxLength / 1000, end - y),
          stock = Math.max(p.minLength, Math.ceil(coverageLength * 1000));
        const cuts = strips
          .map((poly) =>
            clip(
              clip(poly, (q) => q.y - y),
              (q) => y + coverageLength - q.y,
            ),
          )
          .filter((poly) => poly.length > 2 && area(poly) > 1e-8);
        const id = "C-" + (column + 1) + "." + ++segment;
        pieces.push({
          id,
          baseId: id,
          baseModules: null,
          modules: null,
          column: column + 1,
          length: stock,
          x,
          stockX: x,
          y,
          coverageLength,
          polygons: cuts,
          netArea: cuts.reduce((sum, poly) => sum + area(poly), 0),
        });
        y += coverageLength;
      }
    }
  }
  return [
    {
      pieces,
      polygons: face.polygons,
      outline: face.edges,
      columns,
      netArea: face.area,
      stockArea: pieces.reduce(
        (sum, piece) => sum + (piece.length * p.width) / 1e6,
        0,
      ),
      usefulArea: pieces.reduce(
        (sum, piece) => sum + piece.coverageLength * step,
        0,
      ),
    },
  ];
}
export function planFace(face, settings = {}) {
  const product = getProduct(face.part.productId),
    direction = settings.direction || "left";
  if (!product.directions.includes(direction))
    throw new Error("directionInvalid");
  const offset = settings.offset ?? 0;
  if (
    !Number.isFinite(offset) ||
    offset < 0 ||
    offset >= (product.profile?.usefulWidth || product.continuous.usefulWidth)
  )
    throw new Error("offsetInvalid");
  let slopes;
  if (product.continuous) slopes = continuousPlan(face, product, settings);
  else
    slopes = plannerLayout(face).flatMap((layout, component) => {
      const partitions = {};
      for (const [key, values] of Object.entries(settings.partitions || {})) {
        if (key.startsWith(component + "/"))
          partitions[key.slice(String(component).length + 1)] = values;
      }
      const result = planRoofSheets(layout, product.profile, {
        direction,
        offset: settings.offset || 0,
        partitions,
      });
      return result.slopes
        .filter((slope) => slope.planPolygons[0]?.[0]?.h === 0)
        .map((slope) => {
          const points = slope.planPolygons.flat(),
            dx = Math.min(...points.map((p) => p.x)),
            dy = Math.min(...points.map((p) => p.z));
          return {
            ...slope,
            component,
            pieces: slope.pieces.map((piece) => ({
              ...piece,
              x: piece.x + dx,
              y: piece.y + dy,
              stockX: piece.stockX + dx,
              polygons: piece.polygons.map((poly) =>
                poly.map((p) => ({ x: p.x + dx, y: p.y + dy })),
              ),
            })),
          };
        });
    });
  const pieces = slopes.flatMap((slope, component) =>
    slope.pieces.map((piece) => ({
      ...piece,
      id: face.id + "/" + component + "/" + piece.id,
      key: (slope.component ?? component) + "/" + piece.baseId,
      displayId:
        face.label + "-" + piece.column + "." + piece.id.split(".").at(-1),
      width: product.profile?.width || product.continuous.width,
      usefulWidth:
        product.profile?.usefulWidth || product.continuous.usefulWidth,
    })),
  );
  const warnings = [...(product.issues || [])];
  if (face.pitch === null) warnings.push("pitchMissing");
  else if (
    face.pitch + 1e-6 <
    (product.profile?.minPitch || product.continuous.minPitch)
  )
    warnings.push("pitchTooLow");
  if (!face.part.confirmed) warnings.push("measurementsProvisional");
  if (settings.review) warnings.push("planReview");
  const stockArea = pieces.reduce(
    (sum, piece) => sum + (piece.length * piece.width) / 1e6,
    0,
  );
  const usefulArea = pieces.reduce(
    (sum, piece) => sum + (piece.coverageLength * piece.usefulWidth) / 1000,
    0,
  );
  return {
    face,
    product,
    settings,
    pieces,
    slopes,
    warnings,
    confirmed: product.confirmed && face.part.confirmed && face.pitch !== null,
    netArea: face.area,
    stockArea,
    cutArea: Math.max(0, usefulArea - face.area),
    overlapArea: stockArea - usefulArea,
    groups: groupSheetLengths(pieces),
  };
}
export function createSheetReport(project, resolved) {
  const plans = [],
    errors = [];
  for (const face of resolved.faces) {
    try {
      plans.push(planFace(face, project.faceSettings[face.id] || {}));
    } catch (error) {
      errors.push({
        faceId: face.id,
        label: face.label,
        message: error.message,
      });
    }
  }
  const groups = new Map();
  for (const plan of plans)
    for (const piece of plan.pieces) {
      const key = [
        plan.product.id,
        plan.face.part.finish,
        plan.face.part.colour,
        piece.width,
        piece.length,
      ].join(":");
      if (!groups.has(key))
        groups.set(key, {
          product: plan.product.title,
          productId: plan.product.id,
          finish: plan.face.part.finish,
          colour: plan.face.part.colour,
          width: piece.width,
          length: piece.length,
          count: 0,
          labels: [],
          confirmed: plan.confirmed,
        });
      const group = groups.get(key);
      group.count++;
      if (!group.labels.includes(plan.face.label))
        group.labels.push(plan.face.label);
    }
  const accessories = [];
  for (const plan of plans)
    for (const {
      role,
      edge: [a, b],
    } of plan.face.edgeAnnotations) {
      for (const item of ACCESSORIES.filter((item) =>
        item.edge?.includes(role),
      ))
        accessories.push({
          product: item.title,
          face: plan.face.label,
          metres: Math.hypot(a.x - b.x, a.y - b.y),
          count: null,
          confirmed: false,
        });
    }
  for (const fold of resolved.folds) {
    const item = ACCESSORIES.find((item) =>
      item.edge?.includes(fold.type === "heightStep" ? "wall" : fold.type),
    );
    if (item)
      accessories.push({
        product: item.title,
        face: fold.faces
          .map((id) => resolved.faces.find((f) => f.id === id)?.label)
          .join(" / "),
        metres: Math.hypot(
          fold.edge[1].x - fold.edge[0].x,
          fold.edge[1].y - fold.edge[0].y,
          fold.edge[1].h - fold.edge[0].h,
        ),
        count: null,
        confirmed: false,
      });
  }
  return {
    plans,
    errors,
    groups: [...groups.values()].sort(
      (a, b) => a.product.localeCompare(b.product) || a.length - b.length,
    ),
    accessories,
    confirmed:
      !errors.length && plans.length > 0 && plans.every((p) => p.confirmed),
    totals: {
      count: plans.reduce((n, p) => n + p.pieces.length, 0),
      area: plans.reduce((n, p) => n + p.netArea, 0),
      stockArea: plans.reduce((n, p) => n + p.stockArea, 0),
    },
  };
}
export function setPartition(project, face, key, values, scope = "selected") {
  const product = getProduct(face.part.productId);
  if (!product.profile) throw new Error("continuousSplit");
  const settings = (project.faceSettings[face.id] ||= {});
  const plan = planFace(face, settings),
    selected = plan.pieces.find((p) => p.key === key);
  if (!selected) throw new Error("chooseSheet");
  validateSheetPartition(values, selected.baseModules, product.profile);
  let targets = [selected];
  if (scope === "same") {
    const component = Number(key.split("/")[0]);
    const slopes = plan.slopes.filter((s) => s.component === component);
    const matches = partitionTargets({ slopes }, selected.baseId, "slope");
    targets = plan.pieces.filter(
      (p) => p.key.startsWith(component + "/") && matches.includes(p.baseId),
    );
  }
  settings.partitions ||= {};
  for (const piece of targets) settings.partitions[piece.key] = [...values];
  settings.fingerprint = faceFingerprint(face, settings);
  settings.review = false;
}
const csvCell = (value) =>
  '"' + String(value ?? "").replaceAll('"', '""') + '"';
export function reportCsv(report, translate = (s) => s) {
  const rows = [
    [translate("draftOrder")],
    [
      "Product",
      "Finish",
      "Colour",
      "Face",
      "Piece",
      "Modules",
      "Length mm",
      "Width mm",
      "Net m2",
      "Status",
    ],
  ];
  for (const plan of report.plans)
    for (const piece of plan.pieces)
      rows.push([
        plan.product.title,
        plan.face.part.finish,
        plan.face.part.colour,
        plan.face.label,
        piece.displayId,
        piece.modules,
        piece.length,
        piece.width,
        piece.netArea.toFixed(4),
        translate(plan.confirmed ? "confirmed" : "provisional"),
      ]);
  rows.push(
    [],
    [translate("accessories"), "Face", "Measured m", "Stock pieces", "Status"],
  );
  for (const item of report.accessories)
    rows.push([
      item.product,
      item.face,
      item.metres.toFixed(3),
      "",
      translate("supplierCheck"),
    ]);
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
