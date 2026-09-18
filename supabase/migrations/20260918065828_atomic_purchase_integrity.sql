-- Atomic owner-only purchases. Historical quantities and sale totals are preserved.
alter table public.purchase_invoices
  add column version integer not null default 1 check(version > 0),
  add column updated_at timestamptz not null default now(),
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.staff(id),
  add column cancellation_reason text not null default '';
alter table public.purchase_items add column batch_id uuid references public.batches(id);
alter table public.stock_movements add column purchase_invoice_id uuid references public.purchase_invoices(id);
create index purchase_invoice_officer on public.purchase_invoices(officer_id);
create index purchase_invoice_canceller on public.purchase_invoices(cancelled_by);
create index purchase_invoice_date_page on public.purchase_invoices(invoice_date desc,id);
create index movements_purchase_invoice on public.stock_movements(purchase_invoice_id);
create unique index purchase_item_batch on public.purchase_items(batch_id) where batch_id is not null;
create unique index purchase_invoice_supplier_number on public.purchase_invoices
 (coalesce(supplier_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(trim(invoice_no)));

-- Link old receipts only when both the batch and its receipt movement are unambiguous.
-- This changes links only, never historical quantities, expiry dates, or costs.
with candidates as (
 select i.id,(array_agg(distinct b.id))[1] as bid
 from public.purchase_items i join public.purchase_invoices p on p.id=i.invoice_id
 join public.batches b on b.product_id=i.product_id and b.batch_no=i.batch_no
   and b.expiry is not distinct from i.expiry and b.cost_price=i.cost_price
 where exists(select 1 from public.stock_movements m where m.batch_id=b.id
   and m.delta=i.qty and m.note='Faktur: '||p.invoice_no
   and m.created_at between p.created_at-interval '10 minutes' and p.created_at)
 group by i.id having count(distinct b.id)=1
), unambiguous as (
 select *,count(*) over(partition by bid) as uses from candidates
)
update public.purchase_items i set batch_id=c.bid from unambiguous c where i.id=c.id and c.uses=1;

create table private.purchase_commands (
 request_id uuid primary key, invoice_id uuid not null references public.purchase_invoices(id),
 actor_id uuid not null references public.staff(id), command_hash text not null,
 created_at timestamptz not null default now()
);
alter table private.purchase_commands enable row level security;
create index purchase_commands_invoice on private.purchase_commands(invoice_id);
create index purchase_commands_actor on private.purchase_commands(actor_id);
revoke all on private.purchase_commands from public,anon,authenticated;

create table public.purchase_events (
 id bigint generated always as identity primary key,
 invoice_id uuid not null references public.purchase_invoices(id),
 version integer not null, actor_id uuid references public.staff(id),
 action text not null check(action in ('baseline','created','updated','cancelled')),
 snapshot jsonb not null, created_at timestamptz not null default now(),
 unique(invoice_id,version)
);
create index purchase_events_actor on public.purchase_events(actor_id);
alter table public.purchase_events enable row level security;
create policy purchase_events_owner_read on public.purchase_events for select to authenticated
 using((select private.staff_role())='owner');
revoke all on public.purchase_events from public,anon,authenticated;
grant select on public.purchase_events to authenticated;

drop policy if exists suppliers_read on public.suppliers;
drop policy if exists suppliers_write on public.suppliers;
drop policy if exists purchase_invoices_read on public.purchase_invoices;
drop policy if exists purchase_invoices_write on public.purchase_invoices;
drop policy if exists purchase_items_read on public.purchase_items;
drop policy if exists purchase_items_write on public.purchase_items;
create policy suppliers_owner_read on public.suppliers for select to authenticated using((select private.staff_role())='owner');
create policy purchases_owner_read on public.purchase_invoices for select to authenticated using((select private.staff_role())='owner');
create policy purchase_items_owner_read on public.purchase_items for select to authenticated using((select private.staff_role())='owner');
revoke all on public.suppliers,public.purchase_invoices,public.purchase_items from public,anon,authenticated;
grant select on public.suppliers,public.purchase_invoices,public.purchase_items to authenticated;

create function private.purchase_document(invoice_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_staff(true);
 return (select to_jsonb(p)||jsonb_build_object('purchase_items',
   coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.purchase_items i where i.invoice_id=p.id),'[]'::jsonb))
   from public.purchase_invoices p where p.id=purchase_document.invoice_id);
end $$;

-- Validate finite numbers before casts, preventing silent fractional quantity/money rounding.
create function private.purchase_number(value jsonb, field text, max_value numeric, whole boolean default false)
returns numeric language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 n:=coalesce(nullif(value->>field,'')::numeric,0);
 if n::text in ('NaN','Infinity','-Infinity') or n<0 or n>max_value or (whole and n<>trunc(n)) then
  raise exception 'Nilai % tidak valid',field;
 end if;
 return n;
end $$;

create function private.save_supplier(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.suppliers; sid uuid;
begin
 perform private.require_staff(true);
 sid:=nullif(payload->>'id','')::uuid;
 if sid is null then raise exception 'ID supplier wajib diisi'; end if;
 perform pg_advisory_xact_lock(hashtextextended('supplier:'||sid::text,0));
 select * into s from public.suppliers where id=sid;
 if found then
  if s.name<>trim(payload->>'name') or s.phone<>coalesce(trim(payload->>'phone'),'') or s.address<>coalesce(trim(payload->>'address'),'') then
   raise exception 'Permintaan supplier sudah digunakan untuk data lain';
  end if;
  return to_jsonb(s);
 end if;
 if length(coalesce(trim(payload->>'phone'),''))>100 or length(coalesce(trim(payload->>'address'),''))>1000 then raise exception 'Data supplier terlalu panjang'; end if;
 insert into public.suppliers(id,name,phone,address)
 values(sid,trim(payload->>'name'),coalesce(trim(payload->>'phone'),''),coalesce(trim(payload->>'address'),''))
 returning * into s;
 return to_jsonb(s);
end $$;
create function public.save_supplier(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select private.save_supplier(payload)
$$;

create function private.save_purchase(request_id uuid, invoice_id uuid, expected_version integer, payload jsonb)
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
 uid:=private.require_staff(true);
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
create function public.save_purchase(request_id uuid, invoice_id uuid, expected_version integer, payload jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_purchase(request_id,invoice_id,expected_version,payload)
$$;

create function private.cancel_purchase(request_id uuid, invoice_id uuid, expected_version integer, reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; p public.purchase_invoices; c private.purchase_commands; h text; i record; result jsonb;
begin
 uid:=private.require_staff(true);
 if request_id is null or invoice_id is null or length(trim(coalesce(reason,''))) not between 1 and 1000 then raise exception 'Faktur dan alasan pembatalan wajib diisi'; end if;
 h:=encode(sha256(convert_to(jsonb_build_object('operation','cancel','invoice',invoice_id,'version',expected_version,'reason',reason)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||request_id::text,0));
 select * into c from private.purchase_commands pc where pc.request_id=cancel_purchase.request_id;
 if found then
  if c.actor_id<>uid or c.command_hash<>h then raise exception 'ID permintaan sudah digunakan untuk data lain' using errcode='22023'; end if;
  return private.purchase_document(c.invoice_id);
 end if;
 select * into p from public.purchase_invoices pi where pi.id=invoice_id for update;
 if not found then raise exception 'Faktur tidak ditemukan'; end if;
 if p.status='cancelled' then return private.purchase_document(invoice_id); end if;
 if p.status<>'completed' then raise exception 'Status faktur tidak dapat dibatalkan'; end if;
 if expected_version is distinct from p.version then raise exception 'Faktur sudah diperbarui di perangkat lain. Muat ulang dahulu.' using errcode='40001'; end if;
 perform 1 from public.products pr where pr.id in (select pi.product_id from public.purchase_items pi where pi.invoice_id=cancel_purchase.invoice_id) order by pr.id for update;
 if not exists(select 1 from public.purchase_items pi where pi.invoice_id=cancel_purchase.invoice_id) then raise exception 'Faktur tidak memiliki rincian stok yang dapat diverifikasi'; end if;
 for i in select pi.*,b.qty remaining from public.purchase_items pi left join public.batches b on b.id=pi.batch_id where pi.invoice_id=cancel_purchase.invoice_id loop
  if i.batch_id is null then raise exception 'Batch faktur lama belum terverifikasi. Perlu pencocokan sebelum pembatalan.'; end if;
  if i.remaining<>i.qty or exists(select 1 from public.stock_movements m where m.batch_id=i.batch_id and m.sale_id is not null) then raise exception 'Batch % sudah terjual atau disesuaikan; pembatalan ditolak.',i.batch_no; end if;
  update public.batches set qty=0 where id=i.batch_id;
  insert into public.stock_movements(product_id,batch_id,actor_id,delta,note,purchase_invoice_id)
   values(i.product_id,i.batch_id,uid,-i.qty,'Pembatalan faktur: '||p.invoice_no,invoice_id);
 end loop;
 update public.purchase_invoices pi set status='cancelled',version=pi.version+1,updated_at=now(),
  cancelled_at=now(),cancelled_by=uid,cancellation_reason=trim(reason) where pi.id=invoice_id;
 result:=private.purchase_document(invoice_id);
 insert into public.purchase_events(invoice_id,version,actor_id,action,snapshot) values(invoice_id,(result->>'version')::integer,uid,'cancelled',result);
 insert into private.purchase_commands(request_id,invoice_id,actor_id,command_hash) values(request_id,invoice_id,uid,h);
 return result;
end $$;
create function public.cancel_purchase(request_id uuid, invoice_id uuid, expected_version integer, reason text)
returns jsonb language sql security invoker set search_path='' as $$
 select private.cancel_purchase(request_id,invoice_id,expected_version,reason)
$$;

revoke all on function private.purchase_document(uuid),private.purchase_number(jsonb,text,numeric,boolean),private.save_supplier(jsonb),private.save_purchase(uuid,uuid,integer,jsonb),private.cancel_purchase(uuid,uuid,integer,text) from public,anon,authenticated;
revoke all on function public.save_supplier(jsonb),public.save_purchase(uuid,uuid,integer,jsonb),public.cancel_purchase(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function private.save_supplier(jsonb),private.save_purchase(uuid,uuid,integer,jsonb),private.cancel_purchase(uuid,uuid,integer,text) to authenticated;
grant execute on function public.save_supplier(jsonb),public.save_purchase(uuid,uuid,integer,jsonb),public.cancel_purchase(uuid,uuid,integer,text) to authenticated;

insert into public.purchase_events(invoice_id,version,actor_id,action,snapshot)
select p.id,p.version,p.officer_id,'baseline',to_jsonb(p)||jsonb_build_object('purchase_items',
 coalesce((select jsonb_agg(to_jsonb(i) order by i.id) from public.purchase_items i where i.invoice_id=p.id),'[]'::jsonb))
from public.purchase_invoices p;

CREATE OR REPLACE FUNCTION private.save_product(product_id uuid, payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare pid uuid; b uuid; qty integer;
begin
 perform private.require_staff(true);
 if product_id is null then
  insert into public.products(name,category,unit,buy_price,sell_price,min_stock)
  values(trim(payload->>'name'),payload->>'category',trim(payload->>'unit'),(payload->>'buyPrice')::bigint,(payload->>'sellPrice')::bigint,(payload->>'minStock')::integer) returning id into pid;
  qty:=coalesce((payload->>'stock')::integer,0);
  if qty < 0 then raise exception 'Stok tidak valid'; end if;
  if qty>0 then
   if payload->>'category'='obat' and nullif(payload->>'expiry','') is null then raise exception 'Tanggal kedaluwarsa obat wajib diisi'; end if;
   if nullif(payload->>'expiry','')::date < (now() at time zone 'Asia/Jakarta')::date then raise exception 'Batch sudah kedaluwarsa'; end if;
   if length(coalesce(trim(payload->>'batchNo'),'')) not between 1 and 150 then raise exception 'Nomor batch wajib diisi'; end if;
   insert into public.batches(product_id,batch_no,expiry,qty,cost_price) values(pid,trim(payload->>'batchNo'),nullif(payload->>'expiry','')::date,qty,(payload->>'buyPrice')::bigint) returning id into b;
   insert into public.stock_movements(product_id,batch_id,actor_id,delta,note) values(pid,b,auth.uid(),qty,'Stok awal');
  end if;
 else
  update public.products set name=trim(payload->>'name'),category=payload->>'category',unit=trim(payload->>'unit'),buy_price=(payload->>'buyPrice')::bigint,sell_price=(payload->>'sellPrice')::bigint,min_stock=(payload->>'minStock')::integer,updated_at=now() where id=product_id and not deleted returning id into pid;
  if pid is null then raise exception 'Produk tidak ditemukan'; end if;
 end if;
 return pid;
end $function$;

CREATE OR REPLACE FUNCTION private.change_stock(product_id uuid, mode text, quantity integer, batch_no text DEFAULT '-'::text, expiry date DEFAULT NULL::date, note text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.products; b record; bid uuid; remaining integer; available integer; take_qty integer;
begin
 perform private.require_staff(true);
 if note ~* '^(Faktur:|Revisi Faktur:|Revisi Pengurangan Faktur:|Hapus Item Faktur:|Pembatalan Faktur:)' then
  raise exception 'Versi pembelian sudah diperbarui. Muat ulang aplikasi sebelum melanjutkan.';
 end if;
 if quantity is null or quantity<0 or mode not in ('add','subtract') then raise exception 'Adjustment tidak valid'; end if;
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

notify pgrst, 'reload schema';
