/**
 * HUMORA — Auth.gs
 * Verifikasi ID token Google + login, cek identitas, logout.
 *
 * Verifikasi memakai endpoint resmi Google `tokeninfo`, karena Apps Script
 * tidak punya fungsi untuk memverifikasi tanda tangan RSA (RS256) sendiri.
 * Endpoint itu sudah menolak token palsu, rusak, atau kedaluwarsa; kita tetap
 * memeriksa ulang aud, iss, exp, email_verified, dan sub di sini.
 */

var GOOGLE_ISSUERS_ = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * @param {string} idToken  credential dari Google Identity Services
 * @return {{sub: string, email: string, name: string, picture: string}}
 */
function verifyGoogleIdToken_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 100 || idToken.length > 4096 ||
      idToken.split('.').length !== 3) {
    throw appError_('INVALID_ID_TOKEN', 'Token Google tidak valid.');
  }
  var clientId = getConfig_('GOOGLE_OAUTH_CLIENT_ID', true);

  var res;
  try {
    res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { method: 'get', muteHttpExceptions: true }
    );
  } catch (netErr) {
    console.error('AUTH_PROVIDER_UNAVAILABLE: gagal menghubungi tokeninfo');
    throw appError_('AUTH_PROVIDER_UNAVAILABLE', 'Tidak dapat menghubungi Google. Coba lagi.');
  }

  // 4xx = token palsu, rusak, atau sudah kedaluwarsa (ditolak oleh Google).
  if (res.getResponseCode() !== 200) {
    throw appError_('INVALID_ID_TOKEN', 'Token Google tidak valid atau sudah kedaluwarsa.');
  }

  var info;
  try {
    info = JSON.parse(res.getContentText());
  } catch (e) {
    throw appError_('INVALID_ID_TOKEN', 'Token Google tidak dapat dibaca.');
  }

  // Kode error dibedakan agar bisa diuji di Phase 0.
  // Di produksi, semua bisa disatukan menjadi INVALID_ID_TOKEN.
  if (info.aud !== clientId) {
    throw appError_('INVALID_AUDIENCE', 'Token ini bukan untuk aplikasi HUMORA.');
  }
  if (GOOGLE_ISSUERS_.indexOf(info.iss) === -1) {
    throw appError_('INVALID_ISSUER', 'Penerbit token tidak dikenal.');
  }
  var exp = Number(info.exp);
  if (!exp || exp * 1000 <= Date.now()) {
    throw appError_('TOKEN_EXPIRED', 'Token Google sudah kedaluwarsa. Silakan masuk lagi.');
  }
  if (String(info.email_verified) !== 'true') {
    throw appError_('EMAIL_NOT_VERIFIED', 'Email akun Google belum terverifikasi.');
  }
  var sub = String(info.sub || '');
  if (!/^[0-9]{5,64}$/.test(sub)) {
    throw appError_('INVALID_ID_TOKEN', 'Token Google tidak valid.');
  }

  return {
    sub: sub,
    email: String(info.email || ''),
    name: String(info.name || info.email || ''),
    picture: String(info.picture || '')
  };
}

/** Aksi: auth.login  — payload: { idToken } */
function authLogin_(payload) {
  var g = verifyGoogleIdToken_(payload && payload.idToken);

  // Seluruh "cari-atau-buat pengguna + buat sesi" ada di DALAM satu lock,
  // sehingga dua login bersamaan tidak bisa membuat dua akun untuk sub yang sama.
  var result = withLock_(function () {
    var now = isoNow_();
    var user = dbFindOne_('Users', 'google_sub', g.sub);
    var isNew = false;

    if (!user) {
      user = {
        user_id: newId_('usr'),
        google_sub: g.sub,
        email: g.email,
        display_name: g.name,
        picture_url: g.picture,
        status: 'active',
        created_at: now,
        last_login_at: now
      };
      dbAppend_('Users', user);
      isNew = true;
    } else {
      if (user.status !== 'active') {
        throw appError_('ACCOUNT_DISABLED', 'Akun ini tidak aktif.');
      }
      // Phase 0: data profil diperbarui dari Google setiap login.
      var changes = { email: g.email, picture_url: g.picture, last_login_at: now };
      if (!user.display_name) changes.display_name = g.name;
      dbUpdate_('Users', user._row, changes);
      user.email = g.email;
      user.picture_url = g.picture;
      user.last_login_at = now;
      if (changes.display_name) user.display_name = changes.display_name;
    }

    var session = createSession_(user.user_id);
    return { user: user, isNew: isNew, session: session };
  });

  return {
    sessionToken: result.session.token,   // satu-satunya kali token mentah dikirim
    expiresAt: result.session.expiresAt,
    isNewUser: result.isNew,
    user: publicUser_(result.user)
  };
}

/** Aksi: auth.me — mengembalikan pengguna dari sesi (bukan dari input frontend). */
function authMe_(ctx) {
  var user = dbFindOne_('Users', 'user_id', ctx.session.user_id);
  if (!user || user.status !== 'active') {
    throw appError_('UNAUTHENTICATED', 'Akun tidak ditemukan. Silakan masuk lagi.');
  }
  return { user: publicUser_(user), session: { expiresAt: ctx.session.expires_at } };
}

/** Aksi: auth.logout — menghapus sesi saat ini. */
function authLogout_(ctx) {
  var removed = withLock_(function () {
    return deleteSessionByHash_(ctx.session.token_hash);
  });
  return { loggedOut: true, sessionRemoved: removed };
}

/** Field yang aman dikirim ke frontend (tanpa google_sub dan nomor baris). */
function publicUser_(u) {
  return {
    userId: u.user_id,
    email: u.email,
    displayName: u.display_name,
    pictureUrl: u.picture_url,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at
  };
}
