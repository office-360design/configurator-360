import * as THREE from 'three';
import { loadingLayout, storageRackLayout } from './logistics.js?v=hall-production-1';

function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .65, metalness: .15, ...extra }); }
function box(parent, name, x, y, z, px, py, pz, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), mat);
  mesh.name = name; mesh.position.set(px, py, pz);
  mesh.castShadow = !mat.transparent; mesh.receiveShadow = !mat.transparent;
  parent.add(mesh); return mesh;
}

/** Local +Y up, -Z exterior. Open panels are stowed horizontally INSIDE the hall. */
export function createSectionalDoorAssembly(opening, panelMat, frameMat, metalMat) {
  const { width, height, isOpen } = opening;
  const root = new THREE.Group(); root.name = 'sectional-loading-door-assembly';
  const sealMat = material('#242d33', { metalness: 0, roughness: .9 });
  const leaf = new THREE.Group(); leaf.name = 'sectional-door-moving-leaf'; root.add(leaf);
  const count = Math.max(4, Math.ceil(height / .5)), segmentHeight = height / count;
  for (let i = 0; i < count; i += 1) {
    box(leaf, `sectional-panel-${i}`, width - .10, segmentHeight - .009, .065, 0, (i + .5) * segmentHeight, 0, panelMat);
    if (i > 0) box(leaf, `sectional-panel-seal-${i}`, width - .11, .009, .048, 0, i * segmentHeight, 0, sealMat);
  }
  box(leaf, 'sectional-bottom-seal', width - .10, .045, .075, 0, .023, -.005, sealMat);
  box(leaf, 'sectional-door-handle', .32, .045, .065, 0, Math.min(1.05, height / 3), -.065, metalMat);
  if (isOpen) { leaf.rotation.x = Math.PI / 2; leaf.position.set(0, height + .24, .40); }
  for (const side of [-1, 1]) {
    box(root, `sectional-jamb-${side}`, .11, height + .18, .14, side * (width / 2 + .015), (height + .18) / 2, .035, frameMat);
    box(root, `sectional-inside-track-${side}`, .06, height + .08, .065, side * (width / 2 + .10), (height + .08) / 2, .26, metalMat);
    box(root, `sectional-overhead-track-${side}`, .06, .055, height + .65, side * (width / 2 + .10), height + .29, (height + .65) / 2 + .10, metalMat);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(side * (width / 2 + .10),height-.05,.26), new THREE.Vector3(side * (width / 2 + .10),height+.29,.26),new THREE.Vector3(side * (width / 2 + .10),height+.29,.60));
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve,12,.026,6,false),metalMat);
    rail.name = `sectional-track-curve-${side}`; root.add(rail);
  }
  box(root, 'sectional-head-seal', width + .13, .13, .13, 0, height + .035, .018, frameMat);
  return root;
}

// Numerals are actual geometry, so thumbnails, live rendering and exports agree.
const DIGITS = ['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
function numberPlate(parent, label, y) {
  const group = new THREE.Group(); group.name = `loading-bay-number-${label}`; group.position.set(0,y,-.02); parent.add(group);
  box(group,'loading-number-board',.95,.43,.045,0,0,0,material('#244b63'));
  const ink = material('#f3f5f5', { metalness: 0, roughness: .85 });
  const bars = { a:[.0,.13,.13,.024], b:[.075,.067,.023,.105], c:[.075,-.067,.023,.105], d:[0,-.13,.13,.024], e:[-.075,-.067,.023,.105], f:[-.075,.067,.023,.105], g:[0,0,.13,.024] };
  const chars = label.slice(-3);
  for (let index=0;index<chars.length;index+=1) for (const bar of DIGITS[Number(chars[index])] || '') {
    const [x,v,w,h]=bars[bar];
    // Front is -Z, hence invert X to keep numbers legible from outside.
    box(group,`digit-${index}-${bar}`,w,h,.006,-((index-(chars.length-1)/2)*.24+x),v,-.027,ink);
  }
}

function wallFrame(state, side, offset = 0, surface = .261) {
  const g = new THREE.Group();
  if (side==='front') g.position.set(offset,0,-state.length/2-surface);
  else if(side==='back'){g.position.set(offset,0,state.length/2+surface);g.rotation.y=Math.PI;}
  else if(side==='left'){g.position.set(-state.width/2-surface,0,offset);g.rotation.y=Math.PI/2;}
  else {g.position.set(state.width/2+surface,0,offset);g.rotation.y=-Math.PI/2;}
  return g;
}
function apronSurfaceY(distance, depth) { return .135 - .12 * Math.max(0,Math.min(1,distance/depth)); }

export function createLoadingDetails(state) {
  const root = new THREE.Group(); root.name='loading-logistics';
  const layout=loadingLayout(state);
  const concrete=material('#a9adb0',{metalness:0,roughness:.95});
  const paint=material('#f2c64b',{metalness:0,roughness:.9});
  const black=material('#293238',{metalness:0});
  if(state.loadingApron) for(const side of layout.sides) {
    const group=wallFrame(state,side,0,.175); group.name=`loading-apron-${side}`;root.add(group);
    const span=['front','back'].includes(side)?state.width:state.length;
    const geo=new THREE.BoxGeometry(span,.12,layout.depth);
    const pos=geo.getAttribute('position');
    for(let i=0;i<pos.count;i+=1){const z=pos.getZ(i)-layout.depth/2;pos.setXYZ(i,pos.getX(i),pos.getY(i)+apronSurfaceY(-z,layout.depth)-.06,z);}
    geo.computeVertexNormals();const apron=new THREE.Mesh(geo,concrete);apron.name='loading-apron-slab';apron.receiveShadow=true;group.add(apron);
  }
  for(const bay of layout.bays){
    const o=bay.opening, group=wallFrame(state,o.side,o.offset);group.name=`loading-bay-details-${o.id}`;root.add(group);
    if(bay.numberPlate) numberPlate(group,bay.number,o.height+.57);
    if(bay.protection) for(const side of [-1,1]) {
      const bollard=new THREE.Group();bollard.name=`loading-bollard-${side}`;bollard.position.set(side*(o.width/2+.36),state.loadingApron?apronSurfaceY(.8,layout.depth):0,-.75);group.add(bollard);
      box(bollard,'bollard-base-plate',.26,.028,.26,0,.014,0,black);
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.085,.085,1.05,12),paint);post.position.y=.545;post.castShadow=true;bollard.add(post);
      for(const y of [.36,.71]){const stripe=new THREE.Mesh(new THREE.CylinderGeometry(.087,.087,.14,12),black);stripe.position.y=y;bollard.add(stripe);}
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.085,12,8,0,Math.PI*2,0,Math.PI/2),paint);cap.position.y=1.07;bollard.add(cap);
    }
    if(bay.markings){
      const lineLength=layout.depth-1.5;
      for(const side of [-1,1]){
        const mesh=box(group,'loading-bay-guide-line',.10,.004,lineLength,side*(o.width/2+.42),apronSurfaceY(.8+lineLength/2+.086,layout.depth)+.004,-.8-lineLength/2,paint);
        mesh.rotation.x=-Math.atan(.12/layout.depth);mesh.castShadow=false;
      }
      box(group,'loading-bay-stop-line',o.width+.94,.004,.10,0,apronSurfaceY(1.1+.086,layout.depth)+.004,-1.1,paint).castShadow=false;
    }
  }
  return root;
}

export function populateStoragePlanning(racks, aisles, state) {
  const layout=storageRackLayout(state), steel=material('#35546b'), beam=material('#c77b38'), timber=material('#ab8054',{metalness:0});
  for(const [index,b] of layout.blocks.entries()){
    const block=new THREE.Group();block.name=`storage-rack-block-${index}`;block.position.set(b.x,0,b.z);racks.add(block);
    const bays=Math.max(1,Math.ceil(b.length/3)),step=b.length/bays;
    for(let i=0;i<=bays;i+=1) for(const sign of [-1,1])box(block,'storage-rack-upright',.07,b.height,.07,sign*(b.depth/2-.04),b.height/2,-b.length/2+i*step,steel);
    for(const fraction of [.20,.44,.68,.92]) {
      for(const sign of [-1,1])box(block,'storage-rack-beam',.07,.12,b.length,sign*(b.depth/2-.04),b.height*fraction,0,beam);
      box(block,'storage-rack-shelf',b.depth-.12,.05,b.length-.12,0,b.height*fraction+.04,0,timber);
    }
  }
  const zoneMat=new THREE.MeshBasicMaterial({color:0x419ab0,transparent:true,opacity:.15,depthWrite:false,side:THREE.DoubleSide});
  for(const z of layout.zones){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(z.width,z.length),zoneMat);mesh.name=z.name;mesh.rotation.x=-Math.PI/2;mesh.position.set(z.x,state.slab ? .139 : .014,z.z);mesh.renderOrder=1;aisles.add(mesh);}
  return layout;
}
