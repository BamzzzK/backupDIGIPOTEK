// ===== DigiPotek Login Page =====
import { auth } from '../store.js';
import { navigate } from '../router.js';

export function renderLogin() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="login-logo">
          <div class="login-logo-icon">
            <i data-lucide="pill"></i>
          </div>
          <h1>DigiPotek</h1>
          <p>Aplikasi Kasir Apotek Digital</p>
        </div>
        <div class="login-error" id="login-error">
          <i data-lucide="alert-circle"></i>
          <span>Username atau password salah</span>
        </div>
        <form class="login-form" id="login-form">
          <div class="form-group">
            <label for="login-username">Username</label>
            <div class="form-input-icon">
              <i data-lucide="user"></i>
              <input type="text" class="form-input" id="login-username" placeholder="Masukkan username" autocomplete="username" required />
            </div>
          </div>
          <div class="form-group">
            <label for="login-password">Password</label>
            <div class="form-input-icon">
              <i data-lucide="lock"></i>
              <input type="password" class="form-input" id="login-password" placeholder="Masukkan password" autocomplete="current-password" required />
            </div>
          </div>
          <button type="submit" class="btn btn-primary btn-lg btn-block">
            <i data-lucide="log-in"></i>
            Masuk
          </button>
        </form>
        <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border-light); font-size:0.8rem; color:var(--text-muted); text-align:center;">
          <p style="margin-bottom:4px"><strong>Demo Login:</strong></p>
          <p>Owner: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">owner</code> / <code style="background:var(--bg);padding:2px 6px;border-radius:4px">owner123</code></p>
          <p>Kasir: <code style="background:var(--bg);padding:2px 6px;border-radius:4px">kasir</code> / <code style="background:var(--bg);padding:2px 6px;border-radius:4px">kasir123</code></p>
        </div>
      </div>
    </div>
  `;

  if (window.lucide) lucide.createIcons();

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    const session = auth.login(username, password);
    if (session) {
      navigate(session.role === 'owner' ? '/dashboard' : '/pos');
    } else {
      errorEl.classList.add('show');
      setTimeout(() => errorEl.classList.remove('show'), 3000);
    }
  });

  return {};
}
