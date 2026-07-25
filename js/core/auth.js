'use strict';

/**
 * AUTH.JS — Accounts, sessions and permissions.
 *
 * The first account created becomes the Administrator. That is the standard
 * bootstrap pattern and avoids shipping a known default password on a public
 * URL. Every account after that gets the role an administrator assigns, or
 * Preparer if self-registration is open.
 *
 * IMPORTANT — what this is and is not:
 * This is a client-side gate. It hashes passwords properly (PBKDF2-SHA256)
 * and never stores plaintext, so a person reading localStorage cannot read
 * passwords. But the check itself runs in the browser, so it keeps honest
 * users in their lane; it cannot stop someone determined to edit the page.
 * Real access control needs a server. The README says so plainly.
 */

const Auth = (() => {

  // Audit firm roles: partner (top), manager, article (trainee)
  const PERMS = {
    partner: ['engagement.create','engagement.editAny','engagement.deleteAny','engagement.signoff','engagement.lock','engagement.export','user.manage','rate.manage','checklist.manage','log.view','firm.manage','data.manage'],
    manager: ['engagement.create','engagement.editAny','engagement.deleteOwn','engagement.signoff','engagement.export','log.view'],
    article: ['engagement.editOwn','engagement.deleteOwn','engagement.export'],  // articles cannot create engagements
  };

  /* ---------------- Session ---------------- */

  function currentUser() {
    const s = Store.getSession();
    if (!s) return null;
    if (new Date(s.expiresAt).getTime() < Date.now()) { signOut(true); return null; }
    const u = Store.userById(s.userId);
    if (!u || u.status !== 'active') { signOut(true); return null; }
    return u;
  }

  const isSignedIn = () => !!currentUser();

  function sessionMinutes() { return U.clamp(Store.firm().sessionMinutes || 60, 5, 1440); }

  function startSession(user) {
    Store.setSession({
      userId: user.id,
      startedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + sessionMinutes() * 60000).toISOString()
    });
  }

  /** Push the expiry out on activity, so a working session never dies mid-entry. */
  function touch() {
    const s = Store.getSession();
    if (!s) return;
    const next = Date.now() + sessionMinutes() * 60000;
    // Only write when it moves meaningfully, to avoid hammering storage.
    if (next - new Date(s.expiresAt).getTime() > 60000) {
      s.expiresAt = new Date(next).toISOString();
      Store.setSession(s);
    }
  }

  function signOut(silent = false) {
    if (!silent) Store.log('Signed out');
    Store.setSession(null);
  }

  /* ---------------- Register ---------------- */

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /**
   * Create an account.
   * @returns {Promise<{ok:boolean, error?:string, field?:string, user?:object}>}
   */
  async function register({ name, email, designation, password, role = null }) {
    const firm = Store.firm();
    name = String(name || '').trim();
    email = String(email || '').trim().toLowerCase();
    designation = String(designation || '').trim();

    if (name.length < 2) return { ok: false, field: 'name', error: 'Enter your full name.' };
    if (!EMAIL_RE.test(email)) return { ok: false, field: 'email', error: 'Enter a valid email address.' };
    if (Store.userByEmail(email)) return { ok: false, field: 'email', error: 'An account already uses that email.' };

    const st = Hash.strength(password, firm.passwordMinLen);
    if (!st.valid) return { ok: false, field: 'password', error: st.advice };

    const isFirst = Store.users().length === 0;
    if (!isFirst && !firm.allowSelfRegistration && !can('user.manage')) {
      return { ok: false, field: 'email', error: 'Registration is closed. Ask an administrator to create your account.' };
    }

    const pw = await Hash.derive(password);
    const user = Store.addUser({
      name, email, designation,
      role: role || (isFirst ? 'partner' : 'article'),
      algo: pw.algo, salt: pw.salt, iter: pw.iter, hash: pw.hash
    });

    Store.log(isFirst ? 'Created the first account (Administrator)' : 'Registered account', `${name} <${email}>`, user.id);
    return { ok: true, user, isFirst };
  }

  /* ---------------- Sign in ---------------- */

  /**
   * Attempt sign-in. Failures are deliberately vague about which half was
   * wrong, and repeated failures lock the account for a cooling-off period.
   */
  async function signIn(email, password) {
    const firm = Store.firm();
    const user = Store.userByEmail(email);

    // Same generic message whether or not the account exists.
    const GENERIC = { ok: false, error: 'Email or password is incorrect.' };

    if (!user) {
      // Burn comparable time so a missing account is not detectable by timing.
      await Hash.derive(String(password || 'x'), Hash.randomSalt());
      return GENERIC;
    }

    if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      const mins = Math.max(1, Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60000));
      return { ok: false, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
    }

    if (user.status !== 'active') {
      return { ok: false, error: 'This account is suspended. An administrator can restore it.' };
    }

    const ok = await Hash.verify(password, { algo: user.algo, salt: user.salt, iter: user.iter, hash: user.hash });

    if (!ok) {
      const fails = (user.failCount || 0) + 1;
      const patch = { failCount: fails };
      if (fails >= (firm.maxFailedLogins || 5)) {
        patch.lockedUntil = new Date(Date.now() + (firm.lockoutMinutes || 15) * 60000).toISOString();
        patch.failCount = 0;
      }
      Store.updateUser(user.id, patch);
      Store.log('Failed sign-in attempt', user.email, user.id);
      if (patch.lockedUntil) {
        return { ok: false, error: `Too many attempts. This account is locked for ${firm.lockoutMinutes || 15} minutes.` };
      }
      const left = (firm.maxFailedLogins || 5) - fails;
      return { ok: false, error: `Email or password is incorrect. ${left} attempt${left === 1 ? '' : 's'} left.` };
    }

    Store.updateUser(user.id, { failCount: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() });
    startSession(user);
    Store.log('Signed in', user.email, user.id);
    return { ok: true, user };
  }

  /* ---------------- Passwords ---------------- */

  async function changePassword(userId, oldPassword, newPassword) {
    const u = Store.userById(userId);
    if (!u) return { ok: false, error: 'Account not found.' };

    if (!u.mustChangePassword) {
      const ok = await Hash.verify(oldPassword, { algo: u.algo, salt: u.salt, iter: u.iter, hash: u.hash });
      if (!ok) return { ok: false, field: 'old', error: 'Current password is incorrect.' };
    }

    const st = Hash.strength(newPassword, Store.firm().passwordMinLen);
    if (!st.valid) return { ok: false, field: 'new', error: st.advice };

    const pw = await Hash.derive(newPassword);
    Store.updateUser(userId, { algo: pw.algo, salt: pw.salt, iter: pw.iter, hash: pw.hash, mustChangePassword: false });
    Store.log('Changed password', u.email, u.id);
    return { ok: true };
  }

  /** Administrator-issued reset. Returns the temporary password to hand over. */
  async function resetPassword(userId) {
    const u = Store.userById(userId);
    if (!u) return { ok: false, error: 'Account not found.' };
    const temp = Hash.tempPassword();
    const pw = await Hash.derive(temp);
    Store.updateUser(userId, {
      algo: pw.algo, salt: pw.salt, iter: pw.iter, hash: pw.hash,
      mustChangePassword: true, failCount: 0, lockedUntil: null
    });
    Store.log('Reset a password', u.email, u.id);
    return { ok: true, temp };
  }

  /* ---------------- Permissions ---------------- */

  function can(perm, user = currentUser()) {
    if (!user) return false;
    return (PERMS[user.role] || []).includes(perm);
  }

  /** Can this user edit this engagement right now? */
  function canEdit(eng, user = currentUser()) {
    if (!user || !eng) return false;
    if (eng.locked && user.role !== 'partner') return false;
    if (eng.status === 'signed' && !can('engagement.signoff', user)) return false;
    if (can('engagement.editAny', user)) return true;
    if (can('engagement.editOwn', user)) return eng.ownerId === user.id || eng.assignedTo === user.id;
    return false;
  }

  function canDelete(eng, user = currentUser()) {
    if (!user || !eng) return false;
    if (can('engagement.deleteAny', user)) return true;
    if (can('engagement.deleteOwn', user)) return eng.ownerId === user.id && eng.status !== 'signed';
    return false;
  }

  /** Engagements this user is allowed to see. */
  function visibleEngagements(user = currentUser()) {
    const all = Store.engagements();
    if (!user) return [];
    // Partners and managers see everything
    if (user.role === 'partner' || user.role === 'manager') return all;
    // Articles see only engagements they own or are a team member of
    return all.filter(e =>
      e.ownerId === user.id ||
      e.assignedTo === user.id ||
      (e.teamMembers || []).some(m => m.userId === user.id)
    );
  }

  const roleLabel = role => Store.ROLES[role]?.label || role;

  /* ---------------- Guards ---------------- */

  /**
   * Call at the top of a protected page. Redirects to sign-in when there is
   * no live session, preserving where the user was headed.
   */
  function requireAuth(opts = {}) {
    const u = currentUser();
    if (!u) {
      const back = encodeURIComponent(location.pathname.split('/').pop() + location.hash);
      location.replace('index.html?next=' + back);
      return null;
    }
    if (opts.perm && !can(opts.perm, u)) {
      location.replace('app.html?denied=1');
      return null;
    }
    return u;
  }

  /** Call on the sign-in page: an already-signed-in user should not see it. */
  function redirectIfSignedIn() {
    if (!isSignedIn()) return false;
    const next = new URLSearchParams(location.search).get('next');
    const safe = next && /^[a-z0-9._#-]+$/i.test(next) ? next : 'app.html';
    location.replace(safe);
    return true;
  }

  /** Idle watchdog. Signs the user out and returns them to the gate. */
  function startIdleWatch(onWarn) {
    let warned = false;
    const check = () => {
      const s = Store.getSession();
      if (!s) return;
      const left = new Date(s.expiresAt).getTime() - Date.now();
      if (left <= 0) {
        signOut(true);
        location.replace('index.html?expired=1');
      } else if (left < 120000 && !warned) {
        warned = true;
        onWarn?.(Math.ceil(left / 1000));
      } else if (left >= 120000) {
        warned = false;
      }
    };
    setInterval(check, 20000);
    ['click', 'keydown', 'input'].forEach(ev =>
      document.addEventListener(ev, U.debounce(() => { touch(); warned = false; }, 4000), { passive: true })
    );
    check();
  }

  return {
    PERMS, currentUser, isSignedIn, register, signIn, signOut,
    changePassword, resetPassword, can, canEdit, canDelete,
    visibleEngagements, roleLabel, requireAuth, redirectIfSignedIn,
    startIdleWatch, touch, sessionMinutes
  };
})();
