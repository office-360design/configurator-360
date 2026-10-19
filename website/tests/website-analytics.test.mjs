import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {CONSENT_KEY, INTERNAL_KEY, readChoice, isInternalVisit, trackWebsiteEvent} from '../lib/website-analytics.js';
import {GA_ID, PUBLIC_DOMAINS, analyticsContext} from '../lib/website-analytics.js';

function storage() {const values = new Map(); return {getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: key => values.delete(key)};}
function browser() {
  const calls=[];
  globalThis.window={localStorage:storage(),location:{hostname:'www.360configurator.com',pathname:'/contact',search:''},gtag:(...args)=>calls.push(args)};
  return calls;
}

test('optional events require explicit consent and production host', () => {
  const calls=browser();
  assert.equal(readChoice(window.localStorage),null);
  assert.equal(trackWebsiteEvent('generate_lead',{form_id:'marketing_contact'}),false);
  window.localStorage.setItem(CONSENT_KEY,'denied');
  assert.equal(trackWebsiteEvent('generate_lead'),false);
  window.localStorage.setItem(CONSENT_KEY,'granted');
  window.location.hostname='localhost';
  assert.equal(trackWebsiteEvent('generate_lead'),false);
  assert.equal(calls.length,0);
});

test('staff marker survives changing networks, with explicit opt-out', () => {
  browser(); window.location.search='?360_test=1';
  assert.equal(isInternalVisit(window.location,window.localStorage),true);
  window.location.search='';
  assert.equal(window.localStorage.getItem(INTERNAL_KEY),'1');
  assert.equal(isInternalVisit(window.location,window.localStorage),true);
  window.location.search='?360_test=0';
  assert.equal(isInternalVisit(window.location,window.localStorage),false);
});

test('event payload excludes personal fields, arbitrary URLs and unknown events', () => {
  const calls=browser(); window.localStorage.setItem(CONSENT_KEY,'granted');
  assert.equal(trackWebsiteEvent('generate_lead',{form_id:'marketing_contact',email:'private@example.com',message:'private',page_location:'https://example.com/?email=private',product:'roof'}),true);
  assert.deepEqual(calls[0],['event','generate_lead',{language:'en',hostname:'www.360configurator.com',product:'roof',form_id:'marketing_contact'}]);
  assert.equal(trackWebsiteEvent('made_up_conversion'),false);
});

test('engagement is deduplicated but failed events are not consumed before consent', () => {
  const calls=browser(); window.location.pathname='/configurators/chair';
  assert.equal(trackWebsiteEvent('lite_preview_engaged',{product:'chair'},true),false);
  window.localStorage.setItem(CONSENT_KEY,'granted');
  assert.equal(trackWebsiteEvent('lite_preview_engaged',{product:'chair'},true),true);
  assert.equal(trackWebsiteEvent('lite_preview_engaged',{product:'chair'},true),false);
  assert.equal(calls.length,1);
});

test('only the delivered form response reports a lead; automatic pageviews have one owner', async () => {
  for (const file of ['contact-form.tsx','demo-request-form.tsx']) {
    const source=await readFile(new URL(`../components/${file}`,import.meta.url),'utf8');
    assert.match(source,/response\.data(?:\?|)\.?(?:delivered|success)/);
    assert.match(source,/response\.data\.delivered[\s\S]{0,120}trackWebsiteEvent\(["']generate_lead/);
  }
  const source=await readFile(new URL('../components/google-analytics.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/gtag[^\n]*['"]event['"],\s*['"]page_view/);
  assert.match(source,/hasWebsiteConsent\('statistics'\)/);
});

test('SwiftCallback remains independent of analytics and never reports a confirmed lead', async () => {
  const source=await readFile(new URL('../components/swift-callback.tsx',import.meta.url),'utf8');
  assert.match(source,/hasWebsiteConsent\('preferences'\)/);
  assert.doesNotMatch(source,/hasWebsiteConsent\('statistics'\)/);
  assert.match(source,/contact_intent/); assert.doesNotMatch(source,/generate_lead|CONSENT_KEY/);
});

test('the lite renderer still receives its required metrics callback', async () => {
  const source=await readFile(new URL('../components/lite-preview.tsx',import.meta.url),'utf8');
  assert.match(source,/metrics:\s*\(\)\s*=>\s*\{\}/);
});

test('non-product scene and initialization requests cannot create product engagement', async () => {
  const calls=browser(); window.localStorage.setItem(CONSENT_KEY,'granted');
  assert.equal(trackWebsiteEvent('lite_preview_engaged',{product:'engine'}),false);
  assert.equal(calls.length,0);
  const source=await readFile(new URL('../components/google-analytics.tsx',import.meta.url),'utf8');
  assert.match(source,/control === 'requestPrice'/);
  assert.match(source,/event\.isTrusted/);
  assert.match(source,/gestures\.get\(product\)/);
});

test('production initialization has no tag before consent or for staff, and queues consent before config', async () => {
  const source=await readFile(new URL('../components/google-analytics.tsx',import.meta.url),'utf8');
  const ast=ts.createSourceFile('analytics.tsx',source,ts.ScriptTarget.Latest,true);
  const initialize=ast.statements.find(node=>ts.isFunctionDeclaration(node) && node.name.text==='initializeAnalytics');
  const script=ts.transpile(`let initialized=false; ${initialize.getText(ast)}`,{target:ts.ScriptTarget.ES2022});
  for (const host of PUBLIC_DOMAINS) {
    const store=storage(), tags=[], window={localStorage:store,location:{hostname:host,pathname:'/',search:''},dispatchEvent:()=>{}};
    const context=vm.createContext({window,document:{createElement:()=>({}),head:{appendChild:tag=>tags.push(tag)}},Event,GA_ID,PUBLIC_DOMAINS,hasWebsiteConsent:category=>category==='statistics' && readChoice(store)==='granted',isInternalVisit,analyticsContext,browserStorage:()=>store});
    vm.runInContext(script,context);
    vm.runInContext('initializeAnalytics()',context);
    assert.equal(tags.length,0);
    store.setItem(CONSENT_KEY,'granted'); store.setItem(INTERNAL_KEY,'1');
    vm.runInContext('initializeAnalytics()',context); assert.equal(tags.length,0);
    store.removeItem(INTERNAL_KEY);
    vm.runInContext('initializeAnalytics()',context);
    vm.runInContext('initializeAnalytics()',context);
    assert.equal(tags.length,1);
    const commands=window.dataLayer.map(args=>Array.from(args));
    assert.equal(commands[0][0],'consent'); assert.equal(commands[0][1],'default');
    assert.equal(commands[0][2].analytics_storage,'denied');
    assert.equal(commands[1][1],'update'); assert.equal(commands[1][2].analytics_storage,'granted');
    assert.ok(commands.findIndex(args=>args[0]==='config')>1);
    assert.deepEqual(Array.from(commands.find(args=>args[0]==='set')[2].domains),PUBLIC_DOMAINS);
    assert.equal(window[`ga-disable-${GA_ID}`],false);
  }
});

test('withdrawal preserves form state by not reloading the page', async () => {
  const source=await readFile(new URL('../components/google-analytics.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/location\.reload/);
  assert.match(source,/ga-disable-\$\{GA_ID\}`\] = true/);
});

test('explicit consent and withdrawal still work for this session when storage is blocked', async () => {
  const isolated=await import('../lib/website-analytics.js?blocked-storage-test');
  const calls=browser();
  window.localStorage={getItem:()=>{throw new Error('blocked');},setItem:()=>{throw new Error('blocked');}};
  assert.equal(isolated.readChoice(window.localStorage),null);
  assert.equal(isolated.setChoice('granted'),false);
  assert.equal(isolated.readChoice(window.localStorage),'granted');
  assert.equal(isolated.trackWebsiteEvent('contact_intent',{method:'email'}),true);
  assert.equal(isolated.setChoice('denied'),false);
  assert.equal(isolated.trackWebsiteEvent('contact_intent',{method:'email'}),false);
  assert.equal(calls.length,1);
});

test('analytics language follows every public website domain', () => {
  const expected = {
    'www.360configurator.com': 'en', 'www.360configurator.ro': 'ro', 'www.360konfigurator.de': 'de',
    'www.360configurador.es': 'es', 'www.360configurateur.fr': 'fr', 'www.360configuratore.it': 'it',
  };
  assert.deepEqual([...PUBLIC_DOMAINS].sort(), Object.keys(expected).sort());
  for (const [hostname, language] of Object.entries(expected)) assert.equal(analyticsContext({hostname}).language, language);
  assert.equal(analyticsContext({hostname: 'localhost'}).language, 'en');
});

test('product pages are recognised under every domain language', async () => {
  const {PRODUCT_PAGE_SEGMENTS, isProductPagePath} = await import('../lib/website-analytics.js');
  const slugs = JSON.parse(await readFile(new URL('../lib/page-slugs.json', import.meta.url), 'utf8'));
  assert.deepEqual([...PRODUCT_PAGE_SEGMENTS].sort(), [...new Set(Object.values(slugs.pages.configurators))].sort());
  assert.equal(isProductPagePath('/configuratori/finestre'), true);
  assert.equal(isProductPagePath('/konfiguratoren/fenster'), true);
  assert.equal(isProductPagePath('/chi-siamo'), false);
});

test('the configurators use the same Analytics property, consent key and domains as the website', async () => {
  const site = await import('../lib/website-analytics.js');
  const configurators = await import('../../shared-ui/src/siteAnalytics.js');
  for (const name of ['GA_ID', 'CONSENT_KEY', 'INTERNAL_KEY']) assert.equal(configurators[name], site[name], name);
  assert.deepEqual(configurators.PUBLIC_DOMAINS, site.PUBLIC_DOMAINS);
});

test('configurator modules that report events are imported with a cache tag', async () => {
  // The servers send no Cache-Control, so an untagged module can stay stale after a deploy.
  for (const file of ['standaloneShell.js', 'configurationQuotation.js']) {
    const source = await readFile(new URL(`../../shared-ui/src/${file}`, import.meta.url), 'utf8');
    for (const [, name] of source.matchAll(/from\s+['"]\.\/(siteAnalytics|configurationQuotation)\.js(?!\?v=)/g)) assert.fail(`${file} imports ${name}.js without ?v=`);
  }
});
