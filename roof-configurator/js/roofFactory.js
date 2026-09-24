import * as THREE from 'three';

console.info('[RoofLab] roofFactory build 14 loaded');

const WALL_COLOR = 0xe9e6df;
const EDGE_COLOR = 0x261a1c;
const ROOF_OFFSET_Y = 0.05;
const SURFACE_TEXTURE_CACHE = new Map();

const fract = (value) => value - Math.floor(value);
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (edge0, edge1, value) => {
  const t = clamp01((value - edge0) / Math.max(edge1 - edge0, 1e-6));
  return t * t * (3 - 2 * t);
};

function hashNoise(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
}

function surfaceTextures(covering) {
  if (SURFACE_TEXTURE_CACHE.has(covering)) return SURFACE_TEXTURE_CACHE.get(covering);
  const specification = covering === 'teclado'
    ? { moduleWidth: 0.36, course: 0.25 }
    : { moduleWidth: 0.72, course: 0.42 };

  if (covering !== 'generic') {
    const loader = new THREE.TextureLoader();
    const asset = (name) => new URL(`../assets/roof-materials/${name}`, import.meta.url).href;
    const normal = loader.load(asset('granule_normal_512.png'));
    const roughness = loader.load(asset('granule_roughness_512.png'));
    const colorSize = 128;
    const colorData = new Uint8Array(colorSize * colorSize * 4);
    for (let y = 0; y < colorSize; y += 1) {
      for (let x = 0; x < colorSize; x += 1) {
        const fine = hashNoise(x, y) - 0.5;
        const cluster = hashNoise(Math.floor(x / 3) + 17, Math.floor(y / 3) + 29) - 0.5;
        let shade = (covering === 'roca' ? 0.92 : 0.95) + fine * 0.14 + cluster * 0.055;
        if (covering === 'teclado') {
          // Two-course repeat: narrow surface-darkened joints describe the
          // staggered rectangular bond without cutting open slots in the mesh.
          const courseCoordinate = (y / colorSize) * 2;
          const courseIndex = Math.floor(courseCoordinate);
          const coursePhase = fract(courseCoordinate);
          const modulePhase = fract((x / colorSize) * 2 + (courseIndex % 2) * 0.5);
          const moduleEdge = Math.min(modulePhase, 1 - modulePhase);
          const courseEdge = Math.min(coursePhase, 1 - coursePhase);
          const horizontalJoint = 1 - smoothstep(0.012, 0.04, courseEdge);
          const verticalJoint = (1 - smoothstep(0.012, 0.045, moduleEdge))
            * smoothstep(0.09, 0.18, coursePhase)
            * (1 - smoothstep(0.88, 0.96, coursePhase));
          shade *= 1 - Math.max(horizontalJoint * 0.24, verticalJoint * 0.2);
        }
        shade = clamp01(shade);
        const byte = Math.round(shade * 255);
        const index = (y * colorSize + x) * 4;
        colorData[index] = byte;
        colorData[index + 1] = byte;
        colorData[index + 2] = byte;
        colorData[index + 3] = 255;
      }
    }
    const color = new THREE.DataTexture(colorData, colorSize, colorSize, THREE.RGBAFormat);
    color.colorSpace = THREE.SRGBColorSpace;
    [normal, roughness].forEach((texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(1.7, 1.7);
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.anisotropy = 4;
    });
    color.wrapS = THREE.RepeatWrapping;
    color.wrapT = THREE.RepeatWrapping;
    color.repeat.set(
      covering === 'teclado' ? 1 / (specification.moduleWidth * 2) : 1.7,
      covering === 'teclado' ? 1 / (specification.course * 2) : 1.7,
    );
    color.minFilter = THREE.LinearMipmapLinearFilter;
    color.magFilter = THREE.LinearFilter;
    color.generateMipmaps = true;
    color.anisotropy = 4;
    color.needsUpdate = true;
    const textures = { color, normal, roughness, specification };
    SURFACE_TEXTURE_CACHE.set(covering, textures);
    return textures;
  }

  // Generic coated steel only needs very small-scale coating variation. The
  // stamped tile shape itself is geometry, never a normal-map illusion.
  const size = 128;
  const bumpData = new Uint8Array(size * size);
  const colorData = new Uint8Array(size * size * 4);
  const roughnessData = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const noise = hashNoise(x, y) - 0.5;
      const broadNoise = hashNoise(Math.floor(x / 4) + 19, Math.floor(y / 4) + 31) - 0.5;
      const height = 0.5 + noise * 0.025 + broadNoise * 0.018;
      const shade = 0.985 + broadNoise * 0.018;
      const roughness = 0.53 + noise * 0.035;
      bumpData[index] = Math.round(clamp01(height) * 255);
      const shadeByte = Math.round(clamp01(shade) * 255);
      colorData[index * 4] = shadeByte;
      colorData[index * 4 + 1] = shadeByte;
      colorData[index * 4 + 2] = shadeByte;
      colorData[index * 4 + 3] = 255;
      roughnessData[index] = Math.round(clamp01(roughness) * 255);
    }
  }
  const normalData = new Uint8Array(size * size * 4);
  const normalStrength = 0.75;
  const sampleHeight = (x, y) => bumpData[((y + size) % size) * size + ((x + size) % size)] / 255;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (sampleHeight(x + 1, y) - sampleHeight(x - 1, y)) * normalStrength;
      const dy = (sampleHeight(x, y + 1) - sampleHeight(x, y - 1)) * normalStrength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * size + x) * 4;
      normalData[index] = Math.round((-dx / length * 0.5 + 0.5) * 255);
      normalData[index + 1] = Math.round((-dy / length * 0.5 + 0.5) * 255);
      normalData[index + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
      normalData[index + 3] = 255;
    }
  }
  const normal = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  const color = new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat);
  color.colorSpace = THREE.SRGBColorSpace;
  const roughness = new THREE.DataTexture(roughnessData, size, size, THREE.RedFormat);
  [color, normal, roughness].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.repeat.set(7, 7);
    texture.needsUpdate = true;
  });
  const textures = { color, normal, roughness, specification };
  SURFACE_TEXTURE_CACHE.set(covering, textures);
  return textures;
}

function roofProfileHeight(covering, u, v) {
  if (covering === 'teclado') {
    // A slate roof reads as many thin, flat, double-lapped stone rectangles.
    // Keep the visible module close to common UK slate proportions and avoid
    // the deep negative channels that made the previous profile look vented.
    const moduleWidth = 0.36;
    const course = 0.25;
    const rowIndex = Math.floor(v / course);
    const coursePhase = fract(v / course);
    const modulePhase = fract(u / moduleWidth + (Math.abs(rowIndex) % 2) * 0.5);
    const sideDistance = Math.min(modulePhase, 1 - modulePhase);
    const leadingEdge = Math.pow(1 - smoothstep(0, 0.16, coursePhase), 2) * 0.018;
    const stoneBed = 0.006 + (1 - coursePhase) * 0.004;
    const joint = Math.pow(1 - smoothstep(0, 0.035, sideDistance), 2)
      * smoothstep(0.12, 0.28, coursePhase)
      * (1 - smoothstep(0.88, 0.98, coursePhase)) * 0.006;
    const naturalCrown = Math.sin(Math.PI * modulePhase) * 0.0015;
    return stoneBed + leadingEdge + naturalCrown - joint;
  }

  const moduleWidth = 0.72;
  const course = 0.42;
  const modulePhase = fract(u / moduleWidth);
  const coursePhase = fract(v / course);
  const crown = Math.pow(Math.sin(Math.PI * modulePhase), 1.42);
  const panShoulder = Math.pow(Math.sin(Math.PI * modulePhase), 5.5) * 0.012;
  const courseLip = Math.pow(1 - smoothstep(0, 0.2, coursePhase), 2);
  const macroHeight = covering === 'roca' ? 0.074 : 0.086;
  const lipHeight = covering === 'roca' ? 0.046 : 0.042;
  return crown * macroHeight + panShoulder
    + courseLip * (lipHeight + crown * 0.018)
    + (1 - coursePhase) * 0.008;
}

function polygonAreaUv(polygon) {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

function clipUvPolygon(subject, clip) {
  let result = subject;
  for (let edgeIndex = 0; edgeIndex < clip.length; edgeIndex += 1) {
    const edgeStart = clip[edgeIndex];
    const edgeEnd = clip[(edgeIndex + 1) % clip.length];
    const edgeX = edgeEnd.x - edgeStart.x;
    const edgeY = edgeEnd.y - edgeStart.y;
    const side = (point) => edgeX * (point.y - edgeStart.y) - edgeY * (point.x - edgeStart.x);
    const input = result;
    result = [];
    if (!input.length) break;
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const next = input[(index + 1) % input.length];
      const currentSide = side(current);
      const nextSide = side(next);
      const currentInside = currentSide >= -1e-7;
      const nextInside = nextSide >= -1e-7;
      if (currentInside) result.push(current);
      if (currentInside !== nextInside) {
        const denominator = currentSide - nextSide;
        const t = Math.abs(denominator) < 1e-9 ? 0.5 : currentSide / denominator;
        result.push(new THREE.Vector2(
          THREE.MathUtils.lerp(current.x, next.x, t),
          THREE.MathUtils.lerp(current.y, next.y, t),
        ));
      }
    }
  }
  return result;
}

function faceNormal(points) {
  const normal = new THREE.Vector3();
  for (let index = 1; index < points.length - 1; index += 1) {
    normal.subVectors(points[index], points[0])
      .cross(new THREE.Vector3().subVectors(points[index + 1], points[0]));
    if (normal.lengthSq() > 1e-12) break;
  }
  normal.normalize();
  if (normal.y < 0) normal.negate();
  return normal;
}

function orientRoofTrianglesUpward(geometry, preserveAuthoredNormals = false) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!position || !index) return geometry;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();

  // Roof covering triangles must be counter-clockwise when seen from above.
  // Several procedural parameterizations reverse their local V direction, so
  // their old indices produced downward geometric normals even though a
  // separate, manually-authored normal attribute pointed upward.
  for (let offset = 0; offset < index.count; offset += 3) {
    const ia = index.getX(offset);
    const ib = index.getX(offset + 1);
    const ic = index.getX(offset + 2);
    a.fromBufferAttribute(position, ia);
    b.fromBufferAttribute(position, ib);
    c.fromBufferAttribute(position, ic);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (ab.cross(ac).y < -1e-8) {
      index.setX(offset + 1, ic);
      index.setX(offset + 2, ib);
    }
  }

  index.needsUpdate = true;
  if (preserveAuthoredNormals && geometry.getAttribute('normal')) {
    // roofFaceGeometry supplies analytic normals from the continuous height
    // field. Its clipped grid intentionally duplicates boundary vertices, so
    // computeVertexNormals() here would average only inside each individual
    // cell and expose the tessellation as blocky bands across curved tiles.
    // Repair triangle winding without discarding those continuous normals.
    geometry.normalizeNormals();
    geometry.getAttribute('normal').needsUpdate = true;
  } else {
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
  }
  return geometry;
}

function distanceToPolygonEdges(point, polygon) {
  let minimum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared > 1e-12
      ? clamp01(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
      : 0;
    minimum = Math.min(minimum, Math.hypot(
      point.x - (start.x + dx * t),
      point.y - (start.y + dy * t),
    ));
  }
  return minimum;
}

function roofFaceGeometry(points, covering, preferredCourseDirection = null, options = {}) {
  const normal = faceNormal(points);
  let edgeIndex = 0;
  let edgeScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const verticalDelta = Math.abs(points[next].y - points[index].y);
    const score = (points[index].y + points[next].y) * 0.5 + verticalDelta * 100;
    if (score < edgeScore) { edgeScore = score; edgeIndex = index; }
  }
  const localOrigin = points[edgeIndex].clone();
  const next = points[(edgeIndex + 1) % points.length];
  const courseDirection = preferredCourseDirection
    ? preferredCourseDirection.clone().normalize()
    : new THREE.Vector3().subVectors(next, localOrigin).normalize();
  const slopeDirection = normal.clone().cross(courseDirection).normalize();
  if (slopeDirection.y < 0) slopeDirection.negate();
  const origin = options.profileOrigin?.clone() ?? localOrigin;
  const clipPolygon = points.map((point) => {
    const relative = new THREE.Vector3().subVectors(point, origin);
    return new THREE.Vector2(relative.dot(courseDirection), relative.dot(slopeDirection));
  });
  if (polygonAreaUv(clipPolygon) < 0) clipPolygon.reverse();

  const specification = covering === 'teclado'
    ? { moduleWidth: 0.36, course: 0.25, uSteps: 8, vSteps: 7 }
    : { moduleWidth: 0.72, course: 0.42, uSteps: 7, vSteps: 5 };
  const stepU = specification.moduleWidth / specification.uSteps;
  const stepV = specification.course / specification.vSteps;
  const minU = Math.min(...clipPolygon.map((point) => point.x));
  const maxU = Math.max(...clipPolygon.map((point) => point.x));
  const minV = Math.min(...clipPolygon.map((point) => point.y));
  const maxV = Math.max(...clipPolygon.map((point) => point.y));
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const derivativeStep = 0.002;

  const surfaceHeight = (uv) => {
    const basePoint = origin.clone()
      .addScaledVector(courseDirection, uv.x)
      .addScaledVector(slopeDirection, uv.y);
    let reliefScale = 1;
    if (covering === 'teclado') {
      // The shallow slate profile already meets cleanly and should retain its
      // crisp rectangular perimeter.
      reliefScale = 1;
    } else if (options.reliefScaleAtPoint) {
      reliefScale = clamp01(options.reliefScaleAtPoint(basePoint));
    } else if (options.fadeAtBoundary !== false) {
      reliefScale = smoothstep(0, 0.14, distanceToPolygonEdges(uv, clipPolygon));
    }
    return roofProfileHeight(covering, uv.x, uv.y) * reliefScale;
  };

  const addVertex = (uv) => {
    const height = surfaceHeight(uv);
    const point = origin.clone()
      .addScaledVector(courseDirection, uv.x)
      .addScaledVector(slopeDirection, uv.y)
      .addScaledVector(normal, height);
    const du = (surfaceHeight(new THREE.Vector2(uv.x + derivativeStep, uv.y))
      - surfaceHeight(new THREE.Vector2(uv.x - derivativeStep, uv.y))) / (derivativeStep * 2);
    const dv = (surfaceHeight(new THREE.Vector2(uv.x, uv.y + derivativeStep))
      - surfaceHeight(new THREE.Vector2(uv.x, uv.y - derivativeStep))) / (derivativeStep * 2);
    const tangentU = courseDirection.clone().addScaledVector(normal, du);
    const tangentV = slopeDirection.clone().addScaledVector(normal, dv);
    const surfaceNormal = tangentU.cross(tangentV).normalize();
    if (surfaceNormal.y < 0) surfaceNormal.negate();
    positions.push(point.x, point.y, point.z);
    normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
    uvs.push(uv.x, uv.y);
  };

  const startU = Math.floor(minU / stepU) * stepU;
  const startV = Math.floor(minV / stepV) * stepV;
  for (let u = startU; u < maxU - 1e-7; u += stepU) {
    for (let v = startV; v < maxV - 1e-7; v += stepV) {
      const cell = [
        new THREE.Vector2(u, v),
        new THREE.Vector2(u + stepU, v),
        new THREE.Vector2(u + stepU, v + stepV),
        new THREE.Vector2(u, v + stepV),
      ];
      const clipped = clipUvPolygon(cell, clipPolygon);
      if (clipped.length < 3 || Math.abs(polygonAreaUv(clipped)) < 1e-9) continue;
      const baseIndex = positions.length / 3;
      clipped.forEach(addVertex);
      for (let index = 1; index < clipped.length - 1; index += 1) {
        indices.push(baseIndex, baseIndex + index, baseIndex + index + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  orientRoofTrianglesUpward(geometry, true);
  geometry.computeBoundingSphere();
  return geometry;
}

function addPlanarRoofUvs(geometry, scale = 2.5) {
  const position = geometry.getAttribute('position');
  const uvs = [];
  for (let index = 0; index < position.count; index += 1) {
    uvs.push(position.getX(index) * scale, position.getZ(index) * scale);
  }
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
}

function materialSet(state) {
  const textures = surfaceTextures(state.covering);
  const selectedColor = new THREE.Color(state.roofColor);
  const roofColor = selectedColor.clone();
  if (state.covering === 'generic') roofColor.offsetHSL(0, -0.005, 0.025);
  else if (state.covering === 'roca') {
    roofColor.lerp(new THREE.Color(0x596064), 0.1);
    roofColor.offsetHSL(0, -0.045, 0.01);
  } else {
    // Slate is a diffuse mineral surface. Preserve the selected colour's
    // luminance: lifting it here made burgundy slate turn pale pink whenever
    // a face pointed toward the studio key light.
    roofColor.lerp(new THREE.Color(0x596064), 0.06);
    roofColor.offsetHSL(0, -0.035, 0);
  }

  // These are three different finish systems, not one shader with different
  // labels. Generic is coated formed steel; Roca is stone-coated metal with a
  // granular, diffuse surface; Teclado is a flatter slate-profile mineral
  // finish. Do not feed the generated generic roughness texture into
  // MeshPhysicalMaterial: its single-channel data is sampled from the green
  // channel by Three.js and was collapsing roughness into mirror-like bands.
  const finish = state.covering === 'generic'
    ? {
        // This is painted/coated steel, not exposed chrome. Retain a visible
        // metallic response while allowing the coating to receive direct sun
        // diffusely, so roof planes do not turn black unless they happen to
        // reflect the environment toward the camera.
        roughness: 0.64, metalness: 0.28, clearcoat: 0.025,
        clearcoatRoughness: 0.76, envMapIntensity: 0.32,
        emissiveIntensity: 0.008, roughnessMap: null, normalScale: 0.08,
      }
    : state.covering === 'roca'
      ? {
          roughness: 0.98, metalness: 0.04, clearcoat: 0,
          clearcoatRoughness: 1, envMapIntensity: 0.04,
          emissiveIntensity: 0.003, roughnessMap: textures.roughness, normalScale: 0.62,
        }
      : {
          roughness: 0.98, metalness: 0.01, clearcoat: 0,
          clearcoatRoughness: 1, envMapIntensity: 0.025,
          emissiveIntensity: 0, roughnessMap: textures.roughness, normalScale: 0.36,
        };
  const roof = new THREE.MeshPhysicalMaterial({
    color: roofColor,
    emissive: roofColor,
    emissiveIntensity: finish.emissiveIntensity,
    map: textures.color,
    normalMap: textures.normal,
    roughnessMap: finish.roughnessMap,
    roughness: finish.roughness,
    metalness: finish.metalness,
    clearcoat: finish.clearcoat,
    clearcoatRoughness: finish.clearcoatRoughness,
    envMapIntensity: finish.envMapIntensity,
    // The procedural relief contains thin edge transitions whose winding is
    // intentionally mixed at clipped valleys and hips. Keep those transition
    // surfaces visible; the primary roof grids are still normalized outward.
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  roof.normalScale.setScalar(finish.normalScale);

  const wall = new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.92, side: THREE.DoubleSide });
  const slab = new THREE.MeshStandardMaterial({ color: 0xb8bdc1, roughness: 0.95 });
  // Flashings, ridges, valleys and the protective underlay belong to the
  // selected roof finish. Keeping these on a fixed burgundy material made red
  // seams show through graphite, green and brown coverings.
  const trimDarkening = state.covering === 'generic' ? 0.46 : 0.58;
  const trimColor = selectedColor.clone().lerp(new THREE.Color(0x121820), trimDarkening);
  const edgeColor = selectedColor.clone().lerp(new THREE.Color(0x10161d), 0.58);
  const trimFinish = state.covering === 'generic'
    ? { roughness: 0.7, metalness: 0.26, envMapIntensity: 0.1 }
    : state.covering === 'roca'
      ? { roughness: 0.9, metalness: 0.05, envMapIntensity: 0.03 }
      : { roughness: 0.96, metalness: 0.02, envMapIntensity: 0.015 };
  const trim = new THREE.MeshStandardMaterial({ color: trimColor, ...trimFinish });
  // Procedural relief moves adjacent roof faces along different normals. A
  // dark, non-reflective membrane immediately below the nominal roof planes
  // prevents sub-pixel background leaks at hips, ridges and valleys without
  // competing with the visible covering or its metal response.
  const underlay = new THREE.MeshStandardMaterial({
    color: roofColor,
    roughness: 0.96,
    metalness: 0.02,
    envMapIntensity: 0.01,
    side: THREE.DoubleSide,
  });
  const edge = new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: state.technicalEdges ? 0.95 : 0 });
  const seam = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
  return { roof, wall, slab, trim, underlay, edge, seam, covering: state.covering };
}

function makeFace(points, materials, name = 'roof-face') {
  const geometry = roofFaceGeometry(points, materials.covering);

  const mesh = new THREE.Mesh(geometry, materials.roof);
  mesh.name = name;
  mesh.castShadow = true;
  // Detailed relief is already shaded by its authored normals. Receiving the
  // directional shadow map on the same sub-centimetre surface produces broad
  // moire bands on long single-slope planes as shadow texels drift across the
  // repeated courses. Keep casting onto walls/ground, but avoid self-shadowing.
  mesh.receiveShadow = false;

  if (materials.edge.opacity > 0) {
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 42), materials.edge);
    edges.renderOrder = 3;
    mesh.add(edges);
  }
  return mesh;
}

function makePlanarRoofBacking(points, material, name = 'roof-underlay') {
  const normal = faceNormal(points);
  const backingPoints = points.map((point) => point.clone().addScaledVector(normal, -0.012));
  const positions = backingPoints.flatMap((point) => [point.x, point.y, point.z]);
  const indices = [];
  for (let index = 1; index < backingPoints.length - 1; index += 1) {
    indices.push(0, index, index + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  orientRoofTrianglesUpward(geometry);

  const backing = new THREE.Mesh(geometry, material);
  backing.name = name;
  backing.castShadow = false;
  backing.receiveShadow = true;
  return backing;
}

function makeWallFace(points, material) {
  const geometry = new THREE.BufferGeometry();
  const positions = points.flatMap((point) => [point.x, point.y, point.z]);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(points.length === 3 ? [0, 1, 2] : [0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function beamBetween(start, end, thickness, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.BoxGeometry(length, thickness, thickness);
  const beam = new THREE.Mesh(geometry, material);
  beam.position.copy(start).add(end).multiplyScalar(0.5);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize());
  beam.castShadow = true;
  beam.receiveShadow = true;
  return beam;
}

function addFaceSeams(group, rows, materials) {
  for (const row of rows) {
    const geometry = new THREE.BufferGeometry().setFromPoints(row);
    group.add(new THREE.Line(geometry, materials.seam));
  }
}

function addQuadSeams(group, a, b, c, d, materials, alongCount = 8, acrossCount = 5) {
  const lerp = (p, q, t) => new THREE.Vector3().lerpVectors(p, q, t);
  const rows = [];

  for (let i = 1; i < alongCount; i += 1) {
    const t = i / alongCount;
    rows.push([lerp(a, b, t), lerp(d, c, t)]);
  }
  for (let i = 1; i < acrossCount; i += 1) {
    const t = i / acrossCount;
    rows.push([lerp(a, d, t), lerp(b, c, t)]);
  }
  addFaceSeams(group, rows, materials);
}

function addRoofFace(group, points, materials, name) {
  group.add(makePlanarRoofBacking(points, materials.underlay, `${name}-underlay`));
  const mesh = makeFace(points, materials, name);
  group.add(mesh);
  if (points.length === 4) addQuadSeams(group, points[0], points[1], points[2], points[3], materials);
  return mesh;
}

function addPerimeterTrim(group, segments, materials, thickness = 0.095) {
  segments.forEach(([start, end]) => group.add(beamBetween(start, end, thickness, materials.trim)));
}

function addBase(group, state, materials, length = state.length, depth = state.depth, x = 0, z = 0) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(length + 0.28, 0.2, depth + 0.28), materials.slab);
  slab.position.set(x, -0.1, z);
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  const walls = new THREE.Mesh(new THREE.BoxGeometry(length, state.wallHeight, depth), materials.wall);
  walls.position.set(x, state.wallHeight / 2, z);
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);
}

function buildGableRoof(group, options, materials) {
  const {
    length, depth, wallHeight, pitch, overhang, centerX = 0, centerZ = 0,
    rotateY = 0, addGables = true, namePrefix = 'gable',
  } = options;

  const local = new THREE.Group();
  local.position.set(centerX, 0, centerZ);
  local.rotation.y = rotateY;
  group.add(local);

  const wallHalfDepth = depth / 2;
  const x = length / 2 + overhang;
  const z = wallHalfDepth + overhang;
  const slope = Math.tan(THREE.MathUtils.degToRad(pitch));

  // Keep the roof anchored to the wall plate. Increasing the overhang should
  // extend the same roof plane outward and downward, not raise the ridge.
  const ridgeY = wallHeight + ROOF_OFFSET_Y + slope * wallHalfDepth;
  const eaveY = ridgeY - slope * z;
  const a = new THREE.Vector3(-x, eaveY, -z);
  const b = new THREE.Vector3(x, eaveY, -z);
  const c = new THREE.Vector3(x, ridgeY, 0);
  const d = new THREE.Vector3(-x, ridgeY, 0);
  const e = new THREE.Vector3(-x, ridgeY, 0);
  const f = new THREE.Vector3(x, ridgeY, 0);
  const g = new THREE.Vector3(x, eaveY, z);
  const h = new THREE.Vector3(-x, eaveY, z);

  addRoofFace(local, [a, b, c, d], materials, `${namePrefix}-front`);
  addRoofFace(local, [e, f, g, h], materials, `${namePrefix}-back`);
  addPerimeterTrim(local, [[a, b], [g, h], [d, c], [a, d], [b, c], [h, e], [g, f]], materials);

  if (addGables) {
    const wallX = length / 2;
    const wallZ = depth / 2;
    const wallRidgeY = wallHeight + ROOF_OFFSET_Y + Math.tan(THREE.MathUtils.degToRad(pitch)) * wallZ;
    local.add(makeWallFace([
      new THREE.Vector3(-wallX, wallHeight, -wallZ),
      new THREE.Vector3(-wallX, wallHeight, wallZ),
      new THREE.Vector3(-wallX, wallRidgeY, 0),
    ], materials.wall));
    local.add(makeWallFace([
      new THREE.Vector3(wallX, wallHeight, wallZ),
      new THREE.Vector3(wallX, wallHeight, -wallZ),
      new THREE.Vector3(wallX, wallRidgeY, 0),
    ], materials.wall));
  }

  return {
    ridgeElevation: ridgeY,
    roofArea: (length + 2 * overhang) * (depth + 2 * overhang) / Math.cos(THREE.MathUtils.degToRad(pitch)),
  };
}

function buildHipRoof(group, state, materials) {
  const local = new THREE.Group();
  group.add(local);

  let length = state.length;
  let depth = state.depth;
  if (depth > length) {
    [length, depth] = [depth, length];
    local.rotation.y = Math.PI / 2;
  }

  const x = length / 2 + state.overhang;
  const z = depth / 2 + state.overhang;
  const ridgeHalf = Math.max(0, x - z);
  const ridgeY = state.wallHeight + Math.tan(THREE.MathUtils.degToRad(state.pitch)) * z;

  const lf = new THREE.Vector3(-x, state.wallHeight, -z);
  const rf = new THREE.Vector3(x, state.wallHeight, -z);
  const rb = new THREE.Vector3(x, state.wallHeight, z);
  const lb = new THREE.Vector3(-x, state.wallHeight, z);
  const rl = new THREE.Vector3(-ridgeHalf, ridgeY, 0);
  const rr = new THREE.Vector3(ridgeHalf, ridgeY, 0);

  addRoofFace(local, [lf, rf, rr, rl], materials, 'hip-front');
  addRoofFace(local, [lb, rl, rr, rb], materials, 'hip-back');
  addRoofFace(local, [lf, rl, lb], materials, 'hip-left');
  addRoofFace(local, [rf, rb, rr], materials, 'hip-right');
  addPerimeterTrim(local, [[lf, rf], [rf, rb], [rb, lb], [lb, lf], [rl, rr], [lf, rl], [lb, rl], [rf, rr], [rb, rr]], materials);

  return {
    ridgeElevation: ridgeY,
    roofArea: (state.length + 2 * state.overhang) * (state.depth + 2 * state.overhang) / Math.cos(THREE.MathUtils.degToRad(state.pitch)),
  };
}

function buildShedRoof(group, state, materials) {
  const x = state.length / 2 + state.overhang;
  const wallHalfDepth = state.depth / 2;
  const z = wallHalfDepth + state.overhang;
  const slope = Math.tan(THREE.MathUtils.degToRad(state.pitch));

  // Anchor the roof plane to the two wall tops. Overhang extends beyond those
  // points along the same slope instead of changing the building height.
  const lowWallY = state.wallHeight;
  const highWallY = state.wallHeight + slope * state.depth;
  const lowEaveY = lowWallY - slope * state.overhang;
  const highEaveY = highWallY + slope * state.overhang;

  const a = new THREE.Vector3(-x, lowEaveY, -z);
  const b = new THREE.Vector3(x, lowEaveY, -z);
  const c = new THREE.Vector3(x, highEaveY, z);
  const d = new THREE.Vector3(-x, highEaveY, z);
  addRoofFace(group, [a, b, c, d], materials, 'shed-face');
  addPerimeterTrim(group, [[a, b], [b, c], [c, d], [d, a]], materials);

  const wallHalfL = state.length / 2;
  const wallHalfD = state.depth / 2;
  const wallHigh = highWallY;
  group.add(makeWallFace([
    new THREE.Vector3(-wallHalfL, state.wallHeight, -wallHalfD),
    new THREE.Vector3(-wallHalfL, state.wallHeight, wallHalfD),
    new THREE.Vector3(-wallHalfL, wallHigh, wallHalfD),
  ], materials.wall));
  group.add(makeWallFace([
    new THREE.Vector3(wallHalfL, state.wallHeight, -wallHalfD),
    new THREE.Vector3(wallHalfL, wallHigh, wallHalfD),
    new THREE.Vector3(wallHalfL, state.wallHeight, wallHalfD),
  ], materials.wall));
  group.add(makeWallFace([
    new THREE.Vector3(-wallHalfL, state.wallHeight, wallHalfD),
    new THREE.Vector3(wallHalfL, state.wallHeight, wallHalfD),
    new THREE.Vector3(wallHalfL, wallHigh, wallHalfD),
    new THREE.Vector3(-wallHalfL, wallHigh, wallHalfD),
  ], materials.wall));

  return {
    ridgeElevation: highEaveY,
    roofArea: (state.length + 2 * state.overhang) * (state.depth + 2 * state.overhang) / Math.cos(THREE.MathUtils.degToRad(state.pitch)),
  };
}

function pointInsideRect(x, z, rect, epsilon = 1e-6) {
  return x >= rect.minX - epsilon && x <= rect.maxX + epsilon
    && z >= rect.minZ - epsilon && z <= rect.maxZ + epsilon;
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
}

function subdividedCoordinates(min, max, divisions, critical = []) {
  const values = [...critical, min, max];
  for (let i = 0; i <= divisions; i += 1) values.push(THREE.MathUtils.lerp(min, max, i / divisions));
  return uniqueSorted(values.filter((value) => value >= min - 1e-6 && value <= max + 1e-6));
}

function addHeightFieldMesh(group, xCoordinates, zCoordinates, isInside, heightAt, materials, name) {
  const positions = [];
  const indices = [];
  const vertexMap = new Map();

  const getVertex = (xi, zi) => {
    const key = `${xi}:${zi}`;
    if (vertexMap.has(key)) return vertexMap.get(key);
    const x = xCoordinates[xi];
    const z = zCoordinates[zi];
    const y = heightAt(x, z);
    if (!Number.isFinite(y)) return null;
    const index = positions.length / 3;
    positions.push(x, y, z);
    vertexMap.set(key, index);
    return index;
  };

  let roofArea = 0;
  const triangleArea = (ia, ib, ic) => {
    const a = new THREE.Vector3(positions[ia * 3], positions[ia * 3 + 1], positions[ia * 3 + 2]);
    const b = new THREE.Vector3(positions[ib * 3], positions[ib * 3 + 1], positions[ib * 3 + 2]);
    const c = new THREE.Vector3(positions[ic * 3], positions[ic * 3 + 1], positions[ic * 3 + 2]);
    return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() * 0.5;
  };

  for (let zi = 0; zi < zCoordinates.length - 1; zi += 1) {
    for (let xi = 0; xi < xCoordinates.length - 1; xi += 1) {
      const centerX = (xCoordinates[xi] + xCoordinates[xi + 1]) * 0.5;
      const centerZ = (zCoordinates[zi] + zCoordinates[zi + 1]) * 0.5;
      if (!isInside(centerX, centerZ)) continue;

      const i00 = getVertex(xi, zi);
      const i10 = getVertex(xi + 1, zi);
      const i11 = getVertex(xi + 1, zi + 1);
      const i01 = getVertex(xi, zi + 1);
      if ([i00, i10, i11, i01].some((index) => index === null)) continue;

      // Winding is counter-clockwise when viewed from above, so the roof
      // receives light with upward-facing normals.
      indices.push(i00, i11, i10, i00, i01, i11);
      roofArea += triangleArea(i00, i10, i11) + triangleArea(i00, i11, i01);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  orientRoofTrianglesUpward(geometry);
  addPlanarRoofUvs(geometry);

  const mesh = new THREE.Mesh(geometry, materials.roof);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  group.add(mesh);
  return roofArea;
}

function addExactValleyLines(group, xCoordinates, zCoordinates, planes) {
  const positions = [];
  const epsilon = 1e-7;

  const addUniquePoint = (points, point) => {
    if (!points.some((existing) => Math.hypot(existing.x - point.x, existing.z - point.z) < 1e-6)) {
      points.push(point);
    }
  };

  for (let zi = 0; zi < zCoordinates.length - 1; zi += 1) {
    for (let xi = 0; xi < xCoordinates.length - 1; xi += 1) {
      const x0 = xCoordinates[xi];
      const x1 = xCoordinates[xi + 1];
      const z0 = zCoordinates[zi];
      const z1 = zCoordinates[zi + 1];
      const centerX = (x0 + x1) * 0.5;
      const centerZ = (z0 + z1) * 0.5;
      const availablePlanes = planes.filter((plane) => plane.contains(centerX, centerZ));
      if (availablePlanes.length < 2) continue;

      for (let i = 0; i < availablePlanes.length; i += 1) {
        for (let j = i + 1; j < availablePlanes.length; j += 1) {
          const planeA = availablePlanes[i];
          const planeB = availablePlanes[j];
          const corners = [
            { x: x0, z: z0 },
            { x: x0, z: z1 },
            { x: x1, z: z1 },
            { x: x1, z: z0 },
          ];
          const values = corners.map((point) => planeA.height(point.x, point.z) - planeB.height(point.x, point.z));
          const crossings = [];

          for (let edgeIndex = 0; edgeIndex < corners.length; edgeIndex += 1) {
            const nextIndex = (edgeIndex + 1) % corners.length;
            const start = corners[edgeIndex];
            const end = corners[nextIndex];
            const startValue = values[edgeIndex];
            const endValue = values[nextIndex];

            if (Math.abs(startValue) <= epsilon) addUniquePoint(crossings, { ...start });
            if (startValue * endValue < -epsilon * epsilon) {
              const t = startValue / (startValue - endValue);
              addUniquePoint(crossings, {
                x: THREE.MathUtils.lerp(start.x, end.x, t),
                z: THREE.MathUtils.lerp(start.z, end.z, t),
              });
            }
          }

          if (crossings.length < 2) continue;
          let first = crossings[0];
          let second = crossings[1];
          let maximumDistance = -1;
          for (let a = 0; a < crossings.length; a += 1) {
            for (let b = a + 1; b < crossings.length; b += 1) {
              const distance = (crossings[a].x - crossings[b].x) ** 2 + (crossings[a].z - crossings[b].z) ** 2;
              if (distance > maximumDistance) {
                maximumDistance = distance;
                first = crossings[a];
                second = crossings[b];
              }
            }
          }

          if (maximumDistance <= 1e-10) continue;
          const firstY = planeA.height(first.x, first.z) + 0.018;
          const secondY = planeA.height(second.x, second.z) + 0.018;
          positions.push(first.x, firstY, first.z, second.x, secondY, second.z);
        }
      }
    }
  }

  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.68 });
  const valleys = new THREE.LineSegments(geometry, material);
  valleys.renderOrder = 4;
  group.add(valleys);
}

function addHeightFieldSeams(group, bounds, isInside, heightAt, materials) {
  const lines = [];
  const addSampledLine = (from, to, samples = 80) => {
    let active = [];
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const x = THREE.MathUtils.lerp(from.x, to.x, t);
      const z = THREE.MathUtils.lerp(from.z, to.z, t);
      if (isInside(x, z)) {
        active.push(new THREE.Vector3(x, heightAt(x, z) + 0.012, z));
      } else if (active.length > 1) {
        lines.push(active);
        active = [];
      } else {
        active = [];
      }
    }
    if (active.length > 1) lines.push(active);
  };

  for (let i = 1; i < 9; i += 1) {
    const x = THREE.MathUtils.lerp(bounds.minX, bounds.maxX, i / 9);
    addSampledLine(new THREE.Vector3(x, 0, bounds.minZ), new THREE.Vector3(x, 0, bounds.maxZ));
  }
  for (let i = 1; i < 8; i += 1) {
    const z = THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, i / 8);
    addSampledLine(new THREE.Vector3(bounds.minX, 0, z), new THREE.Vector3(bounds.maxX, 0, z));
  }
  addFaceSeams(group, lines, materials);
}

function addVerticalBoundaryFill(group, segments, bottomY, heightAt, material) {
  const positions = [];
  const indices = [];

  for (const [start, end] of segments) {
    const length = start.distanceTo(end);
    const divisions = Math.max(1, Math.ceil(length / 0.45));
    for (let i = 0; i < divisions; i += 1) {
      const t0 = i / divisions;
      const t1 = (i + 1) / divisions;
      const p0 = new THREE.Vector3().lerpVectors(start, end, t0);
      const p1 = new THREE.Vector3().lerpVectors(start, end, t1);
      const y0 = heightAt(p0.x, p0.z);
      const y1 = heightAt(p1.x, p1.z);
      if (!Number.isFinite(y0) || !Number.isFinite(y1) || (y0 <= bottomY + 0.001 && y1 <= bottomY + 0.001)) continue;

      const base = positions.length / 3;
      positions.push(
        p0.x, bottomY, p0.z,
        p1.x, bottomY, p1.z,
        p1.x, y1, p1.z,
        p0.x, y0, p0.z,
      );
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addDominantRidge(group, from, to, ownHeight, otherHeight, materials) {
  const samples = 120;
  let segmentStart = null;
  let previous = null;

  const closeSegment = () => {
    if (segmentStart && previous && segmentStart.distanceTo(previous) > 0.03) {
      group.add(beamBetween(segmentStart, previous, 0.085, materials.trim));
    }
    segmentStart = null;
  };

  for (let i = 0; i <= samples; i += 1) {
    const point = new THREE.Vector3().lerpVectors(from, to, i / samples);
    point.y = ownHeight(point.x, point.z) + 0.018;
    const competingHeight = otherHeight(point.x, point.z);
    const visible = !Number.isFinite(competingHeight) || point.y - 0.018 >= competingHeight - 0.002;

    if (visible && !segmentStart) segmentStart = point.clone();
    if (!visible) closeSegment();
    previous = point.clone();
  }
  closeSegment();
}

function addValleyContour(group, overlap, mainHeight, wingHeight, materials) {
  const positions = [];
  const nx = 34;
  const nz = 34;

  const interpolate = (a, b, va, vb) => {
    const denominator = va - vb;
    const t = Math.abs(denominator) < 1e-8 ? 0.5 : va / denominator;
    const x = THREE.MathUtils.lerp(a.x, b.x, t);
    const z = THREE.MathUtils.lerp(a.z, b.z, t);
    return new THREE.Vector3(x, Math.max(mainHeight(x, z), wingHeight(x, z)) + 0.018, z);
  };

  for (let zi = 0; zi < nz; zi += 1) {
    const z0 = THREE.MathUtils.lerp(overlap.minZ, overlap.maxZ, zi / nz);
    const z1 = THREE.MathUtils.lerp(overlap.minZ, overlap.maxZ, (zi + 1) / nz);
    for (let xi = 0; xi < nx; xi += 1) {
      const x0 = THREE.MathUtils.lerp(overlap.minX, overlap.maxX, xi / nx);
      const x1 = THREE.MathUtils.lerp(overlap.minX, overlap.maxX, (xi + 1) / nx);
      const corners = [
        new THREE.Vector3(x0, 0, z0),
        new THREE.Vector3(x1, 0, z0),
        new THREE.Vector3(x1, 0, z1),
        new THREE.Vector3(x0, 0, z1),
      ];
      const values = corners.map((point) => mainHeight(point.x, point.z) - wingHeight(point.x, point.z));
      const crossings = [];
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
      for (const [a, b] of edges) {
        if ((values[a] < 0 && values[b] > 0) || (values[a] > 0 && values[b] < 0) || values[a] === 0 || values[b] === 0) {
          crossings.push(interpolate(corners[a], corners[b], values[a], values[b]));
        }
      }
      if (crossings.length === 2) positions.push(...crossings[0].toArray(), ...crossings[1].toArray());
      else if (crossings.length === 4) {
        positions.push(...crossings[0].toArray(), ...crossings[1].toArray());
        positions.push(...crossings[2].toArray(), ...crossings[3].toArray());
      }
    }
  }

  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.68 });
  const valleys = new THREE.LineSegments(geometry, material);
  valleys.renderOrder = 4;
  group.add(valleys);
}


function clipPolygonToHalfPlane(polygon, evaluate, epsilon = 1e-7) {
  if (!polygon.length) return [];
  const result = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentValue = evaluate(current.x, current.z);
    const nextValue = evaluate(next.x, next.z);
    const currentInside = currentValue >= -epsilon;
    const nextInside = nextValue >= -epsilon;

    if (currentInside) result.push(current);
    if (currentInside !== nextInside) {
      const denominator = currentValue - nextValue;
      const t = Math.abs(denominator) < epsilon ? 0.5 : currentValue / denominator;
      result.push({
        x: THREE.MathUtils.lerp(current.x, next.x, t),
        z: THREE.MathUtils.lerp(current.z, next.z, t),
      });
    }
  }

  return result;
}

function polygonArea2D(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    area += current.x * next.z - next.x * current.z;
  }
  return area * 0.5;
}

function addExactRoofEnvelope(group, xCoordinates, zCoordinates, planes, materials, name) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const underlayPositions = [];
  const underlayIndices = [];
  let roofArea = 0;

  const addPolygon = (polygon, plane, activePlanes) => {
    if (polygon.length < 3 || Math.abs(polygonArea2D(polygon)) < 1e-9) return;

    // In Three.js' XZ plane, clockwise 2D winding produces an upward +Y normal.
    if (polygonArea2D(polygon) > 0) polygon.reverse();

    const worldPoints = polygon.map((point) => new THREE.Vector3(
      point.x,
      plane.height(point.x, point.z),
      point.z,
    ));
    const courseDirection = plane.family === 'wing'
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(1, 0, 0);
    const planeNormal = faceNormal(worldPoints);
    const underlayBase = underlayPositions.length / 3;
    worldPoints.forEach((point) => {
      const underlayPoint = point.clone().addScaledVector(planeNormal, -0.012);
      underlayPositions.push(underlayPoint.x, underlayPoint.y, underlayPoint.z);
    });
    for (let index = 1; index < worldPoints.length - 1; index += 1) {
      underlayIndices.push(underlayBase, underlayBase + index, underlayBase + index + 1);
    }
    const profileOrigin = new THREE.Vector3(0, plane.height(0, 0), 0);
    const competingPlanes = activePlanes.filter((competitor) => competitor !== plane);
    const reliefScaleAtPoint = (point) => {
      let scale = 1;
      for (const competitor of competingPlanes) {
        const epsilon = 0.01;
        const difference = (x, z) => plane.height(x, z) - competitor.height(x, z);
        const gradientX = (difference(point.x + epsilon, point.z) - difference(point.x - epsilon, point.z)) / (epsilon * 2);
        const gradientZ = (difference(point.x, point.z + epsilon) - difference(point.x, point.z - epsilon)) / (epsilon * 2);
        const gradientLength = Math.hypot(gradientX, gradientZ);
        if (gradientLength < 1e-8) continue;
        const seamDistance = Math.abs(difference(point.x, point.z)) / gradientLength;
        scale = Math.min(scale, smoothstep(0, 0.16, seamDistance));
      }
      return scale;
    };
    const geometry = roofFaceGeometry(worldPoints, materials.covering, courseDirection, {
      profileOrigin,
      reliefScaleAtPoint,
      fadeAtBoundary: false,
    });
    const baseIndex = positions.length / 3;
    positions.push(...geometry.getAttribute('position').array);
    normals.push(...geometry.getAttribute('normal').array);
    uvs.push(...geometry.getAttribute('uv').array);
    const polygonIndices = geometry.getIndex().array;
    for (let index = 0; index < polygonIndices.length; index += 1) {
      indices.push(baseIndex + polygonIndices[index]);
    }
    geometry.dispose();

    for (let index = 1; index < worldPoints.length - 1; index += 1) {
      roofArea += new THREE.Vector3().subVectors(worldPoints[index], worldPoints[0])
        .cross(new THREE.Vector3().subVectors(worldPoints[index + 1], worldPoints[0])).length() * 0.5;
    }
  };

  for (let zi = 0; zi < zCoordinates.length - 1; zi += 1) {
    for (let xi = 0; xi < xCoordinates.length - 1; xi += 1) {
      const x0 = xCoordinates[xi];
      const x1 = xCoordinates[xi + 1];
      const z0 = zCoordinates[zi];
      const z1 = zCoordinates[zi + 1];
      if (x1 - x0 < 1e-8 || z1 - z0 < 1e-8) continue;

      const centerX = (x0 + x1) * 0.5;
      const centerZ = (z0 + z1) * 0.5;
      const activePlanes = planes.filter((plane) => plane.contains(centerX, centerZ));
      if (!activePlanes.length) continue;

      for (const plane of activePlanes) {
        // This ordering is counter-clockwise from above in Three.js' XZ plane.
        let polygon = [
          { x: x0, z: z0 },
          { x: x0, z: z1 },
          { x: x1, z: z1 },
          { x: x1, z: z0 },
        ];

        for (const competitor of activePlanes) {
          if (competitor === plane) continue;
          polygon = clipPolygonToHalfPlane(
            polygon,
            (x, z) => plane.height(x, z) - competitor.height(x, z),
          );
          if (polygon.length < 3) break;
        }
        addPolygon(polygon, plane, activePlanes);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  orientRoofTrianglesUpward(geometry, true);
  geometry.computeBoundingSphere();

  const mesh = new THREE.Mesh(geometry, materials.roof);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  const underlayGeometry = new THREE.BufferGeometry();
  underlayGeometry.setAttribute('position', new THREE.Float32BufferAttribute(underlayPositions, 3));
  underlayGeometry.setIndex(underlayIndices);
  orientRoofTrianglesUpward(underlayGeometry);
  const underlay = new THREE.Mesh(underlayGeometry, materials.underlay);
  underlay.name = `${name}-valley-underlay`;
  underlay.castShadow = false;
  underlay.receiveShadow = true;
  group.add(underlay);
  group.add(mesh);
  return roofArea;
}

function addEnvelopeValleys(group, xCoordinates, zCoordinates, planes) {
  const positions = [];
  const epsilon = 1e-7;

  const addUniquePoint = (points, point) => {
    if (!points.some((other) => Math.hypot(other.x - point.x, other.z - point.z) < 1e-6)) {
      points.push(point);
    }
  };

  for (let zi = 0; zi < zCoordinates.length - 1; zi += 1) {
    for (let xi = 0; xi < xCoordinates.length - 1; xi += 1) {
      const x0 = xCoordinates[xi];
      const x1 = xCoordinates[xi + 1];
      const z0 = zCoordinates[zi];
      const z1 = zCoordinates[zi + 1];
      const centerX = (x0 + x1) * 0.5;
      const centerZ = (z0 + z1) * 0.5;
      const activePlanes = planes.filter((plane) => plane.contains(centerX, centerZ));
      const mainPlane = activePlanes.find((plane) => plane.family === 'main');
      const wingPlane = activePlanes.find((plane) => plane.family === 'wing');
      if (!mainPlane || !wingPlane) continue;

      const corners = [
        { x: x0, z: z0 },
        { x: x0, z: z1 },
        { x: x1, z: z1 },
        { x: x1, z: z0 },
      ];
      const values = corners.map((point) => mainPlane.height(point.x, point.z) - wingPlane.height(point.x, point.z));
      const crossings = [];

      for (let edge = 0; edge < corners.length; edge += 1) {
        const next = (edge + 1) % corners.length;
        const start = corners[edge];
        const end = corners[next];
        const startValue = values[edge];
        const endValue = values[next];

        if (Math.abs(startValue) <= epsilon) addUniquePoint(crossings, start);
        if (startValue * endValue < -epsilon * epsilon) {
          const t = startValue / (startValue - endValue);
          addUniquePoint(crossings, {
            x: THREE.MathUtils.lerp(start.x, end.x, t),
            z: THREE.MathUtils.lerp(start.z, end.z, t),
          });
        }
      }

      if (crossings.length < 2) continue;
      let first = crossings[0];
      let second = crossings[1];
      let farthest = -1;
      for (let a = 0; a < crossings.length; a += 1) {
        for (let b = a + 1; b < crossings.length; b += 1) {
          const distance = (crossings[a].x - crossings[b].x) ** 2 + (crossings[a].z - crossings[b].z) ** 2;
          if (distance > farthest) {
            farthest = distance;
            first = crossings[a];
            second = crossings[b];
          }
        }
      }
      if (farthest <= 1e-10) continue;

      positions.push(
        first.x, mainPlane.height(first.x, first.z) + 0.018, first.z,
        second.x, mainPlane.height(second.x, second.z) + 0.018, second.z,
      );
    }
  }

  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.68 });
  const valleys = new THREE.LineSegments(geometry, material);
  valleys.renderOrder = 4;
  group.add(valleys);
}

function extractRectangleUnionBoundary(rectangles, extraX = [], extraZ = []) {
  const xCoordinates = uniqueSorted([
    ...rectangles.flatMap((rect) => [rect.minX, rect.maxX]),
    ...extraX,
  ]);
  const zCoordinates = uniqueSorted([
    ...rectangles.flatMap((rect) => [rect.minZ, rect.maxZ]),
    ...extraZ,
  ]);
  const occupied = [];

  for (let zi = 0; zi < zCoordinates.length - 1; zi += 1) {
    occupied[zi] = [];
    for (let xi = 0; xi < xCoordinates.length - 1; xi += 1) {
      const x = (xCoordinates[xi] + xCoordinates[xi + 1]) * 0.5;
      const z = (zCoordinates[zi] + zCoordinates[zi + 1]) * 0.5;
      occupied[zi][xi] = rectangles.some((rect) => pointInsideRect(x, z, rect));
    }
  }

  const isOccupied = (xi, zi) => Boolean(occupied[zi]?.[xi]);
  const segments = [];
  for (let zi = 0; zi < zCoordinates.length - 1; zi += 1) {
    for (let xi = 0; xi < xCoordinates.length - 1; xi += 1) {
      if (!isOccupied(xi, zi)) continue;
      const x0 = xCoordinates[xi];
      const x1 = xCoordinates[xi + 1];
      const z0 = zCoordinates[zi];
      const z1 = zCoordinates[zi + 1];

      if (!isOccupied(xi, zi - 1)) segments.push([{ x: x0, z: z0 }, { x: x1, z: z0 }]);
      if (!isOccupied(xi + 1, zi)) segments.push([{ x: x1, z: z0 }, { x: x1, z: z1 }]);
      if (!isOccupied(xi, zi + 1)) segments.push([{ x: x1, z: z1 }, { x: x0, z: z1 }]);
      if (!isOccupied(xi - 1, zi)) segments.push([{ x: x0, z: z1 }, { x: x0, z: z0 }]);
    }
  }
  return segments;
}

function splitEnvelopeBoundarySegment(segment, planes, roofHeight) {
  const [start, end] = segment;
  const midpoint = { x: (start.x + end.x) * 0.5, z: (start.z + end.z) * 0.5 };
  const activePlanes = planes.filter((plane) => plane.contains(midpoint.x, midpoint.z));
  const splitParameters = [0, 1];

  for (let i = 0; i < activePlanes.length; i += 1) {
    for (let j = i + 1; j < activePlanes.length; j += 1) {
      const planeA = activePlanes[i];
      const planeB = activePlanes[j];
      const startDifference = planeA.height(start.x, start.z) - planeB.height(start.x, start.z);
      const endDifference = planeA.height(end.x, end.z) - planeB.height(end.x, end.z);
      const denominator = startDifference - endDifference;
      if (Math.abs(denominator) < 1e-9) continue;
      const t = startDifference / denominator;
      if (t > 1e-6 && t < 1 - 1e-6) splitParameters.push(t);
    }
  }

  const sorted = uniqueSorted(splitParameters);
  const result = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t0 = sorted[i];
    const t1 = sorted[i + 1];
    const p0 = new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, t0),
      0,
      THREE.MathUtils.lerp(start.z, end.z, t0),
    );
    const p1 = new THREE.Vector3(
      THREE.MathUtils.lerp(start.x, end.x, t1),
      0,
      THREE.MathUtils.lerp(start.z, end.z, t1),
    );
    p0.y = roofHeight(p0.x, p0.z);
    p1.y = roofHeight(p1.x, p1.z);
    if (Number.isFinite(p0.y) && Number.isFinite(p1.y) && p0.distanceTo(p1) > 1e-5) result.push([p0, p1]);
  }
  return result;
}

function addExactBoundaryTrim(group, rectangles, planes, roofHeight, materials, extraX, extraZ) {
  const boundary = extractRectangleUnionBoundary(rectangles, extraX, extraZ);
  const exactSegments = boundary.flatMap((segment) => splitEnvelopeBoundarySegment(segment, planes, roofHeight));
  addPerimeterTrim(group, exactSegments, materials);
  return exactSegments;
}

function addExactBoundaryFill(group, rectangles, planes, roofHeight, bottomY, material, extraX, extraZ) {
  const boundary = extractRectangleUnionBoundary(rectangles, extraX, extraZ);
  const exactSegments = boundary.flatMap((segment) => splitEnvelopeBoundarySegment(segment, planes, roofHeight));
  const positions = [];
  const indices = [];

  for (const [start, end] of exactSegments) {
    if (start.y <= bottomY + 1e-4 && end.y <= bottomY + 1e-4) continue;
    const base = positions.length / 3;
    positions.push(
      start.x, bottomY, start.z,
      end.x, bottomY, end.z,
      end.x, Math.max(bottomY, end.y), end.z,
      start.x, Math.max(bottomY, start.y), start.z,
    );
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  if (!positions.length) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function buildLShape(group, state, materials) {
  const mainDepth = state.depth * 0.56;
  const mainHalfDepth = mainDepth / 2;
  const mainZ = -state.depth * 0.22;
  const wingLength = state.depth;
  const wingHalfLength = wingLength / 2;
  const wingDepth = state.length * 0.42;
  const wingHalfDepth = wingDepth / 2;
  const wingX = -state.length * 0.29;
  const slope = Math.tan(THREE.MathUtils.degToRad(state.pitch));
  const baseY = state.wallHeight + ROOF_OFFSET_Y;

  addBase(group, state, materials, state.length, mainDepth, 0, mainZ);
  addBase(group, state, materials, wingDepth, wingLength, wingX, 0);

  const mainWallRect = {
    minX: -state.length / 2,
    maxX: state.length / 2,
    minZ: mainZ - mainHalfDepth,
    maxZ: mainZ + mainHalfDepth,
  };
  const wingWallRect = {
    minX: wingX - wingHalfDepth,
    maxX: wingX + wingHalfDepth,
    minZ: -wingHalfLength,
    maxZ: wingHalfLength,
  };
  const mainRoofRect = {
    minX: mainWallRect.minX - state.overhang,
    maxX: mainWallRect.maxX + state.overhang,
    minZ: mainWallRect.minZ - state.overhang,
    maxZ: mainWallRect.maxZ + state.overhang,
  };
  const wingRoofRect = {
    minX: wingWallRect.minX - state.overhang,
    maxX: wingWallRect.maxX + state.overhang,
    minZ: wingWallRect.minZ - state.overhang,
    maxZ: wingWallRect.maxZ + state.overhang,
  };

  const planes = [
    {
      name: 'main-back', family: 'main',
      contains: (x, z) => pointInsideRect(x, z, mainRoofRect) && z <= mainZ + 1e-7,
      height: (_x, z) => baseY + slope * (mainHalfDepth + z - mainZ),
    },
    {
      name: 'main-front', family: 'main',
      contains: (x, z) => pointInsideRect(x, z, mainRoofRect) && z >= mainZ - 1e-7,
      height: (_x, z) => baseY + slope * (mainHalfDepth - z + mainZ),
    },
    {
      name: 'wing-left', family: 'wing',
      contains: (x, z) => pointInsideRect(x, z, wingRoofRect) && x <= wingX + 1e-7,
      height: (x) => baseY + slope * (wingHalfDepth + x - wingX),
    },
    {
      name: 'wing-right', family: 'wing',
      contains: (x, z) => pointInsideRect(x, z, wingRoofRect) && x >= wingX - 1e-7,
      height: (x) => baseY + slope * (wingHalfDepth - x + wingX),
    },
  ];

  const roofHeight = (x, z) => {
    const heights = planes.filter((plane) => plane.contains(x, z)).map((plane) => plane.height(x, z));
    return heights.length ? Math.max(...heights) : Number.NaN;
  };
  const isInsideRoof = (x, z) => pointInsideRect(x, z, mainRoofRect) || pointInsideRect(x, z, wingRoofRect);

  // Rectangle/ridge boundaries make the active plane set constant in each cell.
  // Each overlap cell is then split exactly by the straight valley equation.
  const xCoordinates = uniqueSorted([
    mainRoofRect.minX, mainRoofRect.maxX,
    wingRoofRect.minX, wingX, wingRoofRect.maxX,
  ]);
  const zCoordinates = uniqueSorted([
    mainRoofRect.minZ, mainZ, mainRoofRect.maxZ,
    wingRoofRect.minZ, wingRoofRect.maxZ,
  ]);

  const roofArea = addExactRoofEnvelope(
    group,
    xCoordinates,
    zCoordinates,
    planes,
    materials,
    'l-shaped-roof',
  );
  addEnvelopeValleys(group, xCoordinates, zCoordinates, planes);

  const bounds = {
    minX: Math.min(mainRoofRect.minX, wingRoofRect.minX),
    maxX: Math.max(mainRoofRect.maxX, wingRoofRect.maxX),
    minZ: Math.min(mainRoofRect.minZ, wingRoofRect.minZ),
    maxZ: Math.max(mainRoofRect.maxZ, wingRoofRect.maxZ),
  };
  addHeightFieldSeams(group, bounds, isInsideRoof, roofHeight, materials);

  // Build the roof border from the actual union outline. The boundary is split
  // at both gable ridges and at roof-plane intersections, so gable trim follows
  // the triangular roof edge instead of bridging it with a horizontal beam.
  addExactBoundaryTrim(
    group,
    [mainRoofRect, wingRoofRect],
    planes,
    roofHeight,
    materials,
    [wingX],
    [mainZ],
  );

  addDominantRidge(
    group,
    new THREE.Vector3(mainRoofRect.minX, 0, mainZ),
    new THREE.Vector3(mainRoofRect.maxX, 0, mainZ),
    (_x, z) => baseY + slope * (mainHalfDepth - Math.abs(z - mainZ)),
    (x, z) => pointInsideRect(x, z, wingRoofRect)
      ? baseY + slope * (wingHalfDepth - Math.abs(x - wingX))
      : Number.NEGATIVE_INFINITY,
    materials,
  );
  addDominantRidge(
    group,
    new THREE.Vector3(wingX, 0, wingRoofRect.minZ),
    new THREE.Vector3(wingX, 0, wingRoofRect.maxZ),
    (x) => baseY + slope * (wingHalfDepth - Math.abs(x - wingX)),
    (x, z) => pointInsideRect(x, z, mainRoofRect)
      ? baseY + slope * (mainHalfDepth - Math.abs(z - mainZ))
      : Number.NEGATIVE_INFINITY,
    materials,
  );

  addExactBoundaryFill(
    group,
    [mainWallRect, wingWallRect],
    planes,
    roofHeight,
    state.wallHeight,
    materials.wall,
    [wingX],
    [mainZ],
  );

  const wallOverlap = Math.max(0, Math.min(mainWallRect.maxX, wingWallRect.maxX) - Math.max(mainWallRect.minX, wingWallRect.minX))
    * Math.max(0, Math.min(mainWallRect.maxZ, wingWallRect.maxZ) - Math.max(mainWallRect.minZ, wingWallRect.minZ));

  return {
    footprint: state.length * mainDepth + wingDepth * wingLength - wallOverlap,
    roofArea,
    ridgeElevation: Math.max(
      baseY + slope * mainHalfDepth,
      baseY + slope * wingHalfDepth,
    ),
    approximate: false,
  };
}

function buildDormer(group, state, materials) {
  const main = buildGableRoof(group, {
    length: state.length,
    depth: state.depth,
    wallHeight: state.wallHeight,
    pitch: state.pitch,
    overhang: state.overhang,
    namePrefix: 'main',
  }, materials);

  const mainSlope = Math.tan(THREE.MathUtils.degToRad(state.pitch));
  const mainRidgeY = state.wallHeight + ROOF_OFFSET_Y + mainSlope * (state.depth / 2);
  const mainFrontHeight = (z) => state.wallHeight + ROOF_OFFSET_Y + mainSlope * (z + state.depth / 2);
  const mainZAtHeight = (height) => ((height - state.wallHeight - ROOF_OFFSET_Y) / mainSlope) - state.depth / 2;

  const frontZ = -state.depth * 0.34;
  const frontBottomY = mainFrontHeight(frontZ) + 0.012;
  const dormerPitch = Math.max(22, Math.min(30, state.pitch));
  const dormerSlope = Math.tan(THREE.MathUtils.degToRad(dormerPitch));
  const desiredHalfWidth = Math.min(state.length * 0.13, 1.3);
  const minimumWallHeight = 0.28;
  const maximumHalfWidth = Math.max(
    0.55,
    (mainRidgeY - 0.08 - frontBottomY - minimumWallHeight) / Math.max(dormerSlope, 0.001),
  );
  const wallHalfWidth = Math.min(desiredHalfWidth, maximumHalfWidth);
  const desiredWallHeight = Math.min(0.72, state.wallHeight * 0.24);
  const maximumWallEaveY = mainRidgeY - dormerSlope * wallHalfWidth - 0.06;
  const wallEaveY = Math.max(
    frontBottomY + minimumWallHeight,
    Math.min(frontBottomY + desiredWallHeight, maximumWallEaveY),
  );
  const ridgeY = wallEaveY + dormerSlope * wallHalfWidth;

  const sideOverhang = Math.min(0.18, state.overhang * 0.32);
  const roofHalfWidth = wallHalfWidth + sideOverhang;
  const outerEaveY = ridgeY - dormerSlope * roofHalfWidth;
  const roofFrontZ = frontZ - Math.min(0.22, state.overhang * 0.22);
  const wallBackZ = Math.min(-0.06, mainZAtHeight(wallEaveY));
  const outerEaveBackZ = Math.min(-0.045, mainZAtHeight(outerEaveY));
  const ridgeBackZ = Math.min(-0.025, mainZAtHeight(ridgeY));

  const frontWall = makeWallFace([
    new THREE.Vector3(-wallHalfWidth, frontBottomY, frontZ),
    new THREE.Vector3(wallHalfWidth, frontBottomY, frontZ),
    new THREE.Vector3(wallHalfWidth, wallEaveY, frontZ),
    new THREE.Vector3(-wallHalfWidth, wallEaveY, frontZ),
  ], materials.wall);
  group.add(frontWall);
  group.add(makeWallFace([
    new THREE.Vector3(-wallHalfWidth, wallEaveY, frontZ),
    new THREE.Vector3(wallHalfWidth, wallEaveY, frontZ),
    new THREE.Vector3(0, ridgeY, frontZ),
  ], materials.wall));

  group.add(makeWallFace([
    new THREE.Vector3(-wallHalfWidth, frontBottomY, frontZ),
    new THREE.Vector3(-wallHalfWidth, wallEaveY, wallBackZ),
    new THREE.Vector3(-wallHalfWidth, wallEaveY, frontZ),
  ], materials.wall));
  group.add(makeWallFace([
    new THREE.Vector3(wallHalfWidth, frontBottomY, frontZ),
    new THREE.Vector3(wallHalfWidth, wallEaveY, frontZ),
    new THREE.Vector3(wallHalfWidth, wallEaveY, wallBackZ),
  ], materials.wall));

  const lf = new THREE.Vector3(-roofHalfWidth, outerEaveY, roofFrontZ);
  const rf = new THREE.Vector3(roofHalfWidth, outerEaveY, roofFrontZ);
  const rFront = new THREE.Vector3(0, ridgeY, roofFrontZ);
  const leftValley = new THREE.Vector3(-roofHalfWidth, outerEaveY, outerEaveBackZ);
  const rightValley = new THREE.Vector3(roofHalfWidth, outerEaveY, outerEaveBackZ);
  const rBack = new THREE.Vector3(0, ridgeY, ridgeBackZ);

  addRoofFace(group, [lf, rFront, rBack, leftValley], materials, 'dormer-left');
  addRoofFace(group, [rFront, rf, rightValley, rBack], materials, 'dormer-right');
  addPerimeterTrim(group, [
    [lf, leftValley],
    [rf, rightValley],
    [rFront, rBack],
    [lf, rFront],
    [rFront, rf],
    [leftValley, rBack],
    [rBack, rightValley],
  ], materials, 0.065);

  const dormerArea = (
    new THREE.Triangle(lf, rFront, rBack).getArea()
    + new THREE.Triangle(lf, rBack, leftValley).getArea()
    + new THREE.Triangle(rFront, rf, rightValley).getArea()
    + new THREE.Triangle(rFront, rightValley, rBack).getArea()
  );

  return {
    footprint: state.length * state.depth,
    roofArea: main.roofArea + dormerArea,
    ridgeElevation: Math.max(main.ridgeElevation, ridgeY),
    approximate: true,
  };
}


function buildCustomPlaceholder(group, state, materials) {
  addBase(group, state, materials);

  const outlineMaterial = new THREE.LineDashedMaterial({
    color: 0x1494de,
    dashSize: 0.28,
    gapSize: 0.16,
    transparent: true,
    opacity: 0.82,
  });
  const y = state.wallHeight + 0.035;
  const x = state.length / 2;
  const z = state.depth / 2;
  const outlineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-x, y, -z),
    new THREE.Vector3(x, y, -z),
    new THREE.Vector3(x, y, z),
    new THREE.Vector3(-x, y, z),
    new THREE.Vector3(-x, y, -z),
  ]);
  const outline = new THREE.Line(outlineGeometry, outlineMaterial);
  outline.computeLineDistances();
  group.add(outline);

  const guideMaterial = new THREE.MeshBasicMaterial({
    color: 0x1494de,
    transparent: true,
    opacity: 0.035,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const guide = new THREE.Mesh(new THREE.PlaneGeometry(state.length, state.depth), guideMaterial);
  guide.rotation.x = -Math.PI / 2;
  guide.position.y = y;
  group.add(guide);

  return {
    footprint: state.length * state.depth,
    roofArea: 0,
    ridgeElevation: state.wallHeight,
    approximate: true,
  };
}

function addFacadeDetails(group, state) {
  const dark = new THREE.MeshStandardMaterial({ color: 0x37434c, roughness: 0.62, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x8eb0bc, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.72 });
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.25, Math.min(2.2, state.wallHeight * 0.72), 0.06), dark);
  door.position.set(-state.length * 0.18, Math.min(2.2, state.wallHeight * 0.72) / 2, -state.depth / 2 - 0.031);
  group.add(door);

  const windowWidth = Math.min(2.4, state.length * 0.24);
  const window = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 1.25, 0.065), glass);
  window.position.set(state.length * 0.2, Math.min(1.65, state.wallHeight * 0.55), -state.depth / 2 - 0.034);
  group.add(window);
}


function addLShapeFacadeDetails(group, state) {
  // The front of the house is the negative-Z facade, consistent with the
  // regular roof models and the corrected Front camera view.
  addFacadeDetails(group, state);

  // Add an extra window to the exposed rear wall of the wing so the
  // L-shaped house also has facade detail in the default 3D perspective.
  const glass = new THREE.MeshStandardMaterial({
    color: 0x8eb0bc,
    roughness: 0.2,
    metalness: 0.1,
    transparent: true,
    opacity: 0.72,
  });
  const wingWindowHeight = Math.min(1.25, state.wallHeight * 0.42);
  const wingWindowWidth = Math.min(1.9, state.length * 0.2);
  const wingWindow = new THREE.Mesh(
    new THREE.BoxGeometry(wingWindowWidth, wingWindowHeight, 0.065),
    glass,
  );
  wingWindow.position.set(
    -state.length * 0.29,
    Math.min(1.65, state.wallHeight * 0.55),
    state.depth / 2 + 0.034,
  );
  group.add(wingWindow);
}

export function buildRoofModel(state) {
  const materials = materialSet(state);
  const group = new THREE.Group();
  group.name = 'roof-model';

  let metrics;
  if (state.roofType === 'custom') {
    metrics = buildCustomPlaceholder(group, state, materials);
  } else if (state.roofType === 'lshape') {
    metrics = buildLShape(group, state, materials);
    addLShapeFacadeDetails(group, state);
  } else {
    addBase(group, state, materials);
    if (state.roofType === 'hip') metrics = buildHipRoof(group, state, materials);
    else if (state.roofType === 'shed') metrics = buildShedRoof(group, state, materials);
    else if (state.roofType === 'dormer') metrics = buildDormer(group, state, materials);
    else metrics = buildGableRoof(group, state, materials);
    addFacadeDetails(group, state);
  }

  const footprint = metrics.footprint ?? state.length * state.depth;
  return {
    group,
    metrics: {
      footprint,
      roofArea: metrics.roofArea,
      ridgeElevation: metrics.ridgeElevation,
      approximate: Boolean(metrics.approximate),
    },
  };
}
