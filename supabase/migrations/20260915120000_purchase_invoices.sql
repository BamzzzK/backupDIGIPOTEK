-- Migration: Add suppliers and purchase invoices tables for DigiPotek

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 150),
  phone text default '',
  address text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null check (length(trim(invoice_no)) > 0),
  order_no text default '',
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text not null,
  officer_id uuid references public.staff(id) on delete set null,
  officer_name text not null default '',
  invoice_date date not null default current_date,
  received_at timestamptz not null default now(),
  invoice_type text not null default 'exclude_tax',
  warehouse text not null default 'Gudang Utama',
  payment_type text not null default 'kredit' check (payment_type in ('kredit', 'tunai', 'transfer')),
  payment_term integer not null default 0 check (payment_term >= 0),
  due_date date not null default current_date,
  subtotal bigint not null check (subtotal >= 0),
  discount_type text not null default 'nominal' check (discount_type in ('persen', 'nominal')),
  discount_value numeric not null default 0 check (discount_value >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  cashback bigint not null default 0 check (cashback >= 0),
  other_fees bigint not null default 0 check (other_fees >= 0),
  tax_percent numeric not null default 0 check (tax_percent >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  total bigint not null check (total >= 0),
  notes text default '',
  pkp_status text not null default 'non_pkp',
  status text not null default 'completed' check (status in ('draft', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_purchase_invoices_date on public.purchase_invoices(invoice_date desc, created_at desc);
create index if not exists idx_purchase_invoices_supplier on public.purchase_invoices(supplier_id);

create table if not exists public.purchase_items (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.purchase_invoices(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  batch_no text not null default '-',
  expiry date,
  qty integer not null check (qty > 0),
  unit text not null,
  buy_price bigint not null check (buy_price >= 0),
  discount_percent numeric not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  tax_percent numeric not null default 0 check (tax_percent >= 0),
  cost_price bigint not null check (cost_price >= 0),
  subtotal bigint not null check (subtotal >= 0)
);

create index if not exists idx_purchase_items_invoice on public.purchase_items(invoice_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);

alter table public.suppliers enable row level security;
alter table public.purchase_invoices enable row level security;
alter table public.purchase_items enable row level security;

create policy suppliers_read on public.suppliers for select to authenticated using ((select private.staff_role()) in ('owner', 'kasir'));
create policy suppliers_write on public.suppliers for all to authenticated using ((select private.staff_role()) = 'owner');

create policy purchase_invoices_read on public.purchase_invoices for select to authenticated using ((select private.staff_role()) in ('owner', 'kasir'));
create policy purchase_invoices_write on public.purchase_invoices for all to authenticated using ((select private.staff_role()) = 'owner');

create policy purchase_items_read on public.purchase_items for select to authenticated using (exists (select 1 from public.purchase_invoices p where p.id = invoice_id));
create policy purchase_items_write on public.purchase_items for all to authenticated using ((select private.staff_role()) = 'owner');
