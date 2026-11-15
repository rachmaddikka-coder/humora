/**
 * HUMORA — auth.js
 * Google Identity Services (GIS): tombol "Sign in with Google" → ID token →
 * dikirim ke server (auth.login) → server memverifikasi dan memberi token sesi.
 *
 * Token sesi disimpan di sessionStorage (hilang saat tab ditutup).
 * ID token Google terakhir disimpan HANYA di memori, untuk uji
 * "kirim ulang token" dan "login ganda"; tidak pernah ditulis ke storage atau log.
 */
window.HumoraAuth = (function () {
  var listener = function () {};
  var lastIdToken = null;

  function isGisLoaded() {
    return !!(window.google && google.accounts && google.accounts.id);
  }

  function init(onEvent) {
    listener = onEvent || listener;
    var cfg = window.HUMORA_CONFIG || {};
    if (!isGisLoaded()) {
      listener('gis-error', { message: 'Skrip Google Identity Services gagal dimuat (cek koneksi / CSP / pemblokir iklan).' });
      return false;
    }
    google.accounts.id.initialize({
      client_id: cfg.GOOGLE_CLIENT_ID,
      callback: handleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: 'popup'
    });
    google.accounts.id.renderButton(document.getElementById('gsi-button'), {
      type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'id'
    });
    return true;
  }

  async function handleCredential(response) {
    lastIdToken = response && response.credential;
    if (!lastIdToken) {
      listener('login', { success: false, error: { code: 'NO_CREDENTIAL' }, message: 'Google tidak mengembalikan token.' });
      return;
    }
    listener('login-start', {});
    var r = await HumoraApi.call('auth.login', { idToken: lastIdToken }, { sessionToken: null });
    if (r.success) HumoraApi.setToken(r.data.sessionToken);
    listener('login', r);
  }

  async function me() {
    return HumoraApi.call('auth.me', {});
  }

  async function logout() {
    var oldToken = HumoraApi.getToken();
    var r = await HumoraApi.call('auth.logout', {});
    HumoraApi.clearToken();
    if (isGisLoaded()) google.accounts.id.disableAutoSelect();
    return { result: r, oldToken: oldToken };
  }

  function getLastIdToken() { return lastIdToken; }

  return { init: init, me: me, logout: logout, getLastIdToken: getLastIdToken };
})();
