"""Offline Chair AR browser integration (no network or WebGL required).

Run: python chair-configurator/tests/ar-browser.py --artifacts /tmp/chair-ar-tests
Requires Python Playwright and Chromium. Import maps load actual source modules
through in-memory blobs. Only origin/import.meta URL, network publication, and the
USDZ exporter are simulated; GLB export, textures, geometry and dialog are real.
This is not a phone acceptance test or a complete iOS export test.
"""
from playwright.sync_api import sync_playwright
from pathlib import Path
import re,posixpath,json,base64
import argparse,tempfile,shutil
parser=argparse.ArgumentParser();parser.add_argument('--artifacts');parser.add_argument('--chromium')
args=parser.parse_args()
R=Path(__file__).resolve().parents[2]
W=Path(args.artifacts or tempfile.mkdtemp(prefix='chair-ar-tests-'));W.mkdir(parents=True,exist_ok=True)
chromium=args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
if not chromium: raise SystemExit('Chromium was not found. Pass --chromium /path/to/chromium.')
sources={}
rx=re.compile(r'''(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(["'])([^"']+)\1''')
def resolve(parent,spec):
 if spec=='three':return 'chair-configurator/lib/three.module.js'
 if spec.startswith('three/addons/'):return 'chair-configurator/lib/'+spec[13:]
 if spec.startswith('.'):return posixpath.normpath(posixpath.join(posixpath.dirname(parent),spec)).split('?')[0]
 return None
def add(name):
 if name in sources:return
 sources[name]=''
 s=(R/name).read_text()
 def sub(m):
  spec=m[2];target=resolve(name,spec)
  if target:
   add(target)
   return m[0].replace(m[1]+spec+m[1],m[1]+'@source/'+target+m[1])
  return m[0]
 s=rx.sub(sub,s).replace('import.meta.url',json.dumps('https://offline.invalid/'+name))
 if name=='shared-ui/src/ar/dialog.js':s=s.replace('window.location.origin',"'https://www.360configurator.com'")
 sources[name]=s
for name in ['chair-configurator/js/scene.js','chair-configurator/js/ar/controller.js','chair-configurator/js/ar/exportChair.js','chair-configurator/js/materials.js']:
 add(name)
# Native USDZ generation needs separate device testing. This stub is ONLY for
# offline dialog switching/transport tests; actual GLB export uses real r160.
sources['test-usdz'] = '''export class USDZExporter { async parse(root,options){ globalThis.__usdzOptions=options;globalThis.__usdzMeshes=root.children.length; return new Uint8Array(256); } }'''
print(len(sources),'offline modules')
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=chromium,headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=browser.new_page(viewport={'width':1366,'height':900}); errors=[]; logs=[]
 page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e:logs.append(e.text))
 page.set_content('<html><head></head><body><main id="viewer" style="width:900px;height:850px"></main></body></html>')
 css=(R/'shared-ui/styles/ar.css').read_text()
 page.add_style_tag(content='body{margin:0;background:#eef1f3;font-family:Arial,sans-serif}'+css)
 page.evaluate('''modules=>{const imports={};for(const [name,code]of Object.entries(modules))imports['@source/'+name]=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));imports['https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/exporters/USDZExporter.js']=imports['@source/test-usdz'];const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.append(map);}''',sources)
 try:
  output=page.evaluate('''async()=>{ const {ChairScene}=await import('@source/chair-configurator/js/scene.js');
    window.chairState={woodType:'oak',woodColor:'#be8851',fabricType:'linen',fabricColor:'#b88162',quality:'balanced'};
    const THREE=await import('@source/chair-configurator/lib/three.module.js');
    const {GeometryLibrary}=await import('@source/shared-3d/src/geometry/GeometryLibrary.js');
    const {MaterialLibrary}=await import('@source/shared-3d/src/materials/MaterialLibrary.js');
    const {registerChairMaterials}=await import('@source/chair-configurator/js/materials.js');
    const materials=new MaterialLibrary(THREE,{quality:'balanced'});registerChairMaterials(materials);
    window.sceneTest=Object.create(ChairScene.prototype);sceneTest.scene=new THREE.Scene();
    sceneTest.state=chairState;sceneTest.surfaceSystem={materials,geometry:new GeometryLibrary(THREE),invalidate(){}};
    sceneTest.applyMaterials(chairState,{rebuild:true});
    const snapshot=sceneTest.captureARSnapshot();
    const {createChairFirebaseARAsset}=await import('@source/chair-configurator/js/ar/exportChair.js');
    const asset=await createChairFirebaseARAsset(snapshot,'glb');
    const bytes=new Uint8Array(await asset.blob.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return {bytes:bytes.length,base64:btoa(s),stats:asset.stats};}''')
  (W/'chair-default.glb').write_bytes(base64.b64decode(output.pop('base64')))

  print('EXPORT:',output)
 except Exception as e:
  print('export error',e);raise
 # Test every current wood/upholstery choice, including the actual texture maps.
 results=[]
 for wood in ['beech','ash','oak']:
  result=page.evaluate("""async wood=>{const {FABRIC_TYPES}=await import('@source/chair-configurator/js/materials.js');
    const check=(ok,message)=>{if(!ok)throw Error(message)};
    const outputs=[];
    for(const fabric of FABRIC_TYPES){
      const next={...chairState,woodType:wood,woodColor:'#795431',fabricType:fabric.id,fabricColor:'#2b7391'};
      sceneTest.setState(next);
      const before=sceneTest.model.group.children.slice(),snap=sceneTest.captureARSnapshot();
      check(snap.stats.sourceMeshes===18,'All 18 parts must remain');
      check(snap.model.images.length===6,'All six wood/fabric texture maps must remain');
      check(snap.model.textures.every(t=>Number.isFinite(t.repeat[0])&&Number.isFinite(t.repeat[1])),'UV transforms');
      const colours=snap.model.materials.map(m=>m.color).sort((a,b)=>a-b);
      check(JSON.stringify(colours)===JSON.stringify([0x795431,0x2b7391].sort((a,b)=>a-b)),'Independent custom colours');
      check(before.every((o,i)=>o===sceneTest.model.group.children[i]),'Editor meshes replaced during AR capture');
      outputs.push({wood,fabric:fabric.id,images:snap.model.images.length,parts:snap.stats.sourceMeshes});
    }
    return outputs;
  }""",wood)
  results.extend(result)
 # The uploaded snapshot remains immutable after later editor changes.
 page.evaluate("""async()=>{const {createChairARController}=await import('@source/chair-configurator/js/ar/controller.js');
    globalThis.uploads=[];globalThis.sessions=new Map();globalThis.failNext=false;globalThis.lang='en-US';globalThis.feedback=[];
    globalThis.savedSnapshot=sceneTest.captureARSnapshot();globalThis.savedJSON=JSON.stringify(savedSnapshot);
    sceneTest.setState({...chairState,woodColor:'#e7d2ac',fabricColor:'#5643a1'});
    if(JSON.stringify(savedSnapshot)!==savedJSON)throw Error('Snapshot changed with editor');
    globalThis.fetch=async (url,options={})=>{
      const id=new URL(url).searchParams.get('id');const session=sessions.get(id);
      if(!session)return new Response(JSON.stringify({error:{code:'not-found'}}),{status:404});
      if(options.method==='HEAD')return new Response(null,{status:200,headers:{'content-length':String(session.byteLength)}});
      return new Response(JSON.stringify(session),{status:200});
    };
    globalThis.XMLHttpRequest=class {
      constructor(){this.upload={};this.headers={};}
      open(method,url){this.url=url;}setRequestHeader(k,v){this.headers[k]=v;}abort(){this.aborted=true;this.onabort?.();}
      send(blob){this.timer=setTimeout(()=>{if(this.aborted)return;
        const format=this.headers['X-Hall-AR-Format'];const product=new URL(this.url).searchParams.get('product');
        if(product!=='chair')throw Error('Wrong product upload');
        uploads.push({format,bytes:blob.size});
        if(failNext){failNext=false;this.status=503;this.responseText=JSON.stringify({error:{code:'service-unavailable'}});this.onload();return;}
        const id=String(uploads.length).padStart(32,'a');const session={id,product,format,byteLength:blob.size,expiresAtMs:Date.now()+86400000};sessions.set(id,session);
        this.upload.onprogress?.({lengthComputable:true,loaded:blob.size,total:blob.size});
        this.status=201;this.responseText=JSON.stringify(session);this.onload();
      },200);}
    };
    Object.defineProperty(navigator,'clipboard',{value:{async writeText(s){globalThis.copied=s;}}});
    globalThis.dialogTest=createChairARController({getSnapshot:()=>sceneTest.captureARSnapshot(),getLocale:()=>lang,onFeedback:(...args)=>feedback.push(args)});
    dialogTest.open();
 }""")
 page.wait_for_function("document.querySelector('#chairARDialog [data-qr]').hidden===false",timeout=20000)
 assert page.locator('[value="android"]').is_checked()
 assert 'chair-configurator/ar.html' in page.locator('[data-open]').get_attribute('href')
 assert 'Firebase' not in page.locator('#chairARDialog').inner_text()
 assert page.locator('[data-copy="snapshot"]').count()==0 and page.locator('[data-copy="scale"]').count()==0
 page.screenshot(path=str(W/'chair-ar-dialog-desktop.png'))
 page.click('[data-copy-link]');assert page.evaluate('copied').startswith('https://www.360configurator.com/chair-configurator/ar.html?')
 page.click('[value="ios"]');page.wait_for_function("document.querySelector('[data-file]').textContent.startsWith('USDZ')&&!document.querySelector('[data-qr]').hidden",timeout=20000)
 assert page.evaluate('__usdzMeshes')==2
 assert page.evaluate('__usdzOptions.ar.planeAnchoring.alignment')=='horizontal'
 assert 'mode=ios' in page.locator('[data-open]').get_attribute('href')
 # Switching back uses the exact same prepared Android snapshot.
 n=page.evaluate('uploads.length');page.click('[value="android"]');page.wait_for_function("!document.querySelector('[data-qr]').hidden");assert page.evaluate('uploads.length')==n
 # A fresh dialog captures the changed chair; a failed upload can be retried.
 page.evaluate("dialogTest.close();sceneTest.setState({...chairState,woodColor:'#0099aa'});failNext=true;dialogTest.open()")
 page.wait_for_function("!document.querySelector('[data-retry]').hidden",timeout=20000)
 assert 'temporarily unavailable' in page.locator('[data-error]').inner_text()
 page.click('[data-retry]');page.wait_for_function("!document.querySelector('[data-qr]').hidden",timeout=20000)
 for lang,word in [('ro-RO','scaun'),('de-DE','Stuhl'),('en-US','chair')]:
  page.evaluate('x=>{lang=x;dialogTest.refresh()}',lang)
  assert word.lower() in page.locator('#chair-ar-title').inner_text().lower()
 page.set_viewport_size({'width':390,'height':844});page.evaluate("dialogTest.refresh()")
 dims=page.locator('#chairARDialog').bounding_box();assert dims['x']>=0 and dims['x']+dims['width']<=391
 page.screenshot(path=str(W/'chair-ar-dialog-mobile.png'))
 print('BROWSER TESTS:',len(results),'textured combinations; Android QR, iOS stub, retries, localization, mobile, cache, clipboard passed')
 print('Errors',errors,'Console tail',logs[-3:])
 assert not errors
 (W/'browser-validation.json').write_text(json.dumps({'texturedCases':results,'defaultGLB':output,'errors':errors,'usdzExport':'stubbed for offline dialog tests; not a real USDZ export'},indent=2))
 browser.close()
