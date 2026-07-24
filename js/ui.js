'use strict';
/* ═══════════════════════════════════════════════════
   UI.JS — Navigation, Toast, Interactions
   K G Somani & Co LLP
═══════════════════════════════════════════════════ */
const UI = (() => {
  const $ = id => document.getElementById(id);

  /* ── NAVIGATE ── */
  function nav(sec, el){
    document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    const s=$('sec-'+sec); if(s) s.classList.add('active');
    if(el) el.classList.add('active');
    else { const n=document.querySelector(`[data-sec="${sec}"]`); if(n) n.classList.add('active'); }
    if(['deferred','summary','etr','disclosure','checklist'].includes(sec)){
      State.renderDtAsset(); State.renderDtLiab(); State.renderDtOther();
      Compute.run(State.data);
    }
    $('main-wrap')?.scrollTo(0,0);
  }

  /* ── TOAST ── */
  function toast(msg, type='info', dur=3000){
    const wrap=$('toast-wrap'); if(!wrap) return;
    const icons={ok:'✓',err:'✗',info:'ℹ'};
    const t=document.createElement('div');
    t.className='toast '+type;
    t.innerHTML=`<span>${icons[type]||'ℹ'}</span><span>${msg}</span>`;
    wrap.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transform='translateY(8px)'; t.style.transition='all .22s'; setTimeout(()=>t.remove(),220); }, dur);
  }

  /* ── COMPUTE + TOAST ── */
  function compute(){
    Compute.run(State.data);
    toast('Provision computed successfully','ok',2500);
  }

  /* ── PRINT ── */
  function print_(){
    Compute.run(State.data);
    document.querySelectorAll('.section').forEach(s=>s.style.display='block');
    window.print();
    setTimeout(()=>{ document.querySelectorAll('.section').forEach(s=>s.style.display=''); document.querySelectorAll('.section.active').forEach(s=>s.style.display='block'); },1000);
  }

  /* ── CLIENT DISPLAY ── */
  function updateClient(){
    const n=$('ci-name')?.value, fy=$('ci-fy')?.value;
    const el=$('sb-client-name'); if(el&&n) el.textContent=n;
    const el2=$('sb-fy'); if(el2&&fy) el2.textContent=fy;
    if(n&&fy) document.title=`${n} — Tax Provision ${fy} | KGS`;
  }

  /* ── RESET ── */
  function reset(){
    if(!confirm('Reset all data? This cannot be undone.')) return;
    ['ci-name','ci-cin','ci-fy','ci-prep','ci-rev','ob-dta','ob-dtl','ob-mat','ct-tds','ct-matutil','mv-mat-new'].forEach(id=>{ const e=$(id); if(e) e.value=''; });
    const r=$('ci-rate'); if(r) r.value='25.168';
    const m=$('ci-mat'); if(m) m.value='17.472';
    State.initDefaults();
    Compute.run(State.data);
    toast('Workpaper reset','info');
  }

  /* ── INIT ── */
  function init(){
    const today=new Date().toISOString().split('T')[0];
    const pd=$('ci-prepdate'); if(pd) pd.value=today;
    const now=new Date(), yr=now.getMonth()>=3?now.getFullYear():now.getFullYear()-1;
    const de=$('ci-date'); if(de) de.value=`${yr}-03-31`;
    const fyi=$('ci-fy'); if(fyi&&!fyi.value) fyi.value=`${yr}-${String(yr+1).slice(-2)}`;

    // nav bindings
    document.querySelectorAll('.nav-item[data-sec]').forEach(item=>{
      item.addEventListener('click',function(){ nav(this.dataset.sec,this); });
    });
    // live recompute
    ['ci-rate','ci-mat','ob-dta','ob-dtl','ob-mat','ct-tds','ct-matutil','mv-mat-new'].forEach(id=>{
      const e=$(id); if(e) e.addEventListener('input',()=>State.go());
    });
    ['ci-name','ci-fy'].forEach(id=>{ const e=$(id); if(e) e.addEventListener('input',updateClient); });
    document.addEventListener('keydown',e=>{ if((e.ctrlKey||e.metaKey)&&e.key==='Enter') compute(); });
    toast('Workpaper loaded with sample data — edit values and click Compute','info',5000);
  }

  return { nav, toast, compute, print_, reset, updateClient, init };
})();
