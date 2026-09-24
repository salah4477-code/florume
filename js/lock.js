/*
 * قفل التعديل والحذف — Florume
 * الجزء النقي (مغطى بالاختبارات): تشفير الباسورد (SHA-256 مع ملح وتكرار)، كود الاسترجاع،
 * وتحديد إذا كان الحفظ فيه تعديل أو حذف لسجل موجود (الإضافة الجديدة مش محتاجة باسورد).
 * الباسورد نفسه مابيتحفظش — بيتحفظ «بصمته» بس في الإعدادات.
 */
(function (root) {
  'use strict';
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const utf8 = (s) => { const out = []; for (const ch of String(s)) { let c = ch.codePointAt(0); if (c < 0x80) out.push(c); else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); } return out; };

  function sha256(str) {
    const bytes = utf8(str);
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 255);
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const W = new Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < bytes.length; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  const ROUNDS = 2000; // تكرار بيبطّأ تخمين الباسورد من غير ما يحس بيه المستخدم
  function hashSecret(secret, salt) { let h = sha256(`${salt}|${secret}`); for (let i = 1; i < ROUNDS; i++) h = sha256(h + salt); return h; }
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function randomString(n, alphabet, rng) {
    const r = rng || ((k) => { const a = new Uint32Array(k); (root.crypto || globalThis.crypto).getRandomValues(a); return [...a]; });
    return r(n).map((x) => alphabet[x % alphabet.length]).join('');
  }
  const CODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // من غير الحروف اللي بتتلخبط (O و0، I و1)

  // باسورد جديد → إعدادات القفل + كود استرجاع بيظهر مرة واحدة
  function create(password, opts = {}) {
    const salt = randomString(16, CODE_ABC, opts.rng);
    const code = randomString(12, CODE_ABC, opts.rng);
    const lock = { salt, hash: hashSecret(password, salt), recovery: hashSecret(normCode(code), salt), graceMin: num(opts.graceMin), setAt: opts.today || '' };
    return { lock, code: code.match(/.{4}/g).join('-') };
  }
  const num = (n) => Number(n) || 0;
  const enabled = (lock) => !!(lock && lock.hash && lock.salt);
  const verify = (lock, password) => enabled(lock) && hashSecret(password, lock.salt) === lock.hash;
  const verifyRecovery = (lock, code) => enabled(lock) && !!lock.recovery && hashSecret(normCode(code), lock.salt) === lock.recovery;
  const MIN_LEN = 4;
  function passwordError(pw, again) {
    if (String(pw || '').length < MIN_LEN) return `الباسورد لازم يكون ${MIN_LEN} حروف أو أرقام على الأقل`;
    if (again != null && pw !== again) return 'الباسورد والتأكيد مش زي بعض';
    return null;
  }

  // حقول في الإعدادات بتتغير لوحدها مع الإضافة (زي رقم الفاتورة الجاية) — مش تعديل
  const AUTO_SETTINGS = ['nextInvoiceNo'];
  const cleanSettings = (st) => { const o = { ...(st || {}) }; AUTO_SETTINGS.forEach((k) => delete o[k]); return JSON.stringify(o); };

  // الحفظ ده فيه إيه محتاج باسورد؟ تعديل أو حذف لسجل كان موجود، أو تغيير في الإعدادات
  function guardedChanges(prev, next, SYNC) {
    const out = SYNC.changesForLog(SYNC.encode(prev), SYNC.encode(next)).filter((c) => c.list !== 'settings' && c.action !== 'add');
    if (cleanSettings(prev.settings) !== cleanSettings(next.settings)) out.unshift({ list: 'settings', id: 'settings', action: 'edit', label: 'الإعدادات' });
    return out;
  }

  // بعد كذا محاولة غلط بيستنى شوية قبل ما يسمح بمحاولة تانية
  const MAX_TRIES = 5, WAIT_MS = 30000;
  function throttle(state, now, ok) {
    const s = { fails: state.fails || 0, until: state.until || 0 };
    if (ok) return { fails: 0, until: 0 };
    s.fails += 1;
    if (s.fails >= MAX_TRIES) { s.until = now + WAIT_MS; s.fails = 0; }
    return s;
  }

  const api = { sha256, hashSecret, create, enabled, verify, verifyRecovery, passwordError, guardedChanges, throttle, normCode, AUTO_SETTINGS, MAX_TRIES, WAIT_MS, MIN_LEN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LOCK = api;
})(typeof window !== 'undefined' ? window : globalThis);
