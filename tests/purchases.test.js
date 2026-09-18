import { test, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { lucide } from '../src/icons.js';

const dom = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  localStorage: dom.localStorage,
  sessionStorage: dom.sessionStorage,
  lucide
});
window.lucide = lucide;

let product;
let purchaseInvoices = [];
let supplierList = [
  { id: 's1', name: 'PT Kimia Farma', phone: '021-1234', address: 'Jakarta' }
];
let controller,loadedRanges;
const identity = { id: 'test-owner', name: 'Owner Apotek', role: 'owner', active: true };

const productStore = {
  getAll: () => [product],
  getById: (id) => (product.id === id ? product : null),
  search: () => [product],
  getLowStock: () => [],
  getOutOfStock: () => [],
  getExpiringSoon: () => [],
  update: async (id, data) => { product = { ...product, ...data }; },
  add: async (data) => { product = { ...product, ...data }; },
  addStock: async (id, qty, batchNo, expiry) => {
    product.stock += qty;
    product.batches.push({ batchNo, expiry, qty });
  },
  remove: async () => {},
  adjust: async () => {}
};

const purchasesStore = {
  getAll: () => purchaseInvoices,
  getById: (id) => purchaseInvoices.find(p => p.id === id || p.invoiceNo === id),
  getByDateRange: (from, to) => purchaseInvoices,
  loadRange: async (from,to) => {loadedRanges.push([from,to]);return purchaseInvoices;},
  add: async (inv) => {
    const saved = { ...inv, id: 'inv-' + Date.now(), createdAt: new Date().toISOString() };
    for (const item of inv.items) {
      if (item.productId === product.id) {
        product.stock += item.qty;
        product.batches.push({ batchNo: item.batchNo, expiry: item.expiry, qty: item.qty });
      }
    }
    purchaseInvoices.push(saved);
    return saved;
  },
  update: async (id, inv) => {
    const idx = purchaseInvoices.findIndex(p => p.id === id);
    if (idx !== -1) {
      const old = purchaseInvoices[idx];
      const oldQty = (old.items || []).reduce((s, i) => s + i.qty, 0);
      const newQty = (inv.items || []).reduce((s, i) => s + i.qty, 0);
      product.stock += (newQty - oldQty);
      purchaseInvoices[idx] = { ...old, ...inv };
      return purchaseInvoices[idx];
    }
    return inv;
  },
  remove: async (id) => {
    const inv = purchaseInvoices.find(p => p.id === id);
    if (inv) {
      for (const it of (inv.items || [])) {
        if (it.productId === product.id) {
          product.stock -= it.qty;
        }
      }
      inv.status='cancelled';
    }
  }
};

const suppliersStore = {
  getAll: () => supplierList,
  add: async (supp) => {
    const s = { ...supp, id: 'supp-' + Date.now() };
    supplierList.push(s);
    return s;
  }
};

await mock.module('../src/store.js', {
  namedExports: {
    auth: { getSession: () => identity, isOwner: () => identity.role==='owner' },
    prepareRoute: async () => {},
    products: productStore,
    purchases: purchasesStore,
    suppliers: suppliersStore,
    refreshInventory: async () => {},
    settings: {
      get: () => ({
        pharmacyName: 'Apotek Mulia Farma',
        address: 'Jl. Sehat No. 1',
        phone: '08123456789',
        receiptHeader: 'Terima Kasih',
        receiptFooter: ''
      })
    },
    transactions: { getToday: () => [], getByDateRange: () => [] }
  }
});

const { renderPurchases } = await import('../src/pages/purchases.js');
const settle = () => new Promise(r => setTimeout(r, 30));

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div><div id="toast-container"></div><div id="modal-container"></div>';
  sessionStorage.clear();
  purchaseInvoices = [];
  loadedRanges = [];
  identity.role='owner';
  product = {
    id: 'p1',
    name: 'Paracetamol 500mg',
    category: 'obat',
    unit: 'strip',
    stock: 10,
    availableStock: 10,
    minStock: 2,
    buyPrice: 5000,
    sellPrice: 7500,
    batches: []
  };
});

afterEach(() => {
  controller?.destroy?.();
  controller = null;
  dom.happyDOM.abort();
});

test('purchases page renders list view and shows empty state when no invoices exist', () => {
  controller = renderPurchases('list');
  assert.ok(document.querySelector('.purchases-table') === null);
  assert.match(document.getElementById('purchase-page-content').textContent, /Data faktur tidak ditemukan/);
  assert.ok(document.getElementById('btn-to-create-purchase'));
});

test('purchases create view adds row, calculates totals with tax, and saves invoice', async () => {
  controller = renderPurchases('new');
  assert.match(document.querySelector('.purchase-create-header').textContent, /Tambah Faktur Pembelian/);

  // Fill header fields
  document.getElementById('inv-no').value = 'FAK-2026-001';
  document.getElementById('inv-order-no').value = 'SP-001';

  // Item row inputs
  const qtyInput = document.querySelector('.item-qty');
  qtyInput.value = '5';
  qtyInput.dispatchEvent(new dom.window.Event('input'));

  const buyPriceInput = document.querySelector('.item-buy-price');
  buyPriceInput.value = '5000';
  buyPriceInput.dispatchEvent(new dom.window.Event('input'));

  // Tax calculation check (with default exclude_tax PPN 11%)
  // 5 * 5000 = 25000 subtotal, 11% tax = 2750, total = 27750
  await settle();
  assert.equal(document.getElementById('calc-subtotal').textContent, 'Rp 25.000');
  assert.equal(document.getElementById('calc-tax-val').textContent, 'Rp 2.750');
  assert.equal(document.getElementById('calc-grand-total').textContent, 'Rp 27.750');

  // Click Save
  const btnSave = document.getElementById('btn-save-purchase');
  btnSave.click();
  await settle();

  // Verify invoice saved and stock updated: 10 initial + 5 = 15
  assert.equal(purchaseInvoices.length, 1);
  assert.equal(purchaseInvoices[0].invoiceNo, 'FAK-2026-001');
  assert.equal(product.stock, 15);

  // Verify it switches back to list view and displays the invoice in table
  assert.match(document.getElementById('purchase-page-content').textContent, /FAK-2026-001/);
});

test('purchases edit invoice updates details and adjusts stock', async () => {
  purchaseInvoices = [{
    id: 'inv-123',
    invoiceNo: 'FAK-EDIT-001',
    supplierId: 's1',
    supplierName: 'PT Kimia Farma',
    invoiceDate: '2026-09-15',
    subtotal: 25000,
    total: 27750,
    items: [{
      productId: 'p1',
      productName: 'Paracetamol 500mg',
      batchNo: 'BT-001',
      expiry: '2027-09-15',
      qty: 5,
      unit: 'strip',
      buyPrice: 5000,
      discountPercent: 0,
      taxPercent: 0,
      costPrice: 5000,
      subtotal: 25000
    }]
  }];
  product.stock = 15;

  controller = renderPurchases('list');
  const editBtn = document.querySelector('.btn-edit-invoice');
  assert.ok(editBtn);
  editBtn.click();
  await settle();

  assert.match(document.querySelector('.purchase-create-header').textContent, /Edit Faktur/);
  assert.equal(document.getElementById('inv-no').value, 'FAK-EDIT-001');

  // Change quantity to 8 (+3 more)
  const qtyInput = document.querySelector('.item-qty');
  qtyInput.value = '8';
  qtyInput.dispatchEvent(new dom.window.Event('input'));
  await settle();

  // Save changes
  document.getElementById('btn-save-purchase').click();
  await settle();

  // Stock should be 15 - 5 + 8 = 18
  assert.equal(product.stock, 18);
  assert.match(document.getElementById('purchase-page-content').textContent, /FAK-EDIT-001/);
});

test('purchases cancellation retains history and reverts stock', async () => {
  purchaseInvoices = [{
    id: 'inv-del-1',
    invoiceNo: 'FAK-DEL-001',
    supplierId: 's1',
    supplierName: 'PT Kimia Farma',
    invoiceDate: '2026-09-15',
    subtotal: 25000,
    total: 27750,
    items: [{
      productId: 'p1',
      productName: 'Paracetamol 500mg',
      qty: 5,
      unit: 'strip',
      buyPrice: 5000
    }]
  }];
  product.stock = 15;

  controller = renderPurchases('list');
  const delBtn = document.querySelector('.btn-delete-invoice');
  assert.ok(delBtn);
  delBtn.click();
  await settle();

  // Confirmation modal should open
  const confirmBtn = document.getElementById('btn-confirm-del');
  assert.ok(confirmBtn);
  document.getElementById('cancel-purchase-reason').value='Salah input';
  confirmBtn.click();
  await settle();

  // Invoice history retained and stock reverted: 15 - 5 = 10
  assert.equal(purchaseInvoices.length, 1);
  assert.equal(purchaseInvoices[0].status, 'cancelled');
  assert.equal(product.stock, 10);
  assert.match(document.getElementById('purchase-page-content').textContent, /Dibatalkan/);
});

test('purchase date filter fetches the selected range from server',async()=>{
  controller=renderPurchases('list');
  document.getElementById('filter-start-date').value='2025-01-01';
  document.getElementById('filter-end-date').value='2025-02-01';
  document.getElementById('btn-apply-date-filter').click();await settle();
  assert.deepEqual(loadedRanges,[['2025-01-01','2025-02-01']]);
});

test('cashier purchase page offers creation and details without owner revision actions',async()=>{
  identity.role='kasir';
  purchaseInvoices=[{id:'cashier-invoice',invoiceNo:'MINE',invoiceDate:'2026-09-18',items:[],total:0}];
  controller=renderPurchases('list');
  assert.ok(document.querySelector('.btn-view-invoice'));
  assert.equal(document.querySelector('.btn-edit-invoice'),null);
  assert.equal(document.querySelector('.btn-delete-invoice'),null);
  document.getElementById('btn-to-create-purchase').click();
  assert.ok(document.getElementById('btn-save-purchase'));
  assert.equal(document.getElementById('btn-add-quick-supplier'),null);
  document.getElementById('inv-no').value='CASHIER-NEW';
  document.getElementById('btn-save-purchase').click();await settle();
  assert.equal(purchaseInvoices.length,2);
  assert.equal(purchaseInvoices[1].invoiceNo,'CASHIER-NEW');
});

test('double cancellation click sends one request while the first is pending',async()=>{
  purchaseInvoices=[{id:'double',version:2,invoiceNo:'ONCE',invoiceDate:'2026-09-18',supplierName:'Umum',items:[],total:0}];
  const original=purchasesStore.remove;let count=0,resolve;
  purchasesStore.remove=async()=>{count++;await new Promise(r=>{resolve=r;});};
  try {
    controller=renderPurchases('list');document.querySelector('.btn-delete-invoice').click();
    document.getElementById('cancel-purchase-reason').value='Salah input';
    const button=document.getElementById('btn-confirm-del');button.click();button.click();
    assert.equal(button.disabled,true);assert.equal(count,1);
    resolve();await settle();
  } finally {purchasesStore.remove=original;}
});
