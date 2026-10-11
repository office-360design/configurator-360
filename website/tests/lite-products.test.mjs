import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { buildModel as chair } from '../lib/scenes/lite/chair.js';
import { buildModel as cardbox } from '../lib/scenes/lite/cardbox.js';
import { buildModel as bookshelf } from '../lib/scenes/lite/bookshelf.js';
import { buildModel as tiles,previewState } from '../lib/scenes/lite/tiles.js';
import { layout } from '../../tiles-configurator/js/model.js';
import { disposeModel } from '../lib/scenes/lite/runtime.js';
import { registerChairMaterials } from '../../chair-configurator/js/materials.js';
import { inflateSync } from 'node:zlib';
import ts from 'typescript';
import cardboxCatalog from '../lib/cardbox-catalog.json' with {type:'json'};

test('all nine native cardbox styles preserve defaults, closures and board papers', () => {
  assert.equal(cardboxCatalog.styles.length,9);
  for(const style of cardboxCatalog.styles)for(const paper of ['TFT','AFT','AFA']){
    const [width,depth,height]=style.dims;
    const model=cardbox({style:style.id,width,depth,height,open:0,paper});
    assert.equal(model.metrics.litres,width*depth*height/1e6);
    const surfaces=model.group.children.filter(x=>x.userData.cardboxSurface);
    for(const mesh of surfaces){const outer=mesh.userData.surfaceSideFactor===1;assert.equal(mesh.material.color.getHexString(),paper==='AFA'||(paper==='AFT'&&outer)?'f1efe7':'b88959');}
    if(style.id==='archive'||style.id==='pizza')assert.ok(surfaces.some(mesh=>mesh.geometry.type==='ShapeGeometry'));
    disposeModel(model);
    for(const top of style.topOptions){const candidate=cardbox({style:style.id,width,depth,height,open:100,top});const lids=candidate.group.children.filter(x=>x.userData.top);assert.equal(lids.length,2);assert.ok(lids.every(x=>x.visible===(top!=='open')));disposeModel(candidate);}
  }
});

test('cardbox uses current production surface, paper and closure functions', async () => {
  const functions=source=>{const found=new Map(),ast=ts.createSourceFile('app.js',source,ts.ScriptTarget.Latest,true);function visit(node){if(ts.isFunctionDeclaration(node)&&node.name)found.set(node.name.text,node.getText(ast).replace(/\s+/g,' '));ts.forEachChild(node,visit);}visit(ast);return found;};
  const original=await readFile(new URL('../../cardbox-configurator/js/app.js',import.meta.url),'utf8');
  const actual=functions(await readFile(new URL('../lib/scenes/lite/cardbox.js',import.meta.url),'utf8'));
  const expected=functions(original.replace(/ {2}if\(selectedFaceSnapshot[^\n]+\n/,''));
  for(const name of ['makeColoredSurfaceMesh','applyFeaturesAndSurfaceColours','resolvedSurfaceColor','packagingDefaultLayers','ensurePackagingState','packagingRenderClosureVisuals','closureQuaternion'])assert.equal(actual.get(name),expected.get(name),name);
  assert.equal(actual.has('makeSurfaceMesh'),false);
});

test('cardbox preserves inside/outside papers, native edges and paired lid motion', () => {
  for(const style of ['standard','full-overlap','telescope'])for(const open of [0,50,100]){
    const model=cardbox({width:600,depth:400,height:300,style,open,colour:'#f1efe7'});
    const surfaces=model.group.children.filter(x=>x.userData.cardboxSurface);
    assert.equal(surfaces.length,12);
    for(const mesh of surfaces){const outer=mesh.userData.surfaceSideFactor===1;assert.equal(mesh.material.side,outer?THREE.FrontSide:THREE.BackSide);assert.equal(mesh.material.color.getHexString(),outer?'f1efe7':'b88959');if(outer)assert.ok(mesh.children.some(x=>x.isLineSegments));}
    const top=surfaces.filter(x=>x.userData.top);assert.deepEqual(top[0].position.toArray(),top[1].position.toArray());assert.deepEqual(top[0].quaternion.toArray(),top[1].quaternion.toArray());disposeModel(model);
  }
});

test('baked chair maps and presets come from production; textures dispose with geometry', async () => {
  const providers=new Map(),presets=new Map();
  registerChairMaterials({textures:{providers,register:(id,fn)=>providers.set(id,fn)},presets,register:(id,spec)=>presets.set(id,spec)});
  const baked=JSON.parse(await readFile(new URL('../public/lite-assets/chair/presets.json',import.meta.url),'utf8'));
  for(const [id,spec] of Object.entries(baked)) assert.deepEqual(spec,presets.get(id));
  const png=await readFile(new URL('../public/lite-assets/chair/chair.fabric.linen-color.png',import.meta.url));
  const chunks=[];for(let i=8;i<png.length;){const length=png.readUInt32BE(i);if(png.toString('ascii',i+4,i+8)==='IDAT')chunks.push(png.subarray(i+8,i+8+length));i+=length+12;}
  const raw=inflateSync(Buffer.concat(chunks)),expected=providers.get('chair.fabric.linen')().color;
  for(let y=0;y<128;y++)assert.deepEqual(raw.subarray(y*513+1,y*513+513),Buffer.from(expected.subarray(y*512,(y+1)*512)));
  const model=chair({wood:'#be8851',fabric:'#b88162',weave:'linen'},{wood:new THREE.MeshPhysicalMaterial({map:new THREE.Texture()}),fabric:new THREE.MeshPhysicalMaterial({map:new THREE.Texture()})});
  const textures=new Set();
  model.group.traverse(object=>{if(object.material?.map) textures.add(object.material.map);});
  let disposed=0;
  textures.forEach(texture=>texture.addEventListener('dispose',()=>disposed++));
  disposeModel(model);
  assert.equal(disposed,textures.size);
  assert.equal(textures.size,2);
});

test('new and established consoles reuse the same lightweight control primitives', async () => {
  for(const name of ['lite-preview','showcase-controls','extended-showcase-controls']) {
    const source=await readFile(new URL(`../components/${name}.tsx`,import.meta.url),'utf8');
    assert.match(source,/from "\.\/scene-control-primitives"/);
  }
  const source=await readFile(new URL('../components/scene-control-primitives.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"].*(?:scenes|three|configurator\/)/);
});

test('chair keeps native geometry and bounded dimensions with website materials', () => {
  const model = chair({wood:'#be8851',fabric:'#b88162',weave:'linen'});
  assert.equal(model.group.userData.originalGeometry,true);
  const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
  assert.ok(size.x > .4 && size.x < .6 && size.y > .7 && size.y < .9);
  assert.deepEqual(model.metrics,{width:500,depth:470,height:790});
  disposeModel(model);
});

test('box volume follows dimensions for every supported closure, including closed state', () => {
  for (const style of ['standard','full-overlap','telescope']) for (const open of [0,100]) {
    const model = cardbox({width:600,depth:400,height:300,open,style,colour:'#b88959'});
    assert.equal(model.metrics.litres,72);
    const bounds = new THREE.Box3().setFromObject(model.group);
    assert.ok(Number.isFinite(bounds.max.y));
    assert.ok(bounds.min.y >= -.002); // Native bottom closure seam is 1.1mm below the base.
    disposeModel(model);
  }
});

test('bookshelf families, corners and all door variants create connected bounded assemblies', () => {
  for (const family of ['compact','tall']) for (const arrangement of ['straight','corner']) for (const doors of ['open','lower','glazed']) {
    const model = bookshelf({family,layout:arrangement,count:4,doors,colour:'#65422d'});
    assert.equal(model.metrics.connections,3);
    const bounds = new THREE.Box3().setFromObject(model.group);
    assert.ok(Math.abs(bounds.max.y - (family === 'compact' ? 2.15 : 2.3)) < .03);
    assert.ok(bounds.getSize(new THREE.Vector3()).length() < 5);
    assert.equal(model.group.children.filter(child=>child.userData.bookshelfModuleId).length,4);
    disposeModel(model);
  }
});

test('paving preview matches production layout count, area and edge positions', () => {
  for (const pattern of ['running','herringbone','basket']) for (const [length,width] of [[1,1],[2.25,1.75],[4,3]]) {
    const state = {length,width,pattern,colour:'#858b8e'};
    const model = tiles(state);
    const expected = layout({...state,tile:'parket',houseEnabled:false,shape:'rectangle'});
    assert.equal(model.metrics.pieces,expected.length);
    assert.ok(Math.abs(model.metrics.area-length*width)<1e-6);
    assert.ok(expected.length < 700);
    assert.ok(Math.abs(expected.reduce((n,p)=>n+p.l*p.w,0) - length*width) < 1e-6);
    const matrix = new THREE.Matrix4();
    model.group.children.find(child=>child.isInstancedMesh).getMatrixAt(0,matrix);
    assert.ok(Math.abs(matrix.elements[12] - (expected[0].x-length/2)) < 1e-6);
    disposeModel(model);
  }
});

test('house exclusions, rotated footprints and formats use production paving quantities', () => {
  for(const tile of ['parket','square','granit']) for(const houseShape of ['rectangle','l']) for(const houseRotation of [0,45,90]) {
    const input={length:4,width:3,tile,pattern:'running',houseEnabled:'yes',houseShape,houseRotation,houseLength:1.5,houseWidth:1,curbs:'yes',colour:'#a65343'};
    const model=tiles(input),expected=layout(previewState(input));
    assert.equal(model.metrics.pieces,expected.length);
    assert.ok(Math.abs(model.metrics.area-expected.reduce((sum,p)=>sum+(p.area??p.l*p.w),0))<1e-6);
    assert.ok(model.metrics.area<12);
    assert.ok(new THREE.Box3().setFromObject(model.group).max.y>1);
    disposeModel(model);
  }
});

test('bookshelf native shelf layouts and door hardware build in both door positions', () => {
  const counts=[];
  for(const shelves of [3,6,9]) for(const hardware of ['diamond','rectangle','knob']) for(const doorOpen of ['closed','open']) {
    const model=bookshelf({family:'tall',layout:'corner',count:3,doors:'glazed',shelves,hardware,doorOpen,colour:'#b98555'});
    let count=0;model.group.traverse(object=>{if(object.isMesh)count++;});counts.push(count);
    assert.ok(Number.isFinite(new THREE.Box3().setFromObject(model.group).max.x));disposeModel(model);
  }
  assert.ok(new Set(counts).size>1);
});

test('all new localized pages expose correct SEO, visible FAQs, full-app links and no eager renderers', async () => {
  const origins = {en:'https://www.360configurator.com',ro:'https://www.360configurator.ro',de:'https://www.360konfigurator.de'};
  const slugs = ['chair','cardbox','bookshelf','tiles'];
  for (const [locale,origin] of Object.entries(origins)) {
    const prefix = locale === 'en' ? '' : `${locale}/`;
    const home = await readFile(new URL(`../outputs/release-site/${prefix}index.html`,import.meta.url),'utf8');
    for (const slug of slugs) {
      assert.ok(home.includes(`data-lite-product="${slug}"`));
      const html = await readFile(new URL(`../outputs/release-site/${prefix}configurators/${slug}/index.html`,import.meta.url),'utf8');
      assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
      assert.ok(html.includes(`rel="canonical" href="${origin}/configurators/${slug}"`));
      for (const languageOrigin of Object.values(origins)) assert.ok(html.includes(`${languageOrigin}/configurators/${slug}`));
      assert.ok(html.includes('"@type":"FAQPage"'));
      assert.ok(html.includes('"@type":"WebApplication"'));
      assert.ok(html.includes('"@type":"BreadcrumbList"'));
      assert.equal((html.match(/<details>/g)||[]).length,3);
      assert.ok(html.includes('data-lite-product="'+slug+'"'));
      const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*>/g)].map(m=>m[0]).join('\n');
      assert.doesNotMatch(preloads,/three\.module|webgl-stage-|\/runtime-|\/bookshelf-|\/chair-|\/tiles-|\/cardbox-/);
      assert.doesNotMatch(html,/data-scene="gas"|\/configurators\/gas/);
    }
    const sitemap = await readFile(new URL(`../outputs/release-site/sitemap-${locale}.xml`,import.meta.url),'utf8');
    for (const slug of slugs) assert.ok(sitemap.includes(`${origin}/configurators/${slug}`));
    assert.doesNotMatch(sitemap,/gas|\/bookshelf-configurator\/|\/tiles-configurator\//);
  }
});
