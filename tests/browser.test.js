const http = require('http');
const fs = require('fs');
const path = require('path');
const pp = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json' };

// Serve over http so crypto.subtle is available (secure context).
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('nope');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  console.log(`${cond ? '  ok  ' : ' FAIL '} ${label}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

(async () => {
  await new Promise(r => server.listen(8099, r));
  const base = 'http://localhost:8099';

  const browser = await pp.launch({
    executablePath: process.env.CHROME_PATH || pp.executablePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  /* ============ 1. Sign-in page ============ */
  console.log('\n=== 1. Sign-in / registration ===');
  await page.goto(base + '/index.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));

  ok('First-run banner shown', await page.$eval('#bootstrap-banner', el => !el.classList.contains('hide')));
  ok('Register pane is open on first run', await page.$eval('#pane-register', el => !el.classList.contains('hide')));
  ok('Web Crypto available over http://localhost', await page.evaluate(() => !!crypto.subtle));
  await page.screenshot({ path: SHOTS + '/01-signin.png' });

  // Weak password must be rejected.
  await page.type('#rg-name', 'Ananya Rao');
  await page.type('#rg-desig', 'Audit Manager');
  await page.type('#rg-email', 'ananya@kgsomani.test');
  await page.type('#rg-pw', 'password');
  await page.type('#rg-pw2', 'password');
  await page.click('#rg-submit');
  await new Promise(r => setTimeout(r, 400));
  ok('Weak password rejected', await page.$eval('#auth-alert', el => el.textContent.length > 0),
     await page.$eval('#auth-alert', el => el.textContent.trim().slice(0, 60)));

  // Mismatched confirmation.
  await page.evaluate(() => { document.getElementById('rg-pw').value = ''; document.getElementById('rg-pw2').value = ''; });
  await page.type('#rg-pw', 'Ledger-Basalt-42!');
  await page.type('#rg-pw2', 'Ledger-Basalt-43!');
  await page.click('#rg-submit');
  await new Promise(r => setTimeout(r, 300));
  ok('Password mismatch caught', await page.$eval('#rg-pw2-err', el => !el.classList.contains('hide')));

  // Correct registration.
  await page.evaluate(() => { document.getElementById('rg-pw2').value = ''; });
  await page.type('#rg-pw2', 'Ledger-Basalt-42!');
  await page.click('#rg-submit');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  ok('Registered and landed in the app', page.url().includes('app.html'), page.url());

  const role = await page.evaluate(() => JSON.parse(localStorage.getItem('kgs.indas12.v3')).users[0].role);
  ok('First account became administrator', role === 'admin', role);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kgs.indas12.v3')).users[0]);
  ok('Password never stored in plaintext', !JSON.stringify(stored).includes('Ledger-Basalt-42'));
  ok('PBKDF2 hash recorded', stored.algo === 'pbkdf2-sha256' && stored.hash.length === 64, stored.algo);

  /* ============ 2. Create an engagement ============ */
  console.log('\n=== 2. Engagement entry ===');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: SHOTS + '/02-portfolio.png' });

  await page.click('#btn-new-eng');
  await new Promise(r => setTimeout(r, 500));
  ok('Landed on step 1', await page.$eval('#step-client', el => el.classList.contains('on')));

  const setField = async (sel, value) => {
    await page.focus(sel);
    await page.evaluate(s => { document.querySelector(s).value = ''; }, sel);
    await page.type(sel, String(value));
    await page.evaluate(s => document.querySelector(s).blur(), sel);
    await new Promise(r => setTimeout(r, 60));
  };

  await setField('#ci-name', 'Meridian Castings Private Limited');
  await setField('#ci-cin', 'U27100MH2011PTC221234');
  await setField('#ci-fy', '2025-26');
  await new Promise(r => setTimeout(r, 300));

  ok('Client name reaches the header', (await page.$eval('#hdr-eng-name', el => el.textContent)).includes('Meridian'));

  // Opening DTL, tying to the temporary differences entered below.
  await setField('#ob-dtl', '1006720');
  await page.screenshot({ path: SHOTS + '/03-client.png', fullPage: true });

  /* ---- Step 2: current tax ---- */
  await page.evaluate(() => location.hash = 'current');
  await new Promise(r => setTimeout(r, 400));

  const setRow = async (rowIdx, value) => {
    await page.evaluate((i, v) => {
      const inp = document.querySelectorAll('#ct-body tr')[i].querySelector('input[type=number]');
      inp.focus();
      inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.blur();
    }, rowIdx, value);
    await new Promise(r => setTimeout(r, 120));
  };

  await setRow(0, 50000000);   // profit before tax
  await setRow(1, 8000000);    // book depreciation (temp, add)
  await setRow(2, 12000000);   // tax depreciation (temp, less)
  await setRow(3, 3000000);    // gratuity provision (temp, add)
  await new Promise(r => setTimeout(r, 400));

  const taxable = await page.$eval('#ct-taxable', el => el.textContent);
  ok('Taxable income computed', taxable.replace(/[^0-9]/g, '') === '49000000', taxable);
  await page.screenshot({ path: SHOTS + '/04-current-tax.png', fullPage: true });

  /* ---- Step 3: deferred tax ---- */
  await page.evaluate(() => location.hash = 'deferred');
  await new Promise(r => setTimeout(r, 400));
  await page.click('#btn-dt-cols');  // reveal the opening columns
  await new Promise(r => setTimeout(r, 250));

  const setCell = async (bodyId, rowIdx, colIdx, value) => {
    await page.evaluate((b, r2, c, v) => {
      const inp = document.querySelectorAll('#' + b + ' tr')[r2].querySelectorAll('input[type=number]')[c];
      inp.focus(); inp.value = v;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.blur();
    }, bodyId, rowIdx, colIdx, value);
    await new Promise(r => setTimeout(r, 120));
  };

  // PPE: carrying 40m, tax base 32m, opening effect -1,006,720
  await setCell('dt-asset-body', 0, 0, 40000000);
  await setCell('dt-asset-body', 0, 1, 32000000);
  await setCell('dt-asset-body', 0, 2, -1006720);
  // Gratuity liability: carrying 3m, tax base 0
  await setCell('dt-liab-body', 0, 0, 3000000);
  await setCell('dt-liab-body', 0, 1, 0);
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({ path: SHOTS + '/05-deferred.png', fullPage: true });

  const dt = await page.evaluate(() => {
    const r = State.getResult();
    return {
      grossDTA: r.dt.grossDTA, grossDTL: r.dt.grossDTL,
      openingDiff: r.dt.openingDiff, deferredPL: r.dt.deferredTaxPL,
      queries: r.tallies.queries, residual: r.etr.residual,
      total: r.te.total, etr: r.te.etr,
      allCast: r.jes.every(j => j.balanced), jeCount: r.jes.length
    };
  });
  ok('Gross DTA correct', Math.abs(dt.grossDTA - 755040) < 1, String(Math.round(dt.grossDTA)));
  ok('Gross DTL correct', Math.abs(dt.grossDTL - 2013440) < 1, String(Math.round(dt.grossDTL)));
  ok('Opening ties to prior year', Math.abs(dt.openingDiff) < 1, String(Math.round(dt.openingDiff)));
  ok('Deferred tax charge correct', Math.abs(dt.deferredPL - 251680) < 1, String(Math.round(dt.deferredPL)));
  ok('Every journal casts', dt.allCast, dt.jeCount + ' entries');
  ok('ETR residual is nil', Math.abs(dt.residual) < 2, String(Math.round(dt.residual)));
  ok('No tally queries', dt.queries === 0, String(dt.queries));

  /* ---- Remaining steps ---- */
  console.log('\n=== 3. Every step renders ===');
  for (const [step, shot] of [['movement', '06-movement'], ['summary', '07-summary'], ['etr', '08-etr'], ['disclosure', '09-disclosure'], ['checklist', '10-checklist']]) {
    await page.evaluate(s => location.hash = s, step);
    await new Promise(r => setTimeout(r, 450));
    const filled = await page.evaluate(s => {
      const el = document.querySelector('#step-' + s);
      return el.classList.contains('on') && el.textContent.trim().length > 200;
    }, step);
    ok(`Step "${step}" renders`, filled);
    await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
  }

  /* ---- Tally rail ---- */
  const railText = await page.$eval('#rail-body', el => el.textContent);
  ok('Tally rail populated', railText.includes('Everything casts') || railText.includes('tally'), railText.slice(0, 46).trim());

  /* ---- Hostile input ---- */
  console.log('\n=== 4. Hostile input ===');
  await page.evaluate(() => location.hash = 'deferred');
  await new Promise(r => setTimeout(r, 350));
  const nasty = 'Provision "doubtful" <img src=x onerror=alert(1)> & 40(a)(ia)';
  await page.evaluate(v => {
    const inp = document.querySelectorAll('#dt-asset-body tr')[0].querySelector('input[type=text], input:not([type])');
    inp.focus(); inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.blur();
  }, nasty);
  await new Promise(r => setTimeout(r, 500));
  const roundTrip = await page.evaluate(() =>
    document.querySelectorAll('#dt-asset-body tr')[0].querySelector('input').value);
  ok('Quotes and tags survive a round trip', roundTrip === nasty, roundTrip.slice(0, 40));
  ok('No injected element in the DOM', (await page.$$('#dt-asset-body img')).length === 0);
  ok('Rows intact after hostile label', (await page.$$('#dt-asset-body tr')).length === 8);

  /* ---- Roll forward ---- */
  console.log('\n=== 5. Roll forward ===');
  await page.evaluate(() => location.hash = 'checklist');
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => document.querySelector('[data-act=rollforward]').click());
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => document.querySelector('.modal-foot .btn-primary').click());
  await new Promise(r => setTimeout(r, 700));
  const rolled = await page.evaluate(() => {
    const e = State.get();
    return { fy: e.fy, openDtl: e.opening.dtl, cleared: e.ct.rows.every(r => r.amt === '') };
  });
  ok('Next year created', rolled.fy === '2026-27', rolled.fy);
  ok('Closing became opening', Math.abs(rolled.openDtl - 1258400) < 1, String(rolled.openDtl));
  ok('Figures cleared, structure kept', rolled.cleared);

  /* ---- Persistence ---- */
  console.log('\n=== 6. Persistence ===');
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  const after = await page.evaluate(() => ({
    engs: JSON.parse(localStorage.getItem('kgs.indas12.v3')).engagements.length,
    open: State.get()?.fy
  }));
  ok('Engagements survived a reload', after.engs === 2, String(after.engs));
  ok('Reopened where we left off', after.open === '2026-27', after.open);

  /* ---- Admin console ---- */
  console.log('\n=== 7. Admin console ===');
  await page.goto(base + '/admin.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 700));
  ok('Admin console reachable', await page.$eval('#pane-overview', el => el.classList.contains('on')));
  await page.screenshot({ path: SHOTS + '/11-admin-overview.png', fullPage: true });

  for (const p2 of ['users', 'engagements', 'rates', 'checklist', 'log', 'settings']) {
    await page.evaluate(s => location.hash = s, p2);
    await new Promise(r => setTimeout(r, 350));
    const on = await page.$eval('#pane-' + p2, el => el.classList.contains('on') && el.textContent.trim().length > 100);
    ok(`Admin pane "${p2}" renders`, on);
  }
  await page.evaluate(() => location.hash = 'users');
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: SHOTS + '/12-admin-users.png', fullPage: true });

  // The last administrator must not be demotable.
  const guarded = await page.evaluate(() => {
    const sel = document.querySelector('select[data-act=role]');
    return sel ? sel.disabled : null;
  });
  ok('Last administrator is protected from demotion', guarded === true, String(guarded));

  /* ---- Auth guard ---- */
  console.log('\n=== 8. Access control ===');
  await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('kgs.indas12.v3'));
    db.session = null;
    localStorage.setItem('kgs.indas12.v3', JSON.stringify(db));
  });
  await page.goto(base + '/app.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  ok('Signed-out user bounced to the gate', page.url().includes('index.html'), page.url());

  await page.goto(base + '/admin.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  ok('Admin console also guarded', page.url().includes('index.html'), page.url());

  // Wrong password path, including the generic message.
  await page.goto(base + '/index.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  await page.type('#si-email', 'ananya@kgsomani.test');
  await page.type('#si-pw', 'WrongPassword-99!');
  await page.click('#si-submit');
  await new Promise(r => setTimeout(r, 1200));
  const msg = await page.$eval('#auth-alert', el => el.textContent);
  ok('Wrong password refused', msg.includes('incorrect'), msg.trim().slice(0, 56));

  await page.evaluate(() => { document.getElementById('si-pw').value = ''; });
  await page.type('#si-pw', 'Ledger-Basalt-42!');
  await page.click('#si-submit');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  ok('Correct password signs in', page.url().includes('app.html'));

  /* ---- Responsive ---- */
  console.log('\n=== 9. Responsive ===');
  for (const [w, h, name] of [[390, 844, '13-mobile'], [820, 1180, '14-tablet']]) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    await new Promise(r => setTimeout(r, 500));
    await page.evaluate(() => location.hash = 'summary');
    await new Promise(r => setTimeout(r, 500));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`No horizontal overflow at ${w}px`, overflow <= 1, 'overflow ' + overflow + 'px');
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  /* ---- Console errors ---- */
  console.log('\n=== 10. Console ===');
  const real = errors.filter(e => !/favicon|net::ERR_FAILED.*fonts|Failed to load resource.*fonts/i.test(e));
  ok('No console errors', real.length === 0, real.slice(0, 3).join(' | ') || 'clean');

  await browser.close();
  server.close();

  console.log(`\n────────────────────────────\n  ${pass} passed, ${fail} failed\n────────────────────────────`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); server.close(); process.exit(1); });
