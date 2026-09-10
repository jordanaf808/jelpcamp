# Security Findings — YelpCamp v12

Audit performed 2026-08-31 against `package-lock.json` (lockfileVersion 3,
last updated Sep 2023) on Node v24.11.0 / npm 11.15.0.

Methodology and command reference: `Dev/Notes/Security/node-dependency-audit-playbook.md`.

> **Status — updated 2026-09-10**
>
> **Parts 1 and 2 are both done and on `main`.** Phase 1 cleared all 25 advisories;
> Phase 2 — the findings `npm audit` cannot see, and the ones this document argued
> carried more real risk than all 25 combined — is now complete:
>
> | | Shipped in |
> |---|---|
> | helmet + strict CSP, no `script-src 'unsafe-inline'` | PR #5, verified in production |
> | RIDB HTML sanitized at the fetch boundary | PR #6 / #8 |
> | Session cookie: `expires` bug, `secure`, `sameSite`, `trust proxy` | PR #10 |
> | Node runtime pinned + `npm ci` on deploy | PR #9 |
> | Rate limiting on `/login` and `/register` | PR #11 |
> | Google Maps key history audited | this PR |
>
> Plus an unplanned but necessary detour: **three separate session-store failures**
> traced to one `kruptein: ^3.0.0` range, fixed by upgrading connect-mongo to 6 (PR #7).
>
> **`npm audit` reports 0 vulnerabilities** as of 2026-09-06, via a `qs` override that
> forces Express 4 past its own declared `~6.15.1` cap — a stopgap, not a fix, removed
> when Express 5 lands. See Phase 4.
>
> **Part 3 is done, bar one toggle.** The app split (PR #17), the test harness (PR #18)
> and CI (PR #22) have all landed. Every pull request and every push to `main` now runs
> `npm ci`, **9 tests** and `npm audit --audit-level=high`, and a ruleset makes the
> `test` check required before anything merges into `main`. Dependabot alerts and
> grouped version updates are on (PR #24). Grouped **security** updates are the one
> setting still off.
>
> **CI earned its place on its first run.** The test-database guard — the thing standing
> between `npm test` and live Atlas — failed open on any machine without a `.env`, and a
> CI runner is exactly such a machine. Invisible locally; fixed in PR #23. See Part 2.
>
> **Also on 2026-09-09:** the three-apps-one-database problem is fixed. v12 now uses
> `wandur` in both local and production, v13 uses `yelpcamp_v13`, and `storybooks`
> reverts to being NodeAppFromScratch's own database (plus a frozen v12 rollback copy).
> See [HANDOFF.md](HANDOFF.md) for the copy procedure and the cutover verification.

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

**✅ Both steps are done and shipped** in [PR #4](https://github.com/jordanaf808/jelpcamp/pull/4)
(`c1f1220`) — `body-parser`, `connect-ensure-login` and `mapbox-gl` are gone from
`package.json`, and `npm audit` reports 0. Kept here as the record of what was run:

```bash
git checkout -b security/dependency-audit

# 1. remove dead weight first — smallest tree to patch     <-- DONE (c1f1220)
npm uninstall body-parser connect-ensure-login mapbox-gl
npm start                                   # verify the app still boots
git commit -am "chore: remove unused dependencies"

# 2. take the free patches                                 <-- DONE (c1f1220)
npm audit fix                               # NOT --force
npm audit                                   # expect: 0 vulnerabilities
npm start
git commit -am "chore(security): apply non-breaking dependency patches"
```

Manually exercise afterward: login/register, post and edit a comment, save a favourite,
load the map page, and run a search. (There is no "create a campsite" — campsites come
from the RIDB API and are read-only here.)

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

> **Snapshot of the 2026-08-31 assessment.** The headings below are written in the
> present tense as they were found — "helmet is disabled", "no rate limiting". **Every
> finding from the original 2026-08-31 assessment has since been fixed and deployed**
> (`d39d9f3`, 2026-09-08); they are kept as the record of what was wrong and why it
> mattered. Findings added later carry their date in the heading, and **some of those
> are still open** — each says which. For current status always read the
> [Remediation checklist](#remediation-checklist), never these headings.

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

### 🟡 Secrets — current state clean, history is not (answered 2026-09-05)

`.env` is gitignored, `.env.example` documents the required vars without values,
and recent commits (`96be9ad`, `84c46e5`, `396e95d`) moved a hardcoded Google Maps
key and the session secret into env vars. `git log --all --full-history -- .env`
returns nothing — **`.env` was never committed.**

**The open question is now answered, and the answer was yes.** Two Google API keys
were committed and are permanently in this **public** repo's history:

| Key | Entered at | Removed at |
|---|---|---|
| `AIzaSyB6rjTHh3h2h4ekebPZYTlE6TxODKdqmbk` | `58c6176` JelpCamp v12 | `96be9ad` |
| `AIzaSyBJss5OZ9rprm3qA-4F1XiH0OYvrLBKPE8` | `13eacc0` integrate RIDB API | `34b406c` |

Both had already been deleted in GCP during the earlier remediation, so the exposure
is **inert**: readable by anyone, useful to no one. Rotation was the effective fix and
it was already done — which is the whole point of the finding. Removing a secret from
the working tree does nothing for a value already in history; revoking it does.

The **current** `MAPS_API_KEY` and `GEOCODER_API_KEY` were checked against every blob
in history and appear nowhere. See the Phase 2 checklist entry for the full result and
for why history is deliberately not being rewritten.

```bash
# what was run
git log --all --full-history -p -S 'AIza' -- . | grep -oE 'AIza[0-9A-Za-z_-]{35}' | sort -u
git log --all --full-history -- .env          # empty: never committed
```

### 🟡 A devDependency install can move a production dependency (found 2026-09-09)

`connect-mongo` declares `mongodb` as a **peer dependency** with an unbounded range:

```json
"peerDependencies": { "mongodb": ">=5.0.0", "express-session": "^1.17.1" }
```

npm satisfies a peer from whatever is hoisted at the top of the tree, so the version is
decided by everything else installed — not by anything in this project's `dependencies`.
Installing `mongodb-memory-server` as a **devDependency** (it requires `mongodb@^7.2.0`)
therefore moved the production session store's driver:

```text
mongodb                      6.21.0 -> 7.6.0     under connect-mongo
bson                         6.10.4 -> 7.3.2     serialization, under the session store
mongodb-connection-string-url 3.0.2 -> 7.0.2
@types/whatwg-url             11.0.5 -> 13.0.0
```

`npm audit` reported **0 vulnerabilities** before and after. No line of `package.json`
changed to cause it.

**Verified safe before merging**, rather than assumed: a session written by the old
stack (mongodb 6.21.0 / bson 6.10.4) reads back under the new one and vice versa, with
kruptein encryption active — then confirmed against real Atlas by a login round trip
after deploy. Mongoose is unaffected; it keeps its own nested `mongodb@5.9.2`.

**Why it belongs in this document:** it is the same failure shape as the `kruptein`
outages — an unpinned range under the session store, invisible to `npm audit` — and the
mechanism will fire again on the next install that re-resolves the tree. **This is an
argument for CI**, specifically: `npm ci` on a clean checkout is where a silently-moved
production dependency becomes visible.

Note the lockfile is not the protection people assume here. It pins the *result* of a
resolution; it does not stop the next `npm install <anything>` from re-resolving.

### 🟡 CSP is blocking a script the app still ships (found 2026-09-09)

[views/login.ejs:14](views/login.ejs#L14) contains an inline `<script defer>` running
Bootstrap's form-validation snippet. `script-src` has no `'unsafe-inline'`, so the
browser refuses it:

```text
Executing inline script violates the following Content Security Policy directive
'script-src 'self' …'                                            @ /login:95
```

**The CSP is working correctly** — this is what it is for. But the consequence is that
client-side form validation on the login page has been silently dead since PR #5, and
nothing surfaced it until a browser console was actually read.

Fix: move the snippet to a file under `public/js/` and reference it with a `src`, the
way `offcanvas.js` already is. `'self'` covers it. No CSP change needed.

Worth generalising: a strict CSP converts "works" into "silently does nothing" for any
inline script added later. Reading the console after a deploy is the only cheap check.

### 🟡 Three apps shared one database (resolved 2026-09-09)

v12, v13 and NodeAppFromScratch all pointed at the same Atlas database, `storybooks`,
and therefore at a **shared `users` collection** holding both passport-local accounts
(`salt`/`hash`) and a Google OAuth account (`googleId`) under two different schemas.

Mongo namespaces by collection, so nothing was broken and nothing surfaced it. The
risks were real but latent: any destructive operation run against `MONGO_URI` from any
of the three projects hit all three, and the test suite added in PR #18 would have been
exactly such an operation.

Resolved by pointing v12 at `wandur` and v13 at `yelpcamp_v13`, copying v12's data
across with `_id`s preserved, and cutting Render over. `storybooks` was left untouched
as a rollback path. Full procedure and verification in [HANDOFF.md](HANDOFF.md).

### 🟡 Secret reuse across projects (found 2026-09-09)

Reading the three `.env` files while separating the databases surfaced two things:

- **v12's `SESSION_SECRET` and v13's `SECRET` are the same 128-character value.**
- **All three apps authenticate to Atlas as the same user.**

Neither is an exposure — `.env` is gitignored in every project, verified, and
`git log --all -- .env` is empty. But secret reuse means one leak is three
compromises, and the Atlas user has access to every database on the cluster rather
than the one its app needs.

- [ ] Generate a distinct `SESSION_SECRET` per app (rotating v12's requires a
      `sessions` clear — see the table in [HANDOFF.md](HANDOFF.md))
- [ ] Create per-app Atlas database users scoped to their own database

### 🟡 The test-database guard failed open without `.env` (found and fixed 2026-09-10)

[tests/helpers/assertEphemeralDb.js](tests/helpers/assertEphemeralDb.js) exists to stop
the test suite ever touching the production database. One of its functions held two
checks with different preconditions:

```js
if (!fs.existsSync(envPath)) return        // ← early return
...
if (uri.startsWith('mongodb+srv://') || uri.includes('@')) fail(...)  // ← unreachable
```

Comparing against `.env` genuinely needs `.env`. Rejecting a remote or credentialed URI
needs nothing — an in-memory mongod is always `mongodb://127.0.0.1:<port>/…` with no
user. Sharing a function made the universal check inherit the conditional one's early
return, so on any machine without `.env` — a CI runner, a container, a fresh clone —
the guard accepted an Atlas URI.

It could not be found locally, because a developer machine has `.env`. CI found it on
its first run. Fixed in PR #23 by splitting out `assertNoRemoteHostOrCredentials`, which
runs first and unconditionally, plus a regression test that calls it directly and so
behaves the same in every environment.

**Generalisable:** a safety check whose precondition is "the developer's machine is set
up normally" fails open exactly where nobody is watching.

### 🟡 Render's spin-down resets the registration limit early (found 2026-09-10, open)

The rate limiters use express-rate-limit's in-memory store, and
[middleware/rateLimiters.js](middleware/rateLimiters.js) justifies that with: *"counters
reset on deploy or restart. That is accepted: an attacker cannot trigger a restart."*

On Render that reasoning is incomplete. Render is not serverless — one long-lived process
serves every request, which is why an in-memory store works at all — but the free
instance type this app runs on **spins down after 15 minutes without inbound traffic**
([Render docs](https://render.com/docs/free)), and spinning down wipes memory. An
attacker doesn't need to trigger a restart. They only need the site to be quiet for 15
minutes, which on a personal project is most of the day.

| Limiter | Window | Limit | Can spin-down shorten it? |
|---|---|---|---|
| `loginLimiter` | 15 min | 10 | No — 15 idle minutes expire the window anyway |
| `registerLimiter` | **60 min** | 5 | **Yes** — roughly 5 per 15+ minutes instead of 5 per hour |

`loginLimiter` is safe only because its window happens to equal the spin-down threshold.
Nothing enforces that: widening the login window past 15 minutes would *weaken* it.

Low severity: resets are sequential, one counter at a time, with no amplification. It
becomes a real problem as soon as the service runs more than one instance, because each
instance keeps its own counter — which a paid Render plan allows.

- [ ] Decide: accept it and say so in `rateLimiters.js`, or shorten `registerLimiter`'s
      window to 15 minutes so the platform cannot undercut it

### ✅ No `engines` field, no CI, no tests (resolved 2026-09-10)

**Resolved.** `engines` and `.nvmrc` landed in
[PR #9](https://github.com/jordanaf808/jelpcamp/pull/9) — `package.json` now declares
`"node": ">=22.12.0 <25"` and `.nvmrc` pins `24.14.1`, which is stricter than the
`>=20.0.0` originally proposed here. **Tests landed 2026-09-09** (PR #18); `"test"` now
runs `node --test --test-concurrency=1 "tests/**/*.test.js"`. **CI landed 2026-09-10**
(PR #22) and runs 9 tests on every pull request — see Part 3.

As found:

`package.json` has no `engines`, so nothing prevents running this on an EOL Node
with unpatched runtime CVEs. Add:

```json
{ "engines": { "node": ">=20.0.0" } }
```

`"test"` is still the npm default `echo "Error: no test specified" && exit 1`, and
there is no `.github/` directory. **This is the blocker for Dependabot** — see below.

---

## Part 3 — Dependabot

**Done as of 2026-09-10, except one toggle.** The order this section recommended held up:

1. ✅ **Clear the backlog manually first** (Part 1). Not because Dependabot can't — grouped security updates would collapse all 25 into one PR — but because a bot has no idea which of these are reachable in your code. Doing the triage once is how you learn where the real risk sits.
2. ✅ **Enable Dependency graph + Dependabot alerts** (2026-09-09). Highest value-to-noise ratio available: free, no PRs, and it tells you when something you depend on gets a new advisory. Turn this on for *every* old repo, including ones you'll never touch again.
3. ⬜ **Enable security updates** once there's a test suite and CI. Both exist now; this is the one setting still off.
4. ✅ **Version updates last**, grouped, majors ignored — PR #24. The first grouped PR (#25) arrived within minutes.

The live config is [.github/dependabot.yml](.github/dependabot.yml) and the workflow is
[.github/workflows/ci.yml](.github/workflows/ci.yml). **They are linked rather than
copied here on purpose.** The snippets this section used to carry went stale within
days — `actions/*@v4` and `node-version: '22'`, where the real workflow uses `@v7` and
reads `.nvmrc`. A copy of a config file inside a document is a second source of truth,
and the document is the one nobody runs.

What the Dependabot config does, and what it does not:

- **npm:** weekly, grouped into `security-patches` and `routine-updates` so a security
  fix never arrives buried in a routine bump. Semver-major bumps are ignored — those are
  Phase 4, one PR each.
- **github-actions:** the workflow's pinned actions are supply-chain dependencies too.
  Majors are *not* ignored there; CI is the only consumer, so a breaking bump fails on
  its own PR.
- **`ignore: semver-major` does not protect `0.x` packages.** Under semver, `0.6 → 0.7`
  is the breaking change, but Dependabot classifies it as minor. That is how `passport`
  0.6 → 0.7 — listed in Phase 4 as a deliberate upgrade — arrived in #25. (Checked: 0.7.0
  only changes `authenticate({assignProperty})`, which this app does not use.) Read `0.x`
  bumps by hand.
- **Two `update-types` vocabularies.** `groups` takes `patch`/`minor`/`major`; `ignore`
  takes `version-update:semver-*`. The wrong one is accepted and silently does nothing.
- **GitHub's docs do not say whether `ignore` also suppresses a security update that
  needs a major bump.** Assume it might. That is acceptable only because
  `npm audit --audit-level=high` in CI does not go through Dependabot at all — a withheld
  fix still turns the build red.

### The honest caveat for this repo

**Dependabot's usefulness scales with your test suite.** When this section was written
the project had none. It now has 9 tests, run on every PR — enough to make the bot
trustworthy for what they cover, the database guard and the login rate limiter, and no
further.

A green Dependabot PR still says nothing about whether a *successful* login works,
whether comments save, or whether the map renders. None of those are tested. So the
caveat has narrowed rather than gone: merge patch bumps on green, and exercise the app by
hand for anything that touches auth, sessions or rendering.

The audit step is the other half. It gates every push on the whole dependency tree,
regardless of Dependabot, and will deliberately fail a PR that never touched
dependencies when a new advisory is published. It is a tripwire, not a diff check.

And note what Dependabot would have reported on this repo **after Part 1, before Part
2**: zero problems. Helmet disabled, unescaped API data, an unauthenticated login
endpoint, and a session-expiry bug — all invisible to it. That gap is the whole argument
for Part 2.

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
| 7 | Integration tests + CI workflow | half day | Prerequisite for trusting #9. **✅ Tests PR #18, CI PR #22; `test` required on `main`** |
| 8 | Major upgrades — mongoose first | ongoing | One library per PR |
| 9 | Dependabot alerts, then grouped security updates | 10 min | Keeps #1 from recurring. **Alerts ✅, version updates ✅ (PR #24); security updates still off** |

Steps 2–4 are the ones `npm audit` will never tell you about, and they carry more
real risk than all 25 advisories combined.

---

## Remediation checklist

Started 2026-09-01; items carry their own dates. Verified against the repo, not assumed.

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

### ✅ Phase 1b — Finish the dependency pass (COMPLETE, PR #4)

Ticked 2026-09-05 after verifying against the repo rather than the record — these boxes had
been left unchecked long after the work shipped.

- [x] Lockfile committed — `1158430`, and clean in the working tree
- [x] The 3 unused direct deps removed — `c1f1220`. Verified: `body-parser`,
      `connect-ensure-login` and `mapbox-gl` are all absent from `package.json`
- [x] Smoke tested
- [x] Committed and merged — PR #4

### ✅ Phase 2 — What `npm audit` can't see (COMPLETE 2026-09-05)

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
- [x] **Pin the runtime** — done 2026-09-05 in PR #9, after it turned out to be a
      **deploy blocker rather than the 5-minute nicety this list rated it as.** Nothing
      pinned a version, so Render used the default for a service of this age — Node
      **14.17.0**, EOL — and the deploy died on `Cannot find module 'node:async_hooks'`
      (`node:` prefixed core imports need >=14.18 in CJS; mongoose 7.8.12 uses them).

      Shipped `.nvmrc` = `24.14.1` and `engines: { "node": ">=22.12.0 <25" }`.
      **The floor is 22.12.0, not the 20.0.0 guessed above** — it is set by
      `sanitize-html` 2.17.7, not by connect-mongo (>=20.8.0) or mongoose (>=14.20.1).
      Upper bound is deliberate, per Render's docs, so a future major cannot arrive
      unannounced. `.node-version` deliberately omitted: two files naming one version
      drift, and the higher-precedence one wins silently.

      **Second problem this exposed, fixed in the Render dashboard rather than here:**
      the build command was `npm install`, and Node 14 bundles npm 6, which reads only
      lockfileVersion 1 while ours is 3. npm 6 ignored the lockfile and re-resolved
      from the `^` ranges — Render built **176 packages / 4 advisories** where the
      locked tree is **156 / 3**. Every deploy before this ran a dependency tree nobody
      had tested. Build command is now `npm ci`.
- [x] **Rate-limit auth** — shipped 2026-09-05; a key bug was found and **fixed
      2026-09-08**. `express-rate-limit` 8.7.0 on **POST** `/login`
      (10 per 15 min) and **POST** `/register` (5 per hour). GET forms are unlimited.
      The middleware always worked; **the key it counted by did not identify the
      client** until `trust proxy` was corrected to 3 — see below. Limits were
      briefly halved to 5/3 on a wrong diagnosis and have been reverted.
  - Deliberately **no** `skipSuccessfulRequests` on login: passport uses
    `failureRedirect`, so a failed login returns 302 exactly like a success, and status
    code cannot separate them. This means the limit counts login *actions*, not
    failures.
  - Handler **renders** rather than redirects. `res.redirect()` overwrites statusCode
    with 302, discarding the 429 that logs and monitoring need; a 429 with a Location
    header is useless since browsers only follow 3xx.
    **Verified live:** the 429 returns a 4.3 KB `text/html` login view carrying the
    message, not a bare text body.
  - `trust proxy` is `1`, not `true`, so express-rate-limit's
    `ERR_ERL_PERMISSIVE_TRUST_PROXY` check does not fire — but **note that neither of
    the library's proxy validations catches this app's actual problem.** They fire only
    for `trust proxy: false` and `trust proxy: true`; a value of `1` that is simply too
    low for the real hop count passes silently. Server logs will not surface it.
    A spoofed `X-Forwarded-For` does **not** open a fresh bucket, so the key is not
    attacker-controlled — which is necessary but nowhere near sufficient. See the open
    bug below.
  - ✅ **FIXED 2026-09-08 — the rate-limit key was a Render-internal address, not
    the client.** 12 consecutive failed logins produced no 429. Confirmed in
    production with a temporary `/__whoami` endpoint, now removed.

    **The measured chain:**

    ```text
    X-Forwarded-For: 216.163.65.232, 104.23.251.43, 10.194.193.7
                     └─ the client   └─ Cloudflare   └─ Render's internal router
    req.ip (trust proxy: 1) = 10.194.193.7          ← the LAST entry
    ```

    `trust proxy: n` does not mean "trust n proxies and find the client". It means
    "walk n entries back from the right of `X-Forwarded-For`". Those coincide only
    when `n` equals the real chain length — which is **3** here, not 1.

    **Why it produced multiple buckets.** Those `10.x` routers rotate across a
    pool. Ten sampled calls returned three distinct addresses
    (`10.194.193.7`, `10.197.58.164`, `10.199.46.133`) while `cf-connecting-ip`
    stayed constant and `RENDER_INSTANCE_ID` never changed — one instance, three
    keys. That matches the three interleaved counters seen from outside:

    ```text
    req   1  2  3  4  5  6  7  8
    rem   4  4  4  3  3  2  3  2
          A  B  C  A  B  A  C  B     three buckets, not one countdown
    ```

    - **Impact while live.** The limiter bucketed **every visitor** by which
      routing pod served them, not by who they were. The whole site shared roughly
      three buckets, so one person's failed logins could lock out strangers, and an
      attacker got `limit × pool_size` attempts. A brute-force defence that DoSes
      its own users is worse than the exposure it was added to close.
    - **The fix:** `trust proxy: 3` in [app.js](app.js). Verified against the real
      chain — one client now gets **one** bucket, counting down `9,8,7,6,5` across
      all three router addresses where it previously started a fresh bucket at 9
      for each.
    - **Why not `trust proxy: true`:** it takes the **leftmost** entry, which is
      client-supplied. Tested against the real chain, `true` returns an attacker's
      injected value while `3` returns the client. Counting from the right is
      spoof-safe because Cloudflare inserts the true address at a fixed position;
      prepended entries shift left and are ignored.

      | `trust proxy` | resolves to | correct | spoof-safe |
      |---|---|---|---|
      | `1` (was) | `10.194.193.7` | ❌ | — |
      | `2` | `104.23.251.43` | ❌ | — |
      | **`3`** | **client** | ✅ | ✅ |
      | `uniquelocal` | `127.0.0.1` | ❌ | — |
      | `true` | client | ✅ | ❌ returns injected value |

    - ⚠️ **This number is tied to the deployment topology.** If Render or Cloudflare
      change the hop count it breaks silently. **Neither** express-rate-limit
      validation catches it: `ERR_ERL_PERMISSIVE_TRUST_PROXY` fires only for `true`,
      `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` only for `false`. A value that is merely
      *too low* passes without a warning. Re-measure after any platform change.
    - **Why local testing could never have caught this.** With no proxy in front,
      `trust proxy: 1` and `trust proxy: 3` behave identically. The bug lives
      entirely in the gap between the dev topology and the production one — worth
      remembering when Phase 3's test suite arrives, because it will not catch this
      class of bug either.
    - ~~**Wrong diagnosis #1:** multiple instances, each with its own in-memory
      store, doubling the effective limit.~~ Ruled out: Hobby tier runs one
      instance, `RENDER_INSTANCE_ID` was constant, and a *third* bucket appeared
      mid-test. Acted on prematurely — limits were halved to 5/3 in `105bfaa` and
      reverted, because halving a *shared* bucket makes collateral lockouts easier.
    - ~~**Wrong diagnosis #2:** `trust proxy: 1` is correct because a spoofed
      `X-Forwarded-For` does not open a fresh bucket.~~ True observation, no
      evidential value: a router-address key is *equally* unspoofable and *entirely*
      wrong. Both facts share one cause, and consistency was read as confirmation.
    - **Method note.** Two boring explanations should have been eliminated first:
      the client IP rotating (checked — stable across 8 samples) and testing during
      a deploy overlap (true, and it contaminated the strongest evidence). Eliminate
      measurement artifacts before theorising about the system. The thing that
      finally worked was reading `req.ip` directly instead of inferring it.
    - **`standardHeaders: true` is what made this findable.** Status codes alone
      made it look like a totally broken limiter. `RateLimit-Remaining` returning
      `4,4,4` for three consecutive requests is what exposed the bucket structure.

  - **Remaining known limits:** counters reset on deploy or restart (accepted — an
    attacker cannot trigger a restart). Per-IP keying means a shared NAT shares a
    budget, and since successes count too, a busy office IP can reach 5 logins/15 min
    legitimately.
- [x] **Google Maps keys WERE committed** — checked 2026-09-05. Two distinct keys are
      permanently in this **public** repo's history:

      | Key | Entered at | Removed at |
      |---|---|---|
      | `AIzaSyB6rjTHh3h2h4ekebPZYTlE6TxODKdqmbk` | `58c6176` JelpCamp v12 | `96be9ad` |
      | `AIzaSyBJss5OZ9rprm3qA-4F1XiH0OYvrLBKPE8` | `13eacc0` integrate RIDB API | `34b406c` |

      **Both were already deleted in GCP**, so the exposure is inert — anyone can read
      them from history and they authenticate nothing.

      Verified clean: the **current** `MAPS_API_KEY` and `GEOCODER_API_KEY` do **not**
      appear anywhere in history; `.env` has never been committed (`git log --all
      --full-history -- .env` is empty) and is ignored at `.gitignore:8`; the only file
      in the working tree containing a key is `.env` itself.

      **Deliberately NOT rewriting history.** `git filter-repo` would scrub the blobs,
      but the keys are already revoked so it removes nothing usable, it rewrites every
      commit hash and breaks every clone and fork of a public repo, and GitHub keeps
      unreferenced objects regardless. History rewriting is for live secrets that cannot
      be rotated. These could be rotated, and were.

  - [x] **GCP Console checked 2026-09-05 — clean.** Neither deleted key shows unexpected
        API activity: no requests from unfamiliar referrers between each key's commit
        date and its deletion. The keys sat in public history without being found and
        used. **Phase 2 is now complete with no outstanding exposure.**

### ✅ Phase 3 — Keep it fixed (complete 2026-09-10, one toggle left)

**Prerequisite, found 2026-09-08 — `app.js` cannot be imported.** ✅ **Done, PR #17.**
`app.js` now builds and exports the app; `server.js` does `connectDB()` + `listen()`;
`"start"` and `"main"` both point at `server.js`.

- [x] Split `app.js` into `app.js` (builds and **exports** the app) and `server.js`
      (`connectDB()` + `app.listen()`), then point `"start"` at `server.js` — **PR #17**
- [x] Integration tests over the auth flow (replaces the `"no test specified"` stub)
      — **PR #18**; 9 passing after PR #23. See [HANDOFF.md](HANDOFF.md) for what each test pins

  **The database guard is the load-bearing part, not the tests.** `app.js` calls
  `dotenv.config()`, and dotenv fills any variable that is not *already* set — so
  forgetting to set `MONGO_URI` before requiring the app silently loaded `.env`, which
  pointed at live Atlas. A `deleteMany({})` there erased three apps' data **and the
  tests would still have passed.**
  [tests/helpers/assertEphemeralDb.js](tests/helpers/assertEphemeralDb.js) checks the
  live mongoose connection rather than the env var — loopback host, the exact port
  `MongoMemoryServer` allocated, the expected database name — and
  [tests/guard.test.js](tests/guard.test.js) proves it refuses production-shaped input.

  **Still uncovered, deliberately:** comment ownership (`checkCommentOwnership`),
  the `sanitizeDescription` unit test, CSP headers, cookie flags, and
  `express-mongo-sanitize`. All were scoped for the first suite and cut to keep PR #18
  reviewable. The `express-mongo-sanitize` one earns its keep twice — it is the exact
  line Express 5 breaks.
  - There is **no campsite CRUD** — this checklist said so until 2026-09-08 and was wrong.
    [routes/campsites.js](routes/campsites.js) is read-only (`/`, `/search`, `/show/:id`)
    and proxies the RIDB API. The writes are in [routes/comments.js](routes/comments.js)
    and [routes/users.js](routes/users.js)
  - The campsite routes call `ridb.recreation.gov` with a live API key, so testing them at
    all needs an HTTP interceptor (`nock`). Out of scope for the first suite; the
    `utils/sanitizeDescription.js` unit test already covers that path's security half
- [x] `.github/workflows/ci.yml` — **PR #22**. `npm ci`, `npm test`,
      `npm audit --audit-level=high`, with Node read from `.nvmrc` (`node-version-file`) so
      CI cannot drift from Render. Confirmed on the first `main` run:
      `Resolved .nvmrc as 24.14.1`, 9 passing, 0 vulnerabilities
  - **Its first run found a real bug:** the guard failing open without `.env`, fixed in
    PR #23. See Part 2
  - **Known defect:** the step that caches the `mongod` binary saves nothing. It caches
    `~/.cache/mongodb-binaries`, which is where the binary lands on a machine with
    `ignore-scripts=true`; on CI the postinstall puts it in
    `node_modules/.cache/mongodb-memory-server` instead. Cost: a ~5 s re-download per run.
    Fix: `"config": {"mongodbMemoryServer": {"disablePostinstall": "1"}}` in
    `package.json`, so every machine downloads to the same place
- [x] Enable **Dependency graph + Dependabot alerts** — 2026-09-09
- [ ] Enable **grouped security updates** — CI exists now; this is what's left
- [x] Add `.github/dependabot.yml` with majors ignored — **PR #24**. See Part 3 for the
      `0.x` gap
- [x] **Protect `main`** — ruleset *Protect Main*, 2026-09-10: pull request required,
      the `test` check required and up to date, no force-push, no deletion. Repo admin
      may bypass on PRs only, so an advisory with no fix cannot lock the repo
- [x] `node app.js` exits 1 with a message instead of hanging — **PR #21**, re-landing a
      commit orphaned when it was pushed to `refactor/export-app` five minutes after
      PR #17 had merged

### ⬜ Phase 4 — Major upgrades (ongoing, one PR each)

Still outstanding after Phase 1 — `npm audit` is clean, but these are 1–3 majors behind
and an EOL major eventually means *no fix available* for a future advisory.

| Package | Current | Latest | Priority |
|---|---|---|---|
| `mongoose` | 7.8.12 | 9.9.4 | **Highest** — 2 majors behind; verify v7 EOL status |
| `express` | 4.22.2 | 5.2.1 | High — v4 is in maintenance |
| `ejs` | 3.1.10 | 6.0.1 | Medium — 3 majors behind |
| `joi` | 17.13.6 | 18.2.5 | Medium — re-verify the custom `escapeHTML` extension. (17.13.7 patch in Dependabot #25) |
| `helmet` | 7.0.0 | 8.3.0 | Bundle with the CSP work above |
| ~~`connect-mongo`~~ | ~~5.0.0~~ | 6.0.0 | ✅ Done, PR #7 — forced by the kruptein outages |
| `passport` | 0.6.0 | 0.7.0 | Low — **arriving via Dependabot #25** despite the majors rule (see Part 3). 0.7.0 only changes `assignProperty`, unused here |
| `connect-flash` | 0.1.1 | 0.1.1 | Low — last published 2013-05-13. Calls runtime-deprecated `util.isArray` (DEP0044) on every failed login; breaks if a future Node removes it |
| `mapbox-gl` | 2.15.0 | 3.29.0 | Moot if removed — but reconcile the **v1.12.0 pinned in the CDN `<script>` tags** |

Check <https://endoflife.date> before ordering these.

#### 🔴 Express 4 -> 5 — required, not optional (added 2026-09-04)

Three new `qs` advisories ([GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g),
[GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx),
[GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)) are
unfixable on Express 4 — see the note in Part 1. This is the "EOL major means no fix
available" scenario, arriving earlier than expected.

**Stopgap applied 2026-09-06:** `"overrides": { "qs": "^6.16.0" }` in `package.json`.
`npm audit` now reports **0 vulnerabilities**, down from 3 moderate.

`qs@6.16.0` was published `2026-08-29T23:50Z` and `min-release-age=7` in `~/.npmrc`
blocked it until `2026-09-05T23:50:15Z`. The guard was waited out rather than bypassed
with `--min-release-age=0`. Worth knowing: `npm view` can *see* a gated version while
`npm install` refuses it with `ETARGET ... with a date before <cutoff>`.

The override forces `qs` past Express 4's declared `~6.15.1`, so the app runs a `qs`
version Express was **not tested against**. That is the whole reason this is debt and
not a fix. Verified it does not break the two things `qs` actually does here —
query-string parsing and urlencoded bodies:

| Exercise | Result |
|---|---|
| `/campsites/search?search=&state=&limit=` | 200 |
| array syntax `?activities[]=a&activities[]=b` | 200 |
| bracket keys `?a[b]=1&a[c]=2`, deep `?deep[x][y][z]=1` | 200 |
| comma values `?list=one,two,three` | 200 |
| urlencoded POST `/login`, `/register` | 302 as expected |
| `express-mongo-sanitize` mutating `req.query` (`?$where=1`) | 200, no crash |
| session round trip | cookie issued, read back, flash intact |
| `npm ci` reproduces the override | yes — matters, Render runs `npm ci` |

Bracket-key and comma parsing were tested deliberately: `GHSA-x5fp-wj9c-mxmx` is an
array-limit bypass *via bracket-key comma parsing*, so that is exactly the surface
6.16.0 changed.

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

Phase 1 took 15 minutes and closed 25 advisories. **Phase 2 held more real risk than all
25 combined** — a live XSS sink with no CSP behind it — and is complete and deployed
(`d39d9f3`, 2026-09-08).

**Phase 3 is complete as of 2026-09-10** (`22b5286`), bar the security-updates toggle.
9 tests and an audit gate run on every pull request, and `main` will not accept a merge
until they pass. On its very first run CI found a bug no local run could: the guard that
keeps the test suite off the production database failed open on any machine without a
`.env`.

The argument has not changed, only narrowed. Every failure in this document's history was
invisible to `npm audit`, which reported zero problems throughout all of them — and
2026-09-09 added one more: installing a *devDependency* moved the production session
store's driver across a major version, silently, with `npm audit` clean on both sides.
`npm ci` in CI is precisely where that becomes visible.

Then Phase 4, where Express 5 is the one that matters: its riskiest change
(`req.query` becoming a read-only getter under `express-mongo-sanitize`) fails at
runtime, not at install. That is the kind of failure a test suite catches and a human
reading a diff does not.
