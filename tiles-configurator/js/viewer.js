import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS,TILES,CURBS,curbLayout } from './model.js';
export function createViewer(host){
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;host.append(renderer.domElement);
  const scene=new THREE.Scene();scene.background=new THREE.Color('#e6e9e5');
  const camera=new THREE.PerspectiveCamera(40,1,.01,200),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.04;controls.minDistance=.8;controls.maxDistance=200;
  scene.add(new THREE.HemisphereLight(0xffffff,0x859078,2.7));
  const sun=new THREE.DirectionalLight(0xfff2df,3.5);sun.position.set(-8,14,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-24;sun.shadow.camera.right=24;sun.shadow.camera.top=24;sun.shadow.camera.bottom=-24;sun.shadow.normalBias=.015;scene.add(sun);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#cbd0c4',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.16;ground.receiveShadow=true;scene.add(ground);
  let group=new THREE.Group(),dimensions=new THREE.Group(),state,top=false,showDimensions=true;scene.add(group,dimensions);
  const box=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
  // Seeded noise keeps concrete stable between rebuilds and avoids texture downloads.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(128,128);let seed=17;
  for(let i=0;i<pixels.data.length;i+=4){seed=(1664525*seed+1013904223)>>>0;const v=170+(seed%65);pixels.data.set([v,v,v,255],i);}ctx.putImageData(pixels,0,0);
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  const material=new THREE.MeshStandardMaterial({roughness:.95,bumpMap:texture,bumpScale:.0015});
  function clear(g){g.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.isSprite){o.material.map.dispose();o.material.dispose();}});g.clear();}
  function drawPieces(parts,height,colorFor,baseY){
    if(!parts.length)return;
    const mesh=new THREE.InstancedMesh(box,material,parts.length);
    parts.forEach((p,i)=>{dummy.position.set(p.x-state.length/2,baseY+height/2,p.z-state.width/2);dummy.scale.set(Math.max(.001,p.l-.003),height,Math.max(.001,p.w-.003));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);const c=colorFor(p,i),palette=COLORS[c],base=Array.isArray(palette)?palette[(i*7)%palette.length]:palette;const color=new THREE.Color(base);color.multiplyScalar(.94+((i*31)%13)/100);mesh.setColorAt(i,color);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;group.add(mesh);
  }
  function label(text,x,z){const c=document.createElement('canvas');c.width=512;c.height=100;const context=c.getContext('2d');context.fillStyle='rgba(255,255,255,.92)';context.fillRect(0,0,512,100);context.fillStyle='#294536';context.font='600 40px sans-serif';context.textAlign='center';context.fillText(text,256,64);const tex=new THREE.CanvasTexture(c);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false}));sprite.position.set(x,.15,z);sprite.scale.set(1.4,.28,1);dimensions.add(sprite);}
  function fit(){if(!state)return;const size=Math.max(state.length,state.width),distance=size*1.55/Math.min(1,camera.aspect);controls.target.set(0,0,0);camera.position.set(top?0:distance*.8,top?distance*1.5:distance,top?.001:distance);controls.update();}
  function rebuild(s,parts){const changed=!state||state.length!==s.length||state.width!==s.width;state=s;clear(group);clear(dimensions);
    const t=TILES[s.tile],base=new THREE.Mesh(box,new THREE.MeshStandardMaterial({color:'#877b69',roughness:1}));base.scale.set(s.length,.13,s.width);base.position.y=-.065;base.receiveShadow=true;group.add(base);
    drawPieces(parts,t.thickness,p=>p.accent?s.accent:s.color,0);
    const curb=CURBS[s.curb];drawPieces(curbLayout(s),curb.height,()=>s.curbColor,t.thickness+.035-curb.height);
    label(`${s.length.toFixed(2)} m`,0,-s.width/2-.45);label(`${s.width.toFixed(2)} m`,s.length/2+.8,0);dimensions.visible=showDimensions;
    if(changed)fit();
  }
  // Dispose the unique bedding material before replacing the group.
  function releaseBase(){group.children.filter(o=>o.isMesh&&!o.isInstancedMesh).forEach(o=>o.material.dispose());}
  const resize=()=>{const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();fit();};new ResizeObserver(resize).observe(host);resize();
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  return {rebuild(s,p){releaseBase();rebuild(s,p);},cycleCamera(){top=!top;fit();return top;},toggleDimensions(){showDimensions=!showDimensions;dimensions.visible=showDimensions;return showDimensions;},setDarkMode(dark){scene.background.set(dark?'#242c30':'#e6e9e5');ground.material.color.set(dark?'#3a453d':'#cbd0c4');}};
}
