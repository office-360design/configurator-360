"""Full-site acceptance runner. Run on a machine allowed to navigate to the site.
Fixture mode uses the REAL application and WebGL but blocks model-job requests.
--live-photo sends that photo to the configured REAL inference service. Models,
website, hostname/tenant access and networking must already work. Uses an isolated
browser context: no account login, cloud save, share writes or repository changes.
"""
from pathlib import Path
import argparse, json, os, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--url',required=True,help='Full tiles configurator URL, e.g. http://localhost:3000/tiles-configurator/')
p.add_argument('--live-photo',type=Path,help='Explicitly send this photograph through the configured real models instead of using the synthetic fixture')
p.add_argument('--timeout-seconds',type=int,default=900)
p.add_argument('--screenshot-dir',type=Path,help='Optional screenshots contain the photograph; treat them as private')
a=p.parse_args();checks=[];requests=[];errors=[]
def check(ok,name):
    assert ok,name
    checks.append(name)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    if not a.live_photo:
        context.route('**/api/paving/**',lambda r:r.fulfill(status=503,content_type='application/json',body='{"detail":"Fixture test: real inference intentionally blocked"}'))
    page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
    page.on('request',lambda r:requests.append((r.method,r.url)))
    def ready():
        page.wait_for_function('window.TILES_CONFIGURATOR_API?.getDebugView()?.width>0',timeout=60000)
    page.goto(a.url);ready()
    page.locator('#sitePhotoInput').set_input_files(str(a.live_photo or ROOT/'tests/fixtures/server-model-photo.png'))
    page.wait_for_function('!!TILES_CONFIGURATOR_API.getPhotoSource()',timeout=30000)
    if a.live_photo:
        page.wait_for_function("!TILES_CONFIGURATOR_API.getAnalysisStatus().busy",timeout=a.timeout_seconds*1000)
        check(page.evaluate('!!TILES_CONFIGURATOR_API.getModelCamera() && TILES_CONFIGURATOR_API.getPavingState().areaRegions.length>0'),
              'real service produced both a camera and nonempty paving suggestion')
    else:
        page.evaluate('TILES_CONFIGURATOR_API.cancelPhotoAnalysis({notify:false})')
        payload=json.loads((ROOT/'tests/fixtures/server-model-result.json').read_text())
        page.evaluate('''payload=>{const api=TILES_CONFIGURATOR_API,p=api.getPhotoSource();api.importModelResult(payload,{...p,replaceExisting:true,associateWithCurrentPhoto:true});}''',payload)
    check(page.evaluate('!document.querySelector("#viewerError").hidden') is False,'real WebGL viewer initialized without the application error banner')
    # Deliberate design edits, unrelated to the raw mask, to detect accidental
    # re-segmentation or application of old masks during project opening.
    page.evaluate('''()=>{const api=TILES_CONFIGURATOR_API,rect=(x,z,l,w)=>[{x,z},{x:x+l,z},{x:x+l,z:z+w},{x,z:z+w}];
      if(!api.setPavingRegions([{outer:rect(-2,0,4,4),holes:[rect(-1,1,.6,.6),rect(.4,1,.6,.6)],curbs:{outer:true,holes:[true,false]}},
        {outer:rect(3,1,1,1),holes:[],curbs:{outer:false,holes:[]}}],{x:0,z:0}))throw new Error('Manual design failed');}''')
    expected=page.evaluate('TILES_CONFIGURATOR_API.captureState()');estimate=page.evaluate('TILES_CONFIGURATOR_API.getEstimate()')
    check(sum(len(r['holes']) for r in expected['areaRegions'])==2,'two client-created holes and separate regions are represented')
    page.wait_for_function('TILES_CONFIGURATOR_API.getProjectStatus().cached',timeout=30000)
    record=page.evaluate('TILES_CONFIGURATOR_API.saveLocalProject("Acceptance test — edited holes")')
    job_count=lambda:sum(method=='POST' and url.rstrip('/').endswith('/api/paving/jobs') for method,url in requests)
    before_jobs=job_count()
    page.reload();ready();page.evaluate('id=>TILES_CONFIGURATOR_API.openLocalProject(id)',record['id'])
    check(page.evaluate('TILES_CONFIGURATOR_API.captureState()')==expected,'full page reload restores the exact edited geometry, hole curbs and tile settings')
    check(page.evaluate('TILES_CONFIGURATOR_API.getPhotoSource().width')>0,'stored photo reopened through native IndexedDB')
    check(page.evaluate('TILES_CONFIGURATOR_API.getEstimate().total')==estimate['total'],'quantities and total survive reopening')
    check(job_count()==before_jobs,'reload and Open did not run the models again')
    pose=page.evaluate('TILES_CONFIGURATOR_API.getDebugView().view')
    page.locator('#photoModeButton').click()
    check(page.evaluate('TILES_CONFIGURATOR_API.getDebugView().photoMode') is False,'free-camera mode can be entered after reopening')
    free_pose=page.evaluate('TILES_CONFIGURATOR_API.getDebugView().view')
    check(max(abs(x-y) for x,y in zip(pose,free_pose))<1e-6,'entering free camera preserves the photo-camera pose')
    page.locator('#photoModeButton').click()
    for w,h in [(390,844),(844,390),(390,844),(1440,1000)]:
        page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(150)
        check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'no whole-page horizontal overflow {w}×{h}')
    # Full portable file with no model rerun; no cloud account operations.
    data=page.evaluate('''async()=>Array.from(new Uint8Array(await (await TILES_CONFIGURATOR_API.downloadProject({includeResult:true})).arrayBuffer()))''')
    page.evaluate('TILES_CONFIGURATOR_API.resetConfiguration()')
    panel=page.locator('#pavingProjectPanel');panel.evaluate('(e)=>e.open=true')
    page.locator('[data-file]').set_input_files({'name':'acceptance.paving.json','mimeType':'application/json','buffer':bytes(data)})
    page.wait_for_function('TILES_CONFIGURATOR_API.getPhotoSource() && TILES_CONFIGURATOR_API.getPavingState().areaRegions.length===2')
    check(page.evaluate('TILES_CONFIGURATOR_API.captureState()')==expected,'full project file restores edited holes, not the raw suggestion')
    check(job_count()==before_jobs,'portable-file reopening did not upload or run inference')
    if a.screenshot_dir:
        a.screenshot_dir.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(a.screenshot_dir/'reopened-project.png'),full_page=True)
    check(not errors,'no uncaught page errors (including the real application and WebGL)')
    print(json.dumps({'passed':len(checks),'mode':'real-inference' if a.live_photo else 'real-site/synthetic-result','checks':checks},indent=2))
    browser.close()
