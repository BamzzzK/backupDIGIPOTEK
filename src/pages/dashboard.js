// ===== DigiPotek Dashboard Page =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';
import { transactions, products } from '../store.js';
import { formatRupiah, daysAgo, today } from '../utils.js';

export function renderDashboard() {
  const app = document.getElementById('app');
  
  // Calculate stats
  const todayTrx = transactions.getToday();
  const todaySales = todayTrx.reduce((s, t) => s + t.total, 0);
  const todayMargin = todayTrx.reduce((s, t) => s + (t.margin || 0), 0);
  const lowStockProducts = products.getLowStock();
  const allProducts = products.getAll();

  // Top products by sales volume
  const productSales = {};
  transactions.getByDateRange(daysAgo(30), today()).forEach(trx => {
    trx.items.forEach(item => {
      if (!productSales[item.name]) productSales[item.name] = { name: item.name, qty: 0, revenue: 0 };
      productSales[item.name].qty += item.qty;
      productSales[item.name].revenue += item.subtotal;
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Dashboard', 'Ringkasan penjualan dan stok apotek')}
        <div class="page-content">
          <div class="stats-grid animate-slide-up">
            <div class="stat-card green stagger-1">
              <div class="stat-card-header">
                <span class="stat-card-label">Penjualan Hari Ini</span>
                <div class="stat-card-icon"><i data-lucide="trending-up"></i></div>
              </div>
              <div class="stat-card-value">${formatRupiah(todaySales)}</div>
              <div class="stat-card-change" style="color:var(--text-muted)">${todayTrx.length} transaksi</div>
            </div>
            <div class="stat-card blue stagger-2">
              <div class="stat-card-header">
                <span class="stat-card-label">Margin Hari Ini</span>
                <div class="stat-card-icon"><i data-lucide="wallet"></i></div>
              </div>
              <div class="stat-card-value">${formatRupiah(todayMargin)}</div>
              <div class="stat-card-change" style="color:var(--success)">${todaySales > 0 ? Math.round(todayMargin/todaySales*100) : 0}% margin</div>
            </div>
            <div class="stat-card purple stagger-3">
              <div class="stat-card-header">
                <span class="stat-card-label">Total Produk</span>
                <div class="stat-card-icon"><i data-lucide="package"></i></div>
              </div>
              <div class="stat-card-value">${allProducts.length}</div>
              <div class="stat-card-change" style="color:var(--text-muted)">item terdaftar</div>
            </div>
            <div class="stat-card orange stagger-4">
              <div class="stat-card-header">
                <span class="stat-card-label">Stok Menipis</span>
                <div class="stat-card-icon"><i data-lucide="alert-triangle"></i></div>
              </div>
              <div class="stat-card-value">${lowStockProducts.length}</div>
              <div class="stat-card-change" style="color:var(--warning)">perlu restok</div>
            </div>
          </div>

          <div class="dashboard-grid animate-slide-up" style="animation-delay:0.2s;animation-fill-mode:backwards">
            <div class="card">
              <div class="card-header">
                <h3><i data-lucide="bar-chart-3" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:6px"></i> Penjualan 7 Hari Terakhir</h3>
              </div>
              <div class="card-body">
                <div class="chart-container">
                  <canvas id="sales-chart"></canvas>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-header">
                <h3><i data-lucide="trophy" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:6px"></i> Produk Terlaris</h3>
              </div>
              <div class="card-body" style="padding:0">
                <div class="table-container">
                  <table>
                    <thead>
                      <tr><th>Produk</th><th>Terjual</th><th>Revenue</th></tr>
                    </thead>
                    <tbody>
                      ${topProducts.length === 0 ? '<tr><td colspan="3" style="text-align:center;color:var(--text-light);padding:20px">Belum ada data</td></tr>' :
                        topProducts.map((p, i) => `
                          <tr>
                            <td><strong>${i+1}. ${p.name}</strong></td>
                            <td>${p.qty}</td>
                            <td>${formatRupiah(p.revenue)}</td>
                          </tr>
                        `).join('')
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          ${lowStockProducts.length > 0 ? `
          <div class="card animate-slide-up" style="margin-top:20px;animation-delay:0.3s;animation-fill-mode:backwards">
            <div class="card-header">
              <h3><i data-lucide="alert-triangle" style="width:18px;height:18px;display:inline;vertical-align:middle;margin-right:6px;color:var(--warning)"></i> Peringatan Stok Menipis</h3>
            </div>
            <div class="card-body" style="padding:0">
              <div class="table-container">
                <table>
                  <thead>
                    <tr><th>Produk</th><th>Kategori</th><th>Stok</th><th>Min. Stok</th></tr>
                  </thead>
                  <tbody>
                    ${lowStockProducts.map(p => `
                      <tr>
                        <td><strong>${p.name}</strong></td>
                        <td>${p.category === 'obat' ? '💊 Obat' : p.category === 'non-obat' ? '🧴 Non-Obat' : '🩺 Alkes'}</td>
                        <td><span class="badge badge-warning">${p.stock}</span></td>
                        <td>${p.minStock}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();
  bindHeaderEvents();
  renderSalesChart();

  return {};
}

function renderSalesChart() {
  const canvas = document.getElementById('sales-chart');
  if (!canvas) return;

  const labels = [];
  const salesData = [];
  const marginData = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    labels.push(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }));
    
    const dayTrx = transactions.getByDateRange(dateStr, dateStr);
    salesData.push(dayTrx.reduce((s, t) => s + t.total, 0));
    marginData.push(dayTrx.reduce((s, t) => s + (t.margin || 0), 0));
  }

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
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderColor: '#3b82f6',
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
