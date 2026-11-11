# Hero 3D model: implementation plan

This plan covers the homepage hero from design mockup 1c: a live 3D campsite scene whose pins set the activity search. Nothing is built yet. This file records the decisions, the problems that shaped them, the steps, and what is still open.

- [Hero 3D model: implementation plan](#hero-3d-model-implementation-plan)
  - [Status](#status)
  - [What 1c is](#what-1c-is)
  - [Decisions](#decisions)
  - [Problems found](#problems-found)
  - [Steps](#steps)
  - [Review](#review)
  - [Open questions](#open-questions)
  - [Done means](#done-means)
  - [Not verified yet](#not-verified-yet)

## Status

- Updated: 2026-11-11, after a review against the repo and the owner's answers. Approved. Building on `feat/hero-scene`, from `main` at `e0214e0`.
- Source: Claude Design mockup "1c" (`Homepage Hero Options.dc.html`). Read from its published code. Not run in a browser.
- Waiting on: the owner's compression check (see [Open questions](#open-questions)).
- The owner's Mac clone has an untracked copy of this file at the same path. Move or delete it before pulling a commit that contains this file, or git refuses to pull.

## What 1c is

1c is a live WebGL scene, not a picture. A low-poly isometric campsite, drawn with three.js, fills the hero behind the headline. It is packaged as a custom element, `<wandur-campsite>`. Five pins sit in the scene. Each pin maps to an Activity value that already exists in the search form (`views/partials/searchForm.ejs`):

| Pin | Activity value |
| --- | --- |
| Camping | `9` |
| Auto touring | `4` |
| Fishing | `11` |
| Hiking | `14` |
| Climbing | `7` |

The two controls stay in sync in both directions:

```
Pin clicked
  → <wandur-campsite> fires "wandur-activity" {value}
  → heroSearch.js sets #search-activities to that value

Activity dropdown changed
  → heroSearch.js sets the element's active attribute
  → the matching pin turns orange
```

## Decisions

| Topic | Decision |
| --- | --- |
| Phones (under 900px) | No scene. The existing camo hero. Neither three.js nor the still image is downloaded. |
| Gate | Width only: `(min-width: 900px)`. |
| Reduced motion | No live scene. A still render of the scene, with the same working pins. three.js is never downloaded. |
| While loading, or without WebGL | The same still render, with pins. |
| Results page | Keeps the camo hero. The user has already searched. |
| three.js delivery | The npm package, minified by esbuild whenever `npm ci` runs, into `public/vendor/three/` (git-ignored). The existing `/public` static route serves it. Same origin, so no CSP change. |
| three.js version | 0.187.0, pinned exact. |
| `.nvmrc` | Not changed on this branch. The owner keeps `24` as a local change on the Mac. |
| Tests | Two new tests. The existing tests pass unchanged. |
| Browser checks | The container serves the app on port 3335. The owner opens `http://localhost:3335` in the Mac's browser, which renders WebGL on the Mac's GPU. The container has none. |
| Review | Fresh subagents review each step group's diff. See [Review](#review). |
| This plan | Committed at `docs/hero-3d-model/plan.md`. |

What a visitor sees:

```
viewport 900px or wider?
├─ no  → camo hero. No still, no three.js, no pins.
└─ yes → still render with pins, at once
         prefers-reduced-motion: reduce?
         ├─ yes → stays on the still. three.js never loads.
         └─ no  → three.js loads → live scene fades in over the still
                  WebGL unavailable or import fails → stays on the still
```

Reduced motion and a WebGL failure end in the same place, so they share one code path.

## Problems found

1. **The mockup loads three.js from unpkg, and production's CSP blocks it.** `scriptSrcUrls` in `app.js` does not list unpkg. Serving the package from this app avoids the CSP change.
2. **`results.ejs` uses the same hero** (`landing-hero camo`). It stays as it is.
3. **The mockup is drawn at 1280px only.** Phones are covered by the camo fallback. The gap is 900–1280px and wide screens:
   - `_fit()` places the camp's center at about 70% of the hero's width at every width (the `full` preset's `shift: 0.2`). At 900px that is about x=630. The text block ends at about 620–660px, so the fire and the Camping pin would sit under the headline, and the intro text over the bright fire. This comes from reading the code, not from running it.
   - On wide heroes (1920, 2560) less of the scene shows top to bottom. A pin can land outside the canvas and still be reachable with Tab.
4. **The mockup code is built for the design tool:**
   - `preserveDrawingBuffer: true` is not needed to display the scene.
   - The `tile` and `wide` layouts, the dusk lighting, and the `layout`, `time` and `motion` attributes are unused by 1c.
   - Drag-to-rotate is unused. Its CSS sets `touch-action: none` on the canvas. An iPad held sideways (1024px or wider) passes the gate, and swiping on the hero would not scroll the page.
   - `PCFSoftShadowMap` was removed in three 0.187.0. Using it logs a warning and falls back to `PCFShadowMap`.
   - A WebGL failure calls `console.error` (mockup line 109).
   - The render loop draws every frame at up to 2× pixel density with a 2048×2048 shadow map. About 100 path discs are separate meshes, one draw call each.
5. **three.js stopped shipping minified files in 0.186.0.** 0.185.0 is the last version with them. So this app minifies them itself (step 1). Measured with gzip -9:

   | Files | Raw | Gzip |
   | --- | --- | --- |
   | 0.184.0 `three.module.min.js` + `three.core.min.js` (three's own) | 749 KB | 187 KB |
   | 0.187.0 `three.module.js` + `three.core.js` (as published) | 2,134 KB | 419 KB |
   | 0.187.0, both minified by esbuild 0.28.2 | 766 KB | 195 KB |

   esbuild minifies each file on its own, so `three.module.js` still imports `./three.core.js`, and three's MIT license header stays.
6. **Which metrics matter.** A `<canvas>` can never be the LCP element. The still `<img>` can, so LCP matters again and the still must load early. Building the scene (tree placement, then compiling shaders on the first frame) can block the main thread just when someone clicks into the form. Measure long tasks and Total Blocking Time.
7. **Repo conventions.** `environment.md` says browser libraries are pinned in the templates, not `package.json`. Serving three.js from npm is a new pattern, so that note needs an update. Recent dependencies are pinned exact, so install with `--save-exact`.

## Steps

Commit one step group at a time. `npm test`, `npm run lint` and `npm run format:check` run as part of normal work. `npm start` serves the sandbox app on port 3335 (its `.env` points at the container's own database). Stop it when the check is done.

### 0. Branch and baseline

- Create branch `feat/hero-scene` from `main`. Leave `.nvmrc` alone.
- First commit: this plan at `docs/hero-3d-model/plan.md`.
- **Baseline, before any code change:** the container serves `main` on port 3335 from a separate worktree, so the build can go on meanwhile. The owner records LCP, CLS, Total Blocking Time and JavaScript transferred on `/campsites` at 1280px and 390px, at `http://localhost:3335`. Add the numbers here.
- Localhost numbers are for before/after comparison only. Express doesn't compress, so transfer sizes are raw bytes. Load times are faster than over the network to Render.

### 1. Serve three.js from this app

- `npm install --save-exact three@0.187.0 esbuild@0.28.2`, both into `dependencies`. esbuild goes there because the production install runs it. Whether Render installs dev dependencies has not been checked.
- A `postinstall` script in `package.json` minifies `node_modules/three/build/three.module.js` and `three.core.js` into `public/vendor/three/`. It runs on every `npm ci`: locally, in CI, and on Render. A Dependabot bump of three rebuilds the files with nothing to remember.
- Add `public/vendor/` to `.gitignore`, to `globalIgnores` in `eslint.config.js`, and to `.prettierignore`. Without the last two, `npm run lint` parses the minified modules as browser scripts and fails, and `format:check` flags them.
- The existing `express.static` line for `/public` serves `/vendor/three/…`. No `app.js` change.
- Propose the `environment.md` note update in chat, with exact lines. The owner makes it on the Mac.

### 2. Port the scene element

File: `public/js/wandur-campsite.js`, from the mockup's `project/wandur-campsite.js`.

- Read the three.js URL from a `data-three-src` attribute that the view renders. No hard-coded URL in the script.
- Keep only the `full` layout at night. Remove the `tile` and `wide` presets, the dusk lights, the `layout`, `time` and `motion` attributes, and drag-to-rotate along with its `touch-action: none` and grab cursors.
- Remove `preserveDrawingBuffer: true`. Use `PCFShadowMap`.
- Two modes, one set of pin buttons:
  - **Still:** pins positioned by the percentages recorded in step 5. Works without three.js.
  - **Live:** pins positioned by projecting their 3D anchors each frame.
  - Pins are created once, when the element connects, and reused by both modes. A keyboard user focused on a pin keeps focus when live mode takes over.
- Live mode starts only when `matchMedia('(min-width: 900px) and (prefers-reduced-motion: no-preference)')` matches. Listen for changes: start live when it starts matching, tear down to still when it stops.
- Compile shaders with `renderer.compileAsync()` before the first frame.
- If WebGL or the import fails, stay on the still. `console.warn` at most, no `console.error`.
- After the first live frame, set `data-live`. CSS fades the canvas in over the still.
- Hide a pin whose projected point falls outside the canvas.
- The canvas gets `aria-hidden="true"`. Pins are buttons with `aria-pressed`. The element sets `role="group"` and an `aria-label` on itself once the pins exist.
- Pin styles use the site's CSS variables (`--accent`, `--surface-2`, ...). Custom properties pass into shadow DOM.
- Keep it a classic script (the existing IIFE). `public/js/` is linted as browser scripts, not modules. Format with Prettier.

### 3. Glue script

File: `public/js/heroSearch.js`, about 15 lines.

- On load, read the Activity select's value and set the element's `active` attribute to match. This also catches a value the browser restored on Back.
- Listen on `document` for `wandur-activity` and set the select's value from `e.detail.value`. The event bubbles and is composed.
- Listen for the select's `change` event and set `active`.
- No loop: setting a value in code does not fire `change`.

### 4. Markup and CSS

`views/campsites/index.ejs`. The header becomes `landing-hero landing-hero--scene`. Its layers, in DOM order:

1. topo texture at opacity 0.12
2. `<wandur-campsite pins data-three-src="/vendor/three/three.module.js">`, filling the header. The still `<picture>` sits inside it.
3. dark left-side gradient, with `pointer-events: none` so pins under it stay clickable
4. text block: eyebrow, headline, intro, and the "Pick a spot" hint. `pointer-events: none`, so clicks reach the scene. Trade-off: the headline can't be selected with the mouse.
5. the existing `searchForm` partial, unchanged

- **The still:** a `<picture>` with `<source media="(min-width: 900px)" srcset="…">` and an `<img>` whose `src` is a 1×1 transparent `data:` image. Phones never download the still. `alt=""`, because the pins carry the meaning. `fetchpriority="high"`, because it may be the LCP element.
- **The hint** keeps its space from the start and turns visible once the element is defined (`wandur-campsite:defined ~ …`, using `visibility`). Nothing shifts when it appears.
- `min-height: 700px` at 900px and up. Below 900px the scene layer is hidden and the camo background returns.
- Tab order: nav, then pins, then the search form.
- `results.ejs` is not changed.

### 5. The still render

Done once live mode works in the owner's browser.

- **Owner, at `http://localhost:3335`:** open the homepage with the hero at 900px wide, the narrowest width. A wider hero then crops the still top and bottom, as the live scene does, never at the sides. First check the hero's tallest height at 900px; the capture must be at least that tall.
- Run a console snippet written in step 2's commit. It freezes time at 0, zeroes the mouse offset, renders one frame at 1280, 1920 and 2560px wide, and downloads each as WebP. It also downloads the pin positions as percentages.
- The browser saves the files on the Mac. The owner puts them in a new folder in the Mac's `v12/docs`, such as `hero-still/` (not `hero-3d-model/`). The container reads them from the docs mount and copies them into `public/images/hero-scene/`. Record their sizes here.
- In still mode the image and the pins sit in a box with the still's aspect ratio. The box is anchored 60% of the way down the hero. The live camera puts the scene's center at that same height at every width (`lift: -0.1`), so still and live line up and the fade doesn't jump.
- If the scene changes, capture the still again.

### 6. Tests

Two new tests:

- The homepage has `<wandur-campsite` with `pins` and `data-three-src`, the still `<picture>` has a `(min-width: 900px)` source, and `wandur-campsite.js` and `heroSearch.js` load with `defer` from this site.
- The homepage's `data-three-src` URL returns 200 with a JavaScript content type, and so does `three.core.js` in the same folder. The test reads the URL from the page, so the server route and the element can't drift apart. In CI it also proves the `postinstall` build ran.

The existing tests, `csp.test.js` and `inlineScripts.test.js` included, must pass without edits.

Open the PR with `[render preview]` in its title. The preview's build log shows whether Render runs the `postinstall`, and the preview site shows whether `/vendor/three/three.module.js` is served.

### 7. Browser check (owner, at `http://localhost:3335`)

The container serves the branch on port 3335. The Mac clone doesn't need the branch.

- **Against the baseline:** LCP, CLS, Total Blocking Time and JavaScript transferred at 1280px and 390px. At 390px there should be no three.js request and no still image request.
- **Scene build:** in the Performance panel, look for long tasks while the scene builds.
- **Reduced motion on** (DevTools, Rendering, emulate `prefers-reduced-motion`): the still with working pins, and no three.js request.
- **WebGL unavailable** (`canvas.getContext` overridden to return `null`): the still with working pins, and no error.
- **Pins:** each pin sets the dropdown, the dropdown sets the pin, and clearing the dropdown clears the pin.
- **Keyboard:** Tab goes nav, pins, form. Pins show a focus ring. A pin focused during the still keeps focus when live mode starts.
- **Widths** 900, 1024, 1100, 1280, 1920 and 2560: the text block doesn't cover the camp, no pin sits off-canvas, and the intro text stays readable over the scene.
- **Touch** (an iPad, or touch emulation at 1024px or wider): swiping on the hero scrolls the page.
- **Fade:** no visible jump from still to live.
- **GPU:** smooth on the Mac's display. If it isn't, cap pixel density at 1.5 or halve the shadow map, then measure again.
- **Console:** no errors.

## Review

The author writes the code. Fresh subagents review each step group's diff. They are not forks of the author's session, which would carry over the author's assumptions. Each reviewer gets the diff, this plan and the repo's rules, and only reads; it changes nothing. The author triages every finding as fixed, skipped or not a problem, with a reason, and the PR lists the results.

| Round | Diff | Reviewer | Model |
| --- | --- | --- | --- |
| 1 | Steps 1–4 and 6 | Correctness | Fable 5.2 |
| 1 | Steps 1–4 and 6 | Accessibility and performance | Opus 5.5 |
| 1 | Steps 1–4 and 6 | Spec (against this plan) | Sonnet 5.5 |
| 1 | Steps 1–4 and 6 | Standards (the repo's conventions) | Sonnet 5.5 |
| 1 | Step 1 | Security (the `postinstall` script, the new dependencies) | Sonnet 5.5 |
| 2 | Step 5 | Correctness | Opus 5.5 |
| 2 | Step 5 | Accessibility | Sonnet 5.5 |

The author is Opus 5.5. Correctness goes to a different, stronger model because that review is the main check on code no test covers and the container can't run. No reviewer runs the scene. The owner's check at `localhost:3335` is the real test of steps 2–5.

The PR opens after round 1 is triaged.

## Open questions

**Does Render compress responses?** Express has no compression middleware. The container can't reach the live site, so the owner runs this on the Mac. The first request can take about a minute while the free instance wakes.

```sh
curl -s -o /dev/null --max-time 120 -H 'Accept-Encoding: br, gzip' \
  -w 'status=%{http_code} encoding=[%header{content-encoding}] type=[%header{content-type}] bytes=%{size_download}\n' \
  https://wandur.onrender.com/stylesheets/wandur.css
```

`wandur.css` is 13,775 bytes uncompressed. `encoding=[br]` or `[gzip]` with fewer bytes means Render compresses. `encoding=[]` with 13,775 bytes means it doesn't. Then three.js goes out at 766 KB instead of 195 KB, and adding compression to the app becomes its own small PR.

## Done means

- All existing tests pass, along with the two new ones.
- `npm run lint` and `npm run format:check` pass.
- `npm ci` writes the minified three.js to `public/vendor/three/`, and git, ESLint and Prettier ignore it.
- The Render preview serves `/vendor/three/three.module.js`.
- At phone width, the page requests neither three.js nor the still.
- With reduced motion on, the still shows with working pins, and three.js is not requested.
- On desktop, the live scene runs, and the pins and the dropdown stay in sync.
- With WebGL unavailable, the still shows with working pins.
- On a touch screen at 900px or wider, swiping on the hero scrolls the page.
- LCP and CLS are no worse than the baseline. Total Blocking Time is recorded.

## Not verified yet

- **Compression on Render.** See [Open questions](#open-questions).
- **Render runs the `postinstall`.** Its build command is not written down anywhere in the repo or the docs. The `[render preview]` PR answers it.
- **Mockup behavior.** Read the code only. Not run in a browser.
- **Layout from 900px to 1280px and on wide screens.** From reading `_fit()`, not from running it.
- **GPU cost.** Measured in step 7.
- **The still's file sizes.** Measured in step 5.
- **Copy and layout.** The mockup is a design draft. The final text may change.
