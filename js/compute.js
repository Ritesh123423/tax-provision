'use strict';

/**
 * COMPUTE.JS — Ind AS 12 computation engine.
 *
 * Pure functions: it takes an engagement record and returns a result object.
 * Nothing here touches the DOM, so the same engine drives the screen, the
 * print view, and the Excel export, and it can be reasoned about in isolation.
 *
 * ── Sign convention ─────────────────────────────────────────────────────────
 * Deferred tax is carried as a single signed net figure per line:
 *     positive  = deferred tax ASSET
 *     negative  = deferred tax LIABILITY
 * That is what makes "opening + movement = closing" articulate on one axis
 * instead of two, which is the whole point of the balance sheet approach.
 *
 * ── Temporary differences (Ind AS 12.15–.24) ────────────────────────────────
 *     Temporary difference = carrying amount − tax base
 *     Asset:     CA > TB → taxable TD     → DTL
 *                CA < TB → deductible TD  → DTA
 *     Liability: CA > TB → deductible TD  → DTA
 *                CA < TB → taxable TD     → DTL
 *
 * ── Tax expense ─────────────────────────────────────────────────────────────
 *     Current tax expense    = tax for the year + prior period adjustments
 *     Deferred tax (P&L)     = −(movement in P&L-allocated net deferred tax)
 *     Deferred tax (OCI)     = −(movement in OCI-allocated net deferred tax)
 *     MAT credit effect      = credit utilised − credit recognised
 *     Total tax expense      = current + deferred (P&L) + MAT credit effect
 */

const Compute = (() => {

  const n = U.toNum;

  /** Amounts below this are treated as nil, so float dust never shows up. */
  const EPS = 0.5;

  /* ==========================================================
     1. CURRENT TAX
     ========================================================== */

  function currentTax(eng) {
    const rate = n(eng.rate) / 100;
    const matRate = n(eng.matRate) / 100;
    const ct = eng.ct || {};

    let bookProfit = 0;
    let addsPerm = 0, addsTemp = 0, lessPerm = 0, lessTemp = 0;
    const lines = [];

    (ct.rows || []).forEach(r => {
      const amt = n(r.amt);
      if (r.type === 'book') {
        bookProfit = amt;
        lines.push({ ...r, effect: amt });
        return;
      }
      const perm = r.nature === 'perm';
      if (r.type === 'add') {
        if (perm) addsPerm += amt; else addsTemp += amt;
        lines.push({ ...r, effect: amt });
      } else {
        if (perm) lessPerm += amt; else lessTemp += amt;
        lines.push({ ...r, effect: -amt });
      }
    });

    const taxableIncome = bookProfit + addsPerm + addsTemp - lessPerm - lessTemp;

    // Normal provisions
    const taxableForRate = Math.max(0, taxableIncome);
    const normalTax = taxableForRate * rate;

    // Minimum alternate tax u/s 115JB. Book profit for MAT is a separate
    // computation, so it is entered separately and falls back to PBT.
    // An explicit entry of 0 is a real MAT book profit, not a blank field, so
    // only the presence of the field decides the fallback — never its value.
    const matBase = ct.matBookProfit !== '' && ct.matBookProfit !== null && ct.matBookProfit !== undefined
      ? n(ct.matBookProfit) : bookProfit;
    const matTax = eng.applyMat && matRate > 0 ? Math.max(0, matBase) * matRate : 0;
    const matApplies = eng.applyMat && matRate > 0 && matTax > normalTax + EPS;

    const taxForYear = matApplies ? matTax : normalTax;
    // Credit arises only for the excess of MAT over tax under normal provisions.
    const matCreditCreated = matApplies ? matTax - normalTax : 0;

    // Credit cannot be utilised in a year in which MAT itself applies, and
    // cannot exceed the opening entitlement.
    const openingMat = n(eng.opening?.mat);
    const matUtilisedReq = n(ct.matUtilised);
    const matUtilised = matApplies ? 0 : Math.min(Math.max(0, matUtilisedReq), openingMat);
    // Two distinct reasons the request wasn't honoured in full — conflating them
    // produced a false "exceeds the opening entitlement" error in a MAT year
    // even when the requested figure was well within the entitlement.
    const matBlockedByMatYear = matApplies && matUtilisedReq > EPS;
    const matExceedsOpening = !matApplies && matUtilisedReq > matUtilised + EPS;
    const matUtilCapped = matExceedsOpening;

    const priorYearAdj = n(ct.priorYearAdj);
    const currentTaxExpense = taxForYear + priorYearAdj;

    const advanceTax = n(ct.advanceTax);
    // Not clamped at zero: a refund is a real outcome and must show as one.
    const netPayable = currentTaxExpense - matUtilised - advanceTax;

    return {
      bookProfit, taxableIncome, lines,
      addsPerm, addsTemp, lessPerm, lessTemp,
      rate: n(eng.rate), matRate: n(eng.matRate),
      normalTax, matBase, matTax, matApplies,
      taxForYear, matCreditCreated, matUtilised, matUtilCapped,
      matBlockedByMatYear, matExceedsOpening, openingMat,
      priorYearAdj, currentTaxExpense, advanceTax, netPayable,
      isRefund: netPayable < -EPS
    };
  }

  /* ==========================================================
     2. DEFERRED TAX
     ========================================================== */

  /**
   * Resolve one balance-sheet line into signed opening and closing tax effects.
   * @param {object} r   the row
   * @param {'asset'|'liab'} kind
   * @param {number} rate decimal rate
   */
  function resolveBsRow(r, kind, rate) {
    const hasCa = r.ca !== '' && r.ca !== null && r.ca !== undefined;
    const hasTb = r.tb !== '' && r.tb !== null && r.tb !== undefined;
    const ca = n(r.ca), tb = n(r.tb);
    const td = ca - tb;

    // Assets invert: an excess carrying amount is a future taxable amount.
    const signedFull = (kind === 'asset' ? -td : td) * rate;
    const recognised = r.recognised !== false;
    const signedClose = recognised ? signedFull : 0;
    const signedOpen = n(r.open);

    const nature = Math.abs(signedFull) < EPS ? '' : (signedFull > 0 ? 'DTA' : 'DTL');

    return {
      ...r, kind, ca, tb, td, hasData: hasCa || hasTb,
      taxEffect: Math.abs(signedFull),
      signedFull, signedClose, signedOpen,
      movement: signedClose - signedOpen,
      nature, recognised,
      alloc: r.alloc === 'oci' ? 'oci' : 'pl',
      unrecognisedDta: !recognised && signedFull > 0 ? signedFull : 0,
      // A liability has no general non-recognition test under Ind AS 12 (only
      // the narrow initial-recognition exception) — track it so an unchecked
      // "recognised" box on a DTL row cannot make a real liability vanish
      // from every total without a trace anywhere in the workpaper.
      unrecognisedDtl: !recognised && signedFull < 0 ? -signedFull : 0,
      // Opening unrecognised amount. Needed so the effective rate reflects the
      // MOVEMENT in unrecognised assets, not the whole brought-forward balance
      // — a loss unrecognised last year already hit last year's rate.
      openUnrec: n(r.openUnrec)
    };
  }

  /** "Other items": losses and credits, stated as an amount plus a side. */
  function resolveOtherRow(r, rate) {
    const amt = n(r.amt);
    // A figure that is already a tax amount (MAT credit, foreign tax credit)
    // must NOT be multiplied by the rate a second time.
    const magnitude = r.isTaxAmount ? Math.abs(amt) : Math.abs(amt) * rate;
    const sign = r.side === 'dtl' ? -1 : 1;
    const signedFull = magnitude * sign;
    const recognised = r.recognised !== false;
    const signedClose = recognised ? signedFull : 0;
    const signedOpen = n(r.open);

    return {
      ...r, kind: 'other', amt, hasData: amt !== 0,
      taxEffect: magnitude,
      signedFull, signedClose, signedOpen,
      movement: signedClose - signedOpen,
      nature: Math.abs(signedFull) < EPS ? '' : (signedFull > 0 ? 'DTA' : 'DTL'),
      recognised,
      alloc: r.alloc === 'oci' ? 'oci' : 'pl',
      unrecognisedDta: !recognised && signedFull > 0 ? signedFull : 0,
      unrecognisedDtl: !recognised && signedFull < 0 ? -signedFull : 0,
      openUnrec: n(r.openUnrec)
    };
  }

  function deferredTax(eng, ct) {
    const rate = n(eng.rate) / 100;
    const dt = eng.dt || { assets: [], liabs: [], others: [] };

    const assets = (dt.assets || []).map(r => resolveBsRow(r, 'asset', rate));
    const liabs  = (dt.liabs  || []).map(r => resolveBsRow(r, 'liab', rate));
    const others = (dt.others || []).map(r => resolveOtherRow(r, rate));
    const all = [...assets, ...liabs, ...others];

    const sumBy = (rows, fn) => rows.reduce((s, r) => s + fn(r), 0);

    // Section subtotals, split by which side the line lands on.
    const sec = rows => ({
      dta: sumBy(rows, r => r.signedClose > 0 ? r.signedClose : 0),
      dtl: sumBy(rows, r => r.signedClose < 0 ? -r.signedClose : 0),
      td:  sumBy(rows, r => r.td || 0)
    });

    const secA = sec(assets), secL = sec(liabs), secO = sec(others);

    const grossDTA = secA.dta + secL.dta + secO.dta;
    const grossDTL = secA.dtl + secL.dtl + secO.dtl;
    const closingNet = grossDTA - grossDTL;

    // Opening: per prior year financial statements, versus the sum of the
    // per-line opening effects. These two must agree — it is the single most
    // useful check on the schedule.
    const openingFS = n(eng.opening?.dta) - n(eng.opening?.dtl);
    const openingRows = sumBy(all, r => r.signedOpen);
    const openingDiff = openingRows - openingFS;
    // P&L-allocated slice of the opening balance — needed to isolate the
    // effect of a tax rate change on brought-forward balances (Ind AS 12.60).
    const openingRowsPL = sumBy(all.filter(r => r.alloc === 'pl'), r => r.signedOpen);

    // Movement, split by where the tax follows the item it relates to.
    const movementPL  = sumBy(all.filter(r => r.alloc === 'pl'),  r => r.movement);
    const movementOCI = sumBy(all.filter(r => r.alloc === 'oci'), r => r.movement);
    const movementTotal = movementPL + movementOCI;

    // An increase in the net asset is a credit to profit or loss.
    const deferredTaxPL  = -movementPL;
    const deferredTaxOCI = -movementOCI;

    const unrecognisedDTA = sumBy(all, r => r.unrecognisedDta);
    const unrecognisedDTL = sumBy(all, r => r.unrecognisedDtl);
    const unrecognisedOpening = sumBy(all, r => r.openUnrec);
    const unrecognisedMovement = unrecognisedDTA - unrecognisedOpening;
    const unrecognisedRows = all.filter(r => r.unrecognisedDta > EPS || r.openUnrec > EPS);
    // Only the P&L-allocated part of that movement changes the effective rate.
    const unrecognisedMovementPL = sumBy(
      all.filter(r => r.alloc === 'pl'),
      r => r.unrecognisedDta - r.openUnrec
    );

    // MAT credit is a tax credit, not a temporary difference, so it is
    // tracked on its own schedule and presented separately.
    const matOpening = n(eng.opening?.mat);
    const matCreated = ct.matCreditCreated;
    const matUtilised = ct.matUtilised;
    const matClosing = matOpening + matCreated - matUtilised;
    const matEffectPL = matUtilised - matCreated;

    // Presentation. Ind AS 12.74 permits offset only where a legally
    // enforceable right exists with the same taxing authority — the
    // restrictive default is gross, not net, so an unset/imported field
    // must not be read as an election to offset.
    const offset = eng.offsetPresentation === true;
    const bsDTA = offset ? Math.max(0, closingNet) : grossDTA;
    const bsDTL = offset ? Math.max(0, -closingNet) : grossDTL;

    return {
      rate: n(eng.rate),
      assets, liabs, others, all,
      secA, secL, secO,
      grossDTA, grossDTL, closingNet,
      openingFS, openingRows, openingRowsPL, openingDiff,
      openingDTA: n(eng.opening?.dta), openingDTL: n(eng.opening?.dtl),
      movementPL, movementOCI, movementTotal,
      deferredTaxPL, deferredTaxOCI,
      unrecognisedDTA, unrecognisedDTL, unrecognisedRows,
      unrecognisedOpening, unrecognisedMovement, unrecognisedMovementPL,
      matOpening, matCreated, matUtilised, matClosing, matEffectPL,
      offset, bsDTA, bsDTL,
      // Closing tax effect per line, keyed by id — used to roll forward.
      // Kept at full precision: rounding here, ahead of the aggregate closing
      // figure being rounded separately on roll-forward, made the two round
      // independently and drift apart, which broke "opening agrees to prior
      // year" in the very next year even though nothing was actually wrong.
      rowTaxEffects: Object.fromEntries(all.map(r => [r.id, r.signedClose]))
    };
  }

  /* ==========================================================
     3. TAX EXPENSE & EFFECTIVE RATE
     ========================================================== */

  function taxExpense(ct, dt) {
    const current = ct.currentTaxExpense;
    const deferred = dt.deferredTaxPL;
    const matEffect = dt.matEffectPL;
    const total = current + deferred + matEffect;
    const etr = Math.abs(ct.bookProfit) > EPS ? (total / ct.bookProfit) * 100 : NaN;
    return { current, deferred, matEffect, total, etr, ociTax: dt.deferredTaxOCI };
  }

  /**
   * Effective tax rate reconciliation, Ind AS 12.81(c).
   *
   * Only permanent differences belong here. A temporary difference does not
   * change the effective rate: it moves tax between current and deferred and
   * nets to nil. The residual line is a genuine plug — if it is material, the
   * reconciliation has not been explained and the checklist flags it.
   */
  function etrRecon(eng, ct, dt, te) {
    const rate = n(eng.rate);
    const r = rate / 100;
    const pbt = ct.bookProfit;
    const rows = [];

    const push = (label, amount, opts = {}) => {
      rows.push({
        label, amount,
        pct: Math.abs(pbt) > EPS ? (amount / pbt) * 100 : NaN,
        ...opts
      });
    };

    push(`Tax at the statutory rate of ${rate.toFixed(3)}%`, pbt * r, { base: true });

    /* Permanent differences — the only things that genuinely move the rate. */
    push('Expenditure not deductible for tax', ct.addsPerm * r, { indent: true });
    push('Income exempt and deductions claimed', -ct.lessPerm * r, { indent: true });

    /* A current year loss carries no tax at the statutory rate, because tax on
       a negative taxable income is nil rather than a negative charge. */
    const lossEffect = -Math.min(0, ct.taxableIncome) * r;
    if (lossEffect > EPS)
      push('Current year tax loss not relieved against tax', lossEffect, { indent: true });

    /* Minimum alternate tax, net of the credit recognised on it. Nil where the
       whole excess is recognised as an entitlement, which is the usual case. */
    const matNet = (ct.taxForYear - ct.normalTax) - ct.matCreditCreated;
    if (Math.abs(matNet) > EPS)
      push('Minimum alternate tax, net of credit recognised', matNet, { indent: true });

    /* MAT credit utilised is charged to profit or loss in the year of
       utilisation, so it raises the effective rate for that year. */
    if (dt.matUtilised > EPS)
      push('MAT credit entitlement utilised', dt.matUtilised, { indent: true });

    /* The MOVEMENT in unrecognised deferred tax assets, not the brought-forward
       balance: an asset left unrecognised last year already hit last year's rate. */
    if (Math.abs(dt.unrecognisedMovementPL) > EPS)
      push('Deferred tax asset not recognised', dt.unrecognisedMovementPL, { indent: true });

    if (Math.abs(ct.priorYearAdj) > EPS)
      push('Tax relating to earlier years', ct.priorYearAdj, { indent: true });

    /* A change in the rate between last year and this one re-measures every
       brought-forward temporary difference (Ind AS 12.60, 81(d)). That
       re-measurement is a genuine P&L movement already embedded in
       dt.deferredTaxPL — without a line of its own it would otherwise be
       mistaken below for temporary differences missing from the schedule. */
    const priorRate = n(eng.priorRate);
    const rateChanged = priorRate > EPS && Math.abs(priorRate - rate) > EPS;
    const rateChangeEffect = rateChanged ? dt.openingRowsPL * (1 - rate / priorRate) : 0;
    if (Math.abs(rateChangeEffect) > EPS)
      push('Effect of change in tax rate on opening deferred tax', rateChangeEffect, { indent: true });

    /**
     * Diagnostic line — nil in a complete workpaper.
     *
     * A temporary difference lowers current tax and raises deferred tax by the
     * same amount, so it cannot move the effective rate. If the two fail to
     * offset, a difference flagged temporary in the current tax computation has
     * no matching line in the deferred tax schedule. Naming that is far more
     * useful to a reviewer than burying it in "other items".
     *
     * Unrecognised assets are deducted because their temporary difference sits
     * in the current tax computation while contributing nothing to deferred tax;
     * that gap is already explained by the line above. The rate-change effect
     * is deducted for the same reason — it is a real, already-explained P&L
     * movement, not evidence of a missing schedule entry.
     */
    const netTempCt = ct.addsTemp - ct.lessTemp;
    const tempGap = dt.deferredTaxPL + netTempCt * r - dt.unrecognisedMovementPL - rateChangeEffect;
    if (Math.abs(tempGap) > EPS)
      push('Temporary differences not carried to the deferred tax schedule', tempGap, { indent: true, diagnostic: true });

    const explained = rows.reduce((s, x) => s + x.amount, 0);
    const residual = te.total - explained;
    push('Other items and rounding', residual, { indent: true, residual: true });

    // Half a percent of profit before tax is worth a preparer's attention.
    const tolerance = Math.max(1000, Math.abs(pbt) * 0.005);
    return {
      rows, residual, explained, tolerance,
      residualMaterial: Math.abs(residual) > tolerance,
      tempGap,
      tempGapMaterial: Math.abs(tempGap) > tolerance,
      total: te.total,
      etr: te.etr,
      statutory: rate
    };
  }

  /* ==========================================================
     4. JOURNAL ENTRIES
     ========================================================== */

  /**
   * Journal entries as data, so the screen, the print sheet and the workbook
   * all render the same numbers. Each entry carries its own cast total.
   */
  function journals(eng, ct, dt, te) {
    const out = [];
    const dateLong = U.fmtDateLong(eng.bsDate);

    const entry = (ref, title, standard, lines, narration) => {
      const clean = lines.filter(l => Math.abs(l.amount) > EPS);
      if (!clean.length) return;
      const dr = clean.filter(l => l.side === 'Dr').reduce((s, l) => s + l.amount, 0);
      const cr = clean.filter(l => l.side === 'Cr').reduce((s, l) => s + l.amount, 0);
      out.push({
        ref, title, standard, date: dateLong,
        lines: clean, dr, cr,
        balanced: Math.abs(dr - cr) < 1,
        narration
      });
    };

    /* JE-1 — current tax charge for the year */
    entry('JE-1', 'Provision for current tax', 'Income Tax Act, 1961', [
      { side: 'Dr', account: 'Current tax expense', amount: ct.taxForYear },
      { side: 'Cr', account: 'Provision for current tax', amount: ct.taxForYear }
    ], `Provision for current tax for ${eng.fy} on ${ct.matApplies ? `book profit u/s 115JB of ${U.fmtRs(ct.matBase)} at ${ct.matRate.toFixed(3)}%` : `taxable income of ${U.fmtRs(ct.taxableIncome)} at ${ct.rate.toFixed(3)}%`}.`);

    /* JE-1A — tax relating to earlier years, Ind AS 12.80(b) */
    if (Math.abs(ct.priorYearAdj) > EPS) {
      const isCharge = ct.priorYearAdj > 0;
      entry('JE-1A', 'Tax relating to earlier years', 'Ind AS 12.80(b)', [
        { side: isCharge ? 'Dr' : 'Cr', account: 'Current tax expense — earlier years', amount: Math.abs(ct.priorYearAdj) },
        { side: isCharge ? 'Cr' : 'Dr', account: 'Provision for tax — earlier years', amount: Math.abs(ct.priorYearAdj) }
      ], `${isCharge ? 'Short' : 'Excess'} provision for earlier years ${isCharge ? 'charged to' : 'written back in'} profit or loss.`);
    }

    /* JE-2 — advance tax and TDS set against the provision */
    if (ct.advanceTax > EPS) {
      entry('JE-2', 'Advance tax and tax deducted at source adjusted', 'Sch III, Div II', [
        { side: 'Dr', account: 'Provision for current tax', amount: ct.advanceTax },
        { side: 'Cr', account: 'Advance tax and TDS receivable', amount: ct.advanceTax }
      ], 'Advance tax and tax deducted at source set off against the provision for current tax.');
    }

    /* JE-3 — deferred tax through profit or loss */
    if (Math.abs(dt.deferredTaxPL) > EPS) {
      const isCharge = dt.deferredTaxPL > 0;
      // A charge either creates a liability or releases an asset. The net
      // closing position decides which account carries it.
      const bsAccount = dt.closingNet >= 0 ? 'Deferred tax asset' : 'Deferred tax liability';
      entry('JE-3', `Deferred tax ${isCharge ? 'charge' : 'credit'} — profit or loss`, 'Ind AS 12.58', [
        { side: isCharge ? 'Dr' : 'Cr', account: 'Deferred tax expense (profit or loss)', amount: Math.abs(dt.deferredTaxPL) },
        { side: isCharge ? 'Cr' : 'Dr', account: bsAccount, amount: Math.abs(dt.deferredTaxPL) }
      ], `Movement in temporary differences for ${eng.fy} at ${dt.rate.toFixed(3)}%. Gross DTA ${U.fmtRs(dt.grossDTA)}; gross DTL ${U.fmtRs(dt.grossDTL)}.`);
    }

    /* JE-4 — deferred tax through other comprehensive income */
    if (Math.abs(dt.deferredTaxOCI) > EPS) {
      const isCharge = dt.deferredTaxOCI > 0;
      entry('JE-4', `Deferred tax on items in other comprehensive income`, 'Ind AS 12.61A', [
        { side: isCharge ? 'Dr' : 'Cr', account: 'Other comprehensive income — tax effect', amount: Math.abs(dt.deferredTaxOCI) },
        { side: isCharge ? 'Cr' : 'Dr', account: dt.closingNet >= 0 ? 'Deferred tax asset' : 'Deferred tax liability', amount: Math.abs(dt.deferredTaxOCI) }
      ], 'Tax on items recognised in other comprehensive income is charged to other comprehensive income and not to profit or loss.');
    }

    /* JE-5 — MAT credit entitlement recognised */
    if (dt.matCreated > EPS) {
      entry('JE-5', 'MAT credit entitlement recognised', 's.115JAA', [
        { side: 'Dr', account: 'MAT credit entitlement (non-current asset)', amount: dt.matCreated },
        { side: 'Cr', account: 'Current tax expense — MAT credit entitlement', amount: dt.matCreated }
      ], 'Credit for the excess of minimum alternate tax over tax under the normal provisions, recognised to the extent utilisation within the carry-forward period is probable.');
    }

    /* JE-6 — MAT credit utilised */
    if (dt.matUtilised > EPS) {
      entry('JE-6', 'MAT credit utilised', 's.115JAA', [
        { side: 'Dr', account: 'Current tax expense — MAT credit utilised', amount: dt.matUtilised },
        { side: 'Cr', account: 'MAT credit entitlement (non-current asset)', amount: dt.matUtilised }
      ], 'Utilisation of MAT credit entitlement against the current year tax liability.');
    }

    return out;
  }

  /* ==========================================================
     5. TALLY CHECKS
     ========================================================== */

  /**
   * The reconciliations an auditor casts by hand. Each returns a tick, a
   * query, or nothing-to-check-yet. This is what the tally rail renders.
   */
  function tallies(eng, ct, dt, te, etr, jes) {
    const t = [];
    const tol = 1;

    const add = (id, label, state, detail, section) => t.push({ id, label, state, detail, section });

    /* 1. Every journal casts */
    const unbalanced = jes.filter(j => !j.balanced);
    add('je', 'Journal entries cast',
      jes.length === 0 ? 'idle' : (unbalanced.length ? 'query' : 'ok'),
      jes.length === 0 ? 'Nothing to post yet' :
        unbalanced.length ? `${unbalanced.length} entry does not cast` : `${jes.length} entries, debits equal credits`,
      'summary');

    /* 2. Opening per schedule agrees to prior year signed accounts */
    const hasOpening = Math.abs(dt.openingFS) > tol || Math.abs(dt.openingRows) > tol;
    add('open', 'Opening balances agree',
      !hasOpening ? 'idle' : (Math.abs(dt.openingDiff) < tol ? 'ok' : 'query'),
      !hasOpening ? 'No opening balances entered' :
        Math.abs(dt.openingDiff) < tol ? 'Schedule agrees to prior year accounts'
          : `Out by ${U.fmt(Math.abs(dt.openingDiff))} against prior year`,
      'deferred');

    /* 3. Opening + movement = closing */
    const artic = dt.openingRows + dt.movementTotal;
    add('artic', 'Deferred tax articulates',
      Math.abs(dt.closingNet) < tol && Math.abs(dt.openingRows) < tol ? 'idle'
        : (Math.abs(artic - dt.closingNet) < tol ? 'ok' : 'query'),
      Math.abs(artic - dt.closingNet) < tol
        ? 'Opening plus movement equals closing'
        : `Out by ${U.fmt(Math.abs(artic - dt.closingNet))}`,
      'movement');

    /* 4. MAT credit schedule */
    const matArtic = dt.matOpening + dt.matCreated - dt.matUtilised;
    const anyMat = Math.abs(dt.matOpening) > tol || dt.matCreated > tol || dt.matUtilised > tol;
    const matClean = Math.abs(matArtic - dt.matClosing) < tol && !ct.matUtilCapped && !ct.matBlockedByMatYear;
    add('mat', 'MAT credit reconciles',
      !anyMat ? 'idle' : (matClean ? 'ok' : 'query'),
      !anyMat ? 'No MAT credit in play'
        : ct.matUtilCapped ? 'Utilisation exceeds the opening entitlement'
          : ct.matBlockedByMatYear ? 'MAT applies this year — the requested utilisation was ignored'
            : `Closing entitlement ${U.fmt(dt.matClosing)}`,
      'movement');

    /* 5. Effective rate reconciliation is fully explained */
    add('etr', 'Effective rate explained',
      Math.abs(ct.bookProfit) < tol ? 'idle' : (etr.residualMaterial ? 'query' : 'ok'),
      Math.abs(ct.bookProfit) < tol ? 'Enter profit before tax'
        : etr.residualMaterial
          ? `Unexplained residual of ${U.fmt(Math.abs(etr.residual))}`
          : 'Residual within tolerance',
      'etr');

    /* 6. Offset presentation */
    add('offset', 'Balance sheet presentation',
      Math.abs(dt.grossDTA) < tol && Math.abs(dt.grossDTL) < tol ? 'idle'
        : (dt.offset && dt.bsDTA > tol && dt.bsDTL > tol ? 'query' : 'ok'),
      dt.offset
        ? `Offset: ${dt.bsDTA > dt.bsDTL ? 'net DTA ' + U.fmt(dt.bsDTA) : 'net DTL ' + U.fmt(dt.bsDTL)}`
        : `Gross: DTA ${U.fmt(dt.grossDTA)}, DTL ${U.fmt(dt.grossDTL)}`,
      'deferred');

    /* 7. Rate sanity */
    const rate = n(eng.rate);
    add('rate', 'Tax rate reasonable',
      rate <= 0 ? 'query' : (rate > 50 ? 'query' : 'ok'),
      rate <= 0 ? 'Enter the applicable rate' : rate > 50 ? `${rate}% looks high — confirm` : `${rate.toFixed(3)}% applied throughout`,
      'client');

    /* 8. Temporary differences in the current tax computation are also in
          the deferred tax schedule. A temp difference in one and not the
          other is the most common error in this workpaper. "Some line is
          populated" alone can green-tick a workpaper where the schedule is
          incomplete in amount, not just empty — etr.tempGapMaterial is the
          authoritative check, so require both. */
    const tempInCt = ct.addsTemp + ct.lessTemp;
    const anyDtData = dt.all.some(r => r.hasData);
    const crossClean = anyDtData && !etr.tempGapMaterial;
    add('cross', 'Temporary differences carried through',
      tempInCt < tol ? 'idle' : (crossClean ? 'ok' : 'query'),
      tempInCt < tol ? 'No temporary differences flagged'
        : crossClean ? 'Deferred tax schedule populated'
          : !anyDtData ? 'Current tax has temporary differences but the deferred tax schedule is empty'
            : `Temporary differences of ${U.fmt(Math.abs(etr.tempGap))} in the current tax computation are not fully reflected in the deferred tax schedule`,
      'deferred');

    const queries = t.filter(x => x.state === 'query').length;
    const ok = t.filter(x => x.state === 'ok').length;
    return { items: t, queries, ok, clean: queries === 0 && ok > 0 };
  }

  /* ==========================================================
     6. VALIDATION
     ========================================================== */

  function validate(eng, ct, dt) {
    const v = [];
    const err = (msg, section, field) => v.push({ level: 'error', msg, section, field });
    const warn = (msg, section, field) => v.push({ level: 'warn', msg, section, field });

    if (!String(eng.name || '').trim()) err('Client name is required.', 'client', 'ci-name');
    if (!String(eng.fy || '').trim()) err('Financial year is required.', 'client', 'ci-fy');
    if (!eng.bsDate) err('Balance sheet date is required.', 'client', 'ci-date');
    if (n(eng.rate) <= 0) err('Enter the applicable tax rate.', 'client', 'ci-rate');
    if (n(eng.rate) > 50) warn(`A rate of ${eng.rate}% is unusually high. Confirm the regime.`, 'client', 'ci-rate');

    if (Math.abs(ct.bookProfit) < EPS) warn('Profit before tax is nil. The effective rate cannot be computed.', 'current');
    if (n(eng.opening?.dta) > 0 && n(eng.opening?.dtl) > 0)
      warn('Both an opening DTA and an opening DTL are entered. Confirm they relate to different taxing authorities.', 'client');

    if (Math.abs(dt.openingDiff) > 1)
      err(`Opening tax effects on the schedule total ${U.fmt(dt.openingRows)} but the prior year accounts show ${U.fmt(dt.openingFS)}. Difference ${U.fmt(dt.openingDiff)}.`, 'deferred');

    if (ct.matUtilCapped)
      err(`MAT credit utilisation of ${U.fmt(n(eng.ct.matUtilised))} exceeds the opening entitlement of ${U.fmt(ct.openingMat)}.`, 'current', 'ct-matutil');

    if (ct.matApplies && n(eng.ct.matUtilised) > 0)
      warn('MAT applies this year, so credit cannot also be utilised. The utilisation has been ignored.', 'current', 'ct-matutil');

    if (dt.unrecognisedDTA > EPS)
      warn(`Deferred tax assets of ${U.fmt(dt.unrecognisedDTA)} are unrecognised. Disclose these under Ind AS 12.81(e).`, 'deferred');

    // A deferred tax LIABILITY has no general non-recognition test — only the
    // narrow initial recognition exception (12.15(a), 24) permits excluding
    // one. Flag it so an unchecked "recognised" box can't quietly drop a real
    // liability from the balance sheet with nothing pointing at it.
    if (dt.unrecognisedDTL > EPS)
      warn(`Deferred tax liabilities of ${U.fmt(dt.unrecognisedDTL)} are marked not recognised. This is only valid under the initial recognition exception — confirm it applies, otherwise tick "recognised" for these lines.`, 'deferred');

    // A line with a carrying amount and no tax base is usually right (nil tax
    // base) but is worth a second look, since it is also what a blank looks like.
    const suspicious = dt.all.filter(r => r.kind !== 'other' && n(r.ca) !== 0 && (r.tb === '' || r.tb === null || r.tb === undefined));
    if (suspicious.length)
      warn(`${suspicious.length} line${suspicious.length === 1 ? ' has' : 's have'} a carrying amount with a blank tax base. Enter 0 to confirm the tax base is nil.`, 'deferred');

    if (!String(eng.preparedBy || '').trim()) warn('Prepared by is blank.', 'client', 'ci-prep');
    if (!String(eng.reviewedBy || '').trim()) warn('Reviewed by is blank.', 'client', 'ci-rev');

    return {
      items: v,
      errors: v.filter(x => x.level === 'error'),
      warnings: v.filter(x => x.level === 'warn'),
      ok: v.every(x => x.level !== 'error')
    };
  }

  /* ==========================================================
     7. PROGRESS
     ========================================================== */

  function progress(eng, ct, dt) {
    const steps = [
      { label: 'Client details', done: !!String(eng.name || '').trim() && !!eng.fy && n(eng.rate) > 0 },
      { label: 'Profit before tax', done: Math.abs(ct.bookProfit) > EPS },
      { label: 'Tax adjustments', done: (eng.ct.rows || []).some(r => r.type !== 'book' && n(r.amt) !== 0) },
      { label: 'Deferred tax schedule', done: dt.all.some(r => r.hasData) },
      { label: 'Opening balances', done: Math.abs(dt.openingRows) > 1 || Math.abs(dt.openingFS) > 1 },
      { label: 'Checklist cleared', done: checklistDone(eng) },
      { label: 'Sign-off', done: !!String(eng.preparedBy || '').trim() && !!String(eng.reviewedBy || '').trim() }
    ];
    const done = steps.filter(s => s.done).length;
    return { steps, done, total: steps.length, pct: Math.round(done / steps.length * 100) };
  }

  function checklistDone(eng) {
    const tpl = Store.checklistTemplate();
    if (!tpl.length) return false;
    return tpl.every(item => {
      const st = eng.checklist?.[item.id]?.state;
      return st === 'done' || st === 'na';
    });
  }

  /* ==========================================================
     MASTER RUN
     ========================================================== */

  /**
   * Run the whole engine.
   * @param {object} eng engagement record
   * @returns {object} every derived figure the UI needs
   */
  function run(eng) {
    if (!eng) return null;
    const ct = currentTax(eng);
    const dt = deferredTax(eng, ct);
    const te = taxExpense(ct, dt);
    const etr = etrRecon(eng, ct, dt, te);
    const jes = journals(eng, ct, dt, te);
    const tal = tallies(eng, ct, dt, te, etr, jes);
    const val = validate(eng, ct, dt);
    const prog = progress(eng, ct, dt);
    return { eng, ct, dt, te, etr, jes, tallies: tal, validation: val, progress: prog };
  }

  return { run, currentTax, deferredTax, taxExpense, etrRecon, journals, tallies, validate, progress, EPS };
})();
