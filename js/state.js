'use strict';
/* ═══════════════════════════════════════════════════
   STATE.JS — Application State & Table Rendering
   K G Somani & Co LLP | With Dummy Data
═══════════════════════════════════════════════════ */
const State = (() => {
  const uid = () => '_'+Math.random().toString(36).substr(2,9);

  const data = { ctRows:[], dtAsset:[], dtLiab:[], dtOther:[] };

  /* ══════════════════════════════════════
     DUMMY DATA — Realistic client scenario
     Client: Pinnacle Manufacturing Pvt Ltd
     FY 2024-25 | Ind AS 12
  ══════════════════════════════════════ */
  function initDefaults(){
    data.ctRows=[
      {id:uid(),label:'Net Profit as per Statement of Profit & Loss (before tax)',amt:85000000,type:'book',locked:true},
      {id:uid(),label:'Add: Depreciation as per Companies Act 2013 / Ind AS 16 (added back)',amt:12500000,type:'add'},
      {id:uid(),label:'Less: Depreciation allowable u/s 32 of Income Tax Act, 1961 (WDV method)',amt:18200000,type:'less'},
      {id:uid(),label:'Add: Provision for Gratuity — disallowed u/s 40A(7) (allowed on actual payment)',amt:3800000,type:'add'},
      {id:uid(),label:'Add: Provision for Leave Encashment — disallowed u/s 43B',amt:1200000,type:'add'},
      {id:uid(),label:'Add: Provision for Bonus / Ex-gratia — disallowed u/s 43B (not paid before due date)',amt:2500000,type:'add'},
      {id:uid(),label:'Add: Provision for Expected Credit Loss / Doubtful Debts — disallowed',amt:4200000,type:'add'},
      {id:uid(),label:'Add: Expenditure disallowed u/s 40(a)(ia) — TDS default on vendor payments',amt:850000,type:'add'},
      {id:uid(),label:'Add: Penalty and fines paid during the year',amt:120000,type:'add'},
      {id:uid(),label:'Add: Prior year expense claimed in current year (timing difference)',amt:680000,type:'add'},
      {id:uid(),label:'Less: 43B items actually paid before due date of filing ITR',amt:1800000,type:'less'},
      {id:uid(),label:'Less: Exempt income — Dividend from domestic company u/s 10(34)',amt:500000,type:'less'},
      {id:uid(),label:'Less: Deduction u/s 80JJAA — additional deduction on new employees',amt:1500000,type:'less'},
      {id:uid(),label:'Less: Deduction u/s 80G — donations to approved institutions',amt:300000,type:'less'},
      {id:uid(),label:'Add/(Less): Other adjustments — FVTPL mark-to-market (not taxable)',amt:650000,type:'add'},
    ];

    data.dtAsset=[
      {id:uid(),label:'Property, Plant & Equipment — Net Block (Ind AS 16)',ca:125000000,tb:108000000,note:'CA = WDV per Sch II / Ind AS; TB = WDV per IT Act Sec 32 / Sch II'},
      {id:uid(),label:'Capital Work-in-Progress (CWIP)',ca:18500000,tb:0,note:'TB = 0 — no depreciation allowed till asset put to use u/s 32'},
      {id:uid(),label:'Intangible Assets — Software & Licences (Ind AS 38)',ca:3200000,tb:2100000,note:'CA = amortised cost; TB = amortisation as per IT Act'},
      {id:uid(),label:'Right-of-Use Assets — Office Lease (Ind AS 116)',ca:8400000,tb:0,note:'TB = 0 — no ROU asset for tax; lease payments deducted on payment basis'},
      {id:uid(),label:'Financial Instruments at FVTPL — Mutual Fund Units',ca:12500000,tb:11850000,note:'TB = cost; CA = fair value. Unrealised gain = taxable TD → DTL'},
      {id:uid(),label:'Prepaid Expenses — deferred in books but allowed in tax',ca:450000,tb:0,note:''},
    ];

    data.dtLiab=[
      {id:uid(),label:'Provision for Gratuity — Defined Benefit Obligation (Ind AS 19)',ca:14200000,tb:0,note:'TB = 0 — allowed only on actual payment u/s 43B / 40A(7)'},
      {id:uid(),label:'Provision for Leave Encashment (compensated absences)',ca:4800000,tb:0,note:'TB = 0 — allowed on payment basis u/s 43B'},
      {id:uid(),label:'Provision for Bonus / Performance Pay (43B item)',ca:2500000,tb:0,note:'TB = 0 — not paid before due date of ITR filing'},
      {id:uid(),label:'Provision for Expected Credit Loss — ECL (Ind AS 109)',ca:9800000,tb:0,note:'TB = 0 — allowed only on actual write-off / NPA under IT Act'},
      {id:uid(),label:'Lease Liability — Office Lease (Ind AS 116)',ca:9100000,tb:0,note:'TB = 0 — off-balance-sheet for tax; rent deducted on payment'},
      {id:uid(),label:'Contract Liabilities / Advance from Customers',ca:3200000,tb:3200000,note:'TB = CA — advance taxed in year of receipt; no difference'},
      {id:uid(),label:'Deferred Revenue — Warranty Provision',ca:1800000,tb:0,note:'TB = 0 — not deductible until actual warranty claim settled'},
    ];

    data.dtOther=[
      {id:uid(),label:'Unabsorbed Depreciation carried forward u/s 32(2) of ITA',amt:5000000,type:'dta',note:'Recognise only if virtually certain — management has assessed basis of future taxable profits'},
      {id:uid(),label:'Business Loss carried forward u/s 72 (available for 8 years)',amt:0,type:'dta',note:'Nil for current year — no losses; update if applicable'},
      {id:uid(),label:'MAT Credit Entitlement u/s 115JAA — opening balance utilised',amt:0,type:'dta',note:'Carry-forward period: 15 years from year of payment of MAT'},
    ];

    renderAll();
  }

  /* ══════════════════════════════════════
     RENDER ALL
  ══════════════════════════════════════ */
  function renderAll(){
    renderCT(); renderDtAsset(); renderDtLiab(); renderDtOther();
  }

  /* ── CURRENT TAX ── */
  function renderCT(){
    const tbody=document.getElementById('ct-body'); if(!tbody) return;
    tbody.innerHTML='';
    data.ctRows.forEach((row,i)=>{
      const cls={book:'book-row',add:'add-row',less:'less-row'}[row.type]||'';
      const tpill={book:'pill-blue',add:'pill-green',less:'pill-purple'}[row.type];
      const tlabel={book:'Book',add:'Add','less':'Less'}[row.type];
      const tr=document.createElement('tr');
      tr.className=cls;
      tr.innerHTML=`
        <td class="rn" style="width:32px">${i+1}</td>
        <td style="width:90px">
          ${row.locked
            ?`<span class="pill ${tpill}">${tlabel}</span>`
            :`<select class="ti" style="width:70px" onchange="State.updCT('${row.id}','type',this.value);State.go()">
                <option value="add" ${row.type==='add'?'selected':''}>Add</option>
                <option value="less" ${row.type==='less'?'selected':''}>Less</option>
              </select>`}
        </td>
        <td><input class="ti" value="${row.label}" onchange="State.updCT('${row.id}','label',this.value)" style="width:100%" /></td>
        <td style="width:180px"><input class="ti r" type="number" value="${row.amt||''}" placeholder="0" oninput="State.updCT('${row.id}','amt',this.value);State.go()" style="width:100%" /></td>
        <td style="width:32px;text-align:center">${row.locked?'':`<button class="del-btn" onclick="State.delCT('${row.id}')" title="Remove">×</button>`}</td>`;
      tbody.appendChild(tr);
    });
  }

  /* ── DT ASSETS ── */
  function renderDtAsset(){
    const tbody=document.getElementById('dt-asset-body'); if(!tbody) return;
    tbody.innerHTML='';
    const rate=(parseFloat(document.getElementById('ci-rate')?.value)||25.168)/100;
    data.dtAsset.forEach((row,i)=>{
      const ca=parseFloat(row.ca)||0, tb=parseFloat(row.tb)||0;
      const diff=ca-tb, te=Math.abs(diff)*rate;
      const nature=diff>0?'DTL':diff<0?'DTA':'—';
      const pc=diff>0?'pill-dtl':diff<0?'pill-dta':'pill-gray';
      const valCol=diff>0?'color:var(--red)':diff<0?'color:var(--green)':'';
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td class="rn" style="width:32px">${i+1}</td>
        <td><div><input class="ti" value="${row.label}" onchange="State.updDT('asset','${row.id}','label',this.value)" style="width:100%;font-weight:500"/>
          ${row.note?`<div style="font-size:10.5px;color:var(--ink-5);padding-left:4px;margin-top:2px">${row.note}</div>`:''}</div></td>
        <td style="width:150px"><input class="ti r" type="number" value="${row.ca||''}" placeholder="0" oninput="State.updDT('asset','${row.id}','ca',this.value);State.go()" style="width:100%"/></td>
        <td style="width:150px"><input class="ti r" type="number" value="${row.tb||''}" placeholder="0" oninput="State.updDT('asset','${row.id}','tb',this.value);State.go()" style="width:100%"/></td>
        <td class="r" style="width:130px;font-weight:600;${valCol}">${diff!==0?Compute.fmtSign(diff):'—'}</td>
        <td class="c" style="width:75px"><span class="pill ${pc}">${nature}</span></td>
        <td class="r" style="width:130px;font-weight:600">${diff!==0?'₹'+Compute.fmt(te):'—'}</td>
        <td style="width:32px;text-align:center"><button class="del-btn" onclick="State.delDT('asset','${row.id}')">×</button></td>`;
      tbody.appendChild(tr);
    });
  }

  /* ── DT LIABILITIES ── */
  function renderDtLiab(){
    const tbody=document.getElementById('dt-liab-body'); if(!tbody) return;
    tbody.innerHTML='';
    const rate=(parseFloat(document.getElementById('ci-rate')?.value)||25.168)/100;
    data.dtLiab.forEach((row,i)=>{
      const ca=parseFloat(row.ca)||0, tb=parseFloat(row.tb)||0;
      const diff=ca-tb, te=Math.abs(diff)*rate;
      const nature=diff>0?'DTA':diff<0?'DTL':'—';
      const pc=diff>0?'pill-dta':diff<0?'pill-dtl':'pill-gray';
      const valCol=diff>0?'color:var(--green)':diff<0?'color:var(--red)':'';
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td class="rn" style="width:32px">${i+1}</td>
        <td><div><input class="ti" value="${row.label}" onchange="State.updDT('liab','${row.id}','label',this.value)" style="width:100%;font-weight:500"/>
          ${row.note?`<div style="font-size:10.5px;color:var(--ink-5);padding-left:4px;margin-top:2px">${row.note}</div>`:''}</div></td>
        <td style="width:150px"><input class="ti r" type="number" value="${row.ca||''}" placeholder="0" oninput="State.updDT('liab','${row.id}','ca',this.value);State.go()" style="width:100%"/></td>
        <td style="width:150px"><input class="ti r" type="number" value="${row.tb||''}" placeholder="0" oninput="State.updDT('liab','${row.id}','tb',this.value);State.go()" style="width:100%"/></td>
        <td class="r" style="width:130px;font-weight:600;${valCol}">${diff!==0?Compute.fmtSign(diff):'—'}</td>
        <td class="c" style="width:75px"><span class="pill ${pc}">${nature}</span></td>
        <td class="r" style="width:130px;font-weight:600">${diff!==0?'₹'+Compute.fmt(te):'—'}</td>
        <td style="width:32px;text-align:center"><button class="del-btn" onclick="State.delDT('liab','${row.id}')">×</button></td>`;
      tbody.appendChild(tr);
    });
  }

  /* ── DT OTHER ── */
  function renderDtOther(){
    const tbody=document.getElementById('dt-other-body'); if(!tbody) return;
    tbody.innerHTML='';
    const rate=(parseFloat(document.getElementById('ci-rate')?.value)||25.168)/100;
    data.dtOther.forEach((row,i)=>{
      const amt=parseFloat(row.amt)||0, te=amt*rate;
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td class="rn" style="width:32px">${i+1}</td>
        <td><div><input class="ti" value="${row.label}" onchange="State.updOther('${row.id}','label',this.value)" style="width:100%;font-weight:500"/>
          ${row.note?`<div style="font-size:10.5px;color:var(--ink-5);padding-left:4px;margin-top:2px">${row.note}</div>`:''}</div></td>
        <td style="width:160px"><input class="ti r" type="number" value="${row.amt||''}" placeholder="0" oninput="State.updOther('${row.id}','amt',this.value);State.go()" style="width:100%"/></td>
        <td class="c" style="width:90px">
          <select class="ti" style="width:70px" onchange="State.updOther('${row.id}','type',this.value);State.go()">
            <option value="dta" ${row.type==='dta'?'selected':''}>DTA</option>
            <option value="dtl" ${row.type==='dtl'?'selected':''}>DTL</option>
          </select>
        </td>
        <td class="r" style="width:140px;font-weight:600">${amt?'₹'+Compute.fmt(te):'—'}</td>
        <td style="width:32px;text-align:center"><button class="del-btn" onclick="State.delOther('${row.id}')">×</button></td>`;
      tbody.appendChild(tr);
    });
  }

  /* ══════════════════════════════════════
     MUTATIONS
  ══════════════════════════════════════ */
  function updCT(id,f,v){ const r=data.ctRows.find(x=>x.id===id); if(r) r[f]=f==='amt'?parseFloat(v)||0:v; }
  function addCT(){ data.ctRows.push({id:uid(),label:'New item — describe here',amt:0,type:'add'}); renderCT(); }
  function delCT(id){ data.ctRows=data.ctRows.filter(x=>x.id!==id); renderCT(); go(); }

  function updDT(sec,id,f,v){
    const arr=sec==='asset'?data.dtAsset:data.dtLiab;
    const r=arr.find(x=>x.id===id); if(r) r[f]=['ca','tb'].includes(f)?parseFloat(v)||0:v;
    if(sec==='asset') renderDtAsset(); else renderDtLiab();
  }
  function addDT(sec){ const nr={id:uid(),label:'New item',ca:0,tb:0,note:''};
    if(sec==='asset') data.dtAsset.push(nr); else data.dtLiab.push(nr);
    if(sec==='asset') renderDtAsset(); else renderDtLiab(); go(); }
  function delDT(sec,id){
    if(sec==='asset') data.dtAsset=data.dtAsset.filter(x=>x.id!==id);
    else data.dtLiab=data.dtLiab.filter(x=>x.id!==id);
    if(sec==='asset') renderDtAsset(); else renderDtLiab(); go(); }

  function updOther(id,f,v){ const r=data.dtOther.find(x=>x.id===id); if(r) r[f]=f==='amt'?parseFloat(v)||0:v; }
  function addOther(){ data.dtOther.push({id:uid(),label:'New item',amt:0,type:'dta',note:''}); renderDtOther(); go(); }
  function delOther(id){ data.dtOther=data.dtOther.filter(x=>x.id!==id); renderDtOther(); go(); }

  /* ── DEBOUNCED COMPUTE ── */
  let _t=null;
  function go(){ clearTimeout(_t); _t=setTimeout(()=>Compute.run(data),80); }

  return { data, initDefaults, renderAll, renderCT, renderDtAsset, renderDtLiab, renderDtOther,
           updCT, addCT, delCT, updDT, addDT, delDT, updOther, addOther, delOther, go };
})();
