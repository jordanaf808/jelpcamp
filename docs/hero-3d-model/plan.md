# Hero 3D model: implementation plan

This plan covers the homepage hero from design mockup 1c: a live 3D campsite scene whose pins set the activity search. Steps 1–4 and 6 are built and reviewed. Step 5 (the still render) waits on the owner's first browser check. This file records the decisions, the problems that shaped them, the steps, and what is still open.

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
- Waiting on the owner (see [Open questions](#open-questions)): the pause control decision, the compression check, and the first browser check at `localhost:3335`.
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
- **Baseline, `main` (`e0214e0`), on `localhost:3335`, owner's Mac, cache disabled, 2026-11-12:**

  | Viewport | LCP | CLS | Total Blocking Time | JS transferred |
  | --- | --- | --- | --- | --- |
  | 1280px (desktop) | 2.61 s | 0 | 10 ms | 2,489 kB |
  | 390px (mobile) | 1.90 s | 0.006 | 0 ms | 1,478 kB |

  The desktop LCP is above the 2.5 s target before any change. Step 7 must not be worse than these. The mobile JS figure is the one a phone must not grow, since phones should not load three.js at all. The gap between desktop and mobile JS (about 1 MB) is not explained. An earlier guess that it was Mapbox was wrong: Mapbox loads on the list pages for every visitor. The 2,489 kB figure may also be all bytes transferred, not JS only, since it came from the Network panel's total. Lighthouse reports JS alone; see the note below.

  The table above is `main`, measured in DevTools. Separately, the owner ran Lighthouse on the branch (2026-11-12): LCP 1.72 s, CLS 0.005, TBT 0, JS 1,216 kB. The two sets cannot be compared: different tools, and Lighthouse simulates throttling. The branch's JS total is below the baseline's although the branch adds about 766 kB of three.js, so either the baseline figure was all bytes transferred, or Lighthouse stopped measuring before three.js loaded (it loads after the `load` event). Whether the scene appeared during that run is unconfirmed. For a valid comparison, run one tool on both builds.

### 1. Serve three.js from this app

- `npm install --save-exact three@0.187.0 esbuild@0.28.2`, both into `dependencies`. esbuild goes there because the production install runs it. Whether Render installs dev dependencies has not been checked.
- A `postinstall` script in `package.json` minifies `node_modules/three/build/three.module.js` and `three.core.js` into `public/vendor/three/`. It runs on every `npm ci`: locally, in CI, and on Render. A Dependabot bump of three rebuilds the files with nothing to remember.
- Add `public/vendor/` to `.gitignore`, to `globalIgnores` in `eslint.config.js`, and to `.prettierignore`. Without the last two, `npm run lint` parses the minified modules as browser scripts and fails, and `format:check` flags them.
- The existing `express.static` line for `/public` serves `/vendor/three/…`. No `app.js` change.
- Propose the `environment.md` note update in chat, with exact lines. The owner makes it on the Mac.

### 2. Port the scene element

Files, from the mockup's `project/wandur-campsite.js`. The names are camelCase, like the rest of `public/js/`. The mockup's one file is split so each file stays under 300 lines:

| File | Kind | Does |
| --- | --- | --- |
| `public/js/wandurCampsite.js` | classic script | the element: pins, the motion gate, camera, render loop |
| `public/js/campsiteScene.mjs` | ES module | puts the scene together: lights, pin anchors, framing |
| `public/js/campsiteLand.mjs` | ES module | ground, mountains, paths, pond, shared helpers |
| `public/js/campsiteForest.mjs` | ES module | trees and rocks, from the seeded random sequence |
| `public/js/campsiteCamp.mjs` | ES module | fire, people, tent, 4x4, sign, ram |

The element `import()`s the scene modules with three.js, so a visitor without the live scene downloads neither. ESLint lints `public/js/*.mjs` as browser modules.

- Read the three.js and scene URLs from `data-three-src` and `data-scene-src`, which the view renders. No hard-coded URL in the scripts.
- The element always shows pins, so there is no `pins` attribute.
- Until step 5 adds the still, still mode shows no image and no pins.
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

1. topo texture at opacity 0.12 (the header's `::before`)
2. `<wandur-campsite data-three-src="/vendor/three/three.module.js" data-scene-src="/js/campsiteScene.mjs">`, filling the header. Step 5 puts the still `<picture>` inside it.
3. dark left-side gradient (the header's `::after`), with `pointer-events: none` so pins under it stay clickable
4. text block: eyebrow, headline, intro, and the "Pick a spot" hint. `pointer-events: none`, so clicks reach the scene. Trade-off: the headline can't be selected with the mouse.
5. the existing `searchForm` partial, unchanged

- **The still:** a `<picture>` with `<source media="(min-width: 900px)" srcset="…">` and an `<img>` whose `src` is a 1×1 transparent `data:` image. Phones never download the still. `alt=""`, because the pins carry the meaning. `fetchpriority="high"`, because it may be the LCP element.
- **The hint** keeps its space from the start and turns visible once the element is defined (`wandur-campsite:defined ~ …`, using `visibility`). Nothing shifts when it appears.
- `min-height: 700px` at 900px and up. Below 900px the scene layer is hidden and the camo background returns.
- Tab order: nav, then pins, then the search form.
- `results.ejs` is not changed.

### 5. The still render

Done once live mode works in the owner's browser.

- **How still and live line up.** The live camera's framing (`frame()` in `campsiteScene.mjs`) fits the frame box's width up to an aspect of 2.4 (`VIEW.maxAspect`), cropping the height around a line 60% down. Wider than that, it holds the height and shows more land at the sides. Still mode applies the same rule in 2D:
  - the capture records, in the camera's view coordinates at rest, the image's rectangle, each pin's point, and the frame box's extents
  - still mode maps those to pixels for the element's size, so the image and the pins sit where the live scene puts them at every width, and the fade doesn't jump
  - this needs a handful of recorded numbers and no three.js
- **The capture covers every hero from 900px to 2560px:** wide enough for the widest (height-fitted) view, and tall enough for the tallest 900px hero. Measure the hero's tallest height at 900px first.
- **Bytes.** One large image is mostly cropped on a 2560×700 hero, yet it downloads at `fetchpriority="high"`. Offer two or three widths in `srcset` and measure. If most of the bytes go unseen, capture one still per breakpoint instead.
- **Owner, at `http://localhost:3335`:** run a console snippet, added to this plan when step 5 starts. It freezes time at 0, zeroes the mouse offset, renders the capture rectangle, and downloads it as WebP with the recorded numbers as JSON.
- The browser saves the files on the Mac. The owner puts them in a new folder in the Mac's `v12/docs`, such as `hero-still/` (not `hero-3d-model/`). The container reads them from the docs mount and copies them into `public/images/hero-scene/`. Record their sizes here.
- The shadow root gets a `<slot>`, or the `<picture>` placed inside `<wandur-campsite>` won't render once the element upgrades.
- Pins stay shown in still mode, so a focused pin keeps focus when the live scene starts or stops.
- Gate the hint on the pins being shown, not on `:defined`.
- If the scene changes, capture the still again.

### 6. Tests

Two new tests:

In `tests/heroScene.test.js`:

- The homepage has `<wandur-campsite>` with `data-three-src` and `data-scene-src` paths on this site, and `wandurCampsite.js` and `heroSearch.js` load with `defer` from this site. Step 5 adds: the still `<picture>` has a `(min-width: 900px)` source.
- Every module the scene imports is served with a JavaScript content type. The test starts from the two URLs on the page and follows each `import`, so `three.core.js` and the scene modules are covered, and the URLs can't drift from what the server serves. In CI it also proves the `postinstall` build ran.

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
- **Widths** 900, 1024, 1100, 1280, 1680, 1920, 2560 and 3440:
  - the text block doesn't cover the camp or a pin
  - every pin shows whole, Climbing included
  - the intro text stays readable where the shade fades out
  - above 1680px, the extra land at the sides shows no hard edge
- **Back:** choose an activity, follow a facility link, press Back. The pin and the dropdown match.
- **Forced colors** (Windows high contrast, or DevTools' forced-colors emulation): a pressed pin still looks pressed.
- **Frame cost:** on a 120Hz display, in Safari and Firefox as well as Chrome. Look for a long task at the first frame, where shaders compile without `KHR_parallel_shader_compile`. Decide from the numbers whether to cap the pixel density at 1.5, cap the frame rate, or merge static meshes.
- **Touch** (an iPad, or touch emulation at 1024px or wider): swiping on the hero scrolls the page.
- **Fade:** no visible jump from still to live.
- **GPU:** smooth on the Mac's display. The shadow map is drawn once, since nothing that casts a shadow moves.
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

The PR opens after round 1 is triaged, as a draft: until step 5, reduced-motion and no-WebGL visitors at 900px and up get an empty hero. Round 1's findings and how each was handled are in the PR description.

## Open questions

**A pause control (WCAG 2.2.2, Level A): decided, left out.** The live scene moves on its own for more than 5 seconds, beside the search form. 2.2.2 asks for a way on the page to pause it; the reduced-motion OS setting doesn't count. The owner chose not to add a control. This leaves a known Level A gap for visitors at 900px and wider without reduced motion. Reduced-motion visitors get no motion at all, so they are not affected.


**Does Render compress responses? Answered: yes, Brotli.** Express has no compression middleware, but the owner's check of the live site returned `encoding=[br]` and 4,620 bytes for `wandur.css` (13,775 bytes raw). So Render compresses static files. The check, for reference:

```sh
curl -s -o /dev/null --max-time 120 -H 'Accept-Encoding: br, gzip' \
  -w 'status=%{http_code} encoding=[%header{content-encoding}] type=[%header{content-type}] bytes=%{size_download}\n' \
  https://wandur.onrender.com/stylesheets/wandur.css
```

Measured on the minified three.js files: 766 KB raw, 196 KB gzip, **162 KB Brotli** (`three.module.js` 76 KB and `three.core.js` 86 KB). Brotli is what Render sends, so the download is 162 KB, not 766 KB. No compression change to the app is needed.

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

- **Compression on Render.** Answered: Brotli. See [Open questions](#open-questions).
- **Render runs the `postinstall`.** Its build command is not written down anywhere in the repo or the docs. The `[render preview]` PR answers it.
- **Mockup behavior.** Read the code only. Not run in a browser.
- **Layout from 900px to 1280px and on wide screens.** From reading `_fit()`, not from running it.
- **GPU cost.** Measured in step 7.
- **The still's file sizes.** Measured in step 5.
- **Copy and layout.** The mockup is a design draft. The final text may change.
