# Ind AS 12 Tax Provision Workpaper

Current tax, deferred tax, movement schedules, journal entries, the effective
rate reconciliation and a draft disclosure note — computed from one set of
figures and reconciled while you type.

Plain HTML, CSS and JavaScript. No build step, no framework, no server.
Drop it on GitHub Pages and it runs.

---

## Read this first

**This is a client-side application. It is not a multi-user system.**

Everything — accounts, engagements, the activity log — is stored in the
browser's `localStorage` on the machine it is used from. That has three
consequences worth being clear about:

1. **Nothing syncs.** A workpaper prepared on your laptop does not appear on a
   colleague's. Use the JSON export to move an engagement between machines.
2. **Sign-in keeps honest users in their lane; it is not a security boundary.**
   Passwords are hashed properly (PBKDF2-HMAC-SHA256, 210,000 iterations, a
   random salt per account, no plaintext anywhere), so someone reading the
   stored data cannot read passwords. But the check itself runs in the browser,
   and anyone with developer tools can bypass it. Role permissions are the same:
   they shape the interface, they do not defend it.
3. **Anyone with access to the device profile can read the stored client data.**
   Clearing site data erases everything; a private window sees nothing.

For live client data across a team you need a backend — a real session store,
server-enforced permissions, and encryption at rest. The computation engine
(`js/compute.js`) is pure and has no DOM or storage dependencies, so it ports to
a server unchanged. That is the piece worth keeping.

Used as intended — one preparer, one machine, backups taken — it is a capable
workpaper tool. Take the backups.

---

## Getting started

### Publish on GitHub Pages

1. Push these files to a repository.
2. **Settings → Pages → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
3. Open the published URL.

### Run locally

Open `index.html` directly, or better, serve it:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Serving it matters. Opening the file over `file://` puts the browser in an
insecure context where the Web Crypto API is withheld, so password hashing falls
back to a slower pure-JavaScript implementation with fewer iterations. The app
says so on screen when that happens.

### First run

The **first account created becomes the administrator.** There is no default
password shipped in the code, because publishing one on a public URL would be
worse than useless.

Once the team is set up, switch off **Settings → Access → anyone with the link
can create their own account**, so new accounts are only created from the admin
console.

---

## What it does

### The eight steps

| | Step | What happens |
|---|---|---|
| 1 | Client & engagement | Entity, reporting date, rate, opening balances, sign-off |
| 2 | Current tax | Profit before tax to taxable income, with MAT tested u/s 115JB |
| 3 | Deferred tax | Carrying amount against tax base, line by line |
| 4 | Movement | Opening + movement = closing, split between P&L and OCI |
| 5 | Summary & journals | Tax expense, balance sheet position, entries to post |
| 6 | Effective rate | Ind AS 12.81(c) reconciliation, fully derived |
| 7 | Disclosure note | Draft note for the annual report |
| 8 | Checklist & sign-off | 22 points, each recording who marked it and when |

### The tally rail

The panel on the right keeps eight reconciliations live while you type:

- every journal casts, debits equal credits
- opening balances agree to the prior year signed accounts
- opening plus movement equals closing
- the MAT credit schedule reconciles
- the effective rate is explained within tolerance
- the balance sheet presentation is consistent
- the rate is within a sane range
- temporary differences in step 2 also appear in step 3

Each one clicks through to the step that needs attention. This is the reason to
use the tool rather than a spreadsheet: an error surfaces at the keystroke
rather than at review.

### Other things worth knowing

- **Roll forward.** Creates next year's engagement with closing balances carried
  in as opening balances, every line description kept, figures cleared.
- **Exports.** Excel (nine sheets), print or save as PDF (a paginated workpaper
  with a sign-off block), JSON backup, CSV of the deferred tax schedule. Only
  Excel needs the network; the rest work offline.
- **Keyboard.** `Ctrl/⌘+S` save · `Ctrl/⌘+←/→` step · `Alt+1…8` jump ·
  `Ctrl/⌘+P` print · `Ctrl/⌘+J` tally rail · `?` shortcut list.

---

## Accounting basis

### Sign convention

Deferred tax is carried as one signed net figure per line: **positive is an
asset, negative is a liability.** That is what lets opening + movement = closing
articulate on a single axis, which is the point of the balance sheet approach.

### Temporary differences — Ind AS 12.15 to 12.24

```
temporary difference = carrying amount − tax base

Asset      CA > TB → taxable difference     → liability
           CA < TB → deductible difference  → asset
Liability  CA > TB → deductible difference  → asset
           CA < TB → taxable difference     → liability
```

### Tax expense

```
current tax expense = tax for the year + tax of earlier years
deferred tax (P&L)  = −(movement in P&L-allocated net deferred tax)
deferred tax (OCI)  = −(movement in OCI-allocated net deferred tax)
MAT credit effect   = credit utilised − credit recognised
total tax expense   = current + deferred (P&L) + MAT credit effect
```

### Effective rate reconciliation

Only permanent differences move the effective rate. A temporary difference
lowers current tax and raises deferred tax by the same amount, so it nets to
nil — which is exactly why the reconciliation is a useful check rather than a
formality.

The reconciliation is fully derived from the data entered. If it does not
explain itself, the tool says which line is missing rather than plugging the
gap:

- **"Temporary differences not carried to the deferred tax schedule"** appears
  when something tagged temporary in step 2 has no matching line in step 3.
  It should be nil in a complete workpaper.
- **"Other items and rounding"** is a genuine residual. Above half a percent of
  profit before tax it is flagged for investigation.

### Also handled

- Tax on items in OCI charged to OCI, not profit or loss — **12.61A**
- Unrecognised deferred tax assets excluded from balances and disclosed, with
  the effective rate reflecting the *movement* rather than the brought-forward
  balance — **12.81(e)**
- Offset only where elected, with the note wording following — **12.74**
- MAT credit tracked as a tax amount and never multiplied by the rate a second
  time — **s.115JAA**
- Refund positions shown as refunds, not clamped to zero
- MAT credit utilisation capped at the opening entitlement, and blocked in a
  year in which MAT itself applies

---

## Structure

```
index.html          Sign in and register
app.html            The workpaper
admin.html          Admin console
favicon.svg

css/
  base.css          Design tokens, primitives, form and table styles
  app.css           Workpaper shell, tally rail, journals, disclosure
  auth.css          Sign-in page
  admin.css         Console
  print.css         A4 workpaper, rebuilt for paper

js/
  core/util.js      DOM, Indian number formatting, escaping, toasts, modals
  core/store.js     localStorage schema, migrations, CRUD, audit log
  core/hash.js      PBKDF2-SHA256 with a pure-JS fallback
  core/auth.js      Sessions, lockout, roles, route guards
  compute.js        The Ind AS 12 engine — pure, no DOM, no storage
  render.js         HTML builders — pure functions, result in, markup out
  state.js          Open engagement, data binding, autosave
  ui.js             Controller for app.html
  admin.js          Controller for admin.html
  export.js         Excel, print, JSON, CSV
  auth-page.js      Controller for index.html

tests/
  engine.test.js    85 assertions across 8 accounting scenarios (Node)
  browser.test.js   48 end-to-end assertions (Puppeteer)
```

### Design notes

Colour carries meaning rather than decoration: indigo is interactive, green is
an asset or credit, red is a liability or charge, amber is an auditor's query.
Nothing else is coloured. Figures are set in a monospaced face with tabular
numerals so columns of rupees align. The disclosure note renders in a serif,
because it is destined for a printed annual report rather than a screen.

---

## Roles

| | Administrator | Manager | Preparer | Read only |
|---|---|---|---|---|
| Create engagements | ✓ | ✓ | ✓ | |
| Edit any engagement | ✓ | ✓ | | |
| Edit own engagements | ✓ | ✓ | ✓ | |
| Sign off | ✓ | ✓ | | |
| Delete any engagement | ✓ | | | |
| Manage people | ✓ | | | |
| Manage the rate master | ✓ | | | |
| View activity | ✓ | ✓ | | |

The last active administrator cannot be demoted, suspended or deleted, so it is
not possible to lock everyone out.

---

## Testing

```bash
node tests/engine.test.js     # accounting, no browser needed
node tests/browser.test.js    # end to end, needs Puppeteer
```

The engine tests cover a profitable company with a DTL, a MAT year with credit
recognised, capped credit utilisation, a refund position with OCI allocation and
unrecognised assets, a loss year, and labels containing quotes and HTML.

---

## Before live use

- [ ] Check the rate master against the current Finance Act
- [ ] Review the 22 checklist points against firm methodology
- [ ] Switch off self-registration once the team is set up
- [ ] Set a session length that suits the office
- [ ] Agree who takes the weekly backup, and where it is kept
- [ ] Decide whether client data may sit in browser storage at all — see the
      note at the top

If Google Fonts is blocked on the firm's network, or you would rather not call
out to it, download Archivo, IBM Plex Mono and Source Serif 4, drop them in an
`assets/fonts/` folder and replace the `@import` at the top of `css/base.css`
with `@font-face` rules. The layout does not depend on them; only the
typography changes.

---

## Limitations

- One entity per engagement. No consolidation, and no separate handling of
  branches or overseas taxing authorities.
- One rate per engagement. Items taxed at a different rate — long-term capital
  gains, for instance — need a manual adjustment and will show up in the ETR
  residual.
- Business combination temporary differences and the initial recognition
  exception are on the checklist but not computed.
- Uncertain tax positions under Appendix C to Ind AS 12 are not modelled.
- Ind AS 12 only. The AS 22 option changes the note wording but the computation
  remains the balance sheet approach, so treat AS 22 output as indicative.

---

## Disclaimer

This tool supports the professional judgement of the engagement team. It does
not replace it. Every figure it produces should be reviewed by a qualified
chartered accountant against the underlying records and the law as it stands at
the reporting date.
