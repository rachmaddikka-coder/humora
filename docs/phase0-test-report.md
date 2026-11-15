# HUMORA — Laporan Uji Phase 0

**Status gate Phase 0: BELUM LULUS (menunggu setup dan uji oleh pemilik).**

Label status: **PASSED** (ada bukti nyata) · **FAILED** · **NOT TESTED** (belum dicoba) · **BLOCKED** (tidak bisa dicoba sebelum langkah lain selesai).

Isi kolom *Bukti* dengan sesuatu yang bisa diperiksa: potongan log teknis di halaman uji (token otomatis disembunyikan), isi baris di spreadsheet (tanpa token), atau Execution log Apps Script.

---

## A. Yang sudah diperiksa oleh Claude (bukan uji penerimaan)

Pemeriksaan ini dijalankan di lingkungan kerja Claude, **tanpa** akun Google, spreadsheet, atau Gemini sungguhan. Hasilnya membuktikan logika kode, bukan integrasinya.

| Pemeriksaan | Hasil | Cara |
| --- | --- | --- |
| Sintaks semua file `.gs` dan `.js` | Lulus | `node --check` |
| `appsscript.json` dan `pages.yml` valid | Lulus | Parser JSON/YAML |
| Simulasi backend dengan layanan Apps Script tiruan | **49/49 lulus** | `tools/offline-check.js` (memakai tiruan Sheets, Cache, Lock, UrlFetch) |

Yang dicakup simulasi: whitelist aksi, JSON rusak, body terlalu besar, token Google palsu/aud salah/iss salah/kedaluwarsa/email belum terverifikasi, akun baru vs akun lama, tidak ada baris ganda, lock sibuk, hash sesi (bukan token mentah) yang disimpan, `google_sub` tersimpan utuh sebagai teks, payload `userId` palsu diabaikan, sesi hilang/acak/kedaluwarsa/setelah logout ditolak, Gemini sukses, retry 429, fallback model saat 404, API key salah/hilang, API key tidak bocor ke respons atau log.

**Belum terbukti oleh simulasi:** perilaku asli Google (tokeninfo, GIS, Sheets yang mengubah format, redirect CORS Apps Script, kuota Gemini), dan konkurensi sungguhan (simulasi berjalan satu-utas; lock hanya dicek dengan meniru lock yang sedang dipegang).

---

## B. Uji penerimaan (dijalankan pemilik)

### Autentikasi

| # | Uji | Cara | Harapan | Status | Bukti |
| --- | --- | --- | --- | --- | --- |
| A1 | Google Sign In asli berfungsi | Klik tombol Google di halaman uji | Popup Google muncul, lalu "Sudah masuk sebagai …" | BLOCKED (setup) | |
| A2 | Akun baru tercatat di Users | Login pertama kali | "Akun baru? Ya"; 1 baris baru di sheet Users | BLOCKED (setup) | |
| A3 | Akun lama dikenali | Logout, login lagi | "Akun baru? Tidak"; `user_id` sama; tetap 1 baris | BLOCKED (setup) | |
| A4 | ID token valid diterima | Sama dengan A1 | `auth.login → BERHASIL` | BLOCKED (setup) | |
| A5 | ID token palsu ditolak | Tombol "Token Google palsu" | `INVALID_ID_TOKEN` | BLOCKED (setup) | |
| A6 | Audience salah ditolak | Ubah Script Property `GOOGLE_OAUTH_CLIENT_ID` menjadi `salah.apps.googleusercontent.com`, login, lalu **kembalikan nilainya** | `INVALID_AUDIENCE` | BLOCKED (setup) | |
| A7 | Token kedaluwarsa ditolak | Login, tunggu lebih dari 1 jam tanpa menutup tab, klik "Kirim ulang token Google terakhir" | `INVALID_ID_TOKEN` atau `TOKEN_EXPIRED` | BLOCKED (setup) | |
| A8 | Token sesi dibuat | Setelah A1, lihat log | `sessionToken: [disembunyikan]`, `expiresAt` ±12 jam lagi | BLOCKED (setup) | |
| A9 | Hash sesi disimpan | Lihat sheet Sessions | `token_hash` 64 karakter heks; tidak sama dengan token di sessionStorage (DevTools → Application) | BLOCKED (setup) | |
| A10 | Request kedua dengan sesi berhasil | Tombol "Cek sesi" | `auth.me → BERHASIL` | BLOCKED (setup) | |
| A11 | Tanpa sesi ditolak | Tombol "auth.me tanpa sesi" | `UNAUTHENTICATED` | BLOCKED (setup) | |
| A12 | Sesi kedaluwarsa ditolak | Jalankan `expireAllSessionsForTest` di editor, lalu "Cek sesi" | `SESSION_EXPIRED` | BLOCKED (setup) | |
| A13 | Logout membatalkan sesi | Logout, lalu "auth.me dengan sesi sebelum logout" | `UNAUTHENTICATED`; baris sesi terhapus | BLOCKED (setup) | |
| A14 | userId palsu diabaikan | Tombol "auth.me dengan userId palsu" | Mengembalikan user Anda sendiri, bukan `usr_palsu` | BLOCKED (setup) | |

### Gemini

| # | Uji | Cara | Harapan | Status | Bukti |
| --- | --- | --- | --- | --- | --- |
| G1 | API key dibaca dari Script Properties | Jalankan `checkConfig` | `GEMINI_API_KEY: terisi` | BLOCKED (setup) | |
| G2 | API key tidak terlihat di frontend | Cari `AIza` di halaman (Ctrl+U), di tab Network, dan di repo GitHub | Tidak ditemukan di mana pun | BLOCKED (setup) | |
| G3 | Request Gemini berhasil | Jalankan `testGeminiFromEditor` | Kalimat hasil muncul di Execution log | BLOCKED (setup) | |
| G4 | Paragraf Indonesia ditulis ulang | Tombol "Tulis ulang" dengan teks contoh | Bahasa Indonesia, makna sama, tidak ada informasi baru | BLOCKED (setup) | |
| G5 | Hasil sampai di frontend | Sama dengan G4 | Teks tampil di kotak Hasil | BLOCKED (setup) | |
| G6 | Konfigurasi salah ditangani aman | Ubah `GEMINI_API_KEY` menjadi `salah`, klik Tulis ulang, lalu **kembalikan** | `AI_CONFIG_ERROR`; pesan tidak memuat isi key | BLOCKED (setup) | |
| G7 | Rate limit ditangani | Kuota asli sulit dipicu tanpa membuang kuota. Logika retry 429 sudah lulus simulasi; uji asli hanya jika 429 muncul alami | `AI_RATE_LIMITED` dengan pesan ramah | NOT TESTED (hanya simulasi) | |
| G8 | Model tidak tersedia ditangani | Ubah `GEMINI_MODEL` menjadi `model-tidak-ada`, Tulis ulang (harus berhasil via model cadangan); lalu ubah juga cadangannya, coba lagi; **kembalikan keduanya** | Pertama: sukses dengan model cadangan. Kedua: `AI_MODEL_UNAVAILABLE` | BLOCKED (setup) | |

### Database

| # | Uji | Cara | Harapan | Status | Bukti |
| --- | --- | --- | --- | --- | --- |
| D1 | Setup membuat sheet | Jalankan `setup` | Sheet Users dan Sessions ada | BLOCKED (setup) | |
| D2 | Header benar | Lihat baris 1 | Persis seperti di Blueprint (8 dan 5 kolom) | BLOCKED (setup) | |
| D3 | Pembuatan user berfungsi | A2 | Baris lengkap; `google_sub` utuh (bukan `1.12E+20`) | BLOCKED (setup) | |
| D4 | Pembuatan sesi berfungsi | A8–A9 | Baris sesi lengkap | BLOCKED (setup) | |
| D5 | Akun ganda dicegah | Tombol "Login ganda bersamaan" | Kedua `userId` sama; sheet Users tetap 1 baris untuk akun Anda | BLOCKED (setup) | |
| D6 | Penulisan bersamaan dilindungi | D5 + lihat Execution log | Tidak ada baris ganda; jika lock penuh, `BUSY` (bukan data rusak) | BLOCKED (setup) | |

### Jaringan

| # | Uji | Cara | Harapan | Status | Bukti |
| --- | --- | --- | --- | --- | --- |
| N1 | Origin GitHub Pages sampai ke Apps Script | Uji apa pun dari `https://USERNAME.github.io/humora/` | Ada balasan JSON | BLOCKED (setup) | |
| N2 | Browser bisa membaca balasan | Lihat log | Bukan `NETWORK_ERROR` atau `NON_JSON_RESPONSE` | BLOCKED (setup) | |
| N3 | Redirect tidak merusak aplikasi | Lihat `_meta` di log | `redirected: true`, `finalHost: script.googleusercontent.com`, data terbaca | BLOCKED (setup) | |
| N4 | Tidak memakai no-cors | Periksa `web/js/api.js` | Tidak ada `mode: 'no-cors'` | **PASSED** (pemeriksaan kode oleh Claude) | `api.js` hanya memakai mode default (`cors`) |

**Jika N1–N3 gagal:** berhenti dan kirim log (`_meta` dan pesan di Console browser). Arsitektur tidak akan diubah diam-diam; alternatifnya akan dijelaskan dulu.

---

## C. Risiko terbuka dari implementasi

- **Keacakan token sesi.** Token = dua `Utilities.getUuid()` (244 bit acak). Google tidak mendokumentasikan bahwa sumber acaknya aman secara kriptografis. Risiko dinilai rendah untuk Phase 0, tetapi belum bisa dinyatakan "terverifikasi aman".
- **Endpoint `tokeninfo`.** Menambah satu panggilan jaringan saat login. Google memposisikannya untuk debugging/volume rendah; login hanya terjadi sekali per sesi, jadi diterima untuk sekarang.
- **Cache sesi.** Jika baris sesi dihapus manual di spreadsheet, sesi tetap berlaku hingga 6 jam dari cache. Selalu pakai fungsi (`logout`, `expireAllSessionsForTest`) yang juga membersihkan cache.
