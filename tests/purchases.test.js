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
let controller;
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
  loadRange: async () => purchaseInvoices,
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
    auth: { getSession: () => identity, isOwner: () => true },
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
