// ===== DigiPotek — Main App Bootstrap =====
import './style.css';
import Chart from 'chart.js/auto';
import * as lucide from 'lucide';
import { renderStaff } from './pages/staff.js';
window.Chart = Chart;
window.lucide = lucide;
import { initializeData } from './store.js';
import { registerRoute, initRouter } from './router.js';
import { renderLogin, renderPending } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderPOS } from './pages/pos.js';
import { renderProducts } from './pages/products.js';
import { renderStock } from './pages/stock.js';
import { renderReports } from './pages/reports.js';

// Initialize seed data
async function start() {
try { await initializeData(); } catch (error) { document.getElementById('app').textContent = `Koneksi gagal: ${error.message}. Muat ulang untuk mencoba lagi.`; return; }

// Register routes with role guards
registerRoute('/login', renderLogin);
registerRoute('/pending', renderPending);
registerRoute('/staff', renderStaff, ['owner']);
registerRoute('/dashboard', renderDashboard, ['owner']);
registerRoute('/pos', renderPOS, ['owner', 'kasir']);
registerRoute('/products', renderProducts, ['owner']);
registerRoute('/stock', renderStock, ['owner']);
registerRoute('/reports', renderReports, ['owner']);

// Start router
initRouter();


}
start();
