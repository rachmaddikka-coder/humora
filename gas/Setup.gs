/**
 * HUMORA — Setup.gs
 * Fungsi yang dijalankan PEMILIK dari editor Apps Script (menu ▶ Run).
 * Fungsi-fungsi ini tidak bisa dipanggil lewat API (tidak ada di whitelist).
 */

var SCHEMA_ = {
  Users: ['user_id', 'google_sub', 'email', 'display_name', 'picture_url', 'status', 'created_at', 'last_login_at'],
  Sessions: ['session_id', 'token_hash', 'user_id', 'created_at', 'expires_at']
};

/** 1) Membuat sheet + header Phase 0. Aman dijalankan berulang kali. */
function setup() {
  var ss = db_();
  Object.keys(SCHEMA_).forEach(function (name) {
    var headers = SCHEMA_[name];
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var map = headerMap_(sh);

    if (Object.keys(map).length === 0) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
      console.log('Sheet "' + name + '" dibuat dengan ' + headers.length + ' kolom.');
    } else {
      var missing = headers.filter(function (h) { return !map[h]; });
      missing.forEach(function (h) {
        var col = sh.getLastColumn() + 1;
        sh.getRange(1, col).setValue(h).setFontWeight('bold');
        sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat('@');
      });
      console.log('Sheet "' + name + '" sudah ada. Kolom ditambahkan: ' +
        (missing.length ? missing.join(', ') : 'tidak ada'));
    }
  });
  console.log('Setup selesai. Pastikan spreadsheet TIDAK dibagikan ke siapa pun.');
}

/** 2) Mengecek Script Properties tanpa menampilkan nilainya. */
function checkConfig() {
  var props = PropertiesService.getScriptProperties();
  CONFIG_KEYS.forEach(function (k) {
    console.log(k + ': ' + (props.getProperty(k) ? 'terisi' : 'BELUM DIISI'));
  });
}

/** 3) Uji Gemini langsung dari editor (teks sintetis). */
function testGeminiFromEditor() {
  var r = aiRewrite_(PHASE0_SAMPLE_TEXT_);
  console.log('Model: ' + r.model + ' | ' + r.latencyMs + ' ms');
  console.log('Asli : ' + PHASE0_SAMPLE_TEXT_);
  console.log('Hasil: ' + r.text);
}

/** 4) Pemeriksaan offline (tanpa jaringan, tanpa spreadsheet). */
function runOfflineChecks() {
  var results = [];
  function check(name, cond) { results.push((cond ? 'LULUS ' : 'GAGAL ') + name); }

  check('SHA-256("abc") sesuai vektor uji resmi',
    sha256Hex_('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');

  var t1 = newSessionToken_(), t2 = newSessionToken_();
  check('Token sesi 64 heks', isValidTokenFormat_(t1));
  check('Dua token sesi berbeda', t1 !== t2);
  check('Format token salah ditolak', !isValidTokenFormat_('abc') && !isValidTokenFormat_(null));

  check('429 → AI_RATE_LIMITED', mapGeminiHttpError_(429, 'RESOURCE_EXHAUSTED') === 'AI_RATE_LIMITED');
  check('404 → AI_MODEL_UNAVAILABLE', mapGeminiHttpError_(404, 'NOT_FOUND') === 'AI_MODEL_UNAVAILABLE');
  check('503 → AI_UNAVAILABLE', mapGeminiHttpError_(503, 'UNAVAILABLE') === 'AI_UNAVAILABLE');
  check('403 → AI_CONFIG_ERROR', mapGeminiHttpError_(403, 'PERMISSION_DENIED') === 'AI_CONFIG_ERROR');
  check('400 API_KEY_INVALID → AI_CONFIG_ERROR',
    mapGeminiHttpError_(400, 'INVALID_ARGUMENT', 'API_KEY_INVALID') === 'AI_CONFIG_ERROR');
  check('400 lain → AI_BAD_REQUEST', mapGeminiHttpError_(400, 'INVALID_ARGUMENT', '') === 'AI_BAD_REQUEST');

  check('Teks diambil dari respons normal',
    extractGeminiText_({ candidates: [{ content: { parts: [{ text: ' Halo ' }] }, finishReason: 'STOP' }] }).text === 'Halo');
  check('Prompt diblokir dikenali',
    extractGeminiText_({ promptFeedback: { blockReason: 'SAFETY' } }).code === 'AI_BLOCKED');
  check('Bagian "thought" diabaikan',
    extractGeminiText_({ candidates: [{ content: { parts: [{ text: 'x', thought: true }, { text: 'y' }] } }] }).text === 'y');

  check('Nama model "models/xyz-1.0" dibersihkan', cleanModelName_('models/xyz-1.0') === 'xyz-1.0');
  check('Nama model berbahaya ditolak', cleanModelName_('a/../b?key=1') === '');

  console.log(results.join('\n'));
}

/**
 * 5) UJI SESI KEDALUWARSA: membuat SEMUA sesi menjadi kedaluwarsa.
 * Setelah dijalankan, tombol "Cek sesi" di halaman uji harus mengembalikan SESSION_EXPIRED.
 */
function expireAllSessionsForTest() {
  withLock_(function () {
    var sh = sheet_('Sessions');
    var map = headerMap_(sh);
    var last = sh.getLastRow();
    if (last < 2) { console.log('Tidak ada sesi.'); return; }
    var past = new Date(Date.now() - 60 * 1000).toISOString();
    var cache = CacheService.getScriptCache();
    var hashes = sh.getRange(2, map.token_hash, last - 1, 1).getValues();
    hashes.forEach(function (row) { cache.remove(SESSION_CACHE_PREFIX_ + String(row[0])); });
    var expCol = sh.getRange(2, map.expires_at, last - 1, 1);
    expCol.setNumberFormat('@');
    expCol.setValues(hashes.map(function () { return [past]; }));
    console.log((last - 1) + ' sesi dibuat kedaluwarsa.');
  });
}

/** 6) Menghapus sesi yang sudah kedaluwarsa (nanti dijadikan trigger harian). */
function cleanupExpiredSessions() {
  withLock_(function () {
    var sh = sheet_('Sessions');
    var map = headerMap_(sh);
    var last = sh.getLastRow();
    if (last < 2) return;
    var values = sh.getRange(2, map.expires_at, last - 1, 1).getValues();
    var removed = 0;
    for (var i = values.length - 1; i >= 0; i--) {   // dari bawah agar nomor baris tidak bergeser
      if (Date.parse(String(values[i][0])) <= Date.now()) {
        sh.deleteRow(i + 2);
        removed++;
      }
    }
    console.log(removed + ' sesi kedaluwarsa dihapus.');
  });
}
