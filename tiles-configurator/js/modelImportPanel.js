import { unwrapDebugReport } from './segmentationDebugData.js';
/** Local JSON import utility for step 2. No inference or upload requests. */
const COPY = {
  en: {title:'Debug · Model result import', help:'Load the same uncropped photo used by the segmentation prototype, then select its JSON export with “Include RLE masks” enabled, a response bundle, or both raw response files. Dimensions alone cannot verify that two photos are identical.',
    choose:'Import result JSON', waiting:'Reading and validating result…', empty:'No model result imported. Upload a photo for automatic analysis, or import a saved result here.',
    replace:'Replace the current pavement, including its holes, with this imported suggestion? Undo will restore it.',
    estimated:'Estimated scale — not physically verified', summary:'Imported suggestion', regions:'regions', holes:'holes', details:'Import diagnostics', local:'JSON import reads files locally and does not rerun the models.'},
  ro: {title:'Debug · Import rezultat model', help:'Încarcă aceeași fotografie nedecupată folosită în prototip, apoi exportul JSON cu măștile RLE incluse, un pachet de răspunsuri sau cele două fișiere de răspuns. Dimensiunile nu pot confirma că fotografiile sunt identice.',
    choose:'Importă rezultatul JSON', waiting:'Se citește și se validează rezultatul…', empty:'Nu există un rezultat importat. Încarcă o fotografie pentru analiză automată sau importă aici un rezultat salvat.',
    replace:'Înlocuiești pavajul actual, inclusiv golurile, cu sugestia importată? Anulare va restabili starea anterioară.',
    estimated:'Scară estimată — neverificată fizic', summary:'Sugestia importată', regions:'zone', holes:'goluri', details:'Diagnostic import', local:'Importul JSON citește fișierele local fără a rula din nou modelele.'},
  de: {title:'Debug · Modellergebnis importieren', help:'Dasselbe unbeschnittene Foto wie im Prototyp laden, dann den JSON-Export einschließlich RLE-Masken, ein Antwortpaket oder beide Antwortdateien auswählen. Bildmaße allein bestätigen nicht, dass die Fotos identisch sind.',
    choose:'JSON-Ergebnis importieren', waiting:'Ergebnis wird gelesen und geprüft…', empty:'Kein Modellergebnis importiert. Ein Foto automatisch analysieren oder hier ein gespeichertes Ergebnis importieren.',
    replace:'Die aktuelle Pflasterfläche einschließlich Löchern durch diesen Vorschlag ersetzen? Rückgängig stellt den vorherigen Zustand wieder her.',
    estimated:'Geschätzter Maßstab — nicht physisch geprüft', summary:'Importierter Vorschlag', regions:'Bereiche', holes:'Löcher', details:'Importdiagnose', local:'Der JSON-Import liest Dateien lokal, ohne Modelle erneut zu starten.'},
};
export function mountModelImportPanel({api,getLocale,getStep,container=null}) {
  const details=document.createElement('details'); details.id='modelImportDebug'; details.className='accordion-section model-import-debug';
  details.innerHTML=`<summary class="accordion-toggle"></summary><div class="accordion-panel">
    <p class="note" data-import-help></p><button type="button" class="export" data-import-choose></button>
    <input type="file" accept=".json,application/json" multiple hidden><p class="note" data-import-local></p>
    <p class="note" data-import-status role="status" aria-live="polite"></p><p data-import-error role="alert" hidden></p>
    <details data-import-diagnostics hidden><summary></summary><pre></pre></details></div>`;
  const style=document.createElement('style'); style.textContent=`
    .model-import-debug{overflow:hidden}.model-import-debug button{width:100%;min-height:40px}
    .model-import-debug pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto;font-size:11px}
    .model-import-debug [data-import-error]{color:#a13f20;overflow-wrap:anywhere;font-size:12px}
    .model-import-debug.is-setup{position:absolute;right:24px;top:24px;width:min(300px,calc(100% - 48px));z-index:35;border-radius:10px;background:#fff;border:1px solid #bdcbd3;box-shadow:0 4px 16px #0002;max-height:60%;overflow:auto}
    .model-import-debug.is-setup .accordion-toggle{padding:12px}.model-import-debug.is-setup .accordion-panel{padding:12px}
    body.dark .model-import-debug.is-setup{background:#253139;color:#e4ebef;border-color:#52626c}
    .model-import-debug[hidden]{display:none!important}
    @media(max-width:760px){.model-import-debug.is-setup{top:10px;right:12px;width:270px;max-height:35%}}
  `; document.head.append(style);
  const $=selector=>details.querySelector(selector), input=$('input'), button=$('button');
  let reading=false, serial=0;
  const copy=()=>COPY[getLocale().split('-')[0]]||COPY.en;
  function update() {
    const c=copy(), step=getStep(), photo=api.getPhotoSource(), result=api.getModelImportSummary(), setup=step!=='done';
    const parent=container || (setup?document.getElementById('viewer'):document.querySelector('.sidebar'));
    if(parent && details.parentElement!==parent) parent.append(details);
    details.classList.toggle('is-setup',setup && !container); details.hidden=!photo || step==='upload';
    $('summary').textContent=container ? c.choose : c.title; $('[data-import-help]').textContent=c.help;
    button.textContent=c.choose; button.disabled=!photo||reading;
    $('[data-import-local]').textContent=c.local;
    $('[data-import-status]').textContent=reading?c.waiting:result?
      `${c.summary}: ${result.diagnostics.regions} ${c.regions}, ${result.diagnostics.holes} ${c.holes}. ${c.estimated}.`:c.empty;
    $('[data-import-diagnostics]').hidden=!result;
    $('[data-import-diagnostics] summary').textContent=c.details;
    $('pre').textContent=result?JSON.stringify(result,null,2):'';
  }
  button.addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const files=Array.from(input.files||[]), token=api.getPhotoSource(), request=++serial;
    input.value=''; if(!files.length||!token) return;
    const error=$('[data-import-error]'); error.hidden=true; reading=true; update();
    try {
      if(files.length>2||files.some(f=>f.size>32*1024*1024)) throw new Error('Choose one result JSON, or two response JSON files, each at most 32 MB.');
      const parsed=await Promise.all(files.map(async f=>unwrapDebugReport(JSON.parse(await f.text()))));
      if(request!==serial) return;
      const payload=parsed.length===1?parsed[0]:{segmentation:parsed.find(p=>p.labels),geometry:parsed.find(p=>p.camera?.intrinsics_px)};
      const now=api.getPhotoSource();
      if(now?.photoId!==token.photoId||now?.designRevision!==token.designRevision) throw new Error('The photo or design changed while reading the files. Select the result again.');
      if(token.drawing||token.draftVertices) throw new Error('Finish or cancel the current outline before importing a result.');
      const replacing=api.getPavingState().areaRegions.length>0;
      if(replacing&&!window.confirm(copy().replace)) return;
      // Choosing a local export explicitly associates its old image_id with this photo.
      api.cancelPhotoAnalysis?.();
      api.importModelResult(payload,{photoId:token.photoId,designRevision:token.designRevision,
        associateWithCurrentPhoto:true,replaceExisting:replacing});
    } catch(e) {error.textContent=e.message||String(e);error.hidden=false;}
    finally {if(request===serial){reading=false;update();}}
  });
  update(); return {update,element:details};
}
