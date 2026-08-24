import http from 'node:http';
import { handleGoogleSolarRequest } from './googleSolarHandler.mjs';
import { handlePvgisRequest } from './pvgisHandler.mjs';

const PORT = Math.max(1, Number(process.env.PORT) || 8080);
const MAX_BODY_BYTES = Math.max(1024, Number(process.env.MAX_REQUEST_BODY_BYTES) || 1_000_000);

function requestProtocol(req) {
  return String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
}

function requestHost(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim() || 'localhost';
}

async function readBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

async function toWebRequest(req) {
  const url = `${requestProtocol(req)}://${requestHost(req)}${req.url || '/'}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
    else if (value !== undefined) headers.set(name, String(value));
  }

  const method = String(req.method || 'GET').toUpperCase();
  const body = method === 'GET' || method === 'HEAD' ? null : await readBody(req);
  return new Request(url, {
    method,
    headers,
    body,
  });
}

async function sendWebResponse(res, response) {
  const headers = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  res.writeHead(response.status, headers);
  if (response.status === 204 || response.status === 304) {
    res.end();
    return;
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

function notFoundResponse() {
  return new Response(JSON.stringify({ error: 'Not found.' }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/healthz') {
      req.url = '/api/solar/google-solar?action=health';
    }
    const request = await toWebRequest(req);
    const pathname = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
    let response;
    if (pathname === '/api/solar/google-solar') {
      response = await handleGoogleSolarRequest(request);
    } else if (pathname === '/api/solar/pvgis') {
      response = await handlePvgisRequest(request);
    } else {
      response = notFoundResponse();
    }
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[Solar API Cloud Run] Unhandled request failure.', error);
    const status = Number(error?.status) || 500;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ error: error?.message || 'Internal server error.' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Solar API Cloud Run] Listening on 0.0.0.0:${PORT}`);
});
