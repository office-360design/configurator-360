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

const date = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const build = `${date}-${gitShortHash()}`;
const sourcePath = path.join(root, 'index.html');
let html = fs.readFileSync(sourcePath, 'utf8');
html = html.replace(/<meta name="app-build" content="[^"]*">/, `<meta name="app-build" content="${build}">`);
html = html.replace(/<div id="build-badge">Build [^<]*<\/div>/, `<div id="build-badge">Build ${build}</div>`);
fs.writeFileSync(sourcePath, html);
fs.mkdirSync(staticRoot, { recursive: true });
fs.writeFileSync(path.join(staticRoot, 'index.html'), html);
fs.cpSync(path.join(root, 'svg'), path.join(staticRoot, 'svg'), { recursive: true, force: true });
const version = {
    build,
    baseCommit: gitShortHash(),
    channel: 'webxr-diagnostic',
    generatedAt: new Date().toISOString()
};
const json = `${JSON.stringify(version, null, 2)}\n`;
fs.writeFileSync(path.join(root, 'version.json'), json);
fs.writeFileSync(path.join(staticRoot, 'version.json'), json);
console.log(`Prepared static-site build ${build}`);
