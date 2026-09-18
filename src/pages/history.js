import {auth,transactions} from '../store.js';
import {renderSidebar} from '../components/sidebar.js';
import {renderHeader,bindHeaderEvents} from '../components/header.js';
import {showModal} from '../components/modal.js';
import {showToast} from '../components/toast.js';
import {today,daysAgo,businessDateTime,formatRupiah,escapeHtml} from '../utils.js';

const PAGE_SIZE=20;

export function renderHistory() {
  let rows=[],page=1,search='',request=0,alive=true;
  const app=document.getElementById('app');
  const scope=auth.isOwner()?'Lihat transaksi penjualan seluruh petugas':'Lihat transaksi penjualan yang kamu layani';
  app.innerHTML=`<div class="app-layout">${renderSidebar()}<div class="main-content">
    ${renderHeader('Histori Transaksi',scope)}
    <div class="page-content">
      <div class="card" style="padding:20px;margin-bottom:16px">
        <form id="history-filter" style="display:flex;gap:12px;flex-wrap:wrap;align-items:end">
          <div class="form-group" style="margin:0"><label for="history-from">Dari tanggal</label>
            <input type="date" class="form-input" id="history-from" value="${daysAgo(29)}" required></div>
          <div class="form-group" style="margin:0"><label for="history-to">Sampai tanggal</label>
            <input type="date" class="form-input" id="history-to" value="${today()}" required></div>
          <button class="btn btn-primary" id="history-load" type="submit"><i data-lucide="refresh-cw"></i>Tampilkan</button>
          <div class="form-group" style="margin:0;flex:1;min-width:200px"><label for="history-search">Cari transaksi</label>
            <input class="form-input" id="history-search" placeholder="Nomor transaksi, produk, atau kasir"></div>
        </form>
        <p style="margin-top:10px;color:var(--text-muted);font-size:0.85rem">Tanggal mengikuti WIB. Maksimal 93 hari per pencarian.</p>
      </div>
      <p id="history-status" role="status" style="margin-bottom:12px"></p>
      <div class="card"><div class="table-container" id="history-table"></div></div>
      <div id="history-pagination" style="display:flex;gap:12px;align-items:center;margin-top:16px"></div>
    </div>
  </div></div>`;
  bindHeaderEvents();
  const table=document.getElementById('history-table');
  const pager=document.getElementById('history-pagination');
  const status=document.getElementById('history-status');
  const button=document.getElementById('history-load');
  const from=document.getElementById('history-from'),to=document.getElementById('history-to');

  function renderRows() {
    const query=search.toLowerCase();
    const filtered=rows.filter(t=>[t.trxNo,t.cashier,...t.items.map(i=>i.name)].some(v=>String(v||'').toLowerCase().includes(query)));
    const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));page=Math.min(page,pages);
    const visible=filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
    status.textContent=`${filtered.length} transaksi · Total ${formatRupiah(filtered.reduce((sum,t)=>sum+t.total,0))}`;
    table.innerHTML=`<table><thead><tr><th>No. Transaksi</th><th>Waktu (WIB)</th><th>Kasir</th><th>Total</th><th>Pembayaran</th><th>Detail</th></tr></thead>
      <tbody>${visible.length?visible.map(t=>`<tr>
        <td><strong>${escapeHtml(t.trxNo)}</strong></td><td>${businessDateTime(t.createdAt).replace('T',' ')}</td>
        <td>${escapeHtml(t.cashier)}</td><td>${formatRupiah(t.total)}</td><td>${escapeHtml(t.paymentMethod.toUpperCase())}</td>
        <td><button class="btn btn-sm btn-secondary" data-history-id="${escapeHtml(t.id)}" aria-label="Detail ${escapeHtml(t.trxNo)}"><i data-lucide="eye"></i></button></td>
      </tr>`).join(''):'<tr><td colspan="6" class="empty-state" style="padding:32px">Tidak ada transaksi pada pencarian ini.</td></tr>'}</tbody></table>`;
    pager.innerHTML=`<button class="btn btn-secondary" id="history-prev" ${page===1?'disabled':''}>Sebelumnya</button>
      <span>Halaman ${page} / ${pages}</span><button class="btn btn-secondary" id="history-next" ${page===pages?'disabled':''}>Berikutnya</button>`;
    document.getElementById('history-prev').onclick=()=>{page--;renderRows();};
    document.getElementById('history-next').onclick=()=>{page++;renderRows();};
    table.querySelectorAll('[data-history-id]').forEach(btn=>btn.onclick=()=>{
      const t=visible.find(item=>item.id===btn.dataset.historyId);if(!t)return;
      showModal({title:`Transaksi ${escapeHtml(t.trxNo)}`,size:'lg',content:`
        <p style="margin-bottom:16px">${businessDateTime(t.createdAt).replace('T',' ')} WIB · Kasir: ${escapeHtml(t.cashier)}</p>
        <div class="table-container"><table><thead><tr><th>Produk</th><th>Jumlah</th><th>Harga</th><th>Subtotal</th></tr></thead>
          <tbody>${t.items.map(i=>`<tr><td>${escapeHtml(i.name)}</td><td>${i.qty}</td><td>${formatRupiah(i.price)}</td><td>${formatRupiah(i.subtotal)}</td></tr>`).join('')}</tbody></table></div>
        <div style="margin-top:16px;display:grid;gap:8px">
          <div>Subtotal: <strong>${formatRupiah(t.subtotal)}</strong></div>
          <div>Diskon: ${formatRupiah(t.discount)}</div><div>Total: <strong>${formatRupiah(t.total)}</strong></div>
          <div>Pembayaran: ${escapeHtml(t.paymentMethod.toUpperCase())} · ${formatRupiah(t.amountPaid)}</div>
          <div>Kembalian: ${formatRupiah(t.change)}</div>
        </div>`});
    });
    window.lucide?.createIcons();
  }
  async function load() {
    const ticket=++request;button.disabled=true;
    rows=[];table.innerHTML='';pager.innerHTML='';status.textContent='Memuat transaksi…';
    try {
      const result=await transactions.loadRange(from.value,to.value);
      if(!alive || ticket!==request)return;
      rows=[...result].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||String(b.id).localeCompare(String(a.id)));
      page=1;renderRows();
    } catch(error) {
      if(alive && ticket===request){status.textContent='Transaksi belum dapat dimuat. Coba lagi.';showToast(error.message,'error');}
    } finally {if(alive && ticket===request)button.disabled=false;}
  }
  document.getElementById('history-filter').onsubmit=e=>{e.preventDefault();load();};
  document.getElementById('history-search').oninput=e=>{search=e.target.value;page=1;if(!button.disabled)renderRows();};
  window.lucide?.createIcons();
  load();
  return {destroy(){alive=false;request++;}};
}
