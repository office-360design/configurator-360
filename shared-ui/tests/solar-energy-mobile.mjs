/** Real Solar renderer and shell; external services are blocked. Requires
 * Playwright and Pergola's Vite/Three dependencies. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../pergola-configurator/node_modules/vite/dist/node/index.js';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../../', import.meta.url));
const three = root + 'pergola-configurator/node_modules/three/';
const server = await createServer({
  configFile: false, root, logLevel: 'error',
  cacheDir: root + 'pergola-configurator/node_modules/.vite-solar-energy',
  resolve: { alias: [
    { find: 'three/addons', replacement: three + 'examples/jsm' },
    { find: /^three$/, replacement: three + 'build/three.module.js' },
  ] },
  server: { host: '127.0.0.1', port: 0, preTransformRequests: false, fs: { allow: [root] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, headless:true,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for (const width of [390,320,1280]) {
    const page = await browser.newPage({viewport:{width,height:width<761?667:900},hasTouch:width<761,isMobile:width<761});
    const errors=[];
    page.on('pageerror', e=>errors.push(e.message));
    await page.route('https://**', route=>route.abort());
    await page.route('**/js/app.js?*', async route=>{
      const response=await route.fetch();
      await route.fulfill({response,body:(await response.text())+'\nwindow.testSolar={scene,state,ui};'});
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/solar-configurator/index.html`);
    await page.waitForFunction(()=>window.testSolar && window.SOLAR_CONFIGURATOR_API);
    const toggle=page.locator('#simulationPanelToggle');
    if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#simulationPanelBody').evaluate(el=>el.inert),false);
    const play=page.locator('#simulationPlayButton');
    await play.click();
    await page.waitForFunction(()=>testSolar.state.simulationPlaying && testSolar.state.simulationHour>0.05);
    const hour=await page.evaluate(()=>testSolar.state.simulationHour);
    await page.waitForTimeout(350);
    assert.ok(await page.evaluate(h=>testSolar.state.simulationHour>h,hour));
    await play.click();
    assert.equal(await page.evaluate(()=>testSolar.state.simulationPlaying),false);
    const paused=await page.evaluate(()=>testSolar.state.simulationHour);
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>testSolar.state.simulationHour),paused);
    // Verify the renderer responds to night/day hours, not just the button label.
    const exposure=await page.evaluate(()=>{
      const {scene,state}=testSolar;
      scene.setEnvironment({...state,nightPreview:false,simulationHour:0});
      const night=scene.renderer.toneMappingExposure;
      scene.setEnvironment({...state,nightPreview:false,simulationHour:12});
      return [night,scene.renderer.toneMappingExposure];
    });
    assert.notEqual(exposure[0],exposure[1]);
    if(width<761){
      const geometry=await page.evaluate(()=>{
        const chart=document.querySelector('#simulationChart');
        const c=chart.getBoundingClientRect();
        const b=document.querySelector('#simulationPanelBody').getBoundingClientRect();
        const totals=document.querySelector('.simulation-summary-grid').getBoundingClientRect();
        return {visible:c.top>=b.top && c.bottom<=b.bottom,width:c.width,height:c.height,
          scroll:chart.parentElement.scrollWidth-chart.parentElement.clientWidth,first:c.top<totals.top};
      });
      assert.ok(geometry.visible && geometry.first,JSON.stringify(geometry));
      assert.ok(geometry.width<=width && geometry.height>=200);
      assert.ok(geometry.scroll<=1);
      assert.equal(await page.locator('.book-demo-button').isVisible(),false);
      await page.screenshot({path:`/tmp/solar-energy-${width}.png`});
    }
    await toggle.click();
    assert.equal(await page.locator('#simulationPanelBody').evaluate(el=>el.inert),true);
    await toggle.click();
    await play.click();
    assert.equal(await page.evaluate(()=>testSolar.state.simulationPlaying),true);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}px: actual play/pause/reopen, advancing time, day/night lighting, graph geometry`);
    await page.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
