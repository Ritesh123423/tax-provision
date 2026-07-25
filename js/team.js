'use strict';

/**
 * TEAM.JS — Engagement team management.
 *
 * Three firm roles: partner, manager, article.
 * Only partners and managers can create engagements.
 * Team is assigned at engagement creation time (mandatory step).
 * Team members panel uses live search to handle large user lists.
 */

const Team = (() => {

  // The role a person plays *on a specific engagement* (separate from their firm role)
  const ENG_ROLES = [
    { value: 'preparer', label: 'Preparer',  blurb: 'Can enter and edit all figures on this engagement.' },
    { value: 'reviewer', label: 'Reviewer',  blurb: 'Can view all figures and mark the checklist.' },
    { value: 'viewer',   label: 'Viewer',    blurb: 'Read-only access — can export and print.' }
  ];

  function engRoleLabel(r) {
    return ENG_ROLES.find(x => x.value === r)?.label || r;
  }

  function firmRoleBadge(firmRole) {
    if (firmRole === 'partner') return '<span class="badge badge-amber">Partner</span>';
    if (firmRole === 'manager') return '<span class="badge badge-sky">Manager</span>';
    if (firmRole === 'article') return '<span class="badge badge-neutral">Article</span>';
    return '';
  }

  function avatarInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  // All active users except the given owner
  function getAllUsers(excludeId) {
    return Store.users().filter(u => u.status === 'active' && u.id !== excludeId);
  }

  /**
   * Show the "Create engagement" modal — collects name, FY and team first.
   * Only partners and managers may call this.
   * @param {object} currentUser
   * @param {function} onCreate - called with the new engagement object after creation
   */
  function openCreateModal(currentUser, onCreate) {
    const allUsers = getAllUsers(currentUser.id);
    let pendingMembers = []; // [{userId, role}]

    function userSearchHtml(pendingIds) {
      // Build the searchable user list — excluded are already added + current user
      const available = allUsers.filter(u => !pendingIds.has(u.id));
      return available.map(u => `
        <div class="tm-search-row" data-uid="${U.esc(u.id)}">
          <div class="tm-av">${avatarInitials(u.name)}</div>
          <div class="tm-info">
            <div class="tm-name">${U.esc(u.name)}</div>
            <div class="tm-email">${U.esc(u.email)} ${firmRoleBadge(u.role)}</div>
          </div>
          <button class="btn btn-amber btn-sm tm-add-btn" data-uid="${U.esc(u.id)}" type="button">Add</button>
        </div>`).join('') || '<p class="tm-empty">No more users to add.</p>';
    }

    function pendingHtml() {
      if (!pendingMembers.length) {
        return '<p class="tm-hint-empty">No team members added yet. Search and add people above.</p>';
      }
      return pendingMembers.map(m => {
        const u = Store.userById(m.userId);
        if (!u) return '';
        const roleOpts = ENG_ROLES.map(r =>
          `<option value="${r.value}" ${m.role === r.value ? 'selected' : ''}>${r.label}</option>`
        ).join('');
        return `
          <div class="tm-pending-row" data-uid="${U.esc(m.userId)}">
            <div class="tm-av">${avatarInitials(u.name)}</div>
            <div class="tm-info">
              <div class="tm-name">${U.esc(u.name)}</div>
              <div class="tm-email">${U.esc(u.email)} ${firmRoleBadge(u.role)}</div>
            </div>
            <select class="inp tm-role-sel" data-uid="${U.esc(m.userId)}" style="min-width:110px;font-size:12px;padding:4px 26px 4px 8px">
              ${roleOpts}
            </select>
            <button class="btn btn-ghost btn-sm tm-remove-btn" data-uid="${U.esc(m.userId)}" type="button" style="color:var(--rose-tx)">✕</button>
          </div>`;
      }).join('');
    }

    const m = U.modal({
      title: 'New engagement',
      wide: true,
      body: `
        <div class="fg c2" style="margin-bottom:20px">
          <div class="field">
            <label class="lbl" for="nc-name">Client name <span class="req">*</span></label>
            <input class="inp" id="nc-name" placeholder="ABC Manufacturing Pvt Ltd" style="text-align:left" data-autofocus>
          </div>
          <div class="field">
            <label class="lbl" for="nc-fy">Financial year <span class="req">*</span></label>
            <input class="inp mono" id="nc-fy" placeholder="2025-26" style="text-align:left">
          </div>
        </div>

        <div class="tm-section-title">Team members <span class="tm-optional">(add now or later via Manage team)</span></div>

        <!-- Search box -->
        <div class="tm-search-wrap">
          <input class="inp tm-search-inp" id="tm-search" placeholder="Search by name or email…" autocomplete="off" style="text-align:left">
        </div>
        <div class="tm-search-results" id="tm-search-results">${userSearchHtml(new Set())}</div>

        <div class="tm-divider">Team for this engagement</div>
        <div class="tm-pending-list" id="tm-pending-list">${pendingHtml()}</div>

        <p class="err-txt hide mt-8" id="nc-err"></p>`,
      footer: `
        <button class="btn btn-line" data-c>Cancel</button>
        <button class="btn btn-amber" id="nc-create-btn">Create engagement</button>`
    });

    const root = m.root;

    // --- Live search ---
    const searchInp = root.querySelector('#tm-search');
    const searchResults = root.querySelector('#tm-search-results');

    function refreshSearch(q) {
      const pendingIds = new Set(pendingMembers.map(x => x.userId));
      const available = getAllUsers(currentUser.id).filter(u => !pendingIds.has(u.id));
      const filtered = q
        ? available.filter(u =>
            u.name.toLowerCase().includes(q) ||
            u.email.toLowerCase().includes(q) ||
            (u.role || '').toLowerCase().includes(q))
        : available;

      searchResults.innerHTML = filtered.map(u => `
        <div class="tm-search-row" data-uid="${U.esc(u.id)}">
          <div class="tm-av">${avatarInitials(u.name)}</div>
          <div class="tm-info">
            <div class="tm-name">${U.esc(u.name)}</div>
            <div class="tm-email">${U.esc(u.email)} ${firmRoleBadge(u.role)}</div>
          </div>
          <button class="btn btn-amber btn-sm tm-add-btn" data-uid="${U.esc(u.id)}" type="button">Add</button>
        </div>`).join('') || '<p class="tm-empty">No users match that search.</p>';
    }

    searchInp.addEventListener('input', U.debounce(() => {
      refreshSearch(searchInp.value.trim().toLowerCase());
    }, 150));

    // --- Add from search results ---
    searchResults.addEventListener('click', e => {
      const btn = e.target.closest('.tm-add-btn');
      if (!btn) return;
      const uid = btn.dataset.uid;
      if (!uid || pendingMembers.some(x => x.userId === uid)) return;
      pendingMembers.push({ userId: uid, role: 'preparer' });
      root.querySelector('#tm-pending-list').innerHTML = pendingHtml();
      refreshSearch(searchInp.value.trim().toLowerCase());
    });

    // --- Role change in pending list ---
    root.querySelector('#tm-pending-list').addEventListener('change', e => {
      const sel = e.target.closest('.tm-role-sel');
      if (!sel) return;
      const m = pendingMembers.find(x => x.userId === sel.dataset.uid);
      if (m) m.role = sel.value;
    });

    // --- Remove from pending list ---
    root.querySelector('#tm-pending-list').addEventListener('click', e => {
      const btn = e.target.closest('.tm-remove-btn');
      if (!btn) return;
      pendingMembers = pendingMembers.filter(x => x.userId !== btn.dataset.uid);
      root.querySelector('#tm-pending-list').innerHTML = pendingHtml();
      refreshSearch(searchInp.value.trim().toLowerCase());
    });

    // --- Create ---
    root.querySelector('#nc-create-btn').addEventListener('click', () => {
      const nameVal = root.querySelector('#nc-name').value.trim();
      const fyVal   = root.querySelector('#nc-fy').value.trim();
      const errEl   = root.querySelector('#nc-err');
      errEl.classList.add('hide');

      if (!nameVal) { errEl.textContent = 'Enter a client name.'; errEl.classList.remove('hide'); root.querySelector('#nc-name').focus(); return; }
      if (!fyVal)   { errEl.textContent = 'Enter the financial year (e.g. 2025-26).'; errEl.classList.remove('hide'); root.querySelector('#nc-fy').focus(); return; }

      // Build the engagement
      const eng = Store.newEngagement(currentUser.id);
      eng.name = nameVal;
      eng.fy   = fyVal;
      eng.teamMembers = pendingMembers.map(m => ({ ...m, addedAt: new Date().toISOString() }));
      Store.addEngagement(eng);
      Store.log('Created engagement', `${nameVal} ${fyVal}`, eng.id);

      pendingMembers.forEach(m => {
        const u = Store.userById(m.userId);
        if (u) Store.log(`Added ${u.name} to team`, nameVal, eng.id);
      });

      m.close();
      U.toast(`${nameVal} created`, 'ok');
      if (onCreate) onCreate(eng);
    });

    root.querySelector('[data-c]')?.addEventListener('click', m.close);
  }

  /**
   * Open the "Manage team" modal for an *existing* engagement.
   * Partners and managers can add/remove/change roles.
   * Articles can only view.
   */
  function openTeamModal(eng, currentUser, onSaved) {
    const canManage = currentUser.role === 'partner' || currentUser.role === 'manager' || eng.ownerId === currentUser.id;
    const owner = Store.userById(eng.ownerId);

    function buildPendingIds() {
      const s = new Set((eng.teamMembers || []).map(m => m.userId));
      s.add(eng.ownerId);
      return s;
    }

    function membersHtml() {
      const members = eng.teamMembers || [];
      const ownerRow = `
        <div class="tm-pending-row">
          <div class="tm-av">${avatarInitials(owner?.name)}</div>
          <div class="tm-info">
            <div class="tm-name">${U.esc(owner?.name || 'Unknown')}</div>
            <div class="tm-email">${U.esc(owner?.email || '')} ${firmRoleBadge(owner?.role)}</div>
          </div>
          <span class="badge badge-navy" style="font-size:11px">Owner</span>
          <span></span>
        </div>`;

      const memberRows = members.map(mem => {
        const u = Store.userById(mem.userId);
        if (!u) return '';
        const roleOpts = ENG_ROLES.map(r =>
          `<option value="${r.value}" ${mem.role === r.value ? 'selected' : ''}>${r.label}</option>`
        ).join('');
        return `
          <div class="tm-pending-row" data-uid="${U.esc(mem.userId)}">
            <div class="tm-av">${avatarInitials(u.name)}</div>
            <div class="tm-info">
              <div class="tm-name">${U.esc(u.name)}</div>
              <div class="tm-email">${U.esc(u.email)} ${firmRoleBadge(u.role)}</div>
            </div>
            ${canManage
              ? `<select class="inp tm-role-sel" data-uid="${U.esc(mem.userId)}" style="min-width:110px;font-size:12px;padding:4px 26px 4px 8px">${roleOpts}</select>`
              : `<span class="badge badge-neutral">${engRoleLabel(mem.role)}</span>`}
            ${canManage
              ? `<button class="btn btn-ghost btn-sm tm-remove-btn" data-uid="${U.esc(mem.userId)}" type="button" style="color:var(--rose-tx)">✕</button>`
              : '<span></span>'}
          </div>`;
      }).join('');

      const empty = !members.length
        ? '<p class="tm-hint-empty" style="margin:8px 0">Only the owner is on this engagement. Add people below.</p>'
        : '';

      return ownerRow + memberRows + empty;
    }

    function searchResultsHtml(q) {
      const pendingIds = buildPendingIds();
      const available = getAllUsers(eng.ownerId).filter(u => {
        if (pendingIds.has(u.id)) return false;
        if (!q) return true;
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.role || '').toLowerCase().includes(q);
      });
      return available.map(u => `
        <div class="tm-search-row" data-uid="${U.esc(u.id)}">
          <div class="tm-av">${avatarInitials(u.name)}</div>
          <div class="tm-info">
            <div class="tm-name">${U.esc(u.name)}</div>
            <div class="tm-email">${U.esc(u.email)} ${firmRoleBadge(u.role)}</div>
          </div>
          <button class="btn btn-amber btn-sm tm-add-btn" data-uid="${U.esc(u.id)}" type="button">Add</button>
        </div>`).join('') || '<p class="tm-empty">No users match.</p>';
    }

    const m = U.modal({
      title: 'Manage team',
      wide: true,
      body: `
        <div class="tm-eng-title">
          <strong>${U.esc(eng.name || 'Untitled')}</strong> · ${U.esc(eng.fy)}
        </div>

        <div class="tm-divider">Current team</div>
        <div class="tm-pending-list" id="tm-member-list">${membersHtml()}</div>

        ${canManage ? `
        <div class="tm-divider" style="margin-top:20px">Add people</div>
        <div class="tm-search-wrap">
          <input class="inp tm-search-inp" id="tm-search" placeholder="Search by name, email or role…" autocomplete="off" style="text-align:left">
        </div>
        <div class="tm-search-results" id="tm-search-results">${searchResultsHtml('')}</div>
        ` : '<p class="hint mt-8">Only Partners and Managers can change the team.</p>'}`,
      footer: '<button class="btn btn-primary" data-c>Done</button>'
    });

    const root = m.root;
    if (!canManage) return;

    // Live search
    root.querySelector('#tm-search').addEventListener('input', U.debounce(e => {
      root.querySelector('#tm-search-results').innerHTML = searchResultsHtml(e.target.value.trim().toLowerCase());
    }, 150));

    // Add from search
    root.querySelector('#tm-search-results').addEventListener('click', e => {
      const btn = e.target.closest('.tm-add-btn');
      if (!btn) return;
      const uid = btn.dataset.uid;
      if (!uid) return;
      addMember(eng, uid, 'preparer');
      Store.saveEngagement(eng);
      const u = Store.userById(uid);
      Store.log(`Added ${u?.name || uid} to team`, eng.name, eng.id);
      U.toast(`${u?.name || 'User'} added`, 'ok');
      root.querySelector('#tm-member-list').innerHTML = membersHtml();
      root.querySelector('#tm-search-results').innerHTML = searchResultsHtml(root.querySelector('#tm-search').value.trim().toLowerCase());
      if (onSaved) onSaved();
    });

    // Role change
    root.querySelector('#tm-member-list').addEventListener('change', e => {
      const sel = e.target.closest('.tm-role-sel');
      if (!sel) return;
      const mem = (eng.teamMembers || []).find(x => x.userId === sel.dataset.uid);
      if (mem) { mem.role = sel.value; Store.saveEngagement(eng); }
      const u = Store.userById(sel.dataset.uid);
      U.toast(`${u?.name || 'User'} is now ${engRoleLabel(sel.value)}`, 'ok');
      if (onSaved) onSaved();
    });

    // Remove
    root.querySelector('#tm-member-list').addEventListener('click', async e => {
      const btn = e.target.closest('.tm-remove-btn');
      if (!btn) return;
      const uid = btn.dataset.uid;
      const u = Store.userById(uid);
      const ok = await U.confirmDialog({
        title: 'Remove from team?',
        message: `<strong>${U.esc(u?.name || uid)}</strong> will lose access to this engagement.`,
        confirmLabel: 'Remove', danger: true
      });
      if (!ok) return;
      removeMember(eng, uid);
      Store.saveEngagement(eng);
      Store.log(`Removed ${u?.name || uid} from team`, eng.name, eng.id);
      U.toast(`${u?.name || 'User'} removed`, 'ok');
      root.querySelector('#tm-member-list').innerHTML = membersHtml();
      root.querySelector('#tm-search-results').innerHTML = searchResultsHtml(root.querySelector('#tm-search').value.trim().toLowerCase());
      if (onSaved) onSaved();
    });
  }

  // ── Core mutation helpers ──

  function addMember(eng, userId, role) {
    const members = eng.teamMembers || [];
    const i = members.findIndex(m => m.userId === userId);
    if (i >= 0) { members[i].role = role; members[i].updatedAt = new Date().toISOString(); }
    else members.push({ userId, role, addedAt: new Date().toISOString() });
    eng.teamMembers = members;
    return eng;
  }

  function removeMember(eng, userId) {
    eng.teamMembers = (eng.teamMembers || []).filter(m => m.userId !== userId);
    return eng;
  }

  function canAccess(eng, user) {
    if (!eng || !user) return false;
    if (user.role === 'partner' || user.role === 'manager') return true;
    if (eng.ownerId === user.id) return true;
    return (eng.teamMembers || []).some(m => m.userId === user.id);
  }

  return {
    openCreateModal,
    openTeamModal,
    addMember,
    removeMember,
    canAccess,
    engRoleLabel,
    ENG_ROLES
  };

})();
