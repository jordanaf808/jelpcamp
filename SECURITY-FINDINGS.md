# Security Findings — YelpCamp v12

Audit performed 2026-08-31 against `package-lock.json` (lockfileVersion 3,
last updated Sep 2023) on Node v24.11.0 / npm 11.15.0.

Methodology and command reference: `Dev/Notes/Security/node-dependency-audit-playbook.md`.

> **Status — updated 2026-09-04**
>
> **Part 1 is done.** All 25 advisories cleared. `npm audit` now reports
> **3 moderate**, a later regression from new `qs` advisories no Express 4 release
> can fix — see Phase 4.
>
> **Part 2 is in progress.** Item 1 (helmet + CSP) is on
> `fix/security-findings-phase-2`, [PR #5](https://github.com/jordanaf808/jelpcamp/pull/5).
> Item 2 (sanitize RIDB HTML) is on `fix/sanitize-ridb-html`. **Part 3 is untouched.**
> See the [Remediation checklist](#remediation-checklist) for current state.

## Summary

```
25 vulnerabilities — 2 critical, 10 high, 8 moderate, 5 low
```

The important detail behind that number: **all 25 report `fixAvailable: true`
with no `isSemVerMajor` flag.** Every one is patchable inside the existing `^`
ranges via a plain `npm audit fix` — no forced major upgrades, no breaking
changes. This is a stale-lockfile backlog, not a rewrite.

The dependency work is roughly 15 minutes. The findings in
[Part 2](#part-2--what-npm-audit-cannot-see) are the ones that need actual thought.

---

## Part 1 — Dependency vulnerabilities

> **Snapshot of the 2026-08-31 assessment.** The version numbers and the count of 25
> advisories below are **pre-fix**, kept as the record of what was found and why each
> advisory applied. All 25 were patched on 2026-09-01 — for current versions and what
> is still open, see the [Remediation checklist](#remediation-checklist).

### By severity and fix type

| Severity | Scope | Package | Fix |
|---|---|---|---|
| critical | transitive | `form-data` | in-range |
| critical | **direct** | `mongoose` | in-range |
| high | **direct** | `axios` | in-range |
| high | **direct** | `body-parser` | in-range |
| high | **direct** | `express` | in-range |
| high | transitive | `brace-expansion`, `ip`, `minimatch`, `nanoid`, `path-to-regexp`, `postcss`, `socks` | in-range |
| moderate | **direct** | `axios-cache-interceptor`, `ejs`, `joi`, `sanitize-html` | in-range |
| moderate | transitive | `bn.js`, `follow-redirects`, `protocol-buffers-schema`, `qs` | in-range |
| low | **direct** | `express-session` | in-range |
| low | transitive | `cookie`, `on-headers`, `send`, `serve-static` | in-range |

### Transitive vulns traced to their parents

16 of the 25 are inherited. Bumping 7 direct dependencies clears all of them:

```
follow-redirects, form-data          <- axios
qs                                   <- express, body-parser
cookie, path-to-regexp, send,        <- express
  serve-static
on-headers                           <- express-session
bn.js, ip, socks                     <- connect-mongo
brace-expansion, minimatch           <- ejs
nanoid, postcss                      <- sanitize-html
protocol-buffers-schema              <- mapbox-gl
```

### Reachability triage

Sorted by actual risk to this app, which is **not** the same order as severity:

#### 🔴 Reachable — fix first

**`mongoose` search injection** — [GHSA-vg7j-7cwx-8wgw](https://github.com/advisories/GHSA-vg7j-7cwx-8wgw) (critical), plus [GHSA-m7xq-9374-9rvx](https://github.com/advisories/GHSA-m7xq-9374-9rvx) (high) and [GHSA-wpg9-53fq-2r8h](https://github.com/advisories/GHSA-wpg9-53fq-2r8h) — `$nor` not sanitized by `sanitizeFilter`.

Installed `7.5.0`; the `$nor` issue affects `<=7.8.8`, so all three apply. This
app queries user-supplied input against Mongo throughout `routes/`, so untrusted
input reaches the vulnerable code path on ordinary requests. `express-mongo-sanitize`
is mounted at [app.js:36](app.js#L36), which strips `$`-prefixed keys and reduces
exposure — but it is defence-in-depth, not a patch. **Fix regardless.**

**`express` open redirect** — [GHSA-rv95-896h-c2vc](https://github.com/advisories/GHSA-rv95-896h-c2vc) (moderate, affects `<4.19.2`; installed `4.18.2`).

Matters here specifically because of the `returnTo` redirect pattern in
[middleware/index.js](middleware/index.js) — `req.session.returnTo` is set from
`req.originalUrl` and later redirected to. Worth confirming that path can't be
steered to an external host after patching.

**`body-parser` DoS** — [GHSA-qwcr-r2fm-qrc7](https://github.com/advisories/GHSA-qwcr-r2fm-qrc7) (high, `<1.20.3`) — reachable via URL-encoded bodies, which every form on the site posts. Note this arrives *transitively through Express*, not through the direct dep (see below).

#### 🟡 Free to patch, low practical risk

- **`form-data` weak boundary** — [GHSA-fjxv-7rqg-78g4](https://github.com/advisories/GHSA-fjxv-7rqg-78g4) (critical). Reaches you only through `axios` multipart posts. This app uses axios for `GET` requests to the RIDB API, so the vulnerable path likely never executes. Critical by CVSS, near-zero by reachability.
- **`sanitize-html`** — [GHSA-vccv-cmxp-4j9h](https://github.com/advisories/GHSA-vccv-cmxp-4j9h) — incomplete URI-scheme validation allowing `javascript:` URIs. Your config in [middleware/index.js:18](middleware/index.js#L18) uses `allowedTags: []` / `allowedAttributes: {}` (strip everything), so the attribute-based bypass doesn't apply to how you call it. Patch anyway; don't rely on the config staying that strict.
- **`postcss`, `nanoid`, `bn.js`, `socks`, `ip`, `protocol-buffers-schema`** — build/tooling-layer packages that never execute on a request path.

#### ⚪ Removable — no patch needed

Three direct dependencies aren't used at all (verified by `grep` across
`app.js`, `routes/`, `middleware/`, `models/`, `utils/`, `views/`, `public/`):

| Package | Evidence | Note |
|---|---|---|
| `body-parser` | 0 source references | [app.js:31](app.js#L31) uses the built-in `express.urlencoded()`. Redundant since Express 4.16. Express carries its own copy — removing the direct dep is cleanup, not a fix. |
| `connect-ensure-login` | 0 source references | Superseded by the hand-rolled `isLoggedIn` in [middleware/index.js](middleware/index.js). |
| `mapbox-gl` | `require` commented out at [routes/index.js:7](routes/index.js#L7) | Loaded from the Mapbox CDN in [views/partials/headerBack.ejs:30](views/partials/headerBack.ejs#L30). The npm copy is a large unused browser bundle; it is the sole source of the `protocol-buffers-schema` advisory. |

### Recommended sequence

**Step 2 ran on 2026-09-01 (0 vulnerabilities). Step 1 has not been run, and the
lockfile from step 2 is still uncommitted.**

```bash
git checkout -b security/dependency-audit

# 1. remove dead weight first — smallest tree to patch     <-- NOT YET RUN
npm uninstall body-parser connect-ensure-login mapbox-gl
npm start                                   # verify the app still boots
git commit -am "chore: remove unused dependencies"

# 2. take the free patches                                 <-- DONE, NOT COMMITTED
npm audit fix                               # NOT --force
npm audit                                   # expect: 0 vulnerabilities
npm start
git commit -am "chore(security): apply non-breaking dependency patches"
```

Manually exercise afterward: login/register, create a campsite, post a comment,
load the map page, and run a search.

### Deferred: major upgrades

**No longer deferred — Express 4 -> 5 became mandatory on 2026-09-04.** New `qs`
advisories were published that no Express 4 release can resolve: Express 4.22.2
(the newest 4.x) declares `qs: ~6.15.1`, which caps below the patched `qs@6.16.0`.
`npm audit fix --force` proposes `qs@6.15.3` — still inside the vulnerable range.

A `qs` override is in place as a stopgap. See **Phase 4** in the
[Remediation checklist](#remediation-checklist) for the migration plan.

---

## Part 2 — What `npm audit` cannot see

`npm audit` reads the lockfile. It has never read `app.js`. These findings are
invisible to it, to Dependabot, and to the "0 vulnerabilities" message you'll
see after Part 1.

### 🔴 Security headers are disabled

`helmet` is in `dependencies` but **commented out** — the `require` at
[app.js:13](app.js#L13) and the entire CSP block at [app.js:38–91](app.js#L38-L91).

The app currently serves **no CSP, no `X-Frame-Options`, no `X-Content-Type-Options`,
no HSTS.** Combined with the XSS sink below, this is the most serious finding in
the document — CSP is the layer that turns a successful injection into a blocked
script.

The commented block is a real, near-complete config listing your Mapbox,
Bootstrap, FontAwesome, jQuery, Flickr and Google Maps origins. Re-enabling it is
mostly verification work, not authoring. Expect breakage on first attempt and use
report-only mode to find it without breaking the site:

```js
app.use(helmet.contentSecurityPolicy({ directives: {...}, reportOnly: true }))
```

Watch the browser console for violations, fix the directives, then flip
`reportOnly` off. Note `scriptSrc` includes `'unsafe-inline'`, which substantially
weakens CSP against XSS — acceptable to start, worth removing later by moving the
inline `<script>` blocks in the campsite views into files.

### 🔴 Unescaped third-party data rendered into the page

EJS `<%- %>` interpolates **without escaping**. These render RIDB API data:

- [views/campsites/campsites.ejs:191](views/campsites/campsites.ejs#L191) — `<%-name.FacilityDescription%>`
- [views/campsites/results.ejs:218](views/campsites/results.ejs#L218)
- [views/campsites/index.ejs:224](views/campsites/index.ejs#L224)
- [views/campsites/show.ejs:50](views/campsites/show.ejs#L50) — `<%-data.recData.FacilityDescription%>`

Your `sanitize-html` Joi extension in [middleware/index.js](middleware/index.js)
correctly covers *user-submitted* content (comment text, username). **API
responses never pass through it.** The implicit assumption is that recreation.gov
is trustworthy — probably true, but it means your XSS posture depends on a third
party's content moderation, and `FacilityDescription` is free-text government data
that genuinely contains markup.

Two options: run API responses through the same `sanitizeHtml` call before
rendering (keeps intended formatting, strips scripts), or switch to `<%= %>`
(fully safe, but descriptions lose their HTML formatting). The first is better here.

**Correction (2026-09-04):** only **three** of those four are live.
`campsites.ejs` is rendered by nothing — see the dead-code list in Phase 4.
Current line numbers are index.ejs:226, results.ejs:220, show.ejs:50.

**A fourth sink, not originally listed:** [public/js/map.js](public/js/map.js)
built its Mapbox popup with `.setHTML()`, interpolating the RIDB `FacilityName`
and `FacilityTypeDescription` straight into an HTML string. Same third-party data,
client-side sink. `gmap.js` already avoided this using `textContent`.

~~Also flagged, lower priority: results.ejs:231 and index.ejs:238 inject
`<%- JSON.stringify(mapData).toLowerCase() %>` directly into a `<script>` block.~~
**Closed 2026-09-04** by the CSP work — those `<script>` blocks no longer exist.
Map data now travels through escaped `data-` attributes read by `public/js/map.js`.

### 🟡 Session cookie: two gaps

[app.js:106–117](app.js#L106-L117) is largely correct — `httpOnly: true`,
`resave: false`, `saveUninitialized: false`, and a real `MongoStore` rather than
`MemoryStore`. The secret is now split in two (2026-09-05): `SESSION_SECRET` signs
the cookie, `SESSION_STORE_SECRET` encrypts the payload at rest. Two things missing:

1. **No `secure: true`** — the session cookie will transmit over plain HTTP. Set it conditionally: `secure: process.env.NODE_ENV === 'production'`.
2. **No `sameSite`** — add `sameSite: 'lax'` for CSRF defence-in-depth.

**Separate bug, same block:** `expires: Date.now() + 1000 * 60 * 60 * 24 * 7`
([app.js:113](app.js#L113)) is evaluated **once at module load**, not per session.
Every session issued gets an expiry of one week after *server start*, so sessions
issued eight days into an uptime period are born already expired. `maxAge` on the
next line is relative and works correctly — delete the `expires` line and keep
`maxAge`.

### 🟡 No rate limiting on authentication

No `express-rate-limit` anywhere in the project. The login route accepts unlimited
attempts. `passport-local-mongoose` hashes correctly with pbkdf2, so this is
online-guessing exposure rather than a hashing weakness — but a public deployment
should throttle `/login` and `/register`.

### 🟢 Secrets — clean, one thing to verify

`.env` is gitignored, `.env.example` documents the required vars without values,
and recent commits (`96be9ad`, `84c46e5`, `396e95d`) moved a hardcoded Google Maps
key and the session secret into env vars. `git log --all --full-history -- .env`
returns nothing — **`.env` was never committed.**

One item remains: the Google Maps key removed in `96be9ad` was in the working tree
before that commit. Confirm whether it was ever *committed* under a different path,
and if so, **rotate it** — removing a secret from the current tree does nothing for
a value already in history.

```bash
git log --all --full-history -p -S 'AIza' -- . | head -40
```

### 🟢 No `engines` field, no CI, no tests

`package.json` has no `engines`, so nothing prevents running this on an EOL Node
with unpatched runtime CVEs. Add:

```json
{ "engines": { "node": ">=20.0.0" } }
```

`"test"` is still the npm default `echo "Error: no test specified" && exit 1`, and
there is no `.github/` directory. **This is the blocker for Dependabot** — see below.

---

## Part 3 — Dependabot

**Recommended: yes, but after Part 1, and alerts before PRs.**

Order of operations:

1. **Clear the backlog manually first** (Part 1). Not because Dependabot can't — grouped security updates would collapse all 25 into one PR — but because a bot has no idea which of these are reachable in your code. Doing the triage once is how you learn where the real risk sits.
2. **Enable Dependency graph + Dependabot alerts.** Highest value-to-noise ratio available: free, no PRs, and it tells you when something you depend on gets a new advisory. Turn this on for *every* old repo, including ones you'll never touch again.
3. **Enable security updates** once there's a test suite (below).
4. **Version updates last**, grouped, majors ignored.

Config, once you get there:

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      security-patches:
        applies-to: security-updates
        patterns: ["*"]
      routine-updates:
        applies-to: version-updates
        patterns: ["*"]
        update-types: ["minor", "patch"]
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]
```

### The honest caveat for this repo

**Dependabot's usefulness scales with your test suite, and this project has none.**

A green Dependabot PR with no tests confirms the package installed. It says
nothing about whether login still works or the map still renders. You'd be
choosing between merging blind and ignoring the bot — and an ignored bot is worse
than no bot, because it manufactures the feeling of coverage.

So the highest-leverage next step after Part 1 is not Dependabot. It's a few
integration tests over the auth flow and campsite CRUD, plus:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'npm' }
      - run: npm ci
      - run: npm test
      - run: npm audit --audit-level=high
```

That last line gives you an audit gate on every push regardless of Dependabot,
and turns Dependabot from a liability into something you can actually trust to
merge.

And note what Dependabot would report on this repo **today, after Part 1 is done**:
zero problems. Helmet disabled, unescaped API data, an unauthenticated login
endpoint, and a session-expiry bug — all invisible to it. That gap is the whole
argument for Part 2.

---

## Priority order

| # | Action | Effort | Why |
|---|---|---|---|
| 1 | Remove 3 unused deps, `npm audit fix` | 15 min | Clears all 25 advisories, zero breaking changes |
| 2 | Re-enable `helmet` + CSP (report-only first) | 1–2 hrs | Biggest single risk reduction; config already written |
| 3 | Sanitize `FacilityDescription` before render | 30 min | Closes the live XSS sink |
| 4 | Fix session `expires` bug; add `secure` + `sameSite` | 15 min | One real bug, two hardening flags |
| 5 | Add `engines`, `.nvmrc` | 5 min | Pins the runtime |
| 6 | Rate-limit `/login`, `/register` | 30 min | Only if publicly deployed |
| 7 | Integration tests + CI workflow | half day | Prerequisite for trusting #9 |
| 8 | Major upgrades — mongoose first | ongoing | One library per PR |
| 9 | Dependabot alerts, then grouped security updates | 10 min | Keeps #1 from recurring |

Steps 2–4 are the ones `npm audit` will never tell you about, and they carry more
real risk than all 25 advisories combined.

---

## Remediation checklist

Current state as of **2026-09-01**. Verified against the repo, not assumed.

### ✅ Phase 1 — Dependency patches (done)

- [x] Confirm every advisory is in-range (`fixAvailable: true`, no `isSemVerMajor`)
- [x] Run `npm audit fix` — **no `--force` needed**
- [x] Verify `npm audit` → **0 vulnerabilities**

Versions confirmed installed after the fix:

| Package | Before | After | Clears |
|---|---|---|---|
| `mongoose` | 7.5.0 | **7.8.12** | search injection (critical), `$nor` sanitize bypass, prototype pollution |
| `express` | 4.18.2 | **4.22.2** | open redirect, plus `send`/`serve-static`/`path-to-regexp`/`qs`/`cookie` |
| `axios` | 1.4.0 | **1.19.0** | SSRF, CSRF, DoS, `form-data` + `follow-redirects` |
| `sanitize-html` | 2.11.0 | **2.17.7** | URI-scheme validation, plus `postcss`/`nanoid` |
| `express-session` | 1.17.3 | **1.19.0** | `on-headers` |
| `ejs` | 3.1.9 | **3.1.10** | `minimatch`/`brace-expansion` |
| `joi` | 17.9.2 | **17.13.6** | moderate advisory |

> **Note:** only `package-lock.json` changed — `package.json` was untouched. That's
> correct behavior: the existing `^` ranges already permitted these versions, so the
> lockfile was simply the stale part. It also means **the fix only holds if the lockfile
> is committed.** A fresh `npm install` without it would re-resolve and could drift.

### ⬜ Phase 1b — Finish the dependency pass (open)

- [ ] Commit the lockfile — currently modified but **uncommitted**
- [ ] Remove the 3 unused direct deps, still present in `package.json`:
      `npm uninstall body-parser connect-ensure-login mapbox-gl`
- [ ] Smoke test: login/register → create campsite → post comment → load map → run a search
- [ ] Commit and open the PR

```bash
git add package-lock.json SECURITY-FINDINGS.md
git commit -m "chore(security): patch all 25 advisories via npm audit fix"
npm uninstall body-parser connect-ensure-login mapbox-gl
npm start   # smoke test before committing
git commit -am "chore: remove unused dependencies"
```

### ⬜ Phase 2 — What `npm audit` can't see (open — the real work)

Ordered by risk. These are unaffected by Phase 1 and are why "0 vulnerabilities"
overstates the app's actual security posture.

- [x] **Re-enable `helmet` + CSP** — done, [PR #5](https://github.com/jordanaf808/jelpcamp/pull/5)
  - [x] Call `helmet()`, not `helmet.contentSecurityPolicy()` alone — the old block
        would have shipped the CSP and none of the other headers
  - [x] `scriptSrc` ships with **no `'unsafe-inline'`** — all inline scripts were
        extracted to `public/js/` rather than deferring this to "later"
  - [x] Verified locally: Mapbox renders, zero CSP violations
  - [ ] ~~Bump `helmet` 7 → 8~~ — deferred to Phase 4, kept out of the CSP diff
  - [x] **Google Maps CSP verified in production 2026-09-05** — deployed and checked in
        DevTools: no CSP violations, map renders. `frame-src *.google.com` was **not**
        needed. The only console output is the pre-existing `google.maps.Marker`
        deprecation warning, tracked separately under Phase 4.
- [x] **Sanitize RIDB API data before rendering** — done, branch `fix/sanitize-ridb-html`
  - [x] New `utils/sanitizeDescription.js` — a **display** allowlist (`p h1-h4 ul ol li
        br hr strong b em i a`), derived from 276 facilities sampled across 6 RIDB
        queries. Deliberately **not** the `middleware/index.js` config: that one strips
        every tag, which is right for *rejecting* user input but would gut the
        descriptions this is meant to preserve
  - [x] Anchors get `rel="noopener noreferrer nofollow"` + `target="_blank"` forced via
        `transformTags`, overwriting whatever the API sends
  - [x] Applied at the two **fetch boundaries** (`utils/mutateData.js` for index/results,
        the show route for the single-facility fetch), not at the four render sites — so
        a new view cannot reintroduce the sink
  - [x] Fixed the **unlisted fourth sink**: `public/js/map.js` built its Mapbox popup with
        `.setHTML()`; now `setDOMContent` with `textContent`, matching `gmap.js`
  - [x] `<%-media%>` → `<%=media%>` at show.ejs:14 (a loop index, safe, but a `<%-` a
        future reader could copy)
  - [x] ~~Fix `JSON.stringify` → `<script>` injection~~ — already closed by the CSP work
  - [x] Verified: index, search and show all render 200 with formatting intact; injection
        payloads (`<script>`, `onerror`, `javascript:`, `<iframe>`, `<svg onload>`,
        `</script>` breakout) all neutralized
- [x] **Session cookie** — done 2026-09-05
  - [x] Deleted the `expires` line (**real bug** — evaluated once at module load).
        Verified fixed: two sessions issued 2s apart now carry expiries 3s apart,
        where previously every session in a process shared one absolute expiry.
  - [x] Added `secure: process.env.NODE_ENV === 'production'`
  - [x] Added `sameSite: 'lax'`
  - [x] **Also required, and not in the original finding:** `app.set('trust proxy', 1)`.
        Render terminates TLS at its proxy and forwards plain HTTP, so Express would
        see an insecure connection and refuse to set a `secure` cookie — breaking login
        in production while working locally. Verified all three cases: dev sets the
        cookie without `Secure`; production over plain HTTP sets **no cookie**;
        production with `X-Forwarded-Proto: https` sets it **with** `Secure`.
- [ ] **Pin the runtime** — add `"engines": { "node": ">=20.0.0" }` and a `.nvmrc`
- [x] **Rate-limit auth** — done 2026-09-05. `express-rate-limit` 8.7.0 on **POST**
      `/login` (10 per 15 min) and **POST** `/register` (5 per hour). GET forms are
      unlimited. Verified: attempt 11 and attempt 6 return 429 respectively, with the
      form re-rendered and the message shown.
  - Deliberately **no** `skipSuccessfulRequests` on login: passport uses
    `failureRedirect`, so a failed login returns 302 exactly like a success, and status
    code cannot separate them. 10/15min is generous enough that a real person never
    reaches it.
  - Handler **renders** rather than redirects. `res.redirect()` overwrites statusCode
    with 302, discarding the 429 that logs and monitoring need; a 429 with a Location
    header is useless since browsers only follow 3xx.
  - `trust proxy` is `1`, not `true`, so express-rate-limit's
    `ERR_ERL_PERMISSIVE_TRUST_PROXY` check does not fire. Confirmed no warning at boot.
  - **Known limits:** default in-memory store, so counters reset on deploy and are
    per-instance if ever scaled. Per-IP keying means a shared NAT shares a budget.
- [ ] **Verify the Google Maps key** was never committed under another path; rotate if it was
      — `git log --all --full-history -p -S 'AIza' -- . | head -40`

### ⬜ Phase 3 — Keep it fixed (open)

- [ ] Integration tests over auth flow + campsite CRUD (replaces the `"no test specified"` stub)
- [ ] `.github/workflows/ci.yml` with `npm ci`, `npm test`, `npm audit --audit-level=high`
- [ ] Enable **Dependency graph + Dependabot alerts** (do this now — free, zero noise)
- [ ] Enable **grouped security updates** — only once CI exists
- [ ] Add `.github/dependabot.yml` with majors ignored

### ⬜ Phase 4 — Major upgrades (ongoing, one PR each)

Still outstanding after Phase 1 — `npm audit` is clean, but these are 1–3 majors behind
and an EOL major eventually means *no fix available* for a future advisory.

| Package | Current | Latest | Priority |
|---|---|---|---|
| `mongoose` | 7.8.12 | 9.9.4 | **Highest** — 2 majors behind; verify v7 EOL status |
| `express` | 4.22.2 | 5.2.1 | High — v4 is in maintenance |
| `ejs` | 3.1.10 | 6.0.1 | Medium — 3 majors behind |
| `joi` | 17.13.6 | 18.2.5 | Medium — re-verify the custom `escapeHTML` extension |
| `helmet` | 7.0.0 | 8.3.0 | Bundle with the CSP work above |
| `connect-mongo` | 5.0.0 | 6.0.0 | Low |
| `passport` | 0.6.0 | 0.7.0 | Low |
| `mapbox-gl` | 2.15.0 | 3.29.0 | Moot if removed — but reconcile the **v1.12.0 pinned in the CDN `<script>` tags** |

Check <https://endoflife.date> before ordering these.

#### 🔴 Express 4 -> 5 — required, not optional (added 2026-09-04)

Three new `qs` advisories ([GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g),
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx),
[GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)) are
unfixable on Express 4 — see the note in Part 1. This is the "EOL major means no fix
available" scenario, arriving earlier than expected.

**Stopgap NOT yet in place** (corrected 2026-09-04 — `package.json` still holds an
empty `"overrides": {}`). `qs@6.16.0` was published `2026-08-29T23:50Z` and
`min-release-age=7` in `~/.npmrc` blocks it until **2026-09-05 ~23:50 UTC**. That is
the guard working; wait rather than passing `--min-release-age=0`.

Once it ages in, `npm pkg set overrides.qs="^6.16.0"` forces `qs` past Express 4's
declared `~6.15.1`, so it runs a version Express was not tested against.
**Technical debt — remove when Express 5 lands.**

- [ ] **Migrate to Express 5** ([official guide](https://expressjs.com/en/guide/migrating-5.html))

Migration surface, scanned against this codebase on 2026-09-04:

| Change | Where | Notes |
|---|---|---|
| `req.query` is a read-only getter | [app.js:36](app.js#L36) | **Test this first.** `express-mongo-sanitize` mutates `req.query` in place; Express 5 makes it non-writable. Fails at runtime, not install. Likely needs a config change, a replacement, or `req.body`-only sanitizing |
| `res.redirect('back')` removed | 13 live call sites | `middleware/index.js` x9, `routes/comments.js` x3, `routes/users.js` x1. Replace with `res.redirect(req.get('Referrer') \|\| '/')` |
| Wildcards must be named | [app.js:144](app.js#L144) | `app.all('*', ...)` -> `app.all('*splat', ...)` |
| `req.body` is `undefined` when unparsed | any `req.body.x` | Was `{}` in v4, so bodyless requests now throw instead of yielding undefined |
| Rejected promises auto-forwarded | [utils/catchAsync.js](utils/catchAsync.js) | **Delete it** and unwrap every `catchAsync(...)` — Express 5 does this natively |

Verified as **not** affected: route patterns (all plain `:param`),
`express.urlencoded({extended: true})` (already explicit at [app.js:31](app.js#L31)),
Node version (24, needs >=18). No `req.param()`, `res.sendfile`, `app.del`,
`res.json(obj, status)` or `res.send(status)` anywhere.

- [ ] **Delete `routes/old.campgrounds.js` first** — not mounted in `app.js`, but holds
      3 of the 16 `redirect('back')` hits. Deleting it before migrating avoids
      migrating dead code.
- [ ] **Fix the latent bug at [routes/users.js:22](routes/users.js#L22)** —
      `res.redirect('back', {error: "User Not Found..." })` passes an options object
      where Express expects a status code. That flash message has never worked.
- [ ] **Remove the `qs` override** once Express 5 is in and `npm audit` is clean.

#### Client-side API deprecations

Not security findings — maintenance debt in third-party browser APIs, tracked here
because nothing else in the repo tracks it and `npm audit` cannot see it.

- [ ] **`google.maps.Marker` deprecated 2024-02-21** — migrate to `google.maps.marker.AdvancedMarkerElement`
  - [views/campsites/show.ejs:233](views/campsites/show.ejs#L233) — **the live template; this is the one that matters**
  - [views/campgrounds/show.ejs:140](views/campgrounds/show.ejs#L140) — dead code per commit `96be9ad`; **delete rather than migrate**
  - *Not urgent:* no discontinuation date announced, 12 months notice promised, and
    major regressions still get fixed. But **existing bugs will not be addressed**,
    so this is a slow leak rather than a deadline.
  - *Not a drop-in swap:* `AdvancedMarkerElement` also requires a **Map ID** on the
    map instance and the `marker` library in the loader (`&libraries=marker`).
    Budget more than a find-and-replace.
  - Surfaced by the 2026-09-04 smoke test after the Phase 1 dependency patches —
    pre-existing, unrelated to those upgrades.
  - [Migration guide](https://developers.google.com/maps/documentation/javascript/advanced-markers/migration) · [Google Maps deprecations](https://developers.google.com/maps/deprecations)

- [ ] *Also noticed:* both map templates use the legacy `callback=initMap` loader
      ([campsites/show.ejs:245](views/campsites/show.ejs#L245)). Google now recommends
      the dynamic library import. Bundle with the marker migration if you do it.

### The one-line summary

Phase 1 took 15 minutes and closed 25 advisories. **Phase 2 is still entirely open**,
and it holds more real risk than all 25 combined — a live XSS sink with no CSP behind it.
