'use strict';

/**
 * UI.JS — Controller for app.html.
 *
 * All interaction is delegated from a small number of roots, so re-rendering a
 * table never leaves a dangling listener and never needs inline handlers.
 */

(() => {
  const { byId, $$, esc } = U;

  const user = Auth.requireAuth();
  if (!user) return;

  // A back-forward cache restore re-shows the fully rendered page without
  // re-running any script, so a sign-out followed by the Back button can
  // otherwise display a live, still-interactive session that no longer exists.
  window.addEventListener('pageshow', e => { if (e.persisted) Auth.requireAuth(); });

  let step = 'portfolio';
  let showOpenCols = false;
  let editable = false;

  /* ==========================================================
     CHROME
     ========================================================== */

  const firm = Store.firm();
  byId('hdr-firm').textContent = firm.name;
  byId('hdr-tag').textContent = firm.tagline;
  byId('hdr-mark').textContent = firm.shortName;

  const initials = user.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  byId('acct-initials').textContent = initials || '?';
  byId('acct-role').textContent = Auth.roleLabel(user.role);
  if (Auth.can('user.manage')) byId('btn-admin').classList.remove('hide');

  if (new URLSearchParams(location.search).get('denied')) {
    U.toast('You do not have access to that area.', 'err', 5000);
  }

  /* ---------------- Account menu ---------------- */

  let acctMenu = null;
  function closeAcct() { acctMenu?.remove(); acctMenu = null; byId('btn-acct').setAttribute('aria-expanded', 'false'); }

  byId('btn-acct').addEventListener('click', e => {
    e.stopPropagation();
    if (acctMenu) return closeAcct();
    acctMenu = document.createElement('div');
    acctMenu.className = 'acct-menu';
    acctMenu.setAttribute('role', 'menu');
    acctMenu.innerHTML = `
      <div class="acct-head">
        <div class="acct-name">${esc(user.name)}</div>
        <div class="acct-mail">${esc(user.email)}</div>
        <div class="mt-8"><span class="badge badge-indigo">${esc(Auth.roleLabel(user.role))}</span></div>
      </div>
      <button class="acct-item" data-act="changepw" role="menuitem"><span>Change password</span></button>
      <button class="acct-item" data-act="shortcuts" role="menuitem"><span>Keyboard shortcuts</span><span class="kbd">?</span></button>
      ${Auth.can('user.manage') ? '<a class="acct-item" href="admin.html" role="menuitem"><span>Admin console</span></a>' : ''}
      <button class="acct-item danger" data-act="signout" role="menuitem"><span>Sign out</span></button>`;
    byId('btn-acct').parentElement.appendChild(acctMenu);
    byId('btn-acct').setAttribute('aria-expanded', 'true');
    acctMenu.querySelector('button')?.focus();
  });
  document.addEventListener('click', () => closeAcct());
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAcct(); });

  /* ---------------- Mobile panels ---------------- */

  const side = byId('side'), rail = byId('rail');
  let scrim = null;

  function setPanel(el, on) {
    el.classList.toggle('open', on);
    const anyOpen = side.classList.contains('open') || rail.classList.contains('open');
    if (anyOpen && !scrim) {
      scrim = document.createElement('div');
      scrim.className = 'scrim';
      scrim.addEventListener('click', () => { setPanel(side, false); setPanel(rail, false); });
      document.body.appendChild(scrim);
    } else if (!anyOpen && scrim) { scrim.remove(); scrim = null; }
  }

  byId('btn-side').addEventListener('click', e => {
    e.stopPropagation();
    const on = !side.classList.contains('open');
    setPanel(side, on);
    byId('btn-side').setAttribute('aria-expanded', String(on));
  });
  byId('btn-rail').addEventListener('click', e => {
    e.stopPropagation();
    const on = !rail.classList.contains('open');
    setPanel(rail, on);
    byId('btn-rail').setAttribute('aria-expanded', String(on));
  });
  byId('btn-rail-close').addEventListener('click', () => setPanel(rail, false));

  /* ==========================================================
     NAVIGATION
     ========================================================== */

  const STEP_ORDER = ['portfolio', 'client', 'current', 'deferred', 'movement', 'summary', 'etr', 'disclosure', 'checklist'];

  function go(next, field) {
    if (!STEP_ORDER.includes(next)) next = 'portfolio';
    if (next !== 'portfolio' && !State.isOpen()) next = 'portfolio';

    // Flush any edit still sitting in the 700ms autosave debounce before
    // leaving the step — Duplicate, Roll forward and the portfolio cards all
    // read the persisted copy, so a very recent keystroke could otherwise be
    // silently missing from them. A no-op when nothing is dirty.
    if (State.isOpen()) State.saveNow();

    step = next;
    $$('.step').forEach(s => s.classList.toggle('on', s.id === 'step-' + next));
    $$('.nav-item').forEach(n => {
      const on = n.dataset.step === next;
      n.setAttribute('aria-current', on ? 'page' : 'false');
      if (!on) n.removeAttribute('aria-current');
    });

    if (location.hash !== '#' + next) history.replaceState(null, '', '#' + next);
    byId('main').scrollTop = 0;
    setPanel(side, false);

    render();

    if (field) {
      const el = byId(field);
      if (el) { el.focus(); el.select?.(); }
    }
  }

  $$('.nav-item').forEach(b => b.addEventListener('click', () => go(b.dataset.step)));
  $$('[data-goto-step]').forEach(b => b.addEventListener('click', () => go(b.dataset.gotoStep)));
  window.addEventListener('hashchange', () => go(location.hash.slice(1) || 'portfolio'));

  /* ==========================================================
     FIELD BINDING — scalar engagement fields
     ========================================================== */

  const FIELDS = [
    ['ci-name', 'name', 'str'], ['ci-cin', 'cin', 'str'], ['ci-pan', 'pan', 'str'],
    ['ci-fy', 'fy', 'str'], ['ci-date', 'bsDate', 'str'], ['ci-standard', 'standard', 'str'],
    ['ci-rate', 'rate', 'num'], ['ci-matrate', 'matRate', 'num'], ['ci-priorrate', 'priorRate', 'num'],
    ['ci-applymat', 'applyMat', 'bool'], ['ci-offset', 'offsetPresentation', 'bool'],
    ['ci-prep', 'preparedBy', 'str'], ['ci-rev', 'reviewedBy', 'str'], ['ci-prepdate', 'prepDate', 'str'],
    ['ob-dta', 'opening.dta', 'num'], ['ob-dtl', 'opening.dtl', 'num'], ['ob-mat', 'opening.mat', 'num'],
    ['ct-advance', 'ct.advanceTax', 'num'], ['ct-matutil', 'ct.matUtilised', 'num'],
    ['ct-pyadj', 'ct.priorYearAdj', 'num'], ['eng-notes', 'notes', 'str']
  ];

  const readCoerced = (el, kind) =>
    kind === 'num' ? (el.value === '' ? 0 : U.toNum(el.value))
    : kind === 'bool' ? el.checked
    : el.value;

  function bindFields() {
    FIELDS.forEach(([id, path, kind]) => {
      const el = byId(id);
      if (!el) return;
      const ev = kind === 'bool' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        if (!State.isOpen() || !editable) return;
        State.writePath(path, readCoerced(el, kind));
        State.recompute('field');
      });
    });
  }

  function fillFields() {
    const eng = State.get();
    if (!eng) return;
    FIELDS.forEach(([id, path, kind]) => {
      const el = byId(id);
      if (!el || document.activeElement === el) return;  // never fight the cursor
      const v = State.readPath(path);
      if (kind === 'bool') el.checked = !!v;
      else el.value = v === null || v === undefined ? '' : v;
    });
  }

  /* ---------------- Rate regime picker ---------------- */

  function fillRegimes() {
    const sel = byId('ci-regime');
    const rates = Store.activeRates();
    const eng = State.get();
    sel.innerHTML = rates.map(r =>
      `<option value="${esc(r.id)}" ${eng?.rateId === r.id ? 'selected' : ''}>${esc(r.label)} — ${r.rate.toFixed(3)}%</option>`
    ).join('') + '<option value="custom">Custom rate</option>';
    if (eng && !rates.some(r => r.id === eng.rateId)) sel.value = 'custom';
    updateRegimeNote();
  }

  function updateRegimeNote() {
    const r = Store.rateById(byId('ci-regime').value);
    byId('regime-note').textContent = r ? r.note : 'Enter the rate and MAT rate directly.';
  }

  byId('ci-regime').addEventListener('change', () => {
    if (!State.isOpen() || !editable) return;
    const id = byId('ci-regime').value;
    const eng = State.get();
    eng.rateId = id;
    const r = Store.rateById(id);
    if (r) {
      eng.rate = r.rate;
      eng.matRate = r.matRate;
      eng.applyMat = r.matRate > 0;
    }
    updateRegimeNote();
    fillFields();
    State.recompute('regime');
    U.toast(r ? `Rate set to ${r.rate.toFixed(3)}%` : 'Enter a custom rate', 'info', 2200);
  });

  /* ==========================================================
     DELEGATED INPUT — every data-bind control in a rendered table
     ========================================================== */

  const main = byId('main');

  function handleBound(el) {
    const path = el.dataset.bind;
    if (!path || !editable) return;
    const kind = el.type === 'checkbox' ? 'bool' : el.type === 'number' ? 'raw' : 'str';
    // Number inputs keep their raw string so a half-typed "-" or "1." survives.
    const value = kind === 'bool' ? el.checked : el.value;
    State.writePath(path, value);
    State.recompute('bound');
  }

  main.addEventListener('input', e => {
    if (e.target.dataset?.bind) handleBound(e.target);
  });
  main.addEventListener('change', e => {
    if (e.target.dataset?.bind && (e.target.tagName === 'SELECT' || e.target.type === 'checkbox')) handleBound(e.target);
  });

  /* ==========================================================
     DELEGATED ACTIONS
     ========================================================== */

  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;

    switch (act) {
      case 'signout':
        Auth.signOut();
        location.replace('index.html?signedout=1');
        break;

      case 'changepw':
        closeAcct();
        changePasswordDialog();
        break;

      case 'shortcuts':
        closeAcct();
        shortcutsDialog();
        break;

      case 'goto':
        go(el.dataset.step, el.dataset.field || null);
        setPanel(rail, false);
        break;

      case 'new-eng':
      case 'newEng':
        newEngagement();
        break;

      case 'open-eng':
        State.open(el.dataset.id);
        go('client');
        break;

      case 'dup-eng': {
        e.stopPropagation();
        const copy = Store.duplicateEngagement(el.dataset.id, user.id);
        if (copy) { U.toast('Engagement duplicated', 'ok'); render(); }
        break;
      }

      case 'del-eng': {
        e.stopPropagation();
        const eng = Store.engagementById(el.dataset.id);
        if (!eng) break;
        const ok = await U.confirmDialog({
          title: 'Delete this engagement?',
          message: `<strong>${esc(eng.name || 'Untitled')}</strong> (${esc(eng.fy)}) and all its figures will be removed from this browser. Export a backup first if you need to keep it.`,
          confirmLabel: 'Delete engagement',
          danger: true
        });
        if (!ok) break;
        Store.deleteEngagement(eng.id);
        Store.log('Deleted engagement', eng.name || 'Untitled', eng.id);
        if (State.get()?.id === eng.id) State.close();
        U.toast('Engagement deleted', 'ok');
        go('portfolio');
        break;
      }

      case 'del-ct': State.delCtRow(el.dataset.id); break;
      case 'del-dt': State.delDtRow(el.dataset.group, el.dataset.id); break;

      case 'chk':
        State.markChecklist(el.dataset.id, el.dataset.state, user);
        break;

      case 'status': {
        const to = el.dataset.to;
        if (to === 'signed') {
          const res = State.getResult();
          const blockers = res.validation.errors.length + res.tallies.queries;
          const ok = await U.confirmDialog({
            title: 'Sign off this workpaper?',
            message: blockers
              ? `There ${blockers === 1 ? 'is' : 'are'} still <strong>${blockers}</strong> open point${blockers === 1 ? '' : 's'}. Signing off records your name against the figures as they stand and locks them against further edits.`
              : 'Your name will be recorded against these figures and the workpaper will be locked against further edits. A manager or administrator can reopen it.',
            confirmLabel: 'Sign off'
          });
          if (!ok) break;
        }
        State.setStatus(to, user);
        U.toast(to === 'signed' ? 'Workpaper signed off' : to === 'review' ? 'Sent for review' : 'Returned to draft', 'ok');
        break;
      }

      case 'rollforward': await rollForward(); break;
    }
  });

  byId('btn-add-ct').addEventListener('click', () => { if (editable) State.addCtRow(); });
  $$('[data-add-dt]').forEach(b => b.addEventListener('click', () => { if (editable) State.addDtRow(b.dataset.addDt); }));

  byId('btn-dt-cols').addEventListener('click', () => {
    showOpenCols = !showOpenCols;
    byId('btn-dt-cols').textContent = showOpenCols ? 'Hide opening columns' : 'Show opening columns';
    render();
  });

  byId('btn-chk-clear').addEventListener('click', async () => {
    if (!editable) return;
    const ok = await U.confirmDialog({
      title: 'Clear every checklist mark?',
      message: 'All marks, including who made them and when, will be removed from this workpaper.',
      confirmLabel: 'Clear marks', danger: true
    });
    if (ok) { State.clearChecklist(); U.toast('Checklist cleared', 'ok'); }
  });

  byId('btn-copy-je').addEventListener('click', async () => {
    const r = State.getResult();
    if (!r) return;
    const ok = await U.copyText(Render.journalsText(r.jes, r.eng));
    U.toast(ok ? 'Journals copied' : 'Could not reach the clipboard', ok ? 'ok' : 'err');
  });

  byId('btn-copy-note').addEventListener('click', async () => {
    const el = byId('disc-text');
    if (!el) return;
    const ok = await U.copyText(el.innerText);
    U.toast(ok ? 'Note copied' : 'Could not reach the clipboard', ok ? 'ok' : 'err');
  });

  byId('btn-print-note').addEventListener('click', () => Exporter.printWorkpaper(State.getResult(), { only: 'note' }));

  /* ---------------- Engagement list controls ---------------- */

  byId('btn-new-eng').addEventListener('click', () => newEngagement());
  byId('btn-import-eng').addEventListener('click', () => Exporter.importEngagement(() => { render(); }));
  byId('eng-search').addEventListener('input', U.debounce(() => renderPortfolio(), 160));
  byId('eng-filter').addEventListener('change', () => renderPortfolio());

  byId('eng-select').addEventListener('change', () => {
    const id = byId('eng-select').value;
    if (id === '__new') { newEngagement(); return; }
    if (id === '__all') { go('portfolio'); return; }
    State.open(id);
    go(step === 'portfolio' ? 'client' : step);
  });

  function newEngagement() {
    if (!Auth.can('engagement.create')) { U.toast('Your role cannot create engagements.', 'err'); return; }
    State.create(user);
    go('client', 'ci-name');
    U.toast('New engagement created', 'ok');
  }

  /* ---------------- Export menu ---------------- */

  byId('btn-export').addEventListener('click', e => {
    e.stopPropagation();
    const r = State.getResult();
    if (!r) { U.toast('Open an engagement first.', 'err'); return; }
    U.modal({
      title: 'Export this workpaper',
      body: `<p class="lede mb-16">Choose a format. Everything is generated in this browser.</p>
        <div class="stack gap-8">
          <button class="btn btn-line btn-lg" data-x="excel" style="justify-content:flex-start">Excel workbook — nine sheets, formatted</button>
          <button class="btn btn-line btn-lg" data-x="print" style="justify-content:flex-start">Print or save as PDF — full workpaper</button>
          <button class="btn btn-line btn-lg" data-x="json" style="justify-content:flex-start">JSON backup — restore on another machine</button>
          <button class="btn btn-line btn-lg" data-x="csv" style="justify-content:flex-start">CSV — deferred tax schedule only</button>
        </div>`,
      onOpen: (root, close) => {
        root.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => {
          close();
          const k = b.dataset.x;
          if (k === 'excel') Exporter.toExcel(r);
          else if (k === 'print') Exporter.printWorkpaper(r);
          else if (k === 'json') Exporter.toJson(r.eng);
          else Exporter.toCsv(r);
        }));
      }
    });
  });

  /* ==========================================================
     DIALOGS
     ========================================================== */

  function changePasswordDialog(forced = false) {
    const m = U.modal({
      title: forced ? 'Choose a new password' : 'Change password',
      closable: !forced,
      body: `${forced ? '<div class="notice notice-warn"><span class="notice-tag">Required</span><span>An administrator reset your password. Choose your own before continuing.</span></div>' : ''}
        <div class="stack gap-16">
          ${forced ? '' : `<div class="field">
            <label class="lbl" for="cp-old">Current password</label>
            <input class="inp" id="cp-old" type="password" autocomplete="current-password" style="text-align:left" data-autofocus>
          </div>`}
          <div class="field">
            <label class="lbl" for="cp-new">New password</label>
            <input class="inp" id="cp-new" type="password" autocomplete="new-password" style="text-align:left" ${forced ? 'data-autofocus' : ''}>
            <p class="hint" id="cp-hint">At least ${firm.passwordMinLen} characters, with mixed case and a number.</p>
          </div>
          <div class="field">
            <label class="lbl" for="cp-new2">Confirm new password</label>
            <input class="inp" id="cp-new2" type="password" autocomplete="new-password" style="text-align:left">
          </div>
          <p class="err-txt hide" id="cp-err"></p>
        </div>`,
      footer: `${forced ? '' : '<button class="btn btn-line" data-c>Cancel</button>'}
               <button class="btn btn-primary" data-s>Save password</button>`
    });

    const err = m.root.querySelector('#cp-err');
    const fail = msg => { err.textContent = msg; err.classList.remove('hide'); };

    m.root.querySelector('#cp-new').addEventListener('input', ev => {
      const st = Hash.strength(ev.target.value, firm.passwordMinLen);
      m.root.querySelector('#cp-hint').textContent = ev.target.value ? `${st.label}. ${st.advice}` : `At least ${firm.passwordMinLen} characters.`;
    });

    m.root.querySelector('[data-c]')?.addEventListener('click', m.close);
    m.root.querySelector('[data-s]').addEventListener('click', async () => {
      err.classList.add('hide');
      const oldPw = m.root.querySelector('#cp-old')?.value || '';
      const a = m.root.querySelector('#cp-new').value;
      const b = m.root.querySelector('#cp-new2').value;
      if (a !== b) return fail('The two passwords do not match.');
      const res = await Auth.changePassword(user.id, oldPw, a);
      if (!res.ok) return fail(res.error);
      m.close();
      U.toast('Password changed', 'ok');
    });
  }

  function shortcutsDialog() {
    const rows = [
      ['Compute and save now', 'Ctrl / ⌘ + S'],
      ['Next step', 'Ctrl / ⌘ + →'],
      ['Previous step', 'Ctrl / ⌘ + ←'],
      ['Jump to a step', 'Alt + 1 … 8'],
      ['Print or save as PDF', 'Ctrl / ⌘ + P'],
      ['Show or hide the tally rail', 'Ctrl / ⌘ + J'],
      ['Close a dialog', 'Esc'],
      ['This list', '?']
    ];
    U.modal({
      title: 'Keyboard shortcuts',
      body: `<table class="wt"><tbody>${rows.map(([a, b]) =>
        `<tr><td>${a}</td><td class="r"><span class="kbd">${b}</span></td></tr>`).join('')}</tbody></table>`,
      footer: '<button class="btn btn-primary" data-close>Close</button>',
      onOpen: (root, close) => root.querySelector('[data-close]').addEventListener('click', close)
    });
  }

  async function rollForward() {
    const r = State.getResult();
    if (!r) return;
    const ok = await U.confirmDialog({
      title: 'Roll forward to the next year?',
      message: `A new engagement will be created for the following financial year. Closing balances become opening balances, every line keeps its description, and the figures are cleared.`,
      confirmLabel: 'Create next year'
    });
    if (!ok) return;
    const next = Store.rollForward(r.eng.id, user.id, {
      dta: r.dt.bsDTA, dtl: r.dt.bsDTL, mat: r.dt.matClosing,
      rowTaxEffects: r.dt.rowTaxEffects
    });
    if (!next) { U.toast('Could not roll forward.', 'err'); return; }
    Store.log('Rolled engagement forward', next.fy, next.id);
    State.open(next.id);
    go('client');
    U.toast(`Created ${next.fy}. Opening balances carried across.`, 'ok', 4500);
  }

  /* ==========================================================
     RENDER
     ========================================================== */

  // Sticky warning while the autosave is failing (storage full/blocked) — a
  // failed write otherwise looks identical to a successful one to the user.
  let saveFailToast = null;
  function watchSaveHealth() {
    if (State.hasSaveFailed()) {
      if (!saveFailToast) {
        saveFailToast = U.toast('Your last change could not be saved. Export a backup now — closing this tab may lose it.', 'err', 0);
      }
    } else if (saveFailToast) {
      saveFailToast.remove();
      saveFailToast = null;
    }
  }

  function render() {
    watchSaveHealth();
    const eng = State.get();
    const r = State.getResult();

    renderEngPicker();

    if (!eng || !r) {
      byId('hdr-eng-name').textContent = 'No engagement open';
      byId('hdr-eng-meta').textContent = '—';
      byId('hdr-status').className = 'hdr-status draft';
      byId('hdr-status').textContent = '—';
      byId('rail-body').innerHTML = '<p class="txt-mute" style="padding:10px;font-size:var(--fs-sm)">Open an engagement to see its tallies.</p>';
      byId('rail-count').textContent = '';
      byId('prog-pct').textContent = '0%';
      byId('prog-fill').style.width = '0%';
      byId('prog-next').textContent = 'Open an engagement to begin.';
      $$('[data-flag]').forEach(f => { f.innerHTML = ''; });
      if (step === 'portfolio') renderPortfolio();
      return;
    }

    editable = Auth.canEdit(eng, user);

    /* Header */
    byId('hdr-eng-name').textContent = eng.name || 'Untitled engagement';
    byId('hdr-eng-meta').textContent = `${eng.fy || '—'} · ${eng.rate.toFixed(3)}%`;
    const st = byId('hdr-status');
    st.className = 'hdr-status ' + (eng.locked ? 'locked' : eng.status);
    st.textContent = eng.locked ? 'Locked' : eng.status === 'signed' ? 'Signed' : eng.status === 'review' ? 'Review' : 'Draft';

    /* Progress */
    byId('prog-pct').textContent = r.progress.pct + '%';
    byId('prog-fill').style.width = r.progress.pct + '%';
    byId('prog-fill').parentElement.setAttribute('aria-valuenow', String(r.progress.pct));
    const nextStep = r.progress.steps.find(s => !s.done);
    byId('prog-next').textContent = nextStep ? `Next: ${nextStep.label}` : 'Every step complete.';

    /* Sidebar flags */
    const flagged = new Set(r.tallies.items.filter(t => t.state === 'query').map(t => t.section));
    r.validation.errors.forEach(v => flagged.add(v.section));
    $$('[data-flag]').forEach(f => {
      f.innerHTML = flagged.has(f.dataset.flag) ? '<span class="nav-flag" title="Needs attention">!</span>' : '';
    });

    /* Rail */
    byId('rail-body').innerHTML = Render.rail(r);
    byId('rail-count').textContent = r.tallies.queries ? `(${r.tallies.queries})` : '';

    /* Read-only banner */
    applyReadOnly(eng);

    /* Step body */
    switch (step) {
      case 'portfolio': renderPortfolio(); break;
      case 'client': renderClient(r); break;
      case 'current': renderCurrent(r); break;
      case 'deferred': renderDeferred(r); break;
      case 'movement': byId('movement-body').innerHTML = Render.movement(r); break;
      case 'summary':
        byId('kpi-strip').innerHTML = Render.kpis(r);
        byId('summary-body').innerHTML = Render.summary(r);
        byId('je-body').innerHTML = Render.journals(r.jes);
        break;
      case 'etr': byId('etr-body').innerHTML = Render.etr(r); break;
      case 'disclosure': byId('disclosure-body').innerHTML = Render.disclosure(r); break;
      case 'checklist':
        byId('checklist-summary').innerHTML = Render.checklistSummary(eng);
        byId('checklist-body').innerHTML = Render.checklist(eng, editable, user);
        byId('signoff-body').innerHTML = Render.signoff(r, user);
        break;
    }
  }

  function applyReadOnly(eng) {
    const banner = 'ro-banner';
    byId(banner)?.remove();
    if (editable) return;
    const why = eng.status === 'signed' ? 'This workpaper is signed off.'
      : eng.locked ? 'This workpaper is locked by an administrator.'
      : 'Your role does not allow edits to this engagement.';
    const div = document.createElement('div');
    div.id = banner;
    div.className = 'notice notice-warn';
    div.innerHTML = `<span class="notice-tag">Read only</span><span>${esc(why)} You can still export and print.</span>`;
    document.querySelector('#step-' + step)?.prepend(div);
  }

  function renderEngPicker() {
    const sel = byId('eng-select');
    const list = Auth.visibleEngagements(user)
      .slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const cur = State.get();
    sel.innerHTML =
      '<option value="__all">All engagements…</option>' +
      list.map(e2 => `<option value="${esc(e2.id)}" ${cur?.id === e2.id ? 'selected' : ''}>${esc(e2.name || 'Untitled')} · ${esc(e2.fy)}</option>`).join('') +
      (Auth.can('engagement.create') ? '<option value="__new">+ New engagement</option>' : '');
    if (cur) sel.value = cur.id; else sel.value = '__all';
  }

  function renderClient(r) {
    fillRegimes();
    fillFields();
    byId('as22-hint').textContent = r.eng.standard === 'as22'
      ? 'AS 22 uses timing differences. This tool computes on the balance sheet approach, which is the Ind AS 12 requirement — treat AS 22 output as indicative only.'
      : '';
    byId('offset-hint').textContent = r.eng.offsetPresentation
      ? 'Ind AS 12.74 permits offset only where a legally enforceable right of set-off exists and the balances relate to the same taxing authority.'
      : 'Deferred tax assets and liabilities will be presented gross in the balance sheet and the note.';
    setDisabled('#step-client');
  }

  function renderCurrent(r) {
    byId('ct-body').innerHTML = Render.ctRows(r.eng, editable);
    byId('mat-block').innerHTML = Render.matBlock(r.ct);
    U.setText('ct-taxable', U.fmtBr(r.ct.taxableIncome));
    U.setText('ct2-ti', U.fmtBr(r.ct.taxableIncome));
    U.setText('ct2-rate', r.ct.rate.toFixed(3) + '%');
    U.setText('ct2-normal', U.fmt(r.ct.normalTax));
    U.setText('ct2-year', U.fmt(r.ct.taxForYear));
    U.setText('ct2-expense', U.fmtBr(r.ct.currentTaxExpense));
    U.setText('ct3-expense', U.fmtBr(r.ct.currentTaxExpense));
    U.setText('ct3-net', U.fmt(Math.abs(r.ct.netPayable)));
    U.setText('ct3-label', r.ct.isRefund ? 'Net tax refundable' : 'Net tax payable');
    byId('matutil-note').textContent = r.ct.openingMat > 0
      ? `Opening entitlement available: ${U.fmt(r.ct.openingMat)}.`
      : 'No opening entitlement. Enter it in step 1 first.';
    fillFields();
    setDisabled('#step-current');
  }

  function renderDeferred(r) {
    byId('dt-asset-body').innerHTML = Render.bsRows(r.dt.assets, 'assets', editable, showOpenCols);
    byId('dt-asset-foot').innerHTML = Render.bsFoot(r.dt.secA, 6);
    byId('dt-liab-body').innerHTML = Render.bsRows(r.dt.liabs, 'liabs', editable, showOpenCols);
    byId('dt-liab-foot').innerHTML = Render.bsFoot(r.dt.secL, 6);
    byId('dt-other-body').innerHTML = Render.otherRows(r.dt.others, editable, showOpenCols);
    byId('dt-other-foot').innerHTML = Render.otherFoot(r.dt.secO);
    byId('dt-summary').innerHTML = Render.dtSummary(r);
    byId('unrec-block').innerHTML = Render.unrecognised(r);
    $$('.dt-open-col').forEach(c => c.classList.toggle('hide', !showOpenCols));
    setDisabled('#step-deferred');
  }

  function setDisabled(sel) {
    document.querySelectorAll(`${sel} input, ${sel} select, ${sel} textarea`).forEach(el => {
      if (el.dataset.alwaysOn) return;
      el.disabled = !editable;
    });
  }

  function renderPortfolio() {
    const q = byId('eng-search').value.trim();
    const filter = byId('eng-filter').value;
    let list = Auth.visibleEngagements(user);
    if (filter !== 'all') list = list.filter(x => x.status === filter);
    if (q) list = list.filter(x => U.matches(x, q, ['name', 'cin', 'pan', 'fy']));
    list = list.slice().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    const withResults = list.map(eng => ({ eng, res: Compute.run(eng) }));
    byId('eng-list').innerHTML = Render.engList(withResults, e2 => Auth.canDelete(e2, user));

    // Cards act like buttons, so they answer to Enter and Space too.
    byId('eng-list').querySelectorAll('.eng-card').forEach(card => {
      card.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); }
      });
    });
  }

  /* ==========================================================
     KEYBOARD
     ========================================================== */

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName);
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      State.saveNow();
      State.recompute('manual');
      U.toast('Saved', 'ok', 1600);
      return;
    }
    if (mod && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      const on = !rail.classList.contains('open');
      setPanel(rail, on);
      return;
    }
    if (mod && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      Exporter.printWorkpaper(State.getResult());
      return;
    }
    if (!typing && mod && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      const i = STEP_ORDER.indexOf(step);
      const next = STEP_ORDER[U.clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, STEP_ORDER.length - 1)];
      go(next);
      return;
    }
    if (!typing && e.altKey && /^[1-8]$/.test(e.key)) {
      e.preventDefault();
      go(STEP_ORDER[Number(e.key)]);
      return;
    }
    if (e.key === '?' && !typing) { e.preventDefault(); shortcutsDialog(); }
  });

  /* ==========================================================
     BOOT
     ========================================================== */

  bindFields();
  State.onChange(() => render());

  Auth.startIdleWatch(secs => {
    U.toast(`Your session ends in about ${Math.ceil(secs / 60)} minute. Any key keeps it open.`, 'warn', 8000);
  });

  const params = new URLSearchParams(location.search);
  if (params.get('changepw') || user.mustChangePassword) {
    changePasswordDialog(true);
  }

  State.restore(user);
  go(location.hash.slice(1) || (State.isOpen() ? 'client' : 'portfolio'));

  const welcome = params.get('welcome');
  if (welcome === 'admin') {
    U.toast('You are the administrator. The Admin button opens user and rate management.', 'ok', 7000);
  } else if (welcome) {
    U.toast(`Welcome, ${user.name.split(' ')[0]}.`, 'ok', 3500);
  }

  if (!State.isOpen() && Auth.can('engagement.create')) {
    U.toast('Create an engagement to begin.', 'info', 4500);
  }
})();
