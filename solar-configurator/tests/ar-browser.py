"""Real Solar editor/CAD/texture/GLB tests, without live services or a GPU.
WebGL drawing, studio/label renderers, account/cloud services and USDZ binary
export are simulated. The production r169 import map is NOT changed.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse, base64, json, posixpath, re, shutil, subprocess, tempfile
parser=argparse.ArgumentParser(); parser.add_argument('--artifacts'); parser.add_argument('--chromium'); args=parser.parse_args()
R=Path(__file__).resolve().parents[2]; W=Path(args.artifacts or tempfile.mkdtemp(prefix='solar-ar-')); W.mkdir(parents=True,exist_ok=True)
chromium=args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
if not chromium: raise SystemExit('Pass --chromium /path/to/chromium')
LIB='window-configurator/src/client/lib/'
sources={};rx=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"']+)\1''')
def resolve(parent,spec):
 if spec=='three': return 'test/three.js'
 if spec=='three/addons/exporters/USDZExporter.js':return 'test/usdz.js'
 if spec=='three/addons/renderers/CSS2DRenderer.js':return 'test/css2d.js'
 if spec=='three/addons/environments/RoomEnvironment.js':return 'test/room.js'
 if spec.startswith('three/addons/'):return LIB+spec[13:]
 if spec.startswith('.'):return posixpath.normpath(posixpath.join(posixpath.dirname(parent),spec)).split('?')[0]
 return None
sources['shared-ui/src/tenantBootstrap.js']='export async function requireTenantConfiguratorAccess(){return null;}'
sources['test/three.js']="""import * as T from '@source/"""+LIB+"""three.module.js';export * from '@source/"""+LIB+"""three.module.js';
export class WebGLRenderer {constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>1};this.pixelRatio=1;}setPixelRatio(v){this.pixelRatio=v;}getPixelRatio(){return this.pixelRatio;}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(){}dispose(){}}
export class PMREMGenerator {fromScene(){return {texture:new T.Texture()};}dispose(){}}"""
sources['test/css2d.js']="""import {Object3D} from '@source/"""+LIB+"""three.module.js'; export class CSS2DObject extends Object3D {constructor(el){super();this.element=el;}copy(source,recursive){super.copy(source,recursive);this.element=source.element?.cloneNode(true);return this;}}export class CSS2DRenderer {constructor(){this.domElement=document.createElement('div');}setSize(){}render(){}}"""
sources['test/room.js']="import {Scene} from '@source/"+LIB+"three.module.js';export class RoomEnvironment extends Scene {dispose(){}}"
sources['test/usdz.js']='export class USDZExporter {async parseAsync(root,options){window.__iosOptions=options;window.__iosSize=new __test.THREE.Box3().setFromObject(root).getSize(new __test.THREE.Vector3()).toArray();return new Uint8Array(256);}}'
sources['shared-ui/src/tools/registry.js']='export function resolveSharedTools(items){return items;}'
sources['shared-ui/src/shareState.js']='export async function readShareState(){return null;}export function createShareUrl(){throw Error("AR must not require account save/share");}'
sources['shared-ui/src/standaloneShell.js']="""import {renderTopBar} from '@source/shared-ui/src/components/topBar.js';
export function mountStandaloneConfiguratorShell(options){
 const host=document.createElement('div');host.className='shared-ui-host';const state={locale:'en-US',units:'metric',currency:'RON'};
 host.innerHTML=renderTopBar({brandSrc:'',brandAlt:'360 Configurator',projectName:'Solar#1',state,productId:options.productId,capabilities:options.capabilities});document.body.prepend(host);
 const shell={host,state,markDirty(){},syncTools(){},setToolState(){},setToolDisabled(){},showFeedback(...args){__feedback.push(args);}};
 host.querySelector('[data-action="view-ar"]').onclick=()=>options.callbacks.onViewAR();window.__shellOptions=options;return shell;
}"""
def add(name):
 if name in sources:return
 sources[name]='';s=(R/name).read_text()
 def sub(m):
  target=resolve(name,m[2])
  if target:
   add(target);return m[0].replace(m[1]+m[2]+m[1],m[1]+'@source/'+target+m[1])
  return m[0]
 s=rx.sub(sub,s).replace('import.meta.url',json.dumps('https://offline.invalid/'+name))
 if name=='solar-configurator/js/googleSolar.js':s=s.replace('window.location.href',"'https://www.360configurator.com/solar-configurator/'")
 if name=='shared-ui/src/ar/dialog.js':s=s.replace('window.location.origin',"'https://www.360configurator.com'")
 if name=='solar-configurator/js/app.js':
  s+="""\nwindow.__test={THREE:await import('@source/"""+LIB+"""three.module.js'),scene,ui,state,
    configure(patch){if(!configuratorApi.restoreState({...DEFAULT_SOLAR_SHARE_STATE,environmentEnabled:false,environmentAutoLoad:false,...patch}))throw Error('Rejected configuration');},
    rootsJSON:()=>JSON.stringify([scene.modelRoot.toJSON(),scene.solarRoot.toJSON()]),capture:options=>configuratorApi.captureARSnapshot(options),
  };"""
 sources[name]=s
add(LIB+'three.module.js');add('bookshelf-configurator/tests/camera-guard.mjs')
for name in ['solar-configurator/js/app.js','solar-configurator/js/sharedShell.js','solar-configurator/js/ar/exportSolar.js','shared-ui/src/ar/dialog.js','shared-ui/src/components/topBar.js']:add(name)
html=(R/'solar-configurator/index.html').read_text();html=re.sub(r'<script\b[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=chromium,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--js-flags=--expose-gc'])
 page=browser.new_page(viewport={'width':1366,'height':900});errors=[];logs=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:logs.append(e.text))
 # No navigation or live services required in the sandbox. Root-relative
 # analysis URLs are resolved against the public origin in the test module.
 page.set_content(html)
 page.add_style_tag(content='\n'.join((R/n).read_text() for n in ['shared-ui/styles/standalone.css','shared-ui/styles/panelControls.css','solar-configurator/styles.css','solar-configurator/shared-shell.css','solar-configurator/solar.css','shared-ui/styles/ar.css']))
 page.evaluate('''modules=>{window.__feedback=[];window.fetch=async()=>new Response(JSON.stringify({error:'offline-test'}),{status:503,headers:{'content-type':'application/json'}});const imports={};for(const[name,code]of Object.entries(modules))imports['@source/'+name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);}''',sources)
 try:
  page.evaluate("async()=>{await import('@source/solar-configurator/js/app.js');await import('@source/solar-configurator/js/sharedShell.js');window.__cameraGuard=await import('@source/bookshelf-configurator/tests/camera-guard.mjs');await document.fonts.ready;}")
  results=[]
  for stale in W.glob('*.glb'):stale.unlink()
  configs=[{'roofType':t,'moduleOrientation':o,'roofSide':face,'panelCount':8,'length':12,'depth':9} for t in ['gable','hip','shed'] for o in ['portrait','landscape'] for face in ['front','back','both']]
  for config in configs:
   output=page.evaluate('''async config=>{
    const t=__test,host=document.getElementById('canvasHost'),s=t.scene;
    const {waitForStableView,readCameraState,assertCameraUnchanged}=__cameraGuard;
    const {waitForSolarTextures,createSolarFirebaseARAsset}=await import('@source/solar-configurator/js/ar/exportSolar.js');
    t.configure(config);await waitForSolarTextures(()=>[s.modelRoot,s.solarRoot]);await waitForStableView(s.camera,s.controls,host);
    const before=t.rootsJSON(),camera=readCameraState(s.camera,s.controls,host),state=JSON.stringify(SOLAR_CONFIGURATOR_API.captureState());
    const preserved=()=>{assertCameraUnchanged(camera,readCameraState(s.camera,s.controls,host));if(t.rootsJSON()!==before)throw Error('Live geometry/materials changed');if(JSON.stringify(SOLAR_CONFIGURATOR_API.captureState())!==state)throw Error('Configuration changed');};
    const captured=await t.capture();preserved();let houseMeshes=0,panelMeshes=0,panelLines=0,count=0;
    s.modelRoot.traverseVisible(o=>{if(o.isMesh)houseMeshes++});
    s.solarRoot.traverseVisible(o=>{if(o.isMesh)panelMeshes++;if(o.isLine)panelLines++;if(o.isGroup&&o.userData.surfaceId)count++});
    if(captured.stats.sourceMeshes!==houseMeshes+panelMeshes+panelLines)throw Error('Omitted physical geometry');
    if(captured.stats.panelCount!==count||count<1)throw Error('Wrong panel count');
    if(captured.stats.components['solar-cell-detail']!==panelLines)throw Error('Lost panel cell lines');
    if(captured.stats.size.y<3||captured.stats.size.x>14)throw Error('House missing or scenery included');
    const asset=await createSolarFirebaseARAsset(captured,'glb');preserved();
    const bytes=new Uint8Array(await asset.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {config,stats:captured.stats,bytes:bytes.length,base64:btoa(data)};
   }''',config)
   (W/f"{config['roofType']}-{config['moduleOrientation']}-{config['roofSide']}.glb").write_bytes(base64.b64decode(output.pop('base64')));results.append(output)
   print(config,output['bytes'],flush=True);page.evaluate('() => globalThis.gc?.()')
  behavior=page.evaluate('''async()=>{
   const t=__test,sh=s=>JSON.stringify(s.model.geometries.map(g=>g.data));
   t.configure({roofType:'gable',panelCount:4,panelColumns:2,roofSide:'front'});const original=await t.capture(),immutable=JSON.stringify(original);
   t.configure({roofType:'hip',length:14,depth:10,wallHeight:4,pitch:38,overhang:.7,roofColor:'#234f42',panelCount:10,panelColumns:5,roofSide:'both',panelGap:.1,moduleOrientation:'landscape'});
   const changed=await t.capture();if(sh(original)===sh(changed)||changed.stats.size.x<=original.stats.size.x)throw Error('Edited layout not captured');
   if(JSON.stringify(original)!==immutable)throw Error('Snapshot mutated');
   SOLAR_CONFIGURATOR_API.setDimensionsVisible(true);SOLAR_CONFIGURATOR_API.setCompassVisible(true);SOLAR_CONFIGURATOR_API.setNightPreview(true);const overlays=await t.capture();if(sh(changed)!==sh(overlays))throw Error('Analysis/display overlay exported');
   t.configure({roofSide:'best',northDirection:0,panelCount:4});const north=await t.capture();SOLAR_CONFIGURATOR_API.setNorthDirection(180);const south=await t.capture();
   if(!north.stats.surfaces.back||!south.stats.surfaces.front)throw Error('Auto best-face change stale in AR');
   t.configure({length:2,depth:2,panelMargin:3});let code='';try{await t.capture();}catch(e){code=e.code;}if(code!=='no-panels')throw Error('Missing empty-array guard '+code);
   t.configure({roofType:'custom'});code='';try{await t.capture();}catch(e){code=e.code;}if(code!=='roof-incomplete')throw Error('Missing incomplete-roof guard '+code);
   t.configure({roofType:'gable'});
   // Async lighting simulation must not be stopped by AR and must not change
   // physical export geometry. Avoid comparing the intentionally advancing hour.
   const first=await t.capture();SOLAR_CONFIGURATOR_API.startSimulation();const running=await t.capture();if(!t.state.simulationPlaying||sh(first)!==sh(running))throw Error('Simulation interfered with snapshot');SOLAR_CONFIGURATOR_API.stopSimulation();
   return {before:original.stats,after:changed.stats,bestFace:[north.stats.surfaces,south.stats.surfaces]};
  }''')
  page.evaluate('''()=>{window.__uploads=[];window.__rejectUpload=false;
   window.XMLHttpRequest=class {constructor(){this.upload={};this.headers={};}open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}abort(){this.onabort?.();}async send(blob){const product=new URL(this.url).searchParams.get('product'),format=this.headers['X-Hall-AR-Format'];__uploads.push({product,format,size:blob.size});await new Promise(r=>setTimeout(r,25));if(__rejectUpload){this.onerror?.();return;}this.status=201;window.__lastSession={id:String(__uploads.length).padStart(32,'A'),product,format,byteLength:blob.size,expiresAtMs:Date.now()+86400000};this.responseText=JSON.stringify(__lastSession);this.upload.onprogress?.({lengthComputable:true,loaded:blob.size,total:blob.size});this.onload?.();}};
   window.fetch=async(url,options)=>{if(String(url).includes('/getHallAR'))return new Response(options?.method==='HEAD'?null:JSON.stringify(__lastSession),{status:200,headers:{'content-length':String(__lastSession.byteLength),'content-type':'application/json'}});return new Response(JSON.stringify({error:'offline-test'}),{status:503});};
  }''')
  page.locator('[data-action="view-ar"]').click();dialog=page.locator('#solarARDialog')
  page.wait_for_function("!!document.querySelector('#solarARDialog [data-open]')?.href",timeout=45000)
  assert dialog.locator('[value="android"]').is_checked();assert page.evaluate('__uploads.at(-1).product')=='solar'
  assert not dialog.locator('[data-copy="scale"],[data-copy="snapshot"]').count()
  assert not re.search('Firebase|Supabase|metres|Scenery',dialog.inner_text());page.screenshot(path=str(W/'solar-ar-dialog-desktop.png'))
  dialog.locator('[value="ios"]').check();page.wait_for_function("document.querySelector('#solarARDialog [data-open]')?.href?.includes('mode=ios')",timeout=45000)
  assert page.evaluate('__uploads.at(-1).format')=='usdz';assert page.evaluate('__iosOptions.quickLookCompatible');assert page.evaluate('__iosSize[1]>3')
  count=page.evaluate('__uploads.length');dialog.locator('[value="android"]').check();page.wait_for_function("document.querySelector('#solarARDialog [data-open]')?.href?.includes('mode=android')")
  assert page.evaluate('__uploads.length')==count
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(W/'solar-ar-dialog-mobile.png'));assert dialog.bounding_box()['width']<=390
  for locale in ['ro-RO','de-DE','es-ES','fr-FR','it-IT','en-US']:
   dialog.locator('[data-close]').click();page.evaluate('locale=>{SOLAR_CONFIGURATOR_SHARED_SHELL.state.locale=locale;}',locale);page.locator('[data-action="view-ar"]').click()
   page.wait_for_function("!!document.querySelector('#solarARDialog [data-open]')?.href",timeout=45000)
   assert not re.search('Firebase|Supabase|GLB files',dialog.inner_text());assert 'lang='+locale in dialog.locator('[data-open]').get_attribute('href')
  dialog.locator('[data-close]').click();page.evaluate('__rejectUpload=true');page.locator('[data-action="view-ar"]').click()
  page.wait_for_function("!document.querySelector('#solarARDialog [data-error]').hidden",timeout=45000)
  page.evaluate('__rejectUpload=false');dialog.locator('[data-retry]').click();page.wait_for_function("!!document.querySelector('#solarARDialog [data-open]')?.href",timeout=45000)
  dialog.locator('[data-close]').click();page.locator('[data-action="view-ar"]').click();dialog.locator('[data-close]').click();page.locator('[data-action="view-ar"]').click()
  page.wait_for_function("!!document.querySelector('#solarARDialog [data-open]')?.href",timeout=45000);assert dialog.locator('[value="android"]').is_checked()
  dialog.locator('[data-close]').click()
  if errors:raise AssertionError(errors)
  (W/'report.json').write_text(json.dumps({'exports':results,'configuration':behavior,'uploads':page.evaluate('__uploads'),'pageErrors':errors,'runtime':'offline r160 fixture; drawing/account/cloud/USDZ simulated'},indent=2))
  print('Solar editor capture, QR, switching, retry, localization, simulation, mobile and close/reopen passed.')
 finally:
  (W/'browser-console.txt').write_text('\n'.join(logs+errors));browser.close()
subprocess.run(['node','-e',"""
const fs=require('node:fs'),path=require('node:path');const {validateAsset}=require('./firebase-share-backend/functions/hall-ar-core.cjs');
const dir=process.argv[1],names=fs.readdirSync(dir).filter(n=>n.endsWith('.glb'));if(names.length!==18)throw Error('Expected 18 exports');
for(const name of names)validateAsset('glb',fs.readFileSync(path.join(dir,name)));
console.log('All 18 Solar and house GLBs pass the backend validator.');
""",str(W.resolve())],cwd=R,check=True)
