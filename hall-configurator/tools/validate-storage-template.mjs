import assert from 'node:assert/strict';
import { state, deriveHallMetrics } from '../js/state.js?v=hall-production-1';
import { HALL_TEMPLATES, STORAGE_TEMPLATE_ID, createHallTemplate } from '../js/templates.js?v=hall-production-1';
import { normalizeOpening, normalizeOpenings, validateOpenings, openingLabel } from '../js/openings.js?v=hall-production-1';
import { LOGISTICS_DEFAULTS, normalizeLogistics, loadingLayout, storageRackLayout, loadingSceneryExclusions } from '../js/logistics.js?v=hall-production-1';
import { getHallMessages } from '../js/i18n.js?v=hall-production-1';
import { estimateHallPrice } from '../js/pricing.js?v=hall-production-1';
const original=structuredClone(state);
const t=createHallTemplate(STORAGE_TEMPLATE_ID,state), independent=createHallTemplate(STORAGE_TEMPLATE_ID,state);
assert.deepEqual(state,original);assert.equal(HALL_TEMPLATES.length,4);
assert.deepEqual([t.length,t.width,t.eaveHeight,t.pitch,t.targetBaySpacing],[48,24,6.5,10,6]);
assert.equal(t.openings.length,20);assert.equal(t.openings.filter(o=>o.type==='garage').length,8);
assert.equal(t.openings.filter(o=>o.subtype==='sectional').length,6);
assert.equal(validateOpenings(t,'en-US').valid,true);
for(const o of t.openings){const before=structuredClone(o);normalizeOpening(o,t);assert.deepEqual(o,before);}
assert.equal(t.buildingUse,undefined);assert.equal(t.entranceCanopy,false);assert.equal(t.retailDisplays,false);
const m=deriveHallMetrics(t);assert.equal(m.footprint,1152);assert.equal(m.skylightCount,12);assert.equal(m.highBayFixtureCount,21);
const l=loadingLayout(t);assert.equal(l.bays.length,6);assert.equal(l.bollardCount,12);assert.equal(l.numberCount,6);assert.equal(l.markingCount,6);assert.equal(l.apronArea,576);assert.equal(l.unavailable,false);
const ex=loadingSceneryExclusions(t);assert(ex.some(r=>r.minX<=19.6&&r.maxX>=19.6&&r.minZ<=5.76&&r.maxZ>=5.76),'Tree exclusion covers loading apron');
assert.equal(loadingSceneryExclusions(state).length,0);
assert.deepEqual(l.bays.map(b=>b.number),['01','02','03','04','05','06']);
assert.equal(storageRackLayout(t).blocks.length,6);
for(const b of storageRackLayout(t).blocks){assert(b.x+b.depth/2<6);assert(Math.abs(b.x)-b.depth/2>2.7);assert(Math.abs(b.z)-b.length/2>=3);}
assert.equal(storageRackLayout({...t,width:12}).blocks.length,0);
t.openings[0].isOpen=true;assert.equal(independent.openings[0].isOpen,false);
assert.deepEqual(JSON.parse(JSON.stringify(t)),t);
for(const template of HALL_TEMPLATES){const next=createHallTemplate(template.id,t);
 if(![STORAGE_TEMPLATE_ID, 'production-flow'].includes(template.id)) for(const key of Object.keys(LOGISTICS_DEFAULTS)) assert.equal(next[key],LOGISTICS_DEFAULTS[key],`${key} leaked into ${template.id}`);
 assert.equal(validateOpenings(next,'en-US').valid,true);
}
for(const locale of ['en-US','ro-RO','de-DE']){
 const strings=getHallMessages(locale);for(const item of HALL_TEMPLATES) for(const suffix of ['name','intro','previewAlt',...item.features])assert(strings[`${item.copyPrefix}.${suffix}`]);
 const quote=estimateHallPrice(structuredClone(t),null,locale);assert(Number.isFinite(quote.total)&&quote.total>0);
 assert.equal(quote.items.filter(i=>i.label.startsWith(strings['garage.sectional'])).length,6);
 assert(!openingLabel(t.openings[0],locale).includes('undefined'));
}
const off={...structuredClone(t), loadingApron:false, loadingBayProtection:false,loadingBayNumbers:false};
const offLayout=loadingLayout(off);assert.equal(offLayout.apronArea,0);assert.equal(offLayout.markingCount,0);assert.equal(offLayout.bollardCount,0);assert.equal(offLayout.numberCount,0);
const raised=structuredClone(t);raised.openings[0].bottom=.3;normalizeOpenings(raised);assert.equal(loadingLayout(raised).bays.length,5);assert.equal(loadingLayout(raised).unavailable,true);
const removed=structuredClone(t);removed.openings=removed.openings.filter(o=>o.subtype!=='sectional');assert.equal(loadingLayout(removed).apronArea,0);
const crowded=structuredClone(t);crowded.openings.find(o=>o.id==='storage-loading-2').offset=-10.5;assert.equal(loadingLayout(crowded).bays[0].protection,false);
const legacy={};normalizeLogistics(legacy);assert.deepEqual(legacy,LOGISTICS_DEFAULTS);
const roller={type:'garage',side:'front',bottom:0,width:4,height:4,offset:0,isOpen:true};normalizeOpening(roller,state);assert.equal(roller.subtype,'roller');assert.equal(roller.isOpen,undefined);
const short={...structuredClone(t),eaveHeight:3};normalizeOpenings(short);for(const o of short.openings.filter(o=>o.subtype==='sectional'))assert(o.bottom+o.height+.5<=3);
console.log('Storage template: 1152 m², 20 openings (8 garage doors), 576 m² apron, 12 bollards, 6 signs, 6 rack blocks, 12 skylights and 21 lights; state, defaults, edits, bounds, switching, locale and pricing tests passed.');
