const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
function harness(){
 const records=new Map(),emails=[];
 const ref=path=>({id:path.split('/').at(-1),async get(){return {data:()=>records.get(path)};},async set(data,options){records.set(path,options?.merge?{...records.get(path),...data}:data);},async update(data){records.set(path,{...records.get(path),...data});}});
 const db={collection:name=>({doc:id=>ref(name+'/'+(id||'request-1'))}),runTransaction:async fn=>fn({get:r=>r.get(),set:(r,v)=>r.set(v)})};
 class HttpsError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details;}}
 const context=vm.createContext({exports:{},Buffer,URL,Date,console,require:name=>{
  if(name==='node:crypto')return require(name);
  if(name==='google-auth-library')return {GoogleAuth:class{}};
  if(name==='firebase-functions/v2/https')return {HttpsError,onCall:(options,fn)=>fn};
  if(name==='firebase-functions/logger')return {warn(){},info(){},error(){}};
  if(name==='firebase-admin/firestore')return {getFirestore:()=>db};
  throw new Error(name);
 }});
 vm.runInContext(fs.readFileSync('firebase-share-backend/functions/bookshelf-quotation.js','utf8'),context);
 context.mockSend=async value=>emails.push(value);vm.runInContext('sendEmail=mockSend',context);
 return {call:context.exports.requestConfigurationQuotation,emails,records,context};
}
const request=productId=>({rawRequest:{get:header=>header==='origin'?'https://www.360configurator.com':undefined,ip:'127.0.0.1'},data:{productId,name:'Test User',email:'test@example.com',phone:'+40722123456',shippingAddress:'Test Street 123',quantity:1,configuration:{version:1,example:true},locale:'en-US'}});
for(const product of ['window','roof','pergola','hall','solar','fence','cardbox','chair','tiles','gas'])test(`${product}: quote sends to team, confirms customer and preserves snapshot`,async()=>{
 const h=harness();const result=await h.call(request(product));assert.equal(result.success,true);assert.equal(h.emails.length,2);assert.equal(h.emails[0].to,'office@360configurator.com');assert.equal(h.emails[1].to,'test@example.com');assert.equal(JSON.parse(h.emails[0].attachment).productId,product);assert.equal(h.records.get('configurationQuotationRequests/request-1').status,'sent');await assert.rejects(h.call(request(product)),e=>e.code==='resource-exhausted');
});
test('invalid product, customer, snapshot and foreign share links never send',async()=>{
 for(const patch of [{productId:'bookshelf'},{productId:'unknown'},{email:'bad'},{quantity:0},{configuration:null},{shareUrl:'https://evil.example/test'},{configuration:{blob:'x'.repeat(800001)}}]){
 const h=harness(),r=request('tiles');Object.assign(r.data,patch);await assert.rejects(h.call(r));assert.equal(h.emails.length,0);
 }
});
test('JSON attachment is encoded as a separate MIME part',()=>{
 const h=harness();h.context.input={from:'office@example.com',to:'test@example.com',replyTo:'test@example.com',subject:'Quotation',text:'Hello',attachment:'{"version":1}'};
 const raw=vm.runInContext('encodeMimeMessage(input)',h.context);const decoded=Buffer.from(raw,'base64url').toString();assert.match(decoded,/multipart\/mixed/);assert.match(decoded,/filename="configuration.json"/);assert.match(decoded,new RegExp(Buffer.from('{"version":1}').toString('base64')));
});

test('footer keeps cart and quotation separate, and preserves quotation-only modes',()=>{
 class Element{
  constructor(){this.children=[];this.dataset={};this.classList={toggle(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(){this.children=[];}
  setAttribute(){}
  querySelector(selector){const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());for(const child of this.children){if(key in child.dataset)return child;const nested=child.querySelector(selector);if(nested)return nested;}return null;}
 }
 const context=vm.createContext({document:{createElement:()=>new Element()}});
 vm.runInContext(fs.readFileSync('shared-ui/src/components/configuratorPanel.js','utf8').replace('export function','function'),context);
 const render=context.renderConfiguratorPanelFooter,root=new Element();
 render(root,{quotationLabel:'Ask for quotation'});
 assert.equal(root.querySelector('[data-shared-panel-add-to-cart]').hidden,false);
 assert.equal(root.querySelector('[data-shared-panel-quotation]').textContent,'Ask for quotation');
 render(root,{quotationLabel:'Cere ofertă'});assert.equal(root.children.length,3);
 render(root,{quotationLabel:'Ask for quotation',showAddToCart:false});
 assert.equal(root.querySelector('[data-shared-panel-add-to-cart]').hidden,true);
 const bookshelf=new Element();render(bookshelf,{addToCartLabel:'Ask for quotation'});
 assert.equal(bookshelf.querySelector('[data-shared-panel-quotation]'),null);
 assert.equal(bookshelf.querySelector('[data-shared-panel-add-to-cart]').textContent,'Ask for quotation');
});
