/** Normal user controls; raw models/masks stay in the separate Debug dropdown. */
const COPY = {
  en: { title:'Automatic paving suggestion', run:'Analyze photo again', retry:'Retry automatic analysis', restore:'Restore detected area',
    includeOutside:'Include pavement outside the estimated ground plane',
    outsideHelp:'Selected areas outside the fitted ground support are projected onto the same plane. Scale and quantities there are approximate. Changes apply when you analyze or restore.',
    outsideNotice:'This suggestion includes areas outside the fitted ground support. Their scale and quantities are approximate.',
    progress:'Analysis in progress',
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
    includeOutside:'Include pavajul din afara planului estimat al solului',
    outsideHelp:'Zonele selectate din afara suportului estimat al solului sunt proiectate pe același plan. Scara și cantitățile lor sunt aproximative. Modificările se aplică la analizare sau restabilire.',
    outsideNotice:'Sugestia include zone din afara suportului estimat al solului. Scara și cantitățile lor sunt aproximative.',
    progress:'Analiză în curs',
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
    includeOutside:'Pflaster außerhalb der geschätzten Bodenebene einbeziehen',
    outsideHelp:'Ausgewählte Bereiche außerhalb der erkannten Bodenfläche werden auf dieselbe Ebene projiziert. Maßstab und Mengen sind dort Näherungswerte. Änderungen gelten beim Analysieren oder Wiederherstellen.',
    outsideNotice:'Dieser Vorschlag enthält Bereiche außerhalb der erkannten Bodenfläche. Maßstab und Mengen sind dort Näherungswerte.',
    progress:'Analyse läuft',
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
  es: {
    includeOutside:'Incluir pavimento fuera del plano del suelo estimado',
    outsideHelp:'Las zonas seleccionadas fuera del soporte del suelo estimado se proyectan sobre el mismo plano. Su escala y cantidades son aproximadas. Los cambios se aplican al analizar o restaurar.',
    outsideNotice:'Esta sugerencia incluye zonas fuera del soporte del suelo estimado. Su escala y cantidades son aproximadas.',
    title: 'Sugerencia automática de pavimento',
    progress: 'Análisis en curso',
    cornerNotice:n=>`Algunos contornos necesitan más de ${n} esquinas para conservar su forma y sus huecos. Se conservaron las esquinas adicionales.`,
    run: 'Analizar la foto de nuevo',
    retry: 'Reintentar análisis automático',
    restore: 'Restaurar superficie detectada',
    manual: 'Usar el cuadrado de referencia de 1 m',
    change: 'Elegir otra foto',
    cancel: 'Detener análisis · continuar manualmente',
    replace: '¿Reemplazar el pavimento actual, incluidos sus huecos intencionados, por una nueva sugerencia detectada? Deshacer restaurará el diseño actual.',
    target: 'Suelo que se propondrá para pavimentar',
    grass: 'Césped',
    dirt: 'Tierra / grava',
    pavement: 'Pavimento existente',
    help: 'La detección es una sugerencia. Use Añadir superficie o Quitar superficie para corregirla o crear huecos intencionados. Los cambios de objetivo solo se aplican al analizar o restaurar.',
    phases: {
      idle: 'El análisis automático está listo.',
      preparing: 'Preparando la fotografía…',
      connecting: 'Conectando con el servicio de análisis…',
      uploading: 'Enviando la foto de trabajo…',
      queued: 'En cola para el análisis…',
      segmentation: 'Detectando materiales del suelo…',
      camera: 'Estimando plano del suelo, cámara y escala…',
      applying: 'Creando pavimento editable…',
      partial_kept: 'La cámara se estimó, pero la detección de superficies falló. Se conservaron el pavimento y los huecos existentes. Siga editando o reintente.',
      ready: 'Sugerencia lista. Ya puede editar el pavimento.',
      camera_only: 'Cámara lista, pero la detección de superficies falló. Dibuje la superficie de pavimento manualmente.',
      manual_required: 'La estimación de la cámara falló. Ajuste el cuadrado de referencia de 1 m para continuar.',
      review: 'Su diseño cambió durante el análisis y no se ha reemplazado. Use Restaurar superficie detectada para aplicar la nueva sugerencia de forma explícita.',
      error: 'No se pudo completar el análisis automático. Reintente o continúe manualmente.',
      cancelled: 'Análisis automático detenido. La edición manual sigue disponible.',
    },
    privacy: 'El análisis automático envía una copia redimensionada de esta foto al servicio de análisis configurado. La calibración manual no requiere los modelos.',
    first: 'La primera ejecución puede descargar los pesos del modelo. El progreso se muestra por etapas, no como porcentaje estimado.',
    empty: 'No se detectó pavimento utilizable. Añada una superficie manualmente o incluya el pavimento existente y restaure la superficie detectada.',
  },
  fr: {
    includeOutside:'Inclure le pavage hors du plan du sol estimé',
    outsideHelp:'Les zones sélectionnées hors du support du sol estimé sont projetées sur le même plan. Leur échelle et leurs quantités sont approximatives. Les changements prennent effet lors de l’analyse ou de la restauration.',
    outsideNotice:'Cette suggestion comprend des zones hors du support du sol estimé. Leur échelle et leurs quantités sont approximatives.',
    title: 'Suggestion de pavage automatique',
    progress: 'Analyse en cours',
    cornerNotice:n=>`Certains contours nécessitent plus de ${n} sommets pour préserver leur forme et leurs trous. Les sommets supplémentaires ont été conservés.`,
    run: 'Analyser à nouveau la photo',
    retry: 'Relancer l\'analyse automatique',
    restore: 'Restaurer la surface détectée',
    manual: 'Utiliser le carré de référence de 1 m',
    change: 'Choisir une autre photo',
    cancel: 'Arrêter l\'analyse · continuer manuellement',
    replace: 'Remplacer le pavage actuel, y compris ses trous volontaires, par une nouvelle suggestion détectée ? Annuler restaurera le projet actuel.',
    target: 'Sol à proposer pour le pavage',
    grass: 'Gazon',
    dirt: 'Terre / gravier',
    pavement: 'Pavage existant',
    help: 'La détection est une suggestion. Utilisez Ajouter une surface ou Retirer une surface pour la corriger ou créer des trous volontaires. Les changements de cible ne s\'appliquent qu\'à l\'analyse ou à la restauration.',
    phases: {
      idle: 'L\'analyse automatique est prête.',
      preparing: 'Préparation de la photo…',
      connecting: 'Connexion au service d\'analyse…',
      uploading: 'Envoi de la photo de travail…',
      queued: 'En file d\'attente pour l\'analyse…',
      segmentation: 'Détection des matériaux du sol…',
      camera: 'Estimation du plan du sol, de la caméra et de l\'échelle…',
      applying: 'Création du pavage modifiable…',
      partial_kept: 'La caméra a été estimée, mais la détection des surfaces a échoué. Le pavage et les trous existants ont été conservés. Poursuivez la modification ou réessayez.',
      ready: 'Suggestion prête. Vous pouvez maintenant modifier le pavage.',
      camera_only: 'Caméra prête, mais la détection des surfaces a échoué. Dessinez la surface à paver manuellement.',
      manual_required: 'L\'estimation de la caméra a échoué. Ajustez le carré de référence de 1 m pour continuer.',
      review: 'Votre projet a changé pendant l\'analyse et n\'a pas été remplacé. Utilisez Restaurer la surface détectée pour appliquer explicitement la nouvelle suggestion.',
      error: 'L\'analyse automatique n\'a pas pu aboutir. Réessayez ou continuez manuellement.',
      cancelled: 'Analyse automatique arrêtée. La modification manuelle reste disponible.',
    },
    privacy: 'L\'analyse automatique envoie une copie redimensionnée de cette photo au service d\'analyse configuré. Le calibrage manuel ne nécessite pas les modèles.',
    first: 'La première exécution peut télécharger les poids des modèles. La progression est affichée par étape, pas en pourcentage estimé.',
    empty: 'Aucun pavage exploitable n\'a été détecté. Ajoutez une surface manuellement, ou incluez le pavage existant et restaurez la surface détectée.',
  },
  it: {
    includeOutside:'Includi la pavimentazione fuori dal piano del terreno stimato',
    outsideHelp:'Le aree selezionate fuori dal supporto del terreno stimato vengono proiettate sullo stesso piano. Scala e quantità sono approssimative. Le modifiche si applicano durante l’analisi o il ripristino.',
    outsideNotice:'Questo suggerimento include aree fuori dal supporto del terreno stimato. Scala e quantità sono approssimative.',
    title: 'Suggerimento automatico di pavimentazione',
    progress: 'Analisi in corso',
    cornerNotice:n=>`Alcuni contorni richiedono più di ${n} angoli per mantenere forma e fori. Gli angoli aggiuntivi sono stati conservati.`,
    run: 'Analizza di nuovo la foto',
    retry: 'Riprova l\'analisi automatica',
    restore: 'Ripristina superficie rilevata',
    manual: 'Usa il quadrato di riferimento di 1 m',
    change: 'Scegli un\'altra foto',
    cancel: 'Interrompi analisi · continua manualmente',
    replace: 'Sostituire la pavimentazione attuale, compresi i fori intenzionali, con un nuovo suggerimento rilevato? Annulla ripristinerà il progetto attuale.',
    target: 'Terreno da proporre per la pavimentazione',
    grass: 'Prato',
    dirt: 'Terra / ghiaia',
    pavement: 'Pavimentazione esistente',
    help: 'Il rilevamento è un suggerimento. Usi Aggiungi superficie o Rimuovi superficie per correggerlo o creare fori intenzionali. Le modifiche agli obiettivi si applicano solo ad analisi o ripristino.',
    phases: {
      idle: 'L\'analisi automatica è pronta.',
      preparing: 'Preparazione della fotografia…',
      connecting: 'Connessione al servizio di analisi…',
      uploading: 'Invio della foto di lavoro…',
      queued: 'In coda per l\'analisi…',
      segmentation: 'Rilevamento dei materiali del terreno…',
      camera: 'Stima di piano del terreno, fotocamera e scala…',
      applying: 'Creazione della pavimentazione modificabile…',
      partial_kept: 'La fotocamera è stata stimata, ma il rilevamento delle superfici non è riuscito. Pavimentazione e fori esistenti sono stati mantenuti. Continui a modificare o riprovi.',
      ready: 'Suggerimento pronto. Ora può modificare la pavimentazione.',
      camera_only: 'Fotocamera pronta, ma il rilevamento delle superfici non è riuscito. Disegni manualmente la superficie da pavimentare.',
      manual_required: 'La stima della fotocamera non è riuscita. Allinei il quadrato di riferimento di 1 m per continuare.',
      review: 'Il progetto è cambiato durante l\'analisi e non è stato sostituito. Usi Ripristina superficie rilevata per applicare esplicitamente il nuovo suggerimento.',
      error: 'Impossibile completare l\'analisi automatica. Riprovi o continui manualmente.',
      cancelled: 'Analisi automatica interrotta. La modifica manuale resta disponibile.',
    },
    privacy: 'L\'analisi automatica invia una copia ridimensionata di questa foto al servizio di analisi configurato. La calibrazione manuale non richiede i modelli.',
    first: 'La prima esecuzione può scaricare i pesi dei modelli. L\'avanzamento è mostrato per fasi, non come percentuale stimata.',
    empty: 'Nessuna pavimentazione utilizzabile rilevata. Aggiunga una superficie manualmente o includa la pavimentazione esistente e ripristini la superficie rilevata.',
  },
};
const WAIT_COPY = {
  en: ['Analyzing the photo. Waiting for the models to finish…', 'The first analysis may take longer while the models load. You can stop and continue manually.'],
  ro: ['Se analizează fotografia. Se așteaptă finalizarea modelelor…', 'Prima analiză poate dura mai mult până se încarcă modelele. Poți opri analiza și continua manual.'],
  de: ['Foto wird analysiert. Die Modelle werden ausgeführt…', 'Die erste Analyse kann beim Laden der Modelle länger dauern. Sie können stoppen und manuell fortfahren.'],
  es: ['Analizando la foto. Esperando a que terminen los modelos…', 'El primer análisis puede tardar más mientras se cargan los modelos. Puede detenerlo y continuar manualmente.'],
  fr: ['Analyse de la photo. En attente de la fin des modèles…', 'La première analyse peut être plus longue pendant le chargement des modèles. Vous pouvez arrêter et continuer manuellement.'],
  it: ['Analisi della foto. In attesa del completamento dei modelli…', 'La prima analisi può richiedere più tempo durante il caricamento dei modelli. Puoi interrompere e continuare manualmente.'],
};
function analysisCopy(locale) {
  const language = locale.split('-')[0], copy = COPY[language] || COPY.en;
  const [analyzing, first] = WAIT_COPY[language] || WAIT_COPY.en;
  return {...copy, first, phases: {...copy.phases, analyzing}};
}
export function mountAnalysisPanel({api, getLocale, getStep, initialTargets = ['pavement'], initialIncludeOutsideGroundSupport = true}) {
  const panel = document.createElement('details'); panel.id = 'photoAnalysisPanel'; panel.className = 'accordion-section photo-analysis-panel';
  panel.innerHTML = `<summary class="accordion-toggle"></summary><div class="accordion-panel"><p data-analysis-status role="status" aria-live="polite"></p><p class="note" data-analysis-corner-notice role="status" hidden></p><progress hidden aria-label="Analysis running"></progress>
    <p data-analysis-error role="alert" hidden></p><fieldset><legend></legend>${['grass','dirt','pavement'].map(k=>`<label><input type="checkbox" value="${k}" ${initialTargets.includes(k)?'checked':''}><span data-target="${k}"></span></label>`).join('')}</fieldset>
    <label class="analysis-outside"><input type="checkbox" data-analysis-outside ${initialIncludeOutsideGroundSupport?'checked':''} aria-describedby="analysisOutsideHelp"><span data-analysis-outside-label></span></label>
    <p class="note" id="analysisOutsideHelp" data-analysis-outside-help></p><p class="note" data-analysis-outside-notice role="status" hidden></p>
    <div class="analysis-actions"><button type="button" data-analyze class="area-secondary"></button><button type="button" data-restore class="area-secondary"></button>
    <button type="button" data-manual class="area-secondary"></button><button type="button" data-stop class="area-secondary"></button>
    <button type="button" data-change-photo class="area-secondary"></button></div><p class="note" data-analysis-help></p><p class="note" data-analysis-privacy></p></div>`;
  const style=document.createElement('style'); style.textContent=`
    .photo-analysis-panel,.photo-analysis-panel .accordion-panel{min-width:0}.photo-analysis-panel p{font-size:12px;line-height:1.5}
    .photo-analysis-panel progress{width:100%;height:8px;margin-bottom:8px}.photo-analysis-panel fieldset{border:0;padding:0;margin:10px 0;display:flex;flex-wrap:wrap;gap:8px 12px}
    .photo-analysis-panel legend{font-size:12px;margin-bottom:7px}.photo-analysis-panel fieldset label{display:flex;align-items:center;gap:5px;font-size:12px;white-space:normal}
    .photo-analysis-panel .analysis-outside{display:flex;align-items:flex-start;gap:7px;font-size:12px;line-height:1.5}.analysis-outside input{flex-shrink:0;margin-top:2px}
    .photo-analysis-panel input[type=checkbox]{width:16px;height:16px;accent-color:#0878c9}.analysis-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .analysis-actions button{font:inherit;font-size:12px;padding:9px;min-height:40px;cursor:pointer}.analysis-actions button:disabled{opacity:.5;cursor:default}
    .analysis-actions [data-stop],.analysis-actions [data-change-photo]{grid-column:1/-1}.photo-analysis-panel [data-analysis-error]{color:#a13f20;overflow-wrap:anywhere}
    .photo-flow-card .photo-analysis-panel{border-top:1px solid #bdcbd3;padding:14px 0 0;margin-top:14px}.photo-analysis-panel [hidden]{display:none!important}
    .photo-flow-card .photo-analysis-panel summary{cursor:pointer;font-size:15px;font-weight:700;margin-bottom:8px}
    .photo-flow-card{max-height:calc(100dvh - 90px);overflow:auto}.photo-flow.is-upload .photo-analysis-panel{display:none}
    @media(max-width:760px){.photo-flow-card .photo-analysis-panel fieldset{gap:5px}.photo-flow:not(.is-upload) .photo-flow-card{max-height:58dvh}}
  `; document.head.append(style);
  const $ = sel => panel.querySelector(sel), c = () => analysisCopy(getLocale());
  let localError = '', errorPhotoId = null;
  function targets() { return Array.from(panel.querySelectorAll('fieldset input:checked')).map(el=>el.value); }
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
    $('[data-analysis-outside]').disabled=s.busy;
    $('[data-analysis-outside-label]').textContent=copy.includeOutside;
    $('[data-analysis-outside-help]').textContent=copy.outsideHelp;
    $('[data-analysis-outside-help]').hidden=!$('[data-analysis-outside]').checked;
    $('[data-analysis-outside-notice]').textContent=copy.outsideNotice;
    $('[data-analysis-outside-notice]').hidden=s.busy||!diagnostics?.extrapolatedPixels;
    $('progress').hidden=!s.busy; $('progress').setAttribute('aria-label',copy.progress);
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
      await api[name]({replaceExisting,targets:targets(),includeOutsideGroundSupport:$('[data-analysis-outside]').checked});
    } catch(e) {localError=e.message||String(e);}
    update();
  }
  $('[data-analyze]').addEventListener('click',()=>action('runPhotoAnalysis'));
  $('[data-analysis-outside]').addEventListener('change',update);
  $('[data-restore]').addEventListener('click',()=>action('restoreDetectedArea'));
  for(const selector of ['[data-manual]','[data-stop]']) $(selector).addEventListener('click',()=>{
    localError='';try {api.beginManualCalibration();}catch(e){localError=e.message;}update();
  });
  $('[data-change-photo]').addEventListener('click',()=>document.getElementById('sitePhotoInput').click());
  update(); return {update};
}
export function analysisFlowText(locale) {
  const c = analysisCopy(locale);
  return { title: c.title, help: c.first, privacy: c.privacy };
}
