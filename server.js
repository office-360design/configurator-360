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
    '.webp': 'image/webp',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
};

const server = http.createServer((req, res) => {
    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
        const pathname = decodeURIComponent(requestUrl.pathname);
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
            res.writeHead(200, {
                'Content-Type': MIME_TYPES[extname] || 'application/octet-stream',
                'Cache-Control': 'no-cache'
            });
            res.end(content);
        });
    } catch (error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Bad request: ${error.message}`);
    }
});

server.listen(PORT, () => {
    console.log(`Development server: http://localhost:${PORT}/`);
    console.log('Press Ctrl+C to stop the server.');
});
