import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/mcp.js';

test('MCP handshake exposes the complete public tool contract', async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const listed = await client.listTools();
    assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [
      'create_configuration',
      'get_configurator_spec',
      'get_shared_configuration',
      'list_configurators',
      'prepare_configuration',
      'preview_draft_configuration',
      'render_configuration_preview',
      'revise_configuration',
    ]);
    const products = await client.callTool({ name: 'list_configurators', arguments: {} });
    assert.equal(products.isError, undefined);
    assert.equal((products.structuredContent as { configurators: unknown[] }).configurators.length, 6);
    const spec = await client.callTool({ name: 'get_configurator_spec', arguments: { product: 'solar' } });
    assert.equal((spec.structuredContent as { questions: unknown[] }).questions.length > 20, true);
    assert.equal((spec.structuredContent as { draft?: boolean }).draft, true);
    assert.match(String((spec.structuredContent as { previewUrl?: string }).previewUrl), /embed=preview/);
    const resources = await client.listResources();
    assert.equal(resources.resources[0]?.uri, 'ui://360configurator/preview-v1.html');
    const preview = await client.readResource({ uri: 'ui://360configurator/preview-v1.html' });
    assert.match(String(preview.contents[0] && 'text' in preview.contents[0] ? preview.contents[0].text : ''), /<script type="module">/);
  } finally {
    await client.close();
    await server.close();
  }
});
