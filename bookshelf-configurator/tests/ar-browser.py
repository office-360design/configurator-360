"""Offline Bookshelf integration: actual editor geometry, textures, GLB and AR UI.
Only WebGL drawing, account/cloud services and USDZ binary export are simulated.
The bundled r160 test engine stands in for the unchanged production r169 map.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import argparse, base64, json, posixpath, re, shutil, tempfile, subprocess
parser=argparse.ArgumentParser();parser.add_argument('--artifacts');parser.add_argument('--chromium');args=parser.parse_args()
R=Path(__file__).resolve().parents[2];W=Path(args.artifacts or tempfile.mkdtemp(prefix='bookshelf-ar-'));W.mkdir(parents=True,exist_ok=True)
chromium=args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
if not chromium:raise SystemExit('Chromium required. Pass --chromium /path/to/chromium.')
LIB='window-configurator/src/client/lib/'
sources={};rx=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"']+)\1''')
def resolve(parent,spec):
 if spec=='three':return 'test/three.js'
 if spec=='three/addons/exporters/USDZExporter.js':return 'test/usdz.js'
 if spec.startswith('three/addons/'):return LIB+spec[13:]
 if spec.startswith('.'):return posixpath.normpath(posixpath.join(posixpath.dirname(parent),spec)).split('?')[0]
 return None
sources['shared-ui/src/tenantBootstrap.js']='export async function requireTenantConfiguratorAccess(){return null;}'
sources['test/three.js']="export * from '@source/"+LIB+"three.module.js'; export class WebGLRenderer {constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>1};}setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(){}dispose(){}}"
sources['test/usdz.js']='export class USDZExporter {async parseAsync(root,options){globalThis.__iosOptions=options;globalThis.__iosSize=new __THREE.Box3().setFromObject(root).getSize(new __THREE.Vector3()).toArray();return new Uint8Array(256);}}'
sources['shared-ui/src/history/undoManager.js']='export class SharedUndoManager {bindSource(){}record(){}undo(){}}'
sources['shared-ui/src/tools/registry.js']='export function resolveSharedTools(items){return items;}'
sources['shared-ui/src/shareState.js']='export function createShareUrl(){throw Error("Account save/share must not be required for AR.");}'
sources['shared-ui/src/standaloneShell.js']='''import {renderTopBar} from '@source/shared-ui/src/components/topBar.js';
export function mountStandaloneConfiguratorShell(options){
 const host=document.createElement('div');host.className='shared-ui-host';const state={locale:'en-US',units:'metric',currency:'EUR'};
 host.innerHTML=renderTopBar({brandSrc:'',brandAlt:'360 Configurator',projectName:'Bookshelf#1',state,productId:options.productId,capabilities:options.capabilities});document.body.prepend(host);
 const footer=document.createElement('footer');footer.innerHTML='<button data-shared-panel-add-to-cart>Add to cart</button>';document.querySelector('.sidebar').append(footer);
 const shell={host,state,settingsPanelCollapsed:false,configuratorPanelFooter:footer,refreshConfiguratorPanelFooter(){},syncTools(){},setActionEnabled(){},setToolActive(){},markDirty(){},setSettingsPanelCollapsed(){},showFeedback(...args){__feedback.push(args);}};
 host.querySelector('[data-action="view-ar"]').onclick=()=>options.callbacks.onViewAR();globalThis.__shellOptions=options;return shell;
}'''
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
 if name=='bookshelf-configurator/js/app.js':
  for f in (R/'bookshelf-configurator/assets/textures').glob('*.png'):
   s=s.replace('./assets/textures/'+f.name,'data:image/png;base64,'+base64.b64encode(f.read_bytes()).decode())
  s+='''\nwindow.__test={THREE,scene,camera,controls,renderer,bookshelfGroup,connectorGroup,
   capture:options=>captureARSnapshot(options),state:()=>state,
   configure(family='compact',mode='open',keyplate='diamond',mixed=false){
    const modules=[{id:'test-straight',kind:'straight',door:mode,keyplate,colour:'#65422d',shelfSlots:[0,5,14,22,35],doorState:{}}];
    if(mixed)modules.push({id:'test-corner',kind:'corner',door:'open',keyplate:'diamond',colour:'#b98555',shelfSlots:[0,7,23,37]},
      {id:'test-other',kind:'straight',door:'lower',keyplate:'knob',colour:'#34312f',shelfSlots:[0,5,14,33]});
    if(!restoreState({version:8,family,origin:{x:-400,z:0,heading:0},modules}))throw Error('restore rejected');
   },
   edit(patch){selectedModuleId=state.modules[0].id;updateSelectedModule(patch);},
   openDoor(key){toggleDoorLeaf(state.modules[0].id,key);},
   select(i=1){selectedModuleId=state.modules[0].id;selectedShelf={moduleId:selectedModuleId,shelfIndex:i};renderSelectedControls();rebuildSelectionHelper();updateShelfMoveControls();},
   move:moveSelectedShelf,remove:removeSelectedShelf,add:addShelfToSelectedModule,
   rootsJSON:()=>JSON.stringify([bookshelfGroup.toJSON(),connectorGroup.toJSON()]),
 };window.__THREE=THREE;'''
 sources[name]=s
add(LIB+'three.module.js')
for name in ['bookshelf-configurator/js/app.js','bookshelf-configurator/js/sharedShell.js','bookshelf-configurator/js/ar/exportBookshelf.js','shared-ui/src/ar/dialog.js','shared-ui/src/components/topBar.js']:add(name)
html=(R/'bookshelf-configurator/index.html').read_text();html=re.sub(r'<script\b[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=chromium,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1366,'height':900});errors=[];logs=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:logs.append(e.text))
 page.set_content(html)
 page.add_style_tag(content=(R/'shared-ui/styles/standalone.css').read_text()+(R/'bookshelf-configurator/styles.css').read_text()+(R/'shared-ui/styles/ar.css').read_text())
 page.evaluate('''modules=>{window.__feedback=[];const imports={};for(const[name,code]of Object.entries(modules))imports['@source/'+name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);}''',sources)
 try:
  page.evaluate("async()=>{await import('@source/bookshelf-configurator/js/app.js');await import('@source/bookshelf-configurator/js/sharedShell.js');}")
  results=[]
  for family in ['compact','tall']:
   for door,hardware in [('open','diamond'),('lower','diamond'),('lower','rectangle'),('lower','knob'),('glazed','diamond'),('glazed','rectangle'),('glazed','knob')]:
    output=page.evaluate('''async([family,door,keyplate])=>{
     const t=__test;t.configure(family,door,keyplate,true);await t.capture();t.controls.enableDamping=false;t.controls.update();const before=t.rootsJSON();const camera=JSON.stringify(t.camera.toJSON());const state=JSON.stringify(BOOKSHELF_CONFIGURATOR_API.captureState());const s=await t.capture();
     if(t.rootsJSON()!==before)throw Error('Product geometry/materials changed');if(JSON.stringify(t.camera.toJSON())!==camera)throw Error('Camera changed');if(JSON.stringify(BOOKSHELF_CONFIGURATOR_API.captureState())!==state)throw Error('State changed');
     let meshes=0;for(const root of [t.bookshelfGroup,t.connectorGroup])root.traverseVisible(o=>{if(o.isMesh)meshes++;});if(s.stats.sourceMeshes!==meshes)throw Error('Missing component: '+s.stats.sourceMeshes+'/'+meshes);
     if(Math.abs(s.stats.size.y-(family==='compact'?2.15:2.3))>1e-5)throw Error('Wrong metre scale');
     if(!s.model.images?.length)throw Error('Textures missing');
     const {createBookshelfFirebaseARAsset}=await import('@source/bookshelf-configurator/js/ar/exportBookshelf.js');const a=await createBookshelfFirebaseARAsset(s,'glb');const bytes=new Uint8Array(await a.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return {family,door,keyplate,stats:s.stats,bytes:bytes.length,textures:s.model.images.length,base64:btoa(data)};
    }''',[family,door,hardware])
    (W/f'{family}-{door}-{hardware}.glb').write_bytes(base64.b64decode(output.pop('base64')));results.append(output)
  print('14 real mixed-layout GLBs:',[(r['family'],r['door'],r['keyplate'],r['bytes'],r['stats']['sourceMeshes'])for r in results])
  behavior=page.evaluate('''async()=>{const t=__test;t.configure('tall','glazed','knob',true);
   const numeric=s=>JSON.stringify(s.model.geometries.map(g=>g.data));const base=await t.capture();
   t.openDoor('glazedLeft');const opened=await t.capture();if(numeric(base)===numeric(opened))throw Error('door position omitted');if(t.state().modules[0].doorState.glazedRight)throw Error('Doors linked');
   t.select();const selected=await t.capture();if(numeric(selected)!==numeric(opened))throw Error('Outline included');
   t.move(1);const moved=await t.capture();if(numeric(moved)===numeric(opened))throw Error('Movement omitted');
   t.remove();const fewer=await t.capture();if(fewer.stats.sourceMeshes>=moved.stats.sourceMeshes)throw Error('Deletion omitted');
   t.add();const more=await t.capture();if(more.stats.sourceMeshes<=fewer.stats.sourceMeshes)throw Error('Added shelf missing');
   t.edit({door:'open',shelfSlots:[0,49]});const minimal=await t.capture();t.edit({door:'lower'});const restored=await t.capture();
   if(t.state().modules[0].shelfSlots.length!==3||restored.stats.sourceMeshes<=minimal.stats.sourceMeshes)throw Error('Boundary shelf missing');
   const immutable=JSON.stringify(restored);t.edit({colour:'#b98555'});await t.capture();if(JSON.stringify(restored)!==immutable)throw Error('Snapshot changed');return {deletion:fewer.stats.sourceMeshes,addition:more.stats.sourceMeshes,boundaryShelves:t.state().modules[0].shelfSlots.length};}''')
  print('Editor configuration checks:',behavior)
  # Network publication is simulated only; the GLB exporter still runs for the dialog.
  page.evaluate('''()=>{window.__uploads=[];window.__rejectUpload=false;
   window.XMLHttpRequest=class {constructor(){this.upload={};this.headers={};}open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}abort(){this.onabort?.();}async send(blob){const product=new URL(this.url).searchParams.get('product'),format=this.headers['X-Hall-AR-Format'];__uploads.push({product,format,size:blob.size});await new Promise(r=>setTimeout(r,25));if(__rejectUpload){this.onerror?.();return;}this.status=201;window.__lastSession={id:String(__uploads.length).padStart(32,'A'),product,format,byteLength:blob.size,expiresAtMs:Date.now()+86400000};this.responseText=JSON.stringify(__lastSession);this.upload.onprogress?.({lengthComputable:true,loaded:blob.size,total:blob.size});this.onload?.();}};
   window.fetch=async(url,options)=>{if(String(url).includes('/getHallAR'))return new Response(options?.method==='HEAD'?null:JSON.stringify(__lastSession),{status:200,headers:{'content-length':String(__lastSession.byteLength),'content-type':'application/json'}});throw Error('Unexpected network request '+url);};
  }''')
  # Top-bar output is real and CSS removes only cart/demo, not Bookshelf AR.
  assert page.locator('[data-action="view-ar"]').is_visible()
  assert not page.locator('[data-action="cart"]').is_visible()
  assert not page.locator('.book-demo-button').is_visible()
  assert page.locator('[data-shared-panel-add-to-cart]').inner_text()=='Ask for quotation'
  page.evaluate("__test.configure('compact','glazed','rectangle',true);__test.select();")
  page.locator('[data-action="view-ar"]').click()
  dialog=page.locator('#bookshelfARDialog')
  page.wait_for_function("!!document.querySelector('#bookshelfARDialog [data-open]')?.href",timeout=45000)
  assert dialog.locator('[value="android"]').is_checked()
  assert page.evaluate('__uploads.at(-1).product')=='bookshelf'
  assert not dialog.locator('[data-copy="scale"],[data-copy="snapshot"]').count()
  before=page.evaluate('JSON.stringify(BOOKSHELF_CONFIGURATOR_API.captureState())')
  page.keyboard.press('ArrowUp');page.keyboard.press('w');page.keyboard.press('s')
  assert page.evaluate('JSON.stringify(BOOKSHELF_CONFIGURATOR_API.captureState())')==before
  page.screenshot(path=str(W/'bookshelf-ar-dialog-desktop.png'))
  dialog.locator('[value="ios"]').check();page.wait_for_function("document.querySelector('#bookshelfARDialog [data-open]')?.href?.includes('mode=ios')",timeout=45000)
  assert page.evaluate('__uploads.at(-1).format')=='usdz'
  assert page.evaluate('__iosOptions.quickLookCompatible')
  assert page.evaluate('Math.abs(__iosSize[1]-2.15)<1e-5')
  count=page.evaluate('__uploads.length');dialog.locator('[value="android"]').check();page.wait_for_function("document.querySelector('#bookshelfARDialog [data-open]')?.href?.includes('mode=android')")
  assert page.evaluate('__uploads.length')==count
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(W/'bookshelf-ar-dialog-mobile.png'))
  assert dialog.bounding_box()['width']<=390
  for locale in ['ro-RO','de-DE','en-US']:
   page.evaluate("locale=>{BOOKSHELF_CONFIGURATOR_SHARED_SHELL.state.locale=locale;__shellOptions.callbacks.onPreferenceChange('locale',locale,{locale});}",locale)
   assert not re.search(r'Firebase|Supabase|real-world metres',dialog.inner_text())
  dialog.locator('[data-close]').click();page.evaluate('__rejectUpload=true');page.locator('[data-action="view-ar"]').click()
  page.wait_for_function("!document.querySelector('#bookshelfARDialog [data-error]').hidden",timeout=45000)
  page.evaluate('__rejectUpload=false');dialog.locator('[data-retry]').click();page.wait_for_function("!!document.querySelector('#bookshelfARDialog [data-open]')?.href",timeout=45000)
  dialog.locator('[data-close]').click();page.evaluate("__test.edit({colour:'#34312f'});")
  page.locator('[data-action="view-ar"]').click();assert dialog.locator('[value="android"]').is_checked()
  page.wait_for_function("!!document.querySelector('#bookshelfARDialog [data-open]')?.href",timeout=45000)
  dialog.locator('[data-close]').click()
  if errors:raise AssertionError(errors)
  (W/'report.json').write_text(json.dumps({'exports':results,'behavior':behavior,'uploads':page.evaluate('__uploads'),'pageErrors':errors,'browser':'offline; renderer/account/cloud/USDZ stubbed'},indent=2))
  print('AR dialog, keyboard guard, hidden cart/demo, quotation label, retries, platform cache and mobile checks passed.')
 finally:
  (W/'browser-console.txt').write_text('\n'.join(logs+errors));browser.close()

# Validate every real browser-generated GLB using the deployed asset validator.
subprocess.run(['node', '-e', """
const fs=require('node:fs'),path=require('node:path');
const {validateAsset}=require('./firebase-share-backend/functions/hall-ar-core.cjs');
const directory=process.argv[1];let count=0;
for(const name of fs.readdirSync(directory).filter(n=>n.endsWith('.glb'))){
 const bytes=fs.readFileSync(path.join(directory,name));validateAsset('glb',bytes);
 const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
 if(!gltf.images?.length||gltf.images.some(i=>i.bufferView===undefined||i.uri))throw Error('Unembedded texture: '+name);
 count++;
}
if(count!==14)throw Error('Expected 14 catalogue exports');
console.log('All 14 textured catalogue GLBs pass the backend validator.');
""", str(W.resolve())],cwd=R,check=True)
