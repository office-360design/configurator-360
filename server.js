const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const GENERATED_DIR = path.join(ROOT, 'generated');
const MAX_MODEL_BYTES = 25 * 1024 * 1024;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
};

fs.mkdirSync(GENERATED_DIR, { recursive: true });

function sendJson(res, status, payload, extraHeaders = {}) {
    const body = Buffer.from(JSON.stringify(payload, null, 2));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        ...extraHeaders
    });
    res.end(body);
}

function publicOrigin(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
    const host = forwardedHost || req.headers.host || `localhost:${PORT}`;
    return `${protocol}://${host}`;
}

function inspectGLB(buffer) {
    if (buffer.length < 20 || buffer.toString('utf8', 0, 4) !== 'glTF') {
        throw new Error('Missing GLB header.');
    }
    const version = buffer.readUInt32LE(4);
    const declaredLength = buffer.readUInt32LE(8);
    const jsonLength = buffer.readUInt32LE(12);
    const jsonType = buffer.readUInt32LE(16);
    if (version !== 2) throw new Error(`Unsupported GLB version ${version}.`);
    if (declaredLength !== buffer.length) throw new Error('GLB file length does not match its header.');
    if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.length) throw new Error('Invalid GLB JSON chunk.');
    const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/g, '').trim());
    if (document.asset?.version !== '2.0' || !document.meshes?.length) {
        throw new Error('The GLB is not a mesh-containing glTF 2.0 asset.');
    }
    return {
        meshes: document.meshes.length,
        materials: document.materials?.length || 0,
        nodes: document.nodes?.length || 0
    };
}

function handleModelUpload(req, res) {
    const chunks = [];
    let received = 0;
    let rejected = false;

    req.on('data', chunk => {
        if (rejected) return;
        received += chunk.length;
        if (received > MAX_MODEL_BYTES) {
            rejected = true;
            sendJson(res, 413, { error: `The generated GLB exceeds ${MAX_MODEL_BYTES} bytes.` });
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', () => {
        if (rejected || res.writableEnded) return;
        const model = Buffer.concat(chunks);
        let structure;
        try {
            structure = inspectGLB(model);
        } catch (error) {
            sendJson(res, 400, { error: `GLB validation failed: ${error.message}` });
            return;
        }

        const hash = crypto.createHash('sha256').update(model).digest('hex');
        const directory = path.join(GENERATED_DIR, hash.slice(0, 2));
        const filename = `${hash}.glb`;
        const filePath = path.join(directory, filename);
        fs.mkdirSync(directory, { recursive: true });
        const created = !fs.existsSync(filePath);
        if (created) fs.writeFileSync(filePath, model);

        const origin = publicOrigin(req);
        sendJson(res, created ? 201 : 200, {
            ok: true,
            created,
            key: `models/${hash.slice(0, 2)}/${filename}`,
            modelUrl: `${origin}/models/${hash.slice(0, 2)}/${filename}`,
            size: model.length,
            sha256: hash,
            structure,
            note: 'This URL is local to this computer and is not reachable from a phone unless the server is publicly exposed over HTTPS.'
        });
    });

    req.on('error', error => {
        if (!res.writableEnded) sendJson(res, 500, { error: error.message });
    });
}

function serveModel(req, res, pathname) {
    const match = pathname.match(/^\/models\/([a-f0-9]{2})\/([a-f0-9]{64})\.glb$/);
    if (!match) return false;
    const filePath = path.join(GENERATED_DIR, match[1], `${match[2]}.glb`);
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end('Not Found');
        return true;
    }

    const stat = fs.statSync(filePath);
    const headers = {
        'Content-Type': 'model/gltf-binary',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff'
    };

    const range = req.headers.range;
    if (range) {
        const parsed = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!parsed) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return true;
        }
        const start = parsed[1] ? Number.parseInt(parsed[1], 10) : 0;
        const end = parsed[2] ? Math.min(Number.parseInt(parsed[2], 10), stat.size - 1) : stat.size - 1;
        if (start > end || start >= stat.size) {
            res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
            res.end();
            return true;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(filePath, { start, end }).pipe(res);
        return true;
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filePath).pipe(res);
    return true;
}

function serveFile(req, res, pathname) {
    const requestedFile = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(ROOT, `.${requestedFile}`);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (error, stat) => {
        if (error || !stat.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }
        const extname = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
            'Content-Length': stat.size,
            'Cache-Control': extname === '.html' || extname === '.json' ? 'no-store' : 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff'
        });
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer((req, res) => {
    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
        const pathname = decodeURIComponent(requestUrl.pathname);

        if (req.method === 'OPTIONS' && pathname === '/api/models') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Model-Name, X-App-Build',
                'Access-Control-Max-Age': '86400'
            });
            res.end();
            return;
        }
        if (req.method === 'GET' && pathname === '/health') {
            sendJson(res, 200, { ok: true, arTransport: 'browser-glb-upload', storage: 'local-filesystem' });
            return;
        }
        if (req.method === 'POST' && pathname === '/api/models') {
            handleModelUpload(req, res);
            return;
        }
        if ((req.method === 'GET' || req.method === 'HEAD') && serveModel(req, res, pathname)) return;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Method Not Allowed');
            return;
        }
        serveFile(req, res, pathname);
    } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Bad request: ${error.message}`);
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Window Configurator: http://localhost:${PORT}/`);
    console.log('Local GLB upload endpoint: POST /api/models');
});
