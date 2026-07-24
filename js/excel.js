'use strict';

/**
 * EXCEL.JS - Professional Workpaper Export
 * K G Somani & Co LLP
 *
 * Exports the complete tax provision workpaper to Excel format
 * using SheetJS (loaded from CDN on demand).
 *
 * Generated workbook contains 8 sheets:
 *   1. COVER    - Engagement details and summary
 *   2. CT       - Current Tax Computation
 *   3. DT       - Deferred Tax Schedule
 *   4. MOV      - DTA / DTL Movement Schedule
 *   5. JE       - Journal Entries
 *   6. DISC     - Ind AS 12 Disclosure Note
 *   7. ETR      - Effective Tax Rate Reconciliation
 *   8. CHK      - Auditor QC Checklist
 */

const Excel = (() => {

  const s = id => document.getElementById(id)?.value || '';
  const v = id => parseFloat(document.getElementById(id)?.value) || 0;
  const n = x  => Math.round(parseFloat(x) || 0);

  /**
   * Main export function. Loads SheetJS if not present, then generates
   * and downloads the complete workpaper workbook.
   */
  async function exportWorkpaper() {
    UI.toast('Generating Excel workpaper...', 'info', 3500);

    if (!window.XLSX) {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
      } catch (e) {
        UI.toast('Could not load export library. Check internet connection.', 'err');
        return;
      }
    }

    const result = Compute.run(State.data);
    if (!result) {
      UI.toast('Please compute the provision first.', 'err');
      return;
    }

    const { ct, dt, total, etr } = result;

    const WB = XLSX.utils.book_new();
    WB.Props = {
      Title: 'Tax Provision Workpaper',
      Author: 'K G Somani & Co LLP',
      CreatedDate: new Date()
    };

    addCover(WB, ct, dt, total, etr);
    addCT(WB, ct);
    addDT(WB, dt);
    addMov(WB, dt);
    addJE(WB, ct, dt);
    addDisc(WB, ct, dt, total, etr);
    addETR(WB, ct, dt, total, etr);
    addChk(WB);

    const client = s('ci-name').replace(/\s+/g, '_') || 'Client';
    const fy     = s('ci-fy').replace(/[^0-9\-]/g, '') || 'FY';
    XLSX.writeFile(WB, `KGS_TaxProvision_${client}_${fy}.xlsx`);
    UI.toast('Excel workpaper downloaded successfully', 'ok');
  }

  /* ------------------------------------------------------------------
     COVER SHEET
     ------------------------------------------------------------------ */

  function addCover(WB, ct, dt, total, etr) {
    const rate = v('ci-rate');
    const rows = [
      ['K G Somani & Co LLP - Chartered Accountants'],
      ['INCOME TAX PROVISION WORKPAPER - Ind AS 12'],
      [''],
      ['CLIENT DETAILS', ''],
      ['Client Name',           s('ci-name')],
      ['CIN / PAN',             s('ci-cin')],
      ['Financial Year',        s('ci-fy')],
      ['Balance Sheet Date',    s('ci-date')],
      ['Tax Regime',            s('ci-regime')],
      ['Applicable Tax Rate',   rate.toFixed(3) + '%'],
      ['MAT Rate',              v('ci-mat').toFixed(3) + '%'],
      [''],
      ['SIGN-OFF', ''],
      ['Prepared By',           s('ci-prep')],
      ['Reviewed By',           s('ci-rev')],
      ['Date of Preparation',   s('ci-prepdate')],
      [''],
      ['PROVISION SUMMARY', 'Rs'],
      ['Current Tax (Gross)',                 n(ct.grossTax)],
      ['Deferred Tax Charge / (Credit)',      n(dt.dtPLCharge)],
      ['Total Income Tax Expense',            n(total)],
      ['Net Current Tax Payable',             n(ct.netCT)],
      ['Closing DTA (Balance Sheet)',         n(dt.closingDTA)],
      ['Closing DTL (Balance Sheet)',         n(dt.closingDTL)],
      ['Effective Tax Rate',                  etr.toFixed(2) + '%'],
      [''],
      ['WORKPAPER INDEX', 'Sheet'],
      ['Current Tax Computation',            'CT'],
      ['Deferred Tax Schedule (Ind AS 12)',  'DT'],
      ['DTA / DTL Movement Schedule',        'MOV'],
      ['Journal Entries',                    'JE'],
      ['Ind AS 12 Disclosure Note',          'DISC'],
      ['ETR Reconciliation',                 'ETR'],
      ['Auditor QC Checklist',               'CHK'],
      [''],
      ['Generated: ' + new Date().toLocaleDateString('en-IN') + ' | K G Somani & Co LLP Tax Provision Tool'],
    ];
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 44 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(WB, WS, 'COVER');
  }

  /* ------------------------------------------------------------------
     CURRENT TAX SHEET
     ------------------------------------------------------------------ */

  function addCT(WB, ct) {
    const rate = v('ci-rate');
    const rows = [
      ['K G Somani & Co LLP'],
      ['CURRENT TAX COMPUTATION - Income Tax Act, 1961'],
      ['Client: ' + s('ci-name') + '  |  FY: ' + s('ci-fy') + '  |  Rate: ' + rate.toFixed(3) + '%'],
      [''],
      ['SR', 'TYPE', 'PARTICULARS', 'AMOUNT (Rs)'],
    ];
    State.data.ctRows.forEach((r, i) => {
      rows.push([i + 1, r.type.toUpperCase(), r.label, n(r.amt)]);
    });
    rows.push(['', '', '', '']);
    rows.push(['', '', 'TAXABLE INCOME / (LOSS)', n(ct.taxable)]);
    rows.push(['', '', '', '']);
    rows.push(['', '', 'TAX COMPUTATION', '']);
    rows.push(['', '', 'Taxable Income', n(ct.taxable)]);
    rows.push(['', '', 'Tax Rate', rate.toFixed(3) + '%']);
    rows.push(['', '', 'Gross Tax Liability', n(ct.grossTax)]);
    rows.push(['', '', 'Less: MAT Credit Utilised', n(ct.matUtil)]);
    rows.push(['', '', 'Less: Advance Tax / TDS', n(ct.tds)]);
    rows.push(['', '', 'NET CURRENT TAX PAYABLE', n(ct.netCT)]);
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 5 }, { wch: 7 }, { wch: 60 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(WB, WS, 'CT');
  }

  /* ------------------------------------------------------------------
     DEFERRED TAX SCHEDULE SHEET
     ------------------------------------------------------------------ */

  function addDT(WB, dt) {
    const rate = v('ci-rate');
    const rows = [
      ['K G Somani & Co LLP'],
      ['DEFERRED TAX SCHEDULE - Ind AS 12 (Balance Sheet Approach)'],
      ['Client: ' + s('ci-name') + '  |  FY: ' + s('ci-fy') + '  |  Rate: ' + rate.toFixed(3) + '%'],
      ['Temp Diff = Carrying Amount (Ind AS) - Tax Base (Income Tax Act, 1961)'],
      [''],
      ['SECTION A - ASSETS'],
      ['For Assets: CA > Tax Base = Taxable Temp Diff = DTL  |  CA < Tax Base = Deductible Temp Diff = DTA'],
      ['SR', 'PARTICULARS', 'CARRYING AMT (Rs)', 'TAX BASE (Rs)', 'TEMP DIFF (Rs)', 'NATURE', 'TAX EFFECT (Rs)', 'NOTES'],
    ];
    dt.assetRows.forEach((r, i) => {
      rows.push([i + 1, r.label, n(r.ca), n(r.tb), n(r.diff), r.nature || '-', n(r.te), r.note || '']);
    });
    rows.push(['', 'SUBTOTAL DTA from Assets', '', '', '', '', n(dt.assetRows.reduce((s, r) => s + (r.nature === 'DTA' ? r.te : 0), 0)), '']);
    rows.push(['', 'SUBTOTAL DTL from Assets', '', '', '', '', n(dt.assetRows.reduce((s, r) => s + (r.nature === 'DTL' ? r.te : 0), 0)), '']);
    rows.push(['']);
    rows.push(['SECTION B - LIABILITIES & PROVISIONS']);
    rows.push(['For Liabilities: CA > Tax Base = Deductible Temp Diff = DTA  |  CA < Tax Base = Taxable Temp Diff = DTL']);
    rows.push(['SR', 'PARTICULARS', 'CARRYING AMT (Rs)', 'TAX BASE (Rs)', 'TEMP DIFF (Rs)', 'NATURE', 'TAX EFFECT (Rs)', 'NOTES']);
    dt.liabRows.forEach((r, i) => {
      rows.push([i + 1, r.label, n(r.ca), n(r.tb), n(r.diff), r.nature || '-', n(r.te), r.note || '']);
    });
    rows.push(['', 'SUBTOTAL DTA from Liabilities', '', '', '', '', n(dt.liabRows.reduce((s, r) => s + (r.nature === 'DTA' ? r.te : 0), 0)), '']);
    rows.push(['', 'SUBTOTAL DTL from Liabilities', '', '', '', '', n(dt.liabRows.reduce((s, r) => s + (r.nature === 'DTL' ? r.te : 0), 0)), '']);
    rows.push(['']);
    rows.push(['SECTION C - OTHER DEFERRED ITEMS (Losses / MAT Credit)']);
    rows.push(['SR', 'PARTICULARS', 'BASE AMOUNT (Rs)', '', '', 'TYPE', 'TAX EFFECT (Rs)', 'NOTES']);
    dt.otherRows.forEach((r, i) => {
      rows.push([i + 1, r.label, n(r.amt), '', '', r.type.toUpperCase(), n(r.te), r.note || '']);
    });
    rows.push(['']);
    rows.push(['CONSOLIDATED POSITION']);
    rows.push(['Gross Deferred Tax Asset (DTA)', '', '', '', '', '', n(dt.grossDTA), '']);
    rows.push(['Gross Deferred Tax Liability (DTL)', '', '', '', '', '', n(dt.grossDTL), '']);
    rows.push(['Net DTA / (DTL)', '', '', '', '', '', n(dt.grossDTA - dt.grossDTL), '']);
    rows.push(['Deferred Tax P&L Impact - Charge / (Credit)', '', '', '', '', '', n(dt.dtPLCharge), '']);
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 5 }, { wch: 54 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 42 }];
    XLSX.utils.book_append_sheet(WB, WS, 'DT');
  }

  /* ------------------------------------------------------------------
     MOVEMENT SCHEDULE SHEET
     ------------------------------------------------------------------ */

  function addMov(WB, dt) {
    const rows = [
      ['K G Somani & Co LLP'],
      ['DTA / DTL MOVEMENT SCHEDULE'],
      ['Client: ' + s('ci-name') + '  |  FY: ' + s('ci-fy')],
      [''],
      ['DEFERRED TAX ASSET - MOVEMENT', 'Rs'],
      ['Opening DTA (prior year audited FS)',      n(v('ob-dta'))],
      ['Add: DTA recognised during the year',      n(dt.grossDTA)],
      ['Less: DTA reversed / utilised',            '-'],
      ['Add: MAT Credit Entitlement recognised',   n(v('mv-mat-new'))],
      ['Less: MAT Credit utilised',                n(v('ct-matutil'))],
      ['CLOSING DTA (to Balance Sheet)',           n(dt.closingDTA)],
      [''],
      ['DEFERRED TAX LIABILITY - MOVEMENT', 'Rs'],
      ['Opening DTL (prior year audited FS)',  n(v('ob-dtl'))],
      ['Add: DTL created during the year',     n(dt.grossDTL)],
      ['Less: DTL reversed during the year',   '-'],
      ['CLOSING DTL (to Balance Sheet)',       n(dt.closingDTL)],
      [''],
      ['MAT CREDIT ENTITLEMENT - MOVEMENT (Sec 115JAA)', 'Rs'],
      ['Opening MAT Credit',                  n(v('ob-mat'))],
      ['Add: MAT Credit recognised this year', n(v('mv-mat-new'))],
      ['Less: MAT Credit utilised',           n(v('ct-matutil'))],
      ['CLOSING MAT CREDIT',                  n(dt.closingMAT)],
    ];
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 52 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(WB, WS, 'MOV');
  }

  /* ------------------------------------------------------------------
     JOURNAL ENTRIES SHEET
     ------------------------------------------------------------------ */

  function addJE(WB, ct, dt) {
    const fy  = s('ci-fy');
    const dtv = s('ci-date');
    const rate = v('ci-rate');
    const matNew = v('mv-mat-new');
    const isCr = dt.dtPLCharge < 0;

    const rows = [
      ['K G Somani & Co LLP'],
      ['JOURNAL ENTRIES - Income Tax Provision | ' + fy],
      ['Client: ' + s('ci-name')],
      [''],
      ['JOURNAL ENTRY 1 - CURRENT TAX PROVISION'],
      ['Date', 'Account', 'Dr (Rs)', 'Cr (Rs)', 'Narration'],
      [dtv, 'Income Tax Expense - Current',        n(ct.grossTax), '',          'Current tax @ ' + rate.toFixed(3) + '%'],
    ];
    if (ct.tds > 0)     rows.push([dtv, 'Advance Tax / TDS Receivable', '', n(ct.tds),     'TDS/Advance tax adjusted']);
    if (ct.matUtil > 0) rows.push([dtv, 'MAT Credit Utilised (u/s 115JAA)', '', n(ct.matUtil), 'MAT credit set off']);
    rows.push([dtv, 'Provision for Current Tax', '', n(ct.netCT), 'Net payable for the year']);
    rows.push(['', 'TOTAL', n(ct.grossTax), n(ct.grossTax), 'BALANCED - Dr = Cr']);
    rows.push(['']);
    rows.push(['JOURNAL ENTRY 2 - DEFERRED TAX (Ind AS 12)']);
    rows.push(['Date', 'Account', 'Dr (Rs)', 'Cr (Rs)', 'Narration']);
    if (isCr) {
      rows.push([dtv, 'Deferred Tax Asset',         n(Math.abs(dt.dtPLCharge)), '',                         'DTA recognised - deductible temporary differences']);
      rows.push([dtv, 'Deferred Tax Income (P&L)',  '',                         n(Math.abs(dt.dtPLCharge)), 'Credit to P&L per Ind AS 12']);
    } else {
      rows.push([dtv, 'Deferred Tax Expense (P&L)', n(dt.dtPLCharge), '',              'Charge to P&L per Ind AS 12']);
      rows.push([dtv, 'Deferred Tax Liability',     '',               n(dt.dtPLCharge),'DTL created - taxable temporary differences']);
    }
    rows.push(['', 'TOTAL', n(Math.abs(dt.dtPLCharge)), n(Math.abs(dt.dtPLCharge)), 'BALANCED - Dr = Cr']);

    if (matNew > 0) {
      rows.push(['']);
      rows.push(['JOURNAL ENTRY 3 - MAT CREDIT ENTITLEMENT (Sec 115JAA)']);
      rows.push(['Date', 'Account', 'Dr (Rs)', 'Cr (Rs)', 'Narration']);
      rows.push([dtv, 'MAT Credit Entitlement - DTA', n(matNew), '',         'MAT credit entitled u/s 115JAA']);
      rows.push([dtv, 'MAT Credit Income (P&L)',       '',        n(matNew),  'Credit to P&L - utilisation reasonably certain']);
      rows.push(['', 'TOTAL', n(matNew), n(matNew), 'BALANCED - Dr = Cr']);
    }
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 13 }, { wch: 44 }, { wch: 14 }, { wch: 14 }, { wch: 52 }];
    XLSX.utils.book_append_sheet(WB, WS, 'JE');
  }

  /* ------------------------------------------------------------------
     DISCLOSURE NOTE SHEET
     ------------------------------------------------------------------ */

  function addDisc(WB, ct, dt, total, etr) {
    const rate = v('ci-rate');
    const rows = [
      ['K G Somani & Co LLP'],
      ['IND AS 12 - DISCLOSURE NOTE'],
      ['Client: ' + s('ci-name') + '  |  FY: ' + s('ci-fy')],
      [''],
      ['Note ___ - Income Taxes'],
      [''],
      ['(a) Recognised in Statement of Profit and Loss', '', ''],
      ['Particulars', 'Current Year (Rs)', ''],
      ['Current tax on profits', n(ct.grossTax), ''],
      ['Total current tax', n(ct.grossTax), ''],
      ['Deferred tax - origination and reversal of temporary differences', n(dt.dtPLCharge), ''],
      ['Total deferred tax expense / (credit)', n(dt.dtPLCharge), ''],
      ['Income tax expense for the year', n(total), ''],
      [''],
      ['(b) Effective Tax Rate Reconciliation', '', ''],
      ['Particulars', 'Amount (Rs)', 'Rate (%)'],
      ['Profit before tax',                n(ct.bookProfit), '-'],
      ['Tax at statutory rate of ' + rate.toFixed(3) + '%', n(ct.bookProfit * rate / 100), rate.toFixed(3) + '%'],
      ['Non-deductible expenses',          '-', '-'],
      ['Exempt income',                    '-', '-'],
      ['Effect of deferred tax movement',  n(dt.dtPLCharge), ct.bookProfit ? (dt.dtPLCharge / ct.bookProfit * 100).toFixed(2) + '%' : '-'],
      ['Total tax expense / Effective rate', n(total), etr.toFixed(2) + '%'],
      [''],
      ['(c) Deferred Tax Balance Sheet Position', '', ''],
      ['Particulars', 'DTA (Rs)', 'DTL (Rs)'],
      ['Gross deferred tax',          n(dt.grossDTA),   n(dt.grossDTL)],
      ['Opening balance',             n(v('ob-dta')),   n(v('ob-dtl'))],
      ['Closing balance (Non-Current)', n(dt.closingDTA), n(dt.closingDTL)],
      [''],
      ['Tax rate used: ' + rate.toFixed(3) + '% (enacted rate at balance sheet date)'],
      ['Basis: Ind AS 12 - Income Taxes, Companies (Indian Accounting Standards) Rules, 2015, as amended'],
    ];
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 60 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(WB, WS, 'DISC');
  }

  /* ------------------------------------------------------------------
     ETR RECONCILIATION SHEET
     ------------------------------------------------------------------ */

  function addETR(WB, ct, dt, total, etr) {
    const rate = v('ci-rate');
    const rows = [
      ['K G Somani & Co LLP'],
      ['EFFECTIVE TAX RATE RECONCILIATION - Ind AS 12.81(c)'],
      ['Client: ' + s('ci-name') + '  |  FY: ' + s('ci-fy')],
      [''],
      ['Particulars', 'Amount (Rs)', 'Rate (%)'],
      ['Profit before tax',                               n(ct.bookProfit), '-'],
      ['Tax at statutory rate of ' + rate.toFixed(3) + '%', n(ct.bookProfit * rate / 100), rate.toFixed(3) + '%'],
      ['Non-deductible expenses',                         '-', '-'],
      ['Exempt income',                                   '-', '-'],
      ['Effect of deferred tax movement',                 n(dt.dtPLCharge), ct.bookProfit ? (dt.dtPLCharge / ct.bookProfit * 100).toFixed(3) + '%' : '-'],
      ['Other adjustments',                               '-', '-'],
      ['Income tax expense / Effective tax rate',         n(total), etr.toFixed(2) + '%'],
      [''],
      ['Statutory Rate', rate.toFixed(3) + '%'],
      ['Effective Rate',  etr.toFixed(2) + '%'],
      ['Variance',        (etr - rate).toFixed(2) + '%'],
    ];
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 56 }, { wch: 18 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(WB, WS, 'ETR');
  }

  /* ------------------------------------------------------------------
     AUDITOR QC CHECKLIST SHEET
     ------------------------------------------------------------------ */

  function addChk(WB) {
    const checks = [
      ['Balance sheet approach applied per Ind AS 12', 'Ind AS 12.15', 'Done'],
      ['Current tax computed on taxable income per IT Act', 'Sec 115BAA/JB', 'Done'],
      ['Temporary differences identified for all balance sheet items', 'Ind AS 12.5', 'Done'],
      ['Tax base correctly determined per Income Tax Act', 'Ind AS 12.7', 'Done'],
      ['Deferred tax rate = enacted rate at balance sheet date', 'Ind AS 12.47', 'Done'],
      ['DTA recognised only where future taxable profits are probable', 'Ind AS 12.24', 'Done'],
      ['Virtual certainty test applied for DTA on unabsorbed losses', 'Ind AS 12.29', 'Review'],
      ['Initial recognition exception applied correctly', 'Ind AS 12.15(b)', 'Done'],
      ['Deferred taxes presented at undiscounted amounts', 'Ind AS 12.53', 'Done'],
      ['DTA and DTL offset only where enforceable right and same taxing authority', 'Ind AS 12.74', 'Done'],
      ['Opening balances agreed to prior year audited FS', 'SA 520', 'Review'],
      ['MAT credit recognised separately as deferred tax asset', 'Sec 115JAA', 'Done'],
      ['DTA and DTL classified as Non-Current in Balance Sheet', 'Ind AS 1.56', 'Done'],
      ['ETR reconciliation prepared and disclosed', 'Ind AS 12.81(c)', 'Done'],
      ['Temporary difference disclosure for each category', 'Ind AS 12.81(g)', 'Done'],
      ['Journal entries balanced - Dr = Cr', 'SA 300', 'Done'],
      ['Disclosure note prepared per Ind AS 12.79-88', 'Ind AS 12.79', 'Done'],
      ['Presentation per Companies Act 2013, Schedule III', 'Sch III Part I', 'Done'],
    ];
    const rows = [
      ['K G Somani & Co LLP'],
      ['AUDITOR QC CHECKLIST - Deferred Tax'],
      ['Client: ' + s('ci-name') + '  |  FY: ' + s('ci-fy') + '  |  Date: ' + new Date().toLocaleDateString('en-IN')],
      [''],
      ['SR', 'CHECK POINT', 'REFERENCE', 'STATUS', 'REMARKS'],
      ...checks.map((c, i) => [i + 1, ...c, '']),
      [''],
      ['Prepared By: ' + s('ci-prep'), '', '', 'Reviewed By: ' + s('ci-rev'), ''],
      ['Date: ' + s('ci-prepdate')],
    ];
    const WS = XLSX.utils.aoa_to_sheet(rows);
    WS['!cols'] = [{ wch: 5 }, { wch: 62 }, { wch: 18 }, { wch: 9 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(WB, WS, 'CHK');
  }

  /* ------------------------------------------------------------------
     SCRIPT LOADER
     ------------------------------------------------------------------ */

  /**
   * Dynamically loads an external JavaScript file.
   * @param {string} src - URL of the script to load
   * @returns {Promise} Resolves when script loads, rejects on error
   */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = res;
      el.onerror = rej;
      document.head.appendChild(el);
    });
  }

  return { exportWorkpaper };
})();
