"""Real Roof editor/CAD/texture/GLB tests, without live services or a GPU.
WebGL drawing, studio/label renderers, account/cloud services and USDZ binary
export are simulated. The production r169 import map is NOT changed.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse, base64, json, posixpath, re, shutil, subprocess, tempfile
parser=argparse.ArgumentParser(); parser.add_argument('--artifacts'); parser.add_argument('--chromium'); args=parser.parse_args()
R=Path(__file__).resolve().parents[2]; W=Path(args.artifacts or tempfile.mkdtemp(prefix='roof-ar-')); W.mkdir(parents=True,exist_ok=True)
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
 host.innerHTML=renderTopBar({brandSrc:'',brandAlt:'360 Configurator',projectName:'Roof#1',state,productId:options.productId,capabilities:options.capabilities});document.body.prepend(host);
 const shell={host,state,markDirty(){},showFeedback(...args){__feedback.push(args);}};
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
 if name=='shared-ui/src/ar/dialog.js':s=s.replace('window.location.origin',"'https://www.360configurator.com'")
 if name=='roof-configurator/js/roofFactory.js':
  images={p.name:'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() for p in (R/'roof-configurator/assets/roof-materials').glob('*.png')}
  s=re.sub(r'const asset = \(name\) => new URL\([^;]+;', 'const asset = name => ('+json.dumps(images)+')[name];',s)
 if name=='roof-configurator/js/app.js':
  s+="""\nwindow.__test={THREE:await import('@source/"""+LIB+"""three.module.js'),scene,ui,state,
    configure(patch){if(patch.roofType==='layout'&&!patch.roofLayout)patch={...patch,roofLayout:defaultLayout()};if(!configuratorApi.restoreState({...DEFAULT_ROOF_STATE,...patch}))throw Error('Rejected configuration');},
    rootsJSON:()=>JSON.stringify(scene.modelRoot.toJSON()),capture:options=>configuratorApi.captureARSnapshot(options),
  };"""
 sources[name]=s
add(LIB+'three.module.js');add('bookshelf-configurator/tests/camera-guard.mjs')
for name in ['roof-configurator/js/app.js','roof-configurator/js/sharedShell.js','roof-configurator/js/ar/exportRoof.js','shared-ui/src/ar/dialog.js','shared-ui/src/components/topBar.js']:add(name)
html=(R/'roof-configurator/index.html').read_text();html=re.sub(r'<script\b[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=chromium,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--js-flags=--expose-gc'])
 page=browser.new_page(viewport={'width':1366,'height':900});errors=[];logs=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:logs.append(e.text))
 page.set_content(html)
 page.add_style_tag(content='\n'.join((R/n).read_text() for n in ['shared-ui/styles/standalone.css','shared-ui/styles/panelControls.css','roof-configurator/styles.css','roof-configurator/shared-shell.css','roof-configurator/layout-editor.css','shared-ui/styles/ar.css']))
 page.evaluate('''modules=>{window.__feedback=[];const imports={};for(const[name,code]of Object.entries(modules))imports['@source/'+name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);}''',sources)
 try:
  page.evaluate("async()=>{await import('@source/roof-configurator/js/app.js');await import('@source/roof-configurator/js/sharedShell.js');window.__cameraGuard=await import('@source/bookshelf-configurator/tests/camera-guard.mjs');await document.fonts.ready;}")
  results=[]
  for stale in W.glob('*.glb'):stale.unlink()
  configs=[{'roofType':t,'covering':c} for t in ['gable','hip','shed','lshape','dormer','layout'] for c in ['generic','roca','teclado']]
  for config in configs:
   output=page.evaluate('''async config=>{
    const t=__test,host=document.getElementById('canvasHost'),s=t.scene;
    const {waitForStableView,readCameraState,assertCameraUnchanged}=__cameraGuard;
    const {waitForRoofTextures,createRoofFirebaseARAsset}=await import('@source/roof-configurator/js/ar/exportRoof.js');
    t.configure(config);await waitForRoofTextures(()=>s.modelRoot);await waitForStableView(s.camera,s.controls,host);
    const before=t.rootsJSON(),camera=readCameraState(s.camera,s.controls,host),state=JSON.stringify(ROOF_CONFIGURATOR_API.captureState());
    const preserved=()=>{assertCameraUnchanged(camera,readCameraState(s.camera,s.controls,host));if(t.rootsJSON()!==before)throw Error('Live geometry/materials changed');if(JSON.stringify(ROOF_CONFIGURATOR_API.captureState())!==state)throw Error('Configuration changed');};
    const captured=await t.capture();preserved();let count=0;s.modelRoot.traverseVisible(o=>{if(o.isMesh)count++});
    if(count!==captured.stats.sourceMeshes)throw Error('A physical part was omitted');
    if(!captured.stats.components['house-walls']&&!captured.stats.components['drawn-wall']&&config.roofType!=='lshape')throw Error('Missing house');
    if(!captured.model.images?.length)throw Error('Textures missing');
    const asset=await createRoofFirebaseARAsset(captured,'glb');preserved();
    const bytes=new Uint8Array(await asset.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return {config,stats:captured.stats,textures:captured.model.images.length,bytes:bytes.length,base64:btoa(data)};
   }''',config)
   (W/f"{config['roofType']}-{config['covering']}.glb").write_bytes(base64.b64decode(output.pop('base64')));results.append(output)
   print(config,output['bytes'],output['stats']['sourceMeshes'],flush=True)
   # Release the large temporary export arrays before the next scenario; the
   # live editor and its cached textures are not recreated or reset here.
   page.evaluate('() => globalThis.gc?.()')
  print('All standard exports done; checking edited dimensions, roof windows and dialog.',flush=True)
  behavior=page.evaluate('''async()=>{
   const t=__test,sh=s=>JSON.stringify(s.model.geometries.map(g=>g.data));
   t.configure({roofType:'gable'});const original=await t.capture();const immutable=JSON.stringify(original);
   t.configure({roofType:'gable',length:13,depth:9,wallHeight:4,pitch:38,overhang:.7,roofColor:'#234f42'});const changed=await t.capture();
   if(sh(original)===sh(changed)||changed.stats.size.x<=original.stats.size.x||changed.stats.size.y<=original.stats.size.y)throw Error('Dimensions not captured');
   if(JSON.stringify(original)!==immutable)throw Error('Captured snapshot mutated');
   ROOF_CONFIGURATOR_API.setTechnicalEdges(true);ROOF_CONFIGURATOR_API.setCompassVisible(true);const technical=await t.capture();if(sh(changed)!==sh(technical))throw Error('Editor helper exported');
   const {footprintLayout}=await import('@source/roof-configurator/js/roofLayout.js');
   const layout=footprintLayout([{x:0,z:0},{x:8,z:0},{x:8,z:6},{x:0,z:6}]);layout.vertices.forEach(p=>p.h=p.z*.5);layout.roofWindows=[{x:3,z:3,width:.78,length:1.18},{x:5,z:3,width:1,length:1.4}];
   t.configure({roofType:'layout',roofLayout:layout});const windows=await t.capture();
   if(windows.stats.components['window-frame']!==8||windows.stats.components['window-glazing']!==2)throw Error('Roof windows missing');
   const {createRoofFirebaseARAsset}=await import('@source/roof-configurator/js/ar/exportRoof.js');const a=await createRoofFirebaseARAsset(windows,'glb');
   const bytes=new Uint8Array(await a.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));
   t.configure({roofType:'custom'});let code='';try{await t.capture();}catch(e){code=e.code;}if(code!=='roof-incomplete')throw Error('No guard for unfinished roof');
   t.configure({roofType:'gable'});t.ui.layoutEditor.open();code='';try{await t.capture();}catch(e){code=e.code;}if(code!=='editing-in-progress')throw Error('No guard for layout edits');t.ui.layoutEditor.dialog.close();
   return {original:original.stats.size,resized:changed.stats.size,windowParts:windows.stats.components,windowBytes:bytes.length,base64:btoa(data)};
  }''')
  (W/'layout-two-windows.glb').write_bytes(base64.b64decode(behavior.pop('base64')))
  # Stub upload/serving only. Android dialog still calls the REAL GLB exporter.
  page.evaluate('''()=>{window.__uploads=[];window.__rejectUpload=false;
   window.XMLHttpRequest=class {constructor(){this.upload={};this.headers={};}open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}abort(){this.onabort?.();}async send(blob){const product=new URL(this.url).searchParams.get('product'),format=this.headers['X-Hall-AR-Format'];__uploads.push({product,format,size:blob.size});await new Promise(r=>setTimeout(r,25));if(__rejectUpload){this.onerror?.();return;}this.status=201;window.__lastSession={id:String(__uploads.length).padStart(32,'A'),product,format,byteLength:blob.size,expiresAtMs:Date.now()+86400000};this.responseText=JSON.stringify(__lastSession);this.upload.onprogress?.({lengthComputable:true,loaded:blob.size,total:blob.size});this.onload?.();}};
   window.fetch=async(url,options)=>{if(String(url).includes('/getHallAR'))return new Response(options?.method==='HEAD'?null:JSON.stringify(__lastSession),{status:200,headers:{'content-length':String(__lastSession.byteLength),'content-type':'application/json'}});throw Error('Unexpected request '+url);};
  }''')
  page.locator('[data-action="view-ar"]').click();dialog=page.locator('#roofARDialog')
  page.wait_for_function("!!document.querySelector('#roofARDialog [data-open]')?.href",timeout=45000)
  assert dialog.locator('[value="android"]').is_checked()
  assert page.evaluate('__uploads.at(-1).product')=='roof'
  assert not dialog.locator('[data-copy="scale"],[data-copy="snapshot"]').count()
  assert not re.search('Firebase|Supabase|metres|Scenery',dialog.inner_text())
  page.screenshot(path=str(W/'roof-ar-dialog-desktop.png'))
  dialog.locator('[value="ios"]').check();page.wait_for_function("document.querySelector('#roofARDialog [data-open]')?.href?.includes('mode=ios')",timeout=45000)
  assert page.evaluate('__uploads.at(-1).format')=='usdz';assert page.evaluate('__iosOptions.quickLookCompatible');assert page.evaluate('__iosSize[1]>3')
  count=page.evaluate('__uploads.length');dialog.locator('[value="android"]').check();page.wait_for_function("document.querySelector('#roofARDialog [data-open]')?.href?.includes('mode=android')")
  assert page.evaluate('__uploads.length')==count
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(W/'roof-ar-dialog-mobile.png'));assert dialog.bounding_box()['width']<=390
  for locale in ['ro-RO','de-DE','es-ES','fr-FR','it-IT','en-US']:
   dialog.locator('[data-close]').click();page.evaluate('locale=>{ROOF_CONFIGURATOR_SHARED_SHELL.state.locale=locale;}',locale);page.locator('[data-action="view-ar"]').click()
   page.wait_for_function("!!document.querySelector('#roofARDialog [data-open]')?.href",timeout=45000)
   assert not re.search('Firebase|Supabase|GLB files',dialog.inner_text())
   assert 'lang='+locale in dialog.locator('[data-open]').get_attribute('href')
  dialog.locator('[data-close]').click();page.evaluate('__rejectUpload=true');page.locator('[data-action="view-ar"]').click()
  page.wait_for_function("!document.querySelector('#roofARDialog [data-error]').hidden",timeout=45000)
  page.evaluate('__rejectUpload=false');dialog.locator('[data-retry]').click();page.wait_for_function("!!document.querySelector('#roofARDialog [data-open]')?.href",timeout=45000)
  dialog.locator('[data-close]').click();page.locator('[data-action="view-ar"]').click();dialog.locator('[data-close]').click();page.locator('[data-action="view-ar"]').click()
  page.wait_for_function("!!document.querySelector('#roofARDialog [data-open]')?.href",timeout=45000);assert dialog.locator('[value="android"]').is_checked()
  dialog.locator('[data-close]').click()
  if errors:raise AssertionError(errors)
  (W/'report.json').write_text(json.dumps({'exports':results,'configuration':behavior,'uploads':page.evaluate('__uploads'),'pageErrors':errors,'runtime':'offline r160 fixture; drawing/account/cloud/USDZ simulated'},indent=2))
  print('AR dialog, platform switching, editor state, retry, close/reopen and mobile checks passed.')
 finally:
  (W/'browser-console.txt').write_text('\n'.join(logs+errors));browser.close()
subprocess.run(['node','-e',"""
const fs=require('node:fs'),path=require('node:path');const {validateAsset}=require('./firebase-share-backend/functions/hall-ar-core.cjs');
const dir=process.argv[1],names=fs.readdirSync(dir).filter(n=>n.endsWith('.glb'));if(names.length!==19)throw Error('Expected 19 exports');
for(const name of names){const bytes=fs.readFileSync(path.join(dir,name));validateAsset('glb',bytes);const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));if(!doc.images?.length||doc.images.some(i=>i.bufferView===undefined||i.uri))throw Error('Missing embedded texture '+name);}
console.log('All 19 textured Roof and house GLBs pass the backend validator.');
""",str(W.resolve())],cwd=R,check=True)
