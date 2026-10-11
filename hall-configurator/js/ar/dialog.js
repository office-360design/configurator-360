import { arT } from './i18n.js?v=hall-ar-1';
import { AR_MODES, arPhoneUrl } from './links.js?v=hall-ar-1';
import { qrSvg } from './vendor/qr.js?v=hall-ar-1';
import { publishHallAR } from './publish.js?v=hall-ar-1';

/** Hall-only QR dialog. Dependencies can be injected by offline integration tests. */
export function createHallARDialog({ getSnapshot, getLocale, onFeedback = () => {}, exportAsset, publish = publishHallAR } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'hall-ar-dialog'; dialog.id = 'hallARDialog';
  dialog.setAttribute('aria-labelledby','hall-ar-title');
  dialog.innerHTML = `
    <header class="hall-ar-header"><h2 id="hall-ar-title" data-copy="title"></h2><button type="button" data-close class="hall-ar-close">×</button></header>
    <p data-copy="description"></p>
    <fieldset class="hall-ar-modes"><legend data-copy="platform"></legend>
      <label><input type="radio" name="hall-ar-mode" value="android" checked /><span data-copy="android"></span></label>
      <label><input type="radio" name="hall-ar-mode" value="ios" /><span data-copy="ios"></span></label>
    </fieldset>
    <div class="hall-ar-status" role="status" aria-live="polite" data-status></div>
    <progress class="hall-ar-progress" max="1" value="0" data-progress></progress>
    <div class="hall-ar-qr" data-qr role="img" hidden></div>
    <p class="hall-ar-file" data-file hidden></p>
    <p class="hall-ar-error" data-error role="alert" hidden></p>
    <p class="hall-ar-small" data-expires hidden></p>
    <div class="hall-ar-actions"><a class="hall-ar-primary" data-open target="_blank" rel="noopener" hidden data-copy="openLink"></a><button type="button" data-copy-link hidden data-copy="copy"></button><button type="button" data-retry hidden data-copy="retry"></button></div>
    <p class="hall-ar-small" data-copy="snapshot"></p><p class="hall-ar-small" data-copy="scale"></p>
    <p class="hall-ar-small" data-copy="privacy"></p>`;
  document.body.append(dialog);
  const q = selector => dialog.querySelector(selector);
  const t = (key, vars) => arT(getLocale(), key, vars);
  let mode = 'android', snapshot, status = '', errorCode = '', current = null, generation = 0, abort = null, progress = 0, expiryTimer = 0;
  let loadExporter = exportAsset || (async (...args) => (await import('./exportHall.js?v=hall-ar-1')).createHallARAsset(...args));
  const cache = new Map();
  function refresh() {
    dialog.querySelectorAll('[data-copy]').forEach(el => { el.textContent=t(el.dataset.copy); });
    q('[data-close]').setAttribute('aria-label',t('close'));
    q('[data-status]').textContent=status?t(status):'';
    q('[data-error]').hidden=!errorCode; q('[data-error]').textContent=errorCode?t(errorCode):'';
    q('[data-progress]').hidden=Boolean(errorCode || current);q('[data-progress]').value=progress;
    q('[data-qr]').hidden=!current;q('[data-file]').hidden=!current;q('[data-expires]').hidden=!current;
    q('[data-open]').hidden=!current;q('[data-copy-link]').hidden=!current;q('[data-retry]').hidden=!errorCode;
    q('[data-qr]').setAttribute('aria-label',t('qrAlt'));
    if (current) {
      const url=arPhoneUrl(current.id,mode,getLocale());
      q('[data-qr]').innerHTML=qrSvg(url);q('[data-open]').href=url;
      q('[data-file]').textContent=t('file',{format:current.format.toUpperCase(),size:(current.byteLength/1048576).toFixed(2)});
      q('[data-expires]').textContent=t('expires',{time:new Date(current.expiresAtMs).toLocaleString(getLocale())});
    } else { q('[data-qr]').replaceChildren();q('[data-open]').removeAttribute('href'); }
  }
  function invalidate() { generation++;abort?.abort();abort=null;clearTimeout(expiryTimer); }
  function showReady(session) {
    current=session;status='ready';errorCode='';progress=1;refresh();
    expiryTimer=setTimeout(()=>{ current=null;status='';errorCode='expired';refresh(); },Math.max(1,session.expiresAtMs-Date.now()));
  }
  async function prepare() {
    invalidate(); const run=generation;abort=new AbortController();const signal=abort.signal;
    current=null;errorCode='';status='building';progress=.05;refresh();
    try {
      if (!snapshot) { const e=new Error('not-ready');e.code='not-ready';throw e; }
      const key=AR_MODES[mode]+JSON.stringify(snapshot);
      const existing=cache.get(key);
      if (existing?.expiresAtMs>Date.now()+60000) {showReady(existing);return;}
      const asset=await loadExporter(structuredClone(snapshot),AR_MODES[mode],key=>{if(run===generation){status=key;progress=key==='exporting'?.25:.08;refresh();}});
      if(run!==generation || signal.aborted)return;
      status='uploading';progress=.5;refresh();
      const session=await publish(asset,{signal,onProgress:value=>{if(run===generation){progress=.5+.45*value;status=value===1?'checking':'uploading';refresh();}}});
      if(run!==generation || signal.aborted)return;
      if(cache.size>=4)cache.delete(cache.keys().next().value);
      cache.set(key,session);showReady(session);
    } catch(error) {
      if(run!==generation || error.name==='AbortError')return;
      console.error('Hall AR preparation failed:',error);
      status='';errorCode=error.code || (error instanceof TypeError?'network':'generic');current=null;refresh();onFeedback(t(errorCode),'error',5000);
    }
  }
  function close() { invalidate();dialog.close(); }
  q('[data-close]').addEventListener('click',close);
  dialog.addEventListener('cancel',()=>invalidate());
  // A queued close event from an earlier opening must not cancel a new export.
  dialog.addEventListener('close',()=>{if(!dialog.open)invalidate();});
  dialog.querySelectorAll('[name="hall-ar-mode"]').forEach(input=>input.addEventListener('change',()=>{mode=input.value;void prepare();}));
  q('[data-retry]').addEventListener('click',()=>{snapshot=getSnapshot();void prepare();});
  q('[data-copy-link]').addEventListener('click',async()=>{
    if(!current)return;
    try{await navigator.clipboard.writeText(q('[data-open]').href);onFeedback(t('copied'),'success',2000);}catch{onFeedback(t('network'),'error',5000);}
  });
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  return {
    open() { if(dialog.open)return;snapshot=getSnapshot();mode='android';q('[value="android"]').checked=true;q('[value="ios"]').checked=false;dialog.showModal();void prepare(); },
    refresh, close, dialog,
    destroy() { invalidate();dialog.remove();cache.clear(); },
  };
}
