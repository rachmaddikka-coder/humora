/**
 * HUMORA — app.js
 * Menghubungkan tombol-tombol halaman uji Phase 0 dengan HumoraApi / HumoraAuth.
 * Semua teks dari server ditampilkan dengan textContent (bukan innerHTML).
 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var loggedOutToken = null; // token sesi sebelum logout, hanya di memori, untuk uji "sesi lama"

  // ---------- Log (token selalu disembunyikan) ----------
  var SECRET_KEYS = ['sessionToken', 'idToken', 'credential'];
  function redact(value) {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = SECRET_KEYS.indexOf(k) !== -1 ? '[disembunyikan]' : redact(value[k]);
      });
      return out;
    }
    return value;
  }
  function log(label, result) {
    var time = new Date().toLocaleTimeString('id-ID');
    var status = result && result.success ? 'BERHASIL' : 'DITOLAK/GAGAL';
    var code = result && result.error ? ' · ' + result.error.code : '';
    var line = '[' + time + '] ' + label + ' → ' + status + code + '\n' +
      JSON.stringify(redact(result), null, 2) + '\n\n';
    var el = $('log');
    el.textContent = line + el.textContent;
  }

  // ---------- Tampilan ----------
  function setBusy(btn, busy) { if (btn) btn.disabled = busy; }
  function showUser(data, isNew) {
    var u = data.user;
    $('u-name').textContent = u.displayName || '';
    $('u-email').textContent = u.email || '';
    $('u-id').textContent = u.userId || '';
    $('u-new').textContent = isNew === undefined ? '-' : (isNew ? 'Ya (akun baru dibuat)' : 'Tidak (akun lama dikenali)');
    $('u-created').textContent = u.createdAt || '';
    $('u-last').textContent = u.lastLoginAt || '';
    $('u-exp').textContent = (data.expiresAt || (data.session && data.session.expiresAt) || '');
    $('user-info').hidden = false;
    $('auth-status').textContent = 'Sudah masuk sebagai ' + (u.email || '');
    $('auth-status').className = 'ok';
  }
  function showSignedOut(message) {
    $('user-info').hidden = true;
    $('auth-status').textContent = message || 'Belum masuk.';
    $('auth-status').className = 'muted';
  }

  // ---------- Konfigurasi ----------
  function checkConfig() {
    var cfg = window.HUMORA_CONFIG || {};
    var problems = [];
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(cfg.API_URL || '')) {
      problems.push('API_URL belum diisi dengan URL Web App (berakhiran /exec).');
    }
    if (!/\.apps\.googleusercontent\.com$/.test(cfg.GOOGLE_CLIENT_ID || '')) {
      problems.push('GOOGLE_CLIENT_ID belum diisi dengan OAuth Client ID.');
    }
    var el = $('config-status');
    if (problems.length) {
      el.textContent = 'Perlu diperbaiki di web/js/config.js: ' + problems.join(' ');
      el.className = 'err';
      return false;
    }
    el.textContent = 'config.js terisi. Origin halaman ini: ' + location.origin +
      ' (harus terdaftar di "Authorized JavaScript origins").';
    el.className = 'ok';
    return true;
  }

  // ---------- Event dari auth.js ----------
  function onAuthEvent(type, r) {
    if (type === 'gis-error') { showSignedOut(r.message); $('auth-status').className = 'err'; return; }
    if (type === 'login-start') { $('auth-status').textContent = 'Memverifikasi di server…'; return; }
    if (type === 'login') {
      log('auth.login', r);
      if (r.success) showUser(r.data, r.data.isNewUser);
      else { showSignedOut('Login gagal: ' + r.message); $('auth-status').className = 'err'; }
    }
  }

  // ---------- Tombol utama ----------
  $('btn-me').addEventListener('click', async function (ev) {
    setBusy(ev.target, true);
    var r = await HumoraAuth.me();
    log('auth.me', r);
    if (r.success) showUser(r.data);
    else showSignedOut('Sesi tidak valid: ' + (r.error && r.error.code));
    setBusy(ev.target, false);
  });

  $('btn-logout').addEventListener('click', async function (ev) {
    setBusy(ev.target, true);
    var out = await HumoraAuth.logout();
    loggedOutToken = out.oldToken;
    log('auth.logout', out.result);
    showSignedOut('Sudah logout.');
    setBusy(ev.target, false);
  });

  $('btn-ai').addEventListener('click', async function (ev) {
    setBusy(ev.target, true);
    $('ai-status').textContent = 'Memproses…';
    $('ai-output').textContent = '';
    var r = await HumoraApi.call('ai.testRewrite', { text: $('ai-input').value });
    log('ai.testRewrite', r);
    if (r.success) {
      $('ai-output').textContent = r.data.result;
      $('ai-status').textContent = 'Model: ' + r.data.model + ' · ' + r.data.latencyMs + ' ms di server';
    } else {
      $('ai-status').textContent = 'Gagal: ' + (r.error && r.error.code) + ' — ' + r.message;
    }
    setBusy(ev.target, false);
  });

  $('btn-clear').addEventListener('click', function () { $('log').textContent = ''; });

  // ---------- Uji negatif ----------
  function randomHex(bytes) {
    var a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function fakeJwt() {
    var part = function (n) { return btoa(randomHex(n)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); };
    return part(24) + '.' + part(96) + '.' + part(64);
  }

  var TESTS = {
    'fake-id-token': function () {
      return HumoraApi.call('auth.login', { idToken: fakeJwt() }, { sessionToken: null });
    },
    'no-session': function () {
      return HumoraApi.call('auth.me', {}, { sessionToken: null });
    },
    'random-session': function () {
      return HumoraApi.call('auth.me', {}, { sessionToken: randomHex(32) });
    },
    'unknown-action': function () {
      return HumoraApi.call('admin.deleteAllUsers', {});
    },
    'forged-user': function () {
      // Server harus mengabaikan userId/email dari payload dan tetap mengembalikan user dari sesi.
      return HumoraApi.call('auth.me', { userId: 'usr_palsu', email: 'penyerang@example.com' });
    },
    'replay-id-token': function () {
      var t = HumoraAuth.getLastIdToken();
      if (!t) return Promise.resolve({ success: false, error: { code: 'NO_TOKEN_IN_MEMORY' }, message: 'Login dulu di tab ini.' });
      return HumoraApi.call('auth.login', { idToken: t }, { sessionToken: null });
    },
    'double-login': async function () {
      var t = HumoraAuth.getLastIdToken();
      if (!t) return { success: false, error: { code: 'NO_TOKEN_IN_MEMORY' }, message: 'Login dulu di tab ini.' };
      var both = await Promise.all([
        HumoraApi.call('auth.login', { idToken: t }, { sessionToken: null }),
        HumoraApi.call('auth.login', { idToken: t }, { sessionToken: null })
      ]);
      if (both[1].success) HumoraApi.setToken(both[1].data.sessionToken);
      var ids = both.filter(function (x) { return x.success; }).map(function (x) { return x.data.user.userId; });
      return {
        success: ids.length === 2 && ids[0] === ids[1],
        data: { userIds: ids, catatan: 'Lulus jika kedua userId sama DAN sheet Users hanya punya 1 baris untuk akun ini.' },
        error: ids.length === 2 && ids[0] === ids[1] ? null : { code: 'CHECK_MANUALLY' },
        message: 'Login paralel selesai.',
        raw: both
      };
    },
    'old-session': function () {
      if (!loggedOutToken) return Promise.resolve({ success: false, error: { code: 'NO_OLD_SESSION' }, message: 'Logout dulu, lalu jalankan uji ini.' });
      return HumoraApi.call('auth.me', {}, { sessionToken: loggedOutToken });
    }
  };

  document.querySelectorAll('[data-test]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      setBusy(btn, true);
      var name = btn.getAttribute('data-test');
      var r = await TESTS[name]();
      log('UJI ' + name, r);
      setBusy(btn, false);
    });
  });

  // ---------- Mulai ----------
  if (checkConfig()) {
    HumoraAuth.init(onAuthEvent);
    if (HumoraApi.getToken()) {
      HumoraAuth.me().then(function (r) {
        log('auth.me (saat halaman dibuka)', r);
        if (r.success) showUser(r.data);
        else HumoraApi.clearToken();
      });
    }
  }
})();
