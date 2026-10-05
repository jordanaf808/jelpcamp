# Audit summary — YelpCamp v12

A security audit of an Express app whose lockfile had not changed since September 2023.
It ran from 2026-08-31 to 2026-10-01 and took 53 merged pull requests (#2–#57).

This is the short version, written as a senior developer's review of the work as it
stood on 2026-10-01. The full record is [security-audit.md](security-audit.md).

Each critique below ends with a **Since** line: what was done about it from 2026-10-02
to 2026-10-05, in pull requests #60 to #74.

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

**Since:** partly. Tests now render the campsite page with the RIDB API mocked (#65),
and one checks how the page loads the map (#73). Neither bullet is done. The owner
chose not to create the development key for now, so the next map change (#73) was
again verified on the live site. It needed no follow-up.

**2. "Works great" is not a test result.** 27 of the 33 checkboxes in pull request
test plans were never ticked. Three live checks from Express 5 have been open since
2026-09-16. When a check is not recorded, the next person has to redo it or trust it.

- Tick the boxes in the pull request as you do them. That is the record.

**Since:** from #60 on, each live check is ticked in its pull request with the owner's
own words and the date. The three Express 5 checks are still unticked.

**3. The tests protect the plumbing, not the product.** The 28 tests cover the database
guard, the rate limiter, redirects and the sanitizer. None covers search, a campsite
page, saving a comment, or any browser code. A green Dependabot pull request says
nothing about whether the app works.

- Mock the RIDB API with `nock` and add one test per route.
- Snapshot the CSP header in a test, so every policy change shows up as a reviewed diff.

**Since:** 28 tests became 43. `nock` mocks RIDB, and the campsite page has its first
tests (#65, #73). Flash messages (#61), the favicon (#60), and who may see or change a
user's favorites (#72, #74) are covered too. Still untested: search, the index page,
creating and editing a comment, register error paths, the CSP header, cookie flags and
all browser code.

**4. Five risky changes shipped in one deploy.** Mapbox GL v3, helmet 8, joi 18, ejs 6
and a CSP change (#47–#51) all merged on 2026-09-25 and went live together. It worked.
If it had not, there were five suspects.

- One risky change per deploy. Check the site before starting the next.

**Since:** the risky changes (#61, #65, #72, #73) were merged one at a time, and the
owner reported each one's live checks before the next was opened. Whether each went
out as its own deploy is not recorded.

**5. The docs grew faster than they could stay true.** security-audit.md is 1,300
lines. The status in these docs went stale four times, because it was copied by hand
from git and GitHub. There is also no README: a stranger cannot tell what this app
is, how to run it, or which environment variables it needs.

- Keep decisions and reasons in docs. Keep status in the tools: GitHub Issues for open
  work, `gh pr list` and `git log` for state.
- Write the README first.

**Since:** the README exists (#64). Open bugs are GitHub issues #68 to #71, not lines
in a doc.

**6. Known problems are still in the repo.** `views/campgrounds/` and
`views/campsites/campsites.ejs` are rendered by nothing. `connect-flash` was last
published in 2013 and calls a deprecated Node API. The show route passes axios an
option it does not have (`showParams`,
[routes/campsites.js:90](../routes/campsites.js#L90)), so `full: true` is never sent.
There is no favicon, so every page logs a 404.

- Delete the dead views. Replace `connect-flash` with a few lines of your own
  middleware. Fix or remove `showParams`.

**Since:** all four are done. The dead views are deleted and there is a favicon (#60).
`connect-flash` is replaced by `middleware/flash.js` (#61). `showParams` is fixed
(#65), which cut the campsite page from four RIDB requests to one.

**7. One leaked secret would compromise three apps.** v12 and v13 share a session
secret, and all three apps on the cluster log in to Atlas as the same user. Both have
been open since 2026-09-09. This is a 20-minute fix.

**Since:** unchanged. Still open.

**8. Nothing enforces code quality.** `.prettierrc` exists, but Prettier is not
installed and nothing was reformatted. There is no linter. ESLint's `no-undef` would
have caught the undeclared global fixed in #34.

- Add ESLint and Prettier, make one formatting-only pull request, then lint in CI.

**Since:** done. Prettier is applied and checked in CI (#63), and `git blame` skips
the format commit (#66). ESLint runs in CI (#67). Its first run found the kind of bug
this critique predicted: a loop variable with no declaration, leaking onto the global
object.

**9. The audit gate has a blind spot you chose to keep.** Staying at `high` is a
reasonable call: `moderate` would block unrelated work. The cost is that a moderate
advisory shows only in the CI log and in Dependabot's alert list, and Dependabot did
not open a pull request for this one.

- Turn on Dependabot alert emails, or look at the alert list once a week.

**Since:** unchanged. The gate is still `high`, by the owner's decision.

## Found along the way

The follow-up work turned up problems the audit had not listed. Each was found by
reading the code a change was about to touch, and each has a test now.

| Problem | Fixed in |
| --- | --- |
| Every visitor was given a stored session and a 7-day cookie, logged in or not. `connect-flash` wrote to the session even on a read | #61 |
| Any logged-in user could add to or remove from another user's favorites | #72 |
| Any logged-in user could open another user's profile page | #74 |
| The campsite page made four RIDB requests where one was enough. One of the four had never been needed | #65 |

Four more are filed as issues and not fixed: #68, #69, #70 and #71.

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

As of 2026-10-05. Bugs live in GitHub Issues; this list is for the rest.

- The session secret shared with v13, and the Atlas user shared by three apps.
- Three live checks from Express 5, unticked in
  [security-audit.md](security-audit.md).
- A development Maps key and a browser smoke script (critique 1). Until they exist,
  every map change is verified on the live site.
- Two checks on #73 that nobody has reported: reaching the map marker with Tab and
  Enter, and a single request to the Maps API.
- Bugs filed as issues: #68, #69, #70, #71, and #1 from 2021.
- No test for: search, the index page, comment create and edit, register error paths,
  the CSP header, cookie flags, any browser code.
- `node-geocoder` and `numeral` are dependencies that nothing requires, and
  `GEOCODER_API_KEY` is read by nothing.
- Moving from npm to pnpm. Planned, not started. On 2026-10-01 GitHub listed
  Dependabot support for pnpm 7 to 10 only, so check that first.
- The `storybooks` database still holds a full copy of v12's data as a rollback path.

Closed since the review: `connect-flash` (#61), the Google Maps loader (#73), Prettier,
ESLint and the README (#63, #67, #64). `ip-address` 10.7.2 (#57) has been part of
every deploy since 2026-10-02; nobody checked it separately.
