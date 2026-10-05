/** Real Tiles handlers/model; shell and WebGL are stubbed. No external services.
 * Run with Playwright installed; CHROMIUM_PATH optionally selects a browser.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = '244533ae77bab422674edbd0a4b51e5230d289b7';
const cache = new Map();
const stubs = {
  'shared-ui/src/tenantBootstrap.js': `export async function requireTenantConfiguratorAccess(){return null}`,
  'shared-ui/src/tools/registry.js': `export function resolveSharedTools(){return []}`,
  'shared-ui/src/shareState.js': `export function createShareUrl(){return ''}`,
  'shared-ui/src/standaloneShell.js': `export function mountStandaloneConfiguratorShell(options){
    window.shellOptions=options;document.body.classList.add('shared-ui-mounted');
    return {state:{locale:'en-US',darkMode:false},host:document.createElement('div'),
      markDirty(){},refreshConfiguratorPanelFooter(){},setSettingsPanelCollapsed(){},setToolActive(){}};
  }`,
  'tiles-configurator/js/viewer.js': `export function createViewer(){return {
    rebuild(state){window.rebuilds.push(structuredClone(state))},setDarkMode(){},cycleCamera(){return true},toggleDimensions(){return true}
  }}`,
};
const server = createServer((req,res) => {
  try {
    const [,version,...parts] = new URL(req.url,'http://localhost').pathname.split('/');
    const path = parts.join('/');
    if (!['before','after'].includes(version) || path.includes('..')) throw Error('path');
    const key = `${version}/${path}`;
    if (!cache.has(key)) {
      let source = stubs[path] ?? (version === 'before'
        ? execFileSync('git',['show',`${baseline}:${path}`],{cwd:root,encoding:'utf8',maxBuffer:1e7})
        : readFileSync(root+path,'utf8'));
      if(path.endsWith('.html')) source=source.replace(/<script\b[\s\S]*?<\/script>/g,'');
      cache.set(key,source);
    }
    res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');
    res.end(cache.get(key));
  } catch {res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
let browser;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
  const pages=[],errors=[];
  for(const version of ['before','after']) {
    const page=await browser.newPage({viewport:{width:1280,height:950}});
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://**',route=>route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/${version}/tiles-configurator/index.html`);
    await page.evaluate(async version=>{
      window.rebuilds=[];window.csv='';
      URL.createObjectURL=blob=>{blob.text().then(text=>window.csv=text);return 'blob:test'};
      HTMLAnchorElement.prototype.click=function(){};
      await import(`/${version}/tiles-configurator/js/app.js`);
      window.snapshot=()=>({state:TILES_CONFIGURATOR_API.captureState(),bom:TILES_CONFIGURATOR_API.getEstimate(),rebuilds,csv,
        controls:[...document.querySelectorAll('.sidebar input,.sidebar select')].map(el=>({id:el.id,value:el.value,min:el.min,max:el.max,step:el.step,checked:el.checked,disabled:el.disabled})),
        plan:document.querySelector('#areaPlan').innerHTML,previews:document.querySelector('#patternChoices').innerHTML,
        gates:['rectangleFields','polygonFields','runDField','houseFields','houseWingWidthField','houseWingDepthField','accentSection','areaError'].map(id=>document.getElementById(id).hidden),
        metrics:document.querySelector('#metrics').textContent,total:document.querySelector('#summaryTotal').textContent});
    },version);
    pages.push(page);
  }
  let checks=0;
  const compare=async label=>{
    for(const p of pages) await p.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    assert.deepEqual(await pages[1].evaluate(()=>snapshot()),await pages[0].evaluate(()=>snapshot()),label);checks++;
  };
  const both=async(action,label)=>{for(const p of pages)await action(p);await compare(label)};
  const change=async(id,value)=>both(p=>p.locator('#'+id).evaluate((el,value)=>{
    if(el.type==='checkbox')el.checked=value;else el.value=String(value);
    el.dispatchEvent(new Event(el.type==='range'?'input':'change',{bubbles:true}));
  },value),`${id}=${value}`);
  const click=async selector=>both(p=>p.locator(selector).evaluate(el=>el.click()),selector);
  await compare('initial');
  for(const shape of ['closed4','closed5','rectangle'])await change('shape',shape);
  for(const id of ['length','width','runA','runB','runC','runD','angleB']) {
    await change(id,id==='angleB'?110:8);await change(id+'Range',id==='angleB'?90:6);
  }
  await change('length',999);
  await change('houseEnabled',true);await change('houseShape','l');
  for(const id of ['houseLength','houseWidth','houseWingWidth','houseWingDepth','houseX','houseZ','houseRotation'])await change(id+'Range',id==='houseRotation'?45:2);
  await click('#centerHouse');
  const tiles=await pages[0].locator('[data-tile]').evaluateAll(els=>els.map(e=>e.dataset.tile));
  for(const tile of tiles){
    await click(`[data-tile="${tile}"]`);
    const patterns=await pages[0].locator('[data-pattern]').evaluateAll(els=>els.map(e=>e.dataset.pattern));
    for(const pattern of patterns)await click(`[data-pattern="${pattern}"]`);
    const colors=await pages[0].locator('#colors button').evaluateAll(els=>els.map(e=>e.dataset.color));
    for(const color of colors)await click(`#colors [data-color="${color}"]`);
  }
  await change('rotation',90);
  const curbs=await pages[0].locator('#curb option').evaluateAll(els=>els.map(e=>e.value));
  for(const curb of curbs)await change('curb',curb);
  for(let i=0;i<4;i++)await click(`[data-edge="${i}"]`);
  for(const id of ['waste','tileRate','curbRate'])await change(id,15);
  await both(p=>p.evaluate(()=>shellOptions.callbacks.onUndo()),'undo');
  await both(p=>p.evaluate(()=>TILES_CONFIGURATOR_API.restoreState({...TILES_CONFIGURATOR_API.captureState(),houseEnabled:true,houseShape:'imported',houseFootprint:[{x:0,z:0},{x:3,z:0},{x:3,z:2},{x:0,z:2}],houseLocation:{label:'Fixture'}})),'restore imported footprint');
  await click('#export');
  for(const locale of ['ro-RO','de-DE','en-US'])await both(p=>p.evaluate(locale=>TILES_CONFIGURATOR_API.setLocale(locale),locale),locale);
  await both(p=>p.evaluate(()=>TILES_CONFIGURATOR_API.resetConfiguration()),'reset');
  for(const p of pages){
    await p.locator('.sidebar summary').first().focus();await p.keyboard.press('Enter');
    assert.equal(await p.locator('.sidebar details').first().getAttribute('open'),null);
    await p.keyboard.press('Space');assert.equal(await p.locator('.sidebar details[open]').count(),5);
  }
  const after=pages[1];
  for(const width of [1280,390,320])for(const dark of [false,true])for(const locale of ['en-US','ro-RO','de-DE']){
    await after.setViewportSize({width,height:950});
    await after.evaluate(({dark,locale})=>{TILES_CONFIGURATOR_API.setDarkMode(dark);TILES_CONFIGURATOR_API.setLocale(locale)}, {dark,locale});
    assert.equal(await after.locator('.sidebar').evaluate(el=>el.scrollWidth>el.clientWidth+1),false,`${width}/${dark}/${locale}`);
  }
  if(process.env.TILES_SCREENSHOT){
    await after.setViewportSize({width:1280,height:950});
    await after.evaluate(()=>{TILES_CONFIGURATOR_API.setDarkMode(false);TILES_CONFIGURATOR_API.setLocale('en-US');document.querySelector('.sidebar').scrollTop=0});
    await after.screenshot({path:process.env.TILES_SCREENSHOT});
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS Tiles: ${checks} before/after comparisons of state, BOM, CSV, previews, gates and rebuild callbacks; native accordion keyboard and responsive EN/RO/DE light/dark checks.`);
} finally {await browser?.close();await new Promise(done=>server.close(done))}
