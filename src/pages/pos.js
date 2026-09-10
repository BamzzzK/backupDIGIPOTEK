// ===== DigiPotek POS / Kasir Page =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { products, transactions, settings, auth, refreshInventory } from '../store.js';
import { runAction, formatRupiah, generateTrxNo, escapeHtml, debounce, categoryBadge } from '../utils.js';

let cart = [];
let paymentBusy=false;
let activePOS=0;
const pendingKey=()=>`apotek_pending_checkout:${auth.getSession()?.id}`;
let searchQuery = '';
let categoryFilter = '';
let paymentMethod = 'tunai';
let discountValue = 0;
let discountType = 'nominal'; // 'nominal' or 'persen'

export function renderPOS() {
  const page=++activePOS;
  cart = [];
  searchQuery = '';
  categoryFilter = '';
  paymentMethod = 'tunai';
  discountValue = 0;
  discountType = 'nominal';

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Kasir (POS)', 'Buat transaksi penjualan')}
        <div class="page-content" style="padding:16px">
          <div class="pos-layout">
            <div class="pos-products">
              <div class="pos-products-header">
                <div class="search-box" style="flex:1;min-width:200px">
                  <i data-lucide="search"></i>
                  <input type="text" id="pos-search" placeholder="Cari produk..." />
                </div>
                <div class="filter-tabs" id="pos-category-filter">
                  <button class="filter-tab active" data-cat="">Semua</button>
                  <button class="filter-tab" data-cat="obat">💊 Obat</button>
                  <button class="filter-tab" data-cat="non-obat">🧴 Non-Obat</button>
                  <button class="filter-tab" data-cat="alkes">🩺 Alkes</button>
                </div>
              </div>
              <div class="pos-products-grid" id="pos-products-grid"></div>
            </div>
            <div class="pos-cart" id="pos-cart"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  bindHeaderEvents();
  renderProductGrid();
  renderCart();
  bindPOSEvents();
  const pending=JSON.parse(sessionStorage.getItem(pendingKey())||'null');
  if(pending)showPendingCheckout(pending);

  let refreshing=false;
  const timer=setInterval(async()=>{
    if(refreshing||document.hidden||page!==activePOS||paymentBusy)return;
    refreshing=true;
    try { await refreshInventory();if(page===activePOS&&document.getElementById('pos-products-grid'))renderProductGrid(); }
    catch { /* Payment still validates against the database; do not overwrite the cart on a refresh error. */ }
    finally { refreshing=false; }
  },30000);
  return {destroy(){activePOS++;clearInterval(timer);}};
}

function renderProductGrid() {
  const grid = document.getElementById('pos-products-grid');
  const prods = products.search(searchQuery, categoryFilter);

  if (prods.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <i data-lucide="search-x"></i>
        <h3>Produk tidak ditemukan</h3>
        <p>Coba kata kunci lain</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons({ nodes: [grid] });
    return;
  }

  grid.innerHTML = prods.map(p => `
    <div class="pos-product-card ${p.availableStock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}">
      <div class="pos-product-name">${escapeHtml(p.name)}</div>
      <div class="pos-product-category">${categoryBadge(p.category)}</div>
      <div class="pos-product-meta">
        <span class="pos-product-price">${formatRupiah(p.sellPrice)}</span>
        <span class="pos-product-stock">Layak jual: ${p.availableStock} ${escapeHtml(p.unit)}</span>
      </div>
    </div>
  `).join('');

  // Add click events
  grid.querySelectorAll('.pos-product-card:not(.out-of-stock)').forEach(card => {
    card.addEventListener('click', () => addToCart(card.dataset.id));
  });
}

function addToCart(productId) {
  const product = products.getById(productId);
  if (!product || product.availableStock <= 0) return;

  const existing = cart.find(item => item.productId === productId);
  if (existing) {
    if (existing.qty >= product.availableStock) {
      showToast('Stok tidak cukup!', 'warning');
      return;
    }
    existing.qty++;
    existing.subtotal = existing.qty * existing.price;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      price: product.sellPrice,
      costPrice: product.buyPrice,
      unit: product.unit,
      qty: 1,
      subtotal: product.sellPrice,
      maxStock: product.availableStock,
    });
  }

  renderCart();
  showToast(`${product.name} ditambahkan`, 'success', 1500);
}

function removeFromCart(index) {
  cart.splice(index, 1);
  renderCart();
}

function updateCartQty(index, delta) {
  const item = cart[index];
  const newQty = item.qty + delta;
  if (newQty <= 0) {
    removeFromCart(index);
    return;
  }
  if (newQty > (products.getById(item.productId)?.availableStock ?? 0)) {
    showToast('Stok tidak cukup!', 'warning');
    return;
  }
  item.qty = newQty;
  item.subtotal = item.qty * item.price;
  renderCart();
}

function getCartTotals() {
  const subtotal = cart.reduce((s, item) => s + item.subtotal, 0);
  let discount = 0;
  if (discountType === 'persen') {
    discount = Math.round(subtotal * discountValue / 100);
  } else {
    discount = discountValue;
  }
  const total = Math.max(0, subtotal - discount);
  return { subtotal, discount, total };
}

function renderCart() {
  const cartEl = document.getElementById('pos-cart');
  const { subtotal, discount, total } = getCartTotals();

  cartEl.innerHTML = `
    <div class="pos-cart-header">
      <h3>
        <i data-lucide="shopping-bag" style="width:20px;height:20px"></i>
        Keranjang
        ${cart.length > 0 ? `<span class="pos-cart-count">${cart.length}</span>` : ''}
      </h3>
      ${cart.length > 0 ? `<button class="btn btn-ghost btn-sm" id="clear-cart"><i data-lucide="trash-2"></i> Kosongkan</button>` : ''}
    </div>
    <div class="pos-cart-items">
      ${cart.length === 0 ? `
        <div class="pos-cart-empty">
          <i data-lucide="shopping-cart"></i>
          <p>Keranjang kosong</p>
          <p style="font-size:0.8rem;margin-top:4px">Klik produk untuk menambahkan</p>
        </div>
      ` : cart.map((item, i) => `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-name">${escapeHtml(item.name)}</div>
            <div class="cart-item-price">${formatRupiah(item.price)} / ${escapeHtml(item.unit)}</div>
          </div>
          <div class="cart-item-qty">
            <button data-action="minus" data-index="${i}"><i data-lucide="minus"></i></button>
            <span>${item.qty}</span>
            <button data-action="plus" data-index="${i}"><i data-lucide="plus"></i></button>
          </div>
          <div class="cart-item-subtotal">${formatRupiah(item.subtotal)}</div>
          <button class="cart-item-remove" data-action="remove" data-index="${i}"><i data-lucide="x"></i></button>
        </div>
      `).join('')}
    </div>
    ${cart.length > 0 ? `
    <div class="pos-cart-summary">
      <div class="cart-summary-row">
        <span>Subtotal</span>
        <strong>${formatRupiah(subtotal)}</strong>
      </div>
      <div class="cart-summary-row">
        <span>Diskon</span>
        <div class="cart-discount-input">
          <input type="number" id="discount-input" value="${discountValue}" min="0" placeholder="0" />
          <select id="discount-type">
            <option value="nominal" ${discountType === 'nominal' ? 'selected' : ''}>Rp</option>
            <option value="persen" ${discountType === 'persen' ? 'selected' : ''}>%</option>
          </select>
        </div>
      </div>
      ${discount > 0 ? `<div class="cart-summary-row" style="color:var(--danger)"><span></span><span>-${formatRupiah(discount)}</span></div>` : ''}
      <div class="cart-summary-row total">
        <span>TOTAL</span>
        <span>${formatRupiah(total)}</span>
      </div>
    </div>
    <div class="pos-cart-actions">
      <div style="margin-bottom:4px;font-size:0.85rem;font-weight:600;color:var(--text-muted)">Metode Pembayaran</div>
      <div class="payment-methods">
        <div class="payment-method ${paymentMethod === 'tunai' ? 'active' : ''}" data-method="tunai">
          <i data-lucide="banknote"></i>
          Tunai
        </div>
        <div class="payment-method ${paymentMethod === 'qris' ? 'active' : ''}" data-method="qris">
          <i data-lucide="qr-code"></i>
          QRIS
        </div>
        <div class="payment-method ${paymentMethod === 'transfer' ? 'active' : ''}" data-method="transfer">
          <i data-lucide="smartphone"></i>
          Transfer
        </div>
      </div>
      <button class="btn btn-primary btn-lg btn-block" id="btn-pay">
        <i data-lucide="check-circle"></i>
        Bayar ${formatRupiah(total)}
      </button>
    </div>
    ` : ''}
  `;

  if (window.lucide) lucide.createIcons({ nodes: [cartEl] });
  bindCartEvents();
}

function bindCartEvents() {
  // Qty buttons
  document.querySelectorAll('[data-action="minus"]').forEach(btn => {
    btn.addEventListener('click', () => updateCartQty(parseInt(btn.dataset.index), -1));
  });
  document.querySelectorAll('[data-action="plus"]').forEach(btn => {
    btn.addEventListener('click', () => updateCartQty(parseInt(btn.dataset.index), 1));
  });
  document.querySelectorAll('[data-action="remove"]').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.index)));
  });

  // Clear cart
  const clearBtn = document.getElementById('clear-cart');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => { cart = []; renderCart(); });
  }

  // Discount
  const discountInput = document.getElementById('discount-input');
  const discountTypeSelect = document.getElementById('discount-type');
  if (discountInput) {
    discountInput.addEventListener('input', () => {
      const value = parseFloat(discountInput.value) || 0;
      discountValue = Math.max(0, discountType === 'persen' ? Math.min(100, value) : Math.min(getCartTotals().subtotal, value));
      renderCart();
      const next = document.getElementById('discount-input'); next?.focus();
    });
  }
  if (discountTypeSelect) {
    discountTypeSelect.addEventListener('change', () => {
      discountType = discountTypeSelect.value;
      discountValue = Math.min(discountValue, discountType === 'persen' ? 100 : getCartTotals().subtotal);
      renderCart();
    });
  }

  // Payment methods
  document.querySelectorAll('.payment-method').forEach(el => {
    el.addEventListener('click', () => {
      paymentMethod = el.dataset.method;
      renderCart();
    });
  });

  // Pay button
  const payBtn = document.getElementById('btn-pay');
  if (payBtn) {
    payBtn.addEventListener('click', showPaymentModal);
  }
}

function showPaymentModal() {
  if (cart.length === 0) return;
  const page=activePOS;
  const checkoutStorageKey=pendingKey();
  const { subtotal, discount, total } = getCartTotals();
  // Keep the same command ID after an ambiguous network failure, including a page reload.
  const fingerprint=JSON.stringify({user:auth.getSession()?.id,items:cart.map(i=>({productId:i.productId,qty:i.qty,price:i.price})),discountType,discountValue,paymentMethod});
  const previous=JSON.parse(sessionStorage.getItem(checkoutStorageKey)||'null');
  if(previous && previous.fingerprint!==fingerprint){
    showToast('Ada pembayaran yang belum terkonfirmasi. Periksa transaksi tertunda sebelum membuat pembayaran baru.', 'warning',7000);
    showPendingCheckout(previous);
    return;
  }
  const requestId=previous?.requestId || crypto.randomUUID();

  const content = `
    <div style="text-align:center;margin-bottom:20px;">
      <div style="font-size:0.9rem;color:var(--text-muted);margin-bottom:4px">Total Pembayaran</div>
      <div style="font-size:2rem;font-weight:800;color:var(--primary)">${formatRupiah(total)}</div>
      <div class="badge badge-info" style="margin-top:8px">${paymentMethod.toUpperCase()}</div>
    </div>
    ${paymentMethod === 'tunai' ? `
    <div class="form-group">
      <label for="pay-amount">Jumlah Bayar</label>
      <input type="number" class="form-input" id="pay-amount" placeholder="Masukkan nominal" autofocus style="font-size:1.2rem;font-weight:700;text-align:center" />
    </div>
    <div id="pay-change" style="text-align:center;margin-top:12px;font-size:1.1rem;display:none">
      <span style="color:var(--text-muted)">Kembalian: </span>
      <strong id="pay-change-value" style="color:var(--success)">Rp 0</strong>
    </div>
    ` : `
    <div style="text-align:center;padding:12px;background:var(--bg-alt);border-radius:var(--radius);color:var(--text-muted);font-size:0.9rem;">
      Pembayaran via ${paymentMethod === 'qris' ? 'QRIS' : 'Transfer Bank'}
    </div>
    `}
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Batal</button>
    <button class="btn btn-primary" id="btn-confirm-pay">
      <i data-lucide="check"></i>
      Konfirmasi Pembayaran
    </button>
  `;

  showModal({ title: 'Pembayaran', content, footer });

  // Bind events
  const payAmountInput = document.getElementById('pay-amount');
  if (payAmountInput) {
    payAmountInput.addEventListener('input', () => {
      const amount = parseFloat(payAmountInput.value) || 0;
      const changeEl = document.getElementById('pay-change');
      const changeValEl = document.getElementById('pay-change-value');
      if (amount >= total) {
        changeEl.style.display = 'block';
        changeValEl.textContent = formatRupiah(amount - total);
      } else {
        changeEl.style.display = 'block';
        changeValEl.textContent = formatRupiah(0);
        changeValEl.style.color = 'var(--danger)';
      }
    });
    payAmountInput.focus();
  }

  document.getElementById('btn-confirm-pay').addEventListener('click', (event) => runAction(event.currentTarget, async () => {
    if(page!==activePOS) return;
    let amountPaid = total;
    let change = 0;

    if (paymentMethod === 'tunai') {
      amountPaid = parseFloat(payAmountInput?.value) || 0;
      if (amountPaid < total) {
        showToast('Jumlah bayar kurang!', 'error');
        return;
      }
      change = amountPaid - total;
    }

    // Save transaction
    const session = auth.getSession();
    const trx = {
      requestId, discountType, discountValue,
      items: cart.map(item => ({
        productId: item.productId,
        name: item.name,
        qty: item.qty,
        price: item.price,
        costPrice: item.costPrice,
        subtotal: item.subtotal,
      })),
      subtotal,
      discount,
      total,
      paymentMethod,
      amountPaid,
      change,
      cashier: session?.name || 'Unknown',
    };

    const pending=previous || {requestId,fingerprint,trx};
    sessionStorage.setItem(checkoutStorageKey,JSON.stringify(pending));
    paymentBusy=true;
    try {
      const saved=await transactions.add(pending.trx);
      sessionStorage.removeItem(checkoutStorageKey);
      if(page!==activePOS)return;
      cart=[];discountValue=0;renderCart();closeModal();showReceipt(saved);
      showToast('Transaksi tersimpan!', 'success');
      try { await refreshInventory();if(page===activePOS)renderProductGrid(); } catch { showToast('Penjualan tersimpan; tampilan stok belum diperbarui.','warning'); }
    } catch(error) {
      if(error.rejected) { sessionStorage.removeItem(checkoutStorageKey);closeModal();showToast(error.message,'error',8000);return; }
      showToast('Pembayaran belum terkonfirmasi: '+error.message+'. Coba konfirmasi lagi dengan transaksi yang sama.', 'error',10000);
    } finally { paymentBusy=false; }
  }));
}

function showReceipt(trx) {
  const s = settings.get();
  const content = `
    <div class="receipt-preview" id="receipt-content">
      <div class="receipt-header">
        <h3>${escapeHtml(s.pharmacyName)}</h3>
        <div>${escapeHtml(s.address)}</div>
        <div>Telp: ${escapeHtml(s.phone)}</div>
      </div>
      <div class="receipt-divider"></div>
      <div style="display:flex;justify-content:space-between;font-size:11px">
        <span>No: ${escapeHtml(trx.trxNo)}</span>
        <span>${new Date(trx.createdAt).toLocaleDateString('id-ID',{timeZone:'Asia/Jakarta'})}</span>
      </div>
      <div style="font-size:11px">Kasir: ${escapeHtml(trx.cashier)}</div>
      <div class="receipt-divider"></div>
      ${trx.items.map(item => `
        <div>${escapeHtml(item.name)}</div>
        <div class="receipt-item">
          <span>${item.qty} x ${formatRupiah(item.price)}</span>
          <span>${formatRupiah(item.subtotal)}</span>
        </div>
      `).join('')}
      <div class="receipt-divider"></div>
      <div class="receipt-item"><span>Subtotal</span><span>${formatRupiah(trx.subtotal)}</span></div>
      ${trx.discount > 0 ? `<div class="receipt-item"><span>Diskon</span><span>-${formatRupiah(trx.discount)}</span></div>` : ''}
      <div class="receipt-item receipt-total"><span>TOTAL</span><span>${formatRupiah(trx.total)}</span></div>
      <div class="receipt-divider"></div>
      <div class="receipt-item"><span>${trx.paymentMethod.toUpperCase()}</span><span>${formatRupiah(trx.amountPaid)}</span></div>
      ${trx.change > 0 ? `<div class="receipt-item"><span>Kembali</span><span>${formatRupiah(trx.change)}</span></div>` : ''}
      <div class="receipt-divider"></div>
      <div style="text-align:center;font-size:11px;margin-top:8px">
        <div>${escapeHtml(s.receiptHeader)}</div>
        <div>${escapeHtml(s.receiptFooter)}</div>
      </div>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Tutup</button>
    <button class="btn btn-primary" id="btn-print-receipt">
      <i data-lucide="printer"></i>
      Cetak Struk
    </button>
  `;

  showModal({ title: 'Struk Transaksi', content, footer });

  document.getElementById('btn-print-receipt').addEventListener('click', () => {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if(!printWindow){showToast('Izinkan pop-up untuk mencetak struk.','warning');return;}
    printWindow.document.write(`
      <html><head><title>Struk</title>
      <style>
        body { font-family: 'Courier New', monospace; font-size: 12px; padding: 10px; line-height: 1.6; max-width: 300px; margin: 0 auto; }
        .receipt-header { text-align: center; }
        .receipt-header h3 { margin: 0; font-size: 14px; }
        .receipt-divider { border-top: 1px dashed #333; margin: 6px 0; }
        .receipt-item { display: flex; justify-content: space-between; }
        .receipt-total { font-weight: bold; font-size: 14px; }
      </style></head><body>
      ${document.getElementById('receipt-content').innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  });
}

function bindPOSEvents() {
  // Search
  const searchInput = document.getElementById('pos-search');
  const debouncedSearch = debounce((val) => {
    searchQuery = val;
    renderProductGrid();
  }, 200);

  searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

  // Category filter
  document.getElementById('pos-category-filter').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#pos-category-filter .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    categoryFilter = tab.dataset.cat;
    renderProductGrid();
  });
}


function showPendingCheckout(pending){
  showModal({title:'Periksa pembayaran tertunda',content:'<p>Periksa apakah pembayaran sebelumnya sudah tersimpan. Jangan mengulang penjualan dengan nomor baru sebelum statusnya jelas.</p>',footer:'<button class="btn btn-primary" id="retry-pending">Konfirmasi ulang transaksi yang sama</button>'});
  document.getElementById('retry-pending').onclick=e=>runAction(e.currentTarget,async()=>{
    let saved;
    try { saved=await transactions.add(pending.trx); } catch(error) { if(error.rejected) {sessionStorage.removeItem(pendingKey());closeModal();} throw error; }
    sessionStorage.removeItem(pendingKey());
    cart=[];discountValue=0;
    if(document.getElementById('pos-cart'))renderCart();
    showReceipt(saved);
    await refreshInventory();
    if(document.getElementById('pos-products-grid'))renderProductGrid();
  });
}
