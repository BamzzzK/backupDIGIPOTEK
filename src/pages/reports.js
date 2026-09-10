import { showToast } from '../components/toast.js';
// ===== DigiPotek Reports Page =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { showModal } from '../components/modal.js';
import { transactions } from '../store.js';
import { businessDate, formatRupiah, formatDateTime, today, daysAgo, escapeHtml } from '../utils.js';

let dateFrom = daysAgo(7);
let dateTo = today();
let activePreset = '7d';
let reportRequest=0;
let displayedTransactions=[];

export function renderReports() {
  dateFrom = daysAgo(7);
  dateTo = today();
  activePreset = '7d';

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Laporan Penjualan & Margin', 'Analisa performa penjualan apotek')}
        <div class="page-content">
          <div class="report-filters animate-slide-up">
            <div class="filter-tabs" id="report-preset-filter">
              <button class="filter-tab" data-preset="today">Hari Ini</button>
              <button class="filter-tab active" data-preset="7d">7 Hari</button>
              <button class="filter-tab" data-preset="30d">30 Hari</button>
              <button class="filter-tab" data-preset="custom">Custom</button>
            </div>
            <div class="report-date-inputs" id="report-date-inputs">
              <input type="date" id="report-from" value="${dateFrom}" />
              <span style="color:var(--text-muted)">—</span>
              <input type="date" id="report-to" value="${dateTo}" />
              <button class="btn btn-sm btn-primary" id="report-apply">Terapkan</button>
            </div>
          </div>

          <div class="stats-grid animate-slide-up" id="report-stats" style="animation-delay:0.1s;animation-fill-mode:backwards"></div>

          <div class="dashboard-grid animate-slide-up" style="animation-delay:0.15s;animation-fill-mode:backwards">
            <div class="card">
              <div class="card-header">
                <h3><i data-lucide="bar-chart-3" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:6px"></i> Grafik Penjualan vs Margin</h3>
              </div>
              <div class="card-body">
                <div class="chart-container">
                  <canvas id="report-chart"></canvas>
                </div>
              </div>
            </div>
            <div class="card">
              <div class="card-header">
                <h3><i data-lucide="pie-chart" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:6px"></i> Metode Pembayaran</h3>
              </div>
              <div class="card-body">
                <div class="chart-container" style="height:240px">
                  <canvas id="payment-chart"></canvas>
                </div>
              </div>
            </div>
          </div>

          <div class="card animate-slide-up" style="margin-top:20px;animation-delay:0.2s;animation-fill-mode:backwards">
            <div class="card-header">
              <h3><i data-lucide="list" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:6px"></i> Detail Transaksi</h3>
              <button class="btn btn-sm btn-secondary" id="btn-export-csv">
                <i data-lucide="download"></i> Export CSV
              </button>
            </div>
            <div class="card-body" style="padding:0">
              <div class="table-container" id="report-table"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  bindHeaderEvents();
  updateReport();
  bindReportEvents();

  return { destroy() { reportRequest++; for(const id of ['report-chart','payment-chart']) {const canvas=document.getElementById(id);if(canvas)Chart.getChart(canvas)?.destroy();} } };
}

async function updateReport() {
  const ticket=++reportRequest;
  const button=document.getElementById('btn-export-csv');button.disabled=true;
  try {
    const trxs = await transactions.loadRange(dateFrom, dateTo);
    if(ticket!==reportRequest || !document.getElementById('report-stats'))return;
    displayedTransactions=trxs;
    renderStats(trxs);renderChart(trxs);renderPaymentChart(trxs);renderTable(trxs);
    button.disabled=false;
  } catch(e){if(ticket===reportRequest)showToast(e.message,'error',7000);}
}

function renderStats(trxs) {
  const totalSales = trxs.reduce((s, t) => s + t.total, 0);
  const totalCost = trxs.reduce((s, t) => s + (t.totalCost || 0), 0);
  const totalMargin = trxs.reduce((s, t) => s + (t.margin || 0), 0);
  const marginPct = totalSales > 0 ? Math.round(totalMargin / totalSales * 100) : 0;

  document.getElementById('report-stats').innerHTML = `
    <div class="stat-card green">
      <div class="stat-card-header">
        <span class="stat-card-label">Total Penjualan</span>
        <div class="stat-card-icon"><i data-lucide="trending-up"></i></div>
      </div>
      <div class="stat-card-value">${formatRupiah(totalSales)}</div>
    </div>
    <div class="stat-card blue">
      <div class="stat-card-header">
        <span class="stat-card-label">Total Modal (HPP)</span>
        <div class="stat-card-icon"><i data-lucide="shopping-bag"></i></div>
      </div>
      <div class="stat-card-value">${formatRupiah(totalCost)}</div>
    </div>
    <div class="stat-card purple">
      <div class="stat-card-header">
        <span class="stat-card-label">Margin / Laba Kotor</span>
        <div class="stat-card-icon"><i data-lucide="wallet"></i></div>
      </div>
      <div class="stat-card-value">${formatRupiah(totalMargin)}</div>
      <div class="stat-card-change" style="color:var(--success)">${marginPct}% margin</div>
    </div>
    <div class="stat-card orange">
      <div class="stat-card-header">
        <span class="stat-card-label">Jumlah Transaksi</span>
        <div class="stat-card-icon"><i data-lucide="receipt"></i></div>
      </div>
      <div class="stat-card-value">${trxs.length}</div>
    </div>
  `;

  if (window.lucide) lucide.createIcons({ nodes: [document.getElementById('report-stats')] });
}

function renderChart(trxs) {
  const canvas = document.getElementById('report-chart');
  if (!canvas) return;

  // Group by date
  const dailyData = {};
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    dailyData[key] = { sales: 0, margin: 0 };
  }

  trxs.forEach(t => {
    const key = businessDate(t.createdAt);
    if (dailyData[key]) {
      dailyData[key].sales += t.total;
      dailyData[key].margin += (t.margin || 0);
    }
  });

  const labels = Object.keys(dailyData).map(d => {
    const dt = new Date(d);
    return dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  });
  const salesData = Object.values(dailyData).map(d => d.sales);
  const marginData = Object.values(dailyData).map(d => d.margin);

  // Destroy existing chart if any
  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Penjualan',
          data: salesData,
          backgroundColor: 'rgba(5, 150, 105, 0.7)',
          borderColor: '#059669',
          borderWidth: 1,
          borderRadius: 6,
        },
        {
          label: 'Margin',
          data: marginData,
          backgroundColor: 'rgba(139, 92, 246, 0.6)',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          borderRadius: 6,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: Rp ${ctx.raw.toLocaleString('id-ID')}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (v) => `Rp ${(v/1000).toFixed(0)}k` },
          grid: { color: '#f1f5f9' }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderPaymentChart(trxs) {
  const canvas = document.getElementById('payment-chart');
  if (!canvas) return;

  const methods = { tunai: 0, qris: 0, transfer: 0 };
  trxs.forEach(t => {
    methods[t.paymentMethod] = (methods[t.paymentMethod] || 0) + t.total;
  });

  const existingChart = Chart.getChart(canvas);
  if (existingChart) existingChart.destroy();

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Tunai', 'QRIS', 'Transfer'],
      datasets: [{
        data: [methods.tunai, methods.qris, methods.transfer],
        backgroundColor: ['#059669', '#3b82f6', '#8b5cf6'],
        borderWidth: 0,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { usePointStyle: true, padding: 16 } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: Rp ${ctx.raw.toLocaleString('id-ID')}`
          }
        }
      }
    }
  });
}

function renderTable(trxs) {
  const container = document.getElementById('report-table');
  const sortedTrx = [...trxs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>No. Transaksi</th>
          <th>Tanggal</th>
          <th>Items</th>
          <th>Total</th>
          <th>Margin</th>
          <th>Pembayaran</th>
          <th>Kasir</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        ${sortedTrx.length === 0 ? `
          <tr><td colspan="8" class="empty-state" style="padding:40px">Tidak ada transaksi di periode ini</td></tr>
        ` : sortedTrx.map(t => {
          const methodBadge = t.paymentMethod === 'tunai' ? 'badge-success' :
            t.paymentMethod === 'qris' ? 'badge-info' : 'badge-default';
          return `
            <tr>
              <td><strong>${escapeHtml(t.trxNo)}</strong></td>
              <td>${formatDateTime(t.createdAt)}</td>
              <td>${t.items.length} item</td>
              <td><strong>${formatRupiah(t.total)}</strong></td>
              <td style="color:var(--success);font-weight:600">${formatRupiah(t.margin || 0)}</td>
              <td><span class="badge ${methodBadge}">${t.paymentMethod.toUpperCase()}</span></td>
              <td>${t.cashier || '-'}</td>
              <td>
                <button class="btn btn-sm btn-secondary" data-action="view-trx" data-id="${t.id}">
                  <i data-lucide="eye"></i>
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;

  if (window.lucide) lucide.createIcons({ nodes: [container] });

  // View detail
  container.querySelectorAll('[data-action="view-trx"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const trx = transactions.getById(btn.dataset.id);
      if (!trx) return;
      showModal({
        title: `Transaksi ${escapeHtml(trx.trxNo)}`,
        size: 'lg',
        content: `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
            <div style="padding:12px;background:var(--bg-alt);border-radius:var(--radius)">
              <div style="font-size:0.8rem;color:var(--text-muted)">Tanggal</div>
              <strong>${formatDateTime(trx.createdAt)}</strong>
            </div>
            <div style="padding:12px;background:var(--bg-alt);border-radius:var(--radius)">
              <div style="font-size:0.8rem;color:var(--text-muted)">Kasir</div>
              <strong>${trx.cashier}</strong>
            </div>
          </div>
          <div class="table-container">
            <table>
              <thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
              <tbody>
                ${trx.items.map(i => `
                  <tr>
                    <td>${escapeHtml(i.name)}</td>
                    <td>${i.qty}</td>
                    <td>${formatRupiah(i.price)}</td>
                    <td><strong>${formatRupiah(i.subtotal)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="margin-top:16px;padding:16px;background:var(--bg-alt);border-radius:var(--radius)">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span>Subtotal</span><strong>${formatRupiah(trx.subtotal)}</strong></div>
            ${trx.discount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px;color:var(--danger)"><span>Diskon</span><span>-${formatRupiah(trx.discount)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;font-size:1.1rem;font-weight:800;color:var(--primary);border-top:1px dashed var(--border);padding-top:8px;margin-top:8px"><span>TOTAL</span><span>${formatRupiah(trx.total)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.9rem;color:var(--success)"><span>Margin</span><strong>${formatRupiah(trx.margin || 0)}</strong></div>
          </div>
        `
      });
    });
  });
}

function exportCSV(trxs) {
  const rows = [['No Transaksi', 'Tanggal', 'Items', 'Subtotal', 'Diskon', 'Total', 'Modal', 'Margin', 'Metode Bayar', 'Kasir']];
  trxs.forEach(t => {
    rows.push([
      t.trxNo,
      t.createdAt,
      t.items.map(i => `${i.name} x${i.qty}`).join('; '),
      t.subtotal,
      t.discount || 0,
      t.total,
      t.totalCost || 0,
      t.margin || 0,
      t.paymentMethod,
      t.cashier || ''
    ]);
  });

  const csv = rows.map(r => r.map(c => `"${String(c).replace(/^[=+@-]/, "'" + String(c)[0]).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan_${dateFrom}_${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindReportEvents() {
  // Preset filters
  document.getElementById('report-preset-filter').addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('#report-preset-filter .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activePreset = tab.dataset.preset;

    if (activePreset === 'today') {
      dateFrom = today();
      dateTo = today();
    } else if (activePreset === '7d') {
      dateFrom = daysAgo(7);
      dateTo = today();
    } else if (activePreset === '30d') {
      dateFrom = daysAgo(30);
      dateTo = today();
    }

    document.getElementById('report-from').value = dateFrom;
    document.getElementById('report-to').value = dateTo;

    if (activePreset !== 'custom') updateReport();
  });

  // Apply custom date
  document.getElementById('report-apply').addEventListener('click', () => {
    dateFrom = document.getElementById('report-from').value;
    dateTo = document.getElementById('report-to').value;
    updateReport();
  });

  // Export
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    exportCSV(displayedTransactions);
  });
}

