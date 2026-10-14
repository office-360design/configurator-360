"""Read-only Debug integration checks in Chromium.
Uses real UI, masks, projection, canvas and export code with a synthetic camera,
mock application/service, no WebGL renderer and no model weights or network.
Run from tiles-configurator: python tests/run-debug-dom.py
"""
from pathlib import Path
import json, re, os, shutil, base64
from playwright.sync_api import sync_playwright
root = Path(__file__).resolve().parents[1]
modules = {}; order = []
def bundle(path):
    path = path.resolve(); key = str(path.relative_to(root))
    if key in modules: return key
    source = path.read_text(); modules[key] = ''
    def imported(match):
        names, target = match.group(1), match.group(2)
        child = bundle(path.parent/target)
        return 'const {' + re.sub(r'\s+as\s+', ':', names) + '} = M['+json.dumps(child)+'];'
    source = re.sub(r"import\s*\{([\s\S]*?)\}\s*from\s*['\"]([^'\"]+)['\"];", imported, source)
    exports = re.findall(r'export\s+(?:async\s+)?(?:function|const|class|let)\s+(\w+)', source)
    source = re.sub(r'\bexport\s+(?=(?:async\s+)?(?:function|const|class|let)\b)', '', source)
    if re.search(r'^import\s',source,re.M): raise ValueError('Unsupported harness import in '+key)
    modules[key] = 'M['+json.dumps(key)+']=(()=>{'+source+';return {'+','.join(exports)+'};})();'
    order.append(key); return key
bundle(root/'js/segmentationDebugPanel.js');bundle(root/'tests/fixtures/model-results.mjs')
setup='const M={};'+''.join(modules[k] for k in order)
setup+='''
window.bundle=M['tests/fixtures/model-results.mjs'].fixture();
window.prepared=M['js/segmentationAdapter.js'].prepareModelImport(bundle);
window.photo={photoId:'debug-photo',width:160,height:120,designRevision:1,drawing:false,draftVertices:0};
window.design={areaRegions:structuredClone(prepared.regions),areaOrigin:{x:0,z:0}};
window.step='done';window.inPhoto=true;window.metric=true;window.locale='en-US';window.sourceCalls=0;window.network=0;window.imports=0;window.visible=true;
window.active=true;window.version=1;window.hasResult=true;window.rawOnly=false;window.previewValues=[];
window.service={state:'unchecked',checkedAt:null};window.snap=()=>({photo:{...photo},status:{phase:'ready',apiBase:'http://mock.test/api/paving',timing_s:{segmentation:1,camera:2,total:3}},service,
 calibration:metric?{type:'metric_model',value:prepared.camera}:null,measurementStatus:metric?'estimated':'unavailable',
 sources:{analysis:hasResult?{key:'result-'+version,active}:null,imported:null}});
const transpose=m=>Array.from({length:16},(_,i)=>m[(i%4)*4+Math.floor(i/4)]);
window.getView=()=>{const h=document.getElementById('canvasHost'),w=h.clientWidth,y=h.clientHeight,
 scale=Math.min((w-48)/160,(y-48)/120),rect={left:(w-160*scale)/2,top:(y-120*scale)/2,width:160*scale,height:120*scale};
 const matrices=M['js/modelCamera.js'].modelCameraMatrices(prepared.camera,{width:w,height:y},rect);
 return {photoMode:inPhoto,hasCalibration:metric,width:w,height:y,rect,origin:{x:0,z:0},groundY:-.16,
 view:transpose(matrices.view),projection:transpose(matrices.projection)};};
window.api={getDebugState:()=>structuredClone(snap()),getDebugSource:()=>{sourceCalls++;return hasResult?{kind:'analysis',key:'result-'+version,photoId:photo.photoId,
 active,payload:structuredClone(bundle),targets:['grass','dirt'],prepared:rawOnly?null:{image:prepared.camera.image,masks:structuredClone(prepared.masks)},
 summary:rawOnly?null:{diagnostics:prepared.diagnostics,warnings:prepared.warnings}}:null;},
 getDebugView:getView,setDebugPreviewVisible:v=>{visible=v;previewValues.push(v);},getPavingState:()=>structuredClone(design),
 getPhotoSource:()=>({...photo}),getModelImportSummary:()=>hasResult?{diagnostics:prepared.diagnostics}:null,cancelPhotoAnalysis(){},
 importModelResult:payload=>{imports++;window.importedResult=M['js/segmentationAdapter.js'].prepareModelImport(payload);},
 checkAnalysisService:async()=>{network++;service={state:'reachable',checkedAt:0,modelsLoaded:{camera:false,segmentation:false}};ui.update();return service;}};
window.ui=M['js/segmentationDebugPanel.js'].mountSegmentationDebugPanel({api,getLocale:()=>locale,getStep:()=>step});
window.stable=()=>JSON.stringify({design,camera:prepared.camera,revision:photo.designRevision});window.initial=stable();
window.flush=async()=>{ui.update();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));};
window.blobs=new Map();window.exports=[];const create=URL.createObjectURL.bind(URL);
URL.createObjectURL=b=>{const url=create(b);blobs.set(url,b);return url;};
HTMLAnchorElement.prototype.click=function(){if(this.download)exports.push({name:this.download,blob:blobs.get(this.href)});};
window.readExport=async()=>JSON.parse(await exports.at(-1).blob.text());
window.pixel=(x,y)=>{const v=getView(),c=document.querySelector('.segmentation-debug-overlay');
 const px=(v.rect.left+x/160*v.rect.width)*c.width/v.width,py=(v.rect.top+y/120*v.rect.height)*c.height/v.height;
 return [...c.getContext('2d').getImageData(Math.floor(px),Math.floor(py),1,1).data];};
'''
setup+=';window.debugModules=M;void 0;'
html='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#25333c;background:#eef1f4}
#viewer{position:fixed;inset:0 360px 0 0;background:#ddd}#canvasHost{width:100%;height:100%;position:relative;overflow:hidden}
.sidebar{position:fixed;right:0;top:0;bottom:0;width:360px;overflow:auto;background:white;padding:18px}
.accordion-toggle{font-weight:700;padding:10px 0;cursor:pointer}.area-secondary{background:white;border:1px solid #acbbc9;border-radius:6px;color:inherit}
body.dark{color:#e4ebef;background:#253139}body.dark .sidebar{background:#253139}body.dark button{background:#35424a;color:#e4ebef}
@media(max-width:760px){#viewer{right:0}.sidebar{width:min(330px,100vw);background:#fffffff0}}
</style></head><body><section id="viewer"><div id="canvasHost"></div></section><aside class="sidebar"></aside></body></html>'''
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1280,'height':900},device_scale_factor=1)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.set_content(html);page.evaluate(setup);page.evaluate('flush()')
    assert not page.locator('#segmentationDebug').evaluate('(e)=>e.open')
    assert page.evaluate('sourceCalls')==0 and page.evaluate('network')==0
    checks.append('Closed by default; no decoding or network request while closed')
    page.locator('#segmentationDebug > summary').click();page.evaluate('flush()')
    assert page.locator('#segmentationDebug #modelImportDebug').count()==1
    assert page.evaluate('sourceCalls')==1 and page.evaluate('network')==0
    checks.append('Unified dropdown contains the local JSON importer; opening performs no requests')
    assert page.locator('[data-debug-raster] option[value="occlusion"]').is_disabled()
    assert not page.locator('[data-debug-raster] option[value="effective"]').is_disabled()
    checks.append('Missing occlusion is unavailable; exact imported paving is available')
    page.locator('[data-debug-raster]').select_option('labels');page.evaluate('flush()')
    assert page.evaluate('pixel(30,85)[3]')>0
    page.locator('[data-debug-class="grass"]').uncheck();page.evaluate('flush()')
    assert page.evaluate('pixel(30,85)[3]')==0
    checks.append('Semantic class switches change real canvas pixels without modifying source masks')
    page.locator('[data-debug-raster]').select_option('none');page.locator('[data-debug-current]').check();page.evaluate('flush()')
    assert page.evaluate('pixel(50,90)[3]')==0, page.evaluate('pixel(50,90)')
    assert page.evaluate('pixel(30,85)[3]')>0,page.evaluate('pixel(30,85)')
    checks.append('Current design fills pavement but keeps the internal hole transparent (canvas pixel check)')
    page.locator('[data-debug-grid]').check();page.locator('[data-debug-preview]').uncheck();page.evaluate('flush()')
    assert not page.evaluate('visible');assert page.evaluate('stable()===initial');assert page.evaluate('imports===0&&network===0&&sourceCalls===1')
    checks.append('Layer/grid/preview toggles leave geometry, hole, camera, revision and inference count unchanged')
    page.locator('[data-debug-grid]').uncheck();page.evaluate('flush()')
    page.evaluate("""window.savedDesign=structuredClone(design);const hole=[[74,82],[90,82],[90,95],[74,95]].map(([x,y])=>debugModules['js/modelCamera.js'].imageToGround(prepared.camera,x,y));
    design.areaRegions[0].holes.push(hole);photo.designRevision++;flush();""")
    assert page.evaluate('pixel(82,89)[3]')==0
    assert page.evaluate('prepared.masks.effective[89*160+82]')==1
    assert page.evaluate('sourceCalls')==1
    checks.append('A new client-created hole changes only the current overlay; original model pixels and cache remain intact')
    page.evaluate('design=savedDesign;photo.designRevision++;flush()')
    assert page.evaluate("getComputedStyle(document.querySelector('.segmentation-debug-overlay')).pointerEvents")=='none'
    checks.append('Overlay cannot intercept pointer editing on the photograph')
    page.evaluate('inPhoto=false;flush()');assert page.locator('.segmentation-debug-overlay').is_hidden();assert page.evaluate('visible')
    assert 'free camera' in page.locator('[data-overlay-note]').inner_text()
    page.evaluate('inPhoto=true;flush()');assert not page.locator('.segmentation-debug-overlay').is_hidden()
    checks.append('Free camera pauses image overlays and restores scene visibility without changing camera')
    page.locator('[data-debug-grid]').uncheck();page.locator('[data-debug-preview]').check()
    for w,h in [(390,844),(844,390),(390,844),(1280,900)]:
        page.set_viewport_size({'width':w,'height':h});page.evaluate('flush()')
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert page.evaluate('pixel(50,90)[3]')==0
    checks.append('Portrait/landscape/portrait preserves hole alignment and avoids horizontal overflow')
    page.evaluate("step='calibrate';flush()")
    assert page.locator('#viewer > #segmentationDebug').count()==1
    page.evaluate("step='done';flush()")
    assert page.locator('.sidebar > #segmentationDebug').count()==1
    checks.append('One dropdown moves between setup upper-right and normal right sidebar')
    page.locator('[data-section="export"] > summary').click();page.evaluate('flush()')
    page.locator('[data-debug-download]').click();page.evaluate('flush()');report=page.evaluate('readExport()')
    assert report['masks_included'] is False and 'model_result' not in report
    assert report['design']['statistics']['holes']==1
    checks.append('Default JSON excludes masks and preserves the current design hole')
    page.locator('[data-debug-include]').check();page.locator('[data-debug-download]').click();page.evaluate('flush()');report=page.evaluate('readExport()')
    assert report['masks_included'] is True and report['model_result']['segmentation']['labels']['counts']
    assert report['diagnostic_masks']['effective']['counts']
    checks.append('Explicit RLE export contains original model data separate from editable design')
    # File input import uses real validator and ordinary consent; no model run.
    page.once('dialog',lambda d:d.dismiss())
    page.locator('#modelImportDebug input[type=file]').set_input_files({'name':'debug.json','mimeType':'application/json','buffer':json.dumps(report).encode()})
    page.wait_for_timeout(60);page.evaluate('flush()');assert page.evaluate('imports')==0
    page.once('dialog',lambda d:d.accept())
    page.locator('#modelImportDebug input[type=file]').set_input_files({'name':'debug.json','mimeType':'application/json','buffer':json.dumps(report).encode()})
    page.wait_for_timeout(60);page.evaluate('flush()');assert page.evaluate('imports')==1
    assert page.evaluate('importedResult.diagnostics.holes')==1
    checks.append('JSON reimport respects declined/accepted replacement confirmation and preserves model holes')
    page.locator('[data-debug-overlay-png]').click();page.wait_for_timeout(100)
    assert page.evaluate('exports.at(-1).blob.type')=='image/png'
    page.locator('[data-debug-raster]').select_option('effective');page.evaluate('flush()')
    page.locator('[data-debug-mask-png]').click();page.wait_for_timeout(100)
    assert page.evaluate('exports.at(-1).name')=='tiles-diagnostic-mask.png'
    checks.append('Transparent overlay and selected mask PNG blobs are generated')
    page.locator('[data-section="pipeline"] > summary').click();page.locator('[data-debug-health]').click();page.evaluate('flush()')
    assert page.evaluate('network')==1 and page.evaluate('imports')==1
    checks.append('Only explicit Check service reads health; never starts or imports a model job')
    page.evaluate("active=false;bundle.segmentation.model.notes='<img src=x onerror=window.PWNED=true>';version++;flush()")
    assert 'not the current design' in page.locator('[data-source-note]').inner_text()
    assert page.locator('[data-debug-pre="models"] img').count()==0 and not page.evaluate('Boolean(window.PWNED)')
    checks.append('Historical source is labeled; model metadata renders as text, not executable HTML')
    page.evaluate('bundle.geometry=null;rawOnly=true;version++;flush()')
    assert page.locator('[data-debug-raster] option[value="groundSupport"]').is_disabled()
    assert not page.locator('[data-debug-raster] option[value="labels"]').is_disabled()
    checks.append('Failed camera analysis retains semantic diagnostics without fabricated support')
    for locale in ['ro-RO','de-DE','en-US']:
        page.evaluate('(l)=>{locale=l;ui.update()}',locale);page.evaluate('flush()')
        assert page.locator('#segmentationDebug > summary').inner_text()
    page.evaluate("document.body.classList.add('dark');flush()")
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    checks.append('English/Romanian/German and dark mode remain usable')
    page.evaluate("photo.photoId='new-photo';photo.designRevision++;hasResult=false;flush()")
    assert page.locator('[data-debug-raster]').input_value()=='none';assert page.evaluate('visible')
    assert page.locator('[data-class-stats]').text_content().startswith('Unavailable')
    checks.append('Changing photo clears cached masks and resets overlays instead of displaying stale results')
    page.locator('#segmentationDebug > summary').click();page.evaluate('flush()')
    assert page.locator('.segmentation-debug-overlay').is_hidden() and page.evaluate('visible')
    assert not errors,errors
    checks.append('Closing Debug restores the preview; no unhandled browser exceptions')
    if os.getenv('BROWSER_SCREENSHOT_DIR'):
        page.evaluate("photo.photoId='debug-photo';hasResult=true;rawOnly=false;bundle=debugModules['tests/fixtures/model-results.mjs'].fixture();version++;document.body.classList.remove('dark');ui.element.open=true;flush()")
        page.locator('[data-debug-raster]').select_option('effective');page.locator('[data-debug-current]').check();page.evaluate('flush()')
        # Collapse long sections so the screenshot focuses on the controls/overlay.
        page.evaluate("for(const d of document.querySelectorAll('.debug-section'))d.open=d.dataset.section==='masks';")
        out=Path(os.environ['BROWSER_SCREENSHOT_DIR']);out.mkdir(parents=True,exist_ok=True)
        page.screenshot(path=str(out/'debug-dom.png'),full_page=True)
    browser.close()
print('\n'.join('PASS: '+c for c in checks))
print(f'{len(checks)} Debug DOM/canvas checks passed. Synthetic results/mock app; not full WebGL or live inference.')
