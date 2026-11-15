/**
 * HUMORA — api.js
 * Pembungkus fetch ke Apps Script.
 *
 * - Content-Type text/plain → browser tidak mengirim preflight CORS
 *   (Apps Script tidak bisa menjawab preflight OPTIONS).
 * - credentials: 'omit' → tidak mengirim cookie Google; jawaban Apps Script
 *   dialihkan (redirect 302) ke script.googleusercontent.com, dan tanpa
 *   cookie jawaban itu bisa dibaca lintas-origin.
 * - TIDAK memakai mode 'no-cors' (jawabannya tidak bisa dibaca).
 */
window.HumoraApi = (function () {
  var SESSION_KEY = 'humora.session';

  function getToken() {
    try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
  }
  function setToken(token) {
    try { sessionStorage.setItem(SESSION_KEY, token); } catch (e) { /* storage diblokir */ }
  }
  function clearToken() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
  }

  function fail(code, message, meta) {
    return { success: false, data: null, error: { code: code }, message: message, _meta: meta || {} };
  }

  /**
   * @param {string} action
   * @param {Object} payload
   * @param {{sessionToken?: (string|null)}} opts  sessionToken: null = kirim tanpa sesi (untuk uji)
   */
  async function call(action, payload, opts) {
    opts = opts || {};
    var cfg = window.HUMORA_CONFIG || {};
    var body = { action: action, payload: payload || {} };
    var token = Object.prototype.hasOwnProperty.call(opts, 'sessionToken') ? opts.sessionToken : getToken();
    if (token) body.sessionToken = token;

    var started = performance.now();
    var res;
    try {
      res = await fetch(cfg.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow',
        credentials: 'omit',
        cache: 'no-store'
      });
    } catch (netErr) {
      return fail('NETWORK_ERROR',
        'Tidak dapat menghubungi server (jaringan, CSP, atau CORS). Lihat Console browser untuk detail.',
        { ms: Math.round(performance.now() - started) });
    }

    var meta = {
      httpStatus: res.status,
      redirected: res.redirected,
      finalHost: safeHost(res.url),
      ms: Math.round(performance.now() - started)
    };
    var text = await res.text();
    var json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return fail('NON_JSON_RESPONSE',
        'Server tidak membalas JSON. Biasanya karena deployment belum diatur "Who has access: Anyone" ' +
        'atau URL bukan URL /exec terbaru.', meta);
    }
    json._meta = meta;
    return json;
  }

  function safeHost(url) {
    try { return new URL(url).host; } catch (e) { return ''; }
  }

  return { call: call, getToken: getToken, setToken: setToken, clearToken: clearToken };
})();
