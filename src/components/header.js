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
    logoutBtn.addEventListener('click', () => {
      auth.logout();
      navigate('/login');
    });
  }
}
