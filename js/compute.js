'use strict';
/* ═══════════════════════════════════════════════════
   COMPUTE.JS  —  Ind AS 12 Tax Provision Engine
   K G Somani & Co LLP
═══════════════════════════════════════════════════ */
const Compute = (() => {
  const $ = id => document.getElementById(id);
  const v  = id => parseFloat($(id)?.value) || 0;
  const pct= id => v(id) / 100;
  const set= (id,t) => { const e=$(id); if(e) e.textContent=t; };
  const htm= (id,h) => { const e=$(id); if(e) e.innerHTML=h; };

  /* ── FORMATTING ── */
  function fmt(n, dec=0){
    if(n===null||n===undefined||isNaN(n)) return '-';
    return new Intl.NumberFormat('en-IN',{maximumFractionDigits:dec,minimumFractionDigits:dec}).format(Math.round(n*Math.pow(10,dec))/Math.pow(10,dec));
  }
  function fmtSign(n){ if(!n||isNaN(n))return '-'; return (n<0?'(':'')+fmt(Math.abs(n))+(n<0?')':''); }
  function fmtPct(n){ if(isNaN(n)||!isFinite(n))return '-'; return n.toFixed(2)+'%'; }
  function fmtINR(n){ return '₹'+fmt(n); }

  /* ══════════════════════════════════════
     CURRENT TAX
  ══════════════════════════════════════ */
  function computeCT(state){
    const rate    = pct('ci-rate');
    const matRate = pct('ci-mat');
    const regime  = $('ci-regime')?.value||'new';
    let bookProfit=0, taxableIncome=0;

    state.ctRows.forEach(r=>{
      const a = parseFloat(r.amt)||0;
      if(r.type==='book'){ bookProfit=a; taxableIncome=a; }
      else if(r.type==='add')  taxableIncome+=a;
      else if(r.type==='less') taxableIncome-=a;
    });

    const isMAT   = regime==='mat';
    const effRate = isMAT ? matRate : rate;
    const taxBase = isMAT ? bookProfit : Math.max(0, taxableIncome);
    const grossTax= taxBase * effRate;
    const tds     = v('ct-tds');
    const matUtil = v('ct-matutil');
    const netCT   = Math.max(0, grossTax - tds - matUtil);

    /* update CT section display */
    set('ct-taxable-disp', fmtINR(taxableIncome));
    set('ct2-ti',   fmt(taxableIncome));
    set('ct2-rate', (effRate*100).toFixed(3)+'%');
    set('ct2-tax',  fmtINR(grossTax));
    set('ct2-net',  fmtINR(netCT));

    return { bookProfit, taxableIncome, grossTax, tds, matUtil, netCT, effRate, isMAT };
  }

  /* ══════════════════════════════════════
     DEFERRED TAX  (Ind AS 12 — Balance Sheet)
  ══════════════════════════════════════ */
  function computeDT(state){
    const rate = pct('ci-rate');
    let grossDTA=0, grossDTL=0;
    const assetRows=[], liabRows=[], otherRows=[];

    /* ASSETS: CA > TB → Taxable TD → DTL  |  CA < TB → Deductible TD → DTA */
    state.dtAsset.forEach(r=>{
      const ca=parseFloat(r.ca)||0, tb=parseFloat(r.tb)||0;
      const diff=ca-tb, te=Math.abs(diff)*rate;
      const nature = diff>0?'DTL':diff<0?'DTA':'';
      if(diff>0) grossDTL+=te; else if(diff<0) grossDTA+=te;
      assetRows.push({...r,diff,te,nature,dtaAmt:diff<0?te:0,dtlAmt:diff>0?te:0});
    });

    /* LIABILITIES: CA > TB → Deductible TD → DTA  |  CA < TB → Taxable TD → DTL */
    state.dtLiab.forEach(r=>{
      const ca=parseFloat(r.ca)||0, tb=parseFloat(r.tb)||0;
      const diff=ca-tb, te=Math.abs(diff)*rate;
      const nature = diff>0?'DTA':diff<0?'DTL':'';
      if(diff>0) grossDTA+=te; else if(diff<0) grossDTL+=te;
      liabRows.push({...r,diff,te,nature,dtaAmt:diff>0?te:0,dtlAmt:diff<0?te:0});
    });

    /* OTHER (losses, MAT credit etc.) */
    state.dtOther.forEach(r=>{
      const amt=parseFloat(r.amt)||0, te=amt*rate;
      if(r.type==='dta') grossDTA+=te; else grossDTL+=te;
      otherRows.push({...r,te,dtaAmt:r.type==='dta'?te:0,dtlAmt:r.type==='dtl'?te:0});
    });

    /* P&L movement */
    const obDTA=v('ob-dta'), obDTL=v('ob-dtl');
    const openingNet = obDTA - obDTL;
    const closingNet = grossDTA - grossDTL;
    const dtPLCharge = -(closingNet - openingNet); // +ve = charge, -ve = credit

    /* Closing BS balances */
    const matNew   = v('mv-mat-new');
    const closingDTA = grossDTA + matNew;
    const closingDTL = grossDTL;
    const closingMAT = v('ob-mat') + matNew - v('ct-matutil');

    /* update totals display */
    const aDTA=assetRows.reduce((s,r)=>s+r.dtaAmt,0), aDTL=assetRows.reduce((s,r)=>s+r.dtlAmt,0);
    const lDTA=liabRows.reduce((s,r)=>s+r.dtaAmt,0),  lDTL=liabRows.reduce((s,r)=>s+r.dtlAmt,0);
    const oDTA=otherRows.reduce((s,r)=>s+r.dtaAmt,0), oDTL=otherRows.reduce((s,r)=>s+r.dtlAmt,0);
    set('dt-a-dta',fmtINR(aDTA)); set('dt-a-dtl',fmtINR(aDTL));
    set('dt-l-dta',fmtINR(lDTA)); set('dt-l-dtl',fmtINR(lDTL));
    set('dt-o-dta',fmtINR(oDTA)); set('dt-o-dtl',fmtINR(oDTL));
    set('dt-tot-dta',fmtINR(grossDTA)); set('dt-tot-dtl',fmtINR(grossDTL));
    set('dt-pl',dtPLCharge>=0?fmtINR(dtPLCharge)+' (Charge)':fmtINR(Math.abs(dtPLCharge))+' (Credit)');

    /* movement schedule */
    set('mv-dta-open',fmtINR(obDTA)); set('mv-dta-cy',fmtINR(grossDTA));
    set('mv-dta-close',fmtINR(closingDTA));
    set('mv-dtl-open',fmtINR(v('ob-dtl'))); set('mv-dtl-cy',fmtINR(grossDTL));
    set('mv-dtl-close',fmtINR(closingDTL));
    set('mv-mat-open',fmtINR(v('ob-mat'))); set('mv-mat-new-disp',fmtINR(matNew));
    set('mv-mat-util-disp',fmtINR(v('ct-matutil'))); set('mv-mat-close',fmtINR(closingMAT));

    return { grossDTA, grossDTL, dtPLCharge, closingDTA, closingDTL, closingMAT,
             assetRows, liabRows, otherRows };
  }

  /* ══════════════════════════════════════
     MASTER RUN
  ══════════════════════════════════════ */
  function run(state){
    if(!state) return null;
    const ct = computeCT(state);
    const dt = computeDT(state);
    const total   = ct.grossTax + dt.dtPLCharge;
    const etr     = ct.bookProfit ? (total/ct.bookProfit*100) : 0;
    const statRate= v('ci-rate');

    /* KPI cards */
    set('kpi-ct',    fmtINR(ct.grossTax));
    set('kpi-dt',    (dt.dtPLCharge>=0?'':'(')+fmtINR(Math.abs(dt.dtPLCharge))+(dt.dtPLCharge<0?')':''));
    set('kpi-total', fmtINR(total));
    set('kpi-etr',   fmtPct(etr));
    set('kpi-dta',   fmtINR(dt.closingDTA));
    set('kpi-dtl',   fmtINR(dt.closingDTL));
    const dtCard=$('kpi-dt-card');
    if(dtCard) dtCard.className='kpi '+(dt.dtPLCharge>=0?'red':'green');
    set('kpi-dt-sub', dt.dtPLCharge>=0?'Charge to P&L':'Credit to P&L');
    const etrv=$('kpi-etr-var');
    if(etrv){ const ev=etr-statRate; etrv.textContent=(ev>=0?'+':'')+fmtPct(ev)+' vs statutory '+(statRate.toFixed(3))+'%'; }

    buildJEs(ct, dt);
    buildDisclosure(ct, dt, total, etr, statRate);
    buildChecklist(ct, dt, total, etr, state);
    buildETR(ct, dt, etr, statRate);
    updateProgress(state);

    return { ct, dt, total, etr };
  }

  /* ══════════════════════════════════════
     JOURNAL ENTRIES
  ══════════════════════════════════════ */
  function buildJEs(ct, dt){
    const fy   = $('ci-fy')?.value||'FY ____';
    const dt_  = $('ci-date')?.value ? new Date($('ci-date').value).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : '31st March ____';
    const rate = v('ci-rate');

    htm('je-ct',`
      <div class="je-hd">JOURNAL ENTRY 1 — CURRENT TAX PROVISION &nbsp;|&nbsp; ${fy}</div>
      <div class="je-date">Date: ${dt_}</div><br>
      <div class="je-dr">Dr &nbsp;&nbsp; Income Tax Expense — Current &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.grossTax)}</span></div>
      ${ct.tds>0?`<div class="je-cr">Cr &nbsp;&nbsp; Advance Tax / TDS Receivable &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.tds)}</span></div>`:''}
      ${ct.matUtil>0?`<div class="je-cr">Cr &nbsp;&nbsp; MAT Credit Entitlement (utilised) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.matUtil)}</span></div>`:''}
      <div class="je-cr">Cr &nbsp;&nbsp; Provision for Current Tax &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(ct.netCT)}</span></div>
      <div class="je-tot">Dr Total = ₹${fmt(ct.grossTax)} &nbsp;|&nbsp; Cr Total = ₹${fmt(ct.grossTax)} &nbsp;✓ Balanced</div>
      <div class="je-narr">(Being provision for current income tax for ${fy} @ ${rate.toFixed(3)}% on taxable income of ₹${fmt(ct.taxableIncome)} as per Income Tax Act, 1961)</div>
    `);

    const isDTAcredit = dt.dtPLCharge < 0;
    htm('je-dt',`
      <div class="je-hd">JOURNAL ENTRY 2 — DEFERRED TAX &nbsp;|&nbsp; ${fy} &nbsp;|&nbsp; Ind AS 12 — Balance Sheet Approach</div>
      <div class="je-date">Date: ${dt_}</div><br>
      ${isDTAcredit
        ?`<div class="je-dr">Dr &nbsp;&nbsp; Deferred Tax Asset &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(Math.abs(dt.dtPLCharge))}</span></div>
           <div class="je-cr">Cr &nbsp;&nbsp; Deferred Tax Income (P&amp;L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(Math.abs(dt.dtPLCharge))}</span></div>`
        :`<div class="je-dr">Dr &nbsp;&nbsp; Deferred Tax Expense (P&amp;L) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(dt.dtPLCharge)}</span></div>
           <div class="je-cr">Cr &nbsp;&nbsp; Deferred Tax Liability &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(dt.dtPLCharge)}</span></div>`
      }
      <div class="je-tot">Dr Total = ₹${fmt(Math.abs(dt.dtPLCharge))} &nbsp;|&nbsp; Cr Total = ₹${fmt(Math.abs(dt.dtPLCharge))} &nbsp;✓ Balanced</div>
      <div class="je-narr">(Being deferred tax ${isDTAcredit?'credit — DTA recognised':'charge — DTL recognised'} for ${fy} per Ind AS 12. Gross DTA: ₹${fmt(dt.grossDTA)} | Gross DTL: ₹${fmt(dt.grossDTL)})</div>
    `);

    const matNew=v('mv-mat-new');
    const matCard=$('je-mat-card');
    if(matCard) matCard.style.display=matNew>0?'':'none';
    if(matNew>0){
      htm('je-mat',`
        <div class="je-hd">JOURNAL ENTRY 3 — MAT CREDIT ENTITLEMENT &nbsp;|&nbsp; ${fy} &nbsp;|&nbsp; Sec 115JAA</div>
        <div class="je-date">Date: ${dt_}</div><br>
        <div class="je-dr">Dr &nbsp;&nbsp; MAT Credit Entitlement (DTA — Non Current) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(matNew)}</span></div>
        <div class="je-cr">Cr &nbsp;&nbsp; MAT Credit Entitlement (P&amp;L — Tax Income) &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="je-amt">₹${fmt(matNew)}</span></div>
        <div class="je-tot">Dr Total = ₹${fmt(matNew)} &nbsp;|&nbsp; Cr Total = ₹${fmt(matNew)} &nbsp;✓ Balanced</div>
        <div class="je-narr">(Being MAT credit entitlement recognised u/s 115JAA — carry-forward 15 years. Reasonably certain of future normal tax liability.)</div>
      `);
    }
  }

  /* ══════════════════════════════════════
     DISCLOSURE NOTE  (Ind AS 12.79-88)
  ══════════════════════════════════════ */
  function buildDisclosure(ct, dt, total, etr, statRate){
    const dn=$('disclosure-note'); if(!dn) return;
    const fy  =$('ci-fy')?.value||'FY ____';
    const name=$('ci-name')?.value||'the Company';
    const date=$('ci-date')?.value?new Date($('ci-date').value).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):'31st March ____';
    const rate=v('ci-rate');

    dn.innerHTML=`
    <div class="disc">
      <p style="margin-bottom:12px"><strong>Note ___ : Income Taxes</strong></p>
      <p style="margin-bottom:10px">a) Amount recognised in the Statement of Profit and Loss:</p>
      <table class="disc-tbl">
        <thead><tr><th>Particulars</th><th class="r">Current Year (₹)</th></tr></thead>
        <tbody>
          <tr><td style="font-weight:600">Current tax</td><td class="r"></td></tr>
          <tr><td style="padding-left:20px">Current tax on taxable profits for the year</td><td class="r">${fmt(ct.grossTax)}</td></tr>
          <tr><td style="padding-left:20px">Adjustments for earlier years</td><td class="r">—</td></tr>
          <tr style="font-weight:600"><td>Total current tax expense</td><td class="r">${fmt(ct.grossTax)}</td></tr>
          <tr><td></td><td></td></tr>
          <tr><td style="font-weight:600">Deferred tax</td><td class="r"></td></tr>
          <tr><td style="padding-left:20px">Origination and reversal of temporary differences</td><td class="r">${fmtSign(dt.dtPLCharge)}</td></tr>
          <tr><td style="padding-left:20px">Effect of change in tax rate</td><td class="r">—</td></tr>
          <tr style="font-weight:600"><td>Total deferred tax expense / (credit)</td><td class="r">${fmtSign(dt.dtPLCharge)}</td></tr>
        </tbody>
        <tfoot><tr><td>Income tax expense recognised in P&amp;L</td><td class="r">${fmt(total)}</td></tr></tfoot>
      </table>

      <p style="margin:14px 0 8px">b) Reconciliation of effective tax rate:</p>
      <table class="disc-tbl">
        <thead><tr><th>Particulars</th><th class="r">%</th><th class="r">₹</th></tr></thead>
        <tbody>
          <tr><td>Profit Before Tax (Book Profit)</td><td class="r">100.00%</td><td class="r">${fmt(ct.bookProfit)}</td></tr>
          <tr><td>Tax at statutory rate of ${rate.toFixed(3)}%</td><td class="r">${rate.toFixed(3)}%</td><td class="r">${fmt(ct.bookProfit*rate/100)}</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Effect of non-deductible expenses</td><td class="r">—</td><td class="r">—</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Effect of exempt income</td><td class="r">—</td><td class="r">—</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Effect of deferred tax movement</td><td class="r">${ct.bookProfit?fmtPct(dt.dtPLCharge/ct.bookProfit*100):'—'}</td><td class="r">${fmtSign(dt.dtPLCharge)}</td></tr>
        </tbody>
        <tfoot><tr><td><strong>Effective tax rate / Total tax expense</strong></td><td class="r"><strong>${fmtPct(etr)}</strong></td><td class="r"><strong>${fmt(total)}</strong></td></tr></tfoot>
      </table>

      <p style="margin:14px 0 8px">c) Deferred tax recognised in Balance Sheet:</p>
      <table class="disc-tbl">
        <thead><tr><th>Particulars</th><th class="r">Closing DTA (₹)</th><th class="r">Closing DTL (₹)</th></tr></thead>
        <tbody>
          <tr><td>Property, Plant &amp; Equipment</td><td class="r">${fmt(dt.assetRows.find(r=>r.label?.includes('Plant'))||0)}</td><td class="r">—</td></tr>
          <tr><td>Employee benefit provisions (Gratuity, Leave etc.)</td><td class="r">—</td><td class="r">—</td></tr>
          <tr><td>Other temporary differences</td><td class="r">—</td><td class="r">—</td></tr>
          <tr><td>Unabsorbed depreciation / business losses</td><td class="r">—</td><td class="r">—</td></tr>
        </tbody>
        <tfoot><tr><td>Net DTA / DTL (to Balance Sheet — Non Current)</td><td class="r">${fmt(dt.closingDTA)}</td><td class="r">${fmt(dt.closingDTL)}</td></tr></tfoot>
      </table>

      <p style="margin-top:14px">Deferred tax assets and liabilities are measured at the tax rates expected to apply in the period when the asset is realised or liability settled, based on tax rates and tax laws enacted or substantively enacted as at <strong>${date}</strong> i.e. <strong>${rate.toFixed(3)}%</strong> (including surcharge and Health & Education Cess).</p>
      ${dt.closingMAT>0?`<p style="margin-top:10px">The Company has recognised MAT credit entitlement of <strong>₹${fmt(dt.closingMAT)}</strong> (including current year of ₹${fmt(v('mv-mat-new'))}), which is expected to be utilised within 15 years on the basis of projections of future taxable profits, as per the provisions of Section 115JAA of the Income Tax Act, 1961.</p>`:''}
      <p style="margin-top:10px;font-size:11px;color:var(--ink-4)"><em>Prepared in accordance with Ind AS 12 — Income Taxes, notified under the Companies (Indian Accounting Standards) Rules, 2015, as amended.</em></p>
    </div>`;
  }

  /* ══════════════════════════════════════
     AUDITOR CHECKLIST
  ══════════════════════════════════════ */
  function buildChecklist(ct, dt, total, etr, state){
    const wrap=$('checklist-wrap'); if(!wrap) return;
    const checks=[
      {l:'Balance sheet approach applied per Ind AS 12 (not income statement approach)',        ref:'Ind AS 12.15',   ok:true},
      {l:'Current tax computed on taxable income per Income Tax Act, 1961',                    ref:'Sec 115BAA/JB',  ok:ct.taxableIncome!==0||ct.bookProfit!==0, warn:ct.taxableIncome===0},
      {l:'Temporary differences identified for ALL balance sheet line items',                  ref:'Ind AS 12.5',    ok:state.dtAsset.length>0&&state.dtLiab.length>0, warn:state.dtAsset.length===0||state.dtLiab.length===0},
      {l:'Tax base correctly determined per Income Tax Act provisions',                        ref:'Ind AS 12.7',    ok:true},
      {l:'Deferred tax rate = enacted/substantively enacted rate at balance sheet date',       ref:'Ind AS 12.47',   ok:v('ci-rate')>0},
      {l:'DTA recognised only where future taxable profits are probable (Ind AS 12.24)',       ref:'Ind AS 12.24',   ok:dt.grossDTA>=0},
      {l:'Virtual certainty test applied for DTA on unabsorbed losses (Ind AS 12.29)',        ref:'Ind AS 12.29',   ok:true, note:'Verify if DTA on losses is recognised — management assessment documented?'},
      {l:'Initial recognition exception applied correctly (Ind AS 12.15(b), 24(b))',          ref:'Ind AS 12.15(b)',ok:true},
      {l:'Deferred taxes NOT discounted — presented at undiscounted nominal amounts',          ref:'Ind AS 12.53',   ok:true},
      {l:'DTA and DTL offset ONLY where enforceable right exists & same taxing authority',    ref:'Ind AS 12.74',   ok:true},
      {l:'Opening balances agreed to prior year audited financial statements',                 ref:'SA 520',         ok:v('ob-dta')>=0&&v('ob-dtl')>=0, warn:v('ob-dta')===0&&v('ob-dtl')===0, note:'Confirm with prior year workpapers — zero opening may need explanation'},
      {l:'MAT credit entitlement recognised separately as deferred tax asset',                ref:'Sec 115JAA',     ok:true},
      {l:'DTA / DTL classified as NON-CURRENT in Balance Sheet',                             ref:'Ind AS 1.56',    ok:true},
      {l:'Effective tax rate reconciliation prepared and disclosed',                          ref:'Ind AS 12.81(c)',ok:ct.bookProfit!==0},
      {l:'Disclosure of temporary differences for each type of item (Ind AS 12.81(g))',       ref:'Ind AS 12.81(g)',ok:state.dtAsset.length>0||state.dtLiab.length>0},
      {l:'Journal entries balanced — Dr = Cr for both current and deferred tax',              ref:'AS 2 / SA 300',  ok:true},
      {l:'Income tax expense note prepared per Ind AS 12.79-88',                             ref:'Ind AS 12.79',   ok:true},
      {l:'Compliance with Companies Act 2013 Schedule III presentation',                     ref:'Sch III Part I',  ok:true},
    ];
    wrap.innerHTML=checks.map(c=>{
      const st = c.ok&&!c.warn?'done':c.warn?'warn':'fail';
      const ico= st==='done'?'✓':st==='warn'?'!':'✗';
      return `<div class="chk-item">
        <div class="chk-ico chk-${st}">${ico}</div>
        <div class="chk-lbl">${c.l}${c.note?`<div style="font-size:11px;color:var(--ink-4);margin-top:2px">${c.note}</div>`:''}</div>
        <div class="chk-ref">${c.ref}</div>
      </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════
     ETR RECONCILIATION
  ══════════════════════════════════════ */
  function buildETR(ct, dt, etr, statRate){
    const tbl=$('etr-tbl'); if(!tbl||!ct.bookProfit) return;
    const r=statRate/100;
    const taxAtStat=ct.bookProfit*r;
    const etrAmt=ct.grossTax+dt.dtPLCharge;
    tbl.innerHTML=`
      <table class="wt">
        <thead><tr><th>Particulars</th><th class="r">₹</th><th class="r">Rate %</th></tr></thead>
        <tbody>
          <tr><td>Profit Before Tax</td><td class="r">${fmt(ct.bookProfit)}</td><td class="r">—</td></tr>
          <tr><td>Tax at statutory rate of ${statRate.toFixed(3)}%</td><td class="r">${fmt(taxAtStat)}</td><td class="r">${statRate.toFixed(3)}%</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Non-deductible expenses</td><td class="r">—</td><td class="r">—</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Exempt income</td><td class="r">—</td><td class="r">—</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Deferred tax movement</td><td class="r">${fmtSign(dt.dtPLCharge)}</td><td class="r">${ct.bookProfit?fmtPct(dt.dtPLCharge/ct.bookProfit*100):'—'}</td></tr>
          <tr><td style="padding-left:20px;color:var(--ink-3)">Other adjustments</td><td class="r">—</td><td class="r">—</td></tr>
        </tbody>
        <tfoot><tr class="tot-row"><td>Effective Tax Rate / Income Tax Expense</td><td class="r">${fmt(etrAmt)}</td><td class="r">${fmtPct(etr)}</td></tr></tfoot>
      </table>`;
  }

  /* ══════════════════════════════════════
     PROGRESS
  ══════════════════════════════════════ */
  function updateProgress(state){
    let n=0;
    if($('ci-name')?.value) n++;
    if($('ci-fy')?.value) n++;
    if(state.ctRows.some(r=>parseFloat(r.amt)>0)) n++;
    if(state.dtAsset.some(r=>r.ca>0||r.tb>0)) n++;
    if(state.dtLiab.some(r=>r.ca>0||r.tb>0)) n++;
    const p=Math.round(n/5*100);
    const b=$('sb-prog'); if(b) b.style.width=p+'%';
    const t=$('sb-prog-txt'); if(t) t.textContent=p+'% complete';
  }

  return { run, fmt, fmtSign, fmtPct };
})();
