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

  const addWoodGeometry = (geometry, material, name) => {
    const mesh = geometryLibrary.mesh(geometry, material, { uv: false, castShadow: true, receiveShadow: true, name });
    group.add(mesh);
    woodMeshes.push(mesh);
    return mesh;
  };

  const woodMember = (a, b, {
    width = .048, depth = .052, radius = .007, name = 'wood-member', overlapStart = 0, overlapEnd = 0,
  } = {}) => {
    const start = new THREE_NS.Vector3(...a);
    const end = new THREE_NS.Vector3(...b);
    const direction = end.clone().sub(start);
    const nominalLength = direction.length();
    const unit = direction.clone().normalize();
    const realStart = start.clone().addScaledVector(unit, -overlapStart);
    const realEnd = end.clone().addScaledVector(unit, overlapEnd);
    const center = realStart.clone().add(realEnd).multiplyScalar(.5);
    const length = nominalLength + overlapStart + overlapEnd;
    const source = geometryLibrary.create('profile.roundedRectangle', {
      width, height: length, depth, axis: 'y', radius, segments: 6,
    });
    const mesh = geometryLibrary.mesh(source, woodMaterial, { uv: false, castShadow: true, receiveShadow: true, name });
    mesh.quaternion.setFromUnitVectors(new THREE_NS.Vector3(0, 1, 0), unit);
    mesh.position.copy(center);
    group.add(mesh);
    woodMeshes.push(mesh);
    return mesh;
  };

  const woodBar = (width, height, depth, position, name, axis = 'x', radius = .007) => {
    const source = geometryLibrary.create('profile.roundedRectangle', { width, height, depth, axis, radius, segments: 6 });
    const mesh = addWoodGeometry(source, woodMaterial, name);
    mesh.position.set(...position);
    return mesh;
  };

  // Geometry authored from scratch to favour believable joinery over loosely intersecting beams.
  // Rear uprights are continuous from floor to the backrest top, which removes one of the visible broken joints.
  const outerX = .284;
  const innerX = .262;
  const rearOuterX = .276;
  const frontZBottom = .252;
  const frontZTop = .208;
  const rearZBottom = -.252;
  const rearZTop = -.223;
  const armRearZ = -.198;

  for (const side of [-1, 1]) {
    const sx = side;
    // Front leg up to the arm joint.
    woodMember([sx * outerX, .035, frontZBottom], [sx * innerX, .505, frontZTop], {
      width: .052, depth: .056, radius: .008, name: 'front-leg', overlapEnd: .004,
    });
    // Continuous rear leg + back upright.
    woodMember([sx * rearOuterX, .035, rearZBottom], [sx * innerX, .812, rearZTop], {
      width: .054, depth: .058, radius: .008, name: 'rear-upright',
    });
    // Armrest rail, intentionally overlapped into the front and rear posts so no daylight seams appear.
    woodMember([sx * innerX, .505, frontZTop], [sx * innerX, .665, armRearZ], {
      width: .052, depth: .070, radius: .011, name: 'arm-rail', overlapStart: .010, overlapEnd: .012,
    });
    // Side seat rail sitting just below the cushion, inset between the posts.
    woodMember([sx * .250, .440, .206], [sx * .252, .430, -.184], {
      width: .042, depth: .048, radius: .007, name: 'side-seat-rail', overlapStart: .008, overlapEnd: .008,
    });
    // Small backrest support block to make the rear joint read as an intentional woodworking transition.
    woodBar(.032, .080, .040, [sx * .222, .708, -.212], 'backrest-support', 'y', .006);
  }

  // Cross rails are inset between the side frames instead of running through them, which produces cleaner joints.
  woodBar(.460, .052, .050, [0, .445, .230], 'front-seat-rail', 'x', .007);
  woodBar(.460, .050, .048, [0, .438, -.198], 'rear-seat-rail', 'x', .007);
  woodBar(.418, .042, .046, [0, .742, -.221], 'back-cross-rail', 'x', .006);

  // Discreet inner cleats keep the cushion visually supported while staying mostly hidden.
  woodBar(.388, .022, .026, [0, .462, .090], 'seat-cleat-front', 'x', .004);
  woodBar(.388, .022, .026, [0, .460, -.090], 'seat-cleat-rear', 'x', .004);

  // Upholstered seat: close to the reference proportions while slightly softened for realism.
  const seatGeometry = roundedBoxGeometry(THREE_NS, .500, .078, .468, .032, 8, { puff: .009 });
  geometryLibrary.adopt(seatGeometry, { kind: 'chair.cushion.seat', units: 'metres' });
  geometryLibrary.prepare(seatGeometry, { uv: { grainAxis: 'x' } });
  const seat = geometryLibrary.mesh(seatGeometry, fabricMaterial, { uv: false, castShadow: true, receiveShadow: true, name: 'upholstered-seat' });
  seat.position.set(0, .495, .020);
  group.add(seat); fabricMeshes.push(seat);

  const backGeometry = roundedBoxGeometry(THREE_NS, .468, .182, .092, .038, 8, { puff: .004 });
  geometryLibrary.adopt(backGeometry, { kind: 'chair.cushion.back', units: 'metres' });
  geometryLibrary.prepare(backGeometry, { uv: { grainAxis: 'x' } });
  const back = geometryLibrary.mesh(backGeometry, fabricMaterial, { uv: false, castShadow: true, receiveShadow: true, name: 'upholstered-back' });
  back.position.set(0, .704, -.214);
  back.rotation.x = THREE_NS.MathUtils.degToRad(-5.5);
  group.add(back); fabricMeshes.push(back);

  const underside = roundedBoxGeometry(THREE_NS, .462, .026, .424, .014, 4);
  geometryLibrary.adopt(underside, { kind: 'chair.cushion.underside', units: 'metres' });
  geometryLibrary.prepare(underside, { uv: { grainAxis: 'x' } });
  const underMesh = geometryLibrary.mesh(underside, fabricMaterial, { uv: false, castShadow: true, receiveShadow: true, name: 'seat-underside' });
  underMesh.position.set(0, .454, .018);
  group.add(underMesh); fabricMeshes.push(underMesh);

  return { group, woodMeshes, fabricMeshes, dimensions: { seatWidthMm: 500, seatDepthMm: 470, overallHeightMm: 790 } };
}
