/**
 * HUMORA — Sessions.gs
 * Membuat, memeriksa, dan menghapus sesi.
 *
 * - Token sesi dikirim ke frontend SEKALI saat login.
 * - Yang disimpan di Sheets dan CacheService hanya hash SHA-256 dari token.
 * - Sheets = catatan permanen; CacheService = percepatan (maks. 6 jam).
 *
 * Tentang keacakan token (lihat juga docs/phase0-test-report.md):
 * Apps Script tidak menyediakan API "crypto random bytes". Token dibuat dari
 * dua Utilities.getUuid() (UUID versi 4, masing-masing 122 bit acak) sehingga
 * total 244 bit acak. Dokumentasi Google tidak menyatakan sumber acaknya
 * aman secara kriptografis (CSPRNG); di Java, UUID.randomUUID() memakai
 * SecureRandom, tetapi itu detail implementasi yang tidak dijamin.
 * Untuk Phase 0 ini dinilai memadai; statusnya dicatat sebagai risiko terbuka.
 */

var SESSION_CACHE_PREFIX_ = 'ses:';

/** 64 karakter heksadesimal (244 bit acak). */
function newSessionToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** SHA-256 → heksadesimal huruf kecil. */
function sha256Hex_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] & 0xff;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function isValidTokenFormat_(token) {
  return typeof token === 'string' && /^[0-9a-f]{64}$/.test(token);
}

/**
 * Membuat sesi baru untuk userId. Panggil HANYA di dalam withLock_.
 * @return {{token: string, sessionId: string, expiresAt: string}}
 */
function createSession_(userId) {
  var token = newSessionToken_();
  var hash = sha256Hex_(token);
  var now = new Date();
  var expires = new Date(now.getTime() + LIMITS.SESSION_HOURS * 3600 * 1000);
  var record = {
    session_id: newId_('ses'),
    token_hash: hash,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: expires.toISOString()
  };
  dbAppend_('Sessions', record);
  cacheSession_(hash, record);
  return { token: token, sessionId: record.session_id, expiresAt: record.expires_at };
}

function cacheSession_(hash, record) {
  var secondsLeft = Math.floor((Date.parse(record.expires_at) - Date.now()) / 1000);
  var ttl = Math.min(LIMITS.CACHE_MAX_SEC, secondsLeft);
  if (ttl < 1) return;
  CacheService.getScriptCache().put(
    SESSION_CACHE_PREFIX_ + hash,
    JSON.stringify({ session_id: record.session_id, user_id: record.user_id, expires_at: record.expires_at }),
    ttl
  );
}

/**
 * Memastikan token sesi valid. Dipanggil untuk SETIAP aksi yang dilindungi.
 * @return {{session_id, user_id, expires_at, token_hash}}
 */
function requireSession_(token) {
  if (!isValidTokenFormat_(token)) {
    throw appError_('UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.');
  }
  var hash = sha256Hex_(token);
  var cache = CacheService.getScriptCache();
  var session = null;

  var cached = cache.get(SESSION_CACHE_PREFIX_ + hash);
  if (cached) {
    session = JSON.parse(cached);
  } else {
    var row = dbFindOne_('Sessions', 'token_hash', hash);
    if (row) {
      session = { session_id: row.session_id, user_id: row.user_id, expires_at: row.expires_at };
      cacheSession_(hash, session);
    }
  }

  if (!session) {
    throw appError_('UNAUTHENTICATED', 'Sesi tidak ditemukan. Silakan masuk lagi.');
  }
  var expiresMs = Date.parse(session.expires_at);
  if (!expiresMs || expiresMs <= Date.now()) {
    cache.remove(SESSION_CACHE_PREFIX_ + hash);
    throw appError_('SESSION_EXPIRED', 'Sesi sudah berakhir. Silakan masuk lagi.');
  }
  session.token_hash = hash;
  return session;
}

/** Menghapus sesi (logout). Panggil HANYA di dalam withLock_. */
function deleteSessionByHash_(hash) {
  CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX_ + hash);
  var row = dbFindOne_('Sessions', 'token_hash', hash);
  if (row) dbDeleteRow_('Sessions', row._row);
  return !!row;
}
