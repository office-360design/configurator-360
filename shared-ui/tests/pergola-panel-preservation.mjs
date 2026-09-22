/** Real Pergola UI/store/pricing; no scene, shared shell or external services.
 * Run with Playwright installed; CHROMIUM_PATH optionally selects a browser.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = 'd516e63a7decbba450a9eba03bdfd26e32e00e46';
const cache = new Map();
const stubs = {
  'shared-ui/src/index.js': `export { escapeHtml } from './utils.js';`,
  'shared-ui/src/shareState.js': `export function createShareUrl(){return ''}`,
};
const server = createServer((req,res) => {
  try {
    const [,version,...parts] = new URL(req.url,'http://localhost').pathname.split('/');
    const path = parts.join('/').replace('pergola-configurator/assets/', 'pergola-configurator/public/assets/');
    if (!['before','after'].includes(version) || path.includes('..')) throw Error('path');
    const key = `${version}/${path}`;
    if (!cache.has(key)) {
      let source = stubs[path] ?? (version === 'before'
        ? execFileSync('git',['show',`${baseline}:${path}`],{cwd:root,encoding:'utf8',maxBuffer:1e7})
        : readFileSync(root+path,'utf8'));
      if(path.endsWith('.html')) {
        source=source.replace(/<script\b[\s\S]*?<\/script>/g,'');
        const styles=['pergola-configurator/src/styles/pergola.css','shared-ui/styles/index.css','pergola-configurator/src/styles/pergola-theme-overrides.css'];
        if(version==='after') styles.push('shared-ui/styles/panelControls.css','pergola-configurator/src/styles/panel-adapter.css');
        source=source.replace('</head>',styles.map(p=>`<link rel="stylesheet" href="/${version}/${p}">`).join('')+'</head>');
      }
      cache.set(key,source);
    }
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html');
    res.end(cache.get(key));
  } catch {res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  const pages=[],errors=[];
  for(const version of ['before','after']) {
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**',route=>route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/${version}/pergola-configurator/index.html`);
    await page.evaluate(async version=>{
      const base=`/${version}/pergola-configurator/src`;
      const {ConfiguratorStore}=await import(`${base}/state.js?v=platform-18`);
      const {ConfiguratorUI}=await import(`${base}/ui/ConfiguratorUI.js`);
      const {calculatePrice}=await import(`${base}/pricing.js?v=platform-18`);
      window.store=new ConfiguratorStore({});
      window.ui=new ConfiguratorUI(document.querySelector('#app'),store);
      document.body.classList.add('shared-ui-mounted');
      const panel=document.querySelector('.configurator-sidebar');
      panel.classList.add('shared-configurator-panel');
      panel.dataset.sharedPanelGeometry='floating-right';
      window.events=[];store.subscribe((state,meta)=>events.push({state:structuredClone(state),meta}));
      window.snapshot=()=>({state:store.get(),price:calculatePrice(store.get()),events,
        active:[ui.expandedStep,ui.activePole,ui.activePoleFace,ui.activeSideSegment,ui.activeRoofRectangle,ui.activeHeaterSegment],
        pending:ui.pendingDimensionChange,
        controls:[...document.querySelectorAll('input,select,button[data-option-path],button[data-action]')].map(el=>({
          data:{...el.dataset},value:el.value,min:el.min,max:el.max,step:el.step,disabled:el.disabled,checked:el.checked,pressed:el.getAttribute('aria-pressed'),expanded:el.getAttribute('aria-expanded')
        })),modal:document.querySelector('[data-modal-root]').textContent});
    },version);pages.push(page);
  }
  let checks=0;
  const compare=async label=>{
    assert.deepEqual(await pages[1].evaluate(()=>snapshot()),await pages[0].evaluate(()=>snapshot()),label);checks++;
  };
  const both=async(action,label)=>{for(const p of pages)await action(p);await compare(label)};
  const click=async selector=>both(p=>p.locator(selector).first().evaluate(el=>el.click()),selector);
  const open=async step=>both(p=>p.evaluate(step=>{ui.expandedStep=step;ui.render()},step),step);
  await compare('initial');
  for(const step of ['structure','finish','automation','sides','accessories','summary']) {
    await open(step);
    const options=await pages[0].locator('.configurator-sidebar [data-option-path]').evaluateAll(els=>els.map(e=>({path:e.dataset.optionPath,value:e.dataset.optionValue})));
    for(const option of options) {
      const selector=`[data-option-path="${option.path}"][data-option-value="${option.value}"]`;
      if(await pages[0].locator(selector).count())await click(selector);
    }
  }
  await open('automation');
  const services=await pages[0].locator('[data-action="toggle-service"]').evaluateAll(els=>els.map(e=>e.dataset.service));
  for(const service of services)await click(`[data-action="toggle-service"][data-service="${service}"]`);
  await open('structure');
  for(const preset of [0,1,2])await both(p=>p.locator('[data-action="dimension-preset"]').nth(preset).evaluate(el=>el.click()),`preset ${preset}`);
  await open('finish');
  await both(p=>p.locator('[data-path="roof.louverTilt"]').evaluate(el=>{el.value='43';el.dispatchEvent(new Event('input',{bubbles:true}))}),'louver tilt');
  await open('sides');
  await click('[data-action="select-side-segment"]:not(:disabled)');
  const sideOptions=await pages[0].locator('.configurator-sidebar [data-option-path]').evaluateAll(els=>els.map(e=>({path:e.dataset.optionPath,value:e.dataset.optionValue})));
  for(const o of sideOptions){const selector=`[data-option-path="${o.path}"][data-option-value="${o.value}"]`;if(await pages[0].locator(selector).count())await click(selector)}
  await open('accessories');
  await click('[data-action="toggle-led"]');
  await click('[data-action="select-roof-rectangle"]');
  await click('[data-action="spotlight-counter"][data-delta="1"]');
  await click('[data-action="select-heater-segment"]');
  for(const direction of ['first','second'])await click(`[data-action="toggle-heater-direction"][data-direction="${direction}"]`);
  await click('[data-action="select-pole"]:not(:disabled)');
  const sensors=await pages[0].locator('[data-action="toggle-pole-sensor"]').evaluateAll(els=>els.map(e=>e.dataset.sensor));
  for(const sensor of sensors)await click(`[data-action="toggle-pole-sensor"][data-sensor="${sensor}"]`);
  const mounts=await pages[0].locator('[data-action="add-pole-mount"]').evaluateAll(els=>els.map(e=>e.dataset.mountType));
  for(const type of mounts)await click(`[data-action="add-pole-mount"][data-mount-type="${type}"]`);
  await open('structure');await click('[data-action="dimension-preset"]');
  assert.ok(await pages[0].locator('[data-action="cancel-dimension-change"]').count());
  await click('[data-action="cancel-dimension-change"]');await click('[data-action="dimension-preset"]');await click('[data-action="confirm-dimension-change"]');
  for(const locale of ['ro-RO','de-DE','en-US'])await both(p=>p.evaluate(locale=>store.update('locale',locale),locale),locale);
  for(const units of ['imperial','metric'])await both(p=>p.evaluate(units=>store.update('units',units),units),units);
  const after=pages[1];
  for(const width of [1440,390,320])for(const dark of [false,true])for(const locale of ['en-US','ro-RO','de-DE']) {
    await after.setViewportSize({width,height:1000});
    await after.evaluate(({dark,locale})=>{store.update('darkMode',dark);store.update('locale',locale);ui.setSidebarHidden(false)},{dark,locale});
    for(const step of ['structure','finish','automation','sides','accessories','summary']) {
      await after.evaluate(step=>{ui.expandedStep=step;ui.render()},step);
      assert.ok(await after.locator('[data-step-content]').evaluate(el=>el.clientWidth>200 && el.clientHeight>200), 'managed panel must be visible');
      assert.equal(await after.locator('[data-step-content]').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${width}/${dark}/${locale}/${step}`);
    }
  }
  if(process.env.PERGOLA_SCREENSHOT) {
    await after.setViewportSize({width:1440,height:1000});
    await after.evaluate(()=>{store.update('darkMode',false);store.update('locale','en-US');ui.expandedStep='structure';ui.render()});
    await after.screenshot({path:process.env.PERGOLA_SCREENSHOT});
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS Pergola: ${checks} before/after state, pricing, control, placement and dimension-confirmation comparisons; responsive light/dark checks.`);
} finally {await browser?.close();await new Promise(done=>server.close(done))}
