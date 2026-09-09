// ===== DigiPotek Stock Management Page =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { products } from '../store.js';
import { formatRupiah, escapeHtml, categoryBadge, stockBadge, formatDate, daysBetween, today, debounce } from '../utils.js';

let categoryFilter = '';
let statusFilter = '';
let searchQuery = '';

export function renderStock() {
  categoryFilter = '';
  statusFilter = '';
  searchQuery = '';

  const app = document.getElementById('app');
  const allProds = products.getAll();
  const lowStock = allProds.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
  const outOfStock = allProds.filter(p => p.stock <= 0).length;
  const expiringSoon = products.getExpiringSoon(90).length;

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Manajemen Stok', 'Pantau stok, batch, dan kadaluarsa')}
        <div class="page-content">
          <div class="stats-grid animate-slide-up">
            <div class="stat-card green stagger-1">
              <div class="stat-card-header">
                <span class="stat-card-label">Total Produk</span>
                <div class="stat-card-icon"><i data-lucide="package"></i></div>
              </div>
              <div class="stat-card-value">${allProds.length}</div>
            </div>
            <div class="stat-card orange stagger-2">
              <div class="stat-card-header">
                <span class="stat-card-label">Stok Menipis</span>
                <div class="stat-card-icon"><i data-lucide="alert-triangle"></i></div>
              </div>
              <div class="stat-card-value">${lowStock}</div>
            </div>
            <div class="stat-card red stagger-3">
              <div class="stat-card-header">
                <span class="stat-card-label">Stok Habis</span>
                <div class="stat-card-icon"><i data-lucide="package-x"></i></div>
              </div>
              <div class="stat-card-value">${outOfStock}</div>
            </div>
            <div class="stat-card purple stagger-4">
              <div class="stat-card-header">
                <span class="stat-card-label">Hampir Kadaluarsa</span>
                <div class="stat-card-icon"><i data-lucide="clock"></i></div>
              </div>
              <div class="stat-card-value">${expiringSoon}</div>
            </div>
          </div>

          <div class="card animate-slide-up" style="animation-delay:0.2s;animation-fill-mode:backwards">
            <div class="card-header">
              <h3>Data Stok Produk</h3>
            </div>
            <div style="padding:16px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center">
              <div class="search-box" style="min-width:220px;flex:1">
                <i data-lucide="search"></i>
                <input type="text" id="stock-search" placeholder="Cari produk..." />
              </div>
              <div class="filter-tabs" id="stock-category-filter">
                <button class="filter-tab active" data-cat="">Semua</button>
                <button class="filter-tab" data-cat="obat">💊 Obat</button>
                <button class="filter-tab" data-cat="non-obat">🧴 Non-Obat</button>
                <button class="filter-tab" data-cat="alkes">🩺 Alkes</button>
              </div>
              <div class="filter-tabs" id="stock-status-filter">
                <button class="filter-tab active" data-status="">Semua</button>
                <button class="filter-tab" data-status="low">⚠️ Menipis</button>
                <button class="filter-tab" data-status="out">❌ Habis</button>
                <button class="filter-tab" data-status="expiring">⏰ Kadaluarsa</button>
              </div>
            </div>
            <div class="card-body" style="padding:0">
              <div class="table-container" id="stock-table-container"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  bindHeaderEvents();
  renderStockTable();
  bindStockEvents();

  return {};
}

function getFilteredProducts() {
  let data = products.search(searchQuery, categoryFilter);

  if (statusFilter === 'low') {
    data = data.filter(p => p.stock > 0 && p.stock <= p.minStock);
  } else if (statusFilter === 'out') {
    data = data.filter(p => p.stock <= 0);
  } else if (statusFilter === 'expiring') {
    const now = new Date();
    const limit = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    data = data.filter(p => {
      if (!p.batches || p.batches.length === 0) return false;
      return p.batches.some(b => b.expiry && new Date(b.expiry) <= limit && new Date(b.expiry) >= now);
    });
  }

  return data;
}

function renderStockTable() {
  const container = document.getElementById('stock-table-container');
  const prods = getFilteredProducts();

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Produk</th>
          <th>Kategori</th>
          <th>Stok</th>
          <th>Min. Stok</th>
          <th>Satuan</th>
          <th>Status</th>
          <th>Batch</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${prods.length === 0 ? `
          <tr><td colspan="8" class="empty-state" style="padding:40px">Tidak ada produk ditemukan</td></tr>
        ` : prods.map(p => {
          const batches = p.batches || [];
          const nearestExpiry = batches
            .filter(b => b.expiry)
            .sort((a, b) => new Date(a.expiry) - new Date(b.expiry))[0];
          const daysToExpiry = nearestExpiry ? daysBetween(today(), nearestExpiry.expiry) : null;
          
          let expiryBadge = '';
          if (daysToExpiry !== null) {
            if (daysToExpiry < 0) expiryBadge = '<span class="badge badge-danger">Kadaluarsa!</span>';
            else if (daysToExpiry <= 90) expiryBadge = `<span class="badge badge-warning">${daysToExpiry} hari lagi</span>`;
            else expiryBadge = `<span class="badge badge-success">${formatDate(nearestExpiry.expiry)}</span>`;
          }

          return `
          <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${categoryBadge(p.category)}</td>
            <td><strong style="font-size:1.05rem">${p.stock}</strong></td>
            <td>${p.minStock}</td>
            <td>${p.unit}</td>
            <td>${stockBadge(p.stock, p.minStock)}</td>
            <td>
              ${batches.length > 0 ? `
                <span style="font-size:0.8rem;color:var(--text-muted)">${batches.length} batch</span>
                ${expiryBadge}
              ` : '<span style="color:var(--text-light);font-size:0.8rem">-</span>'}
            </td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm btn-secondary" data-action="view-batch" data-id="${p.id}" title="Lihat Batch">
                  <i data-lucide="eye"></i>
                </button>
                <button class="btn btn-sm btn-primary" data-action="adjust" data-id="${p.id}" title="Adjustment Stok">
                  <i data-lucide="settings-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `}).join('')}
      </tbody>
    </table>
  `;

  if (window.lucide) lucide.createIcons({ nodes: [container] });

  // Bind table actions
  container.querySelectorAll('[data-action="view-batch"]').forEach(btn => {
    btn.addEventListener('click', () => showBatchDetail(btn.dataset.id));
  });
  container.querySelectorAll('[data-action="adjust"]').forEach(btn => {
    btn.addEventListener('click', () => showAdjustStock(btn.dataset.id));
  });
}

function showBatchDetail(productId) {
  const product = products.getById(productId);
  if (!product) return;

  const batches = product.batches || [];

  const content = `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg-alt);border-radius:var(--radius)">
      <strong>${escapeHtml(product.name)}</strong> — 
      ${categoryBadge(product.category)}
      <div style="margin-top:4px;font-size:0.85rem;color:var(--text-muted)">Total Stok: <strong>${product.stock} ${product.unit}</strong></div>
    </div>
    ${batches.length === 0 ? `
      <div class="empty-state" style="padding:20px">
        <p>Belum ada data batch</p>
      </div>
    ` : `
      <div class="table-container">
        <table>
          <thead>
            <tr><th>No. Batch</th><th>Jumlah</th><th>Kadaluarsa</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${batches.map(b => {
              const daysLeft = b.expiry ? daysBetween(today(), b.expiry) : null;
              let statusBadge = '<span class="badge badge-default">-</span>';
              if (daysLeft !== null) {
                if (daysLeft < 0) statusBadge = '<span class="badge badge-danger">Kadaluarsa</span>';
                else if (daysLeft <= 30) statusBadge = '<span class="badge badge-danger">Segera!</span>';
                else if (daysLeft <= 90) statusBadge = '<span class="badge badge-warning">Perhatian</span>';
                else statusBadge = '<span class="badge badge-success">Aman</span>';
              }
              return `
                <tr>
                  <td><strong>${b.batchNo || '-'}</strong></td>
                  <td>${b.qty} ${product.unit}</td>
                  <td>${b.expiry ? formatDate(b.expiry) : '-'}</td>
                  <td>${statusBadge}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;

  showModal({ title: 'Detail Batch', content, size: 'lg' });
}

function showAdjustStock(productId) {
  const product = products.getById(productId);
  if (!product) return;

  const content = `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg-alt);border-radius:var(--radius)">
      <strong>${escapeHtml(product.name)}</strong><br>
      <span style="font-size:0.85rem;color:var(--text-muted)">Stok saat ini: <strong>${product.stock} ${product.unit}</strong></span>
    </div>
    <form id="adjust-form">
      <div class="form-group">
        <label for="adj-type">Tipe Adjustment</label>
        <select class="form-select" id="adj-type">
          <option value="set">Set Stok (Stok Opname)</option>
          <option value="add">Tambah Stok</option>
          <option value="subtract">Kurangi Stok</option>
        </select>
      </div>
      <div class="form-group">
        <label for="adj-qty">Jumlah</label>
        <input type="number" class="form-input" id="adj-qty" min="0" placeholder="0" required />
      </div>
      <div class="form-group">
        <label for="adj-note">Catatan (opsional)</label>
        <input type="text" class="form-input" id="adj-note" placeholder="contoh: Stok opname, barang rusak, dll" />
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Batal</button>
    <button class="btn btn-primary" id="btn-save-adjust">
      <i data-lucide="save"></i>
      Simpan
    </button>
  `;

  showModal({ title: 'Adjustment Stok', content, footer });

  document.getElementById('btn-save-adjust').addEventListener('click', () => {
    const type = document.getElementById('adj-type').value;
    const qty = parseInt(document.getElementById('adj-qty').value) || 0;

    if (qty < 0) {
      showToast('Jumlah tidak valid!', 'error');
      return;
    }

    let newStock;
    if (type === 'set') newStock = qty;
    else if (type === 'add') newStock = product.stock + qty;
    else newStock = Math.max(0, product.stock - qty);

    products.update(productId, { stock: newStock });
    closeModal();
    renderStock();
    showToast(`Stok ${product.name} diperbarui menjadi ${newStock} ${product.unit}`, 'success');
  });
}

function bindStockEvents() {
  // Search
  const searchInput = document.getElementById('stock-search');
  const debouncedSearch = debounce((val) => {
    searchQuery = val;
    renderStockTable();
  }, 200);
  searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

  // Category filter
  document.getElementById('stock-category-filter').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#stock-category-filter .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    categoryFilter = tab.dataset.cat;
    renderStockTable();
  });

  // Status filter
  document.getElementById('stock-status-filter').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#stock-status-filter .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    statusFilter = tab.dataset.status;
    renderStockTable();
  });
}
