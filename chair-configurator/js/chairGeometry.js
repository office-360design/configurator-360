function roundedBoxGeometry(THREE, width, height, depth, radius, segments = 6, { puff = 0 } = {}) {
  const geometry = new THREE.BoxGeometry(width, height, depth, Math.max(2, segments * 2), Math.max(2, segments), Math.max(2, segments * 2));
  const position = geometry.attributes.position;
  const hx = width / 2, hy = height / 2, hz = depth / 2;
  const r = Math.max(0.001, Math.min(radius, hx * .92, hy * .92, hz * .92));
  const inner = new THREE.Vector3(hx - r, hy - r, hz - r);
  const p = new THREE.Vector3(), q = new THREE.Vector3(), delta = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i);
    q.set(
      THREE.MathUtils.clamp(p.x, -inner.x, inner.x),
      THREE.MathUtils.clamp(p.y, -inner.y, inner.y),
      THREE.MathUtils.clamp(p.z, -inner.z, inner.z),
    );
    delta.copy(p).sub(q);
    if (delta.lengthSq() > 1e-12) p.copy(q).add(delta.normalize().multiplyScalar(r));
    if (puff) {
      const nx = Math.min(1, Math.abs(p.x) / hx);
      const nz = Math.min(1, Math.abs(p.z) / hz);
      const bulge = (1 - nx * nx) * (1 - nz * nz) * puff;
      p.y += Math.sign(p.y || 1) * bulge;
    }
    position.setXYZ(i, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createChairModel(THREE_NS, geometryLibrary, { woodMaterial, fabricMaterial } = {}) {
  const group = new THREE_NS.Group();
  group.name = 'Nicolas-inspired procedural chair';
  group.userData.originalGeometry = true;
  const woodMeshes = [];
  const fabricMeshes = [];

  const woodMember = (a, b, width = .048, depth = .052, radius = .007, name = 'wood-member') => {
    const start = new THREE_NS.Vector3(...a), end = new THREE_NS.Vector3(...b);
    const center = start.clone().add(end).multiplyScalar(.5);
    const length = start.distanceTo(end);
    const source = geometryLibrary.create('profile.roundedRectangle', {
      width, height: length, depth, axis: 'y', radius, segments: 5,
    });
    const mesh = geometryLibrary.mesh(source, woodMaterial, { uv: false, castShadow: true, receiveShadow: true, name });
    const direction = end.clone().sub(start).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE_NS.Vector3(0, 1, 0), direction);
    mesh.position.copy(center);
    group.add(mesh); woodMeshes.push(mesh); return mesh;
  };

  const woodBar = (width, height, depth, position, name, axis = 'x', radius = .007) => {
    const source = geometryLibrary.create('profile.roundedRectangle', { width, height, depth, axis, radius, segments: 5 });
    const mesh = geometryLibrary.mesh(source, woodMaterial, { uv: false, castShadow: true, receiveShadow: true, name });
    mesh.position.set(...position); group.add(mesh); woodMeshes.push(mesh); return mesh;
  };

  // Side frames: gently splayed legs and sloping arm/back supports, authored from scratch.
  for (const side of [-1, 1]) {
    const x = side * .285;
    woodMember([x, .045, .255], [side * .265, .505, .205], .052, .056, .008, 'front-leg');
    woodMember([x, .045, -.255], [side * .270, .690, -.205], .052, .058, .008, 'rear-leg');
    woodMember([side * .268, .515, .205], [side * .270, .665, -.205], .052, .070, .011, 'arm-rail');
    woodMember([side * .270, .665, -.205], [side * .255, .805, -.225], .052, .062, .009, 'back-upright');
  }

  // Under-seat structure and back rail.
  woodBar(.535, .055, .055, [0, .438, .235], 'front-seat-rail', 'x');
  woodBar(.535, .055, .055, [0, .435, -.205], 'rear-seat-rail', 'x');
  woodBar(.048, .050, .420, [-.260, .442, .015], 'left-seat-side', 'z');
  woodBar(.048, .050, .420, [.260, .442, .015], 'right-seat-side', 'z');
  woodBar(.480, .045, .050, [0, .755, -.222], 'back-cross-rail', 'x');

  // Upholstered seat: 500 x 470 mm per the reference product page.
  const seatGeometry = roundedBoxGeometry(THREE_NS, .500, .075, .470, .032, 7, { puff: .008 });
  geometryLibrary.adopt(seatGeometry, { kind: 'chair.cushion.seat', units: 'metres' });
  geometryLibrary.prepare(seatGeometry, { uv: { grainAxis: 'x' } });
  const seat = geometryLibrary.mesh(seatGeometry, fabricMaterial, { uv: false, castShadow: true, receiveShadow: true, name: 'upholstered-seat' });
  seat.position.set(0, .493, .015);
  group.add(seat); fabricMeshes.push(seat);

  const backGeometry = roundedBoxGeometry(THREE_NS, .470, .190, .092, .040, 8, { puff: .004 });
  geometryLibrary.adopt(backGeometry, { kind: 'chair.cushion.back', units: 'metres' });
  geometryLibrary.prepare(backGeometry, { uv: { grainAxis: 'x' } });
  const back = geometryLibrary.mesh(backGeometry, fabricMaterial, { uv: false, castShadow: true, receiveShadow: true, name: 'upholstered-back' });
  back.position.set(0, .700, -.225);
  back.rotation.x = THREE_NS.MathUtils.degToRad(-7);
  group.add(back); fabricMeshes.push(back);

  // Soft underside keeps the seat visually substantial without adding a new configurable material.
  const underside = roundedBoxGeometry(THREE_NS, .465, .028, .430, .014, 4);
  geometryLibrary.adopt(underside, { kind: 'chair.cushion.underside', units: 'metres' });
  geometryLibrary.prepare(underside, { uv: { grainAxis: 'x' } });
  const underMesh = geometryLibrary.mesh(underside, fabricMaterial, { uv: false, castShadow: true, receiveShadow: true, name: 'seat-underside' });
  underMesh.position.set(0, .452, .012);
  group.add(underMesh); fabricMeshes.push(underMesh);

  return { group, woodMeshes, fabricMeshes, dimensions: { seatWidthMm: 500, seatDepthMm: 470, overallHeightMm: 790 } };
}
