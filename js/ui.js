'use strict';

/**
 * UI.JS - User Interface Controller
 * K G Somani & Co LLP
 *
 * This module manages:
 *   - Section navigation between workpaper tabs
 *   - Toast notifications
 *   - Compute trigger with confirmation
 *   - Print / PDF generation
 *   - Client information display updates
 *   - Form reset functionality
 *   - Keyboard shortcuts
 *   - Initialisation and default values
 */

const UI = (() => {
  const $ = id => document.getElementById(id);

  /* ------------------------------------------------------------------
     SECTION NAVIGATION
     ------------------------------------------------------------------ */

  /**
   * Activates the specified section and updates sidebar highlighting.
   * Re-renders deferred tax tables when navigating to output sections.
   * @param {string} sec - Section identifier (e.g. 'client', 'deferred')
   * @param {HTMLElement|null} el - Clicked navigation element
   */
  function nav(sec, el) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const section = $('sec-' + sec);
    if (section) section.classList.add('active');

    if (el) {
      el.classList.add('active');
    } else {
      const n = document.querySelector(`[data-sec="${sec}"]`);
      if (n) n.classList.add('active');
    }

    // Re-render deferred tax tables when viewing output sections
    if (['deferred', 'summary', 'etr', 'disclosure', 'checklist'].includes(sec)) {
      State.renderDtAsset();
      State.renderDtLiab();
      State.renderDtOther();
      Compute.run(State.data);
    }

    // Scroll to top of main content
    $('main-wrap')?.scrollTo(0, 0);
  }

  /* ------------------------------------------------------------------
     TOAST NOTIFICATIONS
     ------------------------------------------------------------------ */

  /**
   * Displays a temporary toast notification.
   * @param {string} msg - Message text
   * @param {string} type - Type: 'ok', 'err', or 'info'
   * @param {number} dur - Duration in milliseconds (default 3000)
   */
  function toast(msg, type = 'info', dur = 3000) {
    const wrap = $('toast-wrap');
    if (!wrap) return;

    const icons = { ok: 'OK', err: 'ERR', info: 'INFO' };
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.innerHTML = `<span style="font-weight:700;font-size:10px">${icons[type] || 'INFO'}</span><span>${msg}</span>`;
    wrap.appendChild(t);

    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      t.style.transition = 'all .22s';
      setTimeout(() => t.remove(), 220);
    }, dur);
  }

  /* ------------------------------------------------------------------
     COMPUTE TRIGGER
     ------------------------------------------------------------------ */

  /**
   * Triggers full computation and displays success notification.
   */
  function compute() {
    Compute.run(State.data);
    toast('Provision computed successfully', 'ok', 2500);
  }

  /* ------------------------------------------------------------------
     PRINT / PDF
     ------------------------------------------------------------------ */

  /**
   * Prepares the document for printing by displaying all sections,
   * then restores original visibility after print dialog closes.
   */
  function print_() {
    Compute.run(State.data);
    document.querySelectorAll('.section').forEach(s => s.style.display = 'block');
    window.print();
    setTimeout(() => {
      document.querySelectorAll('.section').forEach(s => s.style.display = '');
      document.querySelectorAll('.section.active').forEach(s => s.style.display = 'block');
    }, 1000);
  }

  /* ------------------------------------------------------------------
     CLIENT DISPLAY UPDATE
     ------------------------------------------------------------------ */

  /**
   * Updates sidebar and document title with current client information.
   */
  function updateClient() {
    const n = $('ci-name')?.value;
    const fy = $('ci-fy')?.value;

    const el = $('sb-client');
    if (el && n) el.textContent = n;

    const el2 = $('sb-fy');
    if (el2 && fy) el2.textContent = fy;

    if (n && fy) document.title = `${n} - Tax Provision ${fy} | KGS`;
  }

  /* ------------------------------------------------------------------
     RESET ALL DATA
     ------------------------------------------------------------------ */

  /**
   * Resets all form fields and data to default values.
   * Requires user confirmation before execution.
   */
  function reset() {
    if (!confirm('Reset all data? This cannot be undone.')) return;

    const fields = [
      'ci-name', 'ci-cin', 'ci-fy', 'ci-prep', 'ci-rev',
      'ob-dta', 'ob-dtl', 'ob-mat', 'ct-tds', 'ct-matutil', 'mv-mat-new'
    ];
    fields.forEach(id => {
      const e = $(id);
      if (e) e.value = '';
    });

    const r = $('ci-rate');
    if (r) r.value = '25.168';

    const m = $('ci-mat');
    if (m) m.value = '17.472';

    State.initDefaults();
    Compute.run(State.data);
    toast('Workpaper reset to defaults', 'info');
  }

  /* ------------------------------------------------------------------
     INITIALISATION
     ------------------------------------------------------------------ */

  /**
   * Initialises the application on DOM ready.
   * Sets default dates, binds event listeners, and triggers initial compute.
   */
  function init() {
    // Set default preparation date to today
    const today = new Date().toISOString().split('T')[0];
    const pd = $('ci-prepdate');
    if (pd) pd.value = today;

    // Set default balance sheet date to 31st March of current/previous FY
    const now = new Date();
    const yr = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const de = $('ci-date');
    if (de) de.value = `${yr}-03-31`;

    // Set default financial year
    const fyi = $('ci-fy');
    if (fyi && !fyi.value) fyi.value = `${yr}-${String(yr + 1).slice(-2)}`;

    // Bind navigation clicks
    document.querySelectorAll('.nav-item[data-sec]').forEach(item => {
      item.addEventListener('click', function() { nav(this.dataset.sec, this); });
    });

    // Bind live recompute on rate and balance changes
    const recomputeFields = [
      'ci-rate', 'ci-mat', 'ob-dta', 'ob-dtl', 'ob-mat',
      'ct-tds', 'ct-matutil', 'mv-mat-new'
    ];
    recomputeFields.forEach(id => {
      const e = $(id);
      if (e) e.addEventListener('input', () => State.go());
    });

    // Bind client info updates
    ['ci-name', 'ci-fy'].forEach(id => {
      const e = $(id);
      if (e) e.addEventListener('input', updateClient);
    });

    // Keyboard shortcut: Ctrl+Enter to compute
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') compute();
    });

    toast('Workpaper ready. Enter data and click Compute.', 'info', 4000);
  }

  return { nav, toast, compute, print_, reset, updateClient, init };
})();
