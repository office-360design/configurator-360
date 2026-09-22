import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp.js';
import { withClientKey } from './context.js';

const port = Number(process.env.PORT || 8080);

createServer(async (request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: '360configurator-mcp', version: '0.1.0' }));
    return;
  }
  if (request.url !== '/mcp') {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const clientKey = forwarded || request.socket.remoteAddress || 'unknown';
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();
  try {
    await server.connect(transport);
    await withClientKey(clientKey, () => transport.handleRequest(request, response));
  } catch (error) {
    console.error(JSON.stringify({ event: 'mcp-request-failed', message: error instanceof Error ? error.message : String(error) }));
    if (!response.headersSent) response.writeHead(500, { 'content-type': 'application/json' });
    if (!response.writableEnded) response.end(JSON.stringify({ error: 'internal_error' }));
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}).listen(port, '0.0.0.0', () => {
  console.error(`360Configurator MCP listening on :${port}/mcp`);
});
