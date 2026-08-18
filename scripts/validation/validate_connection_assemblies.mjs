import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const catalog = require(path.join(projectRoot, 'cad', 'tools', 'connection_assembly_manifest.js'));

const { manifest } = catalog.loadManifest();
const plans = catalog.createPlansFromManifest(manifest);
const expected = new Map([
    ['frame-fixed', 'join/frame-window.dwg'],
    ['frame-sash', 'join/frame-sash-window.dwg'],
    ['mullion-fixed-sash', 'join/window-mullion-sash-window.dwg'],
    ['mullion-fixed-fixed', 'join/window-mullion-window.dwg'],
    ['mullion-sash-sash', 'join/window-sash-mullion-sash-window.dwg'],
]);

assert.equal(plans.length, expected.size, 'All five supplied join DWGs must be cataloged.');
assert.equal(new Set(plans.map(plan => plan.id)).size, plans.length, 'Connection IDs must be unique.');
for (const plan of plans) {
    assert.ok(fs.existsSync(plan.sourcePath), `Missing join source for ${plan.id}.`);
    assert.equal(
        plan.source,
        `cad/source/${expected.get(plan.id)}`,
        `Unexpected source mapping for ${plan.id}.`
    );
    assert.equal(plan.orientation, 'left-right-section');
    assert.equal(plan.source.includes('double_vent_profile'), false);
}

assert.equal(
    plans.find(plan => plan.id === 'mullion-fixed-sash')?.mirrorAllowed,
    false,
    'The mixed fixed/sash join must not be mirrored without a dedicated CAD confirmation.'
);
assert.deepEqual(
    catalog.createPlansFromManifest(manifest, { only: 'frame-fixed,mullion-fixed-fixed' })
        .map(plan => plan.id),
    ['frame-fixed', 'mullion-fixed-fixed']
);
assert.throws(
    () => catalog.createPlansFromManifest(manifest, { only: 'double-vent' }),
    /Connections not found/,
    'Double-vent connections must remain outside the active manifest.'
);

console.log(`Connection assembly manifest valid: ${plans.length} left/right join references, double-vent excluded.`);
