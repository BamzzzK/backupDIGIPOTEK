// ===== DigiPotek Settings Page =====
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader, bindHeaderEvents } from '../components/header.js';

/**
 * Detect the user's platform for install instructions.
 * Returns 'ios', 'android', or 'desktop'.
 */
function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Check if the app is already installed (running in standalone mode) */
function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

/** Get current theme ('light' or 'dark') */
function getCurrentTheme() {
  return localStorage.getItem('digipotek-theme') || 'light';
}

/** Apply theme to document */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('digipotek-theme', theme);
  // Update theme-color meta tag for browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.content = theme === 'dark' ? '#0f172a' : '#059669';
  }
}

export function renderSettings() {
  const app = document.getElementById('app');
  const currentTheme = getCurrentTheme();
  const platform = detectPlatform();
  const installed = isInstalled();

  app.innerHTML = `
    <div class="app-layout">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader('Pengaturan', 'Tema tampilan & install aplikasi')}
        <div class="page-content">
          <div class="settings-container animate-slide-up">

            <!-- Theme Section -->
            <div class="settings-section card">
              <div class="card-header">
                <h3><i data-lucide="monitor" style="width:20px;height:20px;vertical-align:middle;margin-right:8px"></i>Tampilan</h3>
              </div>
              <div class="card-body">
                <div class="settings-theme-options">
                  <button class="theme-option ${currentTheme === 'light' ? 'active' : ''}" id="theme-light" data-theme="light">
                    <div class="theme-option-preview theme-preview-light">
                      <div class="theme-preview-sidebar"></div>
                      <div class="theme-preview-content">
                        <div class="theme-preview-header"></div>
                        <div class="theme-preview-body">
                          <div class="theme-preview-card"></div>
                          <div class="theme-preview-card"></div>
                        </div>
                      </div>
                    </div>
                    <div class="theme-option-label">
                      <i data-lucide="sun"></i>
                      <span>Light Mode</span>
                    </div>
                  </button>
                  <button class="theme-option ${currentTheme === 'dark' ? 'active' : ''}" id="theme-dark" data-theme="dark">
                    <div class="theme-option-preview theme-preview-dark">
                      <div class="theme-preview-sidebar"></div>
                      <div class="theme-preview-content">
                        <div class="theme-preview-header"></div>
                        <div class="theme-preview-body">
                          <div class="theme-preview-card"></div>
                          <div class="theme-preview-card"></div>
                        </div>
                      </div>
                    </div>
                    <div class="theme-option-label">
                      <i data-lucide="moon"></i>
                      <span>Dark Mode</span>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- Install App Section -->
            <div class="settings-section card" style="margin-top: 20px;">
              <div class="card-header">
                <h3><i data-lucide="smartphone" style="width:20px;height:20px;vertical-align:middle;margin-right:8px"></i>Install Aplikasi</h3>
              </div>
              <div class="card-body">
                ${installed ? renderInstalledBadge() : renderInstallContent(platform)}
              </div>
            </div>

            <!-- App Info Section -->
            <div class="settings-section card" style="margin-top: 20px;">
              <div class="card-header">
                <h3><i data-lucide="info" style="width:20px;height:20px;vertical-align:middle;margin-right:8px"></i>Tentang Aplikasi</h3>
              </div>
              <div class="card-body">
                <div class="settings-about">
                  <div class="about-row">
                    <span class="about-label">Aplikasi</span>
                    <span class="about-value">DigiPotek — Kasir Apotek Digital</span>
                  </div>
                  <div class="about-row">
                    <span class="about-label">Versi</span>
                    <span class="about-value">1.0.0</span>
                  </div>
                  <div class="about-row">
                    <span class="about-label">Platform</span>
                    <span class="about-value">${platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Desktop'}</span>
                  </div>
                  <div class="about-row">
                    <span class="about-label">Mode</span>
                    <span class="about-value">${installed ? '📱 Aplikasi (Standalone)' : '🌐 Browser'}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `;

  window.lucide.createIcons();
  bindHeaderEvents();
  bindSettingsEvents();

  return { destroy() {} };
}

function renderInstalledBadge() {
  return `
    <div class="install-status installed">
      <div class="install-status-icon">
        <i data-lucide="check-circle"></i>
      </div>
      <div class="install-status-text">
        <h4>Aplikasi Sudah Terinstall!</h4>
        <p>DigiPotek sudah berjalan sebagai aplikasi di perangkat Anda.</p>
      </div>
    </div>
  `;
}

function renderInstallContent(platform) {
  if (platform === 'ios') {
    return `
      <div class="install-info">
        <div class="install-info-header">
          <div class="install-info-icon ios">
            <i data-lucide="smartphone"></i>
          </div>
          <div>
            <h4>Install di iPhone / iPad</h4>
            <p>Ikuti langkah-langkah berikut untuk menambahkan DigiPotek ke Home Screen Anda</p>
          </div>
        </div>
        <div class="install-steps">
          <div class="install-step">
            <div class="install-step-number">1</div>
            <div class="install-step-text">
              <strong>Ketuk tombol Share</strong>
              <p>Ketuk ikon <i data-lucide="share" style="width:16px;height:16px;display:inline;vertical-align:middle"></i> (kotak dengan panah ke atas) di bagian bawah Safari</p>
            </div>
          </div>
          <div class="install-step">
            <div class="install-step-number">2</div>
            <div class="install-step-text">
              <strong>Pilih "Add to Home Screen"</strong>
              <p>Scroll ke bawah pada menu yang muncul dan ketuk "Add to Home Screen"</p>
            </div>
          </div>
          <div class="install-step">
            <div class="install-step-number">3</div>
            <div class="install-step-text">
              <strong>Ketuk "Add"</strong>
              <p>Konfirmasi dengan mengetuk "Add" di pojok kanan atas. Ikon DigiPotek akan muncul di Home Screen Anda!</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Android & Desktop — use install prompt
  return `
    <div class="install-info">
      <div class="install-info-header">
        <div class="install-info-icon ${platform}">
          <i data-lucide="smartphone"></i>
        </div>
        <div>
          <h4>Install di ${platform === 'android' ? 'Android' : 'Komputer'}</h4>
          <p>Pasang DigiPotek sebagai aplikasi untuk akses cepat dari Home Screen</p>
        </div>
      </div>
      <div class="install-action">
        <button class="btn btn-primary btn-lg" id="btn-install-app">
          <i data-lucide="download"></i>
          Install DigiPotek
        </button>
        <p class="install-hint" id="install-hint">
          ${window.deferredInstallPrompt ? 'Klik tombol di atas untuk menginstall aplikasi' : 'Tombol install akan tersedia saat browser mendukung instalasi PWA'}
        </p>
      </div>
    </div>
  `;
}

function bindSettingsEvents() {
  // Theme toggle
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      applyTheme(theme);
      // Update active state
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Install button
  const installBtn = document.getElementById('btn-install-app');
  if (installBtn) {
    if (!window.deferredInstallPrompt) {
      installBtn.disabled = true;
      installBtn.style.opacity = '0.5';
    }

    installBtn.addEventListener('click', async () => {
      const prompt = window.deferredInstallPrompt;
      if (!prompt) return;

      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === 'accepted') {
        window.deferredInstallPrompt = null;
        installBtn.innerHTML = '<i data-lucide="check-circle"></i> Terinstall!';
        installBtn.disabled = true;
        const hint = document.getElementById('install-hint');
        if (hint) hint.textContent = 'DigiPotek berhasil diinstall! Cek Home Screen Anda.';
        window.lucide.createIcons();
      }
    });

    // Listen for deferred prompt becoming available
    window.addEventListener('pwa-install-available', () => {
      if (installBtn.isConnected) {
        installBtn.disabled = false;
        installBtn.style.opacity = '1';
        const hint = document.getElementById('install-hint');
        if (hint) hint.textContent = 'Klik tombol di atas untuk menginstall aplikasi';
      }
    });
  }
}
