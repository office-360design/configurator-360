import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import { createWindowFixture } from './helpers/windowFixture.mjs';
import { WINDOW_CASES, applyWindowCase } from './helpers/windowCases.mjs';
import { productGeometrySnapshot } from './helpers/geometrySnapshot.mjs';
import { MATERIAL_PRESETS } from '../src/materials/presets.js';
import { createSurfacePixels } from '../src/materials/SurfaceTextures.js';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/polymers-approved-baseline.json',import.meta.url)));
const sha=v=>createHash('sha256').update(v).digest('hex');
for(const [id,preset]of Object.entries(baseline.presets))test(`accepted material untouched: ${id}`,()=>assert.deepEqual(MATERIAL_PRESETS[id],preset));
for(const [kind,roles]of Object.entries(baseline.textures))test(`accepted ${kind} texture pixels remain byte-identical`,()=>{
 const pixels=createSurfacePixels(kind,kind==='oak'?512:256);for(const [role,hash]of Object.entries(roles))assert.equal(sha(pixels[role]),hash);
});
for(const item of WINDOW_CASES)test(`approved fixed-handle/CAD/UV/fabrication preserved: ${item.name}`,async()=>{
 const f=await createWindowFixture({layout:item.layout,builderOptions:{getSelectedHandleSide:()=>item.handle??'right'}});
 for(const id of ['widthA','heightB','mBatant'])f.loader.context.document.getElementById(id);
 applyWindowCase(f,item);assert.deepEqual({product:productGeometrySnapshot(f.builder.placementRoot).hash,sections:productGeometrySnapshot(f.builder.sectionGroup).hash,fabrication:sha(JSON.stringify(f.builder.getFabricationSnapshot()))},baseline.cases[item.name]);
 const before=productGeometrySnapshot(f.builder.placementRoot).hash;for(const q of ['low','high','balanced'])f.materials.setQuality(q);
 assert.equal(productGeometrySnapshot(f.builder.placementRoot).hash,before);f.builder.clearTemplateGeometryCache();f.materials.dispose();
});
