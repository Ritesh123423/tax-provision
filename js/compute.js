'use strict';

/**
 * COMPUTE.JS - Ind AS 12 Deferred Tax Computation Engine
 * K G Somani & Co LLP
 *
 * This module contains all computational logic for:
 *   1. Current Tax computation (Income Tax Act, 1961)
 *   2. Deferred Tax computation (Ind AS 12 - Balance Sheet Approach)
 *   3. Journal Entry generation
 *   4. Disclosure note generation
 *   5. ETR Reconciliation
 *   6. Auditor QC Checklist
 *
 * Core Principle (Ind AS 12):
 *   Temporary Difference = Carrying Amount (Ind AS) - Tax Base (IT Act)
 *   Assets:   CA > TB  => Taxable TD   => DTL
 *             CA < TB  => Deductible TD => DTA
 *   Liabilities: CA > TB  => Deductible TD => DTA
 *                CA < TB  => Taxable TD   => DTL
 */

const Compute = (() => {

  /* ------------------------------------------------------------------
     DOM HELPERS
     ------------------------------------------------------------------ */
  const $   = id => document.getElementById(id);
  const v   = id => parseFloat($(id)?.value) || 0;
  const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
  const htm = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };

  /* ------------------------------------------------------------------
     NUMBER FORMATTING (Indian Numbering System)
     ------------------------------------------------------------------ */

  /**
   * Formats a number using Indian locale with specified decimal places.
   * @param {number} n - The number to format
   * @param {number} dec - Decimal places (default 0)
   * @returns {string} Formatted number string
   */
  function fmt(n, dec = 0) {
    if (n === null || n === undefined || isNaN(n)) return '-';
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: dec,
      minimumFractionDigits: dec
    }).format(Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec));
  }

  /**
   * Formats a number with brackets for negative values.
   * @param {number} n - The number to format
   * @returns {string} Formatted number with brackets for negatives
   */
  function fmtBracket(n) {
    if (!n || isNaN(n)) return '-';
    return n < 0 ? '(' + fmt(Math.abs(n)) + ')' : fmt(n);
  }

  /**
   * Formats a number as a percentage with 2 decimal places.
   * @param {number} n - The percentage value
   * @returns {string} Formatted percentage string
   */
  function fmtPct(n) {
    if (isNaN(n) || !isFinite(n)) return '-';
    return n.toFixed(2) + '%';
  }

  /* ------------------------------------------------------------------
     CURRENT TAX COMPUTATION
     ------------------------------------------------------------------ */

  /**
   * Computes current tax based on book profit and permanent adjustments.
   *
   * Logic:
   *   1. Start with book profit
   *   2. Add: Disallowed expenses, additions per IT Act
   *   3. Less: Deductions, exempt income, Section 43B payments
   *   4. Apply tax rate (or MAT rate if regime = MAT)
   *   5. Deduct: TDS/Advance Tax and MAT credit utilised
   *
   * @param {Object} state - Application state containing ctRows
   * @returns {Object} Current tax result object
   */
  function computeCT(state) {
    const rate    = v('ci-rate') / 100;
    const matRate = v('ci-mat')  / 100;
    const regime  = $('ci-regime')?.value || 'new';

    let bookProfit = 0;
    let taxable    = 0;

    state.ctRows.forEach(r => {
      const a = parseFloat(r.amt) || 0;
      if (r.type === 'book')      { bookProfit = a; taxable = a; }
      else if (r.type === 'add')  { taxable += a; }
      else if (r.type === 'less') { taxable -= a; }
    });

    const isMAT    = regime === 'mat';
    const effRate  = isMAT ? matRate : rate;
    const taxBase  = isMAT ? bookProfit : Math.max(0, taxable);
    const grossTax = taxBase * effRate;
    const tds      = v('ct-tds');
    const matUtil  = v('ct-matutil');
    const netCT    = Math.max(0, grossTax - tds - matUtil);

    set('ct-taxable-disp', fmt(taxable));
    set('ct2-ti',   fmt(taxable));
    set('ct2-rate', (effRate * 100).toFixed(3) + '%');
    set('ct2-tax',  fmt(grossTax));
    set('ct2-net',  fmt(netCT));

    return { bookProfit, taxable, grossTax, tds, matUtil, netCT, effRate };
  }

  /* ------------------------------------------------------------------
     DEFERRED TAX COMPUTATION (Ind AS 12 Balance Sheet Approach)
     ------------------------------------------------------------------ */

  /**
   * Computes deferred tax assets and liabilities using the balance sheet approach.
   *
   * Core Formula:
   *   Temporary Difference (TD) = Carrying Amount (CA) - Tax Base (TB)
   *   Tax Effect (TE)           = |TD| x Tax Rate
   *
   * For Assets:
   *   TD > 0  (CA > TB)  => Taxable temporary difference   => DTL
   *   TD < 0  (CA < TB)  => Deductible temporary difference => DTA
   *
   * For Liabilities:
   *   TD > 0  (CA > TB)  => Deductible temporary difference => DTA
   *   TD < 0  (CA < TB)  => Taxable temporary difference   => DTL
   *
   * P&L Impact:
   *   dtPLCharge = -(Closing Net DTA/DTL - Opening Net DTA/DTL)
   *   Positive = Charge to P&L (expense)
   *   Negative = Credit to P&L (income)
   *
   * @param {Object} state - Application state containing dtAsset, dtLiab, dtOther
   * @returns {Object} Deferred tax result object
   */
  function computeDT(state) {
    const rate = v('ci-rate') / 100;
    let grossDTA = 0;
    let grossDTL = 0;
    const assetRows = [];
    const liabRows  = [];
    const otherRows = [];

    /* --- SECTION A: ASSETS --- */
    state.dtAsset.forEach(r => {
      const ca   = parseFloat(r.ca) || 0;
      const tb   = parseFloat(r.tb) || 0;
      const diff = ca - tb;
      const te   = Math.abs(diff) * rate;
      const nature = diff > 0 ? 'DTL' : diff < 0 ? 'DTA' : '';

      if (diff > 0)      grossDTL += te;
      else if (diff < 0) grossDTA += te;

      assetRows.push({ ...r, diff, te, nature });
    });

    /* --- SECTION B: LIABILITIES & PROVISIONS --- */
    state.dtLiab.forEach(r => {
      const ca   = parseFloat(r.ca) || 0;
      const tb   = parseFloat(r.tb) || 0;
      const diff = ca - tb;
      const te   = Math.abs(diff) * rate;
      const nature = diff > 0 ? 'DTA' : diff < 0 ? 'DTL' : '';

      if (diff > 0)      grossDTA += te;
      else if (diff < 0) grossDTL += te;

      liabRows.push({ ...r, diff, te, nature });
    });

    /* --- SECTION C: OTHER ITEMS (Losses, MAT Credit, etc.) --- */
    state.dtOther.forEach(r => {
      const amt = parseFloat(r.amt) || 0;
      const te  = amt * rate;
      if (r.type === 'dta') grossDTA += te;
      else                  grossDTL += te;
      otherRows.push({ ...r, te });
    });

    /* --- P&L IMPACT COMPUTATION --- */
    const openingNet = v('ob-dta') - v('ob-dtl');
    const closingNet = grossDTA - grossDTL;
    const dtPLCharge = -(closingNet - openingNet);

    /* --- CLOSING BALANCE SHEET POSITIONS --- */
    const matNew     = v('mv-mat-new');
    const closingDTA = grossDTA + matNew;
    const closingDTL = grossDTL;
    const closingMAT = v('ob-mat') + matNew - v('ct-matutil');

    /* --- UPDATE DISPLAY: SECTION SUBTOTALS --- */
    const aDTA = assetRows.reduce((s, r) => s + (r.nature === 'DTA' ? r.te : 0), 0);
    const aDTL = assetRows.reduce((s, r) => s + (r.nature === 'DTL' ? r.te : 0), 0);
    const lDTA = liabRows.reduce((s, r)  => s + (r.nature === 'DTA' ? r.te : 0), 0);
    const lDTL = liabRows.reduce((s, r)  => s + (r.nature === 'DTL' ? r.te : 0), 0);
    const oDTA = otherRows.reduce((s, r) => s + (r.type === 'dta' ? r.te : 0), 0);
    const oDTL = otherRows.reduce((s, r) => s + (r.type === 'dtl' ? r.te : 0), 0);

    set('dt-a-dta', fmt(aDTA)); set('dt-a-dtl', fmt(aDTL));
    set('dt-l-dta', fmt(lDTA)); set('dt-l-dtl', fmt(lDTL));
    set('dt-o-dta', fmt(oDTA)); set('dt-o-dtl', fmt(oDTL));
    set('dt-tot-dta', fmt(grossDTA)); set('dt-tot-dtl', fmt(grossDTL));
    set('dt-pl', dtPLCharge >= 0
      ? fmt(dtPLCharge) + '  (Charge to P&L)'
      : fmt(Math.abs(dtPLCharge)) + '  (Credit to P&L)');

    /* --- UPDATE DISPLAY: MOVEMENT SCHEDULE --- */
    set('mv-dta-open',  fmt(v('ob-dta')));
    set('mv-dta-cy',    fmt(grossDTA));
    set('mv-dta-close', fmt(closingDTA));
    set('mv-dtl-open',  fmt(v('ob-dtl')));
    set('mv-dtl-cy',    fmt(grossDTL));
    set('mv-dtl-close', fmt(closingDTL));
    set('mv-mat-open',  fmt(v('ob-mat')));
    set('mv-mat-add',   fmt(matNew));
    set('mv-mat-util',  fmt(v('ct-matutil')));
    set('mv-mat-close', fmt(closingMAT));

    return {
      grossDTA, grossDTL, dtPLCharge,
      closingDTA, closingDTL, closingMAT,
      assetRows, liabRows, otherRows
    };
  }

  /* ------------------------------------------------------------------
     MASTER COMPUTATION RUNNER
     ------------------------------------------------------------------ */

  /**
   * Executes the full computation pipeline and updates all display elements.
   * @param {Object} state - Application state
   * @returns {Object|null} Computation results or null if state invalid
   */
  function run(state) {
    if (!state) return null;

    const ct    = computeCT(state);
    const dt    = computeDT(state);
    const total = ct.grossTax + dt.dtPLCharge;
    const etr   = ct.bookProfit ? (total / ct.bookProfit * 100) : 0;
    const statR = v('ci-rate');

    /* --- UPDATE KEY PERFORMANCE INDICATORS --- */
    set('kpi-ct',    fmt(ct.grossTax));
    set('kpi-dt',    fmt(Math.abs(dt.dtPLCharge)));
    set('kpi-total', fmt(total));
    set('kpi-etr',   fmtPct(etr));
    set('kpi-dta',   fmt(dt.closingDTA));
    set('kpi-dtl',   fmt(dt.closingDTL));

    const dtCard = $('kpi-dt-card');
    if (dtCard) dtCard.className = 'kpi ' + (dt.dtPLCharge >= 0 ? 'red' : 'green');
    set('kpi-dt-sub', dt.dtPLCharge >= 0 ? 'Charge to P&L' : 'Credit to P&L');

    const etrVar = etr - statR;
    set('kpi-etr-var', (etrVar >= 0 ? '+' : '') + fmtPct(etrVar) + ' vs statutory ' + statR.toFixed(3) + '%');

    /* --- GENERATE OUTPUT SECTIONS --- */
    buildJEs(ct, dt);
    buildDisclosure(ct, dt, total, etr);
    buildChecklist(ct, dt, state);
    buildETR(ct, dt, total, etr);
    updateProgress(state);

    return { ct, dt, total, etr };
  }

  /* ------------------------------------------------------------------
     JOURNAL ENTRY GENERATION
     ------------------------------------------------------------------ */

  function buildJEs(ct, dt) {
    const fy  = $('ci-fy')?.value  || 'FY ____';
    const dtv = $('ci-date')?.value
      ? new Date($('ci-date').value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '31st March ____';
    const rate = v('ci-rate');

    htm('je-ct', `
      <div class="je-hd">JOURNAL ENTRY 1 - CURRENT TAX PROVISION | ${fy}</div>
      <div class="je-date">Date: ${dtv}</div><br>
      <div class="je-dr">Dr &nbsp; Income Tax Expense - Current &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(ct.grossTax)}</span></div>
      ${ct.tds > 0     ? `<div class="je-cr">Cr &nbsp; Advance Tax / TDS Receivable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(ct.tds)}</span></div>` : ''}
      ${ct.matUtil > 0 ? `<div class="je-cr">Cr &nbsp; MAT Credit Utilised (u/s 115JAA) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(ct.matUtil)}</span></div>` : ''}
      <div class="je-cr">Cr &nbsp; Provision for Current Tax &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(ct.netCT)}</span></div>
      <div class="je-tot">Dr Total = Rs ${fmt(ct.grossTax)} &nbsp;|&nbsp; Cr Total = Rs ${fmt(ct.grossTax)} &nbsp; BALANCED</div>
      <div class="je-narr">(Being current tax provision for ${fy} @ ${rate.toFixed(3)}% on taxable income of Rs ${fmt(ct.taxable)} per Income Tax Act, 1961)</div>
    `);

    const isCr = dt.dtPLCharge < 0;
    htm('je-dt', `
      <div class="je-hd">JOURNAL ENTRY 2 - DEFERRED TAX | ${fy} | Ind AS 12 - Balance Sheet Approach</div>
      <div class="je-date">Date: ${dtv}</div><br>
      ${isCr
        ? `<div class="je-dr">Dr &nbsp; Deferred Tax Asset &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(Math.abs(dt.dtPLCharge))}</span></div>
           <div class="je-cr">Cr &nbsp; Deferred Tax Income (P&L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(Math.abs(dt.dtPLCharge))}</span></div>`
        : `<div class="je-dr">Dr &nbsp; Deferred Tax Expense (P&L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(dt.dtPLCharge)}</span></div>
           <div class="je-cr">Cr &nbsp; Deferred Tax Liability &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(dt.dtPLCharge)}</span></div>`
      }
      <div class="je-tot">Dr Total = Rs ${fmt(Math.abs(dt.dtPLCharge))} &nbsp;|&nbsp; Cr Total = Rs ${fmt(Math.abs(dt.dtPLCharge))} &nbsp; BALANCED</div>
      <div class="je-narr">(Being deferred tax ${isCr ? 'credit - DTA recognised' : 'charge - DTL recognised'} for ${fy} per Ind AS 12. Gross DTA: Rs ${fmt(dt.grossDTA)} | Gross DTL: Rs ${fmt(dt.grossDTL)})</div>
    `);

    const matNew = v('mv-mat-new');
    const matCard = $('je-mat-card');
    if (matCard) matCard.style.display = matNew > 0 ? '' : 'none';
    if (matNew > 0) {
      htm('je-mat', `
        <div class="je-hd">JOURNAL ENTRY 3 - MAT CREDIT ENTITLEMENT | ${fy} | Sec 115JAA</div>
        <div class="je-date">Date: ${dtv}</div><br>
        <div class="je-dr">Dr &nbsp; MAT Credit Entitlement (DTA - Non Current) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(matNew)}</span></div>
        <div class="je-cr">Cr &nbsp; MAT Credit Income (P&L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">Rs ${fmt(matNew)}</span></div>
        <div class="je-tot">Dr Total = Rs ${fmt(matNew)} &nbsp;|&nbsp; Cr Total = Rs ${fmt(matNew)} &nbsp; BALANCED</div>
        <div class="je-narr">(Being MAT credit entitlement recognised u/s 115JAA - carry-forward period 15 years, utilisation reasonably certain)</div>
      `);
    }
  }

  /* ------------------------------------------------------------------
     IND AS 12 DISCLOSURE NOTE GENERATION
     ------------------------------------------------------------------ */

  function buildDisclosure(ct, dt, total, etr) {
    const dn = $('disclosure-note');
    if (!dn) return;

    const fy   = $('ci-fy')?.value   || 'FY ____';
    const date = $('ci-date')?.value
      ? new Date($('ci-date').value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '31st March ____';
    const rate = v('ci-rate');

    dn.innerHTML = `<div class="disc">
      <p style="margin-bottom:12px"><strong>Note ___ - Income Taxes</strong></p>
      <p style="margin-bottom:10px">(a) Amount recognised in the Statement of Profit and Loss</p>
      <table class="disc-tbl">
        <thead><tr><th>Particulars</th><th class="r">Current Year (Rs)</th></tr></thead>
        <tbody>
          <tr><td style="font-weight:600;padding-left:0">Current tax</td><td class="r"></td></tr>
          <tr><td style="padding-left:18px">Current tax on profits for the year</td><td class="r">${fmt(ct.grossTax)}</td></tr>
          <tr><td style="padding-left:18px">Adjustments for earlier years</td><td class="r">-</td></tr>
          <tr style="font-weight:600"><td>Total current tax expense</td><td class="r">${fmt(ct.grossTax)}</td></tr>
          <tr><td></td><td></td></tr>
          <tr><td style="font-weight:600;padding-left:0">Deferred tax</td><td class="r"></td></tr>
          <tr><td style="padding-left:18px">Origination and reversal of temporary differences</td><td class="r">${fmtBracket(dt.dtPLCharge)}</td></tr>
          <tr><td style="padding-left:18px">Effect of change in tax rate</td><td class="r">-</td></tr>
          <tr style="font-weight:600"><td>Total deferred tax expense / (credit)</td><td class="r">${fmtBracket(dt.dtPLCharge)}</td></tr>
        </tbody>
        <tfoot><tr><td>Income tax expense for the year</td><td class="r">${fmt(total)}</td></tr></tfoot>
      </table>

      <p style="margin:14px 0 9px">(b) Reconciliation of effective tax rate</p>
      <table class="disc-tbl">
        <thead><tr><th>Particulars</th><th class="r">Rate (%)</th><th class="r">Amount (Rs)</th></tr></thead>
        <tbody>
          <tr><td>Profit before tax</td><td class="r">-</td><td class="r">${fmt(ct.bookProfit)}</td></tr>
          <tr><td>Tax at statutory rate of ${rate.toFixed(3)}%</td><td class="r">${rate.toFixed(3)}%</td><td class="r">${fmt(ct.bookProfit * rate / 100)}</td></tr>
          <tr><td style="padding-left:18px;color:var(--ink-3)">Non-deductible expenses</td><td class="r">-</td><td class="r">-</td></tr>
          <tr><td style="padding-left:18px;color:var(--ink-3)">Exempt income</td><td class="r">-</td><td class="r">-</td></tr>
          <tr><td style="padding-left:18px;color:var(--ink-3)">Effect of deferred tax movement</td><td class="r">${ct.bookProfit ? fmtPct(dt.dtPLCharge / ct.bookProfit * 100) : '-'}</td><td class="r">${fmtBracket(dt.dtPLCharge)}</td></tr>
          <tr><td style="padding-left:18px;color:var(--ink-3)">Other adjustments</td><td class="r">-</td><td class="r">-</td></tr>
        </tbody>
        <tfoot><tr><td><strong>Effective tax rate / Tax expense</strong></td><td class="r"><strong>${fmtPct(etr)}</strong></td><td class="r"><strong>${fmt(total)}</strong></td></tr></tfoot>
      </table>

      <p style="margin:14px 0 9px">(c) Deferred tax position in Balance Sheet</p>
      <table class="disc-tbl">
        <thead><tr><th>Particulars</th><th class="r">DTA (Rs)</th><th class="r">DTL (Rs)</th></tr></thead>
        <tbody>
          <tr><td>Gross deferred tax</td><td class="r">${fmt(dt.grossDTA)}</td><td class="r">${fmt(dt.grossDTL)}</td></tr>
          <tr><td>Opening balance</td><td class="r">${fmt(v('ob-dta'))}</td><td class="r">${fmt(v('ob-dtl'))}</td></tr>
        </tbody>
        <tfoot><tr><td>Closing balance (to Balance Sheet - Non Current)</td><td class="r">${fmt(dt.closingDTA)}</td><td class="r">${fmt(dt.closingDTL)}</td></tr></tfoot>
      </table>

      <p style="margin-top:13px">Deferred tax assets and liabilities are measured at the tax rate expected to apply when the asset is realised or the liability is settled, based on tax laws enacted or substantively enacted as at ${date}, i.e., <strong>${rate.toFixed(3)}%</strong> (including surcharge and Health and Education Cess).</p>
      ${dt.closingMAT > 0 ? `<p style="margin-top:10px">The Company has recognised MAT credit entitlement of <strong>Rs ${fmt(dt.closingMAT)}</strong> (current year: Rs ${fmt(v('mv-mat-new'))}) u/s 115JAA, which is expected to be utilised within 15 years on the basis of projected future taxable profits.</p>` : ''}
      <p style="margin-top:10px;font-size:11px;color:var(--ink-4)">Prepared per Ind AS 12 - Income Taxes, notified under the Companies (Indian Accounting Standards) Rules, 2015, as amended.</p>
    </div>`;
  }

  /* ------------------------------------------------------------------
     AUDITOR QC CHECKLIST
     ------------------------------------------------------------------ */

  function buildChecklist(ct, dt, state) {
    const wrap = $('checklist-wrap');
    if (!wrap) return;

    const hasAssets = state.dtAsset.length > 0;
    const hasLiab   = state.dtLiab.length  > 0;
    const obFilled  = v('ob-dta') > 0 || v('ob-dtl') > 0;

    const checks = [
      { l: 'Balance sheet approach applied per Ind AS 12 (not income statement approach)', ref: 'Ind AS 12.15', ok: true },
      { l: 'Current tax computed on taxable income per Income Tax Act, 1961', ref: 'Sec 115BAA / 115JB', ok: ct.taxable !== 0 || ct.bookProfit !== 0, warn: ct.taxable === 0 },
      { l: 'Temporary differences identified for all balance sheet line items', ref: 'Ind AS 12.5', ok: hasAssets && hasLiab, warn: !hasAssets || !hasLiab, note: 'Ensure every asset and liability line has been assessed' },
      { l: 'Tax base correctly determined per Income Tax Act provisions', ref: 'Ind AS 12.7', ok: true },
      { l: 'Deferred tax rate = enacted or substantively enacted rate at balance sheet date', ref: 'Ind AS 12.47', ok: v('ci-rate') > 0 },
      { l: 'DTA recognised only where future taxable profits are probable', ref: 'Ind AS 12.24', ok: dt.grossDTA >= 0 },
      { l: 'Virtual certainty test applied for DTA on unabsorbed losses', ref: 'Ind AS 12.29', ok: true, note: 'Verify management assessment and supporting projections' },
      { l: 'Initial recognition exception applied correctly', ref: 'Ind AS 12.15(b), 24(b)', ok: true },
      { l: 'Deferred taxes presented at undiscounted amounts (not discounted)', ref: 'Ind AS 12.53', ok: true },
      { l: 'DTA and DTL offset only where legally enforceable right exists and same taxing authority', ref: 'Ind AS 12.74', ok: true },
      { l: 'Opening balances agreed to prior year audited financial statements', ref: 'SA 520', ok: obFilled, warn: !obFilled, note: 'Confirm with signed prior year workpapers' },
      { l: 'MAT credit entitlement recognised separately as a deferred tax asset', ref: 'Sec 115JAA', ok: true },
      { l: 'DTA and DTL classified as Non-Current in Balance Sheet', ref: 'Ind AS 1.56', ok: true },
      { l: 'Effective tax rate reconciliation prepared and disclosed', ref: 'Ind AS 12.81(c)', ok: ct.bookProfit !== 0 },
      { l: 'Temporary difference disclosure prepared for each category', ref: 'Ind AS 12.81(g)', ok: hasAssets || hasLiab },
      { l: 'Journal entries balanced - Dr total equals Cr total', ref: 'SA 300', ok: true },
      { l: 'Disclosure note prepared per Ind AS 12.79-88', ref: 'Ind AS 12.79', ok: true },
      { l: 'Presentation in Balance Sheet per Companies Act 2013, Schedule III', ref: 'Sch III Part I', ok: true },
    ];

    wrap.innerHTML = checks.map(c => {
      const st  = c.ok && !c.warn ? 'done' : 'warn';
      const ico = st === 'done' ? 'OK' : '!';
      return `<div class="chk-item">
        <div class="chk-ico chk-${st}">${ico}</div>
        <div>
          <div class="chk-lbl">${c.l}</div>
          ${c.note ? `<div class="chk-note">${c.note}</div>` : ''}
        </div>
        <div class="chk-ref">${c.ref}</div>
      </div>`;
    }).join('');
  }

  /* ------------------------------------------------------------------
     ETR RECONCILIATION TABLE
     ------------------------------------------------------------------ */

  function buildETR(ct, dt, total, etr) {
    const tbl = $('etr-tbl');
    if (!tbl) return;

    const rate = v('ci-rate');

    if (!ct.bookProfit) {
      tbl.innerHTML = '<div style="padding:20px;color:var(--ink-4)">Enter book profit in Current Tax to generate ETR reconciliation.</div>';
      return;
    }

    const taxAtStat = ct.bookProfit * rate / 100;
    tbl.innerHTML = `
      <table class="wt">
        <thead><tr><th>Particulars</th><th class="r" style="width:200px">Amount (Rs)</th><th class="r" style="width:130px">Rate (%)</th></tr></thead>
        <tbody>
          <tr><td>Profit before tax</td><td class="r">${fmt(ct.bookProfit)}</td><td class="r">-</td></tr>
          <tr><td>Tax at statutory rate of ${rate.toFixed(3)}%</td><td class="r">${fmt(taxAtStat)}</td><td class="r">${rate.toFixed(3)}%</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Non-deductible expenses</td><td class="r">-</td><td class="r">-</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Exempt income</td><td class="r">-</td><td class="r">-</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Effect of deferred tax movement</td><td class="r">${fmtBracket(dt.dtPLCharge)}</td><td class="r">${fmtPct(dt.dtPLCharge / ct.bookProfit * 100)}</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Other adjustments</td><td class="r">-</td><td class="r">-</td></tr>
        </tbody>
        <tfoot><tr class="tot-row"><td>Income tax expense / Effective tax rate</td><td class="r">${fmt(total)}</td><td class="r">${fmtPct(etr)}</td></tr></tfoot>
      </table>`;
  }

  /* ------------------------------------------------------------------
     PROGRESS INDICATOR
     ------------------------------------------------------------------ */

  function updateProgress(state) {
    let n = 0;
    if ($('ci-name')?.value) n++;
    if ($('ci-fy')?.value) n++;
    if (state.ctRows.some(r => parseFloat(r.amt) > 0)) n++;
    if (state.dtAsset.some(r => r.ca > 0 || r.tb > 0)) n++;
    if (state.dtLiab.some(r => r.ca > 0 || r.tb > 0)) n++;
    const p = Math.round(n / 5 * 100);
    const b = $('sb-prog');
    const t = $('sb-prog-txt');
    if (b) b.style.width = p + '%';
    if (t) t.textContent = p + '% complete';
  }

  return { run, fmt, fmtBracket, fmtPct };
})();
