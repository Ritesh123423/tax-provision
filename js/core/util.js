'use strict';

/**
 * UTIL.JS — Shared primitives.
 *
 * Everything here is deliberately dependency-free so the app runs from
 * a file:// path or GitHub Pages with no build step.
 */

const U = (() => {

  /* ---------------- DOM ---------------- */

  const $  = (sel, root = document) => sel[0] === '#' && !/[ .>\[]/.test(sel)
    ? root.getElementById ? root.getElementById(sel.slice(1)) : root.querySelector(sel)
    : root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = id => document.getElementById(id);

  /** Set textContent if the node exists. */
  const setText = (id, txt) => { const e = byId(id); if (e) e.textContent = txt; };
  /** Set innerHTML if the node exists. Callers must pre-escape. */
  const setHTML = (id, html) => { const e = byId(id); if (e) e.innerHTML = html; };
  /** Read a field's raw string value. */
  const val = id => byId(id)?.value ?? '';
  /** Read a field as a finite number, defaulting to 0. */
  const num = id => { const n = parseFloat(byId(id)?.value); return Number.isFinite(n) ? n : 0; };

  const show = (id, on = true) => { const e = byId(id); if (e) e.classList.toggle('hide', !on); };

  /**
   * Escape a string for safe interpolation into HTML.
   * This is what stops a double-quote in a "Particulars" field from
   * blowing the row apart — the original build interpolated raw values.
   */
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Escape for use inside a single-quoted JS string in an inline handler. */
  function escJs(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
  }

  /* ---------------- Numbers ---------------- */

  /** Coerce anything to a finite number. Blank, null and NaN all become 0. */
  function toNum(x) {
    if (x === '' || x === null || x === undefined) return 0;
    const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/,/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  const round = (n, dp = 0) => {
    const f = Math.pow(10, dp);
    return Math.round((toNum(n) + Number.EPSILON) * f) / f;
  };

  /** Indian grouping: 1,23,45,678. Zero renders as "0", not a dash. */
  function fmt(n, dp = 0) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp
    }).format(round(n, dp));
  }

  /** Accounting presentation: negatives in brackets, exact zero as a dash. */
  function fmtBr(n, dp = 0) {
    const v = toNum(n);
    if (Math.abs(v) < 0.005) return '—';
    return v < 0 ? '(' + fmt(Math.abs(v), dp) + ')' : fmt(v, dp);
  }

  /** Signed figure, always showing the sign. Used in movement columns. */
  function fmtSigned(n, dp = 0) {
    const v = toNum(n);
    if (Math.abs(v) < 0.005) return '—';
    return (v > 0 ? '+' : '−') + fmt(Math.abs(v), dp);
  }

  function fmtPct(n, dp = 2) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toFixed(dp) + '%';
  }

  /** Rupees with the symbol, for headline figures. */
  const fmtRs = (n, dp = 0) => '₹\u2009' + fmt(n, dp);

  /* ---------------- Dates ---------------- */

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function fmtDateLong(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function relTime(iso) {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return '—';
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 30) return d + 'd ago';
    return fmtDate(iso);
  }

  /** Financial year label for a date, e.g. 2025-26. */
  function fyFor(date = new Date()) {
    const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
    return `${y}-${String(y + 1).slice(-2)}`;
  }

  const todayISO = () => new Date().toISOString().slice(0, 10);

  /* ---------------- Misc ---------------- */

  /** Collision-resistant enough for local records. */
  function uid(prefix = 'id') {
    const r = (crypto?.getRandomValues)
      ? Array.from(crypto.getRandomValues(new Uint8Array(8))).map(b => b.toString(36)).join('')
      : Math.random().toString(36).slice(2);
    return `${prefix}_${Date.now().toString(36)}${r.slice(0, 8)}`;
  }

  function debounce(fn, ms = 140) {
    let t = null;
    const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    wrapped.cancel = () => clearTimeout(t);
    wrapped.flush = (...a) => { clearTimeout(t); fn(...a); };
    return wrapped;
  }

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, toNum(n)));

  const deepClone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

  /** Case-insensitive substring match across the given fields. */
  function matches(obj, query, fields) {
    if (!query) return true;
    const q = query.toLowerCase().trim();
    return fields.some(f => String(obj[f] ?? '').toLowerCase().includes(q));
  }

  function download(filename, content, mime = 'application/json') {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard API needs a secure context; fall back to a hidden textarea.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      return ok;
    }
  }

  /* ---------------- Toasts ---------------- */

  function toastWrap() {
    let w = byId('toast-wrap');
    if (!w) {
      w = document.createElement('div');
      w.id = 'toast-wrap';
      w.className = 'toast-wrap';
      w.setAttribute('role', 'status');
      w.setAttribute('aria-live', 'polite');
      document.body.appendChild(w);
    }
    return w;
  }

  const TOAST_TAG = { ok: 'DONE', err: 'ERROR', warn: 'CHECK', info: 'NOTE' };

  function toast(msg, type = 'info', ms = 3200) {
    const wrap = toastWrap();
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="toast-tag">${TOAST_TAG[type] || 'NOTE'}</span><span>${esc(msg)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => {
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 220);
    }, ms);
    return el;
  }

  /* ---------------- Modal ---------------- */

  let modalOpen = null;

  /**
   * Open a modal. Traps focus, closes on Escape and backdrop click,
   * and restores focus to the trigger on close.
   * @returns {{close: Function, root: HTMLElement}}
   */
  function modal({ title, body, footer = '', wide = false, onOpen, onClose, closable = true }) {
    closeModal();
    const trigger = document.activeElement;

    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-hdr">
          <div><h2 id="modal-title" class="h-sec">${esc(title)}</h2></div>
          ${closable ? '<button class="modal-x" type="button" aria-label="Close">&times;</button>' : ''}
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>`;
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';

    const close = () => {
      if (modalOpen !== state) return;
      back.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      modalOpen = null;
      onClose?.();
      if (trigger?.isConnected) trigger.focus();
    };

    function onKey(e) {
      if (e.key === 'Escape' && closable) { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = $$('button, [href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])', back)
        .filter(n => !n.disabled && n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    const state = { close, root: back };
    modalOpen = state;

    back.querySelector('.modal-x')?.addEventListener('click', close);
    if (closable) back.addEventListener('click', e => { if (e.target === back) close(); });
    document.addEventListener('keydown', onKey);

    const focusTarget = back.querySelector('[data-autofocus]')
      || back.querySelector('.modal-body input, .modal-body select, .modal-body textarea')
      || back.querySelector('.modal-foot .btn-primary')
      || back.querySelector('.modal-x');
    focusTarget?.focus();

    onOpen?.(back, close);
    return state;
  }

  function closeModal() { modalOpen?.close(); }

  /** Promise-based confirm. Never blocks the main thread like window.confirm. */
  function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, requireText = null }) {
    return new Promise(resolve => {
      let settled = false;
      const done = v => { if (!settled) { settled = true; resolve(v); } };
      const m = modal({
        title,
        body: `<p style="color:var(--ink-600);line-height:1.6">${message}</p>` +
          (requireText
            ? `<div class="field mt-16">
                 <label class="lbl" for="cfm-txt">Type <span class="mono" style="color:var(--dtl)">${esc(requireText)}</span> to continue</label>
                 <input class="inp mono" id="cfm-txt" autocomplete="off" data-autofocus>
               </div>` : ''),
        footer: `<button class="btn btn-line" data-act="no">Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="yes" ${requireText ? 'disabled' : ''}>${esc(confirmLabel)}</button>`,
        onClose: () => done(false)
      });
      const yes = m.root.querySelector('[data-act=yes]');
      const txt = m.root.querySelector('#cfm-txt');
      txt?.addEventListener('input', () => { yes.disabled = txt.value.trim() !== requireText; });
      yes.addEventListener('click', () => { done(true); m.close(); });
      m.root.querySelector('[data-act=no]').addEventListener('click', () => { done(false); m.close(); });
    });
  }

  return {
    $, $$, byId, setText, setHTML, val, num, show, esc, escJs,
    toNum, round, fmt, fmtBr, fmtSigned, fmtPct, fmtRs,
    fmtDate, fmtDateLong, fmtDateTime, relTime, fyFor, todayISO,
    uid, debounce, clamp, deepClone, matches, download, copyText,
    toast, modal, closeModal, confirmDialog
  };
})();
