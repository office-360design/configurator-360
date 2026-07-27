const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;
const GENERATED_DIR = path.join(ROOT, 'generated');
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const MODEL_TTL_MS = Number.parseInt(
    process.env.MODEL_TTL_MS || String(24 * 60 * 60 * 1000),
    10
);

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

function validateGlb(model) {
    if (!Buffer.isBuffer(model) || model.length < 20) {
        return 'The GLB file is incomplete.';
    }

    if (model.readUInt32LE(0) !== 0x46546c67) {
        return 'The file does not have a GLB magic header.';
    }
    if (model.readUInt32LE(4) !== 2) {
        return 'Only glTF 2.0 GLB files are supported.';
    }
    if (model.readUInt32LE(8) !== model.length) {
        return 'The GLB declared length does not match the uploaded file.';
    }

    let offset = 12;
    let json = null;
    while (offset + 8 <= model.length) {
        const chunkLength = model.readUInt32LE(offset);
        const chunkType = model.readUInt32LE(offset + 4);
        const chunkStart = offset + 8;
        const chunkEnd = chunkStart + chunkLength;
        if (chunkEnd > model.length) return 'The GLB contains a truncated chunk.';

        if (chunkType === 0x4e4f534a && json === null) {
            try {
                json = JSON.parse(model.subarray(chunkStart, chunkEnd).toString('utf8').trim());
            } catch (_error) {
                return 'The GLB JSON chunk is invalid.';
            }
        }
        offset = chunkEnd;
    }

    if (!json || json.asset?.version !== '2.0') {
        return 'The GLB does not contain a valid glTF 2.0 asset.';
    }
    if (!Array.isArray(json.meshes) || json.meshes.length === 0) {
        return 'The GLB does not contain any meshes.';
    }
    if (!Array.isArray(json.scenes) || json.scenes.length === 0) {
        return 'The GLB does not contain a scene.';
    }

    return null;
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
    let tooLarge = false;

    req.on('data', chunk => {
        if (tooLarge) return;
        received += chunk.length;
        if (received > MAX_MODEL_BYTES) {
            tooLarge = true;
            sendJson(res, 413, { error: 'The generated model is too large.' });
            return;
        }
        chunks.push(chunk);
    });

    req.on('end', () => {
        if (res.writableEnded || tooLarge) return;
        const model = Buffer.concat(chunks);
        const validationError = validateGlb(model);
        if (validationError) {
            sendJson(res, 400, { error: validationError });
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
                bytes: model.length,
                expiresInSeconds: Math.floor(MODEL_TTL_MS / 1000)
            });
        });
    });

    req.on('error', error => {
        if (!res.writableEnded) sendJson(res, 500, { error: error.message });
    });
}

function commonFileHeaders(filePath, size) {
    const extname = path.extname(filePath).toLowerCase();
    const isGeneratedModel = filePath.startsWith(`${GENERATED_DIR}${path.sep}`);
    return {
        'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
        'Content-Length': size,
        'Cache-Control': isGeneratedModel ? 'public, max-age=86400, immutable' : 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
        ...(isGeneratedModel ? { 'Accept-Ranges': 'bytes' } : {})
    };
}

function serveFile(req, res, pathname) {
    const requestedFile = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.resolve(ROOT, `.${requestedFile}`);

    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (statError, stat) => {
        if (statError || !stat.isFile()) {
            const status = statError?.code === 'ENOENT' || !stat?.isFile?.() ? 404 : 500;
            res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(status === 404 ? '404 Not Found' : `Server error: ${statError.code}`);
            return;
        }

        const isGeneratedModel = filePath.startsWith(`${GENERATED_DIR}${path.sep}`);
        const range = isGeneratedModel ? req.headers.range : null;

        if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
            if (!match) {
                res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
                res.end();
                return;
            }

            const start = match[1] ? Number.parseInt(match[1], 10) : 0;
            const end = match[2] ? Number.parseInt(match[2], 10) : stat.size - 1;
            if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= stat.size) {
                res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
                res.end();
                return;
            }

            const boundedEnd = Math.min(end, stat.size - 1);
            const length = boundedEnd - start + 1;
            res.writeHead(206, {
                ...commonFileHeaders(filePath, length),
                'Content-Range': `bytes ${start}-${boundedEnd}/${stat.size}`
            });
            if (req.method === 'HEAD') {
                res.end();
                return;
            }
            fs.createReadStream(filePath, { start, end: boundedEnd }).pipe(res);
            return;
        }

        res.writeHead(200, commonFileHeaders(filePath, stat.size));
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        fs.createReadStream(filePath).pipe(res);
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
