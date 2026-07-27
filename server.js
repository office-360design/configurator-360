const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ROOT = __dirname;

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
    '.webp': 'image/webp'
};

function sendJson(res, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
        'Cache-Control': 'no-store'
    });
    res.end(body);
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
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        });
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
            let version = null;
            try {
                version = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
            } catch (_error) {
                version = { build: 'unknown' };
            }
            sendJson(res, 200, { ok: true, arTransport: 'static-webxr-query-url', version });
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Window Configurator: http://localhost:${PORT}/`);
});
