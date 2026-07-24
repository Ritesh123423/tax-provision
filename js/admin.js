'use strict';

/**
 * ADMIN.JS — Console controller.
 *
 * Guarded by the `user.manage` permission, so only an administrator gets here.
 * Destructive actions ask for confirmation, and the ones that could lock
 * everybody out are blocked outright rather than merely warned about.
 */

(() => {
  const { byId, $$, esc } = U;

  const me = Auth.requireAuth({ perm: 'user.manage' });
  if (!me) return;

  const ROLES = Store.ROLES;
  let pane = 'overview';

  /* ==========================================================
     CHROME
     ========================================================== */

  function paintChrome() {
    const firm = Store.firm();
    byId('a-firm').textContent = firm.name;
    byId('a-mark').textContent = firm.shortName;
    byId('acct-name').textContent = me.name;
    byId('acct-initials').textContent = me.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  byId('btn-acct').addEventListener('click', () => { location.href = 'app.html'; });

  /* ==========================================================
     TABS
     ========================================================== */

  function go(next) {
    pane = next;
    $$('.a-tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.pane === next)));
    $$('.a-pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + next));
    if (location.hash !== '#' + next) history.replaceState(null, '', '#' + next);
    renderPane();
    window.scrollTo(0, 0);
  }

  $$('.a-tab').forEach(t => t.addEventListener('click', () => go(t.dataset.pane)));
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'overview'));

  function renderPane() {
    switch (pane) {
      case 'overview': renderOverview(); break;
      case 'users': renderUsers(); break;
      case 'engagements': renderEngagements(); break;
      case 'rates': renderRates(); break;
      case 'checklist': renderChecklist(); break;
      case 'log': renderLog(); break;
      case 'settings': fillSettings(); renderStorage(); break;
    }
    byId('c-users').textContent = Store.users().length;
    byId('c-engs').textContent = Store.engagements().length;
  }

  /* ==========================================================
     OVERVIEW
     ========================================================== */

  function renderOverview() {
    const users = Store.users();
    const engs = Store.engagements();
    const results = engs.map(e => ({ eng: e, res: Compute.run(e) }));
    const queries = results.filter(x => x.res.tallies.queries > 0).length;
    const signed = engs.filter(e => e.status === 'signed').length;

    byId('stat-strip').innerHTML = [
      ['People', users.length, `${users.filter(u => u.status === 'active').length} active · ${Store.adminCount()} administrator${Store.adminCount() === 1 ? '' : 's'}`],
      ['Engagements', engs.length, `${signed} signed off`],
      ['Needing attention', queries, queries ? 'Tallies not casting' : 'All clear'],
      ['Activity entries', Store.getLog().length, 'Newest first'],
      ['Storage used', (Store.usage() / 1024).toFixed(0) + ' KB', 'In this browser profile']
    ].map(([l, v, s]) => `
      <div class="a-stat">
        <div class="a-stat-l">${l}</div>
        <div class="a-stat-v">${typeof v === 'number' ? U.fmt(v) : esc(v)}</div>
        <div class="a-stat-s">${esc(s)}</div>
      </div>`).join('');

    byId('overview-notice').innerHTML = `
      <div class="notice notice-warn">
        <span class="notice-tag">Scope</span>
        <div><strong>This console administers one browser, not a server.</strong>
        Accounts and workpapers live in this browser profile alone. They do not
        sync to colleagues, and someone with access to this device can read the
        stored data directly. Take regular backups, and read the deployment note
        in the repository before putting live client data through it.</div>
      </div>`;

    const log = Store.getLog().slice(0, 9);
    byId('overview-log').innerHTML = log.length
      ? log.map(l => `<div class="log-row">
          <span class="log-ts">${U.relTime(l.ts)}</span>
          <span class="log-who">${esc(l.userName)}</span>
          <span class="log-what">${esc(l.action)}${l.detail ? ' — <b>' + esc(l.detail) + '</b>' : ''}</span>
        </div>`).join('')
      : '<div style="padding:22px;text-align:center" class="txt-mute">Nothing recorded yet.</div>';

    const attention = results.filter(x => x.res.tallies.queries > 0 || x.res.validation.errors.length).slice(0, 8);
    byId('overview-attention').innerHTML = attention.length
      ? attention.map(x => `<div class="log-row" style="grid-template-columns:1fr auto">
          <span>
            <b>${esc(x.eng.name || 'Untitled')}</b>
            <span class="log-ts"> · ${esc(x.eng.fy)}</span>
          </span>
          <span class="badge badge-flag">${x.res.tallies.queries + x.res.validation.errors.length} open</span>
        </div>`).join('')
      : '<div style="padding:22px;text-align:center" class="txt-mute">Every engagement casts.</div>';
  }

  /* ==========================================================
     PEOPLE
     ========================================================== */

  ['u-search', 'u-role', 'u-status'].forEach(id =>
    byId(id).addEventListener('input', U.debounce(renderUsers, 140)));

  function renderUsers() {
    const q = byId('u-search').value.trim();
    const role = byId('u-role').value;
    const status = byId('u-status').value;

    let list = Store.users();
    if (role !== 'all') list = list.filter(u => u.role === role);
    if (status !== 'all') list = list.filter(u => u.status === status);
    if (q) list = list.filter(u => U.matches(u, q, ['name', 'email', 'designation']));
    list = list.slice().sort((a, b) => (ROLES[b.role]?.rank || 0) - (ROLES[a.role]?.rank || 0) || a.name.localeCompare(b.name));

    const lastAdmin = Store.adminCount() <= 1;

    byId('u-body').innerHTML = list.length ? list.map(u => {
      const isMe = u.id === me.id;
      const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
      const protectedAdmin = lastAdmin && u.role === 'admin' && u.status === 'active';
      return `<tr>
        <td>
          <div class="u-cell">
            <span class="avatar">${esc(u.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>
            <span style="min-width:0">
              <span class="u-name">${esc(u.name)}${isMe ? ' <span class="u-you">· you</span>' : ''}</span>
              <span class="u-mail">${esc(u.email)}</span>
              ${u.designation ? `<span class="u-mail">${esc(u.designation)}</span>` : ''}
            </span>
          </div>
        </td>
        <td>
          <select class="ti" data-act="role" data-id="${esc(u.id)}" ${protectedAdmin ? 'disabled title="The last administrator cannot change role"' : ''}>
            ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select>
        </td>
        <td>
          <span class="row" style="gap:6px">
            <span class="dot dot-${locked ? 'locked' : u.status}"></span>
            <span>${locked ? 'Locked' : u.status === 'active' ? 'Active' : 'Suspended'}</span>
          </span>
          ${u.mustChangePassword ? '<div class="hint">Must change password</div>' : ''}
        </td>
        <td class="mono" style="font-size:var(--fs-xs)">${u.lastLoginAt ? U.relTime(u.lastLoginAt) : 'Never'}</td>
        <td class="r">
          <span class="row" style="gap:4px;justify-content:flex-end;flex-wrap:wrap">
            <button class="btn btn-quiet btn-sm" data-act="edit-user" data-id="${esc(u.id)}">Edit</button>
            <button class="btn btn-quiet btn-sm" data-act="reset-pw" data-id="${esc(u.id)}">Reset password</button>
            ${locked ? `<button class="btn btn-quiet btn-sm" data-act="unlock" data-id="${esc(u.id)}">Unlock</button>` : ''}
            ${isMe || protectedAdmin ? '' : `
              <button class="btn btn-quiet btn-sm" data-act="toggle-user" data-id="${esc(u.id)}">${u.status === 'active' ? 'Suspend' : 'Restore'}</button>
              <button class="btn btn-quiet btn-sm" style="color:var(--dtl)" data-act="del-user" data-id="${esc(u.id)}">Delete</button>`}
          </span>
        </td>
      </tr>`;
    }).join('') : '<tr class="empty-row"><td colspan="5">Nobody matches those filters.</td></tr>';

    const perms = ['engagement.create', 'engagement.editAny', 'engagement.editOwn', 'engagement.signoff', 'engagement.deleteAny', 'user.manage', 'rate.manage', 'log.view'];
    const label = { 'engagement.create': 'Create engagements', 'engagement.editAny': 'Edit any engagement', 'engagement.editOwn': 'Edit own engagements', 'engagement.signoff': 'Sign off', 'engagement.deleteAny': 'Delete any engagement', 'user.manage': 'Manage people', 'rate.manage': 'Manage rate master', 'log.view': 'View activity' };
    byId('role-matrix').innerHTML = `
      <thead><tr><th>Capability</th>${Object.values(ROLES).map(r => `<th class="c">${esc(r.label)}</th>`).join('')}</tr></thead>
      <tbody>${perms.map(p => `<tr>
        <td>${label[p]}</td>
        ${Object.keys(ROLES).map(k => `<td class="c">${Auth.PERMS[k].includes(p) ? '<span class="txt-dta">✓</span>' : '<span class="txt-mute">—</span>'}</td>`).join('')}
      </tr>`).join('')}</tbody>`;
  }

  byId('btn-add-user').addEventListener('click', () => userDialog(null));

  function userDialog(existing) {
    const isNew = !existing;
    U.modal({
      title: isNew ? 'Add a person' : 'Edit ' + existing.name,
      body: `<div class="stack gap-16">
        <div class="field">
          <label class="lbl" for="ud-name">Full name</label>
          <input class="inp" id="ud-name" value="${esc(existing?.name || '')}" style="text-align:left" data-autofocus>
        </div>
        <div class="field">
          <label class="lbl" for="ud-email">Email</label>
          <input class="inp" id="ud-email" type="email" value="${esc(existing?.email || '')}" style="text-align:left">
        </div>
        <div class="field">
          <label class="lbl" for="ud-desig">Designation <span class="opt">optional</span></label>
          <input class="inp" id="ud-desig" value="${esc(existing?.designation || '')}" style="text-align:left" placeholder="Audit Manager">
        </div>
        <div class="field">
          <label class="lbl" for="ud-role">Role</label>
          <select class="inp" id="ud-role">
            ${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${(existing?.role || 'preparer') === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}
          </select>
          <p class="hint" id="ud-role-note"></p>
        </div>
        ${isNew ? `<div class="field">
          <label class="lbl" for="ud-pw">Temporary password</label>
          <input class="inp mono" id="ud-pw" value="${esc(Hash.tempPassword())}" style="text-align:left">
          <p class="hint">Hand this over securely. They will be asked to choose their own on first sign-in.</p>
        </div>` : ''}
        <p class="err-txt hide" id="ud-err"></p>
      </div>`,
      footer: `<button class="btn btn-line" data-c>Cancel</button>
               <button class="btn btn-primary" data-s>${isNew ? 'Create account' : 'Save changes'}</button>`,
      onOpen: (root, close) => {
        const note = root.querySelector('#ud-role-note');
        const roleSel = root.querySelector('#ud-role');
        const paint = () => { note.textContent = ROLES[roleSel.value].blurb; };
        roleSel.addEventListener('change', paint); paint();

        const err = root.querySelector('#ud-err');
        const fail = m => { err.textContent = m; err.classList.remove('hide'); };

        root.querySelector('[data-c]').addEventListener('click', close);
        root.querySelector('[data-s]').addEventListener('click', async () => {
          err.classList.add('hide');
          const name = root.querySelector('#ud-name').value.trim();
          const email = root.querySelector('#ud-email').value.trim().toLowerCase();
          const desig = root.querySelector('#ud-desig').value.trim();
          const role = roleSel.value;

          if (name.length < 2) return fail('Enter a full name.');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail('Enter a valid email address.');
          const clash = Store.userByEmail(email);
          if (clash && clash.id !== existing?.id) return fail('Another account already uses that email.');

          if (isNew) {
            const pw = root.querySelector('#ud-pw').value;
            if (Hash.strength(pw, Store.firm().passwordMinLen).score < 2) return fail('Choose a stronger temporary password.');
            const derived = await Hash.derive(pw);
            Store.addUser({
              name, email, designation: desig, role,
              algo: derived.algo, salt: derived.salt, iter: derived.iter, hash: derived.hash,
              mustChangePassword: true
            });
            Store.log('Created account', `${name} <${email}> as ${ROLES[role].label}`);
            close();
            U.modal({
              title: 'Account created',
              body: `<p class="lede">Give ${esc(name)} this temporary password. They will choose their own on first sign-in.</p>
                     <div class="temp-pw">${esc(root.querySelector('#ud-pw')?.value || '')}</div>`,
              footer: '<button class="btn btn-primary" data-close>Done</button>',
              onOpen: (r2, c2) => r2.querySelector('[data-close]').addEventListener('click', c2)
            });
          } else {
            // Never let the console remove the last route back in.
            if (existing.role === 'admin' && role !== 'admin' && Store.adminCount() <= 1)
              return fail('This is the only active administrator. Promote someone else first.');
            Store.updateUser(existing.id, { name, email, designation: desig, role });
            Store.log('Updated account', `${name} <${email}>`);
            close();
            U.toast('Account updated', 'ok');
          }
          renderUsers();
        });
      }
    });
  }

  /* ==========================================================
     ENGAGEMENTS
     ========================================================== */

  ['e-search', 'e-status'].forEach(id => byId(id).addEventListener('input', U.debounce(renderEngagements, 140)));

  function renderEngagements() {
    const q = byId('e-search').value.trim();
    const status = byId('e-status').value;
    let list = Store.engagements();
    if (status !== 'all') list = list.filter(e => e.status === status);
    if (q) list = list.filter(e => U.matches(e, q, ['name', 'cin', 'pan', 'fy']));
    list = list.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    byId('e-body').innerHTML = list.length ? list.map(eng => {
      const res = Compute.run(eng);
      const owner = Store.userById(eng.ownerId);
      const q2 = res.tallies.queries;
      return `<tr>
        <td>
          <div class="u-name">${esc(eng.name || 'Untitled')}</div>
          <div class="u-mail">${esc(eng.cin || eng.pan || 'No identifier')} · updated ${U.relTime(eng.updatedAt)}</div>
        </td>
        <td class="mono">${esc(eng.fy || '—')}</td>
        <td>
          <span class="badge ${eng.status === 'signed' ? 'badge-dta' : eng.status === 'review' ? 'badge-flag' : 'badge-neutral'}">
            ${eng.status === 'signed' ? 'Signed' : eng.status === 'review' ? 'Review' : 'Draft'}</span>
          ${eng.locked ? '<div class="hint">Locked</div>' : ''}
        </td>
        <td>
          <select class="ti" data-act="reassign" data-id="${esc(eng.id)}">
            <option value="">Unassigned</option>
            ${Store.users().map(u => `<option value="${esc(u.id)}" ${eng.ownerId === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
          </select>
        </td>
        <td class="r mono">${U.fmtBr(res.te.total)}</td>
        <td class="c">${q2 ? `<span class="badge badge-flag">${q2}</span>` : '<span class="txt-dta">✓</span>'}</td>
        <td class="r">
          <span class="row" style="gap:4px;justify-content:flex-end;flex-wrap:wrap">
            <a class="btn btn-quiet btn-sm" href="app.html#client" data-act="open-eng" data-id="${esc(eng.id)}">Open</a>
            <button class="btn btn-quiet btn-sm" data-act="lock-eng" data-id="${esc(eng.id)}">${eng.locked ? 'Unlock' : 'Lock'}</button>
            <button class="btn btn-quiet btn-sm" data-act="dup-eng" data-id="${esc(eng.id)}">Duplicate</button>
            <button class="btn btn-quiet btn-sm" style="color:var(--dtl)" data-act="del-eng" data-id="${esc(eng.id)}">Delete</button>
          </span>
        </td>
      </tr>`;
    }).join('') : '<tr class="empty-row"><td colspan="7">No engagements match those filters.</td></tr>';
  }

  /* ==========================================================
     RATE MASTER
     ========================================================== */

  function renderRates() {
    byId('r-body').innerHTML = Store.rates().map(r => `<tr>
      <td class="mono">${esc(r.code)}${r.isDefault ? ' <span class="badge badge-indigo">Default</span>' : ''}</td>
      <td>
        <div>${esc(r.label)}</div>
        ${r.note ? `<div class="hint">${esc(r.note)}</div>` : ''}
      </td>
      <td class="r mono">${r.base}%</td>
      <td class="r mono">${r.surcharge}%</td>
      <td class="r mono">${r.cess}%</td>
      <td class="r mono"><strong>${r.rate.toFixed(3)}%</strong></td>
      <td class="r mono">${r.matRate ? r.matRate.toFixed(3) + '%' : '—'}</td>
      <td class="c"><span class="badge ${r.active ? 'badge-dta' : 'badge-neutral'}">${r.active ? 'Active' : 'Hidden'}</span></td>
      <td class="r">
        <span class="row" style="gap:4px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-quiet btn-sm" data-act="edit-rate" data-id="${esc(r.id)}">Edit</button>
          <button class="btn btn-quiet btn-sm" data-act="toggle-rate" data-id="${esc(r.id)}">${r.active ? 'Hide' : 'Show'}</button>
          <button class="btn btn-quiet btn-sm" style="color:var(--dtl)" data-act="del-rate" data-id="${esc(r.id)}">Delete</button>
        </span>
      </td>
    </tr>`).join('');
  }

  byId('btn-add-rate').addEventListener('click', () => rateDialog(null));

  function rateDialog(existing) {
    const r = existing || { id: U.uid('rt'), code: '', label: '', base: 22, surcharge: 10, cess: 4, rate: 25.168, matRate: 0, note: '', active: true, isDefault: false };
    U.modal({
      title: existing ? 'Edit regime' : 'Add regime',
      body: `<div class="stack gap-16">
        <div class="fg c2">
          <div class="field"><label class="lbl" for="rd-code">Code</label>
            <input class="inp mono" id="rd-code" value="${esc(r.code)}" placeholder="115BAA" style="text-align:left" data-autofocus></div>
          <div class="field"><label class="lbl" for="rd-label">Label</label>
            <input class="inp" id="rd-label" value="${esc(r.label)}" placeholder="New regime — s.115BAA" style="text-align:left"></div>
        </div>
        <div class="fg c3">
          <div class="field"><label class="lbl" for="rd-base">Base rate (%)</label>
            <input class="inp mono" id="rd-base" type="number" step="0.01" value="${r.base}"></div>
          <div class="field"><label class="lbl" for="rd-sur">Surcharge (%)</label>
            <input class="inp mono" id="rd-sur" type="number" step="0.01" value="${r.surcharge}"></div>
          <div class="field"><label class="lbl" for="rd-cess">Cess (%)</label>
            <input class="inp mono" id="rd-cess" type="number" step="0.01" value="${r.cess}"></div>
        </div>
        <div class="notice notice-info">
          <span class="notice-tag">Effective</span>
          <span id="rd-calc">—</span>
        </div>
        <div class="fg c2">
          <div class="field"><label class="lbl" for="rd-eff">Effective rate (%)</label>
            <input class="inp mono" id="rd-eff" type="number" step="0.001" value="${r.rate}">
            <p class="hint">Computed above, but you can override it.</p></div>
          <div class="field"><label class="lbl" for="rd-mat">MAT rate (%)</label>
            <input class="inp mono" id="rd-mat" type="number" step="0.001" value="${r.matRate}">
            <p class="hint">Enter 0 where MAT does not apply.</p></div>
        </div>
        <div class="field"><label class="lbl" for="rd-note">Note</label>
          <input class="inp" id="rd-note" value="${esc(r.note)}" style="text-align:left"></div>
        <label class="chk"><input type="checkbox" id="rd-default" ${r.isDefault ? 'checked' : ''}>
          <span>Offer this regime first on new engagements</span></label>
        <p class="err-txt hide" id="rd-err"></p>
      </div>`,
      footer: `<button class="btn btn-line" data-c>Cancel</button><button class="btn btn-primary" data-s>Save regime</button>`,
      onOpen: (root, close) => {
        const calc = () => {
          const b = U.toNum(root.querySelector('#rd-base').value);
          const s = U.toNum(root.querySelector('#rd-sur').value);
          const c = U.toNum(root.querySelector('#rd-cess').value);
          const eff = b * (1 + s / 100) * (1 + c / 100);
          root.querySelector('#rd-calc').textContent =
            `${b}% × (1 + ${s}% surcharge) × (1 + ${c}% cess) = ${eff.toFixed(3)}%`;
          return eff;
        };
        ['#rd-base', '#rd-sur', '#rd-cess'].forEach(sel =>
          root.querySelector(sel).addEventListener('input', () => {
            root.querySelector('#rd-eff').value = calc().toFixed(3);
          }));
        calc();

        const err = root.querySelector('#rd-err');
        root.querySelector('[data-c]').addEventListener('click', close);
        root.querySelector('[data-s]').addEventListener('click', () => {
          const code = root.querySelector('#rd-code').value.trim();
          const label = root.querySelector('#rd-label').value.trim();
          if (!code || !label) {
            err.textContent = 'Both a code and a label are needed.';
            err.classList.remove('hide');
            return;
          }
          Store.saveRate({
            id: r.id, code, label,
            base: U.toNum(root.querySelector('#rd-base').value),
            surcharge: U.toNum(root.querySelector('#rd-sur').value),
            cess: U.toNum(root.querySelector('#rd-cess').value),
            rate: U.toNum(root.querySelector('#rd-eff').value),
            matRate: U.toNum(root.querySelector('#rd-mat').value),
            note: root.querySelector('#rd-note').value.trim(),
            active: r.active !== false,
            isDefault: root.querySelector('#rd-default').checked
          });
          Store.log(existing ? 'Updated tax regime' : 'Added tax regime', `${code} at ${root.querySelector('#rd-eff').value}%`);
          close();
          renderRates();
          U.toast('Regime saved', 'ok');
        });
      }
    });
  }

  /* ==========================================================
     CHECKLIST TEMPLATE
     ========================================================== */

  function renderChecklist() {
    const tpl = Store.checklistTemplate();
    byId('chk-body').innerHTML = tpl.map((c, i) => `<tr>
      <td><span class="badge badge-neutral">${esc(c.group)}</span></td>
      <td>${esc(c.text)}</td>
      <td class="mono" style="font-size:var(--fs-xs)">${esc(c.ref)}</td>
      <td class="r">
        <span class="row" style="gap:4px;justify-content:flex-end">
          <button class="btn btn-quiet btn-sm" data-act="move-chk" data-id="${esc(c.id)}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn btn-quiet btn-sm" data-act="move-chk" data-id="${esc(c.id)}" data-dir="1" ${i === tpl.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="btn btn-quiet btn-sm" data-act="edit-chk" data-id="${esc(c.id)}">Edit</button>
          <button class="btn btn-quiet btn-sm" style="color:var(--dtl)" data-act="del-chk" data-id="${esc(c.id)}">Delete</button>
        </span>
      </td>
    </tr>`).join('');
  }

  byId('btn-add-chk').addEventListener('click', () => chkDialog(null));

  byId('btn-reset-chk').addEventListener('click', async () => {
    const ok = await U.confirmDialog({
      title: 'Restore the default checklist?',
      message: 'Your edits to the template will be replaced by the twenty-two default points. Marks already recorded on engagements are kept.',
      confirmLabel: 'Restore defaults', danger: true
    });
    if (!ok) return;
    Store.resetChecklistTemplate();
    Store.log('Restored the default checklist template');
    renderChecklist();
    U.toast('Defaults restored', 'ok');
  });

  function chkDialog(existing) {
    const c = existing || { id: U.uid('ck'), group: 'Approach', text: '', ref: '' };
    const groups = [...new Set(Store.checklistTemplate().map(x => x.group))];
    U.modal({
      title: existing ? 'Edit checklist point' : 'Add checklist point',
      body: `<div class="stack gap-16">
        <div class="field"><label class="lbl" for="ck-group">Group</label>
          <input class="inp" id="ck-group" list="ck-groups" value="${esc(c.group)}" style="text-align:left" data-autofocus>
          <datalist id="ck-groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></div>
        <div class="field"><label class="lbl" for="ck-text">Point</label>
          <textarea class="inp" id="ck-text" rows="3">${esc(c.text)}</textarea></div>
        <div class="field"><label class="lbl" for="ck-ref">Reference</label>
          <input class="inp mono" id="ck-ref" value="${esc(c.ref)}" placeholder="Ind AS 12.47" style="text-align:left"></div>
      </div>`,
      footer: `<button class="btn btn-line" data-c>Cancel</button><button class="btn btn-primary" data-s>Save point</button>`,
      onOpen: (root, close) => {
        root.querySelector('[data-c]').addEventListener('click', close);
        root.querySelector('[data-s]').addEventListener('click', () => {
          const text = root.querySelector('#ck-text').value.trim();
          if (!text) { U.toast('Enter the point.', 'err'); return; }
          Store.saveChecklistItem({
            id: c.id,
            group: root.querySelector('#ck-group').value.trim() || 'General',
            text,
            ref: root.querySelector('#ck-ref').value.trim()
          });
          Store.log(existing ? 'Edited a checklist point' : 'Added a checklist point', text.slice(0, 60));
          close();
          renderChecklist();
          U.toast('Point saved', 'ok');
        });
      }
    });
  }

  /* ==========================================================
     ACTIVITY LOG
     ========================================================== */

  byId('l-search').addEventListener('input', U.debounce(renderLog, 160));

  function renderLog() {
    const q = byId('l-search').value.trim();
    let log = Store.getLog();
    if (q) log = log.filter(l => U.matches(l, q, ['action', 'detail', 'userName']));

    byId('log-body').innerHTML = log.length
      ? log.slice(0, 400).map(l => `<div class="log-row">
          <span class="log-ts">${U.fmtDateTime(l.ts)}</span>
          <span class="log-who">${esc(l.userName)}</span>
          <span class="log-what">${esc(l.action)}${l.detail ? ' — <b>' + esc(l.detail) + '</b>' : ''}</span>
        </div>`).join('') + (log.length > 400 ? `<div class="log-row"><span></span><span></span><span class="txt-mute">Showing the most recent 400 of ${U.fmt(log.length)}. Download the log for the rest.</span></div>` : '')
      : '<div style="padding:30px;text-align:center" class="txt-mute">Nothing matches.</div>';
  }

  byId('btn-log-export').addEventListener('click', () => {
    const rows = [['Timestamp', 'Person', 'Action', 'Detail']];
    Store.getLog().forEach(l => rows.push([l.ts, l.userName, l.action, l.detail || '']));
    const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(',')).join('\r\n');
    U.download(`ActivityLog_${U.todayISO()}.csv`, '\ufeff' + csv, 'text/csv;charset=utf-8');
    U.toast('Log downloaded', 'ok');
  });

  byId('btn-log-clear').addEventListener('click', async () => {
    const ok = await U.confirmDialog({
      title: 'Clear the activity log?',
      message: 'Every recorded action will be removed. Download the log first if you need it for the file.',
      confirmLabel: 'Clear log', danger: true
    });
    if (!ok) return;
    Store.clearLog();
    Store.log('Cleared the activity log');
    renderLog();
    U.toast('Log cleared', 'ok');
  });

  /* ==========================================================
     SETTINGS
     ========================================================== */

  const S_FIELDS = [
    ['s-name', 'name', 'str'], ['s-tag', 'tagline', 'str'], ['s-short', 'shortName', 'str'],
    ['s-session', 'sessionMinutes', 'num'], ['s-minlen', 'passwordMinLen', 'num'],
    ['s-maxfail', 'maxFailedLogins', 'num'], ['s-lockout', 'lockoutMinutes', 'num'],
    ['s-selfreg', 'allowSelfRegistration', 'bool']
  ];

  function fillSettings() {
    const firm = Store.firm();
    S_FIELDS.forEach(([id, key, kind]) => {
      const el = byId(id);
      if (kind === 'bool') el.checked = !!firm[key];
      else el.value = firm[key] ?? '';
    });
  }

  byId('btn-save-settings').addEventListener('click', () => {
    const patch = {};
    S_FIELDS.forEach(([id, key, kind]) => {
      const el = byId(id);
      patch[key] = kind === 'bool' ? el.checked : kind === 'num' ? U.toNum(el.value) : el.value.trim();
    });
    if (!patch.name) { U.toast('The firm name cannot be blank.', 'err'); return; }
    patch.sessionMinutes = U.clamp(patch.sessionMinutes, 5, 1440);
    patch.passwordMinLen = U.clamp(patch.passwordMinLen, 8, 64);
    patch.maxFailedLogins = U.clamp(patch.maxFailedLogins, 3, 20);
    patch.lockoutMinutes = U.clamp(patch.lockoutMinutes, 1, 1440);

    Store.saveFirm(patch);
    Store.log('Updated firm settings');
    paintChrome();
    fillSettings();
    byId('s-saved').textContent = 'Saved ' + new Date().toLocaleTimeString('en-IN');
    U.toast('Settings saved', 'ok');
  });

  function renderStorage() {
    const bytes = Store.usage();
    const pct = Math.min(100, Math.round(bytes / (5 * 1024 * 1024) * 100));
    byId('storage-body').innerHTML = `
      <p class="lede mb-16">Everything sits in this browser's local storage under the key
        <span class="mono">${esc(Store.KEY)}</span>. Clearing site data in browser settings
        erases it, and a private window will not see it at all.</p>
      <div class="prog-bar" style="height:8px"><div class="prog-fill" style="width:${pct}%"></div></div>
      <p class="hint mt-8">${(bytes / 1024).toFixed(1)} KB used of roughly 5 MB available — about ${pct}%.
        ${Hash.hasSubtle()
          ? 'Passwords are hashed with PBKDF2-SHA256 at ' + U.fmt(Hash.ITER_WEBCRYPTO) + ' iterations.'
          : '<strong class="txt-flag">Web Crypto is unavailable here, so a slower fallback with fewer iterations is in use. Serve the site over https or http://localhost.</strong>'}</p>`;
  }

  byId('btn-backup').addEventListener('click', () => {
    U.download(`WorkpaperBackup_${U.todayISO()}.json`, Store.exportAll());
    Store.log('Downloaded a full backup');
    U.toast('Backup downloaded', 'ok');
  });

  byId('btn-restore').addEventListener('click', async () => {
    const ok = await U.confirmDialog({
      title: 'Restore from a backup?',
      message: 'Everything currently in this browser — accounts, engagements and history — will be replaced by the file you choose.',
      confirmLabel: 'Choose a file', danger: true, requireText: 'RESTORE'
    });
    if (!ok) return;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.addEventListener('change', async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        Store.importAll(await file.text());
        Store.log('Restored from a backup', file.name);
        U.toast('Backup restored. Reloading…', 'ok');
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        U.toast(err.message || 'That file could not be read as a backup.', 'err', 6000);
      }
    });
    inp.click();
  });

  byId('btn-wipe').addEventListener('click', async () => {
    const ok = await U.confirmDialog({
      title: 'Erase everything?',
      message: `<strong>${Store.users().length} account${Store.users().length === 1 ? '' : 's'}, ${Store.engagements().length} engagement${Store.engagements().length === 1 ? '' : 's'}</strong> and the full activity log will be removed from this browser. There is no undo. Download a backup first.`,
      confirmLabel: 'Erase everything', danger: true, requireText: 'ERASE'
    });
    if (!ok) return;
    Store.factoryReset();
    location.replace('index.html');
  });

  /* ==========================================================
     DELEGATED ACTIONS
     ========================================================== */

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;

    switch (el.dataset.act) {
      case 'edit-user': userDialog(Store.userById(id)); break;

      case 'toggle-user': {
        const u = Store.userById(id);
        const next = u.status === 'active' ? 'suspended' : 'active';
        if (next === 'suspended' && u.role === 'admin' && Store.adminCount() <= 1) {
          U.toast('This is the only active administrator. Promote someone else first.', 'err', 5000);
          return;
        }
        Store.updateUser(id, { status: next });
        Store.log(next === 'active' ? 'Restored account' : 'Suspended account', u.email);
        renderUsers();
        U.toast(next === 'active' ? 'Account restored' : 'Account suspended', 'ok');
        break;
      }

      case 'unlock':
        Store.updateUser(id, { lockedUntil: null, failCount: 0 });
        Store.log('Unlocked account', Store.userById(id)?.email);
        renderUsers();
        U.toast('Account unlocked', 'ok');
        break;

      case 'del-user': {
        const u = Store.userById(id);
        const owned = Store.engagements().filter(x => x.ownerId === id).length;
        const ok = await U.confirmDialog({
          title: `Delete ${u.name}?`,
          message: `Their account will be removed.${owned ? ` The <strong>${owned}</strong> engagement${owned === 1 ? '' : 's'} they own will stay, marked unassigned.` : ''}`,
          confirmLabel: 'Delete account', danger: true
        });
        if (!ok) break;
        Store.deleteUser(id);
        Store.log('Deleted account', u.email);
        renderUsers();
        U.toast('Account deleted', 'ok');
        break;
      }

      case 'reset-pw': {
        const u = Store.userById(id);
        const ok = await U.confirmDialog({
          title: `Reset the password for ${u.name}?`,
          message: 'Their current password stops working immediately. You will be given a temporary one to hand over.',
          confirmLabel: 'Reset password'
        });
        if (!ok) break;
        const res = await Auth.resetPassword(id);
        if (!res.ok) { U.toast(res.error, 'err'); break; }
        U.modal({
          title: 'Temporary password',
          body: `<p class="lede">Give this to ${esc(u.name)} securely. They will be asked to choose their own on first sign-in.</p>
                 <div class="temp-pw">${esc(res.temp)}</div>`,
          footer: '<button class="btn btn-line" data-copy>Copy</button><button class="btn btn-primary" data-close>Done</button>',
          onOpen: (root, close) => {
            root.querySelector('[data-close]').addEventListener('click', close);
            root.querySelector('[data-copy]').addEventListener('click', async () => {
              U.toast(await U.copyText(res.temp) ? 'Copied' : 'Could not reach the clipboard', 'ok');
            });
          }
        });
        renderUsers();
        break;
      }

      case 'open-eng':
        try { localStorage.setItem('kgs.lastEngagement', id); } catch {}
        break;

      case 'lock-eng': {
        const eng = Store.engagementById(id);
        eng.locked = !eng.locked;
        Store.saveEngagement(eng);
        Store.log(eng.locked ? 'Locked engagement' : 'Unlocked engagement', eng.name || 'Untitled', id);
        renderEngagements();
        U.toast(eng.locked ? 'Engagement locked' : 'Engagement unlocked', 'ok');
        break;
      }

      case 'dup-eng':
        Store.duplicateEngagement(id, me.id);
        Store.log('Duplicated engagement', Store.engagementById(id)?.name || '');
        renderEngagements();
        U.toast('Engagement duplicated', 'ok');
        break;

      case 'del-eng': {
        const eng = Store.engagementById(id);
        const ok = await U.confirmDialog({
          title: 'Delete this engagement?',
          message: `<strong>${esc(eng.name || 'Untitled')}</strong> (${esc(eng.fy)}) and all its figures will be removed. Download a backup first if you need to keep it.`,
          confirmLabel: 'Delete engagement', danger: true
        });
        if (!ok) break;
        Store.deleteEngagement(id);
        Store.log('Deleted engagement', eng.name || 'Untitled', id);
        renderEngagements();
        U.toast('Engagement deleted', 'ok');
        break;
      }

      case 'edit-rate': rateDialog(Store.rateById(id)); break;

      case 'toggle-rate': {
        const r = Store.rateById(id);
        Store.saveRate({ ...r, active: !r.active });
        Store.log(r.active ? 'Hid tax regime' : 'Showed tax regime', r.code);
        renderRates();
        break;
      }

      case 'del-rate': {
        const r = Store.rateById(id);
        const inUse = Store.engagements().filter(x => x.rateId === id).length;
        const ok = await U.confirmDialog({
          title: `Delete the ${r.code} regime?`,
          message: inUse
            ? `<strong>${inUse}</strong> engagement${inUse === 1 ? '' : 's'} use${inUse === 1 ? 's' : ''} this regime. Their rates stay as entered, but the regime will no longer be selectable. Hiding it may suit better than deleting.`
            : 'It will no longer be offered on new engagements.',
          confirmLabel: 'Delete regime', danger: true
        });
        if (!ok) break;
        Store.deleteRate(id);
        Store.log('Deleted tax regime', r.code);
        renderRates();
        U.toast('Regime deleted', 'ok');
        break;
      }

      case 'edit-chk': chkDialog(Store.checklistTemplate().find(c => c.id === id)); break;

      case 'move-chk': {
        const dir = Number(el.dataset.dir);
        Store.commit(db => {
          const arr = db.checklistTemplate;
          const i = arr.findIndex(c => c.id === id);
          const j = i + dir;
          if (i < 0 || j < 0 || j >= arr.length) return;
          [arr[i], arr[j]] = [arr[j], arr[i]];
        });
        renderChecklist();
        break;
      }

      case 'del-chk': {
        const item = Store.checklistTemplate().find(c => c.id === id);
        const ok = await U.confirmDialog({
          title: 'Delete this checklist point?',
          message: `“${esc(item.text)}” will no longer appear on any workpaper.`,
          confirmLabel: 'Delete point', danger: true
        });
        if (!ok) break;
        Store.deleteChecklistItem(id);
        Store.log('Deleted a checklist point', item.text.slice(0, 60));
        renderChecklist();
        U.toast('Point deleted', 'ok');
        break;
      }
    }
  });

  /* Inline selects: role and engagement owner */
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.act === 'role') {
      const u = Store.userById(el.dataset.id);
      if (u.role === 'admin' && el.value !== 'admin' && Store.adminCount() <= 1) {
        U.toast('This is the only active administrator. Promote someone else first.', 'err', 5000);
        renderUsers();
        return;
      }
      Store.updateUser(u.id, { role: el.value });
      Store.log('Changed role', `${u.email} → ${ROLES[el.value].label}`);
      renderUsers();
      U.toast(`${u.name} is now ${ROLES[el.value].label.toLowerCase()}`, 'ok');
    }
    if (el.dataset.act === 'reassign') {
      const eng = Store.engagementById(el.dataset.id);
      eng.ownerId = el.value || null;
      eng.assignedTo = el.value || null;
      Store.saveEngagement(eng);
      Store.log('Reassigned engagement', `${eng.name || 'Untitled'} → ${Store.userById(el.value)?.name || 'unassigned'}`, eng.id);
      U.toast('Engagement reassigned', 'ok');
    }
  });

  /* ==========================================================
     BOOT
     ========================================================== */

  paintChrome();
  Auth.startIdleWatch(() => U.toast('Your session is about to end. Any key keeps it open.', 'warn', 8000));
  go(location.hash.slice(1) || 'overview');
})();
