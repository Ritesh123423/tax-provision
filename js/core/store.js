'use strict';

/**
 * STORE.JS — Persistence layer.
 *
 * Everything lives in one localStorage key so a backup is a single JSON file
 * and a migration is a single read-transform-write.
 *
 * SCOPE NOTE: this is browser-local storage. Data does not sync between
 * machines or browsers, and it is readable by anyone with access to the
 * device profile. See README for what a real deployment needs.
 */

const Store = (() => {

  const KEY = 'kgs.indas12.v3';
  const SCHEMA = 3;

  /* ---------------- Reference data ---------------- */

  /** Statutory rate master. Admin-editable; these are the seed values. */
  const SEED_RATES = [
    { id: 'r_115baa', code: '115BAA', label: 'New regime — s.115BAA',        base: 22,  surcharge: 10, cess: 4, rate: 25.168, matRate: 0,      note: '22% + 10% surcharge + 4% cess. MAT does not apply.', active: true, isDefault: true },
    { id: 'r_normal', code: 'NORMAL', label: 'Domestic company — 30% slab',  base: 30,  surcharge: 12, cess: 4, rate: 34.944, matRate: 17.472, note: '30% + 12% surcharge + 4% cess. MAT u/s 115JB applies.', active: true, isDefault: false },
    { id: 'r_25pc',   code: '25PC',   label: 'Turnover ≤ ₹400 cr — 25% slab',base: 25,  surcharge: 12, cess: 4, rate: 29.12,  matRate: 17.472, note: '25% + 12% surcharge + 4% cess.', active: true, isDefault: false },
    { id: 'r_115bab', code: '115BAB', label: 'New manufacturing — s.115BAB', base: 15,  surcharge: 10, cess: 4, rate: 17.16,  matRate: 0,      note: '15% + 10% surcharge + 4% cess. MAT does not apply.', active: true, isDefault: false },
    { id: 'r_llp',    code: 'LLP',    label: 'LLP / firm — 30%',             base: 30,  surcharge: 12, cess: 4, rate: 34.944, matRate: 18.5,   note: 'AMT u/s 115JC may apply.', active: true, isDefault: false }
  ];

  /** Default QC checklist. Admin can add, edit and reorder these. */
  const SEED_CHECKLIST = [
    { id: 'c01', group: 'Approach',    text: 'Balance sheet (temporary difference) approach applied, not the timing difference approach', ref: 'Ind AS 12.5' },
    { id: 'c02', group: 'Approach',    text: 'Tax base of each asset and liability determined by reference to the Income Tax Act, 1961', ref: 'Ind AS 12.7–8' },
    { id: 'c03', group: 'Completeness',text: 'Every balance sheet line item assessed for a temporary difference, including nil-tax-base items', ref: 'Ind AS 12.15, 24' },
    { id: 'c04', group: 'Completeness',text: 'Ind AS 116 right-of-use asset and lease liability temporary differences recognised', ref: 'Ind AS 12.15' },
    { id: 'c05', group: 'Completeness',text: 'Fair value remeasurements under Ind AS 109 and Ind AS 113 carry deferred tax', ref: 'Ind AS 12.20' },
    { id: 'c06', group: 'Measurement', text: 'Rate used is enacted or substantively enacted at the reporting date', ref: 'Ind AS 12.47' },
    { id: 'c07', group: 'Measurement', text: 'Deferred tax measured undiscounted', ref: 'Ind AS 12.53' },
    { id: 'c08', group: 'Measurement', text: 'Effect of any change in tax rate on opening balances separately identified', ref: 'Ind AS 12.60, 81(d)' },
    { id: 'c09', group: 'Recognition', text: 'DTA recognised only to the extent future taxable profit is probable, with supporting projections on file', ref: 'Ind AS 12.24, 34' },
    { id: 'c10', group: 'Recognition', text: 'Unrecognised DTA identified and disclosed', ref: 'Ind AS 12.81(e)' },
    { id: 'c11', group: 'Recognition', text: 'Initial recognition exception considered for goodwill and asset acquisitions', ref: 'Ind AS 12.15(a), 24' },
    { id: 'c12', group: 'Recognition', text: 'MAT credit entitlement recognised only where utilisation within the carry-forward window is probable', ref: 's.115JAA' },
    { id: 'c13', group: 'Allocation',  text: 'Tax on items routed through OCI charged to OCI, not to profit or loss', ref: 'Ind AS 12.61A' },
    { id: 'c14', group: 'Presentation',text: 'DTA and DTL offset only where a legally enforceable right exists with the same taxing authority', ref: 'Ind AS 12.74' },
    { id: 'c15', group: 'Presentation',text: 'Deferred tax classified as non-current in the balance sheet', ref: 'Sch III, Div II' },
    { id: 'c16', group: 'Reconciliation', text: 'Opening balances agreed to prior year signed financial statements', ref: 'SA 510' },
    { id: 'c17', group: 'Reconciliation', text: 'Opening plus movement equals closing for every deferred tax component', ref: 'SA 520' },
    { id: 'c18', group: 'Reconciliation', text: 'Effective tax rate reconciliation prepared and the residual is immaterial', ref: 'Ind AS 12.81(c)' },
    { id: 'c19', group: 'Reconciliation', text: 'Journal entries cast and cross-cast; debits equal credits', ref: 'SA 330' },
    { id: 'c20', group: 'Disclosure',  text: 'Note discloses major components of tax expense and the temporary difference analysis', ref: 'Ind AS 12.79–81' },
    { id: 'c21', group: 'Disclosure',  text: 'Expiry dates of unused tax losses and credits disclosed', ref: 'Ind AS 12.81(e)' },
    { id: 'c22', group: 'Sign-off',    text: 'Workpaper prepared, reviewed and signed by staff of appropriate seniority', ref: 'SA 220' }
  ];

  const DEFAULT_FIRM = {
    name: 'K G Somani & Co LLP',
    shortName: 'KGS',
    tagline: 'Chartered Accountants',
    sessionMinutes: 60,
    passwordMinLen: 10,
    maxFailedLogins: 5,
    lockoutMinutes: 15,
    allowSelfRegistration: true
  };

  /* ---------------- Read / write ---------------- */

  let cache = null;
  const listeners = new Set();

  function blank() {
    return {
      schema: SCHEMA,
      createdAt: new Date().toISOString(),
      firm: { ...DEFAULT_FIRM },
      users: [],
      engagements: [],
      rates: U.deepClone(SEED_RATES),
      checklistTemplate: U.deepClone(SEED_CHECKLIST),
      log: [],
      session: null
    };
  }

  function load() {
    if (cache) return cache;
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    if (!raw) { cache = blank(); persist(); return cache; }
    try {
      const parsed = JSON.parse(raw);
      cache = migrate(parsed);
    } catch {
      // A corrupt payload is kept aside rather than silently destroyed.
      try { localStorage.setItem(KEY + '.corrupt.' + Date.now(), raw); } catch {}
      cache = blank();
    }
    return cache;
  }

  /** Bring an older payload up to the current schema. */
  function migrate(db) {
    if (!db || typeof db !== 'object') return blank();
    db.schema = db.schema || 1;
    db.firm = { ...DEFAULT_FIRM, ...(db.firm || {}) };
    db.users = Array.isArray(db.users) ? db.users : [];
    db.engagements = Array.isArray(db.engagements) ? db.engagements : [];
    db.log = Array.isArray(db.log) ? db.log : [];
    // Reseed only when the key is genuinely absent (an old/corrupt payload),
    // not merely empty — an admin who deliberately deletes every rate or
    // checklist point (now blocked at the delete call sites, but still
    // possible via a hand-edited import) should not have that silently
    // undone on the next load with no log entry explaining why.
    if (!Array.isArray(db.rates)) db.rates = U.deepClone(SEED_RATES);
    if (!Array.isArray(db.checklistTemplate)) db.checklistTemplate = U.deepClone(SEED_CHECKLIST);
    db.schema = SCHEMA;
    return db;
  }

  function persist() {
    if (!cache) return true;
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
      return true;
    } catch (e) {
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22);
      U.toast(quota
        ? 'Storage is full. Export a backup, then remove old engagements.'
        : 'Could not save. This browser is blocking local storage.', 'err', 6000);
      return false;
    }
  }

  /** Mutate the database and notify subscribers. */
  function commit(fn) {
    const db = load();
    const result = fn(db);
    persist();
    listeners.forEach(l => { try { l(db); } catch {} });
    return result;
  }

  const subscribe = fn => { listeners.add(fn); return () => listeners.delete(fn); };

  /* ---------------- Audit log ---------------- */

  /**
   * Append an immutable-by-convention log entry. Capped so storage
   * cannot be exhausted by activity alone.
   */
  function log(action, detail = '', target = '') {
    const db = load();
    const u = db.session ? db.users.find(x => x.id === db.session.userId) : null;
    db.log.unshift({
      id: U.uid('lg'),
      ts: new Date().toISOString(),
      userId: u?.id || null,
      userName: u?.name || 'System',
      action, detail, target
    });
    if (db.log.length > 2000) db.log.length = 2000;
    persist();
  }

  const getLog = () => load().log;
  const clearLog = () => commit(db => { db.log = []; });

  /* ---------------- Users ---------------- */

  const ROLES = {
    admin:    { label: 'Administrator', rank: 4, blurb: 'Full control: users, rate master, checklist, every engagement.' },
    manager:  { label: 'Manager',       rank: 3, blurb: 'Prepare and review any engagement, and sign off.' },
    preparer: { label: 'Preparer',      rank: 2, blurb: 'Create and edit engagements assigned to them.' },
    viewer:   { label: 'Read only',     rank: 1, blurb: 'View and export. No edits.' }
  };

  const users = () => load().users;
  const userById = id => users().find(u => u.id === id) || null;
  const userByEmail = email => users().find(u => u.email.toLowerCase() === String(email).toLowerCase().trim()) || null;

  function addUser(u) {
    return commit(db => {
      const rec = {
        id: U.uid('us'),
        createdAt: new Date().toISOString(),
        status: 'active',
        failCount: 0,
        lockedUntil: null,
        lastLoginAt: null,
        mustChangePassword: false,
        ...u
      };
      db.users.push(rec);
      return rec;
    });
  }

  function updateUser(id, patch) {
    return commit(db => {
      const u = db.users.find(x => x.id === id);
      if (u) Object.assign(u, patch);
      return u;
    });
  }

  function deleteUser(id) {
    // The suspend and role-change paths already refuse to touch the last
    // active administrator; the delete path must too, and — unlike those
    // two, which are only guarded in admin.js at render time — this guard
    // lives in the store itself so no call site (present or future) can
    // route around it via a stale render.
    const u = userById(id);
    if (u && u.role === 'admin' && u.status === 'active' && adminCount() <= 1) {
      return { ok: false, error: 'This is the only active administrator. Promote someone else first.' };
    }
    commit(db => {
      db.users = db.users.filter(x => x.id !== id);
      // Engagements outlive their author; ownership falls back to unassigned.
      db.engagements.forEach(e => {
        if (e.ownerId === id) e.ownerId = null;
        if (e.assignedTo === id) e.assignedTo = null;
      });
    });
    return { ok: true };
  }

  const adminCount = () => users().filter(u => u.role === 'admin' && u.status === 'active').length;

  /* ---------------- Engagements ---------------- */

  /** A fresh engagement, pre-seeded with the lines a preparer expects to see. */
  function newEngagement(ownerId) {
    const rate = load().rates.find(r => r.isDefault) || load().rates[0];
    const fy = U.fyFor();
    const yr = parseInt(fy.slice(0, 4), 10);
    return {
      id: U.uid('eng'),
      name: '',
      cin: '',
      pan: '',
      fy,
      bsDate: `${yr + 1}-03-31`,
      rateId: rate.id,
      rate: rate.rate,
      priorRate: rate.rate,
      matRate: rate.matRate,
      applyMat: rate.matRate > 0,
      standard: 'indas12',
      offsetPresentation: true,
      preparedBy: '',
      reviewedBy: '',
      prepDate: U.todayISO(),
      status: 'draft',
      ownerId: ownerId || null,
      assignedTo: ownerId || null,
      locked: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),

      opening: { dta: 0, dtl: 0, mat: 0 },

      ct: {
        matBookProfit: 0,
        advanceTax: 0,
        matUtilised: 0,
        priorYearAdj: 0,
        rows: seedCtRows()
      },

      dt: {
        assets: seedAssets(),
        liabs: seedLiabs(),
        others: seedOthers()
      },

      checklist: {},
      notes: ''
    };
  }

  const R = () => U.uid('r');

  function seedCtRows() {
    // nature: 'perm' feeds the ETR reconciliation; 'temp' should also appear
    // in the deferred tax schedule, so it is excluded from the ETR explanation.
    return [
      { id: R(), label: 'Profit before tax as per Statement of Profit and Loss', amt: '', type: 'book', nature: 'perm', locked: true },
      { id: R(), label: 'Depreciation and amortisation charged in the books', amt: '', type: 'add',  nature: 'temp' },
      { id: R(), label: 'Depreciation allowable u/s 32', amt: '', type: 'less', nature: 'temp' },
      { id: R(), label: 'Provision for gratuity and leave encashment (s.43B / 40A(7))', amt: '', type: 'add', nature: 'temp' },
      { id: R(), label: 'Expected credit loss and provision for doubtful debts', amt: '', type: 'add', nature: 'temp' },
      { id: R(), label: 'Ind AS 116 lease charge in books (depreciation and interest)', amt: '', type: 'add', nature: 'temp' },
      { id: R(), label: 'Lease rent actually paid, allowable for tax', amt: '', type: 'less', nature: 'temp' },
      { id: R(), label: 'Expenditure disallowed u/s 40(a)(i)/(ia) — TDS default', amt: '', type: 'add', nature: 'perm' },
      { id: R(), label: 'Penalties, fines and expenditure of a personal nature', amt: '', type: 'add', nature: 'perm' },
      { id: R(), label: 'Corporate social responsibility spend disallowed u/s 37', amt: '', type: 'add', nature: 'perm' },
      { id: R(), label: 'Income exempt u/s 10 and s.10(34)', amt: '', type: 'less', nature: 'perm' },
      { id: R(), label: 'Deduction u/s 80JJAA and Chapter VI-A', amt: '', type: 'less', nature: 'perm' },
      { id: R(), label: 'Brought forward business loss set off u/s 72', amt: '', type: 'less', nature: 'temp' }
    ];
  }

  function seedAssets() {
    return [
      { id: R(), label: 'Property, plant and equipment — net block', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Books: Sch II / Ind AS 16 WDV. Tax base: block WDV u/s 32.' },
      { id: R(), label: 'Capital work in progress', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base is nil until the asset is put to use.' },
      { id: R(), label: 'Intangible assets', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: '' },
      { id: R(), label: 'Right-of-use assets (Ind AS 116)', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil — tax follows lease rent paid.' },
      { id: R(), label: 'Investments at fair value through profit or loss', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base is cost.' },
      { id: R(), label: 'Investments at fair value through OCI', ca: '', tb: '', open: '', openUnrec: '', alloc: 'oci', recognised: true, note: 'Tax on the remeasurement follows the gain into OCI.' },
      { id: R(), label: 'Trade receivables — gross of loss allowance', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: '' },
      { id: R(), label: 'Inventories', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: '' }
    ];
  }

  function seedLiabs() {
    return [
      { id: R(), label: 'Provision for gratuity — defined benefit obligation', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil. Allowed on payment u/s 43B / 40A(7).' },
      { id: R(), label: 'Provision for leave encashment', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil. Allowed on payment.' },
      { id: R(), label: 'Actuarial remeasurement component in OCI', ca: '', tb: '', open: '', openUnrec: '', alloc: 'oci', recognised: true, note: 'Ind AS 19 remeasurements sit in OCI, so their tax does too.' },
      { id: R(), label: 'Provision for bonus and ex-gratia', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil if unpaid by the return due date.' },
      { id: R(), label: 'Loss allowance / expected credit loss', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil until actual write-off.' },
      { id: R(), label: 'Lease liability (Ind AS 116)', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil.' },
      { id: R(), label: 'Warranty provision', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: 'Tax base nil until the claim is settled.' },
      { id: R(), label: 'Contract liabilities and advances from customers', ca: '', tb: '', open: '', openUnrec: '', alloc: 'pl', recognised: true, note: '' }
    ];
  }

  function seedOthers() {
    // isTaxAmount marks a figure that is ALREADY a tax amount and must not be
    // multiplied by the rate again. MAT credit is the classic case.
    return [
      { id: R(), label: 'Unabsorbed depreciation carried forward u/s 32(2)', amt: '', side: 'dta', open: '', openUnrec: '', alloc: 'pl', recognised: true, isTaxAmount: false, expiry: 'No time limit', note: 'Recognise only where future taxable profit is probable.' },
      { id: R(), label: 'Business loss carried forward u/s 72', amt: '', side: 'dta', open: '', openUnrec: '', alloc: 'pl', recognised: false, isTaxAmount: false, expiry: '8 assessment years', note: 'Left unrecognised by default — switch on once projections support it.' },
      { id: R(), label: 'Unabsorbed capital loss u/s 74', amt: '', side: 'dta', open: '', openUnrec: '', alloc: 'pl', recognised: false, isTaxAmount: false, expiry: '8 assessment years', note: 'Recoverable only against future capital gains.' }
    ];
  }

  const engagements = () => load().engagements;
  const engagementById = id => engagements().find(e => e.id === id) || null;

  function addEngagement(eng) {
    return commit(db => { db.engagements.push(eng); return eng; });
  }

  /**
   * Unlike the generic commit(), this returns whether the write actually
   * reached storage — State.saveNow() needs that to tell a real save from
   * a quota failure that silently looks identical to one.
   */
  function saveEngagement(eng) {
    const db = load();
    const i = db.engagements.findIndex(e => e.id === eng.id);
    eng.updatedAt = new Date().toISOString();
    if (i >= 0) db.engagements[i] = eng; else db.engagements.push(eng);
    const ok = persist();
    listeners.forEach(l => { try { l(db); } catch {} });
    return ok;
  }

  function deleteEngagement(id) {
    return commit(db => { db.engagements = db.engagements.filter(e => e.id !== id); });
  }

  function duplicateEngagement(id, ownerId) {
    const src = engagementById(id);
    if (!src) return null;
    const copy = U.deepClone(src);
    copy.id = U.uid('eng');
    copy.name = src.name ? src.name + ' (copy)' : 'Untitled (copy)';
    copy.status = 'draft';
    copy.locked = false;
    copy.ownerId = ownerId;
    copy.createdAt = copy.updatedAt = new Date().toISOString();
    copy.checklist = {};
    return addEngagement(copy);
  }

  /**
   * Roll an engagement forward: closing balances become opening balances,
   * figures are cleared, structure and labels are kept.
   */
  function rollForward(id, ownerId, closing) {
    const src = engagementById(id);
    if (!src) return null;
    const next = U.deepClone(src);
    // The rate this year's opening balances were struck at, so the ETR
    // reconciliation can isolate a rate change from a missing schedule entry.
    next.priorRate = src.rate;
    const yr = parseInt(String(src.fy).slice(0, 4), 10);
    next.id = U.uid('eng');
    next.fy = Number.isFinite(yr) ? `${yr + 1}-${String(yr + 2).slice(-2)}` : U.fyFor();
    next.bsDate = Number.isFinite(yr) ? `${yr + 2}-03-31` : src.bsDate;
    next.status = 'draft';
    next.locked = false;
    next.ownerId = ownerId;
    next.assignedTo = ownerId;
    next.checklist = {};
    next.reviewedBy = '';
    next.prepDate = U.todayISO();
    next.createdAt = next.updatedAt = new Date().toISOString();
    next.opening = { dta: U.round(closing.dta), dtl: U.round(closing.dtl), mat: U.round(closing.mat) };
    next.ct.rows.forEach(r => { r.amt = ''; });
    next.ct.advanceTax = 0; next.ct.matUtilised = 0; next.ct.priorYearAdj = 0; next.ct.matBookProfit = 0;
    // Last year's closing tax effect is this year's opening tax effect.
    const carry = row => { row.open = U.round(closing.rowTaxEffects?.[row.id] ?? 0); };
    next.dt.assets.forEach(r => { carry(r); r.ca = ''; r.tb = ''; });
    next.dt.liabs.forEach(r => { carry(r); r.ca = ''; r.tb = ''; });
    next.dt.others.forEach(r => { carry(r); r.amt = ''; });
    // Row ids must be fresh so the two years are independent records.
    [...next.dt.assets, ...next.dt.liabs, ...next.dt.others, ...next.ct.rows].forEach(r => { r.id = R(); });
    return addEngagement(next);
  }

  /* ---------------- Rates & checklist template ---------------- */

  const rates = () => load().rates;
  const activeRates = () => rates().filter(r => r.active);
  const rateById = id => rates().find(r => r.id === id) || null;

  function saveRate(rate) {
    return commit(db => {
      const i = db.rates.findIndex(r => r.id === rate.id);
      if (i >= 0) db.rates[i] = rate; else db.rates.push(rate);
      if (rate.isDefault) db.rates.forEach(r => { if (r.id !== rate.id) r.isDefault = false; });
      return rate;
    });
  }
  function deleteRate(id) {
    // Deleting the last remaining regime would leave newEngagement() with
    // nothing to fall back on (it reads rates()[0] when there's no default).
    if (rates().length <= 1) return { ok: false, error: 'At least one tax regime must remain.' };
    commit(db => { db.rates = db.rates.filter(r => r.id !== id); });
    return { ok: true };
  }

  const checklistTemplate = () => load().checklistTemplate;
  function saveChecklistItem(item) {
    return commit(db => {
      const i = db.checklistTemplate.findIndex(c => c.id === item.id);
      if (i >= 0) db.checklistTemplate[i] = item; else db.checklistTemplate.push(item);
      return item;
    });
  }
  function deleteChecklistItem(id) {
    if (checklistTemplate().length <= 1) return { ok: false, error: 'At least one checklist point must remain.' };
    commit(db => { db.checklistTemplate = db.checklistTemplate.filter(c => c.id !== id); });
    return { ok: true };
  }
  const resetChecklistTemplate = () => commit(db => { db.checklistTemplate = U.deepClone(SEED_CHECKLIST); });

  /* ---------------- Firm settings ---------------- */

  const firm = () => load().firm;
  const saveFirm = patch => commit(db => { Object.assign(db.firm, patch); });

  /* ---------------- Backup / restore ---------------- */

  function exportAll() {
    const db = U.deepClone(load());
    delete db.session;
    return JSON.stringify(db, null, 2);
  }

  /** Restore a backup. Password hashes are preserved so logins keep working. */
  function importAll(json) {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users)) {
      throw new Error('That file is not a workpaper backup.');
    }
    const session = load().session;
    cache = migrate(parsed);
    cache.session = session;
    persist();
    listeners.forEach(l => { try { l(cache); } catch {} });
  }

  function factoryReset() {
    cache = blank();
    persist();
  }

  /* ---------------- Session (raw access; Auth owns the policy) ---------------- */

  const getSession = () => load().session;
  const setSession = s => commit(db => { db.session = s; });

  const usage = () => {
    try { return new Blob([localStorage.getItem(KEY) || '']).size; } catch { return 0; }
  };

  return {
    KEY, SCHEMA, ROLES, SEED_RATES,
    load, commit, subscribe, persist,
    log, getLog, clearLog,
    users, userById, userByEmail, addUser, updateUser, deleteUser, adminCount,
    engagements, engagementById, newEngagement, addEngagement, saveEngagement,
    deleteEngagement, duplicateEngagement, rollForward,
    rates, activeRates, rateById, saveRate, deleteRate,
    checklistTemplate, saveChecklistItem, deleteChecklistItem, resetChecklistTemplate,
    firm, saveFirm,
    exportAll, importAll, factoryReset,
    getSession, setSession, usage
  };
})();
