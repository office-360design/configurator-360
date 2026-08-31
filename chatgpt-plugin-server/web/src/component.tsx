type PreviewResult = {
  product?: string;
  draft?: boolean;
  shareId?: string;
  url?: string;
  previewUrl?: string;
  expiresAtMs?: number;
  summary?: Record<string, unknown>;
  analysis?: Record<string, unknown>;
  assumptions?: string[];
  assistantPrompt?: string;
  normalizedAnswers?: Record<string, unknown>;
};

type PreviewAdjustmentMessage = {
  type?: string;
  product?: string;
  adjustments?: Record<string, unknown>;
  label?: string;
};

const root = document.getElementById('root');
let latestData: PreviewResult = {};
let adjustmentLabel = '';

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

function showAdjustmentLabel() {
  const footer = root?.querySelector('footer');
  if (!footer || !adjustmentLabel) return;
  let note = footer.querySelector('.preview-adjustment');
  if (!note) {
    note = document.createElement('p');
    note.className = 'preview-adjustment';
    footer.prepend(note);
  }
  note.textContent = `✓ ${adjustmentLabel} — ChatGPT will keep these visual choices.`;
}

function render(data: PreviewResult = {}) {
  if (!root) return;
  if (latestData.product && data.product && latestData.product !== data.product) {
    adjustmentLabel = '';
  }
  latestData = data;
  if (!data.previewUrl || !data.url) {
    root.innerHTML = '<div class="empty">Create or load a configuration to see its live 3D preview.</div>';
    return;
  }
  const summary = Object.entries(data.summary || {}).map(([key, value]) => `<span><b>${escapeHtml(key.replace(/([A-Z])/g, ' $1'))}</b>${escapeHtml(value)}</span>`).join('');
  const analysis = Object.entries(data.analysis || {}).filter(([, value]) => ['string', 'number'].includes(typeof value) && value !== '').slice(0, 4).map(([key, value]) => `<span class="analysis"><b>${escapeHtml(key.replace(/([A-Z])/g, ' $1'))}</b>${escapeHtml(value)}</span>`).join('');
  const temporary = data.draft && data.assumptions?.length
    ? `<details class="draft-note"><summary>Draft preview · ${data.assumptions.length} temporary recommendation${data.assumptions.length === 1 ? '' : 's'}</summary><p>${escapeHtml(data.assumptions.join(' · '))}</p></details>`
    : data.draft ? '<p class="draft-note">Draft preview — not saved or shared yet.</p>' : '';
  const nextStep = data.draft && data.assistantPrompt
    ? `<details class="next-step"><summary>What remains to configure</summary><p>${escapeHtml(data.assistantPrompt)}</p></details>` : '';
  const adjustment = adjustmentLabel ? `<p class="preview-adjustment">✓ ${escapeHtml(adjustmentLabel)} — ChatGPT will keep these visual choices.</p>` : '';
  root.innerHTML = `
    <main class="${data.draft ? 'is-draft' : ''}">
      <header><div><small>360CONFIGURATOR${data.draft ? ' · DRAFT' : ''}</small><h2>${escapeHtml(data.product)}</h2></div><a href="${escapeHtml(data.url)}" target="_blank" rel="noreferrer">Open full configurator ↗</a></header>
      <iframe title="Live ${escapeHtml(data.product)} 3D preview" src="${escapeHtml(data.previewUrl)}" allow="fullscreen" loading="eager"></iframe>
      <footer>${adjustment}${temporary}${nextStep}${summary}${analysis}</footer>
    </main>`;
}

const style = document.createElement('style');
style.textContent = `
  :root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:transparent;color:#17202a}
  main{overflow:hidden;border:1px solid #d9dee3;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(17,24,39,.08)}
  header{height:58px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e5e7eb}small{font-size:9px;letter-spacing:.15em;color:#718096}h2{font-size:17px;margin:1px 0;text-transform:capitalize}
  a{background:#0b63ce;color:#fff;text-decoration:none;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:700}iframe{display:block;width:100%;height:440px;border:0;background:#eef2f5}
  footer{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid #e5e7eb}footer span{display:flex;gap:5px;padding:6px 9px;border-radius:8px;background:#f1f5f9;font-size:11px}footer b{text-transform:capitalize}.draft-note,.next-step,.preview-adjustment{width:100%;margin:0;font-size:12px;white-space:pre-line}.draft-note{color:#8a4b00}.next-step{color:#1e3a5f;font-weight:650}.preview-adjustment{padding:8px 10px;border-radius:9px;background:#ecfdf5;color:#166534;font-weight:750}.draft-note summary,.next-step summary{cursor:pointer;font-weight:750}.draft-note p,.next-step p{margin:7px 0 1px;line-height:1.4}.is-draft header{background:#fff8eb}.empty{padding:24px;color:#64748b}
  @media(prefers-color-scheme:dark){body{color:#eef3f6}main{background:#17212b;border-color:#36424b}header,footer{border-color:#36424b}footer span{background:#26313a}}
`;
document.head.appendChild(style);

const app = new App({ name: '360configurator-preview', version: '0.1.0' });
app.ontoolresult = result => render(result.structuredContent as PreviewResult);

window.addEventListener('message', event => {
  const frame = root?.querySelector('iframe');
  if (!frame || event.source !== frame.contentWindow || event.origin !== 'https://aks.360configurator.com') return;
  const message = event.data as PreviewAdjustmentMessage;
  if (message?.type !== '360configurator:preview-adjustment' || message.product !== latestData.product || !message.adjustments) return;

  const normalizedAnswers = { ...(latestData.normalizedAnswers || {}), ...message.adjustments };
  latestData = { ...latestData, normalizedAnswers };
  adjustmentLabel = String(message.label || 'Preview choices updated');
  showAdjustmentLabel();
  void app.updateModelContext({
    content: [{
      type: 'text',
      text: `The user explicitly changed ${message.product} settings in the interactive 3D preview: ${adjustmentLabel}. Merge the structured normalizedAnswers below into every subsequent configuration tool call and the final confirmed configuration. Do not ask the user to repeat these visual choices.`,
    }],
    structuredContent: {
      product: message.product,
      source: 'interactive-3d-preview',
      previewAdjustments: message.adjustments,
      normalizedAnswers,
    },
  }).catch(() => {
    adjustmentLabel = `${adjustmentLabel} (visible in this preview)`;
    showAdjustmentLabel();
  });
});
void app.connect().catch(error => {
  if (!root) return;
  root.innerHTML = `<div class="empty">The live preview could not connect: ${escapeHtml(error instanceof Error ? error.message : 'unknown error')}</div>`;
});
render();
import { App } from '@modelcontextprotocol/ext-apps';
