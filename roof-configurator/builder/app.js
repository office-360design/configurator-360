import { requireTenantConfiguratorAccess } from "../../shared-ui/src/tenantBootstrap.js?v=tenant-domains-1";
import {
  createProject,
  newPart,
  duplicatePart,
  validateProject,
  ProjectHistory,
  ProjectStorage,
  clone,
  uid,
} from "./project.js?v=builder-game-3";
import {
  resolveProject,
  shapePoints,
  boardPoint,
  localBoardPoint,
  bounds,
  radians,
  setEdgeLength,
  setDiagonal,
  attachMeasured,
  boundaryRings,
  changeDownhill,
  openingCorners,
  nextDiagonalCorner,
  extendSection,
} from "./geometry.js?v=builder-game-3";
import {
  sectionOutline,
  normalizeOutline,
} from "./outline.js?v=builder-game-3";
import {
  previewRoof,
  roofPicture,
  piecePicture,
} from "./experience.js?v=builder-game-3";
import {
  bindPanelAccordions,
  bindPanelRange,
} from "../../shared-ui/src/components/panelControls.js";
import { PRODUCTS, getProduct } from "./catalog.js?v=builder-game-3";
import {
  createSheetReport,
  reconcileSettings,
  setPartition,
  recommendSplit,
  faceFingerprint,
  reportCsv,
  planFace,
} from "./planner.js?v=builder-game-3";
import { copySnapshot } from "./capture.js?v=builder-game-3";
import { addPaperSketch } from "./examples.js?v=builder-game-3";
import { validateProjectFile } from "./files.js?v=builder-game-3";
import { translator, parseNumber, unitsFor } from "./i18n.js?v=builder-game-3";

const context = await requireTenantConfiguratorAccess("roof");
const params = new URLSearchParams(location.search),
  locale = params.get("locale") || "ro-RO",
  units = unitsFor(params.get("units") || "metric"),
  t = translator(locale);
document.documentElement.lang = locale.split("-")[0];
if (parent !== window) {
  // Read the existing shell theme; the parent configuration stays untouched.
  const theme = getComputedStyle(parent.document.documentElement);
  for (const key of [
    "--bg",
    "--panel",
    "--panel-soft",
    "--ink",
    "--muted",
    "--line",
    "--accent",
    "--accent-soft",
    "--shadow",
  ]) {
    const value = theme.getPropertyValue(key).trim();
    if (value) document.documentElement.style.setProperty(key, value);
  }
}
document.title = t("title");
const storage = new ProjectStorage(context?.slug || location.host),
  history = new ProjectHistory(storage.read() || createProject());
let resolved = resolveProject(history.project),
  selected = null,
  selectedFace = null,
  selectedEdge = 0,
  pending = null,
  viewer = null,
  viewRequest = 0,
  view3d = false,
  planOpen = false,
  selectedSheet = null,
  report = null,
  disposed = false,
  errorPart = null;
let scale = 45,
  pan = { x: 90, y: 110 },
  boardSize = { width: 800, height: 600 },
  drag = null,
  snapped = false,
  snapTarget = null;
const pointers = new Map();
let toolMode = "move",
  inspectorMode = null,
  drawing = null,
  waterPicking = false,
  sidebarCleanup = () => {};
let pinch = null,
  fitOnResize = true;
const $ = (selector) => document.querySelector(selector),
  escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const num = (value, digits = 2) =>
  Number(value).toLocaleString(locale, { maximumFractionDigits: digits });
const distance = (value) => num(value * units.factor) + " " + units.unit,
  areaText = (value) => num(value * units.areaFactor) + " " + units.areaUnit;
const button = (action, key, extra = "") =>
  '<button type="button" data-action="' +
  action +
  '" ' +
  extra +
  ">" +
  escape(t(key)) +
  "</button>";
const path = (points) =>
    points.map((p) => numRaw(p.x) + "," + numRaw(p.y)).join(" "),
  numRaw = (n) => Number(n.toFixed(5));
const pointToScreen = (p) => ({
    x: pan.x + p.x * scale,
    y: pan.y + p.y * scale,
  }),
  pointToWorld = (p) => ({
    x: (p.x - pan.x) / scale,
    y: (p.y - pan.y) / scale,
  });
const currentPart = () => history.project.parts.find((p) => p.id === selected),
  currentFace = () =>
    resolved.faces.find((f) => f.id === selectedFace) ||
    resolved.faces.find((f) => f.part.id === selected);
const root = $("#app");
const toolButton = (action, key, icon, extra = "") =>
  `<button type="button" data-action="${action}" ${extra}><span aria-hidden="true" class="toolIcon">${icon}</span><span>${escape(t(key))}</span></button>`;
root.innerHTML = `<main class="shell gameShell"><header class="header"><h1>${escape(t("title"))}</h1>${button("files", "toolProject")}${button("close", "close")}</header><div class="work"><div class="canvasWrap" id="workspace"><svg id="board" class="board" role="application" aria-label="${escape(t("view2d"))}" tabindex="0"></svg><div id="viewer" class="viewer hidden"></div><div class="viewToggle">${button("2d", "tool2d", 'class="selected"')}${button("3d", "tool3d", `aria-label="${escape(t("view3d"))}"`)}</div><nav class="toolbar" aria-label="${escape(t("historyTools"))}">${toolButton("undo", "undo", "↶")}${toolButton("redo", "redo", "↷")}</nav><div class="instruction" id="instruction">${escape(t("empty"))}</div><div class="zoom">${toolButton("fit", "toolFit", "⛶")}${`<button data-action="zoomIn" aria-label="${escape(t("zoomIn"))}">+</button>`}${`<button data-action="zoomOut" aria-label="${escape(t("zoomOut"))}">−</button>`}</div><button class="planLaunch" data-action="plan">${escape(t("plan"))}</button><div class="constructionDock" id="constructionDock"><nav id="buildControls" class="buildControls" aria-label="${escape(t("buildTray"))}">${toolButton("add", "buildTray", "+", 'class="primary"')}${toolButton("freeDraw", "freeDraw", "⌁")}</nav><div id="pieceTools" class="pieceTools hidden"></div></div><div id="welcome" class="welcome"></div><div id="canvasNotice" class="canvasNotice hidden"></div><div id="panel" class="panel hidden"></div><div id="plans" class="planWorkspace hidden"></div><aside class="sidebar hidden" id="sidebar"></aside></div></div><div id="status" class="status" role="status" aria-live="polite"></div></main>`;
const board = $("#board"),
  panel = $("#panel"),
  plans = $("#plans");
root.addEventListener("keydown", (event) => {
  const target = event.target.closest("[data-grow]");
  if (target && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    selectedEdge = Number(target.dataset.grow);
    addPart("gable", "rectangle", true);
  }
});
function status(key, error = false, details = "") {
  const el = $("#status");
  el.textContent = t(key) + (details ? " " + details : "");
  el.classList.toggle("error", error);
  root.style.setProperty(
    "--builder-status-height",
    el.getBoundingClientRect().height + "px",
  );
}
function friendly(error) {
  const key = error.message;
  if (t(key) !== key) return key;
  if (/partition|module counts|add up/i.test(key)) return "splitInvalid";
  if (/offset/i.test(key)) return "offsetInvalid";
  if (/dormer|window|slop.*surface/i.test(key)) return "openingOutside";
  if (/points|cross|polygon|enclosing|triangul/i.test(key))
    return "invalidOutline";
  return "planningLimit";
}
function fail(error, id = selected) {
  errorPart = id;
  status(friendly(error), true);
  draw();
}
function saveProgress() {
  storage.write(history.project);
  status(storage.available ? "saved" : "storageUnavailable");
}
function commit(project) {
  const value = clone(project);
  const next = resolveProject(value);
  reconcileSettings(value, next);
  if (history.commit(value)) {
    resolved = resolveProject(history.project);
    errorPart = null;
    saveProgress();
  }
  render();
}
function mutate(fn) {
  try {
    const project = clone(history.project);
    fn(project);
    commit(project);
  } catch (error) {
    fail(error);
  }
}
function render() {
  if (selected && !currentPart()) {
    selected = null;
    selectedFace = null;
  }
  $("[data-action=undo]").disabled = !history.undoStack.length;
  $("[data-action=redo]").disabled = !history.redoStack.length;
  $("#instruction").textContent = t(
    pending
      ? pending.type === "edit"
        ? "editing"
        : "placing"
      : history.project.parts.length
        ? currentPart()
          ? toolMode === "resize"
            ? "resizeHint"
            : "moveHint"
          : "select"
        : "empty",
  );
  $(".shell").classList.toggle("isPending", !!pending || !!drawing);
  $(".shell").classList.toggle("isPlanning", planOpen);
  $(".shell").classList.toggle("is3d", view3d);
  renderSidebar();
  renderWelcome();
  renderPieceTools();
  draw();
  if (viewer) viewer.update(previewRoof(history.project));
  if (planOpen) renderPlans();
}
function partIcon(kind, shape) {
  if (["gable", "hip", "shed"].includes(kind)) return piecePicture(kind);
  const outline =
    shape === "triangle"
      ? "M12 58 L100 58 L55 6 Z"
      : shape === "trapezoid"
        ? "M12 58 L100 58 L80 12 L32 12 Z"
        : shape === "custom"
          ? "M10 58 L100 58 L100 20 L70 20 L70 8 L10 8 Z"
          : "M12 12 H100 V58 H12 Z";
  const lines =
    kind === "gable"
      ? "M12 35H100"
      : kind === "hip"
        ? "M12 12L38 35H74L100 12 M12 58L38 35 M100 58L74 35"
        : kind === "shed"
          ? "M35 15L35 54 M30 47L35 54L40 47"
          : "";
  return (
    '<svg viewBox="0 0 112 68" aria-hidden="true"><path d="' +
    outline +
    '" fill="#e0eaf2" stroke="#536c7e" stroke-width="2"/><path d="' +
    lines +
    '" fill="none" stroke="#0878c9" stroke-width="3"/></svg>'
  );
}
function renderAdvanced() {
  const p = currentPart(),
    face = currentFace();
  let html = "";
  if (p) {
    html +=
      '<hr class="divider"><h2>' +
      escape(p.name) +
      " · " +
      escape(face?.label || "") +
      "</h2><p>" +
      escape(getProduct(p.productId).title) +
      '</p><div class="actions">' +
      button("edit", "edit") +
      button("move", "move") +
      '</div><div class="actions">' +
      button("products", "products") +
      button("duplicate", "duplicate") +
      button("mirror", "mirror") +
      "</div>";
    html +=
      "<label>" +
      escape(t("surface")) +
      '<select id="selectedFaceSelect">' +
      resolved.faces
        .filter((f) => f.part.id === p.id)
        .map(
          (f) =>
            '<option value="' +
            escape(f.id) +
            '" ' +
            (f.id === face?.id ? "selected" : "") +
            ">" +
            escape(f.label) +
            " · " +
            areaText(f.area) +
            "</option>",
        )
        .join("") +
      "</select></label>";
    if (p.kind !== "imported")
      html +=
        '<hr class="divider"><label>' +
        escape(t("edge")) +
        '<select id="selectedEdge">' +
        (p.kind === "measured" ? shapePoints(p) : Array(4).fill(null))
          .map(
            (_, i) =>
              '<option value="' +
              i +
              '" ' +
              (selectedEdge === i ? "selected" : "") +
              ">" +
              t("edge") +
              " " +
              (i + 1) +
              "</option>",
          )
          .join("") +
        '</select></label><div class="actions">' +
        button("attach", "attach") +
        button("extend", "extend") +
        button("mark", "mark") +
        "</div>";
    if (p.kind === "measured")
      html +=
        '<div class="actions">' +
        button("edge", "edgeLength") +
        button("connect", "connect") +
        '</div><div class="actions">' +
        button("addCorner", "addCorner") +
        button("notch", "notch") +
        "</div>" +
        (shapePoints(p).length >= 4 ? button("diagonal", "diagonal") : "") +
        "<label>" +
        escape(t("corner")) +
        '<select id="selectedCorner">' +
        shapePoints(p)
          .map((_, i) => '<option value="' + i + '">' + (i + 1) + "</option>")
          .join("") +
        "</select></label>" +
        button("removeCorner", "removeCorner");
    html +=
      '<hr class="divider"><div class="actions">' +
      (p.kind !== "measured" ? button("dormer", "dormer") : "") +
      button("opening", "opening") +
      "</div>";
    for (const o of [...p.openings, ...p.dormers])
      html +=
        "<p>" +
        escape(t(o.type || "dormer")) +
        " · " +
        distance(o.width) +
        " " +
        button(
          "removeFeature",
          "removeFeature",
          'data-id="' + escape(o.id) + '"',
        ) +
        "</p>";
    html +=
      '<hr class="divider"><div class="actions">' +
      button("up", "up") +
      button("down", "down") +
      "</div>" +
      button("remove", "remove", 'class="danger"');
    if (face && !face.assembled)
      html +=
        '<p class="notice">' +
        escape(t(face.pitch === null ? "pitchMissing" : "assemblyIncomplete")) +
        "</p>";
    if (p.exampleNote)
      html += '<p class="notice">' + escape(t(p.exampleNote)) + "</p>";
    html += resolved.issues
      .filter(
        (i) =>
          i.partId === p.id &&
          !["pitchMissing", "assemblyIncomplete"].includes(i.message),
      )
      .map((i) => '<p class="notice">' + escape(t(i.message)) + "</p>")
      .join("");
  } else
    html +=
      '<p class="muted">' +
      escape(t(history.project.parts.length ? "select" : "empty")) +
      "</p>" +
      button("products", "products") +
      '<hr class="divider">' +
      button("example", "example") +
      button("paper", "paper");
  return html;
}
function renderWelcome() {
  const welcome = $("#welcome");
  welcome.classList.toggle(
    "hidden",
    !!history.project.parts.length ||
      !!pending ||
      !!drawing ||
      view3d ||
      !!waterPicking,
  );
  welcome.innerHTML = `<div class="welcomeTitle"><h2>${escape(t("startTitle"))}</h2><p>${escape(t("startHint"))}</p></div><div class="startChoices"><button data-action="add" class="startCard">${piecePicture("hip")}<strong>${escape(t("usePieces"))}</strong><span>${escape(t("usePiecesHint"))}</span></button><button data-action="freeDraw" class="startCard"><svg viewBox="0 0 180 110" aria-hidden="true"><path d="M25 82V22H112V48H155V82Z" fill="#e9f5fd" stroke="#0878c9" stroke-width="3" stroke-dasharray="6 4"/>${[
    [25, 82],
    [25, 22],
    [112, 22],
    [112, 48],
    [155, 48],
    [155, 82],
  ]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#0878c9"/>`)
    .join(
      "",
    )}</svg><strong>${escape(t("drawHouse"))}</strong><span>${escape(t("drawHouseHint"))}</span></button></div><button data-action="example" class="exampleLink">${escape(t("viewExample"))}</button>`;
}
function renderSidebar() {
  sidebarCleanup();
  const host = $("#sidebar"),
    p = currentPart();
  host.classList.toggle(
    "hidden",
    !inspectorMode || !!pending || !!drawing || planOpen || view3d,
  );
  if (!inspectorMode) {
    host.innerHTML = "";
    return;
  }
  let html = `<div class="inspectorHeader"><h2>${escape(t(inspectorMode === "parts" ? "parts" : inspectorMode === "height" ? "roofHeight" : inspectorMode === "shape" ? "roofShape" : "pieceOptions"))}${p && inspectorMode !== "parts" ? " · " + escape(p.name) : ""}</h2>${button("returnToBuild", "done")}</div>`;
  if (inspectorMode === "parts") {
    html += `<div class="inspectorBody roofList">${history.project.parts.map((part) => `<button class="partButton ${part.id === selected ? "selected" : ""}" data-part="${escape(part.id)}"><span class="partLetter">${escape(part.name)}</span><span>${escape(t(part.kind))}</span></button>`).join("")}</div>`;
  } else if (p) {
    html += '<div class="inspectorBody">';
    if (inspectorMode === "height" && p.kind !== "imported") {
      html += `<div class="heightPicture">${roofPicture(previewRoof(history.project), { selected })}</div><div class="range-control"><label class="control-label"><b>${escape(t("roofHeight"))}</b><output>${num(p.pitch ?? 30)}°</output></label><input type="range" min="5" max="60" value="${p.pitch ?? 30}" aria-label="${escape(t("roofHeight"))}"><div class="slopeChoices">${[
        ["gentle", 15],
        ["normal", 30],
        ["steep", 45],
      ]
        .map(
          ([key, value]) =>
            `<button data-pitch="${value}" class="${p.pitch === value ? "selected" : ""}"><svg viewBox="0 0 64 28" aria-hidden="true"><path d="M4 24L32 ${24 - value * 0.43}L60 24" fill="none" stroke="currentColor" stroke-width="3"/></svg>${escape(t(key))}</button>`,
        )
        .join(
          "",
        )}</div></div>${p.pitch === null ? `<p class="sizeHint">${escape(t("previewEstimate"))}</p>${button("setPitch", "setPitch")}` : ""}${["gable", "shed"].includes(p.kind) ? button("turnRidge", "turnRidge") : ""}`;
    } else if (inspectorMode === "shape") {
      html += `<div class="shapeSwitcher">${["gable", "hip", "shed"].map((kind) => `<button data-roof-kind="${kind}" class="${p.kind === kind ? "selected" : ""}">${piecePicture(kind)}<span>${escape(t(kind))}</span></button>`).join("")}</div>`;
    } else {
      html += `<div class="pieceOptions">${["gable", "hip", "shed"].includes(p.kind) ? button("shapeTool", "roofShape") : ""}${p.kind !== "measured" && p.kind !== "imported" ? button("grow", "growRoof") : ""}${button("products", "products")}${button("edit", "exactMeasurements")}${button("water", "waterDirection")}${button("duplicate", "duplicate")}${button("mirror", "mirror")}${button("remove", "remove", 'class="danger"')}</div><section class="accordion-section"><button class="accordion-toggle" aria-expanded="false">${escape(t("moreTools"))}<span aria-hidden="true">⌄</span></button><div class="accordion-panel" hidden>${renderAdvanced()}</div></section>`;
    }
    html += "</div>";
  }
  host.classList.add("shared-panel-controls");
  host.innerHTML = html;
  const accordionCleanup = bindPanelAccordions(host),
    rangeControl = host.querySelector(".range-control");
  const rangeCleanup = rangeControl
    ? bindPanelRange(rangeControl, {
        format: (value) => num(value) + "°",
        onChange: (value, { immediate }) => {
          if (immediate)
            mutate(
              (project) =>
                (project.parts.find((part) => part.id === p.id).pitch = value),
            );
        },
      })
    : () => {};
  sidebarCleanup = () => {
    accordionCleanup();
    rangeCleanup();
  };
}
function updateRoofPicture(project) {
  const host = $("#roofPicture");
  if (host) host.innerHTML = roofPicture(previewRoof(project), { selected });
}
function renderPieceTools() {
  const p = currentPart(),
    host = $("#pieceTools");
  $(".shell").classList.toggle("isPending", !!pending || !!drawing);
  $(".shell").classList.toggle("isPlanning", planOpen);
  $(".shell").classList.toggle("is3d", view3d);
  host.classList.toggle("hidden", !p || !!pending || !!drawing || view3d);
  host.innerHTML = p
    ? `<span class="dockIdentity"><span class="partLetter">${escape(p.name)}</span></span>${toolButton("moveTool", "toolMove", "✥", `class="${toolMode === "move" ? "selected" : ""}" aria-pressed="${toolMode === "move"}"`)}${p.kind !== "imported" ? toolButton("resizeTool", "toolSize", "⤢", `class="${toolMode === "resize" ? "selected" : ""}" aria-pressed="${toolMode === "resize"}"`) + toolButton("heightTool", "toolSlope", "△") : ""}${toolButton("details", "toolDetails", "▱")}${toolButton("pieceMenu", "pieceOptions", "⋯")}`
    : "";
}
function detailsPalette() {
  const choices = [
    ...(currentPart()?.kind !== "measured" ? ["dormer"] : []),
    "window",
    "chimney",
  ];
  const images = {
    dormer:
      "M20 65V38L50 15L80 38V65Z M35 65V42H65V65 M10 72L20 65 M80 65L90 72",
    window:
      "M20 65L32 20H78L66 65Z M38 26L29 58H61L70 26Z M40 43H66 M52 26L43 58",
    chimney: "M25 62V20L60 10L80 20V62L45 76Z M25 20L45 32L80 20 M45 32V76",
  };
  showPanel(
    t("quickTools"),
    `<div class="choiceGrid">${choices.map((kind) => `<button class="choice" data-detail="${kind}"><svg viewBox="0 0 100 90" aria-hidden="true"><path d="${images[kind]}" fill="#e9f5fd" stroke="#0878c9" stroke-width="3"/></svg><span>${escape(t(kind))}</span></button>`).join("")}</div>`,
    button("cancel", "cancel"),
  );
  panel.classList.add("buildTray");
}
function beginDrawing(measured = false) {
  cancel();
  view(false);
  selected = null;
  selectedFace = null;
  drawing = { points: [], cursor: null, measured, align: true };
  renderWelcome();
  renderPieceTools();
  renderSidebar();
  updateDrawingPanel();
  draw();
}
function updateDrawingPanel() {
  if (!drawing) return;
  $("#instruction").textContent = t("outlineInstruction");
  showPanel(
    t(drawing.measured ? "drawSurface" : "drawHouse"),
    `<p>${drawing.points.length} ${escape(t("outlineCorners"))}</p><label class="check"><input type="checkbox" data-align ${drawing.align ? "checked" : ""}>${escape(t("straightLines"))}</label>`,
    button("cancel", "cancel") +
      button(
        "backCorner",
        "backCorner",
        drawing.points.length ? "" : "disabled",
      ) +
      button(
        "finishOutline",
        "finishOutline",
        `class="primary" ${drawing.points.length < 3 ? "disabled" : ""}`,
      ),
  );
  panel.classList.add("placement", "drawingPanel");
}
function drawSnap(point) {
  if (!drawing?.align || !drawing.points.length) return point;
  const last = drawing.points.at(-1),
    first = drawing.points[0],
    threshold = 14 / scale;
  if (
    drawing.points.length >= 3 &&
    Math.hypot(point.x - first.x, point.y - first.y) < 24 / scale
  )
    return { ...first };
  let p = { ...point };
  const dx = p.x - last.x,
    dy = p.y - last.y,
    angle = Math.atan2(dy, dx),
    snap = (Math.round(angle / (Math.PI / 4)) * Math.PI) / 4;
  if (Math.abs(angle - snap) < 0.09) {
    const length = Math.hypot(dx, dy);
    p = {
      x: last.x + Math.cos(snap) * length,
      y: last.y + Math.sin(snap) * length,
    };
  }
  for (const corner of drawing.points) {
    if (Math.abs(p.x - corner.x) < threshold) p.x = corner.x;
    if (Math.abs(p.y - corner.y) < threshold) p.y = corner.y;
  }
  return p;
}
function finishDrawing() {
  if (!drawing || drawing.points.length < 3) return;
  try {
    const n = normalizeOutline(drawing.points),
      project = clone(history.project);
    const measured = drawing.measured;
    const part = newPart(project, measured ? "measured" : "gable", {
      width: n.width,
      depth: n.depth,
      x: n.x,
      z: measured ? n.z + n.depth : n.z,
      ...(measured
        ? {
            shape: "custom",
            vertices: n.vertices
              .map((p) => ({ x: p.x, y: n.depth - p.y }))
              .reverse(),
          }
        : { footprint: n.vertices }),
    });
    project.parts.push(part);
    validateProject(project);
    drawing = null;
    selected = part.id;
    selectedFace = part.id + ":0";
    startPending(project, part.id);
    quickPlacePanel();
    renderWelcome();
    renderSidebar();
    fit(true);
  } catch (error) {
    status(friendly(error), true);
  }
}
function sectionDimension() {
  const part = currentPart();
  if (!part) return;
  startPending(
    clone(history.project),
    part.id,
    part.footprint ? "footprintEdge" : "edit",
  );
  if (part.footprint) {
    const points = sectionOutline(part),
      a = points[selectedEdge],
      b = points[(selectedEdge + 1) % points.length];
    pending.edge = selectedEdge;
    showPanel(
      t("changeSize"),
      field("edgeLength", Math.hypot(a.x - b.x, a.y - b.y)),
    );
  } else {
    const key = selectedEdge % 2 ? "depth" : "width";
    showPanel(t("changeSize"), field(key, part[key]));
  }
  draw();
}
function resizeFootprintEdge(part, edge, length) {
  const temp = {
    ...part,
    kind: "measured",
    shape: "custom",
    vertices: sectionOutline(part),
    constraints: { ...part.constraints },
    diagonals: {},
  };
  delete temp.constraints[edge];
  setEdgeLength(temp, edge, length);
  const n = normalizeOutline(temp.vertices),
    shift = sectionBoard(part, { x: n.x, y: n.z });
  part.x = shift.x;
  part.z = shift.y;
  part.footprint = n.vertices;
  part.width = n.width;
  part.depth = n.depth;
  part.constraints = temp.constraints;
}
function chooseWaterEdge() {
  mutate((project) => {
    const part = project.parts.find((p) => p.id === selected);
    if (part.kind === "measured") {
      const points = shapePoints(part),
        a = points[selectedEdge],
        b = points[(selectedEdge + 1) % points.length];
      changeDownhill(part, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    } else {
      part.waterEdge = selectedEdge;
      part.slopeReversed = false;
      delete part.roofAxisAngle;
    }
    part.edgeRoles[selectedEdge] = "gutter";
  });
}
function draw() {
  if (view3d) return;
  const project =
    pending?.validProject || drag?.validProject || history.project;
  updateRoofPicture(project);
  let display;
  try {
    display = resolveProject(project);
  } catch {
    display = resolved;
  }
  let html =
    '<defs><pattern id="grid" width="' +
    scale +
    '" height="' +
    scale +
    '" patternUnits="userSpaceOnUse" x="' +
    pan.x +
    '" y="' +
    pan.y +
    '"><circle cx="0" cy="0" r="1" fill="#bacbbc"/></pattern><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="#397da6"/></marker></defs><rect width="100%" height="100%" fill="url(#grid)"/>';
  for (const face of display.faces) {
    const ghost = pending && face.part.id === pending.partId;
    const active =
      face.part.id === selected && (face.id === selectedFace || !selectedFace);
    const polygons = face.rings.map((poly) =>
      poly.map(face.toBoard).map(pointToScreen),
    );
    const d = polygons
      .map((poly) => "M" + path(poly).replaceAll(" ", "L") + "Z")
      .join("");
    html +=
      '<path d="' +
      d +
      '" fill-rule="evenodd" class="face ' +
      (active ? "active " : "") +
      (ghost ? "preview " : "") +
      (face.part.id === errorPart ? "faceError" : "") +
      '" data-face="' +
      escape(face.id) +
      '"/>';
    const box = bounds(polygons.flat());
    html +=
      '<text x="' +
      (box.minX + box.width / 2) +
      '" y="' +
      (box.minY + box.height / 2) +
      '" text-anchor="middle" class="faceLabel">' +
      escape(face.label) +
      "</text>";
    for (const { role, edge } of face.edgeAnnotations) {
      const [a, b] = edge.map(face.toBoard).map(pointToScreen);
      html +=
        '<line x1="' +
        a.x +
        '" y1="' +
        a.y +
        '" x2="' +
        b.x +
        '" y2="' +
        b.y +
        '" stroke="#397da6" stroke-width="3" pointer-events="none"/><text x="' +
        (a.x + b.x) / 2 +
        '" y="' +
        ((a.y + b.y) / 2 + 24) +
        '" class="dimension" text-anchor="middle">' +
        escape(t(role === "hip" ? "hipEdge" : role)) +
        "</text>";
    }
    if (active || face.part.id === selected) {
      const mid = {
          x: face.bounds.minX + face.bounds.width / 2,
          y: face.bounds.minY + face.bounds.height / 2,
        },
        a = pointToScreen(face.toBoard({ ...mid, y: mid.y + 0.45 })),
        b = pointToScreen(face.toBoard({ ...mid, y: mid.y - 0.45 }));
      html +=
        '<path d="M' +
        a.x +
        " " +
        a.y +
        "L" +
        b.x +
        " " +
        b.y +
        '" class="flow" marker-end="url(#arrow)"/><text class="dimension" x="' +
        (b.x + 12) +
        '" y="' +
        b.y +
        '">' +
        (active ? escape(t("waterArrow")) : "") +
        "</text>";
    }
  }
  const part = project.parts.find(
    (p) => p.id === selected || p.id === pending?.partId,
  );
  if (part) {
    const raw =
      part.kind === "measured" ? shapePoints(part) : sectionOutline(part);
    const points = raw
      .map((p) =>
        part.kind === "measured" ? boardPoint(part, p) : sectionBoard(part, p),
      )
      .map(pointToScreen);
    let cornerControls = "";
    const growTargets = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        length = Math.hypot(
          raw[i].x - raw[(i + 1) % raw.length].x,
          raw[i].y - raw[(i + 1) % raw.length].y,
        );
      html +=
        '<line x1="' +
        a.x +
        '" y1="' +
        a.y +
        '" x2="' +
        b.x +
        '" y2="' +
        b.y +
        '" class="edgeHit" data-edge="' +
        i +
        '"/>';
      if ((toolMode === "resize" && i === selectedEdge) || waterPicking)
        html +=
          '<line x1="' +
          a.x +
          '" y1="' +
          a.y +
          '" x2="' +
          b.x +
          '" y2="' +
          b.y +
          '" class="edgeHighlight" pointer-events="none"/>';
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (
        !pending &&
        !drawing &&
        part.kind !== "measured" &&
        part.kind !== "imported" &&
        !waterPicking
      ) {
        const offset = innerWidth <= 800 ? 38 : 55;
        const length = Math.hypot(b.x - a.x, b.y - a.y),
          x = middle.x + ((b.y - a.y) / length) * offset,
          y = middle.y - ((b.x - a.x) / length) * offset;
        if (
          length >= 90 &&
          growTargets.every((p) => Math.hypot(p.x - x, p.y - y) >= 58)
        ) {
          growTargets.push({ x, y });
          html += `<g class="growHandle" data-grow="${i}" role="button" tabindex="0" aria-label="${escape(t("growRoof"))} ${i + 1}"><circle cx="${x}" cy="${y}" r="24"/><text x="${x}" y="${y + 7}" text-anchor="middle">+</text></g>`;
        }
      }
      const hitWidth = Math.max(48, distance(length).length * 10 + 20);
      if (toolMode === "resize" || waterPicking) {
        html +=
          '<rect x="' +
          (middle.x - hitWidth / 2) +
          '" y="' +
          (middle.y - 44) +
          '" width="' +
          hitWidth +
          '" height="48" class="dimensionHit" data-dimension="' +
          i +
          '" tabindex="' +
          (pending ? -1 : 0) +
          '" role="button" aria-label="' +
          escape(t("edgeLength") + " " + (i + 1) + " · " + distance(length)) +
          '"/>';
        html +=
          '<text x="' +
          middle.x +
          '" y="' +
          (middle.y - 10) +
          '" text-anchor="middle" class="dimension" data-dimension="' +
          i +
          '">' +
          escape(distance(length)) +
          (part.constraints[i] ? " ✓" : "") +
          "</text>";
      }
      if (
        toolMode === "resize" &&
        !pending?.feature &&
        part.kind !== "imported"
      ) {
        cornerControls +=
          '<circle cx="' +
          a.x +
          '" cy="' +
          a.y +
          '" r="8" class="handle" data-handle="' +
          i +
          '"/><circle cx="' +
          a.x +
          '" cy="' +
          a.y +
          '" r="24" class="handleHit" data-handle="' +
          i +
          '"/>';
      }
    }
    // Handles must sit above every edge hit area, including the closing edge.
    html += cornerControls;
    const diagonalCorner =
      part.kind === "measured"
        ? pending?.type === "diagonal"
          ? pending.corner
          : nextDiagonalCorner(part)
        : null;
    if (
      part.kind === "measured" &&
      part.shape === "custom" &&
      diagonalCorner !== null &&
      (pending?.type === "diagonal" ||
        Object.keys(part.constraints).length >= points.length - 1)
    ) {
      const a = points[0],
        b = points[diagonalCorner];
      html +=
        '<line x1="' +
        a.x +
        '" y1="' +
        a.y +
        '" x2="' +
        b.x +
        '" y2="' +
        b.y +
        '" stroke="#b5760b" stroke-width="3" stroke-dasharray="7 5"/><text x="' +
        (a.x + b.x) / 2 +
        '" y="' +
        ((a.y + b.y) / 2 - 12) +
        '" class="dimension">' +
        escape(t("diagonal") + " 1 → " + (diagonalCorner + 1)) +
        " ?</text>";
    }
  }
  if (pending?.feature) {
    const face =
        display.faces.find((f) => f.id === pending.faceId) || currentFace(),
      o = pending.feature;
    if (face) {
      const points = openingCorners(o).map(face.toBoard).map(pointToScreen);
      html +=
        '<polygon points="' +
        path(points) +
        '" class="face preview" pointer-events="none"/>';
    }
  }
  if (drawing) {
    const points = drawing.points.map(pointToScreen),
      cursor = drawing.cursor ? pointToScreen(drawing.cursor) : null;
    if (points.length) {
      const previewPoints = [...points, ...(cursor ? [cursor] : [])];
      if (previewPoints.length >= 3)
        html += `<polygon points="${path(previewPoints)}" class="drawnFill"/>`;
      html += `<polyline points="${path(previewPoints)}" class="drawnLine"/>`;
      points.forEach((p, i) => {
        html += `<circle cx="${p.x}" cy="${p.y}" r="${i === 0 ? 12 : 6}" class="drawnCorner"/><text x="${p.x + 16}" y="${p.y - 13}" class="dimension" pointer-events="none">${i + 1}</text>`;
      });
      if (cursor) {
        const last = points.at(-1),
          world = drawing.points.at(-1);
        html += `<text x="${(last.x + cursor.x) / 2}" y="${(last.y + cursor.y) / 2 - 12}" class="dimension" pointer-events="none">${escape(distance(Math.hypot(drawing.cursor.x - world.x, drawing.cursor.y - world.y)))}</text>`;
      }
      if (drawing.points.length >= 3) {
        try {
          const raw = [...drawing.points];
          if (
            drawing.cursor &&
            Math.hypot(
              drawing.cursor.x - raw.at(-1).x,
              drawing.cursor.y - raw.at(-1).y,
            ) > 0.1 &&
            Math.hypot(
              drawing.cursor.x - raw[0].x,
              drawing.cursor.y - raw[0].y,
            ) > 0.1
          )
            raw.push(drawing.cursor);
          const n = normalizeOutline(raw),
            project = clone(history.project);
          project.parts.push(
            newPart(project, "gable", {
              x: n.x,
              z: n.z,
              width: n.width,
              depth: n.depth,
              footprint: n.vertices,
            }),
          );
          updateRoofPicture(project);
        } catch {
          /* An unfinished outline can cross itself while the cursor moves. */
        }
      }
    }
  }
  if (
    !display.faces.length &&
    !drawing &&
    $("#welcome").classList.contains("hidden")
  )
    html +=
      '<text x="' +
      boardSize.width / 2 +
      '" y="' +
      boardSize.height / 2 +
      '" text-anchor="middle" class="faceLabel">' +
      escape(t("empty")) +
      "</text>";
  if (snapped && snapTarget && pending) {
    const p = pointToScreen(snapTarget);
    html +=
      '<circle cx="' +
      p.x +
      '" cy="' +
      p.y +
      '" r="12" fill="none" stroke="#1264c2" stroke-width="3"/><text x="' +
      (p.x + 16) +
      '" y="' +
      (p.y - 15) +
      '" class="dimension">' +
      escape(t("snap")) +
      "</text>";
  }
  board.innerHTML = html;
}
function sectionBoard(part, p) {
  const angle = radians(part.rotation);
  return {
    x: part.x + p.x * Math.cos(angle) - p.y * Math.sin(angle),
    y: part.z + p.x * Math.sin(angle) + p.y * Math.cos(angle),
  };
}
function fit(preview = false) {
  if (viewer) {
    viewer.fit();
    return;
  }
  if (!resolved.faces.length && !(preview && pending?.validProject)) {
    scale = Math.max(
      10,
      Math.min(60, (boardSize.width - 80) / 12, (boardSize.height - 110) / 9),
    );
    pan = { x: boardSize.width / 2, y: boardSize.height / 2 };
    draw();
    return;
  }
  const display =
      preview && pending?.validProject
        ? resolveProject(pending.validProject)
        : resolved,
    points = display.faces.flatMap((f) =>
      f.polygons.flatMap((poly) => poly.map(f.toBoard)),
    ),
    b = bounds(points),
    width =
      preview &&
      boardSize.width > 800 &&
      !panel.classList.contains("quickPlacement")
        ? boardSize.width - 450
        : boardSize.width;
  scale = Math.max(
    5,
    Math.min(
      90,
      (width - (innerWidth <= 800 ? 140 : 170)) / Math.max(3, b.width),
      (boardSize.height - (innerWidth <= 360 ? 400 : 300)) /
        Math.max(3, b.height),
    ),
  );
  pan = {
    x: width / 2 - (b.minX + b.width / 2) * scale,
    y:
      (boardSize.height - 40) / 2 +
      (innerWidth <= 360 ? 40 : 0) -
      (b.minY + b.height / 2) * scale,
  };
  draw();
}
function showPanel(
  title,
  body,
  footer = button("cancel", "cancel") +
    button("apply", "apply", 'class="primary"'),
) {
  panel.innerHTML =
    '<div class="panelHeader"><h2>' +
    escape(title) +
    '</h2></div><div class="panelBody">' +
    body +
    '</div><div class="panelFooter">' +
    footer +
    "</div>";
  inspectorMode = null;
  renderSidebar();
  panel.classList.remove(
    "buildTray",
    "hidden",
    "placement",
    "quickPlacement",
    "drawingPanel",
  );
  panel.querySelector("button,input,select")?.focus();
}
function cancel() {
  const previous = pending?.returnSelection || drawing?.returnSelection;
  if (previous) {
    selected = previous.id;
    selectedFace = previous.face;
    toolMode = previous.tool;
  }
  pending = null;
  inspectorMode = null;
  drawing = null;
  waterPicking = false;
  snapped = false;
  panel.classList.add("hidden");
  errorPart = null;
  render();
  status("readyToBuild");
  $("[data-action=add]")?.focus();
}
function startPending(project, partId, type = "add") {
  pending = {
    project,
    baseProject: clone(project),
    partId,
    type,
    validProject: clone(project),
  };
  view(false);
  renderPieceTools();
  renderSidebar();
}
function preview() {
  if (!pending) return;
  try {
    validateProject(pending.project);
    pending.validProject = clone(pending.project);
    errorPart = null;
    draw();
    status(snapped ? "snap" : "editing");
  } catch (error) {
    fail(error, pending.partId);
  }
}
function field(
  key,
  value,
  unit = units.unit,
  attribute = "",
  isDistance = true,
) {
  return (
    "<label>" +
    escape(t(key)) +
    '<span class="inputRow"><input data-field="' +
    key +
    '" inputmode="decimal" value="' +
    escape(num(isDistance ? value * units.factor : value, 3)) +
    '" ' +
    attribute +
    "><span>" +
    escape(unit) +
    "</span></span></label>"
  );
}
function choices(mode = "parts") {
  const items =
    mode === "parts"
      ? ["gable", "hip", "shed", "measured"]
      : ["rectangle", "triangle", "trapezoid", "custom"];
  showPanel(
    t("buildTray"),
    '<div class="choiceGrid">' +
      items
        .map(
          (kind) =>
            '<button class="choice" data-choice="' +
            kind +
            '">' +
            partIcon(mode === "parts" ? kind : "measured", kind) +
            "<span>" +
            escape(t(kind)) +
            "</span></button>",
        )
        .join("") +
      "</div>" +
      (mode === "parts"
        ? button("freeDraw", "drawHouse", 'class="drawChoice"')
        : button("drawSurface", "freeDraw", 'class="drawChoice"')),
    button("cancel", "cancel"),
  );
  panel.classList.add("buildTray");
}
function addPart(kind, shape = "rectangle", attachment = false) {
  const returnSelection = { id: selected, face: selectedFace, tool: toolMode };
  toolMode = "move";
  const project = clone(history.project),
    p = newPart(project, kind, { shape }),
    b = bounds(resolved.faces.flatMap((f) => f.boardPolygons.flat()));
  if (shape === "triangle") p.offset = p.width / 2;
  if (shape === "custom")
    p.vertices = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 4 },
      { x: 5, y: 4 },
      { x: 5, y: 6 },
      { x: 0, y: 6 },
    ];
  if (project.parts.length) {
    p.x = b.maxX + 1;
    p.z = b.minY;
  }
  if (attachment && currentPart()) {
    const parent = currentPart();
    if (parent.kind === "measured") {
      p.x = parent.x + parent.width + 1;
      p.z = parent.z;
    } else {
      const endpoints = sectionOutline(parent),
        a = endpoints[selectedEdge],
        b = endpoints[(selectedEdge + 1) % endpoints.length],
        length = Math.hypot(b.x - a.x, b.y - a.y),
        dx = (b.x - a.x) / length,
        dy = (b.y - a.y) / length,
        inset = Math.min(
          (selectedEdge % 2 ? parent.width : parent.depth) / 2,
          p.width / 3,
        ),
        target = sectionBoard(parent, {
          x: a.x + (dx * (length - p.depth)) / 2 - dy * inset,
          y: a.y + (dy * (length - p.depth)) / 2 + dx * inset,
        });
      p.x = target.x;
      p.z = target.y;
      p.rotation = parent.rotation + (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      p.pitch = parent.pitch;
      p.eave = parent.eave;
      project.connections.push({
        from: parent.id,
        to: p.id,
        fromEdge: selectedEdge,
        type: "section",
      });
    }
  }
  project.parts.push(p);
  selected = p.id;
  selectedFace = p.id + ":0";
  startPending(project, p.id);
  pending.returnSelection = returnSelection;
  if (kind === "measured") measurePanel();
  else quickPlacePanel();
  fit(true);
  renderWelcome();
  renderSidebar();
}
function quickPlacePanel() {
  pending.placing = true;
  $("#instruction").textContent = t(
    toolMode === "resize" ? "resizeHint" : "quickPlace",
  );
  showPanel(
    t("place"),
    `<p>${escape(t("quickPlace"))}</p>`,
    button("cancel", "cancel") +
      (pending.feature?.type === "dormer"
        ? ""
        : toolButton("rotateGhost", "toolRotate", "↻")) +
      toolButton("resizeGhost", "toolSize", "⤢") +
      button("apply", "place", 'class="primary"') +
      button(
        "editPending",
        "exactMeasurements",
        'class="ghostMeasurements hidden"',
      ),
  );
  panel.classList.add("placement", "quickPlacement");
}
function measurePanel() {
  const part = pending.project.parts.find((p) => p.id === pending.partId);
  const size = part.vertices ? bounds(shapePoints(part)) : null;
  let html =
    '<p class="notice">' +
    escape(t(part.confirmed ? "editing" : "suggested")) +
    "</p>" +
    field("width", size?.width ?? part.width) +
    field(
      part.kind === "measured" ? "surfaceHeight" : "depth",
      size?.height ?? part.depth,
    );
  if (part.kind === "measured" && part.shape === "trapezoid")
    html += field("top", part.top) + field("offset", part.offset);
  if (part.kind === "measured" && part.shape === "triangle")
    html += field("offset", part.offset);
  html +=
    field(
      "pitch",
      part.pitch || 0,
      "°",
      part.kind === "imported" ? "disabled" : "",
      false,
    ) +
    (part.kind === "measured"
      ? '<label class="check"><input type="checkbox" data-unknown ' +
        (part.pitch === null ? "checked" : "") +
        ">" +
        escape(t("unknown")) +
        "</label>"
      : "");
  html +=
    field("rotation", part.rotation, "°", "", false) +
    '<div class="actions">' +
    button("rotate45", "rotate45") +
    button("rotate90", "rotate90") +
    "</div>" +
    field("eave", part.eave);
  if (part.kind === "measured")
    html +=
      field("downhill", part.downhill, "°", "", false) +
      '<p class="muted">' +
      escape(t("constraintHint")) +
      "</p>";
  html +=
    '<label class="check"><input type="checkbox" data-confirm ' +
    (part.confirmed ? "checked" : "") +
    ">" +
    escape(t("confirm")) +
    '</label><label class="check"><input type="checkbox" data-free>' +
    escape(t("free")) +
    "</label>";
  showPanel(
    t("measurements") + " · " + part.name,
    html,
    button("cancel", "cancel") +
      button(
        "apply",
        pending.type === "add" ? "place" : "apply",
        'class="primary"',
      ),
  );
}
function edit() {
  const p = currentPart();
  if (!p) return;
  startPending(clone(history.project), p.id, "edit");
  measurePanel();
}
function edgePanel() {
  const part = currentPart();
  if (!part || part.kind !== "measured") return;
  const points = shapePoints(part),
    a = points[selectedEdge],
    b = points[(selectedEdge + 1) % points.length];
  startPending(clone(history.project), part.id, "edge");
  pending.edge = selectedEdge;
  showPanel(
    t("edgeLength"),
    field("edgeLength", Math.hypot(a.x - b.x, a.y - b.y)) +
      '<p class="muted">' +
      escape(t("constraintHint")) +
      "</p>" +
      button("unlock", "unlock"),
    button("cancel", "cancel") + button("apply", "lock", 'class="primary"'),
  );
}
function markPanel() {
  const part = currentPart();
  if (!part) return;
  startPending(clone(history.project), part.id, "mark");
  const roles = [
    "unmarked",
    "gutter",
    "ridge",
    "hipEdge",
    "valley",
    "verge",
    "wall",
  ];
  showPanel(
    t("mark") + " " + (selectedEdge + 1),
    "<label>" +
      escape(t("edge")) +
      "<select data-role>" +
      roles
        .map(
          (role) =>
            '<option value="' +
            (role === "hipEdge" ? "hip" : role) +
            '" ' +
            (part.edgeRoles[selectedEdge] ===
            (role === "hipEdge" ? "hip" : role)
              ? "selected"
              : "") +
            ">" +
            escape(t(role)) +
            "</option>",
        )
        .join("") +
      "</select></label>",
  );
}
function featurePanel(type, retain = false) {
  toolMode = "move";
  const face = currentFace();
  if (!face) return;
  const previous = retain ? clone(pending.feature) : null;
  startPending(clone(history.project), face.part.id, type);
  pending.faceId = face.id;
  pending.feature = previous || {
    id: uid(),
    type: type === "dormer" ? "dormer" : "window",
    faceId: face.id,
    faceIndex: Number(face.role) || 0,
    x: face.bounds.minX + face.bounds.width / 2,
    y: face.bounds.minY + face.bounds.height * (type === "dormer" ? 0.2 : 0.5),
    width: type === "dormer" ? 1.8 : 0.8,
    length: 1.2,
    wallRise: 0.6,
    pitch: 30,
    labelOrdinal: Math.max(
      face.part.nextDormerLabel || 1,
      ...face.part.dormers.map((d, i) => (d.labelOrdinal || i + 1) + 1),
    ),
  };
  const html =
    (type === "opening"
      ? "<label>" +
        escape(t("opening")) +
        '<select data-feature-type><option value="window" ' +
        (pending.feature.type === "window" ? "selected" : "") +
        ">" +
        escape(t("window")) +
        '</option><option value="chimney" ' +
        (pending.feature.type === "chimney" ? "selected" : "") +
        ">" +
        escape(t("chimney")) +
        "</option></select></label>"
      : "") +
    "<p>" +
    escape(t("positionFeature")) +
    "</p>" +
    field("featureWidth", pending.feature.width) +
    field(
      type === "dormer" ? "wallRise" : "featureLength",
      type === "dormer" ? pending.feature.wallRise : pending.feature.length,
    ) +
    (type === "dormer"
      ? field("pitch", pending.feature.pitch, "°", "", false)
      : "");
  showPanel(t(type), html);
  if (!retain && face.part.kind !== "measured") quickPlacePanel();
  previewFeature();
  $("#instruction").textContent = t("positionFeature");
}
function previewFeature() {
  try {
    const project = clone(pending.project),
      part = project.parts.find((p) => p.id === pending.partId);
    part[pending.type === "dormer" ? "dormers" : "openings"].push(
      clone(pending.feature),
    );
    validateProject(project);
    pending.validProject = project;
    errorPart = null;
    draw();
    status("positionFeature");
  } catch (error) {
    fail(error, pending.partId);
  }
}
function productIllustration(product) {
  let lines = "";
  for (let i = 0; i < 8; i++)
    lines += '<path d="M' + (8 + i * 12) + " 6L" + (8 + i * 12) + ' 62"/>';
  if (product.id !== "click")
    for (let y = 16; y < 64; y += 14) lines += '<path d="M4 ' + y + 'H100"/>';
  return (
    '<svg viewBox="0 0 104 68" aria-hidden="true"><rect x="2" y="2" width="100" height="64" rx="4" fill="#4b6354"/><g stroke="#a1b7a5" stroke-width="' +
    (product.id === "click" ? 3 : 2) +
    '">' +
    lines +
    "</g></svg>"
  );
}
function productsPanel() {
  const part = currentPart(),
    id = part?.productId || history.project.productId;
  startPending(clone(history.project), part?.id, "products");
  pending.productId = id;
  pending.scope = part ? "selected" : "all";
  const item = getProduct(id);
  showPanel(
    t("products"),
    "<label>" +
      escape(t("scope")) +
      '<select data-product-scope><option value="selected" ' +
      (!part ? "disabled" : "") +
      ">" +
      escape(t("selectedPart")) +
      '</option><option value="all" ' +
      (!part ? "selected" : "") +
      ">" +
      escape(t("allParts")) +
      "</option></select></label>" +
      PRODUCTS.map(
        (p) =>
          '<button class="productChoice ' +
          (p.id === id ? "selected" : "") +
          '" data-product="' +
          p.id +
          '">' +
          productIllustration(p) +
          "<span>" +
          p.title +
          "<br>" +
          num(p.profile?.usefulWidth || p.continuous.usefulWidth) +
          " mm · " +
          (p.profile
            ? num(p.profile.module) + " mm / " + t("modules")
            : t("length")) +
          "</span></button>",
      ).join("") +
      "<label>" +
      escape(t("finish")) +
      "<select data-finish>" +
      item.finishes
        .map(
          (f) =>
            "<option " +
            ((part?.finish || history.project.finish) === f ? "selected" : "") +
            ">" +
            f +
            "</option>",
        )
        .join("") +
      "</select></label><p>" +
      escape(t("colour")) +
      '</p><div class="swatches">' +
      item.colours
        .map(
          (c) =>
            '<button class="swatch ' +
            (c === (part?.colour || history.project.colour) ? "selected" : "") +
            '" style="background:' +
            c +
            '" data-colour="' +
            c +
            '" aria-label="' +
            escape(t("colour")) +
            " " +
            c +
            '"></button>',
        )
        .join("") +
      '</div><div id="productEvidence"></div>',
  );
  productEvidence(id);
}
function productEvidence(id) {
  const p = getProduct(id);
  $("#productEvidence").innerHTML =
    '<p class="notice">' +
    escape(t("visualModel")) +
    "</p>" +
    p.issues.map((key) => "<p>" + escape(t(key)) + "</p>").join("") +
    '<p><a href="' +
    escape(p.source) +
    '" target="_blank" rel="noopener">' +
    escape(t("source")) +
    '</a> · <a href="' +
    escape(p.evidence[0].url) +
    '" target="_blank" rel="noopener">' +
    escape(t("catalog")) +
    "</a></p>";
}
function connectPanel() {
  const part = currentPart();
  if (!part || part.kind !== "measured") {
    status("measuredConnectionOnly", true);
    return;
  }
  startPending(clone(history.project), part.id, "connect");
  showPanel(
    t("connect"),
    "<p>" +
      escape(t("rigidHint")) +
      "</p><label>" +
      escape(t("connectTo")) +
      "<select data-connect-part>" +
      history.project.parts
        .filter((p) => p.id !== part.id && p.kind === "measured")
        .map(
          (p) =>
            '<option value="' +
            escape(p.id) +
            '">' +
            escape(p.name) +
            "</option>",
        )
        .join("") +
      "</select></label><label>" +
      escape(t("targetEdge")) +
      "<select data-connect-edge></select></label>",
  );
  connectEdges();
}
function connectEdges() {
  const part = history.project.parts.find(
    (p) => p.id === $("[data-connect-part]")?.value,
  );
  $("[data-connect-edge]").innerHTML = part
    ? shapePoints(part)
        .map(
          (p, i, all) =>
            '<option value="' +
            i +
            '">' +
            (i + 1) +
            " · " +
            distance(
              Math.hypot(
                p.x - all[(i + 1) % all.length].x,
                p.y - all[(i + 1) % all.length].y,
              ),
            ) +
            "</option>",
        )
        .join("")
    : "";
}
function apply() {
  if (!pending) {
    cancel();
    return;
  }
  try {
    for (const input of panel.querySelectorAll(
      "input[data-field]:not(:disabled)",
    )) {
      if (input.dataset.field === "pitch" && $("[data-unknown]")?.checked)
        continue;
      parseNumber(input.value);
    }
  } catch (error) {
    return fail(error, pending.partId);
  }
  if (
    innerWidth <= 800 &&
    (pending.type === "add" || pending.feature) &&
    !pending.placing
  ) {
    try {
      validateProject(pending.project);
      pending.placing = true;
      showPanel(
        t("place"),
        "<p>" +
          escape(t(pending.feature ? "positionFeature" : "placing")) +
          "</p>",
        button("cancel", "cancel") +
          button("editPending", "edit") +
          button("apply", "place", 'class="primary"'),
      );
      panel.classList.add("placement");
      fit(true);
      return;
    } catch (error) {
      return fail(error, pending.partId);
    }
  }
  try {
    const project = clone(pending.project),
      part = project.parts.find((p) => p.id === pending.partId);
    if (pending.type === "edge")
      setEdgeLength(
        part,
        pending.edge,
        parseNumber($("[data-field=edgeLength]").value) / units.factor,
      );
    if (pending.type === "footprintEdge")
      resizeFootprintEdge(
        part,
        pending.edge,
        parseNumber($("[data-field=edgeLength]").value) / units.factor,
      );
    if (pending.type === "diagonal")
      setDiagonal(
        part,
        parseNumber($("[data-field=diagonal]").value) / units.factor,
        pending.corner,
      );
    if (pending.type === "mark") {
      part.edgeRoles[selectedEdge] = $("[data-role]").value;
      if (
        part.kind === "measured" &&
        part.edgeRoles[selectedEdge] === "gutter"
      ) {
        const points = shapePoints(part),
          a = points[selectedEdge],
          b = points[(selectedEdge + 1) % points.length];
        changeDownhill(
          part,
          (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
        );
      }
    }
    if (pending.type === "connect")
      attachMeasured(
        project,
        $("[data-connect-part]").value,
        Number($("[data-connect-edge]").value),
        part.id,
        selectedEdge,
      );
    if (pending.feature) {
      part[pending.type === "dormer" ? "dormers" : "openings"].push(
        clone(pending.feature),
      );
      if (pending.type === "dormer")
        part.nextDormerLabel = pending.feature.labelOrdinal + 1;
    }
    if (pending.type === "products") {
      const product = getProduct(pending.productId),
        targets = pending.scope === "all" ? project.parts : [part];
      for (const p of targets) {
        p.productId = product.id;
        p.finish = $("[data-finish]").value;
        p.colour = pending.colour || p.colour;
      }
      project.productId = product.id;
      project.finish = $("[data-finish]").value;
      if (pending.colour) project.colour = pending.colour;
      for (const f of resolveProject(project).faces)
        if (
          !getProduct(f.part.productId).directions.includes(
            project.faceSettings[f.id]?.direction,
          )
        ) {
          if (project.faceSettings[f.id])
            project.faceSettings[f.id].direction = "left";
        }
    }
    validateProject(project);
    pending = null;
    panel.classList.add("hidden");
    commit(project);
    if (!planOpen) fit();
  } catch (error) {
    fail(error, pending?.partId);
  }
}
function outlinePreview(fn, key) {
  try {
    const project = clone(history.project);
    fn(project);
    validateProject(project);
    startPending(project, selected, "edit");
    showPanel(t(key), "<p>" + escape(t("editing")) + "</p>");
    draw();
  } catch (error) {
    fail(error);
  }
}
function modifyOutline(type) {
  const part = currentPart();
  if (!part || part.kind !== "measured") return;
  outlinePreview((project) => {
    const p = project.parts.find((p) => p.id === part.id),
      points = shapePoints(p),
      a = points[selectedEdge],
      b = points[(selectedEdge + 1) % points.length];
    if (p.constraints[selectedEdge]) throw new Error("lockedMeasurement");
    const inserted =
      type === "notch"
        ? (() => {
            const dx = b.x - a.x,
              dy = b.y - a.y,
              len = Math.hypot(dx, dy),
              inset = Math.min(0.5, len / 4);
            return [
              { x: a.x + dx * 0.35, y: a.y + dy * 0.35 },
              {
                x: a.x + dx * 0.35 - (dy / len) * inset,
                y: a.y + dy * 0.35 + (dx / len) * inset,
              },
              {
                x: a.x + dx * 0.65 - (dy / len) * inset,
                y: a.y + dy * 0.65 + (dx / len) * inset,
              },
              { x: a.x + dx * 0.65, y: a.y + dy * 0.65 },
            ];
          })()
        : [{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }];
    points.splice(selectedEdge + 1, 0, ...inserted);
    const locks = {},
      roles = {},
      diagonals = {};
    for (const [k, v] of Object.entries(p.constraints))
      locks[Number(k) > selectedEdge ? Number(k) + inserted.length : k] = v;
    for (const [k, v] of Object.entries(p.edgeRoles))
      roles[Number(k) > selectedEdge ? Number(k) + inserted.length : k] = v;
    for (const [k, v] of Object.entries(p.diagonals || {}))
      diagonals[
        k
          .split(":")
          .map((i) =>
            Number(i) > selectedEdge ? Number(i) + inserted.length : Number(i),
          )
          .join(":")
      ] = v;
    p.vertices = points;
    p.shape = "custom";
    p.constraints = locks;
    p.edgeRoles = roles;
    p.diagonals = diagonals;
  }, type);
}
function removeCorner() {
  const corner = Number($("#selectedCorner").value);
  outlinePreview((project) => {
    const p = project.parts.find((p) => p.id === selected),
      points = shapePoints(p),
      before = (corner + points.length - 1) % points.length;
    if (points.length <= 3) throw new Error("invalidOutline");
    if (
      p.constraints[corner] ||
      p.constraints[before] ||
      Object.keys(p.diagonals || {}).some((k) =>
        k.split(":").map(Number).includes(corner),
      )
    )
      throw new Error("lockedMeasurement");
    points.splice(corner, 1);
    const locks = {},
      roles = {},
      diagonals = {};
    for (const [k, v] of Object.entries(p.constraints))
      locks[Number(k) > corner ? Number(k) - 1 : k] = v;
    for (const [k, v] of Object.entries(p.edgeRoles))
      if (Number(k) !== corner)
        roles[Number(k) > corner ? Number(k) - 1 : k] = v;
    for (const [k, v] of Object.entries(p.diagonals || {}))
      diagonals[
        k
          .split(":")
          .map((i) => (Number(i) > corner ? Number(i) - 1 : Number(i)))
          .join(":")
      ] = v;
    p.vertices = points;
    p.shape = "custom";
    p.constraints = locks;
    p.edgeRoles = roles;
    p.diagonals = diagonals;
    selectedEdge = 0;
  }, "removeCorner");
}
function filePanel() {
  cancel();
  showPanel(
    t("files"),
    '<div class="actions">' +
      button("save", "save") +
      button("open", "open") +
      button("partsTool", "parts") +
      '</div><hr class="divider">' +
      button("copy", "copy") +
      '<hr class="divider"><div class="actions">' +
      button("print", "print") +
      button("csv", "csv") +
      '</div><hr class="divider">' +
      button("example", "example") +
      button("paper", "paper"),
    button("cancel", "close"),
  );
}
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function close() {
  dispose();
  if (parent !== window)
    parent.postMessage({ type: "roof-builder:close" }, location.origin);
  else location.href = "../";
}
async function view(enable) {
  if (enable === view3d) return;
  const request = ++viewRequest;
  view3d = enable;
  inspectorMode = null;
  renderSidebar();
  renderPieceTools();
  $("#board").classList.toggle("hidden", enable);
  $("#viewer").classList.toggle("hidden", !enable);
  $('[data-action="2d"]').classList.toggle("selected", !enable);
  $('[data-action="3d"]').classList.toggle("selected", enable);
  if (!enable) {
    viewer?.dispose();
    viewer = null;
    $("#canvasNotice").classList.add("hidden");
    draw();
    return;
  }
  try {
    const { BuilderViewer } = await import("./viewer.js?v=builder-game-3");
    if (!view3d || disposed || request !== viewRequest) return;
    viewer = new BuilderViewer($("#viewer"));
    viewer.update(previewRoof(pending?.validProject || history.project));
    const notice = $("#canvasNotice");
    notice.innerHTML = resolved.unassembled.length
      ? `<span>${escape(t("previewEstimate"))}</span>${button("2d", "keepDrawing")}${button("setPitch", "setPitch")}`
      : "";
    notice.classList.toggle("hidden", !resolved.unassembled.length);
  } catch (error) {
    if (request !== viewRequest || disposed) return;
    console.warn("Roof builder preview could not load", error);
    viewer?.dispose();
    viewer = null;
    view3d = false;
    $("#board").classList.remove("hidden");
    $("#viewer").classList.add("hidden");
    $('[data-action="2d"]').classList.add("selected");
    $('[data-action="3d"]').classList.remove("selected");
    $("#canvasNotice").classList.add("hidden");
    renderPieceTools();
    status("previewUnavailable", true);
  }
}
function example(paper = false) {
  mutate((project) => {
    if (paper) {
      addPaperSketch(project);
    } else {
      const start = project.parts.length ? 25 : 0;
      project.parts.push(
        newPart(project, "gable", {
          x: start,
          z: 0,
          width: 10,
          depth: 7,
          pitch: 30,
        }),
      );
      project.parts.push(
        newPart(project, "gable", {
          x: start + 3,
          z: 4,
          width: 8,
          depth: 5,
          rotation: 90,
          pitch: 40,
        }),
      );
      project.parts.push(
        newPart(project, "hip", {
          x: start + 10,
          z: 0,
          width: 6,
          depth: 5,
          pitch: 27,
          eave: -0.4,
        }),
      );
      project.parts.push(
        newPart(project, "measured", {
          x: start + 16,
          z: 9,
          width: 6.1,
          depth: 3,
          shape: "triangle",
          offset: 2.8,
        }),
      );
    }
    selected = project.parts.at(-1).id;
    selectedFace = selected + ":0";
  });
  cancel();
  fit();
  if (paper) status("paperNote");
}

root.addEventListener("click", (event) => {
  const el = event.target.closest("button,[data-grow]");
  if (!el) return;
  if (el.dataset.detail) {
    featurePanel(el.dataset.detail === "dormer" ? "dormer" : "opening");
    if (el.dataset.detail === "chimney") {
      pending.feature.type = "chimney";
      previewFeature();
    }
    return;
  }
  if (el.dataset.grow !== undefined) {
    selectedEdge = Number(el.dataset.grow);
    addPart("gable", "rectangle", true);
    return;
  }
  if (el.dataset.roofKind) {
    return mutate((project) => {
      project.parts.find((p) => p.id === selected).kind = el.dataset.roofKind;
    });
  }
  if (el.dataset.pitch) {
    return mutate((project) => {
      project.parts.find((p) => p.id === selected).pitch = Number(
        el.dataset.pitch,
      );
    });
  }
  if (el.dataset.part) {
    cancel();
    selected = el.dataset.part;
    selectedFace = resolved.faces.find((f) => f.part.id === selected)?.id;
    selectedEdge = 0;
    render();
    return;
  }
  if (el.dataset.choice) {
    const choice = el.dataset.choice;
    if (choice === "measured") {
      choices("shapes");
      return;
    }
    const attachment = pending?.attachment;
    addPart(
      ["gable", "hip", "shed"].includes(choice) ? choice : "measured",
      choice,
      attachment,
    );
    return;
  }
  if (el.dataset.product) {
    pending.productId = el.dataset.product;
    panel
      .querySelectorAll("[data-product]")
      .forEach((b) => b.classList.toggle("selected", b === el));
    const select = $("[data-finish]"),
      old = select.value;
    select.innerHTML = getProduct(el.dataset.product)
      .finishes.map(
        (f) =>
          "<option " + (old === f ? "selected" : "") + ">" + f + "</option>",
      )
      .join("");
    if (!getProduct(el.dataset.product).finishes.includes(old))
      select.value = "premium";
    productEvidence(el.dataset.product);
    return;
  }
  if (el.dataset.colour) {
    pending.colour = el.dataset.colour;
    panel
      .querySelectorAll("[data-colour]")
      .forEach((b) => b.classList.toggle("selected", b === el));
    return;
  }
  if (el.dataset.sheet) {
    selectedSheet = { faceId: el.dataset.face, key: el.dataset.sheet };
    selectedFace = el.dataset.face;
    renderPlans();
    return;
  }
  const action = el.dataset.action;
  if (!action) return;
  if (["moveTool", "resizeTool"].includes(action)) {
    if (pending || drawing || !panel.classList.contains("hidden")) cancel();
    inspectorMode = null;
    toolMode = action === "moveTool" ? "move" : "resize";
    view(false);
    render();
    return;
  }
  if (["heightTool", "shapeTool", "pieceMenu", "partsTool"].includes(action)) {
    if (pending || drawing) cancel();
    panel.classList.add("hidden");
    inspectorMode = {
      heightTool: "height",
      shapeTool: "shape",
      pieceMenu: "more",
      partsTool: "parts",
    }[action];
    renderSidebar();
    return;
  }
  if (action === "returnToBuild") {
    inspectorMode = null;
    renderSidebar();
    return;
  }
  if (action === "rotateGhost" && pending) {
    if (pending.feature) {
      pending.feature.rotation = ((pending.feature.rotation || 0) + 45) % 360;
      previewFeature();
    } else {
      const part = pending.project.parts.find((p) => p.id === pending.partId);
      part.rotation = (part.rotation + 45) % 360;
      preview();
    }
    return;
  }
  if (action === "resizeGhost" && pending) {
    if (pending.feature) {
      showPanel(
        t("changeSize"),
        field("featureWidth", pending.feature.width) +
          field(
            pending.type === "dormer" ? "wallRise" : "featureLength",
            pending.type === "dormer"
              ? pending.feature.wallRise
              : pending.feature.length,
          ),
        button("cancel", "cancel") +
          button("resumePlacement", "done", 'class="primary"'),
      );
      return;
    }
    toolMode = toolMode === "resize" ? "move" : "resize";
    el.classList.toggle("selected", toolMode === "resize");
    $(".ghostMeasurements")?.classList.toggle("hidden", toolMode !== "resize");
    $("#instruction").textContent = t(
      toolMode === "resize" ? "resizeHint" : "quickPlace",
    );
    draw();
    return;
  }
  if (action === "details") return detailsPalette();
  if (action === "freeDraw" || action === "drawSurface")
    return beginDrawing(action === "drawSurface");
  if (action === "finishOutline") return finishDrawing();
  if (action === "backCorner") {
    drawing?.points.pop();
    draw();
    updateDrawingPanel();
    return;
  }
  if (action === "grow") {
    cancel();
    waterPicking = "grow";
    $("#instruction").textContent = t("growHint");
    draw();
    return;
  }
  if (action === "water") {
    cancel();
    waterPicking = true;
    $("#instruction").textContent = t("waterInstruction");
    draw();
    return;
  }
  if (action === "rotateRoof")
    return mutate((project) => {
      project.parts.find((p) => p.id === selected).rotation += 90;
    });
  if (action === "turnRidge") {
    if (currentPart()?.kind === "measured") {
      $("[data-action=water]").click();
      return;
    }
    return mutate((project) => {
      const p = project.parts.find((p) => p.id === selected),
        points = sectionOutline(p);
      let angle = p.roofAxisAngle ?? (p.ridgeAcross ? 0 : 90);
      if (p.waterEdge !== undefined) {
        const a = points[p.waterEdge],
          b = points[(p.waterEdge + 1) % points.length];
        angle = (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180) / Math.PI;
      }
      p.roofAxisAngle = (((angle + 90) % 180) + 180) % 180;
      delete p.waterEdge;
    });
  }
  if (action === "setPitch") {
    const face =
      resolved.faces.find((f) => f.pitch === null && f.part.id === selected) ||
      resolved.faces.find((f) => f.pitch === null) ||
      resolved.faces.find((f) => !f.assembled);
    if (face) {
      selected = face.part.id;
      selectedFace = face.id;
      view(false);
      startPending(clone(history.project), face.part.id, "edit");
      showPanel(
        t("setPitch"),
        field("pitch", face.part.pitch ?? 30, "°", "", false) +
          `<p class="muted">${escape(t("noAngleYet"))}</p>`,
      );
      const input = $("[data-field=pitch]");
      input.value = face.part.pitch === null ? "" : num(face.part.pitch);
      input.focus();
      $("#instruction").textContent = t("setPitch");
    }
    return;
  }
  if (action === "close") return close();
  if (action === "cancel") return cancel();
  if (action === "apply") return apply();
  if (action === "resumePlacement" && pending) {
    quickPlacePanel();
    draw();
    return;
  }
  if (action === "editPending") {
    pending.placing = false;
    if (pending.feature) return featurePanel(pending.type, true);
    return measurePanel();
  }
  if (action === "add") {
    cancel();
    choices();
    return;
  }
  if (action === "undo" || action === "redo") {
    cancel();
    if (history[action]()) {
      resolved = resolveProject(history.project);
      saveProgress();
      render();
    }
    return;
  }
  if (action === "fit") return fit();
  if (action === "2d" || action === "3d") return view(action === "3d");
  if (action === "zoomIn" || action === "zoomOut") {
    const factor = action === "zoomIn" ? 1.25 : 0.8;
    if (viewer) return viewer.zoom(1 / factor);
    const centre = { x: boardSize.width / 2, y: boardSize.height / 2 },
      world = pointToWorld(centre);
    scale = Math.max(5, Math.min(240, scale * factor));
    pan = { x: centre.x - world.x * scale, y: centre.y - world.y * scale };
    draw();
    return;
  }
  if (action === "edit") {
    view(false);
    return edit();
  }
  if (action === "edge") return edgePanel();
  if (action === "mark") return markPanel();
  if (action === "connect") return connectPanel();
  if (action === "rotate45" || action === "rotate90") {
    const p = pending.project.parts.find((p) => p.id === pending.partId);
    p.rotation = (p.rotation + (action === "rotate45" ? 45 : 90)) % 360;
    $("[data-field=rotation]").value = num(p.rotation);
    preview();
    return;
  }
  if (action === "diagonal") {
    const p = currentPart(),
      points = shapePoints(p);
    startPending(clone(history.project), p.id, "diagonal");
    pending.corner = nextDiagonalCorner(p) ?? 2;
    showPanel(
      t("diagonal"),
      "<label>" +
        escape(t("corner")) +
        " 1 → <select data-diagonal-corner>" +
        points
          .slice(2, -1)
          .map(
            (_, i) =>
              '<option value="' +
              (i + 2) +
              '" ' +
              (pending.corner === i + 2 ? "selected" : "") +
              ">" +
              (i + 3) +
              "</option>",
          )
          .join("") +
        "</select></label>" +
        field(
          "diagonal",
          Math.hypot(
            points[0].x - points[pending.corner].x,
            points[0].y - points[pending.corner].y,
          ),
        ) +
        "<p>" +
        escape(t("constraintHint")) +
        "</p>",
    );
    draw();
    return;
  }
  if (action === "attach") {
    const parentId = selected;
    choices();
    pending = { attachment: true, parentId };
    return;
  }
  if (action === "extend") {
    if (currentPart()?.kind === "measured")
      return status("constraintHint", true);
    edit();
    const part = pending.project.parts.find((p) => p.id === selected);
    extendSection(part, selectedEdge);
    measurePanel();
    preview();
    return;
  }
  if (action === "move") {
    const part = currentPart();
    if (!part) return;
    startPending(clone(history.project), part.id, "move");
    showPanel(
      t("move"),
      "<p>" +
        escape(t("placing")) +
        '</p><label class="check"><input data-free type="checkbox">' +
        escape(t("free")) +
        "</label>",
      button("cancel", "cancel") + button("apply", "place", 'class="primary"'),
    );
    return;
  }
  if (action === "products") return productsPanel();
  if (action === "opening" || action === "dormer") return featurePanel(action);
  if (action === "duplicate" || action === "mirror") {
    try {
      const project = clone(history.project);
      selected = duplicatePart(project, selected, action === "mirror").id;
      selectedFace = selected + ":0";
      startPending(project, selected, "move");
      showPanel(
        t(action),
        "<p>" + escape(t("placing")) + "</p>",
        button("cancel", "cancel") +
          button("apply", "place", 'class="primary"'),
      );
      panel.classList.add("placement");
      fit(true);
    } catch (error) {
      fail(error);
    }
    return;
  }
  if (action === "remove")
    return mutate((project) => {
      project.parts = project.parts.filter((p) => p.id !== selected);
      project.connections = project.connections.filter(
        (c) => c.from !== selected && c.to !== selected,
      );
    });
  if (action === "removeFeature")
    return mutate((project) => {
      const p = project.parts.find((p) => p.id === selected);
      p.openings = p.openings.filter((o) => o.id !== el.dataset.id);
      p.dormers = p.dormers.filter((o) => o.id !== el.dataset.id);
    });
  if (action === "up" || action === "down")
    return mutate((project) => {
      const i = project.parts.findIndex((p) => p.id === selected),
        j = i + (action === "up" ? -1 : 1);
      if (j >= 0 && j < project.parts.length)
        [project.parts[i], project.parts[j]] = [
          project.parts[j],
          project.parts[i],
        ];
    });
  if (action === "unlock") {
    delete pending.project.parts.find((p) => p.id === pending.partId)
      .constraints[pending.edge];
    pending.type = "edit";
    return apply();
  }
  if (action === "addCorner" || action === "notch")
    return modifyOutline(action);
  if (action === "removeCorner") return removeCorner();
  if (action === "files") return filePanel();
  if (action === "save") {
    download(
      JSON.stringify(history.project, null, 2),
      "roof-builder.json",
      "application/json",
    );
    return;
  }
  if (action === "open") return $("#projectFile").click();
  if (action === "copy") {
    if (parent !== window)
      parent.postMessage({ type: "roof-builder:copy" }, location.origin);
    return;
  }
  if (action === "example" || action === "paper")
    return example(action === "paper");
  if (action === "plan") {
    cancel();
    planOpen = true;
    renderPieceTools();
    renderPlans();
    plans.classList.remove("hidden");
    return;
  }
  if (action === "closePlan") {
    planOpen = false;
    plans.classList.add("hidden");
    render();
    return;
  }
  if (action === "csv") {
    const r = createSheetReport(history.project, resolved);
    download(reportCsv(r, t), "roof-sheets.csv", "text/csv;charset=utf-8");
    return;
  }
  if (action === "print") return printProject();
  if (action === "splitApply" || action === "recommend")
    return splitApply(action === "recommend");
  if (action === "review")
    return mutate((project) => {
      const f = resolved.faces.find((f) => f.id === selectedFace);
      if (!f) return;
      const settings = (project.faceSettings[f.id] ||= {});
      settings.review = false;
      settings.fingerprint = faceFingerprint(f, settings);
    });
});
root.addEventListener("input", (event) => {
  const el = event.target;
  if (!pending?.project) return;
  if (el.hasAttribute("data-confirm")) {
    pending.project.parts.find((p) => p.id === pending.partId).confirmed =
      el.checked;
    return preview();
  }
  if (el.hasAttribute("data-unknown")) {
    pending.project.parts.find((p) => p.id === pending.partId).pitch =
      el.checked ? null : parseNumber($("[data-field=pitch]").value);
    return preview();
  }
  if (
    el.dataset.field &&
    ["edge", "diagonal", "footprintEdge"].includes(pending.type)
  ) {
    try {
      const project = clone(pending.baseProject),
        part = project.parts.find((p) => p.id === pending.partId);
      if (pending.type === "footprintEdge")
        resizeFootprintEdge(
          part,
          pending.edge,
          parseNumber(el.value) / units.factor,
        );
      else if (pending.type === "edge")
        setEdgeLength(part, pending.edge, parseNumber(el.value) / units.factor);
      else
        setDiagonal(part, parseNumber(el.value) / units.factor, pending.corner);
      pending.project = project;
      preview();
    } catch (error) {
      fail(error, pending.partId);
    }
    return;
  }
  if (el.dataset.field && pending.type !== "edge") {
    try {
      const raw = parseNumber(el.value),
        key = el.dataset.field,
        part = pending.project.parts.find((p) => p.id === pending.partId);
      if (pending.feature) {
        const map = {
          featureWidth: "width",
          featureLength: "length",
          wallRise: "wallRise",
          pitch: "pitch",
        };
        pending.feature[map[key]] = key === "pitch" ? raw : raw / units.factor;
        previewFeature();
      } else {
        const mapped = key === "surfaceHeight" ? "depth" : key,
          value = ["pitch", "rotation", "downhill"].includes(key)
            ? raw
            : raw / units.factor;
        if (part.vertices && ["width", "depth"].includes(mapped)) {
          const points = shapePoints(part),
            b = bounds(points),
            ratio = value / (mapped === "width" ? b.width : b.height);
          part.vertices = points.map((p) => ({
            ...p,
            [mapped === "width" ? "x" : "y"]:
              p[mapped === "width" ? "x" : "y"] * ratio,
          }));
        }
        if (part.kind === "imported" && ["width", "depth"].includes(mapped)) {
          const axis = mapped === "width" ? "x" : "z",
            min = Math.min(...part.layout.vertices.map((v) => v[axis])),
            ratio = value / part[mapped];
          part.layout.vertices.forEach(
            (v) => (v[axis] = min + (v[axis] - min) * ratio),
          );
          part.layout.roofWindows?.forEach(
            (w) => (w[axis] = min + (w[axis] - min) * ratio),
          );
        }
        if (mapped === "downhill") changeDownhill(part, value);
        else part[mapped] = value;
        if (key === "pitch" && $("[data-unknown]")?.checked)
          $("[data-unknown]").checked = false;
        preview();
      }
    } catch (error) {
      fail(error, pending.partId);
    }
  }
});
root.addEventListener("change", (event) => {
  const el = event.target;
  if (el.hasAttribute("data-align") && drawing) {
    drawing.align = el.checked;
    return;
  }
  if (el.id === "selectedEdge") {
    selectedEdge = Number(el.value);
    draw();
    return;
  }
  if (el.id === "selectedFaceSelect") {
    selectedFace = el.value;
    draw();
    return;
  }
  if (el.hasAttribute("data-connect-part")) return connectEdges();
  if (el.hasAttribute("data-diagonal-corner")) {
    pending.corner = Number(el.value);
    pending.project = clone(pending.baseProject);
    const points = shapePoints(
      pending.project.parts.find((p) => p.id === pending.partId),
    );
    $("[data-field=diagonal]").value = num(
      Math.hypot(
        points[0].x - points[pending.corner].x,
        points[0].y - points[pending.corner].y,
      ) * units.factor,
      3,
    );
    return preview();
  }
  if (el.hasAttribute("data-product-scope")) pending.scope = el.value;
  if (el.hasAttribute("data-feature-type")) {
    pending.feature.type = el.value;
    previewFeature();
  }
  if (el.hasAttribute("data-plan-setting")) {
    try {
      const f = resolved.faces.find((f) => f.id === selectedFace);
      mutate((project) => {
        const settings = (project.faceSettings[f.id] ||= {});
        settings[el.dataset.planSetting] =
          el.dataset.planSetting === "offset"
            ? parseNumber(el.value)
            : el.value;
        planFace(f, { ...settings, partitions: {} });
      });
    } catch (error) {
      fail(error);
    }
  }
});
$("#projectFile").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  try {
    if (file.size > 2e6) throw new Error("invalidProject");
    const project = validateProjectFile(JSON.parse(await file.text()));
    pending = null;
    panel.classList.add("hidden");
    selected = null;
    selectedFace = null;
    commit(project);
    fit();
    status("loaded");
  } catch {
    status("invalidProject", true);
  }
});
function localEvent(event) {
  const rect = board.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
board.addEventListener("pointerdown", (event) => {
  if (event.button > 0) return;
  const screen = localEvent(event);
  pointers.set(event.pointerId, screen);
  board.setPointerCapture(event.pointerId);
  if (pointers.size === 2) {
    drag = null;
    const [a, b] = [...pointers.values()];
    pinch = {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      scale,
      world: pointToWorld({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
    };
    return;
  }
  const world = pointToWorld(screen),
    target = event.target;
  if (drawing) {
    drag = { type: "draw", start: screen };
    return;
  }
  if (
    waterPicking &&
    (target.dataset.edge !== undefined ||
      target.dataset.dimension !== undefined)
  ) {
    selectedEdge = Number(target.dataset.edge ?? target.dataset.dimension);
    if (waterPicking === "grow") {
      waterPicking = false;
      return addPart("gable", "rectangle", true);
    }
    waterPicking = false;
    return chooseWaterEdge();
  }
  if (
    pending?.project &&
    !pending.feature &&
    target.dataset.dimension !== undefined &&
    toolMode === "resize"
  ) {
    const part = pending.project.parts.find((p) => p.id === pending.partId);
    if (!part.footprint) {
      const key = Number(target.dataset.dimension) % 2 ? "depth" : "width";
      showPanel(
        t("changeSize"),
        field(key, part[key]),
        button("cancel", "cancel") +
          button("resumePlacement", "done", 'class="primary"'),
      );
      return;
    }
  }
  if (target.dataset.handle !== undefined && toolMode === "resize") {
    drag = {
      type: "handle",
      staged: !!pending,
      handle: Number(target.dataset.handle),
      start: screen,
      project: clone(pending?.project || history.project),
      validProject: clone(pending?.project || history.project),
    };
    return;
  }
  if (
    pending?.project &&
    (pending.type === "add" || pending.type === "move" || pending.feature)
  ) {
    if (pending.feature) {
      const face = currentFace();
      const p = face.toLocalBoard(world);
      pending.feature.x = p.x;
      pending.feature.y = p.y;
      previewFeature();
    } else {
      const p = pending.project.parts.find((p) => p.id === pending.partId);
      const snap = snapPoint(world, p.id);
      const centre = sectionBoard(p, { x: p.width / 2, y: p.depth / 2 });
      // Keep a grab on the preview in place; empty-board clicks centre the piece.
      const grabbed =
        target.dataset.face && target.classList.contains("preview");
      if (!grabbed) {
        p.x += snap.x - centre.x;
        p.z += snap.y - centre.y;
      }
      pending.grabOffset = { x: world.x - p.x, y: world.y - p.z };
      preview();
    }
    drag = { type: "preview", start: screen };
    return;
  }
  if (target.dataset.dimension !== undefined) {
    if (event.pointerType === "touch") {
      drag = {
        type: "dimension",
        edge: Number(target.dataset.dimension),
        start: screen,
      };
      return;
    }
    selectedEdge = Number(target.dataset.dimension);
    currentPart()?.kind === "measured" ? edgePanel() : sectionDimension();
    return;
  }
  if (target.closest("[data-grow]")) return;
  if (target.dataset.handle !== undefined && !pending) {
    drag = {
      type: "handle",
      handle: Number(target.dataset.handle),
      start: screen,
      project: clone(history.project),
      validProject: clone(history.project),
    };
    return;
  }
  if (target.dataset.edge !== undefined) {
    selectedEdge = Number(target.dataset.edge);
    if (waterPicking === "grow") {
      waterPicking = false;
      return addPart("gable", "rectangle", true);
    }
    if (waterPicking) {
      waterPicking = false;
      return chooseWaterEdge();
    }
    renderSidebar();
    draw();
    return;
  }
  if (target.dataset.face) {
    if (pending) cancel();
    selectedFace = target.dataset.face;
    selected = resolved.faces.find((f) => f.id === selectedFace)?.part.id;
    render();
    if (toolMode !== "move") return;
    drag = {
      type: "part",
      start: screen,
      world,
      project: clone(history.project),
      validProject: clone(history.project),
    };
    return;
  }
  drag = { type: "pan", start: screen, pan: { ...pan } };
});
board.addEventListener("pointermove", (event) => {
  if (drawing && !pinch) {
    drawing.cursor = drawSnap(pointToWorld(localEvent(event)));
    draw();
  }
  if (!pointers.has(event.pointerId)) return;
  const screen = localEvent(event);
  pointers.set(event.pointerId, screen);
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()],
      centre = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    scale = Math.max(
      5,
      Math.min(
        240,
        (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.distance,
      ),
    );
    pan = {
      x: centre.x - pinch.world.x * scale,
      y: centre.y - pinch.world.y * scale,
    };
    draw();
    return;
  }
  if (!drag) return;
  if (drag.type === "draw") {
    if (Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) > 12)
      drag.moved = true;
    return;
  }
  if (drag.type === "dimension") {
    if (Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) > 8)
      drag.moved = true;
    return;
  }
  if (drag.type === "pan") {
    pan = {
      x: drag.pan.x + screen.x - drag.start.x,
      y: drag.pan.y + screen.y - drag.start.y,
    };
    draw();
    return;
  }
  if (drag.type === "part") {
    if (Math.hypot(screen.x - drag.start.x, screen.y - drag.start.y) < 8)
      return;
    const project = clone(drag.project),
      part = project.parts.find((p) => p.id === selected),
      world = pointToWorld(screen);
    const point = snapPoint(
      {
        x: part.x + world.x - drag.world.x,
        y: part.z + world.y - drag.world.y,
      },
      part.id,
    );
    part.x = point.x;
    part.z = point.y;
    try {
      validateProject(project);
      drag.validProject = project;
      drag.changed = true;
      draw();
    } catch (error) {
      fail(error);
    }
    return;
  }
  if (drag.type === "preview") {
    if (pending.feature) {
      const face = currentFace(),
        p = face.toLocalBoard(pointToWorld(screen));
      pending.feature.x = p.x;
      pending.feature.y = p.y;
      previewFeature();
    } else {
      const p = pending.project.parts.find((p) => p.id === pending.partId),
        world = pointToWorld(screen),
        snap = snapPoint(
          {
            x: world.x - (pending.grabOffset?.x || 0),
            y: world.y - (pending.grabOffset?.y || 0),
          },
          p.id,
        );
      p.x = snap.x;
      p.z = snap.y;
      preview();
    }
    return;
  }
  if (drag.type === "handle") {
    const project = clone(drag.project),
      part = project.parts.find((p) => p.id === selected),
      world = pointToWorld(screen);
    try {
      if (part.kind === "measured") {
        const points = shapePoints(part),
          local = localBoardPoint(part, world);
        points[drag.handle] = local;
        part.vertices = points;
        part.shape = "custom";
      } else {
        const angle = -radians(part.rotation),
          dx = world.x - part.x,
          dy = world.y - part.z,
          x = dx * Math.cos(angle) - dy * Math.sin(angle),
          y = dx * Math.sin(angle) + dy * Math.cos(angle);
        if (part.footprint) {
          const points = sectionOutline(part);
          points[drag.handle] = { x, y };
          const n = normalizeOutline(points);
          const shift = sectionBoard(part, { x: n.x, y: n.z });
          part.x = shift.x;
          part.z = shift.y;
          part.footprint = n.vertices;
          part.width = n.width;
          part.depth = n.depth;
        } else {
          const opposite = sectionOutline(part)[(drag.handle + 2) % 4],
            minX = Math.min(x, opposite.x),
            minY = Math.min(y, opposite.y),
            origin = sectionBoard(part, { x: minX, y: minY });
          part.width = Math.abs(x - opposite.x);
          part.depth = Math.abs(y - opposite.y);
          part.x = origin.x;
          part.z = origin.y;
        }
      }
      validateProject(project);
      drag.validProject = project;
      drag.changed = true;
      errorPart = null;
      draw();
    } catch (error) {
      fail(error);
    }
  }
});
function pointerEnd(event) {
  if (
    drawing &&
    drag?.type === "draw" &&
    !drag.moved &&
    event.type !== "pointercancel" &&
    pointers.size === 1
  ) {
    const p = drawSnap(pointToWorld(localEvent(event))),
      first = drawing.points[0];
    if (
      first &&
      drawing.points.length >= 3 &&
      Math.hypot(p.x - first.x, p.y - first.y) * scale < 24
    )
      finishDrawing();
    else if (
      !drawing.points.length ||
      Math.hypot(p.x - drawing.points.at(-1).x, p.y - drawing.points.at(-1).y) *
        scale >
        12
    ) {
      drawing.points.push(p);
      drawing.cursor = null;
      updateDrawingPanel();
      draw();
    }
  }
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  if (
    drag?.type === "dimension" &&
    !drag.moved &&
    event.type !== "pointercancel"
  ) {
    selectedEdge = drag.edge;
    drag = null;
    currentPart()?.kind === "measured" ? edgePanel() : sectionDimension();
  } else if (
    ["handle", "part"].includes(drag?.type) &&
    drag.changed &&
    event.type !== "pointercancel"
  ) {
    const p = drag.validProject,
      staged = drag.staged;
    drag = null;
    if (staged && pending) {
      pending.project = clone(p);
      pending.validProject = clone(p);
      draw();
    } else commit(p);
  } else {
    drag = null;
    draw();
  }
}
board.addEventListener("pointerup", pointerEnd);
board.addEventListener("pointercancel", pointerEnd);
board.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const centre = localEvent(event),
      world = pointToWorld(centre);
    scale = Math.max(
      5,
      Math.min(240, scale * (event.deltaY > 0 ? 0.92 : 1.08)),
    );
    pan = { x: centre.x - world.x * scale, y: centre.y - world.y * scale };
    draw();
  },
  { passive: false },
);
function snapPoint(world, exclude) {
  snapped = false;
  snapTarget = null;
  if ($("[data-free]")?.checked) return world;
  const threshold = 12 / scale;
  const loops = resolved.faces
    .filter((f) => f.part.id !== exclude)
    .flatMap((f) => boundaryRings(f.polygons).map((r) => r.map(f.toBoard)));
  const targets = loops.flat();
  let best = world,
    distance = threshold;
  for (const p of targets) {
    const d = Math.hypot(p.x - world.x, p.y - world.y);
    if (d < distance) {
      best = p;
      distance = d;
      snapped = true;
    }
  }
  if (!snapped) {
    for (const loop of loops)
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i],
          b = loop[(i + 1) % loop.length],
          dx = b.x - a.x,
          dy = b.y - a.y;
        const ratio = Math.max(
          0,
          Math.min(
            1,
            ((world.x - a.x) * dx + (world.y - a.y) * dy) / (dx * dx + dy * dy),
          ),
        );
        const p = { x: a.x + ratio * dx, y: a.y + ratio * dy },
          d = Math.hypot(p.x - world.x, p.y - world.y);
        if (d < distance) {
          best = p;
          distance = d;
          snapped = true;
        }
      }
  }
  if (!snapped) {
    let x = world.x,
      y = world.y;
    for (const p of targets) {
      if (Math.abs(p.x - x) < threshold) {
        x = p.x;
        snapped = true;
      }
      if (Math.abs(p.y - y) < threshold) {
        y = p.y;
        snapped = true;
      }
    }
    best = { x, y };
  }
  if (snapped) snapTarget = best;
  return best;
}
const observer = new ResizeObserver((entries) => {
  const rect = entries[0].contentRect;
  boardSize = { width: rect.width, height: rect.height };
  board.setAttribute("viewBox", "0 0 " + rect.width + " " + rect.height);
  if (fitOnResize) {
    fitOnResize = false;
    fit();
  } else draw();
});
observer.observe($("#workspace"));
// Translated labels can make the dock taller. Reserve its actual footprint.
const dockObserver = new ResizeObserver(([entry]) => {
  const height = entry.target.getBoundingClientRect().height;
  if (height > 0)
    $(".shell").style.setProperty("--dock-height", Math.ceil(height) + "px");
});
dockObserver.observe($("#constructionDock"));
document.addEventListener("keydown", (event) => {
  if (
    !pending &&
    event.target.dataset?.dimension !== undefined &&
    ["Enter", " "].includes(event.key)
  ) {
    event.preventDefault();
    selectedEdge = Number(event.target.dataset.dimension);
    currentPart()?.kind === "measured" ? edgePanel() : sectionDimension();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    if (
      pending ||
      drawing ||
      inspectorMode ||
      !panel.classList.contains("hidden")
    )
      cancel();
    else if (planOpen) {
      planOpen = false;
      plans.classList.add("hidden");
      render();
    } else close();
  }
  if (
    event.target === board &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  ) {
    event.preventDefault();
    pan.x +=
      event.key === "ArrowLeft" ? 30 : event.key === "ArrowRight" ? -30 : 0;
    pan.y += event.key === "ArrowUp" ? 30 : event.key === "ArrowDown" ? -30 : 0;
    draw();
  }
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== parent) return;
  if (event.data?.type === "roof-builder:dispose") dispose();
  if (event.data?.type === "roof-builder:snapshot") {
    try {
      const snapshot = event.data.snapshot,
        project = clone(history.project),
        part = copySnapshot(project, snapshot);
      selected = part.id;
      selectedFace = part.id + ":0";
      validateProject(project);
      pending = null;
      panel.classList.add("hidden");
      commit(project);
      fit();
      status("imported");
    } catch (error) {
      fail(error);
    }
  }
});
function dispose() {
  if (disposed) return;
  disposed = true;
  viewRequest++;
  observer.disconnect();
  dockObserver.disconnect();
  sidebarCleanup();
  viewer?.dispose();
  viewer = null;
  pending = null;
  pointers.clear();
}
window.addEventListener("pagehide", dispose, { once: true });

function planSvg(plan, activeKey = null) {
  const f = plan.face,
    b = f.bounds,
    w = Math.max(
      280,
      Math.min(
        1000,
        innerWidth <= 800 ? innerWidth - 74 : boardSize.width - 414,
      ),
    ),
    h = innerWidth <= 800 ? 210 : 340,
    s = Math.min(
      (w - 70) / Math.max(b.width, 1),
      (h - 60) / Math.max(b.height, 1),
    ),
    origin = {
      x: w / 2 - (b.width * s) / 2 - b.minX * s,
      y: h / 2 + (b.height * s) / 2 + b.minY * s,
    },
    map = (p) => ({ x: origin.x + p.x * s, y: origin.y - p.y * s });
  let html =
    '<svg viewBox="0 0 ' +
    w +
    " " +
    h +
    '" role="img" aria-label="' +
    escape(t("plan") + " " + f.label) +
    '">';
  for (const piece of plan.pieces) {
    const polygons = piece.polygons;
    html +=
      '<g data-sheet="' +
      escape(piece.key) +
      '" data-face="' +
      escape(f.id) +
      '" tabindex="0" role="button" aria-label="' +
      escape(piece.displayId + " " + piece.length + " mm") +
      '">';
    const loops = boundaryRings(polygons),
      d = loops
        .map((poly) => "M" + path(poly.map(map)).replaceAll(" ", "L") + "Z")
        .join("");
    html +=
      '<path d="' +
      d +
      '" fill-rule="evenodd" class="sheet ' +
      (activeKey === piece.key ? "active" : "") +
      '"/>';
    const box = bounds(polygons.flat().map(map)),
      x = box.minX + box.width / 2,
      y = box.minY + box.height / 2;
    html +=
      '<text x="' +
      x +
      '" y="' +
      y +
      '" ' +
      (box.width < 26 ? 'transform="rotate(-90 ' + x + " " + y + ')"' : "") +
      ' class="sheetLabel" text-anchor="middle">' +
      (piece.modules || num(piece.length)) +
      "</text></g>";
  }
  for (const edge of f.edges)
    html +=
      '<polyline points="' +
      path(edge.map(map)) +
      '" fill="none" stroke="#183329" stroke-width="2"/>';
  html +=
    '<text x="35" y="' +
    (h - 7) +
    '" class="dimension">0 · ' +
    escape(distance(b.width)) +
    "</text></svg>";
  return html;
}
function orderTable(r) {
  return (
    '<div class="tableWrap"><table><thead><tr><th>' +
    escape(t("product")) +
    "</th><th>" +
    escape(t("finish")) +
    "</th><th>" +
    escape(t("length")) +
    " mm</th><th>" +
    escape(t("sheets")) +
    "</th></tr></thead><tbody>" +
    r.groups
      .map(
        (g) =>
          "<tr><td>" +
          escape(g.product) +
          "<br>" +
          escape(g.colour) +
          "</td><td>" +
          escape(g.finish) +
          "</td><td>" +
          g.length +
          "</td><td>" +
          g.count +
          "</td></tr>",
      )
      .join("") +
    "</tbody></table></div>"
  );
}
function renderPlans() {
  report = createSheetReport(history.project, resolved);
  if (!selectedFace || !report.plans.some((p) => p.face.id === selectedFace))
    selectedFace = report.plans[0]?.face.id;
  const selectedPlan = report.plans.find((p) => p.face.id === selectedFace),
    piece = selectedPlan?.pieces.find(
      (p) => p.key === selectedSheet?.key && p.faceId !== null,
    );
  let html =
    '<header class="planHeader"><h2>' +
    escape(t("plan")) +
    "</h2>" +
    button("print", "print") +
    button("csv", "csv") +
    button("closePlan", "close") +
    '</header><div class="planContent"><div class="planDrawings"><p class="notice">' +
    escape(t("draftOrder")) +
    "</p><p>" +
    report.totals.count +
    " " +
    escape(t("sheets")) +
    " · " +
    areaText(report.totals.area) +
    " · " +
    escape(t("stock")) +
    " " +
    areaText(report.totals.stockArea) +
    "</p>";
  if (!report.plans.length) html += "<p>" + escape(t("noFaces")) + "</p>";
  for (const plan of report.plans)
    html +=
      '<article class="planCard ' +
      (plan.face.id === selectedFace ? "active" : "") +
      '"><h3>' +
      escape(plan.face.label) +
      " · " +
      escape(plan.product.title) +
      "</h3>" +
      planSvg(
        plan,
        selectedSheet?.faceId === plan.face.id ? selectedSheet.key : null,
      ) +
      "<p>" +
      areaText(plan.netArea) +
      " · " +
      plan.pieces.length +
      " " +
      escape(t("sheets")) +
      '</p><button data-select-plan="' +
      escape(plan.face.id) +
      '">' +
      escape(t("measurements")) +
      " / " +
      escape(t("direction")) +
      "</button></article>";
  for (const error of report.errors)
    html +=
      '<p class="notice">' +
      escape(error.label) +
      ": " +
      escape(t("planningLimit")) +
      "</p>";
  html +=
    "<h3>" +
    escape(t("order")) +
    "</h3>" +
    orderTable(report) +
    "<h3>" +
    escape(t("accessories")) +
    '</h3><p class="muted">' +
    escape(t("supplierCheck")) +
    "</p>" +
    report.accessories
      .map(
        (a) =>
          "<p>" +
          escape(a.product) +
          " · " +
          escape(a.face) +
          " · " +
          distance(a.metres) +
          "</p>",
      )
      .join("") +
    '</div><aside class="planOptions">';
  if (selectedPlan) {
    const p = selectedPlan.product;
    html +=
      "<h3>" +
      escape(selectedPlan.face.label) +
      "</h3><label>" +
      escape(t("direction")) +
      '<select data-plan-setting="direction">' +
      p.directions
        .map(
          (d) =>
            '<option value="' +
            d +
            '" ' +
            ((selectedPlan.settings.direction || "left") === d
              ? "selected"
              : "") +
            ">" +
            escape(t(d)) +
            "</option>",
        )
        .join("") +
      "</select></label>" +
      field(
        "startOffset",
        selectedPlan.settings.offset || 0,
        "mm",
        'data-plan-setting="offset"',
        false,
      );
    const choices = [
      ...new Map(
        selectedPlan.pieces.map((piece) => [piece.key, piece]),
      ).values(),
    ];
    html +=
      "<label>" +
      escape(t("chooseSheet")) +
      '<select id="sheetSelect"><option value="">—</option>' +
      choices
        .map(
          (piece) =>
            '<option value="' +
            escape(piece.key) +
            '" ' +
            (selectedSheet?.key === piece.key ? "selected" : "") +
            ">" +
            escape(piece.displayId) +
            " · " +
            (piece.baseModules || piece.length) +
            " " +
            escape(t(piece.baseModules ? "modules" : "length")) +
            "</option>",
        )
        .join("") +
      "</select></label>";
    html +=
      "<p>" +
      escape(t("lateral")) +
      ": " +
      num(
        (p.profile?.width || p.continuous.width) -
          (p.profile?.usefulWidth || p.continuous.usefulWidth),
      ) +
      " mm</p><p>" +
      escape(t("joinAllowance")) +
      ": " +
      num(p.profile?.endOverlap || p.continuous.endOverlap) +
      " mm</p><p>" +
      escape(t("boundaryAllowance")) +
      ": " +
      areaText(selectedPlan.cutArea) +
      "</p>";
    if (piece && p.profile) {
      const applied = selectedPlan.settings.partitions?.[piece.key] || [
        piece.baseModules,
      ];
      html +=
        '<hr class="divider"><h3>' +
        escape(piece.displayId) +
        "</h3><p>" +
        piece.baseModules +
        " " +
        escape(t("modules")) +
        " · " +
        piece.length +
        " mm</p><label>" +
        escape(t("split")) +
        '<input id="splitInput" inputmode="text" value="' +
        applied.join("+") +
        '"></label><p>' +
        escape(t("splitHint")) +
        "</p><label>" +
        escape(t("scope")) +
        '<select id="splitScope"><option value="selected">' +
        escape(t("oneSheet")) +
        '</option><option value="same">' +
        escape(t("sameSheets")) +
        "</option></select></label><p>" +
        escape(t("additional")) +
        ": " +
        (applied.length - 1) * p.profile.endOverlap +
        ' mm</p><div class="actions">' +
        button("recommend", "recommend") +
        button("splitApply", "apply", 'class="primary"') +
        "</div>";
    } else html += '<p class="notice">' + escape(t("chooseSheet")) + "</p>";
    html +=
      selectedPlan.warnings
        .map((key) => '<p class="notice">' + escape(t(key)) + "</p>")
        .join("") + button("review", "review");
  }
  html += "</aside></div>";
  plans.innerHTML = html;
  plans.querySelectorAll("[data-sheet]").forEach((el) => {
    const select = () => {
      selectedSheet = { faceId: el.dataset.face, key: el.dataset.sheet };
      selectedFace = el.dataset.face;
      renderPlans();
    };
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      select();
    });
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        select();
      }
    });
  });
  plans.querySelectorAll("[data-select-plan]").forEach((el) =>
    el.addEventListener("click", () => {
      selectedFace = el.dataset.selectPlan;
      selectedSheet = null;
      renderPlans();
    }),
  );
  $("#sheetSelect")?.addEventListener("change", (event) => {
    selectedSheet = event.target.value
      ? { faceId: selectedFace, key: event.target.value }
      : null;
    renderPlans();
  });
}
function splitApply(recommend = false) {
  if (!selectedSheet) return status("chooseSheet", true);
  try {
    const f = resolved.faces.find((f) => f.id === selectedSheet.faceId),
      plan = report.plans.find((p) => p.face.id === f.id),
      piece = plan.pieces.find((p) => p.key === selectedSheet.key),
      p = plan.product.profile;
    const values = recommend
        ? recommendSplit(
            piece.baseModules,
            p.minModules,
            Math.min(
              p.maxModules,
              Math.floor((p.maxLength - p.endOverlap) / p.module),
            ),
          )
        : $("#splitInput").value.split("+").map(parseNumber),
      scope = $("#splitScope").value;
    mutate((project) =>
      setPartition(project, f, selectedSheet.key, values, scope),
    );
  } catch (error) {
    fail(error);
  }
}
function printProject() {
  const r = createSheetReport(history.project, resolved);
  const originalScale = scale,
    originalPan = { ...pan };
  view(false);
  fit();
  draw();
  const printableBoard = board.cloneNode(true);
  printableBoard.removeAttribute("id");
  const drawing = printableBoard.outerHTML;
  scale = originalScale;
  pan = originalPan;
  draw();
  $("#print").innerHTML =
    "<h1>" +
    escape(t("title")) +
    "</h1><p>" +
    escape(t("draftOrder")) +
    "</p><section>" +
    drawing +
    "</section>" +
    r.plans
      .map(
        (p) =>
          "<section><h2>" +
          escape(p.face.label) +
          " · " +
          escape(p.product.title) +
          "</h2>" +
          planSvg(p) +
          "<p>" +
          areaText(p.netArea) +
          " · " +
          p.pieces.length +
          " " +
          escape(t("sheets")) +
          "</p>" +
          p.warnings.map((key) => "<p>" + escape(t(key)) + "</p>").join("") +
          "</section>",
      )
      .join("") +
    "<section><h2>" +
    escape(t("order")) +
    "</h2>" +
    orderTable(r) +
    "</section><section><h2>" +
    escape(t("accessories")) +
    "</h2><p>" +
    escape(t("supplierCheck")) +
    "</p>" +
    r.accessories
      .map(
        (a) =>
          "<p>" +
          escape(a.product) +
          " · " +
          escape(a.face) +
          " · " +
          distance(a.metres) +
          "</p>",
      )
      .join("") +
    "</section>";
  window.print();
}
render();
status(storage.available ? "saved" : "storageUnavailable");
