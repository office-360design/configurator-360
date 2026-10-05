"""Real Chromium + HTTP + synthetic predictors; not full-site/WebGL/ML validation.
Run from tiles-configurator: python tests/run-analysis-browser.py
Requires service test dependencies, uvicorn, playwright and a Chromium executable.
"""
from pathlib import Path
import io
import os
import shutil
import socket
import sys
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'segmentation-service'))
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
import uvicorn
from playwright.sync_api import sync_playwright
from server.app import create_app
from server.test_camera import FakeModel
from server.test_jobs import FakeSegments

class DelayedSegments(FakeSegments):
    def predict(self,rgb):
        time.sleep(.15)
        return super().predict(rgb)

app=create_app(FakeModel(),DelayedSegments(),allowed_origins=[])
# Test-only static mounts. The real service never serves the source tree.
app.mount('/js',StaticFiles(directory=ROOT/'js'),name='test-js')
@app.get('/test')
def test_page():return FileResponse(ROOT/'tests/browser/analysis.html')
@app.get('/probe.jpg')
def exif_probe():
    buf=io.BytesIO();image=Image.new('RGB',(160,120),(90,170,60));exif=Image.Exif();exif[274]=6
    image.save(buf,format='JPEG',exif=exif);return Response(buf.getvalue(),media_type='image/jpeg')
@app.get('/transparent.png')
def alpha_probe():
    buf=io.BytesIO();Image.new('RGBA',(100,60),(0,0,0,0)).save(buf,format='PNG');return Response(buf.getvalue(),media_type='image/png')

with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=port,log_level='warning'))
thread=threading.Thread(target=server.run,daemon=True);thread.start()
for _ in range(200):
    if server.started:break
    time.sleep(.01)
base=f'http://127.0.0.1:{port}'
errors=[]
try:
    with sync_playwright() as p:
        executable=os.getenv('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
        browser=p.chromium.launch(executable_path=executable,headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':1280,'height':900})
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(base+'/test');page.wait_for_function('window.harness !== undefined')
        page.locator('#sitePhotoInput').set_input_files(str(ROOT/'tests/fixtures/server-model-photo.png'))
        page.wait_for_function("harness.inspect().status.phase==='ready'",timeout=30000)
        result=page.evaluate('harness.inspect()')
        assert len(result['state']['areaRegions'])>=1
        assert sum(len(r['holes']) for r in result['state']['areaRegions'])>=1
        assert result['step']=='done'
        print('PASS: oriented upload -> live job API -> geometry/holes -> normal controls')
        page.evaluate('harness.addTestHole()')
        before=page.evaluate('JSON.stringify(harness.inspect().state)')
        page.once('dialog',lambda d:d.dismiss())
        page.locator('[data-restore]').click()
        assert page.evaluate('JSON.stringify(harness.inspect().state)')==before
        print('PASS: decline restore preserves intentional holes')
        page.once('dialog',lambda d:d.accept())
        page.locator('[data-restore]').click();page.evaluate('harness.undo()')
        assert page.evaluate('JSON.stringify(harness.inspect().state)')==before
        print('PASS: explicit restore and one-step undo recover intentional holes')
        page.once('dialog',lambda d:d.accept())
        page.locator('[data-analyze]').click()
        page.locator('[data-stop]').wait_for(state='visible');page.locator('[data-stop]').click()
        page.wait_for_timeout(600)
        assert page.evaluate('harness.inspect().status.busy') is False
        assert page.evaluate('JSON.stringify(harness.inspect().state)')==before
        print('PASS: stop analysis preserves design and prevents late replacement')
        dimensions=page.evaluate('''async()=>{
          const i=new Image();i.src='/probe.jpg';await i.decode();
          const p=await harness.prepareProbe(i.src,{width:i.naturalWidth,height:i.naturalHeight},new AbortController().signal);
          const result=new Image();result.src=URL.createObjectURL(p.blob);await result.decode();
          return {original:[i.naturalWidth,i.naturalHeight],working:[p.width,p.height],encoded:[result.naturalWidth,result.naturalHeight]};
        }''')
        assert dimensions=={'original':[120,160],'working':[120,160],'encoded':[120,160]},dimensions
        print('PASS: EXIF rotation applied once and stripped from model upload')
        pixel=page.evaluate('''async()=>{
          const p=await harness.prepareProbe(location.origin+'/transparent.png',{width:100,height:60},new AbortController().signal);
          const i=new Image();i.src=URL.createObjectURL(p.blob);await i.decode();
          const c=document.createElement('canvas');c.width=100;c.height=60;const x=c.getContext('2d');x.drawImage(i,0,0);
          return [...x.getImageData(2,2,1,1).data];
        }''')
        assert pixel==[255,255,255,255],pixel
        print('PASS: transparent photos use a white model-image background')
        for w,h in [(390,844),(844,390),(390,844),(1280,900)]:
            page.set_viewport_size({'width':w,'height':h})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        assert page.locator('#photoAnalysisPanel').count()==1
        print('PASS: responsive controls and portrait/landscape/portrait do not overflow')
        if os.getenv('BROWSER_SCREENSHOT_DIR'):
            out=Path(os.environ['BROWSER_SCREENSHOT_DIR']);out.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(out/'analysis-controls.png'),full_page=True)
        assert not errors,errors
        print('PASS: no unhandled browser errors')
        browser.close()
finally:
    server.should_exit=True;thread.join(timeout=10)
