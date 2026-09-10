begin;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('66666666-6666-4666-8666-666666666666','activation-test@example.invalid',now(),'{"name":"Activation Test"}');
update private.owner_setup set token_hash=encode(sha256(convert_to('temporary-test-token','UTF8')),'hex'),used_at=null where id;
set local role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
do $$ begin
 begin perform public.claim_owner('wrong');raise exception 'FAIL: bad activation code accepted';exception when insufficient_privilege then null;end;
end $$;
select public.claim_owner('temporary-test-token');
do $$ begin
 if private.staff_role()<>'owner' then raise exception 'FAIL: owner activation';end if;
 begin perform public.claim_owner('temporary-test-token');raise exception 'FAIL: code replay';exception when insufficient_privilege then null;end;
end $$;
select public.import_legacy('{"products":[{"id":"old-1","name":"Imported Test","category":"obat","unit":"strip","buyPrice":100,"sellPrice":200,"minStock":1,"stock":3,"batches":[{"qty":5,"batchNo":"OLD-BATCH","expiry":"2030-01-01"}]}],"transactions":[{"id":"old-t1","trxNo":"TEST-IMPORT-001","cashier":"Kasir Lama","subtotal":400,"discount":0,"total":400,"amountPaid":500,"paymentMethod":"tunai","createdAt":"2026-09-08T18:00:00Z","items":[{"productId":"old-1","name":"Imported Test","qty":2,"price":200,"costPrice":100,"subtotal":400}]}]}');
do $$ begin
 if (select sum(qty) from public.batches)<>3 then raise exception 'FAIL: import deducted stock or trusted stale batch';end if;
 if (select total_cost from public.sales where legacy_id='old-t1')<>200 then raise exception 'FAIL: imported cost';end if;
 if (select (created_at at time zone 'Asia/Jakarta')::date from public.sales where legacy_id='old-t1')<>'2026-09-09'::date then raise exception 'FAIL: timezone';end if;
 begin perform public.import_legacy('{"products":[],"transactions":[]}');raise exception 'FAIL: repeated import accepted';exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise;end if;end;
end $$;
reset role;
update public.batches set expiry='2020-01-01';
set local role authenticated;
do $$ declare pid uuid; begin
 select id into pid from public.products where legacy_id='old-1';
 begin perform public.checkout(gen_random_uuid(),jsonb_build_array(jsonb_build_object('productId',pid,'qty',1,'price',200)),'nominal',0,'tunai',200);raise exception 'FAIL: expired sale accepted';exception when sqlstate 'P0001' then if sqlerrm like 'FAIL:%' then raise;end if;end;
 if (select sum(qty) from public.batches)<>3 then raise exception 'FAIL: rejected sale altered inventory';end if;
end $$;
rollback;
select 'PASS: owner activation, single-use code, legacy import, historical stock preservation, timezone, expired batch rejection' as result;
