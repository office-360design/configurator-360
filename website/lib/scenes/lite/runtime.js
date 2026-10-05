import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const loaders = {
  chair: () => import('./chair.js'), cardbox: () => import('./cardbox.js'),
  bookshelf: () => import('./bookshelf.js'), tiles: () => import('./tiles.js'),
};
let renderer;
let releaseActive;
let lease = 0;
let idleDisposal;

export function disposeModel(model) {
  if (!model) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  model.group.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m));
    if (object.isInstancedMesh) object.dispose();
  });
  materials.forEach(m => { Object.values(m).forEach(v => { if (v?.isTexture) textures.add(v); }); m.dispose(); });
  geometries.forEach(g => g.dispose()); textures.forEach(t => t.dispose());
  model.cleanup?.();
}

// All four website previews lease one canvas. Inactive scenes release their GPU data;
// their small input state stays in React. No app iframe, auth, maps or product startup.
export async function mountPreview(host, slug, initialState, callbacks) {
  const ticket = ++lease;
  const {buildModel,prepare} = await loaders[slug]();
  if (!host.isConnected || callbacks.cancelled() || ticket !== lease) return null;
  clearTimeout(idleDisposal);
  releaseActive?.();
  renderer ??= new THREE.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
  const canvas = renderer.domElement;
  host.append(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = slug==='cardbox' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new THREE.Scene();
  // Cardbox's production lighting has no filmic tone mapping or warm key tint.
  const nativeBox=slug==='cardbox';
  scene.add(new THREE.HemisphereLight(0xffffff,nativeBox?0x8a979f:0x667489,nativeBox?2.1:1.7));
  const key = new THREE.DirectionalLight(nativeBox?0xffffff:0xfff4e4,nativeBox?2.7:3); key.position.set(...(nativeBox?[.9,1.1,.62]:[3,5,4])); scene.add(key);
  const fill = new THREE.DirectionalLight(nativeBox?0xb8dbf1:0xbcdcff,1.1); fill.position.set(...(nativeBox?[-.7,.5,-.5]:[-4,2,-2])); scene.add(fill);
  // Soft grounding without shadow-map passes or a continuous render loop.
  const shadowPixels = new Uint8Array(64*64*4);
  for(let y=0;y<64;y++) for(let x=0;x<64;x++) {
    const i=(y*64+x)*4,r=((x-31.5)/31.5)**2+((y-31.5)/31.5)**2;
    shadowPixels[i+3]=Math.max(0,1-r)**3*90;
  }
  const shadowTexture=new THREE.DataTexture(shadowPixels,64,64);shadowTexture.needsUpdate=true;shadowTexture.magFilter=THREE.LinearFilter;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false}));
  ground.rotation.x=-Math.PI/2;scene.add(ground);
  const camera = new THREE.PerspectiveCamera(nativeBox?38:36,1,.01,100);
  const controls = new OrbitControls(camera,canvas);
  controls.enableDamping = true; controls.dampingFactor = .12;
  controls.enableZoom = false; controls.enablePan = false;
  controls.minDistance = 1.5; controls.maxDistance = 12;
  controls.maxPolarAngle = Math.PI*.85;
  let model, modelSize, frame = 0, timer = 0, released = false;
  const defaultDirection = nativeBox?new THREE.Vector3(1.2,.9,1.25).normalize():new THREE.Vector3(.65,slug === 'tiles' ? 1 : .35,.95).normalize();
  const fitView = (reset = false) => {
    if (!modelSize) return;
    const direction = reset || camera.position.lengthSq() === 0 ? defaultDirection.clone() : camera.position.clone().normalize();
    const right = new THREE.Vector3().crossVectors(camera.up,direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction,right).normalize();
    const tanV = Math.tan(camera.fov*Math.PI/360),tanH=tanV*camera.aspect;
    let distance=0;
    for(const x of [-1,1]) for(const y of [-1,1]) for(const z of [-1,1]) {
      const p = new THREE.Vector3(x*modelSize.x,y*modelSize.y,z*modelSize.z).multiplyScalar(.5);
      distance=Math.max(distance,p.dot(direction)+Math.max(Math.abs(p.dot(right))/tanH,Math.abs(p.dot(up))/tanV));
    }
    distance*=1.18;controls.maxDistance=Math.max(12,distance*1.2);
    camera.position.copy(direction).multiplyScalar(distance);controls.target.set(0,0,0);controls.update();
  };
  let lastState = initialState, generation = 0;
  const render = () => {
    frame = 0;
    if (released || document.hidden) return;
    controls.update(); renderer.render(scene,camera);
  };
  const invalidate = () => { if (!frame && !released && !document.hidden) frame = requestAnimationFrame(render); };
  controls.addEventListener('change',invalidate);
  const update = (state, first = false) => {
    clearTimeout(timer); lastState = state;
    const version=++generation;
    const rebuild = async () => {
      if (released) return;
      let resources;
      try {
        const requestedState=lastState;
        resources=await prepare?.(requestedState);
        if(released || version!==generation){resources?.textures?.forEach(texture=>texture.dispose());return;}
        const next = buildModel(requestedState,resources);
        next.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(next.group);
        const centre = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const scale = slug === 'chair' ? 3.6 : slug === 'bookshelf' ? .95 : slug === 'cardbox' ? 3.6 : .85;
        const wrapper = new THREE.Group(); wrapper.add(next.group); wrapper.scale.setScalar(scale);
        wrapper.position.copy(centre).multiplyScalar(-scale);
        next.wrapper = wrapper;
        if (model) { scene.remove(model.wrapper); disposeModel(model); }
        model = next; scene.add(wrapper);
        modelSize=size.clone().multiplyScalar(scale);
        ground.position.y=-modelSize.y/2-.012;
        ground.scale.set(Math.max(modelSize.x*1.65,1),Math.max(modelSize.z*1.7,1),1);
        fitView(first);
        callbacks.metrics(next.metrics || {}); invalidate();
      } catch (error) { resources?.textures?.forEach(texture=>texture.dispose());if(!released && version===generation)callbacks.error(error); }
    };
    if (first) return rebuild(); else timer = setTimeout(rebuild,70);
  };
  const resize = () => {
    const {width,height} = host.getBoundingClientRect();
    if (!width || !height || released) return;
    camera.aspect = width/height; camera.updateProjectionMatrix();
    renderer.setSize(width,height,false); fitView(); invalidate();
  };
  const observer = new ResizeObserver(resize); observer.observe(host);
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else invalidate(); };
  document.addEventListener('visibilitychange',visibility);
  const contextLost = event => {
    event.preventDefault(); callbacks.error(new Error('WebGL context lost'));
    release(); renderer?.dispose(); renderer = undefined;
  };
  canvas.addEventListener('webglcontextlost',contextLost);
  function release() {
    if (released) return; released = true;
    cancelAnimationFrame(frame); clearTimeout(timer); observer.disconnect(); controls.dispose();
    document.removeEventListener('visibilitychange',visibility); canvas.removeEventListener('webglcontextlost',contextLost);
    disposeModel(model);ground.geometry.dispose();ground.material.dispose();shadowTexture.dispose(); renderer?.renderLists.dispose(); canvas.remove(); callbacks.released();
    if (releaseActive === release) releaseActive = undefined;
    idleDisposal = setTimeout(() => { if (!releaseActive && renderer) {renderer.dispose();renderer.forceContextLoss();renderer = undefined;} },1500);
  }
  releaseActive = release;
  resize(); await update(initialState,true);
  return {update,release,resetView:()=>{fitView(true);invalidate();},setInteraction:enabled=>{controls.enabled=enabled;canvas.style.touchAction=enabled?'none':'pan-y';}};
}
