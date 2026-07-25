'use strict';

/**
 * TEAM.JS — Engagement team management.
 *
 * Manages the teamMembers array on an engagement: adding, removing, and
 * changing roles. Also provides the UI for the "Manage team" modal.
 *
 * Note: Like the rest of this app, access control is client-side only.
 * The teamMembers list controls which engagements appear for a user and
 * whether they can edit — but this cannot prevent a determined browser
 * user from reading localStorage directly.
 */

const Team = (() => {

  const TEAM_ROLES = [
    { value: 'reviewer', label: 'Reviewer',  blurb: 'Can view and mark the checklist. Cannot edit figures.' },
    { value: 'preparer', label: 'Preparer',  blurb: 'Can edit figures and the deferred tax schedule.' },
    { value: 'viewer',   label: 'Viewer',    blurb: 'Read-only access to figures and reports.' }
  ];

  function roleLabel(r) {
    return TEAM_ROLES.find(x => x.value === r)?.label || r;
  }

  /**
   * Can the given user access this engagement?
   * Owner always can. Admin/Manager can access all.
   * Others need to be in teamMembers.
   */
  function canAccess(eng, user) {
    if (!eng || !user) return false;
    if (user.role === 'admin' || user.role === 'manager') return true;
    if (eng.ownerId === user.id) return true;
    return (eng.teamMembers || []).some(m => m.userId === user.id);
  }

  /**
   * Effective role of this user on this engagement.
   * Owner: acts as their system role.
   * Team member: restricted to their team role.
   */
  function effectiveRole(eng, user) {
    if (!eng || !user) return 'viewer';
    if (user.role === 'admin' || user.role === 'manager') return user.role;
    if (eng.ownerId === user.id) return user.role;
    const m = (eng.teamMembers || []).find(x => x.userId === user.id);
    return m ? m.role : 'viewer';
  }

  function canEditEngagement(eng, user) {
    const r = effectiveRole(eng, user);
    return r === 'admin' || r === 'manager' || r === 'preparer';
  }

  /**
   * Add or update a team member on an engagement.
   */
  function addMember(eng, userId, role) {
    const members = eng.teamMembers || [];
    const existing = members.findIndex(m => m.userId === userId);
    if (existing >= 0) {
      members[existing].role = role;
      members[existing].updatedAt = new Date().toISOString();
    } else {
      members.push({ userId, role, addedAt: new Date().toISOString() });
    }
    eng.teamMembers = members;
    return eng;
  }

  function removeMember(eng, userId) {
    eng.teamMembers = (eng.teamMembers || []).filter(m => m.userId !== userId);
    return eng;
  }

  /**
   * Open the Manage Team modal for an engagement.
   * @param {object} eng - The engagement object
   * @param {object} currentUser - The signed-in user
   * @param {function} onSaved - Called after any change is saved
   */
  function openTeamModal(eng, currentUser, onSaved) {
    const allUsers = Store.allUsers().filter(u => u.status === 'active' && u.id !== eng.ownerId);
    const owner = Store.userById(eng.ownerId);
    const canManage = currentUser.role === 'admin' || currentUser.role === 'manager' || eng.ownerId === currentUser.id;

    function membersHtml() {
      const members = eng.teamMembers || [];

      const ownerRow = `
        <div class="team-member-row">
          <div class="team-avatar">${avatarInitials(owner?.name)}</div>
          <div class="team-member-info">
            <div class="team-member-name">${U.esc(owner?.name || 'Unknown')}</div>
            <div class="team-member-email">${U.esc(owner?.email || '')}</div>
          </div>
          <div class="team-member-role"><span class="badge badge-indigo">Owner</span></div>
          <div class="team-member-actions"></div>
        </div>`;

      const memberRows = members.map(m => {
        const u = Store.userById(m.userId);
        if (!u) return '';
        const roleOptions = TEAM_ROLES.map(r =>
          `<option value="${r.value}" ${m.role === r.value ? 'selected' : ''}>${r.label}</option>`
        ).join('');
        return `
          <div class="team-member-row" data-member-id="${U.esc(m.userId)}">
            <div class="team-avatar">${avatarInitials(u.name)}</div>
            <div class="team-member-info">
              <div class="team-member-name">${U.esc(u.name)}</div>
              <div class="team-member-email">${U.esc(u.email)}</div>
            </div>
            <div class="team-member-role">
              ${canManage
                ? `<select class="inp inp-sm team-role-select" data-member-id="${U.esc(m.userId)}">${roleOptions}</select>`
                : `<span class="badge badge-neutral">${roleLabel(m.role)}</span>`}
            </div>
            <div class="team-member-actions">
              ${canManage
                ? `<button class="btn btn-quiet btn-sm team-remove-btn" data-member-id="${U.esc(m.userId)}" title="Remove from engagement" style="color:var(--dtl-text)">Remove</button>`
                : ''}
            </div>
          </div>`;
      }).join('');

      return ownerRow + (memberRows || `<p class="txt-mute" style="padding:12px 0;font-size:var(--fs-sm)">No collaborators added yet.</p>`);
    }

    // Build list of users not yet on the team
    function addableUsers() {
      const existing = new Set((eng.teamMembers || []).map(m => m.userId));
      existing.add(eng.ownerId);
      return allUsers.filter(u => !existing.has(u.id));
    }

    const m = U.modal({
      title: 'Manage team',
      wide: true,
      body: `
        <p class="lede mb-16" style="font-size:var(--fs-sm)">
          <strong>${U.esc(eng.name || 'This engagement')}</strong> · ${U.esc(eng.fy)}
        </p>

        <div class="team-members-list" id="team-members-list">
          ${membersHtml()}
        </div>

        ${canManage ? `
        <hr class="divider">
        <div class="team-add-section">
          <div class="team-add-title">Add collaborator</div>
          <div class="team-add-row" id="team-add-row">
            <div class="field grow">
              <label class="lbl" for="team-user-select">Team member</label>
              <select class="inp" id="team-user-select">
                <option value="">— Select a user —</option>
                ${addableUsers().map(u => `<option value="${U.esc(u.id)}">${U.esc(u.name)} (${U.esc(u.email)})</option>`).join('')}
              </select>
            </div>
            <div class="field" style="min-width:150px">
              <label class="lbl" for="team-role-select">Role</label>
              <select class="inp" id="team-role-select">
                ${TEAM_ROLES.map(r => `<option value="${r.value}">${r.label}</option>`).join('')}
              </select>
            </div>
            <div class="field" style="align-self:flex-end">
              <button class="btn btn-primary" id="team-add-btn">Add</button>
            </div>
          </div>
          <div id="team-role-hint" class="hint mt-8"></div>
        </div>
        ` : ''}

        <div class="notice notice-info mt-16" style="margin-bottom:0">
          <span class="notice-tag">Note</span>
          <span>Team members can access this engagement from their own session on this device. Access is stored in this browser only.</span>
        </div>`,
      footer: '<button class="btn btn-primary" data-c>Done</button>'
    });

    const root = m.root;

    // Role hint
    const roleSelect = root.querySelector('#team-role-select');
    const roleHint = root.querySelector('#team-role-hint');
    function updateHint() {
      const r = TEAM_ROLES.find(x => x.value === roleSelect?.value);
      if (roleHint) roleHint.textContent = r?.blurb || '';
    }
    roleSelect?.addEventListener('change', updateHint);
    updateHint();

    // Add member
    root.querySelector('#team-add-btn')?.addEventListener('click', () => {
      const userId = root.querySelector('#team-user-select').value;
      const role   = root.querySelector('#team-role-select').value;
      if (!userId) { U.toast('Select a user to add', 'err'); return; }
      addMember(eng, userId, role);
      Store.saveEngagement(eng);
      const addedUser = Store.userById(userId);
      Store.log(`Added ${addedUser?.name || userId} to team of engagement`, eng.name, eng.id);
      U.toast(`${addedUser?.name || 'User'} added as ${roleLabel(role)}`, 'ok');
      root.querySelector('#team-members-list').innerHTML = membersHtml();
      // Rebuild addable options
      const sel = root.querySelector('#team-user-select');
      if (sel) {
        sel.innerHTML = '<option value="">— Select a user —</option>' +
          addableUsers().map(u => `<option value="${U.esc(u.id)}">${U.esc(u.name)} (${U.esc(u.email)})</option>`).join('');
      }
      if (onSaved) onSaved();
    });

    // Role change & remove (delegate from members list)
    root.querySelector('#team-members-list').addEventListener('change', e => {
      const sel = e.target.closest('.team-role-select');
      if (!sel) return;
      const uid = sel.dataset.memberId;
      addMember(eng, uid, sel.value);
      Store.saveEngagement(eng);
      const u = Store.userById(uid);
      U.toast(`${u?.name || 'User'}'s role updated to ${roleLabel(sel.value)}`, 'ok');
      if (onSaved) onSaved();
    });

    root.querySelector('#team-members-list').addEventListener('click', async e => {
      const btn = e.target.closest('.team-remove-btn');
      if (!btn) return;
      const uid = btn.dataset.memberId;
      const u = Store.userById(uid);
      const ok = await U.confirmDialog({
        title: 'Remove from team?',
        message: `<strong>${U.esc(u?.name || uid)}</strong> will no longer be able to access this engagement.`,
        confirmLabel: 'Remove', danger: true
      });
      if (!ok) return;
      removeMember(eng, uid);
      Store.saveEngagement(eng);
      Store.log(`Removed ${u?.name || uid} from team`, eng.name, eng.id);
      U.toast(`${u?.name || 'User'} removed`, 'ok');
      root.querySelector('#team-members-list').innerHTML = membersHtml();
      const sel = root.querySelector('#team-user-select');
      if (sel) {
        sel.innerHTML = '<option value="">— Select a user —</option>' +
          addableUsers().map(u => `<option value="${U.esc(u.id)}">${U.esc(u.name)} (${U.esc(u.email)})</option>`).join('');
      }
      if (onSaved) onSaved();
    });
  }

  function avatarInitials(name) {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  return { canAccess, effectiveRole, canEditEngagement, openTeamModal, roleLabel, addMember, removeMember, TEAM_ROLES };

})();
