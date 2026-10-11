"use client";
import catalog from '../lib/cardbox-catalog.json';
import type {Locale} from '../lib/i18n';
import type {LiteState} from '../lib/lite-products';
import {RangeControl,PresetControl} from './scene-control-primitives';

export function CardboxLiteControls({state,locale,tab,onChange}:{state:LiteState;locale:Locale;tab:string;onChange:(key:string,value:string|number)=>void}) {
  const style=catalog.styles.find(item=>item.id===state.style)||catalog.styles[0];
  const copy=catalog.copy[locale] as Record<string,string>;
  const labels={en:['Box style','Width','Depth','Height','Inspect top opening','Paper composition'],ro:['Tip cutie','Lățime','Adâncime','Înălțime','Inspectează deschiderea de sus','Compoziție hârtie'],de:['Kartontyp','Breite','Tiefe','Höhe','Obere Öffnung ansehen','Papieraufbau']}[locale];
  if(tab==='form')return <div className="scene-option-group"><span className="control-section-label">{labels[0]}</span><div className="scene-preset-row cardbox-style-grid" role="group" aria-label={labels[0]}>{catalog.styles.map(item=><button type="button" key={item.id} aria-pressed={state.style===item.id} className={state.style===item.id?'active':''} onClick={()=>onChange('style',item.id)}><span aria-hidden="true" dangerouslySetInnerHTML={{__html:item.icon}}/><strong>{item.labels[locale]}</strong><small>FEFCO {item.code}</small></button>)}</div></div>;
  if(tab==='finish')return <div className="cardbox-paper"><PresetControl label={labels[5]} value={state.paper||'TFT'} options={['TFT','AFT','AFA'].map(id=>[id,`${id} · ${copy['board.'+id.toLowerCase()]}`])} onChange={value=>onChange('paper',value)}/></div>;
  return <>
    <div className="scene-control-grid">{(['width','depth','height'] as const).map((key,i)=><RangeControl key={key} label={labels[i+1]} value={Number(state[key])} min={[200,150,50][i]} max={[800,600,500][i]} step={10} unit=" mm" onChange={value=>onChange(key,value)}/>)}</div>
    {(['top','bottom'] as const).map(key=><label className="cardbox-closure" key={key}><span className="control-section-label">{copy['closure.'+key]}</span><select value={state[key]||style[key]} onChange={event=>onChange(key,event.target.value)}>{style[key==='top'?'topOptions':'bottomOptions'].map(value=><option key={value} value={value}>{copy['closure.'+value]||value}</option>)}</select></label>)}
    {state.top!=='open'&&<RangeControl label={labels[4]} value={Number(state.open)} min={0} max={100} step={1} unit="%" onChange={value=>onChange('open',value)}/>}
  </>;
}
