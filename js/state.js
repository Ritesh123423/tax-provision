'use strict';
/* =====================================================
   STATE.JS - Application State & Table Rendering
   K G Somani & Co LLP
===================================================== */
const State = (() => {

  const uid = () => '_' + Math.random().toString(36).substr(2, 9);

  const data = { ctRows: [], dtAsset: [], dtLiab: [], dtOther: [] };

  /* =====================================================
     DEFAULT ROWS - blank, structured, ready to fill
  ===================================================== */
  function initDefaults() {
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

    data.dtOther = [
      { id: uid(), label: 'Unabsorbed Depreciation carried forward u/s 32(2)', amt: '', type: 'dta', note: 'Recognise only if virtually certain of future taxable profits' },
      { id: uid(), label: 'Business Loss carried forward u/s 72 (8-year limit)', amt: '', type: 'dta', note: 'Recognise only if virtually certain' },
      { id: uid(), label: 'MAT Credit Entitlement u/s 115JAA / 115JD', amt: '', type: 'dta', note: 'Carry-forward period: 15 years from year of MAT payment' },
    ];

    renderAll();
  }

  /* =====================================================
     RENDER ALL
  ===================================================== */
  function renderAll() {
    renderCT();
    renderDtAsset();
    renderDtLiab();
    renderDtOther();
  }

  /* CURRENT TAX TABLE */
  function renderCT() {
    const tbody = document.getElementById('ct-body'); if (!tbody) return;
    tbody.innerHTML = '';
    data.ctRows.forEach((row, i) => {
      const cls    = { book: '', add: '', less: '' }[row.type] || '';
      const tpill  = { book: 'pill-blue', add: 'pill-dta', less: 'pill-amber' }[row.type];
      const tlabel = { book: 'Book', add: 'Add', less: 'Less' }[row.type];
      const tr     = document.createElement('tr');
      tr.className = cls;
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

  /* DT ASSETS TABLE */
  function renderDtAsset() {
    const tbody = document.getElementById('dt-asset-body'); if (!tbody) return;
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

  /* DT LIABILITIES TABLE */
  function renderDtLiab() {
    const tbody = document.getElementById('dt-liab-body'); if (!tbody) return;
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

  /* DT OTHER TABLE */
  function renderDtOther() {
    const tbody = document.getElementById('dt-other-body'); if (!tbody) return;
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

  /* =====================================================
     MUTATIONS
  ===================================================== */
  function updCT(id, f, val) {
    const r = data.ctRows.find(x => x.id === id);
    if (r) r[f] = f === 'amt' ? val : val;
  }
  function addCT() {
    data.ctRows.push({ id: uid(), label: 'New line item', amt: '', type: 'add' });
    renderCT();
  }
  function delCT(id) {
    data.ctRows = data.ctRows.filter(x => x.id !== id);
    renderCT(); go();
  }

  function updDT(sec, id, f, val) {
    const arr = sec === 'asset' ? data.dtAsset : data.dtLiab;
    const r   = arr.find(x => x.id === id);
    if (r) r[f] = ['ca', 'tb'].includes(f) ? val : val;
    if (sec === 'asset') renderDtAsset(); else renderDtLiab();
  }
  function addDT(sec) {
    const nr = { id: uid(), label: 'New item', ca: '', tb: '', note: '' };
    if (sec === 'asset') data.dtAsset.push(nr); else data.dtLiab.push(nr);
    if (sec === 'asset') renderDtAsset(); else renderDtLiab();
    go();
  }
  function delDT(sec, id) {
    if (sec === 'asset') data.dtAsset = data.dtAsset.filter(x => x.id !== id);
    else                 data.dtLiab  = data.dtLiab.filter(x => x.id !== id);
    if (sec === 'asset') renderDtAsset(); else renderDtLiab();
    go();
  }

  function updOther(id, f, val) {
    const r = data.dtOther.find(x => x.id === id);
    if (r) r[f] = f === 'amt' ? val : val;
  }
  function addOther() {
    data.dtOther.push({ id: uid(), label: 'New item', amt: '', type: 'dta', note: '' });
    renderDtOther(); go();
  }
  function delOther(id) {
    data.dtOther = data.dtOther.filter(x => x.id !== id);
    renderDtOther(); go();
  }

  /* DEBOUNCED COMPUTE */
  let _t = null;
  function go() {
    clearTimeout(_t);
    _t = setTimeout(() => Compute.run(data), 90);
  }

  return {
    data, initDefaults, renderAll,
    renderCT, renderDtAsset, renderDtLiab, renderDtOther,
    updCT, addCT, delCT,
    updDT, addDT, delDT,
    updOther, addOther, delOther,
    go
  };
})();
