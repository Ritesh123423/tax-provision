'use strict';

/**
 * HASH.JS — Password derivation.
 *
 * Preferred path: PBKDF2-HMAC-SHA256 through Web Crypto (`crypto.subtle`),
 * which is available on GitHub Pages and any https origin.
 *
 * `crypto.subtle` is absent when a page is opened straight off the disk with
 * a file:// URL, so a pure-JS PBKDF2 is included as a fallback. It is marked
 * with a different algorithm tag, runs fewer iterations because it is far
 * slower, and the UI warns when it is in use.
 */

const Hash = (() => {

  const ITER_WEBCRYPTO = 210000;
  const ITER_FALLBACK  = 20000;
  const KEYLEN         = 32;

  const hasSubtle = () => typeof crypto !== 'undefined' && !!crypto.subtle?.importKey;

  const enc = new TextEncoder();

  const toHex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  function randomSalt(len = 16) {
    const b = new Uint8Array(len);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < len; i++) b[i] = Math.floor(Math.random() * 256);
    return toHex(b);
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  /* ================= Pure-JS SHA-256 (fallback only) ================= */

  const K = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  /** @param {Uint8Array} msg @returns {Uint8Array} 32-byte digest */
  function sha256(msg) {
    const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    const bitLen = msg.length * 8;
    const padLen = ((msg.length + 9 + 63) & ~63);
    const m = new Uint8Array(padLen);
    m.set(msg);
    m[msg.length] = 0x80;
    // Length fits comfortably in the low 32 bits for our inputs.
    new DataView(m.buffer).setUint32(padLen - 4, bitLen >>> 0, false);
    new DataView(m.buffer).setUint32(padLen - 8, Math.floor(bitLen / 4294967296), false);

    const w = new Uint32Array(64);
    const view = new DataView(m.buffer);

    for (let off = 0; off < padLen; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i-15], 7) ^ rotr(w[i-15], 18) ^ (w[i-15] >>> 3);
        const s1 = rotr(w[i-2], 17) ^ rotr(w[i-2], 19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
      H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
    }
    const out = new Uint8Array(32);
    new DataView(out.buffer);
    for (let i = 0; i < 8; i++) {
      out[i*4]   = (H[i] >>> 24) & 0xff;
      out[i*4+1] = (H[i] >>> 16) & 0xff;
      out[i*4+2] = (H[i] >>> 8) & 0xff;
      out[i*4+3] = H[i] & 0xff;
    }
    return out;
  }

  function hmacSha256(key, msg) {
    let k = key;
    if (k.length > 64) k = sha256(k);
    const pad = new Uint8Array(64);
    pad.set(k);
    const inner = new Uint8Array(64 + msg.length);
    const outer = new Uint8Array(64 + 32);
    for (let i = 0; i < 64; i++) { inner[i] = pad[i] ^ 0x36; outer[i] = pad[i] ^ 0x5c; }
    inner.set(msg, 64);
    outer.set(sha256(inner), 64);
    return sha256(outer);
  }

  function pbkdf2Js(password, saltHex, iterations, keyLen) {
    const pw = enc.encode(password);
    const salt = hexToBytes(saltHex);
    const out = new Uint8Array(keyLen);
    let offset = 0, block = 1;
    while (offset < keyLen) {
      const b = new Uint8Array(salt.length + 4);
      b.set(salt);
      b[salt.length]     = (block >>> 24) & 0xff;
      b[salt.length + 1] = (block >>> 16) & 0xff;
      b[salt.length + 2] = (block >>> 8) & 0xff;
      b[salt.length + 3] = block & 0xff;
      let u = hmacSha256(pw, b);
      const acc = u.slice();
      for (let i = 1; i < iterations; i++) {
        u = hmacSha256(pw, u);
        for (let j = 0; j < acc.length; j++) acc[j] ^= u[j];
      }
      const take = Math.min(acc.length, keyLen - offset);
      out.set(acc.subarray(0, take), offset);
      offset += take;
      block++;
    }
    return out;
  }

  /* ================= Public API ================= */

  /**
   * Derive a password record.
   * @returns {Promise<{algo:string,salt:string,iter:number,hash:string}>}
   */
  async function derive(password, salt = randomSalt(), iter = null) {
    if (hasSubtle()) {
      const iterations = iter || ITER_WEBCRYPTO;
      const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: hexToBytes(salt), iterations, hash: 'SHA-256' },
        key, KEYLEN * 8
      );
      return { algo: 'pbkdf2-sha256', salt, iter: iterations, hash: toHex(new Uint8Array(bits)) };
    }
    const iterations = iter || ITER_FALLBACK;
    return { algo: 'pbkdf2-sha256-js', salt, iter: iterations, hash: toHex(pbkdf2Js(password, salt, iterations, KEYLEN)) };
  }

  /** Constant-time-ish comparison. Length is public, contents are not. */
  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /** Verify against a stored record, honouring the algorithm it was made with. */
  async function verify(password, record) {
    if (!record?.hash || !record?.salt) return false;
    const useJs = record.algo === 'pbkdf2-sha256-js';
    let computed;
    if (useJs || !hasSubtle()) {
      computed = toHex(pbkdf2Js(password, record.salt, record.iter || ITER_FALLBACK, KEYLEN));
    } else {
      const d = await derive(password, record.salt, record.iter || ITER_WEBCRYPTO);
      computed = d.hash;
    }
    return safeEqual(computed, record.hash);
  }

  /**
   * Password strength. Returns a 0–4 score with the single most useful
   * next step, rather than a wall of red text.
   */
  function strength(pw, minLen = 10) {
    const s = String(pw || '');
    const checks = {
      length: s.length >= minLen,
      long:   s.length >= 14,
      lower:  /[a-z]/.test(s),
      upper:  /[A-Z]/.test(s),
      digit:  /\d/.test(s),
      symbol: /[^A-Za-z0-9]/.test(s)
    };
    const weak = ['password', 'passw0rd', '12345678', 'qwerty', 'admin', 'letmein', 'welcome', 'kgsomani', 'taxprovision', 'iloveyou'];
    const isCommon = weak.some(w => s.toLowerCase().includes(w));

    let score = 0;
    if (checks.length) score++;
    if (checks.lower && checks.upper) score++;
    if (checks.digit) score++;
    if (checks.symbol) score++;
    if (checks.long) score = Math.min(4, score + 1);
    if (isCommon) score = Math.min(score, 1);

    let advice = 'Strong password.';
    if (!checks.length) advice = `Use at least ${minLen} characters.`;
    else if (isCommon) advice = 'Avoid common words and the firm name.';
    else if (!(checks.lower && checks.upper)) advice = 'Mix upper and lower case.';
    else if (!checks.digit) advice = 'Add a number.';
    else if (!checks.symbol) advice = 'Add a symbol to strengthen it further.';
    else if (!checks.long) advice = 'Good. 14+ characters would be stronger.';

    return {
      score: Math.min(4, score),
      valid: checks.length && !isCommon && (checks.lower && checks.upper || checks.symbol) && checks.digit,
      advice,
      label: ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][Math.min(4, score)]
    };
  }

  /** Readable temporary password for admin-issued resets. */
  function tempPassword() {
    const words = ['Ledger', 'Ravine', 'Quartz', 'Harbour', 'Cobalt', 'Meadow', 'Basalt', 'Lantern', 'Verdant', 'Pinnacle'];
    const b = new Uint8Array(3);
    if (crypto?.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < 3; i++) b[i] = Math.floor(Math.random() * 256);
    const w1 = words[b[0] % words.length];
    const w2 = words[b[1] % words.length];
    const n = 10 + (b[2] % 90);
    return `${w1}-${w2}-${n}!`;
  }

  return { derive, verify, strength, randomSalt, tempPassword, hasSubtle, ITER_WEBCRYPTO };
})();
