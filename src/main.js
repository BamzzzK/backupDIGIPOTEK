// ===== DigiPotek — Main App Bootstrap =====
import './style.css';
import { initializeData } from './store.js';
import { registerRoute, initRouter } from './router.js';
import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderPOS } from './pages/pos.js';
import { renderProducts } from './pages/products.js';
import { renderStock } from './pages/stock.js';
import { renderReports } from './pages/reports.js';

// Initialize seed data
initializeData();

// Register routes with role guards
registerRoute('/login', renderLogin);
registerRoute('/dashboard', renderDashboard, ['owner']);
registerRoute('/pos', renderPOS, ['owner', 'kasir']);
registerRoute('/products', renderProducts, ['owner', 'kasir']);
registerRoute('/stock', renderStock, ['owner', 'kasir']);
registerRoute('/reports', renderReports, ['owner']);

// Start router
initRouter();
