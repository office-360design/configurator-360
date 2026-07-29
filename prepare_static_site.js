const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

const root = __dirname;
const staticRoot = path.join(root, 'static-site');

function gitShortHash() {
    try {
        return childProcess.execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: root,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
    } catch (_error) {
        return 'nogit';
    }
}

function copyFile(name) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(staticRoot, name));
}

function copyDirectory(name) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) {
        fs.cpSync(source, path.join(staticRoot, name), { recursive: true, force: true });
    }
}

const generatedAt = new Date();
const date = generatedAt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const hash = gitShortHash();
const build = `${date}-${hash}`;
const sourcePath = path.join(root, 'index.html');
let html = fs.readFileSync(sourcePath, 'utf8');
html = html.replace(
    /<meta name="app-build" content="[^"]*">/,
    `<meta name="app-build" content="${build}">`
);

// Preserve manually published GLBs. They are deliberately outside the generated
// website files, so preparing a new Netlify build must not delete them.
const preservedModels = path.join(root, '.static-models-preserved');
const currentModels = path.join(staticRoot, 'models');
fs.rmSync(preservedModels, { recursive: true, force: true });
if (fs.existsSync(currentModels)) {
    fs.cpSync(currentModels, preservedModels, { recursive: true, force: true });
}

fs.rmSync(staticRoot, { recursive: true, force: true });
fs.mkdirSync(staticRoot, { recursive: true });
if (fs.existsSync(preservedModels)) {
    fs.cpSync(preservedModels, path.join(staticRoot, 'models'), { recursive: true, force: true });
    fs.rmSync(preservedModels, { recursive: true, force: true });
} else {
    fs.mkdirSync(path.join(staticRoot, 'models'), { recursive: true });
    fs.writeFileSync(path.join(staticRoot, 'models', '.gitkeep'), '');
}
fs.writeFileSync(path.join(staticRoot, 'index.html'), html);

[
    'ar.html',
    'ar-viewer.html',
    'ar-export.js',
    'ar-upload-config.js'
].forEach(copyFile);

[
    'svg',
    'lib',
    'cad_screenshots'
].forEach(copyDirectory);

const headersSource = path.join(root, 'static_headers.txt');
if (fs.existsSync(headersSource)) {
    fs.copyFileSync(headersSource, path.join(staticRoot, '_headers'));
}

const version = {
    build,
    baseCommit: hash,
    channel: 'production-main-plus-supabase-ar-automation',
    generatedAt: generatedAt.toISOString(),
    architecture: 'production configurator -> optimized browser GLB export -> Netlify upload ticket -> direct Supabase Storage upload -> Scene Viewer'
};
const json = `${JSON.stringify(version, null, 2)}\n`;
fs.writeFileSync(path.join(root, 'version.json'), json);
fs.writeFileSync(path.join(staticRoot, 'version.json'), json);
fs.writeFileSync(path.join(staticRoot, '.nojekyll'), '');

console.log(`Prepared static-site build ${build}`);
console.log('Included production index, SVG profiles, Three.js library, CAD screenshots, and automated Supabase AR files. Netlify Functions are deployed separately from netlify/functions.');
