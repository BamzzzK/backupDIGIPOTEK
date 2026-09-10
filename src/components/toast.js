import { escapeHtml } from '../utils.js';
// ===== DigiPotek Toast Notifications =====

export function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  const iconMap = {
    success: 'check-circle',
    error: 'alert-circle',
    warning: 'alert-triangle',
    info: 'info',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i data-lucide="${iconMap[type] || 'info'}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  // Initialize lucide icons
  if (window.lucide) lucide.createIcons({ nodes: [toast] });

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

