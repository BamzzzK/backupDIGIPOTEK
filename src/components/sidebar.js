import { escapeHtml } from '../utils.js';
// ===== DigiPotek Sidebar =====
import { auth } from '../store.js';
import { getCurrentRoute, navigate } from '../router.js';

export function renderSidebar() {
  const session = auth.getSession();
  if (!session) return '';

  const isOwner = session.role === 'owner';
  const current = getCurrentRoute();

  const menuItems = [
    { section: 'MENU UTAMA' },
    ...(isOwner ? [{ path: '/dashboard', icon: 'layout-dashboard', label: 'Dashboard' }] : []),
    { path: '/pos', icon: 'shopping-cart', label: 'Kasir (POS)' },
    ...(isOwner ? [{ section: 'INVENTORI' },
    { path: '/products', icon: 'package', label: 'Produk' },
    { path: '/stock', icon: 'boxes', label: 'Manajemen Stok' }] : []),
    ...(isOwner ? [
      { section: 'LAPORAN' },
      { path: '/staff', icon: 'users', label: 'Pegawai & Data' },
      { path: '/reports', icon: 'bar-chart-3', label: 'Laporan & Margin' },
    ] : []),
  ];

  const menuHtml = menuItems.map(item => {
    if (item.section) {
      return `<div class="sidebar-section">${item.section}</div>`;
    }
    const active = current === item.path ? 'active' : '';
    return `
      <a href="#${item.path}" class="sidebar-link ${active}" data-page="${item.path}">
        <i data-lucide="${item.icon}"></i>
        <span>${item.label}</span>
      </a>
    `;
  }).join('');

  const initials = session.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const roleBadge = isOwner ? 'Owner' : 'Kasir';

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">
          <i data-lucide="pill"></i>
        </div>
        <div class="sidebar-brand">
          <h2>DigiPotek</h2>
          <p>Apotek Digital</p>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${menuHtml}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user" id="sidebar-user-btn">
          <div class="sidebar-avatar">${escapeHtml(initials)}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${escapeHtml(session.name)}</div>
            <div class="sidebar-user-role">${roleBadge}</div>
          </div>
        </div>
      </div>
    </aside>
  `;
}

