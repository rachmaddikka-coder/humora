/**
 * HUMORA — Config.gs
 * Konfigurasi, batas (limits), dan helper umum.
 *
 * Semua nilai rahasia (API key, dsb.) disimpan di Script Properties:
 * Apps Script editor → Project Settings (ikon roda gigi) → Script Properties.
 * JANGAN pernah menulis nilai rahasia di file ini.
 */

/** Nama Script Properties yang wajib diisi pemilik proyek. */
var CONFIG_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_FALLBACK_MODEL',
  'GOOGLE_OAUTH_CLIENT_ID',
  'SPREADSHEET_ID'
];

/** Batas-batas Phase 0. Ubah di sini, bukan di dalam fungsi. */
var LIMITS = {
  MAX_BODY_CHARS: 64 * 1024,     // ukuran maksimum body request
  TEST_TEXT_MIN: 20,             // panjang teks minimum untuk ai.testRewrite
  TEST_TEXT_MAX: 2000,           // panjang teks maksimum untuk ai.testRewrite (Phase 0)
  SESSION_HOURS: 12,             // umur absolut sesi
  LOCK_WAIT_MS: 10000,           // waktu tunggu maksimum untuk LockService
  AI_COOLDOWN_SEC: 5,            // jeda minimum antar-permintaan AI per pengguna
  CACHE_MAX_SEC: 21600           // batas CacheService (6 jam)
};

/**
 * Membaca satu Script Property.
 * @param {string} key
 * @param {boolean} required  true → lempar CONFIG_ERROR jika kosong
 * @return {string}
 */
function getConfig_(key, required) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  value = value ? String(value).trim() : '';
  if (!value && required) {
    // Nama property boleh disebut di log pemilik, tapi tidak ke pengguna.
    console.error('CONFIG_ERROR: Script Property belum diisi: ' + key);
    throw appError_('CONFIG_ERROR', 'Server belum dikonfigurasi dengan benar. Hubungi admin.');
  }
  return value;
}

/**
 * Membuat error "aman" yang boleh dikirim ke frontend.
 * Error lain (bukan appError_) akan diganti menjadi INTERNAL_ERROR.
 */
function appError_(code, message) {
  var err = new Error(message || code);
  err.code = code;
  err.isAppError = true;
  return err;
}

/** Waktu sekarang dalam ISO 8601 UTC, contoh: 2026-11-15T02:17:00.000Z */
function isoNow_() {
  return new Date().toISOString();
}

/** ID unik berprefiks, contoh: usr_3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90 */
function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid();
}

/**
 * Menjalankan fn di dalam Script Lock agar penulisan tidak bertabrakan.
 * Semua penulisan penting (buat user, buat/hapus sesi) wajib lewat sini.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LIMITS.LOCK_WAIT_MS)) {
    throw appError_('BUSY', 'Server sedang sibuk. Coba lagi beberapa detik lagi.');
  }
  try {
    return fn();
  } finally {
    SpreadsheetApp.flush(); // pastikan tulisan tersimpan sebelum lock dilepas
    lock.releaseLock();
  }
}
