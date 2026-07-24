/* ═══════════════════════════════════════════════════════════
   UI.JS — Navigation, Interactions, Toast, Utilities
   K G Somani & Co LLP | Tax Provision Workpaper
   ═══════════════════════════════════════════════════════════ */

'use strict';

const UI = (() => {

  /* ────────────────────────────────
     NAVIGATION
  ──────────────────────────────── */
  function navigate(sectionId, clickedEl) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    // Show target
    const sec = document.getElementById('sec-' + sectionId);
    if (sec) sec.classList.add('active');

    // Activate nav item
    if (clickedEl) {
      clickedEl.classList.add('active');
    } else {
      const navEl = document.querySelector(`[data-section="${sectionId}"]`);
      if (navEl) navEl.classList.add('active');
    }

    // Re-render tables after navigation (for rate changes)
    if (['deferred', 'summary'].includes(sectionId)) {
      State.renderDtAssetTable();
      State.renderDtLiabTable();
      State.renderDtOtherTable();
      Compute.run(State.data);
    }

    // Scroll to top
    const main = document.querySelector('.main-content');
    if (main) main.scrollTop = 0;
  }

  /* ────────────────────────────────
     TOAST NOTIFICATIONS
  ──────────────────────────────── */
  function toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      t.style.transition = 'all 0.25s ease';
      setTimeout(() => t.remove(), 250);
    }, duration);
  }

  /* ────────────────────────────────
     PRINT / PDF
  ──────────────────────────────── */
  function printWorkpaper() {
    // Run compute before printing
    Compute.run(State.data);
    // Show all sections for print
    document.querySelectorAll('.section').forEach(s => s.style.display = 'block');
    window.print();
    // Restore
    setTimeout(() => {
      document.querySelectorAll('.section').forEach(s => s.style.display = '');
      document.querySelectorAll('.section.active').forEach(s => s.style.display = 'block');
    }, 1000);
  }

  /* ────────────────────────────────
     CLIENT INFO → SIDEBAR UPDATE
  ──────────────────────────────── */
  function updateClientDisplay() {
    const fy = document.getElementById('ci-fy')?.value;
    const name = document.getElementById('ci-name')?.value;
    const fyEl = document.getElementById('sidebar-fy-val');
    const nameEl = document.getElementById('sidebar-client-name');
    if (fyEl && fy) fyEl.textContent = fy;
    if (nameEl && name) nameEl.textContent = name;

    // Update page tab title
    if (name && fy) {
      document.title = `${name} — Tax Provision ${fy} | KGS`;
    }
  }

  /* ────────────────────────────────
     COMPUTE BUTTON
  ──────────────────────────────── */
  function runCompute() {
    Compute.run(State.data);
    toast('Computation complete', 'success', 2500);
  }

  /* ────────────────────────────────
     EXPORT CSV (basic)
  ──────────────────────────────── */
  function exportCSV() {
    const result = Compute.run(State.data);
    if (!result) return;
    const { ct, dt, totalTaxExpense, etr } = result;
    const fy = document.getElementById('ci-fy')?.value || '';
    const name = document.getElementById('ci-name')?.value || '';

    const rows = [
      ['Tax Provision Workpaper', '', ''],
      ['Client', name, ''],
      ['Financial Year', fy, ''],
      ['Generated', new Date().toLocaleDateString('en-IN'), ''],
      ['', '', ''],
      ['CURRENT TAX', '', ''],
      ['Book Profit', ct.bookProfit, ''],
      ['Taxable Income', ct.taxableIncome, ''],
      ['Current Tax (Gross)', ct.grossTax, ''],
      ['Less: TDS/Advance Tax', ct.tds, ''],
      ['Net Current Tax Payable', ct.netCurrentTax, ''],
      ['', '', ''],
      ['DEFERRED TAX', '', ''],
      ['Total DTA', dt.totalDTA, ''],
      ['Total DTL', dt.totalDTL, ''],
      ['Deferred Tax Charge/(Credit)', dt.deferredPLCharge, ''],
      ['', '', ''],
      ['SUMMARY', '', ''],
      ['Total Tax Expense', totalTaxExpense, ''],
      ['Effective Tax Rate (%)', etr.toFixed(2) + '%', ''],
      ['Closing DTA', dt.closingDTA, ''],
      ['Closing DTL', dt.closingDTL, ''],
    ];

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Tax_Provision_${name.replace(/\s/g, '_')}_${fy}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exported', 'success');
  }

  /* ────────────────────────────────
     CLEAR ALL
  ──────────────────────────────── */
  function clearAll() {
    if (!confirm('Reset all data and start fresh? This cannot be undone.')) return;
    // Reset client fields
    ['ci-name','ci-cin','ci-fy','ci-prep','ci-rev','ob-dta','ob-dtl','ob-mat','ct-tds','ct-matutil','mv-mat-new']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
    const rateEl = document.getElementById('ci-rate');
    if (rateEl) rateEl.value = '25.168';
    const matEl = document.getElementById('ci-mat');
    if (matEl) matEl.value = '17.472';
    State.initDefaults();
    Compute.run(State.data);
    toast('Workpaper cleared', 'info');
  }

  /* ────────────────────────────────
     INIT
  ──────────────────────────────── */
  function init() {
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    const prepDate = document.getElementById('ci-prepdate');
    if (prepDate) prepDate.value = today;

    // Set default period end (31 March of current/previous FY)
    const periodeEnd = document.getElementById('ci-date');
    if (periodeEnd) {
      const now = new Date();
      const fy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      periodeEnd.value = `${fy}-03-31`;

      // Also set FY label
      const fyInput = document.getElementById('ci-fy');
      if (fyInput && !fyInput.value) {
        fyInput.value = `${fy}-${String(fy + 1).slice(-2)}`;
      }
    }

    // Bind nav items
    document.querySelectorAll('.nav-item[data-section]').forEach(item => {
      item.addEventListener('click', function() {
        navigate(this.dataset.section, this);
      });
    });

    // Live recompute on key client fields
    ['ci-rate', 'ci-mat', 'ob-dta', 'ob-dtl', 'ob-mat', 'ct-tds', 'ct-matutil', 'mv-mat-new'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => State.triggerCompute());
    });

    // Client display update
    ['ci-name', 'ci-fy'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateClientDisplay);
    });

    // Keyboard shortcut: Ctrl+Enter = compute
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        runCompute();
      }
    });

    toast('Workpaper loaded — enter client details to begin', 'info', 4000);
  }

  /* ── PUBLIC ── */
  return { init, navigate, toast, printWorkpaper, runCompute, exportCSV, clearAll, updateClientDisplay };

})();
