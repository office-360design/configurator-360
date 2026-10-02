import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../shared-ui/src/tenantProvisioningAdmin.js',import.meta.url),'utf8');
const sessionCode=source.slice(source.indexOf('async function loadAdminSession(user)'),source.indexOf('await observeGoogleAuth(loadAdminSession)'));
const plansCode=source.slice(source.indexOf('async function refreshPlanCatalog()'),source.indexOf('function normalizeUsageLimitInput'));
const user={uid:'test-admin',email:'admin@example.test'};
function setup(call){
 const element=()=>({hidden:false,disabled:false,textContent:'',value:'',replaceChildren(){this.value='';}});
 const c={adminSessionVersion:0,currentUser:null,planCatalogReady:false,tenantPlans:[],currentManagedTenant:null,tenantSummaries:[],calls:[],
 callAdminFunction:call,populatePlanSelect:(el,value)=>{el.value=value;},updatePlanHints:()=>{},
 refreshTenantList:async()=>c.calls.push('tenants'),refreshPlatformAnalytics:async()=>c.calls.push('analytics'),
 administrationErrorMessage:e=>e.message,setStatus:(el,message)=>{el.textContent=message;},
 ...Object.fromEntries(['createPlan','managePlan','createButton','adminWorkspace','tenantEditorCard','retryAdminAccess','authState','authButton','formStatus'].map(k=>[k,element()]))};
 vm.createContext(c);vm.runInContext(plansCode+'\n'+sessionCode,c);return c;
}
test('permission rejection shows the actual error and prevents empty-plan submission',async()=>{
 const c=setup(async()=>{throw Error('This account is not authorized to provision tenants.');});
 await c.loadAdminSession(user);
 assert.match(c.authState.textContent,/not authorized/);assert.equal(c.adminWorkspace.hidden,true);assert.equal(c.createButton.disabled,true);assert.equal(c.retryAdminAccess.hidden,false);assert.equal(c.planCatalogReady,false);assert.equal(c.calls.length,0);
});
test('empty plan response fails closed rather than exposing an invalid dropdown',async()=>{
 const c=setup(async()=>({plans:[]}));await c.loadAdminSession(user);
 assert.match(c.authState.textContent,/No tenant plans/);assert.equal(c.createButton.disabled,true);
});
test('retry after successful authorization enables the form',async()=>{
 let allowed=false;const c=setup(async()=>{if(!allowed)throw Error('Denied');return {plans:[{id:'go_live_now_1'}]};});
 await c.loadAdminSession(user);allowed=true;await c.loadAdminSession(user);
 assert.equal(c.planCatalogReady,true);assert.equal(c.createButton.disabled,false);assert.equal(c.adminWorkspace.hidden,false);assert.equal(c.retryAdminAccess.hidden,true);assert.equal(c.createPlan.value,'go_live_now_1');assert.equal(c.calls.length,2);
});
test('late response after sign-out cannot expose the workspace or restore plan options',async()=>{
 let finish;const c=setup(()=>new Promise(resolve=>{finish=resolve;}));const pending=c.loadAdminSession(user);
 await c.loadAdminSession(null);finish({plans:[{id:'go_live_now_1'}]});await pending;
 assert.equal(c.adminWorkspace.hidden,true);assert.equal(c.planCatalogReady,false);assert.equal(c.createButton.disabled,true);assert.equal(c.createPlan.value,'');assert.equal(c.calls.length,0);
});
