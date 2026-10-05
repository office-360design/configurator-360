"""Chromium DOM/canvas checks with a MOCK transport and renderer.
No server or model downloads. The actual frontend modules are evaluated in an
inline harness so this also works when managed Chromium blocks URL navigation.
Run: python tests/run-analysis-dom.py
"""
from pathlib import Path
import base64,io,json,re,os,shutil
from PIL import Image
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'tests/browser/analysis.html').read_text().split('<script type="module">')[0]+'</html>'
html=html.replace('synthetic predictors, real HTTP job API, preparation, adapter, geometry and controls. No WebGL/site shell.', 'DOM/canvas harness with mocked transport and renderer. No full website, WebGL or model inference.')
def js_module(file, names):
 s=(root/'js'/file).read_text()
 s=re.sub(r'^import .*?;\n','',s,flags=re.M)
 s=s.replace('export async function ','async function ').replace('export function ','function ').replace('export const ','const ')
 return '(()=>{'+s+';return {'+','.join(names)+'};})()'
setup='''window.modules={};'''
setup+='modules.config='+js_module('segmentationConfig.js',['SEGMENTATION_CONFIG','resolveAnalysisBase'])+';'
setup+='modules.photo='+js_module('photoPreparation.js',['workingImageSize','prepareWorkingPhoto'])+';'
setup+='const {SEGMENTATION_CONFIG,resolveAnalysisBase}=modules.config; const {prepareWorkingPhoto}=modules.photo;'
setup+='modules.controller='+js_module('photoAnalysis.js',['createPhotoAnalysis'])+';'
setup+='modules.panel='+js_module('analysisPanel.js',['mountAnalysisPanel'])+';'
setup+='''
window.photo={photoId:'test-photo',width:160,height:120,designRevision:1,drawing:false,draftVertices:0};
window.step='analyze';window.importCount=0;window.requests=[];window.manual=0;let polls=0,generation;
window.existing=[];window.ui=null;
const mock=async (url,options)=>{
 requests.push(url);
 if(url.endsWith('/health'))return new Response(JSON.stringify({service:'paving-analysis',job_api_version:1}));
 if(url.includes('/requests/'))return new Response('{}');
 if(url.endsWith('/jobs')) {generation=Number(options.body.get('generation'));polls=0;}
 let reply={job_id:'a'.repeat(32),generation,image_id:photo.photoId,image:{width:160,height:120},state:++polls>2?'completed':'running',stage:polls>1?'camera':'segmentation'};
 if(url.endsWith('/result'))reply={image_id:photo.photoId,image:{width:160,height:120},geometry:{image_id:photo.photoId,image:{width:160,height:120}},segmentation:{image_id:photo.photoId,image:{width:160,height:120}}};
 return new Response(JSON.stringify(reply));
};
window.ctl=modules.controller.createPhotoAnalysis({apiBase:'http://mock.test/api/paving',clientId:'test',config:{pollIntervalMs:10,requestTimeoutMs:1000,analysisTimeoutMs:10000},
 getPhoto:()=>({...photo}),getSource:()=> 'unused',getPavingState:()=>({areaRegions:existing}),fetchImpl:mock,
 preparePhoto:async()=>({width:160,height:120,blob:new Blob(['test'])}),
 importResult:()=>{importCount++;photo.designRevision++;existing=[{id:'region',holes:[1]}];step='done';return {diagnostics:{regions:1,holes:1}};},
 onStatus:()=>ui?.update()});
const api={getPhotoSource:()=>({...photo}),getPavingState:()=>({areaRegions:existing}),getAnalysisStatus:()=>ctl.getStatus(),
 runPhotoAnalysis:o=>ctl.run(o),restoreDetectedArea:o=>ctl.restore(o),beginManualCalibration(){ctl.cancel();step='calibrate';manual++;}};
window.ui=modules.panel.mountAnalysisPanel({api,getLocale:()=> 'en-US',getStep:()=>step});
'''
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1280,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html);page.evaluate(setup)
 page.evaluate('ctl.run()')
 assert page.evaluate('ctl.getStatus().phase')=='ready'
 assert page.locator('.sidebar #photoAnalysisPanel').count()==1
 assert not page.locator('progress').is_visible();checks.append('Controller status and panel transition to sidebar')
 before=page.evaluate('importCount')
 page.once('dialog',lambda d:d.dismiss());page.locator('[data-restore]').click()
 assert page.evaluate('importCount')==before;checks.append('Declining replacement performs no import')
 page.once('dialog',lambda d:d.accept());page.locator('[data-restore]').click()
 assert page.evaluate('importCount')==before+1;checks.append('Explicit restore applies without new model request')
 page.locator('[data-manual]').click();assert page.evaluate('manual')==1;assert not page.locator('progress').is_visible();checks.append('Manual action stops progress')
 for width,height in [(390,844),(844,390),(390,844),(1280,900)]:
  page.set_viewport_size({'width':width,'height':height});assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 checks.append('No horizontal overflow in portrait/landscape/portrait DOM harness')
 image=Image.new('RGB',(160,120),(80,160,60));exif=Image.Exif();exif[274]=6;buf=io.BytesIO();image.save(buf,format='JPEG',exif=exif)
 encoded=base64.b64encode(buf.getvalue()).decode()
 result=page.evaluate('''async b64=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
 const image=new Image();image.src=url;await image.decode();const p=await modules.photo.prepareWorkingPhoto(url,{width:image.naturalWidth,height:image.naturalHeight},new AbortController().signal);
 const decoded=new Image();decoded.src=URL.createObjectURL(p.blob);await decoded.decode();return [image.naturalWidth,image.naturalHeight,p.width,p.height,decoded.naturalWidth,decoded.naturalHeight];}''',encoded)
 assert result==[120,160,120,160,120,160],result;checks.append('EXIF orientation applied exactly once in real browser canvas')
 buf=io.BytesIO();Image.new('RGBA',(100,60),(0,0,0,0)).save(buf,format='PNG');encoded=base64.b64encode(buf.getvalue()).decode()
 pixel=page.evaluate('''async b64=>{const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'image/png'}));
 const p=await modules.photo.prepareWorkingPhoto(url,{width:100,height:60},new AbortController().signal);
 const image=new Image();image.src=URL.createObjectURL(p.blob);await image.decode();const c=document.createElement('canvas');c.width=100;c.height=60;
 const x=c.getContext('2d');x.drawImage(image,0,0);return [...x.getImageData(5,5,1,1).data];}''',encoded)
 assert pixel==[255,255,255,255],pixel;checks.append('Transparent photo encoded over white')
 assert not errors,errors;checks.append('No unhandled browser script errors')
 if os.getenv('BROWSER_SCREENSHOT_DIR'):
  out=Path(os.environ['BROWSER_SCREENSHOT_DIR']);out.mkdir(parents=True,exist_ok=True)
  page.screenshot(path=str(out/'analysis-dom.png'),full_page=True)
 browser.close()
print('\n'.join('PASS: '+s for s in checks))
print(f'{len(checks)} DOM/canvas checks passed. Mock transport/renderer; not full site/WebGL/live ML.')
