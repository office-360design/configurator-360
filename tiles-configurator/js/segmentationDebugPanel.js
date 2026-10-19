import { mountModelImportPanel } from './modelImportPanel.js';
import { DEBUG_CLASSES, DEBUG_MASKS, inspectDebugSource, debugMetadata, designStatistics,
  buildDebugReport, publicServiceAddress } from './segmentationDebugData.js?v=tiles-ground-support-1';
import { debugCopy } from './segmentationDebugCopy.js';
import { createDebugOverlay } from './debugOverlay.js';

/** One collapsed-by-default diagnostics dropdown. Raw data is decoded lazily and
 * cached by photo/result identity. update() never sends a request or changes state.
 */
export function mountSegmentationDebugPanel({ api, getLocale, getStep }) {
  const host = document.getElementById('canvasHost');
  const details = document.createElement('details'); details.id = 'segmentationDebug';
  details.className = 'accordion-section segmentation-debug';
  const heading = (key, open = false) => `<details class="debug-section" data-section="${key}" ${open?'open':''}><summary data-debug-copy="${key}"></summary>`;
  const pre = key => `<h4 data-debug-copy="${key}"></h4><pre data-debug-pre="${key}"></pre>`;
  details.innerHTML = `<summary class="accordion-toggle" data-debug-copy="title"></summary><div class="accordion-panel debug-content">
    <p class="note" data-debug-copy="help"></p><p class="note debug-measurement" data-measurement></p>
    ${heading('masks',true)}
      <label for="tilesDebugSource" data-debug-copy="source"></label><select id="tilesDebugSource" data-debug-source></select>
      <p class="note" data-source-note></p>
      <label for="tilesDebugRaster" data-debug-copy="raster"></label><select id="tilesDebugRaster" data-debug-raster><option value="none"></option>${DEBUG_MASKS.map(k=>`<option value="${k}"></option>`).join('')}</select>
      <div class="debug-classes" data-class-controls>${DEBUG_CLASSES.map(c=>`<label><input type="checkbox" data-debug-class="${c.key}" checked><i style="background:rgb(${c.color.join(',')})" aria-hidden="true"></i><span data-debug-copy="${c.key}"></span></label>`).join('')}</div>
      <label for="tilesDebugOpacity"><span data-debug-copy="opacity"></span> <output data-opacity-output>45%</output></label>
      <input id="tilesDebugOpacity" data-debug-opacity type="range" min="0" max="100" step="1" value="45">
      <label class="debug-check"><input type="checkbox" data-debug-current><span data-debug-copy="current"></span></label>
      <label class="debug-check"><input type="checkbox" data-debug-grid><span data-debug-copy="grid"></span></label>
      <label class="debug-check"><input type="checkbox" data-debug-preview checked><span data-debug-copy="preview"></span></label>
      <p class="note" data-debug-copy="compare"></p><p class="note" data-overlay-note></p><p class="note" data-debug-copy="occlusionNote"></p>
    </details>
    ${heading('pipeline')}
      <dl class="debug-status"><dt data-debug-copy="status"></dt><dd data-phase></dd><dt data-debug-copy="endpoint"></dt><dd data-endpoint></dd></dl>
      <button type="button" class="area-secondary" data-debug-health data-debug-copy="refresh"></button><p class="note" data-debug-copy="checkHelp"></p>
      ${pre('service')}${pre('timings')}<p class="note" data-debug-copy="timingNote"></p>${pre('models')}${pre('errors')}
    </details>
    ${heading('results')}
      <h4 data-debug-copy="classes"></h4><div data-class-stats></div><p class="note" data-debug-copy="semanticNote"></p>
      ${pre('design')}${pre('clipping')}${pre('counts')}<p class="note" data-debug-copy="confidence"></p>
    </details>
    ${heading('geometry')}
      <p class="note" data-debug-copy="cameraNote"></p>${pre('liveCamera')}${pre('camera')}${pre('plane')}
    </details>
    ${heading('export')}
      <label class="debug-check"><input type="checkbox" data-debug-include><span data-debug-copy="include"></span></label>
      <div class="debug-export-actions"><button type="button" class="area-secondary" data-debug-download data-debug-copy="download"></button>
        <button type="button" class="area-secondary" data-debug-copy-json data-debug-copy="copy"></button>
        <button type="button" class="area-secondary" data-debug-overlay-png data-debug-copy="overlay"></button>
        <button type="button" class="area-secondary" data-debug-mask-png data-debug-copy="maskPNG"></button></div>
      <p class="note" data-debug-copy="exportNote"></p><p class="note" data-debug-message role="status" aria-live="polite"></p>
      <div data-import-container></div>
    </details><p data-debug-error role="alert" hidden></p>
  </div>`;
  const style = document.createElement('style'); style.textContent = `
    .segmentation-debug{min-width:0;overflow:hidden}.segmentation-debug [hidden],.segmentation-debug-overlay[hidden]{display:none!important}
    .segmentation-debug .debug-content{min-width:0}.segmentation-debug label,.segmentation-debug p{font-size:12px;line-height:1.5}
    .segmentation-debug select{width:100%;max-width:100%;min-width:0;margin:5px 0 8px;padding:8px;font:inherit;font-size:12px;border-radius:7px}
    .segmentation-debug .debug-section{margin:10px 0;padding:10px 0;border-top:1px solid #becbd566}
    .segmentation-debug .debug-section>summary{font-size:13px;font-weight:700;cursor:pointer;padding:4px 0;min-height:28px}
    .segmentation-debug h4{font-size:12px;margin:12px 0 5px}.segmentation-debug pre{font-size:11px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-height:220px;overflow:auto;margin:5px 0;padding:8px;background:#718ca311;border-radius:6px}
    .segmentation-debug .debug-check,.segmentation-debug .debug-classes label{display:flex;align-items:flex-start;gap:7px;margin:8px 0;font-weight:400}
    .segmentation-debug input[type=checkbox]{flex:0 0 16px;width:16px;height:16px;margin:2px 0 0;accent-color:#0878c9}
    .segmentation-debug input[type=range]{width:100%;margin:8px 0 14px;touch-action:pan-y}
    .segmentation-debug .debug-classes{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}.segmentation-debug .debug-classes i,.debug-class-stat i{display:inline-block;flex:0 0 10px;width:10px;height:10px;border-radius:2px;margin-top:5px}
    .segmentation-debug .debug-class-stat{display:flex;align-items:flex-start;gap:6px;font-size:12px;padding:3px 0}.debug-class-stat span{flex:1}.debug-class-stat b{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}
    .segmentation-debug .debug-status{display:grid;grid-template-columns:1fr;gap:3px;font-size:12px}.segmentation-debug dd{margin:0 0 8px;overflow-wrap:anywhere}
    .segmentation-debug .debug-export-actions{display:grid;grid-template-columns:1fr;gap:7px}.segmentation-debug button{max-width:100%;font:inherit;font-size:12px;padding:8px;min-height:40px;cursor:pointer}
    .segmentation-debug button:disabled{opacity:.5;cursor:default}.segmentation-debug [data-debug-error]{color:#a13f20;font-size:12px;overflow-wrap:anywhere}
    .segmentation-debug .debug-measurement{font-weight:600}.segmentation-debug .model-import-debug{margin-top:10px}
    .segmentation-debug.is-setup{position:absolute;right:24px;top:24px;width:min(330px,calc(100% - 48px));z-index:35;border-radius:10px;background:#fff;color:#25333c;border:1px solid #bdcbd3;box-shadow:0 4px 16px #0002;max-height:calc(100% - 48px);overflow:auto;overscroll-behavior:contain}
    .segmentation-debug.is-setup>.accordion-toggle{padding:12px}.segmentation-debug.is-setup>.accordion-panel{padding:12px}
    body.dark .segmentation-debug.is-setup{background:#253139;color:#e4ebef;border-color:#52626c}
    body.dark .segmentation-debug select{background:#35424a;color:#e4ebef;border-color:#52626c}body.dark .segmentation-debug [data-debug-error]{color:#ffbfa3}
    @media(max-width:760px){.segmentation-debug.is-setup{right:12px;top:10px;width:min(300px,calc(100% - 24px));max-height:35dvh}.segmentation-debug .debug-classes{grid-template-columns:1fr}}
  `; document.head.append(style);
  const $ = selector => details.querySelector(selector), c = () => debugCopy(getLocale());
  const overlay = createDebugOverlay(host);
  let photoId = null, sourceKey = '', source = null, inspected = null, inspectionError = '',
    snapshot = null, design = null, designRevision = null, frame = 0, destroyed = false;
  const importer = mountModelImportPanel({ api, getLocale, getStep, container: $('[data-import-container]') });
  const options = () => ({ enabled: details.open && !details.hidden, raster: $('[data-debug-raster]').value,
    opacity: Number($('[data-debug-opacity]').value), current: $('[data-debug-current]').checked,
    grid: $('[data-debug-grid]').checked, classes: Array.from(details.querySelectorAll('[data-debug-class]:checked')).map(e=>e.dataset.debugClass) });
  function message(text, error = false) {
    const element = error ? $('[data-debug-error]') : $('[data-debug-message]');
    element.textContent = text || ''; element.hidden = !text;
  }
  function updateData() {
    const copy=c(); snapshot=api.getDebugState();
    const id=snapshot.photo?.photoId || null;
    if (id !== photoId) {
      photoId=id;sourceKey='';source=null;inspected=null;inspectionError='';designRevision=null;design=null;
      overlay.clear({release:true});message('');message('',true);
      $('[data-debug-raster]').value='none';$('[data-debug-preview]').checked=true;
      $('[data-debug-current]').checked=false;$('[data-debug-grid]').checked=false;
    }
    const setup=getStep()!=='done';
    const body=document.querySelector('.sidebar .shared-configurator-panel__body')||document.querySelector('.sidebar');
    const parent=setup?document.getElementById('viewer'):body;
    if (parent && details.parentElement!==parent) {
      const analysis=parent.querySelector(':scope > #photoAnalysisPanel');
      if (!setup && analysis) parent.insertBefore(details,analysis.nextSibling);
      else parent.append(details);
    }
    details.classList.toggle('is-setup',setup); details.hidden=!id || getStep()==='upload';
    for (const element of details.querySelectorAll('[data-debug-copy]')) element.textContent=copy[element.dataset.debugCopy];
    importer.update();
    if (!details.open || details.hidden) {
      overlay.clear(); api.setDebugPreviewVisible(true); return;
    }
    const select=$('[data-debug-source]'), old=select.value;
    const kinds=['analysis','imported'].filter(k=>snapshot.sources[k]);
    const signature=kinds.join('|');
    if(select.dataset.signature!==signature) {
      select.replaceChildren();
      for(const kind of kinds.length?kinds:['none']) {const option=document.createElement('option');option.value=kind;option.textContent=copy[kind]||copy.noSource;select.append(option);}
      select.dataset.signature=signature;select.value=kinds.includes(old)?old:(kinds[0]||'none');
    }
    for (const option of select.options) option.textContent=copy[option.value]||copy.noSource;
    select.disabled=!kinds.length;
    const kind=select.value, descriptor=snapshot.sources[kind], key=`${id}:${kind}:${descriptor?.key || ''}`;
    if(key!==sourceKey) {
      sourceKey=key;source=null;inspected=null;inspectionError='';
      try { source=api.getDebugSource(kind); inspected=inspectDebugSource(source,snapshot.photo); }
      catch(e) {inspectionError=e.message;}
    }
    if(source) source.active=descriptor?.active===true;
    if(designRevision!==snapshot.photo.designRevision) { design=api.getPavingState();designRevision=snapshot.photo.designRevision; }
    $('[data-source-note]').textContent=source?(source.active?copy.active:copy.inactive):copy.noSource;
    const layer=$('[data-debug-raster]');
    for(const option of layer.options) {option.textContent=copy[option.value];option.disabled=option.value!=='none'&&!inspected?.masks?.[option.value];}
    $('[data-class-controls]').hidden=layer.value!=='labels'||!inspected?.masks?.labels;
    $('[data-opacity-output]').textContent=$('[data-debug-opacity]').value+'%';
    $('[data-measurement]').textContent=copy[snapshot.measurementStatus==='estimated'?'estimate':snapshot.measurementStatus==='reference_calibrated'?'reference':'unavailable'];
    $('[data-phase]').textContent=String(snapshot.status.phase||'idle');
    $('[data-endpoint]').textContent=publicServiceAddress(snapshot.status.apiBase)||'—';
    $('[data-debug-health]').disabled=snapshot.service.state==='checking';
    const write=(key,value)=>$(`[data-debug-pre="${key}"]`).textContent=value==null?copy.missing:JSON.stringify(debugMetadata(value),null,2);
    write('service',snapshot.service);
    write('timings',{last_job:snapshot.status.timing_s||{},last_job_elapsed_s:typeof snapshot.status.elapsedMs==='number'?snapshot.status.elapsedMs/1000:null,
      selected_source:inspected?.timings||null});
    write('models',inspected?.models);write('errors',{current_job:snapshot.status.errors||{},current_error:snapshot.status.error||null,
      source_errors:source?.payload?.errors||null,source_warnings:inspected?.warnings||[],mask_validation:inspected?.errors||[],inspection:inspectionError||null});
    write('liveCamera',snapshot.calibration);write('camera',inspected?.camera);
    write('plane',inspected?{ground_plane:inspected.plane,diagnostics:inspected.planeDiagnostics}:null);
    write('design',designStatistics(design));write('clipping',inspected?.diagnostics);write('counts',inspected ? { mask_counts: inspected.counts, uncertainty_definition: inspected.uncertaintyMeaning, reported_classes_pct: inspected.reportedClassesPct, reported_confidence: inspected.reportedConfidence } : null);
    const stats=$('[data-class-stats]');stats.replaceChildren();
    if(!inspected?.classes) stats.textContent=copy.missing;
    else for(const entry of inspected.classes) {
      const row=document.createElement('div');row.className='debug-class-stat';
      const swatch=document.createElement('i');swatch.style.background=`rgb(${entry.color.join(',')})`;swatch.setAttribute('aria-hidden','true');
      const name=document.createElement('span');name.textContent=copy[entry.key];
      const count=document.createElement('b');count.textContent=new Intl.NumberFormat(getLocale(),{maximumFractionDigits:1}).format(entry.percentage)+'%';
      count.title=`${entry.pixels} / ${inspected.image.width*inspected.image.height} pixels`;row.append(swatch,name,count);stats.append(row);
    }
    const view=api.getDebugView(), opt=options();
    $('[data-overlay-note]').textContent=!view?.photoMode?copy.photoOnly:
      (opt.current||opt.grid)&&!view?.hasCalibration?copy.noMetric:
      opt.raster!=='none'&&!inspected?.masks?.[opt.raster]?copy.missing:'';
    api.setDebugPreviewVisible(!view?.photoMode||$('[data-debug-preview]').checked);
    overlay.draw({view,inspected,design,options:opt});
    $('[data-debug-overlay-png]').disabled=!view?.photoMode;
    $('[data-debug-mask-png]').disabled=!inspected?.masks?.[opt.raster];
  }
  function flush() {frame=0;if(destroyed)return;try{updateData();}catch(e){overlay.clear();api.setDebugPreviewVisible(true);message(e.message,true);}}
  function update() {if(!frame&&!destroyed)frame=requestAnimationFrame(flush);}
  function ensureFresh() {if(frame)cancelAnimationFrame(frame);frame=0;updateData();if(!snapshot?.photo)throw new Error(c().noPhoto);}
  details.addEventListener('toggle',event=>{if(event.target===details)update();},true);
  details.addEventListener('input',event=>{if(event.target!==$('[data-debug-include]'))update();});
  details.addEventListener('change',()=>update());
  function download(blob,name) {
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message(c().exported);
  }
  function jsonExport() {ensureFresh();return JSON.stringify(buildDebugReport({snapshot,source,inspected,design,includeMasks:$('[data-debug-include]').checked}),null,$('[data-debug-include]').checked?0:2);}
  $('[data-debug-download]').addEventListener('click',()=>{try{download(new Blob([jsonExport()],{type:'application/json'}),'tiles-segmentation-debug.json');}catch(e){message(e.message,true);}});
  $('[data-debug-copy-json]').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(jsonExport());message(c().copied);}catch{message(c().copyFailed,true);}
  });
  for(const [selector,isMask] of [['[data-debug-overlay-png]',false],['[data-debug-mask-png]',true]]) $(selector).addEventListener('click',()=>{
    try{
      ensureFresh();const current=photoId,canvas=isMask?overlay.maskCanvas(inspected,options().raster,options().classes):overlay.canvas;
      if(!canvas)throw new Error(c().noMask);
      canvas.toBlob(blob=>{if(blob&&current===api.getPhotoSource()?.photoId)download(blob,isMask?'tiles-diagnostic-mask.png':'tiles-diagnostic-overlay.png');},'image/png');
    }catch(e){message(e.message,true);}
  });
  $('[data-debug-health]').addEventListener('click',async()=>{
    message('',true);try{await api.checkAnalysisService();}catch(e){message(e.message,true);}finally{update();}
  });
  const observer = new ResizeObserver(update);observer.observe(host);
  // Expose the unified root, not a second floating importer.
  update();return {update,element:details,destroy(){destroyed=true;if(frame)cancelAnimationFrame(frame);observer.disconnect();overlay.destroy();api.setDebugPreviewVisible(true);details.remove();style.remove();}};
}
