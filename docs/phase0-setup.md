# HUMORA — Panduan Setup Phase 0

Panduan ini untuk pemilik proyek. Ikuti urutannya; setiap langkah menyebut nilai apa yang dihasilkan dan ke mana nilai itu harus ditaruh.

> **Aturan utama:** Gemini API key adalah **rahasia**. Tempatnya hanya di Script Properties Apps Script. Jangan menaruhnya di kode, GitHub, chat, atau email.

## Lima "alamat" yang sering tertukar

| Nama | Bentuknya | Rahasia? | Ditaruh di |
| --- | --- | --- | --- |
| **GitHub Pages URL** | `https://USERNAME.github.io/humora/` | Tidak | Dibuka di browser. *Origin*-nya (`https://USERNAME.github.io`, tanpa `/humora`) didaftarkan di OAuth Client |
| **OAuth Client ID** | `1234…-abc….apps.googleusercontent.com` | Tidak (publik) | `web/js/config.js` **dan** Script Property `GOOGLE_OAUTH_CLIENT_ID` |
| **Apps Script Web App URL** | `https://script.google.com/macros/s/…/exec` | Tidak, tapi jangan disebar | `web/js/config.js` (`API_URL`) |
| **Spreadsheet ID** | Teks panjang di URL Sheet, di antara `/d/` dan `/edit` | Tidak, tapi jangan disebar | Script Property `SPREADSHEET_ID` |
| **Gemini API key** | Diawali `AIza…` | **YA, RAHASIA** | Hanya Script Property `GEMINI_API_KEY` |

Ganti `USERNAME` dengan username GitHub Anda yang sebenarnya di semua langkah.

---

## Langkah 1 · Akun Google khusus HUMORA

1. Disarankan membuat akun Google baru khusus HUMORA (bukan akun pribadi), karena akun ini akan memegang semua data pengguna.
2. Aktifkan **Verifikasi 2 Langkah** di akun itu.
3. Semua langkah Google di bawah dilakukan dengan akun ini.

## Langkah 2 · Repository GitHub + GitHub Pages

1. Di GitHub, buat repository baru bernama `humora`, **Public**. GitHub Pages gratis hanya untuk repo publik di akun gratis. Ini aman karena tidak ada rahasia di repo.
2. Unggah isi folder proyek ini (`web/`, `gas/`, `docs/`, `.github/`, `.gitignore`) dengan **Add file → Upload files**.
   - Folder `.github` kadang tidak ikut terunggah karena diawali titik. Jika begitu: **Add file → Create new file**, ketik nama `.github/workflows/pages.yml`, lalu tempel isi file `pages.yml`.
3. Buka **Settings → Pages → Build and deployment → Source**, pilih **GitHub Actions**.
4. Buka tab **Actions** dan tunggu proses "Deploy web to GitHub Pages" selesai (centang hijau).
5. Alamat halaman Anda: `https://USERNAME.github.io/humora/`. Catat juga **origin**-nya: `https://USERNAME.github.io`.

## Langkah 3 · Spreadsheet database

1. Buka sheets.google.com → buat spreadsheet kosong, beri nama `HUMORA DB`.
2. Salin **Spreadsheet ID** dari URL: `https://docs.google.com/spreadsheets/d/`**`INI_ID_NYA`**`/edit`.
3. **Jangan bagikan** spreadsheet ini ke siapa pun.

## Langkah 4 · Google Cloud project + OAuth Client ID

1. Buka console.cloud.google.com → pilih/buat project baru, misalnya `humora`.
2. Buka **Google Auth Platform** (menu "APIs & Services → OAuth consent screen" akan mengarah ke sana) → **Get started**:
   - App name: `HUMORA`
   - User support email: email akun HUMORA
   - Audience: **External**
   - Contact email: email akun HUMORA
3. **Audience**: selama status **Testing**, tambahkan email Anda (dan penguji lain) di **Test users**. Hanya akun ini yang bisa login selama Phase 0.
4. **Data Access**: tidak perlu menambah scope. Sign in with Google hanya memakai `openid`, `email`, `profile`.
5. **Clients → Create client**:
   - Application type: **Web application**
   - Name: `HUMORA Web`
   - **Authorized JavaScript origins**: `https://USERNAME.github.io` (tanpa `/humora`, tanpa garis miring di akhir)
   - Opsional, untuk uji di komputer sendiri: `http://localhost` dan `http://localhost:8000`
   - Authorized redirect URIs: **kosongkan** (kita memakai mode popup)
6. Salin **Client ID**. Ini bukan rahasia.
7. **Branding**: link kebijakan privasi wajib diisi sebelum aplikasi dipublikasikan ke umum. Untuk Phase 0 (mode Testing) boleh menyusul.

Tidak ada API yang perlu di-*enable* untuk Sign in with Google.

## Langkah 5 · Gemini API key dan nama model

1. Buka aistudio.google.com dengan akun HUMORA → **Get API key** → buat key di project `humora`.
2. Jika Anda **pernah** menempelkan sebuah API key di chat, kode, atau tempat lain, hapus key itu dan buat yang baru.
3. Di AI Studio, lihat daftar model dan **rate limit** proyek Anda. Pilih:
   - satu model **Flash** untuk `GEMINI_MODEL`
   - satu model **Flash-Lite** untuk `GEMINI_FALLBACK_MODEL`

   Salin **kode model** persis seperti yang tertulis di AI Studio (huruf kecil, dengan tanda hubung). Jangan menebak nama model.

## Langkah 6 · Proyek Apps Script

1. Buka script.google.com → **New project** → ganti nama menjadi `HUMORA API`.
2. **Project Settings** (ikon roda gigi) → centang **Show "appsscript.json" manifest file in editor**.
3. Kembali ke **Editor**. Buat file sesuai folder `gas/` (tombol **+** → Script). Nama di editor tanpa `.gs`:
   `Api`, `Config`, `Auth`, `Sessions`, `Db`, `Setup`, `GeminiProvider`. Tempel isi masing-masing file. Hapus isi bawaan `Code.gs` (atau ganti namanya menjadi `Api`).
4. Buka `appsscript.json` di editor, ganti seluruh isinya dengan file `gas/appsscript.json`.
5. **Project Settings → Script Properties → Add script property**, isi lima property ini:

| Property | Isi |
| --- | --- |
| `GEMINI_API_KEY` | API key dari Langkah 5 (rahasia) |
| `GEMINI_MODEL` | Kode model Flash dari AI Studio |
| `GEMINI_FALLBACK_MODEL` | Kode model Flash-Lite dari AI Studio |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID dari Langkah 4 |
| `SPREADSHEET_ID` | ID dari Langkah 3 |

## Langkah 7 · Jalankan fungsi setup dari editor

Di editor, pilih nama fungsi di dropdown di atas, lalu klik **Run**. Lihat hasilnya di **Execution log**.

1. `setup`. Pertama kali, Google meminta izin. Pilih akun HUMORA → **Advanced → Go to HUMORA API (unsafe)** → **Allow**. Peringatan ini muncul karena skrip buatan sendiri belum diverifikasi Google; aman karena skripnya milik Anda. Hasil: sheet `Users` dan `Sessions` muncul di spreadsheet.
2. `checkConfig`. Kelima property harus tertulis **terisi**. Nilainya tidak ditampilkan.
3. `runOfflineChecks`. Semua baris harus **LULUS**.
4. `testGeminiFromEditor`. Execution log harus menampilkan kalimat bahasa Indonesia yang ditulis ulang.

## Langkah 8 · Deploy sebagai Web App

1. **Deploy → New deployment** → ikon roda gigi → **Web app**.
2. Description: `Phase 0`.
3. **Execute as: Me** (akun HUMORA). Artinya skrip berjalan dengan izin pemilik, sehingga hanya skrip yang bisa membuka spreadsheet; pengguna tidak pernah mendapat akses langsung.
4. **Who has access: Anyone**. Wajib "Anyone", bukan "Anyone with Google account". Kalau tidak, browser mendapat halaman login Google, bukan JSON. Keamanan dijaga oleh pemeriksaan token di dalam kode.
5. **Deploy** → salin **Web app URL** (berakhiran `/exec`).
6. Setiap kali kode `.gs` diubah: **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. URL-nya tetap sama.

## Langkah 9 · Hubungkan frontend

1. Di GitHub, buka `web/js/config.js` → ✏️ Edit.
2. Ganti `GANTI_DENGAN_URL_WEB_APP_APPS_SCRIPT` dengan Web App URL (Langkah 8).
3. Ganti `GANTI_DENGAN_OAUTH_CLIENT_ID` dengan Client ID (Langkah 4).
4. **Commit changes**, tunggu Actions selesai (sekitar 1 menit), lalu buka `https://USERNAME.github.io/humora/`.
5. Kotak "0 · Konfigurasi" harus berwarna hijau dan menampilkan origin halaman.

## Langkah 10 · Uji

Ikuti `docs/phase0-test-report.md` dari atas ke bawah. Isi kolom **Status** dan **Bukti** untuk setiap baris. Jika ada yang gagal, kirimkan kode error dan potongan log teknis (token sudah otomatis disembunyikan).
