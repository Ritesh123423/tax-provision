'use strict';

/**
 * STATE.JS — The open engagement.
 *
 * Holds exactly one engagement in memory, resolves `data-bind` paths against
 * it, recomputes on change, and writes back to storage on a debounce so a
 * fast typist does not trigger a write per keystroke.
 */

const State = (() => {

  let current = null;   // the open engagement record
  let result = null;    // last Compute.run output
  let dirty = false;
  const subs = new Set();

  const get = () => current;
  const getResult = () => result;
  const isOpen = () => !!current;

  const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };
  const notify = (reason) => subs.forEach(fn => { try { fn(result, current, reason); } catch (err) { console.error(err); } });

  /* ---------------- Open / close ---------------- */

  function open(id) {
    const eng = Store.engagementById(id);
    if (!eng) return null;
    saveNow();
    current = eng;
    try { localStorage.setItem('kgs.lastEngagement', id); } catch {}
    recompute('open');
    Store.log('Opened engagement', eng.name || 'Untitled', eng.id);
    return eng;
  }

  function close() {
    saveNow();
    current = null;
    result = null;
    notify('close');
  }

  function create(user) {
    saveNow();
    const eng = Store.newEngagement(user?.id);
    Store.addEngagement(eng);
    current = eng;
    try { localStorage.setItem('kgs.lastEngagement', eng.id); } catch {}
    Store.log('Created engagement', eng.fy, eng.id);
    recompute('create');
    return eng;
  }

  /** Reopen whatever was last worked on, or the most recent accessible one. */
  function restore(user) {
    let id = null;
    try { id = localStorage.getItem('kgs.lastEngagement'); } catch {}
    const visible = Auth.visibleEngagements(user);
    if (id && visible.some(e => e.id === id)) return open(id);
    if (visible.length) {
      const latest = [...visible].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];
      return open(latest.id);
    }
    return null;
  }

  /* ---------------- Path binding ----------------
     Paths look like `dt.assets.<rowId>.ca` or `ct.rows.<rowId>.amt`, and
     scalar fields use a plain path such as `opening.dta`.
     ---------------------------------------------- */

  /** Locate the container holding a bound value, plus the final key. */
  function resolve(path) {
    if (!current) return null;
    const parts = path.split('.');
    const key = parts.pop();

    // Row collections are arrays keyed by id, not objects.
    if (parts.length === 2 && parts[0] === 'ct' && parts[1] === 'rows') return null;
    if (parts.length === 3) {
      const [a, b, rowId] = parts;
      const arr = a === 'ct' && b === 'rows' ? current.ct.rows
        : a === 'dt' ? current.dt?.[b]
        : null;
      if (!Array.isArray(arr)) return null;
      const row = arr.find(r => r.id === rowId);
      return row ? { obj: row, key } : null;
    }

    let obj = current;
    for (const p of parts) {
      if (obj == null) return null;
      obj = obj[p];
    }
    return obj ? { obj, key } : null;
  }

  const readPath = path => { const t = resolve(path); return t ? t.obj[t.key] : undefined; };

  function writePath(path, value) {
    const t = resolve(path);
    if (!t) return false;
    t.obj[t.key] = value;
    return true;
  }

  /* ---------------- Rows ---------------- */

  const newId = () => U.uid('r');

  function addCtRow() {
    current.ct.rows.push({ id: newId(), label: 'New adjustment', amt: '', type: 'add', nature: 'perm' });
    recompute('rows');
  }

  function delCtRow(id) {
    current.ct.rows = current.ct.rows.filter(r => r.id !== id || r.locked);
    recompute('rows');
  }

  function addDtRow(group) {
    const base = { id: newId(), label: 'New line', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: '' };
    if (group === 'others') current.dt.others.push({ ...base, amt: '', side: 'dta', isTaxAmount: false, expiry: '' });
    else current.dt[group].push({ ...base, ca: '', tb: '' });
    recompute('rows');
  }

  function delDtRow(group, id) {
    current.dt[group] = current.dt[group].filter(r => r.id !== id);
    recompute('rows');
  }

  /* ---------------- Checklist ---------------- */

  /** Marking the same state twice clears it, so a mis-click is one click to undo. */
  function markChecklist(itemId, state, user) {
    current.checklist = current.checklist || {};
    const existing = current.checklist[itemId];
    if (existing?.state === state) delete current.checklist[itemId];
    else current.checklist[itemId] = { state, by: user?.name || 'Unknown', at: new Date().toISOString() };
    recompute('checklist');
  }

  function clearChecklist() {
    current.checklist = {};
    recompute('checklist');
  }

  /* ---------------- Status ---------------- */

  function setStatus(status, user) {
    current.status = status;
    if (status === 'signed') {
      current.signedBy = user?.name || 'Unknown';
      current.signedAt = new Date().toISOString();
      if (!current.reviewedBy) current.reviewedBy = user?.name || '';
    } else {
      current.signedBy = null;
      current.signedAt = null;
    }
    Store.log(
      status === 'signed' ? 'Signed off engagement' : status === 'review' ? 'Sent engagement for review' : 'Returned engagement to draft',
      current.name || 'Untitled', current.id
    );
    recompute('status');
  }

  /* ---------------- Compute & persist ---------------- */

  function recompute(reason = 'edit') {
    if (!current) { result = null; notify(reason); return null; }
    result = Compute.run(current);
    dirty = true;
    scheduleSave();
    notify(reason);
    return result;
  }

  const scheduleSave = U.debounce(() => saveNow(), 700);

  function saveNow() {
    if (!current || !dirty) return;
    Store.saveEngagement(current);
    dirty = false;
  }

  /** Recompute without touching storage — used when only display options change. */
  function refresh() {
    if (!current) return null;
    result = Compute.run(current);
    notify('refresh');
    return result;
  }

  // A tab closing mid-edit must not lose the last few keystrokes.
  window.addEventListener('beforeunload', () => { scheduleSave.cancel?.(); saveNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  return {
    get, getResult, isOpen, onChange,
    open, close, create, restore,
    readPath, writePath,
    addCtRow, delCtRow, addDtRow, delDtRow,
    markChecklist, clearChecklist, setStatus,
    recompute, refresh, saveNow
  };
})();
