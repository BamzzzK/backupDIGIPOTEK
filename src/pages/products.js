// ===== DigiPotek Products Page =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { products } from '../store.js';
import { formatRupiah, escapeHtml, categoryBadge, stockBadge, debounce, generateId } from '../utils.js';

let searchQuery = '';
let categoryFilter = '';
let currentPage = 1;
const PAGE_SIZE = 10;

export function renderProducts() {
  searchQuery = '';
  categoryFilter = '';
  currentPage = 1;

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Produk', 'Kelola produk dan tambah stok')}
        <div class="page-content">
          <div class="toolbar animate-slide-up">
            <div class="toolbar-left">
              <div class="search-box" style="min-width:250px">
                <i data-lucide="search"></i>
                <input type="text" id="product-search" placeholder="Cari produk..." />
              </div>
              <div class="filter-tabs" id="product-category-filter">
                <button class="filter-tab active" data-cat="">Semua</button>
                <button class="filter-tab" data-cat="obat">💊 Obat</button>
                <button class="filter-tab" data-cat="non-obat">🧴 Non-Obat</button>
                <button class="filter-tab" data-cat="alkes">🩺 Alkes</button>
              </div>
            </div>
            <div class="toolbar-right">
              <button class="btn btn-primary" id="btn-add-product">
                <i data-lucide="plus"></i>
                Tambah Produk
              </button>
            </div>
          </div>

          <div class="card animate-slide-up" style="animation-delay:0.1s;animation-fill-mode:backwards">
            <div class="card-body" style="padding:0">
              <div class="table-container" id="products-table-container"></div>
            </div>
          </div>
          <div id="products-pagination"></div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  bindHeaderEvents();
  renderProductsTable();
  bindProductsEvents();

  return {};
}

function renderProductsTable() {
  const container = document.getElementById('products-table-container');
  const allProds = products.search(searchQuery, categoryFilter);
  const totalPages = Math.ceil(allProds.length / PAGE_SIZE);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageProds = allProds.slice(start, start + PAGE_SIZE);

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Produk</th>
          <th>Kategori</th>
          <th>Satuan</th>
          <th>Harga Beli</th>
          <th>Harga Jual</th>
          <th>Stok</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${pageProds.length === 0 ? `
          <tr><td colspan="8" class="empty-state" style="padding:40px"><i data-lucide="package-x" style="width:40px;height:40px;margin:0 auto 8px;display:block;opacity:0.3"></i>Tidak ada produk ditemukan</td></tr>
        ` : pageProds.map(p => `
          <tr>
            <td><strong>${escapeHtml(p.name)}</strong></td>
            <td>${categoryBadge(p.category)}</td>
            <td>${p.unit}</td>
            <td>${formatRupiah(p.buyPrice)}</td>
            <td>${formatRupiah(p.sellPrice)}</td>
            <td><strong>${p.stock}</strong></td>
            <td>${stockBadge(p.stock, p.minStock)}</td>
            <td>
              <div style="display:flex;gap:4px">
                <button class="btn btn-sm btn-secondary" data-action="add-stock" data-id="${p.id}" title="Tambah Stok">
                  <i data-lucide="plus-circle"></i>
                </button>
                <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${p.id}" title="Edit">
                  <i data-lucide="edit-2"></i>
                </button>
                <button class="btn btn-sm btn-ghost" data-action="delete" data-id="${p.id}" title="Hapus" style="color:var(--danger)">
                  <i data-lucide="trash-2"></i>
                </button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // Pagination
  const pagEl = document.getElementById('products-pagination');
  if (totalPages > 1) {
    let pagHtml = '<div class="pagination">';
    pagHtml += `<button ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage-1}">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    pagHtml += `<button ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage+1}">›</button>`;
    pagHtml += '</div>';
    pagEl.innerHTML = pagHtml;
    pagEl.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages) {
          currentPage = p;
          renderProductsTable();
        }
      });
    });
  } else {
    pagEl.innerHTML = '';
  }

  if (window.lucide) lucide.createIcons({ nodes: [container] });
  bindTableActions();
}

function bindTableActions() {
  document.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => showProductForm(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => deleteProduct(btn.dataset.id));
  });
  document.querySelectorAll('[data-action="add-stock"]').forEach(btn => {
    btn.addEventListener('click', () => showAddStockModal(btn.dataset.id));
  });
}

function showProductForm(editId = null) {
  const product = editId ? products.getById(editId) : null;
  const title = product ? 'Edit Produk' : 'Tambah Produk Baru';

  const content = `
    <form id="product-form">
      <div class="form-group">
        <label for="pf-name">Nama Produk *</label>
        <input type="text" class="form-input" id="pf-name" value="${product ? escapeHtml(product.name) : ''}" placeholder="contoh: Paracetamol 500mg" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pf-category">Kategori *</label>
          <select class="form-select" id="pf-category" required>
            <option value="obat" ${product?.category === 'obat' ? 'selected' : ''}>💊 Obat</option>
            <option value="non-obat" ${product?.category === 'non-obat' ? 'selected' : ''}>🧴 Non-Obat</option>
            <option value="alkes" ${product?.category === 'alkes' ? 'selected' : ''}>🩺 Alat Kesehatan</option>
          </select>
        </div>
        <div class="form-group">
          <label for="pf-unit">Satuan *</label>
          <input type="text" class="form-input" id="pf-unit" value="${product ? product.unit : ''}" placeholder="strip, botol, box, pcs" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pf-buyPrice">Harga Beli (Rp) *</label>
          <input type="number" class="form-input" id="pf-buyPrice" value="${product ? product.buyPrice : ''}" placeholder="0" min="0" required />
        </div>
        <div class="form-group">
          <label for="pf-sellPrice">Harga Jual (Rp) *</label>
          <input type="number" class="form-input" id="pf-sellPrice" value="${product ? product.sellPrice : ''}" placeholder="0" min="0" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="pf-stock">Stok ${product ? 'Saat Ini' : 'Awal'}</label>
          <input type="number" class="form-input" id="pf-stock" value="${product ? product.stock : 0}" min="0" />
        </div>
        <div class="form-group">
          <label for="pf-minStock">Stok Minimum</label>
          <input type="number" class="form-input" id="pf-minStock" value="${product ? product.minStock : 5}" min="0" />
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Batal</button>
    <button class="btn btn-primary" id="btn-save-product">
      <i data-lucide="save"></i>
      ${product ? 'Simpan Perubahan' : 'Tambah Produk'}
    </button>
  `;

  showModal({ title, content, footer });

  document.getElementById('btn-save-product').addEventListener('click', () => {
    const name = document.getElementById('pf-name').value.trim();
    const category = document.getElementById('pf-category').value;
    const unit = document.getElementById('pf-unit').value.trim();
    const buyPrice = parseInt(document.getElementById('pf-buyPrice').value) || 0;
    const sellPrice = parseInt(document.getElementById('pf-sellPrice').value) || 0;
    const stock = parseInt(document.getElementById('pf-stock').value) || 0;
    const minStock = parseInt(document.getElementById('pf-minStock').value) || 5;

    if (!name || !unit || buyPrice <= 0 || sellPrice <= 0) {
      showToast('Mohon lengkapi semua field yang wajib!', 'error');
      return;
    }

    if (sellPrice <= buyPrice) {
      showToast('Harga jual harus lebih besar dari harga beli!', 'warning');
    }

    const data = { name, category, unit, buyPrice, sellPrice, stock, minStock };

    if (product) {
      products.update(editId, data);
      showToast('Produk berhasil diperbarui!', 'success');
    } else {
      data.batches = [];
      products.add(data);
      showToast('Produk berhasil ditambahkan!', 'success');
    }

    closeModal();
    renderProductsTable();
  });
}

function showAddStockModal(productId) {
  const product = products.getById(productId);
  if (!product) return;

  const content = `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg-alt);border-radius:var(--radius);">
      <strong>${escapeHtml(product.name)}</strong><br>
      <span style="font-size:0.85rem;color:var(--text-muted)">Stok saat ini: <strong>${product.stock} ${product.unit}</strong></span>
    </div>
    <form id="add-stock-form">
      <div class="form-group">
        <label for="as-qty">Jumlah Tambah Stok *</label>
        <input type="number" class="form-input" id="as-qty" placeholder="0" min="1" required autofocus />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="as-batch">No. Batch</label>
          <input type="text" class="form-input" id="as-batch" placeholder="contoh: PCT-2024B" />
        </div>
        <div class="form-group">
          <label for="as-expiry">Tanggal Kadaluarsa</label>
          <input type="date" class="form-input" id="as-expiry" />
        </div>
      </div>
    </form>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Batal</button>
    <button class="btn btn-primary" id="btn-save-stock">
      <i data-lucide="plus-circle"></i>
      Tambah Stok
    </button>
  `;

  showModal({ title: 'Tambah Stok', content, footer });

  document.getElementById('btn-save-stock').addEventListener('click', () => {
    const qty = parseInt(document.getElementById('as-qty').value) || 0;
    const batchNo = document.getElementById('as-batch').value.trim();
    const expiry = document.getElementById('as-expiry').value;

    if (qty <= 0) {
      showToast('Jumlah harus lebih dari 0!', 'error');
      return;
    }

    products.addStock(productId, qty, batchNo || '-', expiry || '');
    closeModal();
    renderProductsTable();
    showToast(`Stok ${product.name} bertambah ${qty} ${product.unit}`, 'success');
  });
}

function deleteProduct(id) {
  const product = products.getById(id);
  if (!product) return;

  const content = `
    <div style="text-align:center;padding:20px 0">
      <i data-lucide="alert-triangle" style="width:48px;height:48px;color:var(--warning);margin-bottom:12px"></i>
      <h3 style="margin-bottom:8px">Hapus Produk?</h3>
      <p style="color:var(--text-muted)">Produk <strong>"${escapeHtml(product.name)}"</strong> akan dihapus dari daftar.</p>
    </div>
  `;

  const footer = `
    <button class="btn btn-secondary" onclick="document.getElementById('modal-close-btn').click()">Batal</button>
    <button class="btn btn-danger" id="btn-confirm-delete">
      <i data-lucide="trash-2"></i>
      Hapus
    </button>
  `;

  showModal({ title: 'Konfirmasi Hapus', content, footer });

  document.getElementById('btn-confirm-delete').addEventListener('click', () => {
    products.remove(id);
    closeModal();
    renderProductsTable();
    showToast('Produk berhasil dihapus', 'success');
  });
}

function bindProductsEvents() {
  // Search
  const searchInput = document.getElementById('product-search');
  const debouncedSearch = debounce((val) => {
    searchQuery = val;
    currentPage = 1;
    renderProductsTable();
  }, 200);
  searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

  // Category filter
  document.getElementById('product-category-filter').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#product-category-filter .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    categoryFilter = tab.dataset.cat;
    currentPage = 1;
    renderProductsTable();
  });

  // Add product button
  document.getElementById('btn-add-product').addEventListener('click', () => showProductForm());
}
