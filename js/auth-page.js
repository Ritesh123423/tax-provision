'use strict';

/**
 * AUTH-PAGE.JS — Controller for index.html.
 */

(() => {
  const { byId, esc } = U;

  // An existing session should never see the gate.
  if (Auth.redirectIfSignedIn()) return;

  const firm = Store.firm();
  const isFirstRun = Store.users().length === 0;

  /* ---------------- Brand from firm settings ---------------- */
  byId('brand-firm').textContent = firm.name;
  byId('brand-tag').textContent = firm.tagline;
  byId('brand-mark').textContent = firm.shortName;
  document.title = `Sign in — ${firm.name} Ind AS 12 Workpaper`;

  /* ---------------- First run and closed registration ---------------- */
  if (isFirstRun) {
    byId('bootstrap-banner').classList.remove('hide');
    show('register');
  } else if (!firm.allowSelfRegistration) {
    byId('tab-register').disabled = true;
    byId('tab-register').title = 'An administrator creates accounts for this firm.';
    byId('reg-sub').textContent = 'Registration is closed. Ask an administrator to create your account.';
  }

  /* ---------------- Notices from a redirect ---------------- */
  const params = new URLSearchParams(location.search);
  if (params.get('expired')) alert('warn', 'Your session timed out. Sign in again to continue.');
  if (params.get('signedout')) alert('ok', 'Signed out.');

  /* ---------------- Insecure-context warning ---------------- */
  if (!Hash.hasSubtle()) {
    byId('crypto-note').innerHTML =
      '<strong>Reduced password hashing.</strong> This page is open from the file system, ' +
      'where the browser withholds the Web Crypto API. Serve the folder over ' +
      '<span class="mono">http://localhost</span> or use the published URL for full-strength hashing.';
    byId('crypto-note').style.color = 'var(--flag)';
  }

  /* ---------------- Tabs ---------------- */

  function show(which) {
    const signin = which === 'signin';
    byId('tab-signin').setAttribute('aria-selected', String(signin));
    byId('tab-register').setAttribute('aria-selected', String(!signin));
    byId('pane-signin').classList.toggle('hide', !signin);
    byId('pane-register').classList.toggle('hide', signin);
    clearAlert();
    clearErrors();
    setTimeout(() => byId(signin ? 'si-email' : 'rg-name').focus(), 40);
  }

  byId('tab-signin').addEventListener('click', () => show('signin'));
  byId('tab-register').addEventListener('click', () => { if (!byId('tab-register').disabled) show('register'); });
  U.$$('[data-goto]').forEach(b => b.addEventListener('click', () => show(b.dataset.goto)));

  // Arrow keys move between tabs, as a tablist should.
  U.$$('.auth-tab').forEach(tab => tab.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = byId(e.target.id === 'tab-signin' ? 'tab-register' : 'tab-signin');
      if (!next.disabled) { next.focus(); show(next.id === 'tab-signin' ? 'signin' : 'register'); }
    }
  }));

  /* ---------------- Password visibility ---------------- */

  U.$$('[data-pw]').forEach(btn => btn.addEventListener('click', () => {
    const inp = byId(btn.dataset.pw);
    const showing = inp.type === 'text';
    inp.type = showing ? 'password' : 'text';
    btn.textContent = showing ? 'Show' : 'Hide';
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    inp.focus();
  }));

  /* ---------------- Messaging ---------------- */

  function alert(kind, msg) {
    const map = { err: 'notice-err', ok: 'notice-ok', warn: 'notice-warn', info: 'notice-info' };
    const tag = { err: 'Error', ok: 'Done', warn: 'Note', info: 'Note' };
    byId('auth-alert').innerHTML =
      `<div class="notice ${map[kind]}"><span class="notice-tag">${tag[kind]}</span><span>${esc(msg)}</span></div>`;
  }
  function clearAlert() { byId('auth-alert').innerHTML = ''; }

  function fieldError(id, msg) {
    const inp = byId(id);
    const err = byId(id + '-err');
    if (inp) inp.classList.toggle('bad', !!msg);
    if (inp && msg) inp.setAttribute('aria-invalid', 'true'); else inp?.removeAttribute('aria-invalid');
    if (err) { err.textContent = msg || ''; err.classList.toggle('hide', !msg); }
  }

  function clearErrors() {
    ['si-email', 'si-pw', 'rg-name', 'rg-email', 'rg-pw', 'rg-pw2'].forEach(id => fieldError(id, ''));
  }

  function busy(btnId, on, label) {
    const b = byId(btnId);
    if (!b) return;
    b.disabled = on;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; }
    else if (b.dataset.label) b.textContent = b.dataset.label;
  }

  /* ---------------- Strength meter ---------------- */

  byId('rg-pw').addEventListener('input', () => {
    const pw = byId('rg-pw').value;
    const st = Hash.strength(pw, firm.passwordMinLen);
    byId('rg-meter').dataset.score = pw ? String(st.score) : '0';
    byId('rg-pw-hint').textContent = pw
      ? `${st.label}. ${st.advice}`
      : `At least ${firm.passwordMinLen} characters, with mixed case and a number.`;
    if (pw) fieldError('rg-pw', '');
  });

  /* ---------------- Sign in ---------------- */

  byId('pane-signin').addEventListener('submit', async e => {
    e.preventDefault();
    clearAlert(); clearErrors();

    const email = byId('si-email').value.trim();
    const pw = byId('si-pw').value;
    let bad = false;
    if (!email) { fieldError('si-email', 'Enter your email.'); bad = true; }
    if (!pw) { fieldError('si-pw', 'Enter your password.'); bad = true; }
    if (bad) return;

    busy('si-submit', true, 'Checking…');
    const res = await Auth.signIn(email, pw);
    busy('si-submit', false);

    if (!res.ok) { alert('err', res.error); byId('si-pw').select(); return; }

    const next = params.get('next');
    const dest = next && /^[a-z0-9._#-]+$/i.test(next) ? next : 'app.html';
    location.replace(res.user.mustChangePassword ? 'app.html?changepw=1' : dest);
  });

  /* ---------------- Register ---------------- */

  byId('pane-register').addEventListener('submit', async e => {
    e.preventDefault();
    clearAlert(); clearErrors();

    const name = byId('rg-name').value.trim();
    const email = byId('rg-email').value.trim();
    const desig = byId('rg-desig').value.trim();
    const pw = byId('rg-pw').value;
    const pw2 = byId('rg-pw2').value;

    let bad = false;
    if (name.length < 2) { fieldError('rg-name', 'Enter your full name.'); bad = true; }
    if (!email) { fieldError('rg-email', 'Enter your email.'); bad = true; }
    if (!pw) { fieldError('rg-pw', 'Choose a password.'); bad = true; }
    else if (pw !== pw2) { fieldError('rg-pw2', 'The two passwords do not match.'); bad = true; }
    if (bad) return;

    busy('rg-submit', true, 'Creating…');
    const roleEl = document.querySelector('input[name="rg-role"]:checked');
    if (!roleEl && !isFirst) {
      document.getElementById('rg-role-err')?.classList.remove('hide');
      busy('rg-submit', false);
      return;
    }
    const chosenRole = roleEl ? roleEl.value : null;
    const res = await Auth.register({ name, email, designation: chosenRole ? '' : '', password: pw, role: chosenRole });

    if (!res.ok) {
      busy('rg-submit', false);
      if (res.field) fieldError('rg-' + res.field, res.error);
      alert('err', res.error);
      return;
    }

    // Sign straight in — asking someone to retype what they just chose is friction.
    const signed = await Auth.signIn(email, pw);
    busy('rg-submit', false);
    if (!signed.ok) { alert('ok', 'Account created. Sign in to continue.'); show('signin'); return; }
    location.replace('app.html?welcome=' + (res.isFirst ? 'admin' : '1'));
  });

  setTimeout(() => byId(isFirstRun ? 'rg-name' : 'si-email').focus(), 60);
})();
