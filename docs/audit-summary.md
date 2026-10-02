# Audit summary — YelpCamp v12

A security audit of an Express app whose lockfile had not changed since September 2023.
It ran from 2026-08-31 to 2026-10-01 and took 53 merged pull requests (#2–#57).

This is the short version, written as a senior developer's review of the work. The full
record is [security-audit.md](security-audit.md).

## Result

| | Before | Now |
| --- | --- | --- |
| `npm audit` | 25 advisories, 2 critical and 10 high | 0 |
| Security headers | helmet commented out, no CSP | helmet 8; `script-src` has no `'unsafe-inline'` or `'unsafe-eval'` |
| HTML from the RIDB API | rendered unescaped | sanitized where it is fetched |
| Login and register | unlimited attempts | rate limited |
| Session cookie | no `secure`, no `sameSite`, wrong expiry | fixed |
| Node on Render | 14, end of life, unpinned | 24, pinned in `.nvmrc` |
| Tests and CI | none | 28 tests; CI required to merge |
| Majors | express 4, mongoose 7, ejs 3, joi 17, helmet 7 | express 5, mongoose 9, ejs 6, joi 18, helmet 8 |
| Database | shared with two other apps | its own |

## The plan

1. **Patch what `npm audit` reports.** All 25 advisories were fixable inside the
   existing version ranges. It took 15 minutes.
2. **Fix what `npm audit` cannot see.** CSP, unescaped API data, cookies, rate limits,
   the runtime pin. This phase carried more risk than all 25 advisories.
3. **Keep it fixed.** Tests, CI, a protected `main`, Dependabot.
4. **Major upgrades**, one per pull request.

The detail is in the [remediation checklist](security-audit.md#remediation-checklist).

## Problems hit, and what fixed them

| Problem | Root cause | Fix | Found by |
| --- | --- | --- | --- |
| Sessions broke three times | `connect-mongo` 5 allowed `kruptein: ^3.0.0`, which floated to a release that broke it | connect-mongo 6, which pins it (#7) | Production |
| A deploy crashed on start | Nothing pinned Node, so Render used 14 | `.nvmrc` and `engines` (#9) | Production |
| The rate limiter put the whole site in about three buckets | `trust proxy: 1` behind three proxy hops | `trust proxy: 3` | Production |
| The test suite could have wiped the live database | Its guard returned early when `.env` was missing | An unconditional check that runs first (#23) | CI, first run |
| Form validation was dead on three pages | The CSP blocked the inline scripts | Moved to a file, plus a test on the rendered HTML (#28) | Production console |
| "Back" redirects never worked, then one looped | helmet's default `no-referrer`; fixing it exposed the loop | `same-origin` and a guard in `safeBack` (#33, #34) | Review after merge |
| Registration stopped responding during the Mongoose 9 bump | passport-local-mongoose 9 dropped the callback form | `await User.register` (#41) | Tests |
| Map errors after the marker migration | Google's vector renderer fetches `data:` URIs and compiles WebAssembly | Two CSP entries (#51, #54) | Production console |
| Deprecation warning on every campsite page | `addListener` is deprecated on the new marker | `gmp-click` and `gmpClickable` (#55) | Production console |
| A moderate advisory went unnoticed for two days | The CI gate is `--audit-level=high` | Lockfile patch (#57) | Reading CI's log |

Six of these ten were found on the live site.

## What to keep doing

- **Triage by reachability, not severity.** A critical `form-data` advisory was very
  likely unreachable. A moderate `express` one sat on a path the app uses.
- **Change the code on the version production runs, then bump.** Express 5 was three
  pull requests: prepare, fix, bump. The bump was a version number.
- **Write down what is unverified.** It tells the next person what not to trust.
- **Leave a test behind.** #23, #27 and #28 each added the test that would have caught
  the bug.

## Critique

**1. Verification happens in production, by eye.** The two map rows in the table are
one migration (#46) that needed three more pull requests. Nothing between your
laptop and the live site can render the map, because the Maps key rejects `localhost`.

- Create a second Maps key for development that allows `http://localhost:3333/*`.
- Write one Playwright script that loads the main pages and fails on any console error
  or CSP violation. Run it before merging and after deploying. It would have caught
  #28, #51, #54 and #55.

**2. "Works great" is not a test result.** 27 of the 33 checkboxes in pull request
test plans were never ticked. Three live checks from Express 5 have been open since
2026-09-16. When a check is not recorded, the next person has to redo it or trust it.

- Tick the boxes in the pull request as you do them. That is the record.

**3. The tests protect the plumbing, not the product.** The 28 tests cover the database
guard, the rate limiter, redirects and the sanitizer. None covers search, a campsite
page, saving a comment, or any browser code. A green Dependabot pull request says
nothing about whether the app works.

- Mock the RIDB API with `nock` and add one test per route.
- Snapshot the CSP header in a test, so every policy change shows up as a reviewed diff.

**4. Five risky changes shipped in one deploy.** Mapbox GL v3, helmet 8, joi 18, ejs 6
and a CSP change (#47–#51) all merged on 2026-09-25 and went live together. It worked.
If it had not, there were five suspects.

- One risky change per deploy. Check the site before starting the next.

**5. The docs grew faster than they could stay true.** security-audit.md is 1,300
lines. The status in these docs went stale four times, because it was copied by hand
from git and GitHub. There is also no README: a stranger cannot tell what this app
is, how to run it, or which environment variables it needs.

- Keep decisions and reasons in docs. Keep status in the tools: GitHub Issues for open
  work, `gh pr list` and `git log` for state.
- Write the README first.

**6. Known problems are still in the repo.** `views/campgrounds/` and
`views/campsites/campsites.ejs` are rendered by nothing. `connect-flash` was last
published in 2013 and calls a deprecated Node API. The show route passes axios an
option it does not have (`showParams`,
[routes/campsites.js:90](../routes/campsites.js#L90)), so `full: true` is never sent.
There is no favicon, so every page logs a 404.

- Delete the dead views. Replace `connect-flash` with a few lines of your own
  middleware. Fix or remove `showParams`.

**7. One leaked secret would compromise three apps.** v12 and v13 share a session
secret, and all three apps on the cluster log in to Atlas as the same user. Both have
been open since 2026-09-09. This is a 20-minute fix.

**8. Nothing enforces code quality.** `.prettierrc` exists, but Prettier is not
installed and nothing was reformatted. There is no linter. ESLint's `no-undef` would
have caught the undeclared global fixed in #34.

- Add ESLint and Prettier, make one formatting-only pull request, then lint in CI.

**9. The audit gate has a blind spot you chose to keep.** Staying at `high` is a
reasonable call: `moderate` would block unrelated work. The cost is that a moderate
advisory shows only in the CI log and in Dependabot's alert list, and Dependabot did
not open a pull request for this one.

- Turn on Dependabot alert emails, or look at the alert list once a week.

## Habits and systems

| Habit | When | What it would have prevented |
| --- | --- | --- |
| Read the vendor's migration guide **and** its security page | Before any upgrade or new third-party feature | #51, #54 and #55 as separate fixes |
| `git fetch --prune && git status -sb && gh pr list` | Start of every session | A branch cut from a stale `main` (#41) |
| `git diff --staged` | Before every commit | Conflict markers committed in `47f3e0d`; the 120-line reformat in #41 |
| Open the console on the main pages | After every deploy, until the smoke script exists | Each production-console row above reaching users |
| Write the test or guard that would have caught it | Every bug that reaches production | The same bug twice |
| 30 minutes on dependencies: `npm outdated`, alerts, patch updates | First of each month | 25 advisories from three years of not looking |
| Done means merged, deployed, checked and recorded | Every pull request | The unticked boxes |
| Ask "how do you know?" and expect a file line, a log line or a URL | Any claim: yours, a doc's, an AI's | See below |

**On working with AI.** 44 of the 50 pull requests you authored carry an AI footer,
and an AI drafted most of these docs. That is fine for output. It is a risk for the
goal of becoming a senior developer, because you can merge a fix you could not have
written or explained. The AI was also wrong in ways that looked confident:

- Google's AI suggested a `<meta>` CSP tag. This app's policy is an HTTP header from
  helmet, and a second policy can only tighten the first.
- Claude stated that the Map ID turned on the vector renderer. That was an inference
  from timing, and nobody checked it.
- Claude reported two tasks as open from a stale doc. They had merged over a week
  earlier.

Two habits help:

- Before merging an AI-written change, explain the diff in your own words in the pull
  request description. If you cannot, you are not ready to merge it.
- For one fix in three, write it yourself first, then compare.

## Still open

- `connect-flash`: abandoned, and no version bump can fix that.
- The session secret shared with v13, and the Atlas user shared by three apps.
- Three live checks from Express 5, unticked in
  [security-audit.md](security-audit.md).
- The legacy `callback=initMap` Google Maps loader.
- `ip-address` 10.7.2 (#57) is merged. Whether it is deployed is not recorded.
- No test for: campsite routes, search, comment create and edit, register error paths,
  the CSP header, cookie flags, any browser code.
- Prettier is configured but not applied. There is no linter and no README.
- The `storybooks` database still holds a full copy of v12's data as a rollback path.
