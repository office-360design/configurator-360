import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantShellOptions, primaryTextColor, applyTenantShellTheme } from '../../shared-ui/src/tenantShellCustomization.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const topBarContext = vm.createContext({
  isConfiguratorAREnabled: () => false, getLanguageProfile: () => ({}),
  renderPlatformAttribution: () => '', sharedT: (_locale,key) => key,
  sharedIcon: () => '', escapeHtml: value => String(value || ''),
  renderAccountMenu: () => '', renderLanguageMenu: () => '',
});
vm.runInContext(readFileSync(new URL('../../shared-ui/src/components/topBar.js',import.meta.url),'utf8')
  .replace(/^import .*;\n/gm,'').replace(/^export /gm,''),topBarContext);
const renderTopBar = vm.runInContext('renderTopBar',topBarContext);

const capabilities = Object.fromEntries(['customization','theme','layout','features','defaults','limits','catalogue'].map(key => [key,true]));
const tenant = settings => ({ capabilities, customization: { schemaVersion:1, revision:1, enabled:true, settings: { schemaVersion:1, ...settings } } });

test('legacy options remain untouched and product capabilities cannot be enabled by a tenant', () => {
  const options = { capabilities: { save:true, viewAR:false, undo:true } };
  assert.equal(resolveTenantShellOptions(options, null, 'roof').options, options);
  const result = resolveTenantShellOptions(options, tenant({ features:{ viewAR:true,cart:false } }), 'roof');
  assert.equal(result.options.capabilities.viewAR,false);
  assert.equal(result.options.capabilities.cart,false);
  assert.equal(result.options.capabilities.save,true);
  assert.equal(result.options.capabilities.undo,true);
  assert.equal(options.capabilities.cart,undefined);
});
test('per-product overrides win and bookshelf never gains an add-to-cart action', () => {
  const result = resolveTenantShellOptions({capabilities:{save:true}}, tenant({features:{cart:false},products:{roof:{features:{cart:true}}}}),'roof');
  assert.equal(result.options.capabilities.cart,true);
  assert.equal(resolveTenantShellOptions({capabilities:{save:true}},tenant({features:{cart:true}}),'bookshelf').options.capabilities.cart,false);
});
test('disabled cart is absent from the real top bar without removing save', () => {
  const html = renderTopBar({ brandSrc:'',brandAlt:'Test',projectName:'Example',productId:'roof',
    state:{locale:'en-US',authUser:{uid:'owner'},cartCount:1},capabilities:{save:true,cart:false} });
  assert.ok(!html.includes('data-action="cart"'));
  assert.ok(html.includes('data-action="save"'));
});
test('accent text remains legible on bright and dark colors', () => {
  assert.equal(primaryTextColor('#FFFFFF'),'#000000');
  assert.equal(primaryTextColor('#000000'),'#FFFFFF');
  assert.equal(primaryTextColor('#166534'),'#FFFFFF');
});
test('theme application cleans up only its own properties', () => {
  const values = new Map([['--tenant-primary','#AAAAAA'],['--unrelated','42px']]);
  const attrs = new Map();
  const root = { style:{ getPropertyValue:k=>values.get(k)||'',getPropertyPriority:()=>'',setProperty:(k,v)=>values.set(k,v),removeProperty:k=>values.delete(k) },
    getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k) };
  const restore = applyTenantShellTheme(root,{theme:{primary:'#166534'},layout:{desktop:{toolbarPosition:'bottom-left'}}});
  assert.equal(values.get('--tenant-primary'),'#166534');
  assert.equal(attrs.get('data-tenant-tools-position'),'bottom-left');
  restore();
  assert.equal(values.get('--tenant-primary'),'#AAAAAA');
  assert.equal(values.get('--unrelated'),'42px');
  assert.equal(attrs.size,0);
});
const shellSource = readFileSync(new URL('../../shared-ui/src/standaloneShell.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
function shellPrototype(compact = false) {
  const context = vm.createContext({window:{matchMedia:()=>({matches:compact})}});
  vm.runInContext(shellSource,context);
  return vm.runInContext('StandaloneConfiguratorShell.prototype',context);
}
test('left panel toggle uses desktop left edge and returns to native right edge on mobile', () => {
  for(const compact of [false,true]) {
    const values = new Map();
    const toggle={dataset:{},style:{setProperty:(k,v)=>values.set(k,v)}};
    shellPrototype(compact).syncFloatingConfiguratorPanelToggle.call({configuratorPanelToggle:toggle,options:{configuratorPanel:{geometry:'floating-right'}},tenantCustomization:{layout:{desktop:{panelSide:'left'}}},settingsPanelCollapsed:false});
    assert.equal(values.get(compact?'left':'right'),'auto');
    assert.equal(toggle.dataset.tenantPanelSide,compact?undefined:'left');
  }
});
test('disabled shared actions are guarded at their method entry points', async () => {
  const prototype = shellPrototype();
  const shell = { options:{capabilities:{save:false,share:false,cart:false}} };
  assert.equal(await prototype.save.call(shell),false);
  assert.equal(await prototype.emptyCart.call(shell),false);
  assert.equal(await prototype.restoreCartEditTransport.call(shell,{}),false);
  assert.equal(await prototype.share.call(shell),undefined);
});
