import {mountLocationPicker} from './locationPicker.js';
import {patternPreview} from './patternPreview.js';
import {houseGeometry} from './house.js';
import {TILES,CURBS,COLORS,DEFAULTS,normalize,layout,estimate,areaGeometry} from './model.js';
import {translator} from './i18n.js';
import {mountStandaloneConfiguratorShell} from '../../shared-ui/src/standaloneShell.js';
import {SharedUndoManager} from '../../shared-ui/src/history/undoManager.js';
import {resolveSharedTools} from '../../shared-ui/src/tools/registry.js';
import {createShareUrl} from '../../shared-ui/src/shareState.js';
import {requireTenantConfiguratorAccess} from '../../shared-ui/src/tenantBootstrap.js';
const $=id=>document.getElementById(id);
let state=normalize(),locale='en-US',t=translator(locale),viewer,shell,top=false;
const money=n=>new Intl.NumberFormat(locale,{style:'currency',currency:'RON'}).format(n);
const f=n=>new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(n);
const history=new SharedUndoManager({capture:()=>structuredClone(state),restore:s=>restore(s)});
function swatches(id,key,colors){$(id).innerHTML=colors.map(c=>`<button type="button" class="swatch" data-key="${key}" data-color="${c}" title="${t(c)}" aria-label="${t(c)}" aria-pressed="${state[key]===c}" style="--swatch:${Array.isArray(COLORS[c])?`linear-gradient(120deg,${COLORS[c].join(',')})`:COLORS[c]}"></button>`).join('');}
function render(){
  document.documentElement.lang=locale.split('-')[0];document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));
  for(const key of ['length','width','waste','tileRate','curbRate','rotation','shape','runA','runB','runC','runD','angleB','houseShape','houseLength','houseWidth','houseWingWidth','houseWingDepth','houseHeight','houseX','houseZ','houseRotation'])$(key).value=state[key];
  $('importedHouseOption').hidden=!state.houseFootprint;
  for(const key of ['houseLength','houseWidth']){$(key).disabled=$(key+'Range').disabled=state.houseShape==='imported';}
  $('houseMapSource').textContent=state.houseShape==='imported'&&state.houseLocation?`${t('imported')} · ${state.houseLocation.label} · © OpenStreetMap`:'';
  $('houseEnabled').checked=state.houseEnabled;$('houseFields').hidden=!state.houseEnabled;
  $('houseWingWidthField').hidden=$('houseWingDepthField').hidden=state.houseShape!=='l';
  for(const [key,max] of [['houseWingWidth',state.houseLength-.25],['houseWingDepth',state.houseWidth-.25]]){$(key).max=max;$(key+'Range').max=max;}
  document.querySelectorAll('[data-range-field]').forEach(el=>{const key=el.dataset.rangeField;el.value=state[key];el.setAttribute('aria-label',document.querySelector(`label[for="${key}"]`)?.textContent.trim()||t(key));$(key+'Value').textContent=`${f(state[key])} ${key==='angleB'?'°':'m'}`;});
  const geometry=areaGeometry(state),custom=state.shape!=='rectangle';
  $('rectangleFields').hidden=custom;$('polygonFields').hidden=!custom;$('runDField').hidden=state.shape!=='closed5';
  $('closingLabel').textContent=`${state.shape==='closed5'?'EA':'DA'} · ${t('calculated')}`;
  $('closingLength').textContent=`${f(geometry.lengths.at(-1))} m`;$('shapeHelp').textContent=t(state.shape==='closed5'?'help5':'help4');
  const scale=Math.min(230/geometry.width,110/geometry.depth),ox=(300-geometry.width*scale)/2,oz=(170-geometry.depth*scale)/2;
  $('areaPlan').setAttribute('aria-label',t(state.shape));
  $('areaPlan').innerHTML=`<polygon points="${geometry.points.map(p=>`${ox+p.x*scale},${oz+p.z*scale}`).join(' ')}" fill="#e9f5fd" stroke="#0878c9" stroke-width="2"/>`+geometry.points.map((p,i)=>`<text x="${ox+p.x*scale}" y="${oz+p.z*scale-9}" text-anchor="middle">${String.fromCharCode(65+i)}</text>`).join('');
  if(state.houseEnabled)$('areaPlan').innerHTML+=`<polygon points="${houseGeometry(state).outline.map(p=>`${ox+p.x*scale},${oz+p.z*scale}`).join(' ')}" fill="#69747b" fill-opacity=".8" stroke="#3f4b53" stroke-width="1.5"/>`;
  $('edgeChoices').innerHTML=geometry.points.map((_,i)=>`<label><input type="checkbox" data-edge="${i}" ${state.edges[i]?'checked':''}><span>${custom?String.fromCharCode(65+i)+String.fromCharCode(65+(i+1)%geometry.points.length):t(['front','right','back','left'][i])}</span></label>`).join('');
  $('tileChoices').innerHTML=Object.entries(TILES).map(([key,tile])=>`<button type="button" class="tile-card" data-tile="${key}" aria-pressed="${state.tile===key}"><i class="tile-icon" aria-hidden="true"></i>${tile.name}<small>${tile.length*100} × ${tile.width*100} × ${tile.thickness*100} cm</small></button>`).join('');
  const tile=TILES[state.tile];$('sourceLink').href=tile.source;
  $('patternChoices').innerHTML=tile.patterns.map(p=>`<button type="button" class="pattern-card" data-pattern="${p}" aria-pressed="${state.pattern===p}">${patternPreview(state,p)}<span>${t(p)}</span><i class="pattern-check" aria-hidden="true">✓</i></button>`).join('');
  $('curb').innerHTML=Object.entries(CURBS).map(([key,c])=>`<option value="${key}">${t(key)} · ${c.name} · ${c.length*100} × ${c.width*100} × ${c.height*100} cm</option>`).join('');$('curb').value=state.curb;
  document.querySelectorAll('[data-edge]').forEach(el=>el.checked=state.edges[Number(el.dataset.edge)]);
  swatches('colors','color',tile.colors);swatches('accents','accent',tile.colors);swatches('curbColors','curbColor',CURBS[state.curb].colors);$('accentSection').hidden=state.pattern!=='checker';
  const parts=layout(state),bom=estimate(state,parts);viewer?.rebuild(state,parts);
  $('areaBadge').textContent=`${f(bom.area)} m² · ${custom?`${t('perimeter')}: ${f(bom.perimeter)} m`:`${f(state.length)} × ${f(state.width)} m`}`;
  $('metrics').innerHTML=[['netArea',`${f(bom.area)} m²`],['houseArea',`${f(bom.houseArea)} m²`],['pieces',bom.installedPieces],['cuts',bom.cutPieces],['purchase',`${f(bom.rows.filter(r=>r.kind==='tile').reduce((a,r)=>a+r.area,0))} m²`],['curbLength',`${f(bom.curbLength)} m`]].map(([key,value])=>`<div><span>${t(key)}</span><strong>${value}</strong></div>`).join('');
  $('bom').innerHTML=bom.rows.map(r=>`<div class="bom-row"><div><b>${r.name} · ${t(r.color)}</b><small>${r.quantity} × ${money(r.rate)}${r.area?` · ${f(r.area)} m²`:''}</small></div><strong>${money(r.total)}</strong></div>`).join('');
  $('summaryTotal').textContent=money(bom.total);shell?.refreshConfiguratorPanelFooter();$('cameraButton').textContent=t(top?'perspective':'top');$('viewerError').textContent=t('error');
}
function restore(snapshot){if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||snapshot.version!==1)return false;try{const next=normalize(snapshot);areaGeometry(next);state=next;render();$('areaError').hidden=true;return true;}catch{return false;}}
function change(patch,record=true){const next=normalize({...state,...patch});try{areaGeometry(next);}catch{render();$('areaError').textContent=t('invalidArea');$('areaError').hidden=false;return;}if(record)history.record();state=next;$('areaError').hidden=true;render();shell?.markDirty();}
function setLocale(value){locale=value||'en-US';t=translator(locale);render();}
function setDarkMode(value){document.body.classList.toggle('dark',value);viewer?.setDarkMode(value);}
function cycleCamera(){top=viewer?.cycleCamera()||false;$('cameraButton').textContent=t(top?'perspective':'top');}
const api={captureState:()=>structuredClone(state),restoreState:restore,resetConfiguration(){history.record();state=normalize(DEFAULTS);render();shell?.markDirty();return true;},setLocale,setDarkMode,cycleCamera,getEstimate:()=>estimate(state)};
window.TILES_CONFIGURATOR_API=api;
let sliderFrame=0,sliderPatch=null;
function flushSlider(){if(sliderFrame)cancelAnimationFrame(sliderFrame);sliderFrame=0;if(sliderPatch){const patch=sliderPatch;sliderPatch=null;change(patch,false);}}
const sidebar=document.querySelector('.sidebar');
sidebar.addEventListener('pointerdown',e=>{if(e.target.dataset.rangeField)history.record();},true);
sidebar.addEventListener('keydown',e=>{if(e.target.dataset.rangeField&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))history.record();},true);
sidebar.addEventListener('input',e=>{const key=e.target.dataset.rangeField;if(!key)return;sliderPatch={...(sliderPatch||{}),[key]:Number(e.target.value)};$(key).value=e.target.value;$(key+'Value').textContent=`${f(Number(e.target.value))} ${key==='angleB'?'°':'m'}`;if(!sliderFrame)sliderFrame=requestAnimationFrame(flushSlider);});
$('centerHouse').addEventListener('click',()=>{const g=areaGeometry(state);change({houseX:(g.width-state.houseLength)/2,houseZ:(g.depth-state.houseWidth)/2});});
document.querySelector('.sidebar').addEventListener('change',e=>{const el=e.target;if(el.dataset.rangeField){flushSlider();return;}if(el.dataset.edge!==undefined){const edges=[...state.edges];edges[Number(el.dataset.edge)]=el.checked;change({edges});}else if(Object.hasOwn(DEFAULTS,el.id)){if(el.type==='number'&&!el.checkValidity()){el.reportValidity();el.value=state[el.id];return;}const patch={[el.id]:el.type==='checkbox'?el.checked:el.value};if(el.id==='curb')patch.curbRate=CURBS[el.value].price;change(patch);}});
document.querySelector('.sidebar').addEventListener('click',e=>{const button=e.target.closest('button');if(button?.dataset.tile){const tile=button.dataset.tile;change({tile,tileRate:TILES[tile].price});}if(button?.dataset.pattern){const pattern=button.dataset.pattern;change({pattern});document.querySelector(`[data-pattern="${pattern}"]`)?.focus({preventScroll:true});}if(button?.dataset.color)change({[button.dataset.key]:button.dataset.color});});
$('cameraButton').addEventListener('click',cycleCamera);
$('export').addEventListener('click',()=>{const bom=estimate(state);const rows=[[t('item'),t('color'),t('quantity'),t('unitRate')+' (RON)',t('total')+' (RON)'],...bom.rows.map(r=>[r.name,t(r.color),r.quantity,r.rate.toFixed(2),r.total.toFixed(2)]),[t('total'),'','','',bom.total.toFixed(2)],[],[t('note')],[t('shape'),t(state.shape)],[t('netArea'),bom.area,'m²'],[t('grossArea'),bom.grossArea,'m²'],[t('houseArea'),bom.houseArea,'m²'],...(state.houseEnabled?[[t('houseShape'),t(state.houseShape==='imported'?'imported':state.houseShape==='l'?'lShape':'rectangle')],[t('houseLength'),state.houseLength,'m'],[t('houseWidth'),state.houseWidth,'m'],[t('houseWingWidth'),state.houseWingWidth,'m'],[t('houseWingDepth'),state.houseWingDepth,'m'],[t('houseX'),state.houseX,'m'],[t('houseZ'),state.houseZ,'m'],[t('rotation'),state.houseRotation,'°']]:[]),[t('perimeter'),bom.perimeter,'m'],...areaGeometry(state).lengths.map((length,i)=>[String.fromCharCode(65+i)+String.fromCharCode(65+(i+1)%state.edges.length),length,'m',state.edges[i]?'curb':'']),...(state.shape==='rectangle'?[]:[[t('angleB'),state.angleB,'°']]),...(state.houseShape==='imported'&&state.houseFootprint?[[t('imported'),'OpenStreetMap',state.houseLocation?.label||''],...state.houseFootprint.map((p,i)=>['House vertex '+(i+1),p.x,p.z,'m'])]:[]),[t('pattern'),t(state.pattern)],[t('rotation'),state.rotation],[t('waste'),state.waste,'%']];const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='pavement-bom.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
mountLocationPicker({getState:()=>state,t:key=>t(key),onImport({footprint,location}){const l=Math.max(...footprint.map(p=>p.x)),w=Math.max(...footprint.map(p=>p.z));const length=Math.min(20,l+2),width=Math.min(20,w+2);change({houseFootprint:footprint,houseLocation:location,houseShape:'imported',houseEnabled:true,houseRotation:0,houseX:(length-l)/2,houseZ:(width-w)/2,shape:'rectangle',length,width});}});
render();
const tenant=await requireTenantConfiguratorAccess('tiles');
const mobile=matchMedia('(max-width:760px)');
shell=mountStandaloneConfiguratorShell({productType:'Tiles',productId:'tiles',storagePrefix:'360-configurator:tiles',brandSrc:tenant?.logoUrl||'../shared-ui/assets/360CONFIGURATOR.png',brandAlt:tenant?.companyName||'360 Configurator',capabilities:{viewAR:false,save:true,undo:true,reset:true,share:true},tools:{items:resolveSharedTools([{id:'dimensions',active:true},'camera'])},configuratorPanel:{panelSelector:'.sidebar',getEstimatedTotal:()=>({value:estimate(state).total,currency:'RON',locale})},settingsPanel:{panelSelector:'.sidebar',toggleSelector:'#tilesSidebarToggle',collapsedClass:'is-collapsed',bodyCollapsedClass:'tiles-sidebar-collapsed',initiallyCollapsed:mobile.matches},callbacks:{onUndo(){history.undo();},resetConfiguration:api.resetConfiguration,captureState:api.captureState,restoreState:restore,getShareUrl(){return createShareUrl({productType:'tiles',state:api.captureState()});},onPreferenceChange(path,value){if(path==='locale')setLocale(value);if(path==='darkMode')setDarkMode(Boolean(value));},onSettingsPanelToggle(collapsed){const panel=document.querySelector('.sidebar');panel.inert=collapsed;panel.setAttribute('aria-hidden',String(collapsed));}}});
shell.setSettingsPanelCollapsed(mobile.matches);
mobile.addEventListener('change',event=>shell.setSettingsPanelCollapsed(event.matches));
window.TILES_CONFIGURATOR_SHARED_SHELL=shell;setLocale(shell.state.locale);setDarkMode(Boolean(shell.state.darkMode));
shell.host.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(action==='cycle-camera')cycleCamera();if(action==='toggle-dimensions')shell.setToolActive('dimensions',viewer?.toggleDimensions());});
try{const {createViewer}=await import('./viewer.js');viewer=createViewer($('canvasHost'),{onHouseDragStart:()=>history.record(),onHouseMove:patch=>change(patch,false)});viewer.setDarkMode(Boolean(shell.state.darkMode));render();}catch(error){console.error('Pavement preview failed',error);$('viewerError').hidden=false;}
