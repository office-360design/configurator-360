/** Actual PergolaScene and checked-in GLBs; no live account, uploads or deployment.
 * Local test response stops RAF for deterministic snapshots. Software-rendered
 * results are correctness checks, not a claim about end-user frame rates. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(process.env.PERGOLA_SURFACE_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
const output=process.env.VISUAL_OUTPUT_DIR||'/tmp/pergola-materials-browser'; await mkdir(output,{recursive:true});
const baseline=process.env.PERGOLA_SURFACE_BASELINE==='1';
const requireRoot=createRequire(path.join(root,'package.json'));
const {chromium}=requireRoot('playwright');
const requirePergola=createRequire(path.join(root,'pergola-configurator/package.json'));
const engine=path.dirname(path.dirname(requirePergola.resolve('three')));
const server=createServer(async(req,res)=>{
 try {
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
  const dir=pathname.startsWith('engine/')?engine:root;
  const rel=pathname.startsWith('engine/')?pathname.slice(7):pathname;
  const file=path.resolve(dir,rel);if(!file.startsWith(dir+path.sep))throw Error('Invalid path');
  const body=await readFile(file),mime={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.json':'application/json','.glb':'model/gltf-binary','.jpg':'image/jpeg','.png':'image/png'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'Content-Type':mime,'Access-Control-Allow-Origin':'*'});res.end(body);
 }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-gpu-watchdog']});
const errors=[],reports=[];
try {
 const page=await browser.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(120000);
 page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
 page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error('CONSOLE',m.text());}});
 await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const imports={three:`${base}/engine/build/three.module.js`,'three/addons/':`${base}/engine/examples/jsm/`};
 await page.setContent(`<!doctype html><head><base href="${base}/pergola-configurator/public/"><style>html,body,#scene{margin:0;width:100%;height:100%;overflow:hidden}.dimension-layer{display:none}</style><script type="importmap">${JSON.stringify({imports})}</script></head><body><div id="scene"></div><script type="module">
  const T=await import('three'),S=await import('${base}/pergola-configurator/src/state.js');
  const {PergolaScene}=await import('${base}/pergola-configurator/src/scene/PergolaScene.js');
  const state=structuredClone(S.DEFAULT_STATE);state.quality='balanced';state.view.dimensionsVisible=false;
  const store=new S.ConfiguratorStore(state),app=new PergolaScene(document.getElementById('scene'),store);
  cancelAnimationFrame(app.animationFrame);app.controls.enableDamping=false;app.controls.minDistance=.05;
  await app.assets.ready;await new Promise(r=>setTimeout(r,100));cancelAnimationFrame(app.animationFrame);
  app.dimensionGroup.visible=false;await app.surfaceSystem.materials.whenTexturesReady();
  window.__M17={app,store,T,S,state};
 </script></body>`);
 await page.waitForFunction(()=>!!window.__M17);console.log('ACTUAL SCENE READY',root);
 await page.evaluate(()=>{
  const {app,T,S}=window.__M17;
  window.__materialSetup=kind=>{
   const state=structuredClone(S.DEFAULT_STATE);state.view.dimensionsVisible=false;state.quality='balanced';
   if(kind==='screen') {
    const segment=S.getPoleGrid(state).segments.find(s=>s.boundary==='front');
    state.sideSegments[segment.id].type='motorized-screen';
    state.sideSegments[segment.id].screenSettings['motorized-screen']={openness:0,color:'#67757d'};
   }
   if(kind==='accessories') {
    state.automation='manual';
    const poles=S.getPoleGrid(state).poles;
    state.poleMounts[poles[0].id].front['hand-crank']=S.createPoleMount('hand-crank',{height:45});
    state.poleMounts[poles[0].id].front.switch=S.createPoleMount('switch',{height:69});
    state.poleMounts[poles[1].id].front.speaker=S.createPoleMount('speaker',{height:66});
    state.poleMounts[poles[1].id].front.outlet=S.createPoleMount('outlet',{height:35});
    state.accessories.sensors.rain={enabled:true,pole:poles[2].id};
    state.accessories.sensors.wind={enabled:true,pole:poles[3].id};
    state.accessories.perimeterLed.enabled=true;
    const rectangle=S.getRoofRectangles(state)[0];state.accessories.spotlights[rectangle.id]=2;
    const segment=S.getBoundaryHeaterSegments(state)[0];state.accessories.heaters[segment.id]={first:true,second:false};
   }
   app.update(state);app.dimensionGroup.visible=false;window.__M17.state=state;return state;
  };
  window.__materialView=kind=>{
   const focus=(name,offset)=>{
    const object=app.pergola.getObjectByName(name);if(!object)throw Error('Missing '+name);
    object.updateWorldMatrix(true,true);const b=new T.Box3().setFromObject(object),c=b.getCenter(new T.Vector3());
    app.controls.target.copy(c);app.camera.position.copy(c).add(new T.Vector3(...offset));
   };
   if(kind==='screen-detail'){app.controls.target.set(0,1.25,1.675);app.camera.position.set(.04,1.28,2.0);}
   else if(kind==='screen-back'){app.controls.target.set(0,1.25,1.675);app.camera.position.set(.08,1.28,1.30);}
   else if(kind==='crank')focus('crank_grip',[.32,.12,.50]);
   else if(kind==='speaker')focus('speaker_shell',[.30,.06,.44]);
   else if(kind==='switch')focus('switch_face',[.16,.03,.31]);
   else if(kind==='sensor')focus('wind_hub',[.30,.17,.42]);
   else if(kind==='led')focus('led_channel',[.50,-.28,.50]);
   else if(kind==='deck'){app.controls.target.set(1.1,0,1.1);app.camera.position.set(2.6,1.15,3.5);}
   else {app.controls.target.set(0,1.2,0);app.camera.position.set(7.8,5.4,8.2);}
   app.controls.update();
  };
  window.__materialSnapshot=()=>{
   const ids={};app.pergola.traverse(o=>{if(o.material?.userData?.surface){const id=o.material.userData.surface.id;ids[id]=(ids[id]||0)+1;}});
   return {ids,diagnostics:app.surfaceSystem.getDiagnostics(),assetErrors:[...app.assets.errors.keys()]};
  };
 });
 for(const kind of ['default','screen','accessories']) {
  await page.evaluate(kind=>window.__materialSetup(kind),kind);
  await page.evaluate(()=>window.__M17.app.surfaceSystem.materials.whenTexturesReady());
  const views=kind==='default'?['overview','deck']:kind==='screen'?['overview','screen-detail','screen-back']:['overview','crank','speaker','switch','sensor','led'];
  for(const quality of ['balanced','high','low']) {
   const report=await page.evaluate(async ({kind,quality})=>{
    const {app}=window.__M17,sys=app.surfaceSystem,r=app.renderer;
    sys.setQuality(quality,{devicePixelRatio:1});await sys.materials.whenTexturesReady();window.__materialView('overview');
    sys.render(app.camera);sys.render(app.camera);r.info.autoReset=false;
    let idle=-1;for(let i=0;i<4;i++){r.info.reset();sys.render(app.camera,{onDemand:true,now:10000+i*100});idle=r.info.render.calls;}
    app.camera.position.x+=.01;app.controls.update();r.info.reset();sys.render(app.camera);const moving=r.info.render.calls;
    const gl=r.getContext();return {kind,quality,idleDraws:idle,movingDraws:moving,linked:r.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),contextLost:gl.isContextLost(),...window.__materialSnapshot()};
   },{kind,quality});
   assert.equal(report.linked,true);assert.equal(report.contextLost,false);if(!baseline)assert.equal(report.idleDraws,0);assert.deepEqual(report.assetErrors,[]);
   if(!baseline&&kind==='screen') {assert.ok(report.ids['fabric.screen']);assert.equal(report.diagnostics.surfaceDetails['fabric.screen'].alphaMapped>0,quality!=='low');}
   if(!baseline&&kind==='accessories')for(const id of ['steel.brushed','plastic.diffuser','rubber.softTouch','plastic.rigid'])assert.ok(report.ids[id],`${id} in real asset scene`);
   reports.push(report);console.log('PASS',kind,quality,'idle',report.idleDraws,'moving',report.movingDraws);
   if(quality==='balanced')for(const view of views) {
    const image=await page.evaluate(view=>{window.__materialView(view);const {app}=window.__M17;app.surfaceSystem.render(app.camera);return app.renderer.domElement.toDataURL('image/png');},view);
    await writeFile(path.join(output,`${kind}-${view}.png`),Buffer.from(image.split(',')[1],'base64'));
   }
  }
 }
 if(!baseline) {
  // Exercise color/deployment changes, repeated rebuild ownership and Low return.
  const transitions=await page.evaluate(async()=>{
   const {app,S}=window.__M17;let counts=[];
   for(let i=0;i<4;i++){window.__materialSetup('accessories');await app.surfaceSystem.materials.whenTexturesReady();counts.push(app.surfaceSystem.materials.materials.size);}
   window.__materialSetup('screen');const state=window.__M17.state,segment=S.getPoleGrid(state).segments.find(s=>s.boundary==='front');
   state.sideSegments[segment.id].screenSettings['motorized-screen'].color='#bc9068';app.update(state);await app.surfaceSystem.materials.whenTexturesReady();
   const materials=[...app.surfaceSystem.materials.materials.keys()].filter(m=>m.userData.surface.id==='fabric.screen');const color=materials[0]?.color.getHexString();
   state.sideSegments[segment.id].screenSettings['motorized-screen'].openness=100;app.update(state);
   const retracted=app.surfaceSystem.getDiagnostics().activeMaterials['fabric.screen']||0;
   app.renderer.info.autoReset=true;app.destroy();
   return {counts,color,retracted,remainingMaterials:app.surfaceSystem.materials.materials.size};
  });
  assert.equal(new Set(transitions.counts).size,1);assert.equal(transitions.color,'bc9068');assert.equal(transitions.retracted,0);assert.equal(transitions.remainingMaterials,0);
  reports.push({transitions});
 }
 assert.deepEqual(errors,[]);await writeFile(path.join(output,'report.json'),JSON.stringify({baseline,reports,errors},null,2)+'\n');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
