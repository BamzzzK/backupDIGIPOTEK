-- Cashiers may receive stock and create purchases; revisions/cancellations stay owner-only.
-- No historical quantities, prices, invoices, sales, or staff roles are modified.

drop policy suppliers_owner_read on public.suppliers;
create policy suppliers_staff_read on public.suppliers for select to authenticated
 using((select private.staff_role()) in ('owner','kasir'));

drop policy purchases_owner_read on public.purchase_invoices;
create policy purchases_staff_read on public.purchase_invoices for select to authenticated
 using((select private.staff_role())='owner' or
   ((select private.staff_role())='kasir' and officer_id=(select auth.uid())));

drop policy purchase_items_owner_read on public.purchase_items;
create policy purchase_items_staff_read on public.purchase_items for select to authenticated
 using(exists(select 1 from public.purchase_invoices p where p.id=purchase_items.invoice_id));

-- This private helper bypasses RLS, so mirror the same document ownership check explicitly.
create or replace function private.purchase_document(invoice_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_staff(false);
 if not exists(select 1 from public.purchase_invoices p where p.id=purchase_document.invoice_id
   and (private.staff_role()='owner' or p.officer_id=auth.uid())) then
  raise exception 'Akses faktur tidak diizinkan' using errcode='42501';
 end if;
 return (select to_jsonb(p)||jsonb_build_object('purchase_items',
   coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.purchase_items i where i.invoice_id=p.id),'[]'::jsonb))
   from public.purchase_invoices p where p.id=purchase_document.invoice_id);
end $$;

create or replace function private.save_purchase(request_id uuid, invoice_id uuid, expected_version integer, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
<<purchase_data>>
declare
 uid uuid; pid uuid; sid uuid; supplier_name text; officer text; invno text;
 existing public.purchase_invoices; command private.purchase_commands; h text;
 product_row public.products; i jsonb; old record; bid uuid; stock_changed boolean;
 prepared jsonb:='[]'; old_items jsonb; result jsonb;
 quantity integer; price bigint; disc numeric; tax numeric; unit_cost numeric; line_total bigint;
 subtotal bigint:=0; discount_amount bigint; discount_value numeric; cashback bigint; fees bigint; total bigint; tax_amount bigint; tax_percent numeric;
 discount_type text; invoice_type text; payment_type text; payment_term integer; invoice_date date; due_date date; received_at timestamptz;
begin
 uid:=private.require_staff(invoice_id is not null);
 if request_id is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1048576 then raise exception 'Permintaan faktur tidak valid'; end if;
 h:=encode(sha256(convert_to(jsonb_build_object('operation','save','invoice',invoice_id,'version',expected_version,'payload',payload)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||request_id::text,0));
 select * into command from private.purchase_commands c where c.request_id=save_purchase.request_id;
 if found then
  if command.actor_id<>uid or command.command_hash<>h then raise exception 'ID permintaan sudah digunakan untuk data lain' using errcode='22023'; end if;
  return private.purchase_document(command.invoice_id);
 end if;

 if invoice_id is not null then
  select * into existing from public.purchase_invoices p where p.id=invoice_id for update;
  if not found then raise exception 'Faktur tidak ditemukan'; end if;
  if existing.status<>'completed' then raise exception 'Faktur yang dibatalkan tidak dapat diubah'; end if;
  if expected_version is distinct from existing.version then raise exception 'Faktur sudah diperbarui di perangkat lain. Muat ulang dahulu.' using errcode='40001'; end if;
 end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 200 then raise exception 'Faktur harus berisi 1-200 item'; end if;
 invno:=trim(payload->>'invoiceNo');
 if invno is null or length(invno) not between 1 and 150 then raise exception 'Nomor faktur wajib diisi (maksimal 150 karakter)'; end if;
 sid:=nullif(payload->>'supplierId','')::uuid;
 supplier_name:='Umum';
 if sid is not null then
  select s.name into supplier_name from public.suppliers s where s.id=sid;
  if not found then raise exception 'Supplier belum tersimpan. Tambahkan supplier terlebih dahulu.'; end if;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('invoice-number:'||coalesce(sid::text,'')||':'||lower(invno),0));
 if exists(select 1 from public.purchase_invoices p where coalesce(p.supplier_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(sid,'00000000-0000-0000-0000-000000000000'::uuid) and lower(trim(p.invoice_no))=lower(invno) and p.id is distinct from invoice_id) then
  raise exception 'Nomor faktur sudah digunakan untuk supplier ini';
 end if;

 -- Same lock order as checkout/change_stock. Also lock products removed by an edit.
 for pid in select id from (
   select (x->>'productId')::uuid id from jsonb_array_elements(payload->'items') x
   union select pi.product_id from public.purchase_items pi where pi.invoice_id=save_purchase.invoice_id
 ) ids order by id loop
  perform 1 from public.products where id=pid for update;
 end loop;

 for i in select value from jsonb_array_elements(payload->'items') loop
  quantity:=private.purchase_number(i,'qty',1000000,true)::integer;
  price:=private.purchase_number(i,'buyPrice',1000000000000,true)::bigint;
  disc:=private.purchase_number(i,'discountPercent',100);
  tax:=private.purchase_number(i,'taxPercent',100);
  if quantity<=0 then raise exception 'Kuantitas harus berupa bilangan bulat positif'; end if;
  select * into product_row from public.products where id=(i->>'productId')::uuid and not deleted;
  if not found then raise exception 'Produk tidak ditemukan atau sudah dihapus'; end if;
  if length(coalesce(trim(i->>'batchNo'),'')) not between 1 and 150 then raise exception 'Nomor batch wajib diisi'; end if;
  if nullif(i->>'expiry','') is not null then perform (i->>'expiry')::date; end if;
  unit_cost:=price*(1-disc/100)*(1+tax/100);
  line_total:=round(unit_cost*quantity)::bigint;
  subtotal:=subtotal+line_total;
  prepared:=prepared||jsonb_build_array(jsonb_build_object(
   'product_id',product_row.id,'product_name',product_row.name,'batch_no',trim(i->>'batchNo'),
   'expiry',nullif(i->>'expiry','')::date,'qty',quantity,'unit',product_row.unit,'buy_price',price,
   'discount_percent',disc,'tax_percent',tax,'cost_price',round(unit_cost)::bigint,'subtotal',line_total));
 end loop;
 if subtotal>9000000000000000 then raise exception 'Nilai faktur terlalu besar'; end if;
 select coalesce(jsonb_agg(to_jsonb(pi)-'id'-'invoice_id'-'batch_id' order by pi.id),'[]') into old_items
 from public.purchase_items pi where pi.invoice_id=save_purchase.invoice_id;
 stock_changed:=invoice_id is null or old_items is distinct from prepared;

 if stock_changed then
  for old in select pi.*,b.qty remaining from public.purchase_items pi left join public.batches b on b.id=pi.batch_id where pi.invoice_id=save_purchase.invoice_id loop
   if old.batch_id is null then raise exception 'Batch faktur lama belum terverifikasi. Perlu pencocokan sebelum revisi stok.'; end if;
   if old.remaining<>old.qty or exists(select 1 from public.stock_movements m where m.batch_id=old.batch_id and m.sale_id is not null) then
    raise exception 'Batch % sudah terjual atau disesuaikan. Gunakan koreksi tercatat setelah pencocokan stok.',old.batch_no;
   end if;
  end loop;
  for i in select value from jsonb_array_elements(prepared) loop
   if i->>'expiry' is null and exists(select 1 from public.products p where p.id=(i->>'product_id')::uuid and p.category='obat') then raise exception 'Tanggal kedaluwarsa obat wajib diisi'; end if;
   if (i->>'expiry')::date < (now() at time zone 'Asia/Jakarta')::date then raise exception 'Batch sudah kedaluwarsa'; end if;
  end loop;
 end if;

 discount_type:=coalesce(payload->>'discountType','nominal');
 invoice_type:=coalesce(payload->>'invoiceType','exclude_tax');
 payment_type:=coalesce(payload->>'paymentType','kredit');
 if discount_type not in ('nominal','persen') or invoice_type not in ('exclude_tax','include_tax','no_tax') or payment_type not in ('kredit','tunai','transfer') then raise exception 'Jenis faktur, diskon, atau pembayaran tidak valid'; end if;
 discount_value:=private.purchase_number(payload,'discountValue',case when discount_type='persen' then 100 else subtotal end,discount_type='nominal');
 discount_amount:=case when discount_type='persen' then round(subtotal*discount_value/100)::bigint else discount_value::bigint end;
 cashback:=private.purchase_number(payload,'cashback',9000000000000000,true)::bigint;
 fees:=private.purchase_number(payload,'otherFees',9000000000000000,true)::bigint;
 -- Preserve the existing invoice-level tax rule; per-item costs use their own tax/discount.
 tax_percent:=case when invoice_type='exclude_tax' then 11 else 0 end;
 tax_amount:=round((subtotal-discount_amount)*tax_percent/100)::bigint;
 total:=subtotal-discount_amount-cashback+fees+tax_amount;
 if total<0 or total>9000000000000000 then raise exception 'Total faktur tidak valid; periksa cashback dan biaya'; end if;
 payment_term:=private.purchase_number(payload,'paymentTerm',3650,true)::integer;
 invoice_date:=coalesce(nullif(payload->>'invoiceDate','')::date,(now() at time zone 'Asia/Jakarta')::date);
 due_date:=coalesce(nullif(payload->>'dueDate','')::date,invoice_date+payment_term);
 received_at:=coalesce(nullif(payload->>'receivedAt','')::timestamptz,now());
 if due_date<invoice_date then raise exception 'Jatuh tempo tidak boleh sebelum tanggal faktur'; end if;
 if length(coalesce(payload->>'notes',''))>5000 or length(coalesce(payload->>'orderNo',''))>150 or length(coalesce(payload->>'warehouse',''))>150 then raise exception 'Keterangan faktur terlalu panjang'; end if;
 if coalesce(payload->>'pkpStatus','non_pkp') not in ('pkp','non_pkp') then raise exception 'Status PKP tidak valid'; end if;
 select s.name into officer from public.staff s where s.id=uid;

 if invoice_id is null then
  insert into public.purchase_invoices(invoice_no,supplier_name,officer_id,officer_name,subtotal,total)
  values(invno,supplier_name,uid,officer,subtotal,total) returning id into invoice_id;
 else
  update public.purchase_invoices p set version=p.version+1 where p.id=invoice_id;
 end if;
 update public.purchase_invoices p set
  invoice_no=invno,order_no=coalesce(trim(payload->>'orderNo'),''),supplier_id=sid,supplier_name=purchase_data.supplier_name,
  invoice_date=purchase_data.invoice_date,received_at=purchase_data.received_at,invoice_type=purchase_data.invoice_type,
  warehouse=coalesce(nullif(trim(payload->>'warehouse'),''),'Gudang Utama'),payment_type=purchase_data.payment_type,
  payment_term=purchase_data.payment_term,due_date=purchase_data.due_date,subtotal=purchase_data.subtotal,
  discount_type=purchase_data.discount_type,discount_value=purchase_data.discount_value,discount_amount=purchase_data.discount_amount,
  cashback=purchase_data.cashback,other_fees=fees,tax_percent=purchase_data.tax_percent,tax_amount=purchase_data.tax_amount,
  total=purchase_data.total,notes=coalesce(payload->>'notes',''),pkp_status=coalesce(payload->>'pkpStatus','non_pkp'),updated_at=now()
 where p.id=invoice_id;

 if stock_changed then
  for old in select * from public.purchase_items pi where pi.invoice_id=save_purchase.invoice_id loop
   update public.batches set qty=0 where id=old.batch_id;
   insert into public.stock_movements(product_id,batch_id,actor_id,delta,note,purchase_invoice_id)
    values(old.product_id,old.batch_id,uid,-old.qty,'Revisi faktur: '||invno,invoice_id);
  end loop;
  delete from public.purchase_items pi where pi.invoice_id=save_purchase.invoice_id;
  for i in select value from jsonb_array_elements(prepared) loop
   insert into public.batches(product_id,batch_no,expiry,qty,cost_price)
    values((i->>'product_id')::uuid,i->>'batch_no',(i->>'expiry')::date,(i->>'qty')::integer,(i->>'cost_price')::bigint) returning id into bid;
   insert into public.purchase_items(invoice_id,product_id,product_name,batch_id,batch_no,expiry,qty,unit,buy_price,discount_percent,tax_percent,cost_price,subtotal)
    values(invoice_id,(i->>'product_id')::uuid,i->>'product_name',bid,i->>'batch_no',(i->>'expiry')::date,(i->>'qty')::integer,i->>'unit',(i->>'buy_price')::bigint,(i->>'discount_percent')::numeric,(i->>'tax_percent')::numeric,(i->>'cost_price')::bigint,(i->>'subtotal')::bigint);
   insert into public.stock_movements(product_id,batch_id,actor_id,delta,note,purchase_invoice_id)
    values((i->>'product_id')::uuid,bid,uid,(i->>'qty')::integer,'Penerimaan faktur: '||invno,invoice_id);
   update public.products set buy_price=(i->>'buy_price')::bigint,updated_at=now() where id=(i->>'product_id')::uuid;
  end loop;
 end if;
 result:=private.purchase_document(invoice_id);
 insert into public.purchase_events(invoice_id,version,actor_id,action,snapshot)
 values(invoice_id,(result->>'version')::integer,uid,case when existing.id is null then 'created' else 'updated' end,result);
 insert into private.purchase_commands(request_id,invoice_id,actor_id,command_hash) values(request_id,invoice_id,uid,h);
 return result;
end $$;

CREATE OR REPLACE FUNCTION private.change_stock(product_id uuid, mode text, quantity integer, batch_no text DEFAULT '-'::text, expiry date DEFAULT NULL::date, note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.products; b record; bid uuid; remaining integer; available integer; take_qty integer;
begin
 perform private.require_staff(mode is distinct from 'add');
 if note ~* '^(Faktur:|Revisi Faktur:|Revisi Pengurangan Faktur:|Hapus Item Faktur:|Pembatalan Faktur:)' then
  raise exception 'Versi pembelian sudah diperbarui. Muat ulang aplikasi sebelum melanjutkan.';
 end if;
 if quantity is null or quantity<0 or mode is null or mode not in ('add','subtract') then raise exception 'Adjustment tidak valid'; end if;
 if mode='add' and expiry is not null and expiry < (now() at time zone 'Asia/Jakarta')::date then raise exception 'Batch sudah kedaluwarsa'; end if;
 select * into p from public.products where id=product_id and not deleted for update;
 if not found then raise exception 'Produk tidak ditemukan'; end if;
 if mode='add' then
  if p.category='obat' and expiry is null then raise exception 'Tanggal kedaluwarsa obat wajib diisi'; end if;
  if quantity=0 then raise exception 'Jumlah harus lebih dari nol'; end if;
  insert into public.batches(product_id,batch_no,expiry,qty,cost_price) values(p.id,coalesce(nullif(batch_no,''),'-'),expiry,quantity,p.buy_price) returning id into bid;
  insert into public.stock_movements(product_id,batch_id,actor_id,delta,note) values(p.id,bid,auth.uid(),quantity,coalesce(note,''));
 else
  select coalesce(sum(qty),0) into available from public.batches where batches.product_id=p.id;
  if quantity>available then raise exception 'Stok tidak cukup'; end if;
  remaining:=quantity;
  for b in select * from public.batches where batches.product_id=p.id and qty>0 order by expiry nulls last,created_at,id for update loop
   exit when remaining=0; take_qty:=least(remaining,b.qty);
   update public.batches set qty=qty-take_qty where id=b.id;
   insert into public.stock_movements(product_id,batch_id,actor_id,delta,note) values(p.id,b.id,auth.uid(),-take_qty,coalesce(note,''));
   remaining:=remaining-take_qty;
  end loop;
 end if;
 update public.products set updated_at=now() where id=p.id;
end $function$;


-- Existing grants remain: RPC execution only, no direct business table writes.
notify pgrst, 'reload schema';
