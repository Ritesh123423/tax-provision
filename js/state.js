'use strict';

/**
 * STATE.JS — The open engagement.
 *
 * Holds exactly one engagement in memory, resolves `data-bind` paths against
 * it, recomputes on change, and writes back to storage on a debounce so a
 * fast typist does not trigger a write per keystroke.
 *
 * FLICKER FIX: recompute() is split into two phases:
 *   1. Compute the result immediately (pure math, fast).
 *   2. Notify subscribers via rAF so DOM rebuilds never interrupt a keystroke.
 *
 * The render() callback in ui.js also guards fillFields() against active
 * elements, but the real fix is here: subscribers are never called synchronously
 * during an input event.
 */

const State = (() => {

  let current = null;   // the open engagement record
  let result = null;    // last Compute.run output
  let dirty = false;
  let saveFailed = false;
  let notifyPending = false;
  let pendingReason = 'edit';
  const subs = new Set();

  const get = () => current;
  const getResult = () => result;
  const isOpen = () => !!current;
  const hasSaveFailed = () => saveFailed;

  const onChange = fn => { subs.add(fn); return () => subs.delete(fn); };

  // Always schedule through rAF — this ensures DOM rebuilds never run
  // synchronously during an input event, which eliminates flicker/focus-loss.
  function notify(reason) {
    pendingReason = reason;
    if (notifyPending) return;   // coalesce rapid calls into one rAF
    notifyPending = true;
    requestAnimationFrame(() => {
      notifyPending = false;
      const r = pendingReason;
      subs.forEach(fn => { try { fn(result, current, r); } catch (err) { console.error(err); } });
    });
  }

  // For operations where callers need the render to be synchronous (open,
  // create, go()), use notifySync.
  function notifySync(reason) {
    notifyPending = false;
    subs.forEach(fn => { try { fn(result, current, reason); } catch (err) { console.error(err); } });
  }

  /* ---------------- Open / close ---------------- */

  function open(id) {
    const eng = Store.engagementById(id);
    if (!eng) return null;
    saveNow();
    current = eng;
    try { localStorage.setItem('kgs.lastEngagement', id); } catch {}
    result = Compute.run(current);
    dirty = false;
    Store.log('Opened engagement', eng.name || 'Untitled', eng.id);
    notifySync('open');
    return eng;
  }

  function close() {
    saveNow();
    current = null;
    result = null;
    notifySync('close');
  }

  function create(user) {
    saveNow();
    const eng = Store.newEngagement(user?.id);
    Store.addEngagement(eng);
    current = eng;
    try { localStorage.setItem('kgs.lastEngagement', eng.id); } catch {}
    Store.log('Created engagement', eng.fy, eng.id);
    result = Compute.run(current);
    dirty = false;
    notifySync('create');
    return eng;
  }

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

  /* ---------------- Path binding ---------------- */

  function resolve(path) {
    if (!current) return null;
    const parts = path.split('.');
    const key = parts.pop();

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
    // Compute synchronously — it's fast pure math
    result = Compute.run(current);
    dirty = true;
    scheduleSave();
    // Schedule DOM update via rAF — never blocks an input event
    notify(reason);
    return result;
  }

  const scheduleSave = U.debounce(() => saveNow(), 700);

  function saveNow() {
    if (!current || !dirty) return true;
    const ok = Store.saveEngagement(current);
    if (ok) { dirty = false; saveFailed = false; }
    else saveFailed = true;
    return ok;
  }

  function refresh() {
    if (!current) return null;
    result = Compute.run(current);
    notifySync('refresh');
    return result;
  }

  window.addEventListener('beforeunload', e => {
    scheduleSave.cancel?.();
    saveNow();
    if (saveFailed) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  return {
    get, getResult, isOpen, onChange, hasSaveFailed,
    open, close, create, restore,
    readPath, writePath,
    addCtRow, delCtRow, addDtRow, delDtRow,
    markChecklist, clearChecklist, setStatus,
    recompute, refresh, saveNow
  };
})();
