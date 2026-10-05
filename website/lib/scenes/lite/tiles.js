// Extracted from tiles-configurator/js/viewer.js at 05329b7.
// Original stone, fragment, curb and house rendering; website owns the renderer.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stoneAppearance } from '../../../../tiles-configurator/js/stoneAppearance.js';
import { houseGeometry } from '../../../../tiles-configurator/js/house.js';
import { clipRect,polygonArea } from '../../../../tiles-configurator/js/area.js';
import { COLORS,TILES,CURBS,curbLayout,areaGeometry,normalize,layout } from '../../../../tiles-configurator/js/model.js';
export function previewState(input){return normalize({...input,length:Math.min(4,Math.max(1,Number(input.length))),width:Math.min(3,Math.max(1,Number(input.width))),shape:'rectangle',houseEnabled:input.houseEnabled==='yes',houseLength:Number(input.houseLength)||1.5,houseWidth:Number(input.houseWidth)||1,houseHeight:1.2,houseX:.5,houseZ:.5,houseWingWidth:.6,houseWingDepth:.5,houseRotation:Number(input.houseRotation)||0,color:({'#969a98':'grey','#a65343':'red','#414748':'charcoal'})[input.colour]||'grey',curb:'garden',edges:input.curbs==='yes'?[true,true,true,true]:[false,false,false,false]});}
export function buildModel(input){
  const s=previewState(input),parts=layout(s),group=new THREE.Group(),dimensions=new THREE.Group();
  let bounds;
  const box=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
  // Same LCG bytes as the original CanvasTexture, without a DOM dependency.
  const pixels=new Uint8Array(128*128*4);let seed=17;
  for(let i=0;i<pixels.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const v=170+(seed%65);pixels.set([v,v,v,255],i);}
  const texture=new THREE.DataTexture(pixels,128,128);texture.needsUpdate=true;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.flipY=true;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  const material=new THREE.MeshStandardMaterial({roughness:.95,bumpMap:texture,bumpScale:.0015});
  const clear=g=>g.clear();
  function drawPieces(parts, height, colorFor, baseY) {
    if (!parts.length) return;
    const mesh = new THREE.InstancedMesh(box, material, parts.length);
    parts.forEach((p, i) => {
      dummy.position.set(p.x - bounds.width / 2, baseY + height / 2, p.z - bounds.depth / 2);
      dummy.scale.set(Math.max(0.001, p.l - 0.003), height, Math.max(0.001, p.w - 0.003));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const appearance = stoneAppearance(p, COLORS[colorFor(p, i)]);
      const color = new THREE.Color(appearance.base);
      color.multiplyScalar(appearance.brightness);
      mesh.setColorAt(i, color);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  function prism(polygon, height, baseY) {
    const shape = new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(-bounds.width / 2, baseY, -bounds.depth / 2);
    return geometry;
  }
  function drawPolygons(items, height, baseY) {
    if (!items.length) return;
    const geometries = [];
    for (const { polygon, color, stone } of items) {
      if (polygon.length < 3 || polygonArea(polygon) < 1e-9) continue;
      const geometry = prism(polygon, height, baseY),
        appearance = stoneAppearance(stone, COLORS[color]);
      const shade = new THREE.Color(appearance.base);
      shade.multiplyScalar(appearance.brightness);
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([shade.r, shade.g, shade.b], i);
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(geometry);
    }
    if (!geometries.length) return;
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    const mat = material.clone();
    mat.vertexColors = true;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  function rebuild(s, parts) {
    const nextBounds = areaGeometry(s);

    bounds = nextBounds;
    clear(group);
    clear(dimensions);
    const t = TILES[s.tile],
      base = new THREE.Mesh(
        prism(bounds.points, 0.13, -0.13),
        new THREE.MeshStandardMaterial({ color: '#877b69', roughness: 1 }),
      );
    base.receiveShadow = true;
    group.add(base);
    drawPieces(
      parts.filter((p) => !p.fragments),
      t.thickness,
      (p) => (p.accent ? s.accent : s.color),
      0,
    );
    const cuts = [];
    parts.forEach((p) => {
      for (const fragment of p.fragments || []) {
        const polygon = p.profile
          ? fragment.map((v) => ({ x: p.x + (v.x - p.x) * 0.985, z: p.z + (v.z - p.z) * 0.985 }))
          : clipRect(
              fragment,
              p.x - p.l / 2 + 0.0015,
              p.z - p.w / 2 + 0.0015,
              Math.max(0.001, p.l - 0.003),
              Math.max(0.001, p.w - 0.003),
            );
        cuts.push({ polygon, color: p.accent ? s.accent : s.color, stone: p });
      }
    });
    drawPolygons(cuts, t.thickness, 0);
    const curb = CURBS[s.curb],
      curbs = curbLayout(s);
    drawPieces(
      curbs.filter((p) => !p.polygon && !p.fragments),
      curb.height,
      () => s.curbColor,
      t.thickness + 0.035 - curb.height,
    );
    drawPolygons(
      curbs
        .flatMap((p) =>
          (p.fragments || (p.polygon ? [p.polygon] : [])).map((polygon) => ({ polygon, stone: p })),
        )
        .map((p) => {
          const cx = p.polygon.reduce((a, v) => a + v.x, 0) / p.polygon.length,
            cz = p.polygon.reduce((a, v) => a + v.z, 0) / p.polygon.length;
          return {
            polygon: p.polygon.map((v) => ({
              x: cx + (v.x - cx) * 0.996,
              z: cz + (v.z - cz) * 0.996,
            })),
            color: s.curbColor,
            stone: p.stone,
          };
        }),
      curb.height,
      t.thickness + 0.035 - curb.height,
    );
    if (s.houseEnabled) {
      const house = houseGeometry(s);
      const walls = new THREE.Mesh(
        prism(house.outline, s.houseHeight, t.thickness),
        new THREE.MeshStandardMaterial({ color: '#e5ded0', roughness: 0.9 }),
      );
      walls.userData.house = true;
      walls.castShadow = true;
      walls.receiveShadow = true;
      group.add(walls);
      const roof = new THREE.Mesh(
        prism(house.outline, 0.12, t.thickness + s.houseHeight),
        new THREE.MeshStandardMaterial({ color: '#4c555a', roughness: 0.85 }),
      );
      roof.userData.house = true;
      roof.castShadow = true;
      roof.receiveShadow = true;
      group.add(roof);
    }

  }
  rebuild(s,parts);
  return {group,metrics:{area:parts.reduce((sum,p)=>sum+(p.area??p.l*p.w),0),pieces:parts.length},cleanup:()=>{box.dispose();material.dispose();texture.dispose();}};
}
