"""Real Chromium IndexedDB / file / image / project-panel checks.
The geometry and persistence modules are real. Viewer/application callbacks are
simulated here; use run-full-site.py for the complete tenant site and WebGL.
"""
from pathlib import Path
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import threading, os, shutil, json
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass
HTML = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#25333c;background:#e6e9e5}
#viewer{position:fixed;inset:0 370px 0 0}#canvasHost{width:100%;height:100%}.sidebar{position:fixed;right:0;top:0;bottom:0;width:370px;overflow:auto;background:#fff;padding:18px}
.accordion-toggle{padding:10px 0}.photo-flow-card{padding:20px;max-width:440px}.note{color:#566570}
body.dark .sidebar{background:#253139;color:#e4ebef}body.dark .note{color:#c2ccd2}
@media(max-width:760px){#viewer{right:0}.sidebar{width:min(352px,100vw)}}
</style></head><body><section id="viewer"><div id="canvasHost"></div><div class="photo-flow-card"></div></section><aside class="sidebar"></aside></body></html>'''
SETUP = '''async ({dbName}) => {
const S=await import('/js/projectStore.js'), P=await import('/js/pavingProject.js'), A=await import('/js/projectAssets.js');
const C=await import('/js/projectSession.js'), U=await import('/js/projectPanel.js'), M=await import('/js/model.js');
const F=await import('/tests/fixtures/model-results.mjs'), I=await import('/js/segmentationAdapter.js');
window.modules={S,P,A,C,U,M};window.store=new S.ProjectStore({name:dbName});
window.result=F.fixture({width:200,height:160});window.cal=I.prepareModelImport(result).camera;
const rect=(x,z,l,w)=>[{x,z},{x:x+l,z},{x:x+l,z:z+w},{x,z:z+w}];
window.state=M.normalize({shape:'regions',areaOrigin:{x:0,z:0},areaRegions:[{outer:rect(0,0,4,4),holes:[rect(1,1,1,1),rect(2.5,1,.5,1)],curbs:{outer:true,holes:[true,false]}}],rotation:37});
window.source=location.origin+'/tests/fixtures/server-model-photo.png';window.photo={photoId:crypto.randomUUID(),width:200,height:160};
window.view={calibration:{type:'metric_model',value:cal,origin:{x:0,z:0}},photoMode:false,photoSetup:false,top:false,pose:{position:[1,3,4],quaternion:[0,0,0,1],target:[0,0,0],fov:40}};
window.revision=0;window.step='done';window.locale='en-US';window.applies=0;window.modelCalls=0;
window.session=C.createProjectSession({store,getPhoto:()=>photo,getSource:()=>source,getRevision:()=>revision,
 capture:()=>({state,view}),getDetection:()=>({key:'fixture',payload:result,targets:['grass','dirt']}),
 onStatus:()=>window.ui?.update(),apply:async(b,guard)=>{if(!guard())throw new Error('stale');
 state=b.document.state;view=b.document.view;photo=b.assets.photo?{photoId:crypto.randomUUID(),width:200,height:160}:null;revision++;applies++;step='done';},
});
window.api={getProjectStatus:()=>session.getStatus(),saveLocalProject:(...a)=>session.save(...a),listLocalProjects:()=>session.list(),
 openLocalProject:id=>session.openLocal(id),deleteLocalProject:(...a)=>session.remove(...a),openProjectFile:f=>session.openFile(f),
 downloadProject:o=>session.download(o),reattachProjectPhoto:f=>session.reattach(f),clearLocalProjects:()=>session.clearLocalData(),projectFileName:P.projectFileName};
window.ui=U.mountProjectPanel({api,getLocale:()=>locale,getStep:()=>step});
window.photoBlob=await(await fetch(source)).blob();window.asset=await A.makePhotoAsset(photoBlob);
window.documentFixture=P.validateProjectDocument({format:P.PROJECT_FORMAT,version:1,state,view,photo:asset.meta});
window.initialState=JSON.stringify(state);window.initialView=JSON.stringify(view);window.ready=true;
}'''
checks=[]
def check(condition, name):
    assert condition, name
    checks.append(name)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
origin=f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1280,'height':900},accept_downloads=True)
        context.route('**/__project__',lambda r:r.fulfill(status=200,content_type='text/html',body=HTML))
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
        page.goto(origin+'/__project__');page.evaluate(SETUP,{'dbName':'tiles-step5-browser-tests'})
        page.evaluate('session.photoLoaded(photo,source)')
        check(page.evaluate('session.getStatus().cached'), 'original PNG decoded, hashed and cached in native IndexedDB')
        page.locator('#pavingProjectPanel summary').click()
        page.locator('[data-project-name]').fill('Client garden')
        page.locator('[data-save]').click()
        page.wait_for_function("session.getStatus().phase==='saved'")
        page.wait_for_function("document.querySelector('[data-project-list]').options.length>1")
        page.evaluate('window.saved=session.savedState();window.record=store.list().then(r=>r[0])')
        check(page.evaluate('(async()=> (await store.list()).length===1)()'), 'normal Project Save UI persists one named manifest')
        check(page.evaluate("!JSON.stringify(saved).includes('counts') && !JSON.stringify(saved).includes('base64')"), 'account payload contains no raw photo or masks')
        page.evaluate("state=modules.M.normalize({shape:'regions',areaRegions:[],areaOrigin:{x:0,z:0}});revision++")
        page.locator('[data-open]').click();page.wait_for_function('applies===1')
        check(page.evaluate('JSON.stringify(state)===initialState && state.areaRegions[0].holes.length===2'), 'Open UI restores every intentional hole and its curb flags')
        check(page.evaluate('view.photoMode===false && view.pose.position[0]===1 && modelCalls===0'), 'free-camera pose restored without inference')
        other=context.new_page();other.goto(origin+'/__project__');other.evaluate(SETUP,{'dbName':'tiles-step5-browser-tests'})
        other.evaluate('(async()=>{const r=(await store.list())[0];await session.openLocal(r.id)})()')
        check(other.evaluate('state.areaRegions[0].holes.length===2 && session.getStatus().cached'), 'a fresh page reopens actual IndexedDB photo/camera/design')
        page.evaluate('window.before=(async()=>{const r=(await store.list())[0];return r})()')
        other.evaluate('(async()=>{const r=(await store.list())[0];await store.save("Other tab",documentFixture,{photo:asset},{id:r.id,expectedRevision:r.revision})})()')
        conflict=page.evaluate('''async()=>{const r=await before;try{await store.save('Stale update',documentFixture,{photo:asset},{id:r.id,expectedRevision:r.revision});return false}catch(e){return e.code==='projectConflict'}}''')
        check(conflict,'optimistic revision check rejects a stale second-tab overwrite')
        check(page.evaluate('(async()=> (await store.list())[0].name==="Other tab")()'), 'conflict leaves the newer record intact')
        page.evaluate('''async()=>{const r=(await store.list())[0];try{await store.transaction(['projects','assets'],'readwrite',(tx,set,abort)=>{tx.objectStore('projects').put({id:r.id,name:'Half written'});tx.objectStore('assets').clear();abort(new DOMException('Full','QuotaExceededError'));})}catch(e){window.abortMessage=e.message}}''')
        check(page.evaluate('(async()=> (await store.list())[0].name==="Other tab" && !!(await store.asset(asset.meta)))()'), 'aborted native transaction retains both previous manifest and photo')
        check(page.evaluate('abortMessage.includes("full")'), 'quota-style transaction abort is reported, not shown as saved')
        page.evaluate('window.fullFile=session.download({includeResult:true})')
        other.evaluate('store.clear()')
        # Import the real Blob via browser File input / Python bytes, not a URL in JSON.
        content=page.evaluate('(async()=>Array.from(new Uint8Array(await (await fullFile).arrayBuffer())))()')
        page.locator('[data-file]').set_input_files({'name':'garden.paving.json','mimeType':'application/json','buffer':bytes(content)})
        page.wait_for_function('applies===2')
        check(page.evaluate('state.areaRegions[0].holes.length===2 && modelCalls===0'), 'file picker reopens full project without model execution')
        photo_backup=page.evaluate('session.savedState()')
        page.evaluate('store.clear()')
        page.evaluate('(s)=>session.restoreSaved(s)',photo_backup)
        check(page.evaluate('photo===null && session.getStatus().missingPhoto && state.areaRegions[0].holes.length===2'), 'missing local photo leaves usable geometry and an explicit recovery state')
        page.wait_for_selector('[data-reattach]',state='visible')
        page.locator('[data-photo]').set_input_files(str(ROOT/'tests/fixtures/server-model-photo.png'))
        page.wait_for_function('photo!==null && !session.getStatus().missingPhoto')
        check(page.evaluate('state.areaRegions[0].holes.length===2'), 'exact original-file reattachment preserves holes')
        # Test large base64 payload handling without regex stack overflow.
        page.evaluate('''async()=>{const big=new Blob([photoBlob,new Uint8Array(2*1024*1024)],{type:'image/png'});const a=await modules.A.makePhotoAsset(big);
 const d={...documentFixture,photo:a.meta};const file=await modules.A.encodeProjectFile(d,{photo:a});const read=await modules.A.decodeProjectFile(file);window.largeOK=read.assets.photo.blob.size===big.size;}''')
        check(page.evaluate('largeOK'),'multi-megabyte project file decodes without regex recursion failure')
        page.evaluate('''async()=>{const original=crypto.subtle.digest.bind(crypto.subtle);let release;const gate=new Promise(r=>release=r);
 crypto.subtle.digest=async(...a)=>{await gate;return original(...a)};
 const pending=store.cacheAssets({photo:asset}).then(()=>false,e=>e.code==='storageChanged');
 await store.clear();release();window.clearedPending=await pending;crypto.subtle.digest=original;}''')
        check(page.evaluate('clearedPending'),'Clear local data invalidates writes that were still hashing')
        page.evaluate('step="upload";ui.update()')
        check(page.evaluate('document.querySelector(".photo-flow-card #pavingProjectPanel")!==null'),'projects are accessible at the initial upload screen')
        page.evaluate('step="done";locale="ro-RO";ui.update()')
        check(page.locator('#pavingProjectPanel summary').inner_text()=='Proiect · Salvare și deschidere','Romanian project controls translated')
        page.evaluate('locale="de-DE";ui.update();document.body.classList.add("dark")')
        check('Projekt' in page.locator('#pavingProjectPanel summary').inner_text(),'German controls and dark theme mount')
        for size in [{'width':390,'height':844},{'width':844,'height':390},{'width':390,'height':844}]:
            page.set_viewport_size(size)
            page.wait_for_timeout(50)
            check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'project panel remains inside viewport {size}')
        # Names render as text, never HTML.
        page.evaluate('''async()=>{await store.save('<img src=x onerror=alert(1)>',documentFixture,{photo:asset});await ui.refresh()}''')
        check(page.locator('#pavingProjectPanel img').count()==0,'hostile project titles cannot create DOM elements')
        page.set_viewport_size({'width':1280,'height':900});page.evaluate('locale="en-US";document.body.classList.remove("dark");ui.update()')
        out=os.getenv('BROWSER_SCREENSHOT_DIR')
        if out:
            Path(out).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(out)/'project-desktop.png'),full_page=True)
        check(not errors,'no unhandled browser errors')
        print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
        browser.close()
finally:
    server.shutdown();server.server_close()
