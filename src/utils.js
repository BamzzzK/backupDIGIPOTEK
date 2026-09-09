// ===== DigiPotek Utility Functions =====

/** Format number to Indonesian Rupiah */
export function formatRupiah(num) {
  if (num == null || isNaN(num)) return 'Rp 0';
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

/** Format date to Indonesian locale */
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format datetime */
export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) + 
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Get today's date string (YYYY-MM-DD) */
export function today() {
  return new Date().toISOString().split('T')[0];
}

/** Generate unique ID */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/** Generate transaction number */
export function generateTrxNo() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const seq = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  return `TRX${y}${m}${d}-${seq}`;
}

/** Debounce function */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Calculate days between two dates */
export function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diff = d2 - d1;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Get date N days ago */
export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Get category badge HTML */
export function categoryBadge(category) {
  const map = {
    'obat': { class: 'badge-obat', label: '💊 Obat' },
    'non-obat': { class: 'badge-non-obat', label: '🧴 Non-Obat' },
    'alkes': { class: 'badge-alkes', label: '🩺 Alkes' },
  };
  const info = map[category] || { class: 'badge-default', label: category };
  return `<span class="badge ${info.class}">${info.label}</span>`;
}

/** Get stock status badge */
export function stockBadge(stock, minStock) {
  if (stock <= 0) return '<span class="badge badge-danger">Habis</span>';
  if (stock <= minStock) return '<span class="badge badge-warning">Menipis</span>';
  return '<span class="badge badge-success">Aman</span>';
}

/** Parse number from input (handle comma/dot) */
export function parseNum(val) {
  if (!val) return 0;
  return Number(String(val).replace(/[^0-9.-]/g, '')) || 0;
}
