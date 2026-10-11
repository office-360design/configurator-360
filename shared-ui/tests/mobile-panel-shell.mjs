/** Real mobile tap regression. Pergola and Tiles run WebGL; other products mount their
 * real shell without their renderer. External services are blocked.
 * Requires Pergola's Vite dependencies, Playwright, and optional CHROMIUM_PATH.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from '../../pergola-configurator/node_modules/vite/dist/node/index.js';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../../', import.meta.url));
const servers = [];
let browser;
try {
  for (const dir of ['', 'pergola-configurator']) {
    const threeRoot = root + 'pergola-configurator/node_modules/three/';
    const server = await createServer({
      configFile: false,
      logLevel: 'error',
      root: root + dir,
      cacheDir: root + 'pergola-configurator/node_modules/.vite-mobile-' + (dir || 'root'),
      resolve: { alias: [
        { find: 'three/addons', replacement: threeRoot + 'examples/jsm' },
        { find: /^three$/, replacement: threeRoot + 'build/three.module.js' },
      ] },
      server: {
        host: '127.0.0.1', port: 0, preTransformRequests: false,
        hmr: { overlay: false }, fs: { allow: [root] },
      },
    });
    await server.listen(); servers.push(server);
  }
  const origins = servers.map(s => `http://127.0.0.1:${s.httpServer.address().port}`);
  browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,
    args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  for (const product of ['pergola','roof','hall','fence','solar','tiles']) {
    const page = await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
    await page.route('https://**', route => route.abort());
    if (product !== 'pergola' && product !== 'tiles') {
      await page.route('**/index.html', async route => {
        const response = await route.fetch();
        const html = (await response.text()).replace(/<script\b[^>]*src="[^"]*(?:main|app)\.js[^\"]*"[^>]*><\/script>/g,'');
        await route.fulfill({response,body:html});
      });
    }
    await page.goto(product === 'pergola' ? origins[1] : `${origins[0]}/${product}-configurator/index.html`);
    const toggle = page.locator(`#${product}SidebarToggle`);
    await page.waitForSelector('body.shared-ui-mounted');
    await toggle.waitFor();
    for (const [width,height] of [[390,844],[320,640],[760,640],[640,390]]) {
      await page.setViewportSize({width,height});
      for (let cycle=0;cycle<2;cycle++) {
        if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.tap();
        await page.waitForTimeout(450);
        assert.equal(await toggle.getAttribute('aria-expanded'),'false',`${product}: close`);
        assert.ok(await page.locator('.book-demo-button').isVisible(),`${product}: demo when closed`);
        await toggle.tap();
        await page.waitForTimeout(450);
        assert.equal(await toggle.getAttribute('aria-expanded'),'true',`${product}: stays open after tap`);

        assert.equal(await page.locator('.book-demo-button').isVisible(),false,`${product}: demo hidden`);
        const g = await toggle.evaluate(button => {
          const r = button.getBoundingClientRect();
          const p = document.querySelector('.shared-configurator-panel').getBoundingClientRect();
          const hits = [...document.querySelectorAll('.tool-launcher, .tool-button')].filter(el => {
            const b=el.getBoundingClientRect();
            return b.width && b.height && b.left<r.right && b.right>r.left && b.top<r.bottom && b.bottom>r.top;
          });
          return {bottom:innerHeight-r.bottom,onscreen:r.left>=0 && r.right<=innerWidth,
            panelVisible:p.left<innerWidth && p.right>0,overlaps:hits.length};
        });
        assert.equal(g.bottom,88,`${product}: common lower edge`);
        assert.ok(g.onscreen && g.panelVisible,`${product}: visible panel and arrow`);
        assert.equal(g.overlaps,0,`${product}: no tools overlap`);
      }
    }
    await page.setViewportSize({width:1280,height:900});
    await page.waitForTimeout(450);
    assert.ok(await page.locator('.book-demo-button').isVisible(),`${product}: desktop demo`);
    console.log(`PASS ${product}: mobile tap cycles, panel visibility, tools clearance, demo visibility, desktop resize`);
    await page.close();
  }
} finally {
  await browser?.close();
  await Promise.all(servers.map(s=>s.close()));
}
