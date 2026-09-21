import {mappedFootprint} from './footprint.js';
export function mountLocationPicker({getState,onImport,t}){
  const $=id=>document.getElementById(id),dialog=$('houseMapDialog');let map,layers,selected,controller,searchController;
  const status=key=>$('houseMapStatus').textContent=t(key);
  function clear(){selected=null;$('houseMapUse').disabled=true;layers?.clearLayers();}
  async function buildings(lat,lon,label=''){
    controller?.abort();controller=new AbortController();const current=controller;clear();status('mapLoading');
    const timeout=setTimeout(()=>current.abort(),25000);
    try{
      let data;
      const endpoints=['/api/solar/overpass-primary','/api/solar/overpass-secondary'];
      if(['localhost','127.0.0.1'].includes(location.hostname))endpoints.push('https://overpass-api.de/api/interpreter');
      for(const endpoint of endpoints){
        try{
          const response=await fetch(endpoint,{method:'POST',signal:current.signal,headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:`[out:json][timeout:10];way["building"](around:100,${lat},${lon});out tags geom;`})});
          if(!response.ok)throw new Error('HTTP '+response.status);const payload=await response.json();if(!Array.isArray(payload.elements))throw new Error('Invalid response');data=payload;break;
        }catch(e){if(current.signal.aborted)throw e;}
      }
      if(current!==controller)return;if(!data)throw new Error('No data');
      let count=0;
      for(const element of data.elements||[]){
        const footprint=mappedFootprint(element.geometry);if(!footprint)continue;count++;
        const polygon=window.L.polygon(element.geometry.map(p=>[p.lat,p.lon]),{color:'#0878c9',weight:2,fillOpacity:.2,bubblingMouseEvents:false}).addTo(layers);
        polygon.on('click',event=>{
          window.L.DomEvent.stopPropagation(event);
          layers.eachLayer(layer=>layer.setStyle({color:'#0878c9',fillOpacity:.2}));polygon.setStyle({color:'#d17a00',fillOpacity:.5});
          selected={footprint,location:{lat,lon,label:label||element.tags?.name||`${lat.toFixed(5)}, ${lon.toFixed(5)}`}};
          $('houseMapUse').disabled=false;status('mapSelected');
        });
      }
      status(count?'mapChooseBuilding':'mapNoBuilding');
    }catch(e){if(current===controller&&dialog.open)status('mapFailed');}finally{clearTimeout(timeout);}
  }
  $('houseMapOpen').addEventListener('click',()=>{
    dialog.showModal();
    if(!window.L){status('mapFailed');return;}
    if(!map){
      map=window.L.map($('houseMap')).setView([44.4268,26.1025],16);
      window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}).addTo(map);
      layers=window.L.layerGroup().addTo(map);
      map.on('click',e=>buildings(e.latlng.lat,e.latlng.lng));
    }
    clear();status('mapHelp');const saved=getState().houseLocation;
    requestAnimationFrame(()=>{map.invalidateSize();if(saved){map.setView([saved.lat,saved.lon],18);void buildings(saved.lat,saved.lon,saved.label);}});
  });
  $('houseMapClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{controller?.abort();searchController?.abort();clear();});
  $('houseMapSearchForm').addEventListener('submit',async event=>{
    event.preventDefault();const q=$('houseMapAddress').value.trim();if(!q)return;
    searchController?.abort();searchController=new AbortController();const current=searchController;
    controller?.abort();controller=null;clear();$('houseMapResults').replaceChildren();status('mapSearching');
    const timeout=setTimeout(()=>current.abort(),15000);
    try{
      const response=await fetch('https://nominatim.openstreetmap.org/search?'+new URLSearchParams({q,format:'jsonv2',limit:'5'}),{signal:current.signal,headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('Search failed');const results=await response.json();
      if(current!==searchController||!dialog.open)return;
      for(const item of results){
        const lat=Number(item.lat),lon=Number(item.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))continue;
        const button=document.createElement('button');button.type='button';button.textContent=item.display_name;
        button.addEventListener('click',()=>{map?.setView([lat,lon],18);$('houseMapResults').replaceChildren();void buildings(lat,lon,item.display_name);});$('houseMapResults').append(button);
      }
      status(results.length?'mapChooseResult':'mapNoResults');
    }catch(e){if(current===searchController&&dialog.open)status('mapFailed');}finally{clearTimeout(timeout);}
  });
  $('houseMapUse').addEventListener('click',()=>{if(selected){onImport(selected);dialog.close();}});
}
