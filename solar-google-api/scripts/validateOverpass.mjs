import assert from 'node:assert/strict';
import { parseOverpassContextRequest } from '../src/overpassHandler.mjs';

const body = new URLSearchParams({
  data: '[out:json][timeout:16];(way["building"](around:180,46.772369,23.627975);way["highway"](around:180,46.772369,23.627975);node["natural"="tree"](around:180,46.772369,23.627975););out tags geom;',
}).toString();
const parsed = parseOverpassContextRequest(body);
assert.equal(parsed.radiusM, 180);
assert.equal(parsed.latitude, 46.772369);
assert.equal(parsed.longitude, 23.627975);
assert.match(parsed.query, /way\["building"\]/);
assert.match(parsed.query, /node\["natural"="tree"\]/);
assert.throws(() => parseOverpassContextRequest(new URLSearchParams({
  data: 'way["building"](around:900,46.77,23.62);out geom;',
}).toString()), /invalid/);

console.log('Solar nearby-context proxy validation passed.');
