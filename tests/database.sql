begin;
-- All fixtures are rolled back, including temporary auth accounts.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('11111111-1111-4111-8111-111111111111','owner-test@example.invalid',now(),'{"name":"Owner Test"}'),
 ('22222222-2222-4222-8222-222222222222','cashier-test@example.invalid',now(),'{"name":"Kasir Test"}'),
 ('33333333-3333-4333-8333-333333333333','pending-test@example.invalid',now(),'{"name":"Pending Test","role":"owner"}');
update public.staff set role='owner',active=true where id='11111111-1111-4111-8111-111111111111';
update public.staff set role='kasir',active=true where id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('test.product_id',public.save_product(null,'{"name":"Test FEFO","category":"obat","unit":"strip","buyPrice":100,"sellPrice":200,"minStock":2,"stock":0}')::text,true);
select public.change_stock(current_setting('test.product_id')::uuid,'add',3,'BATCH-FIRST','2030-01-01','Test');
select public.change_stock(current_setting('test.product_id')::uuid,'add',2,'BATCH-SECOND','2031-01-01','Test');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.checkout('44444444-4444-4444-8444-444444444444',jsonb_build_array(jsonb_build_object('productId',current_setting('test.product_id'),'qty',4,'price',200)),'persen',10,'tunai',1000);
-- The same request is safe to replay without decrementing stock again.
select public.checkout('44444444-4444-4444-8444-444444444444',jsonb_build_array(jsonb_build_object('productId',current_setting('test.product_id'),'qty',4,'price',200)),'persen',10,'tunai',1000);
do $$
begin
 if (select sum(qty) from public.batches where product_id=current_setting('test.product_id')::uuid)<>1 then raise exception 'FAIL: stock or idempotency';end if;
 if (select qty from public.batches where product_id=current_setting('test.product_id')::uuid and batch_no='BATCH-FIRST')<>0 then raise exception 'FAIL: FEFO';end if;
 if not exists(select 1 from public.sales where request_id='44444444-4444-4444-8444-444444444444' and total=720 and total_cost=400 and margin=320 and change=280) then raise exception 'FAIL: totals';end if;
 begin
  perform public.checkout('55555555-5555-4555-8555-555555555555',jsonb_build_array(jsonb_build_object('productId',current_setting('test.product_id'),'qty',2,'price',200)),'nominal',0,'tunai',400);
  raise exception 'FAIL: oversell accepted';
 exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise; end if; end;
 if (select count(*) from public.sales where request_id='55555555-5555-4555-8555-555555555555')<>0 then raise exception 'FAIL: partial transaction';end if;
 begin perform public.change_stock(current_setting('test.product_id')::uuid,'add',99);raise exception 'FAIL: cashier stock change';exception when insufficient_privilege then null;end;
 begin update public.batches set qty=999;raise exception 'FAIL: direct update';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $$ begin
 if (select count(*) from public.products)<>0 then raise exception 'FAIL: pending user reads inventory';end if;
 if private.staff_role() is not null then raise exception 'FAIL: editable metadata grants owner';end if;
 begin perform public.checkout(gen_random_uuid(),'[]','nominal',0,'tunai',0);raise exception 'FAIL: pending checkout';exception when insufficient_privilege then null;end;
end $$;
set local role anon;
do $$ begin
 begin perform * from public.products;raise exception 'FAIL: anonymous inventory';exception when insufficient_privilege then null;end;
 begin perform public.claim_owner('anything');raise exception 'FAIL: anonymous activation';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: FEFO, totals, idempotency, oversell rollback, cashier restrictions, pending and anonymous denial' as result;
