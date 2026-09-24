// Exact surface/closure functions extracted from cardbox-configurator/js/app.js
// at 05329b7. Uses the final inside/outside surface pipeline, not legacy makeSurfaceMesh.
import * as THREE from 'three';
const EPSILON=1e-6,LID_LIFT_MM=300,CARDBOX_TOOL_LID_ANGLE=Math.PI*.58;
const PACKAGING_CATALOG_SCHEMA_VERSION = 1;
const PACKAGING_BOX_TYPES = Object.freeze({
  standard: Object.freeze({ code: '0201', family: '02', dims: [600, 400, 300], top: 'simple-flaps', bottom: 'simple-flaps', topOptions: ['open','flat','simple-flaps','folded-flaps','full-overlap','interlocking','tuck'], bottomOptions: ['open','flat','simple-flaps','folded-flaps','full-overlap','interlocking','snap-lock','auto-lock'] }),
  'full-overlap': Object.freeze({ code: '0203', family: '02', dims: [600, 400, 300], top: 'full-overlap', bottom: 'full-overlap', topOptions: ['open','flat','simple-flaps','folded-flaps','full-overlap','interlocking'], bottomOptions: ['open','flat','simple-flaps','folded-flaps','full-overlap','interlocking'] }),
  telescope: Object.freeze({ code: '03xx', family: '03', dims: [520, 360, 240], top: 'telescope', bottom: 'flat', topOptions: ['telescope','open'], bottomOptions: ['flat','open'] }),
  archive: Object.freeze({ code: '04xx', family: '04', dims: [400, 320, 260], top: 'archive-lid', bottom: 'flat', topOptions: ['archive-lid','hinged','tuck','open'], bottomOptions: ['flat','open'], defaultHandle: 'die-cut' }),
  pizza: Object.freeze({ code: '0426', family: '04', dims: [330, 330, 50], top: 'pizza-lid', bottom: 'flat', topOptions: ['pizza-lid','hinged','self-locking','open'], bottomOptions: ['flat'], defaultHoles: 'vents' }),
  mailer: Object.freeze({ code: '0427', family: '04', dims: [360, 260, 100], top: 'mailer-lid', bottom: 'flat', topOptions: ['mailer-lid','hinged','tuck','self-locking','open'], bottomOptions: ['flat'] }),
  'auto-bottom': Object.freeze({ code: '07xx', family: '07', dims: [420, 300, 250], top: 'tuck', bottom: 'auto-lock', topOptions: ['open','simple-flaps','tuck'], bottomOptions: ['auto-lock','snap-lock'] }),
  'two-point-glued': Object.freeze({ code: '07xx · 2P', family: '07', dims: [420, 300, 180], top: 'tuck', bottom: 'two-point-glued', topOptions: ['open','simple-flaps','tuck'], bottomOptions: ['two-point-glued','flat'] }),
  'sleeve-drawer': Object.freeze({ code: '05xx', family: '05', dims: [400, 260, 110], top: 'sleeve', bottom: 'drawer', topOptions: ['sleeve','open'], bottomOptions: ['drawer'] }),
});
const PACKAGING_FLUTES = Object.freeze({
  E: Object.freeze({ thickness: 1.5, takeUp: 1.24, priceM2: 1.35 }),
  B: Object.freeze({ thickness: 3.0, takeUp: 1.35, priceM2: 1.55 }),
  C: Object.freeze({ thickness: 4.0, takeUp: 1.43, priceM2: 1.72 }),
  EB: Object.freeze({ thickness: 4.5, takeUp: [1.24, 1.35], priceM2: 2.35 }),
  BC: Object.freeze({ thickness: 7.0, takeUp: [1.35, 1.43], priceM2: 2.78 }),
});
const PACKAGING_PAPERS = Object.freeze({
  'testliner-natural': Object.freeze({ color: '#b88959', liner: true }),
  kraftliner: Object.freeze({ color: '#a87342', liner: true }),
  'white-top-testliner': Object.freeze({ color: '#f1efe7', liner: true }),
  'white-kraftliner': Object.freeze({ color: '#fafaf6', liner: true }),
  fluting: Object.freeze({ color: '#c99b68', medium: true }),
  'semi-chemical-fluting': Object.freeze({ color: '#c39058', medium: true }),
  'recycled-fluting': Object.freeze({ color: '#b98858', medium: true }),
});
export function buildModel(input){
  const type=Object.hasOwn(PACKAGING_BOX_TYPES,input.style)?input.style:'standard';
  const def=PACKAGING_BOX_TYPES[type];
  const w=Math.min(800,Math.max(200,Number(input.width)||def.dims[0])),d=Math.min(600,Math.max(150,Number(input.depth)||def.dims[1])),h=Math.min(500,Math.max(50,Number(input.height)||def.dims[2]));
  const DEFAULT_COLOR=input.colour||'#b88959';
  const state={boxes:[makeBaseBox(w,d,h)],boxType:type,closures:{top:def.topOptions.includes(input.top)?input.top:def.top,bottom:def.bottomOptions.includes(input.bottom)?input.bottom:def.bottom}};
  ensurePackagingState();ensureDecorationState();
  // Existing website swatches select original production outer papers.
  state.board.layers[0].paper=input.colour==='#f1efe7'?'white-top-testliner':input.colour==='#a87342'?'kraftliner':'testliner-natural';
  if(['TFT','AFT','AFA'].includes(input.paper)){state.board.preset=input.paper;state.board.layers=packagingDefaultLayers('CO3',input.paper);}
  const group=new THREE.Group(),packagingClosureGroup=new THREE.Group(),packagingFeatureGroup=new THREE.Group();
  const currentBoxes=()=>state.boxes,isLidLiftActive=()=>false,clearGroup=g=>g.clear();
  const descriptors=mergeTiles(collectBoundaryTiles(buildUnionGrid(state.boxes)));
  const surfaceMeshes=[];
  for(const face of descriptors){
    const outer=makeColoredSurfaceMesh(face,1),inner=makeColoredSurfaceMesh(face,-1);
    const edges=new THREE.LineSegments(new THREE.EdgesGeometry(outer.geometry),new THREE.LineBasicMaterial({color:0x755335,transparent:true,opacity:.38,depthTest:true}));
    outer.add(edges);surfaceMeshes.push(outer,inner);
  }
  group.add(...surfaceMeshes,packagingClosureGroup,packagingFeatureGroup);
  applyFeaturesAndSurfaceColours();packagingRenderClosureVisuals();
  surfaceMeshes.forEach(mesh=>{if(mesh.userData.top)mesh.visible=state.closures.top!=='open';if(mesh.userData.bottom)mesh.visible=state.closures.bottom!=='open';});
  const progress=Math.min(1,Math.max(0,Number(input.open)/100));
  for(const mesh of surfaceMeshes)if(mesh.userData.top)transformToolRenderable(mesh,'top',progress);
  for(const object of packagingClosureGroup.children){object.geometry.computeBoundingBox();if(object.geometry.boundingBox.min.y>=h)transformToolRenderable(object,'top',progress);}
  group.scale.setScalar(.001);
  return {group,metrics:{litres:w*d*h/1e6}};
  function makeBaseBox(width = 600, depth = 400, height = 300) {
  return { id: 'base', minX: -width / 2, maxX: width / 2, minY: 0, maxY: height, minZ: -depth / 2, maxZ: depth / 2 };
}
function round(value, digits = 4) { const f = 10 ** digits; return Math.round(value * f) / f; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function uniqueSorted(values) { return [...new Set(values.map((v) => round(v, 6)))].sort((a, b) => a - b); }
function faceKey(face) { return [face.axis, face.sign, round(face.coord, 4), round(face.u1, 4), round(face.u2, 4), round(face.v1, 4), round(face.v2, 4)].join(':'); }
function buildUnionGrid(boxes) {
  const xs = uniqueSorted(boxes.flatMap((b) => [b.minX, b.maxX]));
  const ys = uniqueSorted(boxes.flatMap((b) => [b.minY, b.maxY]));
  const zs = uniqueSorted(boxes.flatMap((b) => [b.minZ, b.maxZ]));
  const occupied = Array.from({ length: xs.length - 1 }, () => Array.from({ length: ys.length - 1 }, () => Array(zs.length - 1).fill(false)));
  for (let ix = 0; ix < xs.length - 1; ix += 1) {
    const cx = (xs[ix] + xs[ix + 1]) / 2;
    for (let iy = 0; iy < ys.length - 1; iy += 1) {
      const cy = (ys[iy] + ys[iy + 1]) / 2;
      for (let iz = 0; iz < zs.length - 1; iz += 1) {
        const cz = (zs[iz] + zs[iz + 1]) / 2;
        occupied[ix][iy][iz] = boxes.some((b) => cx > b.minX - EPSILON && cx < b.maxX + EPSILON && cy > b.minY - EPSILON && cy < b.maxY + EPSILON && cz > b.minZ - EPSILON && cz < b.maxZ + EPSILON);
      }
    }
  }
  return { xs, ys, zs, occupied };
}
function collectBoundaryTiles(grid) {
  const { xs, ys, zs, occupied } = grid;
  const tiles = [];
  const nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
  const isOcc = (ix, iy, iz) => ix >= 0 && iy >= 0 && iz >= 0 && ix < nx && iy < ny && iz < nz && occupied[ix][iy][iz];
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        if (!occupied[ix][iy][iz]) continue;
        if (!isOcc(ix - 1, iy, iz)) tiles.push({ axis: 'x', sign: -1, coord: xs[ix], u1: zs[iz], u2: zs[iz + 1], v1: ys[iy], v2: ys[iy + 1] });
        if (!isOcc(ix + 1, iy, iz)) tiles.push({ axis: 'x', sign: 1, coord: xs[ix + 1], u1: zs[iz], u2: zs[iz + 1], v1: ys[iy], v2: ys[iy + 1] });
        if (!isOcc(ix, iy - 1, iz)) tiles.push({ axis: 'y', sign: -1, coord: ys[iy], u1: xs[ix], u2: xs[ix + 1], v1: zs[iz], v2: zs[iz + 1] });
        if (!isOcc(ix, iy + 1, iz)) tiles.push({ axis: 'y', sign: 1, coord: ys[iy + 1], u1: xs[ix], u2: xs[ix + 1], v1: zs[iz], v2: zs[iz + 1] });
        if (!isOcc(ix, iy, iz - 1)) tiles.push({ axis: 'z', sign: -1, coord: zs[iz], u1: xs[ix], u2: xs[ix + 1], v1: ys[iy], v2: ys[iy + 1] });
        if (!isOcc(ix, iy, iz + 1)) tiles.push({ axis: 'z', sign: 1, coord: zs[iz + 1], u1: xs[ix], u2: xs[ix + 1], v1: ys[iy], v2: ys[iy + 1] });
      }
    }
  }
  return tiles;
}
function mergeTiles(tiles) {
  const groups = new Map();
  for (const tile of tiles) {
    const key = `${tile.axis}:${tile.sign}:${round(tile.coord, 6)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tile);
  }
  const faces = [];
  for (const group of groups.values()) {
    const uCoords = uniqueSorted(group.flatMap((t0) => [t0.u1, t0.u2]));
    const vCoords = uniqueSorted(group.flatMap((t0) => [t0.v1, t0.v2]));
    const cells = Array.from({ length: uCoords.length - 1 }, () => Array(vCoords.length - 1).fill(false));
    for (const tile of group) {
      const iu = uCoords.findIndex((v) => Math.abs(v - tile.u1) < EPSILON);
      const iv = vCoords.findIndex((v) => Math.abs(v - tile.v1) < EPSILON);
      if (iu >= 0 && iv >= 0) cells[iu][iv] = true;
    }
    const used = cells.map((row) => row.map(() => false));
    for (let iu = 0; iu < cells.length; iu += 1) {
      for (let iv = 0; iv < cells[iu].length; iv += 1) {
        if (!cells[iu][iv] || used[iu][iv]) continue;
        let endU = iu;
        while (endU + 1 < cells.length && cells[endU + 1][iv] && !used[endU + 1][iv]) endU += 1;
        let endV = iv;
        outer: while (endV + 1 < cells[iu].length) {
          for (let u = iu; u <= endU; u += 1) if (!cells[u][endV + 1] || used[u][endV + 1]) break outer;
          endV += 1;
        }
        for (let u = iu; u <= endU; u += 1) for (let v = iv; v <= endV; v += 1) used[u][v] = true;
        const seed = group[0];
        faces.push({ axis: seed.axis, sign: seed.sign, coord: seed.coord, u1: uCoords[iu], u2: uCoords[endU + 1], v1: vCoords[iv], v2: vCoords[endV + 1] });
      }
    }
  }
  return faces;
}
function faceNormal(face) {
  if (face.axis === 'x') return new THREE.Vector3(face.sign, 0, 0);
  if (face.axis === 'y') return new THREE.Vector3(0, face.sign, 0);
  return new THREE.Vector3(0, 0, face.sign);
}
function faceCenter(face) {
  if (face.axis === 'x') return new THREE.Vector3(face.coord, (face.v1 + face.v2) / 2, (face.u1 + face.u2) / 2);
  if (face.axis === 'y') return new THREE.Vector3((face.u1 + face.u2) / 2, face.coord, (face.v1 + face.v2) / 2);
  return new THREE.Vector3((face.u1 + face.u2) / 2, (face.v1 + face.v2) / 2, face.coord);
}
function isVerticalFace(face) { return face.axis === 'x' || face.axis === 'z'; }
function isTopFace(face) { return face.axis === 'y' && face.sign > 0; }
function isBottomFace(face) { return face.axis === 'y' && face.sign < 0; }
function makeColoredSurfaceMesh(face, sideFactor) {
  const width=face.u2-face.u1,height=face.v2-face.v1;
  const geometry=new THREE.PlaneGeometry(width,height);
  const material=new THREE.MeshStandardMaterial({color:resolvedSurfaceColor(face,sideFactor),roughness:.84,metalness:0,side:sideFactor>=0?THREE.FrontSide:THREE.BackSide});
  const mesh=new THREE.Mesh(geometry,material);const normal=faceNormal(face);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);
  const center=faceCenter(face);if(isLidLiftActive()&&isTopFace(face))center.y+=LID_LIFT_MM;mesh.position.copy(center);mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.userData.cardboxSurface=true;mesh.userData.face=face;mesh.userData.faceKey=faceKey(face);mesh.userData.vertical=isVerticalFace(face);mesh.userData.top=isTopFace(face);mesh.userData.bottom=isBottomFace(face);mesh.userData.surfaceSideFactor=sideFactor;
  return mesh;
}
function boundsForBoxes(boxes = currentBoxes()) {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)), maxX: Math.max(...boxes.map((b) => b.maxX)),
    minY: Math.min(...boxes.map((b) => b.minY)), maxY: Math.max(...boxes.map((b) => b.maxY)),
    minZ: Math.min(...boxes.map((b) => b.minZ)), maxZ: Math.max(...boxes.map((b) => b.maxZ)),
  };
}
function packagingLine(points, { color=0x725036, dashed=false, opacity=.65 } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = dashed ? new THREE.LineDashedMaterial({color,transparent:true,opacity,dashSize:12,gapSize:8}) : new THREE.LineBasicMaterial({color,transparent:true,opacity});
  const line = new THREE.Line(geometry,material); if (dashed) line.computeLineDistances(); packagingClosureGroup.add(line); return line;
}
function packagingTopMesh() { return surfaceMeshes.find((mesh) => mesh.userData?.top); }
function packagingBottomMesh() { return surfaceMeshes.find((mesh) => mesh.userData?.bottom); }
function packagingAddTopLine(x1,z1,x2,z2,y,opts) { packagingLine([new THREE.Vector3(x1,y,z1),new THREE.Vector3(x2,y,z2)],opts); }
function packagingRenderClosureVisuals() {
  ensurePackagingState();
  clearGroup(packagingClosureGroup);
  const b = boundsForBoxes(state.boxes); const topMesh = packagingTopMesh(); const bottomMesh = packagingBottomMesh();
  const topY = topMesh?.position?.y ?? b.maxY; const bottomY = bottomMesh?.position?.y ?? b.minY;
  if (topMesh) { topMesh.visible = state.closures.top !== 'open'; if (state.closures.top === 'open') topMesh.raycast = () => {}; }
  if (bottomMesh) { bottomMesh.visible = state.closures.bottom !== 'open'; if (state.closures.bottom === 'open') bottomMesh.raycast = () => {}; }
  const cx=(b.minX+b.maxX)/2, cz=(b.minZ+b.maxZ)/2, w=b.maxX-b.minX, d=b.maxZ-b.minZ;
  const top=state.closures.top, bottom=state.closures.bottom, seam={color:0x765035,opacity:.62};
  const cross=(y) => { packagingAddTopLine(cx,b.minZ,cx,b.maxZ,y,seam); packagingAddTopLine(b.minX,cz,b.maxX,cz,y,seam); };
  if (['simple-flaps','folded-flaps'].includes(top)) cross(topY+1.1);
  if (top === 'full-overlap') { packagingAddTopLine(b.minX,cz-d*.18,b.maxX,cz-d*.18,topY+1.1,seam); packagingAddTopLine(b.minX,cz+d*.18,b.maxX,cz+d*.18,topY+1.1,seam); }
  if (top === 'interlocking') { const pts=[]; for(let i=0;i<=10;i++) pts.push(new THREE.Vector3(b.minX+w*i/10,topY+1.1,cz+(i%2?d*.08:-d*.08))); packagingLine(pts,seam); }
  if (['tuck','hinged','self-locking','archive-lid','pizza-lid','mailer-lid'].includes(top)) {
    packagingAddTopLine(b.minX,b.minZ+w*0,b.maxX,b.minZ,topY+1.1,{...seam,dashed:true});
    packagingAddTopLine(b.minX+w*.12,b.maxZ-d*.08,b.maxX-w*.12,b.maxZ-d*.08,topY+1.1,seam);
    packagingAddTopLine(b.minX+w*.1,b.minZ,b.minX+w*.1,b.maxZ,topY+1.1,{...seam,opacity:.42}); packagingAddTopLine(b.maxX-w*.1,b.minZ,b.maxX-w*.1,b.maxZ,topY+1.1,{...seam,opacity:.42});
  }
  if (top === 'telescope') {
    const over=10; const y=topY+1.2; packagingLine([new THREE.Vector3(b.minX-over,y,b.minZ-over),new THREE.Vector3(b.maxX+over,y,b.minZ-over),new THREE.Vector3(b.maxX+over,y,b.maxZ+over),new THREE.Vector3(b.minX-over,y,b.maxZ+over),new THREE.Vector3(b.minX-over,y,b.minZ-over)],{...seam,opacity:.85});
  }
  if (top === 'sleeve') { packagingAddTopLine(b.minX+w*.16,b.minZ,b.minX+w*.16,b.maxZ,topY+1.1,seam); packagingAddTopLine(b.maxX-w*.16,b.minZ,b.maxX-w*.16,b.maxZ,topY+1.1,seam); }
  const bottomYLine=bottomY-1.1;
  if (['simple-flaps','folded-flaps'].includes(bottom)) cross(bottomYLine);
  if (bottom === 'full-overlap') { packagingAddTopLine(b.minX,cz-d*.18,b.maxX,cz-d*.18,bottomYLine,seam); packagingAddTopLine(b.minX,cz+d*.18,b.maxX,cz+d*.18,bottomYLine,seam); }
  if (['auto-lock','snap-lock','two-point-glued'].includes(bottom)) {
    packagingLine([new THREE.Vector3(b.minX,bottomYLine,b.minZ),new THREE.Vector3(cx,bottomYLine,cz),new THREE.Vector3(b.maxX,bottomYLine,b.minZ)],{...seam,dashed:true});
    packagingLine([new THREE.Vector3(b.minX,bottomYLine,b.maxZ),new THREE.Vector3(cx,bottomYLine,cz),new THREE.Vector3(b.maxX,bottomYLine,b.maxZ)],{...seam,dashed:true});
  }
  // Manufacturing seam / style-specific surface cues.
  if (['standard','full-overlap','auto-bottom','two-point-glued'].includes(state.boxType)) packagingLine([new THREE.Vector3(b.maxX+1,b.minY,b.minZ+w*.0),new THREE.Vector3(b.maxX+1,b.maxY,b.minZ)],{...seam,dashed:true,opacity:.42});
  if (state.boxType === 'sleeve-drawer') {
    packagingLine([new THREE.Vector3(b.minX+w*.08,b.minY+b.maxY*.13,b.maxZ+1),new THREE.Vector3(b.maxX-w*.08,b.minY+b.maxY*.13,b.maxZ+1)],seam);
    const pull=new THREE.EllipseCurve(cx,b.minY+b.maxY*.55,w*.08,Math.max(8,(b.maxY-b.minY)*.09),0,Math.PI,false,0); const points=pull.getPoints(24).map((p)=>new THREE.Vector3(p.x,p.y,b.maxZ+1.2)); packagingLine(points,seam);
  }
}
function toolTopDisplayY() {
  const b = boundsForBoxes(state.boxes);
  return b.maxY + (isLidLiftActive() ? LID_LIFT_MM : 0);
}
function toolBottomDisplayY() {
  return boundsForBoxes(state.boxes).minY;
}
function closurePivot(which) {
  const b = boundsForBoxes(state.boxes);
  const x = (b.minX + b.maxX) / 2;
  if (which === 'top') return new THREE.Vector3(x, toolTopDisplayY(), b.minZ);
  return new THREE.Vector3(x, toolBottomDisplayY(), b.maxZ);
}
function closureQuaternion(which, progress) {
  if (!progress) return new THREE.Quaternion();
  const angle = -CARDBOX_TOOL_LID_ANGLE * clamp(progress, 0, 1);
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
}
function captureToolBaseTransform(object) {
  if (object.userData.cardboxToolBaseTransform) return object.userData.cardboxToolBaseTransform;
  const base = {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  };
  object.userData.cardboxToolBaseTransform = base;
  return base;
}
function transformToolRenderable(object, which, progress) {
  const base = captureToolBaseTransform(object);
  object.position.copy(base.position);
  object.quaternion.copy(base.quaternion);
  if (!progress) return;
  const pivot = closurePivot(which);
  const rotation = closureQuaternion(which, progress);
  object.position.sub(pivot).applyQuaternion(rotation).add(pivot);
  object.quaternion.premultiply(rotation);
  object.updateMatrix();
}
function packagingDefaultLayers(construction = 'CO3', preset = 'TFT') {
  if (construction === 'CO5') {
    const outer = preset === 'TFT' ? 'testliner-natural' : 'white-top-testliner';
    const inner = preset === 'AFA' ? 'white-top-testliner' : 'testliner-natural';
    return [
      { role:'outer', paper:outer, gsm:200 },
      { role:'flute1', paper:'fluting', gsm:160 },
      { role:'middle', paper:preset === 'AFA' ? 'white-top-testliner' : 'testliner-natural', gsm:180 },
      { role:'flute2', paper:'fluting', gsm:160 },
      { role:'inner', paper:inner, gsm:200 },
    ];
  }
  if (preset === 'AFT') return [{ role:'outer',paper:'white-top-testliner',gsm:200 },{ role:'flute1',paper:'fluting',gsm:200 },{ role:'inner',paper:'testliner-natural',gsm:200 }];
  if (preset === 'AFA') return [{ role:'outer',paper:'white-top-testliner',gsm:200 },{ role:'flute1',paper:'fluting',gsm:180 },{ role:'inner',paper:'white-top-testliner',gsm:200 }];
  return [{ role:'outer',paper:'testliner-natural',gsm:180 },{ role:'flute1',paper:'fluting',gsm:160 },{ role:'inner',paper:'testliner-natural',gsm:180 }];
}
function packagingDefaultFeatures(typeId = 'standard') {
  const def = PACKAGING_BOX_TYPES[typeId] || PACKAGING_BOX_TYPES.standard;
  return {
    handleType: def.defaultHandle || 'none', handlePlacement:'front', handleWidth:120, handleHeight:35,
    holeType: def.defaultHoles || 'none', holePlacement:def.defaultHoles ? 'sides' : 'front', holeCount:def.defaultHoles ? 2 : 2, holeWidth:30, holeHeight:20,
  };
}
function ensurePackagingState() {
  if (!PACKAGING_BOX_TYPES[state.boxType]) state.boxType = 'standard';
  const def = PACKAGING_BOX_TYPES[state.boxType];
  if (!state.closures || typeof state.closures !== 'object') state.closures = { top:def.top, bottom:def.bottom };
  if (!def.topOptions.includes(state.closures.top)) state.closures.top = def.top;
  if (!def.bottomOptions.includes(state.closures.bottom)) state.closures.bottom = def.bottom;
  if (!state.features || typeof state.features !== 'object') state.features = packagingDefaultFeatures(state.boxType);
  state.features = { ...packagingDefaultFeatures(state.boxType), ...state.features };
  if (!state.board || typeof state.board !== 'object') state.board = { construction:'CO3', flute:'B', preset:'TFT', layers:packagingDefaultLayers('CO3','TFT') };
  if (!['CO3','CO5'].includes(state.board.construction)) state.board.construction = 'CO3';
  const validFlutes = state.board.construction === 'CO5' ? ['EB','BC'] : ['E','B','C'];
  if (!validFlutes.includes(state.board.flute)) state.board.flute = state.board.construction === 'CO5' ? 'EB' : 'B';
  if (!Array.isArray(state.board.layers) || state.board.layers.length !== (state.board.construction === 'CO5' ? 5 : 3)) state.board.layers = packagingDefaultLayers(state.board.construction, ['TFT','AFT','AFA'].includes(state.board.preset) ? state.board.preset : 'TFT');
  if (!state.board.preset) state.board.preset = 'TFT';
  state.boardThickness = PACKAGING_FLUTES[state.board.flute]?.thickness || 3;
  state.catalogSchemaVersion = PACKAGING_CATALOG_SCHEMA_VERSION;
}
function packagingPaperColor(layer, fallback = '#b88959') { return PACKAGING_PAPERS[layer?.paper]?.color || fallback; }
function packagingOuterColor() { ensurePackagingState(); return packagingPaperColor(state.board.layers[0]); }
function packagingInnerColor() { ensurePackagingState(); return packagingPaperColor(state.board.layers[state.board.layers.length - 1]); }
function ensureDecorationState() {
  if (!state.faceColors || typeof state.faceColors !== 'object') state.faceColors = { outer: {}, inner: {} };
  if (!state.faceColors.outer || typeof state.faceColors.outer !== 'object') state.faceColors.outer = {};
  if (!state.faceColors.inner || typeof state.faceColors.inner !== 'object') state.faceColors.inner = {};
  if (!Array.isArray(state.imagePlacements)) state.imagePlacements = [];
}
function surfaceColorSlot(face) { return `${face.axis}:${face.sign >= 0 ? '+' : '-'}`; }
function surfaceColorBucket(sideFactor) { return sideFactor >= 0 ? 'outer' : 'inner'; }
function defaultSurfaceColor(sideFactor) {
  try { return sideFactor >= 0 ? packagingOuterColor() : packagingInnerColor(); }
  catch { return DEFAULT_COLOR; }
}
function resolvedSurfaceColor(face, sideFactor = 1) {
  ensureDecorationState();
  const bucket = surfaceColorBucket(sideFactor);
  return state.faceColors[bucket][surfaceColorSlot(face)] || defaultSurfaceColor(sideFactor);
}
function packagingFaceMatchesPlacement(face, placement) {
  if (placement === 'lid') return face.axis === 'y' && face.sign > 0;
  if (!isVerticalFace(face)) return false;
  if (placement === 'all-sides') return true;
  if (placement === 'sides') return face.axis === 'x';
  return face.axis === 'z' && face.sign > 0;
}
function packagingRoundedRectPath(cx, cy, width, height, radius) {
  const p = new THREE.Path(); const x = cx - width/2, y = cy - height/2; const r = Math.min(radius, width/2, height/2);
  p.moveTo(x+r,y); p.lineTo(x+width-r,y); p.quadraticCurveTo(x+width,y,x+width,y+r); p.lineTo(x+width,y+height-r); p.quadraticCurveTo(x+width,y+height,x+width-r,y+height); p.lineTo(x+r,y+height); p.quadraticCurveTo(x,y+height,x,y+height-r); p.lineTo(x,y+r); p.quadraticCurveTo(x,y,x+r,y); return p;
}
function packagingFeatureHoles(face, width, height) {
  ensurePackagingState();
  const holes = [];
  const f = state.features;
  if (f.handleType !== 'none' && packagingFaceMatchesPlacement(face, f.handlePlacement)) {
    const w = Math.min(width * .72, Math.max(20, f.handleWidth)); const h = Math.min(height * .35, Math.max(10, f.handleHeight));
    holes.push({ path:packagingRoundedRectPath(0, isVerticalFace(face) ? height*.2 : 0, w, h, h*.48), reinforced:f.handleType === 'reinforced', cx:0, cy:isVerticalFace(face) ? height*.2 : 0, width:w, height:h });
  }
  if (f.holeType !== 'none' && packagingFaceMatchesPlacement(face, f.holePlacement)) {
    const count = Math.max(1, Math.min(12, Math.round(f.holeCount || 1))); const available = width * .7; const start = count === 1 ? 0 : -available/2; const step = count === 1 ? 0 : available/(count-1);
    for (let i=0;i<count;i+=1) {
      const cx = start + step*i; const cy = isVerticalFace(face) ? -height*.12 : 0;
      const w = Math.min(width*.3, Math.max(6, f.holeWidth)); const h = Math.min(height*.25, Math.max(6, f.holeHeight));
      if (f.holeType === 'round') { const p = new THREE.Path(); const r = Math.min(w,h)/2; p.absellipse(cx,cy,r,r,0,Math.PI*2,true); holes.push({path:p}); }
      else if (f.holeType === 'oval') { const p = new THREE.Path(); p.absellipse(cx,cy,w/2,h/2,0,Math.PI*2,true); holes.push({path:p}); }
      else holes.push({ path:packagingRoundedRectPath(cx,cy,w,h,h*.48) });
    }
  }
  return holes;
}
function applyFeaturesAndSurfaceColours() {
  ensurePackagingState();ensureDecorationState();clearGroup(packagingFeatureGroup);
  for(const mesh of surfaceMeshes){
    const face=mesh.userData?.face;if(!face||!mesh.geometry)continue;const sideFactor=Number(mesh.userData.surfaceSideFactor)||1;if(mesh.material?.color)mesh.material.color.set(resolvedSurfaceColor(face,sideFactor));
    const width=face.u2-face.u1,height=face.v2-face.v1;const features=packagingFeatureHoles(face,width,height);if(!features.length)continue;
    const shape=new THREE.Shape();shape.moveTo(-width/2,-height/2);shape.lineTo(width/2,-height/2);shape.lineTo(width/2,height/2);shape.lineTo(-width/2,height/2);shape.closePath();features.forEach((item)=>shape.holes.push(item.path));mesh.geometry.dispose?.();mesh.geometry=new THREE.ShapeGeometry(shape);
    if(sideFactor<0)continue;
    for(const item of features.filter((entry)=>entry.reinforced)){const curve=new THREE.EllipseCurve(item.cx,item.cy,item.width/2+5,item.height/2+5,0,Math.PI*2,false,0);const points=curve.getPoints(40).map((p)=>new THREE.Vector3(p.x,p.y,1));const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x7a542f,transparent:true,opacity:.75}));mesh.add(line);}
  }
}
}
