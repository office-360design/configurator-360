const COPY={
 'en-US':{title:'Ask for quotation',intro:'Send your contact details and current configuration to 360Configurator.',name:'Name',company:'Company (optional)',phone:'Phone number',email:'Email',shippingAddress:'Delivery / project address',quantity:'Number of configurations',send:'Send request',close:'Close',success:'Quotation request sent.',failure:'The request could not be sent. Please try again.',wait:'Please wait before sending another request.'},
 'ro-RO':{title:'Cere ofertă',intro:'Trimite datele de contact și configurația curentă către 360Configurator.',name:'Nume',company:'Companie (opțional)',phone:'Telefon',email:'E-mail',shippingAddress:'Adresă de livrare / proiect',quantity:'Număr de configurații',send:'Trimite solicitarea',close:'Închide',success:'Solicitarea de ofertă a fost trimisă.',failure:'Solicitarea nu a putut fi trimisă. Încearcă din nou.',wait:'Așteaptă înainte de a trimite o nouă solicitare.'},
 'de-DE':{title:'Angebot anfragen',intro:'Kontaktdaten und aktuelle Konfiguration an 360Configurator senden.',name:'Name',company:'Firma (optional)',phone:'Telefonnummer',email:'E-Mail',shippingAddress:'Liefer- / Projektadresse',quantity:'Anzahl der Konfigurationen',send:'Anfrage senden',close:'Schließen',success:'Angebotsanfrage gesendet.',failure:'Anfrage konnte nicht gesendet werden. Bitte erneut versuchen.',wait:'Bitte warten Sie vor einer weiteren Anfrage.'}
};
export const quotationLabel=locale=>(COPY[locale]||COPY['en-US']).title;
let busy=false,cooldown=0;
export async function openConfigurationQuotation(shell){
 if(document.querySelector('[data-configuration-quotation]'))return;
 const text=COPY[shell.state.locale]||COPY['en-US'];
 if(busy||Date.now()<cooldown){shell.showFeedback(text.wait,'error');return;}
 const dialog=document.createElement('dialog');dialog.className='configuration-quotation';dialog.dataset.configurationQuotation='';
 dialog.setAttribute('aria-labelledby','configurationQuotationTitle');
 dialog.innerHTML=`<header><h2 id="configurationQuotationTitle">${text.title}</h2><button type="button" data-close aria-label="${text.close}">×</button></header><p>${text.intro}</p><form></form>`;
 const form=dialog.querySelector('form'),draftKey=`360-configurator:${shell.productId}:quotation-draft-v1`;
 let draft={};try{draft=JSON.parse(localStorage.getItem(draftKey)||'{}')||{};}catch{}
 for(const key of ['name','company','phone','email','shippingAddress','quantity']){
  const label=document.createElement('label');label.textContent=text[key];const input=document.createElement(key==='shippingAddress'?'textarea':'input');
  input.name=key;input.required=key!=='company';input.maxLength=key==='shippingAddress'?1000:key==='email'?320:key==='company'?160:key==='phone'?60:120;
  if(key==='quantity'){input.type='number';input.min='1';input.max='100000';input.step='1';input.value=draft[key]||'1';}
  else {if(key!=='shippingAddress')input.type=key==='email'?'email':key==='phone'?'tel':'text';input.value=String(draft[key]||'');}
  if(key==='name')input.minLength=2;if(key==='shippingAddress')input.minLength=8;
  label.append(input);form.append(label);
 }
 const error=document.createElement('p');error.setAttribute('role','alert');form.append(error);
 const submit=document.createElement('button');submit.type='submit';submit.className='configuration-quotation__send';submit.textContent=text.send;form.append(submit);
 document.body.append(dialog);dialog.showModal();
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 form.addEventListener('input',()=>{try{localStorage.setItem(draftKey,JSON.stringify(Object.fromEntries(new FormData(form))));}catch{}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;if(Date.now()<cooldown){error.textContent=text.wait;return;}
  const customer=Object.fromEntries(new FormData(form));customer.quantity=Number(customer.quantity);
  if(!/^\+?[0-9().\s\/-]+$/.test(customer.phone)||customer.phone.replace(/\D/g,'').length<7||customer.phone.replace(/\D/g,'').length>15){form.elements.phone.setCustomValidity(text.phone);form.elements.phone.reportValidity();form.elements.phone.addEventListener('input',()=>form.elements.phone.setCustomValidity(''),{once:true});return;}
  busy=true;submit.disabled=true;error.textContent='';
  try{
   const configuration=await shell.options.callbacks.captureState?.();
   if(!configuration||typeof configuration!=='object')throw new Error('Missing configuration');
   const shareUrl=await shell.options.callbacks.getShareUrl?.()||'';
   const response=await fetch('https://europe-west1-configurator-360.cloudfunctions.net/requestConfigurationQuotation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{...customer,productId:shell.productId,locale:shell.state.locale,configuration,shareUrl}})});
   const result=await response.json();if(!response.ok||result.error){cooldown=Date.now()+Math.max(2,Number(result.error?.details?.retryAfterSeconds)||2)*1000;throw new Error('Request failed');}
   cooldown=Date.now()+30000;dialog.close();shell.showFeedback(text.success,'success',5000);
  }catch{error.textContent=text.failure;submit.disabled=false;}finally{busy=false;}
 });
}
