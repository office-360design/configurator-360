import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isConfiguratorAREnabled} from '../../shared-ui/src/arPolicy.js';
import {AR_MODES,arPhoneUrl,arModelUrl,sceneViewerIntent} from '../js/ar/links.js';
import {AR_COPY} from '../js/ar/i18n.js';
import {qrMatrix,qrSvg} from '../js/ar/vendor/qr.js';
test('AR policy: Hall, Window, Pergola, Fence, Pavement, Chair and Cardbox opt-in only',()=>{
  for(const product of ['window','pergola','roof','fence','bookshelf','chair','solar','hall','gas','tiles','cardbox','']){
    assert.equal(isConfiguratorAREnabled(product,{viewAR:true}),['hall','window','pergola','fence','tiles','chair','cardbox'].includes(product));
    assert.equal(isConfiguratorAREnabled(product,{viewAR:false}),false);
  }
});
test('Native links preserve platform, session, locale and encoded model URL',()=>{
  const id='ABCDEFGH01234567abcdefgh01234567';
  assert.equal(AR_MODES.android,'glb');assert.equal(AR_MODES.ios,'usdz');
  const phone=arPhoneUrl(id,'ios','ro-RO','https://360configurator.ro'),u=new URL(phone);assert.equal(u.searchParams.get('mode'),'ios');assert.equal(u.searchParams.get('id'),id);assert.equal(u.pathname,'/configurator-hala/ar.html');
  assert.equal(new URL(arPhoneUrl(id,'ios','de-DE','https://www.360konfigurator.de')).pathname,'/hallen-konfigurator/ar.html');
  assert.equal(new URL(arPhoneUrl(id,'ios','ro-RO','https://customer.360configurator.com')).pathname,'/hall-configurator/ar.html');
  assert.match(arModelUrl(id,'usdz'),/\/hall.usdz\?/);
  const intent=sceneViewerIntent(arModelUrl(id,'glb'),phone);assert.match(intent,/mode=ar_preferred/);assert.match(intent,/package=com.google.android.googlequicksearchbox/);assert.ok(intent.includes(encodeURIComponent(arModelUrl(id,'glb'))));
});
test('EN/RO/DE strings and offline QR generation',()=>{
  const base=Object.keys(AR_COPY['en-US']).sort();for(const locale of ['ro-RO','de-DE'])assert.deepEqual(Object.keys(AR_COPY[locale]).sort(),base);
  const url='https://360configurator.com/hall-configurator/ar.html?id=12345678901234567890123456789012&mode=android&lang=en-US';
  const matrix=qrMatrix(url);assert.ok(matrix.length>=21);assert.equal(matrix[0][0],true);assert.equal(matrix[6][6],true);
  assert.match(qrSvg(url),/viewBox/);assert.throws(()=>qrMatrix('a'.repeat(2000)));
});
test('Firebase workflow deploys each AR export, private bucket rules and TTLs',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/deploy-firebase-share.yml',import.meta.url),'utf8');
  const entry=readFileSync(new URL('../../firebase-share-backend/functions/entry.js',import.meta.url),'utf8');assert.match(entry,/require\('\.\/hall-ar.js'\)/);
  for(const fn of ['publishHallAR','getHallAR','cleanupHallAR']){assert.ok(workflow.includes(`'${fn}'`));assert.ok(workflow.includes(`functions:${fn}`));}
  assert.match(workflow,/--only storage:hall-ar/);
  const indexes=JSON.parse(readFileSync(new URL('../../firebase-share-backend/firestore.indexes.json',import.meta.url)));
  for(const c of ['hallARSessions','hallARRateLimits'])assert.ok(indexes.fieldOverrides.some(v=>v.collectionGroup===c&&v.fieldPath==='purgeAt'&&v.ttl));
});

test('Quick Look launch uses a single image child and a localized external label',()=>{
  const html=readFileSync(new URL('../ar.html',import.meta.url),'utf8');
  const link=html.match(/<a id="arPhoneLaunch"[^>]*>([\s\S]*?)<\/a>/)?.[1];
  assert.ok(link);assert.match(link,/<img[^>]*>/);assert.doesNotMatch(link,/<span|<div|<button|<a/);
  assert.match(html,/data-label="Open AR"/);
  const phone=readFileSync(new URL('../../shared-ui/src/ar/phone.js',import.meta.url),'utf8');
  assert.match(phone,/setAttribute\('rel','ar'\)/);assert.match(phone,/dataset.label=t\('openAR'\)/);
});
