import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {pageFile} from './page-paths.mjs';
import {polishStylesBootstrap} from '../lib/website-bootstrap.js';
import {websiteProduct} from '../lib/website-analytics.js';

test('non-blocking incumbent stylesheet works for network and cached loads', () => {
  for (const cached of [false,true]) {
    let load;
    const link={media:'print',sheet:cached ? {} : null,addEventListener:(name,handler,options)=>{
      assert.equal(name,'load'); assert.equal(options.once,true); load=handler;
    }};
    vm.runInNewContext(polishStylesBootstrap,{document:{getElementById:()=>link}});
    assert.equal(link.media,cached ? 'all' : 'print');
    if (!cached) load();
    assert.equal(link.media,'all');
  }
  assert.doesNotThrow(()=>vm.runInNewContext(polishStylesBootstrap,{document:{getElementById:()=>null}}));
});

test('form product context is strictly enumerated, never free text', () => {
  assert.equal(websiteProduct('roof'),'roof');
  assert.equal(websiteProduct('cardbox'),'cardbox');
  for (const value of ['custom-system','personal@example.com','my roof',null,undefined]) assert.equal(websiteProduct(value),undefined);
});

test('exported locales contain localized cookie settings, factual examples and contact paths', async () => {
  const variants=[['','Cookie settings','Discuss your configurator'],['ro/','Setări cookies','Solicită evaluarea proiectului'],['de/','Cookie-Einstellungen','Konfigurator-Projekt besprechen'],['es/','Ajustes de cookies','Hablemos de su configurador'],['fr/','Paramètres des cookies','Parler de votre configurateur'],['it/','Impostazioni cookie','Parliamo del Suo configuratore']];
  for (const [prefix,title,action] of variants) {
    const html=await readFile(new URL(`../outputs/exported-pages/${prefix}index.html`,import.meta.url),'utf8');
    assert.equal((html.match(/class="cookie-preferences-link"/g) || []).length, 1);
    assert.ok(html.includes(title));
    assert.doesNotMatch(html, /class="analytics-preferences"/);
    const head=html.slice(0,html.indexOf('</head>'));
    assert.match(head,/id="website-polish-styles"[^>]+media="print"/);
    assert.doesNotMatch(head,/dataset.analyticsChoice/);
    assert.match(head,/link.addEventListener/);
    assert.match(html,/id="implementation-examples"/);
    assert.ok(html.includes(action));
    assert.match(html,/project=custom-system/);
    assert.match(html,/rel="canonical"/);
    assert.match(html,/hrefLang="x-default"/);
    const product=await readFile(new URL(`../outputs/exported-pages/${pageFile(prefix,'/configurators/cardbox')}`,import.meta.url),'utf8');
    const questions=product.match(/<div class="project-questions">([\s\S]*?)<\/div>/)?.[1];
    assert.ok(questions);
    assert.equal((questions.match(/<details>/g) || []).length,3);
  }
});
