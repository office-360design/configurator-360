import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { triangulate } from "../js/roofLayout.js?v=layout-21";
import { getProduct, profileRelief } from "./catalog.js?v=builder-game-3";
import { createCoatedFinish } from "./materials.js?v=builder-game-3";
import { openingCorners } from "./geometry.js?v=builder-game-3";

function trianglePoints(polygon) {
  const vertices = polygon.map((p) => ({ x: p.x, z: p.y }));
  return triangulate(
    vertices.map((_, i) => i),
    vertices,
  ).map((ids) => ids.map((i) => polygon[i]));
}
export function productGeometry(face, detailed = true) {
  const positions = [],
    normals = [],
    uvs = [];
  const normal = face.normal || { x: 0, y: 1, z: 0 };
  const vertex = (p) => {
    const q = face.toWorld(p),
      relief = detailed ? profileRelief(face.part.productId, p.x, p.y) : 0.002;
    positions.push(
      q.x + normal.x * relief,
      q.h + normal.y * relief,
      q.y + normal.z * relief,
    );
    uvs.push(p.x, p.y);
    if (detailed) {
      const delta = 0.002,
        u = face.toWorld({ x: p.x + delta, y: p.y }),
        v = face.toWorld({ x: p.x, y: p.y + delta });
      const du =
        (profileRelief(face.part.productId, p.x + delta, p.y) -
          profileRelief(face.part.productId, p.x - delta, p.y)) /
        (2 * delta);
      const dv =
        (profileRelief(face.part.productId, p.x, p.y + delta) -
          profileRelief(face.part.productId, p.x, p.y - delta)) /
        (2 * delta);
      const a = new THREE.Vector3(
        (u.x - q.x) / delta + normal.x * du,
        (u.h - q.h) / delta + normal.y * du,
        (u.y - q.y) / delta + normal.z * du,
      );
      const b = new THREE.Vector3(
        (v.x - q.x) / delta + normal.x * dv,
        (v.h - q.h) / delta + normal.y * dv,
        (v.y - q.y) / delta + normal.z * dv,
      );
      const n = a.cross(b).normalize();
      if (n.x * normal.x + n.y * normal.y + n.z * normal.z < 0) n.negate();
      normals.push(n.x, n.y, n.z);
    } else normals.push(normal.x, normal.y, normal.z);
  };
  for (const polygon of face.polygons)
    for (const tri of trianglePoints(polygon)) {
      const [a, b, c] = tri,
        longest = Math.max(
          ...tri.map((p, i) =>
            Math.hypot(p.x - tri[(i + 1) % 3].x, p.y - tri[(i + 1) % 3].y),
          ),
        );
      const divisions = detailed
        ? Math.min(65, Math.max(1, Math.ceil(longest * 7)))
        : 1;
      const point = (i, j) => ({
        x: a.x + ((b.x - a.x) * i) / divisions + ((c.x - a.x) * j) / divisions,
        y: a.y + ((b.y - a.y) * i) / divisions + ((c.y - a.y) * j) / divisions,
      });
      for (let i = 0; i < divisions; i++)
        for (let j = 0; j < divisions - i; j++) {
          [point(i, j), point(i, j + 1), point(i + 1, j)].forEach(vertex);
          if (i + j < divisions - 1)
            [point(i + 1, j), point(i, j + 1), point(i + 1, j + 1)].forEach(
              vertex,
            );
        }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}
// Approximate accessory cross-sections are explicitly presentation geometry.
// Stock lengths, fastening and overlaps are never inferred from these meshes.
export function accessoryGeometry(type, edge) {
  const a = new THREE.Vector3(edge[0].x, edge[0].h, edge[0].y),
    b = new THREE.Vector3(edge[1].x, edge[1].h, edge[1].y);
  const along = b.clone().sub(a).normalize(),
    across = new THREE.Vector3(-along.z, 0, along.x).normalize(),
    up = new THREE.Vector3().crossVectors(along, across).normalize();
  if (up.y < 0) up.negate();
  let section;
  if (type === "gutter")
    section = Array.from({ length: 13 }, (_, i) => {
      const angle = (Math.PI * i) / 12;
      return [Math.cos(angle) * 0.065, -Math.sin(angle) * 0.065];
    });
  else if (type === "valley")
    section = [
      [-0.18, 0.02],
      [0, -0.025],
      [0.18, 0.02],
    ];
  else if (type === "ridge" || type === "hip")
    section = [
      [-0.15, 0],
      [0, 0.075],
      [0.15, 0],
    ];
  else
    section = [
      [-0.12, 0],
      [0, 0],
      [0, -0.1],
    ];
  const positions = [];
  const point = (origin, p) =>
    origin
      .clone()
      .addScaledVector(across, p[0])
      .addScaledVector(up, p[1] + 0.015);
  for (let i = 0; i < section.length - 1; i++) {
    const x = point(a, section[i]),
      y = point(a, section[i + 1]),
      z = point(b, section[i]),
      w = point(b, section[i + 1]);
    [x, y, z, y, w, z].forEach((p) => positions.push(...p.toArray()));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}
function disposeGroup(group) {
  group.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((m) => m?.dispose());
  });
  group.clear();
}
export class BuilderViewer {
  constructor(host) {
    this.host = host;
    this.disposed = false;
    this.frame = 0;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#edf0f3");
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.01, 500);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.05;
    this.onChange = () => this.requestRender();
    this.controls.addEventListener("change", this.onChange);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x536d51, 2.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(-10, 25, 15);
    this.scene.add(sun);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  resize() {
    if (this.disposed) return;
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
  update(resolved, detailed = true) {
    disposeGroup(this.group);
    this.finish ||= createCoatedFinish();
    for (const face of resolved.faces.filter((f) => f.assembled)) {
      this.group.add(
        new THREE.Mesh(
          productGeometry(face, false),
          new THREE.MeshStandardMaterial({
            color: face.part.colour,
            roughness: 0.96,
            metalness: 0.02,
            side: THREE.DoubleSide,
          }),
        ),
      );
      const mesh = new THREE.Mesh(
        productGeometry(face, detailed),
        this.finish.material(face.part),
      );
      mesh.userData = {
        faceId: face.id,
        modelAccuracy: getProduct(face.part.productId).modelAccuracy,
      };
      this.group.add(mesh);
      for (const opening of face.openings || []) {
        const base = openingCorners(opening).map(face.toWorld),
          positions = [];
        const put = (ps) =>
          positions.push(...ps.flatMap((p) => [p.x, p.h + 0.025, p.y]));
        if (opening.type === "chimney") {
          const h = Math.max(...base.map((p) => p.h)) + 0.8,
            top = base.map((p) => ({ ...p, h }));
          for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            put([base[i], base[j], top[i], base[j], top[j], top[i]]);
          }
          put([top[0], top[1], top[2], top[0], top[2], top[3]]);
        } else put([base[0], base[1], base[2], base[0], base[2], base[3]]);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        geometry.computeVertexNormals();
        this.group.add(
          new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({
              color: opening.type === "chimney" ? "#adb2b7" : "#73b6dc",
              metalness: opening.type === "chimney" ? 0.05 : 0.35,
              roughness: 0.35,
              side: THREE.DoubleSide,
            }),
          ),
        );
      }
      const points = face.edges
        .flatMap((edge) => edge.map(face.toWorld))
        .flatMap((p) => [p.x, p.h + 0.02, p.y]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
      this.group.add(
        new THREE.LineSegments(
          geo,
          new THREE.LineBasicMaterial({ color: 0x243e2d }),
        ),
      );
      for (const { role: type, edge } of face.edgeAnnotations) {
        const endpoints = edge.map(face.toWorld);
        this.group.add(
          new THREE.Mesh(
            accessoryGeometry(type, endpoints),
            new THREE.MeshStandardMaterial({
              color: face.part.colour,
              side: THREE.DoubleSide,
              metalness: 0.5,
              roughness: 0.6,
            }),
          ),
        );
        if (type === "gutter") {
          const a = endpoints[0];
          const height = Math.max(1, a.h + 3);
          const pipe = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, height, 16),
            new THREE.MeshStandardMaterial({
              color: face.part.colour,
              metalness: 0.5,
              roughness: 0.6,
            }),
          );
          pipe.position.set(a.x, a.h - height / 2, a.y);
          this.group.add(pipe);
        }
      }
    }
    for (const fold of resolved.folds) {
      let geometry;
      if (fold.type === "heightStep") {
        const [a, b] = fold.edge,
          [c, d] = fold.lower,
          points = [a, b, c, b, d, c].flatMap((p) => [p.x, p.h, p.y]);
        geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(points, 3),
        );
        geometry.computeVertexNormals();
      } else geometry = accessoryGeometry(fold.type, fold.edge);
      this.group.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: "#555c56",
            side: THREE.DoubleSide,
            metalness: 0.5,
            roughness: 0.65,
          }),
        ),
      );
    }
    this.fit();
  }
  fit() {
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) {
      box.set(new THREE.Vector3(-2, 0, -2), new THREE.Vector3(2, 2, 2));
    }
    const centre = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3()),
      distance = Math.max(size.x, size.y, size.z, 3) * 1.8;
    this.controls.target.copy(centre);
    this.camera.position
      .copy(centre)
      .add(new THREE.Vector3(distance * 0.6, distance * 0.85, distance * 0.8));
    this.controls.update();
    this.requestRender();
  }
  zoom(scale) {
    const delta = this.camera.position
      .clone()
      .sub(this.controls.target)
      .multiplyScalar(scale);
    this.camera.position.copy(this.controls.target).add(delta);
    this.controls.update();
    this.requestRender();
  }
  requestRender() {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.removeEventListener("change", this.onChange);
    this.controls.dispose();
    disposeGroup(this.group);
    this.finish?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
