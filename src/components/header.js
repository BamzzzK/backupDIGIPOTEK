import { runAction } from '../utils.js';
// ===== DigiPotek Header =====
import { auth } from '../store.js';
import { navigate } from '../router.js';

export function renderHeader(title, subtitle = '') {
  const session = auth.getSession();
  if (!session) return '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return `
    <header class="header">
      <div class="header-left">
        <button class="btn-mobile-menu" id="btn-mobile-menu" aria-label="Menu">
          <i data-lucide="menu"></i>
        </button>
        <div class="header-title">
          <h2>${title}</h2>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
      </div>
      <div class="header-right">
        <span class="header-date">
          <i data-lucide="calendar" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px"></i>
          ${dateStr}
        </span>
        <button class="btn-logout" id="btn-logout">
          <i data-lucide="log-out"></i>
          Keluar
        </button>
      </div>
    </header>
  `;
}

export function bindHeaderEvents() {
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => runAction(logoutBtn, async () => {
      await auth.logout();
      navigate('/login');
    }));
  }

  // Mobile sidebar toggle
  const menuBtn = document.getElementById('btn-mobile-menu');
  const sidebar = document.getElementById('sidebar');
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('sidebar-open');
    });
    // Close sidebar when clicking a nav link (mobile)
    sidebar.querySelectorAll('.sidebar-link').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('sidebar-open');
      });
    });
  }

  // Close sidebar when clicking overlay backdrop
  document.addEventListener('click', (e) => {
    const sidebar = document.getElementById('sidebar');
    const menuBtn = document.getElementById('btn-mobile-menu');
    if (sidebar && sidebar.classList.contains('sidebar-open')) {
      if (!sidebar.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
        sidebar.classList.remove('sidebar-open');
      }
    }
  });
}

