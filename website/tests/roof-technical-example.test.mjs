import test from 'node:test';
import {pageFile, localizedRoutePath} from './page-paths.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {register} from 'node:module';

register(new URL('./native-roof-loader.mjs',import.meta.url));
const {buildRoofModel}=await import('../../roof-configurator/js/roofFactory.js');
const {calculateBom,bomToCsv}=await import('../../roof-configurator/js/bom.js');

const sample=JSON.parse(await readFile(new URL('../lib/roof-example-data.json',import.meta.url),'utf8'));

test('published technical example is reproduced by the unchanged native roof model and BOM', () => {
  const model=buildRoofModel(sample.input);
  const bom=calculateBom(sample.input,model.metrics);
  assert.equal(model.metrics.footprint,sample.output.footprint);
  assert.ok(Math.abs(model.metrics.roofArea-sample.output.roofArea)<1e-6);
  assert.equal(bom.assumptions.ridgeLength,sample.output.ridgeLength);
  assert.equal(bom.assumptions.eavesLength,sample.output.eavesLength);
  assert.equal(bom.lines.find(line=>line.key==='tile').quantity,sample.output.panels);
  assert.equal(bom.lines.find(line=>line.key==='ridge').quantity,sample.output.ridgePieces);
  assert.equal(bom.lines.find(line=>line.key==='gutter').quantity,sample.output.gutterPieces);
  assert.equal(bom.assumptions.panelEffectiveArea,sample.assumptions.panelEffectiveArea);
  assert.ok(Math.abs(bom.assumptions.wastePercent-sample.assumptions.panelWastePercent)<1e-9);
  const csv=bomToCsv(bom);
  assert.match(csv,/Description.*Unit.*Qty\./);
  assert.match(csv,/"218"/);
  model.group.traverse(object=>{object.geometry?.dispose();});
});

test('technical proof is server-rendered in all locales with each domain\'s own canonical URL', async () => {
  for (const [prefix,host,title] of [['','www.360configurator.com','From a configured roof'],['ro/','www.360configurator.ro','De la acoperișul configurat'],['de/','www.360konfigurator.de','Vom konfigurierten Dach'],['es/','www.360configurador.es','De un tejado configurado'],['fr/','www.360configurateur.fr','D’une toiture configurée'],['it/','www.360configuratore.it','Da un tetto configurato']]) {
    const html=await readFile(new URL(`../outputs/release-site/${pageFile(prefix,'/configurators/roof')}`,import.meta.url),'utf8');
    const roofPath=localizedRoutePath(prefix.replace('/','')||'en','/configurators/roof');
    assert.match(html,/id="roof-technical-example"/);
    assert.ok(html.includes(title));
    assert.match(html,/218/);
    assert.match(html,/97[.,]27/);
    assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
    assert.ok(html.includes(`rel="canonical" href="https://${host}${roofPath}"`));
    assert.match(html,/project=roof/);
    const home=await readFile(new URL(`../outputs/release-site/${prefix}index.html`,import.meta.url),'utf8');
    assert.ok(home.includes(`${roofPath}#roof-technical-example`));
  }
  const component=await readFile(new URL('../components/roof-technical-example.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(component,/use client|roofFactory|calculateBom|from ['"]three/);
});

test('paving copy describes the active photo preview instead of its unused native builder', async () => {
  for (const prefix of ['','ro/','de/','es/','fr/','it/']) {
    const html=await readFile(new URL(`../outputs/release-site/${pageFile(prefix,'/configurators/tiles')}`,import.meta.url),'utf8');
    assert.match(html,/photo\/2D|foto\/2D|Foto\/2D/);
    assert.match(html,/full 3D prototype|prototipul 3D complet|vollständige 3D-Prototyp|prototipo 3D completo|prototype 3D complet/);
  }
  const runtime=await readFile(new URL('../components/lite-preview.tsx',import.meta.url),'utf8');
  assert.match(runtime,/isTiles \? <TilesPhotoPreview/);
  assert.doesNotMatch(runtime,/select\('houseEnabled'/);
});
