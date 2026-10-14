import { hallT } from './i18n.js?v=hall-production-1';

/** Hall-only preview/confirmation. The shared optional Templates menu is unchanged. */
export function createHallTemplateDialog({ getLocale, applyTemplate, onApplied = null }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'hall-template-dialog';
  dialog.setAttribute('aria-labelledby', 'hall-template-preview-title');
  dialog.innerHTML = `
    <header class="hall-template-dialog__header"><h2 id="hall-template-preview-title"></h2><button type="button" data-template-close class="hall-template-dialog__close">×</button></header>
    <div class="hall-template-dialog__content">
      <img class="hall-template-dialog__image" data-template-image />
      <p data-template-intro></p>
      <ul class="hall-template-dialog__features" data-template-features></ul>
      <p class="hall-template-dialog__note" data-template-note></p>
      <p class="hall-template-dialog__warning" data-template-warning></p>
      <p class="hall-template-dialog__error" role="alert" data-template-error hidden></p>
    </div>
    <footer class="hall-template-dialog__footer"><button type="button" data-template-cancel class="secondary-action" autofocus></button><button type="button" data-template-apply class="primary-action"></button></footer>`;
  document.body.appendChild(dialog);
  let selected = null;
  let busy = false;
  let failed = false;
  const q = (s) => dialog.querySelector(s);
  const t = (key) => hallT(getLocale(), key);
  function refresh() {
    if (!selected) return;
    q('#hall-template-preview-title').textContent = t(selected.nameKey);
    q('[data-template-close]').setAttribute('aria-label', t('templates.close'));
    q('[data-template-image]').src = selected.image;
    q('[data-template-image]').alt = t(`${selected.copyPrefix}.previewAlt`);
    q('[data-template-intro]').textContent = t(`${selected.copyPrefix}.intro`);
    q('[data-template-features]').replaceChildren(...selected.features.map((key) => {
      const li = document.createElement('li'); li.textContent = t(`${selected.copyPrefix}.${key}`); return li;
    }));
    q('[data-template-note]').textContent = t(selected.copyPrefix === 'templates.agricultural' ? 'templates.designNote' : `${selected.copyPrefix}.designNote`);
    q('[data-template-warning]').textContent = t('templates.replaceWarning');
    q('[data-template-cancel]').textContent = t('templates.cancel');
    q('[data-template-apply]').textContent = t(busy ? 'templates.loading' : 'templates.apply');
    q('[data-template-error]').hidden = !failed;
    q('[data-template-error]').textContent = t('templates.failed');
  }
  const close = () => { if (!busy) dialog.close(); };
  q('[data-template-close]').addEventListener('click', close);
  q('[data-template-cancel]').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  q('[data-template-apply]').addEventListener('click', async () => {
    if (busy || !selected) return;
    busy = true; failed = false;
    q('[data-template-apply]').disabled = true;
    q('[data-template-cancel]').disabled = true;
    refresh();
    try {
      if (await applyTemplate(selected.id) === false) throw new Error('Hall template was not applied.');
      busy = false;
      dialog.close();
      onApplied?.();
    } catch (error) {
      console.error('Hall template application failed:', error);
      failed = true;
    } finally {
      busy = false;
      q('[data-template-apply]').disabled = false;
      q('[data-template-cancel]').disabled = false;
      refresh();
    }
  });
  return {
    open(item) { if (busy) return; selected = item; failed = false; refresh(); if (!dialog.open) dialog.showModal(); },
    refresh,
    close,
  };
}
