import * as THREE from 'three';
import { productionLayout } from './production.js?v=hall-production-1';
import { hallT, resolveHallLocale } from './i18n.js?v=hall-production-1';

function mat(color, options = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .58, metalness: .22, ...options }); }
function box(parent, name, w, h, d, x, y, z, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
function cylinder(parent, name, radius, length, x, y, z, material, alongZ = false) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
  if (alongZ) mesh.rotation.x = Math.PI / 2;
  mesh.name = name; mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function arrow(parent, name, x, y, z, direction, material, scale = 1) {
  const s = new THREE.Shape();
  s.moveTo(-.12,-.7);s.lineTo(.12,-.7);s.lineTo(.12,.05);s.lineTo(.40,.05);
  s.lineTo(0,.65);s.lineTo(-.40,.05);s.lineTo(-.12,.05);s.closePath();
  const geo = new THREE.ShapeGeometry(s);geo.rotateX(Math.PI/2);
  const mesh=new THREE.Mesh(geo,material);mesh.name=name;mesh.position.set(x,y,z);
  mesh.rotation.y=direction===1?0:Math.PI;mesh.scale.setScalar(scale);parent.add(mesh);return mesh;
}

function labelMaterial(key, locale) {
  const material = mat('#1a3644', { metalness: 0, roughness: .8 });
  if (typeof document === 'undefined') return material;
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
  const ctx=canvas.getContext('2d'); if (!ctx) return material;
  ctx.fillStyle='#1a3644';ctx.fillRect(0,0,768,128);ctx.fillStyle='#f3f6f7';ctx.textAlign='center';ctx.textBaseline='middle';
  const text=hallT(locale,key);let size=54;
  do {ctx.font=`700 ${size}px sans-serif`;if(ctx.measureText(text).width<720)break;size-=2;}while(size>24);
  ctx.fillText(text,384,68);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  material.map=texture;material.color.set('#ffffff');return material;
}
export function refreshProductionLabels(root, locale) {
  root?.traverse(object=>{
    if(!object.userData.productionLabelKey)return;
    object.material.map?.dispose();object.material.dispose();object.material=labelMaterial(object.userData.productionLabelKey,locale);
  });
}
function label(parent, key, x, y, z, width, height, rotationY = 0) {
  const face=new THREE.Mesh(new THREE.PlaneGeometry(width,height),labelMaterial(key,typeof window === 'undefined' ? 'en-US' : resolveHallLocale()));
  face.name=key;face.position.set(x,y,z);face.rotation.y=rotationY;
  face.userData.productionLabelKey=key;parent.add(face);return face;
}

function createMachine(item, materials) {
  const { steel, light, dark, teal, glass, yellow }=materials;
  const g=new THREE.Group();g.name=item.id;g.userData.productionKind='machine';
  box(g,'machine-plinth',2.65,.18,3.12,0,.14,0,dark);
  for(const x of [-1.0,1.0])for(const z of [-1.15,1.15])cylinder(g,'machine-level-foot',.10,.09,x,.045,z,steel);
  // Sheet-metal enclosure with a real open inspection face towards the through aisle (+X).
  box(g,'machine-rear-casing',.12,2.12,2.85,-1.15,1.30,0,light);
  for(const sign of [-1,1])box(g,'machine-side-casing',2.1,2.12,.12,-.15,1.30,sign*1.37,light);
  box(g,'machine-roof',2.30,.13,2.94,-.12,2.32,0,teal);
  box(g,'machine-lower-front',.12,.65,2.85,.94,.565,0,teal);
  box(g,'machine-window',.025,1.22,2.48,1.007,1.58,0,glass);
  for(const y of [.93,2.23])box(g,'machine-window-horizontal-trim',.11,.06,2.78,1.02,y,0,steel);
  for(const z of [-1.33,0,1.33])box(g,'machine-window-vertical-trim',.11,1.28,.055,1.02,1.58,z,steel);
  box(g,'machine-bed',1.75,.15,2.15,-.09,.94,0,steel);
  for(let i=0;i<6;i++)box(g,'machine-bed-slot',1.5,.02,.018,0,1.027,-.8+i*.32,dark);
  box(g,'machine-workpiece',.65,.18,.75,.17,1.1,0,light);
  box(g,'machine-tool-column',.20,1.13,.30,-.57,1.59,.20,steel);
  box(g,'machine-tool-arm',.90,.20,.36,-.20,2.02,.20,teal);
  cylinder(g,'machine-tool-head',.11,.35,.14,1.75,.20,dark);
  box(g,'machine-control-post',.12,.72,.12,1.18,.65,1.06,steel);
  box(g,'machine-control-console',.25,.72,.50,1.22,1.27,1.06,dark);
  box(g,'machine-control-screen',.014,.26,.33,1.355,1.41,1.06,glass);
  box(g,'machine-control-buttons',.018,.06,.23,1.36,1.12,1.06,yellow);
  box(g,'machine-guard-marking',.015,.085,2.55,1.009,.81,0,yellow);
  return g;
}
function createWorkbench(item, materials) {
  const {steel,light,dark,timber,yellow,teal}=materials;
  const g=new THREE.Group();g.name=item.id;g.userData.productionKind=item.kind;
  for(const x of [-.70,.70])for(const z of [-1.08,1.08])box(g,'workbench-leg',.08,.83,.08,x,.46,z,steel);
  box(g,'workbench-top',1.75,.10,2.5,0,.94,0,timber);
  box(g,'workbench-low-shelf',1.45,.05,2.15,0,.33,0,light);
  box(g,'workbench-cabinet',.60,.55,.7,.35,.635,.6,teal);
  for(let i=0;i<3;i++)box(g,'workbench-drawer-pull',.018,.025,.30,.034,.48+i*.16,.6,steel);
  if(item.kind==='packing'){
    for(const z of [-.6,.25]){
      box(g,'packing-carton',.7,.45,.55,0,1.215,z,timber);
      box(g,'packing-tape-strip',.10,.006,.56,0,1.443,z,yellow);
    }
    box(g,'packing-label-printer',.35,.20,.32,.50,1.08,-.85,dark);
  } else if(item.kind==='inspection'){
    box(g,'inspection-surface',1.0,.06,1.15,-.05,1.02,-.3,light);
    box(g,'inspection-gauge-column',.055,.52,.06,.5,1.29,-.3,steel);
    box(g,'inspection-gauge-arm',.6,.055,.06,.22,1.55,-.3,steel);
    box(g,'inspection-gauge-probe',.025,.24,.025,-.05,1.42,-.3,dark);
    box(g,'inspection-monitor-stand',.045,.30,.045,.40,1.18,.77,steel);
    box(g,'inspection-monitor',.05,.38,.55,.42,1.44,.77,dark);
  } else {
    box(g,'assembly-tool-board',.06,.60,2.1,.80,1.30,0,teal);
    for(let i=0;i<6;i++)box(g,'assembly-hanging-tool',.07,.25,.065,.745,1.32,-.8+i*.3,steel);
    for(let i=0;i<3;i++)box(g,'assembly-parts-bin',.30,.16,.30,.05,1.06,-.7+i*.65,light);
    box(g,'assembly-workpiece',.50,.08,.4,-.37,1.06,.40,dark);
  }
  return g;
}
function createStaging(item,materials){
  const {timber,steel,light,teal,yellow}=materials;
  const g=new THREE.Group();g.name=item.id;g.userData.productionKind=item.kind;
  for(const z of [-.94,.94]){
    for(const x of [-.65,0,.65])box(g,'stock-pallet-runner',.15,.12,1.2,x,.08,z,timber);
    for(let i=0;i<7;i++)box(g,'stock-pallet-deck',1.8,.05,.15,0,.165,z-.50+i/6,timber);
    if(item.kind==='raw'){
      for(let level=0;level<4;level++)for(let row=0;row<3;row++)box(g,'raw-material-bundle',1.68,.16,.26,0,.3+level*.17,z-.31+row*.31,steel);
      for(const x of [-.5,.5])box(g,'raw-material-band',.035,.68,1.01,x,.56,z,teal);
    }else{
      box(g,'finished-goods-crate',1.55,1.05,1.1,0,.725,z,light);
      for(const x of [-.5,.5])box(g,'finished-goods-strap',.035,1.065,1.12,x,.725,z,teal);
      box(g,'finished-goods-label',.016,.15,.30,-.784,.85,z,yellow);
    }
  }
  return g;
}
function border(parent,item,y,material){
  const w=.055;
  for(const sign of [-1,1]){
    box(parent,'production-zone-border',w,.006,item.length,item.x+sign*item.width/2,y,item.z,material).castShadow=false;
    box(parent,'production-zone-border',item.width,.006,w,item.x,y,item.z+sign*item.length/2,material).castShadow=false;
  }
}

export function createProductionDetails(state) {
  const layout=productionLayout(state),fitout=new THREE.Group(),services=new THREE.Group();
  fitout.name='production-fitout';services.name='service-production';
  if(!layout.active)return {fitout,services,layout};
  const floor=state.slab?.valueOf() ? .135 : 0;
  const materials={steel:mat('#657984',{metalness:.65,roughness:.38}),light:mat('#d9e1e3'),dark:mat('#263741'),
    teal:mat('#327b82'),yellow:mat('#e7b943'),timber:mat('#c49b68',{metalness:0}),
    glass:mat('#628998',{transparent:true,opacity:.55,depthWrite:false,metalness:.04,roughness:.2})};
  for(const item of [...layout.machines,...layout.benches,...layout.staging]){
    const group=item.kind==='machine'?createMachine(item,materials):['raw','finished'].includes(item.kind)?createStaging(item,materials):createWorkbench(item,materials);
    group.position.set(item.x,floor,item.z);fitout.add(group);
  }
  const paint = new THREE.MeshBasicMaterial({ color: '#e9bc48', side: THREE.DoubleSide });
  if(state.productionMarkings && layout.available){
    for(const zone of layout.zones){
      const material=new THREE.MeshBasicMaterial({color:zone.kind==='pedestrian'?'#2d9290':'#b3bbba',transparent:true,opacity:zone.kind==='pedestrian'?.42:.12,depthWrite:false,side:THREE.DoubleSide});
      const plane=new THREE.Mesh(new THREE.PlaneGeometry(zone.width,zone.length),material);
      plane.name=zone.id;plane.rotation.x=-Math.PI/2;plane.position.set(zone.x,floor+.007,zone.z);plane.renderOrder=1;fitout.add(plane);
      if(zone.kind==='flow'){
        for(const sign of [-1,1])box(fitout,'production-through-aisle-edge',.07,.004,zone.length,zone.x+sign*zone.width/2,floor+.012,0,paint).castShadow=false;
        for(let z=-state.length/2+4;z<state.length/2-3;z+=4)arrow(fitout,'production-flow-arrow',zone.x,floor+.015,z,layout.direction,paint,1.25);
      }
      if(zone.kind==='crosswalk')for(let x=-state.width/2+1.3;x<state.width/2-1;x+=.75)box(fitout,'production-crosswalk-stripe',.34,.004,zone.length,x,floor+.014,zone.z,paint).castShadow=false;
    }
    for(const item of [...layout.machines,...layout.benches,...layout.staging])border(fitout,item,floor+.014,paint);
  }
  if(state.productionMarkings) for(const gate of layout.gates){
    if(!gate.signAvailable)continue;
    const o=gate.opening,g=new THREE.Group();g.name=`production-gate-sign-${gate.role}`;
    g.position.set(o.offset,o.height+.56,o.side==='front'?-state.length/2-.20:state.length/2+.20);
    if(o.side==='back')g.rotation.y=Math.PI;
    box(g,'production-flow-sign-board',Math.min(3.9,o.width),.48,.055,0,0,0,materials.teal);
    label(g,`production.sign.${gate.role}`,0,0,-.031,Math.min(3.75,o.width-.10),.43,Math.PI);fitout.add(g);
  }
  for(const run of layout.utilityRuns){
    const g=new THREE.Group();g.name=run.id;g.position.set(run.x,run.y,0);services.add(g);
    // Cable tray and compressed-air main: indicative routes, not connected/sized utilities.
    for(const x of [-.2,.2])box(g,'production-cable-tray-rail',.035,.15,run.length,x,0,0,materials.steel);
    for(let z=-run.length/2;z<=run.length/2;z+=.55)box(g,'production-cable-tray-rung',.40,.025,.035,0,-.06,z,materials.steel);
    cylinder(g,'production-air-main',.027,run.length,.4,-.20,0,materials.teal,true);
    for(let z=-run.length/2+.8;z<run.length/2;z+=4.5){
      const hangerLength=Math.max(.25,state.eaveHeight-run.y-.3);
      box(g,'production-tray-hanger',.025,hangerLength,.025,0,hangerLength/2,z,materials.steel);
    }
    for(const item of run.drops){
      const dropHeight=run.y-1.45;
      const edgeX=item.kind==='machine'?-item.width/2+.15:item.width/2-.15;
      box(g,'production-air-branch',Math.abs(edgeX-.4),.04,.04,(edgeX+.4)/2,-.20,item.z,materials.teal);
      cylinder(g,'production-air-drop',.020,dropHeight,edgeX,-.20-dropHeight/2,item.z,materials.teal);
      box(g,'production-service-pedestal',.20,1.25,.20,edgeX,floor+.625-run.y,item.z,materials.steel);
      box(g,'production-service-outlets',.22,.18,.23,edgeX,1.2-run.y,item.z,materials.yellow);
    }
  }
  return {fitout,services,layout};
}
