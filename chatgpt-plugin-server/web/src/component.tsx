type PreviewResult = {
  product?: string;
  shareId?: string;
  url?: string;
  previewUrl?: string;
  expiresAtMs?: number;
  summary?: Record<string, unknown>;
};

const root = document.getElementById('root');

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}

function render(data: PreviewResult = {}) {
  if (!root) return;
  if (!data.previewUrl || !data.url) {
    root.innerHTML = '<div class="empty">Create or load a configuration to see its live 3D preview.</div>';
    return;
  }
  const summary = Object.entries(data.summary || {}).map(([key, value]) => `<span><b>${escapeHtml(key.replace(/([A-Z])/g, ' $1'))}</b>${escapeHtml(value)}</span>`).join('');
  root.innerHTML = `
    <main>
      <header><div><small>360CONFIGURATOR</small><h2>${escapeHtml(data.product)}</h2></div><a href="${escapeHtml(data.url)}" target="_blank" rel="noreferrer">Open full configurator ↗</a></header>
      <iframe title="Live ${escapeHtml(data.product)} 3D preview" src="${escapeHtml(data.previewUrl)}" allow="fullscreen" loading="eager"></iframe>
      <footer>${summary}</footer>
    </main>`;
}

const style = document.createElement('style');
style.textContent = `
  :root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;background:transparent;color:#17202a}
  main{overflow:hidden;border:1px solid #d9dee3;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(17,24,39,.08)}
  header{height:58px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e5e7eb}small{font-size:9px;letter-spacing:.15em;color:#718096}h2{font-size:17px;margin:1px 0;text-transform:capitalize}
  a{background:#0b63ce;color:#fff;text-decoration:none;padding:9px 12px;border-radius:9px;font-size:13px;font-weight:700}iframe{display:block;width:100%;height:440px;border:0;background:#eef2f5}
  footer{display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border-top:1px solid #e5e7eb}footer span{display:flex;gap:5px;padding:6px 9px;border-radius:8px;background:#f1f5f9;font-size:11px}footer b{text-transform:capitalize}.empty{padding:24px;color:#64748b}
  @media(prefers-color-scheme:dark){body{color:#eef3f6}main{background:#17212b;border-color:#36424b}header,footer{border-color:#36424b}footer span{background:#26313a}}
`;
document.head.appendChild(style);

const app = new App({ name: '360configurator-preview', version: '0.1.0' });
app.ontoolresult = result => render(result.structuredContent as PreviewResult);
void app.connect().catch(error => {
  if (!root) return;
  root.innerHTML = `<div class="empty">The live preview could not connect: ${escapeHtml(error instanceof Error ? error.message : 'unknown error')}</div>`;
});
render();
import { App } from '@modelcontextprotocol/ext-apps';
