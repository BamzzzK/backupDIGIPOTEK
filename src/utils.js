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
  return businessDate(new Date());
}

/** Generate unique ID */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/** Generate batch number based on current date */
export function generateBatchNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `BT${y}${m}${d}-${rand}`;
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
  return businessDate(d);
}

/** Escape HTML to prevent XSS */
export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

/** Quote CSV fields and neutralize spreadsheet formulas after leading whitespace. */
export function csvCell(value) {
  let text=String(value ?? '');
  if(/^[\s\uFEFF]*[=+@-]/.test(text)) text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
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


export function businessDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
/** datetime-local value expressed in the pharmacy's business timezone. */
export function businessDateTime(value=new Date()) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export async function runAction(button, action) {
  if (button.disabled) return;
  button.disabled = true;
  try { return await action(); }
  catch(error) { const {showToast} = await import('./components/toast.js'); showToast(error.message, 'error', 7000); }
  finally { if(button.isConnected) button.disabled = false; }
}
