const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const GENERATED_DIR = path.join(ROOT, 'generated');
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const MODEL_TTL_MS = Number.parseInt(process.env.MODEL_TTL_MS || String(24 * 60 * 60 * 1000), 10);

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

function sendJson(res, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
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

function cleanupExpiredModels() {
    const now = Date.now();
    fs.readdir(GENERATED_DIR, { withFileTypes: true }, (readError, entries) => {
        if (readError) return;
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith('.glb')) continue;
            const filePath = path.join(GENERATED_DIR, entry.name);
            fs.stat(filePath, (statError, stat) => {
                if (!statError && now - stat.mtimeMs > MODEL_TTL_MS) {
                    fs.unlink(filePath, () => {});
                }
            });
        }
    });
}

function handleModelUpload(req, res) {
    const chunks = [];
    let received = 0;

    req.on('data', chunk => {
        received += chunk.length;
        if (received > MAX_MODEL_BYTES) {
            sendJson(res, 413, { error: 'The generated model is too large.' });
            req.destroy();
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', () => {
        if (res.writableEnded) return;
        const model = Buffer.concat(chunks);
        if (model.length < 20 || model.toString('utf8', 0, 4) !== 'glTF') {
            sendJson(res, 400, { error: 'The upload is not a valid binary glTF (.glb) file.' });
            return;
        }

        const id = crypto.randomUUID();
        const filename = `${id}.glb`;
        const filePath = path.join(GENERATED_DIR, filename);

        fs.writeFile(filePath, model, writeError => {
            if (writeError) {
                sendJson(res, 500, { error: 'Could not store the generated AR model.' });
                return;
            }

            const origin = publicOrigin(req);
            const modelUrl = `${origin}/generated/${filename}`;
            const launchUrl = `${origin}/ar.html?model=${encodeURIComponent(modelUrl)}`;
            sendJson(res, 201, {
                id,
                modelUrl,
                launchUrl,
                expiresInSeconds: Math.floor(MODEL_TTL_MS / 1000)
            });
        });
    });

    req.on('error', error => {
        if (!res.writableEnded) {
            sendJson(res, 500, { error: error.message });
        }
    });
}

function serveFile(req, res, pathname) {
    const requestedFile = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(ROOT, `.${requestedFile}`);

    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            const status = error.code === 'ENOENT' ? 404 : 500;
            res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(status === 404 ? '404 Not Found' : `Server error: ${error.code}`);
            return;
        }

        const extname = path.extname(filePath).toLowerCase();
        const isGeneratedModel = filePath.startsWith(`${GENERATED_DIR}${path.sep}`);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
            'Cache-Control': isGeneratedModel ? 'public, max-age=86400, immutable' : 'no-cache',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff'
        });
        res.end(content);
    });
}

const server = http.createServer((req, res) => {
    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
        const pathname = decodeURIComponent(requestUrl.pathname);

        if (req.method === 'GET' && pathname === '/health') {
            sendJson(res, 200, { ok: true });
            return;
        }

        if (req.method === 'POST' && pathname === '/api/ar-model') {
            handleModelUpload(req, res);
            return;
        }

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

cleanupExpiredModels();
setInterval(cleanupExpiredModels, 60 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Window Configurator: http://localhost:${PORT}/`);
});
