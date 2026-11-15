/**
 * HUMORA — Api.gs
 * Satu-satunya pintu masuk API: doPost.
 *
 * Format request (dikirim sebagai Content-Type: text/plain berisi JSON):
 *   { "action": "auth.me", "sessionToken": "...", "payload": {} }
 *
 * Format response (selalu):
 *   { "success": true|false, "data": {...}|null, "error": {"code": "..."}|null, "message": "..." }
 *
 * Catatan: ContentService selalu membalas HTTP 200. Status sukses/gagal
 * dibaca dari field "success" dan "error.code", bukan dari kode HTTP.
 */

/** Whitelist aksi. Aksi di luar daftar ini selalu ditolak. */
var ACTIONS = {
  'auth.login':     { auth: false, handler: function (req) { return authLogin_(req.payload); } },
  'auth.me':        { auth: true,  handler: function (req, ctx) { return authMe_(ctx); } },
  'auth.logout':    { auth: true,  handler: function (req, ctx) { return authLogout_(ctx); } },
  'ai.testRewrite': { auth: true,  handler: function (req, ctx) { return aiTestRewrite_(req.payload, ctx); } }
};

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw) throw appError_('BAD_REQUEST', 'Request kosong.');
    if (raw.length > LIMITS.MAX_BODY_CHARS) throw appError_('PAYLOAD_TOO_LARGE', 'Request terlalu besar.');

    var req;
    try {
      req = JSON.parse(raw);
    } catch (parseErr) {
      throw appError_('BAD_REQUEST', 'Format JSON tidak valid.');
    }
    if (!req || typeof req !== 'object' || Array.isArray(req)) {
      throw appError_('BAD_REQUEST', 'Format request tidak valid.');
    }

    var action = typeof req.action === 'string' ? req.action : '';
    if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
      throw appError_('UNKNOWN_ACTION', 'Aksi tidak dikenal.');
    }
    var def = ACTIONS[action];

    var payload = (req.payload && typeof req.payload === 'object' && !Array.isArray(req.payload)) ? req.payload : {};

    // Identitas pengguna HANYA berasal dari sesi yang diverifikasi server.
    // Field seperti payload.userId / payload.email diabaikan sepenuhnya.
    var ctx = null;
    if (def.auth) {
      ctx = { session: requireSession_(req.sessionToken) };
    }

    var data = def.handler({ payload: payload }, ctx);
    return json_({ success: true, data: data, error: null, message: 'OK' });
  } catch (err) {
    return errorResponse_(err);
  }
}

/** GET hanya untuk cek cepat bahwa deployment hidup. Tidak membuka data apa pun. */
function doGet() {
  return json_({ success: true, data: { service: 'HUMORA API', phase: 0 }, error: null, message: 'OK' });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse_(err) {
  if (err && err.isAppError) {
    return json_({ success: false, data: null, error: { code: err.code }, message: err.message });
  }
  // Error tak terduga: detail hanya ke log pemilik (Executions), tidak ke pengguna.
  // Pesan error dari kode kita tidak pernah memuat token, jadi aman dicatat.
  console.error('INTERNAL_ERROR: ' + (err && err.stack ? err.stack : String(err)));
  return json_({
    success: false,
    data: null,
    error: { code: 'INTERNAL_ERROR' },
    message: 'Terjadi kesalahan di server. Coba lagi.'
  });
}
