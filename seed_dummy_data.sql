-- Seed Dummy Data: Obat & Alkes Umum
-- Jalankan script ini di menu SQL Editor pada Supabase Dashboard.

DO $$
DECLARE
    pid uuid;
    bid uuid;
BEGIN
    -- 1. Paracetamol
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Paracetamol 500mg Tablet', 'obat', 'Strip', 2000, 3000, 10)
    RETURNING id INTO pid;
    
    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-001', '2027-12-31', 50, 2000)
    RETURNING id INTO bid;
    
    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 50, 'Stok awal seed data');

    -- 2. Amoxicillin
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Amoxicillin 500mg Kapsul', 'obat', 'Strip', 5000, 7000, 5)
    RETURNING id INTO pid;
    
    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-002', '2028-06-30', 30, 5000)
    RETURNING id INTO bid;
    
    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 30, 'Stok awal seed data');

    -- 3. Promag
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Promag Tablet', 'obat', 'Strip', 7000, 9000, 15)
    RETURNING id INTO pid;
    
    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-003', '2027-10-31', 100, 7000)
    RETURNING id INTO bid;
    
    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 100, 'Stok awal seed data');
    
    -- 4. Termometer Digital
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Termometer Digital Omron', 'alkes', 'Pcs', 40000, 55000, 2)
    RETURNING id INTO pid;
    
    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-004', null, 10, 40000)
    RETURNING id INTO bid;
    
    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 10, 'Stok awal seed data');

    -- 5. Masker Medis
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Masker Medis Sensi 3-Ply', 'alkes', 'Box', 15000, 25000, 5)
    RETURNING id INTO pid;
    
    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-005', '2029-01-01', 20, 15000)
    RETURNING id INTO bid;
    
    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 20, 'Stok awal seed data');

    -- 6. Vitamin C
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Vitamin C IPI', 'obat', 'Botol', 4500, 6500, 10)
    RETURNING id INTO pid;
    
    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-006', '2026-11-30', 40, 4500)
    RETURNING id INTO bid;
    
    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 40, 'Stok awal seed data');

    -- 7. Minyak Kayu Putih
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Minyak Kayu Putih Cap Lang 60ml', 'non-obat', 'Botol', 18000, 22000, 5)
    RETURNING id INTO pid;

    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-007', '2028-02-28', 15, 18000)
    RETURNING id INTO bid;

    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 15, 'Stok awal seed data');

    -- 8. Hansaplast
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Hansaplast Plester Kain', 'alkes', 'Lembar', 500, 1000, 50)
    RETURNING id INTO pid;

    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-008', '2029-12-31', 200, 500)
    RETURNING id INTO bid;

    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 200, 'Stok awal seed data');

    -- 9. Betadine
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Betadine Solution 15ml', 'obat', 'Botol', 10000, 15000, 5)
    RETURNING id INTO pid;

    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-009', '2027-08-30', 25, 10000)
    RETURNING id INTO bid;

    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 25, 'Stok awal seed data');

    -- 10. Tolak Angin
    INSERT INTO public.products (name, category, unit, buy_price, sell_price, min_stock)
    VALUES ('Tolak Angin Cair 15ml', 'obat', 'Sachet', 3000, 4500, 20)
    RETURNING id INTO pid;

    INSERT INTO public.batches (product_id, batch_no, expiry, qty, cost_price)
    VALUES (pid, 'BATCH-010', '2027-05-31', 60, 3000)
    RETURNING id INTO bid;

    INSERT INTO public.stock_movements (product_id, batch_id, delta, note)
    VALUES (pid, bid, 60, 'Stok awal seed data');
END $$;
