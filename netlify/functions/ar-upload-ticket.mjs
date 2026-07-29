import crypto from 'node:crypto';

const DEFAULT_BUCKET = 'window-ar-models';
const DEFAULT_MAX_FILE_BYTES = 15 * 1024 * 1024;
const DEFAULT_MAX_MODELS = 90;
const DEFAULT_MAX_TOTAL_BYTES = 800 * 1024 * 1024;
const MODEL_PREFIX = 'models';
const GLB_CONTENT_TYPE = 'model/gltf-binary';

function json(data, status = 200, extraHeaders = {}) {
    return Response.json(data, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...extraHeaders
        }
    });
}

function positiveInteger(value, fallback) {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function splitOrigins(value) {
    return String(value || '')
        .split(',')
        .map(item => item.trim().replace(/\/$/, ''))
        .filter(Boolean);
}

function timingSafeTextEqual(left, right) {
    const a = Buffer.from(String(left || ''), 'utf8');
    const b = Buffer.from(String(right || ''), 'utf8');
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
}

function encodePath(value) {
    return String(value)
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function storageHeaders(secretKey) {
    return {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json'
    };
}

async function storageJson(url, options, label) {
    const response = await fetch(url, options);
    let payload = null;
    try {
        payload = await response.json();
    } catch (_error) {}
    if (!response.ok) {
        const detail = payload?.message || payload?.error || payload?.statusCode || response.statusText;
        throw new Error(`${label} failed with HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
    }
    return payload;
}

function publicObjectUrl(storageBase, bucket, objectPath) {
    return `${storageBase}/object/public/${encodePath(bucket)}/${encodePath(objectPath)}`;
}

function signedTusEndpoint(projectUrl) {
    // Signed resumable uploads use Supabase's dedicated /sign endpoint.
    // The unsigned /upload/resumable endpoint expects a normal Authorization
    // JWT and rejects a signed-upload token with 'Invalid Compact JWS'.
    const parsed = new URL(projectUrl);
    parsed.pathname = '/storage/v1/upload/resumable/sign';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
}

async function existingObject(storageBase, headers, bucket, objectPath, expectedBytes) {
    const url = `${storageBase}/object/${encodePath(bucket)}/${encodePath(objectPath)}`;
    let response = await fetch(url, { method: 'HEAD', headers });

    // Some storage/CDN paths do not expose HEAD consistently. A one-byte range
    // request provides the same existence and total-size check without loading
    // the GLB into the Function.
    if (response.status === 405) {
        response = await fetch(url, {
            method: 'GET',
            headers: { ...headers, Range: 'bytes=0-0' }
        });
    }

    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok && response.status !== 206) {
        throw new Error(`Supabase object check failed with HTTP ${response.status}.`);
    }

    const contentRange = response.headers.get('content-range') || '';
    const rangeMatch = /\/(\d+)$/.exec(contentRange);
    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    const length = rangeMatch ? Number.parseInt(rangeMatch[1], 10) : contentLength;

    if (Number.isFinite(length) && expectedBytes && length !== expectedBytes) {
        throw new Error(`An object already exists at the hash path, but it is ${length} bytes instead of ${expectedBytes}.`);
    }
    return { bytes: Number.isFinite(length) ? length : expectedBytes };
}

async function usageGuard(storageBase, headers, bucket, incomingBytes, maxModels, maxTotalBytes) {
    const listUrl = `${storageBase}/object/list/${encodePath(bucket)}`;
    const files = await storageJson(listUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            prefix: MODEL_PREFIX,
            limit: maxModels + 1,
            offset: 0,
            sortBy: { column: 'created_at', order: 'asc' },
            search: '.glb'
        })
    }, 'Supabase storage usage check');

    const models = Array.isArray(files)
        ? files.filter(item => item && typeof item.name === 'string' && item.name.toLowerCase().endsWith('.glb'))
        : [];
    const totalBytes = models.reduce((sum, item) => {
        const size = Number(item?.metadata?.size ?? item?.metadata?.contentLength ?? 0);
        return sum + (Number.isFinite(size) && size > 0 ? size : 0);
    }, 0);

    if (models.length >= maxModels) {
        const error = new Error(`The safety limit of ${maxModels} stored AR models has been reached. Delete old files from Supabase Storage before uploading another model.`);
        error.status = 507;
        throw error;
    }
    if (totalBytes + incomingBytes > maxTotalBytes) {
        const usedMiB = (totalBytes / 1048576).toFixed(1);
        const limitMiB = (maxTotalBytes / 1048576).toFixed(1);
        const error = new Error(`The configured Supabase safety cap would be exceeded (${usedMiB} MiB used; ${limitMiB} MiB cap). Delete old models first.`);
        error.status = 507;
        throw error;
    }

    return { modelCount: models.length, totalBytes };
}

export default async (request) => {
    const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '');
    const bucket = String(process.env.SUPABASE_BUCKET || DEFAULT_BUCKET);
    const uploadKey = String(process.env.AR_UPLOAD_KEY || '');
    const allowedOrigins = splitOrigins(process.env.AR_ALLOWED_ORIGINS);
    const maxFileBytes = positiveInteger(process.env.AR_MAX_FILE_BYTES, DEFAULT_MAX_FILE_BYTES);
    const maxModels = positiveInteger(process.env.AR_MAX_MODELS, DEFAULT_MAX_MODELS);
    const maxTotalBytes = positiveInteger(process.env.AR_MAX_TOTAL_BYTES, DEFAULT_MAX_TOTAL_BYTES);

    if (request.method === 'GET') {
        return json({
            ok: true,
            service: 'ar-upload-ticket',
            configured: Boolean(supabaseUrl && secretKey && uploadKey && allowedOrigins.length),
            bucket,
            limits: { maxFileBytes, maxModels, maxTotalBytes },
            allowedOriginCount: allowedOrigins.length,
            build: 'supabase-tus-sign-20260729-01',
            uploadProtocol: 'tus-signed',
            tusEndpointPath: '/storage/v1/upload/resumable/sign'
        });
    }
    if (request.method !== 'POST') {
        return json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST to request an AR upload ticket.' }, 405, { Allow: 'GET, POST' });
    }

    if (!supabaseUrl || !secretKey || !uploadKey || allowedOrigins.length === 0) {
        return json({
            error: 'SERVER_NOT_CONFIGURED',
            message: 'The Netlify function is missing one or more required environment variables.'
        }, 503);
    }

    const requestOrigin = String(request.headers.get('origin') || new URL(request.url).origin).replace(/\/$/, '');
    if (!requestOrigin || !allowedOrigins.includes(requestOrigin)) {
        return json({ error: 'ORIGIN_NOT_ALLOWED', message: 'This site origin is not allowed to request model uploads.' }, 403);
    }

    if (!timingSafeTextEqual(request.headers.get('x-ar-upload-key'), uploadKey)) {
        return json({ error: 'UPLOAD_KEY_INVALID', message: 'The AR upload access key is missing or incorrect.' }, 401);
    }

    let body;
    try {
        body = await request.json();
    } catch (_error) {
        return json({ error: 'INVALID_JSON', message: 'The upload ticket request must contain valid JSON.' }, 400);
    }

    const sha256 = String(body?.sha256 || '').toLowerCase();
    const bytes = Number(body?.bytes);
    const originalName = String(body?.filename || 'configured-window.glb').slice(0, 180);
    const contentType = String(body?.contentType || GLB_CONTENT_TYPE);

    if (!/^[a-f0-9]{64}$/.test(sha256)) {
        return json({ error: 'INVALID_HASH', message: 'A 64-character SHA-256 hash is required.' }, 400);
    }
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > maxFileBytes) {
        return json({
            error: 'INVALID_SIZE',
            message: `The GLB must be between 1 byte and ${maxFileBytes} bytes.`
        }, 413);
    }
    if (contentType !== GLB_CONTENT_TYPE) {
        return json({ error: 'INVALID_CONTENT_TYPE', message: `Only ${GLB_CONTENT_TYPE} uploads are accepted.` }, 415);
    }

    const objectPath = `${MODEL_PREFIX}/${sha256}.glb`;
    const storageBase = `${supabaseUrl}/storage/v1`;
    const headers = storageHeaders(secretKey);
    const publicUrl = publicObjectUrl(storageBase, bucket, objectPath);

    try {
        const existing = await existingObject(storageBase, headers, bucket, objectPath, bytes);
        if (existing) {
            return json({
                ok: true,
                exists: true,
                bucket,
                path: objectPath,
                publicUrl,
                bytes: existing.bytes,
                originalName
            });
        }

        const usage = await usageGuard(storageBase, headers, bucket, bytes, maxModels, maxTotalBytes);
        const signUrl = `${storageBase}/object/upload/sign/${encodePath(bucket)}/${encodePath(objectPath)}`;
        const signed = await storageJson(signUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({})
        }, 'Supabase signed upload URL creation');

        const signedPath = String(signed?.url || '');
        const signedUrl = /^https?:\/\//i.test(signedPath)
            ? signedPath
            : `${storageBase}${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
        const token = new URL(signedUrl).searchParams.get('token');
        if (!token) throw new Error('Supabase did not return a signed upload token.');

        return json({
            ok: true,
            exists: false,
            bucket,
            path: objectPath,
            publicUrl,
            signedUrl,
            token,
            tusEndpoint: signedTusEndpoint(supabaseUrl),
            expiresInSeconds: 7200,
            usageBeforeUpload: usage,
            originalName
        });
    } catch (error) {
        console.error('AR upload ticket failed:', error);
        return json({
            error: 'UPLOAD_TICKET_FAILED',
            message: error?.message || 'The upload ticket could not be created.'
        }, Number.isInteger(error?.status) ? error.status : 502);
    }
};

export const config = {
    path: '/api/ar-upload-ticket'
};
