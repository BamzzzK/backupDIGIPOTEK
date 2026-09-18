# Apotek Mulia Farma

Aplikasi kasir Vite dengan database bersama di Supabase PostgreSQL. Frontend produksi berada di [Cloudflare Workers Static Assets](https://apotekmuliafarma.azrielalghiffari678.workers.dev/), terhubung ke branch `main` repository ini. Integrasi tetap memakai layanan yang sudah ada; tidak membuat proyek berbayar baru.

## Menjalankan

Gunakan Node.js 24 untuk menjalankan seluruh pengujian.

```sh
npm ci
npm run dev
```

Konfigurasi publik proyek sudah disertakan di `src/supabase.js`. Untuk menggunakan proyek lain, salin `.env.example` menjadi `.env.local` dan ganti URL serta **publishable key**. Jangan pernah memasukkan service-role key, secret key, atau password database ke variabel `VITE_*`.

## Akun dan aktivasi pemilik

Proyek produksi sudah memiliki pemilik. Masuk menggunakan username dan password akun yang ada; tidak perlu mengulang aktivasi. Langkah aktivasi pertama berikut hanya untuk proyek baru yang belum memiliki pemilik.

1. Buka aplikasi, pilih **Daftar akun pegawai**, lalu isi nama, username, email pemulihan, dan password minimal 8 karakter.
2. Konfirmasikan email satu kali apabila Supabase memintanya, lalu masuk menggunakan username dan password. Email tidak diperlukan untuk login berikutnya. Bila tautan konfirmasi mengarah ke alamat localhost yang tidak aktif, buka aplikasi kembali dan coba masuk setelah konfirmasi.
3. Di halaman menunggu persetujuan, buka **Aktivasi pemilik pertama** dan masukkan kode sekali pakai yang diberikan terpisah oleh pengelola integrasi. Kode tidak disimpan di GitHub; database hanya menyimpan hash SHA-256.
4. Pemilik dapat mengaktifkan akun pegawai lain sebagai kasir di **Pegawai & Data**. Akun pendaftar tidak bisa membaca data bisnis sebelum disetujui. Pendaftaran Auth tetap tersedia untuk alur persetujuan ini, bukan akses publik ke data.

Tidak ada akun atau password demo untuk database produksi. Jika pengiriman email konfirmasi terhalang batas layanan bawaan Supabase, pengelola proyek dapat membuat akun terkonfirmasi melalui Supabase Dashboard > Authentication > Users, lalu pemilik mengaktifkan akun tersebut. Jangan mengubah peran melalui metadata pengguna yang dapat diedit pengguna.

## Data lama

Database produksi sudah berisi katalog dan transaksi. Katalog acak dari `src/data/seed.js` tidak otomatis dimasukkan. Prosedur impor awal di bawah hanya berlaku untuk database kosong.

- Jalankan versi baru dari **origin yang sama** dengan versi lama untuk membaca `dp_products` dan `dp_transactions` dari browser yang menyimpannya. Perpindahan hostname atau port berarti origin berbeda.
- Masuk sebagai pemilik, buka **Pegawai & Data**, unduh cadangan data lama, kemudian jalankan impor awal. Alternatifnya pilih JSON hasil ekspor dari browser asal.
- Impor hanya diizinkan ketika tabel produk dan penjualan kosong. Impor dilakukan atomik dan mempertahankan saldo stok saat ini; transaksi historis tidak mengurangi stok lagi.
- Produk berstatus hapus tetap dipertahankan sebagai referensi riwayat penjualan.
- Karena aplikasi lama tidak mengurangi jumlah batch ketika menjual, pembagian jumlah antarbatch tidak dapat direkonstruksi secara pasti. Impor menyesuaikan jumlah batch terhadap saldo stok; cocokkan pembagiannya dengan fisik barang sebelum operasional. Stok tanpa informasi batch dimasukkan sebagai batch tanpa tanggal kedaluwarsa dan perlu dilengkapi.
- Akun/password lama tidak diimpor. Inisialisasi aplikasi menghapus `dp_users` dan `dp_auth`, tetapi mempertahankan data produk dan transaksi lama.

Jika origin lama tidak dapat menjalankan versi baru, ekspor dari console browser pada origin lama (hanya data bisnis, tanpa password):

```js
const data = {
  products: JSON.parse(localStorage.getItem('dp_products') || '[]'),
  transactions: JSON.parse(localStorage.getItem('dp_transactions') || '[]')
};
const url = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
const a = document.createElement('a');
a.href = url;
a.download = 'apotek-data-lama.json';
a.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

## Hak akses dan konsistensi stok

- Pemilik: katalog, pembelian/supplier, penerimaan/pengurangan stok, laporan, persetujuan kasir, impor awal. Faktur, supplier, dan riwayat perubahan pembelian hanya dapat dibaca pemilik, termasuk melalui API.
- Kasir: membaca katalog/batch dan membuat penjualan; hanya dapat membaca penjualannya sendiri melalui API.
- Stok dihitung dari jumlah batch. Pengubahan stok langsung lewat form edit produk tidak diizinkan.
- `checkout` menghitung harga, diskon, HPP dan kembalian di database; harga dari browser hanya digunakan untuk mendeteksi harga yang sudah berubah.
- Penguncian produk dengan urutan ID tetap dan transaksi PostgreSQL menjaga stok ketika kasir bekerja bersamaan.
- Pengurangan batch mengikuti FEFO; batch dengan tanggal kedaluwarsa sebelum tanggal WIB hari ini tidak bisa dijual. Batch tanpa tanggal diambil terakhir. Tanggal yang sama dengan hari ini masih diperbolehkan.
- HPP penjualan baru mengikuti biaya pada batch. Penerimaan dari faktur memakai biaya item setelah diskon/pajak item; penerimaan stok terpisah memakai harga beli produk saat penerimaan. Diskon/pajak/biaya tingkat faktur tetap mengikuti aturan sebelumnya dan belum dialokasikan ke HPP per item. Stok awal obat baru wajib menyertakan nomor batch dan kedaluwarsa.
- ID permintaan membuat percobaan ulang pembayaran tidak menggandakan penjualan. Tab menyimpan transaksi yang belum terkonfirmasi untuk dicoba ulang dengan ID sama. Jangan menghapus penyimpanan tab saat status pembayaran belum jelas.
- QRIS dan transfer dicatat berdasarkan konfirmasi kasir; belum ada integrasi verifikasi pembayaran dari penyedia pembayaran.
- Tampilan katalog POS dimuat ulang setiap 30 detik saat tab aktif; checkout selalu memeriksa stok di server. Laporan diambil per rentang tanggal, dipaginasi dalam pengambilan data, maksimal 93 hari per permintaan.
- Hari laporan menggunakan zona waktu Asia/Jakarta.

## Pembelian yang konsisten

- `save_purchase` menghitung total di server serta menyimpan header, item, batch, pergerakan stok, dan jejak perubahan dalam satu transaksi PostgreSQL. Kegagalan membatalkan seluruh operasi.
- `cancel_purchase` mempertahankan faktur dan item dengan status batal, alasan, waktu, dan pelaku. Pembatalan hanya menarik batch asal; faktur batal tidak dihitung dalam total pembelian aktif.
- Revisi item atau pembatalan ditolak jika batch sudah terjual, disesuaikan, atau asalnya belum dapat diverifikasi. Catatan/header dapat diedit tanpa mengubah rincian item. Nomor versi menolak perubahan yang menimpa edit perangkat lain.
- Nomor faktur unik per supplier (termasuk supplier Umum), tanpa membedakan huruf besar/kecil dan spasi di ujung. Nomor faktur batal tetap disimpan dan tidak dapat dipakai ulang.
- ID permintaan disimpan per akun/proyek di `sessionStorage` sebelum pengiriman. Bila koneksi terputus, pilih **Periksa permintaan tertunda** untuk mengirim ulang permintaan yang sama. Jangan menghapus penyimpanan tab sebelum hasilnya diketahui.
- Supplier harus berhasil disimpan di server sebelum dipilih. Tidak ada supplier contoh dengan ID buatan di perangkat.
- Daftar pembelian berasal dari server, dengan filter tanggal faktur dan pengambilan data bertahap 500 baris. Cache lama `dp_purchases`/`dp_suppliers` hanya tersedia untuk diunduh pemilik dan dicocokkan; tidak digabung otomatis atau dihapus.
- Migrasi menghubungkan item lama ke batch hanya jika atribut dan pergerakan penerimaannya tidak ambigu. Migrasi tidak mengoreksi stok, kedaluwarsa, harga, atau margin historis. Anomali data lama tetap perlu dicocokkan dengan bukti penerimaan/penjualan dan stok fisik.

## Deployment Cloudflare yang digunakan

Proyek produksi menggunakan **Workers Static Assets**, bukan Pages. Workers Builds mengambil source dari `main` dan membangun output Vite di `dist`. Pertahankan konfigurasi proyek Cloudflare yang sudah terhubung; tidak perlu membuat proyek atau domain kedua.

| Pengaturan build | Nilai |
| --- | --- |
| Production branch | `main` |
| Node.js | `24` melalui `.node-version` |
| Install | `npm ci` |
| Build | `npm run build` |
| Static assets | `dist` |

`public/_headers` ikut disalin ke `dist/_headers` untuk CSP, pembatasan iframe, dan header keamanan lainnya. Grafik dimuat saat masuk dashboard/laporan dan ikon hanya mencakup yang digunakan aplikasi. Uji lokal dengan Vite tidak memverifikasi penerapan header Cloudflare; periksa respons URL produksi setelah build terbit.

Untuk perubahan skema, terapkan migrasi database sebelum frontend yang memakainya dipublikasikan. Versi tab lama dapat menolak penyimpanan pembelian setelah migrasi; muat ulang tab. Jangan mengembalikan frontend pembelian lama tanpa rencana kompatibilitas database.

Di Supabase **Authentication > URL Configuration**, gunakan URL produksi yang benar sebagai Site URL dan Redirect URL. Jangan menaruh service-role key atau secret database di Cloudflare frontend.

Referensi: [Cloudflare static asset headers](https://developers.cloudflare.com/workers/static-assets/headers/).

## Pengujian

```sh
npm test
npm run build
```

`npm test` menjalankan tes DOM/store serta PostgreSQL lokal terisolasi melalui PGlite, tanpa kredensial atau koneksi database produksi. Semua migrasi dan fixture SQL `tests/database.sql` serta `tests/import-and-activation.sql` dijalankan di database pengujian tersebut. Jangan menjalankan fixture tulis pada produksi. GitHub Actions menjalankan tes dan build pada push/PR.

Cakupan meliputi rollback pembelian setelah kegagalan parsial, pengulangan permintaan, versi edit, batch asal pembatalan, HPP, hak akses, FEFO, aktivasi/impor, backfill historis, filter/paginasi, pergantian akun, injeksi HTML/CSV, dialog, serta tanggal WIB. PGlite menjalankan satu koneksi; pengujian replay bukan uji konkurensi banyak koneksi atau uji beban. Uji DOM juga bukan pengganti uji dua kasir dan printer asli.

Migrasi di `supabase/migrations` sesuai versi yang sudah diterapkan pada proyek Supabase ini; jangan menjalankan ulang file migrasi awal secara manual pada database yang sudah berisi skema tersebut.

Riwayat migrasi pembelian yang sebelumnya tidak tercatat sudah direkonsiliasi setelah kolom, constraint, dan kebijakan produksi dibandingkan dengan migrasi asli. Nama file `username_login` mengikuti timestamp produksi. Koreksi histori tersebut tidak menjalankan ulang pembuatan tabel atau mengubah data bisnis.

Catatan pemeriksaan Supabase: `private.purchase_commands` sengaja tidak memiliki kebijakan akses klien dan tidak mendapat grant klien; hanya fungsi bisnis terkontrol yang menulisnya ([penjelasan advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Pengaturan [pemeriksaan password bocor](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) masih mengikuti proyek sebelumnya dan belum diaktifkan. Indeks baru yang belum tercatat digunakan tetap dipertahankan karena mendukung foreign key dan filter, dengan volume data yang masih kecil.

## Operasional paket gratis

Pantau ukuran database dan transfer data di Supabase. Tidak ada backup harian terkelola yang diaktifkan oleh integrasi ini; jadwalkan ekspor database dan uji pemulihannya secara terpisah sebelum mengandalkan aplikasi untuk data produksi. Aplikasi membutuhkan internet untuk membaca dan menyimpan data bersama.
