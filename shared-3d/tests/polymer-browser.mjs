/** Local Window client/CAD acceptance test. No production account or deployment.
 * Serves either the source tree or the prepared static site. Only the local test
 * response exposes scene handles and stops the animation loop for deterministic
 * snapshots; shipped client files are not instrumented. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(process.env.POLYMER_ROOT||fileURLToPath(new URL('../../',import.meta.url)));
const output=process.env.VISUAL_OUTPUT_DIR||'/tmp/polymer-browser';await mkdir(output,{recursive:true});
const staticMode=process.env.POLYMER_STATIC==='1',baseline=process.env.POLYMER_BASELINE==='1';
const {chromium}=createRequire(path.join(root,'package.json'))('playwright');
const sha=v=>createHash('sha256').update(v).digest('hex');
const server=createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');let rel=decodeURIComponent(u.pathname).slice(1);
    if(rel==='window-app/'||rel==='window-app')rel='window-app/index.html';
    if(rel==='api/cad-screenshots'){const p=u.searchParams.get('profile');if(!/^[A-Za-z0-9_ -]+$/.test(p||''))throw Error();rel=`window-app/cad_screenshots/${p}/images.json`;}
    if(rel.startsWith('window-app/')) {
      const app=rel.slice('window-app/'.length);
      rel=staticMode?`window-configurator/dist/site/${app}`:((app.startsWith('shared-3d/')||app.startsWith('shared-ui/'))?app:`window-configurator/src/client/${app}`);
    }
    const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))throw Error('invalid path');let body=await readFile(file);
    if(rel.endsWith('/index.html'))body=body.toString().replace(/<script src="https:\/\/cdn\.jsdelivr[^\"]*"><\/script>/g,'').replace(/<link[^>]*https:\/\/fonts[^>]*>/g,'').replace(/<script type="module" src="\.\/shared-shell\.js[^>]*><\/script>/,'').replace(/<script type="module">\s*import \{ applyConfiguratorSeo \}[\s\S]*?<\/script>/,'');
    if(rel.endsWith('/js/main.js'))body=body.toString().replace('const pageParams = new URLSearchParams(window.location.search);',"const pageParams = new URLSearchParams('debug_colors=0&outside_finish_type=coated&outside_colour=%23dde2e5');").replace('renderer.setAnimationLoop(renderFrame);','window.__POLY_TEST={renderer,scene,camera,surfaceSystem,controls,windowBuilder,profileController,materialManager,renderFrame};');
    const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':mime,'Access-Control-Allow-Origin':'*'});res.end(body);
  }catch(e){res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--disable-gpu-sandbox','--ignore-gpu-blocklist','--disable-gpu-watchdog']});
const errors=[],reports=[];let page;
try{
  page=await browser.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(120000);
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message);});
  page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error('CONSOLE',m.text());}});
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const html=await(await fetch(`${base}/window-app/`)).text();await page.setContent(html.replace('<head>',`<head><base href="${base}/window-app/">`));
  await page.waitForFunction(()=>!!window.__POLY_TEST,null,{timeout:90000});console.log('CLIENT READY',root);
  await page.evaluate(async()=>{
    const t=window.__POLY_TEST;t.controls.enableDamping=false;
    await window.WINDOW_CONFIGURATOR_API.restoreState({sectionView:false,showHouse:false,finishMode:'same',colour:'#dde2e5',debugColors:false});
    t.windowBuilder.applyCurrentPoseInstantly();await t.surfaceSystem.materials.whenTexturesReady();
    window.__T=await import(new URL('js/three-mesh-reuse.js?v=1',document.baseURI).href);
    window.__polySummary=()=>{
      const profiles=t.profileController.getProfilesData().map(p=>({profileId:p.profileId,catalogProfileId:p.catalogProfileId,blockName:p.blockName,materialKey:p.materialKey,componentType:p.componentType,accessoryType:p.accessoryType,surface:p.material?.userData?.surface?.id,color:p.material?.color?.getHexString(),metalness:p.material?.metalness,roughness:p.material?.roughness}));
      let handles=0,positions=0,finite=true;const protectedBuffers=[];t.windowBuilder.placementRoot.updateMatrixWorld(true);
      t.windowBuilder.placementRoot.traverse(o=>{if(!o.isMesh)return;if(o.userData.windowHandleCellId)handles++;const g=o.geometry;positions+=g.attributes.position.count;for(const a of Object.values(g.attributes))for(const n of a.array)if(!Number.isFinite(n))finite=false;
        protectedBuffers.push([Object.fromEntries(Object.entries(g.attributes).filter(([key])=>key!=='uv').map(([key,a])=>[key,Array.from(a.array)])),g.index?Array.from(g.index.array):null,g.groups,o.matrixWorld.toArray(),o.castShadow,o.receiveShadow]);});
      return {profiles,handles,positions,finite,fabrication:t.windowBuilder.getFabricationSnapshot(),protectedBuffers};
    };
    window.__polyView=kind=>{
      const T=window.__T,t=window.__POLY_TEST;
      t.windowBuilder.mainGroup.visible=kind!=='section';t.windowBuilder.sectionGroup.visible=kind==='section';
      const g=kind==='section'?t.windowBuilder.sectionGroup:t.windowBuilder.mainGroup;
      // Exclude screen-facing dimension sprites from the camera bounds.
      t.windowBuilder.placementRoot.traverse(o=>{if(o.isSprite||o.isLine)o.visible=false;});
      g.updateWorldMatrix(true,true);const b=new T.Box3();
      g.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));}});
      const c=b.getCenter(new T.Vector3()),size=b.getSize(new T.Vector3()),d=size.length();
      if(kind==='gasket') { c.set(b.max.x-.04,b.min.y+.15,b.max.z); t.camera.position.copy(c).add(new T.Vector3(.2,.06,.47)); }
      else t.camera.position.copy(c).add(new T.Vector3(d*.29,d*.14,d*.78));
      t.controls.target.copy(c);t.controls.update();
    };
  });
  const initial=await page.evaluate(()=>window.__polySummary());
  const geometryHash=sha(JSON.stringify(initial.protectedBuffers)),fabricationHash=sha(JSON.stringify(initial.fabrication));
  await writeFile(path.join(output,'profiles.json'),JSON.stringify(initial.profiles,null,2));
  assert.equal(initial.handles,3);assert.equal(initial.finite,true);
  if(!baseline){
    for(const id of ['plastic.rigid','plastic.thermalBreak','rubber.epdm'])assert.ok(initial.profiles.some(p=>p.surface===id),`active ${id}`);
    for(const p of initial.profiles.filter(p=>p.surface?.startsWith('plastic.')||p.surface?.startsWith('rubber.')))assert.equal(p.metalness,0);
  }
  for(const quality of ['balanced','high','low']){
    const report=await page.evaluate(async quality=>{
      const t=window.__POLY_TEST,r=t.renderer;t.surfaceSystem.setQuality(quality,{devicePixelRatio:1});await t.surfaceSystem.materials.whenTexturesReady();window.__polyView('overview');
      t.surfaceSystem.render(t.camera);t.surfaceSystem.render(t.camera);r.info.autoReset=false;
      let idle=Infinity;for(let i=0;i<3;i++){r.info.reset();t.surfaceSystem.render(t.camera,{onDemand:true,now:10000+i*100});idle=r.info.render.calls;}
      t.camera.position.x+=.01;t.controls.update();r.info.reset();t.surfaceSystem.render(t.camera);const movingDraws=r.info.render.calls;
      const d=t.surfaceSystem.getDiagnostics(),gl=r.getContext();return {quality,diagnostics:d,idleDraws:idle,movingDraws,linked:r.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),lost:gl.isContextLost()};
    },quality);
    assert.equal(report.linked,true);assert.equal(report.lost,false);assert.equal(report.idleDraws,0);
    if(!baseline){const details=report.diagnostics.surfaceDetails;for(const id of ['plastic.rigid','plastic.thermalBreak','rubber.epdm'])assert.equal(details[id].normalMapped>0,quality!=='low');}
    if(quality!=='low')for(const view of ['overview','gasket','section']){
      const image=await page.evaluate(view=>{window.__polyView(view);const t=window.__POLY_TEST;t.surfaceSystem.render(t.camera);return t.renderer.domElement.toDataURL('image/png');},view);
      await writeFile(path.join(output,`window-${quality}-${view}.png`),Buffer.from(image.split(',')[1],'base64'));
    }
    reports.push(report);console.log('TIER',quality,'idle',report.idleDraws,'moving',report.movingDraws);
  }
  await page.evaluate(()=>{window.__polyView('overview');});
  const finish=await page.evaluate(()=>window.__polySummary());
  assert.equal(sha(JSON.stringify(finish.protectedBuffers)),geometryHash);assert.equal(sha(JSON.stringify(finish.fabrication)),fabricationHash);
  // Demonstrate catalog-aware correction on the real B2-8 foam accessory when
  // enabled, and exact return to the current model after debug mode/rebuild.
  if(!baseline){
    await page.evaluate(async()=>{
      await window.WINDOW_CONFIGURATOR_API.restoreState({insulationProfile:'200988',debugColors:false});
      await window.__POLY_TEST.surfaceSystem.materials.whenTexturesReady();
    });
    const p=await page.evaluate(()=>window.__polySummary());
    // Geometry availability depends on selected assembly; the manager must still
    // classify an explicitly catalogued PE insert as foam, not EPDM.
    const materialCheck=await page.evaluate(()=>{
      const t=window.__POLY_TEST,m=t.materialManager.getMaterialForProfile({profileId:'200988',materialKey:'epdm'});
      return {id:m.userData.surface.id,metalness:m.metalness};});
    assert.equal(materialCheck.id,'plastic.foam');assert.equal(materialCheck.metalness,0);
    await page.evaluate(async()=>{await window.WINDOW_CONFIGURATOR_API.restoreState({debugColors:true});});
    const debug=await page.evaluate(()=>window.__polySummary());
    assert.ok(debug.profiles.every(p=>!p.surface),'CAD debug colour materials remain untextured');
    await page.evaluate(async()=>{await window.WINDOW_CONFIGURATOR_API.restoreState({debugColors:false});const t=window.__POLY_TEST;t.surfaceSystem.setQuality('balanced',{devicePixelRatio:1});await t.surfaceSystem.materials.whenTexturesReady();t.surfaceSystem.render(t.camera);});
    const restored=await page.evaluate(()=>window.__polySummary());assert.equal(restored.handles,3);assert.equal(restored.finite,true);
  }
  assert.deepEqual(errors,[]);
  await writeFile(path.join(output,'report.json'),JSON.stringify({baseline,staticMode,geometryHash,fabricationHash,handles:initial.handles,profiles:initial.profiles,reports,errors},null,2)+'\n');
} finally {await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
