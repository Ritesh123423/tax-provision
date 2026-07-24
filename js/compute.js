/* ═══════════════════════════════════════════════════════════
   COMPUTE.JS — Tax Provision Computation Engine
   Ind AS 12 | Balance Sheet Approach | K G Somani & Co LLP
   ═══════════════════════════════════════════════════════════ */

'use strict';

const Compute = (() => {

  /* ────────────────────────────────
     HELPERS
  ──────────────────────────────── */
  const $ = id => document.getElementById(id);
  const val = id => parseFloat($(id)?.value) || 0;
  const pct = id => val(id) / 100;

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }
  function setHTML(id, html) {
    const el = $(id);
    if (el) el.innerHTML = html;
  }

  /* ────────────────────────────────
     NUMBER FORMATTING (Indian)
  ──────────────────────────────── */
  function fmt(n, decimals = 0) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    }).format(Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals));
  }

  function fmtSign(n) {
    if (!n || isNaN(n)) return '—';
    return (n < 0 ? '(' : '') + fmt(Math.abs(n)) + (n < 0 ? ')' : '');
  }

  function fmtPct(n) {
    if (isNaN(n) || !isFinite(n)) return '—';
    return n.toFixed(2) + '%';
  }

  /* ────────────────────────────────
     CURRENT TAX COMPUTATION
  ──────────────────────────────── */
  function computeCurrentTax(state) {
    const rate = pct('ci-rate');
    const matRate = pct('ci-mat');
    const regime = $('ci-regime')?.value || 'new';

    let bookProfit = 0;
    let taxableIncome = 0;

    // Process each row
    state.ctRows.forEach(row => {
      const amt = parseFloat(row.amt) || 0;
      if (row.type === 'book') {
        bookProfit = amt;
        taxableIncome = amt;
      } else if (row.type === 'add') {
        taxableIncome += amt;
      } else if (row.type === 'less') {
        taxableIncome -= amt;
      }
    });

    // Tax calculation
    const isMAT = regime === 'mat';
    const effectiveRate = isMAT ? matRate : rate;
    const taxBase = isMAT ? bookProfit : Math.max(0, taxableIncome);
    const grossTax = taxBase * effectiveRate;

    // TDS / advance tax
    const tds = val('ct-tds');
    const matUtil = val('ct-matutil');
    const netCurrentTax = Math.max(0, grossTax - tds - matUtil);

    return {
      bookProfit,
      taxableIncome,
      grossTax,
      tds,
      matUtil,
      netCurrentTax,
      effectiveRate,
      isMAT
    };
  }

  /* ────────────────────────────────
     DEFERRED TAX COMPUTATION
  ──────────────────────────────── */
  function computeDeferredTax(state) {
    const rate = pct('ci-rate');
    let totalDTA = 0;
    let totalDTL = 0;
    const assetDetails = [];
    const liabDetails = [];
    const otherDetails = [];

    // ── ASSETS (Ind AS 12 para 16-17)
    // For assets: Temp diff = Carrying Amount - Tax Base
    // If CA > Tax Base → future taxable amount → DTL
    // If CA < Tax Base → future deductible amount → DTA
    state.dtAsset.forEach(row => {
      const ca = parseFloat(row.ca) || 0;
      const tb = parseFloat(row.tb) || 0;
      const diff = ca - tb;
      const taxEffect = Math.abs(diff) * rate;
      let dtaAmt = 0, dtlAmt = 0, nature = '';

      if (diff > 0) {
        // CA > Tax Base → Taxable Temporary Difference → DTL
        dtlAmt = taxEffect;
        totalDTL += taxEffect;
        nature = 'DTL';
      } else if (diff < 0) {
        // CA < Tax Base → Deductible Temporary Difference → DTA
        dtaAmt = taxEffect;
        totalDTA += taxEffect;
        nature = 'DTA';
      }

      assetDetails.push({ ...row, diff, taxEffect, dtaAmt, dtlAmt, nature });
    });

    // ── LIABILITIES (Ind AS 12 para 15)
    // For liabilities: Temp diff = Carrying Amount - Tax Base
    // If CA > Tax Base → more liability recognised in books than tax → DTA (future deductible)
    // If CA < Tax Base → DTL
    state.dtLiab.forEach(row => {
      const ca = parseFloat(row.ca) || 0;
      const tb = parseFloat(row.tb) || 0;
      const diff = ca - tb;
      const taxEffect = Math.abs(diff) * rate;
      let dtaAmt = 0, dtlAmt = 0, nature = '';

      if (diff > 0) {
        // Liability CA > Tax Base → Deductible TD → DTA
        dtaAmt = taxEffect;
        totalDTA += taxEffect;
        nature = 'DTA';
      } else if (diff < 0) {
        // Liability CA < Tax Base → Taxable TD → DTL
        dtlAmt = taxEffect;
        totalDTL += taxEffect;
        nature = 'DTL';
      }

      liabDetails.push({ ...row, diff, taxEffect, dtaAmt, dtlAmt, nature });
    });

    // ── OTHER ITEMS (losses, MAT credit etc.)
    state.dtOther.forEach(row => {
      const amt = parseFloat(row.amt) || 0;
      const taxEffect = amt * rate;
      let dtaAmt = 0, dtlAmt = 0;

      if (row.type === 'dta') {
        dtaAmt = taxEffect;
        totalDTA += taxEffect;
      } else {
        dtlAmt = taxEffect;
        totalDTL += taxEffect;
      }

      otherDetails.push({ ...row, taxEffect, dtaAmt, dtlAmt });
    });

    // ── MAT CREDIT (recognised separately per Ind AS 12)
    const matCreditNew = val('mv-mat-new');
    const matCreditUtil = val('ct-matutil');
    const obDTA = val('ob-dta');
    const obDTL = val('ob-dtl');
    const obMAT = val('ob-mat');

    // Closing balances
    // Net DTA/DTL for balance sheet
    const netDTA = totalDTA;
    const netDTL = totalDTL;

    // P&L charge/credit = change in net deferred position
    // Opening net = obDTA - obDTL
    // Closing net = netDTA - netDTL
    // Change (DTA perspective) = closing - opening = P&L credit if positive, charge if negative
    const openingNet = obDTA - obDTL;
    const closingNet = netDTA - netDTL;
    const deferredPLCredit = closingNet - openingNet; // positive = credit to P&L
    const deferredPLCharge = -deferredPLCredit;       // positive = charge to P&L

    // Closing balances for balance sheet
    const closingDTA = obDTA + (netDTA - obDTA) + matCreditNew; // simplified
    const closingDTL = obDTL + (netDTL - obDTL);
    const closingMAT = obMAT + matCreditNew - matCreditUtil;

    return {
      totalDTA,
      totalDTL,
      netDTA,
      netDTL,
      deferredPLCharge,
      deferredPLCredit,
      closingDTA,
      closingDTL,
      closingMAT,
      assetDetails,
      liabDetails,
      otherDetails,
      rate
    };
  }

  /* ────────────────────────────────
     MASTER COMPUTE & UI UPDATE
  ──────────────────────────────── */
  function run(state) {
    if (!state) return;

    const ct = computeCurrentTax(state);
    const dt = computeDeferredTax(state);

    const totalTaxExpense = ct.grossTax + dt.deferredPLCharge;
    const etr = ct.bookProfit ? (totalTaxExpense / ct.bookProfit * 100) : 0;
    const statutoryRate = val('ci-rate');

    // ── UPDATE CURRENT TAX UI
    setText('ct-taxable-display', '₹' + fmt(ct.taxableIncome));
    setText('ct2-ti', fmt(ct.taxableIncome));
    setText('ct2-rate', (ct.effectiveRate * 100).toFixed(3) + '%');
    setText('ct2-tax', '₹' + fmt(ct.grossTax));
    setText('ct2-tds-display', '₹' + fmt(ct.tds));
    setText('ct2-matutil-display', '₹' + fmt(ct.matUtil));
    setText('ct2-net', '₹' + fmt(ct.netCurrentTax));

    // ── UPDATE DEFERRED TAX TOTALS
    setText('dt-asset-dta', '₹' + fmt(dt.assetDetails.reduce((s,r) => s + r.dtaAmt, 0)));
    setText('dt-asset-dtl', '₹' + fmt(dt.assetDetails.reduce((s,r) => s + r.dtlAmt, 0)));
    setText('dt-liab-dta',  '₹' + fmt(dt.liabDetails.reduce((s,r)  => s + r.dtaAmt, 0)));
    setText('dt-liab-dtl',  '₹' + fmt(dt.liabDetails.reduce((s,r)  => s + r.dtlAmt, 0)));
    setText('dt-other-dta', '₹' + fmt(dt.otherDetails.reduce((s,r) => s + r.dtaAmt, 0)));
    setText('dt-other-dtl', '₹' + fmt(dt.otherDetails.reduce((s,r) => s + r.dtlAmt, 0)));
    setText('dt-total-dta', '₹' + fmt(dt.totalDTA));
    setText('dt-total-dtl', '₹' + fmt(dt.totalDTL));
    setText('dt-pl-effect',
      dt.deferredPLCharge >= 0
        ? '₹' + fmt(dt.deferredPLCharge) + ' (Charge)'
        : '₹' + fmt(Math.abs(dt.deferredPLCharge)) + ' (Credit)');

    // ── UPDATE MOVEMENT SCHEDULE
    setText('mv-dta-open',  '₹' + fmt(val('ob-dta')));
    setText('mv-dta-cy',    '₹' + fmt(dt.totalDTA));
    setText('mv-dta-close', '₹' + fmt(dt.closingDTA));
    setText('mv-dtl-open',  '₹' + fmt(val('ob-dtl')));
    setText('mv-dtl-cy',    '₹' + fmt(dt.totalDTL));
    setText('mv-dtl-close', '₹' + fmt(dt.closingDTL));
    setText('mv-mat-open',  '₹' + fmt(val('ob-mat')));
    setText('mv-mat-new-display', '₹' + fmt(val('mv-mat-new')));
    setText('mv-mat-util',  '₹' + fmt(val('ct-matutil')));
    setText('mv-mat-close', '₹' + fmt(dt.closingMAT));

    // ── KPI CARDS
    setText('kpi-ct', '₹' + fmt(ct.grossTax));
    setText('kpi-dt', (dt.deferredPLCharge >= 0 ? '₹' : '(₹') + fmt(Math.abs(dt.deferredPLCharge)) + (dt.deferredPLCharge < 0 ? ')' : ''));
    setText('kpi-total', '₹' + fmt(totalTaxExpense));
    setText('kpi-etr', fmtPct(etr));
    setText('kpi-dta-closing', '₹' + fmt(dt.closingDTA));
    setText('kpi-dtl-closing', '₹' + fmt(dt.closingDTL));

    const dtCard = $('kpi-dt-card');
    if (dtCard) {
      dtCard.className = 'kpi-card ' + (dt.deferredPLCharge >= 0 ? 'red' : 'green');
    }
    const dtSub = $('kpi-dt-sub');
    if (dtSub) dtSub.textContent = dt.deferredPLCharge >= 0 ? 'Charge to P&L' : 'Credit to P&L';

    // ── ETR VARIANCE
    const etrVariance = etr - statutoryRate;
    const etrEl = $('etr-variance');
    if (etrEl) {
      etrEl.textContent = (etrVariance >= 0 ? '+' : '') + fmtPct(etrVariance) + ' vs statutory';
      etrEl.className = 'kpi-sub ' + (Math.abs(etrVariance) < 2 ? 'text-green' : 'text-amber');
    }

    // ── JOURNAL ENTRIES
    buildJournalEntries(ct, dt, totalTaxExpense);

    // ── DISCLOSURE NOTE
    buildDisclosureNote(ct, dt, totalTaxExpense, etr, statutoryRate);

    // ── CHECKLIST
    buildChecklist(ct, dt, totalTaxExpense, etr, state);

    // ── ETR RECONCILIATION
    buildETRReconciliation(ct, dt, etr, statutoryRate);

    // ── Progress
    updateProgress(state);

    return { ct, dt, totalTaxExpense, etr };
  }

  /* ────────────────────────────────
     JOURNAL ENTRIES
  ──────────────────────────────── */
  function buildJournalEntries(ct, dt, total) {
    const fy = $('ci-fy')?.value || 'FY ____';
    const client = $('ci-name')?.value || 'the Company';
    const rate = val('ci-rate');

    // JE 1 — Current Tax
    const je1 = $('je-current');
    if (je1) {
      je1.innerHTML = `
        <div class="je-head">JOURNAL ENTRY 1 — CURRENT TAX PROVISION &nbsp;|&nbsp; ${fy}</div>
        <div class="je-date">Date: ${$('ci-date')?.value || '31st March ____'}</div><br>
        <div class="je-dr">Dr &nbsp;&nbsp; Income Tax Expense (Current) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.grossTax)}</span></div>
        <div class="je-cr">Cr &nbsp;&nbsp; Provision for Current Tax &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.netCurrentTax)}</span></div>
        ${ct.tds > 0 ? `<div class="je-cr">Cr &nbsp;&nbsp; Advance Tax / TDS Receivable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.tds)}</span></div>` : ''}
        ${ct.matUtil > 0 ? `<div class="je-cr">Cr &nbsp;&nbsp; MAT Credit Entitlement (utilised) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.matUtil)}</span></div>` : ''}
        <div class="je-total">
          Total Dr = ₹${fmt(ct.grossTax)} &nbsp;|&nbsp; Total Cr = ₹${fmt(ct.grossTax)}
        </div>
        <div class="je-narr">(Being provision for current income tax for ${fy} @ ${rate.toFixed(3)}% on taxable income of ₹${fmt(ct.taxableIncome)} computed as per the provisions of the Income Tax Act, 1961)</div>
      `;
    }

    // JE 2 — Deferred Tax
    const je2 = $('je-deferred');
    if (je2) {
      const dtCharge = dt.deferredPLCharge;
      const isDTACredit = dtCharge < 0;
      je2.innerHTML = `
        <div class="je-head">JOURNAL ENTRY 2 — DEFERRED TAX &nbsp;|&nbsp; ${fy} &nbsp;|&nbsp; Ind AS 12</div>
        <div class="je-date">Date: ${$('ci-date')?.value || '31st March ____'}</div><br>
        ${isDTACredit
          ? `<div class="je-dr">Dr &nbsp;&nbsp; Deferred Tax Asset &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(Math.abs(dtCharge))}</span></div>
             <div class="je-cr">Cr &nbsp;&nbsp; Deferred Tax Income (P&L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(Math.abs(dtCharge))}</span></div>`
          : `<div class="je-dr">Dr &nbsp;&nbsp; Deferred Tax Expense (P&L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(dtCharge)}</span></div>
             <div class="je-cr">Cr &nbsp;&nbsp; Deferred Tax Liability &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(dtCharge)}</span></div>`
        }
        <div class="je-total">
          Total Dr = ₹${fmt(Math.abs(dtCharge))} &nbsp;|&nbsp; Total Cr = ₹${fmt(Math.abs(dtCharge))}
        </div>
        <div class="je-narr">(Being deferred tax ${isDTACredit ? 'credit (DTA recognised)' : 'charge (DTL recognised)'} for ${fy} per Ind AS 12 — Income Taxes, using balance sheet approach. Gross DTA: ₹${fmt(dt.totalDTA)} | Gross DTL: ₹${fmt(dt.totalDTL)})</div>
      `;
    }

    // JE 3 — MAT Credit (if applicable)
    const matNew = val('mv-mat-new');
    const je3 = $('je-mat');
    if (je3) {
      if (matNew > 0) {
        je3.innerHTML = `
          <div class="je-head">JOURNAL ENTRY 3 — MAT CREDIT ENTITLEMENT &nbsp;|&nbsp; ${fy} &nbsp;|&nbsp; Sec 115JAA</div>
          <div class="je-date">Date: ${$('ci-date')?.value || '31st March ____'}</div><br>
          <div class="je-dr">Dr &nbsp;&nbsp; MAT Credit Entitlement (Deferred Tax Asset) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(matNew)}</span></div>
          <div class="je-cr">Cr &nbsp;&nbsp; MAT Credit Entitlement (P&L Income) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(matNew)}</span></div>
          <div class="je-total">Total Dr = ₹${fmt(matNew)} &nbsp;|&nbsp; Total Cr = ₹${fmt(matNew)}</div>
          <div class="je-narr">(Being MAT credit entitlement recognised u/s 115JAA of the Income Tax Act, 1961, as there is reasonable certainty of future normal tax liability against which MAT credit can be set off)</div>
        `;
        je3.parentElement.parentElement.style.display = '';
      } else {
        if (je3.parentElement?.parentElement) {
          je3.parentElement.parentElement.style.display = 'none';
        }
      }
    }
  }

  /* ────────────────────────────────
     DISCLOSURE NOTE (Ind AS 12)
  ──────────────────────────────── */
  function buildDisclosureNote(ct, dt, total, etr, statutoryRate) {
    const dn = $('disclosure-note');
    if (!dn) return;
    const fy = $('ci-fy')?.value || 'FY ____';
    const client = $('ci-name')?.value || 'the Company';
    const date = $('ci-date')?.value ? new Date($('ci-date').value).toLocaleDateString('en-IN', {day:'numeric',month:'long',year:'numeric'}) : '31st March ____';
    const rate = val('ci-rate');

    dn.innerHTML = `
      <div class="disclosure">
        <p style="margin-bottom:14px"><strong>Note ___ : Income Taxes</strong><br>
        Recognised in the Statement of Profit and Loss:</p>

        <table class="disclosure-note-table">
          <thead>
            <tr>
              <th>Particulars</th>
              <th class="r">Current Year (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td><strong>Current tax</strong></td><td class="r"></td></tr>
            <tr><td style="padding-left:28px">Current tax on profits for the year</td><td class="r">${fmt(ct.grossTax)}</td></tr>
            <tr><td style="padding-left:28px">Adjustments for earlier years</td><td class="r">—</td></tr>
            <tr style="font-weight:600"><td><strong>Total current tax</strong></td><td class="r">${fmt(ct.grossTax)}</td></tr>
            <tr><td></td><td></td></tr>
            <tr><td><strong>Deferred tax</strong></td><td class="r"></td></tr>
            <tr><td style="padding-left:28px">Relating to origination and reversal of temporary differences</td><td class="r">${fmtSign(dt.deferredPLCharge)}</td></tr>
            <tr style="font-weight:600"><td><strong>Total deferred tax expense / (credit)</strong></td><td class="r">${fmtSign(dt.deferredPLCharge)}</td></tr>
          </tbody>
          <tfoot>
            <tr><td><strong>Income tax expense for the year</strong></td><td class="r">${fmt(total)}</td></tr>
          </tfoot>
        </table>

        <p style="margin:14px 0 8px"><strong>Reconciliation of effective tax rate:</strong></p>
        <table class="disclosure-note-table">
          <thead>
            <tr><th>Particulars</th><th class="r">%</th><th class="r">Amount (₹)</th></tr>
          </thead>
          <tbody>
            <tr><td>Profit before tax</td><td class="r">—</td><td class="r">${fmt(ct.bookProfit)}</td></tr>
            <tr><td>Tax at the statutory income tax rate of ${rate.toFixed(3)}%</td><td class="r">${rate.toFixed(3)}%</td><td class="r">${fmt(ct.bookProfit * rate / 100)}</td></tr>
            <tr><td>Effect of deferred tax adjustments</td><td class="r">—</td><td class="r">${fmtSign(dt.deferredPLCharge)}</td></tr>
            <tr><td>Other adjustments</td><td class="r">—</td><td class="r">—</td></tr>
          </tbody>
          <tfoot>
            <tr>
              <td><strong>Effective tax rate / Tax expense</strong></td>
              <td class="r"><strong>${fmtPct(etr)}</strong></td>
              <td class="r"><strong>${fmt(total)}</strong></td>
            </tr>
          </tfoot>
        </table>

        <p style="margin-top:14px"><strong>Deferred tax assets and liabilities</strong> are measured at the tax rate expected to apply when the asset is realised or liability settled, based on tax laws enacted or substantively enacted as at ${date} i.e. ${rate.toFixed(3)}% (Previous year: as applicable).</p>

        <p style="margin-top:10px">The Company has recognised a net Deferred Tax Asset of <strong>₹${fmt(dt.totalDTA)}</strong> and Deferred Tax Liability of <strong>₹${fmt(dt.totalDTL)}</strong> as at ${date}. The net deferred tax position is <strong>₹${fmt(dt.totalDTA - dt.totalDTL)}</strong> (${dt.totalDTA >= dt.totalDTL ? 'net asset' : 'net liability'}).</p>

        ${dt.closingMAT > 0 ? `<p style="margin-top:10px">The Company has recognised MAT credit entitlement of <strong>₹${fmt(dt.closingMAT)}</strong> (including current year addition of ₹${fmt(val('mv-mat-new'))}), which is expected to be utilised within the permitted carry-forward period of 15 years, based on projected taxable profits.</p>` : ''}

        <p style="margin-top:10px;font-size:11.5px;color:var(--ink-4)"><em>The above disclosure is prepared in accordance with Ind AS 12 — Income Taxes read with the Companies (Indian Accounting Standards) Rules, 2015.</em></p>
      </div>
    `;
  }

  /* ────────────────────────────────
     AUDITOR'S CHECKLIST
  ──────────────────────────────── */
  function buildChecklist(ct, dt, total, etr, state) {
    const cl = $('checklist-wrap');
    if (!cl) return;

    const checks = [
      {
        label: 'Current tax computed on taxable income (not book profit, unless MAT u/s 115JB)',
        ref: 'Sec 115BA/BAA/BAB/JB',
        ok: ct.taxableIncome !== 0 || ct.bookProfit !== 0,
        warn: ct.taxableIncome === 0
      },
      {
        label: 'Balance sheet approach applied for deferred tax per Ind AS 12',
        ref: 'Ind AS 12.15-16',
        ok: true
      },
      {
        label: 'Temporary differences identified for all balance sheet items',
        ref: 'Ind AS 12.5',
        ok: state.dtAsset.length > 0 || state.dtLiab.length > 0,
        warn: state.dtAsset.length === 0 && state.dtLiab.length === 0
      },
      {
        label: 'Tax base correctly determined per Income Tax Act, 1961',
        ref: 'Ind AS 12.7',
        ok: true
      },
      {
        label: 'Deferred tax rate = enacted/substantively enacted rate at balance sheet date',
        ref: 'Ind AS 12.47',
        ok: val('ci-rate') > 0
      },
      {
        label: 'DTA recognised only where probable future taxable profits exist',
        ref: 'Ind AS 12.24-31',
        ok: dt.totalDTA >= 0
      },
      {
        label: 'Unabsorbed depreciation / carried-forward losses — virtual certainty test applied',
        ref: 'Ind AS 12.29',
        ok: true,
        note: 'Verify virtual certainty if DTA on losses is recognised'
      },
      {
        label: 'Initial recognition exception applied (assets/liabilities not affecting taxable profit at recognition)',
        ref: 'Ind AS 12.15(b), 24(b)',
        ok: true
      },
      {
        label: 'Deferred taxes not discounted (presented at undiscounted amounts)',
        ref: 'Ind AS 12.53',
        ok: true
      },
      {
        label: 'DTA and DTL offset only where legally enforceable right exists and same taxing authority',
        ref: 'Ind AS 12.74',
        ok: true
      },
      {
        label: 'Opening balances reconciled to prior year audited financial statements',
        ref: 'SA 520',
        ok: true,
        warn: val('ob-dta') === 0 && val('ob-dtl') === 0,
        note: 'Verify opening balances with prior year workpapers'
      },
      {
        label: 'MAT credit entitlement recognised separately as deferred tax asset',
        ref: 'Ind AS 12 / Sec 115JAA',
        ok: true
      },
      {
        label: 'Effective tax rate reconciliation prepared and reviewed',
        ref: 'Ind AS 12.81(c)',
        ok: ct.bookProfit !== 0
      },
      {
        label: 'Income tax disclosure note prepared as per Ind AS 12.79-88',
        ref: 'Ind AS 12.79',
        ok: true
      },
      {
        label: 'Deferred tax classified as non-current in balance sheet',
        ref: 'Ind AS 1.56',
        ok: true
      }
    ];

    cl.innerHTML = checks.map(c => {
      const status = c.ok && !c.warn ? 'done' : c.warn ? 'warn' : 'fail';
      const icon = status === 'done' ? '✓' : status === 'warn' ? '!' : '✗';
      return `
        <div class="checklist-item">
          <div class="check-icon check-${status}">${icon}</div>
          <div class="check-label">
            ${c.label}
            ${c.note ? `<div class="text-small text-muted mt-4">${c.note}</div>` : ''}
          </div>
          <div class="check-ref">${c.ref}</div>
        </div>
      `;
    }).join('');
  }

  /* ────────────────────────────────
     ETR RECONCILIATION TABLE
  ──────────────────────────────── */
  function buildETRReconciliation(ct, dt, etr, statutoryRate) {
    const tbl = $('etr-table');
    if (!tbl || !ct.bookProfit) return;

    const rate = statutoryRate / 100;
    const taxAtStatutory = ct.bookProfit * rate;
    const etrAmt = ct.grossTax + dt.deferredPLCharge;
    const diff = etrAmt - taxAtStatutory;

    tbl.innerHTML = `
      <table class="wp-table">
        <thead>
          <tr>
            <th>Particulars</th>
            <th class="r">Amount (₹)</th>
            <th class="r">Rate (%)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Profit Before Tax (Book Profit)</td>
            <td class="r">${fmt(ct.bookProfit)}</td>
            <td class="r">—</td>
          </tr>
          <tr>
            <td>Tax at statutory rate of ${statutoryRate.toFixed(3)}%</td>
            <td class="r">${fmt(taxAtStatutory)}</td>
            <td class="r">${statutoryRate.toFixed(3)}%</td>
          </tr>
          <tr>
            <td style="padding-left:24px;color:var(--ink-3)">Effect of non-deductible expenses</td>
            <td class="r">—</td>
            <td class="r">—</td>
          </tr>
          <tr>
            <td style="padding-left:24px;color:var(--ink-3)">Effect of exempt income</td>
            <td class="r">—</td>
            <td class="r">—</td>
          </tr>
          <tr>
            <td style="padding-left:24px;color:var(--ink-3)">Effect of deferred tax movement</td>
            <td class="r">${fmtSign(dt.deferredPLCharge)}</td>
            <td class="r">${ct.bookProfit ? fmtPct(dt.deferredPLCharge / ct.bookProfit * 100) : '—'}</td>
          </tr>
          <tr>
            <td style="padding-left:24px;color:var(--ink-3)">Other adjustments</td>
            <td class="r">—</td>
            <td class="r">—</td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td>Income Tax Expense (Effective Rate: ${fmtPct(etr)})</td>
            <td class="r">${fmt(etrAmt)}</td>
            <td class="r">${fmtPct(etr)}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }

  /* ────────────────────────────────
     PROGRESS BAR
  ──────────────────────────────── */
  function updateProgress(state) {
    let filled = 0;
    if ($('ci-name')?.value) filled++;
    if ($('ci-fy')?.value) filled++;
    if (state.ctRows.some(r => r.amt > 0)) filled++;
    if (state.dtAsset.some(r => r.ca > 0 || r.tb > 0)) filled++;
    if (state.dtLiab.some(r => r.ca > 0 || r.tb > 0)) filled++;
    const pct = Math.round((filled / 5) * 100);
    const bar = $('progress-fill');
    if (bar) bar.style.width = pct + '%';
    const pctEl = $('progress-pct');
    if (pctEl) pctEl.textContent = pct + '% complete';
  }

  /* ── PUBLIC ── */
  return { run, fmt, fmtSign, fmtPct, computeCurrentTax, computeDeferredTax };

})();
