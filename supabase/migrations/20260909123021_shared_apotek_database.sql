-- Apotek Mulia Farma: shared inventory, authenticated staff, atomic FEFO sales.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

create table public.staff (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  role text not null default 'pending' check (role in ('pending','kasir','owner')),
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.products (
  id uuid primary key default gen_random_uuid(), legacy_id text unique,
  name text not null check (length(trim(name)) between 1 and 200),
  category text not null check (category in ('obat','non-obat','alkes')),
  unit text not null check (length(trim(unit)) between 1 and 30),
  buy_price bigint not null check (buy_price >= 0),
  sell_price bigint not null check (sell_price > 0),
  min_stock integer not null default 5 check (min_stock >= 0),
  deleted boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  batch_no text not null default '-', expiry date,
  qty integer not null check (qty >= 0),
  cost_price bigint not null check (cost_price >= 0),
  created_at timestamptz not null default now()
);
create index batches_product_fefo on public.batches(product_id,expiry,created_at) where qty > 0;
create index batches_product on public.batches(product_id);
create table public.sales (
  id uuid primary key default gen_random_uuid(), legacy_id text unique,
  request_id uuid not null unique,
  trx_no text not null unique default ('TRX-' || replace(gen_random_uuid()::text,'-','')),
  cashier_id uuid references public.staff(id), cashier text not null,
  subtotal bigint not null check(subtotal >= 0), discount bigint not null check(discount >= 0 and discount <= subtotal),
  total bigint not null check(total = subtotal - discount), total_cost bigint not null check(total_cost >= 0),
  margin bigint generated always as (total - total_cost) stored,
  payment_method text not null check(payment_method in ('tunai','qris','transfer')),
  amount_paid bigint not null check(amount_paid >= total),
  change bigint generated always as (amount_paid - total) stored,
  created_at timestamptz not null default now()
);
create index sales_date on public.sales(created_at desc,id);
create index sales_cashier_date on public.sales(cashier_id,created_at desc);
create table public.sale_items (
  id bigint generated always as identity primary key,
  sale_id uuid not null references public.sales(id), product_id uuid not null references public.products(id),
  name text not null, qty integer not null check(qty > 0),
  price bigint not null check(price >= 0), cost_total bigint not null check(cost_total >= 0),
  subtotal bigint not null check(subtotal = qty::bigint * price)
);
create index sale_items_sale on public.sale_items(sale_id);
create index sale_items_product on public.sale_items(product_id);
create table public.stock_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id), batch_id uuid references public.batches(id),
  sale_id uuid references public.sales(id), actor_id uuid references public.staff(id),
  delta integer not null, note text not null,
  created_at timestamptz not null default now()
);
create index stock_movements_product_date on public.stock_movements(product_id,created_at desc);
create index stock_movements_batch on public.stock_movements(batch_id);
create index stock_movements_sale on public.stock_movements(sale_id);
create index stock_movements_actor on public.stock_movements(actor_id);
create table public.settings (
 id boolean primary key default true check(id),
 pharmacy_name text not null default 'Apotek Mulia Farma',address text not null default '',phone text not null default '',
 receipt_header text not null default 'Terima Kasih',receipt_footer text not null default 'Semoga Lekas Sembuh'
);
insert into public.settings(id) values(true);
create table private.owner_setup (id boolean primary key default true check(id), token_hash text not null, used_at timestamptz);
alter table private.owner_setup enable row level security;

create function private.staff_role() returns text language sql stable security definer set search_path = '' as $$
 select role from public.staff where id = (select auth.uid()) and active and auth.uid() is not null
$$;
create function private.require_staff(owner_only boolean default false) returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null or coalesce(private.staff_role(),'') not in ('owner','kasir') or (owner_only and private.staff_role() <> 'owner') then
  raise exception 'Akses pegawai tidak diizinkan' using errcode='42501';
 end if;
 return auth.uid();
end $$;
create function private.new_staff() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.staff(id,name) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Pegawai'),120));
 return new;
end $$;
create trigger apotek_new_staff after insert on auth.users for each row execute function private.new_staff();

alter table public.staff enable row level security;
alter table public.products enable row level security;
alter table public.batches enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.settings enable row level security;
revoke all on public.staff,public.products,public.batches,public.sales,public.sale_items,public.stock_movements,public.settings from anon,authenticated;
grant select on public.staff,public.products,public.batches,public.sales,public.sale_items,public.stock_movements,public.settings to authenticated;
create policy staff_read on public.staff for select to authenticated using(id=(select auth.uid()) or (select private.staff_role())='owner');
create policy products_read on public.products for select to authenticated using((select private.staff_role()) in ('owner','kasir'));
create policy batches_read on public.batches for select to authenticated using((select private.staff_role()) in ('owner','kasir'));
create policy sales_read on public.sales for select to authenticated using((select private.staff_role())='owner' or (cashier_id=(select auth.uid()) and (select private.staff_role())='kasir'));
create policy sale_items_read on public.sale_items for select to authenticated using(exists(select 1 from public.sales s where s.id=sale_id));
create policy movements_read on public.stock_movements for select to authenticated using((select private.staff_role())='owner');
create policy settings_read on public.settings for select to authenticated using((select private.staff_role()) in ('owner','kasir'));

create function private.claim_owner(token text) returns void language plpgsql security definer set search_path='' as $$
declare setup private.owner_setup;
begin
 if auth.uid() is null then raise exception 'Silakan masuk terlebih dahulu' using errcode='42501'; end if;
 select * into setup from private.owner_setup where id for update;
 if not found or setup.used_at is not null or setup.token_hash <> encode(sha256(convert_to(token,'UTF8')),'hex') then
  raise exception 'Kode aktivasi tidak valid atau sudah dipakai' using errcode='42501';
 end if;
 if exists(select 1 from public.staff where role='owner' and active) then raise exception 'Pemilik sudah diaktifkan'; end if;
 if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Konfirmasikan email terlebih dahulu'; end if;
 update public.staff set role='owner',active=true where id=auth.uid();
 update private.owner_setup set used_at=now() where id;
end $$;
create function public.claim_owner(token text) returns void language sql security invoker set search_path='' as $$ select private.claim_owner(token) $$;

create function private.manage_staff(staff_id uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_staff(true);
 if staff_id=auth.uid() or exists(select 1 from public.staff where id=staff_id and role='owner') then raise exception 'Akun pemilik tidak dapat diubah di sini'; end if;
 update public.staff set role='kasir', active=enabled where id=staff_id;
 if not found then raise exception 'Pegawai tidak ditemukan'; end if;
end $$;
create function public.manage_staff(staff_id uuid, enabled boolean) returns void language sql security invoker set search_path='' as $$ select private.manage_staff(staff_id,enabled) $$;

-- Only these validated commands may mutate inventory. Browser roles get no direct write grants.
create function private.save_product(product_id uuid, payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare pid uuid; b uuid; qty integer;
begin
 perform private.require_staff(true);
 if product_id is null then
  insert into public.products(name,category,unit,buy_price,sell_price,min_stock)
  values(trim(payload->>'name'),payload->>'category',trim(payload->>'unit'),(payload->>'buyPrice')::bigint,(payload->>'sellPrice')::bigint,(payload->>'minStock')::integer) returning id into pid;
  qty:=coalesce((payload->>'stock')::integer,0);
  if qty < 0 then raise exception 'Stok tidak valid'; end if;
  if qty>0 then
   insert into public.batches(product_id,batch_no,qty,cost_price) values(pid,'STOK-AWAL',qty,(payload->>'buyPrice')::bigint) returning id into b;
   insert into public.stock_movements(product_id,batch_id,actor_id,delta,note) values(pid,b,auth.uid(),qty,'Stok awal; lengkapi batch bila diperlukan');
  end if;
 else
  update public.products set name=trim(payload->>'name'),category=payload->>'category',unit=trim(payload->>'unit'),buy_price=(payload->>'buyPrice')::bigint,sell_price=(payload->>'sellPrice')::bigint,min_stock=(payload->>'minStock')::integer,updated_at=now() where id=product_id and not deleted returning id into pid;
  if pid is null then raise exception 'Produk tidak ditemukan'; end if;
 end if;
 return pid;
end $$;
create function public.save_product(product_id uuid,payload jsonb) returns uuid language sql security invoker set search_path='' as $$ select private.save_product(product_id,payload) $$;
create function private.delete_product(product_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.require_staff(true); update public.products set deleted=true,updated_at=now() where id=product_id; end $$;
create function public.delete_product(product_id uuid) returns void language sql security invoker set search_path='' as $$ select private.delete_product(product_id) $$;

create function private.change_stock(product_id uuid, mode text, quantity integer, batch_no text default '-', expiry date default null, note text default '') returns void language plpgsql security definer set search_path='' as $$
declare p public.products; b record; bid uuid; remaining integer; available integer; take_qty integer;
begin
 perform private.require_staff(true);
 if quantity is null or quantity<0 or mode not in ('add','subtract') then raise exception 'Adjustment tidak valid'; end if;
 if mode='add' and expiry is not null and expiry < (now() at time zone 'Asia/Jakarta')::date then raise exception 'Batch sudah kedaluwarsa'; end if;
 select * into p from public.products where id=product_id and not deleted for update;
 if not found then raise exception 'Produk tidak ditemukan'; end if;
 if mode='add' then
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
end $$;
create function public.change_stock(product_id uuid,mode text,quantity integer,batch_no text default '-',expiry date default null,note text default '') returns void language sql security invoker set search_path='' as $$ select private.change_stock(product_id,mode,quantity,batch_no,expiry,note) $$;

create function private.checkout(request_id uuid, items jsonb, discount_type text, discount_value numeric, payment_method text, amount_paid bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid; sid uuid; existing public.sales; p public.products; line record; b record; sale_line jsonb;
 subtotal bigint:=0; discount bigint; total bigint; cost bigint:=0; line_cost bigint; remaining integer; take_qty integer; available integer;
 prepared jsonb:='[]'::jsonb; actor_name text; paid bigint;
begin
 uid:=private.require_staff();
 if request_id is null then raise exception 'ID transaksi wajib diisi'; end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,0));
 select * into existing from public.sales where sales.request_id=checkout.request_id;
 if found then
  if existing.cashier_id<>uid then raise exception 'Transaksi milik pegawai lain' using errcode='42501'; end if;
  return existing.id;
 end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 200 then raise exception 'Keranjang tidak valid'; end if;
 if discount_type not in ('nominal','persen') or discount_type is null or discount_value is null or discount_value<0 or discount_value::text='NaN' or (discount_type='persen' and discount_value>100) then raise exception 'Diskon tidak valid'; end if;
 if payment_method is null or payment_method not in ('tunai','qris','transfer') then raise exception 'Metode pembayaran tidak valid'; end if;
 if exists(select 1 from jsonb_array_elements(items) x where (x->>'qty')::numeric is null or (x->>'qty')::numeric<=0 or (x->>'qty')::numeric<>trunc((x->>'qty')::numeric) or (x->>'qty')::numeric>1000000 or x->>'productId' is null) then raise exception 'Jumlah barang tidak valid'; end if;
 -- Stable product lock order prevents two cashiers from selling the same remaining stock.
 for line in select (x->>'productId')::uuid as pid,sum((x->>'qty')::integer)::integer as qty, min((x->>'price')::bigint) as expected_price
  from jsonb_array_elements(items) x group by (x->>'productId')::uuid order by (x->>'productId')::uuid loop
  select * into p from public.products where id=line.pid and not deleted for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;
  if line.expected_price is distinct from p.sell_price then raise exception 'Harga % berubah. Perbarui keranjang.',p.name; end if;
  select coalesce(sum(qty),0) into available from public.batches where product_id=p.id and (expiry is null or expiry >= (now() at time zone 'Asia/Jakarta')::date);
  if line.qty>available then raise exception 'Stok layak jual % tidak cukup',p.name; end if;
  subtotal:=subtotal+p.sell_price*line.qty;
  prepared:=prepared||jsonb_build_array(jsonb_build_object('id',p.id,'name',p.name,'qty',line.qty,'price',p.sell_price));
 end loop;
 discount:=case when discount_type='persen' then round(subtotal*discount_value/100)::bigint else round(discount_value)::bigint end;
 if discount>subtotal then raise exception 'Diskon melebihi subtotal'; end if;
 total:=subtotal-discount;
 paid:=case when payment_method='tunai' then amount_paid else total end;
 if paid is null or paid<total then raise exception 'Jumlah bayar kurang'; end if;
 select name into actor_name from public.staff where id=uid;
 insert into public.sales(request_id,cashier_id,cashier,subtotal,discount,total,total_cost,payment_method,amount_paid)
 values(request_id,uid,actor_name,subtotal,discount,total,0,payment_method,paid) returning id into sid;
 for sale_line in select * from jsonb_array_elements(prepared) loop
  remaining:=(sale_line->>'qty')::integer; line_cost:=0;
  for b in select * from public.batches where product_id=(sale_line->>'id')::uuid and qty>0 and (expiry is null or expiry >= (now() at time zone 'Asia/Jakarta')::date) order by expiry nulls last,created_at,id for update loop
   exit when remaining=0; take_qty:=least(remaining,b.qty);
   update public.batches set qty=qty-take_qty where id=b.id;
   line_cost:=line_cost+take_qty::bigint*b.cost_price;
   insert into public.stock_movements(product_id,batch_id,sale_id,actor_id,delta,note) values(b.product_id,b.id,sid,uid,-take_qty,'Penjualan');
   remaining:=remaining-take_qty;
  end loop;
  if remaining<>0 then raise exception 'Stok berubah; ulangi pembayaran'; end if;
  insert into public.sale_items(sale_id,product_id,name,qty,price,cost_total,subtotal)
  values(sid,(sale_line->>'id')::uuid,sale_line->>'name',(sale_line->>'qty')::integer,(sale_line->>'price')::bigint,line_cost,(sale_line->>'qty')::bigint*(sale_line->>'price')::bigint);
  cost:=cost+line_cost;
 end loop;
 update public.sales set total_cost=cost where id=sid;
 return sid;
end $$;
create function public.checkout(request_id uuid,items jsonb,discount_type text,discount_value numeric,payment_method text,amount_paid bigint) returns uuid language sql security invoker set search_path='' as $$ select private.checkout(request_id,items,discount_type,discount_value,payment_method,amount_paid) $$;

-- Grant only app entry points, never the auth trigger function.
revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.staff_role(),private.require_staff(boolean),private.claim_owner(text),private.manage_staff(uuid,boolean),private.save_product(uuid,jsonb),private.delete_product(uuid),private.change_stock(uuid,text,integer,text,date,text),private.checkout(uuid,jsonb,text,numeric,text,bigint) to authenticated;
revoke all on function public.claim_owner(text),public.manage_staff(uuid,boolean),public.save_product(uuid,jsonb),public.delete_product(uuid),public.change_stock(uuid,text,integer,text,date,text),public.checkout(uuid,jsonb,text,numeric,text,bigint) from public,anon;
grant execute on function public.claim_owner(text),public.manage_staff(uuid,boolean),public.save_product(uuid,jsonb),public.delete_product(uuid),public.change_stock(uuid,text,integer,text,date,text),public.checkout(uuid,jsonb,text,numeric,text,bigint) to authenticated;

-- One-time, owner-reviewed import of browser data. Historical sales do not deduct stock.
create function private.import_legacy(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb; b jsonb; t jsonb; i jsonb; pid uuid; bid uuid; sid uuid; remaining integer; allocated integer; cost bigint; prod_count integer:=0; trx_count integer:=0;
begin
 perform private.require_staff(true);
 lock table public.products,public.sales in exclusive mode;
 if exists(select 1 from public.products) or exists(select 1 from public.sales) then raise exception 'Impor awal hanya boleh dilakukan ke database produk dan transaksi yang kosong'; end if;
 if jsonb_typeof(payload->'products') is distinct from 'array' or jsonb_typeof(payload->'transactions') is distinct from 'array' then raise exception 'Format impor tidak valid'; end if;
 if jsonb_array_length(payload->'products')>10000 or jsonb_array_length(payload->'transactions')>20000 then raise exception 'Data terlalu besar untuk impor ini'; end if;
 for p in select * from jsonb_array_elements(payload->'products') loop
  insert into public.products(legacy_id,name,category,unit,buy_price,sell_price,min_stock,deleted)
  values(p->>'id',p->>'name',p->>'category',p->>'unit',(p->>'buyPrice')::bigint,(p->>'sellPrice')::bigint,(p->>'minStock')::integer,coalesce((p->>'deleted')::boolean,false)) returning id into pid;
  remaining:=(p->>'stock')::integer;
  if remaining is null or remaining<0 then raise exception 'Stok impor tidak valid'; end if;
  -- Legacy batches were not decremented on sales. Preserve the authoritative stock total.
  for b in select value from jsonb_array_elements(coalesce(p->'batches','[]'::jsonb)) order by nullif(value->>'expiry','')::date nulls last loop
   exit when remaining=0;
   allocated:=least(remaining,coalesce((b->>'qty')::integer,0));
   if allocated<0 then raise exception 'Jumlah batch tidak valid'; end if;
   if allocated>0 then
    insert into public.batches(product_id,batch_no,expiry,qty,cost_price) values(pid,coalesce(b->>'batchNo','-'),nullif(b->>'expiry','')::date,allocated,(p->>'buyPrice')::bigint) returning id into bid;
    insert into public.stock_movements(product_id,batch_id,actor_id,delta,note) values(pid,bid,auth.uid(),allocated,'Impor saldo awal; verifikasi fisik batch lama');
    remaining:=remaining-allocated;
   end if;
  end loop;
  if remaining>0 then
   insert into public.batches(product_id,batch_no,qty,cost_price) values(pid,'IMPOR-TANPA-BATCH',remaining,(p->>'buyPrice')::bigint) returning id into bid;
   insert into public.stock_movements(product_id,batch_id,actor_id,delta,note) values(pid,bid,auth.uid(),remaining,'Impor saldo awal tanpa batch');
  end if;
  prod_count:=prod_count+1;
 end loop;
 for t in select * from jsonb_array_elements(payload->'transactions') loop
  select coalesce(sum(round((value->>'costPrice')::numeric*(value->>'qty')::integer)),0) into cost from jsonb_array_elements(t->'items');
  insert into public.sales(legacy_id,request_id,trx_no,cashier_id,cashier,subtotal,discount,total,total_cost,payment_method,amount_paid,created_at)
  values(t->>'id',gen_random_uuid(),t->>'trxNo',auth.uid(),coalesce(t->>'cashier','Impor'),(t->>'subtotal')::bigint,coalesce((t->>'discount')::bigint,0),(t->>'total')::bigint,cost,t->>'paymentMethod',(t->>'amountPaid')::bigint,(t->>'createdAt')::timestamptz) returning id into sid;
  for i in select * from jsonb_array_elements(t->'items') loop
   select id into pid from public.products where legacy_id=i->>'productId';
   if pid is null then raise exception 'Produk riwayat transaksi tidak ditemukan'; end if;
   insert into public.sale_items(sale_id,product_id,name,qty,price,cost_total,subtotal)
   values(sid,pid,i->>'name',(i->>'qty')::integer,(i->>'price')::bigint,round((i->>'costPrice')::numeric*(i->>'qty')::integer),(i->>'subtotal')::bigint);
  end loop;
  if (select coalesce(sum(subtotal),0) from public.sale_items where sale_id=sid)<>(t->>'subtotal')::bigint then raise exception 'Subtotal impor tidak cocok'; end if;
  trx_count:=trx_count+1;
 end loop;
 return jsonb_build_object('products',prod_count,'transactions',trx_count);
end $$;
create function public.import_legacy(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.import_legacy(payload) $$;
revoke all on function private.import_legacy(jsonb),public.import_legacy(jsonb) from public,anon;
grant execute on function private.import_legacy(jsonb),public.import_legacy(jsonb) to authenticated;
