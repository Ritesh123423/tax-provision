'use strict';

/**
 * RENDER.JS — HTML builders.
 *
 * Pure functions: result object in, HTML string out. No event wiring here;
 * every control carries a `data-bind` path or a `data-act` verb and the
 * controller listens once at the top of the tree. That keeps the markup free
 * of inline handlers and means a label containing a quote or an angle bracket
 * can never break a row.
 */

const Render = (() => {

  const e = U.esc;
  const f = U.fmt;
  const fb = U.fmtBr;
  const fp = U.fmtPct;

  /** A figure cell that colours by accounting sign. */
  function sign(v, opts = {}) {
    const n = U.toNum(v);
    if (Math.abs(n) < 0.5) return '<span class="txt-mute">—</span>';
    const cls = opts.invert ? (n > 0 ? 'txt-dtl' : 'txt-dta') : (n > 0 ? 'txt-dta' : 'txt-dtl');
    return `<span class="${cls}">${fb(n)}</span>`;
  }

  const pill = (nature) =>
    nature === 'DTA' ? '<span class="pill pill-dta">DTA</span>'
    : nature === 'DTL' ? '<span class="pill pill-dtl">DTL</span>'
    : '<span class="pill pill-none">—</span>';

  /* ==========================================================
     CURRENT TAX
     ========================================================== */

  function ctRows(eng, editable) {
    const rows = eng.ct.rows || [];
    if (!rows.length) return `<tr class="empty-row"><td colspan="6">No lines yet. Add the first adjustment below.</td></tr>`;

    return rows.map((r, i) => {
      const p = `ct.rows.${r.id}`;
      const dis = editable ? '' : 'disabled';

      const typeCell = r.locked
        ? '<span class="pill pill-book">Book</span>'
        : `<select class="ti" data-bind="${p}.type" ${dis} aria-label="Type for line ${i + 1}">
             <option value="add" ${r.type === 'add' ? 'selected' : ''}>Add</option>
             <option value="less" ${r.type === 'less' ? 'selected' : ''}>Less</option>
           </select>`;

      const natureCell = r.locked
        ? '<span class="txt-mute">—</span>'
        : `<select class="ti" data-bind="${p}.nature" ${dis} aria-label="Nature for line ${i + 1}">
             <option value="perm" ${r.nature === 'perm' ? 'selected' : ''}>Permanent</option>
             <option value="temp" ${r.nature !== 'perm' ? 'selected' : ''}>Temporary</option>
           </select>`;

      return `<tr>
        <td class="rn">${i + 1}</td>
        <td>${typeCell}</td>
        <td>${natureCell}</td>
        <td><input class="ti" data-bind="${p}.label" value="${e(r.label)}" ${dis}
              aria-label="Particulars for line ${i + 1}" ${r.locked ? 'style="font-weight:600"' : ''}></td>
        <td><input class="ti num" type="number" step="1" data-bind="${p}.amt" value="${e(r.amt)}"
              placeholder="0" ${dis} aria-label="Amount for line ${i + 1}"></td>
        <td class="c">${r.locked || !editable ? '' :
          `<button class="row-del" data-act="del-ct" data-id="${e(r.id)}" aria-label="Remove line ${i + 1}">✕</button>`}</td>
      </tr>`;
    }).join('');
  }

  /** The MAT comparison, shown only when the test is switched on. */
  function matBlock(ct) {
    if (!ct.matRate || !ct.matTax) return '';
    return `<table class="wt">
      <caption class="sr-only">Minimum alternate tax comparison</caption>
      <thead class="sr-only"><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
      <tbody>
      <tr><td>Book profit u/s 115JB</td><td class="r">${f(ct.matBase)}</td></tr>
      <tr><td>Minimum alternate tax at ${ct.matRate.toFixed(3)}%</td><td class="r">${f(ct.matTax)}</td></tr>
      <tr class="row-sub">
        <td>${ct.matApplies
          ? 'MAT exceeds tax under the normal provisions — MAT applies'
          : 'Tax under the normal provisions is higher — MAT does not apply'}</td>
        <td class="r">${ct.matApplies ? '<span class="badge badge-flag">MAT year</span>' : '<span class="badge badge-dta">Normal</span>'}</td>
      </tr>
      ${ct.matCreditCreated > 0 ? `<tr><td class="txt-mute" style="padding-left:28px">Credit entitlement arising u/s 115JAA</td><td class="r txt-dta">${f(ct.matCreditCreated)}</td></tr>` : ''}
    </tbody></table>`;
  }

  /* ==========================================================
     DEFERRED TAX SCHEDULE
     ========================================================== */

  function bsRows(rows, group, editable, showOpen) {
    if (!rows.length) {
      return `<tr class="empty-row"><td colspan="11">No lines yet.</td></tr>`;
    }
    const openCls = showOpen ? '' : ' hide';

    return rows.map((r, i) => {
      const p = `dt.${group}.${r.id}`;
      const dis = editable ? '' : 'disabled';
      const dimmed = r.recognised ? '' : ' style="opacity:.55"';

      return `<tr${dimmed}>
        <td class="rn">${i + 1}</td>
        <td>
          <input class="ti" data-bind="${p}.label" value="${e(r.label)}" ${dis}
            style="font-weight:500" aria-label="Particulars for line ${i + 1}">
          ${r.note ? `<div class="ti-note">${e(r.note)}</div>` : ''}
        </td>
        <td><input class="ti num" type="number" step="1" data-bind="${p}.ca" value="${e(r.ca)}" placeholder="0" ${dis} aria-label="Carrying amount"></td>
        <td><input class="ti num" type="number" step="1" data-bind="${p}.tb" value="${e(r.tb)}" placeholder="0" ${dis} aria-label="Tax base"></td>
        <td class="r">${Math.abs(r.td) < 0.5 ? '<span class="txt-mute">—</span>' : fb(r.td)}</td>
        <td class="c">${pill(r.nature)}</td>
        <td class="dt-open-col${openCls}"><input class="ti num" type="number" step="1" data-bind="${p}.open" value="${e(r.open)}" placeholder="0" ${dis} aria-label="Opening tax effect"></td>
        <td class="r"><strong>${sign(r.signedClose)}</strong></td>
        <td class="c">
          <select class="ti" data-bind="${p}.alloc" ${dis} aria-label="Route to profit or loss or OCI">
            <option value="pl" ${r.alloc === 'pl' ? 'selected' : ''}>P&amp;L</option>
            <option value="oci" ${r.alloc === 'oci' ? 'selected' : ''}>OCI</option>
          </select>
        </td>
        <td class="c">
          <label class="chk" style="justify-content:center">
            <input type="checkbox" data-bind="${p}.recognised" ${r.recognised ? 'checked' : ''} ${dis}
              aria-label="Recognise this deferred tax">
          </label>
        </td>
        <td class="c">${editable ? `<button class="row-del" data-act="del-dt" data-group="${group}" data-id="${e(r.id)}" aria-label="Remove line ${i + 1}">✕</button>` : ''}</td>
      </tr>`;
    }).join('');
  }

  function otherRows(rows, editable, showOpen) {
    if (!rows.length) return `<tr class="empty-row"><td colspan="10">No losses or credits recorded.</td></tr>`;
    const openCls = showOpen ? '' : ' hide';

    return rows.map((r, i) => {
      const p = `dt.others.${r.id}`;
      const dis = editable ? '' : 'disabled';
      const dimmed = r.recognised ? '' : ' style="opacity:.55"';

      return `<tr${dimmed}>
        <td class="rn">${i + 1}</td>
        <td>
          <input class="ti" data-bind="${p}.label" value="${e(r.label)}" ${dis} style="font-weight:500" aria-label="Particulars">
          ${r.note ? `<div class="ti-note">${e(r.note)}</div>` : ''}
        </td>
        <td><input class="ti num" type="number" step="1" data-bind="${p}.amt" value="${e(r.amt)}" placeholder="0" ${dis} aria-label="Amount"></td>
        <td class="c">
          <select class="ti" data-bind="${p}.side" ${dis} aria-label="Asset or liability">
            <option value="dta" ${r.side !== 'dtl' ? 'selected' : ''}>DTA</option>
            <option value="dtl" ${r.side === 'dtl' ? 'selected' : ''}>DTL</option>
          </select>
        </td>
        <td class="c">
          <label class="chk" style="justify-content:center">
            <input type="checkbox" data-bind="${p}.isTaxAmount" ${r.isTaxAmount ? 'checked' : ''} ${dis}
              aria-label="Amount is already a tax amount">
          </label>
        </td>
        <td class="dt-open-col${openCls}"><input class="ti num" type="number" step="1" data-bind="${p}.open" value="${e(r.open)}" placeholder="0" ${dis} aria-label="Opening tax effect"></td>
        <td class="r"><strong>${sign(r.signedClose)}</strong></td>
        <td class="c">
          <label class="chk" style="justify-content:center">
            <input type="checkbox" data-bind="${p}.recognised" ${r.recognised ? 'checked' : ''} ${dis} aria-label="Recognise">
          </label>
        </td>
        <td><input class="ti" data-bind="${p}.expiry" value="${e(r.expiry || '')}" placeholder="e.g. AY 2032-33" ${dis} aria-label="Expiry"></td>
        <td class="c">${editable ? `<button class="row-del" data-act="del-dt" data-group="others" data-id="${e(r.id)}" aria-label="Remove line ${i + 1}">✕</button>` : ''}</td>
      </tr>`;
    }).join('');
  }

  const bsFoot = (secTotals, cols) => `
    <tr class="row-sub">
      <td colspan="${cols}">Subtotal — deferred tax asset</td>
      <td class="r txt-dta">${f(secTotals.dta)}</td><td colspan="3"></td>
    </tr>
    <tr class="row-sub">
      <td colspan="${cols}">Subtotal — deferred tax liability</td>
      <td class="r txt-dtl">${f(secTotals.dtl)}</td><td colspan="3"></td>
    </tr>`;

  const otherFoot = (sec) => `
    <tr class="row-sub"><td colspan="6">Subtotal — deferred tax asset</td><td class="r txt-dta">${f(sec.dta)}</td><td colspan="3"></td></tr>
    <tr class="row-sub"><td colspan="6">Subtotal — deferred tax liability</td><td class="r txt-dtl">${f(sec.dtl)}</td><td colspan="3"></td></tr>`;

  function dtSummary(r) {
    const { dt } = r;
    return `<table class="wt">
      <thead><tr><th>Source</th><th class="r" style="width:180px">Deferred tax asset</th><th class="r" style="width:180px">Deferred tax liability</th></tr></thead>
      <tbody>
        <tr><td>A · Assets</td><td class="r">${f(dt.secA.dta)}</td><td class="r">${f(dt.secA.dtl)}</td></tr>
        <tr><td>B · Liabilities and provisions</td><td class="r">${f(dt.secL.dta)}</td><td class="r">${f(dt.secL.dtl)}</td></tr>
        <tr><td>C · Losses and credits</td><td class="r">${f(dt.secO.dta)}</td><td class="r">${f(dt.secO.dtl)}</td></tr>
        <tr class="row-sub"><td>Gross deferred tax</td><td class="r">${f(dt.grossDTA)}</td><td class="r">${f(dt.grossDTL)}</td></tr>
      </tbody>
      <tfoot>
        <tr class="row-total">
          <td>${dt.offset ? 'Net position after offset — Ind AS 12.74' : 'Presented gross — no enforceable right to offset'}</td>
          <td class="r">${dt.bsDTA > 0.5 ? f(dt.bsDTA) : '—'}</td>
          <td class="r">${dt.bsDTL > 0.5 ? f(dt.bsDTL) : '—'}</td>
        </tr>
      </tfoot>
    </table>`;
  }

  /** Unrecognised assets need their own disclosure under Ind AS 12.81(e). */
  function unrecognised(r) {
    const rows = r.dt.unrecognisedRows;
    if (!rows.length) return '';
    return `<div class="card">
      <div class="card-hdr">
        <div class="card-title">Deferred tax assets not recognised<span class="card-sub">Ind AS 12.81(e) — disclose the amount and any expiry date</span></div>
        <span class="badge badge-flag">Disclosure required</span>
      </div>
      <div class="card-body-flush"><table class="wt">
        <thead><tr><th>Particulars</th><th style="width:170px">Expiry</th><th class="r" style="width:150px">Opening</th><th class="r" style="width:150px">Closing</th></tr></thead>
        <tbody>${rows.map(x => `<tr>
          <td>${e(x.label)}</td>
          <td class="txt-mute">${e(x.expiry || '—')}</td>
          <td class="r">${fb(x.openUnrec)}</td>
          <td class="r">${fb(x.unrecognisedDta)}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr class="row-sub">
          <td colspan="2">Total unrecognised</td>
          <td class="r">${f(r.dt.unrecognisedOpening)}</td>
          <td class="r">${f(r.dt.unrecognisedDTA)}</td>
        </tr></tfoot>
      </table></div>
    </div>`;
  }

  /* ==========================================================
     MOVEMENT SCHEDULE
     ========================================================== */

  function movement(r) {
    const { dt, eng } = r;
    const lineRows = dt.all
      .filter(x => Math.abs(x.signedOpen) > 0.5 || Math.abs(x.signedClose) > 0.5)
      .map(x => `<tr>
        <td>${e(x.label)}</td>
        <td class="r">${sign(x.signedOpen)}</td>
        <td class="r">${x.alloc === 'pl' ? sign(x.movement) : '<span class="txt-mute">—</span>'}</td>
        <td class="r">${x.alloc === 'oci' ? sign(x.movement) : '<span class="txt-mute">—</span>'}</td>
        <td class="r"><strong>${sign(x.signedClose)}</strong></td>
      </tr>`).join('');

    const artic = dt.openingRows + dt.movementTotal;
    const articOk = Math.abs(artic - dt.closingNet) < 1;

    return `
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Deferred tax — line by line<span class="card-sub">Net position: an asset is positive, a liability negative</span></div>
        <span class="wpref">WP-4/A</span>
      </div>
      <div class="card-body-flush"><div class="tbl-scroll"><table class="wt">
        <thead><tr>
          <th>Particulars</th>
          <th class="r" style="width:150px">Opening</th>
          <th class="r" style="width:150px">Through P&amp;L</th>
          <th class="r" style="width:150px">Through OCI</th>
          <th class="r" style="width:150px">Closing</th>
        </tr></thead>
        <tbody>${lineRows || '<tr class="empty-row"><td colspan="5">No deferred tax recognised yet.</td></tr>'}</tbody>
        <tfoot>
          <tr class="row-sub">
            <td>Per the schedule</td>
            <td class="r">${sign(dt.openingRows)}</td>
            <td class="r">${sign(dt.movementPL)}</td>
            <td class="r">${sign(dt.movementOCI)}</td>
            <td class="r">${sign(dt.closingNet)}</td>
          </tr>
          <tr class="row-quiet">
            <td>Per prior year financial statements</td>
            <td class="r">${sign(dt.openingFS)}</td>
            <td colspan="3" class="r ${Math.abs(dt.openingDiff) < 1 ? 'txt-dta' : 'txt-dtl'}">
              ${Math.abs(dt.openingDiff) < 1 ? 'Agrees' : 'Difference of ' + f(Math.abs(dt.openingDiff))}
            </td>
            <td></td>
          </tr>
          <tr class="row-total">
            <td>${articOk ? 'Opening plus movement equals closing' : 'Schedule does not articulate'}</td>
            <td class="r" colspan="4">${f(artic)} ${articOk ? '✓' : '≠ ' + f(dt.closingNet)}</td>
          </tr>
        </tfoot>
      </table></div></div>
    </div>

    <div class="two-col">
      <div class="card">
        <div class="card-hdr"><div class="card-title">Balance sheet presentation</div><span class="wpref">WP-4/B</span></div>
        <div class="card-body-flush"><table class="wt"><tbody>
          <tr><td>Gross deferred tax asset</td><td class="r">${f(dt.grossDTA)}</td></tr>
          <tr><td>Gross deferred tax liability</td><td class="r">${f(dt.grossDTL)}</td></tr>
          <tr class="row-sub"><td>Net position</td><td class="r">${sign(dt.closingNet)}</td></tr>
          <tr class="row-quiet"><td colspan="2" style="font-size:var(--fs-xs)">${dt.offset
            ? 'Offset applied. Ind AS 12.74 permits this only where a legally enforceable right exists and the balances relate to the same taxing authority.'
            : 'Presented gross. Confirm no enforceable right of set-off exists.'}</td></tr>
        </tbody><tfoot>
          <tr class="row-total"><td>To the balance sheet — non-current</td>
            <td class="r">${dt.bsDTA > 0.5 ? 'DTA ' + f(dt.bsDTA) : dt.bsDTL > 0.5 ? 'DTL ' + f(dt.bsDTL) : '—'}</td></tr>
        </tfoot></table></div>
      </div>

      <div class="card">
        <div class="card-hdr"><div class="card-title">MAT credit entitlement<span class="card-sub">Section 115JAA</span></div><span class="wpref">WP-4/C</span></div>
        <div class="card-body-flush"><table class="wt"><tbody>
          <tr><td>Opening entitlement</td><td class="r">${f(dt.matOpening)}</td></tr>
          <tr><td>Add: recognised in the year</td><td class="r txt-dta">${dt.matCreated > 0.5 ? f(dt.matCreated) : '—'}</td></tr>
          <tr><td>Less: utilised in the year</td><td class="r txt-dtl">${dt.matUtilised > 0.5 ? '(' + f(dt.matUtilised) + ')' : '—'}</td></tr>
        </tbody><tfoot>
          <tr class="row-total"><td>Closing entitlement</td><td class="r">${f(dt.matClosing)}</td></tr>
        </tfoot></table>
        ${dt.matClosing > 0.5 ? `<div class="notice notice-info" style="margin:14px;margin-bottom:14px">
          <span class="notice-tag">Note</span>
          <span>Recognise only to the extent utilisation within the carry-forward window is probable. Keep the supporting profit projection on file.</span>
        </div>` : ''}
        </div>
      </div>
    </div>`;
  }

  /* ==========================================================
     SUMMARY & JOURNALS
     ========================================================== */

  function kpis(r) {
    const { ct, dt, te } = r;
    const dtIsCharge = te.deferred >= 0;
    return `
      <div class="kpi k-indigo">
        <div class="kpi-lbl">Current tax</div>
        <div class="kpi-val">${f(te.current)}</div>
        <div class="kpi-sub">${ct.matApplies ? 'MAT basis u/s 115JB' : 'Normal provisions'}</div>
      </div>
      <div class="kpi ${dtIsCharge ? 'k-dtl' : 'k-dta'}">
        <div class="kpi-lbl">Deferred tax</div>
        <div class="kpi-val">${f(Math.abs(te.deferred))}</div>
        <div class="kpi-sub">${Math.abs(te.deferred) < 0.5 ? 'No movement' : dtIsCharge ? 'Charge to profit or loss' : 'Credit to profit or loss'}</div>
      </div>
      <div class="kpi k-flag">
        <div class="kpi-lbl">Total tax expense</div>
        <div class="kpi-val">${f(te.total)}</div>
        <div class="kpi-sub">Line in the statement of profit and loss</div>
      </div>
      <div class="kpi ${r.etr.residualMaterial ? 'k-dtl' : 'k-indigo'}">
        <div class="kpi-lbl">Effective rate</div>
        <div class="kpi-val">${fp(te.etr)}</div>
        <div class="kpi-sub">${Number.isFinite(te.etr)
          ? `Statutory ${r.eng.rate.toFixed(3)}% · ${te.etr >= r.eng.rate ? '+' : ''}${(te.etr - r.eng.rate).toFixed(2)} pts`
          : 'Enter profit before tax'}</div>
      </div>`;
  }

  function summary(r) {
    const { ct, dt, te } = r;
    return `
    <div class="card">
      <div class="card-hdr"><div class="card-title">Tax expense for the year</div><span class="wpref">WP-5/A</span></div>
      <div class="card-body-flush"><table class="wt">
        <thead><tr><th>Particulars</th><th class="r" style="width:220px">Amount</th></tr></thead>
        <tbody>
          <tr><td>Current tax on profits for the year</td><td class="r">${f(ct.taxForYear)}</td></tr>
          ${Math.abs(ct.priorYearAdj) > 0.5 ? `<tr><td>Tax relating to earlier years</td><td class="r">${fb(ct.priorYearAdj)}</td></tr>` : ''}
          ${dt.matCreated > 0.5 ? `<tr><td>MAT credit entitlement recognised</td><td class="r txt-dta">(${f(dt.matCreated)})</td></tr>` : ''}
          ${dt.matUtilised > 0.5 ? `<tr><td>MAT credit entitlement utilised</td><td class="r">${f(dt.matUtilised)}</td></tr>` : ''}
          <tr class="row-sub"><td>Current tax expense</td><td class="r">${fb(te.current + te.matEffect)}</td></tr>
          <tr><td>Origination and reversal of temporary differences</td><td class="r">${fb(te.deferred)}</td></tr>
          <tr class="row-sub"><td>Deferred tax expense / (credit)</td><td class="r">${fb(te.deferred)}</td></tr>
        </tbody>
        <tfoot>
          <tr class="row-total"><td>Tax expense in the statement of profit and loss</td><td class="r">${fb(te.total)}</td></tr>
        </tfoot>
      </table></div>
    </div>

    ${Math.abs(te.ociTax) > 0.5 ? `
    <div class="card">
      <div class="card-hdr"><div class="card-title">Tax in other comprehensive income<span class="card-sub">Ind AS 12.61A</span></div><span class="wpref">WP-5/B</span></div>
      <div class="card-body-flush"><table class="wt"><tbody>
        <tr><td>Deferred tax on items routed through other comprehensive income</td><td class="r">${fb(te.ociTax)}</td></tr>
      </tbody></table></div>
    </div>` : ''}

    <div class="two-col">
      <div class="card">
        <div class="card-hdr"><div class="card-title">To the balance sheet</div></div>
        <div class="card-body-flush"><table class="wt"><tbody>
          <tr><td>Deferred tax asset — non-current</td><td class="r txt-dta">${dt.bsDTA > 0.5 ? f(dt.bsDTA) : '—'}</td></tr>
          <tr><td>Deferred tax liability — non-current</td><td class="r txt-dtl">${dt.bsDTL > 0.5 ? f(dt.bsDTL) : '—'}</td></tr>
          <tr><td>MAT credit entitlement — non-current</td><td class="r">${dt.matClosing > 0.5 ? f(dt.matClosing) : '—'}</td></tr>
          <tr><td>${ct.isRefund ? 'Income tax refund receivable' : 'Provision for tax, net of advance tax'}</td>
              <td class="r">${f(Math.abs(ct.netPayable))}</td></tr>
        </tbody></table></div>
      </div>
      <div class="card">
        <div class="card-hdr"><div class="card-title">Basis applied</div></div>
        <div class="card-body-flush"><table class="wt"><tbody>
          <tr><td>Measurement rate</td><td class="r">${r.eng.rate.toFixed(3)}%</td></tr>
          <tr><td>Approach</td><td class="r">${r.eng.standard === 'as22' ? 'AS 22 timing difference' : 'Ind AS 12 balance sheet'}</td></tr>
          <tr><td>Presentation</td><td class="r">${dt.offset ? 'Offset' : 'Gross'}</td></tr>
          <tr><td>Discounting</td><td class="r">Not applied — Ind AS 12.53</td></tr>
        </tbody></table></div>
      </div>
    </div>`;
  }

  function journals(jes) {
    if (!jes.length) {
      return `<div class="card"><div class="card-body">
        <p class="txt-mute">No entries to post yet. Enter profit before tax and the deferred tax schedule to generate them.</p>
      </div></div>`;
    }
    return jes.map(j => `
      <div class="je">
        <div class="je-hdr">
          <div class="row" style="gap:9px">
            <span class="je-ref">${e(j.ref)}</span>
            <span class="je-title">${e(j.title)}</span>
          </div>
          <div class="row" style="gap:10px">
            <span class="je-std">${e(j.standard)}</span>
            <span class="je-std">${e(j.date)}</span>
          </div>
        </div>
        <table>
          <thead><tr><th style="width:34px"></th><th>Account</th><th class="r" style="width:150px">Debit</th><th class="r" style="width:150px">Credit</th></tr></thead>
          <tbody>
            ${j.lines.map(l => `<tr class="${l.side === 'Cr' ? 'je-cr' : ''}">
              <td class="je-side ${l.side.toLowerCase()}">${l.side}</td>
              <td>${e(l.account)}</td>
              <td class="r">${l.side === 'Dr' ? f(l.amount) : ''}</td>
              <td class="r">${l.side === 'Cr' ? f(l.amount) : ''}</td>
            </tr>`).join('')}
            <tr class="je-cast">
              <td></td>
              <td>${j.balanced ? 'Cast and cross-cast' : 'Entry does not cast'}</td>
              <td class="r">${f(j.dr)}</td>
              <td class="r">${f(j.cr)}</td>
            </tr>
          </tbody>
        </table>
        <div class="je-narr">(${e(j.narration)})</div>
      </div>`).join('');
  }

  /** Plain-text journals, for pasting into a working paper or an email. */
  function journalsText(jes, eng) {
    const pad = (s, n) => String(s).padEnd(n).slice(0, n);
    const out = [`${eng.name || 'Client'} — ${eng.fy}`, 'Journal entries — income taxes', ''];
    jes.forEach(j => {
      out.push(`${j.ref}  ${j.title}   [${j.standard}]   ${j.date}`);
      out.push('-'.repeat(72));
      j.lines.forEach(l => {
        out.push(`  ${l.side}  ${pad(l.account, 48)} ${l.side === 'Dr' ? U.fmt(l.amount).padStart(16) : ''.padStart(16)}${l.side === 'Cr' ? U.fmt(l.amount).padStart(16) : ''}`);
      });
      out.push(`  ${''.padEnd(52)} ${U.fmt(j.dr).padStart(16)}${U.fmt(j.cr).padStart(16)}`);
      out.push(`  (${j.narration})`, '');
    });
    return out.join('\n');
  }

  /* ==========================================================
     ETR RECONCILIATION
     ========================================================== */

  function etr(r) {
    const { ct, etr: rec, te } = r;
    if (Math.abs(ct.bookProfit) < 0.5) {
      return `<div class="card"><div class="card-body">
        <p class="txt-mute">Enter profit before tax in step 2 to build the reconciliation.</p>
      </div></div>`;
    }

    const rows = rec.rows.map(x => {
      const cls = x.base ? 'row-sub' : x.indent ? 'row-indent' : '';
      const flagged = (x.residual && rec.residualMaterial) || (x.diagnostic);
      return `<tr class="${cls}">
        <td>${e(x.label)}${flagged ? ' <span class="badge badge-flag">Review</span>' : ''}</td>
        <td class="r">${fb(x.amount)}</td>
        <td class="r">${Number.isFinite(x.pct) ? x.pct.toFixed(2) + '%' : '—'}</td>
      </tr>`;
    }).join('');

    return `
    <div class="card">
      <div class="card-hdr">
        <div class="card-title">Reconciliation of the effective rate<span class="card-sub">Ind AS 12.81(c)</span></div>
        <span class="wpref">WP-6/A</span>
      </div>
      <div class="card-body-flush"><table class="wt">
        <thead><tr><th>Particulars</th><th class="r" style="width:190px">Amount</th><th class="r" style="width:130px">Rate</th></tr></thead>
        <tbody>
          <tr><td>Profit before tax</td><td class="r">${fb(ct.bookProfit)}</td><td class="r">—</td></tr>
          ${rows}
        </tbody>
        <tfoot>
          <tr class="row-total"><td>Tax expense and effective rate</td><td class="r">${fb(te.total)}</td><td class="r">${fp(te.etr)}</td></tr>
        </tfoot>
      </table></div>
    </div>

    ${rec.tempGapMaterial ? `<div class="notice notice-err">
      <span class="notice-tag">Query</span>
      <div><strong>A temporary difference is missing from the deferred tax schedule.</strong>
      Lines tagged temporary in the current tax computation reduce current tax by
      ${f(Math.abs(rec.tempGap))} more than the deferred tax movement accounts for.
      Either the tag is wrong, or the difference has no line in step 3.</div>
    </div>` : ''}

    ${rec.residualMaterial ? `<div class="notice notice-warn">
      <span class="notice-tag">Query</span>
      <div>The residual of ${f(Math.abs(rec.residual))} exceeds the tolerance of
      ${f(rec.tolerance)}, which is half a percent of profit before tax. Identify what
      it represents before the note goes to the client.</div>
    </div>` : `<div class="notice notice-ok">
      <span class="notice-tag">Tallied</span>
      <span>The reconciliation is explained within tolerance. The residual is ${f(Math.abs(rec.residual))}.</span>
    </div>`}`;
  }

  /* ==========================================================
     DISCLOSURE NOTE
     ========================================================== */

  function disclosure(r) {
    const { eng, ct, dt, te } = r;
    const client = eng.name || 'The Company';
    const date = U.fmtDateLong(eng.bsDate);
    const rate = eng.rate.toFixed(3);

    const tdRows = dt.all
      .filter(x => Math.abs(x.signedClose) > 0.5 || Math.abs(x.signedOpen) > 0.5)
      .map(x => `<tr class="d-in"><td>${e(x.label)}</td><td class="r">${fb(x.signedOpen)}</td><td class="r">${fb(x.movement)}</td><td class="r">${fb(x.signedClose)}</td></tr>`)
      .join('');

    return `<div class="disc" id="disc-text">
      <h4>Note — Income taxes</h4>

      <p><strong>(a) Tax expense recognised in the statement of profit and loss</strong></p>
      <table>
        <thead><tr><th>Particulars</th><th class="r">Year ended ${e(date)}</th></tr></thead>
        <tbody>
          <tr class="d-sub"><td>Current tax</td><td class="r"></td></tr>
          <tr class="d-in"><td>Current tax on profit for the year</td><td class="r">${f(ct.taxForYear)}</td></tr>
          ${Math.abs(ct.priorYearAdj) > 0.5 ? `<tr class="d-in"><td>Adjustments in respect of earlier years</td><td class="r">${fb(ct.priorYearAdj)}</td></tr>` : ''}
          ${dt.matCreated > 0.5 ? `<tr class="d-in"><td>MAT credit entitlement recognised</td><td class="r">(${f(dt.matCreated)})</td></tr>` : ''}
          ${dt.matUtilised > 0.5 ? `<tr class="d-in"><td>MAT credit entitlement utilised</td><td class="r">${f(dt.matUtilised)}</td></tr>` : ''}
          <tr class="d-sub"><td>Total current tax</td><td class="r">${fb(te.current + te.matEffect)}</td></tr>
          <tr class="d-sub"><td>Deferred tax</td><td class="r"></td></tr>
          <tr class="d-in"><td>Origination and reversal of temporary differences</td><td class="r">${fb(te.deferred)}</td></tr>
          <tr class="d-sub"><td>Total deferred tax</td><td class="r">${fb(te.deferred)}</td></tr>
        </tbody>
        <tfoot><tr class="d-tot"><td>Tax expense for the year</td><td class="r">${fb(te.total)}</td></tr></tfoot>
      </table>

      ${Math.abs(te.ociTax) > 0.5 ? `
      <p><strong>(b) Tax recognised in other comprehensive income</strong></p>
      <table>
        <thead><tr><th>Particulars</th><th class="r">Amount</th></tr></thead>
        <tbody><tr><td>Deferred tax on items that will not be reclassified to profit or loss</td><td class="r">${fb(te.ociTax)}</td></tr></tbody>
      </table>` : ''}

      <p><strong>(${Math.abs(te.ociTax) > 0.5 ? 'c' : 'b'}) Reconciliation of the effective tax rate</strong></p>
      <table>
        <thead><tr><th>Particulars</th><th class="r">Amount</th><th class="r">Rate</th></tr></thead>
        <tbody>
          <tr><td>Profit before tax</td><td class="r">${fb(ct.bookProfit)}</td><td class="r">—</td></tr>
          ${r.etr.rows.filter(x => Math.abs(x.amount) > 0.5).map(x =>
            `<tr class="${x.base ? 'd-sub' : 'd-in'}"><td>${e(x.label)}</td><td class="r">${fb(x.amount)}</td><td class="r">${Number.isFinite(x.pct) ? x.pct.toFixed(2) + '%' : '—'}</td></tr>`
          ).join('')}
        </tbody>
        <tfoot><tr class="d-tot"><td>Tax expense and effective rate</td><td class="r">${fb(te.total)}</td><td class="r">${fp(te.etr)}</td></tr></tfoot>
      </table>

      <p><strong>(${Math.abs(te.ociTax) > 0.5 ? 'd' : 'c'}) Movement in deferred tax balances</strong></p>
      <table>
        <thead><tr><th>Particulars</th><th class="r">Opening</th><th class="r">Recognised in the year</th><th class="r">Closing</th></tr></thead>
        <tbody>${tdRows || '<tr><td colspan="4">No deferred tax balances.</td></tr>'}</tbody>
        <tfoot><tr class="d-tot"><td>Net deferred tax asset / (liability)</td><td class="r">${fb(dt.openingRows)}</td><td class="r">${fb(dt.movementTotal)}</td><td class="r">${fb(dt.closingNet)}</td></tr></tfoot>
      </table>

      <p>Deferred tax is measured at the tax rates that are expected to apply
      when the asset is realised or the liability is settled, based on the rates
      enacted or substantively enacted at ${e(date)}, being <strong>${rate}%</strong>
      inclusive of surcharge and health and education cess. Deferred tax assets
      and liabilities are not discounted.</p>

      ${dt.offset
        ? `<p>Deferred tax assets and liabilities have been offset, as ${e(client)} has a
           legally enforceable right to set off current tax assets against current tax
           liabilities and the balances relate to income taxes levied by the same
           taxation authority.</p>`
        : `<p>Deferred tax assets and liabilities have been presented gross, as no
           legally enforceable right of set-off exists.</p>`}

      ${dt.unrecognisedDTA > 0.5 ? `<p>Deferred tax assets of <strong>${f(dt.unrecognisedDTA)}</strong>
        in respect of ${e(dt.unrecognisedRows.map(x => x.label).join('; '))} have not been
        recognised, as it is not probable that future taxable profit will be available
        against which they can be utilised.</p>` : ''}

      ${dt.matClosing > 0.5 ? `<p>${e(client)} has recognised a MAT credit entitlement of
        <strong>${f(dt.matClosing)}</strong> under section 115JAA, which is available for
        set-off against future tax liabilities computed under the normal provisions
        within fifteen assessment years. Recognition is supported by projections of
        future taxable profit.</p>` : ''}

      ${ct.matApplies ? `<p>Tax for the year has been computed under section 115JB, as the
        tax payable on book profit exceeds the tax payable under the normal provisions
        of the Income Tax Act, 1961.</p>` : ''}
    </div>`;
  }

  /* ==========================================================
     CHECKLIST
     ========================================================== */

  function checklist(eng, editable, user) {
    const tpl = Store.checklistTemplate();
    if (!tpl.length) return '<div class="card-body"><p class="txt-mute">No checklist items configured. An administrator can add them.</p></div>';

    let html = '';
    let group = null;
    tpl.forEach(item => {
      if (item.group !== group) {
        group = item.group;
        html += `<div class="chk-group">${e(group)}</div>`;
      }
      const mark = eng.checklist?.[item.id] || {};
      const st = mark.state || '';
      const btn = (state, label) =>
        `<button data-act="chk" data-id="${e(item.id)}" data-state="${state}"
           aria-pressed="${st === state}" ${editable ? '' : 'disabled'}>${label}</button>`;

      html += `<div class="chk-row">
        <div>
          <div class="chk-text">${e(item.text)}</div>
          ${mark.by ? `<div class="chk-meta">${e(mark.by)} · ${U.fmtDateTime(mark.at)}${mark.state === 'query' ? ' · query raised' : ''}</div>` : ''}
        </div>
        <div class="chk-seg" role="group" aria-label="Mark: ${e(item.text)}">
          ${btn('done', 'Done')}${btn('na', 'N/A')}${btn('query', 'Query')}
        </div>
        <div class="chk-ref">${e(item.ref)}</div>
      </div>`;
    });
    return html;
  }

  function checklistSummary(eng) {
    const tpl = Store.checklistTemplate();
    const c = { done: 0, na: 0, query: 0, open: 0 };
    tpl.forEach(i => {
      const s = eng.checklist?.[i.id]?.state;
      if (s === 'done') c.done++; else if (s === 'na') c.na++; else if (s === 'query') c.query++; else c.open++;
    });
    const cleared = c.done + c.na;
    const kind = c.query ? 'notice-warn' : c.open ? 'notice-info' : 'notice-ok';
    const tag = c.query ? 'Queries' : c.open ? 'In progress' : 'Cleared';
    const msg = c.query
      ? `${c.query} quer${c.query === 1 ? 'y' : 'ies'} outstanding, ${c.open} point${c.open === 1 ? '' : 's'} not yet marked.`
      : c.open
        ? `${cleared} of ${tpl.length} points cleared. ${c.open} still to mark.`
        : `All ${tpl.length} points cleared. The workpaper is ready for sign-off.`;
    return `<div class="notice ${kind}"><span class="notice-tag">${tag}</span><span>${msg}</span></div>`;
  }

  function signoff(r, user) {
    const { eng } = r;
    const canSign = Auth.can('engagement.signoff', user);
    const blockers = [];
    if (r.validation.errors.length) blockers.push(`${r.validation.errors.length} validation error${r.validation.errors.length === 1 ? '' : 's'}`);
    if (r.tallies.queries) blockers.push(`${r.tallies.queries} tally quer${r.tallies.queries === 1 ? 'y' : 'ies'}`);
    const tpl = Store.checklistTemplate();
    const openPoints = tpl.filter(i => { const s = eng.checklist?.[i.id]?.state; return s !== 'done' && s !== 'na'; }).length;
    if (openPoints) blockers.push(`${openPoints} checklist point${openPoints === 1 ? '' : 's'} unmarked`);

    return `<div class="card">
      <div class="card-hdr">
        <div class="card-title">Status<span class="card-sub">Signing off locks the figures against further edits</span></div>
        <span class="badge ${eng.status === 'signed' ? 'badge-dta' : eng.status === 'review' ? 'badge-flag' : 'badge-neutral'}">
          ${eng.status === 'signed' ? 'Signed off' : eng.status === 'review' ? 'Under review' : 'Draft'}</span>
      </div>
      <div class="card-body">
        ${blockers.length
          ? `<div class="notice notice-warn"><span class="notice-tag">Open</span>
             <span>Before sign-off: ${e(blockers.join(', '))}.</span></div>`
          : `<div class="notice notice-ok"><span class="notice-tag">Clear</span>
             <span>Nothing outstanding. The workpaper casts and the checklist is complete.</span></div>`}
        <div class="row row-wrap" style="gap:8px">
          ${eng.status !== 'review' && eng.status !== 'signed' ? '<button class="btn btn-line" data-act="status" data-to="review">Send for review</button>' : ''}
          ${eng.status === 'review' ? '<button class="btn btn-line" data-act="status" data-to="draft">Return to draft</button>' : ''}
          ${eng.status !== 'signed'
            ? `<button class="btn btn-primary" data-act="status" data-to="signed" ${canSign ? '' : 'disabled title="Only a manager or administrator can sign off"'}>Sign off</button>`
            : `<button class="btn btn-line" data-act="status" data-to="draft" ${canSign ? '' : 'disabled'}>Reopen</button>`}
          <button class="btn btn-line" data-act="rollforward">Roll forward to next year</button>
        </div>
        ${eng.signedBy ? `<p class="hint mt-16">Signed off by ${e(eng.signedBy)} on ${U.fmtDateTime(eng.signedAt)}.</p>` : ''}
      </div>
    </div>`;
  }

  /* ==========================================================
     TALLY RAIL
     ========================================================== */

  const TICK_OK = '<svg viewBox="0 0 20 20" fill="none"><path d="M3.5 10.5l3.6 4.2L16.5 4.6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TICK_Q  = '<svg viewBox="0 0 20 20" fill="none"><path d="M10 3.2v9.1M10 15.6v.9" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const TICK_I  = '<svg viewBox="0 0 20 20" fill="none"><path d="M4.5 10h11" stroke-width="1.8" stroke-linecap="round"/></svg>';

  function rail(r) {
    const { tallies: t, validation: v, dt, te, ct } = r;
    const verdict = t.queries
      ? { cls: 'query', txt: `${t.queries} tally need${t.queries === 1 ? 's' : ''} attention` }
      : t.ok
        ? { cls: 'clean', txt: 'Everything casts' }
        : { cls: 'idle', txt: 'Nothing to cast yet' };

    const tick = s => `<span class="tick ${s}">${s === 'ok' ? TICK_OK : s === 'query' ? TICK_Q : TICK_I}</span>`;

    const items = t.items.map(x => `
      <button class="tally" data-act="goto" data-step="${e(x.section)}">
        ${tick(x.state)}
        <span>
          <span class="tally-lbl">${e(x.label)}</span>
          <span class="tally-detail">${e(x.detail)}</span>
        </span>
      </button>`).join('');

    const issues = v.items.length
      ? `<div class="rail-sub">Open points</div>` + v.items.map(x => `
          <button class="issue issue-${x.level}" data-act="goto" data-step="${e(x.section)}" data-field="${e(x.field || '')}">
            <span class="issue-tag">${x.level === 'error' ? 'FIX' : 'CHK'}</span>
            <span>${e(x.msg)}</span>
          </button>`).join('')
      : '';

    return `
      <div class="rail-verdict ${verdict.cls}">${tick(verdict.cls === 'clean' ? 'ok' : verdict.cls === 'query' ? 'query' : 'idle')}<span>${verdict.txt}</span></div>
      ${items}
      ${issues}
      <div class="rail-sub">Position</div>
      <div class="rail-fig"><span class="rail-fig-l">Profit before tax</span><span class="rail-fig-v">${fb(ct.bookProfit)}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">Taxable income</span><span class="rail-fig-v">${fb(ct.taxableIncome)}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">Current tax</span><span class="rail-fig-v">${f(te.current)}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">Deferred tax</span><span class="rail-fig-v">${fb(te.deferred)}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">Total tax expense</span><span class="rail-fig-v">${fb(te.total)}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">Effective rate</span><span class="rail-fig-v">${fp(te.etr)}</span></div>
      <div class="rail-sub">Balance sheet</div>
      <div class="rail-fig"><span class="rail-fig-l">Deferred tax asset</span><span class="rail-fig-v txt-dta">${dt.bsDTA > 0.5 ? f(dt.bsDTA) : '—'}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">Deferred tax liability</span><span class="rail-fig-v txt-dtl">${dt.bsDTL > 0.5 ? f(dt.bsDTL) : '—'}</span></div>
      <div class="rail-fig"><span class="rail-fig-l">MAT credit</span><span class="rail-fig-v">${dt.matClosing > 0.5 ? f(dt.matClosing) : '—'}</span></div>`;
  }

  /* ==========================================================
     ENGAGEMENT LIST
     ========================================================== */


  function buildTeamAvatars(eng) {
    const all = [eng.ownerId, ...(eng.teamMembers || []).map(m => m.userId)].filter(Boolean);
    const visible = all.slice(0, 4);
    const more = all.length - visible.length;
    const avatars = visible.map(uid => {
      const u = Store.userById(uid);
      const initials = u ? u.name.trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?';
      return `<span class="eng-avatar" title="${e(u?.name || uid)}">${initials}</span>`;
    }).join('');
    const moreEl = more > 0 ? `<span class="eng-avatar eng-avatar-more">+${more}</span>` : '';
    return avatars + moreEl;
  }

  function engList(list, canDeleteFn) {
    if (!list.length) {
      return `<div class="card"><div class="empty-state">
        <div class="empty-mark">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 3h9l5 5v11a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="var(--indigo-600)" stroke-width="1.5"/><path d="M13 3v5h5M6.5 12.5h9M6.5 15.5h6" stroke="var(--indigo-600)" stroke-width="1.5" stroke-linecap="round"/></svg>
        </div>
        <h2 class="h-sec">No engagements yet</h2>
        <p class="lede" style="margin:8px auto 18px">Create the first workpaper, or import a backup from another machine.</p>
        <button class="btn btn-primary" data-act="new-eng">New engagement</button>
      </div></div>`;
    }

    return `<div class="eng-grid">${list.map(item => {
      const { eng, res } = item;
      const badge = eng.status === 'signed' ? 'badge-dta' : eng.status === 'review' ? 'badge-flag' : 'badge-neutral';
      const label = eng.status === 'signed' ? 'Signed' : eng.status === 'review' ? 'Review' : 'Draft';
      const owner = Store.userById(eng.ownerId);
      return `<div class="eng-card" data-act="open-eng" data-id="${e(eng.id)}" role="button" tabindex="0">
        <div class="eng-card-top">
          <div style="min-width:0">
            <div class="eng-card-name">${e(eng.name || 'Untitled engagement')}</div>
            <div class="eng-card-fy">${e(eng.fy || '—')} · ${e(eng.cin || eng.pan || 'No CIN')}</div>
          </div>
          <div class="row" style="gap:5px">
            <span class="badge ${badge}">${label}</span>
            ${eng.locked ? '<span class="badge badge-dtl">Locked</span>' : ''}
          </div>
        </div>
        <div class="row row-wrap" style="gap:6px">
          ${res.tallies.queries
            ? `<span class="badge badge-flag">${res.tallies.queries} quer${res.tallies.queries === 1 ? 'y' : 'ies'}</span>`
            : '<span class="badge badge-dta">Casts</span>'}
          <span class="badge badge-neutral">${res.progress.pct}% complete</span>
        </div>
        <div class="eng-card-figs">
          <div><div class="eng-card-fig-l">Tax expense</div><div class="eng-card-fig-v">${fb(res.te.total)}</div></div>
          <div><div class="eng-card-fig-l">Effective rate</div><div class="eng-card-fig-v">${fp(res.te.etr)}</div></div>
        </div>
        <div class="eng-progress-bar"><div class="eng-progress-fill" style="width:${res.progress.pct}%"></div></div>
        <div class="eng-team-avatars">
          <span class="eng-avatars">${buildTeamAvatars(eng)}<span class="hint" style="margin-left:8px">${e(owner?.name || 'Owner')} · ${U.relTime(eng.updatedAt)}</span></span>
          <span class="row" style="gap:4px">
            <button class="btn btn-quiet btn-sm" data-act="team-eng" data-id="${e(eng.id)}" title="Manage team">Team</button>
            <button class="btn btn-quiet btn-sm" data-act="dup-eng" data-id="${e(eng.id)}">Duplicate</button>
            ${canDeleteFn(eng) ? `<button class="btn btn-quiet btn-sm" data-act="del-eng" data-id="${e(eng.id)}" style="color:var(--dtl-text)">Delete</button>` : ''}
          </span>
        </div>
      </div>`;
    }).join('')}</div>`;
  }

  return {
    ctRows, matBlock, bsRows, otherRows, bsFoot, otherFoot, dtSummary, unrecognised,
    movement, kpis, summary, journals, journalsText, etr, disclosure,
    checklist, checklistSummary, signoff, rail, engList
  };
})();
