import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as THREE from '../../window-configurator/src/client/lib/three.module.js';
import { MaterialLibrary, MATERIAL_PRESETS } from '../src/index.js';
import { createPolymerPixels, samplePolymerHeight, POLYMER_TEXTURE_KINDS } from '../src/materials/polymerTextures.js';
import { getWindowPolymerSurface } from '../../window-configurator/src/client/js/window-polymer-materials.js';
import { createWindowModuleLoader } from './helpers/windowModules.mjs';
const ids = ['plastic.rigid', 'plastic.thermalBreak', 'plastic.foam', 'rubber.epdm'];
const sha = buffer => createHash('sha256').update(buffer).digest('hex');

for (const id of ids) test(`${id}: opaque non-metal standard material, no added layers`, () => {
  const lib = new MaterialLibrary(THREE, { textureAssets: false });
  const m = lib.create(id);
  assert.equal(m.isMeshStandardMaterial, true); assert.equal(!!m.isMeshPhysicalMaterial, false);
  assert.equal(m.metalness, 0); assert.equal(m.transparent, false); assert.equal(m.opacity, 1);
  assert.equal(m.depthWrite, true); assert.equal(m.map, null); assert.equal(m.displacementMap, null);
  assert.ok(m.roughness >= .4 && m.roughness <= 1); assert.ok(m.normalScale.x < .1);
  for (const map of [m.normalMap, m.roughnessMap]) {
    assert.equal(map.image.width, 128); assert.equal(map.image.height, 128);
    assert.equal(map.colorSpace, THREE.NoColorSpace); assert.equal(map.flipY, false);
    assert.equal(map.wrapS, THREE.RepeatWrapping); assert.equal(map.minFilter, THREE.LinearMipmapLinearFilter);
    assert.equal(map.repeat.x, 1 / MATERIAL_PRESETS[id].tile[0]);
  }
  lib.dispose(); assert.equal(lib.getDiagnostics().textureCount, 0);
});

for (const kind of POLYMER_TEXTURE_KINDS) test(`${kind}: deterministic, periodic, mild data-only maps`, () => {
  const p = createPolymerPixels(kind), q = createPolymerPixels(kind);
  assert.equal(p.color, null); assert.equal(sha(p.normal), sha(q.normal)); assert.equal(sha(p.roughness), sha(q.roughness));
  for (const [u, v] of [[0,.47],[.94,.11],[-.34,3.2],[1,1]]) {
    assert.ok(Math.abs(samplePolymerHeight(kind,u,v)-samplePolymerHeight(kind,u+1,v-1)) < 1e-10);
  }
  for (let i=0;i<p.normal.length;i+=4) {
    const n = [p.normal[i],p.normal[i+1],p.normal[i+2]].map(x=>x/127.5-1);
    assert.ok(Math.abs(Math.hypot(...n)-1)<.015); assert.ok(n[2]>.8);
    assert.ok(p.roughness[i+1]>=237 && p.roughness[i+1]<=253);
  }
});

test('invalid texture inputs fail without silently returning powder coating', () => {
  assert.throws(()=>createPolymerPixels('unknown')); assert.throws(()=>samplePolymerHeight('unknown',0,0));
  for(const size of [NaN,0,127,1024]) assert.throws(()=>createPolymerPixels('polymer.molded',size));
});

test('no requests/texture allocation until first detailed polymer material', () => {
  let requests=0;const lib=new MaterialLibrary(THREE,{quality:'low',loadTexture:()=>{requests++;throw Error('unexpected image');}});
  const m=lib.create('rubber.epdm');assert.equal(lib.textures.size,0);assert.equal(m.normalMap,null);assert.equal(requests,0);
  lib.setQuality('balanced');assert.equal(lib.textures.size,2);assert.equal(requests,0);lib.dispose();
});

test('repeated quality toggles preserve tint, finish, identities and bounded maps', () => {
  const lib=new MaterialLibrary(THREE);const materials=ids.map(id=>lib.create(id));const normals=materials.map(m=>m.normalMap);
  const colors=materials.map(m=>m.color.getHexString()), roughness=materials.map(m=>m.roughness);
  for(let i=0;i<8;i++) {
    lib.setQuality('low');for(const m of materials){assert.equal(m.normalMap,null);assert.equal(m.roughnessMap,null);}
    lib.setQuality('high');materials.forEach((m,i)=>assert.equal(m.normalMap,normals[i]));
    lib.setQuality('balanced');assert.deepEqual(materials.map(m=>m.color.getHexString()),colors);
    assert.deepEqual(materials.map(m=>m.roughness),roughness);assert.equal(lib.textures.size,8);
  }
  lib.dispose();
});

test('clones and differently coloured caps share maps, not material state', () => {
  const lib=new MaterialLibrary(THREE),a=lib.create('plastic.rigid',{color:'#ffffff'}),b=lib.clone(a),c=lib.create('plastic.rigid',{color:'#383e42'});
  b.color.set('#c01234');assert.equal(a.color.getHexString(),'ffffff');assert.equal(c.color.getHexString(),'383e42');
  assert.equal(a.normalMap,b.normalMap);assert.equal(a.normalMap,c.normalMap);
  lib.setQuality('low');assert.equal(b.normalMap,null);lib.setQuality('high');assert.ok(b.normalMap);
  const map=b.normalMap;let disposed=0;map.addEventListener('dispose',()=>disposed++);
  a.dispose();b.dispose();c.dispose();assert.equal(disposed,0);lib.dispose();assert.equal(disposed,1);
});

test('night multiplier restores polymer reflections without compounding', () => {
  const lib=new MaterialLibrary(THREE),m=lib.create('rubber.epdm'), initial=m.envMapIntensity;
  lib.setEnvironmentIntensity(.12);lib.setEnvironmentIntensity(.12);assert.equal(m.envMapIntensity,initial*.12);
  lib.setQuality('high');assert.equal(m.envMapIntensity,initial*.12);
  lib.setEnvironmentIntensity(1);assert.equal(m.envMapIntensity,initial);lib.dispose();
});

const mappings = [
  [{profileId:'275701',materialKey:'centralSeal'},'plastic.rigid'],
  [{blockName:'275701_s',materialKey:'centralSeal'},'plastic.rigid'],
  [{catalogProfileId:'288319',materialKey:'centralSeal'},'plastic.rigid'],
  [{profileId:'208694',materialKey:'alu'},'plastic.rigid'],
  [{profileId:'200988',materialKey:'epdm'},'plastic.foam'],
  [{profileId:'245442',materialKey:'foam'},'plastic.foam'],
  [{profileId:'575760',materialKey:'iso'},'plastic.thermalBreak'],
  [{profileId:'575790',materialKey:'iso'},'plastic.thermalBreak'],
  [{profileId:'224068',materialKey:'centralSeal'},'rubber.epdm'],
  [{profileId:'224069',materialKey:'centralSeal'},'rubber.epdm'],
  [{profileId:'245472',materialKey:'default'},'rubber.epdm'],
  [{profileId:'224063',materialKey:'default'},'rubber.epdm'],
  [{profileId:'224378',materialKey:'epdm'},'rubber.epdm'],
  [{profileId:'224379',materialKey:'epdm'},'rubber.epdm'],
  [{profileId:'224350',materialKey:'epdm'},'rubber.epdm'],
];
for (const [profile,id] of mappings) test(`catalog/render mapping ${JSON.stringify(profile)} → ${id}`,()=> {
  const original=JSON.stringify(profile);assert.equal(getWindowPolymerSurface(profile).id,id);assert.equal(JSON.stringify(profile),original);
});
test('unknown, aluminium, glazing and unconfirmed end caps are not guessed from colour or name', () => {
  for(const p of [null,{}, {materialKey:'glass'}, {profileId:'575760',materialKey:'alu'},
    {blockName:'unknown cap',baseCadColor:'#20242a'}, {profileId:'200953',materialKey:'default'},
    {profileId:'275702',materialKey:'default'}, {profileId:'288345',materialKey:'default'}]) assert.equal(getWindowPolymerSurface(p),null);
});

async function managerFixture(debug=false) {
  const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{id,checked:false,hidden:false,dataset:{},style:{},classList:{toggle(){}},setAttribute(){},addEventListener(e,f){this[e]=f;},querySelectorAll(){return [];}});return nodes.get(id);};
  const loader=createWindowModuleLoader({globals:{window:{addEventListener(){},location:{hostname:'localhost',pathname:'/window-configurator/',search:''}},document:{documentElement:{lang:'en-US'},getElementById:id=>id.endsWith('FinishSwatches')?null:get(id),querySelectorAll:()=>[]}}});
  const {MaterialLibrary:Library}=await loader.import('shared-3d/src/index.js?v=polymers-16');
  const engine=await loader.import('window-configurator/src/client/lib/three.module.js');
  const {createMaterialManager}=await loader.import('window-configurator/src/client/js/materials.js');
  const lib=new Library(engine),profiles=[];
  const manager=createMaterialManager({surfaceLibrary:lib,captureMode:false,pageParams:new URLSearchParams(`debug_colors=${debug?1:0}&outside_finish_type=coated&outside_colour=%23383e42`),
    getProfilesData:()=>profiles,hasCurrentMetadata:()=>false,invalidateSectionSamples(){},renderGroupFilters(){},buildWindow(){}});
  return {manager,lib,profiles,get};
}

test('real Window manager respects debug colours and restores polymer shaders', async () => {
  const {manager:m,lib,get,profiles}=await managerFixture(true);
  const p={profileId:'275701',materialKey:'centralSeal',baseCadColor:'#7fbfff'};profiles.push(p);
  m.initializeControls();let material=m.getMaterialForProfile(p);assert.equal(material.color.getHexString(),'7fbfff');assert.equal(material.userData.surface,undefined);
  get('debugColorsToggle').change({target:{checked:false}});
  material=m.getMaterialForProfile(p);assert.equal(material.userData.surface.id,'plastic.rigid');assert.equal(material.metalness,0);
  get('debugColorsToggle').change({target:{checked:true}});assert.equal(m.getMaterialForProfile(p).color.getHexString(),'7fbfff');lib.dispose();
});

test('real manager routes all polymers without aliasing old seal/material cache keys', async () => {
  const {manager:m,lib}=await managerFixture();
  const rigid=m.getMaterialForProfile({profileId:'275701',materialKey:'centralSeal'});
  const gasket=m.getMaterialForProfile({profileId:'224068',materialKey:'centralSeal'});
  assert.notEqual(rigid,gasket);assert.equal(rigid.userData.surface.id,'plastic.rigid');assert.equal(gasket.userData.surface.id,'rubber.epdm');
  for(const [profile,id] of mappings) assert.equal(m.getMaterialForProfile(profile).userData.surface.id,id);
  assert.equal(m.glassMat.userData.surface.id,'glass.architectural');assert.equal(m.handleMat.userData.surface.id,'aluminium.powderCoated');lib.dispose();
});

test('plastic drainage cap inherits only exterior colour, not metallic shader or inside colour', async () => {
  const {manager:m,lib}=await managerFixture();const p={profileId:'208694',materialKey:'alu',aluminiumSide:'outside'};
  for(const type of ['mill','anodized','coated']) {
    m.applyConfiguration({outsideFinish:{type,presetId:type==='mill'?'natural':type==='anodized'?'silver':'ral-7016',color:'#383e42'},debugColors:false});
    const cap=m.getMaterialForProfile(p);assert.equal(cap.userData.surface.id,'plastic.rigid');assert.equal(cap.metalness,0);
    assert.equal('#'+cap.color.getHexString(),m.getState().outsideFinishSelection.color.toLowerCase());
  }
  m.applyConfiguration({finishMode:'different',colour:'#ffffff',insideColour:'#112233',debugColors:false});
  assert.equal('#'+m.getMaterialForProfile(p).color.getHexString(),m.getState().outsideFinishSelection.color.toLowerCase());
  assert.notEqual(m.getMaterialForProfile(p).color.getHexString(),m.getState().insideFinishSelection.color.slice(1));lib.dispose();
});

test('material replacement never mutates source CAD fields or configuration serialization', async () => {
  const {manager:m,lib}=await managerFixture();const before=JSON.stringify(m.getConfigurationSnapshot());
  for(const [profile] of mappings){const p={...profile,shape:{userData:{preserve:true}},bbox:{minX:-1,maxX:1}},json=JSON.stringify(p);m.getMaterialForProfile(p);assert.equal(JSON.stringify(p),json);}
  assert.equal(JSON.stringify(m.getConfigurationSnapshot()),before);lib.dispose();
});
