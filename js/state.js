/* ═══════════════════════════════════════════════════════════
   STATE.JS — Application State & Table Rendering
   K G Somani & Co LLP | Tax Provision Workpaper
   ═══════════════════════════════════════════════════════════ */

'use strict';

const State = (() => {

  /* ── UID ── */
  const uid = () => '_' + Math.random().toString(36).substr(2, 9);

  /* ── INITIAL STATE ── */
  const data = {
    ctRows: [],
    dtAsset: [],
    dtLiab: [],
    dtOther: []
  };

  /* ────────────────────────────────
     DEFAULT ROWS
  ──────────────────────────────── */
  function initDefaults() {
    data.ctRows = [
      { id: uid(), label: 'Net Profit as per Statement of Profit & Loss', amt: '', type: 'book', locked: true },
      { id: uid(), label: 'Add: Depreciation as per Companies Act / Ind AS 16 (added back)', amt: '', type: 'add' },
      { id: uid(), label: 'Less: Depreciation allowable u/s 32 of Income Tax Act, 1961', amt: '', type: 'less' },
      { id: uid(), label: 'Add: Provision for Gratuity (disallowed u/s 40A(7) / 43B)', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Provision for Leave Encashment (disallowed u/s 43B)', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Provision for Bonus / Ex-gratia (disallowed u/s 43B)', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Provision for Doubtful Debts / ECL (disallowed)', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Expenses disallowed u/s 40(a) — TDS default', amt: '', type: 'add' },
      { id: uid(), label: 'Add: Penalty, fines, personal expenses (disallowed)', amt: '', type: 'add' },
      { id: uid(), label: 'Less: 43B items actually paid before due date of ITR filing', amt: '', type: 'less' },
      { id: uid(), label: 'Less: Exempt income — Dividends u/s 10(34) / Long term capital gains u/s 10(38)', amt: '', type: 'less' },
      { id: uid(), label: 'Less: Deduction u/s 80IC / 80JJAA / 80G / Other Chapter VI-A', amt: '', type: 'less' },
      { id: uid(), label: 'Add / (Less): Other adjustments (specify)', amt: '', type: 'add' },
    ];

    data.dtAsset = [
      { id: uid(), label: 'Property, Plant & Equipment (Net Block — Ind AS 16)', ca: '', tb: '', note: 'CA = WDV per Ind AS; TB = WDV per IT Act Sch II' },
      { id: uid(), label: 'Capital Work-in-Progress', ca: '', tb: '', note: 'TB = 0 (no deduction till asset put to use)' },
      { id: uid(), label: 'Intangible Assets (Ind AS 38)', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Right-of-Use Assets (Ind AS 116)', ca: '', tb: '', note: 'TB = 0 (lease payments deducted on payment basis)' },
      { id: uid(), label: 'Financial Instruments at FVTPL (Ind AS 109)', ca: '', tb: '', note: 'TB = cost; CA = fair value' },
      { id: uid(), label: 'Financial Instruments at FVOCI', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Inventories (Ind AS 2)', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Other Non-Current Assets', ca: '', tb: '', note: '' },
    ];

    data.dtLiab = [
      { id: uid(), label: 'Provision for Gratuity — Defined Benefit (Ind AS 19)', ca: '', tb: '', note: 'Tax base = 0 (allowed only on payment u/s 43B)' },
      { id: uid(), label: 'Provision for Leave Encashment', ca: '', tb: '', note: 'Tax base = 0 (allowed on payment u/s 43B)' },
      { id: uid(), label: 'Provision for Bonus / Ex-gratia', ca: '', tb: '', note: 'Tax base = 0 if not paid before ITR filing' },
      { id: uid(), label: 'Provision for Expected Credit Loss (ECL — Ind AS 109)', ca: '', tb: '', note: 'Tax base = 0 (allowed on write-off/NPA)' },
      { id: uid(), label: 'Lease Liability (Ind AS 116)', ca: '', tb: '', note: 'TB = 0 (off-balance-sheet for tax)' },
      { id: uid(), label: 'Contract Liabilities / Advance from Customers', ca: '', tb: '', note: '' },
      { id: uid(), label: 'Other Provisions', ca: '', tb: '', note: '' },
    ];

    data.dtOther = [
      { id: uid(), label: 'Unabsorbed Depreciation carried forward (Sec 32(2))', amt: '', type: 'dta', note: 'Recognise only if virtually certain' },
      { id: uid(), label: 'Business Loss carried forward (Sec 72)', amt: '', type: 'dta', note: 'Recognise only if virtually certain' },
      { id: uid(), label: 'MAT Credit Entitlement u/s 115JAA / 115JD', amt: '', type: 'dta', note: 'Carry-forward period: 15 years' },
    ];

    renderAll();
  }

  /* ────────────────────────────────
     RENDER ALL TABLES
  ──────────────────────────────── */
  function renderAll() {
    renderCtTable();
    renderDtAssetTable();
    renderDtLiabTable();
    renderDtOtherTable();
  }

  /* ── CURRENT TAX TABLE ── */
  function renderCtTable() {
    const tbody = document.getElementById('ct-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    data.ctRows.forEach((row, i) => {
      const tr = document.createElement('tr');
      const typeColors = { book: 'book-row', add: 'add-row', less: 'less-row' };
      tr.className = typeColors[row.type] || '';

      const typeLabel = { book: 'Book', add: 'Add', less: 'Less' };
      const typePill = { book: 'pill-blue', add: 'pill-green', less: 'pill-purple' };

      tr.innerHTML = `
        <td class="row-num" style="width:36px">${i + 1}</td>
        <td style="width:100px">
          ${row.locked
            ? `<span class="pill ${typePill[row.type]}">${typeLabel[row.type]}</span>`
            : `<select class="ti" onchange="State.updateCtRow('${row.id}','type',this.value);State.triggerCompute()">
                <option value="add" ${row.type === 'add' ? 'selected' : ''}>Add</option>
                <option value="less" ${row.type === 'less' ? 'selected' : ''}>Less</option>
               </select>`
          }
        </td>
        <td>
          <input class="ti" value="${row.label}"
            onchange="State.updateCtRow('${row.id}','label',this.value)"
            placeholder="Particulars"
            style="width:100%" />
        </td>
        <td style="width:180px">
          <input class="ti r" type="number" value="${row.amt}"
            placeholder="0"
            onchange="State.updateCtRow('${row.id}','amt',this.value);State.triggerCompute()"
            oninput="State.updateCtRow('${row.id}','amt',this.value);State.triggerCompute()"
            style="width:100%" />
        </td>
        <td style="width:36px;text-align:center">
          ${row.locked ? '' : `<button class="del-btn" onclick="State.delCtRow('${row.id}')" title="Remove row">×</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ── DEFERRED TAX — ASSETS ── */
  function renderDtAssetTable() {
    const tbody = document.getElementById('dt-asset-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rate = (parseFloat(document.getElementById('ci-rate')?.value) || 25.168) / 100;

    data.dtAsset.forEach((row, i) => {
      const ca = parseFloat(row.ca) || 0;
      const tb = parseFloat(row.tb) || 0;
      const diff = ca - tb;
      const taxEffect = Math.abs(diff) * rate;
      const nature = diff > 0 ? 'DTL' : diff < 0 ? 'DTA' : '—';
      const pillClass = diff > 0 ? 'pill-dtl' : diff < 0 ? 'pill-dta' : 'pill-gray';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="row-num" style="width:36px">${i + 1}</td>
        <td>
          <div>
            <input class="ti" value="${row.label}"
              onchange="State.updateDt('asset','${row.id}','label',this.value)"
              style="width:100%;font-weight:500" />
            ${row.note ? `<div style="font-size:10.5px;color:var(--ink-5);margin-top:2px;padding-left:5px">${row.note}</div>` : ''}
          </div>
        </td>
        <td style="width:160px">
          <input class="ti r" type="number" value="${row.ca}"
            placeholder="Carrying Amt"
            oninput="State.updateDt('asset','${row.id}','ca',this.value);State.triggerCompute()"
            style="width:100%" />
        </td>
        <td style="width:160px">
          <input class="ti r" type="number" value="${row.tb}"
            placeholder="Tax Base"
            oninput="State.updateDt('asset','${row.id}','tb',this.value);State.triggerCompute()"
            style="width:100%" />
        </td>
        <td class="r" style="width:140px;font-weight:600;${diff > 0 ? 'color:var(--red-2)' : diff < 0 ? 'color:var(--green-2)' : ''}">
          ${diff !== 0 ? Compute.fmtSign(diff) : '—'}
        </td>
        <td style="width:80px;text-align:center">
          <span class="pill ${pillClass}">${nature}</span>
        </td>
        <td class="r" style="width:140px;font-weight:600">
          ${diff !== 0 ? '₹' + Compute.fmt(taxEffect) : '—'}
        </td>
        <td style="width:36px;text-align:center">
          <button class="del-btn" onclick="State.delDt('asset','${row.id}')" title="Remove">×</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ── DEFERRED TAX — LIABILITIES ── */
  function renderDtLiabTable() {
    const tbody = document.getElementById('dt-liab-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rate = (parseFloat(document.getElementById('ci-rate')?.value) || 25.168) / 100;

    data.dtLiab.forEach((row, i) => {
      const ca = parseFloat(row.ca) || 0;
      const tb = parseFloat(row.tb) || 0;
      const diff = ca - tb;
      const taxEffect = Math.abs(diff) * rate;
      // For liabilities: CA > TB → DTA (future deductible)
      const nature = diff > 0 ? 'DTA' : diff < 0 ? 'DTL' : '—';
      const pillClass = diff > 0 ? 'pill-dta' : diff < 0 ? 'pill-dtl' : 'pill-gray';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="row-num" style="width:36px">${i + 1}</td>
        <td>
          <div>
            <input class="ti" value="${row.label}"
              onchange="State.updateDt('liab','${row.id}','label',this.value)"
              style="width:100%;font-weight:500" />
            ${row.note ? `<div style="font-size:10.5px;color:var(--ink-5);margin-top:2px;padding-left:5px">${row.note}</div>` : ''}
          </div>
        </td>
        <td style="width:160px">
          <input class="ti r" type="number" value="${row.ca}"
            placeholder="Carrying Amt"
            oninput="State.updateDt('liab','${row.id}','ca',this.value);State.triggerCompute()"
            style="width:100%" />
        </td>
        <td style="width:160px">
          <input class="ti r" type="number" value="${row.tb}"
            placeholder="Tax Base"
            oninput="State.updateDt('liab','${row.id}','tb',this.value);State.triggerCompute()"
            style="width:100%" />
        </td>
        <td class="r" style="width:140px;font-weight:600;${diff > 0 ? 'color:var(--green-2)' : diff < 0 ? 'color:var(--red-2)' : ''}">
          ${diff !== 0 ? Compute.fmtSign(diff) : '—'}
        </td>
        <td style="width:80px;text-align:center">
          <span class="pill ${pillClass}">${nature}</span>
        </td>
        <td class="r" style="width:140px;font-weight:600">
          ${diff !== 0 ? '₹' + Compute.fmt(taxEffect) : '—'}
        </td>
        <td style="width:36px;text-align:center">
          <button class="del-btn" onclick="State.delDt('liab','${row.id}')" title="Remove">×</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ── DEFERRED TAX — OTHER ── */
  function renderDtOtherTable() {
    const tbody = document.getElementById('dt-other-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const rate = (parseFloat(document.getElementById('ci-rate')?.value) || 25.168) / 100;

    data.dtOther.forEach((row, i) => {
      const amt = parseFloat(row.amt) || 0;
      const taxEffect = amt * rate;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="row-num" style="width:36px">${i + 1}</td>
        <td>
          <div>
            <input class="ti" value="${row.label}"
              onchange="State.updateDtOther('${row.id}','label',this.value)"
              style="width:100%;font-weight:500" />
            ${row.note ? `<div style="font-size:10.5px;color:var(--ink-5);margin-top:2px;padding-left:5px">${row.note}</div>` : ''}
          </div>
        </td>
        <td style="width:160px">
          <input class="ti r" type="number" value="${row.amt}"
            placeholder="Amount"
            oninput="State.updateDtOther('${row.id}','amt',this.value);State.triggerCompute()"
            style="width:100%" />
        </td>
        <td style="width:100px;text-align:center">
          <select class="ti" onchange="State.updateDtOther('${row.id}','type',this.value);State.triggerCompute()"
            style="width:70px;text-align:center">
            <option value="dta" ${row.type === 'dta' ? 'selected' : ''}>DTA</option>
            <option value="dtl" ${row.type === 'dtl' ? 'selected' : ''}>DTL</option>
          </select>
        </td>
        <td class="r" style="width:140px;font-weight:600">
          ${amt ? '₹' + Compute.fmt(taxEffect) : '—'}
        </td>
        <td style="width:36px;text-align:center">
          <button class="del-btn" onclick="State.delDtOther('${row.id}')" title="Remove">×</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ────────────────────────────────
     STATE MUTATIONS
  ──────────────────────────────── */
  function updateCtRow(id, field, value) {
    const row = data.ctRows.find(r => r.id === id);
    if (row) row[field] = value;
  }
  function addCtRow() {
    data.ctRows.push({ id: uid(), label: 'New item — describe here', amt: '', type: 'add' });
    renderCtTable();
  }
  function delCtRow(id) {
    data.ctRows = data.ctRows.filter(r => r.id !== id);
    renderCtTable();
    triggerCompute();
  }

  function updateDt(section, id, field, value) {
    const arr = section === 'asset' ? data.dtAsset : data.dtLiab;
    const row = arr.find(r => r.id === id);
    if (row) row[field] = value;
    if (section === 'asset') renderDtAssetTable();
    else renderDtLiabTable();
  }
  function addDtRow(section) {
    const newRow = { id: uid(), label: 'New item — describe here', ca: '', tb: '', note: '' };
    if (section === 'asset') data.dtAsset.push(newRow);
    else data.dtLiab.push(newRow);
    if (section === 'asset') renderDtAssetTable();
    else renderDtLiabTable();
    triggerCompute();
  }
  function delDt(section, id) {
    if (section === 'asset') data.dtAsset = data.dtAsset.filter(r => r.id !== id);
    else data.dtLiab = data.dtLiab.filter(r => r.id !== id);
    if (section === 'asset') renderDtAssetTable();
    else renderDtLiabTable();
    triggerCompute();
  }

  function updateDtOther(id, field, value) {
    const row = data.dtOther.find(r => r.id === id);
    if (row) row[field] = value;
  }
  function addDtOther() {
    data.dtOther.push({ id: uid(), label: 'New item — describe here', amt: '', type: 'dta', note: '' });
    renderDtOtherTable();
    triggerCompute();
  }
  function delDtOther(id) {
    data.dtOther = data.dtOther.filter(r => r.id !== id);
    renderDtOtherTable();
    triggerCompute();
  }

  /* ────────────────────────────────
     COMPUTE TRIGGER
  ──────────────────────────────── */
  let computeTimer = null;
  function triggerCompute() {
    clearTimeout(computeTimer);
    computeTimer = setTimeout(() => {
      Compute.run(data);
    }, 80); // debounce
  }

  /* ── PUBLIC ── */
  return {
    data,
    initDefaults,
    renderAll,
    renderCtTable,
    renderDtAssetTable,
    renderDtLiabTable,
    renderDtOtherTable,
    updateCtRow, addCtRow, delCtRow,
    updateDt, addDtRow, delDt,
    updateDtOther, addDtOther, delDtOther,
    triggerCompute
  };

})();
