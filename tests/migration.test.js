import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTestDatabase} from './local-database.js';

test('legacy receipt backfill links only unambiguous evidence and preserves all business values',async()=>{
  let snapshot;
  const invoices=[],batches=[];
  const snapshotQuery=`select
    (select jsonb_agg(to_jsonb(p) order by id) from public.products p) products,
    (select jsonb_agg(to_jsonb(b) order by id) from public.batches b) batches,
    (select jsonb_agg(to_jsonb(m)-'purchase_invoice_id' order by id) from public.stock_movements m) movements,
    (select jsonb_agg(to_jsonb(i)-'batch_id' order by id) from public.purchase_items i) items`;
  const db=await createTestDatabase({beforeMigration:async(file,db)=>{
    if(!file.endsWith('_atomic_purchase_integrity.sql')) return;
    const product=randomUUID();
    await db.query("insert into public.products(id,name,category,unit,buy_price,sell_price) values($1,'Legacy medicine','obat','pcs',100,200)",[product]);
    for(const [index,number] of ['UNIQUE','AMBIGUOUS','SHARED-ONE','SHARED-TWO','NO-EVIDENCE'].entries()) {
      const id=randomUUID();invoices.push(id);
      const batchNo=index>=2&&index<=3?'SHARED':number;
      await db.query("insert into public.purchase_invoices(id,invoice_no,supplier_name,subtotal,total,created_at) values($1,$2,'Umum',500,500,'2026-09-15T10:00:00Z')",[id,number]);
      await db.query("insert into public.purchase_items(invoice_id,product_id,product_name,batch_no,expiry,qty,unit,buy_price,cost_price,subtotal) values($1,$2,'Legacy medicine',$3,'2027-01-01',5,'pcs',100,100,500)",[id,product,batchNo]);
      if(index!==3) {
        for(let j=0;j<(index===1?2:1);j++) {
          const bid=randomUUID();batches.push(bid);
          await db.query("insert into public.batches(id,product_id,batch_no,expiry,qty,cost_price) values($1,$2,$3,'2027-01-01',5,100)",[bid,product,batchNo]);
          if(index!==4) await db.query("insert into public.stock_movements(product_id,batch_id,delta,note,created_at) values($1,$2,5,$3,'2026-09-15T09:59:00Z')",[product,bid,`Faktur: ${number}`]);
        }
      } else {
        await db.query("insert into public.stock_movements(product_id,batch_id,delta,note,created_at) values($1,$2,5,$3,'2026-09-15T09:59:00Z')",[product,batches.at(-1),`Faktur: ${number}`]);
      }
    }
    snapshot=(await db.query(snapshotQuery)).rows;
  }});
  try {
    assert.deepEqual((await db.query(snapshotQuery)).rows,snapshot);
    const items=(await db.query('select invoice_id,batch_id from public.purchase_items order by id')).rows;
    assert.equal(items[0].batch_id,batches[0]);
    assert.ok(items.slice(1).every(i=>i.batch_id===null));
    assert.equal((await db.query('select count(*) n from public.purchase_events')).rows[0].n,5);
  } finally {await db.close();}
});
