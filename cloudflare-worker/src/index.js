const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;

function json(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...extraHeaders
        }
    });
}

function parseAllowedOrigins(env) {
    return String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
}

function allowedUploadOrigin(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = parseAllowedOrigins(env);
    if (!origin) return false;
    return allowed.includes('*') || allowed.includes(origin);
}

function corsHeaders(request, env, publicRead = false) {
    const headers = new Headers();
    if (publicRead) {
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, ETag, Accept-Ranges');
        return headers;
    }
    const origin = request.headers.get('Origin');
    if (origin && allowedUploadOrigin(request, env)) {
        headers.set('Access-Control-Allow-Origin', origin);
        headers.set('Vary', 'Origin');
        headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Model-Name, X-App-Build');
        headers.set('Access-Control-Max-Age', '86400');
    }
    return headers;
}

function validateGLB(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) {
        throw new Error('The upload is too small to be a valid GLB.');
    }
    const view = new DataView(buffer);
    const magic = view.getUint32(0, true);
    const version = view.getUint32(4, true);
    const declaredLength = view.getUint32(8, true);
    if (magic !== GLB_MAGIC) throw new Error('Missing GLB magic header.');
    if (version !== GLB_VERSION) throw new Error(`Unsupported GLB version ${version}.`);
    if (declaredLength !== buffer.byteLength) {
        throw new Error(`GLB length mismatch: declared ${declaredLength}, received ${buffer.byteLength}.`);
    }

    const jsonLength = view.getUint32(12, true);
    const jsonType = view.getUint32(16, true);
    if (jsonType !== JSON_CHUNK_TYPE) throw new Error('The first GLB chunk is not JSON.');
    if (20 + jsonLength > buffer.byteLength) throw new Error('The GLB JSON chunk exceeds the file length.');

    const jsonText = new TextDecoder()
        .decode(new Uint8Array(buffer, 20, jsonLength))
        .replace(/\u0000+$/g, '')
        .trim();
    const document = JSON.parse(jsonText);
    if (document.asset?.version !== '2.0') throw new Error('The GLB asset version is not 2.0.');
    if (!document.meshes?.length) throw new Error('The GLB contains no meshes.');

    return {
        scenes: document.scenes?.length || 0,
        nodes: document.nodes?.length || 0,
        meshes: document.meshes.length,
        materials: document.materials?.length || 0,
        accessors: document.accessors?.length || 0
    };
}

async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(digest)]
        .map(value => value.toString(16).padStart(2, '0'))
        .join('');
}

function safeMetadata(value, fallback) {
    const normalized = String(value || fallback || '')
        .replace(/[^a-zA-Z0-9 ._()\-]/g, '-')
        .slice(0, 200);
    return normalized || fallback;
}

async function handleUpload(request, env) {
    const cors = corsHeaders(request, env);
    if (!allowedUploadOrigin(request, env)) {
        return json({
            error: 'This website origin is not allowed to upload models.',
            origin: request.headers.get('Origin') || '(missing)',
            hint: 'Set ALLOWED_ORIGINS on the Worker to the exact Netlify origin.'
        }, 403, cors);
    }

    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('model/gltf-binary') &&
        !contentType.toLowerCase().startsWith('application/octet-stream')) {
        return json({ error: 'Content-Type must be model/gltf-binary.' }, 415, cors);
    }

    const declaredSize = Number.parseInt(request.headers.get('Content-Length') || '0', 10);
    if (declaredSize > MAX_MODEL_BYTES) {
        return json({ error: `The GLB is larger than ${MAX_MODEL_BYTES} bytes.` }, 413, cors);
    }

    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_MODEL_BYTES) {
        return json({ error: `The GLB is larger than ${MAX_MODEL_BYTES} bytes.` }, 413, cors);
    }

    let structure;
    try {
        structure = validateGLB(buffer);
    } catch (error) {
        return json({ error: `GLB validation failed: ${error.message}` }, 400, cors);
    }

    const hash = await sha256Hex(buffer);
    const key = `models/${hash.slice(0, 2)}/${hash}.glb`;
    const existing = await env.MODELS.head(key);
    let created = false;

    if (!existing) {
        await env.MODELS.put(key, buffer, {
            httpMetadata: {
                contentType: 'model/gltf-binary',
                cacheControl: 'public, max-age=31536000, immutable',
                contentDisposition: 'inline'
            },
            customMetadata: {
                sha256: hash,
                modelName: safeMetadata(request.headers.get('X-Model-Name'), 'configured-window'),
                appBuild: safeMetadata(request.headers.get('X-App-Build'), 'unknown'),
                createdAt: new Date().toISOString()
            }
        });
        created = true;
    }

    const url = new URL(request.url);
    const modelUrl = `${url.origin}/${key}`;
    return json({
        ok: true,
        created,
        key,
        modelUrl,
        size: buffer.byteLength,
        sha256: hash,
        structure
    }, created ? 201 : 200, cors);
}

async function handleModelRead(request, env, key) {
    const headers = corsHeaders(request, env, true);
    headers.set('Accept-Ranges', 'bytes');
    headers.set('X-Content-Type-Options', 'nosniff');

    if (request.method === 'HEAD') {
        const object = await env.MODELS.head(key);
        if (!object) return new Response('Not Found', { status: 404, headers });
        object.writeHttpMetadata(headers);
        headers.set('ETag', object.httpEtag);
        headers.set('Content-Length', String(object.size));
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        return new Response(null, { status: 200, headers });
    }

    const object = await env.MODELS.get(key, {
        range: request.headers
    });
    if (!object) return new Response('Not Found', { status: 404, headers });

    object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Content-Type', 'model/gltf-binary');

    let status = 200;
    if (object.range) {
        const offset = object.range.offset || 0;
        const length = object.range.length || object.size;
        headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
        headers.set('Content-Length', String(length));
        status = 206;
    } else {
        headers.set('Content-Length', String(object.size));
    }

    return new Response(object.body, { status, headers });
}

export default {
    async fetch(request, env) {
        try {
            const url = new URL(request.url);

            if (request.method === 'OPTIONS' && url.pathname === '/api/models') {
                const headers = corsHeaders(request, env);
                if (!allowedUploadOrigin(request, env)) {
                    return new Response(null, { status: 403, headers });
                }
                return new Response(null, { status: 204, headers });
            }

            if (request.method === 'GET' && url.pathname === '/health') {
                return json({
                    ok: true,
                    service: 'window-ar-r2-storage',
                    maxModelBytes: MAX_MODEL_BYTES,
                    allowedOriginsConfigured: parseAllowedOrigins(env).length
                });
            }

            if (request.method === 'POST' && url.pathname === '/api/models') {
                return await handleUpload(request, env);
            }

            if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname.startsWith('/models/')) {
                const key = url.pathname.slice(1);
                if (!/^models\/[a-f0-9]{2}\/[a-f0-9]{64}\.glb$/.test(key)) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders(request, env, true) });
                }
                return await handleModelRead(request, env, key);
            }

            return json({
                service: 'Window AR model storage',
                endpoints: {
                    health: 'GET /health',
                    upload: 'POST /api/models',
                    model: 'GET /models/<sha256-prefix>/<sha256>.glb'
                }
            }, 404);
        } catch (error) {
            return json({ error: error.message || String(error) }, 500);
        }
    }
};
