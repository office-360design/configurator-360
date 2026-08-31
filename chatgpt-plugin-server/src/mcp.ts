import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { z } from 'zod';
import { answersFromState, buildState, ConfigurationError, mergeRevision, pendingQuestions, summarize } from './adapters.js';
import { CATALOG, PRODUCT_IDS, ConfirmedProductRequestSchema, ProductRequestSchema, isProductId, type JsonObject, type ProductId, type Question } from './catalog.js';
import { currentClientKey } from './context.js';
import { createShare, enforceRateLimit, getShare, parseShareId, type StoredShare } from './storage.js';

const UI_URI = 'ui://360configurator/preview-v1.html';
const here = dirname(fileURLToPath(import.meta.url));

function componentSource() {
  const candidates = [join(here, 'component.js'), join(here, '../dist/src/component.js')];
  const path = candidates.find(existsSync);
  if (!path) throw new Error('The MCP Apps preview bundle has not been built.');
  return readFileSync(path, 'utf8');
}

function urls(product: ProductId, id: string) {
  const base = CATALOG[product].baseUrl;
  return { url: `${base}#s=${id}`, previewUrl: `${base}?embed=preview#s=${id}` };
}

function draftUrls(product: ProductId, state: JsonObject) {
  // The configurators already understand the legacy compact #c state format.
  // A draft therefore needs neither a Firestore document nor a public share ID:
  // it is a self-contained, short-lived value carried only by the preview URL.
  const payload = Buffer.from(JSON.stringify({ v: 2, p: product, s: state }));
  const encoded = `g2.${gzipSync(payload).toString('base64url')}`;
  if (encoded.length > 20_000) throw new Error('This draft is too large to preview in ChatGPT. Create the configuration to open it in the full configurator.');
  const base = CATALOG[product].baseUrl;
  return { url: `${base}#c=${encoded}`, previewUrl: `${base}?embed=preview#c=${encoded}` };
}

function publicShare(share: StoredShare) {
  return { product: share.product, shareId: share.id, ...urls(share.product, share.id), expiresAtMs: share.expiresAtMs, sizeBytes: share.sizeBytes, summary: summarize(share.product, share.state) };
}

function result(data: JsonObject, message: string) {
  return { structuredContent: data, content: [{ type: 'text' as const, text: message }] };
}

function questionPrompt(question: Question) {
  if (question.type === 'number') return `${question.label}: ${question.min}–${question.max} ${question.unit || ''}`.trim();
  if (question.type === 'choice') return `${question.label}: ${question.choices?.map(choice => question.choiceLabels?.[choice] || choice).join(' / ')}`;
  if (question.type === 'boolean') return `${question.label}: yes / no`;
  if (question.type === 'array') return `${question.label}: none, or provide the items`;
  return question.label;
}

function questionGuidance(product: ProductId, raw: JsonObject) {
  const next = pendingQuestions(product, raw, 3);
  const allRemaining = pendingQuestions(product, raw, Number.MAX_SAFE_INTEGER);
  const nextText = next.map(questionPrompt);
  const later = allRemaining.slice(next.length).map(question => question.label);
  const assistantPrompt = nextText.length
    ? `Next, please choose:\n${nextText.map(item => `• ${item}`).join('\n')}${later.length ? `\n\nAfter this, we will configure: ${later.join(', ')}.` : '\n\nThat completes the remaining choices.'}`
    : 'All active choices are supplied. I will now prepare the configuration summary for your confirmation.';
  return { next, remaining: allRemaining.slice(next.length), assistantPrompt };
}

function failure(error: unknown) {
  const message = error instanceof ConfigurationError ? error.message
    : error instanceof Error && error.message === 'RATE_LIMITED' ? 'The anonymous configuration creation limit has been reached. Try again later.'
      : error instanceof Error ? error.message : 'The configuration request failed.';
  return { isError: true, content: [{ type: 'text' as const, text: message }] };
}

export function createMcpServer() {
  const server = new McpServer(
    { name: '360configurator', version: '0.1.0' },
    { instructions: 'Required workflow: call get_configurator_spec first, then call preview_draft_configuration exactly once in that same response with every unambiguous value extracted from the first customer message (or {} for a default preview). Do not assign an ambiguous measurement (for example “an 8 m U-shaped fence”) to a particular run. NEVER render two preview tools in one assistant response. After get_configurator_spec, and after every customer message that changes any collected answer, call get_next_configuration_questions and present its assistantPrompt verbatim. Collect every active customer-facing answer; call prepare_configuration; show its returned summary; wait for the user to explicitly confirm in a later message; only then call create_configuration with confirmation="confirmed". Never silently choose defaults. Treat “no gates” as gates: []. Immediately after every later customer message that changes any collected answer, call preview_draft_configuration once with every answer collected so far; it must update automatically without the user asking. Its assumptions are temporary preview values, not accepted customer choices. The create_configuration and revise_configuration tools themselves return the live 3D preview: do not omit it and do not make a separate render call after creation.' },
  );

  server.registerTool('list_configurators', {
    title: 'List 360Configurator products',
    description: 'Use when the user wants to discover which physical products can be configured or when their requested product is ambiguous.',
    inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async () => result({ configurators: PRODUCT_IDS.map(id => ({ id, title: CATALOG[id].title, description: CATALOG[id].description })) }, 'Six configurators are available.'));

  server.registerTool('get_configurator_spec', {
    title: 'Get configurator questionnaire',
    description: 'Get the complete ordered customer questionnaire, choices, limits, dependencies, and defaults for one configurator before creating it. This tool does not render a preview; call preview_draft_configuration once after it.',
    inputSchema: { product: z.enum(PRODUCT_IDS), locale: z.string().optional() }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ product }) => result({ ...CATALOG[product], locale: 'en-US' }, `Loaded the complete ${CATALOG[product].title} questionnaire.`));

  server.registerTool('get_next_configuration_questions', {
    title: 'Get the next customer questions with limits',
    description: 'Return at most three active, unanswered customer questions, with exact permitted values/ranges and a compact roadmap of what remains. Call after loading the configurator and after each answer update; present assistantPrompt verbatim to the customer.',
    inputSchema: ProductRequestSchema.shape, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ product, answers }) => {
    try {
      const raw = answers as JsonObject;
      const guidance = questionGuidance(product, raw);
      return result({ product, questions: guidance.next, remainingQuestions: guidance.remaining, assistantPrompt: guidance.assistantPrompt }, 'Loaded the next customer questions with their exact limits and options.');
    } catch (error) { return failure(error); }
  });

  server.registerTool('prepare_configuration', {
    title: 'Prepare a configuration for customer confirmation',
    description: 'Validate all explicitly answered active customer-facing choices and return a compact summary. Use this before asking the user for final confirmation; this does not create a share link.',
    inputSchema: ProductRequestSchema.shape, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ product, answers }) => {
    try {
      const built = buildState(product, answers as JsonObject, { requireExplicit: true });
      return result({ product, normalizedAnswers: built.answers, summary: summarize(product, built.state), assumptions: built.assumptions, confirmationRequired: true }, `The ${CATALOG[product].title} is ready for the user’s explicit confirmation.`);
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, 'preview_draft_configuration', {
    title: 'Update the live unsaved 3D draft',
    description: 'Show or update the same unsaved live 3D draft while gathering choices. Pass every answer collected so far. Missing active choices use clearly temporary recommended values in the preview; this never saves, shares, or creates a configuration.',
    inputSchema: ProductRequestSchema.shape, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['model'] } },
  }, async ({ product, answers }) => {
    try {
      const raw = answers as JsonObject;
      const built = buildState(product, raw);
      const guidance = questionGuidance(product, raw);
      return result({
        product, draft: true, ...draftUrls(product, built.state), normalizedAnswers: built.answers,
        assumptions: built.assumptions, summary: summarize(product, built.state),
        nextQuestions: guidance.next, remainingQuestions: guidance.remaining, assistantPrompt: guidance.assistantPrompt,
      }, `Updated the unsaved live ${CATALOG[product].title} draft. ${built.assumptions.length ? 'Some visible values are temporary recommendations until the user chooses them.' : 'All current values came from the user.'}\n\n${guidance.assistantPrompt}`);
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, 'create_configuration', {
    title: 'Create a confirmed public 360 configuration',
    description: 'Create an immutable, 90-day public configuration link only after prepare_configuration was shown and the user explicitly confirmed it in a later message. All active customer-facing answers must be supplied; defaults cannot be silently applied.',
    inputSchema: ConfirmedProductRequestSchema.shape, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['model'] } },
  }, async ({ product, answers }) => {
    try {
      const built = buildState(product, answers as JsonObject, { requireExplicit: true });
      await enforceRateLimit(currentClientKey());
      const share = await createShare(product, built.state, built.answers);
      const data = { ...publicShare(share), normalizedAnswers: built.answers, assumptions: built.assumptions, warnings: built.warnings };
      return result(data, `Created a ${CATALOG[product].title} configuration. It expires in 90 days.`);
    } catch (error) { return failure(error); }
  });

  server.registerTool('get_shared_configuration', {
    title: 'Inspect a shared 360 configuration',
    description: 'Read an existing 360Configurator share link or 16-character share ID so it can be explained or revised.',
    inputSchema: { share: z.string().min(1) }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  }, async ({ share }) => {
    try {
      const id = parseShareId(share);
      if (!id) return failure(new Error('Invalid 360Configurator share link or ID.'));
      const stored = await getShare(id);
      if (!stored || !isProductId(stored.product)) return failure(new Error('The shared configuration was not found or has expired.'));
      return result({ ...publicShare(stored), normalizedAnswers: Object.keys(stored.answers).length ? stored.answers : answersFromState(stored.product, stored.state) }, `Loaded the shared ${CATALOG[stored.product].title} configuration.`);
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, 'revise_configuration', {
    title: 'Revise a shared 360 configuration',
    description: 'Apply requested customer-facing changes to an existing share and create a new immutable 90-day link; never overwrites the source.',
    inputSchema: { share: z.string().min(1), changes: z.record(z.unknown()), confirmation: z.literal('confirmed') }, annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['model'] } },
  }, async ({ share, changes }) => {
    try {
      const id = parseShareId(share);
      const previous = id ? await getShare(id) : null;
      if (!previous || !isProductId(previous.product)) return failure(new Error('The shared configuration was not found or has expired.'));
      const baseAnswers = Object.keys(previous.answers).length ? previous.answers : answersFromState(previous.product, previous.state);
      const built = mergeRevision(previous.product, baseAnswers, changes as JsonObject);
      await enforceRateLimit(currentClientKey());
      const next = await createShare(previous.product, built.state, built.answers);
      return result({ ...publicShare(next), sourceShareId: previous.id, normalizedAnswers: built.answers, assumptions: built.assumptions, warnings: built.warnings }, `Created a revised ${CATALOG[previous.product].title} configuration without changing the original.`);
    } catch (error) { return failure(error); }
  });

  registerAppTool(server, 'render_configuration_preview', {
    title: 'Show live 3D configuration preview',
    description: 'Render the live rotatable 3D preview after creating, revising, or inspecting a valid configuration.',
    inputSchema: { share: z.string().min(1) }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    _meta: { ui: { resourceUri: UI_URI, visibility: ['model'] } },
  }, async ({ share }) => {
    try {
      const id = parseShareId(share);
      const stored = id ? await getShare(id) : null;
      if (!stored || !isProductId(stored.product)) return failure(new Error('The shared configuration was not found or has expired.'));
      return result(publicShare(stored), `Showing the live ${CATALOG[stored.product].title} 3D preview.`);
    } catch (error) { return failure(error); }
  });

  registerAppResource(server, '360Configurator live preview', UI_URI, {
    description: 'Read-only live 3D preview with a link to the complete configurator.',
  }, async () => {
    const component = componentSource();
    return { contents: [{
      uri: UI_URI, mimeType: RESOURCE_MIME_TYPE, text: `<div id="root"></div><script type="module">${component}</script>`,
      _meta: { ui: { prefersBorder: true, domain: 'https://aks.360configurator.com', csp: { frameDomains: ['https://aks.360configurator.com'], connectDomains: ['https://aks.360configurator.com'], resourceDomains: ['https://aks.360configurator.com'] } } },
    }] };
  });

  return server;
}
