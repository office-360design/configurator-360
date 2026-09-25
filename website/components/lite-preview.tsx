"use client";

import { useEffect, useRef, useState } from "react";
import { liteDefaults, type LiteSlug, type LiteState } from "../lib/lite-products";
import type { Locale } from "../lib/i18n";
import { RangeControl, PresetControl, ColourControl } from "./scene-control-primitives";
import { useMobileDeckSwipe } from "./use-mobile-deck-swipe";
import {CardboxLiteControls} from "./cardbox-lite-controls";
import cardboxCatalog from "../lib/cardbox-catalog.json";
import { MobileSceneActions } from "./mobile-scene-actions";

const consoleCopy = {
  en: { customize:"Customize", hide:"View model", form:"Configuration", finish:"Materials", reset:"Reset view", natural:"Natural", walnut:"Walnut", espresso:"Espresso", black:"Black", clay:"Clay", sand:"Sand", blue:"Midnight", sage:"Sage", kraft:"Kraft", brown:"Brown", white:"White", mahogany:"Mahogany", charcoal:"Charcoal", grey:"Grey", terracotta:"Terracotta", chair:"Chair", cardbox:"Cardboard box", bookshelf:"Bookshelf", tiles:"Paving", preview:"Interactive preview" },
  ro: { customize:"Personalizează", hide:"Vezi modelul", form:"Configurație", finish:"Materiale", reset:"Resetează vederea", natural:"Natur", walnut:"Nuc", espresso:"Espresso", black:"Negru", clay:"Argilă", sand:"Nisip", blue:"Bleumarin", sage:"Salvie", kraft:"Kraft", brown:"Maro", white:"Alb", mahogany:"Mahon", charcoal:"Antracit", grey:"Gri", terracotta:"Teracotă", chair:"Scaun", cardbox:"Cutie de carton", bookshelf:"Bibliotecă", tiles:"Pavaj", preview:"Previzualizare interactivă" },
  de: { customize:"Konfigurieren", hide:"Modell ansehen", form:"Konfiguration", finish:"Materialien", reset:"Ansicht zurücksetzen", natural:"Natur", walnut:"Walnuss", espresso:"Espresso", black:"Schwarz", clay:"Ton", sand:"Sand", blue:"Nachtblau", sage:"Salbei", kraft:"Kraft", brown:"Braun", white:"Weiß", mahogany:"Mahagoni", charcoal:"Anthrazit", grey:"Grau", terracotta:"Terrakotta", chair:"Stuhl", cardbox:"Karton", bookshelf:"Regal", tiles:"Pflaster", preview:"Interaktive Vorschau" },
};
const extraCopy = {
  en:{details:"Details",site:"House & edges",wood:"Wood species",oak:"Oak",beech:"Beech",ash:"Ash",shelves:"Shelf layout",sparse:"Sparse",balanced:"Balanced",dense:"Dense",hardware:"Door hardware",diamond:"Diamond",rectangle:"Rectangle",knob:"Wood knob",doorPosition:"Door position",closed:"Closed",opened:"Open",house:"House",off:"Off",on:"On",shape:"House footprint",houseLength:"House length",houseWidth:"House width",rotation:"House rotation",curbs:"Border curbs",stack:"Stack bond",tile:"Paving format"},
  ro:{details:"Detalii",site:"Casă și borduri",wood:"Esență lemn",oak:"Stejar",beech:"Fag",ash:"Frasin",shelves:"Dispunere rafturi",sparse:"Aerisit",balanced:"Echilibrat",dense:"Dens",hardware:"Feronerie uși",diamond:"Romb",rectangle:"Dreptunghi",knob:"Buton lemn",doorPosition:"Poziție uși",closed:"Închise",opened:"Deschise",house:"Casă",off:"Fără",on:"Cu",shape:"Amprentă casă",houseLength:"Lungime casă",houseWidth:"Lățime casă",rotation:"Rotire casă",curbs:"Borduri",stack:"Aliniat",tile:"Format pavaj"},
  de:{details:"Details",site:"Haus & Ränder",wood:"Holzart",oak:"Eiche",beech:"Buche",ash:"Esche",shelves:"Fachaufteilung",sparse:"Weit",balanced:"Ausgewogen",dense:"Eng",hardware:"Türbeschläge",diamond:"Raute",rectangle:"Rechteck",knob:"Holzknopf",doorPosition:"Türstellung",closed:"Geschlossen",opened:"Offen",house:"Haus",off:"Ohne",on:"Mit",shape:"Hausgrundriss",houseLength:"Hauslänge",houseWidth:"Hausbreite",rotation:"Hausdrehung",curbs:"Randsteine",stack:"Kreuzverband",tile:"Pflasterformat"},
};

const text = {
  en: {start:"Explore in 3D",loading:"Loading preview…",retry:"Reload preview",hint:"Drag to orbit",wood:"Wood colour",fabric:"Upholstery colour",weave:"Upholstery",linen:"Woven",velvet:"Velvet",style:"Box style",standard:"Shipping box",overlap:"Full overlap",telescope:"Telescope lid",width:"Width",depth:"Depth",height:"Height",open:"Opening",colour:"Colour",family:"Family",compact:"Compact",tall:"Tall",layout:"Layout",straight:"Straight",corner:"L-shaped",count:"Modules",doors:"Doors",none:"Open shelves",lower:"Lower doors",glazed:"Glazed doors",length:"Length",pattern:"Laying pattern",running:"Running bond",herringbone:"Herringbone",basket:"Basket weave",scope:"Selected options · open the full configurator for more",pieces:"installed pieces",connections:"connections",error:"The 3D preview is unavailable. You can still open the full configurator."},
  ro: {start:"Explorează în 3D",loading:"Se încarcă…",retry:"Reîncarcă modelul",hint:"Trage pentru rotire",wood:"Culoare lemn",fabric:"Culoare tapițerie",weave:"Tapițerie",linen:"Țesătură",velvet:"Catifea",style:"Tip cutie",standard:"Cutie standard",overlap:"Suprapunere completă",telescope:"Capac telescopic",width:"Lățime",depth:"Adâncime",height:"Înălțime",open:"Deschidere",colour:"Culoare",family:"Familie",compact:"Compactă",tall:"Înaltă",layout:"Dispunere",straight:"Dreaptă",corner:"În L",count:"Module",doors:"Uși",none:"Rafturi deschise",lower:"Uși inferioare",glazed:"Uși vitrate",length:"Lungime",pattern:"Model montaj",running:"Decalat",herringbone:"Os de pește",basket:"Împletit",scope:"Opțiuni selectate · mai multe în configuratorul complet",pieces:"piese montate",connections:"conexiuni",error:"Previzualizarea 3D nu este disponibilă. Poți deschide configuratorul complet."},
  de: {start:"In 3D erkunden",loading:"Vorschau lädt…",retry:"Vorschau neu laden",hint:"Zum Drehen ziehen",wood:"Holzfarbe",fabric:"Polsterfarbe",weave:"Polster",linen:"Gewebt",velvet:"Samt",style:"Kartontyp",standard:"Versandkarton",overlap:"Volle Überlappung",telescope:"Teleskopdeckel",width:"Breite",depth:"Tiefe",height:"Höhe",open:"Öffnung",colour:"Farbe",family:"Größenfamilie",compact:"Kompakt",tall:"Hoch",layout:"Anordnung",straight:"Gerade",corner:"L-Form",count:"Module",doors:"Türen",none:"Offene Böden",lower:"Untere Türen",glazed:"Glastüren",length:"Länge",pattern:"Verlegemuster",running:"Läuferverband",herringbone:"Fischgrät",basket:"Flechtverband",scope:"Ausgewählte Optionen · mehr im vollständigen Konfigurator",pieces:"verlegte Stücke",connections:"Verbindungen",error:"Die 3D-Vorschau ist nicht verfügbar. Sie können den vollständigen Konfigurator öffnen."},
};

function Poster({slug}: {slug: LiteSlug}) {
  return <svg className="lite-poster" viewBox="0 0 600 400" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
    <ellipse cx="300" cy="325" rx="200" ry="38" strokeDasharray="3 9" opacity=".2"/>
    {slug === "chair" ? <g><path d="m230 210 100-20 82 48-111 28z" fill="currentColor" fillOpacity=".12"/><path d="m230 210-15-105 112-20 3 105m-100 20-18 106m89-50-1 86m112-114 22 90M215 105l-12 85 35 25m-23-110 112-20 10 109m-98 20 70 35 82-22M327 85l80 35 5 118"/></g> : slug === "cardbox" ? <g><path d="m178 173 142 54 133-76v122l-133 82-142-57z" fill="currentColor" fillOpacity=".09"/><path d="m178 173 129-63 146 41-133 76v128m-142-182-45-54 137-61 37 52m13 117 35-63 142-72-44 59m-146-41 40-50 137 39-31 52"/></g> : slug === "bookshelf" ? <g><path d="m160 95 220-30 65 42v221l-225 28-60-43z" fill="currentColor" fillOpacity=".06"/><path d="m160 95 60 42 225-30M220 137v219M330 122v220M380 65v222M220 181l225-28m-225 74 225-28m-225 74 225-28m-225 74 225-28M160 139l60 42m-60 2 60 44m-60 2 60 44m-60 2 60 44"/></g> : <g transform="translate(300 205) rotate(-25) skewX(28) scale(1 .65)">{Array.from({length:7},(_,r)=>Array.from({length:7},(_,c)=><rect key={`${r}-${c}`} x={c*45-158} y={r*36-120} width="42" height="33" fill="currentColor" fillOpacity={(r+c)%3 ? ".06" : ".2"}/>))}</g>}
  </svg>;
}

type Handle = {update: (state: LiteState) => void; release: () => void; resetView: () => void; setInteraction: (enabled:boolean) => void};
function changedState(state:LiteState,slug:LiteSlug,key:string,value:string|number):LiteState {
  if(slug==='cardbox'&&key==='style'){
    const item=cardboxCatalog.styles.find(item=>item.id===value);
    if(item)return {...state,style:value,width:item.dims[0],depth:item.dims[1],height:item.dims[2],top:item.top,bottom:item.bottom,open:0};
  }
  return {...state,[key]:value,...(key==='tile'?{pattern:'running'}:{})};
}
export function LitePreview({slug,locale}: {slug:LiteSlug;locale:Locale}) {
  const copy = text[locale];
  const labels = consoleCopy[locale];
  const extra = extraCopy[locale];
  const [collapsed,setCollapsed] = useState(false);
  const [tab,setTab] = useState('form');
  const [interacting,setInteracting] = useState(false);
  const interactionRef = useRef(false);
  const deckSwipe = useMobileDeckSwipe(setCollapsed);
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<Handle | null>(null);
  const [state,setState] = useState<LiteState>(() => ({...liteDefaults[slug]}));
  const stateRef = useRef(state);
  const [visible,setVisible] = useState(false);
  const [requested,setRequested] = useState(false);
  const [ready,setReady] = useState(false);
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [metrics,setMetrics] = useState<Record<string,number>>({});
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    const manual = matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)').matches || (navigator as Navigator & {connection?:{saveData?:boolean}}).connection?.saveData;
    const mobile = matchMedia('(max-width: 1050px), (pointer: coarse)').matches;
    setCollapsed(mobile);
    setInteracting(!mobile); interactionRef.current = !mobile;
    const observer = new IntersectionObserver(entries => {
      const onScreen = entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .25);
      setVisible(onScreen);
      if (onScreen && !manual) setRequested(true);
    },{threshold:[0,.25,.6]});
    // Controls are part of the preview: mobile browsers may scroll the model
    // above the fold while focusing a slider. Keep that active edit rendered.
    observer.observe(target.closest('.lite-preview') || target); return () => observer.disconnect();
  },[]);
  useEffect(() => {
    if (!visible || !requested || !host.current) return;
    let cancelled = false;
    let owned: Handle | null = null;
    let mountedState = stateRef.current;
    setFailed(false);
    void import('../lib/scenes/lite/runtime.js').then(runtime => { mountedState=stateRef.current; return runtime.mountPreview(host.current,slug,mountedState,{
      cancelled: () => cancelled,
      metrics: (value:Record<string,number>) => {if (!cancelled) setMetrics(value);},
      error: () => {if (!cancelled) {setFailed(true);setReady(false);}},
      released: () => {if (!cancelled) {setReady(false);setRequested(false);}},
    }); }).then(value => {
      if (cancelled) { value?.release(); return; }
      owned = value; handle.current = value;
      if (value) { if(mountedState!==stateRef.current)value.update(stateRef.current);value.setInteraction(interactionRef.current);setReady(true); }
      else setRequested(false);
    }).catch(() => {if (!cancelled) setFailed(true);});
    return () => { cancelled = true; owned?.release(); handle.current = null; setReady(false); };
  },[visible,requested,slug,attempt]);
  const change = (key:string,value:string|number) => {
    const next = changedState(state,slug,key,value);
    stateRef.current = next; setState(next); handle.current?.update(next);
    if (!requested) setRequested(true);
  };
  const select = (key:string,label:string,options:[string,string][]) => <PresetControl label={label} value={String(state[key])} options={options} onChange={value=>change(key,value)} />;
  const range = (key:string,label:string,min:number,max:number,step:number,unit:string) => <RangeControl label={label} value={Number(state[key])} min={min} max={max} step={step} unit={unit ? ` ${unit}` : ''} onChange={value=>change(key,value)} />;
  // The callback reaches the renderer ref only on click, never during render.
  // eslint-disable-next-line react-hooks/refs
  const colour = (key:string,label:string,options:[string,string][]) => <ColourControl label={label} value={String(state[key])} options={options} onChange={value=>change(key,value)} />;
  const metric = slug === 'chair' ? '500 × 470 × 790 mm' : slug === 'cardbox' ? `${(Number(state.width)*Number(state.depth)*Number(state.height)/1e6).toFixed(1)} L` : slug === 'bookshelf' ? `${state.count} ${copy.count.toLowerCase()} · ${Number(state.count)-1} ${copy.connections}` : `${(ready ? metrics.area || 0 : Number(state.length)*Number(state.width)).toFixed(2)} m²${ready ? ` · ${metrics.pieces || 0} ${copy.pieces}` : ''}`;
  return <div className={`lite-preview ${ready && !failed ? 'is-ready' : ''} ${collapsed ? 'is-deck-collapsed' : ''} ${interacting ? 'is-interacting' : ''}`} data-lite-product={slug}>
    <div className="lite-canvas" ref={host} aria-label={`${labels[slug]} 3D`}><Poster slug={slug}/></div>
    <div className="lite-preview-badge mono-label"><i/>{labels.preview} / {slug.toUpperCase()}</div>
    {ready && !failed && <div className="lite-view-tools"><span>{copy.hint}</span><button type="button" onClick={()=>handle.current?.resetView()} title={labels.reset} aria-label={labels.reset}>↺</button></div>}
    {ready && <MobileSceneActions active={interacting} locale={locale} onToggle={()=>{const next=!interacting;setInteracting(next);interactionRef.current=next;handle.current?.setInteraction(next);}} />}
    {(!ready || failed) && <div className="lite-activation"><button className="launch-link" type="button" onClick={()=>{setRequested(true);setAttempt(n=>n+1);}}>{failed ? copy.retry : requested && visible ? copy.loading : copy.start}<span>↗</span></button>{failed && <p role="status">{copy.error}</p>}</div>}
    <div className={`scene-controls scene-controls-panel instrument-console lite-instrument ${collapsed ? 'is-collapsed' : ''}`} aria-label={`${labels[slug]} ${labels.customize}`} data-lenis-prevent>
      <div className="console-header" {...deckSwipe}><span>{labels[slug]} / LIVE</span><b>{labels.form}</b><button className="console-collapse" type="button" onClick={()=>setCollapsed(value=>!value)} aria-expanded={!collapsed} aria-controls={`lite-controls-${slug}`}>{collapsed ? labels.customize : labels.hide}</button></div>
      <div className="console-body" id={`lite-controls-${slug}`} hidden={collapsed} inert={collapsed || undefined}>
        <div className="console-tabs" role="group" aria-label={labels.customize} style={{gridTemplateColumns:slug==='bookshelf'||slug==='tiles'||slug==='cardbox'?'repeat(3,minmax(0,1fr))':'1fr 1fr'}}>{(slug==='bookshelf'||slug==='tiles'||slug==='cardbox'?['form','finish','details']:['form','finish']).map(value=><button type="button" key={value} className={tab === value ? 'active' : ''} aria-pressed={tab===value} onClick={()=>setTab(value)}>{value==='details' ? slug==='tiles'?extra.site:extra.details : slug === 'chair' ? value === 'form' ? copy.wood : copy.weave : value==='form'?labels.form:labels.finish}</button>)}</div>
        {slug === 'chair' && (tab === 'form' ? <>{select('woodType',extra.wood,[['oak',extra.oak],['beech',extra.beech],['ash',extra.ash]])}{colour('wood',copy.wood,[['#be8851',labels.natural],['#70452e',labels.walnut],['#3e2b23',labels.espresso],['#1f1c1b',labels.black]])}</> : <>{colour('fabric',copy.fabric,[['#b88162',labels.clay],['#d8cbb9',labels.sand],['#40536b',labels.blue],['#6c7a68',labels.sage]])}{select('weave',copy.weave,[['linen',copy.linen],['velvet',copy.velvet]])}</>)}
        {slug === 'cardbox' && <CardboxLiteControls state={state} locale={locale} tab={tab} onChange={(key,value)=>change(key,value)}/>}
        {slug === 'bookshelf' && (tab === 'form' ? <>{select('family',copy.family,[['compact',copy.compact],['tall',copy.tall]])}<div className="lite-configuration-row">{select('layout',copy.layout,[['straight',copy.straight],['corner',copy.corner]])}{range('count',copy.count,2,4,1,'')}</div>{select('doors',copy.doors,[['open',copy.none],['lower',copy.lower],['glazed',copy.glazed]])}</> : tab==='finish' ? colour('colour',copy.colour,[['#b98555',labels.natural],['#65422d',labels.mahogany],['#34312f',labels.charcoal]]) : <>{select('shelves',extra.shelves,[['3',extra.sparse],['6',extra.balanced],['9',extra.dense]])}{select('hardware',extra.hardware,[['diamond',extra.diamond],['rectangle',extra.rectangle],['knob',extra.knob]])}{select('doorOpen',extra.doorPosition,[['closed',extra.closed],['open',extra.opened]])}</>)}
        {slug === 'tiles' && (tab === 'form' ? <><div className="scene-control-grid">{range('length',copy.length,1,4,.25,'m')}{range('width',copy.width,1,3,.25,'m')}</div>{select('tile',extra.tile,[['parket','Parket'],['square','Pătrat'],['granit','Granit']])}{select('pattern',copy.pattern,state.tile==='parket'?[['running',copy.running],['herringbone',copy.herringbone],['basket',copy.basket]]:[['running',copy.running],['stack',extra.stack]])}</> : tab==='finish' ? colour('colour',copy.colour,[['#969a98',labels.grey],['#a65343',labels.terracotta],['#414748',labels.charcoal]]) : <>{select('houseEnabled',extra.house,[['no',extra.off],['yes',extra.on]])}{state.houseEnabled==='yes' && <>{select('houseShape',extra.shape,[['rectangle',extra.rectangle],['l',copy.corner]])}<div className="scene-control-grid">{range('houseLength',extra.houseLength,1,2,.25,'m')}{range('houseWidth',extra.houseWidth,1,2,.25,'m')}{range('houseRotation',extra.rotation,0,90,15,'°')}</div></>}{select('curbs',extra.curbs,[['no',extra.off],['yes',extra.on]])}</>)}
      </div>
      <output className="lite-metrics" aria-live="polite">{metric}</output>
    </div>
  </div>;
}
