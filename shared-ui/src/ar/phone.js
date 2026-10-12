import { arT, arLocale } from './i18n.js?v=firebase-ar-10';
import { AR_SESSION_ID, AR_MODES, normalizeMode, requireProduct, arManifestUrl, arModelUrl, sceneViewerIntent } from './links.js?v=firebase-ar-10';
export function mountARPhone(product = 'hall') {
requireProduct(product);
const params = new URLSearchParams(location.search), locale = arLocale(params.get('lang'));
const mode=normalizeMode(params.get('mode')),id=params.get('id')||'';
const t=(key,vars)=>arT(product,locale,key,vars),q=id=>document.getElementById(id);
document.documentElement.lang=locale.split('-')[0];document.title=`${t('phoneTitle')} · AR`;
document.querySelectorAll('[data-copy]').forEach(el=>el.textContent=t(el.dataset.copy));
q('arPhoneHelp').textContent=t(mode==='ios'?'iosHelp':'androidHelp');
q('arPhoneLaunch').dataset.label=t('openAR');
q('arPhoneLaunch').setAttribute('aria-label',t('openAR'));
let controller=null,expiryTimer=0,generation=0;
async function load() {
  controller?.abort(); controller=new AbortController();clearTimeout(expiryTimer);
  const own=controller,run=++generation;
  const signal=own.signal,timeout=setTimeout(()=>own.abort(),20000);
  q('arPhoneLaunch').hidden=true;q('arPhoneLaunch').removeAttribute('href');q('arPhoneError').hidden=true;q('arPhoneRetry').hidden=true;
  q('arPhoneStatus').textContent=t('phoneLoading');
  try {
    if(!AR_SESSION_ID.test(id)){const e=new Error();e.code='badLink';throw e;}
    const response=await fetch(arManifestUrl(id),{signal,credentials:'omit',cache:'no-store'});
    let data;try{data=await response.json();}catch{const e=new Error();e.code='service-unavailable';throw e;}
    if(run!==generation)return;
    if(!response.ok || data.error){const e=new Error();e.code=data?.error?.code||'service-unavailable';throw e;}
    if(!(data.expiresAtMs>Date.now())){const e=new Error();e.code='expired';throw e;}
    if((data.product||'hall')!==product||data.id!==id||data.format!==AR_MODES[mode]){const e=new Error();e.code='wrongMode';throw e;}
    const launch=q('arPhoneLaunch'),model=arModelUrl(id,data.format,product);
    if(mode==='ios') {launch.setAttribute('rel','ar');launch.href=model+'#allowsContentScaling=1';}
    else {
      launch.removeAttribute('rel');const fallback=new URL(location.href);fallback.searchParams.set('fallback','1');
      launch.href=sceneViewerIntent(model,fallback.href,t('phoneTitle'));
    }
    launch.hidden=false;q('arPhoneStatus').textContent=t('phoneReady');
    if(params.get('fallback')==='1'){q('arPhoneError').hidden=false;q('arPhoneError').textContent=t('fallback');}
    q('arPhoneExpiry').textContent=t('expires',{time:new Date(data.expiresAtMs).toLocaleString(locale)});
    expiryTimer=setTimeout(()=>{launch.hidden=true;launch.removeAttribute('href');q('arPhoneError').hidden=false;q('arPhoneError').textContent=t('expired');q('arPhoneStatus').textContent='';},data.expiresAtMs-Date.now());
  }catch(error){
    if(run!==generation)return;
    q('arPhoneStatus').textContent='';q('arPhoneError').hidden=false;q('arPhoneError').textContent=t(error.code||'network');q('arPhoneRetry').hidden=false;
  }finally{clearTimeout(timeout);}
}
q('arPhoneRetry').addEventListener('click',()=>void load());
void load();

return { reload:load, destroy() { generation++;controller?.abort();clearTimeout(expiryTimer); } };
}
