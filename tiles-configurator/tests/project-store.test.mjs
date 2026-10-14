// Controlled IndexedDB-shaped transactions, NOT a browser/native-IDB substitute.
// Exercises the production wrapper's complete/abort/error and epoch semantics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectStore} from '../js/projectStore.js';
const turn=()=>new Promise(r=>setImmediate(r));
function harness(){
 let tx;
 const store=new ProjectStore({indexedDB:null});
 store.db={transaction(){tx={objectStore(){return {};},abort(){queueMicrotask(()=>tx.onabort())}};return tx;}};
 return {store,get tx(){return tx;}};
}
test('request success alone is not a completed save',async()=>{
 const h=harness();let finished=false;
 const promise=h.store.transaction(['projects'],'readwrite',(tx,set)=>set({id:'saved'})).then(v=>{finished=true;return v;});
 await turn();assert.equal(finished,false);h.tx.oncomplete();assert.deepEqual(await promise,{id:'saved'});
});
test('quota DOMExceptions become a useful message and reject the transaction',async()=>{
 const h=harness();const promise=h.store.transaction(['projects'],'readwrite',(_,set,abort)=>{set('incorrect-success');abort(new DOMException('Quota exceeded','QuotaExceededError'));});
 await assert.rejects(()=>promise,e=>e.code==='storageUnavailable' && /storage is full/.test(e.message));
});
test('explicit revision conflicts retain their application error code',async()=>{
 const h=harness();const promise=h.store.transaction(['projects'],'readwrite',(_,set,abort)=>abort(Object.assign(new Error('conflict'),{code:'projectConflict'})));
 await assert.rejects(()=>promise,e=>e.code==='projectConflict');
});
test('unexpected transaction setup exceptions reject instead of reporting success',async()=>{
 const h=harness();await assert.rejects(()=>h.store.transaction(['projects'],'readwrite',()=>{throw new Error('broken');}),/unavailable/);
});
test('storage unavailable fails cleanly without a dummy in-memory save',async()=>{
 const store=new ProjectStore({indexedDB:null});await assert.rejects(()=>store.open(),e=>e.code==='storageUnavailable');
});
test('clearing local data invalidates a pending async asset-verification write',async()=>{
 const h=harness();let operation;
 h.store.transaction=async(stores,mode,fn)=>{operation=fn;};
 await h.store.cacheAssets({});h.store.writeEpoch++;
 let error;
 operation({objectStore(){throw new Error('Must not write after clear')}},()=>{},e=>{error=e});
 assert.equal(error.code,'storageChanged');
});
test('blocked database opening is rejected and late connections are closed',async()=>{
 let request,closed=false;const store=new ProjectStore({indexedDB:{open(){return request={};}}});
 const opening=store.open();request.onblocked();await assert.rejects(()=>opening,e=>e.code==='storageBlocked');
 request.result={close(){closed=true}};request.onsuccess();assert.equal(closed,true);assert.equal(store.db,null);
});
