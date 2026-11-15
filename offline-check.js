// Usage: node tools/offline-check.js gas
// Offline simulation of the HUMORA Phase 0 backend with mocked Apps Script services.
// This proves the code's logic only; it is NOT a test against real Google services.
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const path = require('path');

const GAS_DIR = process.argv[2];
const results = [];
const check = (name, cond, extra) => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };

// ---------- mocks ----------
const props = {
  GEMINI_API_KEY: 'test-key-not-real', GEMINI_MODEL: 'flash-primary', GEMINI_FALLBACK_MODEL: 'flash-lite-fallback',
  GOOGLE_OAUTH_CLIENT_ID: 'client-123.apps.googleusercontent.com', SPREADSHEET_ID: 'sheet-1'
};
const cacheStore = new Map();
const logs = [];
let lockHeld = false;

function makeSheet(name) {
  const rows = []; // 2D array of strings, rows[0] = header
  const sh = {
    name, rows, maxRows: 1000,
    getLastColumn: () => (rows[0] ? rows[0].length : 0),
    getLastRow: () => rows.length,
    getMaxRows: () => sh.maxRows,
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((rows[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
      setValues: (vals) => { for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = vals[i][j]; } return this; },
      setValue: (v) => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = v; return { setFontWeight: () => {} }; },
      setNumberFormat: () => {}, setFontWeight: () => {}
    }),
    setFrozenRows: () => {},
    deleteRow: (r) => { rows.splice(r - 1, 1); }
  };
  // fix chained setValues(...).setFontWeight
  const orig = sh.getRange;
  sh.getRange = (...a) => { const rg = orig(...a); const sv = rg.setValues; rg.setValues = (v) => { sv(v); return rg; }; return rg; };
  return sh;
}
const sheets = {};
const ss = { getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => (sheets[n] = makeSheet(n)) };

let fetchHandler = () => { throw new Error('no handler'); };
const fetchLog = [];

const ctx = {
  console: { log: (m) => logs.push(String(m)), error: (m) => logs.push('ERR ' + String(m)) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
  CacheService: { getScriptCache: () => ({
    get: (k) => cacheStore.has(k) ? cacheStore.get(k) : null,
    put: (k, v, ttl) => { if (!(ttl >= 1 && ttl <= 21600)) throw new Error('bad ttl ' + ttl); cacheStore.set(k, v); },
    remove: (k) => cacheStore.delete(k)
  }) },
  LockService: { getScriptLock: () => ({
    tryLock: () => { if (lockHeld) return false; lockHeld = true; return true; },
    releaseLock: () => { lockHeld = false; }
  }) },
  SpreadsheetApp: { openById: (id) => { if (id !== 'sheet-1') throw new Error('no access'); return ss; }, flush: () => {} },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    sleep: () => {},
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, text) => Array.from(crypto.createHash('sha256').update(text, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b))
  },
  UrlFetchApp: { fetch: (url, opts) => { fetchLog.push({ url, opts }); return fetchHandler(url, opts); } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ body: s, setMimeType() { return this; } }) },
  Date, JSON, Math, Object, Array, String, Number, Error, encodeURIComponent
};
vm.createContext(ctx);
for (const f of fs.readdirSync(GAS_DIR).filter(f => f.endsWith('.gs')).sort()) {
  vm.runInContext(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), ctx, { filename: f });
}

const resp = (code, obj) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(obj) });
const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).body);
const FAKE_ID_TOKEN = 'h'.repeat(40) + '.' + 'p'.repeat(200) + '.' + 's'.repeat(80);
let tokenInfo = null;
function googleOk(overrides) {
  tokenInfo = Object.assign({ aud: props.GOOGLE_OAUTH_CLIENT_ID, iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600),
    email_verified: 'true', sub: '112233445566778899001', email: 'tester@example.com', name: 'Tester', picture: 'https://lh3.googleusercontent.com/x' }, overrides || {});
}
let geminiPlan = [];
fetchHandler = (url, opts) => {
  if (url.startsWith('https://oauth2.googleapis.com/tokeninfo')) return tokenInfo ? resp(200, tokenInfo) : resp(400, { error: 'invalid_token' });
  if (url.startsWith('https://generativelanguage.googleapis.com/')) {
    const step = geminiPlan.shift() || { code: 200 };
    if (step.code === 200) return resp(200, { candidates: [{ content: { parts: [{ text: 'Hasil tulis ulang.' }] }, finishReason: 'STOP' }] });
    return resp(step.code, step.body || { error: { status: step.status || 'X' } });
  }
  throw new Error('unexpected url ' + url);
};

// ---------- 1. offline checks + setup ----------
ctx.runOfflineChecks();
const offline = logs.join('\n');
check('runOfflineChecks: all LULUS', !/GAGAL/.test(offline) && /LULUS/.test(offline), (offline.match(/LULUS/g) || []).length + ' checks');
ctx.setup();
check('setup creates Users with 8 headers', sheets.Users && sheets.Users.rows[0].length === 8);
check('setup creates Sessions with 5 headers', sheets.Sessions && sheets.Sessions.rows[0].length === 5);
ctx.setup();
check('setup is idempotent (no duplicate headers)', sheets.Users.rows[0].length === 8 && sheets.Users.rows.length === 1);

// ---------- 2. API basics ----------
check('unknown action rejected', post({ action: 'admin.drop' }).error.code === 'UNKNOWN_ACTION');
check('invalid JSON rejected', post('{not json').error.code === 'BAD_REQUEST');
check('oversized body rejected', post('x'.repeat(70000)).error.code === 'PAYLOAD_TOO_LARGE');
check('prototype key not an action', post({ action: 'toString' }).error.code === 'UNKNOWN_ACTION');

// ---------- 3. auth ----------
tokenInfo = null;
check('invalid ID token rejected', post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } }).error.code === 'INVALID_ID_TOKEN');
check('malformed ID token rejected before network', (() => { const n = fetchLog.length; const r = post({ action: 'auth.login', payload: { idToken: 'abc' } }); return r.error.code === 'INVALID_ID_TOKEN' && fetchLog.length === n; })());
googleOk({ aud: 'other-client.apps.googleusercontent.com' });
check('wrong audience rejected', post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } }).error.code === 'INVALID_AUDIENCE');
googleOk({ iss: 'evil.example.com' });
check('wrong issuer rejected', post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } }).error.code === 'INVALID_ISSUER');
googleOk({ exp: String(Math.floor(Date.now() / 1000) - 10) });
check('expired token rejected', post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } }).error.code === 'TOKEN_EXPIRED');
googleOk({ email_verified: 'false' });
check('unverified email rejected', post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } }).error.code === 'EMAIL_NOT_VERIFIED');
check('no user rows created by rejected logins', sheets.Users.rows.length === 1);

googleOk();
const login1 = post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } });
check('valid login succeeds', login1.success === true);
check('new user flagged isNewUser', login1.data.isNewUser === true);
check('user_id is prefixed UUID', /^usr_[0-9a-f-]{36}$/.test(login1.data.user.userId));
check('session token is 64 hex', /^[0-9a-f]{64}$/.test(login1.data.sessionToken));
const hdr = sheets.Sessions.rows[0];
const sessRow = sheets.Sessions.rows[1];
check('Sessions stores hash, not raw token', sessRow[hdr.indexOf('token_hash')] === crypto.createHash('sha256').update(login1.data.sessionToken).digest('hex') && !sheets.Sessions.rows.flat().includes(login1.data.sessionToken));
const uh = sheets.Users.rows[0];
check('google_sub stored as exact string', sheets.Users.rows[1][uh.indexOf('google_sub')] === '112233445566778899001');
check('timestamps are ISO 8601 UTC', /Z$/.test(sheets.Users.rows[1][uh.indexOf('created_at')]));
check('google_sub not exposed to frontend', !JSON.stringify(login1).includes('112233445566778899001'));
check('lock released after login', lockHeld === false);

const login2 = post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } });
check('returning user recognized', login2.success && login2.data.isNewUser === false && login2.data.user.userId === login1.data.user.userId);
check('no duplicate user row', sheets.Users.rows.length === 2);

lockHeld = true; // simulate another execution holding the lock
const busy = post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } });
lockHeld = false;
check('login refused with BUSY while lock held (no write)', busy.error && busy.error.code === 'BUSY' && sheets.Users.rows.length === 2);

const me = post({ action: 'auth.me', sessionToken: login1.data.sessionToken, payload: { userId: 'usr_palsu', email: 'attacker@example.com' } });
check('second request with session succeeds', me.success === true);
check('payload userId/email ignored', me.data.user.userId === login1.data.user.userId && me.data.user.email === 'tester@example.com');
cacheStore.clear();
check('session resolves from Sheets when cache empty', post({ action: 'auth.me', sessionToken: login1.data.sessionToken }).success === true);
check('missing session rejected', post({ action: 'auth.me' }).error.code === 'UNAUTHENTICATED');
check('random session rejected', post({ action: 'auth.me', sessionToken: crypto.randomBytes(32).toString('hex') }).error.code === 'UNAUTHENTICATED');

ctx.expireAllSessionsForTest();
check('expired session rejected', post({ action: 'auth.me', sessionToken: login1.data.sessionToken }).error.code === 'SESSION_EXPIRED');

googleOk();
const login3 = post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } });
const out = post({ action: 'auth.logout', sessionToken: login3.data.sessionToken });
check('logout succeeds and removes row', out.success && out.data.sessionRemoved === true);
check('session rejected after logout', post({ action: 'auth.me', sessionToken: login3.data.sessionToken }).error.code === 'UNAUTHENTICATED');
ctx.cleanupExpiredSessions();
check('cleanupExpiredSessions removes expired rows', sheets.Sessions.rows.length === 1 + 0 || sheets.Sessions.rows.slice(1).every(r => Date.parse(r[hdr.indexOf('expires_at')]) > Date.now()));

// ---------- 4. gemini ----------
const login4 = post({ action: 'auth.login', payload: { idToken: FAKE_ID_TOKEN } });
const S = login4.data.sessionToken;
const sample = 'Dalam era perkembangan teknologi yang semakin pesat, penggunaan kecerdasan buatan telah memberikan dampak yang signifikan terhadap berbagai aspek kehidupan manusia.';
const nGem = () => fetchLog.filter(f => f.url.includes('generativelanguage')).length;
let before = nGem();
geminiPlan = [{ code: 200 }];
const ai1 = post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } });
check('ai.testRewrite succeeds', ai1.success && ai1.data.result === 'Hasil tulis ulang.' && ai1.data.model === 'flash-primary');
const g = fetchLog[fetchLog.length - 1];
check('API key sent in header, not URL', g.opts.headers['x-goog-api-key'] === props.GEMINI_API_KEY && !g.url.includes(props.GEMINI_API_KEY));
check('API key absent from response', !JSON.stringify(ai1).includes(props.GEMINI_API_KEY));
check('cooldown blocks immediate repeat', post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } }).error.code === 'TOO_FAST');
const clearCool = () => { for (const k of [...cacheStore.keys()]) if (k.startsWith('cool:')) cacheStore.delete(k); };

clearCool(); geminiPlan = [{ code: 429, status: 'RESOURCE_EXHAUSTED' }, { code: 200 }];
check('429 retried once then succeeds', post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } }).success);
clearCool(); geminiPlan = [{ code: 429 }, { code: 429 }];
check('persistent 429 → AI_RATE_LIMITED', post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } }).error.code === 'AI_RATE_LIMITED');
clearCool(); geminiPlan = [{ code: 404, status: 'NOT_FOUND' }, { code: 200 }];
const fb = post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } });
check('404 primary → fallback model used', fb.success && fb.data.model === 'flash-lite-fallback');
clearCool(); geminiPlan = [{ code: 404 }, { code: 404 }];
check('both models missing → AI_MODEL_UNAVAILABLE', post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } }).error.code === 'AI_MODEL_UNAVAILABLE');
clearCool(); geminiPlan = [{ code: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'API key not valid', details: [{ reason: 'API_KEY_INVALID' }] } } }];
const bad = post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } });
check('invalid API key → AI_CONFIG_ERROR, no detail leaked', bad.error.code === 'AI_CONFIG_ERROR' && !/API key not valid/.test(JSON.stringify(bad)));
clearCool(); const saved = props.GEMINI_API_KEY; delete props.GEMINI_API_KEY;
const missing = post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: sample } });
props.GEMINI_API_KEY = saved;
check('missing API key → CONFIG_ERROR', missing.error.code === 'CONFIG_ERROR');
clearCool();
check('text too short rejected', post({ action: 'ai.testRewrite', sessionToken: S, payload: { text: 'pendek' } }).error.code === 'INVALID_INPUT');
check('ai.testRewrite needs session', post({ action: 'ai.testRewrite', payload: { text: sample } }).error.code === 'UNAUTHENTICATED');

// ---------- 5. secrets never in logs ----------
const allLogs = logs.join('\n');
check('no session token / API key / ID token in logs', ![login1.data.sessionToken, props.GEMINI_API_KEY, FAKE_ID_TOKEN].some(s => allLogs.includes(s)));

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
