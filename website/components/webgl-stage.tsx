"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildPergola } from "../lib/scenes/pergola-builder.js";
import { DEFAULT_STATE } from "../lib/scenes/pergola-state.js";
import { buildPoleGrid } from "../lib/scenes/pergola-layout.js";
import { buildRoofModel } from "../lib/scenes/roof-factory.js";
import { calculatePrice as calculatePergolaPrice } from "../lib/scenes/pergola-pricing.js";
import { calculateBom } from "../lib/scenes/roof-bom.js";
import {
  buildHallPreview,
  buildSolarPreview,
  createHallPreviewState,
  createSolarPreviewState,
  type HallPreviewState,
  type SolarEnvironmentData,
  type SolarPreviewState,
} from "../lib/scenes/extended-builders";
import { loadGeographicEnvironment } from "../lib/scenes/solar-environment-loader.js";
import { solarDirection } from "../lib/scenes/solar-position";
import type { ConfiguratorSlug } from "../lib/configurators";

type SceneKey = ConfiguratorSlug | "engine";

const vertexShader = `
  uniform float uTime;
  uniform float uMomentum;
  uniform vec2 uPointer;
  varying vec3 vWorld;
  void main() {
    vec3 p = position;
    float cursor = exp(-distance(p.xy, uPointer * 10.0) * 0.22);
    p.z += sin(p.x * 0.34 + uTime * 0.55) * 0.10;
    p.z += sin(p.y * 0.28 - uTime * 0.35) * 0.07;
    p.z += cursor * (0.15 + uMomentum * 0.10);
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = `
  uniform vec3 uGrid;
  uniform vec3 uAccent;
  uniform float uOpacity;
  varying vec3 vWorld;
  float line(float value, float scale) {
    float width = fwidth(value * scale);
    return 1.0 - smoothstep(0.0, width * 1.1, abs(fract(value * scale - 0.5) - 0.5));
  }
  void main() {
    float minor = max(line(vWorld.x, .45), line(vWorld.z, .45));
    float major = max(line(vWorld.x, .09), line(vWorld.z, .09));
    float fade = 1.0 - smoothstep(5.0, 25.0, length(vWorld.xz));
    vec3 color = mix(uGrid, uAccent, major * .62);
    gl_FragColor = vec4(color, (minor * .16 + major * .46) * fade * uOpacity);
  }
`;

function disposeScene(scene: THREE.Scene) {
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) {
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
    }
  });
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
  });
}

function centerAndScale(object: THREE.Object3D, targetSize: number) {
  object.updateMatrixWorld(true);
  const stored = object.userData.framingBox as { min?: number[]; max?: number[] } | undefined;
  const bounds = stored?.min && stored?.max
    ? new THREE.Box3(new THREE.Vector3().fromArray(stored.min), new THREE.Vector3().fromArray(stored.max))
    : new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z, 0.001);
  object.scale.setScalar(scale);
  object.position.copy(center.multiplyScalar(-scale));
  return object;
}

function applyGroundTheme(root: THREE.Object3D, light: boolean) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const objectName = mesh.name.toLowerCase();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((surface) => {
      const material = surface as THREE.MeshStandardMaterial;
      const surfaceName = material.name.toLowerCase();
      const isGround = objectName.includes("theme-ground") || surfaceName.includes("theme-ground");
      if (!isGround || !material.color) return;
      if (material.userData.lightColor === undefined) material.userData.lightColor = material.color.getHex();
      if (material.userData.lightRoughness === undefined && "roughness" in material) material.userData.lightRoughness = material.roughness;
      material.color.setHex(light ? Number(material.userData.lightColor) : 0x11181e);
      if ("roughness" in material) material.roughness = light ? Number(material.userData.lightRoughness ?? material.roughness) : 0.94;
      material.needsUpdate = true;
    });
  });
}

function createPergolaState(night = false) {
  const state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  state.units = "metric";
  state.dimensions = { width: 6000, depth: 4000, height: 2700 };
  state.roof.orientation = "depth";
  state.roof.frameColor = "#26343c";
  // Theme/night changes the environment, never the specified metal finish.
  state.roof.louverColor = "#64727b";
  state.roof.louverTilt = night ? 34 : 0;
  state.sideSegments = {};
  buildPoleGrid(state.dimensions).segments.forEach((segment: { id: string; boundary: string | null }) => {
    state.sideSegments[segment.id] = {
      type: segment.boundary === "front" ? "glass" : "none",
      screenSettings: {
        screen: { openness: 50, color: "#67757d" },
        "motorized-screen": { openness: 50, color: "#34444c" },
      },
      privacyColor: "#26343c",
    };
  });
  state.accessories.perimeterLed = { enabled: night, color: "#fff1b4" };
  state.accessories.spotlights = night ? 4 : 0;
  state.accessories.heaters = { front: false, back: false, left: !night, right: true };
  state.environment = { sunPosition: night ? 0.81 : 0.79, northDirection: night ? 310 : 21, night, season: "studio" };
  state.view = { dimensionsVisible: false, cameraPreset: "right", compassVisible: false };
  return state;
}

function buildPergolaInto(wrapper: THREE.Group, state: typeof DEFAULT_STATE) {
  const model = buildPergola(state, null) as THREE.Group;
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((surface) => {
      const standard = surface as THREE.MeshStandardMaterial;
      if (!standard.isMeshStandardMaterial || standard.transparent || standard.emissiveIntensity > 0) return;
      // Powder-coated aluminium: defined reflection bands, without a glossy
      // plastic appearance. This treatment remains identical in both themes.
      standard.metalness = Math.max(standard.metalness, 0.76);
      standard.roughness = Math.min(standard.roughness, 0.27);
      standard.envMapIntensity = 1.28;
      standard.needsUpdate = true;
    });
  });
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  // Keep a fixed world-to-preview scale: changing width must visibly resize the
  // pergola, not rescale its deck and mimic a camera zoom.
  const scale = 6.35 / 6;

  const assembly = new THREE.Group();
  assembly.add(model);
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(9.5, 0.12, 7.4),
    new THREE.MeshStandardMaterial({
      color: state.environment.night ? 0x30383d : 0xaa9477,
      roughness: state.environment.night ? 0.72 : 0.82,
      metalness: 0,
    }),
  );
  floor.name = "pergola-theme-ground";
  floor.position.set(0, -0.07, 0);
  floor.receiveShadow = true;
  assembly.add(floor);
  const plankMaterial = new THREE.MeshStandardMaterial({
    color: state.environment.night ? 0x465158 : 0xc1ad90,
    roughness: 0.88,
  });
  for (let index = 0; index < 24; index += 1) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(9.25, 0.008, 0.008), plankMaterial);
    plank.name = "pergola-theme-ground-plank";
    plank.position.set(0, -0.005, -3.55 + index * 0.305);
    plank.receiveShadow = true;
    assembly.add(plank);
  }
  assembly.scale.setScalar(scale);
  assembly.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  wrapper.add(assembly);
  wrapper.userData.model = assembly;
}

function makePergolaScene(state: typeof DEFAULT_STATE) {
  const wrapper = new THREE.Group();
  wrapper.name = "pergola";
  buildPergolaInto(wrapper, state);
  return wrapper;
}

function createRoofState() {
  return {
    roofType: "lshape", length: 10, depth: 7, wallHeight: 3, pitch: 30, overhang: 0.4,
    covering: "generic", roofColor: "#263a49", showDimensions: false,
    technicalEdges: true, showCompass: false, sunPosition: 42,
    northDirection: 108, nightPreview: false, customPlan: null,
  };
}

function buildRoofInto(wrapper: THREE.Group, state: ReturnType<typeof createRoofState>) {
  const result = buildRoofModel(state);
  const model = result.group as THREE.Group;
  centerAndScale(model, 7.3);
  wrapper.add(model);
  wrapper.userData.model = model;
  wrapper.userData.metrics = result.metrics;
  return result.metrics;
}

function makeRoofScene(state: ReturnType<typeof createRoofState>) {
  const wrapper = new THREE.Group();
  wrapper.name = "roof";
  buildRoofInto(wrapper, state);
  return wrapper;
}

function emitPrice(scene: ConfiguratorSlug, total: number, currency: string) {
  window.dispatchEvent(new CustomEvent("configurator-price", { detail: { scene, total, currency } }));
}

function makeWindowShell() {
  const wrapper = new THREE.Group();
  wrapper.name = "window";
  return wrapper;
}

function buildExtendedInto(wrapper: THREE.Group, model: THREE.Group, size: number) {
  centerAndScale(model, Number(model.userData.preferredSize) || size);
  wrapper.add(model); wrapper.userData.model = model; wrapper.userData.metrics = model.userData.metrics;
}

export function WebGLStage() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const container = host.current;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080a0d, 0.025);
    const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 120);
    camera.position.set(0, 1.2, 15);
    const compactViewport = window.matchMedia("(max-width: 900px)").matches;
    const lowCoreDevice = navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4;
    const constrainedDevice = compactViewport || lowCoreDevice;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    // Mobile screens commonly run at 3x DPR. A sub-2x cap makes thin profiles,
    // louvres and panel edges visibly stair-step, so retain substantially more
    // native resolution while keeping a lower ceiling for genuinely small CPUs.
    const mobilePixelRatio = lowCoreDevice ? 2 : 2.75;
    renderer.setPixelRatio(Math.min(devicePixelRatio, compactViewport ? mobilePixelRatio : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // A small procedural studio produces long reflections on coated aluminium
    // without loading an HDR image or adding meaningful runtime weight.
    const environmentScene = new THREE.Scene();
    environmentScene.background = new THREE.Color(0x182027);
    const environmentBox = new THREE.BoxGeometry();
    const environmentRoom = new THREE.Mesh(
      environmentBox,
      new THREE.MeshStandardMaterial({ color: 0x303941, side: THREE.BackSide, roughness: 0.94 }),
    );
    environmentRoom.scale.set(22, 22, 22);
    environmentScene.add(environmentRoom);
    const addEnvironmentPanel = (position: [number, number, number], scale: [number, number, number], color: number, intensity: number) => {
      const panel = new THREE.Mesh(
        environmentBox,
        new THREE.MeshLambertMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity }),
      );
      panel.position.fromArray(position);
      panel.scale.fromArray(scale);
      environmentScene.add(panel);
    };
    addEnvironmentPanel([-8, 5, 5], [0.08, 5, 4], 0xfff0d6, 18);
    addEnvironmentPanel([7, 2, 3], [0.08, 3.5, 5], 0x9dd8ff, 11);
    addEnvironmentPanel([0, 8, -2], [5, 0.08, 3], 0xffffff, 14);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentTarget = pmremGenerator.fromScene(environmentScene, 0.035);
    scene.environment = environmentTarget.texture;
    pmremGenerator.dispose();
    environmentScene.traverse((object) => {
      (object as THREE.Mesh).geometry?.dispose?.();
      const surface = (object as THREE.Mesh).material;
      if (surface) (Array.isArray(surface) ? surface : [surface]).forEach((entry) => entry.dispose());
    });

    const pergolaState = createPergolaState(false);
    const roofState = createRoofState();
    const hallState = createHallPreviewState();
    const solarState = createSolarPreviewState();
    let solarEnvironment: SolarEnvironmentData | null = null;
    let solarEnvironmentRequest: AbortController | null = null;
    const groups: Record<ConfiguratorSlug, THREE.Group> = {
      pergola: makePergolaScene(pergolaState),
      roof: makeRoofScene(roofState),
      window: makeWindowShell(),
      hall: new THREE.Group(),
      solar: new THREE.Group(),
    };
    buildExtendedInto(groups.hall, buildHallPreview(hallState), 8.5);
    buildExtendedInto(groups.solar, buildSolarPreview(solarState, solarEnvironment), 7.1);
    Object.values(groups).forEach((group) => {
      group.scale.setScalar(0.001);
      scene.add(group);
    });

    const gridUniforms = {
      uTime: { value: 0 }, uMomentum: { value: 0 }, uPointer: { value: new THREE.Vector2() },
      uGrid: { value: new THREE.Color(0x2d3b45) }, uAccent: { value: new THREE.Color(0x0761aa) }, uOpacity: { value: 0.6 },
    };
    const gridMaterial = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: gridUniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const gridSegments = constrainedDevice ? 52 : 86;
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(54, 54, gridSegments, gridSegments), gridMaterial);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -4.3;
    scene.add(grid);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x8d99a6, 0.92);
    scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xfff1dc, 3.15);
    key.position.set(4.5, 6.5, 7); key.castShadow = true;
    const shadowMapSize = lowCoreDevice ? 1024 : 1536;
    key.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    key.shadow.bias = -0.00025; key.shadow.normalBias = 0.022; key.shadow.radius = 2; scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fc4ff, 1.85); rim.position.set(4, 4.5, -6); scene.add(rim);
    const cool = new THREE.DirectionalLight(0xb7d9ff, 1.25); cool.position.set(-5.5, 2.5, 4); scene.add(cool);
    const warm = new THREE.PointLight(0xffffff, 0.55, 12, 1.5); warm.position.set(0, 5, 1.2); scene.add(warm);

    let active: SceneKey = "engine";
    let desiredActive: SceneKey = "engine";
    let handoffStartedAt = 0;
    let pointerX = 0, pointerY = 0, targetPointerX = 0, targetPointerY = 0;
    let lastScroll = window.scrollY, momentum = 0, clock = 0, raf = 0;
    const cameraTarget = new THREE.Vector3();
    const orbitState: Record<ConfiguratorSlug, { yaw: number; pitch: number; zoom: number; panX: number; panY: number }> = {
      pergola: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 },
      roof: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 },
      window: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 },
      hall: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: 0 },
      // Lift the configured house and its closest context above the compact
      // instrument console while retaining the wider geographic overview.
      solar: { yaw: 0, pitch: 0, zoom: 1, panX: 0, panY: -4.05 },
    };
    let pergolaRebuildTimer = 0;
    let roofRebuildTimer = 0;
    let hallRebuildTimer = 0;
    let solarRebuildTimer = 0;

    function applyPergolaEnvironment(night: boolean) {
      pergolaState.roof.louverTilt = night ? 34 : 0;
      pergolaState.roof.louverColor = "#64727b";
      pergolaState.accessories.perimeterLed = { enabled: night, color: "#fff1b4" };
      pergolaState.accessories.spotlights = night ? 4 : 0;
      pergolaState.accessories.heaters = { front: false, back: false, left: !night, right: true };
      pergolaState.environment = { sunPosition: night ? 0.81 : 0.79, northDirection: night ? 310 : 21, night, season: "studio" };
    }

    function rebuildPergola() {
      window.clearTimeout(pergolaRebuildTimer);
      pergolaRebuildTimer = window.setTimeout(() => {
        const oldModel = groups.pergola.userData.model as THREE.Object3D;
        if (oldModel) { groups.pergola.remove(oldModel); disposeObject(oldModel); }
        buildPergolaInto(groups.pergola, pergolaState);
        applyGroundTheme(groups.pergola, document.documentElement.dataset.theme === "light");
        emitPrice("pergola", calculatePergolaPrice(pergolaState).total, "USD");
      }, 45);
    }

    function rebuildRoof() {
      window.clearTimeout(roofRebuildTimer);
      roofRebuildTimer = window.setTimeout(() => {
        const oldModel = groups.roof.userData.model as THREE.Object3D;
        if (oldModel) { groups.roof.remove(oldModel); disposeObject(oldModel); }
        const metrics = buildRoofInto(groups.roof, roofState);
        applyGroundTheme(groups.roof, document.documentElement.dataset.theme === "light");
        emitPrice("roof", calculateBom(roofState, metrics).total, "RON");
      }, 45);
    }

    function rebuildExtended(key: "hall" | "solar") {
      const timer = key === "hall" ? hallRebuildTimer : solarRebuildTimer;
      window.clearTimeout(timer);
      const next = window.setTimeout(() => {
        try {
          const model = key === "hall" ? buildHallPreview(hallState) : buildSolarPreview(solarState, solarEnvironment);
          const oldModel = groups[key].userData.model as THREE.Object3D;
          if (oldModel) {
            groups[key].remove(oldModel);
            // The solar factories intentionally share their material palette between
            // rebuilds. Disposing the outgoing tree also disposes those live shared
            // materials, which makes the freshly rebuilt geographic scene vanish.
            if (key === "hall") disposeObject(oldModel);
          }
          buildExtendedInto(groups[key], model, key === "hall" ? 8.5 : 7.1);
          applyGroundTheme(groups[key], document.documentElement.dataset.theme === "light");
          if (key === "solar") window.dispatchEvent(new CustomEvent("solar-metrics", { detail: groups.solar.userData.metrics }));
        } catch (error) {
          if (key === "solar") {
            window.dispatchEvent(new CustomEvent("solar-environment-status", {
              detail: { status: "error", message: error instanceof Error ? error.message : "Solar preview could not be rebuilt." },
            }));
          }
        }
      }, 42);
      if (key === "hall") hallRebuildTimer = next; else solarRebuildTimer = next;
    }

    async function loadSolarEnvironment(value: string | number | boolean) {
      let location: { lat: number; lon: number; label?: string };
      try { location = JSON.parse(String(value)); } catch { return; }
      if (!Number.isFinite(location.lat) || !Number.isFinite(location.lon)) return;
      solarEnvironmentRequest?.abort();
      const request = new AbortController();
      solarEnvironmentRequest = request;
      solarState.locationMode = "exact";
      solarState.locationLat = location.lat;
      solarState.locationLon = location.lon;
      solarState.locationLabel = location.label || "";
      solarState.environmentStatus = "loading";
      window.dispatchEvent(new CustomEvent("solar-environment-status", { detail: { status: "loading" } }));
      try {
        const data = await loadGeographicEnvironment({
          lat: location.lat,
          lon: location.lon,
          radiusM: 180,
          terrainSegments: window.innerWidth < 760 ? 30 : 42,
          signal: request.signal,
        }) as SolarEnvironmentData;
        if (request.signal.aborted) return;
        solarEnvironment = data;
        solarState.environmentStatus = "loaded";
        solarState.environmentHasTerrain = Boolean(data.terrain);
        solarState.environmentBuildingCount = data.buildings?.length || 0;
        solarState.environmentRoadCount = data.roads?.length || 0;
        solarState.environmentTreeCount = data.trees?.length || 0;
        rebuildExtended("solar");
        window.dispatchEvent(new CustomEvent("solar-environment-status", { detail: { status: "loaded", counts: { buildings: data.buildings?.length || 0, roads: data.roads?.length || 0, trees: data.trees?.length || 0 } } }));
      } catch (error) {
        if (request.signal.aborted) return;
        solarState.environmentStatus = "error";
        window.dispatchEvent(new CustomEvent("solar-environment-status", { detail: { status: "error", message: error instanceof Error ? error.message : "Geographic context unavailable." } }));
      }
    }

    function setTheme() {
      const light = document.documentElement.dataset.theme === "light";
      gridUniforms.uGrid.value.set(light ? 0x7f929b : 0x283640);
      gridUniforms.uAccent.value.set(light ? 0x0761aa : 0x359ce7);
      gridUniforms.uOpacity.value = light ? 0.25 : 0.6;
      (scene.fog as THREE.FogExp2).color.set(light ? 0xf1f2ee : 0x080a0d);
      hemisphere.color.set(light ? 0xffffff : 0xe8f4ff);
      hemisphere.groundColor.set(light ? 0xa5afb0 : 0x17202a);
      renderer.toneMappingExposure = light ? 1.02 : 1.18;
      Object.values(groups).forEach((group) => applyGroundTheme(group, light));
      if (pergolaState.environment.night === light) {
        applyPergolaEnvironment(!light);
        rebuildPergola();
      }
      if (solarState.nightPreview === light) { solarState.nightPreview = !light; rebuildExtended("solar"); }
    }

    function syncSolarThemeFromSun() {
      const sun = solarDirection(
        solarState.simulationDate,
        Number(solarState.simulationHour) || 0,
        Number(solarState.locationLat) || 45.63317,
        Number(solarState.northDirection) || 0,
      );
      const automaticNight = sun.elevationDeg <= -0.833;
      solarState.nightPreview = automaticNight;
      const theme = automaticNight ? "dark" : "light";
      if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
      window.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
    }
    setTheme();
    const themeObserver = new MutationObserver(setTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    function onPointer(event: PointerEvent) {
      targetPointerX = (event.clientX / innerWidth - 0.5) * 2;
      targetPointerY = (event.clientY / innerHeight - 0.5) * 2;
      gridUniforms.uPointer.value.set(targetPointerX, -targetPointerY);
    }
    function onControl(event: Event) {
      const detail = (event as CustomEvent<{ scene: ConfiguratorSlug; control: string; value: string | number | boolean | Record<string, string> }>).detail;
      if (detail.scene === "pergola") {
        if (detail.control === "requestPrice") {
          emitPrice("pergola", calculatePergolaPrice(pergolaState).total, "USD");
          return;
        }
        if (detail.control === "tilt") pergolaState.roof.louverTilt = Number(detail.value);
        if (detail.control === "width") pergolaState.dimensions.width = Number(detail.value) * 1000;
        if (detail.control === "depth") pergolaState.dimensions.depth = Number(detail.value) * 1000;
        if (detail.control === "sideClosings") {
          const incoming = detail.value as Record<string, string>;
          const next: Record<string, {
            type: string;
            screenSettings: Record<string, { openness: number; color: string }>;
            privacyColor: string;
          }> = {};
          buildPoleGrid(pergolaState.dimensions).segments.forEach((segment: { id: string }) => {
            next[segment.id] = {
              type: incoming[segment.id] ?? "none",
              screenSettings: pergolaState.sideSegments?.[segment.id]?.screenSettings ?? {
                screen: { openness: 50, color: "#67757d" },
                "motorized-screen": { openness: 50, color: "#34444c" },
              },
              privacyColor: pergolaState.sideSegments?.[segment.id]?.privacyColor ?? "#26343c",
            };
          });
          pergolaState.sideSegments = next;
        }
        if (detail.control === "led") pergolaState.accessories.perimeterLed.enabled = Boolean(detail.value);
        if (detail.control === "ledColor") pergolaState.accessories.perimeterLed.color = String(detail.value);
        if (detail.control === "spotlights") pergolaState.accessories.spotlights = Number(detail.value);
        if (detail.control === "night") {
          const night = Boolean(detail.value);
          applyPergolaEnvironment(night);
        }
        rebuildPergola();
      }
      if (detail.scene === "roof") {
        if (detail.control === "requestPrice") {
          const metrics = groups.roof.userData.metrics;
          emitPrice("roof", calculateBom(roofState, metrics).total, "RON");
          return;
        }
        if (detail.control === "length") roofState.length = Number(detail.value);
        if (detail.control === "depth") roofState.depth = Number(detail.value);
        if (detail.control === "wallHeight") roofState.wallHeight = Number(detail.value);
        if (detail.control === "pitch") roofState.pitch = Number(detail.value);
        if (detail.control === "overhang") roofState.overhang = Number(detail.value);
        if (detail.control === "shape") roofState.roofType = String(detail.value);
        if (detail.control === "material") {
          const preset = String(detail.value);
          roofState.covering = preset === "slate" ? "teclado" : preset === "oxide" ? "roca" : "generic";
          roofState.roofColor = preset === "slate" ? "#354650" : preset === "oxide" ? "#7b4038" : "#263a49";
        }
        rebuildRoof();
      }
      if (detail.scene === "hall") {
        if (detail.control === "length") hallState.length = Number(detail.value);
        if (detail.control === "width") hallState.width = Number(detail.value);
        if (detail.control === "height") hallState.eaveHeight = Number(detail.value);
        if (detail.control === "pitch") hallState.pitch = Number(detail.value);
        if (detail.control === "spacing") hallState.targetBaySpacing = Number(detail.value);
        if (detail.control === "preset") hallState.structurePreset = String(detail.value) as HallPreviewState["structurePreset"];
        if (detail.control === "doorWidth") hallState.rollerDoorWidth = Number(detail.value);
        if (detail.control === "doorHeight") hallState.rollerDoorHeight = Number(detail.value);
        if (detail.control === "cladding") hallState.showCladding = Boolean(detail.value);
        if (detail.control === "secondary") hallState.secondaryStructure = Boolean(detail.value);
        if (detail.control === "exploded") hallState.explode = detail.value ? 100 : 0;
        rebuildExtended("hall");
      }
      if (detail.scene === "solar") {
        if (detail.control === "location") { void loadSolarEnvironment(detail.value); return; }
        if (detail.control === "shape") solarState.roofType = String(detail.value) as SolarPreviewState["roofType"];
        if (detail.control === "length") solarState.length = Number(detail.value);
        if (detail.control === "depth") solarState.depth = Number(detail.value);
        if (detail.control === "pitch") solarState.pitch = Number(detail.value);
        if (detail.control === "panels") solarState.panelCount = Number(detail.value);
        if (detail.control === "columns") solarState.panelColumns = Number(detail.value);
        if (detail.control === "module") solarState.modulePreset = String(detail.value) as SolarPreviewState["modulePreset"];
        if (detail.control === "side") solarState.roofSide = String(detail.value) as SolarPreviewState["roofSide"];
        if (detail.control === "bearing") solarState.northDirection = Number(detail.value);
        if (detail.control === "hour") {
          solarState.simulationHour = Number(detail.value);
          solarState.sunPosition = solarState.simulationHour / 24 * 100;
          syncSolarThemeFromSun();
        }
        if (detail.control === "season") {
          const month = { spring: "04", summer: "07", autumn: "10", winter: "01" }[String(detail.value)] || "07";
          solarState.simulationDate = `2026-${month}-15`;
          syncSolarThemeFromSun();
        }
        if (detail.control === "date") {
          solarState.simulationDate = String(detail.value);
          syncSolarThemeFromSun();
        }
        if (detail.control === "night") solarState.nightPreview = Boolean(detail.value);
        if (detail.control === "nudgeEast") solarState.environmentLocalEastM = Number(detail.value);
        if (detail.control === "nudgeNorth") solarState.environmentLocalNorthM = Number(detail.value);
        rebuildExtended("solar");
      }
    }
    function onOrbit(event: Event) {
      const detail = (event as CustomEvent<{ scene: ConfiguratorSlug; dx?: number; dy?: number; zoom?: number; pan?: boolean }>).detail;
      const state = orbitState[detail.scene];
      if (detail.pan) {
        state.panX -= (detail.dx || 0) * 0.006;
        state.panY += (detail.dy || 0) * 0.006;
      } else {
        state.yaw -= (detail.dx || 0) * 0.006;
        state.pitch = THREE.MathUtils.clamp(state.pitch + (detail.dy || 0) * 0.006, -1.38, 1.38);
      }
      if (detail.zoom) state.zoom = THREE.MathUtils.clamp(state.zoom * Math.exp(detail.zoom * 0.0008), 0.58, 1.65);
    }
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"));
    const hero = document.querySelector<HTMLElement>("[data-scene='engine']");
    let sceneSelectionDirty = true;
    let hasSpatialSectionInView = true;
    function updateActiveScene() {
      let closest: { key: SceneKey; distance: number } | null = null;
      sections.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) return;
        const distance = Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
        const keyName = (element.dataset.scene || "engine") as SceneKey;
        if (!closest || distance < closest.distance) closest = { key: keyName, distance };
      });
      if (!closest) return false;
      const next = closest.key;
      if (next !== desiredActive) {
        desiredActive = next;
        handoffStartedAt = performance.now();
      }
      if (desiredActive !== active && performance.now() - handoffStartedAt > 230) {
        active = desiredActive;
        window.dispatchEvent(new CustomEvent("active-scene-change", { detail: { scene: active } }));
      }
      return true;
    }
    function resize() {
      const width = container.clientWidth, height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      sceneSelectionDirty = true;
    }
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container); resize();
    window.addEventListener("pointermove", onPointer, { passive: true });
    const markSceneSelectionDirty = () => { sceneSelectionDirty = true; };
    window.addEventListener("scroll", markSceneSelectionDirty, { passive: true });
    window.addEventListener("configurator-control", onControl);
    window.addEventListener("scene-orbit", onOrbit);
    document.documentElement.dataset.webglStageReady = "true";
    window.dispatchEvent(new CustomEvent("webgl-stage-ready"));

    let disposed = false;
    function animate() {
      if (disposed || document.hidden) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(animate);
      clock += 0.016;
      const scrollDelta = window.scrollY - lastScroll;
      momentum += (Math.min(Math.abs(scrollDelta) / 30, 1) - momentum) * 0.08;
      lastScroll = window.scrollY;
      pointerX += (targetPointerX - pointerX) * 0.035;
      pointerY += (targetPointerY - pointerY) * 0.035;
      if (sceneSelectionDirty || desiredActive !== active) {
        hasSpatialSectionInView = updateActiveScene();
        sceneSelectionDirty = false;
      }
      if (!hasSpatialSectionInView) {
        momentum *= 0.9;
        return;
      }
      const handingOff = desiredActive !== active;
      const selected: ConfiguratorSlug = active === "engine" ? "window" : active;
      const heroRect = hero?.getBoundingClientRect();
      const heroProgress = heroRect ? THREE.MathUtils.clamp(-heroRect.top / Math.max(heroRect.height - innerHeight, 1), 0, 1) : 0;

      Object.entries(groups).forEach(([keyName, group]) => {
        const isSelected = keyName === selected && keyName !== "window";
        const targetScale = !handingOff && isSelected ? (active === "engine" ? 1.03 : 0.9) : 0.001;
        const scale = THREE.MathUtils.lerp(group.scale.x, targetScale, handingOff ? 0.22 : 0.09);
        group.scale.setScalar(scale);
        group.visible = scale > 0.015;
      });

      const pergolaGroup = groups.pergola;
      if (active === "pergola") {
        pergolaGroup.rotation.y += ((-0.18 + pointerX * 0.04) - pergolaGroup.rotation.y) * 0.045;
        pergolaGroup.rotation.x += ((0.03 - pointerY * 0.025) - pergolaGroup.rotation.x) * 0.045;
      }
      const darkPergola = active === "pergola" && pergolaState.environment.night;
      const darkSolar = active === "solar" && solarState.nightPreview;
      const nightScene = darkPergola || darkSolar;
      const solarDay = active === "solar" && !darkSolar;
      hemisphere.intensity += ((nightScene ? 0.27 : solarDay ? 0.62 : 0.92) - hemisphere.intensity) * 0.08;
      key.intensity += ((nightScene ? 1.08 : 3.15) - key.intensity) * 0.08;
      rim.intensity += ((nightScene ? 0.68 : solarDay ? 1.05 : 1.85) - rim.intensity) * 0.08;
      cool.intensity += ((nightScene ? 0.24 : solarDay ? 0.58 : 1.25) - cool.intensity) * 0.08;
      // The configurable perimeter and integrated fixtures live in the pergola model.
      // Keep the global studio fill neutral so "lights off" still reads as night.
      warm.intensity += ((nightScene ? 0.12 : solarDay ? 0.24 : 0.55) - warm.intensity) * 0.08;
      if (active === "solar") {
        const sun = solarDirection(
          solarState.simulationDate,
          Number(solarState.simulationHour) || 12,
          Number(solarState.locationLat) || 45.63317,
          Number(solarState.northDirection) || 0,
          12,
        );
        key.position.set(sun.x, Math.max(.35, sun.y), sun.z);
        key.intensity += (((sun.elevationDeg < 0 || solarState.nightPreview) ? .22 : 3.15) - key.intensity) * .12;
      } else key.position.lerp(new THREE.Vector3(4.5, 6.5, 7), .08);

      if (active === "roof") {
        groups.roof.rotation.y += ((-0.28 + pointerX * 0.035) - groups.roof.rotation.y) * 0.045;
        groups.roof.rotation.x += ((0.04 - pointerY * 0.02) - groups.roof.rotation.x) * 0.045;
      }
      if (active === "hall") groups.hall.rotation.y += ((Math.PI - 0.38 + pointerX * .035) - groups.hall.rotation.y) * .045;
      if (active === "solar") groups.solar.rotation.y += ((-0.32 + pointerX * .035) - groups.solar.rotation.y) * .045;

      const desiredCamera = active === "pergola"
        ? new THREE.Vector3(9.8, 7.4, 14.8)
        : active === "roof"
          ? new THREE.Vector3(10.8, 7.9, 14.6)
          : active === "hall"
            ? new THREE.Vector3(11.8, 7.2, 15.8)
          : active === "solar"
            ? new THREE.Vector3(11.8, 8.2, 16.6)
          : active === "window"
            ? new THREE.Vector3(3.8, 2.6, 14.2)
            : new THREE.Vector3(4.6 - heroProgress * 1.4, 2.5 + heroProgress * 1.8, 14.8 - heroProgress * 4.5);
      if (active !== "engine") {
        const orbit = orbitState[active];
        const spherical = new THREE.Spherical().setFromVector3(desiredCamera);
        spherical.theta += orbit.yaw;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi + orbit.pitch, 0.08, Math.PI - 0.08);
        desiredCamera.setFromSpherical(spherical);
        desiredCamera.multiplyScalar(orbit.zoom);
        cameraTarget.set(orbit.panX, orbit.panY, 0);
      } else {
        cameraTarget.set(0, 0, 0);
      }
      camera.position.lerp(desiredCamera, 0.035);
      camera.lookAt(cameraTarget);

      gridUniforms.uTime.value = clock;
      gridUniforms.uMomentum.value = momentum;
      renderer.render(scene, camera);
    }
    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else if (!raf && !disposed) {
        animate();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      resizeObserver.disconnect(); themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", markSceneSelectionDirty);
      window.removeEventListener("configurator-control", onControl);
      window.removeEventListener("scene-orbit", onOrbit);
      delete document.documentElement.dataset.webglStageReady;
      window.clearTimeout(pergolaRebuildTimer);
      window.clearTimeout(roofRebuildTimer);
      window.clearTimeout(hallRebuildTimer);
      window.clearTimeout(solarRebuildTimer);
      solarEnvironmentRequest?.abort();
      environmentTarget.dispose();
      renderer.dispose(); renderer.domElement.remove(); disposeScene(scene);
    };
  }, []);

  return (
    <>
      <div className="webgl-stage" ref={host} aria-hidden="true" />
      <div className="renderer-hud" aria-hidden="true">
        <span>WEBGL 2</span><span>LIVE 3D</span><span>CLIENT / GPU</span><span>ENGINE / ACTIVE</span>
      </div>
    </>
  );
}
