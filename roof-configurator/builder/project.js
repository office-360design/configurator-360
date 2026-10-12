import { getProduct, CATALOG_VERSION } from "./catalog.js?v=builder-game-3";
import { resolveProject } from "./geometry.js?v=builder-game-3";

export const clone = (value) => structuredClone(value);
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  "rb-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
export function createProject() {
  return {
    version: 1,
    catalogVersion: CATALOG_VERSION,
    title: "",
    parts: [],
    nextLabel: 0,
    productId: "antic",
    finish: "premium",
    colour: "#383e42",
    connections: [],
    faceSettings: {},
  };
}
export function label(index) {
  return (
    (index >= 26 ? label(Math.floor(index / 26) - 1) : "") +
    String.fromCharCode(65 + (index % 26))
  );
}
export function newPart(project, kind = "gable", options = {}) {
  return {
    id: uid(),
    kind,
    name: label(project.nextLabel++),
    x: 0,
    z: 0,
    rotation: 0,
    width: 8,
    depth: 6,
    pitch: kind === "measured" ? null : 30,
    eave: 0,
    shape: "rectangle",
    top: 4,
    offset: 1,
    vertices: null,
    constraints: {},
    edgeRoles: {},
    openings: [],
    dormers: [],
    confirmed: false,
    productId: project.productId,
    finish: project.finish,
    colour: project.colour,
    downhill: 0,
    ...clone(options),
  };
}
export function duplicatePart(project, id, mirror = false) {
  const original = project.parts.find((p) => p.id === id);
  if (!original) throw new Error("choosePart");
  const part = clone(original);
  part.id = uid();
  part.name = label(project.nextLabel++);
  part.x += part.width + 1;
  const dormerIds = new Map();
  part.dormers.forEach((o) => {
    const old = o.id;
    o.id = uid();
    dormerIds.set(old, o.id);
  });
  part.openings.forEach((o) => {
    o.id = uid();
    o.faceId = o.faceId.replace(original.id, part.id);
    for (const [old, id] of dormerIds) o.faceId = o.faceId.replace(old, id);
  });
  if (mirror) {
    if (part.kind === "measured") {
      part.offset =
        part.width - (part.shape === "triangle" ? 0 : part.top) - part.offset;
      if (part.vertices) {
        const reversed = part.vertices
          .map((v) => ({ x: part.width - v.x, y: v.y }))
          .reverse();
        const count = reversed.length,
          constraints = {},
          roles = {};
        for (const [edge, value] of Object.entries(part.constraints))
          constraints[(count - 2 - Number(edge) + count) % count] = value;
        for (const [edge, value] of Object.entries(part.edgeRoles))
          roles[(count - 2 - Number(edge) + count) % count] = value;
        part.vertices = reversed;
        part.constraints = constraints;
        part.edgeRoles = roles;
        const diagonals = {};
        for (const [pair, value] of Object.entries(part.diagonals || {})) {
          const ids = pair
            .split(":")
            .map((i) => count - 1 - Number(i))
            .sort((a, b) => a - b);
          diagonals[ids.join(":")] = value;
        }
        part.diagonals = diagonals;
      }
      part.downhill = -part.downhill;
    } else {
      part.rotation = -part.rotation;
      if (part.roofAxisAngle !== undefined)
        part.roofAxisAngle = (180 - part.roofAxisAngle) % 180;
      if (part.footprint) {
        const maxX = Math.max(...part.footprint.map((v) => v.x));
        part.footprint = part.footprint
          .map((v) => ({ x: maxX - v.x, y: v.y }))
          .reverse();
        const count = part.footprint.length,
          locks = {},
          roles = {};
        for (const [key, value] of Object.entries(part.constraints))
          locks[(count - 2 - Number(key) + count) % count] = value;
        for (const [key, value] of Object.entries(part.edgeRoles))
          roles[(count - 2 - Number(key) + count) % count] = value;
        part.constraints = locks;
        part.edgeRoles = roles;
        if (part.waterEdge !== undefined)
          part.waterEdge = (count - 2 - part.waterEdge + count) % count;
      } else if (part.waterEdge !== undefined)
        part.waterEdge = (4 - part.waterEdge) % 4;
      if (part.kind === "imported") {
        const axis =
          Math.min(...part.layout.vertices.map((v) => v.x)) +
          Math.max(...part.layout.vertices.map((v) => v.x));
        part.layout.vertices.forEach((v) => (v.x = axis - v.x));
        part.layout.boundary.reverse();
        part.layout.faces.forEach((f) => f.reverse());
        part.layout.roofWindows?.forEach((w) => {
          w.x = axis - w.x;
          for (const key of ["across", "uphill", "normal"])
            if (w[key]) w[key].x = -w[key].x;
        });
      }
    }
    const faces = resolveProject({ parts: [original], connections: [] }).faces;
    for (const opening of part.openings) {
      const oldId = opening.faceId.replace(part.id, original.id),
        face = faces.find((f) => f.id === oldId);
      if (face) opening.x = face.bounds.maxX + face.bounds.minX - opening.x;
      opening.rotation = -(opening.rotation || 0);
    }
    for (const dormer of part.dormers) {
      const face = faces.find((f) => f.role === String(dormer.faceIndex || 0));
      if (face) dormer.x = face.bounds.maxX + face.bounds.minX - dormer.x;
    }
  }
  project.parts.push(part);
  return part;
}
export function validateProject(input) {
  if (
    !input ||
    input.version !== 1 ||
    !Array.isArray(input.parts) ||
    input.parts.length > 100 ||
    !Array.isArray(input.connections) ||
    input.connections.length > 200 ||
    !Number.isInteger(input.nextLabel) ||
    input.nextLabel < 0 ||
    input.nextLabel > 10000 ||
    !input.faceSettings ||
    typeof input.faceSettings !== "object" ||
    Array.isArray(input.faceSettings)
  )
    throw new Error("invalidProject");
  getProduct(input.productId);
  if (
    typeof input.title !== "string" ||
    input.title.length > 200 ||
    typeof input.catalogVersion !== "string" ||
    !/^[#][0-9a-f]{6}$/i.test(input.colour) ||
    !getProduct(input.productId).finishes.includes(input.finish)
  )
    throw new Error("invalidProject");
  for (const [id, settings] of Object.entries(input.faceSettings)) {
    if (
      id.length > 300 ||
      !settings ||
      typeof settings !== "object" ||
      Array.isArray(settings) ||
      (settings.direction !== undefined &&
        !["left", "right"].includes(settings.direction)) ||
      (settings.offset !== undefined &&
        (!Number.isFinite(settings.offset) ||
          settings.offset < 0 ||
          settings.offset > 3000)) ||
      (settings.fingerprint !== undefined &&
        (typeof settings.fingerprint !== "string" ||
          settings.fingerprint.length > 200000))
    )
      throw new Error("invalidProject");
    if (settings.partitions !== undefined) {
      if (
        !settings.partitions ||
        typeof settings.partitions !== "object" ||
        Array.isArray(settings.partitions) ||
        Object.keys(settings.partitions).length > 10000
      )
        throw new Error("invalidProject");
      for (const [key, values] of Object.entries(settings.partitions))
        if (
          key.length > 100 ||
          !Array.isArray(values) ||
          values.length > 100 ||
          values.some((v) => !Number.isInteger(v) || v < 1 || v > 100)
        )
          throw new Error("invalidProject");
    }
  }
  const ids = new Set();
  for (const part of input.parts) {
    if (
      !part ||
      typeof part.id !== "string" ||
      part.id.length > 150 ||
      ids.has(part.id) ||
      typeof part.name !== "string" ||
      part.name.length > 100 ||
      !["gable", "hip", "shed", "measured", "imported"].includes(part.kind)
    )
      throw new Error("invalidProject");
    ids.add(part.id);
    getProduct(part.productId);
    if (
      !/^[#][0-9a-f]{6}$/i.test(part.colour) ||
      !getProduct(part.productId).finishes.includes(part.finish)
    )
      throw new Error("invalidProject");
    for (const key of [
      "x",
      "z",
      "rotation",
      "width",
      "depth",
      "eave",
      "downhill",
      "top",
      "offset",
    ]) {
      if (!Number.isFinite(part[key]) || Math.abs(part[key]) > 1000)
        throw new Error("invalidProject");
    }
    if (
      part.width < 0.1 ||
      part.width > 40 ||
      part.depth < 0.1 ||
      part.depth > 40 ||
      part.eave < -20 ||
      part.eave > 20 ||
      (part.pitch !== null &&
        (!Number.isFinite(part.pitch) || part.pitch < 0 || part.pitch > 75))
    )
      throw new Error("sizeLimit");
    if (
      !Array.isArray(part.openings) ||
      !Array.isArray(part.dormers) ||
      part.openings.length > 30 ||
      part.dormers.length > 30 ||
      !part.constraints ||
      !part.edgeRoles ||
      typeof part.constraints !== "object" ||
      typeof part.edgeRoles !== "object"
    )
      throw new Error("invalidProject");
    for (const o of [...part.openings, ...part.dormers]) {
      if (
        !o ||
        typeof o.id !== "string" ||
        !Number.isFinite(o.x) ||
        !Number.isFinite(o.y) ||
        !Number.isFinite(o.width) ||
        !Number.isFinite(o.length) ||
        o.width < (o.type === "dormer" ? 0.5 : 0.3) ||
        o.width > (o.type === "dormer" ? 8 : 3) ||
        o.length < 0.4 ||
        o.length > 4
      )
        throw new Error("openingSize");
    }
    if (
      part.vertices !== null &&
      (!Array.isArray(part.vertices) || part.vertices.length > 100)
    )
      throw new Error("invalidProject");
    if (
      part.footprint !== undefined &&
      (!Array.isArray(part.footprint) ||
        part.footprint.length < 3 ||
        part.footprint.length > 60 ||
        part.footprint.some(
          (p) =>
            !p ||
            !Number.isFinite(p.x) ||
            !Number.isFinite(p.y) ||
            p.x < 0 ||
            p.y < 0 ||
            p.x > 40 ||
            p.y > 40,
        ))
    )
      throw new Error("invalidOutline");
    for (const key of ["ridgeAcross", "slopeReversed"])
      if (part[key] !== undefined && typeof part[key] !== "boolean")
        throw new Error("invalidProject");
    if (
      part.waterEdge !== undefined &&
      (!Number.isInteger(part.waterEdge) ||
        part.waterEdge < 0 ||
        part.waterEdge >= (part.footprint?.length || 4))
    )
      throw Error("invalidProject");
    if (
      part.roofAxisAngle !== undefined &&
      (!Number.isFinite(part.roofAxisAngle) ||
        Math.abs(part.roofAxisAngle) > 360)
    )
      throw Error("invalidProject");
    for (const [edge, length] of Object.entries(part.constraints))
      if (
        !/^\d+$/.test(edge) ||
        !Number.isFinite(length) ||
        length < 0.05 ||
        length > 40
      )
        throw new Error("invalidProject");
    if (part.diagonals !== undefined) {
      if (
        !part.diagonals ||
        typeof part.diagonals !== "object" ||
        Array.isArray(part.diagonals)
      )
        throw new Error("invalidProject");
      for (const [key, length] of Object.entries(part.diagonals))
        if (
          !/^\d+:\d+$/.test(key) ||
          !Number.isFinite(length) ||
          length < 0.05 ||
          length > 57
        )
          throw new Error("invalidProject");
    }
    for (const [edge, role] of Object.entries(part.edgeRoles))
      if (
        !/^\d+$/.test(edge) ||
        ![
          "unmarked",
          "gutter",
          "ridge",
          "hip",
          "valley",
          "verge",
          "wall",
        ].includes(role)
      )
        throw new Error("invalidProject");
    for (const o of part.openings)
      if (
        typeof o.faceId !== "string" ||
        !o.faceId.startsWith(part.id + ":") ||
        !["window", "chimney"].includes(o.type) ||
        (o.rotation !== undefined &&
          (!Number.isFinite(o.rotation) || Math.abs(o.rotation) > 360))
      )
        throw new Error("invalidProject");
    for (const o of part.dormers)
      if (
        !Number.isInteger(o.faceIndex) ||
        o.faceIndex < 0 ||
        !Number.isFinite(o.wallRise) ||
        o.wallRise < 0.15 ||
        o.wallRise > 5 ||
        !Number.isFinite(o.pitch) ||
        o.pitch < 5 ||
        o.pitch > 60 ||
        (o.labelOrdinal !== undefined &&
          (!Number.isInteger(o.labelOrdinal) ||
            o.labelOrdinal < 1 ||
            o.labelOrdinal > 10000))
      )
        throw new Error("invalidProject");
  }
  for (const connection of input.connections) {
    if (
      !ids.has(connection.from) ||
      !ids.has(connection.to) ||
      connection.from === connection.to ||
      !["section", "measured-edge"].includes(connection.type) ||
      !Number.isInteger(connection.fromEdge) ||
      connection.fromEdge < 0 ||
      connection.fromEdge > 99 ||
      (connection.type === "measured-edge" &&
        (!Number.isInteger(connection.toEdge) ||
          connection.toEdge < 0 ||
          connection.toEdge > 99))
    )
      throw new Error("invalidConnection");
  }
  resolveProject(input);
  return clone(input);
}
export class ProjectHistory {
  constructor(project) {
    this.project = clone(project);
    this.undoStack = [];
    this.redoStack = [];
  }
  commit(next) {
    const valid = validateProject(next);
    if (JSON.stringify(valid) === JSON.stringify(this.project)) return false;
    this.undoStack.push(clone(this.project));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.redoStack = [];
    this.project = valid;
    return true;
  }
  undo() {
    if (!this.undoStack.length) return false;
    this.redoStack.push(this.project);
    this.project = this.undoStack.pop();
    return true;
  }
  redo() {
    if (!this.redoStack.length) return false;
    this.undoStack.push(this.project);
    this.project = this.redoStack.pop();
    return true;
  }
}
export class ProjectStorage {
  constructor(scope, storage) {
    this.key = "360:roof-builder:v1:" + scope;
    this.available = true;
    try {
      this.storage = storage === undefined ? globalThis.localStorage : storage;
    } catch {
      this.available = false;
    }
  }
  read() {
    try {
      const value = this.storage.getItem(this.key);
      return value ? validateProject(JSON.parse(value)) : null;
    } catch {
      this.available = false;
      return null;
    }
  }
  write(project) {
    try {
      this.storage.setItem(this.key, JSON.stringify(project));
      return true;
    } catch {
      this.available = false;
      return false;
    }
  }
}
