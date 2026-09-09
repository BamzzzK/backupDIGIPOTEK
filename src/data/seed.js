// ===== DigiPotek Seed Data =====
// 30+ sample products across 3 categories

export const seedProducts = [
  // ===== OBAT =====
  { name: 'Paracetamol 500mg', category: 'obat', unit: 'strip', buyPrice: 3500, sellPrice: 5000, stock: 150, minStock: 20, batches: [{ id: 'b1', batchNo: 'PCT-2024A', expiry: '2027-06-15', qty: 150, addedAt: new Date().toISOString() }] },
  { name: 'Amoxicillin 500mg', category: 'obat', unit: 'strip', buyPrice: 8000, sellPrice: 12000, stock: 80, minStock: 15, batches: [{ id: 'b2', batchNo: 'AMX-2024B', expiry: '2027-03-20', qty: 80, addedAt: new Date().toISOString() }] },
  { name: 'Antangin Cair', category: 'obat', unit: 'sachet', buyPrice: 1500, sellPrice: 2500, stock: 200, minStock: 30, batches: [{ id: 'b3', batchNo: 'ANT-2024C', expiry: '2026-12-01', qty: 200, addedAt: new Date().toISOString() }] },
  { name: 'Bodrex Extra', category: 'obat', unit: 'strip', buyPrice: 4000, sellPrice: 6500, stock: 100, minStock: 20, batches: [{ id: 'b4', batchNo: 'BDX-2024A', expiry: '2027-08-10', qty: 100, addedAt: new Date().toISOString() }] },
  { name: 'Promag Tablet', category: 'obat', unit: 'strip', buyPrice: 3000, sellPrice: 5000, stock: 120, minStock: 25, batches: [{ id: 'b5', batchNo: 'PMG-2024B', expiry: '2027-05-15', qty: 120, addedAt: new Date().toISOString() }] },
  { name: 'OBH Combi Batuk', category: 'obat', unit: 'botol', buyPrice: 12000, sellPrice: 18000, stock: 45, minStock: 10, batches: [{ id: 'b6', batchNo: 'OBH-2024A', expiry: '2027-02-28', qty: 45, addedAt: new Date().toISOString() }] },
  { name: 'Dexamethasone 0.5mg', category: 'obat', unit: 'strip', buyPrice: 2500, sellPrice: 4000, stock: 60, minStock: 15, batches: [{ id: 'b7', batchNo: 'DEX-2024C', expiry: '2027-09-01', qty: 60, addedAt: new Date().toISOString() }] },
  { name: 'Ibuprofen 400mg', category: 'obat', unit: 'strip', buyPrice: 5000, sellPrice: 8000, stock: 90, minStock: 15, batches: [{ id: 'b8', batchNo: 'IBU-2024A', expiry: '2027-07-20', qty: 90, addedAt: new Date().toISOString() }] },
  { name: 'Cetirizine 10mg', category: 'obat', unit: 'strip', buyPrice: 4500, sellPrice: 7000, stock: 70, minStock: 10, batches: [{ id: 'b9', batchNo: 'CTZ-2024B', expiry: '2027-04-15', qty: 70, addedAt: new Date().toISOString() }] },
  { name: 'Omeprazole 20mg', category: 'obat', unit: 'strip', buyPrice: 6000, sellPrice: 9500, stock: 55, minStock: 10, batches: [{ id: 'b10', batchNo: 'OMP-2024A', expiry: '2027-01-10', qty: 55, addedAt: new Date().toISOString() }] },
  { name: 'Metformin 500mg', category: 'obat', unit: 'strip', buyPrice: 3500, sellPrice: 5500, stock: 85, minStock: 20, batches: [{ id: 'b11', batchNo: 'MET-2024C', expiry: '2027-06-30', qty: 85, addedAt: new Date().toISOString() }] },
  { name: 'Amlodipine 5mg', category: 'obat', unit: 'strip', buyPrice: 4000, sellPrice: 6500, stock: 8, minStock: 15, batches: [{ id: 'b12', batchNo: 'AML-2024B', expiry: '2027-03-25', qty: 8, addedAt: new Date().toISOString() }] },
  { name: 'Salbutamol Inhaler', category: 'obat', unit: 'pcs', buyPrice: 25000, sellPrice: 38000, stock: 12, minStock: 5, batches: [{ id: 'b13', batchNo: 'SAL-2024A', expiry: '2027-11-01', qty: 12, addedAt: new Date().toISOString() }] },
  { name: 'Diazepam 5mg', category: 'obat', unit: 'strip', buyPrice: 7000, sellPrice: 11000, stock: 3, minStock: 5, batches: [{ id: 'b14', batchNo: 'DZP-2024A', expiry: '2026-11-15', qty: 3, addedAt: new Date().toISOString() }] },

  // ===== NON-OBAT =====
  { name: 'Vitamin C 1000mg Tablet', category: 'non-obat', unit: 'strip', buyPrice: 8000, sellPrice: 13000, stock: 100, minStock: 20, batches: [{ id: 'b15', batchNo: 'VTC-2024A', expiry: '2027-10-01', qty: 100, addedAt: new Date().toISOString() }] },
  { name: 'Enervon-C Multivitamin', category: 'non-obat', unit: 'strip', buyPrice: 7000, sellPrice: 11000, stock: 80, minStock: 15, batches: [{ id: 'b16', batchNo: 'ENV-2024B', expiry: '2027-08-15', qty: 80, addedAt: new Date().toISOString() }] },
  { name: 'Madu TJ Murni 250ml', category: 'non-obat', unit: 'botol', buyPrice: 28000, sellPrice: 42000, stock: 20, minStock: 5, batches: [{ id: 'b17', batchNo: 'MDU-2024A', expiry: '2028-01-01', qty: 20, addedAt: new Date().toISOString() }] },
  { name: 'Susu Entrasol Active', category: 'non-obat', unit: 'box', buyPrice: 35000, sellPrice: 52000, stock: 25, minStock: 5, batches: [{ id: 'b18', batchNo: 'SSE-2024C', expiry: '2027-05-20', qty: 25, addedAt: new Date().toISOString() }] },
  { name: 'Tolak Angin Cair', category: 'non-obat', unit: 'sachet', buyPrice: 2000, sellPrice: 3500, stock: 180, minStock: 30, batches: [{ id: 'b19', batchNo: 'TLK-2024A', expiry: '2027-09-10', qty: 180, addedAt: new Date().toISOString() }] },
  { name: 'Hansaplast Krim Luka', category: 'non-obat', unit: 'tube', buyPrice: 15000, sellPrice: 23000, stock: 30, minStock: 8, batches: [{ id: 'b20', batchNo: 'HNS-2024B', expiry: '2027-12-01', qty: 30, addedAt: new Date().toISOString() }] },
  { name: 'Hemaviton Stamina Plus', category: 'non-obat', unit: 'botol', buyPrice: 5000, sellPrice: 8000, stock: 60, minStock: 10, batches: [{ id: 'b21', batchNo: 'HMV-2024A', expiry: '2027-07-15', qty: 60, addedAt: new Date().toISOString() }] },
  { name: 'Koyo Salonpas', category: 'non-obat', unit: 'sachet', buyPrice: 3000, sellPrice: 5000, stock: 90, minStock: 15, batches: [{ id: 'b22', batchNo: 'SLP-2024C', expiry: '2028-03-01', qty: 90, addedAt: new Date().toISOString() }] },
  { name: 'Betadine Antiseptik 30ml', category: 'non-obat', unit: 'botol', buyPrice: 12000, sellPrice: 18500, stock: 40, minStock: 8, batches: [{ id: 'b23', batchNo: 'BTD-2024A', expiry: '2027-11-20', qty: 40, addedAt: new Date().toISOString() }] },
  { name: 'Minyak Kayu Putih 60ml', category: 'non-obat', unit: 'botol', buyPrice: 15000, sellPrice: 22000, stock: 35, minStock: 8, batches: [{ id: 'b24', batchNo: 'MKP-2024B', expiry: '2028-06-01', qty: 35, addedAt: new Date().toISOString() }] },

  // ===== ALAT KESEHATAN =====
  { name: 'Masker Medis 3Ply (50pcs)', category: 'alkes', unit: 'box', buyPrice: 18000, sellPrice: 28000, stock: 50, minStock: 10, batches: [{ id: 'b25', batchNo: 'MSK-2024A', expiry: '2028-12-01', qty: 50, addedAt: new Date().toISOString() }] },
  { name: 'Thermometer Digital', category: 'alkes', unit: 'pcs', buyPrice: 25000, sellPrice: 40000, stock: 15, minStock: 5, batches: [] },
  { name: 'Tensimeter Digital', category: 'alkes', unit: 'pcs', buyPrice: 150000, sellPrice: 235000, stock: 8, minStock: 3, batches: [] },
  { name: 'Hand Sanitizer 500ml', category: 'alkes', unit: 'botol', buyPrice: 18000, sellPrice: 28000, stock: 40, minStock: 8, batches: [{ id: 'b28', batchNo: 'HS-2024B', expiry: '2028-01-15', qty: 40, addedAt: new Date().toISOString() }] },
  { name: 'Sarung Tangan Latex (100pcs)', category: 'alkes', unit: 'box', buyPrice: 35000, sellPrice: 55000, stock: 20, minStock: 5, batches: [] },
  { name: 'Plester Luka (100pcs)', category: 'alkes', unit: 'box', buyPrice: 12000, sellPrice: 20000, stock: 0, minStock: 5, batches: [] },
  { name: 'Kapas 100g', category: 'alkes', unit: 'pcs', buyPrice: 8000, sellPrice: 13000, stock: 30, minStock: 8, batches: [] },
  { name: 'Alkohol 70% 100ml', category: 'alkes', unit: 'botol', buyPrice: 7000, sellPrice: 12000, stock: 50, minStock: 10, batches: [{ id: 'b32', batchNo: 'ALK-2024A', expiry: '2028-06-01', qty: 50, addedAt: new Date().toISOString() }] },
  { name: 'Perban Elastis 10cm', category: 'alkes', unit: 'pcs', buyPrice: 5000, sellPrice: 8500, stock: 25, minStock: 5, batches: [] },
  { name: 'Nebulizer Portable', category: 'alkes', unit: 'pcs', buyPrice: 280000, sellPrice: 420000, stock: 4, minStock: 2, batches: [] },
];
