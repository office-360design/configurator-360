/** Normal project controls; not part of the diagnostic dropdown. */
const COPY = {
  en: { title:'Project · Save and open', name:'Project name', defaultName:'My pavement', save:'Save new copy in browser', update:'Update selected save', list:'Saved in this browser', refresh:'Refresh list', empty:'No local projects', open:'Open selected', remove:'Delete selected', download:'Download full project', upload:'Open project file', diagnostics:'Include original model result and diagnostics', reattach:'Reattach original photo', persist:'Protect browser storage', clear:'Clear local projects and photo cache',
    storage:'Local saves belong to this browser, not your account. Browser-data removal can erase them. Download a full project for backup or use on another device.',
    privacy:'Full project files include the photo, including any embedded image metadata. Share them deliberately. Normal Share links contain only the edited pavement and holes, not the photograph or camera.',
    account:'Account Save keeps the design, calibration and a local photo reference. On another device, open a full project file or reattach the exact original photograph.',
    replace:'Open this project and replace the current photo, camera and pavement? Unsaved changes and undo history will be discarded.',
    overwrite:'Replace the selected browser save with the current project?', delete:'Delete this browser save? The shared photo cache is retained for account saves.',
    clearConfirm:'Delete ALL locally saved pavement projects and cached photos/results on this site? Download backups first. Account records are not deleted, but their photos may need reattaching.',
    protected:'Persistent browser storage was granted. Keep a downloaded backup too.', notProtected:'The browser did not grant persistent storage. Download a project file for backup.', unavailable:'Persistent storage is unavailable here. Use HTTPS or localhost and download a backup.', deleted:'The selected local save was deleted.', busy:'Working…', savedPhoto:'Photo included', noPhoto:'Geometry only' },
  ro: { title:'Proiect · Salvare și deschidere', name:'Numele proiectului', defaultName:'Pavajul meu', save:'Salvează o copie în browser', update:'Actualizează salvarea selectată', list:'Salvate în acest browser', refresh:'Actualizează lista', empty:'Niciun proiect local', open:'Deschide selecția', remove:'Șterge selecția', download:'Descarcă proiectul complet', upload:'Deschide fișierul proiectului', diagnostics:'Include rezultatul inițial al modelelor și diagnosticele', reattach:'Reatașează fotografia originală', persist:'Protejează stocarea browserului', clear:'Șterge proiectele și fotografiile locale',
    storage:'Salvările locale aparțin acestui browser, nu contului. Ștergerea datelor browserului le poate elimina. Descarcă proiectul complet pentru backup sau alt dispozitiv.',
    privacy:'Fișierele complete includ fotografia și metadatele ei. Distribuie-le în mod deliberat. Linkurile Distribuie conțin numai pavajul editat și golurile, nu fotografia sau camera.',
    account:'Salvarea în cont păstrează designul, calibrarea și o referință la fotografia locală. Pe alt dispozitiv, deschide fișierul complet sau reatașează exact fotografia originală.',
    replace:'Deschizi acest proiect și înlocuiești fotografia, camera și pavajul? Modificările nesalvate și istoricul vor fi pierdute.',
    overwrite:'Înlocuiești salvarea selectată cu proiectul curent?', delete:'Ștergi această salvare locală? Fotografia rămâne în cache pentru salvările din cont.',
    clearConfirm:'Ștergi TOATE proiectele și fotografiile/rezultatele locale de pe acest site? Descarcă mai întâi copii. Salvările din cont nu se șterg, dar fotografiile lor vor putea necesita reatașare.',
    protected:'Browserul a acordat stocare persistentă. Păstrează și un backup descărcat.', notProtected:'Browserul nu a acordat stocare persistentă. Descarcă proiectul pentru backup.', unavailable:'Stocarea persistentă nu este disponibilă. Folosește HTTPS sau localhost și descarcă un backup.', deleted:'Salvarea locală selectată a fost ștearsă.', busy:'Se procesează…', savedPhoto:'Fotografie inclusă', noPhoto:'Doar geometria' },
  de: { title:'Projekt · Speichern und öffnen', name:'Projektname', defaultName:'Mein Pflaster', save:'Neue Kopie im Browser speichern', update:'Gewählten Stand aktualisieren', list:'In diesem Browser gespeichert', refresh:'Liste aktualisieren', empty:'Keine lokalen Projekte', open:'Auswahl öffnen', remove:'Auswahl löschen', download:'Vollständiges Projekt herunterladen', upload:'Projektdatei öffnen', diagnostics:'Ursprüngliches Modellergebnis und Diagnosen einschließen', reattach:'Originalfoto erneut zuordnen', persist:'Browserspeicher schützen', clear:'Lokale Projekte und Fotocache löschen',
    storage:'Lokale Projekte gehören zu diesem Browser, nicht zum Konto. Gelöschte Browserdaten können sie entfernen. Ein vollständiges Projekt für Sicherung oder andere Geräte herunterladen.',
    privacy:'Vollständige Projektdateien enthalten das Foto einschließlich Bildmetadaten. Bewusst weitergeben. Teilen-Links enthalten nur das bearbeitete Pflaster und Aussparungen, nicht Foto oder Kamera.',
    account:'Im Konto werden Entwurf, Kalibrierung und ein lokaler Fotoverweis gespeichert. Auf anderen Geräten eine vollständige Projektdatei öffnen oder exakt das Originalfoto zuordnen.',
    replace:'Dieses Projekt öffnen und aktuelles Foto, Kamera und Pflaster ersetzen? Ungespeicherte Änderungen und Verlauf gehen verloren.',
    overwrite:'Den gewählten Browserstand durch das aktuelle Projekt ersetzen?', delete:'Diesen Browserstand löschen? Der Fotocache bleibt für Kontospeicherungen erhalten.',
    clearConfirm:'ALLE lokalen Pflasterprojekte und gespeicherten Fotos/Ergebnisse dieser Website löschen? Zuerst Sicherungen herunterladen. Kontoeinträge bleiben bestehen, benötigen aber eventuell das Originalfoto.',
    protected:'Dauerhafter Browserspeicher wurde gewährt. Zusätzlich eine heruntergeladene Sicherung behalten.', notProtected:'Der Browser hat keinen dauerhaften Speicher gewährt. Eine Projektdatei zur Sicherung herunterladen.', unavailable:'Dauerhafter Speicher ist hier nicht verfügbar. HTTPS oder localhost verwenden und eine Sicherung herunterladen.', deleted:'Der gewählte lokale Stand wurde gelöscht.', busy:'Wird verarbeitet…', savedPhoto:'Mit Foto', noPhoto:'Nur Geometrie' },
};
export function mountProjectPanel({ api, getLocale = () => 'en-US', getStep = () => 'done' }) {
  const panel = document.createElement('details'); panel.id = 'pavingProjectPanel'; panel.className = 'accordion-section paving-project-panel';
  panel.innerHTML = `<summary class="accordion-toggle" data-copy="title"></summary><div class="accordion-panel">
    <p data-project-status role="status" aria-live="polite"></p>
    <label><span data-copy="name"></span><input data-project-name type="text" maxlength="100" autocomplete="off"></label>
    <div class="project-actions"><button type="button" data-save data-copy="save"></button><button type="button" data-update data-copy="update"></button></div>
    <label><span data-copy="list"></span><select data-project-list></select></label>
    <div class="project-actions"><button type="button" data-open data-copy="open"></button><button type="button" data-remove data-copy="remove"></button><button type="button" data-refresh data-copy="refresh"></button></div>
    <hr><div class="project-actions"><button type="button" data-download data-copy="download"></button><button type="button" data-upload data-copy="upload"></button></div>
    <label class="project-check"><input type="checkbox" data-diagnostics><span data-copy="diagnostics"></span></label>
    <input type="file" data-file accept=".paving.json,.json,application/json" hidden>
    <button type="button" data-reattach data-copy="reattach" hidden></button><input type="file" data-photo accept="image/jpeg,image/png,image/webp" hidden>
    <p class="note" data-copy="storage"></p><p class="note" data-copy="account"></p><p class="note" data-copy="privacy"></p>
    <div class="project-actions"><button type="button" data-persist data-copy="persist"></button><button type="button" data-clear data-copy="clear"></button></div>
  </div>`;
  const style = document.createElement('style'); style.textContent = `
    .paving-project-panel{margin:12px 0;width:100%;min-width:0}.paving-project-panel summary{cursor:pointer;font-weight:700}
    .paving-project-panel .accordion-panel{min-width:0}.paving-project-panel label:not(.project-check){display:grid;gap:5px;font-size:12px;margin:9px 0}
    .paving-project-panel input[type=text],.paving-project-panel select{width:100%;min-width:0;padding:9px;border:1px solid #bccbd5;border-radius:7px;font:inherit;color:inherit;background:transparent}
    .project-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:9px 0}.paving-project-panel button{min-height:40px;white-space:normal;padding:8px;border:1px solid #bccbd5;border-radius:8px;background:#fff;color:inherit;cursor:pointer;font:inherit;font-size:12px}
    .paving-project-panel button:disabled{opacity:.5;cursor:default}.paving-project-panel [data-save]{background:#0878c9;color:#fff;border-color:#0878c9}
    .paving-project-panel .project-check{display:flex;gap:7px;align-items:flex-start;font-size:12px}.paving-project-panel .project-check input{flex:0 0 auto;width:16px;height:16px}
    .paving-project-panel p{font-size:12px;line-height:1.5;overflow-wrap:anywhere}.paving-project-panel [data-project-status][data-error=true]{color:#a13f20}
    .paving-project-panel [hidden]{display:none!important}body.dark .paving-project-panel button{background:#35424a;border-color:#52626c;color:#e4ebef}
    .photo-flow-card .paving-project-panel{border-top:1px solid #bdcbd3;padding-top:12px}.photo-flow-card .paving-project-panel summary{font-size:13px}
    .photo-flow-card:has(.paving-project-panel[open]){max-height:calc(100vh - 120px);max-height:calc(100dvh - 120px);overflow-y:auto;overscroll-behavior:contain}
  `; document.head.append(style);
  const $ = s => panel.querySelector(s), copy = () => COPY[getLocale().split('-')[0]] || COPY.en;
  let busy = false, localMessage = '', localError = false, records = [], lastPhase = null;
  $('[data-project-name]').value = copy().defaultName;
  const selected = () => records.find(r=>r.id === $('[data-project-list]').value);
  function update() {
    const body = document.querySelector('.sidebar .shared-configurator-panel__body') || document.querySelector('.sidebar');
    const parent = getStep() === 'done' ? body : document.querySelector('.photo-flow-card');
    if (parent && panel.parentElement !== parent) parent.append(panel);
    const c = copy(), s = api.getProjectStatus();
    for (const el of panel.querySelectorAll('[data-copy]')) el.textContent = c[el.dataset.copy];
    $('[data-project-list]').setAttribute('aria-label',c.list);
    if (lastPhase !== s.phase) { localMessage = ''; lastPhase = s.phase; }
    $('[data-project-status]').textContent = busy ? c.busy : localMessage || s.message;
    $('[data-project-status]').dataset.error = String(localMessage ? localError : ['error','missing','warning'].includes(s.phase));
    $('[data-reattach]').hidden = !s.missingPhoto;
    for (const el of panel.querySelectorAll('button,input,select')) el.disabled = busy;
    for (const key of ['open','remove','update']) $(`[data-${key}]`).disabled = busy || !selected();
  }
  async function refresh() {
    const chosen = $('[data-project-list]').value;
    records = await api.listLocalProjects(); $('[data-project-list]').replaceChildren();
    const empty = new Option(copy().empty, ''); empty.disabled = records.length > 0;
    $('[data-project-list]').append(empty);
    for (const r of records) $('[data-project-list]').append(new Option(`${r.name} · ${new Date(r.updatedAt).toLocaleString(getLocale())}`, r.id));
    $('[data-project-list]').value = records.some(r=>r.id===chosen) ? chosen : records[0]?.id || '';
    update();
  }
  async function run(fn) {
    if (busy) return; busy = true; localMessage = ''; localError = false; update();
    try { await fn(); }
    catch(e) { localMessage = e.message || String(e); localError = true; }
    finally { busy = false; update(); }
  }
  const confirmOpen = () => getStep() === 'upload' || window.confirm(copy().replace);
  $('[data-save]').onclick = () => run(async()=>{ await api.saveLocalProject($('[data-project-name]').value); await refresh(); });
  $('[data-update]').onclick = () => run(async()=>{ const r=selected(); if(!r || !confirm(copy().overwrite)) return;
    await api.saveLocalProject($('[data-project-name]').value,{id:r.id,expectedRevision:r.revision}); await refresh(); });
  $('[data-open]').onclick = () => run(async()=>{ const r=selected(); if(!r || !confirmOpen())return; await api.openLocalProject(r.id); $('[data-project-name]').value=r.name; });
  $('[data-remove]').onclick = () => run(async()=>{ const r=selected(); if(!r || !confirm(copy().delete))return; await api.deleteLocalProject(r.id,r.revision); await refresh(); localMessage=copy().deleted; });
  $('[data-refresh]').onclick = () => run(refresh);
  $('[data-project-list]').onchange = update;
  $('[data-upload]').onclick = () => $('[data-file]').click();
  $('[data-file]').onchange = e => { const file=e.target.files?.[0]; e.target.value=''; if(file && confirmOpen()) void run(()=>api.openProjectFile(file)); };
  $('[data-download]').onclick = () => run(async()=>{
    const blob=await api.downloadProject({includeResult:$('[data-diagnostics]').checked});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=api.projectFileName($('[data-project-name]').value);
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  });
  $('[data-reattach]').onclick = () => $('[data-photo]').click();
  $('[data-photo]').onchange = e => {const file=e.target.files?.[0];e.target.value='';if(file)void run(()=>api.reattachProjectPhoto(file));};
  $('[data-clear]').onclick = () => run(async()=>{if(!confirm(copy().clearConfirm))return;await api.clearLocalProjects();await refresh();});
  $('[data-persist]').onclick = () => run(async()=>{localMessage=navigator.storage?.persist ? await navigator.storage.persist()?copy().protected:copy().notProtected : copy().unavailable;});
  panel.addEventListener('toggle',()=>{if(panel.open && !records.length)void run(refresh);});
  update(); return { update, refresh };
}
