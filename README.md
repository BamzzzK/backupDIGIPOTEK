# Apotek Mulia Farma

Aplikasi kasir Vite dengan database bersama di Supabase PostgreSQL. Paket organisasi Supabase saat integrasi: **Free**. Hosting Cloudflare Pages belum dipublikasikan oleh perubahan ini.

## Menjalankan

Gunakan Node.js 24 untuk menjalankan seluruh pengujian.

```sh
npm ci
npm run dev
```

Konfigurasi publik proyek sudah disertakan di `src/supabase.js`. Untuk menggunakan proyek lain, salin `.env.example` menjadi `.env.local` dan ganti URL serta **publishable key**. Jangan pernah memasukkan service-role key, secret key, atau password database ke variabel `VITE_*`.

## Aktivasi pemilik

1. Buka aplikasi, pilih **Daftar akun pegawai**, lalu isi nama, username, email pemulihan, dan password minimal 8 karakter.
2. Konfirmasikan email satu kali apabila Supabase memintanya, lalu masuk menggunakan username dan password. Email tidak diperlukan untuk login berikutnya. Bila tautan konfirmasi mengarah ke alamat localhost yang tidak aktif, buka aplikasi kembali dan coba masuk setelah konfirmasi.
3. Di halaman menunggu persetujuan, buka **Aktivasi pemilik pertama** dan masukkan kode sekali pakai yang diberikan terpisah oleh pengelola integrasi. Kode tidak disimpan di GitHub; database hanya menyimpan hash SHA-256.
4. Pemilik dapat mengaktifkan akun pegawai lain sebagai kasir di **Pegawai & Data**. Akun pendaftar tidak bisa membaca data bisnis sebelum disetujui. Pendaftaran Auth tetap tersedia untuk alur persetujuan ini, bukan akses publik ke data.

Tidak ada akun atau password demo untuk database produksi. Jika pengiriman email konfirmasi terhalang batas layanan bawaan Supabase, pengelola proyek dapat membuat akun terkonfirmasi melalui Supabase Dashboard > Authentication > Users, lalu pemilik mengaktifkan akun tersebut. Jangan mengubah peran melalui metadata pengguna yang dapat diedit pengguna.

## Data lama

Database produksi dimulai kosong; katalog dan transaksi acak dari `src/data/seed.js` tidak otomatis dimasukkan.

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

- Pemilik: katalog, penerimaan/pengurangan stok, laporan, persetujuan kasir, impor awal.
- Kasir: membaca katalog/batch dan membuat penjualan; hanya dapat membaca penjualannya sendiri melalui API.
- Stok dihitung dari jumlah batch. Pengubahan stok langsung lewat form edit produk tidak diizinkan.
- `checkout` menghitung harga, diskon, HPP dan kembalian di database; harga dari browser hanya digunakan untuk mendeteksi harga yang sudah berubah.
- Penguncian produk dengan urutan ID tetap dan transaksi PostgreSQL menjaga stok ketika kasir bekerja bersamaan.
- Pengurangan batch mengikuti FEFO; batch dengan tanggal kedaluwarsa sebelum tanggal WIB hari ini tidak bisa dijual. Batch tanpa tanggal diambil terakhir. Tanggal yang sama dengan hari ini masih diperbolehkan.
- HPP penjualan baru mengikuti harga biaya yang tersimpan pada batch. Penerimaan batch menggunakan harga beli produk saat penerimaan; ubah harga beli terlebih dahulu bila berubah.
- ID permintaan membuat percobaan ulang pembayaran tidak menggandakan penjualan. Tab menyimpan transaksi yang belum terkonfirmasi untuk dicoba ulang dengan ID sama. Jangan menghapus penyimpanan tab saat status pembayaran belum jelas.
- QRIS dan transfer dicatat berdasarkan konfirmasi kasir; belum ada integrasi verifikasi pembayaran dari penyedia pembayaran.
- Tampilan katalog POS dimuat ulang setiap 30 detik saat tab aktif; checkout selalu memeriksa stok di server. Laporan diambil per rentang tanggal, dipaginasi dalam pengambilan data, maksimal 93 hari per permintaan.
- Hari laporan menggunakan zona waktu Asia/Jakarta.

## Deploy gratis ke Cloudflare Pages

Di Cloudflare Dashboard, buka **Workers & Pages > Create application > Pages > Import an existing Git repository**, lalu hubungkan GitHub dan pilih `BamzzzK/apotekmuliafarma`.

Gunakan pengaturan berikut:

| Pengaturan | Nilai |
| --- | --- |
| Project name | `apotekmuliafarma` jika masih tersedia |
| Production branch | `main` |
| Framework preset | `Vite` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | Kosongkan (root repository) |
| Node.js | `24`, otomatis melalui `.node-version` |

Klik **Save and Deploy**. Cloudflare akan menampilkan URL `*.pages.dev` setelah build dan publikasi berhasil. Integrasi Git akan membangun ulang aplikasi saat perubahan masuk ke `main`. Paket Free cukup untuk menyajikan frontend ini; Functions Cloudflare tidak diperlukan. Konfigurasi Supabase publik sudah disertakan sehingga tidak perlu menambahkan secret database pada Cloudflare.

Setelah memperoleh URL website, buka proyek Supabase `zdrxokjfukumkledmrzh`, lalu **Authentication > URL Configuration**. Isi **Site URL** dengan URL produksi HTTPS yang sebenarnya dan tambahkan URL tersebut ke **Redirect URLs**. Jangan memakai nama domain perkiraan sebelum Cloudflare mengonfirmasi URL-nya. Pilih hostname yang tetap agar sesi dan jalur impor browser tidak membingungkan pengguna.

Terakhir, buka URL produksi, daftar/masuk dan ikuti aktivasi pemilik di atas. Periksa bahwa tautan konfirmasi email kembali ke URL produksi. Proses build lokal yang berhasil belum berarti website sudah dipublikasikan.

Referensi: [panduan Vite Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/) dan [pemilihan versi Node.js](https://developers.cloudflare.com/pages/configuration/build-image/).

## Pengujian

```sh
npm test
npm run build
```

`tests/database.sql` serta `tests/import-and-activation.sql` berisi pengujian dengan fixture yang di-rollback. Jalankan pada database pengujian kosong dengan skema yang sama dan hak administratif, bukan ketika aplikasi sudah dipakai operasional. Pengujian aktivasi/impor bergantung pada database produk dan penjualan kosong.

Uji yang telah dijalankan mencakup FEFO, hitungan margin/kembalian, penolakan stok kurang, idempotensi, larangan tulis langsung, penolakan kasir/pending/anonim, kode aktivasi sekali pakai, impor historis, dan tanggal WIB. Uji DOM memeriksa klik ganda, retry jaringan, penolakan pembayaran, serta penyimpanan produk. Uji DOM bukan pengganti uji operasional dua kasir dengan printer asli.

Migrasi di `supabase/migrations` sesuai versi yang sudah diterapkan pada proyek Supabase ini; jangan menjalankan ulang file migrasi awal secara manual pada database yang sudah berisi skema tersebut.

## Operasional paket gratis

Pantau ukuran database dan transfer data di Supabase. Tidak ada backup harian terkelola yang diaktifkan oleh integrasi ini; jadwalkan ekspor database dan uji pemulihannya secara terpisah sebelum mengandalkan aplikasi untuk data produksi. Aplikasi membutuhkan internet untuk membaca dan menyimpan data bersama.
