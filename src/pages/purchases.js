// ===== DigiPotek Purchase Invoices Page (Faktur Pembelian) =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { showToast } from '../components/toast.js';
import { showModal, closeModal } from '../components/modal.js';
import { purchases, suppliers, products, auth } from '../store.js';
import { navigate } from '../router.js';
import {
  formatRupiah,
  escapeHtml,
  formatDate,
  today,
  businessDate,
  generateBatchNo,
  businessDateTime,
  runAction
} from '../utils.js';

let activeView = 'list'; // 'list' | 'create'
let searchQuery = '';
let filterStartDate = '';
let filterEndDate = '';
let currentInvoiceData = null;
let pageEpoch = 0;
let rangeRequest = 0;

export function renderPurchases(subAction = 'list') {
  pageEpoch++;
  activeView = subAction === 'new' ? 'create' : 'list';
  resetFormState();
  searchQuery = '';

  // Default date filter: 30 days ago until today
  const d = new Date();
  d.setDate(d.getDate() - 30);
  filterStartDate = businessDate(d);
  filterEndDate = today();

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Faktur Pembelian', 'Kelola penerimaan barang dan faktur pembelian dari supplier')}
        <div id="purchase-notices" aria-live="polite"></div>
        <div class="page-content" id="purchase-page-content">
          ${activeView === 'create' ? renderCreateView() : renderListView()}
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  bindHeaderEvents();
  renderPurchaseNotices();

  if (activeView === 'create') {
    initCreateViewEvents();
  } else {
    initListViewEvents();
  }

  return {
    destroy() {
      pageEpoch++;
      rangeRequest++;
      resetFormState();
      currentInvoiceData = null;
    }
  };
}

// ===== 1. LIST VIEW =====

function renderPurchaseNotices() {
  const target=document.getElementById('purchase-notices');
  if(!target) return;
  const pending=purchases.pending?.();
  const legacy=purchases.hasLegacyLocalData?.();
  target.innerHTML=`${pending ? `<div class="card" style="margin:16px 24px;padding:16px"><p>Permintaan faktur ${escapeHtml(pending.args.payload?.invoiceNo || '')} belum terkonfirmasi. Periksa kembali dengan permintaan yang sama.</p><button id="retry-purchase-command" class="btn btn-primary">Periksa permintaan tertunda</button></div>` : ''}
    ${legacy ? '<div class="card" style="margin:16px 24px;padding:16px"><p>Browser ini menyimpan data pembelian versi lama. Unduh untuk pencocokan dengan data server.</p><button id="export-old-purchases" class="btn btn-secondary">Unduh data pembelian lama</button></div>' : ''}`;
  const retry=document.getElementById('retry-purchase-command');
  if(retry) retry.onclick=e=>runAction(e.currentTarget,async()=>{
    const epoch=pageEpoch;
    try {
      const saved=await purchases.retryPending();
      if(epoch!==pageEpoch) return;
      resetFormState();activeView='list';
      document.getElementById('purchase-page-content').innerHTML=renderListView();
      initListViewEvents();
      if(window.lucide) lucide.createIcons();
      showToast(`Faktur ${saved.invoiceNo} sudah terkonfirmasi.`, 'success');
      if(saved.inventoryRefreshFailed) showToast('Faktur tersimpan; segarkan tampilan stok saat koneksi pulih.','warning');
    } finally { if(epoch===pageEpoch) renderPurchaseNotices(); }
  });
  const exportButton=document.getElementById('export-old-purchases');
  if(exportButton) exportButton.onclick=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(purchases.exportLegacy(),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='apotek-pembelian-browser-lama.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}

function renderListView() {
  const allInvoices = purchases.getByDateRange(filterStartDate, filterEndDate);
  const filtered = allInvoices.filter(inv => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (inv.invoiceNo && inv.invoiceNo.toLowerCase().includes(q)) ||
      (inv.supplierName && inv.supplierName.toLowerCase().includes(q)) ||
      (inv.officerName && inv.officerName.toLowerCase().includes(q)) ||
      (inv.orderNo && inv.orderNo.toLowerCase().includes(q))
    );
  });

  const grandTotalSum = filtered.reduce((acc, inv) => acc + (inv.status==='cancelled' ? 0 : (inv.total || 0)), 0);
  const totalCount = filtered.length;

  return `
    <div class="toolbar animate-slide-up">
      <div class="toolbar-left" style="gap:10px;flex-wrap:wrap">
        <div class="search-box" style="min-width:240px">
          <i data-lucide="search"></i>
          <input type="text" id="purchase-search" placeholder="Cari data faktur, supplier..." value="${escapeHtml(searchQuery)}" />
        </div>
        <div class="date-filter-group" style="display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:4px 10px">
          <i data-lucide="calendar" style="width:16px;height:16px;color:var(--text-muted)"></i>
          <input type="date" id="filter-start-date" value="${filterStartDate}" class="date-filter-input" aria-label="Tanggal Awal" />
          <span style="color:var(--text-muted);font-size:12px">s.d.</span>
          <input type="date" id="filter-end-date" value="${filterEndDate}" class="date-filter-input" aria-label="Tanggal Akhir" />
          <button id="btn-apply-date-filter" class="btn btn-sm btn-secondary" title="Terapkan Filter Tanggal">Filter</button>
        </div>
      </div>
      <div class="toolbar-right" style="gap:8px">
        <button class="btn btn-secondary" id="btn-refresh-purchases" title="Segarkan Data">
          <i data-lucide="refresh-cw"></i>
          <span>Segarkan</span>
        </button>
        <button class="btn btn-primary" id="btn-to-create-purchase">
          <i data-lucide="plus"></i>
          <span>Faktur Pembelian</span>
        </button>
      </div>
    </div>

    <div class="card animate-slide-up" style="animation-delay:0.1s;animation-fill-mode:backwards;margin-bottom:16px">
      <div class="card-body" style="padding:0">
        <div class="table-container" id="purchases-table-container">
          ${renderTableContent(filtered)}
        </div>
      </div>
    </div>

    <div class="purchase-summary-bar animate-slide-up">
      <div class="summary-bar-header">
        Rekap dari ${formatDate(filterStartDate)} s.d. ${formatDate(filterEndDate)}
      </div>
      <div class="summary-bar-content">
        <div class="summary-bar-item">
          <span class="summary-label">Total Keseluruhan:</span>
          <strong class="summary-value">${formatRupiah(grandTotalSum)}</strong>
        </div>
        <div class="summary-bar-item">
          <span class="summary-label">Jumlah Transaksi:</span>
          <strong class="summary-value">${totalCount}x</strong>
        </div>
      </div>
    </div>
  `;
}

function renderTableContent(items) {
  if (items.length === 0) {
    return `
      <div class="empty-state" style="padding:48px 20px;text-align:center">
        <div style="width:54px;height:54px;border-radius:50%;background:var(--primary-lighter);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
          <i data-lucide="file-text" style="width:28px;height:28px"></i>
        </div>
        <h4 style="margin-bottom:6px;font-weight:600">Data faktur tidak ditemukan</h4>
        <p style="color:var(--text-muted);max-width:380px;margin:0 auto 16px;font-size:13px">
          Belum ada faktur pembelian pada rentang tanggal ini. Silakan ubah filter tanggal atau tambahkan faktur baru.
        </p>
        <button class="btn btn-primary btn-sm" id="btn-empty-add-purchase">
          <i data-lucide="plus"></i>
          Tambah Faktur Pembelian
        </button>
      </div>
    `;
  }

  const rows = items.map((inv, index) => {
    const itemCount = inv.items ? inv.items.length : 0;
    const productsPreview = inv.items && inv.items.length > 0
      ? inv.items.slice(0, 2).map(i => escapeHtml(i.productName)).join(', ') + (inv.items.length > 2 ? ` (+${inv.items.length - 2})` : '')
      : 'Tidak ada item';

    const payBadgeClass = inv.paymentType === 'tunai' ? 'badge-success' : 'badge-warning';
    const payBadgeText = inv.paymentType === 'tunai' ? 'Tunai' : (inv.paymentType === 'transfer' ? 'Transfer' : 'Kredit');

    return `
      <tr>
        <td style="text-align:center;width:48px">${index + 1}</td>
        <td>
          <div style="font-weight:500">${formatDate(inv.invoiceDate || inv.createdAt)}</div>
          <div style="font-size:11px;color:var(--text-muted)">Tempo: ${inv.dueDate ? formatDate(inv.dueDate) : '-'}</div>
        </td>
        <td>
          <div>${escapeHtml(inv.officerName || 'Petugas')}</div>
        </td>
        <td>
          <strong>${escapeHtml(inv.invoiceNo)}</strong>
          ${inv.status==='cancelled' ? '<span class="badge badge-danger">Dibatalkan</span>' : ''}
          ${inv.orderNo ? `<div style="font-size:11px;color:var(--text-muted)">SP: ${escapeHtml(inv.orderNo)}</div>` : ''}
        </td>
        <td>
          <div style="font-weight:500">${escapeHtml(inv.supplierName || 'Umum')}</div>
          <span class="badge ${payBadgeClass}" style="font-size:10px;padding:2px 6px">${payBadgeText}</span>
        </td>
        <td>
          <div><strong>${itemCount}</strong> Produk</div>
          <div style="font-size:11px;color:var(--text-muted);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${productsPreview}</div>
        </td>
        <td>
          <strong style="color:var(--primary)">${formatRupiah(inv.total)}</strong>
        </td>
        <td style="text-align:center">
          <div style="display:flex;gap:4px;justify-content:center">
            <button class="btn btn-sm btn-secondary btn-icon-only btn-view-invoice" data-id="${inv.id}" title="Lihat Rincian Faktur" aria-label="Lihat Rincian Faktur">
              <i data-lucide="eye"></i>
            </button>
            <button class="btn btn-sm btn-secondary btn-icon-only btn-edit-invoice" data-id="${inv.id}" title="Edit Faktur" aria-label="Edit Faktur" ${inv.status==='cancelled' ? 'disabled' : ''}>
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn btn-sm btn-secondary btn-icon-only btn-delete-invoice" data-id="${inv.id}" title="Batalkan Faktur" aria-label="Batalkan Faktur" style="color:var(--danger)" ${inv.status==='cancelled' || inv.canModifyStock===false ? 'disabled' : ''}>
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <table class="purchases-table">
      <thead>
        <tr>
          <th style="text-align:center;width:48px">No.</th>
          <th>Tanggal</th>
          <th>Petugas</th>
          <th>No. Faktur</th>
          <th>Supplier</th>
          <th>Produk</th>
          <th>Total Pembelian</th>
          <th style="text-align:center">Aksi</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function initListViewEvents() {
  const content = document.getElementById('purchase-page-content');
  if (!content) return;

  const switchToCreate = () => {
    resetFormState();
    activeView = 'create';
    content.innerHTML = renderCreateView();
    if (window.lucide) lucide.createIcons();
    initCreateViewEvents();
    if (window.location && window.location.hash !== '#/purchases/new') {
      window.location.hash = '/purchases/new';
    }
  };

  const btnCreate = document.getElementById('btn-to-create-purchase');
  if (btnCreate) btnCreate.onclick = switchToCreate;

  const btnEmptyAdd = document.getElementById('btn-empty-add-purchase');
  if (btnEmptyAdd) btnEmptyAdd.onclick = switchToCreate;

  const searchInput = document.getElementById('purchase-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      searchQuery = e.target.value;
      const tableCont = document.getElementById('purchases-table-container');
      if (tableCont) {
        const allInvoices = purchases.getByDateRange(filterStartDate, filterEndDate);
        const filtered = allInvoices.filter(inv => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            (inv.invoiceNo && inv.invoiceNo.toLowerCase().includes(q)) ||
            (inv.supplierName && inv.supplierName.toLowerCase().includes(q)) ||
            (inv.officerName && inv.officerName.toLowerCase().includes(q)) ||
            (inv.orderNo && inv.orderNo.toLowerCase().includes(q))
          );
        });
        tableCont.innerHTML = renderTableContent(filtered);
        if (window.lucide) lucide.createIcons();
        bindViewDetailButtons();
      }
    };
  }

  const btnFilter = document.getElementById('btn-apply-date-filter');
  if (btnFilter) {
    btnFilter.onclick = (event) => runAction(event.currentTarget,async () => {
      const s = document.getElementById('filter-start-date').value;
      const e = document.getElementById('filter-end-date').value;
      if (s && e) {
        if (s > e) {
          showToast('Tanggal awal tidak boleh melebihi tanggal akhir.', 'error');
          return;
        }
        const epoch=pageEpoch,ticket=++rangeRequest;
        await purchases.loadRange(s,e);
        if(epoch!==pageEpoch || ticket!==rangeRequest || activeView!=='list') return;
        filterStartDate = s;
        filterEndDate = e;
        content.innerHTML = renderListView();
        if (window.lucide) lucide.createIcons();
        initListViewEvents();
      }
    });
  }

  const btnRefresh = document.getElementById('btn-refresh-purchases');
  if (btnRefresh) {
    btnRefresh.onclick = (event) => runAction(event.currentTarget,async () => {
      const epoch=pageEpoch,ticket=++rangeRequest;
      try {
        await purchases.loadRange(filterStartDate, filterEndDate);
        if(epoch!==pageEpoch || ticket!==rangeRequest || activeView!=='list') return;
        content.innerHTML = renderListView();
        if (window.lucide) lucide.createIcons();
        initListViewEvents();
        showToast('Data faktur berhasil diperbarui.', 'success');
      } catch (err) {
        showToast('Gagal memuat data: ' + err.message, 'error');
      }
    });
  }

  bindViewDetailButtons();
}

function bindViewDetailButtons() {
  const content = document.getElementById('purchase-page-content');

  // View invoice detail
  const viewBtns = document.querySelectorAll('.btn-view-invoice');
  viewBtns.forEach(btn => {
    btn.onclick = () => {
      const invId = btn.getAttribute('data-id');
      const invoice = purchases.getById(invId);
      if (invoice) {
        showInvoiceDetailModal(invoice);
      }
    };
  });

  // Edit invoice
  const editBtns = document.querySelectorAll('.btn-edit-invoice');
  editBtns.forEach(btn => {
    btn.onclick = () => {
      const invId = btn.getAttribute('data-id');
      const invoice = purchases.getById(invId);
      if (invoice) {
        formState = {
          editingId: invoice.id,
          version: invoice.version,
          supplierId: invoice.supplierId || '',
          supplierName: invoice.supplierName || '',
          orderNo: invoice.orderNo || '',
          invoiceNo: invoice.invoiceNo || '',
          invoiceDate: invoice.invoiceDate || today(),
          receivedAt: businessDateTime(invoice.receivedAt || new Date()),
          invoiceType: invoice.invoiceType || 'exclude_tax',
          warehouse: invoice.warehouse || 'Gudang Utama',
          paymentType: invoice.paymentType || 'kredit',
          paymentTerm: Number(invoice.paymentTerm || 0),
          dueDate: invoice.dueDate || '',
          discountType: invoice.discountType || 'persen',
          discountValue: Number(invoice.discountValue || 0),
          cashback: Number(invoice.cashback || 0),
          otherFees: Number(invoice.otherFees || 0),
          notes: invoice.notes || '',
          pkpStatus: invoice.pkpStatus || 'non_pkp',
          items: (invoice.items || []).map(it => ({ ...it }))
        };

        activeView = 'create';
        if (content) {
          content.innerHTML = renderCreateView();
          if (window.lucide) lucide.createIcons();
          initCreateViewEvents();
        }
      }
    };
  });

  // Delete invoice
  const deleteBtns = document.querySelectorAll('.btn-delete-invoice');
  deleteBtns.forEach(btn => {
    btn.onclick = () => {
      const invId = btn.getAttribute('data-id');
      const invoice = purchases.getById(invId);
      if (invoice) {
        showDeleteInvoiceModal(invoice);
      }
    };
  });
}

function showDeleteInvoiceModal(inv) {
  const modalHtml = `
    <div style="padding:10px 0">
      <p style="margin-bottom:12px;font-size:14px">
        Apakah Anda yakin ingin membatalkan/menghapus faktur <strong>${escapeHtml(inv.invoiceNo)}</strong> dari <strong>${escapeHtml(inv.supplierName || 'Supplier')}</strong>?
      </p>
      <div style="background:var(--danger-light);color:var(--danger-hover);padding:12px;border-radius:var(--radius);font-size:12px;margin-bottom:16px">
        Stok dikembalikan hanya dari batch faktur ini. Pembatalan ditolak jika batch sudah terjual atau disesuaikan. Riwayat faktur tetap disimpan.
      </div>
      <label for="cancel-purchase-reason">Alasan pembatalan</label>
      <input id="cancel-purchase-reason" class="form-input" maxlength="1000" placeholder="Contoh: salah input faktur" required />
      <div style="display:flex;justify-content:flex-end;gap:10px">
        <button type="button" class="btn btn-secondary" id="btn-cancel-del">Batal</button>
        <button type="button" class="btn btn-danger" id="btn-confirm-del">
          <i data-lucide="trash-2"></i>
          Ya, Batalkan & Kurangi Stok
        </button>
      </div>
    </div>
  `;

  showModal({ title: `Batalkan Faktur: ${escapeHtml(inv.invoiceNo)}`, content: modalHtml });
  if (window.lucide) lucide.createIcons();

  document.getElementById('btn-cancel-del').onclick = closeModal;
  document.getElementById('btn-confirm-del').onclick = (event) => runAction(event.currentTarget,async () => {
    const epoch=pageEpoch;
    const button=document.getElementById('btn-confirm-del');
    const reason=document.getElementById('cancel-purchase-reason').value.trim();
    if(!reason) throw new Error('Isi alasan pembatalan terlebih dahulu.');
    try {
      const saved=await purchases.remove(inv.id,reason,inv.version);
      if(epoch!==pageEpoch) return;
      if(button.isConnected) closeModal();
      showToast(`Faktur ${inv.invoiceNo} berhasil dibatalkan dan stok telah disesuaikan.`, 'success');
      if(saved?.inventoryRefreshFailed) showToast('Pembatalan tersimpan; segarkan tampilan stok saat koneksi pulih.','warning');
      const content = document.getElementById('purchase-page-content');
      if (content && activeView==='list') {
        content.innerHTML = renderListView();
        if (window.lucide) lucide.createIcons();
        initListViewEvents();
      }
    } catch (err) {
      if(epoch===pageEpoch) showToast(err.message, 'error',7000);
    } finally {
      if(epoch===pageEpoch) renderPurchaseNotices();
    }
  });
}

function showInvoiceDetailModal(inv) {
  const itemsHtml = (inv.items || []).map((it, idx) => `
    <tr>
      <td style="text-align:center">${idx + 1}</td>
      <td><strong>${escapeHtml(it.productName)}</strong></td>
      <td>${it.expiry ? formatDate(it.expiry) : '-'}</td>
      <td>${escapeHtml(it.batchNo || '-')}</td>
      <td style="text-align:center">${it.qty} ${escapeHtml(it.unit || '')}</td>
      <td style="text-align:right">${formatRupiah(it.buyPrice)}</td>
      <td style="text-align:center">${it.discountPercent ? it.discountPercent + '%' : '0%'}</td>
      <td style="text-align:center">${it.taxPercent ? it.taxPercent + '%' : '0%'}</td>
      <td style="text-align:right"><strong>${formatRupiah(it.subtotal)}</strong></td>
    </tr>
  `).join('');

  const modalHtml = `
    <div style="padding:10px 0">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;background:var(--bg-alt);padding:14px;border-radius:var(--radius);margin-bottom:16px;font-size:13px">
        <div><div style="color:var(--text-muted)">Status</div><strong>${inv.status==='cancelled' ? 'Dibatalkan' : 'Tersimpan'}</strong>${inv.cancellationReason ? `<p>${escapeHtml(inv.cancellationReason)}</p>` : ''}${inv.canModifyStock===false ? '<p>Batch faktur lama perlu dicocokkan sebelum revisi stok.</p>' : ''}</div>
        <div>
          <div style="color:var(--text-muted)">Nomor Faktur</div>
          <strong style="font-size:15px;color:var(--text)">${escapeHtml(inv.invoiceNo)}</strong>
        </div>
        <div>
          <div style="color:var(--text-muted)">Supplier</div>
          <strong>${escapeHtml(inv.supplierName || 'Umum')}</strong>
        </div>
        <div>
          <div style="color:var(--text-muted)">Tanggal Faktur</div>
          <strong>${formatDate(inv.invoiceDate)}</strong>
        </div>
        <div>
          <div style="color:var(--text-muted)">Jatuh Tempo</div>
          <strong>${inv.dueDate ? formatDate(inv.dueDate) : '-'}</strong> (${inv.paymentTerm || 0} hari)
        </div>
        <div>
          <div style="color:var(--text-muted)">No. Surat Pesanan</div>
          <strong>${escapeHtml(inv.orderNo || '-')}</strong>
        </div>
        <div>
          <div style="color:var(--text-muted)">Jenis Pembayaran</div>
          <span class="badge ${inv.paymentType === 'tunai' ? 'badge-success' : 'badge-warning'}">${inv.paymentType ? inv.paymentType.toUpperCase() : 'KREDIT'}</span>
        </div>
      </div>

      <div class="table-container" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:16px">
        <table>
          <thead>
            <tr>
              <th style="text-align:center;width:40px">No</th>
              <th>Produk</th>
              <th>Kadaluarsa</th>
              <th>No. Batch</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:right">Harga Beli</th>
              <th style="text-align:center">Diskon</th>
              <th style="text-align:center">Pajak</th>
              <th style="text-align:right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:13px;max-width:300px">
          ${inv.notes ? `<div style="color:var(--text-muted)">Catatan:</div><div>${escapeHtml(inv.notes)}</div>` : ''}
          <div style="color:var(--text-muted);margin-top:6px">Gudang: ${escapeHtml(inv.warehouse || 'Gudang Utama')}</div>
          <div style="color:var(--text-muted)">Petugas: ${escapeHtml(inv.officerName || 'Petugas')}</div>
        </div>
        <div style="min-width:240px;font-size:13px;display:flex;flex-direction:column;gap:6px">
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-muted)">Subtotal:</span>
            <span>${formatRupiah(inv.subtotal)}</span>
          </div>
          ${inv.discountAmount > 0 ? `
            <div style="display:flex;justify-content:space-between;color:var(--danger)">
              <span>Diskon Faktur:</span>
              <span>-${formatRupiah(inv.discountAmount)}</span>
            </div>
          ` : ''}
          ${inv.otherFees > 0 ? `
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Biaya Lainnya:</span>
              <span>${formatRupiah(inv.otherFees)}</span>
            </div>
          ` : ''}
          ${inv.taxAmount > 0 ? `
            <div style="display:flex;justify-content:space-between">
              <span style="color:var(--text-muted)">Pajak (${inv.taxPercent || 0}%):</span>
              <span>${formatRupiah(inv.taxAmount)}</span>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:700;border-top:1px solid var(--border);padding-top:6px;color:var(--primary)">
            <span>Total:</span>
            <span>${formatRupiah(inv.total)}</span>
          </div>
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button class="btn btn-secondary" id="btn-close-modal">Tutup</button>
        <button class="btn btn-primary" id="btn-print-invoice">
          <i data-lucide="printer"></i>
          Cetak Nota Faktur
        </button>
      </div>
    </div>
  `;

  showModal({ title: `Rincian Faktur: ${escapeHtml(inv.invoiceNo)}`, content: modalHtml });
  if (window.lucide) lucide.createIcons();

  document.getElementById('btn-close-modal').onclick = closeModal;
  document.getElementById('btn-print-invoice').onclick = () => {
    window.print();
  };
}

// ===== 2. CREATE INVOICE VIEW =====

let formState = {
  editingId: null,
  supplierId: '',
  supplierName: '',
  orderNo: '',
  invoiceNo: '',
  invoiceDate: today(),
  receivedAt: businessDateTime(),
  invoiceType: 'exclude_tax', // 'exclude_tax' | 'include_tax' | 'no_tax'
  warehouse: 'Gudang Utama',
  paymentType: 'kredit', // 'kredit' | 'tunai' | 'transfer'
  paymentTerm: 30,
  dueDate: '',
  discountType: 'persen', // 'persen' | 'nominal'
  discountValue: 0,
  cashback: 0,
  otherFees: 0,
  notes: '',
  pkpStatus: 'non_pkp',
  items: []
};

function resetFormState() {
  formState = {
    editingId: null,
    supplierId: '',
    supplierName: '',
    orderNo: '',
    invoiceNo: '',
    invoiceDate: today(),
    receivedAt: businessDateTime(),
    invoiceType: 'exclude_tax',
    warehouse: 'Gudang Utama',
    paymentType: 'kredit',
    paymentTerm: 30,
    dueDate: '',
    discountType: 'persen',
    discountValue: 0,
    cashback: 0,
    otherFees: 0,
    notes: '',
    pkpStatus: 'non_pkp',
    items: []
  };
}

function renderCreateView() {
  const rawSuppliers = suppliers.getAll ? suppliers.getAll() : [];
  const allSuppliers = Array.isArray(rawSuppliers) ? rawSuppliers : [];
  const session = auth.getSession();

  // Compute due date from invoiceDate + paymentTerm
  const invDateObj = new Date(formState.invoiceDate || today());
  invDateObj.setDate(invDateObj.getDate() + Number(formState.paymentTerm || 0));
  if(!formState.dueDate) formState.dueDate = businessDate(invDateObj);

  // If items empty, add an initial blank row
  if (formState.items.length === 0) {
    formState.items.push(createBlankItem());
  }

  const supplierOptions = allSuppliers.map(s => `
    <option value="${s.id}" ${formState.supplierId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>
  `).join('');

  const isEditing = Boolean(formState.editingId);
  const headerTitle = isEditing ? `Edit Faktur: ${escapeHtml(formState.invoiceNo || '')}` : 'Tambah Faktur Pembelian';
  const headerDesc = isEditing ? 'Perbarui data faktur dan sesuaikan kuantitas obat' : 'Catat penerimaan stok obat dan rincian tagihan dari supplier';
  const saveBtnText = isEditing ? 'Simpan Perubahan' : 'Simpan Faktur';

  return `
    <div class="purchase-create-header animate-slide-up">
      <div style="display:flex;align-items:center;gap:12px">
        <button class="btn btn-secondary btn-icon-only" id="btn-back-to-list" title="Kembali ke Daftar Faktur" aria-label="Kembali ke Daftar Faktur">
          <i data-lucide="arrow-left"></i>
        </button>
        <div>
          <h2 style="font-size:18px;font-weight:700;margin:0">${headerTitle}</h2>
          <p style="font-size:12px;color:var(--text-muted);margin:0">${headerDesc}</p>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-secondary" id="btn-cancel-create">Batal</button>
        <button class="btn btn-primary" id="btn-save-purchase">
          <i data-lucide="check"></i>
          <span>${saveBtnText}</span>
        </button>
      </div>
    </div>

    <!-- Header Fields Grid -->
    <div class="card animate-slide-up" style="animation-delay:0.05s;margin-bottom:16px">
      <div class="card-body" style="padding:16px 20px">
        <div class="form-grid-3">
          <!-- Kolom 1 -->
          <div class="form-group">
            <label for="inv-supplier" class="form-label required">Supplier</label>
            <div style="display:flex;gap:6px">
              <select id="inv-supplier" class="form-input" style="flex:1" required>
                <option value="">Pilih supplier</option>
                ${supplierOptions}
              </select>
              <button type="button" class="btn btn-secondary btn-icon-only" id="btn-add-quick-supplier" title="Tambah Supplier Baru" aria-label="Tambah Supplier Baru">
                <i data-lucide="plus"></i>
              </button>
            </div>
          </div>

          <div class="form-group">
            <label for="inv-order-no" class="form-label required">No. Surat Pesanan</label>
            <input type="text" id="inv-order-no" class="form-input" placeholder="Masukkan No Surat Pesanan" value="${escapeHtml(formState.orderNo)}" />
          </div>

          <div class="form-group">
            <label for="inv-no" class="form-label required">No. Faktur</label>
            <input type="text" id="inv-no" class="form-input" placeholder="Masukkan No Faktur" value="${escapeHtml(formState.invoiceNo)}" required />
          </div>

          <!-- Kolom 2 -->
          <div class="form-group">
            <label for="inv-date" class="form-label required">Tanggal Faktur</label>
            <input type="date" id="inv-date" class="form-input" value="${formState.invoiceDate}" required />
          </div>

          <div class="form-group">
            <label for="inv-received-at" class="form-label required">Tanggal Penerimaan</label>
            <input type="datetime-local" id="inv-received-at" class="form-input" value="${formState.receivedAt}" required />
          </div>

          <div class="form-group">
            <label for="inv-type" class="form-label">Jenis Faktur</label>
            <select id="inv-type" class="form-input">
              <option value="exclude_tax" ${formState.invoiceType === 'exclude_tax' ? 'selected' : ''}>Harga Belum Termasuk Pajak</option>
              <option value="include_tax" ${formState.invoiceType === 'include_tax' ? 'selected' : ''}>Harga Sudah Termasuk Pajak</option>
              <option value="no_tax" ${formState.invoiceType === 'no_tax' ? 'selected' : ''}>Non Pajak</option>
            </select>
          </div>

          <!-- Kolom 3 -->
          <div class="form-group">
            <label for="inv-warehouse" class="form-label required">Gudang Penerima</label>
            <select id="inv-warehouse" class="form-input">
              <option value="Gudang Utama" ${formState.warehouse === 'Gudang Utama' ? 'selected' : ''}>Gudang Utama</option>
              <option value="Gudang Etalase" ${formState.warehouse === 'Gudang Etalase' ? 'selected' : ''}>Gudang Etalase</option>
              <option value="Gudang Karantina" ${formState.warehouse === 'Gudang Karantina' ? 'selected' : ''}>Gudang Karantina</option>
            </select>
          </div>

          <div class="form-group">
            <label for="inv-payment-type" class="form-label required">Jenis Pembayaran</label>
            <select id="inv-payment-type" class="form-input">
              <option value="kredit" ${formState.paymentType === 'kredit' ? 'selected' : ''}>Kredit</option>
              <option value="tunai" ${formState.paymentType === 'tunai' ? 'selected' : ''}>Tunai</option>
              <option value="transfer" ${formState.paymentType === 'transfer' ? 'selected' : ''}>Transfer</option>
            </select>
          </div>

          <div class="form-group" style="display:grid;grid-template-columns:1fr 1.2fr;gap:8px">
            <div>
              <label for="inv-payment-term" class="form-label required">Tempo (Hari)</label>
              <input type="number" id="inv-payment-term" class="form-input" min="0" value="${formState.paymentTerm}" />
            </div>
            <div>
              <label for="inv-due-date" class="form-label">Jatuh Tempo</label>
              <input type="date" id="inv-due-date" class="form-input" value="${formState.dueDate}" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Items Table Card -->
    <div class="card animate-slide-up" style="animation-delay:0.1s;margin-bottom:16px">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px">
        <h3 style="font-size:15px;font-weight:600">Daftar Produk & Batch</h3>
        <button type="button" class="btn btn-sm btn-secondary" id="btn-add-item-row">
          <i data-lucide="plus"></i>
          Tambah Baris Produk
        </button>
      </div>
      <div class="card-body" style="padding:0">
        <div class="table-container" style="overflow-x:auto">
          <table class="purchases-items-table" id="table-invoice-items">
            <thead>
              <tr>
                <th style="width:36px;text-align:center">No.</th>
                <th style="min-width:200px">Produk</th>
                <th style="min-width:130px">Expired Date</th>
                <th style="min-width:120px">No. Batch</th>
                <th style="width:90px;text-align:center">Kuantitas</th>
                <th style="width:90px">Satuan</th>
                <th style="min-width:120px;text-align:right">Harga Beli</th>
                <th style="width:80px;text-align:center">Diskon %</th>
                <th style="width:80px;text-align:center">Pajak %</th>
                <th style="min-width:120px;text-align:right">Harga Pokok</th>
                <th style="min-width:130px;text-align:right">Sub Total</th>
                <th style="width:40px;text-align:center">Aksi</th>
              </tr>
            </thead>
            <tbody id="invoice-items-tbody">
              ${renderItemsTableBody()}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Summary & Footer Calculation -->
    <div class="purchase-bottom-grid animate-slide-up" style="animation-delay:0.15s">
      <!-- Left side -->
      <div class="card" style="display:flex;flex-direction:column;justify-content:space-between">
        <div class="card-body" style="padding:16px 20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <span style="font-weight:600;font-size:13px">Status PKP</span>
            <span class="badge badge-info" style="font-size:11px">Non PKP</span>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label for="inv-notes" class="form-label">Catatan Faktur</label>
            <textarea id="inv-notes" class="form-input" rows="3" placeholder="Tambahkan catatan faktur pembelian bila diperlukan...">${escapeHtml(formState.notes)}</textarea>
          </div>
        </div>
      </div>

      <!-- Right side: Calculation Breakdown -->
      <div class="card">
        <div class="card-body" style="padding:16px 20px">
          <div class="calc-row">
            <span class="calc-label">Sub Total:</span>
            <div style="display:flex;align-items:center;gap:6px">
              <strong id="calc-subtotal" style="font-size:15px">Rp 0</strong>
              <button type="button" class="btn btn-sm btn-secondary btn-icon-only" id="btn-recalc" title="Hitung Ulang" aria-label="Hitung Ulang">
                <i data-lucide="refresh-cw"></i>
              </button>
            </div>
          </div>

          <div class="calc-row">
            <span class="calc-label">Diskon Faktur:</span>
            <div style="display:flex;align-items:center;gap:6px;width:180px">
              <div class="btn-group-toggle" style="display:flex;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden">
                <button type="button" class="btn-toggle-disc ${formState.discountType === 'persen' ? 'active' : ''}" id="btn-disc-percent" style="padding:2px 8px;font-size:12px">%</button>
                <button type="button" class="btn-toggle-disc ${formState.discountType === 'nominal' ? 'active' : ''}" id="btn-disc-nominal" style="padding:2px 8px;font-size:12px">Rp</button>
              </div>
              <input type="number" id="calc-discount-input" class="form-input form-input-sm" style="text-align:right" value="${formState.discountValue}" min="0" />
            </div>
          </div>

          <div class="calc-row">
            <span class="calc-label">Cashback:</span>
            <div style="width:180px">
              <input type="number" id="calc-cashback-input" class="form-input form-input-sm" style="text-align:right" value="${formState.cashback}" min="0" />
            </div>
          </div>

          <div class="calc-row">
            <span class="calc-label">Biaya Lainnya:</span>
            <div style="width:180px">
              <input type="number" id="calc-other-fees-input" class="form-input form-input-sm" style="text-align:right" value="${formState.otherFees}" min="0" />
            </div>
          </div>

          <div class="calc-row" id="calc-tax-row" style="display:${formState.invoiceType === 'exclude_tax' ? 'flex' : 'none'}">
            <span class="calc-label">Pajak (PPN 11%):</span>
            <strong id="calc-tax-val" style="color:var(--text)">Rp 0</strong>
          </div>

          <div class="calc-row total-row">
            <span style="font-size:16px;font-weight:700">TOTAL PEMBELIAN:</span>
            <strong id="calc-grand-total" style="font-size:20px;color:var(--primary)">Rp 0,00</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function createBlankItem() {
  const rawProds = products.getAll ? products.getAll() : [];
  const allProds = Array.isArray(rawProds) ? rawProds : [];

  // Default expiry is 1 year from now
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);

  return {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    productId: allProds.length > 0 ? allProds[0].id : '',
    productName: allProds.length > 0 ? allProds[0].name : '',
    batchNo: generateBatchNo(),
    expiry: businessDate(nextYear),
    qty: 1,
    unit: allProds.length > 0 ? allProds[0].unit : 'pcs',
    buyPrice: allProds.length > 0 ? allProds[0].buyPrice : 0,
    discountPercent: 0,
    taxPercent: 0,
    costPrice: allProds.length > 0 ? allProds[0].buyPrice : 0,
    subtotal: allProds.length > 0 ? allProds[0].buyPrice : 0
  };
}

function renderItemsTableBody() {
  const rawProds = products.getAll ? products.getAll() : [];
  const allProds = Array.isArray(rawProds) ? rawProds : [];

  return formState.items.map((it, idx) => {
    const prodOptions = allProds.map(p => `
      <option value="${p.id}" ${it.productId === p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
    `).join('');

    return `
      <tr data-index="${idx}" class="item-row">
        <td style="text-align:center">${idx + 1}</td>
        <td>
          <select class="form-input form-input-sm item-product-select" data-index="${idx}" required>
            <option value="">Pilih Produk</option>
            ${prodOptions}
          </select>
        </td>
        <td>
          <input type="date" class="form-input form-input-sm item-expiry" data-index="${idx}" value="${it.expiry || ''}" required />
        </td>
        <td>
          <input type="text" class="form-input form-input-sm item-batch" data-index="${idx}" value="${escapeHtml(it.batchNo)}" placeholder="No. Batch" required />
        </td>
        <td>
          <input type="number" class="form-input form-input-sm item-qty" data-index="${idx}" value="${it.qty}" min="1" style="text-align:center" required />
        </td>
        <td>
          <input type="text" class="form-input form-input-sm item-unit" readonly title="Satuan mengikuti master produk" data-index="${idx}" value="${escapeHtml(it.unit)}" placeholder="Satuan" />
        </td>
        <td>
          <input type="number" class="form-input form-input-sm item-buy-price" data-index="${idx}" value="${it.buyPrice}" min="0" style="text-align:right" required />
        </td>
        <td>
          <input type="number" class="form-input form-input-sm item-discount" data-index="${idx}" value="${it.discountPercent}" min="0" max="100" style="text-align:center" />
        </td>
        <td>
          <input type="number" class="form-input form-input-sm item-tax" data-index="${idx}" value="${it.taxPercent}" min="0" style="text-align:center" />
        </td>
        <td style="text-align:right">
          <span class="item-cost-price-display" data-index="${idx}">${formatRupiah(it.costPrice)}</span>
        </td>
        <td style="text-align:right">
          <strong class="item-subtotal-display" data-index="${idx}">${formatRupiah(it.subtotal)}</strong>
        </td>
        <td style="text-align:center">
          <button type="button" class="btn btn-sm btn-icon-only btn-remove-item" data-index="${idx}" title="Hapus Baris" aria-label="Hapus Baris">
            <i data-lucide="trash-2" style="color:var(--danger)"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function calculateTotals() {
  let subtotal = 0;

  formState.items.forEach((it) => {
    const qty = Math.max(0, Number(it.qty) || 0);
    const buyPrice = Math.max(0, Number(it.buyPrice) || 0);
    const discPct = Math.min(100, Math.max(0, Number(it.discountPercent) || 0));
    const taxPct = Math.max(0, Number(it.taxPercent) || 0);

    const priceAfterDisc = buyPrice * (1 - discPct / 100);
    const costPrice = priceAfterDisc * (1 + taxPct / 100);
    const lineSubtotal = Math.round(costPrice * qty);

    it.costPrice = Math.round(costPrice);
    it.subtotal = lineSubtotal;
    subtotal += lineSubtotal;
  });

  // Calculate invoice discount
  let discountAmount = 0;
  if (formState.discountType === 'persen') {
    const pct = Math.min(100, Math.max(0, Number(formState.discountValue) || 0));
    discountAmount = Math.round((subtotal * pct) / 100);
  } else {
    discountAmount = Math.min(subtotal, Math.max(0, Number(formState.discountValue) || 0));
  }

  const cashback = Math.max(0, Number(formState.cashback) || 0);
  const otherFees = Math.max(0, Number(formState.otherFees) || 0);

  // Overall tax if invoiceType === 'exclude_tax'
  let overallTax = 0;
  if (formState.invoiceType === 'exclude_tax') {
    // Preserve the configured invoice calculation; the server verifies totals.
    const base = Math.max(0, subtotal - discountAmount);
    overallTax = Math.round(base * 0.11);
  }

  const grandTotal = Math.max(0, subtotal - discountAmount - cashback + otherFees + overallTax);

  // Update UI displays
  const subtotalEl = document.getElementById('calc-subtotal');
  if (subtotalEl) subtotalEl.textContent = formatRupiah(subtotal);

  const taxValEl = document.getElementById('calc-tax-val');
  if (taxValEl) taxValEl.textContent = formatRupiah(overallTax);

  const taxRowEl = document.getElementById('calc-tax-row');
  if (taxRowEl) taxRowEl.style.display = formState.invoiceType === 'exclude_tax' ? 'flex' : 'none';

  const grandTotalEl = document.getElementById('calc-grand-total');
  if (grandTotalEl) grandTotalEl.textContent = formatRupiah(grandTotal);

  // Update line row displays
  formState.items.forEach((it, idx) => {
    const costEl = document.querySelector(`.item-cost-price-display[data-index="${idx}"]`);
    if (costEl) costEl.textContent = formatRupiah(it.costPrice);

    const subEl = document.querySelector(`.item-subtotal-display[data-index="${idx}"]`);
    if (subEl) subEl.textContent = formatRupiah(it.subtotal);
  });

  return { subtotal, discountAmount, cashback, otherFees, overallTax, grandTotal };
}

function initCreateViewEvents() {
  const content = document.getElementById('purchase-page-content');
  if (!content) return;

  // Back button
  const btnBack = document.getElementById('btn-back-to-list');
  const btnCancel = document.getElementById('btn-cancel-create');
  const returnToList = () => {
    resetFormState();
    activeView = 'list';
    content.innerHTML = renderListView();
    if (window.lucide) lucide.createIcons();
    initListViewEvents();
    if (window.location && window.location.hash !== '#/purchases') {
      window.location.hash = '/purchases';
    }
  };
  if (btnBack) btnBack.onclick = returnToList;
  if (btnCancel) btnCancel.onclick = returnToList;

  // Header input change handlers
  const suppSelect = document.getElementById('inv-supplier');
  if (suppSelect) {
    suppSelect.onchange = (e) => {
      formState.supplierId = e.target.value;
      const allSuppliers = suppliers.getAll ? suppliers.getAll() : [];
      const found = allSuppliers.find(s => s.id === e.target.value);
      formState.supplierName = found ? found.name : '';
    };
  }

  const orderNoInput = document.getElementById('inv-order-no');
  if (orderNoInput) orderNoInput.oninput = (e) => formState.orderNo = e.target.value;

  const invNoInput = document.getElementById('inv-no');
  if (invNoInput) invNoInput.oninput = (e) => formState.invoiceNo = e.target.value;

  const invDateInput = document.getElementById('inv-date');
  if (invDateInput) {
    invDateInput.onchange = (e) => {
      formState.invoiceDate = e.target.value;
      const d = new Date(e.target.value);
      d.setDate(d.getDate() + Number(formState.paymentTerm || 0));
      formState.dueDate = businessDate(d);
      const dueInput = document.getElementById('inv-due-date');
      if (dueInput) dueInput.value = formState.dueDate;
    };
  }

  const receivedInput = document.getElementById('inv-received-at');
  if (receivedInput) receivedInput.oninput = (e) => formState.receivedAt = e.target.value;

  const typeSelect = document.getElementById('inv-type');
  if (typeSelect) {
    typeSelect.onchange = (e) => {
      formState.invoiceType = e.target.value;
      calculateTotals();
    };
  }

  const warehouseSelect = document.getElementById('inv-warehouse');
  if (warehouseSelect) warehouseSelect.onchange = (e) => formState.warehouse = e.target.value;

  const payTypeSelect = document.getElementById('inv-payment-type');
  if (payTypeSelect) payTypeSelect.onchange = (e) => formState.paymentType = e.target.value;

  const termInput = document.getElementById('inv-payment-term');
  if (termInput) {
    termInput.oninput = (e) => {
      formState.paymentTerm = Number(e.target.value) || 0;
      const d = new Date(formState.invoiceDate || today());
      d.setDate(d.getDate() + formState.paymentTerm);
      formState.dueDate = businessDate(d);
      const dueInput = document.getElementById('inv-due-date');
      if (dueInput) dueInput.value = formState.dueDate;
    };
  }

  const dueInput = document.getElementById('inv-due-date');
  if (dueInput) dueInput.onchange = (e) => formState.dueDate = e.target.value;

  const notesInput = document.getElementById('inv-notes');
  if (notesInput) notesInput.oninput = (e) => formState.notes = e.target.value;

  // Add quick supplier modal
  const btnAddSupp = document.getElementById('btn-add-quick-supplier');
  if (btnAddSupp) {
    btnAddSupp.onclick = () => {
      showAddSupplierModal();
    };
  }

  // Add product row
  const btnAddRow = document.getElementById('btn-add-item-row');
  if (btnAddRow) {
    btnAddRow.onclick = () => {
      formState.items.push(createBlankItem());
      refreshItemsTable();
    };
  }

  // Recalculate button
  const btnRecalc = document.getElementById('btn-recalc');
  if (btnRecalc) btnRecalc.onclick = () => calculateTotals();

  // Discount toggles
  const btnDiscPct = document.getElementById('btn-disc-percent');
  const btnDiscNom = document.getElementById('btn-disc-nominal');
  if (btnDiscPct && btnDiscNom) {
    btnDiscPct.onclick = () => {
      formState.discountType = 'persen';
      btnDiscPct.classList.add('active');
      btnDiscNom.classList.remove('active');
      calculateTotals();
    };
    btnDiscNom.onclick = () => {
      formState.discountType = 'nominal';
      btnDiscNom.classList.add('active');
      btnDiscPct.classList.remove('active');
      calculateTotals();
    };
  }

  const discInput = document.getElementById('calc-discount-input');
  if (discInput) {
    discInput.oninput = (e) => {
      formState.discountValue = Number(e.target.value) || 0;
      calculateTotals();
    };
  }

  const cashbackInput = document.getElementById('calc-cashback-input');
  if (cashbackInput) {
    cashbackInput.oninput = (e) => {
      formState.cashback = Number(e.target.value) || 0;
      calculateTotals();
    };
  }

  const otherFeesInput = document.getElementById('calc-other-fees-input');
  if (otherFeesInput) {
    otherFeesInput.oninput = (e) => {
      formState.otherFees = Number(e.target.value) || 0;
      calculateTotals();
    };
  }

  // Bind table row inputs
  bindTableRowEvents();

  // Initial total calculation
  calculateTotals();

  // Save invoice handler
  const btnSave = document.getElementById('btn-save-purchase');
  if (btnSave) {
    btnSave.onclick = async () => {
      await handleSaveInvoice();
    };
  }
}

function refreshItemsTable() {
  const tbody = document.getElementById('invoice-items-tbody');
  if (tbody) {
    tbody.innerHTML = renderItemsTableBody();
    if (window.lucide) lucide.createIcons();
    bindTableRowEvents();
    calculateTotals();
  }
}

function bindTableRowEvents() {
  const tbody = document.getElementById('invoice-items-tbody');
  if (!tbody) return;

  // Product change
  tbody.querySelectorAll('.item-product-select').forEach(sel => {
    sel.onchange = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      const prodId = e.target.value;
      const prod = products.getById(prodId);
      if (prod && formState.items[idx]) {
        formState.items[idx].productId = prod.id;
        formState.items[idx].productName = prod.name;
        formState.items[idx].unit = prod.unit;
        formState.items[idx].buyPrice = prod.buyPrice;

        // update inputs in row
        const unitInput = tbody.querySelector(`.item-unit[data-index="${idx}"]`);
        if (unitInput) unitInput.value = prod.unit;

        const buyPriceInput = tbody.querySelector(`.item-buy-price[data-index="${idx}"]`);
        if (buyPriceInput) buyPriceInput.value = prod.buyPrice;

        calculateTotals();
      }
    };
  });

  // Expiry change
  tbody.querySelectorAll('.item-expiry').forEach(inp => {
    inp.onchange = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) formState.items[idx].expiry = e.target.value;
    };
  });

  // Batch change
  tbody.querySelectorAll('.item-batch').forEach(inp => {
    inp.oninput = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) formState.items[idx].batchNo = e.target.value;
    };
  });

  // Qty change
  tbody.querySelectorAll('.item-qty').forEach(inp => {
    inp.oninput = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) {
        formState.items[idx].qty = Math.max(1, Number(e.target.value) || 1);
        calculateTotals();
      }
    };
  });

  // Unit change
  tbody.querySelectorAll('.item-unit').forEach(inp => {
    inp.oninput = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) formState.items[idx].unit = e.target.value;
    };
  });

  // Buy Price change
  tbody.querySelectorAll('.item-buy-price').forEach(inp => {
    inp.oninput = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) {
        formState.items[idx].buyPrice = Math.max(0, Number(e.target.value) || 0);
        calculateTotals();
      }
    };
  });

  // Item discount change
  tbody.querySelectorAll('.item-discount').forEach(inp => {
    inp.oninput = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) {
        formState.items[idx].discountPercent = Math.min(100, Math.max(0, Number(e.target.value) || 0));
        calculateTotals();
      }
    };
  });

  // Item tax change
  tbody.querySelectorAll('.item-tax').forEach(inp => {
    inp.oninput = (e) => {
      const idx = Number(e.target.getAttribute('data-index'));
      if (formState.items[idx]) {
        formState.items[idx].taxPercent = Math.max(0, Number(e.target.value) || 0);
        calculateTotals();
      }
    };
  });

  // Remove row
  tbody.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-index'));
      if (formState.items.length <= 1) {
        showToast('Faktur harus memiliki minimal satu item produk.', 'error');
        return;
      }
      formState.items.splice(idx, 1);
      refreshItemsTable();
    };
  });
}

function showAddSupplierModal() {
  const modalHtml = `
    <form id="form-quick-supplier" style="padding:10px 0">
      <div class="form-group">
        <label for="new-supp-name" class="form-label required">Nama Supplier</label>
        <input type="text" id="new-supp-name" class="form-input" placeholder="Contoh: PT Kimia Farma" required />
      </div>
      <div class="form-group">
        <label for="new-supp-phone" class="form-label">Nomor Telepon</label>
        <input type="text" id="new-supp-phone" class="form-input" placeholder="021-xxxxxxx" />
      </div>
      <div class="form-group">
        <label for="new-supp-addr" class="form-label">Alamat</label>
        <textarea id="new-supp-addr" class="form-input" rows="2" placeholder="Alamat kantor distributor"></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px">
        <button type="button" class="btn btn-secondary" id="btn-cancel-supp">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-submit-supp">Simpan Supplier</button>
      </div>
    </form>
  `;

  showModal({ title: 'Tambah Supplier Baru', content: modalHtml });

  document.getElementById('btn-cancel-supp').onclick = closeModal;
  document.getElementById('form-quick-supplier').onsubmit = async (e) => {
    e.preventDefault();
    const form=e.currentTarget;
    if(form.dataset.busy==='true') return;
    const epoch=pageEpoch;
    const name = document.getElementById('new-supp-name').value.trim();
    const phone = document.getElementById('new-supp-phone').value.trim();
    const address = document.getElementById('new-supp-addr').value.trim();

    if (!name) {
      showToast('Nama supplier wajib diisi.', 'error');
      return;
    }
    form.dataset.busy='true';
    form.dataset.requestId ||= crypto.randomUUID();
    const submit=form.querySelector('button[type="submit"]');
    if(submit) submit.disabled=true;
    try {
      const created = await suppliers.add({ name, phone, address,requestId:form.dataset.requestId });
      if(epoch!==pageEpoch || !form.isConnected) return;
      showToast(`Supplier ${created.name} berhasil ditambahkan.`, 'success');
      closeModal();

      // Update supplier dropdown
      formState.supplierId = created.id;
      formState.supplierName = created.name;

      const suppSelect = document.getElementById('inv-supplier');
      if (suppSelect) {
        const allSuppliers = suppliers.getAll ? suppliers.getAll() : [];
        suppSelect.innerHTML = `
          <option value="">Pilih supplier</option>
          ${allSuppliers.map(s => `
            <option value="${s.id}" ${s.id === created.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>
          `).join('')}
        `;
      }
    } catch (err) {
      if(epoch===pageEpoch) showToast('Gagal menyimpan supplier: ' + err.message, 'error');
    } finally {
      form.dataset.busy='false';
      if(submit?.isConnected) submit.disabled=false;
    }
  };
}

async function handleSaveInvoice() {
  const btnSave = document.getElementById('btn-save-purchase');
  if(btnSave?.disabled) return;
  const epoch=pageEpoch;

  // Sync inputs from DOM directly
  const invNoInput = document.getElementById('inv-no');
  const orderNoInput = document.getElementById('inv-order-no');
  const supplierSelect = document.getElementById('inv-supplier');
  const invDateInput = document.getElementById('inv-date');
  const receivedInput = document.getElementById('inv-received-at');
  const typeSelect = document.getElementById('inv-type');
  const warehouseSelect = document.getElementById('inv-warehouse');
  const payTypeSelect = document.getElementById('inv-payment-type');
  const termInput = document.getElementById('inv-payment-term');
  const dueInput = document.getElementById('inv-due-date');
  const notesInput = document.getElementById('inv-notes');

  if (invNoInput) formState.invoiceNo = invNoInput.value;
  if (orderNoInput) formState.orderNo = orderNoInput.value;
  if (supplierSelect) formState.supplierId = supplierSelect.value;
  if (invDateInput) formState.invoiceDate = invDateInput.value;
  if (receivedInput) formState.receivedAt = receivedInput.value;
  if (typeSelect) formState.invoiceType = typeSelect.value;
  if (warehouseSelect) formState.warehouse = warehouseSelect.value;
  if (payTypeSelect) formState.paymentType = payTypeSelect.value;
  if (termInput) formState.paymentTerm = Number(termInput.value) || 0;
  if (dueInput) formState.dueDate = dueInput.value;
  if (notesInput) formState.notes = notesInput.value;

  const rows = document.querySelectorAll('#invoice-items-tbody tr');
  rows.forEach((tr, idx) => {
    if (formState.items[idx]) {
      const pSel = tr.querySelector('.item-product-select');
      const expInp = tr.querySelector('.item-expiry');
      const batchInp = tr.querySelector('.item-batch');
      const qtyInp = tr.querySelector('.item-qty');
      const unitInp = tr.querySelector('.item-unit');
      const priceInp = tr.querySelector('.item-buy-price');
      const discInp = tr.querySelector('.item-discount');
      const taxInp = tr.querySelector('.item-tax');

      if (pSel && pSel.value) formState.items[idx].productId = pSel.value;
      if (expInp) formState.items[idx].expiry = expInp.value;
      if (batchInp) formState.items[idx].batchNo = batchInp.value;
      if (qtyInp) formState.items[idx].qty = Number(qtyInp.value);
      if (unitInp) formState.items[idx].unit = unitInp.value;
      if (priceInp) formState.items[idx].buyPrice = Number(priceInp.value) || 0;
      if (discInp) formState.items[idx].discountPercent = Number(discInp.value) || 0;
      if (taxInp) formState.items[idx].taxPercent = Number(taxInp.value) || 0;
    }
  });

  // Validations
  if (!formState.invoiceNo || !formState.invoiceNo.trim()) {
    showToast('Nomor faktur wajib diisi.', 'error');
    if (invNoInput) invNoInput.focus();
    return;
  }

  if (formState.items.length === 0) {
    showToast('Faktur harus memiliki minimal satu item produk.', 'error');
    return;
  }

  // Validate items
  for (let i = 0; i < formState.items.length; i++) {
    const it = formState.items[i];
    if (!it.productId) {
      showToast(`Baris #${i + 1}: Produk belum dipilih.`, 'error');
      return;
    }
    if (!it.batchNo || !it.batchNo.trim()) {
      showToast(`Baris #${i + 1}: Nomor batch wajib diisi.`, 'error');
      return;
    }
    if (!Number.isSafeInteger(it.qty) || it.qty <= 0 || it.qty>1000000) {
      showToast(`Baris #${i + 1}: Kuantitas harus bilangan bulat positif.`, 'error');
      return;
    }
    if(!Number.isSafeInteger(it.buyPrice) || it.buyPrice<0 || !Number.isFinite(it.discountPercent) || it.discountPercent<0 || it.discountPercent>100 || !Number.isFinite(it.taxPercent) || it.taxPercent<0 || it.taxPercent>100) {
      showToast(`Baris #${i + 1}: Periksa harga, diskon, dan pajak.`, 'error');
      return;
    }
    if(products.getById(it.productId)?.category==='obat' && !it.expiry) {
      showToast(`Baris #${i + 1}: Tanggal kedaluwarsa obat wajib diisi.`, 'error');
      return;
    }
  }

  const totals = calculateTotals();

  // Find supplier name if not selected
  if (formState.supplierId && !formState.supplierName) {
    const allSuppliers = suppliers.getAll ? suppliers.getAll() : [];
    const found = allSuppliers.find(s => s.id === formState.supplierId);
    if (found) formState.supplierName = found.name;
  }

  const invoicePayload = {
    invoiceNo: formState.invoiceNo.trim(),
    orderNo: formState.orderNo.trim(),
    supplierId: formState.supplierId || null,
    supplierName: formState.supplierName || 'Umum',
    invoiceDate: formState.invoiceDate,
    receivedAt: formState.receivedAt ? `${formState.receivedAt}+07:00` : null,
    invoiceType: formState.invoiceType,
    warehouse: formState.warehouse,
    paymentType: formState.paymentType,
    paymentTerm: formState.paymentTerm,
    dueDate: formState.dueDate,
    subtotal: totals.subtotal,
    discountType: formState.discountType,
    discountValue: formState.discountValue,
    discountAmount: totals.discountAmount,
    cashback: totals.cashback,
    otherFees: totals.otherFees,
    taxPercent: formState.invoiceType === 'exclude_tax' ? 11 : 0,
    taxAmount: totals.overallTax,
    total: totals.grandTotal,
    notes: formState.notes,
    pkpStatus: formState.pkpStatus,
    items: formState.items.map(it => ({
      productId: it.productId,
      productName: it.productName,
      batchNo: it.batchNo,
      expiry: it.expiry || null,
      qty: Number(it.qty),
      unit: it.unit,
      buyPrice: Number(it.buyPrice),
      discountPercent: Number(it.discountPercent),
      taxPercent: Number(it.taxPercent),
      costPrice: Number(it.costPrice),
      subtotal: Number(it.subtotal)
    }))
  };

  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = '<i data-lucide="refresh-cw" class="spin"></i> Menyimpan...';
    if (window.lucide) lucide.createIcons();
  }

  try {
    let saved;
    if (formState.editingId) {
      saved = await purchases.update(formState.editingId, invoicePayload,formState.version);
      if(epoch!==pageEpoch) return;
      showToast(`Faktur ${saved.invoiceNo} berhasil diperbarui dan stok telah disesuaikan.`, 'success');
    } else {
      saved = await purchases.add(invoicePayload);
      if(epoch!==pageEpoch) return;
      showToast(`Faktur ${saved.invoiceNo} berhasil disimpan dan stok batch telah diperbarui.`, 'success');
    }

    resetFormState();
    renderPurchaseNotices();
    if(saved.inventoryRefreshFailed) showToast('Faktur tersimpan; segarkan tampilan stok saat koneksi pulih.','warning');

    // Return to list view
    activeView = 'list';
    const content = document.getElementById('purchase-page-content');
    if (content) {
      content.innerHTML = renderListView();
      if (window.lucide) lucide.createIcons();
      initListViewEvents();
    }
    if (window.location && window.location.hash !== '#/purchases') {
      window.location.hash = '/purchases';
    }
  } catch (err) {
    if(epoch!==pageEpoch) return;
    renderPurchaseNotices();
    showToast((purchases.pending?.() ? 'Penyimpanan belum terkonfirmasi: ' : 'Gagal menyimpan faktur: ') + err.message, 'error',7000);
    if (btnSave) {
      btnSave.disabled = false;
      btnSave.innerHTML = '<i data-lucide="check"></i> <span>Simpan Faktur</span>';
      if (window.lucide) lucide.createIcons();
    }
  }
}
