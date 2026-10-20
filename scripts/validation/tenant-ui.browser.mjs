import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/shared-ui/styles/standalone.css"><link rel="stylesheet" href="/shared-ui/styles/index.css">
<link rel="stylesheet" href="/shared-ui/styles/panelControls.css">
<style>body{margin:0;background:#edf1f3}.app-shell{height:100vh}.sidebar{padding:20px}.viewer-panel{background:linear-gradient(140deg,#dae4e4,#f8fbfb)}.shared-panel-controls{padding:12px}</style></head>
<body><div class="app-shell"><div class="viewer-panel"></div><aside class="sidebar shared-panel-controls"><h2>Pergola</h2><label>Width<input type="range"></label></aside><button id="panelToggle">❯</button></div>
<script type="module">
const { mountStandaloneConfiguratorShell } = await import('/shared-ui/src/standaloneShell.js');
const custom = new URLSearchParams(location.search).has('custom');
const context = custom ? {isTenant:true,exists:true,status:'active',slug:'acme',companyName:'Acme',configurators:{pergola:true},capabilities:Object.fromEntries(['customization','theme','layout','features','defaults','limits','catalogue'].map(k=>[k,true])),customization:{schemaVersion:1,revision:1,enabled:true,settings:{schemaVersion:1,theme:{primary:'#166534',surface:'#FFF8E7',text:'#172027',radius:'large'},layout:{desktop:{panelSide:'left',toolbarPosition:'bottom-left'}},features:{cart:false,price:false,quotation:true}}}} : null;
window.__CFG360_TENANT_CONTEXT__ = context;
window.shell = mountStandaloneConfiguratorShell({productId:'pergola',productType:'Pergola',brandSrc:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E',capabilities:{save:true,share:true,viewAR:true},settingsPanel:{panelSelector:'.sidebar',toggleSelector:'#panelToggle',collapsedClass:'is-collapsed'},configuratorPanel:{panelSelector:'.sidebar',geometry:'floating-right',getEstimatedTotal:()=>1250},tools:{items:[{id:'camera',action:'camera',label:'Camera',icon:'C'}],placement:{side:'left',direction:'down',offsetX:12,offsetY:12}},callbacks:{captureState:()=>({}),resetConfiguration:()=>true}});
</script></body></html>`;
const editorFixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/shared-ui/styles/tenantProvisioningAdmin.css"></head><body><main class="admin-page"><section class="admin-card tenant-customization-editor" id="editor"></section></main><script type="module">
const {mountTenantCustomizationEditor}=await import('/shared-ui/src/tenantCustomizationEditor.js');
window.calls=[];window.state={revision:0,draftVersion:0,draft:null,published:{settings:{schemaVersion:1},enabled:false},capabilities:{customization:true}};
window.editor=mountTenantCustomizationEditor(document.querySelector('#editor'),{products:{pergola:{label:'Pergola'}},call:async(name,data)=>{
window.calls.push({name,data});if(name==='getTenantCustomization')return structuredClone(window.state);
if(name==='saveTenantCustomizationDraft'){window.state.draft=data.settings;window.state.draftVersion++;return {revision:window.state.revision,draftVersion:window.state.draftVersion};}
if(name==='previewTenantCustomization')return {settings:window.state.draft,draftVersion:window.state.draftVersion};
if(name==='publishTenantCustomization'){window.state.revision++;window.state.published.enabled=true;return {revision:window.state.revision};}
throw new Error('Unexpected action');}});
window.editor.setTenant({slug:'acme',planId:'go_live_custom_1',status:'active',capabilities:{customization:true},configurators:{pergola:true}});
</script></body></html>`;
const server = createServer(async (request,response) => {
  try {
    const path = new URL(request.url,'http://localhost').pathname;
    if(path === '/fixture' || path === '/editor') {response.setHeader('Content-Type','text/html');response.end(path === '/fixture' ? fixture : editorFixture);return;}
    const file = resolve(root,'.'+decodeURIComponent(path));
    if(!file.startsWith(root+'/')) {response.writeHead(403).end();return;}
    response.setHeader('Content-Type', {'.js':'text/javascript','.css':'text/css','.json':'application/json'}[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch {response.writeHead(404).end();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/firebaseAuth.js*',route=>route.fulfill({contentType:'text/javascript',body:`export const getFirebaseIdToken=async()=>null;export const observeGoogleAuth=async callback=>{callback(null);return ()=>{}};export const signInWithGoogle=async()=>null;export const signOutGoogle=async()=>{};export const createDomainAuthHandoff=async()=>null;export const redeemDomainAuthHandoff=async()=>null;export const signInWithDomainCustomToken=async()=>null;`}));
  await page.goto(origin+'/fixture?custom=1');
  await page.waitForFunction(()=>window.shell && document.body.dataset.tenantTheme==='true');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.shared-configurator-panel__add-button')).backgroundColor==='rgb(22, 101, 52)');
  assert.equal(await page.locator('[data-action="cart"]').count(),0);
  assert.equal(await page.locator('[data-shared-panel-add-to-cart]').isVisible(),false);
  assert.equal(await page.locator('.shared-configurator-panel__price').isVisible(),false);
  assert.equal(await page.locator('[data-shared-panel-quotation]').isVisible(),true);
  const panel=await page.locator('.sidebar').boundingBox();
  assert.ok(Math.abs(panel.x-20)<2);
  const toggle=await page.locator('#panelToggle').boundingBox();
  assert.ok(Math.abs(toggle.x-380)<2);
  const toolbar=await page.locator('[data-shared-tools]').boundingBox();
  assert.ok(toolbar.x>=420 && toolbar.y>650,'toolbar must clear the open left panel');
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/tenant-ui-desktop.png'});
  await page.locator('#panelToggle').click();
  await page.waitForFunction(()=>document.querySelector('#panelToggle').style.left==='0px');
  await page.locator('#panelToggle').click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>!document.querySelector('#panelToggle').dataset.tenantPanelSide);
  assert.equal(await page.locator('#panelToggle').evaluate(el=>el.style.left),'auto');
  const mobilePanel=await page.locator('.sidebar').boundingBox();
  assert.ok(mobilePanel.x>=0 && mobilePanel.x+mobilePanel.width<=391);
  assert.equal(await page.locator('[data-shared-tools]').isVisible(),false);
  await page.screenshot({path:'artifacts/tenant-ui-mobile.png'});
  await page.locator('#panelToggle').click();
  assert.equal(await page.locator('[data-shared-tools]').isVisible(),true);
  await page.evaluate(()=>{window.shell.destroy()});
  assert.equal(await page.locator('body').getAttribute('data-tenant-theme'),null);
  await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.shell);
  assert.equal(await page.locator('body').getAttribute('data-tenant-theme'),null);
  assert.equal(await page.locator('[data-action="cart"]').count(),1);
  assert.equal(await page.locator('[data-shared-panel-add-to-cart]').isVisible(),true);
  await page.goto(origin+'/editor');
  await page.waitForFunction(()=>document.querySelector('[data-custom-fields]')?.disabled === false);
  await page.locator('[data-custom-color="primary"]').fill('#166534');
  await page.locator('[data-custom-feature="cart"]').selectOption('false');
  assert.equal(await page.locator('[data-custom-action="publish"]').isDisabled(),true);
  await page.locator('[data-custom-action="save"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-custom-status]').textContent.includes('Draft saved'));
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.name==='saveTenantCustomizationDraft').data.settings.features.cart),false);
  await page.locator('[data-custom-action="preview"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-custom-preview]').hidden);
  assert.equal(await page.locator('[data-sample-cart]').isVisible(),false);
  await page.screenshot({path:'artifacts/tenant-ui-editor-mobile.png',fullPage:true});
  await page.locator('[data-custom-action="publish"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-custom-status]').textContent.includes('Published revision 1'));
  await page.evaluate(()=>window.editor.setTenant({slug:'legacy',planId:'go_live_now_1',status:'active',capabilities:{customization:false},configurators:{pergola:true}}));
  assert.deepEqual(errors,[]);
  console.log('Tenant shared UI desktop/mobile and editor browser checks passed.');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
