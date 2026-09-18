import {test,before,after,beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createTestDatabase} from './local-database.js';
let db,product;
const owner='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const cashier='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pending='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
before(async()=>{db=await createTestDatabase();});
after(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`begin;
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
      ('${owner}','owner@example.invalid',now(),'{"name":"Owner"}'),
      ('${cashier}','cashier@example.invalid',now(),'{"name":"Cashier"}'),
      ('${pending}','pending@example.invalid',now(),'{"name":"Pending","role":"owner"}');
    update public.staff set role='owner',active=true where id='${owner}';
    update public.staff set role='kasir',active=true where id='${cashier}';
    set local role authenticated;
    select set_config('request.jwt.claim.sub','${owner}',true);
  `);
  product=(await db.query("select public.save_product(null,$1) id",[{name:'Test medicine',category:'obat',unit:'pcs',buyPrice:100,sellPrice:300,minStock:1,stock:0}])).rows[0].id;
});
afterEach(async()=>{await db.exec('rollback');});
const payload=(extra={})=>({invoiceNo:'TEST-001',invoiceDate:'2026-09-18',invoiceType:'no_tax',discountType:'nominal',discountValue:0,
  items:[{productId:product,batchNo:'PURCHASE-BATCH',expiry:'2035-01-01',qty:5,buyPrice:200,discountPercent:10,taxPercent:10}],...extra});
async function save(body=payload(),id=null,version=null,request=randomUUID()) {
  return (await db.query('select public.save_purchase($1,$2,$3,$4) doc',[request,id,version,body])).rows[0].doc;
}
async function cancel(doc,request=randomUUID()) {
  return (await db.query('select public.cancel_purchase($1,$2,$3,$4) doc',[request,doc.id,doc.version,'Salah input'])).rows[0].doc;
}
async function scalar(sql,args=[]) {return Object.values((await db.query(sql,args)).rows[0])[0];}
async function fails(action,pattern) {
  await db.exec('savepoint expected_failure');
  try {await assert.rejects(action,pattern);}
  finally {await db.exec('rollback to savepoint expected_failure; release savepoint expected_failure');}
}
test('purchase computes authoritative totals, links batches and uses actual line cost',async()=>{
  const doc=await save(payload({total:1,subtotal:1,items:[{...payload().items[0],costPrice:1,subtotal:1}]}));
  assert.equal(doc.total,990);assert.equal(doc.purchase_items[0].cost_price,198);
  assert.equal(await scalar('select cost_price from public.batches where id=$1',[doc.purchase_items[0].batch_id]),198);
  assert.equal(await scalar('select sum(qty) from public.batches'),5);
  assert.equal(await scalar('select buy_price from public.products where id=$1',[product]),200);
  await db.exec('reset role');assert.equal(await scalar('select count(*) from private.purchase_commands'),1);
});
test('late persistence failure rolls back invoice, items, stock, prices and command',async()=>{
  await db.exec(`reset role;
    create function public.test_reject_event() returns trigger language plpgsql as $$ begin raise exception 'injected late failure'; end $$;
    create trigger test_late_failure before insert on public.purchase_events for each row execute function public.test_reject_event();
    set local role authenticated;`);
  await fails(()=>save(),/injected late failure/);
  assert.equal(await scalar('select count(*) from public.purchase_invoices'),0);
  assert.equal(await scalar('select count(*) from public.batches'),0);
  assert.equal(await scalar('select buy_price from public.products where id=$1',[product]),100);
  await db.exec('reset role');assert.equal(await scalar('select count(*) from private.purchase_commands'),0);
});
test('invalid supplier or item leaves no invoice or receipt movements',async()=>{
  await fails(()=>save(payload({supplierId:'sup-1'})),/uuid/);
  await fails(()=>save(payload({items:[...payload().items,{...payload().items[0],productId:randomUUID()}]})),/Produk tidak ditemukan/);
  assert.equal(await scalar('select count(*) from public.stock_movements'),0);
  assert.equal(await scalar('select count(*) from public.purchase_items'),0);
});
test('queued duplicate requests create one receipt; reused request with different payload is rejected',async()=>{
  const request=randomUUID();
  // PGlite serializes connections: this checks replay semantics, not multi-session lock contention.
  const docs=await Promise.all(Array.from({length:5},()=>save(payload(),null,null,request)));
  assert.equal(new Set(docs.map(d=>d.id)).size,1);
  assert.equal(await scalar('select sum(qty) from public.batches'),5);
  await fails(()=>save(payload({invoiceNo:'OTHER'}),null,null,request),/sudah digunakan/);
});
test('duplicate supplier invoice number cannot add stock via a new request',async()=>{
  await save();await fails(()=>save(payload({invoiceNo:' test-001 '})),/Nomor faktur sudah digunakan/);
  assert.equal(await scalar('select sum(qty) from public.batches'),5);
});
test('edit changes batch metadata and cost with unchanged quantity, preserves events and rejects stale version',async()=>{
  const original=await save();
  const body=payload({items:[{...payload().items[0],batchNo:'CORRECTED',expiry:'2036-01-01',buyPrice:250}]});
  const updated=await save(body,original.id,original.version);
  assert.equal(updated.version,2);assert.equal(updated.purchase_items[0].batch_no,'CORRECTED');
  assert.equal(updated.purchase_items[0].cost_price,248);
  assert.equal(await scalar('select qty from public.batches where id=$1',[original.purchase_items[0].batch_id]),0);
  assert.equal(await scalar('select sum(qty) from public.batches'),5);
  assert.equal(await scalar('select count(*) from public.purchase_events'),2);
  await fails(()=>save(payload(),original.id,original.version),/perangkat lain/);
});
test('cancellation targets its receipt batch, retains invoice and is safe to repeat',async()=>{
  await db.query("select public.change_stock($1,'add',12,'OLDER','2030-01-01','Penerimaan stok')",[product]);
  const original=await save();const cancelled=await cancel(original);
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.purchase_items.length,1);
  assert.equal(await scalar("select qty from public.batches where batch_no='OLDER'"),12);
  assert.equal(await scalar('select qty from public.batches where id=$1',[original.purchase_items[0].batch_id]),0);
  await cancel(original);await cancel(cancelled);
  assert.equal(await scalar('select sum(qty) from public.batches'),12);
  assert.equal(await scalar("select count(*) from public.purchase_events where action='cancelled'"),1);
  await fails(()=>save(payload(),cancelled.id,cancelled.version),/dibatalkan/);
});
test('sale cost follows receipt; sold batch blocks cancel/cost edits but permits unchanged-item notes',async()=>{
  const original=await save();
  const saleId=await scalar("select public.checkout($1,$2,'nominal',0,'tunai',300)",[randomUUID(),[{productId:product,qty:1,price:300}]]);
  assert.equal(await scalar('select total_cost from public.sales where id=$1',[saleId]),198);
  await fails(()=>cancel(original),/sudah terjual/);
  await fails(()=>save(payload({items:[{...payload().items[0],buyPrice:250}]}),original.id,original.version),/sudah terjual/);
  const notes=await save(payload({notes:'Catatan administratif'}),original.id,original.version);
  assert.equal(notes.version,2);assert.equal(await scalar('select sum(qty) from public.batches'),4);
  assert.equal(await scalar('select total_cost from public.sales where id=$1',[saleId]),198);
});
test('initial stock saves batch/expiry and rejects missing or expired medicine dates',async()=>{
  const base={name:'Initial medicine',category:'obat',unit:'pcs',buyPrice:100,sellPrice:200,minStock:1,stock:3,batchNo:'OPENING'};
  await fails(()=>db.query('select public.save_product(null,$1)',[base]),/kedaluwarsa/);
  await fails(()=>db.query('select public.save_product(null,$1)',[{...base,expiry:'2020-01-01'}]),/kedaluwarsa/);
  const id=await scalar('select public.save_product(null,$1)',[{...base,expiry:'2035-02-01'}]);
  const b=(await db.query('select batch_no,expiry::text,qty from public.batches where product_id=$1',[id])).rows[0];
  assert.deepEqual(b,{batch_no:'OPENING',expiry:'2035-02-01',qty:3});
});
test('purchase rejects fractional quantities, missing expiry, invalid discounts and nonfinite values',async()=>{
  for(const patch of [{qty:1.5},{qty:0},{expiry:null},{expiry:'2020-01-01'},{discountPercent:101},{taxPercent:'NaN'},{buyPrice:-1}]) {
    await fails(()=>save(payload({items:[{...payload().items[0],...patch}]})),/valid|kedaluwarsa|positif/);
  }
  assert.equal(await scalar('select count(*) from public.purchase_invoices'),0);
});
test('legacy purchase stock commands and direct purchase writes are denied',async()=>{
  await fails(()=>db.query("select public.change_stock($1,'add',5,'BAD','2035-01-01','Faktur: OLD')",[product]),/Muat ulang aplikasi/);
  await fails(()=>db.exec('delete from public.purchase_invoices'),/permission denied/);
  await fails(()=>db.exec('truncate public.purchase_items'),/permission denied/);
});
test('owner purchase data is hidden from cashier, pending and anonymous roles',async()=>{
  await save();
  for(const user of [cashier,pending]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    assert.equal(await scalar('select count(*) from public.purchase_invoices'),0);
    assert.equal(await scalar('select count(*) from public.purchase_events'),0);
    await fails(()=>save(),/Akses pegawai/);
  }
  await db.exec('set local role anon');
  await fails(()=>save(),/permission denied/);
  await fails(()=>db.exec('select * from public.purchase_invoices'),/permission denied/);
});
test('supplier creation returns a real UUID and safely replays the same request',async()=>{
  const body={id:randomUUID(),name:'Supplier Test',phone:'',address:''};
  const a=await scalar('select public.save_supplier($1)',[body]);const b=await scalar('select public.save_supplier($1)',[body]);
  assert.equal(a.id,b.id);assert.equal(await scalar('select count(*) from public.suppliers'),1);
  const doc=await save(payload({supplierId:a.id,supplierName:'Forged name'}));assert.equal(doc.supplier_name,'Supplier Test');
});
test('existing FEFO, checkout, activation and import SQL fixtures still pass in a separate database',async()=>{
  const isolated=await createTestDatabase();
  try {for(const name of ['database.sql','import-and-activation.sql']) await isolated.exec(await readFile(new URL(name,import.meta.url),'utf8'));}
  finally {await isolated.close();}
});
