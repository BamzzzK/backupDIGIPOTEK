import {test,mock,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

const dom=new Window({url:'http://localhost/'});
Object.assign(globalThis,{window:dom,localStorage:dom.localStorage,sessionStorage:dom.sessionStorage});
let profile,queryHandler,rpcHandler,requests,queries;
const ok=data=>({data,error:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const row=(id='server-1')=>({id,version:1,invoice_no:id,invoice_date:'2026-09-18',status:'completed',total:100,purchase_items:[]});
const client={
  supabaseUrl:'https://test-project.invalid',
  auth:{getUser:async()=>ok({user:{id:profile.id}}),signOut:async()=>ok(null),onAuthStateChange:()=>{}},
  rpc:async(method,args)=>{requests.push({method,args});return rpcHandler(method,args);},
  from(table) {
    const query={table,operations:[]};
    const builder=new Proxy({}, {get(_target,method){
      if(method==='then') return (resolve,reject)=>{
        queries.push(query);
        Promise.resolve(table==='staff'?ok({...profile}):queryHandler(query)).then(resolve,reject);
      };
      return (...args)=>{query.operations.push([method,...args]);return builder;};
    }});
    return builder;
  }
};
await mock.module('../src/supabase.js',{namedExports:{supabase:client}});
const {auth,purchases,suppliers}=await import('../src/store.js');
beforeEach(async()=>{
  await auth.logout();localStorage.clear();sessionStorage.clear();requests=[];queries=[];
  profile={id:'owner-a',role:'owner',active:true,name:'Owner A'};
  queryHandler=()=>ok([]);rpcHandler=()=>ok(row());
  await auth.refresh();
});
afterEach(()=>dom.happyDOM.abort());

test('server errors never invent successful invoices or supplier IDs',async()=>{
  rpcHandler=()=>({data:null,error:{code:'P0001',message:'Ditolak server'}});
  await assert.rejects(()=>purchases.add({invoiceNo:'FAIL'}),/Ditolak server/);
  assert.deepEqual(purchases.getAll(),[]);assert.equal(purchases.pending(),null);
  await assert.rejects(()=>suppliers.add({name:'Supplier'}),/Ditolak server/);
  assert.deepEqual(suppliers.getAll(),[]);
});
test('unknown network outcome persists exact command and retry uses same UUID',async()=>{
  rpcHandler=()=>{throw new Error('Network interrupted');};
  await assert.rejects(()=>purchases.add({invoiceNo:'RETRY'}),/Network interrupted/);
  const pending=purchases.pending();assert.ok(pending.args.request_id);
  await assert.rejects(()=>purchases.add({invoiceNo:'DIFFERENT'}),/belum terkonfirmasi/);
  assert.equal(requests.length,1);
  rpcHandler=()=>ok(row('RETRY'));
  await purchases.retryPending();
  assert.deepEqual(requests[1],requests[0]);assert.equal(purchases.pending(),null);
  assert.equal(purchases.getAll().length,1);
});
test('double submission shares one RPC and inventory refresh failure retains confirmed invoice',async()=>{
  const response=deferred();rpcHandler=()=>response.promise;
  const first=purchases.add({invoiceNo:'ONCE'}),second=purchases.add({invoiceNo:'ONCE'});
  assert.equal(requests.length,1);
  queryHandler=()=>({data:null,error:{message:'Inventory unavailable'}});
  response.resolve(ok(row('ONCE')));
  const [a,b]=await Promise.all([first,second]);
  assert.equal(a,b);assert.equal(a.inventoryRefreshFailed,true);
  assert.equal(purchases.getAll().length,1);assert.equal(purchases.pending(),null);
});
test('server empty list stays authoritative; old browser data is export-only',async()=>{
  localStorage.setItem('dp_purchases','[{"id":"ghost","invoiceNo":"OLD"}]');
  localStorage.setItem('dp_suppliers','broken legacy JSON');
  assert.deepEqual(await purchases.loadRange('2026-01-01','2026-12-31'),[]);
  assert.deepEqual(await suppliers.load(),[]);
  assert.equal(purchases.exportLegacy().suppliers,'broken legacy JSON');
  assert.equal(purchases.hasLegacyLocalData(),true);
});
test('purchase range pages beyond 500 and filters invoice date rather than creation date',async()=>{
  queryHandler=query=>{
    const range=query.operations.find(op=>op[0]==='range');
    return ok(range[1]===0?Array.from({length:500},(_,i)=>row(`inv-${i}`)):[row('last')]);
  };
  const invoices=await purchases.loadRange('2026-09-01','2026-09-30');
  assert.equal(invoices.length,501);
  const pages=queries.filter(q=>q.table==='purchase_invoices');
  assert.deepEqual(pages.map(q=>q.operations.find(op=>op[0]==='range')), [['range',0,499],['range',500,999]]);
  assert.ok(pages.every(q=>q.operations.some(op=>JSON.stringify(op)===JSON.stringify(['gte','invoice_date','2026-09-01']))));
  assert.ok(pages.every(q=>q.operations.some(op=>JSON.stringify(op)===JSON.stringify(['lte','invoice_date','2026-09-30']))));
});
test('slow earlier read cannot replace a newer filtered result',async()=>{
  const older=deferred();let reads=0;
  queryHandler=()=>++reads===1?older.promise:ok([row('newer')]);
  const first=purchases.loadRange('2026-09-01','2026-09-30');
  await Promise.resolve();
  await purchases.loadRange('2026-09-18','2026-09-18');
  older.resolve(ok([row('older')]));await first;
  assert.deepEqual(purchases.getAll().map(p=>p.id),['newer']);
});
test('logout blocks late response cache writes and pending commands stay account scoped',async()=>{
  const response=deferred();rpcHandler=()=>response.promise;
  const saving=purchases.add({invoiceNo:'OLD-ACCOUNT'});
  const aPending=purchases.pending();await auth.logout();
  profile={id:'owner-b',role:'owner',active:true};await auth.refresh();
  assert.equal(purchases.pending(),null);
  response.resolve(ok(row('old-account')));
  await assert.rejects(()=>saving,/Sesi berubah/);
  assert.deepEqual(purchases.getAll(),[]);
  assert.equal(sessionStorage.getItem(`apotek:${client.supabaseUrl}:owner-a:purchase-command`),null);
  assert.ok(aPending.args.request_id);
  profile={id:'cashier',role:'kasir',active:true};await auth.refresh();
  await assert.rejects(()=>purchases.loadRange('2026-09-01','2026-09-30'),/pemilik/);
  assert.deepEqual(suppliers.getAll(),[]);
});
