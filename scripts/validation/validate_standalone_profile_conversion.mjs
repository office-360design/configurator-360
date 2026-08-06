import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const converter = require(path.join(projectRoot, 'cad', 'tools', 'convert_standalone_profile.js'));

function sha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const expectedRoles = new Map([
    ['575760', 'outer-frame'],
    ['575770', 'outer-frame'],
    ['575780', 'opening-sash'],
    ['575790', 'opening-sash'],
    ['575800', 'mullion-transom'],
    ['575810', 'mullion-transom'],
    ['575820', 'double-vent-sash'],
    ['575830', 'double-vent-sash']
]);

const { manifest } = converter.loadManifest(converter.DEFAULT_MANIFEST);
const plans = converter.createPlansFromManifest(manifest, {});

assert.equal(plans.length, expectedRoles.size, 'The standalone manifest must contain all eight aluminum profiles.');
assert.equal(new Set(plans.map(plan => plan.profileId)).size, plans.length, 'Profile IDs must be unique.');

for (const plan of plans) {
    assert.equal(plan.role, expectedRoles.get(plan.profileId), `Unexpected role for ${plan.profileId}.`);
    assert.ok(fs.existsSync(plan.sourcePath), `Missing source file for ${plan.profileId}.`);
    assert.ok(plan.outputDir.includes(path.join('svg', 'standalone')), `Unexpected output root for ${plan.profileId}.`);
    assert.ok(!plan.outputDir.includes(`${path.sep}L${path.sep}`), 'Output folders must not encode L profile terminology.');
    assert.ok(!plan.outputDir.includes(`${path.sep}Z${path.sep}`), 'Output folders must not encode Z profile terminology.');
}

const selectedPlans = converter.createPlansFromManifest(manifest, { only: '575760,575820' });
assert.deepEqual(selectedPlans.map(plan => plan.profileId), ['575760', '575820']);

const testSource = path.join(projectRoot, 'src', 'client', 'icons', 'gaskets', '224350.svg');
const sourceHashBefore = sha256(testSource);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'standalone-profile-validation-'));
const outputDir = path.join(tempRoot, 'gaskets', '224350');

try {
    const plan = converter.createProfilePlan({}, {
        source: testSource,
        'profile-id': '224350',
        role: 'gasket',
        output: outputDir,
        'canonical-side': 'top',
        'allowed-sides': 'top,right,bottom,left',
        rotations: '0,90,180,270'
    });

    const result = converter.convertOne(plan, { force: false, dryRun: false });
    assert.equal(result.status, 'converted');

    const svgPath = path.join(outputDir, 'profile.svg');
    const metadataPath = path.join(outputDir, 'profile.meta.json');
    assert.ok(fs.existsSync(svgPath), 'Standalone conversion did not create profile.svg.');
    assert.ok(fs.existsSync(metadataPath), 'Standalone conversion did not create profile.meta.json.');

    const svg = fs.readFileSync(svgPath, 'utf8');
    assert.match(svg, /data-profile-id="224350"/);
    assert.match(svg, /data-profile-role="gasket"/);
    const summary = converter.parseSvgSummary(svg);
    assert.ok(summary.filledPathCount > 0, 'Generated SVG must contain visible filled geometry.');

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    assert.equal(metadata.schemaVersion, 1);
    assert.equal(metadata.id, '224350');
    assert.equal(metadata.role, 'gasket');
    assert.equal(metadata.source.sha256, sourceHashBefore);
    assert.equal(metadata.source.originalPreserved, true);
    assert.equal(metadata.catalogRegistration.status, 'not-registered');

    assert.throws(
        () => converter.convertOne(plan, { force: false, dryRun: false }),
        /Output already exists/,
        'Existing generated files should require --force.'
    );

    const sentinelPath = path.join(outputDir, 'review-notes.txt');
    fs.writeFileSync(sentinelPath, 'keep this file\n', 'utf8');
    converter.convertOne(plan, { force: true, dryRun: false });
    assert.ok(fs.existsSync(sentinelPath), '--force must not delete unrelated files in the output directory.');

    assert.equal(sha256(testSource), sourceHashBefore, 'The source geometry file must never be modified.');
} finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(`Standalone profile conversion validation passed: ${plans.length} manifest profiles and one SVG end-to-end conversion.`);
