'use strict';

/**
 * STATE.JS - Application State Management and Table Rendering
 * K G Somani & Co LLP
 *
 * This module manages:
 *   - Application data state (current tax rows, deferred tax rows)
 *   - Default row templates for common Ind AS 12 scenarios
 *   - Table rendering for all editable grids
 *   - Data mutations with automatic re-computation
 */

const State = (() => {

  /**
   * Generates a unique identifier for each row.
   * @returns {string} Unique ID prefixed with underscore
   */
  const uid = () => '_' + Math.random().toString(36).substr(2, 9);

  /** Central application data store */
  const data = { ctRows: [], dtAsset: [], dtLiab: [], dtOther: [] };

  /* ------------------------------------------------------------------
     DEFAULT ROW TEMPLATES
     Pre-populated with common items encountered in Indian tax provisions
     ------------------------------------------------------------------ */

  function initDefaults() {
    /* --- Current Tax: Book profit to taxable income reconciliation --- */
    data.ctRows = [
      { id: uid(), label: 'Net Profit as per Statement of Profit & Loss (before tax)', amt: '', type: 'book', locked: true },
      { id: uid(), label: 'Add: Depreciation as per Companies Act 2013 / Ind AS 16 (added back)', amt: '', type: 'add' },
      { id: uid(), label: 'Less: Depreciation allowable u/s 32 of Income Tax Act, 1961', amt: '', type: 'less' },
      { id: uid(), label: 'Add: Provision for Gratuity disallowed u/s 40A(7)', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Provision for Leave Encashment disallowed u/s 43B', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Provision for Bonus / Ex-gratia disallowed u/s 43B', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Provision for Doubtful Debts / ECL disallowed', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Expenses disallowed u/s 40(a)(ia) - TDS default', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Penalty, fines and personal expenses disallowed', amt: '', type: 'add' },
      { id: uid(), label: 'Less: 43B items actually paid before due date of ITR filing', amt: '', type: 'less' },
      { id: uid(), label: 'Less: Exempt income u/s 10 (dividends, LTCG etc.)', amt: '', type: 'less' },
      { id: uid(), label: 'Less: Deduction u/s 80JJAA / 80IC / 80G / other Chapter VI-A', amt: '', type: 'less' },
      { id: uid(), label: 'Add / (Less): Other adjustments - specify', amt: '', type: 'add' },
    ];

    /* --- Deferred Tax: Assets (CA vs TB) --- */
    data.dtAsset = [
      { id: uid(), label: 'Property, Plant & Equipment - Net Block (Ind AS 16)', ca: '', tb: '', note: 'CA = WDV per Schedule II / Ind AS | Tax Base = WDV per IT Act Sec 32' },
      { id: uid(), label: 'Capital Work-in-Progress', ca: '', tb: '', note: 'Tax Base = 0 (no depreciation until asset put to use u/s 32)' },
      { id: uid(), label: 'Intangible Assets (Ind AS 38)', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Right-of-Use Assets (Ind AS 116)', ca: '', tb: '', note: 'Tax Base = 0 (off-balance-sheet for tax; lease payments deducted on payment basis)' },
      { id: uid(), label: 'Financial Instruments at FVTPL (Ind AS 109)', ca: '', tb: '', note: 'Tax Base = cost; CA = fair value' },
      { id: uid(), label: 'Financial Instruments at FVOCI', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Inventories (Ind AS 2)', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Other Non-Current Assets', ca: '', tb: '', note: '' },
    ];

    /* --- Deferred Tax: Liabilities & Provisions (CA vs TB) --- */
    data.dtLiab = [
      { id: uid(), label: 'Provision for Gratuity - Defined Benefit Obligation (Ind AS 19)', ca: '', tb: '', note: 'Tax Base = 0 (allowed only on actual payment u/s 43B / 40A(7))' },
      { id: uid(), label: 'Provision for Leave Encashment', ca: '', tb: '', note: 'Tax Base = 0 (allowed on payment basis u/s 43B)' },
      { id: uid(), label: 'Provision for Bonus / Ex-gratia', ca: '', tb: '', note: 'Tax Base = 0 if not paid before due date of ITR filing' },
      { id: uid(), label: 'Provision for Expected Credit Loss / Doubtful Debts (Ind AS 109)', ca: '', tb: '', note: 'Tax Base = 0 (allowed only on actual write-off under IT Act)' },
      { id: uid(), label: 'Lease Liability (Ind AS 116)', ca: '', tb: '', note: 'Tax Base = 0 (off-balance-sheet for tax)' },
      { id: uid(), label: 'Contract Liabilities / Advance from Customers', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Warranty Provision', ca: '', tb: '', note: 'Tax Base = 0 (not deductible until actual claim settled)' },
      { id: uid(), label: 'Other Provisions', ca: '', tb: '', note: '' },
    ];

    /* --- Deferred Tax: Other Items (Losses, MAT Credit) --- */
    data.dtOther = [
      { id: uid(), label: 'Unabsorbed Depreciation carried forward u/s 32(2)', amt: '', type: 'dta', note: 'Recognise only if virtually certain of future taxable profits' },
      { id: uid(), label: 'Business Loss carried forward u/s 72 (8-year limit)', amt: '', type: 'dta', note: 'Recognise only if virtually certain' },
      { id: uid(), label: 'MAT Credit Entitlement u/s 115JAA / 115JD', amt: '', type: 'dta', note: 'Carry-forward period: 15 years from year of MAT payment' },
    ];

    renderAll();
  }

  /* ------------------------------------------------------------------
     RENDER ALL TABLES
     ------------------------------------------------------------------ */

  function renderAll() {
    renderCT();
    renderDtAsset();
    renderDtLiab();
    renderDtOther();
  }

  /* ------------------------------------------------------------------
     CURRENT TAX TABLE RENDERER
     ------------------------------------------------------------------ */

  function renderCT() {
    const tbody = document.getElementById('ct-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.ctRows.forEach((row, i) => {
      const tpill  = { book: 'pill-blue', add: 'pill-dta', less: 'pill-amber' }[row.type];
      const tlabel = { book: 'Book', add: 'Add', less: 'Less' }[row.type];

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rn" style="width:30px">${i + 1}</td>
        <td style="width:80px">
          ${row.locked
            ? `<span class="pill ${tpill}">${tlabel}</span>`
            : `<select class="ti" style="width:64px" onchange="State.updCT('${row.id}','type',this.value);State.go()">
                <option value="add"  ${row.type === 'add'  ? 'selected' : ''}>Add</option>
                <option value="less" ${row.type === 'less' ? 'selected' : ''}>Less</option>
              </select>`}
        </td>
        <td>
          <input class="ti" value="${row.label}"
            onchange="State.updCT('${row.id}','label',this.value)"
            style="width:100%"/>
        </td>
        <td style="width:170px">
          <input class="ti r" type="number" value="${row.amt}"
            placeholder="0"
            oninput="State.updCT('${row.id}','amt',this.value);State.go()"
            style="width:100%"/>
        </td>
        <td style="width:28px;text-align:center">
          ${row.locked ? '' : `<button class="del-btn" onclick="State.delCT('${row.id}')">x</button>`}
        </td>`;
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------
     DEFERRED TAX: ASSETS TABLE RENDERER
     ------------------------------------------------------------------ */

  function renderDtAsset() {
    const tbody = document.getElementById('dt-asset-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rate = (parseFloat(document.getElementById('ci-rate')?.value) || 25.168) / 100;

    data.dtAsset.forEach((row, i) => {
      const ca   = parseFloat(row.ca) || 0;
      const tb   = parseFloat(row.tb) || 0;
      const diff = ca - tb;
      const te   = Math.abs(diff) * rate;
      const nature = diff > 0 ? 'DTL' : diff < 0 ? 'DTA' : '-';
      const pc     = diff > 0 ? 'pill-dtl' : diff < 0 ? 'pill-dta' : 'pill-none';
      const col    = diff > 0 ? 'color:var(--red)' : diff < 0 ? 'color:var(--green)' : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rn" style="width:30px">${i + 1}</td>
        <td>
          <input class="ti" value="${row.label}"
            onchange="State.updDT('asset','${row.id}','label',this.value)"
            style="width:100%;font-weight:500"/>
          ${row.note ? `<div style="font-size:10.5px;color:var(--ink-4);padding-left:4px;margin-top:2px">${row.note}</div>` : ''}
        </td>
        <td style="width:140px">
          <input class="ti r" type="number" value="${row.ca}"
            placeholder="0"
            oninput="State.updDT('asset','${row.id}','ca',this.value);State.go()"
            style="width:100%"/>
        </td>
        <td style="width:140px">
          <input class="ti r" type="number" value="${row.tb}"
            placeholder="0"
            oninput="State.updDT('asset','${row.id}','tb',this.value);State.go()"
            style="width:100%"/>
        </td>
        <td class="r" style="width:120px;font-weight:600;${col}">${diff !== 0 ? Compute.fmtBracket(diff) : '-'}</td>
        <td class="c" style="width:68px"><span class="pill ${pc}">${nature}</span></td>
        <td class="r" style="width:120px;font-weight:600">${diff !== 0 ? 'Rs ' + Compute.fmt(te) : '-'}</td>
        <td style="width:28px;text-align:center">
          <button class="del-btn" onclick="State.delDT('asset','${row.id}')">x</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------
     DEFERRED TAX: LIABILITIES TABLE RENDERER
     ------------------------------------------------------------------ */

  function renderDtLiab() {
    const tbody = document.getElementById('dt-liab-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rate = (parseFloat(document.getElementById('ci-rate')?.value) || 25.168) / 100;

    data.dtLiab.forEach((row, i) => {
      const ca   = parseFloat(row.ca) || 0;
      const tb   = parseFloat(row.tb) || 0;
      const diff = ca - tb;
      const te   = Math.abs(diff) * rate;
      const nature = diff > 0 ? 'DTA' : diff < 0 ? 'DTL' : '-';
      const pc     = diff > 0 ? 'pill-dta' : diff < 0 ? 'pill-dtl' : 'pill-none';
      const col    = diff > 0 ? 'color:var(--green)' : diff < 0 ? 'color:var(--red)' : '';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="rn" style="width:30px">${i + 1}</td>
        <td>
          <input class="ti" value="${row.label}"
            onchange="State.updDT('liab','${row.id}','label',this.value)"
            style="width:100%;font-weight:500"/>
          ${row.note ? `<div style="font-size:10.5px;color:var(--ink-4);padding-left:4px;margin-top:2px">${row.note}</div>` : ''}
        </td>
        <td style="width:140px">
          <input class="ti r" type="number" value="${row.ca}"
            placeholder="0"
            oninput="State.updDT('liab','${row.id}','ca',this.value);State.go()"
            style="width:100%"/>
        </td>
        <td style="width:140px">
          <input class="ti r" type="number" value="${row.tb}"
            placeholder="0"
            oninput="State.updDT('liab','${row.id}','tb',this.value);State.go()"
            style="width:100%"/>
        </td>
        <td class="r" style="width:120px;font-weight:600;${col}">${diff !== 0 ? Compute.fmtBracket(diff) : '-'}</td>
        <td class="c" style="width:68px"><span class="pill ${pc}">${nature}</span></td>
        <td class="r" style="width:120px;font-weight:600">${diff !== 0 ? 'Rs ' + Compute.fmt(te) : '-'}</td>
        <td style="width:28px;text-align:center">
          <button class="del-btn" onclick="State.delDT('liab','${row.id}')">x</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------
     DEFERRED TAX: OTHER ITEMS TABLE RENDERER
     ------------------------------------------------------------------ */

  function renderDtOther() {
    const tbody = document.getElementById('dt-other-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const rate = (parseFloat(document.getElementById('ci-rate')?.value) || 25.168) / 100;

    data.dtOther.forEach((row, i) => {
      const amt = parseFloat(row.amt) || 0;
      const te  = amt * rate;
      const tr  = document.createElement('tr');
      tr.innerHTML = `
        <td class="rn" style="width:30px">${i + 1}</td>
        <td>
          <input class="ti" value="${row.label}"
            onchange="State.updOther('${row.id}','label',this.value)"
            style="width:100%;font-weight:500"/>
          ${row.note ? `<div style="font-size:10.5px;color:var(--ink-4);padding-left:4px;margin-top:2px">${row.note}</div>` : ''}
        </td>
        <td style="width:160px">
          <input class="ti r" type="number" value="${row.amt}"
            placeholder="0"
            oninput="State.updOther('${row.id}','amt',this.value);State.go()"
            style="width:100%"/>
        </td>
        <td class="c" style="width:90px">
          <select class="ti" style="width:70px"
            onchange="State.updOther('${row.id}','type',this.value);State.go()">
            <option value="dta" ${row.type === 'dta' ? 'selected' : ''}>DTA</option>
            <option value="dtl" ${row.type === 'dtl' ? 'selected' : ''}>DTL</option>
          </select>
        </td>
        <td class="r" style="width:130px;font-weight:600">${amt ? 'Rs ' + Compute.fmt(te) : '-'}</td>
        <td style="width:28px;text-align:center">
          <button class="del-btn" onclick="State.delOther('${row.id}')">x</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  /* ------------------------------------------------------------------
     DATA MUTATIONS
     ------------------------------------------------------------------ */

  function updCT(id, field, val) {
    const r = data.ctRows.find(x => x.id === id);
    if (r) r[field] = val;
  }

  function addCT() {
    data.ctRows.push({ id: uid(), label: 'New line item', amt: '', type: 'add' });
    renderCT();
  }

  function delCT(id) {
    data.ctRows = data.ctRows.filter(x => x.id !== id);
    renderCT();
    go();
  }

  function updDT(section, id, field, val) {
    const arr = section === 'asset' ? data.dtAsset : data.dtLiab;
    const r   = arr.find(x => x.id === id);
    if (r) r[field] = val;
    if (section === 'asset') renderDtAsset(); else renderDtLiab();
  }

  function addDT(section) {
    const nr = { id: uid(), label: 'New item', ca: '', tb: '', note: '' };
    if (section === 'asset') data.dtAsset.push(nr); else data.dtLiab.push(nr);
    if (section === 'asset') renderDtAsset(); else renderDtLiab();
    go();
  }

  function delDT(section, id) {
    if (section === 'asset') data.dtAsset = data.dtAsset.filter(x => x.id !== id);
    else                     data.dtLiab  = data.dtLiab.filter(x => x.id !== id);
    if (section === 'asset') renderDtAsset(); else renderDtLiab();
    go();
  }

  function updOther(id, field, val) {
    const r = data.dtOther.find(x => x.id === id);
    if (r) r[field] = val;
  }

  function addOther() {
    data.dtOther.push({ id: uid(), label: 'New item', amt: '', type: 'dta', note: '' });
    renderDtOther();
    go();
  }

  function delOther(id) {
    data.dtOther = data.dtOther.filter(x => x.id !== id);
    renderDtOther();
    go();
  }

  /* ------------------------------------------------------------------
     DEBOUNCED RECOMPUTATION
     Triggers Compute.run 90ms after last input to avoid excessive recalculation
     ------------------------------------------------------------------ */

  let _timer = null;
  function go() {
    clearTimeout(_timer);
    _timer = setTimeout(() => Compute.run(data), 90);
  }

  /* ------------------------------------------------------------------
     PUBLIC API
     ------------------------------------------------------------------ */
  return {
    data, initDefaults, renderAll,
    renderCT, renderDtAsset, renderDtLiab, renderDtOther,
    updCT, addCT, delCT,
    updDT, addDT, delDT,
    updOther, addOther, delOther,
    go
  };
})();
