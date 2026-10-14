"""Project panel DOM checks with a mock storage/session API, no navigation.
Tests controls, confirmations, exports, localization and layout. This is NOT the
native IndexedDB/reload check in run-project-browser.py and is NOT WebGL.
"""
from pathlib import Path
import json, os, shutil
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
source=(root/'js/projectPanel.js').read_text().replace('export function ', 'function ')
html='''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#25333c;background:#e6e9e5}
#viewer{position:fixed;inset:0 370px 0 0}.sidebar{position:fixed;right:0;top:0;bottom:0;width:370px;overflow:auto;background:#fff;padding:18px}
.accordion-toggle{padding:10px 0}.photo-flow-card{padding:20px;width:min(440px,100%);margin:25px auto;background:#fff;border-radius:12px}.note{color:#566570}
body.dark .sidebar{background:#253139;color:#e4ebef}body.dark .note{color:#c2ccd2}
@media(max-width:760px){#viewer{right:0}.sidebar{width:min(352px,100vw)}}
</style></head><body><section id="viewer"><div class="photo-flow-card"><h2>Start with a photo of your yard</h2></div></section><aside class="sidebar"></aside></body></html>'''
setup=source+'''
window.step='done';window.locale='en-US';window.calls=[];window.records=[];window.exports=[];window.pending=null;window.fail=false;
window.projectStatus={phase:'ready',message:'Photo cached. Save your edited design.',missingPhoto:false};
window.api={getProjectStatus:()=>projectStatus,listLocalProjects:async()=>records,
 saveLocalProject:async(name,options)=>{calls.push(['save',name,options]);if(fail)throw new Error('The previous save was not replaced.');
  if(pending)await pending;records=[{id:'p1',name,revision:2,updatedAt:'2026-10-05T08:00:00Z'}];projectStatus={...projectStatus,phase:'saved',message:'Saved in this browser.'};},
 openLocalProject:async id=>{calls.push(['open',id]);projectStatus.phase='opened';},
 deleteLocalProject:async(...a)=>{calls.push(['delete',...a]);records=[];},
 openProjectFile:async f=>{calls.push(['file',f.name]);projectStatus.phase='opened';},
 downloadProject:async opts=>{calls.push(['download',opts]);return new Blob(['{"fixture":true}'],{type:'application/json'});},
 projectFileName:name=>name+'.paving.json',
 reattachProjectPhoto:async f=>{calls.push(['reattach',f.name]);projectStatus={...projectStatus,missingPhoto:false};},
 clearLocalProjects:async()=>{calls.push(['clear']);records=[];projectStatus.phase='cleared';}};
HTMLAnchorElement.prototype.click=function(){exports.push({name:this.download,href:this.href});};
window.ui=mountProjectPanel({api,getLocale:()=>locale,getStep:()=>step});window.ready=true;
'''
checks=[]
def check(ok,name):
 assert ok,name
 checks.append(name)
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html);page.evaluate(setup)
 check(not page.locator('#pavingProjectPanel').evaluate('(e)=>e.open'),'project dropdown starts closed outside Debug')
 page.locator('#pavingProjectPanel > summary').click();page.wait_for_function('!document.querySelector("[data-save]").disabled')
 check(page.locator('[data-open]').is_disabled(),'no misleading Open button with an empty library')
 page.locator('[data-project-name]').fill('Client garden');page.locator('[data-save]').click()
 page.wait_for_function("projectStatus.phase==='saved' && !document.querySelector('[data-save]').disabled")
 check(page.evaluate("calls[0][0]==='save' && calls[0][1]==='Client garden'"),'Save captures the entered name')
 check(page.locator('[data-project-list] option').count()==2,'named save appears in the browser list')
 dialogs=[]
 def dialog(d): dialogs.append(d.message);d.dismiss()
 page.on('dialog',dialog);page.locator('[data-open]').click()
 check(page.evaluate("calls.filter(c=>c[0]==='open').length===0"),'cancelled replacement leaves the current project untouched')
 page.remove_listener('dialog',dialog);page.on('dialog',lambda d:d.accept())
 page.locator('[data-open]').click();page.wait_for_function("calls.some(c=>c[0]==='open')")
 check(bool(dialogs),'opening an existing design requests replacement confirmation')
 page.locator('[data-update]').click();page.wait_for_function("calls.filter(c=>c[0]==='save').length===2")
 check(page.evaluate("calls.filter(c=>c[0]==='save').at(-1)[2].expectedRevision===2"),'Update supplies the selected revision to conflict protection')
 page.locator('[data-download]').click();page.wait_for_function('exports.length===1')
 check(page.evaluate("calls.find(c=>c[0]==='download')[1].includeResult===false"),'diagnostic masks excluded from portable download by default')
 check(page.evaluate("exports[0].name==='Client garden.paving.json' && exports[0].href.startsWith('blob:')"),'download is an explicit local project file, not an upload')
 page.locator('[data-diagnostics]').check();page.locator('[data-download]').click();page.wait_for_function('exports.length===2')
 check(page.evaluate("calls.filter(c=>c[0]==='download').at(-1)[1].includeResult"),'original diagnostics require an explicit opt-in')
 page.locator('[data-file]').set_input_files({'name':'garden.paving.json','mimeType':'application/json','buffer':b'{}'})
 page.wait_for_function("calls.some(c=>c[0]==='file')")
 check(page.evaluate("calls.find(c=>c[0]==='file')[1]==='garden.paving.json'"),'project file picker passes the selected file to validation')
 page.evaluate("projectStatus={...projectStatus,phase:'missing',missingPhoto:true,message:'Reattach the exact original photo.'};ui.update()")
 check(page.locator('[data-reattach]').is_visible(),'missing-photo state exposes reattachment instead of starting inference')
 page.locator('[data-photo]').set_input_files({'name':'original.png','mimeType':'image/png','buffer':b'test'})
 page.wait_for_function("calls.some(c=>c[0]==='reattach')")
 check(not page.locator('[data-reattach]').is_visible(),'reattachment updates the missing-photo control')
 page.evaluate('fail=true');page.locator('[data-save]').click();page.wait_for_function("document.querySelector('[data-project-status]').textContent.includes('not replaced')")
 check(page.locator('[data-project-status]').get_attribute('data-error')=='true','failed saves show an error rather than success')
 page.evaluate('fail=false;pending=new Promise(r=>window.release=r);void 0');page.locator('[data-save]').click()
 check(page.locator('[data-open]').is_disabled() and page.locator('[data-project-name]').is_disabled(),'busy transaction disables overlapping project commands')
 page.evaluate('release();pending=null');page.wait_for_function('!document.querySelector("[data-save]").disabled')
 page.evaluate("records=[{id:'evil',name:'<img src=x onerror=alert(1)>',revision:1,updatedAt:'2026-10-05T08:00:00Z'}];ui.refresh()")
 check(page.locator('#pavingProjectPanel img').count()==0,'project titles are text, never executable HTML')
 page.evaluate("step='upload';ui.update()")
 check(page.locator('.photo-flow-card #pavingProjectPanel').count()==1,'local/file Open is available before uploading a photo')
 page.evaluate("step='done';locale='ro-RO';ui.update()")
 check('Salvare' in page.locator('#pavingProjectPanel > summary').inner_text(),'Romanian controls render')
 page.evaluate("locale='de-DE';document.body.classList.add('dark');ui.update()")
 check('Projekt' in page.locator('#pavingProjectPanel > summary').inner_text(),'German controls render in dark mode')
 for w,h in [(390,844),(844,390),(390,844)]:
  page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(25)
  check(page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'no horizontal overflow at {w}×{h}')
 page.evaluate("step='upload';ui.update()")
 check(page.locator('.photo-flow-card').evaluate('(e)=>e.getBoundingClientRect().height<=innerHeight-110'),'expanded startup Project panel scrolls within the mobile viewport')
 page.evaluate("step='done';locale='en-US';document.body.classList.remove('dark');ui.update()")
 page.set_viewport_size({'width':1280,'height':900})
 out=os.getenv('BROWSER_SCREENSHOT_DIR')
 if out:
  Path(out).mkdir(parents=True,exist_ok=True);page.screenshot(path=str(Path(out)/'project-desktop.png'),full_page=True)
 page.locator('[data-clear]').click();page.wait_for_function("calls.some(c=>c[0]==='clear')")
 check(page.locator('[data-open]').is_disabled(),'clear-cache action refreshes the empty local list')
 check(not errors,'no uncaught DOM errors')
 print(json.dumps({'passed':len(checks),'checks':checks},indent=2));b.close()
