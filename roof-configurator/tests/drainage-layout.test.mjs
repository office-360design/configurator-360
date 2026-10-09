import test from 'node:test';
import assert from 'node:assert/strict';
import {presetRoofLayout} from '../js/presetLayout.js';
import {recommendedDrainage, layoutDrainageEdges, drainageBoundaryKey} from '../js/drainageLayout.js';
const roof = roofType => presetRoofLayout({roofType,length:10,depth:7,wallHeight:3,pitch:30,overhang:.45});
test('L-shaped valley outlet gets two gutter edges and one downpipe',()=>{
  const edges=recommendedDrainage(roof('lshape')).filter(e=>e.valleyOutlet);
  assert.equal(edges.length,2);
  assert.ok(edges.every(e=>e.gutter));
  assert.deepEqual(edges.flatMap(e=>e.pipes),[1]);
});
test('custom placements persist through moves and fall back after topology changes',()=>{
  const layout=roof('gable');
  const edges=recommendedDrainage(layout);
  edges[0].gutter=true; edges[0].pipes=[.35,.8];
  layout.drainage={boundaryKey:drainageBoundaryKey(layout),edges};
  layout.vertices[0].x-=.1;
  assert.deepEqual(layoutDrainageEdges(layout)[0].pipes,[.35,.8]);
  layout.drainage.boundaryKey='old topology';
  assert.deepEqual(layoutDrainageEdges(layout),recommendedDrainage(layout));
});
