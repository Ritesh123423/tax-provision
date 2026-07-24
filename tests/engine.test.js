// Node harness: loads util.js + compute.js and casts the numbers by hand.
const fs = require('fs');
const vm = require('vm');

const ctx = { console, crypto: require('crypto').webcrypto, Intl, Date, Math, JSON, Number, Object, Array, String, Blob: class {} };
ctx.globalThis = ctx;
ctx.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
ctx.document = { getElementById: () => null, createElement: () => ({ style: {}, setAttribute(){}, appendChild(){}, remove(){} }), body: { appendChild(){} }, addEventListener(){}, querySelector: () => null, querySelectorAll: () => [] };
vm.createContext(ctx);

vm.runInContext(fs.readFileSync(__dirname + '/../js/core/util.js', 'utf8'), ctx);
// Minimal Store stub — the engine only needs the checklist template.
vm.runInContext(`const Store = { checklistTemplate: () => [{id:'c01'},{id:'c02'}] };`, ctx);
vm.runInContext(fs.readFileSync(__dirname + '/../js/compute.js', 'utf8'), ctx);

// `const` declarations in a vm script are lexical, not properties of the
// context object, so pull them out with an expression.
const Compute = vm.runInContext('Compute', ctx);
const U = vm.runInContext('U', ctx);

let pass = 0, fail = 0;
function eq(label, got, want, tol = 0.51) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: got ${typeof got === 'number' ? got.toFixed(2) : got}, want ${want}`);
  ok ? pass++ : fail++;
}
function is(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}: got ${got}, want ${want}`);
  ok ? pass++ : fail++;
}

const R = n => 'r' + n;

/* ============ CASE 1: normal regime, DTL company ============ */
console.log('\n=== CASE 1 — Profitable co, PPE DTL, gratuity DTA, s.115BAA @ 25.168% ===');
const e1 = {
  fy: '2025-26', bsDate: '2026-03-31', rate: 25.168, matRate: 0, applyMat: false,
  offsetPresentation: true,
  opening: { dta: 0, dtl: 1006720, mat: 0 },
  ct: {
    matBookProfit: 0, advanceTax: 2000000, matUtilised: 0, priorYearAdj: 0,
    rows: [
      { id: R(1), type: 'book', nature: 'perm', amt: 50000000, label: 'PBT' },
      { id: R(2), type: 'add',  nature: 'temp', amt: 8000000, label: 'Book depreciation' },
      { id: R(3), type: 'less', nature: 'temp', amt: 12000000, label: 'Tax depreciation' },
      { id: R(4), type: 'add',  nature: 'temp', amt: 3000000, label: 'Gratuity provision' },
      { id: R(5), type: 'add',  nature: 'perm', amt: 500000, label: 'Penalties' },
      { id: R(6), type: 'less', nature: 'perm', amt: 1000000, label: 'Exempt dividend' }
    ]
  },
  dt: {
    // PPE: book 40m, tax 32m -> TD +8m -> DTL. Opening DTL 1m => signedOpen -1,000,000
    assets: [{ id: R(10), label: 'PPE', ca: 40000000, tb: 32000000, open: -1006720, alloc: 'pl', recognised: true }],
    // Gratuity: liability CA 3m, TB 0 -> TD +3m -> DTA
    liabs:  [{ id: R(11), label: 'Gratuity', ca: 3000000, tb: 0, open: 0, alloc: 'pl', recognised: true }],
    others: []
  },
  checklist: {}
};

const r1 = Compute.run(e1);
eq('Taxable income', r1.ct.taxableIncome, 50000000 + 8000000 - 12000000 + 3000000 + 500000 - 1000000); // 48.5m
eq('Normal tax', r1.ct.normalTax, 48500000 * 0.25168);
is('MAT applies', r1.ct.matApplies, false);
eq('Net payable', r1.ct.netPayable, 48500000 * 0.25168 - 2000000);

// Deferred: PPE TD +8m on an asset -> DTL -> signedClose = -8m*0.25168 = -2,013,440
eq('PPE signed close', r1.dt.assets[0].signedClose, -8000000 * 0.25168);
// Gratuity TD +3m on a liability -> DTA -> +3m*0.25168 = 755,040
eq('Gratuity signed close', r1.dt.liabs[0].signedClose, 3000000 * 0.25168);
eq('Gross DTA', r1.dt.grossDTA, 755040);
eq('Gross DTL', r1.dt.grossDTL, 2013440);
eq('Closing net', r1.dt.closingNet, 755040 - 2013440);
eq('Opening per rows', r1.dt.openingRows, -1006720);
eq('Opening per FS', r1.dt.openingFS, -1006720);
eq('Opening diff (must be 0)', r1.dt.openingDiff, 0);
// movement = closing(-1,258,400) - opening(-1,000,000) = -258,400 ; expense = +258,400
eq('Deferred tax P&L (charge)', r1.dt.deferredTaxPL, 251680);
eq('Offset BS DTL', r1.dt.bsDTL, 1258400);
eq('Offset BS DTA', r1.dt.bsDTA, 0);

const te1 = r1.te;
eq('Total tax expense', te1.total, 48500000 * 0.25168 + 251680);
eq('ETR %', te1.etr, (48500000 * 0.25168 + 251680) / 50000000 * 100);
eq('ETR equals statutory (only perm diffs move it)', te1.etr, 25.168 + (500000-1000000)*0.25168/50000000*100, 0.01);

// ETR recon must fully explain: only permanent diffs move the rate.
console.log('  ETR rows:');
r1.etr.rows.forEach(r => console.log(`     ${r.label.padEnd(52)} ${U.fmtBr(r.amount)}`));
eq('ETR residual (should be ~0)', r1.etr.residual, 0, 1.5);
is('Residual immaterial', r1.etr.residualMaterial, false);

// Articulation
eq('Articulation open+mvt=close', r1.dt.openingRows + r1.dt.movementTotal, r1.dt.closingNet);
is('All journals cast', r1.jes.every(j => j.balanced), true);
is('Tally: no queries', r1.tallies.queries, 0);

/* ============ CASE 2: MAT year, credit created ============ */
console.log('\n=== CASE 2 — MAT applies, credit recognised ===');
const e2 = {
  fy: '2025-26', bsDate: '2026-03-31', rate: 34.944, matRate: 17.472, applyMat: true,
  offsetPresentation: true,
  opening: { dta: 0, dtl: 0, mat: 0 },
  ct: {
    matBookProfit: 10000000, advanceTax: 0, matUtilised: 0, priorYearAdj: 0,
    rows: [
      { id: R(1), type: 'book', nature: 'perm', amt: 10000000, label: 'PBT' },
      { id: R(2), type: 'less', nature: 'temp', amt: 9000000, label: 'Tax depreciation' }
    ]
  },
  dt: {
    // PPE: tax WDV is 9m below book, so a taxable TD of 9m -> DTL
    assets: [{ id: R(30), label: 'PPE', ca: 9000000, tb: 0, open: 0, alloc: 'pl', recognised: true }],
    liabs: [], others: []
  },
  checklist: {}
};
const r2 = Compute.run(e2);
eq('Taxable income', r2.ct.taxableIncome, 1000000);
eq('Normal tax', r2.ct.normalTax, 1000000 * 0.34944);        // 349,440
eq('MAT tax', r2.ct.matTax, 10000000 * 0.17472);             // 1,747,200
is('MAT applies', r2.ct.matApplies, true);
eq('Tax for year = MAT', r2.ct.taxForYear, 1747200);
eq('MAT credit created', r2.ct.matCreditCreated, 1747200 - 349440); // 1,397,760
eq('Closing MAT credit', r2.dt.matClosing, 1397760);
// Total expense = 1,747,200 + 0 deferred + (0 utilised - 1,397,760 created) = 349,440
eq('Deferred tax charge on the temp diff', r2.dt.deferredTaxPL, 9000000 * 0.34944);
// MAT is rate-neutral once the full credit is recognised: 1,747,200 charged, 1,397,760 credited.
eq('Total tax expense', r2.te.total, 1747200 + 3144960 - 1397760);
eq('ETR = statutory (MAT is rate-neutral)', r2.te.etr, 34.944, 0.01);
eq('ETR residual', r2.etr.residual, 0, 1.5);
eq('No temp-diff gap', r2.etr.tempGap, 0, 1.5);
is('MAT JE present', r2.jes.some(j => j.ref === 'JE-5'), true);
is('All journals cast', r2.jes.every(j => j.balanced), true);

console.log('\n=== CASE 2B — Same facts, deferred tax line OMITTED: diagnostic must fire ===');
const e2b = JSON.parse(JSON.stringify(e2));
e2b.dt.assets = [];
const r2b = Compute.run(e2b);
eq('Diagnostic names the omission', r2b.etr.tempGap, -9000000 * 0.34944);
is('Diagnostic flagged material', r2b.etr.tempGapMaterial, true);
eq('Residual still nil (gap is explained by name)', r2b.etr.residual, 0, 1.5);
is('Cross-check tally raises a query', r2b.tallies.items.find(t => t.id === 'cross').state, 'query');

/* ============ CASE 3: MAT credit utilised, capped ============ */
console.log('\n=== CASE 3 — MAT credit utilisation capped at opening entitlement ===');
const e3 = JSON.parse(JSON.stringify(e2));
e3.applyMat = true; e3.opening.mat = 500000;
e3.ct.matBookProfit = 1000000;   // MAT tax = 174,720
e3.ct.rows = [{ id: R(1), type: 'book', nature: 'perm', amt: 10000000, label: 'PBT' }];
e3.ct.matUtilised = 900000;      // asks for more than the 500,000 available
const r3 = Compute.run(e3);
eq('Normal tax', r3.ct.normalTax, 10000000 * 0.34944);
is('MAT applies (no)', r3.ct.matApplies, false);
eq('MAT utilised capped', r3.ct.matUtilised, 500000);
is('Cap flagged', r3.ct.matUtilCapped, true);
is('Validation error raised', r3.validation.errors.length > 0, true);
eq('Closing MAT credit', r3.dt.matClosing, 0);

/* ============ CASE 4: refund, OCI, unrecognised DTA, tax-amount row ============ */
console.log('\n=== CASE 4 — Refund position, OCI allocation, unrecognised DTA, MAT-as-tax-amount ===');
const e4 = {
  fy: '2025-26', bsDate: '2026-03-31', rate: 25.168, matRate: 0, applyMat: false,
  offsetPresentation: false,
  opening: { dta: 0, dtl: 0, mat: 0 },
  ct: {
    matBookProfit: 0, advanceTax: 5000000, matUtilised: 0, priorYearAdj: 100000,
    rows: [{ id: R(1), type: 'book', nature: 'perm', amt: 10000000, label: 'PBT' }]
  },
  dt: {
    assets: [{ id: R(20), label: 'FVOCI investments', ca: 6000000, tb: 5000000, open: 0, alloc: 'oci', recognised: true }],
    liabs: [],
    others: [
      // Brought forward AND unrecognised last year too, so no current-year rate effect.
      { id: R(21), label: 'Business loss c/f', amt: 20000000, side: 'dta', open: 0, openUnrec: 5033600, alloc: 'pl', recognised: false, isTaxAmount: false },
      { id: R(22), label: 'MAT credit b/f (already a tax amount)', amt: 700000, side: 'dta', open: 700000, alloc: 'pl', recognised: true, isTaxAmount: true }
    ]
  },
  checklist: {}
};
const r4 = Compute.run(e4);
eq('Current tax expense (incl PY adj)', r4.ct.currentTaxExpense, 10000000 * 0.25168 + 100000);
eq('Net payable (refund => negative)', r4.ct.netPayable, 10000000 * 0.25168 + 100000 - 5000000);
is('Refund flagged', r4.ct.isRefund, true);

// FVOCI asset: CA 6m > TB 5m -> DTL of 1m*0.25168 = 251,680, allocated to OCI
eq('OCI movement', r4.dt.movementOCI, -251680);
eq('Deferred tax in OCI (charge)', r4.dt.deferredTaxOCI, 251680);
eq('Deferred tax in P&L excludes OCI', r4.dt.deferredTaxPL, 0);

// isTaxAmount row must NOT be multiplied by the rate
eq('Tax-amount row not re-taxed', r4.dt.others[1].signedClose, 700000);
// Unrecognised DTA: 20m * 25.168% = 5,033,600, excluded from balances
eq('Unrecognised DTA (closing)', r4.dt.unrecognisedDTA, 20000000 * 0.25168);
eq('Unrecognised movement is nil (b/f, already unrecognised)', r4.dt.unrecognisedMovementPL, 0);
eq('Unrecognised row excluded from closing', r4.dt.others[0].signedClose, 0);
is('Gross presentation kept separate', r4.dt.offset, false);
eq('Gross DTA (no offset)', r4.dt.grossDTA, 700000);
eq('Gross DTL (no offset)', r4.dt.grossDTL, 251680);
is('OCI journal present', r4.jes.some(j => j.ref === 'JE-4'), true);
is('All journals cast', r4.jes.every(j => j.balanced), true);
eq('ETR residual', r4.etr.residual, 0, 1.5);

console.log('\n=== CASE 7 — Unrecognised DTA arising this year moves the rate ===');
const e7 = {
  fy: '2025-26', bsDate: '2026-03-31', rate: 25, matRate: 0, applyMat: false,
  offsetPresentation: true, opening: { dta: 0, dtl: 0, mat: 0 },
  ct: {
    matBookProfit: 0, advanceTax: 0, matUtilised: 0, priorYearAdj: 0,
    rows: [
      { id: R(1), type: 'book', nature: 'perm', amt: 10000000, label: 'PBT' },
      { id: R(2), type: 'add', nature: 'temp', amt: 4000000, label: 'Gratuity provision disallowed' }
    ]
  },
  dt: {
    assets: [], liabs: [
      // The deductible TD is identified, but no future profits support the DTA.
      { id: R(40), label: 'Gratuity provision', ca: 4000000, tb: 0, open: 0, openUnrec: 0, alloc: 'pl', recognised: false }
    ], others: []
  },
  checklist: {}
};
const r7 = Compute.run(e7);
eq('Current tax on 14m', r7.ct.normalTax, 14000000 * 0.25);
eq('No deferred tax taken', r7.dt.deferredTaxPL, 0);
eq('Unrecognised DTA', r7.dt.unrecognisedDTA, 1000000);
eq('ETR line for unrecognised DTA', r7.dt.unrecognisedMovementPL, 1000000);
eq('Total expense', r7.te.total, 3500000);
eq('ETR above statutory', r7.te.etr, 35);
eq('ETR residual', r7.etr.residual, 0, 1.5);
eq('No temp-diff gap (the TD IS on the schedule)', r7.etr.tempGap, 0, 1.5);
is('Unrecognised DTA warned in validation', r7.validation.warnings.some(w => /unrecognised/i.test(w.msg)), true);

/* ============ CASE 8 — loss-making company, no DTA recognised ============ */
console.log('\n=== CASE 8 — Loss year, DTA on the loss not recognised ===');
const e8 = {
  fy: '2025-26', bsDate: '2026-03-31', rate: 25, matRate: 0, applyMat: false,
  offsetPresentation: true, opening: { dta: 0, dtl: 0, mat: 0 },
  ct: { matBookProfit: 0, advanceTax: 0, matUtilised: 0, priorYearAdj: 0,
        rows: [{ id: R(1), type: 'book', nature: 'perm', amt: -8000000, label: 'Loss before tax' }] },
  dt: { assets: [], liabs: [], others: [] }, checklist: {}
};
const r8 = Compute.run(e8);
eq('Taxable income negative', r8.ct.taxableIncome, -8000000);
eq('No tax on a loss', r8.ct.normalTax, 0);
eq('Total expense nil', r8.te.total, 0);
eq('ETR residual', r8.etr.residual, 0, 1.5);
is('Loss-relief line present', r8.etr.rows.some(x => /loss not relieved/i.test(x.label)), true);

/* ============ CASE 5: XSS-hostile label survives ============ */
console.log('\n=== CASE 5 — Hostile label handling ===');
const nasty = 'Provision "doubtful" <b>debts</b> & 40(a)(ia) \'x\'';
is('esc neutralises quotes/tags', U.esc(nasty), 'Provision &quot;doubtful&quot; &lt;b&gt;debts&lt;/b&gt; &amp; 40(a)(ia) &#39;x&#39;');
const e5 = JSON.parse(JSON.stringify(e1));
e5.dt.assets[0].label = nasty;
const r5 = Compute.run(e5);
is('Engine unaffected by label content', r5.dt.assets[0].label, nasty);

/* ============ CASE 6: formatting ============ */
console.log('\n=== CASE 6 — Indian number formatting ===');
is('Indian grouping', U.fmt(12345678), '1,23,45,678');
is('Negative in brackets', U.fmtBr(-4500), '(4,500)');
is('Zero is a dash', U.fmtBr(0), '—');
is('Zero in fmt is 0 not dash', U.fmt(0), '0');
is('Signed', U.fmtSigned(-250), '−250');
is('Percent', U.fmtPct(25.168), '25.17%');

console.log(`\n────────────────────────────\n  ${pass} passed, ${fail} failed\n────────────────────────────`);
process.exit(fail ? 1 : 0);
