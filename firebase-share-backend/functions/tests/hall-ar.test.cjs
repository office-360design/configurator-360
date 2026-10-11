'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const core = require('../hall-ar-core.cjs');
function glb(extra={}) {
  const json = {asset:{version:'2.0'},scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],buffers:[{byteLength:4}],...extra};
  const str=JSON.stringify(json),j=Buffer.from(str+' '.repeat((4-str.length%4)%4)),b=Buffer.alloc(12+8+j.length+12);
  b.writeUInt32LE(0x46546c67,0);b.writeUInt32LE(2,4);b.writeUInt32LE(b.length,8);b.writeUInt32LE(j.length,12);b.writeUInt32LE(0x4e4f534a,16);j.copy(b,20);b.writeUInt32LE(4,20+j.length);b.writeUInt32LE(0x004e4942,24+j.length);return b;
}
function crc32(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function usdz(text='#usda 1.0\n( metersPerUnit = 1 upAxis = "Y" )\ndef Xform "Root" {}\n'){
  const name=Buffer.from('model.usda'),data=Buffer.from(text),extra=Buffer.alloc(64-30-name.length),h=Buffer.alloc(30),dir=Buffer.alloc(46),end=Buffer.alloc(22);
  extra.writeUInt16LE(12345,0);extra.writeUInt16LE(extra.length-4,2);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt32LE(crc32(data),14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(name.length,26);h.writeUInt16LE(extra.length,28);
  dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt32LE(crc32(data),16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(name.length,28);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(dir.length+name.length,12);end.writeUInt32LE(64+data.length,16);
  return Buffer.concat([h,name,extra,data,dir,name,end]);
}
test('GLB: bounded self-contained glTF2 assets only',()=>{
  assert.equal(core.validateAsset('glb',glb()).format,'glb');
  for(const extra of [{buffers:[{byteLength:4,uri:'https://example.com/external.bin'}]},{asset:{version:'1.0'}},{images:[{uri:'secret.png'}]},{extensionsRequired:['KHR_draco_mesh_compression']}])assert.throws(()=>core.validateAsset('glb',glb(extra)),{code:'invalid-model'});
  assert.throws(()=>core.validateAsset('glb',Buffer.alloc(11*1024*1024)),{status:413});
  assert.throws(()=>core.validateAsset('exe',glb()),{status:400});
});
test('USDZ: aligned uncompressed archive; references remain inside archive',()=>{
  assert.equal(core.validateAsset('usdz',usdz()).format,'usdz');
  assert.throws(()=>core.validateAsset('usdz',usdz('#usda 1.0\nprepend references = @https://example.com/a.usda@')),{code:'invalid-model'});
  const compressed=usdz();compressed.writeUInt16LE(8,8);assert.throws(()=>core.validateAsset('usdz',compressed),{code:'invalid-model'});
  assert.throws(()=>core.validateAsset('usdz',Buffer.alloc(25*1024*1024)),{status:413});
});
test('Native viewer range and HEAD support / invalid-range rejects',()=>{
  assert.equal(core.parseRange('',100),null);assert.deepEqual(core.parseRange('bytes=10-20',100),{start:10,end:20});
  assert.deepEqual(core.parseRange('bytes=99-',100),{start:99,end:99});assert.deepEqual(core.parseRange('bytes=-10',100),{start:90,end:99});
  for(const value of ['bytes=-0','bytes=100-101','bytes=5-2','bytes=0-2,5-8','garbage'])assert.throws(()=>core.parseRange(value,100),{status:416});
});
test('Random-id constraints and count/byte limits',()=>{
  assert.equal(core.requireId('a'.repeat(32)),'a'.repeat(32));for(const id of ['../','a'.repeat(31),[],undefined])assert.throws(()=>core.requireId(id));
  assert.deepEqual(core.quotaDecision(undefined,5,2,10),{count:1,bytes:5});
  assert.throws(()=>core.quotaDecision({count:2,bytes:5},1,2,10),{status:429});assert.throws(()=>core.quotaDecision({count:1,bytes:9},2,2,10),{status:429});
});
function harness(){
  const docs=new Map(),files=new Map();let failSave=false,failCreate=false;const deletes=[];
  const ref=(col,id)=>({id,key:`${col}/${id}`,async get(){const value=docs.get(this.key);return{exists:value!==undefined,data:()=>value,id,ref:this};},async create(data){if(failCreate)throw Error('mock Firestore unavailable');docs.set(this.key,data);},async delete(){docs.delete(this.key);}});
  const db={collection(col){return{doc(id){return ref(col,id);},where(field,op,max){return{limit(limit){return{async get(){const rows=[...docs.entries()].filter(([k,v])=>k.startsWith(col+'/')&&v[field].toMillis()<=max.toMillis()).slice(0,limit).map(([k,v])=>({id:k.split('/')[1],data:()=>v,ref:ref(col,k.split('/')[1])}));return{empty:rows.length===0,docs:rows};}}}};} };},async runTransaction(fn){const writes=[];await fn({get:r=>r.get(),set:(r,v)=>writes.push([r.key,v])});for(const[k,v]of writes)docs.set(k,v);}};
  const storage={bucket(name){assert.equal(name,'configurator-360-hall-ar');return{file(key){return{async save(b,o){if(failSave)throw Error('mock storage unavailable');files.set(key,{b:Buffer.from(b),o});},async download(range){if(!files.has(key))throw Error('missing file');const b=files.get(key).b;return[range?.start!==undefined?b.subarray(range.start,range.end+1):b];},async delete(){deletes.push(key);files.delete(key);}};}};}};
  const Timestamp={fromMillis:ms=>({toMillis:()=>ms}),now:()=>Timestamp.fromMillis(Date.now())};
  const exports={};const requireReal=createRequire(path.join(__dirname,'../hall-ar.js'));
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../hall-ar.js'),'utf8'),{exports,Buffer,Date,console,require(name){
    if(name==='firebase-functions/v2/https')return{onRequest:(options,fn)=>fn};
    if(name==='firebase-functions/v2/scheduler')return{onSchedule:(options,fn)=>fn};
    if(name==='firebase-admin/firestore')return{getFirestore:()=>db,Timestamp};
    if(name==='firebase-admin/storage')return{getStorage:()=>storage};
    if(name==='firebase-functions/logger')return{info(){},error(){}};
    return requireReal(name);
  }});
  async function call(handler,{method='POST',format='glb',body=glb(),origin='https://www.360configurator.com',query={},range=''}={}){
    const headers={},res={statusCode:200,headersSent:false,status(n){this.statusCode=n;return this;},set(k,v){headers[k.toLowerCase()]=v;return this;},removeHeader(k){delete headers[k.toLowerCase()];},json(v){this.jsonBody=v;this.headersSent=true;return this;},end(v){this.body=v;this.headersSent=true;return this;},destroy(){throw Error('unexpected destroy');}};
    await exports[handler]({method,rawBody:body,query,ip:'198.51.100.1',get(n){return{'origin':origin,'content-type':'application/octet-stream','x-hall-ar-format':format,'range':range}[n.toLowerCase()];}},res);return{...res,headers};
  }
  return{call,exports,docs,files,deletes,Timestamp,setFailSave(v){failSave=v;},setFailCreate(v){failCreate=v;}};
}
test('Publish -> manifest -> full GET/HEAD/Range -> expiry -> cleanup',async()=>{
  const h=harness(),r=await h.call('publishHallAR');assert.equal(r.statusCode,201);const id=r.jsonBody.id;assert.equal(id.length,32);assert.equal(h.files.size,1);
  const manifest=await h.call('getHallAR',{method:'GET',query:{id}});assert.equal(manifest.jsonBody.format,'glb');
  const full=await h.call('getHallAR',{method:'GET',query:{id,asset:'1'}});assert.equal(full.headers['content-type'],'model/gltf-binary');assert.deepEqual(full.body,glb());
  const head=await h.call('getHallAR',{method:'HEAD',query:{id,asset:'1'}});assert.equal(head.statusCode,200);assert.equal(head.body,undefined);assert.equal(+head.headers['content-length'],glb().length);
  const partial=await h.call('getHallAR',{method:'GET',query:{id,asset:'1'},range:'bytes=0-11'});assert.equal(partial.statusCode,206);assert.equal(partial.body.length,12);
  const invalid=await h.call('getHallAR',{method:'GET',query:{id,asset:'1'},range:'bytes=999999-'});assert.equal(invalid.statusCode,416);assert.match(invalid.headers['content-range'],/^bytes \*\//);
  h.docs.get(`hallARSessions/${id}`).expiresAt=h.Timestamp.fromMillis(Date.now()-1);
  const expired=await h.call('getHallAR',{method:'GET',query:{id,asset:'1'}});assert.equal(expired.statusCode,410);
  await h.exports.cleanupHallAR();assert.equal(h.files.size,0);assert.equal(h.docs.has(`hallARSessions/${id}`),false);
});
test('iOS USDZ MIME + no public bucket/token leakage',async()=>{
  const h=harness(),r=await h.call('publishHallAR',{format:'usdz',body:usdz()});assert.equal(r.statusCode,201);
  assert.equal(r.jsonBody.objectPath,undefined);const result=await h.call('getHallAR',{method:'GET',query:{id:r.jsonBody.id,asset:'1'}});
  assert.equal(result.headers['content-type'],'model/vnd.usdz+zip');assert.match(result.headers['content-disposition'],/hall.usdz/);assert.equal(result.body.length,usdz().length);
});
test('Publication guards, budget, failed save and orphan cleanup',async()=>{
  const h=harness();assert.equal((await h.call('publishHallAR',{origin:'https://evil.invalid'})).statusCode,403);
  assert.equal((await h.call('publishHallAR',{method:'OPTIONS'})).statusCode,204);
  h.setFailSave(true);assert.equal((await h.call('publishHallAR')).statusCode,503);h.setFailSave(false);
  h.setFailCreate(true);assert.equal((await h.call('publishHallAR')).statusCode,503);assert.equal(h.files.size,0);h.setFailCreate(false);
  for(let i=0;i<10;i++)assert.equal((await h.call('publishHallAR')).statusCode,201);
  assert.equal((await h.call('publishHallAR')).statusCode,429);
});

test('Window GLB and USDZ reuse the private bucket with correct product/filename',async()=>{
  for(const format of ['glb','usdz']){
    const h=harness(),r=await h.call('publishHallAR',{format,body:format==='glb'?glb():usdz(),query:{product:'window'}});
    assert.equal(r.statusCode,201);assert.equal(r.jsonBody.product,'window');
    const id=r.jsonBody.id,record=h.docs.get(`hallARSessions/${id}`);
    assert.equal(record.objectPath,`hall-ar/v1/${id}/window.${format}`);
    const manifest=await h.call('getHallAR',{method:'GET',query:{id}});assert.equal(manifest.jsonBody.product,'window');
    const full=await h.call('getHallAR',{method:'GET',query:{id,asset:'1'}});assert.equal(full.statusCode,200);assert.match(full.headers['content-disposition'],new RegExp(`window.${format}`));
    assert.equal(full.body.length,r.jsonBody.byteLength);
    const partial=await h.call('getHallAR',{method:'GET',query:{id,asset:'1'},range:'bytes=0-63'});assert.equal(partial.statusCode,206);assert.equal(partial.body.length,64);
    record.expiresAt=h.Timestamp.fromMillis(Date.now()-1);await h.exports.cleanupHallAR();assert.equal(h.files.size,0);
  }
});
test('Tenant publication checks the requested product (including preflight)',async()=>{
  const h=harness();h.docs.set('tenants/example',{slug:'example',status:'active',configurators:{window:true,hall:false}});
  const origin='https://example.360configurator.com';
  assert.equal((await h.call('publishHallAR',{origin,query:{product:'window'},method:'OPTIONS'})).statusCode,204);
  assert.equal((await h.call('publishHallAR',{origin,query:{product:'window'}})).statusCode,201);
  assert.equal((await h.call('publishHallAR',{origin,query:{product:'hall'}})).statusCode,403);
  for(const product of ['bookshelf','pergola','../../secret','constructor',['window']])assert.equal((await h.call('publishHallAR',{origin,query:{product}})).statusCode,400);
  h.docs.get('tenants/example').status='suspended';assert.equal((await h.call('publishHallAR',{origin,query:{product:'window'}})).statusCode,403);
});
test('Mixed Hall/Window cleanup and forged stored paths cannot escape the AR prefix',async()=>{
  const h=harness(),hall=await h.call('publishHallAR'),window=await h.call('publishHallAR',{query:{product:'window'}});
  assert.equal(hall.jsonBody.product,'hall');assert.equal(window.jsonBody.product,'window');
  const a=h.docs.get(`hallARSessions/${hall.jsonBody.id}`),b=h.docs.get(`hallARSessions/${window.jsonBody.id}`);
  a.expiresAt=h.Timestamp.fromMillis(Date.now()-1);b.expiresAt=h.Timestamp.fromMillis(Date.now()-1);
  await h.exports.cleanupHallAR();assert.equal(h.files.size,0);assert.equal(h.deletes.length,2);
  const bad=await h.call('publishHallAR',{query:{product:'window'}}),record=h.docs.get(`hallARSessions/${bad.jsonBody.id}`);record.objectPath='private/customer-data';
  assert.equal((await h.call('getHallAR',{method:'GET',query:{id:bad.jsonBody.id,asset:'1'}})).statusCode,404);
  record.expiresAt=h.Timestamp.fromMillis(Date.now()-1);await h.exports.cleanupHallAR();assert.ok(!h.deletes.includes('private/customer-data'));
});
