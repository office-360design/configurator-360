/** Normal user controls; raw models/masks stay in the separate Debug dropdown. */
const COPY = {
  en: { title:'Automatic paving suggestion', run:'Analyze photo again', retry:'Retry automatic analysis', restore:'Restore detected area',
    cornerNotice:n=>`Some boundaries need more than ${n} corners to preserve their shape and holes. Extra corners were kept.`,
    manual:'Use the 1 m reference square', change:'Choose another photo', cancel:'Stop analysis · continue manually',
    replace:'Replace the current pavement, including its intentional holes, with a new detected suggestion? Undo will restore the current design.',
    target:'Ground to suggest for paving', grass:'Grass', dirt:'Dirt / gravel', pavement:'Existing pavement',
    help:'The detection is a suggestion. Use Add area or Remove area to correct it or make intentional holes. Target changes apply only when you analyze or restore.',
    phases:{idle:'Automatic analysis is ready.',preparing:'Preparing the photograph…',connecting:'Connecting to the analysis service…',uploading:'Sending the working photo…',
      queued:'Queued for analysis…',segmentation:'Detecting ground materials…',camera:'Estimating ground plane, camera and scale…',applying:'Building editable pavement…',
      partial_kept:'Camera estimation succeeded, but surface detection failed. Your existing pavement and holes were kept. Continue editing or retry.',
      ready:'Suggestion ready. You can now edit the pavement.',camera_only:'Camera ready, but surface detection failed. Draw the paving area manually.',
      manual_required:'Camera estimation failed. Match the 1 m reference square to continue.',review:'Your design changed during analysis. It was not replaced. Use Restore detected area to apply the new suggestion explicitly.',
      error:'Automatic analysis could not be completed. Retry or continue manually.',cancelled:'Automatic analysis stopped. Manual editing remains available.'},
    privacy:'Automatic analysis sends a resized copy of this photo to the configured analysis service. Manual calibration does not require the models.',
    first:'The first run may download model weights. Progress is shown by stage, not an estimated percentage.', empty:'No usable paving was detected. Add an area manually, or include existing pavement and restore the detected area.' },
  ro: { title:'Sugestie automată de pavaj',run:'Analizează din nou fotografia',retry:'Reîncearcă analiza automată',restore:'Restabilește zona detectată',
    cornerNotice:n=>`Unele contururi necesită mai mult de ${n} colțuri pentru a păstra forma și golurile. Colțurile suplimentare au fost păstrate.`,
    manual:'Folosește pătratul de referință de 1 m',change:'Alege altă fotografie',cancel:'Oprește analiza · continuă manual',
    replace:'Înlocuiești pavajul actual, inclusiv golurile create manual, cu o nouă sugestie? Anulare va restabili proiectul actual.',
    target:'Suprafețe propuse pentru pavare',grass:'Iarbă',dirt:'Pământ / pietriș',pavement:'Pavaj existent',
    help:'Detecția este o sugestie. Adaugă sau elimină zone pentru corecții ori goluri intenționate. Categoriile se aplică doar la analizare sau restabilire.',
    phases:{idle:'Analiza automată este pregătită.',preparing:'Se pregătește fotografia…',connecting:'Se conectează la serviciul de analiză…',uploading:'Se trimite fotografia de lucru…',
      queued:'În așteptarea analizei…',segmentation:'Se detectează materialele solului…',camera:'Se estimează planul solului, camera și scara…',applying:'Se construiește pavajul editabil…',
      partial_kept:'Camera a fost estimată, dar detecția suprafeței a eșuat. Pavajul și golurile existente au fost păstrate. Continuă editarea sau reîncearcă.',
      ready:'Sugestia este pregătită. Pavajul poate fi editat.',camera_only:'Camera este pregătită, dar detecția suprafețelor a eșuat. Desenează manual pavajul.',
      manual_required:'Estimarea camerei a eșuat. Potrivește pătratul de 1 m pentru a continua.',review:'Proiectul s-a schimbat în timpul analizei și nu a fost înlocuit. Restabilește explicit zona detectată pentru a aplica sugestia.',
      error:'Analiza automată nu a putut fi finalizată. Reîncearcă sau continuă manual.',cancelled:'Analiza automată a fost oprită. Editarea manuală rămâne disponibilă.'},
    privacy:'Analiza automată trimite o copie redimensionată a fotografiei către serviciul de analiză configurat. Calibrarea manuală nu necesită modelele.',
    first:'Prima rulare poate descărca modelele. Progresul este afișat pe etape, nu ca procent estimat.',empty:'Nu s-a detectat o zonă utilizabilă. Adaugă manual o zonă sau include pavajul existent și restabilește detecția.' },
  de: { title:'Automatischer Pflastervorschlag',run:'Foto erneut analysieren',retry:'Automatische Analyse wiederholen',restore:'Erkannten Bereich wiederherstellen',
    cornerNotice:n=>`Einige Konturen benötigen mehr als ${n} Ecken, um ihre Form und Aussparungen zu erhalten. Zusätzliche Ecken wurden beibehalten.`,
    manual:'1-m-Referenzquadrat verwenden',change:'Anderes Foto auswählen',cancel:'Analyse stoppen · manuell fortfahren',
    replace:'Die aktuelle Pflasterfläche einschließlich absichtlich angelegter Löcher durch einen neuen Vorschlag ersetzen? Rückgängig stellt den aktuellen Entwurf wieder her.',
    target:'Vorgeschlagene Bodenflächen',grass:'Rasen',dirt:'Erde / Kies',pavement:'Vorhandenes Pflaster',
    help:'Die Erkennung ist ein Vorschlag. Bereiche hinzufügen oder entfernen, um den Entwurf zu korrigieren oder Löcher anzulegen. Materialauswahl gilt erst beim Analysieren oder Wiederherstellen.',
    phases:{idle:'Automatische Analyse ist bereit.',preparing:'Foto wird vorbereitet…',connecting:'Verbindung zum Analysedienst…',uploading:'Arbeitsfoto wird gesendet…',
      queued:'Analyse in der Warteschlange…',segmentation:'Bodenmaterialien werden erkannt…',camera:'Bodenebene, Kamera und Maßstab werden geschätzt…',applying:'Bearbeitbares Pflaster wird erstellt…',
      partial_kept:'Kameraschätzung erfolgreich, Flächenerkennung fehlgeschlagen. Die bestehende Pflasterfläche und ihre Löcher wurden beibehalten. Weiter bearbeiten oder erneut versuchen.',
      ready:'Vorschlag bereit. Die Pflasterfläche kann bearbeitet werden.',camera_only:'Kamera bereit, aber Flächenerkennung fehlgeschlagen. Pflasterfläche manuell zeichnen.',
      manual_required:'Kameraschätzung fehlgeschlagen. Zum Fortfahren das 1-m-Quadrat ausrichten.',review:'Der Entwurf wurde während der Analyse geändert und nicht ersetzt. Den erkannten Bereich ausdrücklich wiederherstellen, um ihn anzuwenden.',
      error:'Automatische Analyse nicht abgeschlossen. Wiederholen oder manuell fortfahren.',cancelled:'Automatische Analyse gestoppt. Manuelle Bearbeitung bleibt verfügbar.'},
    privacy:'Die automatische Analyse sendet eine verkleinerte Kopie an den konfigurierten Analysedienst. Manuelle Kalibrierung benötigt keine Modelle.',
    first:'Beim ersten Lauf werden gegebenenfalls Modelle heruntergeladen. Fortschritt wird als Phase und nicht als geschätzter Prozentsatz angezeigt.',empty:'Keine nutzbare Fläche erkannt. Manuell hinzufügen oder vorhandenes Pflaster auswählen und den erkannten Bereich wiederherstellen.' },
};
export function mountAnalysisPanel({api, getLocale, getStep, initialTargets = ['pavement']}) {
  const panel = document.createElement('details'); panel.id = 'photoAnalysisPanel'; panel.className = 'accordion-section photo-analysis-panel';
  panel.innerHTML = `<summary class="accordion-toggle"></summary><div class="accordion-panel"><p data-analysis-status role="status" aria-live="polite"></p><p class="note" data-analysis-corner-notice role="status" hidden></p><progress hidden aria-label="Analysis running"></progress>
    <p data-analysis-error role="alert" hidden></p><fieldset><legend></legend>${['grass','dirt','pavement'].map(k=>`<label><input type="checkbox" value="${k}" ${initialTargets.includes(k)?'checked':''}><span data-target="${k}"></span></label>`).join('')}</fieldset>
    <div class="analysis-actions"><button type="button" data-analyze class="area-secondary"></button><button type="button" data-restore class="area-secondary"></button>
    <button type="button" data-manual class="area-secondary"></button><button type="button" data-stop class="area-secondary"></button>
    <button type="button" data-change-photo class="area-secondary"></button></div><p class="note" data-analysis-help></p><p class="note" data-analysis-privacy></p></div>`;
  const style=document.createElement('style'); style.textContent=`
    .photo-analysis-panel,.photo-analysis-panel .accordion-panel{min-width:0}.photo-analysis-panel p{font-size:12px;line-height:1.5}
    .photo-analysis-panel progress{width:100%;height:8px;margin-bottom:8px}.photo-analysis-panel fieldset{border:0;padding:0;margin:10px 0;display:flex;flex-wrap:wrap;gap:8px 12px}
    .photo-analysis-panel legend{font-size:12px;margin-bottom:7px}.photo-analysis-panel fieldset label{display:flex;align-items:center;gap:5px;font-size:12px;white-space:normal}
    .photo-analysis-panel input[type=checkbox]{width:16px;height:16px;accent-color:#0878c9}.analysis-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .analysis-actions button{font:inherit;font-size:12px;padding:9px;min-height:40px;cursor:pointer}.analysis-actions button:disabled{opacity:.5;cursor:default}
    .analysis-actions [data-stop],.analysis-actions [data-change-photo]{grid-column:1/-1}.photo-analysis-panel [data-analysis-error]{color:#a13f20;overflow-wrap:anywhere}
    .photo-flow-card .photo-analysis-panel{border-top:1px solid #bdcbd3;padding:14px 0 0;margin-top:14px}.photo-analysis-panel [hidden]{display:none!important}
    .photo-flow-card .photo-analysis-panel summary{cursor:pointer;font-size:15px;font-weight:700;margin-bottom:8px}
    .photo-flow-card{max-height:calc(100dvh - 90px);overflow:auto}.photo-flow.is-upload .photo-analysis-panel{display:none}
    @media(max-width:760px){.photo-flow-card .photo-analysis-panel fieldset{gap:5px}.photo-flow:not(.is-upload) .photo-flow-card{max-height:58dvh}}
  `; document.head.append(style);
  const $ = sel => panel.querySelector(sel), c = () => COPY[getLocale().split('-')[0]] || COPY.en;
  let localError = '', errorPhotoId = null;
  function targets() { return Array.from(panel.querySelectorAll('input:checked')).map(el=>el.value); }
  function update() {
    const copy=c(), step=getStep(), photo=api.getPhotoSource(), s=api.getAnalysisStatus();
    if (errorPhotoId !== photo?.photoId) { localError=''; errorPhotoId=photo?.photoId; }
    const body=document.querySelector('.sidebar .shared-configurator-panel__body')||document.querySelector('.sidebar');
    const parent=step==='done'?body:document.querySelector('.photo-flow-card');
    if (parent && panel.parentElement !== parent) {
      if (step === 'done') parent.insertBefore(panel, parent.querySelector(':scope > .accordion-section')?.nextSibling || null);
      else parent.append(panel);
      panel.open=step!=='done';
    }
    panel.hidden=!photo || step==='upload';
    $('summary').textContent=copy.title;
    $('[data-analysis-status]').textContent=copy.phases[s.phase]||copy.phases.idle;
    if(s.phase==='ready' && s.summary?.diagnostics?.regions===0) $('[data-analysis-status]').textContent=copy.empty;
    const diagnostics = (api.getModelImportSummary?.() || (s.phase === 'ready' ? s.summary : null))?.diagnostics;
    $('[data-analysis-corner-notice]').hidden = s.busy || !diagnostics?.boundariesOverCornerTarget;
    $('[data-analysis-corner-notice]').textContent = diagnostics?.boundariesOverCornerTarget ? copy.cornerNotice(diagnostics.maxCornersPerBoundary) : '';
    $('progress').hidden=!s.busy;
    $('fieldset').disabled=s.busy;
    $('legend').textContent=copy.target;
    for(const key of ['grass','dirt','pavement']) $(`[data-target="${key}"]`).textContent=copy[key];
    $('[data-analyze]').textContent=['error','manual_required'].includes(s.phase)?copy.retry:copy.run;
    $('[data-analyze]').hidden=s.busy; $('[data-analyze]').disabled=!!photo?.drawing;
    $('[data-restore]').textContent=copy.restore; $('[data-restore]').hidden=s.busy||!s.canRestore;
    $('[data-restore]').disabled=!!photo?.drawing;
    $('[data-manual]').textContent=copy.manual; $('[data-manual]').hidden=s.busy||step==='calibrate';
    $('[data-manual]').disabled=!!photo?.draftVertices;
    $('[data-stop]').textContent=copy.cancel; $('[data-stop]').hidden=!s.busy;
    $('[data-change-photo]').textContent=copy.change; $('[data-change-photo]').hidden=step==='calibrate'||step==='draw';
    $('[data-analysis-help]').textContent=s.busy?copy.first:copy.help;
    $('[data-analysis-privacy]').textContent=copy.privacy;
    const error=localError||s.error;
    $('[data-analysis-error]').textContent=error||''; $('[data-analysis-error]').hidden=!error;
  }
  async function action(name) {
    localError='';
    try {
      const replaceExisting=api.getPavingState().areaRegions.length>0;
      if(replaceExisting&&!window.confirm(c().replace)) return;
      await api[name]({replaceExisting,targets:targets()});
    } catch(e) {localError=e.message||String(e);}
    update();
  }
  $('[data-analyze]').addEventListener('click',()=>action('runPhotoAnalysis'));
  $('[data-restore]').addEventListener('click',()=>action('restoreDetectedArea'));
  for(const selector of ['[data-manual]','[data-stop]']) $(selector).addEventListener('click',()=>{
    localError='';try {api.beginManualCalibration();}catch(e){localError=e.message;}update();
  });
  $('[data-change-photo]').addEventListener('click',()=>document.getElementById('sitePhotoInput').click());
  update(); return {update};
}
export function analysisFlowText(locale) {
  const c = COPY[locale.split('-')[0]] || COPY.en;
  return { title: c.title, help: c.first, privacy: c.privacy };
}
