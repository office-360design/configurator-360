import assert from 'node:assert/strict';
import { state, deriveHallMetrics } from '../js/state.js?v=hall-production-1';
import { HALL_TEMPLATES, PRODUCTION_TEMPLATE_ID, createHallTemplate } from '../js/templates.js?v=hall-production-1';
import { PRODUCTION_DEFAULTS, normalizeProduction, productionLayout, footprint, footprintsOverlap, productionOpeningClearances } from '../js/production.js?v=hall-production-1';
import { normalizeOpening, normalizeOpenings, validateOpenings } from '../js/openings.js?v=hall-production-1';
import { loadingLayout } from '../js/logistics.js?v=hall-production-1';
import { getHallMessages } from '../js/i18n.js?v=hall-production-1';
import { estimateHallPrice } from '../js/pricing.js?v=hall-production-1';
const original = structuredClone(state), t = createHallTemplate(PRODUCTION_TEMPLATE_ID, state);
assert.deepEqual(state, original);assert.equal(HALL_TEMPLATES.length,4);
assert.equal(new Set(HALL_TEMPLATES.map(t=>t.id)).size,4);
assert.deepEqual([t.length,t.width,t.eaveHeight,t.pitch,t.targetBaySpacing],[36,18,6,12,6]);
assert.equal(t.openings.length,16);assert.equal(validateOpenings(t,'en-US').valid,true);
for(const o of t.openings){const before=structuredClone(o);normalizeOpening(o,t);assert.deepEqual(o,before);}
assert.equal(t.openings.filter(o=>o.type==='garage').length,2);
assert.equal(t.openings.filter(o=>o.subtype==='daylight-band').length,8);
assert.equal(t.openings.filter(o=>o.type==='personnel').length,2);
assert.equal(t.openings.filter(o=>o.type==='vent').length,4);
assert(!('buildingUse' in t));
const metric=deriveHallMetrics(t), plan=productionLayout(t), yard=loadingLayout(t);
assert.equal(metric.footprint,648);assert.equal(metric.highBayFixtureCount,12);assert.equal(metric.skylightCount,10);
assert.equal(plan.machines.length,4);assert.deepEqual(plan.benches.map(b=>b.kind),['assembly','assembly','inspection','packing']);
assert.equal(plan.staging.length,4);assert.equal(plan.suppressed,0);assert.equal(plan.missingGates,false);
assert.equal(plan.utilityLength,40);assert.equal(plan.zones[0].width,5.1);
assert.equal(yard.apronArea,288);assert.equal(yard.bollardCount,4);assert.equal(yard.markingCount,2);assert.equal(yard.numberCount,0);
function checkPlan(s){
 const p=productionLayout(s); const occupied=[...p.machines,...p.benches,...p.staging];
 for(let i=0;i<occupied.length;i++){
  const r=footprint(occupied[i]);assert(r.minX>-s.width/2+.8&&r.maxX<s.width/2-.8);assert(r.minZ>-s.length/2+2.5&&r.maxZ<s.length/2-2.5);
  for(const other of occupied.slice(i+1))assert(!footprintsOverlap(r,footprint(other),.1),`Object overlap ${occupied[i].id}/${other.id}`);
  for(const zone of p.zones)assert(!footprintsOverlap(r,footprint(zone),.1),`Route obstruction ${occupied[i].id}/${zone.id}`);
  for(const clear of productionOpeningClearances(s))assert(!footprintsOverlap(r,clear,.09),`Door obstruction ${occupied[i].id}/${clear.id}`);
 }
 return p;
}
checkPlan(t);
const reverse={...structuredClone(t),productionFlow:'back-to-front'};const reversed=checkPlan(reverse);
assert.deepEqual(reversed.gates.map(g=>g.role),['dispatch','intake']);assert.equal(reversed.machines[0].z,-plan.machines[0].z);
assert(reversed.staging.filter(s=>s.kind==='raw').every(s=>s.z>0));assert(reversed.benches.find(b=>b.kind==='packing').z<0);
const crowded=structuredClone(t);crowded.openings.push({id:'edited-side-door',type:'personnel',side:'left',offset:-7.5,width:1.1,height:2.2,bottom:0,color:'#66727c'});normalizeOpenings(crowded);
assert(checkPlan(crowded).machines.length<4);assert(productionLayout(crowded).suppressed>0);
const missing=structuredClone(t);missing.openings=missing.openings.filter(o=>o.id!=='production-gate-back');assert(productionLayout(missing).missingGates);
const shifted=structuredClone(t);shifted.openings.find(o=>o.id==='production-gate-front').offset=3;normalizeOpenings(shifted);checkPlan(shifted);
for(const w of [6,12,16,18,24,30])for(const len of [12,24,36,60])for(const n of [2,4,6]){
 const s={...structuredClone(t),width:w,length:len,productionCellCount:n};normalizeOpenings(s);const p=checkPlan(s);
 assert(p.machines.length<=n&&p.benches.length<=n);
 if(w<16||len<24){assert.equal(p.available,false);assert.equal(p.machines.length,0);assert.equal(p.utilityRuns.length,0);}
}
const off={...structuredClone(t),productionEquipment:false,productionStaging:false,productionUtilities:false};const offPlan=productionLayout(off);
assert.equal(offPlan.machines.length,0);assert.equal(offPlan.benches.length,0);assert.equal(offPlan.staging.length,0);assert.equal(offPlan.utilityLength,0);
for(const template of HALL_TEMPLATES){const next=createHallTemplate(template.id,t);assert.equal(validateOpenings(next,'en-US').valid,true);
 if(template.id!==PRODUCTION_TEMPLATE_ID){for(const [key,value] of Object.entries(PRODUCTION_DEFAULTS))assert.equal(next[key],value,`${key} leaked to ${template.id}`);assert.equal(productionLayout(next).active,false);}}
const legacy={};normalizeProduction(legacy);assert.deepEqual(legacy,PRODUCTION_DEFAULTS);
const both={...structuredClone(t),retailDisplays:true,warehouseRacking:true,forkliftClearance:true};normalizeProduction(both);assert.equal(both.retailDisplays,false);assert.equal(both.warehouseRacking,false);assert.equal(both.forkliftClearance,false);
assert.deepEqual(JSON.parse(JSON.stringify(t)),t);const independent=createHallTemplate(PRODUCTION_TEMPLATE_ID,state);independent.openings[0].width=1;assert.equal(t.openings[0].width,4.6);
for(const locale of ['en-US','ro-RO','de-DE']){
 const strings=getHallMessages(locale);for(const item of HALL_TEMPLATES)for(const suffix of ['name','intro','previewAlt',...item.features])assert(strings[`${item.copyPrefix}.${suffix}`]);
 const quote=estimateHallPrice(structuredClone(t),null,locale);assert(Number.isFinite(quote.total));assert.equal(quote.total,estimateHallPrice(structuredClone(off),null,locale).total,'Planning equipment must not be priced');
}
console.log('Production: 648 m², 16 openings, 4 machines, 4 benches, 4 staging zones, 288 m² apron; clear through/pedestrian routes, mirrored flow, cell limits, edited-door suppression, serialization, 4-template reset, legacy state and excluded equipment pricing passed.');
