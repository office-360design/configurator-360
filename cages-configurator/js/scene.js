import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const cssColor = name => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue(name).trim());

function disposeTree(object) {
  object.traverse(child => {
    if (child.isSprite) { child.material.map.dispose(); child.material.dispose(); return; }
    child.geometry?.dispose();
    child.material?.map?.dispose();
  });
}

function labelSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = '#E3AB00'; g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#1B1606'; g.font = "700 54px 'Barlow Condensed', 'Arial Narrow', sans-serif";
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 52);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.renderOrder = 10;
  return sprite;
}

// Three.js view of one cage lying on timber sleepers. Units: metres in the scene.
export class CageScene {
  constructor(host) {
    this.host = host;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.02, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    // Physical light units since r155: scale the legacy intensities by π.
    this.scene.add(new THREE.HemisphereLight(0xf2f4f5, 0x4a4540, 0.85 * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9 * Math.PI); sun.position.set(6, 10, 8); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfd4e0, 0.35 * Math.PI); fill.position.set(-8, 4, -6); this.scene.add(fill);
    this.mat = {
      bar: new THREE.MeshStandardMaterial({ color: 0x6f6259, metalness: 0.55, roughness: 0.5 }),
      spiral: new THREE.MeshStandardMaterial({ color: 0x857466, metalness: 0.55, roughness: 0.45 }),
      ring: new THREE.MeshStandardMaterial({ color: 0x5d544d, metalness: 0.5, roughness: 0.55 }),
      weld: new THREE.MeshStandardMaterial({ color: 0xE3AB00, metalness: 0.2, roughness: 0.5, emissive: 0x3a2a00 }),
      spacer: new THREE.MeshStandardMaterial({ color: 0xe9e6dc, metalness: 0, roughness: 0.7 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }),
      bore: new THREE.MeshBasicMaterial({ color: 0x2F7FA3, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide }),
      boreEdge: new THREE.LineBasicMaterial({ color: 0x2F7FA3, transparent: true, opacity: 0.55 }),
    };
    this.cage = null; this.grid = null; this.weldMesh = null; this.boreGroup = null;
    this.showWelds = true; this.showBore = false;
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => { this.controls.update(); this.renderer.render(this.scene, this.camera); requestAnimationFrame(loop); };
    loop();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  build(S, M) {
    if (this.cage) { this.scene.remove(this.cage); disposeTree(this.cage); }
    const cage = new THREE.Group();
    const k = 0.001, L = M.L * k, halfH = M.H / 2 * k, yc = halfH + 0.12, x0 = -L / 2;
    cage.userData = { L, yc, R: Math.max(M.B, M.H) / 2 * k };
    const W = (z, u, v, out) => out.set(x0 + z * k, yc + v * k, u * k);
    const mtx = new THREE.Matrix4();
    const v = new THREE.Vector3();

    // Longitudinal bars.
    const barGeo = new THREE.CylinderGeometry(M.dl / 2 * k, M.dl / 2 * k, L, 10, 1);
    barGeo.rotateZ(Math.PI / 2);
    const bars = new THREE.InstancedMesh(barGeo, this.mat.bar, M.bars.length);
    M.bars.forEach((b, i) => { mtx.makeTranslation(0, yc + b.v * k, b.u * k); bars.setMatrixAt(i, mtx); });
    cage.add(bars);

    // Spiral.
    if (M.Ttot > 0) {
      class Helix extends THREE.Curve {
        getPoint(t, target = new THREE.Vector3()) {
          const T = t * M.Ttot, z = M.Tinv(T), p = M.path(T - Math.floor(T));
          return W(z, p[0], p[1], target);
        }
      }
      const perTurn = M.circ ? 28 : 40;
      const segs = Math.min(60000, Math.max(64, Math.ceil(M.Ttot * perTurn)));
      cage.add(new THREE.Mesh(new THREE.TubeGeometry(new Helix(), segs, M.ds / 2 * k, 6, false), this.mat.spiral));
    }

    // Stiffening rings.
    M.ringZ.forEach(z => {
      class Loop extends THREE.Curve {
        getPoint(t, target = new THREE.Vector3()) { const p = M.path(t, M.ringOff); return W(z, p[0], p[1], target); }
      }
      cage.add(new THREE.Mesh(new THREE.TubeGeometry(new Loop(), M.circ ? 72 : 96, (+S.ringD) / 2 * k, 6, true), this.mat.ring));
    });

    // Welds: spiral × bars, rings × bars.
    const wr = Math.max(M.dl, M.ds) * 0.55 * k;
    const ringWelds = M.ringZ.length * M.bars.length;
    this.weldMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(wr, 6, 4), this.mat.weld, M.welds.length + ringWelds);
    let wi = 0;
    M.welds.forEach(([z, bi]) => {
      const b = M.bars[bi], p = M.path(b.s);
      W(z, (p[0] + b.u) / 2, (p[1] + b.v) / 2, v);
      mtx.makeTranslation(v.x, v.y, v.z); this.weldMesh.setMatrixAt(wi++, mtx);
    });
    M.ringZ.forEach(z => M.bars.forEach(b => {
      const n = Math.hypot(b.u, b.v) || 1, d = M.dl / 2;
      W(z, b.u - b.u / n * d, b.v - b.v / n * d, v);
      mtx.makeTranslation(v.x, v.y, v.z); this.weldMesh.setMatrixAt(wi++, mtx);
    }));
    this.weldMesh.visible = this.showWelds;
    cage.add(this.weldMesh);

    // Plastic spacer wheels clipped on the spiral.
    if (M.spacerZ.length) {
      const wheel = new THREE.CylinderGeometry(S.cover * k, S.cover * k, 0.018, 20);
      const im = new THREE.InstancedMesh(wheel, this.mat.spacer, M.spacerZ.length * S.spacerPer);
      const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(1, 1, 1);
      let si = 0;
      M.spacerZ.forEach(z => {
        for (let j = 0; j < S.spacerPer; j++) {
          const s = (j + 0.5) / S.spacerPer, e = 1e-3, a = M.path(s - e), b = M.path(s + e), p = M.path(s);
          let tu = b[0] - a[0], tv = b[1] - a[1];
          const tl = Math.hypot(tu, tv); tu /= tl; tv /= tl;
          const nu = tv, nv = -tu;
          W(z, p[0] + nu * M.ds / 2, p[1] + nv * M.ds / 2, v);
          q.setFromUnitVectors(up, new THREE.Vector3(0, tv, tu));
          mtx.compose(v, q, sc); im.setMatrixAt(si++, mtx);
        }
      });
      cage.add(im);
    }

    // Timber sleepers.
    const sleeper = new THREE.BoxGeometry(0.14, 0.12, Math.max(M.B, M.H) * k + 0.5);
    (L > 14 ? [-0.36 * L, 0, 0.36 * L] : [-0.3 * L, 0.3 * L]).forEach(x => {
      const b = new THREE.Mesh(sleeper, this.mat.wood); b.position.set(x, 0.06, 0); cage.add(b);
    });

    // Bore (pile) or panel (diaphragm wall) outline.
    this.boreGroup = new THREE.Group();
    const bl = L + 0.6;
    let bg;
    if (M.circ) { bg = new THREE.CylinderGeometry(M.boreB / 2 * k, M.boreB / 2 * k, bl, 48, 1, true); bg.rotateZ(Math.PI / 2); }
    else bg = new THREE.BoxGeometry(bl, M.boreH * k, M.boreB * k);
    const bm = new THREE.Mesh(bg, this.mat.bore); bm.position.set(0, yc, 0); this.boreGroup.add(bm);
    let edgeSource = bg;
    if (M.circ) { edgeSource = new THREE.CylinderGeometry(M.boreB / 2 * k, M.boreB / 2 * k, bl, 48, 1, false); edgeSource.rotateZ(Math.PI / 2); }
    const el = new THREE.LineSegments(new THREE.EdgesGeometry(edgeSource, 20), this.mat.boreEdge);
    if (edgeSource !== bg) edgeSource.dispose();
    el.position.copy(bm.position); this.boreGroup.add(el);
    this.boreGroup.visible = this.showBore;
    cage.add(this.boreGroup);

    // End labels.
    const head = labelSprite('CAP'), tip = labelSprite('VÂRF');
    const ls = Math.max(0.14, Math.min(0.45, cage.userData.R * 1.1, L * 0.03));
    [head, tip].forEach(s => s.scale.set(ls * 2.67 / 2, ls / 2, 1));
    head.position.set(L / 2 + ls * 0.9, yc + halfH + ls * 0.5, 0);
    tip.position.set(-L / 2 - ls * 0.9, yc + halfH + ls * 0.5, 0);
    cage.add(head, tip);

    this.cage = cage;
    this.scene.add(cage);
    this.applyTheme();
  }

  applyTheme() {
    this.scene.background = cssColor('--viewport');
    const bore = cssColor('--bore');
    this.mat.bore.color.copy(bore); this.mat.boreEdge.color.copy(bore);
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); }
    if (!this.cage) return;
    const size = Math.ceil(this.cage.userData.L + 6);
    this.grid = new THREE.GridHelper(size, size, cssColor('--grid-a'), cssColor('--grid-b'));
    this.scene.add(this.grid);
  }

  setWelds(visible) { this.showWelds = visible; if (this.weldMesh) this.weldMesh.visible = visible; }
  setBore(visible) { this.showBore = visible; if (this.boreGroup) this.boreGroup.visible = visible; }

  fit(view = 'all') {
    if (!this.cage) return;
    const { L, yc, R } = this.cage.userData, D = R * 2;
    let pos, target;
    if (view === 'head') {
      target = new THREE.Vector3(L / 2 - Math.max(0.6, D * 0.8), yc, 0);
      pos = new THREE.Vector3(L / 2 + Math.max(1.4, D * 2.2), yc + Math.max(0.9, D * 1.3), Math.max(1.6, D * 2.6));
    } else if (view === 'axial') {
      target = new THREE.Vector3(0, yc, 0);
      pos = new THREE.Vector3(L / 2 + Math.max(2.2, D * 4), yc + 0.02, 0.001);
    } else {
      target = new THREE.Vector3(0, yc, 0);
      pos = new THREE.Vector3(L * 0.18, Math.max(L * 0.26, 1.6), Math.max(L * 0.72, 3));
    }
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
  }

  get length() { return this.cage?.userData.L ?? null; }
}
