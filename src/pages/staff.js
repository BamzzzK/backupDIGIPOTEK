import { staff,auth,importLegacy } from '../store.js';
import { renderSidebar } from '../components/sidebar.js';
import { renderHeader,bindHeaderEvents } from '../components/header.js';
import { escapeHtml,runAction } from '../utils.js';
import { showToast } from '../components/toast.js';
function legacy(){return {products:JSON.parse(localStorage.getItem('dp_products')||'[]'),transactions:JSON.parse(localStorage.getItem('dp_transactions')||'[]')};}
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function renderStaff(){
 const list=await staff.list();
 document.getElementById('app').innerHTML=`<div class="app-layout">${renderSidebar()}<div class="main-content">${renderHeader('Pegawai & Data','Persetujuan akses dan pemindahan data lama')}<div class="page-content"><div class="card"><div class="card-header"><h3>Akun pegawai</h3></div><div class="card-body"><p>Akun baru tidak mempunyai akses data sampai kamu aktifkan sebagai kasir.</p><table><thead><tr><th>Nama</th><th>Peran</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${list.map(s=>`<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.role)}</td><td>${s.active?'Aktif':'Menunggu / nonaktif'}</td><td>${s.id!==auth.getSession().id&&s.role!=='owner'?`<button class="btn btn-secondary" data-staff="${s.id}" data-active="${!s.active}">${s.active?'Nonaktifkan':'Aktifkan kasir'}</button>`:''}</td></tr>`).join('')}</tbody></table><button class="btn btn-secondary" id="refresh-staff">Muat ulang daftar</button></div></div>
 <div class="card" style="margin-top:20px"><div class="card-header"><h3>Impor awal data browser</h3></div><div class="card-body"><p>Impor hanya dapat dilakukan saat database produk dan transaksi masih kosong. Riwayat dipindahkan tanpa mengurangi stok lagi. Data lama tetap tersimpan di browser asal.</p><p style="margin:12px 0">Batch pada aplikasi lama tidak mengikuti pengurangan stok. Cocokkan batch dan tanggal kedaluwarsa dengan stok fisik setelah impor. Data contoh yang tidak ingin dipakai tidak perlu diimpor.</p><button id="export-legacy" class="btn btn-secondary">Unduh data lama browser ini</button> <button id="import-local" class="btn btn-primary">Impor dari browser ini</button><p style="margin:16px 0">Atau pilih file JSON hasil ekspor:</p><input id="legacy-file" type="file" accept="application/json,.json"><button id="import-file" class="btn btn-primary">Impor file</button><p id="import-status" role="status" style="margin-top:16px"></p></div></div></div></div></div>`;
 bindHeaderEvents();if(window.lucide)lucide.createIcons();
 document.querySelectorAll('[data-staff]').forEach(b=>b.onclick=()=>runAction(b,async()=>{await staff.setActive(b.dataset.staff,b.dataset.active==='true');await renderStaff();}));
 document.getElementById('refresh-staff').onclick=e=>runAction(e.currentTarget,renderStaff);
 document.getElementById('export-legacy').onclick=e=>runAction(e.currentTarget,async()=>download(legacy(),'apotek-data-lama.json'));
 async function importData(data){
  if(!Array.isArray(data.products)||!Array.isArray(data.transactions)||data.products.length===0)throw new Error('Tidak ada data produk valid. Gunakan browser asal atau pilih file ekspor.');
  if(!window.confirm(`Pindahkan ${data.products.length} produk dan ${data.transactions.length} transaksi ke database? Pastikan ini data yang ingin dipakai.`))return;
  const result=await importLegacy(data);document.getElementById('import-status').textContent=`Berhasil: ${result.products} produk dan ${result.transactions} transaksi.`;showToast('Data berhasil dipindahkan','success');
 }
 document.getElementById('import-local').onclick=e=>runAction(e.currentTarget,()=>importData(legacy()));
 document.getElementById('import-file').onclick=e=>runAction(e.currentTarget,async()=>{const f=document.getElementById('legacy-file').files[0];if(!f)throw new Error('Pilih file terlebih dahulu');if(f.size>15*1024*1024)throw new Error('File maksimal 15 MB');await importData(JSON.parse(await f.text()));});
 return {};
}
