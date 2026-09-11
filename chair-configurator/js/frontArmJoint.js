/** Fitted front post / armrest joint, authored in metres.
 *
 * One shared cut ring partitions the exterior into two non-overlapping pieces.
 * Mating faces are internal and deliberately not rendered. There is no filler,
 * polygon offset, depth-test override, or overlapping strip at the connection.
 * This helper is chair-only; it does not modify shared or customer CAD geometry.
 */
export const FRONT_ARM_JOINT_VERSION = '20260911-fitted-joint-25';

function roundedSection(width, depth, radius, segments = 6) {
  const hx = width / 2, hz = depth / 2;
  const r = Math.min(radius, width * .2, depth * .2);
  const result = [];
  for (const [cx, cz, start] of [
    [hx - r, hz - r, 0], [-hx + r, hz - r, Math.PI / 2],
    [-hx + r, -hz + r, Math.PI], [hx - r, -hz + r, Math.PI * 1.5],
  ]) {
    for (let i = 0; i <= segments; i++) {
      const angle = start + i / segments * Math.PI / 2;
      result.push([cx + r * Math.cos(angle), cz + r * Math.sin(angle)]);
    }
  }
  return result;
}

/**
 * The two centre lines lie in the same YZ plane, as do this chair's side frames.
 * The common cut is derived from their actual angle AND unequal section depths.
 * A 1.2 mm eased transition removes the sharp upper corner without covering it
 * with a third mesh. The entire transition is split by the same mating plane.
 */
export function createFrontArmJoint(THREE, {
  x, frontZ, floorY, postTopY, armStart, armEnd,
  width = .054, postDepth = .058, armDepth = .072,
  postRadius = .008, armRadius = .011, rearEmbed = .014,
  ease = .0012, segments = 6,
} = {}) {
  const dimensions = [x, frontZ, floorY, postTopY, width, postDepth, armDepth, postRadius, armRadius, rearEmbed, ease];
  if (!dimensions.every(Number.isFinite) || Math.min(width, postDepth, armDepth, ease) <= 0
      || Math.min(postRadius, armRadius, rearEmbed) < 0 || ease > Math.min(postDepth, armDepth) * .1) {
    throw new TypeError('Front joint requires finite positions and positive section/easing dimensions.');
  }
  if (!Array.isArray(armStart) || !Array.isArray(armEnd) || armStart.length !== 3 || armEnd.length !== 3
      || ![...armStart, ...armEnd].every(Number.isFinite)) throw new TypeError('Arm endpoints must be finite XYZ triples.');
  if (!Number.isInteger(segments) || segments < 2 || segments > 32) throw new RangeError('Invalid section segment count.');
  const start = new THREE.Vector3(...armStart), end = new THREE.Vector3(...armEnd);
  const direction = end.clone().sub(start).normalize();
  if (Math.abs(start.x - x) > 1e-9 || Math.abs(end.x - x) > 1e-9 || direction.z > -.1 || direction.y < 0) {
    throw new RangeError('The front joint expects a rearward-rising arm in the post YZ plane.');
  }
  const up = new THREE.Vector3(0, 1, 0);
  const acrossArm = new THREE.Vector3(0, -direction.z, direction.y);
  const intersection = start.clone().addScaledVector(direction, (frontZ - start.z) / direction.z);
  const depthRatio = armDepth / postDepth;
  const slope = (depthRatio - direction.y) / -direction.z;
  const planeNormal = new THREE.Vector3(0, 1, -slope).normalize();
  const legSetback = ease / planeNormal.dot(up);
  const armSetback = ease / planeNormal.dot(direction);
  const length = end.clone().sub(intersection).dot(direction) + rearEmbed;
  if (intersection.y - floorY < .1 || length < .15) throw new RangeError('Members are too short for the fitted joint.');

  const post = roundedSection(width, postDepth, postRadius, segments);
  const arm = roundedSection(width, armDepth, armRadius, segments);
  const count = post.length;
  // Every entry is computed ONCE and later copied to both geometries. Matching
  // Float32 positions and normals at the interface prevent subpixel cracks.
  const mitre = post.map(([px, pz]) => new THREE.Vector3(x + px, intersection.y + slope * pz, frontZ + pz));
  const legEnd = mitre.map(p => p.clone().addScaledVector(up, -legSetback));
  const armBegin = mitre.map(p => p.clone().addScaledVector(direction, armSetback));
  const rings = [];
  const add = values => rings.push(values);
  add(post.map(([px, pz]) => new THREE.Vector3(x + px, floorY, frontZ + pz)));
  for (const below of [.06, .008, 0]) add(legEnd.map(p => p.clone().addScaledVector(up, -below)));
  let jointRing = -1;
  for (let step = 1; step <= 8; step++) {
    const t = step / 8;
    add(mitre.map((m, i) => legEnd[i].clone().multiplyScalar((1 - t) ** 2)
      .addScaledVector(m, 2 * t * (1 - t)).addScaledVector(armBegin[i], t * t)));
    if (step === 4) jointRing = rings.length - 1;
  }
  // Recover the existing arm section away from the cut. The two sections have
  // different edge radii; a short, smooth transition matches them exactly rather
  // than leaving gaps along their fillets. The rear endpoint/section are retained.
  const recoveryLength = .075;
  for (let step = 1; step <= 8; step++) {
    const t = step / 8, blend = t * t * (3 - 2 * t);
    add(armBegin.map((p, i) => {
      const axialStart = p.clone().sub(intersection).dot(direction);
      const axial = axialStart + t * (recoveryLength - axialStart);
      const px = post[i][0] + blend * (arm[i][0] - post[i][0]);
      const pz = post[i][1] * depthRatio + blend * (arm[i][1] - post[i][1] * depthRatio);
      return intersection.clone().addScaledVector(direction, axial).addScaledVector(acrossArm, pz).add(new THREE.Vector3(px, 0, 0));
    }));
  }
  add(arm.map(([px, pz]) => intersection.clone().addScaledVector(direction, length)
    .addScaledVector(acrossArm, pz).add(new THREE.Vector3(px, 0, 0))));

  const perimeter = section => {
    const values = [0];
    for (let i = 1; i <= count; i++) {
      const a = section[i - 1], b = section[i % count];
      values.push(values.at(-1) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    return values;
  };
  const postPerimeter = perimeter(post), armPerimeter = perimeter(arm);
  // Indexed temporary shell is only used to generate continuous shading normals.
  // It is never added to the scene or registered as a second rendered surface.
  const shell = new THREE.BufferGeometry();
  const positions = [], indices = [];
  const stride = count + 1;
  for (const ring of rings) for (let i = 0; i <= count; i++) positions.push(...ring[i % count].toArray());
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < count; i++) {
    const a = j * stride + i, b = a + stride;
    indices.push(a, b, b + 1, a, b + 1, a + 1);
  }
  shell.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  const normals = shell.getAttribute('normal');
  // Close the normal seam of the perimeter unwrap, without welding its UV seam.
  for (let j = 0; j < rings.length; j++) {
    const first = j * stride, last = first + count;
    const n = new THREE.Vector3().fromBufferAttribute(normals, first)
      .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, n.x, n.y, n.z); normals.setXYZ(last, n.x, n.y, n.z);
  }
  const packed = shell.getAttribute('position');
  const postOriginY = (floorY + postTopY) / 2;
  const oldArmCentre = start.clone().add(end.clone().addScaledVector(direction, rearEmbed)).multiplyScalar(.5);
  const geometries = [];
  for (const [role, first, last] of [['post', 0, jointRing], ['arm', jointRing, rings.length - 1]]) {
    const values = [], ns = [], uvs = [];
    const emit = (id, contourIndex) => {
      const p = new THREE.Vector3().fromBufferAttribute(packed, id);
      values.push(p.x, p.y, p.z);
      ns.push(normals.getX(id), normals.getY(id), normals.getZ(id));
      const u = role === 'post' ? p.y - postOriginY : p.clone().sub(oldArmCentre).dot(direction);
      uvs.push(u, (role === 'post' ? postPerimeter : armPerimeter)[contourIndex]);
    };
    for (let j = first; j < last; j++) for (let i = 0; i < count; i++) {
      const a = j * stride + i, b = a + stride;
      emit(a, i); emit(b, i); emit(b + 1, i + 1);
      emit(a, i); emit(b + 1, i + 1); emit(a + 1, i + 1);
    }
    // Only the foot and the rear arm end are capped. No coincident, opposing
    // polygons are left inside the front connection, including its outer edge.
    const ringIndex = role === 'post' ? 0 : rings.length - 1;
    const ring = rings[ringIndex];
    const center = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).divideScalar(count);
    const normal = role === 'post' ? up.clone().negate() : direction;
    const capEmit = p => {
      values.push(...p.toArray()); ns.push(...normal.toArray());
      uvs.push(p.x - x, role === 'post' ? p.z - frontZ : p.clone().sub(center).dot(acrossArm));
    };
    for (let i = 0; i < count; i++) {
      capEmit(center);
      if (role === 'post') { capEmit(ring[i]); capEmit(ring[(i + 1) % count]); }
      else { capEmit(ring[(i + 1) % count]); capEmit(ring[i]); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(values, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(ns, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.userData.surfaceUV = { units: 'metres', grainAxis: role === 'post' ? 'y' : 'z', mapping: 'perimeter', preserve: true };
    geometry.userData.frontArmJoint = {
      version: FRONT_ARM_JOINT_VERSION, role, planePoint: intersection.toArray(), planeNormal: planeNormal.toArray(),
      matingFacesRendered: false, boundary: rings[jointRing].map(p => p.toArray()), easeMetres: ease,
    };
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    geometries.push(geometry);
  }
  shell.dispose();
  return { postGeometry: geometries[0], armGeometry: geometries[1], version: FRONT_ARM_JOINT_VERSION };
}
