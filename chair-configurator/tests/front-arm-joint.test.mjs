// Run from the repository root: node --test chair-configurator/tests/front-arm-joint.test.mjs
// Offline: uses the Chair's own vendored engine and the actual shared geometry library.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../lib/three.module.js';
import { GeometryLibrary } from '../../shared-3d/src/geometry/GeometryLibrary.js';
import { createChairModel } from '../js/chairGeometry.js';
import { createFrontArmJoint, FRONT_ARM_JOINT_VERSION } from '../js/frontArmJoint.js';

const args = x => ({ x, frontZ: .224, floorY: .03, postTopY: .588,
  armStart: [x, .572, .220], armEnd: [x, .676, -.208] });
const close = (actual, expected, epsilon = 3e-7) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const key = p => p.map(v => Math.round(v * 1e7)).join(',');
const point = (attribute, i) => [attribute.getX(i), attribute.getY(i), attribute.getZ(i)];
function boundary(geometry) {
  const { planePoint, planeNormal } = geometry.userData.frontArmJoint;
  const positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const result = new Map();
  for (let i = 0; i < positions.count; i++) {
    const p = point(positions, i);
    const d = p.reduce((sum, v, a) => sum + (v - planePoint[a]) * planeNormal[a], 0);
    if (Math.abs(d) < 3e-7) result.set(key(p), { position: p, normal: point(normals, i) });
  }
  return result;
}
function edges(geometries) {
  const result = new Map();
  for (const geometry of geometries) {
    const a = geometry.attributes.position;
    for (let i = 0; i < a.count; i += 3) {
      const ids = [key(point(a,i)),key(point(a,i+1)),key(point(a,i+2))];
      for (let j = 0; j < 3; j++) {
        const from = ids[j], to = ids[(j+1)%3];
        const k = [from,to].sort().join('|');
        const entry = result.get(k) ?? { count: 0, winding: 0 };
        entry.count++; entry.winding += from < to ? 1 : -1;
        result.set(k,entry);
      }
    }
  }
  return result;
}
for (const [name,x] of [['left',-.262],['right',.262]]) {
  test(`${name}: two matching boundaries; no open gap or duplicate mating faces`, () => {
    const {postGeometry:p,armGeometry:a} = createFrontArmJoint(THREE,args(x));
    const bp=boundary(p),ba=boundary(a);
    assert.equal(bp.size,28); assert.equal(ba.size,bp.size);
    for(const [id,entry] of bp) assert.deepEqual(ba.get(id),entry,'Identical packed positions AND shading normals');
    for(const geometry of [p,a]) {
      assert.equal(geometry.userData.frontArmJoint.matingFacesRendered,false);
      const position=geometry.attributes.position;
      for(let i=0;i<position.count;i+=3) {
        assert.ok(![i,i+1,i+2].every(j=>bp.has(key(point(position,j)))), 'No triangle is drawn in the internal mating plane');
      }
    }
    p.dispose();a.dispose();
  });
  test(`${name}: arm and post remain in opposite half-spaces (no intersecting outer skins)`, () => {
    const {postGeometry:p,armGeometry:a}=createFrontArmJoint(THREE,args(x));
    for(const [geometry,sign] of [[p,-1],[a,1]]) {
      const {planePoint,planeNormal}=geometry.userData.frontArmJoint;
      const pos=geometry.attributes.position;
      for(let i=0;i<pos.count;i++) {
        const d=point(pos,i).reduce((s,v,k)=>s+(v-planePoint[k])*planeNormal[k],0);
        assert.ok(d*sign>=-3e-7,`Crossed mating plane by ${d}`);
      }
    }
    p.dispose();a.dispose();
  });
  test(`${name}: the joined exterior is watertight with consistently wound edges`, () => {
    const {postGeometry:p,armGeometry:a}=createFrontArmJoint(THREE,args(x));
    const all=edges([p,a]);
    for(const [edge,value] of all) {
      assert.equal(value.count,2,`Open edge / duplicate face: ${edge}`);
      assert.equal(value.winding,0,`Incorrect winding: ${edge}`);
    }
    p.dispose();a.dispose();
  });
  test(`${name}: finite positions/UVs, unit normals and non-degenerate triangles`, () => {
    const joint=createFrontArmJoint(THREE,args(x));
    for(const g of [joint.postGeometry,joint.armGeometry]) {
      for(const attr of Object.values(g.attributes)) assert.ok(attr.array.every(Number.isFinite));
      const pos=g.attributes.position,n=g.attributes.normal;
      for(let i=0;i<n.count;i++) close(Math.hypot(...point(n,i)),1,1e-5);
      for(let i=0;i<pos.count;i+=3) {
        const a=new THREE.Vector3(...point(pos,i)),b=new THREE.Vector3(...point(pos,i+1)),c=new THREE.Vector3(...point(pos,i+2));
        const face=b.sub(a).cross(c.sub(a));
        assert.ok(face.lengthSq()>1e-22,'Zero-area triangle');
        const average=new THREE.Vector3(...point(n,i)).add(new THREE.Vector3(...point(n,i+1))).add(new THREE.Vector3(...point(n,i+2)));
        assert.ok(face.dot(average)>0,'Normals must agree with winding');
      }
      g.dispose();
    }
  });
}
test('complete chair has no bridge/filler meshes and retains both legs and arms',()=>{
  const library=new GeometryLibrary(THREE);
  const wood=new THREE.MeshStandardMaterial(),fabric=new THREE.MeshStandardMaterial();
  const model=createChairModel(THREE,library,{woodMaterial:wood,fabricMaterial:fabric});
  assert.equal(model.group.children.length,18);
  assert.equal(model.woodMeshes.filter(m=>m.name==='front-leg').length,2);
  assert.equal(model.woodMeshes.filter(m=>m.name==='arm-rail').length,2);
  assert.ok(model.group.children.every(m=>!m.name.includes('filler')&&!m.name.includes('bridge')));
  assert.equal(model.group.userData.frontJointVersion,FRONT_ARM_JOINT_VERSION);
  assert.ok(model.woodMeshes.every(m=>m.material===wood));
  assert.ok(model.fabricMeshes.every(m=>m.material===fabric));
  assert.equal(wood.polygonOffset,false);assert.equal(wood.depthTest,true);assert.equal(wood.depthWrite,true);
  library.dispose();wood.dispose();fabric.dispose();
});
test('all four flat foot faces still meet the ground',()=>{
  const library=new GeometryLibrary(THREE);
  const material=new THREE.MeshStandardMaterial();
  const {group}=createChairModel(THREE,library,{woodMaterial:material,fabricMaterial:material});
  group.updateMatrixWorld(true);
  const feet=group.children.filter(m=>['front-leg','rear-upright'].includes(m.name));
  assert.equal(feet.length,4);
  for(const mesh of feet) {
    const p=mesh.geometry.attributes.position, n=mesh.geometry.attributes.normal;
    let flatVertices=0;
    for(let i=0;i<p.count;i++) {
      const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);
      assert.ok(v.y>=-1e-7);
      if(n.getY(i)<-.99999) {close(v.y,0);flatVertices++;}
    }
    assert.ok(flatVertices>=3,'Foot cap missing');
  }
  library.dispose();material.dispose();
});
test('joint generation is deterministic and mirrored front members match',()=>{
  const left=createFrontArmJoint(THREE,args(-.262)),right=createFrontArmJoint(THREE,args(.262));
  const repeat=createFrontArmJoint(THREE,args(.262));
  for(const part of ['postGeometry','armGeometry']) {
    for(const name of ['position','normal','uv']) assert.deepEqual(right[part].attributes[name].array,repeat[part].attributes[name].array);
    const l=left[part].attributes.position,r=right[part].attributes.position;
    for(let i=0;i<l.count;i++){close(l.getX(i)+.524,r.getX(i));close(l.getY(i),r.getY(i));close(l.getZ(i),r.getZ(i));}
    left[part].dispose();right[part].dispose();repeat[part].dispose();
  }
});
test('wood coordinates follow each actual piece without a UV reset at the easing rings',()=>{
  const {postGeometry:p,armGeometry:a}=createFrontArmJoint(THREE,args(.262));
  const axis=new THREE.Vector3(0,.104,-.428).normalize();
  const center=new THREE.Vector3(.262,.572,.220).add(new THREE.Vector3(.262,.676,-.208).addScaledVector(axis,.014)).multiplyScalar(.5);
  for(const [geometry,role] of [[p,'post'],[a,'arm']]) {
    const pos=geometry.attributes.position,uv=geometry.attributes.uv;
    const sideCount=pos.count-28*3; // Exclude the single external cap.
    for(let i=0;i<sideCount;i++) {
      const v=new THREE.Vector3().fromBufferAttribute(pos,i);
      const u=role==='post'?v.y-(.03+.588)/2:v.sub(center).dot(axis);
      close(uv.getX(i),u);
    }
  }
  p.dispose();a.dispose();
});
test('fitted geometry resources are released through the shared library',()=>{
  const library=new GeometryLibrary(THREE);const mat=new THREE.MeshStandardMaterial();
  for(let i=0;i<3;i++) {
    const model=createChairModel(THREE,library,{woodMaterial:mat,fabricMaterial:mat});
    assert.equal(library.geometries.size,18);
    for(const mesh of model.group.children) mesh.geometry.dispose();
    assert.equal(library.geometries.size,0);
  }
  library.dispose();mat.dispose();
});
test('malformed front-joint specifications fail instead of producing NaNs',()=>{
  const valid=args(.262);
  for(const overrides of [{width:0},{frontZ:NaN},{armStart:[1,2]},{armEnd:[1,2,3]},{segments:0}]) {
    assert.throws(()=>createFrontArmJoint(THREE,{...valid,...overrides}));
  }
});
