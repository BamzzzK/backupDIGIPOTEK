import { auth } from '../store.js';
import { navigate } from '../router.js';
export function renderLogin() {
 const app=document.getElementById('app');
 app.innerHTML=`<div class="login-page"><div class="login-card"><div class="login-logo"><h1>Apotek Mulia Farma</h1><p>Masuk dengan akun pegawai</p></div>
 <form id="login-form" class="login-form">
 <div class="form-group"><label for="login-email">Email</label><input id="login-email" class="form-input" type="email" autocomplete="username" required></div>
 <div class="form-group"><label for="login-password">Password</label><input id="login-password" class="form-input" type="password" autocomplete="current-password" required></div>
 <div id="register-name" class="form-group" hidden><label for="login-name">Nama pegawai</label><input id="login-name" class="form-input" maxlength="120"></div>
 <p id="login-message" role="status" style="margin:12px 0"></p>
 <button id="login-submit" class="btn btn-primary btn-block">Masuk</button></form>
 <button id="register-toggle" class="btn btn-ghost btn-block" style="margin-top:12px">Daftar akun pegawai</button>
 <p style="font-size:.85rem;color:var(--text-muted);margin-top:12px">Akun baru memerlukan persetujuan pemilik sebelum dapat mengakses data apotek.</p></div></div>`;
 let register=false;
 const form=document.getElementById('login-form'),button=document.getElementById('login-submit'),message=document.getElementById('login-message');
 document.getElementById('register-toggle').onclick=()=>{register=!register;document.getElementById('register-name').hidden=!register;document.getElementById('login-name').required=register;document.getElementById('login-password').minLength=register?8:1;button.textContent=register?'Daftar':'Masuk';document.getElementById('register-toggle').textContent=register?'Sudah punya akun? Masuk':'Daftar akun pegawai';message.textContent=register?'Gunakan password minimal 8 karakter.':'';};
 form.onsubmit=async e=>{
  e.preventDefault();button.disabled=true;message.textContent='Memproses…';
  try {
   const email=document.getElementById('login-email').value.trim(),password=document.getElementById('login-password').value;
   if(register){const result=await auth.register(email,password,document.getElementById('login-name').value.trim());if(!result.session){message.textContent='Pendaftaran diterima. Periksa email untuk konfirmasi, kemudian masuk. Jika akun sudah ada, gunakan akun tersebut.';return;}await auth.refresh();}
   else await auth.login(email,password);
   const s=auth.getSession();navigate(s?.active?(s.role==='owner'?'/dashboard':'/pos'):'/pending');
  }catch(err){message.textContent=err.message;}finally{button.disabled=false;}
 };
 return {};
}
export function renderPending(){
 document.getElementById('app').innerHTML=`<div class="login-page"><div class="login-card"><h2>Menunggu persetujuan pemilik</h2><p style="margin:16px 0">Akunmu belum diaktifkan. Pemilik dapat mengaktifkannya melalui menu Pegawai & Data.</p><button id="pending-refresh" class="btn btn-primary">Periksa status</button> <button id="pending-out" class="btn btn-secondary">Keluar</button><details style="margin-top:24px"><summary>Aktivasi pemilik pertama</summary><form id="owner-form" style="margin-top:12px"><label for="owner-token">Kode aktivasi sekali pakai</label><input id="owner-token" class="form-input" type="password" required autocomplete="off"><button class="btn btn-primary" style="margin-top:12px">Aktifkan pemilik</button></form></details><p id="pending-message" role="status"></p></div></div>`;
 const message=document.getElementById('pending-message');
 document.getElementById('pending-refresh').onclick=async()=>{try{const s=await auth.refresh();if(s?.active)navigate(s.role==='owner'?'/dashboard':'/pos');else message.textContent='Akun belum diaktifkan.';}catch(e){message.textContent=e.message;}};
 document.getElementById('pending-out').onclick=async()=>{try{await auth.logout();navigate('/login');}catch(e){message.textContent=e.message;}};
 document.getElementById('owner-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await auth.claimOwner(document.getElementById('owner-token').value.trim());navigate('/dashboard');}catch(err){message.textContent=err.message;}finally{b.disabled=false;}};
 return {};
}
