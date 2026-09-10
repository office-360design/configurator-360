function roundedBoxGeometry(THREE, width, height, depth, radius, segments = 6, { puff = 0 } = {}) {
  const geometry = new THREE.BoxGeometry(
    width,
    height,
    depth,
    Math.max(2, segments * 2),
    Math.max(2, segments),
    Math.max(2, segments * 2),
  );
  const position = geometry.attributes.position;
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;
  const r = Math.max(0.001, Math.min(radius, hx * 0.92, hy * 0.92, hz * 0.92));
  const inner = new THREE.Vector3(hx - r, hy - r, hz - r);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const delta = new THREE.Vector3();

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
    const mesh = geometryLibrary.mesh(geometry, material, {
      uv: false,
      castShadow: true,
      receiveShadow: true,
      name,
    });
    group.add(mesh);
    woodMeshes.push(mesh);
    return mesh;
  };

  const woodMember = (
    startPoint,
    endPoint,
    {
      width = 0.048,
      depth = 0.052,
      radius = 0.007,
      name = 'wood-member',
      overlapStart = 0,
      overlapEnd = 0,
    } = {},
  ) => {
    const start = new THREE_NS.Vector3(...startPoint);
    const end = new THREE_NS.Vector3(...endPoint);
    const direction = end.clone().sub(start);
    const nominalLength = direction.length();
    const unit = direction.clone().normalize();
    const realStart = start.clone().addScaledVector(unit, -overlapStart);
    const realEnd = end.clone().addScaledVector(unit, overlapEnd);
    const center = realStart.clone().add(realEnd).multiplyScalar(0.5);
    const length = nominalLength + overlapStart + overlapEnd;
    const source = geometryLibrary.create('profile.roundedRectangle', {
      width,
      height: length,
      depth,
      axis: 'y',
      radius,
      segments: 6,
    });
    const mesh = geometryLibrary.mesh(source, woodMaterial, {
      uv: false,
      castShadow: true,
      receiveShadow: true,
      name,
    });
    mesh.quaternion.setFromUnitVectors(new THREE_NS.Vector3(0, 1, 0), unit);
    mesh.position.copy(center);
    group.add(mesh);
    woodMeshes.push(mesh);
    return mesh;
  };

  const woodBar = (width, height, depth, position, name, axis = 'x', radius = 0.007) => {
    const source = geometryLibrary.create('profile.roundedRectangle', {
      width,
      height,
      depth,
      axis,
      radius,
      segments: 6,
    });
    const mesh = addWoodGeometry(source, woodMaterial, name);
    mesh.position.set(...position);
    return mesh;
  };

  // Chair proportions tuned to prioritise clean joinery and believable contact.
  const frontX = 0.262;
  const rearX = 0.262;
  const frontZ = 0.224;
  const rearZ = -0.218;
  const frontPostTopY = 0.588;
  const rearPostTopY = 0.812;
  const railY = 0.444;
  const armFrontY = 0.568;
  const armRearY = 0.676;
  const backRailY = 0.738;
  const seatCenterY = 0.494;
  const seatCenterZ = 0.014;

  for (const side of [-1, 1]) {
    const sx = side;

    // Keep the contact points vertical so all legs sit naturally on the floor.
    woodMember([sx * frontX, 0.03, frontZ], [sx * frontX, frontPostTopY, frontZ], {
      width: 0.054,
      depth: 0.058,
      radius: 0.008,
      name: 'front-leg',
    });
    woodMember([sx * rearX, 0.03, rearZ], [sx * rearX, rearPostTopY, rearZ], {
      width: 0.056,
      depth: 0.060,
      radius: 0.008,
      name: 'rear-upright',
    });

    // Front arm joins now stop short of deep interpenetration so the texture does
    // not z-fight against the post. A dedicated bridge then closes the visible top
    // corner, creating a continuous smooth join with no floating gap.
    woodMember([sx * frontX, armFrontY + 0.004, frontZ - 0.004], [sx * rearX, armRearY, rearZ + 0.010], {
      width: 0.054,
      depth: 0.072,
      radius: 0.011,
      name: 'arm-rail',
      overlapStart: 0.002,
      overlapEnd: 0.014,
    });

    // Small bridging cap between the front post and the arm rail. This replaces
    // the previous overlapping filler and removes both the visible texture glitch
    // and the remaining upper-side gap at the joint.
    woodMember([sx * frontX, armFrontY - 0.006, frontZ - 0.001], [sx * frontX, armFrontY + 0.010, frontZ - 0.012], {
      width: 0.032,
      depth: 0.052,
      radius: 0.006,
      name: 'front-arm-joint-bridge',
      overlapStart: 0,
      overlapEnd: 0,
    });

    // Side seat rails fully span from the front post into the rear upright.
    woodMember([sx * frontX, railY, frontZ - 0.01], [sx * rearX, railY, rearZ + 0.024], {
      width: 0.044,
      depth: 0.050,
      radius: 0.007,
      name: 'side-seat-rail',
      overlapStart: 0.022,
      overlapEnd: 0.024,
    });

    // Small inner spacer/support near the back cushion attachment.
    woodBar(0.030, 0.090, 0.042, [sx * 0.224, 0.700, rearZ + 0.002], 'backrest-support', 'y', 0.006);
  }

  // Front and rear cross rails are now built as spanning members with deliberate
  // join depth into the side frames so they visually connect on both sides.
  woodMember([-frontX, railY, frontZ], [frontX, railY, frontZ], {
    width: 0.046,
    depth: 0.050,
    radius: 0.007,
    name: 'front-seat-rail',
    overlapStart: 0.020,
    overlapEnd: 0.020,
  });
  woodMember([-rearX, railY, rearZ + 0.006], [rearX, railY, rearZ + 0.006], {
    width: 0.044,
    depth: 0.048,
    radius: 0.007,
    name: 'rear-seat-rail',
    overlapStart: 0.020,
    overlapEnd: 0.020,
  });
  woodMember([-rearX, backRailY, rearZ], [rearX, backRailY, rearZ], {
    width: 0.042,
    depth: 0.046,
    radius: 0.006,
    name: 'back-cross-rail',
    overlapStart: 0.018,
    overlapEnd: 0.018,
  });

  // Inner cleats stay mostly hidden but support the seat visually.
  woodBar(0.392, 0.022, 0.026, [0, 0.462, 0.090], 'seat-cleat-front', 'x', 0.004);
  woodBar(0.392, 0.022, 0.026, [0, 0.462, -0.090], 'seat-cleat-rear', 'x', 0.004);

  const seatGeometry = roundedBoxGeometry(THREE_NS, 0.502, 0.076, 0.470, 0.032, 8, { puff: 0.009 });
  geometryLibrary.adopt(seatGeometry, { kind: 'chair.cushion.seat', units: 'metres' });
  geometryLibrary.prepare(seatGeometry, { uv: { grainAxis: 'x' } });
  const seat = geometryLibrary.mesh(seatGeometry, fabricMaterial, {
    uv: false,
    castShadow: true,
    receiveShadow: true,
    name: 'upholstered-seat',
  });
  seat.position.set(0, seatCenterY, seatCenterZ);
  group.add(seat);
  fabricMeshes.push(seat);

  const backGeometry = roundedBoxGeometry(THREE_NS, 0.468, 0.176, 0.094, 0.038, 8, { puff: 0.004 });
  geometryLibrary.adopt(backGeometry, { kind: 'chair.cushion.back', units: 'metres' });
  geometryLibrary.prepare(backGeometry, { uv: { grainAxis: 'x' } });
  const back = geometryLibrary.mesh(backGeometry, fabricMaterial, {
    uv: false,
    castShadow: true,
    receiveShadow: true,
    name: 'upholstered-back',
  });
  back.position.set(0, 0.704, rearZ + 0.002);
  back.rotation.x = THREE_NS.MathUtils.degToRad(-4.5);
  group.add(back);
  fabricMeshes.push(back);

  const underside = roundedBoxGeometry(THREE_NS, 0.468, 0.022, 0.428, 0.014, 4);
  geometryLibrary.adopt(underside, { kind: 'chair.cushion.underside', units: 'metres' });
  geometryLibrary.prepare(underside, { uv: { grainAxis: 'x' } });
  const underMesh = geometryLibrary.mesh(underside, fabricMaterial, {
    uv: false,
    castShadow: true,
    receiveShadow: true,
    name: 'seat-underside',
  });
  underMesh.position.set(0, 0.454, seatCenterZ);
  group.add(underMesh);
  fabricMeshes.push(underMesh);

  // Ground the assembled chair precisely so the legs sit on the floor plane.
  const bounds = new THREE_NS.Box3().setFromObject(group);
  group.position.y -= bounds.min.y;

  return {
    group,
    woodMeshes,
    fabricMeshes,
    dimensions: {
      seatWidthMm: 500,
      seatDepthMm: 470,
      overallHeightMm: 790,
    },
  };
}
