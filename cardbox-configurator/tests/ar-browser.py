"""Offline integration against the actual Cardbox editor and AR modules.

GLB geometry and embedded artwork are real; only the WebGL renderer is stubbed. Tenant/account services and Firebase
publication are mocked, and the USDZ exporter is a dialog-only test double.
The bundled r160 fixture is used instead of Cardbox's production r169 CDN runtime.
Run: python cardbox-configurator/tests/ar-browser.py --artifacts /tmp/cardbox-ar
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import re,posixpath,json,base64,argparse,shutil,tempfile
parser=argparse.ArgumentParser();parser.add_argument('--artifacts');parser.add_argument('--chromium');args=parser.parse_args()
R=Path(__file__).resolve().parents[2];W=Path(args.artifacts or tempfile.mkdtemp(prefix='cardbox-ar-'));W.mkdir(parents=True,exist_ok=True)
chromium=args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
if not chromium:raise SystemExit('Chromium required.')
sources={};rx=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"']+)\1''')
LIB='window-configurator/src/client/lib/'
def resolve(parent,spec):
 if spec=='three':return 'test/three.js'
 if spec=='three/addons/exporters/USDZExporter.js':return 'test/usdz.js'
 if spec.startswith('three/addons/'):return LIB+spec[13:]
 if spec.startswith('.'):return posixpath.normpath(posixpath.join(posixpath.dirname(parent),spec)).split('?')[0]
 return None
sources['shared-ui/src/tenantBootstrap.js']='export async function requireTenantConfiguratorAccess(){return null;}'
sources['test/three.js']="export * from '@source/"+LIB+"three.module.js'; export class WebGLRenderer {constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>1};}setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;}render(){}dispose(){}}"
sources['test/usdz.js']='export class USDZExporter { async parseAsync(root,opts){globalThis.__iosOptions=opts;globalThis.__iosSize=new (globalThis.__THREE.Box3)().setFromObject(root).getSize(new (globalThis.__THREE.Vector3)()).toArray();return new Uint8Array(256);} }'
# Use the actual topbar and callback wiring with an offline shell. Authentication,
# account/cart operations are not part of this browser test.
sources['shared-ui/src/standaloneShell.js']='''export function mountStandaloneConfiguratorShell(options){
 const host=document.createElement('nav');host.style.cssText='position:fixed;top:0;left:0;width:100%;height:47px;z-index:30;background:white;display:flex;align-items:center;justify-content:space-between;padding:0 20px;box-sizing:border-box;font:bold 16px Arial';
 host.innerHTML='<span>360 Configurator · Cardbox#1</span><button data-action="view-ar">AR</button>';document.body.prepend(host);
 const shell={host,state:{locale:'en-US',units:'metric',currency:'EUR'},settingsPanelCollapsed:false,setActionEnabled(){},setToolState(){},setToolActive(){},setToolDisabled(){},markDirty(){},setSettingsPanelCollapsed(){},showFeedback(...args){globalThis.__feedback.push(args)}};
 host.querySelector('button').onclick=()=>options.callbacks.onViewAR();globalThis.__shellOptions=options;return shell;
}'''
sources['shared-ui/src/history/undoManager.js']='export class SharedUndoManager {bindSource(){}record(){}undo(){}}'
sources['shared-ui/src/tools/registry.js']='export function resolveSharedTools(items){return items.map(i=>typeof i===\'string\'?{id:i}:i);}'
sources['shared-ui/src/shareState.js']='export function createShareUrl(){throw new Error("Share is not part of AR capture");}'
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
 if name=='cardbox-configurator/js/app.js':s+='''\nwindow.__test={
  THREE,scene,camera,renderer,boxGroup,textGroup,imageGroup,packagingClosureGroup,packagingFeatureGroup,
  types:PACKAGING_BOX_TYPES,papers:PACKAGING_PAPERS,flutes:PACKAGING_FLUTES,
  capture:()=>captureCurrentCardboxAR(),getState:()=>state,
  async configure(type){resetConfiguration();state.boxType=type;state.closures={top:PACKAGING_BOX_TYPES[type].top,bottom:PACKAGING_BOX_TYPES[type].bottom};state.features=packagingDefaultFeatures(type);packagingSetBaseDimensions(...PACKAGING_BOX_TYPES[type].dims);renderAll();await waitForCardboxArtwork(()=>cardboxARImageTask);},
  render:()=>renderAll(),setOpen(t,b){topClosureProgress=t;bottomClosureProgress=b;applyToolVisualState();},
  viewTools(){transparentMode=true;artworkVisible=false;boxLiftCurrent=500;boxLiftTarget=500;lidLiftEnabled=true;rebuildSurfaceMeshes();applyToolVisualState();},
  select(){selectFace(surfaceDescriptors.find(f=>f.axis==='z'&&f.sign===1),1);},
  async addArt(){const face=surfaceDescriptors.find(f=>f.axis==='z'&&f.sign===1),anchor=faceCenter(face);
   const spec={text:'HANDLE WITH CARE',size:24,fontFamily:'Arial',bold:true,italic:true,underline:true,underlineStyle:'double',textColor:'#b21235',backgroundColor:'transparent'};
   state.textPlacements.push({id:'committed-text',spec,face:copyFace(face),sideFactor:1,anchor:anchor.toArray()});
   const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const ctx=canvas.getContext('2d');ctx.fillStyle='#178fa6';ctx.fillRect(0,0,96,64);ctx.fillStyle='#ffdd00';ctx.fillRect(10,10,65,30);
   const imageFace=surfaceDescriptors.find(f=>f.axis==='x'&&f.sign===1);
   state.imagePlacements.push({id:'committed-image',spec:{dataUrl:canvas.toDataURL(),width:100,height:64,naturalWidth:96,naturalHeight:64},face:copyFace(imageFace),sideFactor:1,anchor:faceCenter(imageFace).toArray()});renderAll();},
  async wrapArt(){await this.addArt();const p=state.textPlacements[0];p.anchor=[270,150,200];renderAll();},
  delayedImage(ms=100){const original=loadImageElement;imageElementCache.clear();loadImageElement=async data=>{await new Promise(r=>setTimeout(r,ms));return original(data);};renderAll();return()=>loadImageElement=original;},
  badImage(){state.imagePlacements[0].spec.dataUrl='data:image/png;base64,invalid';renderAll();},
  editGuard(on){placementMode=on;},foldGuard(on){foldAnimationActive=on;},
 };window.__THREE=THREE;'''
 sources[name]=s
add(LIB+'three.module.js')
for name in ['cardbox-configurator/js/app.js','cardbox-configurator/js/sharedShell.js','cardbox-configurator/js/ar/exportCardbox.js','shared-ui/src/ar/dialog.js']:add(name)
html=(R/'cardbox-configurator/index.html').read_text();html=re.sub(r'<script\b[\s\S]*?</script>','',html);html=re.sub(r'<link\b[^>]*>','',html)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=chromium,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1366,'height':900});errors=[];logs=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:logs.append(e.text))
 page.set_content(html);page.add_style_tag(content=(R/'cardbox-configurator/styles.css').read_text()+(R/'shared-ui/styles/ar.css').read_text())
 page.evaluate('''modules=>{globalThis.__feedback=[];const imports={};for(const[name,code]of Object.entries(modules))imports['@source/'+name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));const s=document.createElement('script');s.type='importmap';s.textContent=JSON.stringify({imports});document.head.append(s);}''',sources)
 try:
  page.evaluate("async()=>{await import('@source/cardbox-configurator/js/app.js');await import('@source/cardbox-configurator/js/sharedShell.js');}")
  results=[]
  for typ in ['standard','full-overlap','telescope','archive','pizza','mailer','auto-bottom','two-point-glued','sleeve-drawer']:
   res=page.evaluate('''async type=>{const t=__test;await t.configure(type);const before=JSON.stringify(t.boxGroup.toJSON());const s=await t.capture();if(JSON.stringify(t.boxGroup.toJSON())!==before)throw Error('Editor mutated');const {createCardboxFirebaseARAsset}=await import('@source/cardbox-configurator/js/ar/exportCardbox.js');const a=await createCardboxFirebaseARAsset(s,'glb');const bytes=new Uint8Array(await a.blob.arrayBuffer());let data='';for(let i=0;i<bytes.length;i+=8192)data+=String.fromCharCode(...bytes.subarray(i,i+8192));return {type,stats:s.stats,bytes:bytes.length,base64:btoa(data)};}''',typ)
   (W/(typ+'.glb')).write_bytes(base64.b64decode(res.pop('base64')));results.append(res)
  print('9 real catalogue exports:',[(r['type'],r['bytes'])for r in results])
  sweep=page.evaluate('''async()=>{let variants=0;const t=__test;
   for(const[type,spec]of Object.entries(t.types)){
    await t.configure(type);
    for(const which of ['top','bottom'])for(const closure of spec[which+'Options']){
     t.getState().closures={top:spec.top,bottom:spec.bottom,[which]:closure};t.render();const s=await t.capture();
     if(s.stats.sourceMeshes<8)throw Error('Incomplete '+type+' '+closure);
     const absent=Object.keys(s.stats.components).filter(k=>k.startsWith('box-y:'+ (which==='top'?'1:':'-1:')));
     if((closure==='open')!==!absent.length)throw Error('Wrong closure visibility '+type+'/'+which+'/'+closure);variants++;
    }
   }
   await t.configure('standard');
   for(const flute of Object.keys(t.flutes))for(const preset of ['TFT','AFT','AFA']){
    const s=t.getState();s.board={construction:flute.length===1?'CO3':'CO5',flute,preset,layers:[]};t.render();const snapshot=await t.capture();
    if(snapshot.stats.sourceMeshes<12)throw Error('Board appearance incomplete');variants++;
   }
   return variants;}''')
  print('Closure and board variants:',sweep)
  # Closed/open closures, geometry holes, split inside/outside colours, wrapped
  # text and embedded logos, immediate capture while images still decode.
  summary=page.evaluate('''async()=>{const t=__test;await t.configure('standard');
   const state=t.getState();state.faceColors.outer={'z:+':'#123456'};state.faceColors.inner={'z:+':'#f9d884'};state.features={...state.features,handleType:'reinforced',handlePlacement:'front',holeType:'round',holePlacement:'sides',holeCount:3};
   t.render();await t.addArt();const restoreLoader=t.delayedImage(80);const start=performance.now();const snap=await t.capture();restoreLoader();const waited=performance.now()-start;
   const parsed=new __THREE.ObjectLoader();const root=await parsed.parseAsync(snap.model);const colors=root.children.map(m=>m.material.color.getHexString());
   if(!colors.includes('123456')||!colors.includes('f9d884'))throw Error('surface colour missing');
   if(!snap.stats.components['printed-text']||!snap.stats.components['printed-image'])throw Error('artwork missing');
   window.__committedSnapshot=snap;
   const api=CARDBOX_CONFIGURATOR_API;const before=JSON.stringify(api.captureState());t.select();t.setOpen(1,1);const opened=await t.capture();if(JSON.stringify(opened.model.geometries)===JSON.stringify(snap.model.geometries))throw Error('opening lost');
   t.setOpen(0,0);const closed=await t.capture();t.viewTools();const toolSnapshot=await t.capture();
   // Rebuilding changes UUIDs but positions, colours and atlas pixels must match.
   if(closed.stats.triangles!==toolSnapshot.stats.triangles||JSON.stringify(closed.stats.components)!==JSON.stringify(toolSnapshot.stats.components))throw Error('inspection changed parts');
   for(let i=0;i<closed.model.geometries.length;i++)for(const [name,attribute]of Object.entries(closed.model.geometries[i].data.attributes)){
    const next=toolSnapshot.model.geometries[i].data.attributes[name].array;
    if(attribute.array.length!==next.length||attribute.array.some((v,j)=>Math.abs(v-next[j])>2e-6))throw Error('inspection changed geometry '+name);
   }
   const colorsOf=s=>JSON.stringify(s.model.materials.map(m=>[m.color,m.opacity,m.transparent]));if(colorsOf(closed)!==colorsOf(toolSnapshot))throw Error('inspection changed materials');
   if(!api.getToolState().transparentMode||api.getToolState().artworkVisible)throw Error('inspection tools reset');
   t.editGuard(true);let edit='';try{await t.capture()}catch(e){edit=e.code}t.editGuard(false);if(edit!=='editing-in-progress')throw Error('editing guard');
   t.foldGuard(true);let fold='';try{await t.capture()}catch(e){fold=e.code}t.foldGuard(false);if(fold!=='animation-in-progress')throw Error('animation guard');
   const {createCardboxFirebaseARAsset}=await import('@source/cardbox-configurator/js/ar/exportCardbox.js');const asset=await createCardboxFirebaseARAsset(toolSnapshot,'glb');const b=new Uint8Array(await asset.blob.arrayBuffer());let data='';for(let i=0;i<b.length;i+=8192)data+=String.fromCharCode(...b.subarray(i,i+8192));
   return {stats:toolSnapshot.stats,waited,bytes:b.length,base64:btoa(data),edit,fold};}''')
  (W/'decorated.glb').write_bytes(base64.b64decode(summary.pop('base64')));print('decorated:',summary)
  # Bad image decode must be visible failure rather than a success with a bare box.
  code=page.evaluate("async()=>{__test.badImage();try{await __test.capture();return 'no-error'}catch(e){return e.code}}")
  assert code=='artwork-unavailable',code
  page.evaluate("async()=>{await __test.configure('standard');await __test.addArt();}")
  # Mock publication only. Native GLB export above and during the dialog is real.
  page.evaluate('''()=>{globalThis.__uploads=[];globalThis.__rejectUpload=false;
   globalThis.XMLHttpRequest=class{constructor(){this.upload={};this.headers={};}open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}abort(){this.onabort?.();}async send(blob){const product=new URL(this.url).searchParams.get('product'),format=this.headers['X-Hall-AR-Format'];__uploads.push({product,format,size:blob.size});await new Promise(r=>setTimeout(r,30));if(__rejectUpload){this.onerror?.();return;}this.status=201;const id=String(__uploads.length).padStart(32,'A');globalThis.__lastSession={id,product,format,byteLength:blob.size,expiresAtMs:Date.now()+86400000};this.responseText=JSON.stringify(__lastSession);this.upload.onprogress?.({lengthComputable:true,loaded:blob.size,total:blob.size});this.onload?.();}};
   globalThis.fetch=async(url,options)=>{if(String(url).includes('/getHallAR'))return new Response(options?.method==='HEAD'?null:JSON.stringify(__lastSession),{status:200,headers:{'content-length':String(__lastSession.byteLength),'content-type':'application/json'}});throw Error('Unexpected network request '+url);};
  }''')
  page.locator('[data-action="view-ar"]').click();page.wait_for_function("!!document.querySelector('#cardboxARDialog [data-open]')?.href",timeout=30000)
  dialog=page.locator('#cardboxARDialog');assert dialog.locator('[value=android]').is_checked();assert page.evaluate('__uploads.at(-1).product')=='cardbox'
  assert not dialog.locator('[data-copy="scale"],[data-copy="snapshot"]').count()
  page.screenshot(path=str(W/'cardbox-ar-dialog-desktop.png'))
  dialog.locator('[value=ios]').check();page.wait_for_function("document.querySelector('#cardboxARDialog [data-open]')?.href?.includes('mode=ios')",timeout=30000)
  assert page.evaluate('__uploads.at(-1).format')=='usdz'
  page.set_viewport_size({'width':390,'height':844});page.screenshot(path=str(W/'cardbox-ar-dialog-mobile.png'))
  assert dialog.bounding_box()['width']<=390
  for locale in ['ro-RO','de-DE','en-US']:
   page.evaluate("locale=>{CARDBOX_CONFIGURATOR_SHARED_SHELL.state.locale=locale;__shellOptions.callbacks.onPreferenceChange('locale',locale,{locale});}",locale)
   assert not re.search('Firebase|Supabase|real-world metres',dialog.inner_text())
  dialog.locator('[data-close]').click();page.evaluate('__rejectUpload=true');page.locator('[data-action="view-ar"]').click()
  page.wait_for_function("!document.querySelector('#cardboxARDialog [data-error]').hidden",timeout=30000)
  page.evaluate('__rejectUpload=false');dialog.locator('[data-retry]').click();page.wait_for_function("!!document.querySelector('#cardboxARDialog [data-open]')?.href",timeout=30000)
  dialog.locator('[data-close]').click()
  # Async capture race: close/reopen and late failures cannot replace new QR or
  # report obsolete errors. Mode changes during capture use the same snapshot.
  race=page.evaluate('''async()=>{const {createFirebaseARDialog}=await import('@source/shared-ui/src/ar/dialog.js');
   const defer=()=>{let resolve,reject;return{promise:new Promise((a,b)=>{resolve=a;reject=b}),get resolve(){return resolve},get reject(){return reject}}};let first=defer(),second=defer(),calls=0,feedback=[],exports=[];
   const d=createFirebaseARDialog({product:'cardbox',getSnapshot:()=>++calls===1?first.promise:second.promise,onFeedback:(...x)=>feedback.push(x),snapshotKey:s=>s.id,exportAsset:async(s,f)=>{exports.push([s.id,f]);return{format:f,blob:new Blob([new Uint8Array(256)])}},publish:async a=>({id:'r'.repeat(32),format:a.format,byteLength:256,expiresAtMs:Date.now()+86400000})});
   d.open();d.close();d.open();first.reject(Error('stale'));d.dialog.querySelector('[value=ios]').checked=true;d.dialog.querySelector('[value=ios]').dispatchEvent(new Event('change'));second.resolve({id:'new'});await new Promise(r=>setTimeout(r,80));
   const ok=feedback.length===0&&calls===2&&exports.length===1&&exports[0][0]==='new'&&exports[0][1]==='usdz';d.destroy();return{ok,calls,feedback,exports};}''')
  assert race['ok'],race
  print('async races:',race)
  (W/'report.json').write_text(json.dumps({'catalogue':results,'decorated':summary,'closureAndBoardVariants':sweep,'asyncRace':race,'errors':errors,'runtime':'r160 fixture; simulated Firebase/USDZ'},indent=2))
  assert not errors,errors
 finally:
  (W/'browser.log').write_text('\n'.join(logs));(W/'page-errors.json').write_text(json.dumps(errors));browser.close()
