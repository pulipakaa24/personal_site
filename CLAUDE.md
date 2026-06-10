# Personal Site — Master Context & Development Guide

> **This is the master context document for Aditya Pulipaka's personal portfolio site.**
> It is the single source of truth for *how this site is built, why it's built that way, what
> has been done, what the user has asked for, and what remains.* It exists so that any coding
> agent (or future me) can open it cold and **seamlessly continue developing in the same style**.
>
> ### ⚠️ KEEP THIS DOCUMENT ALIVE
> **This doc must be continuously updated. Update it as part of *every* operation** — not as an
> afterthought. When you change architecture, add a viewer, fix a gotcha, finish a task, or the
> user asks for something new:
> 1. Update the relevant section (architecture / conventions / viewer specifics).
> 2. Append to the **Changelog** (§12) what you did.
> 3. Append to **Requests Log** (§13) anything the user newly asked for, and move finished items.
> 4. Update **Roadmap / Remaining** (§14) and **Open Questions** (§15).
>
> Treat editing this file as the closing step of a task, the same way you'd update a test. If you
> only have time for one doc update, update the Changelog + Roadmap. A stale context doc is worse
> than none — it misleads the next agent.
>
> Last updated: **2026-06-10**.

---

## 1. Who the user is

**Aditya Pulipaka** — ECE Honors @ UT Austin (4.00 GPA), Embedded SWE Intern @ Qualcomm,
Levitation Subteam Lead @ Guadaloop (the UT Austin Hyperloop team). Email: `adipu@utexas.edu`.

He is a strong embedded/hardware + software engineer. He builds physical systems (sensors, motors,
levitation rigs, robotics) and the firmware/software around them. The portfolio's job is to show
**real engineering depth** through his hardware projects, led by bold typography and interactive
3D — *not* gimmicks.

**Working style he expects from agents:**
- He is technically precise and gives exact geometry / axis directions / values. Honor them literally;
  when in doubt about a physical detail, **ask rather than guess** (he has explicitly offered to
  hand-tune things himself if that's more precise).
- He verifies visually and expects you to verify too (headless render loop, §10) — don't claim a
  visual change works without rendering it.
- He likes self-contained, pragmatic solutions over heavy stacks.
- He'll say "pause when you finish this todo item" — respect explicit stop points.

---

## 2. What this site is (product vision)

A personal portfolio at `/Users/adipu/Personal Site/personal_site/` (its own git repo, branch `main`).

- **Self-contained static site. No build step.** Plain HTML/CSS/JS. Three.js loaded from the
  jsdelivr CDN via an ES-module import map (r160). This was a deliberate pragmatic-MVP choice over
  the Next.js + react-three-fiber stack an old `PORTFOLIO_ROADMAP.md` envisioned. Can migrate later;
  don't introduce a build step without the user asking.
- The hero experience is **scroll-driven 3D viewers** of his hardware projects (Guadaloop rig,
  RescueVision hub, and more to come), each telling the project's story as you scroll, then docking
  into a normal scrolling case-study.
- Visual identity: bold uppercase typography, black background, burnt-orange accent. Lead with type +
  photo + history. **No 3D model of his head** (he rejected it as uncanny-valley/gimmick) — 3D is
  reserved for the actual project hardware.

---

## 3. Design system (visual language)

Shared across landing page, project pages, and viewers. Mirror this for anything new.

- **Background:** black `#000`.
- **Display type:** white, "Helvetica Neue", huge **uppercase 800-weight** headings with negative
  letter-spacing. Outlined-word treatment (`.ol` — transparent fill, stroked) for hero titles.
- **Accent:** burnt **orange `#ff6a00`** (ties to UT Austin + the Guadaloop yoke color). This is the
  signature — use it for highlights, active states, leader lines.
- **Secondary accent:** cyan `#19d3ff` (used sparingly, e.g. UWB ripples).
- **Motion:** reveal-on-scroll via `IntersectionObserver`; pointer-following glow. Easing is
  `easeInOutCubic`-style; nothing snaps.
- **Coordinate-frame / dimension call-outs:** colored axes — **X red `#ff5a5a`, Y green `#57e07a`,
  Z blue `#5aa6ff`** (standard RGB=XYZ). SVG leader lines for dimensions.

---

## 4. Architecture & file structure

```
personal_site/                      ← repo root (serve THIS dir; see §10)
├── CLAUDE.md                       ← THIS FILE (master context, auto-loaded)
├── README.md
├── index.html                      ← landing page (self-contained, ~817 lines)
├── assets/
│   ├── project.css                 ← shared project-page identity (tokens, nav, type, footer, reveals)
│   ├── project.js                  ← shared project-page behavior (nav, reveal animations)
│   └── projects/<name>/            ← thumbnails (guadaloop/, rescuevision/, smartpt/, blindmaster/, …)
├── projects/                       ← per-project case-study pages (regular scrolling pages)
│   ├── rescuevision.html  smartpt.html  blindmaster.html
│   └── harmonium.html  lidar-slam.html  tweinstein.html
└── viewers/                        ← the scroll-driven 3D experiences
    ├── shared/                     ← THE reusable framework (see §5)
    │   ├── engine.js               ← scene, IBL, Storyboard class, VIEWS, math   (~326 lines)
    │   ├── appearance.js           ← AppearanceEditor (press G), material presets (~304 lines)
    │   └── viewer.css              ← all shared viewer styles                     (~111 lines)
    ├── guadaloop/                  ← Guadaloop levitation-rig viewer (§8)
    │   ├── index.html  model_plain.glb  groups.json  instruct.md
    └── rescuevision/               ← RescueVision hub viewer (§7) — the reference template
        ├── index.html  hub.glb  appearance.json
```

**Three decoupled layers** (the user explicitly wants project pages to share ONE identity but handle
DIFFERENT content types equally — not every page is a 3D scroll experience):
1. **Identity layer** — `assets/project.css` + `assets/project.js`. Shared verbatim. Design tokens,
   nav, type, buttons, footer, reveal animations.
2. **Hero slot** — swappable media per page: scroll-driven 3D / embedded canvas, video, image/gallery,
   or abstract generated placeholder. Changing the medium must NOT change the chrome.
3. **Content modules** — opt-in blocks (overview, problem, deep-dive cards, results, gallery, video,
   diagram, facts strip). Each page composes only what its content needs.

**Source content** for the pages was pre-filled from the user's `LinkedIn_Compiled/` folder (in the
*old* root `/Users/adipu/Personal Site/`, NOT inside `personal_site/`): `projects/<slug>/<slug>.md`
(TL;DR, problem, stack, decisions), `courses.md`, `experience.md`, `education.md`,
`honors_and_credentials.md`, `skills_and_languages.md`.

---

## 5. The shared 3D viewer framework (`viewers/shared/`)

This is the heart of the interactive work. To build a new viewer, **copy `viewers/rescuevision/index.html`
as the template** and swap the GLB + `classify()` + `chapters`. A docking viewer also creates a
**`DockController`** (below) in `start()` and calls `dock.update()` from its `tick()` loop — that's the
whole dock-to-case-study shell; you no longer hand-roll `applyDock`/scroll-mapping/reveal-observer per viewer.

### `engine.js` (ES module) exports:
- **Math:** `clamp01, lerp, smoothstep, ease (easeInOutCubic), trap, trapUpDown`.
- **`pca(pts)`** — PCA via Jacobi eigen-decomposition (shared by the coordinate-frame / hinge / tube-axis
  derivations); returns `{center, axes (sorted by extent desc), ext}`. *(Was duplicated inline in both
  viewers as `eigenSym3`+local PCA — centralized 2026-06-10.)*
- **`VIEWS`** — named camera directions (unit `dir` + `up`):
  - `iso` `(0.85,0.5,1.0)` — the default 3/4 view.
  - `iso2` `(0.34,-0.18,0.90)` — swung around and **slightly below, looking up** (RescueVision's
    second coordinate-frame perspective).
  - `isoL` (mirror iso), `front`, `back`, `side`, `top`.
- **`createStudioScene(canvas,{exposure,fov,near,far})`** — renderer + `ACESFilmicToneMapping` +
  studio IBL (`buildStudioEnv`) + hemisphere light + camera-relative headlights (`updateHeadlights`).
  Canvas is `alpha:true` so the page stays black behind the model; the env only lights/reflects.
- **`loadGLB`, `prepareMeshes(model,onMaterial)`** — clones per-mesh materials, stashes base colors,
  and sets a **stable per-load key** `o.userData.key = '<name>#<index>'` so unnamed CAD sub-meshes
  are independently targetable.
- **`centerModel, setOpacity` (depthWrite-on, avoids X-ray), `makeVis(VG)`, `frameCamera`, `projectPoint`.**
- **`Storyboard`** — the data-driven scroll engine. You give it `chapters[]`; it resolves the current
  scroll progress to a camera framing + opacities + overlays each frame.
- **`DockController`** — the shared **dock-to-case-study shell** (extracted 2026-06-10; was duplicated in
  both viewers). Owns: the scroll→`progress`/`dockK` mapping + `layout()`; the canvas dock lerp
  (`applyDock`); the storyboard-overlay fade; the `#case .reveal` IntersectionObserver; and the **docked
  rotisserie with the smooth two-way hand-off** (the `ang0 + wrapPi(spin)*spinKeep` orbit — see §7).
  Construct in `start()` with `{ canvas, renderer, camera, spacer, getBox:()=>boxes.all,
  onStory:(p)=>story.resolve(p), onDockSettle? }` (`onDockSettle` runs every docked frame — SmartPT uses it
  to reset the brace to the assembled pose). The viewer keeps its own `tick()` (editor/tuner/render) and
  just calls `dock.update()` while the storyboard is active; read `dock.dockK`/`dock.shownProgress` for any
  viewer-side logic (drag guards, editor re-resolve). Relies on the standard ids (`#c`, `#spacer`,
  `#title/#panel/#blurb/#dims`, `#scrollhint/#hint/#hud-progress`, optional `#dockhint`). The docked-card
  CSS (`#c.docked`, `#dockhint`) lives in `viewer.css`. Guadaloop opts out (no dock — never creates one).
  It also owns the **docked-window controls** (built in JS by `_buildDockUI()`, no per-viewer HTML, shown only
  when `dockK ≥ 0.985`): `#dockwin` (transparent click-catcher over the card → `replay()` smooth-scrolls back
  up to the last storyboard beat full-screen), `#dockmin` ("›" minimise → `collapse()` slides the card off the
  right edge via `#c.docked.collapsed`), and `#docktab` ("‹ 3D" edge tab → `expand()`). `update()` auto-clears
  `collapsed` when `dockK < DOCK_FULL` (scrolling back toward the 3D). Minimise (corner button) and replay
  (body click) are intentionally separate gestures. `_cardRect()` is the single source for the card's resting
  rect (shared by `applyDock` + the controls).

### The `Storyboard` chapter model
Each chapter is an object:
```js
{ r:[start,end],            // scroll-progress range it owns (0..1 over the #spacer)
  box:'<groupKey>'|'all',   // what to frame (a vis-group, or a named runtime Box3 like 'transform')
  view:'iso'|'front'|...,   // camera direction from VIEWS
  pan: 0..1,                // horizontal offset (model slides left so panels have room);
                            //   auto-reduced on narrow/portrait viewports — frameCamera scales it by
                            //   min(1, camera.aspect/PAN_FULL_ASPECT) so it never slides off a phone's left edge
  fit: number,              // zoom multiplier on the framed box (bigger = further out)
  vis: vis({ALL:1, grp:1}), // per-vis-group target opacity (TRANS≈translucent for the rest)
  panel:{mode:'hero'|'side'|'none', sec, blurb, tag},
  dims:'<kind>'|null,       // which dimension/coord overlay to draw
  finale:bool,
  hooks:{ onResolve(ctx), drawDims(kind) }  // per-chapter project-specific per-frame work
}
```
Key behaviors:
- Camera lerps from the previous chapter's framing to the current one, reaching target by
  `localT == HOLD (0.62)` then holding. Easing `easeInOutCubic`.
- Per-vis-group opacity uses neighbor-aware fade windows (return-to-assembly chapters fade the rest
  back in LATE, only after the camera pulls away).
- Overlays: hero title scrolls up; side panel (top-right) + bottom blurb fade per `panel`; `dims`
  SVG overlay. **The dims overlay holds across consecutive same-`dims` chapters** (no flicker between
  multi-stage acts) — `updateOverlays` is neighbor-aware.

### `appearance.js` — `AppearanceEditor` (press **G** in any viewer)
The GLBs ship with few/no good materials, so this lets the user dress them and export JSON.
- **Palette** of material presets (PCB green, black plastic, matte black, white ABS, grey nylon,
  aluminium, steel, copper, gold pin, accent orange, signal red, signal blue) — `DEFAULT_PALETTE`.
- **Three click modes:**
  - **Part** — the whole clicked sub-mesh.
  - **Body** — the whole connected sub-body (vertex-adjacency flood across all shared edges, **no angle
    limit**) — isolates one solid even inside a multi-body primitive. *This is the mode for "ESP32 is
    black but the RF shield is aluminium" / "sensor is red but the antenna square is black".*
  - **Face** — coplanar facet only.
- Everything keyed by the stable `userData.key = '<name>#<index>'` (legacy bare-name keys still resolve,
  distinguished by the `#`). A single part can carry **multiple** facet/body appearances:
  `paintFacesMulti` batches ALL of a mesh's assignments into ONE geometry-group rebuild. *(Bug history:
  an earlier per-call `clearGroups()` let only the last assignment survive — fixed.)*
- Sliders for color/metalness/roughness, "+ new appearance", **Export → `appearance.json`**.
- `applyAppearance(meshes, json)` re-applies a saved map at load. JSON shape:
  `{palette, parts:{key:idx}, faces:[{name/key, app, tris}]}`.

### `viewer.css`
All shared viewer chrome: hero `#title` with outlined `.ol` word, `#panel` (top-right side title),
`#blurb` (bottom-right), `#dims` SVG overlay (+ `.ax-x/.ax-y/.ax-z/.pill` coord call-out classes),
`nav` (with **glass chips** on `.brand`/`.pbtn`), `#loader`, the **docked-window controls**
(`#dockwin`/`#dockmin`/`#docktab` + `#c.docked.collapsed` slide-off), and the editor shell
(`#editor/#legend/#picked/#dump`). Phone breakpoint `@media(max-width:640px)` + `@media(pointer:coarse)`.

### GLTFLoader gotcha (bit us hard — remember it)
**Node names get spaces and dots STRIPPED** by GLTFLoader
(e.g. `NEMA 17 Stepper Motor 23mm.STEP` → `NEMA17StepperMotor23mmSTEP`). Always match against a
compacted lowercase ancestor-name chain:
```js
names.join('/').replace(/[^a-z0-9]/gi,'').toLowerCase()
```

---

## 6. Local verification workflow (headless render loop) — USE THIS

Never claim a visual change works without rendering it. Three.js viewers need HTTP, not `file://`.

1. **Serve the repo root:**
   `python3 -m http.server 8100 --directory "/Users/adipu/Personal Site/personal_site"` (background).
   URLs: `/index.html`, `/viewers/guadaloop/index.html`, `/viewers/rescuevision/index.html`.
2. **Screenshot via puppeteer-core driving installed Chrome** (in `/tmp`, since the 3D viewers need a
   real GL context):
   - puppeteer-core@23 installed in `/tmp`; require `/private/tmp/node_modules/puppeteer-core`.
   - Chrome: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
   - WebGL launch args: `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader
     --ignore-gpu-blocklist --no-sandbox`.
   - **Defeat headless throttling:** add `--disable-background-timer-throttling
     --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`, and after
     `window.scrollTo`, **poll `#hud-progress` until it equals the target %** before capturing —
     otherwise you screenshot a mid-transition frame and misread it as a bug.
   - For landing-page scroll-reveal, scroll `document.scrollingElement` (NOT `window`) before a
     `fullPage` capture so IntersectionObserver fires.
3. **Reusable scripts in `/private/tmp`** (recreate if `/tmp` was cleaned — it's periodically wiped):
   - `shotu.cjs <urlPath> <out> <frac>` — generic.
   - `shotp.cjs <out> <storyProgress>` — RescueVision; scrolls by storyboard progress via the `#spacer`.
   - `shotbody.cjs` — landing page.
   - `shotdock.cjs`, `shotori.cjs <hash>`, `shotcard.cjs <worldDir>`, `diagrender.cjs` (group-colored
     model overview), `pca.cjs` (per-group PCA), `frames.cjs` (reads actor frame vectors),
     `uwb.cjs` (UWB sub-mesh inspection), `errcheck.cjs` (console errors), `bodytest.cjs`, `edcheck.cjs`.

Node is v26. This loop was used to read live three.js material state and tune every storyboard beat.

### Mobile / iPhone verification (added 2026-06-10)
Three complementary loops — pick by what you're testing:
1. **iPhone-viewport (Chrome / puppeteer)** — `/private/tmp/iphone.cjs <urlPath> <outPrefix> <fracs>`. Reuses
   the puppeteer-core+Chrome harness with `page.emulate({viewport:{390×844, isMobile, hasTouch}})`. Fast and
   scriptable; drives the storyboard via `scrollTo`. **Use for** mobile **layout + perf + per-frame** render
   checks + console health. **Does NOT** reproduce Safari's scroll quirk (Chrome lacks it).
2. **Real iOS Simulator (authentic Mobile Safari / WebKit)** — `xcrun simctl list devices available | grep
   iPhone`; boot `xcrun simctl boot <udid>` + `open -a Simulator`; the sim shares the host network so load
   `xcrun simctl openurl booted http://localhost:8100/...`; capture `xcrun simctl io booted screenshot out.png`.
   **Gold standard for rendering/layout on true iOS.** **Caveat — can't script touch gestures:** synthetic
   host input needs macOS Accessibility (TCC) which can't be granted programmatically — `cliclick` is blocked,
   and `idb` needs the dead `facebook/fb` brew tap. So you only see **frame 1** unless the user grants
   Accessibility to the terminal (then `cliclick` click-drags on the sim window become real touches) or tests
   on a physical iPhone.
3. **Real WebKit hit-test (Playwright webkit)** — `/private/tmp/wk_hittest.cjs`. Runs the actual Safari engine
   headless; A/Bs `document.elementFromPoint(centerX,centerY)` with the canvas `pointer-events` forced
   `auto` (OLD) vs as-shipped (FIXED). This proves the **exact causal mechanism** of the scroll bug + the fix
   on the real engine without needing a touch gesture (a native touch-pan can't be script-driven in any
   engine — synthetic touch events don't trigger native scrolling). Playwright+webkit live in `/private/tmp`
   (`npm i playwright` + `npx playwright install webkit`).

---

## 7. RescueVision viewer (`viewers/rescuevision/`) — the reference build

The most fully-developed viewer; the template for all others. Model: `hub.glb`. Built on the §5 framework.

### Model quirks
`hub.glb` is an **assembled hub HEAD** (radar / ESP32 / UWB / mount / breadboards + stepper body)
clustered tightly, PLUS **loose unassembled CAD parts** (LM2596/MT3608/A4988 boards, stepper connector
pins & screws) dumped far away near the origin. The viewer detects the head cluster (around the grey
`HubMain` enclosure) and **hides every mesh whose center is > ~4.5× the enclosure size from the head
center** → 110 of 124 meshes kept, clean framing.

### Orientation — driven off the ESP32's own axes
The user wanted the **ESP32 ("the brain")** as the upright, camera-facing reference (NOT the radar).
Pipeline: stand up `rx = -90°` (SolidWorks Z-up → Y-up), then apply a rotation mapping the ESP32's
measured PCA long-axis `ESP_U=(0.035,0.979,0.198)` → world **+Y** (upright) and its face normal
`ESP_N=(0.017,0.198,-0.980)` → the iso camera azimuth (face directly faces camera). Built via
`Matrix4.makeBasis(targets).multiply(makeBasis(src).invert())`. Those constants were PCA-measured in
the standup frame — **re-measure if `hub.glb` changes.** Still hash-tunable on top via `#rx=&ry=&rz=`
(degrees, world axes).

### Vis-groups (`classify()`, compacted-name regex)
`iwr` (TI board placeholder / mmWave sensor), `stepper` (NEMA 17), `esp32` (ESP32-S3-DEVKITC),
`uwb` (Qorvo DWM3001CDK), `power`, `hubbody` (HubMain), `mount` (RadioMount / RadarMountToStepper),
`other`.

### Storyboard (scroll mapped over a ~1150vh `#spacer`)
Current chapters (see `index.html` ~line 426):
| range | box | view | fit | beat |
|-------|-----|------|-----|------|
| 0.00–0.06 | all | iso | — | intro / hero title |
| 0.06–0.16 | iwr | iso | — | **01** isolate IWR mmWave sensor (rest translucent) |
| 0.16–0.24 | iwr | front | — | IWR front-on |
| 0.24–0.36 | stepper | iso | — | **02** isolate stepper motor |
| 0.36–0.48 | esp32 | iso | — | **02** isolate ESP32 (same "Sweep & Brain"/Control section) |
| 0.48–0.56 | frame | iso | 2.3 | **03** Frame of Reference, stage 1 — establish both coord frames in context |
| 0.56–0.64 | transform | iso2 | 1.25 | **03** stage 2 — camera swings **down/looks up + zooms in tight** on the transform |
| 0.64–0.90 | scene | iso | 1.45 | **04** Responder Localization finale |
| 0.90–1.00 | all | iso | 2.0 | settle |

### Coordinate frames (the precise part — the user gave exact axis directions)
Axes are derived **at runtime from each module's actual geometry** (PCA via `analyzeGroup` / `eigenSym3`
Jacobi), to match the real frames in the firmware header
`LinkedIn_Compiled/projects/rescue-vision/rescueVision/include/dwm_geom.h`.
- **TI mmWave (IWR) convention:** x = right / along long body, y = forward / **boresight (out the
  antenna bump)**, z = up. In the inverted hub: **IWR(CS1)** X = long body, Y = boresight out the bump
  (CS1 is **centered on the bump cluster**), Z = width (down).
- **UWB (DWM3001, CS2):** X = flat-side normal, Y = thin side, Z = down (hub is inverted vs the
  SolidWorks image). **CS2 is centered on the DWM antenna** — auto-detected as the small UWB sub-body
  that pops furthest out of the flat face toward the bottom
  (`score = maxProjection·X2 + 0.4·centroid·Z2`; picks `mesh_67_2`, a 156-tri body at the board bottom).
- The two modules are **genuinely rotated relative to each other** (different Z directions) — this is
  real, per the user and the image. Don't "fix" them to be parallel.
- Gizmos are small thin arrows rendered **on top** (`depthTest:false; depthWrite:false; renderOrder:10`,
  length `L=S*0.10`), so they aren't occluded inside translucent boards. Offset "legs" (the stepped
  path from CS1 to CS2) are lines `depthTest:false renderOrder:9`.
- **Real transform offsets (IWR frame, from `dwm_geom.h`):** dX **−43.18**, dY **+13.97**, dZ **+92.43**
  mm, distance ≈ **103.0 mm**. (NOT the image's 54.82/83.47 — that was a misread; `dwm_geom.h` is
  authoritative. Also `DWM_GEOM_TILT_X_DEG = −10.0`.)
- Grid + gizmos + offset legs are driven off **GLOBAL** scroll progress (`FRAME_R`) so they persist
  across the stage-1→stage-2 boundary instead of popping.

> **⚠️ OPEN — axis "out" signs (see §15):** the two boresight/normal out-signs and the two down-signs
> are best-guess defaults, flippable live via URL hash: `#cs1y=1` (radar boresight), `#cs1z=1` (radar
> down), `#cs2x=1` (UWB flat normal), `#cs2z=1` (UWB down). **Awaiting the user's confirmed combo to
> bake as default and drop the hash.**

### Finale (04 — Responder Localization)
Camera pulls back to a scene box; a phone glides in on a ground grid; cyan UWB ripples (billboard
rings) emanate from the Qorvo module; a phone→UWB ranging line resolves **dashed → solid** as it
"locks" (indicator dot **orange → green**). The phone is **draggable on the XZ plane** during the finale.

### Dock-to-case-study
After the storyboard, scroll keeps going: the fixed canvas **lerps to a top-right card** (`#c.docked`,
responsive size), storyboard overlays fade out, the docked model auto-rotates, and a normal-flow
`<article id="case">` (the RescueVision write-up) scrolls in below. `dockK` from
`(scrollY − (storyEnd − 0.45vh)) / 0.7vh`. The docked card is **collapsible** (minimise "›" → slides off to a
"‹ 3D" edge tab) and **clicking the model replays the walkthrough** (smooth-scrolls back up) — both shared via
`DockController` (§5), so SmartPT gets them too.
- **Opaque floating window:** `#c.docked` is an **opaque** dark card (`background:#0a0b0e`) with
  `z-index:6` — *above* the article (`#case` is `z-index:5`, and its `.facts div`/`.dive` cards are
  opaque). So page content scrolls cleanly **behind** the card instead of clashing over the model. (The
  canvas keeps `pointer-events:none` once docked so scroll/clicks still reach the article underneath.)
- **Rotation hand-off (smooth, two-way):** the auto-rotate is an azimuth orbit around `boxes.all`,
  `ang = ang0 + wrapPi(dockSpin)*spinKeep`. `ang0` = the **settled iso azimuth** (so docking in continues
  from where the scroll left off — no jolt). `dockSpin` (eased up from rest, `DOCK_SPIN_SPEED 0.2` rad/s)
  accumulates **only when fully docked** (`dockK ≥ DOCK_FULL 0.999`). `spinKeep =
  smoothstep((dockK − DOCK_SETTLE 0.8)/(DOCK_FULL − DOCK_SETTLE))` blends the spin **out** across the
  transition band `dockK ∈ [0.8, 1]`, so scrolling back *up* eases the model back to the iso framing as a
  function of scroll position — via the **shortest angular path** (`wrapPi`, so long accumulated spins
  don't whirl backwards). Below `DOCK_SETTLE` the orbit hands off to `story.resolve` and `dockSpin` resets.
  *(SmartPT uses the identical dock loop; its orbit branch also resets the shell to the assembled pose +
  hides the leg silhouette.)*

**The case-study article uses the SHARED `assets/project.css` identity** (linked into the viewer after
`viewer.css`), with the exact same markup as `projects/*.html`: `.wrap` → `.award` pill + `.lede` →
`dl.facts.reveal` → `section.block.reveal` (orange-dash `h2`s) → `.dives/.dive` cards → `.btn` media
links → `footer.wrap`. So the scrolled-in write-up reads identically to TweinStein et al. A small inline
`<style>` only carries the bits unique to the docked-viewer context (`#case` z-index/padding, a `.lede`
`max-width` + extra `padding-top` to clear the top-right model card, `.dive` bullet markers). A reveal
`IntersectionObserver` in the viewer script adds `.in` to `#case .reveal` (project.css hides `.reveal`
at opacity 0, so this is REQUIRED or the write-up renders blank). *(Earlier the case study had a
hand-rolled inline approximation of the project-page look — replaced 2026-06-09 to use the real shared
CSS.)*

### Appearance
`appearance.json` currently ships the palette (+ whatever the user has painted — the sensor placeholder
was painted **red**). Model otherwise uses baked CAD colors with a matte default (roughness ≥ 0.52).
Dress further via the **G** editor.

---

## 8. Guadaloop viewer (`viewers/guadaloop/`)

The scroll-driven 3D viewer of the Guadaloop levitation rig. Model `model_plain.glb` + `groups.json`.
Originally the standalone prototype (`site_prototype/`, now deleted), **ported onto the shared engine**.
It keeps its own inline **grouping** editor (assigns vis-groups, NOT appearances — different from the
RescueVision appearance editor).

Full multi-stage storyboard (spec in `viewers/guadaloop/instruct.md`): outlined-word hero title
(upper-left) → per-section stages where the model pans left while a side title + bottom blurb appear and
the camera swings iso/front/top. Vis-groups (`yokecore, coil, sensormod, sensorholder, railbar,
railslider, railholder, railtrack, chassis, other`) tagged by `semanticByName()` + geometry backfill
(unnamed instances inherit a named sibling's tag) so sub-parts fade independently. Rails finale = the
**sled** (chassis + yoke + sensors + coils + lower slider) travels world +Y on a `trap()` trapezoidal
profile while bars/track/clamps stay fixed (movers precompute worldBase + parentInv for exact world-space
translation).

### Lighting recipe (CAD-render look) — hard-won, reuse for metal-heavy models
Target look: the reference render `Guadaloop/TestRig Current/UsefulCrop.png` (glossy studio CAD —
bright satin steel, clean white plastic, saturated copper). The rig is almost entirely metal
(metalness=1), which has **no diffuse — it's lit only by what it reflects**:
- **Direct lights barely matter for metals** — the look comes from the **IBL environment**, not
  DirectionalLights. Stock `RoomEnvironment` is a dark room → smooth metals mirror black. Replaced with
  a custom bright **gradient studio env** (`buildStudioEnv()`): bright-cool-top → dark-base surround
  sphere + HDR emissive softbox panels (tall ones for vertical glints), low PMREM blur (~0.06) so
  reflections stay crisp.
- **Mirror vs satin was THE fix:** CAD steel at `roughness 0.14` reflects the dark side of the room →
  reads black. Bump every metal to `roughness ≥ 0.34` (satin) → reflects the bright average → bright
  brushed steel.
- **Tone mapping: `ACESFilmicToneMapping`** (exposure ~1.1). AgX desaturates/flattens — wrong here.
- Warm camera key + cool fill (camera-relative) + cool hemisphere → warm-highlight / blue-shadow studio.
- The vertical `Slide_rail_metal_bar` parts ship as bluish `defaultplastic`; recolored to the track's
  `polishedsteel` (`baseColor [0.573,0.542,0.511]`) at load so they match.

---

## 9. Landing page (`index.html`)

Self-contained, ~817 lines. Sections: hero, marquee, about, **work grid**, experience timeline, honors,
coursework, skills, contact/footer.
- **Work grid:** 4 row-wide **featured cards** (`.card.feat`) = the projects with CAD `.glb` files →
  link to their 3D viewers: **Guadaloop** (→ `viewers/guadaloop/`), **RescueVision**
  (→ `viewers/rescuevision/`), **SmartPT**, **BlindMaster**. Featured cards get a subtle corner **"3D"
  cube badge**. LiDAR-SLAM, TweinStein, Harmonium are regular 2-col cards. Thumbnails live in
  `assets/projects/<name>/`.
- **Skill chips are clickable** — each opens a popover listing the projects + courses that used it,
  built by inverting a `PROJECTS`/`COURSES` skill map in the page script.
- **Credentials convention (apply consistently):** de-emphasize but don't hide high-school-era signals.
  Recognition drops National Merit + HS Summa Cum Laude; SAT/PSAT live in a *lighter* "Standardized
  Tests" strip (not award cards). Coursework lists relevant **college** courses (no "transfer" labels);
  AP/gen-ed transfers are acknowledged in ONE muted footnote, not itemized. Course numbers come from the
  official transcript (Neural Engineering is **ECE 385J**, not ECE 374N as LinkedIn said). 4.00 GPA.

---

## 10. Conventions & gotchas (quick reference)

- **No build step. No new dependencies / frameworks without the user asking.** Three.js via CDN import map.
- **GLTFLoader strips spaces & dots from names** — match compacted lowercase name chains (§5).
- **Per-mesh material clone** in `prepareMeshes`; opacity via `setOpacity` with depthWrite ON (no X-ray).
- **Stable keys:** `userData.key = '<name>#<index>'` — use for any per-sub-mesh targeting.
- **Coordinate-axis colors:** X red, Y green, Z blue. Gizmos render on top (`depthTest:false`).
- **Physical accuracy comes from source, not the marketing image:** firmware headers (`dwm_geom.h`) and
  measured PCA beat a possibly-inverted SolidWorks screenshot. When the user cites exact axis directions
  or values, those win — honor them literally.
- **iOS scroll-eating fixed canvas:** a viewport-filling `position:fixed` element with `pointer-events:auto`
  swallows the touch-scroll gesture on **iOS WebKit** (the page won't scroll behind it; desktop wheel-scroll
  is unaffected, so the bug hides until you test on a phone). Keep `#c` `pointer-events:none` on touch
  devices — the exported `COARSE` const (`matchMedia('(pointer:coarse)')`) in `engine.js` gates this *and*
  the mobile render budget (no MSAA, DPR≤1.5). Re-enable canvas pointer-events only where needed
  (`body.editing #c`, or `applyDock`'s `!COARSE` branch for the desktop phone-drag).
- **Verify visually** before declaring a visual change done (§6). Poll `#hud-progress` before shooting.
- **Clean up debug handles** before finishing (`window.__rv`, `__editor`, `__debug`) — grep to confirm.
- **Hash overrides** are the live-tuning mechanism for things awaiting the user's eye (`#rx/#ry/#rz`,
  `#cs1y/#cs1z/#cs2x/#cs2z`). Bake confirmed values as defaults and drop the hash once approved.
- Respect explicit **pause points** ("pause when you finish this item").

---

## 11. Source-of-truth files (outside the repo)

These live in the OLD root `/Users/adipu/Personal Site/` (NOT inside `personal_site/`):
- `LinkedIn_Compiled/` — profile text (`experience.md`, `education.md`, `honors_and_credentials.md`,
  `skills_and_languages.md`, `courses.md`) and per-project folders `projects/<slug>/<slug>.md` + assets.
- `LinkedIn_Compiled/projects/rescue-vision/` — `hub.glb` source, `image.png` (the transform reference),
  and `rescueVision/include/dwm_geom.h` (authoritative IWR↔DWM transform).
- `Guadaloop/TestRig Current/` — rig CAD + `UsefulCrop.png` reference render.
- `BlindMaster/blinds_flutter/` — the BlindMaster Flutter app.
- Transcript for course numbers: `~/Library/CloudStorage/OneDrive-…/Year 2/Academic Summary Sem2.pdf`.

Also: this agent keeps a private cross-session memory at
`/Users/adipu/.claude/projects/-Users-adipu-Personal-Site/memory/` (index `MEMORY.md` + per-fact files:
`landing-page`, `project-page-architecture`, `headless-verification`, `guadaloop-rig-lighting`,
`viewer-framework`, `rescuevision-viewer`). That memory and THIS doc should agree; this doc is the
git-tracked, agent-agnostic version — keep both current.

---

## 12. Changelog (what we've accomplished)

Newest first. Append an entry whenever you ship something.

- **2026-06-10** — **Landing-page mobile fixes** (`index.html`). (1) **Coursework** was a 2-col grid of groups
  that stayed 2-col on phones (it was missing from the `@media(max-width:860px)` `grid-template-columns:1fr`
  list — `.skillgroups` was there, `.coursegroups` wasn't) → added `.coursegroups` so the groups stack into
  one column. (2) **"Currently…" status pill** squished on phones → restructured the markup into two `.role`
  spans + a `.sep`; new `@media(max-width:600px)` stacks them (`.status-roles{flex-direction:column}`,
  `.sep{display:none}`, dot aligned to line 1) so it reads on two lines (Qualcomm / Guadaloop). Desktop
  unchanged (single line). Verified at 390px (pill 57px/two lines, coursework 1 col) and 1280px (pill 36px/one line).
- **2026-06-10** — **Viewer chrome: glass nav chips + collapsible/replayable docked model window.**
  (1) **Nav glass chips** (all 3 viewers, `viewer.css`): the brand (logo+name) and the "Back to work" button now
  float as their own **blurred translucent pills** (`backdrop-filter: blur(14px) saturate(1.3)` + faint tint +
  `-webkit-` prefix for Safari + subtle border/shadow so they read over the pure-black hero). nav was already
  `z-index:8`, so they were always on top — this just gives them a backdrop. (2) **Docked-window controls**
  (RescueVision + SmartPT, in the shared **`DockController`**): a transparent click-catcher `#dockwin` over the
  card whose **click replays the walkthrough** — `replay()` smooth-scrolls back up to `_storyEnd −
  innerHeight*0.5` (the last storyboard beat, full-screen), reusing the existing dock lerp to grow the model
  back; a **minimise** button `#dockmin` ("›") that **collapses the card off the right edge**
  (`#c.docked.collapsed { transform: translateX(calc(100%+30px)) }`) leaving a thin **edge tab** `#docktab`
  ("‹ 3D") that restores it; and **auto-restore** when the user scrolls back up toward the 3D (`update()`
  clears `collapsed` once `dockK < DOCK_FULL`). The two click behaviours are deliberately separated (minimise =
  the small corner button; body-click = replay) so they never misfire. Controls are built in JS by
  `DockController._buildDockUI()` (no per-viewer HTML), shown only when essentially fully docked (`k≥0.985`),
  with `touch-action:pan-y` on `#dockwin` so vertical swipes still scroll on mobile, real `<button>`s +
  aria-labels, and bigger tap targets under `@media(pointer:coarse)`. Updated the stale `#dockhint` text
  ("Drag the model…" → "Click to replay the 3D · minimise ›"). Guadaloop is unaffected (no dock; gets the nav
  chips only). Verified: functional flow (open→minimise→edge-tab→restore→replay scrolled 11325→9297) + no
  console errors on RescueVision & SmartPT; nav chips render in desktop Chrome **and** real iOS-Simulator Safari.
- **2026-06-10** — **Mobile pass: fixed the iOS "stuck on frame 1" scroll bug + perf + layout.**
  **Root cause (all three viewers):** the full-screen `position:fixed` `#c` canvas was `pointer-events:auto`
  during the storyboard (CSS default for guadaloop; `DockController.applyDock` forces `auto` while `k≈0` for
  rescuevision/smartpt). On iOS WebKit a finger-press lands on that viewport-filling **interactive** fixed
  canvas, which isn't itself scrollable, so the document never scrolls → `scrollY` stays 0 → storyboard
  frozen on frame 1. Desktop was unaffected (wheel-scroll ignores `pointer-events`), which hid the bug.
  **Fix:** `#c` is now `pointer-events:none` by default (`viewer.css`), with `body.editing #c{pointer-events:auto}`
  for the editors (OrbitControls / part-picking); `applyDock` sets `(COARSE || k>0.5) ? 'none':'auto'` so
  desktop keeps the RescueVision finale phone-drag while **touch devices always let the page scroll through
  the canvas**. **Perf:** new exported const `COARSE = matchMedia('(pointer:coarse)').matches` in `engine.js`;
  on coarse devices the renderer drops MSAA (`antialias:!COARSE`), caps DPR at 1.5 (vs 2), and asks
  `powerPreference:'high-performance'`. **Layout:** added a `@media (max-width:640px)` block to `viewer.css`
  — the right-rail `#panel`/`#blurb` span full width (still right-aligned) instead of a crushed ~150px column,
  the long nav `.lbl` is hidden, `#dockhint` no longer overflows. **Verified three ways (see §6):** a
  real-WebKit hit-test A/B (Playwright webkit) proving the center-press hits `#c` OLD vs `body`/`#spacer`
  FIXED on all three; the iPhone-viewport puppeteer harness (storyboard drives, no console errors, mobile
  layout); and an authentic iOS-Simulator Safari screenshot of the fixed build.
- **2026-06-10** — **Mobile pan fix (portrait off-the-left-edge).** Follow-up to the mobile pass: the
  storyboard `pan` shifts the subject by a fixed **world** amount (`frameCamera` `shift = r*pan*1.5`), so its
  on-screen effect scales as ~1/aspect — a narrow **portrait** phone (aspect ≈0.46) threw the model ~4-5×
  further left (off the edge) while landscape/desktop looked fine. Fixed in the shared `frameCamera` by
  scaling the shift by `Math.min(1, camera.aspect / PAN_FULL_ASPECT)` (`PAN_FULL_ASPECT = 1.6`): only ever
  **reduces** pan on narrow viewports, leaving aspect≥1.6 (desktop + **landscape phones**) pixel-identical,
  and degrading smoothly (no orientation breakpoint / rotate-jump). One line in the engine → all three
  viewers + every chapter. Verified portrait (390×844) vs landscape (844×390): the guadaloop yoke beat that
  was a corner fragment is now centered; landscape unchanged. *(Chose aspect-scaling over a discrete portrait
  toggle so resize/rotation/tablet/split-screen all do the right thing for free.)*
- **2026-06-10** — **Shared the dock shell (DRY refactor).** Extracted the duplicated "viewer shell" out of
  rescuevision + smartpt into `viewers/shared/`: (1) a **`DockController`** class in `engine.js` owning the
  scroll→`progress`/`dockK` mapping, `applyDock`, the overlay fade, the `#case .reveal` observer, and the
  docked rotisserie + smooth two-way hand-off (see §5 + §7); viewers now just `dock = new DockController({…})`
  in `start()` and call `dock.update()` in `tick()`. (2) **`pca(pts)`** (+ private `eigenSym3`) moved to
  `engine.js` — both viewers' inline copies removed (RescueVision's `analyzeGroup` now wraps `pca`; SmartPT
  imports it). (3) Docked-card CSS (`#c.docked`, `#dockhint`) moved to `viewer.css`. Viewers dropped ~95
  lines each (684→587, 726→634); the dock logic now lives once and BlindMaster (#3) inherits it for free.
  Guadaloop is unaffected (it has no dock — never constructs a DockController). Verified: all three viewers
  load with no console errors; both dock correctly (`canvas.docked=true`); docked-window occlusion + framing
  unchanged in headless renders.
- **2026-06-10** — **Docked-card polish (RescueVision + SmartPT).** Two fixes to the top-right
  floating model card after the case study begins. (1) **Opaque floating window:** `#c.docked` now has
  an opaque background (`#0a0b0e`) and `z-index:6` (above `#case`'s `z-index:5`), so the opaque **Status**
  fact cell + the **"how it works"** cards scroll cleanly *behind* it instead of clashing over the model.
  (Previously the canvas was `z-index:1` *behind* the article with a `rgba(8,9,12,.6)` translucent bg —
  page content painted over/through it.) (2) **Smooth two-way rotation hand-off** in the `tick()` loop:
  the docked rotisserie is now an azimuth `ang = ang0 + wrapPi(dockSpin)*spinKeep` orbiting `boxes.all`,
  where `ang0` is the iso azimuth the storyboard settles on, `dockSpin` accumulates only when **fully
  docked** (`dockK ≥ DOCK_FULL 0.999`, eased up from rest), and `spinKeep = smoothstep((dockK −
  DOCK_SETTLE 0.8)/(DOCK_FULL − DOCK_SETTLE))`. The orbit branch now owns the whole band `dockK ∈
  [0.8, 1]` (below 0.8 → `story.resolve` + reset `dockSpin`). Result: docking *in* the spin eases up from
  the settled iso pose (no jolt), and scrolling back *up* the model rotates from wherever the carousel is
  back to iso along the **shortest path** (`wrapPi`, so minutes of accumulated spin don't whirl backwards)
  purely as a function of scroll position in the band. Verified headless (opaque occlusion + return sweep);
  no console errors.
- **2026-06-10** — SmartPT **thigh-rod aiming fix**. The thigh rod was built ALONG the bore (`legAxis`),
  whose direction swings wildly with the flex angle (up-left at 124°, up-through-blue at 160°) → looked
  like it pointed the wrong way / overshot the knee. Now `aimThigh(signed)` re-orients it every frame to
  point from the knee toward the **rotated upper-shell centroid** (`actors.upperCenter` rotated about the
  hinge), so it consistently threads up through the blue (thigh) shell at every angle; shin still fixed
  through the lower ring. `THIGH_SHIFT` (const `THIGH_SHIFT_FRAC`, ×S, or `#thighshift=`) slides the rod
  along that direction (+ = toward the hip). The arc sweeps from the straight-leg dir to the live thigh dir.
- **2026-06-10** — SmartPT **storyboard revamp + true hinge axis**. (1) Replaced the slide-apart "explode"
  with the **thigh (upper) shell swinging open ~160° about the hinge** ("Two Halves"), holding there;
  "Tracking the Angle" then holds the reveal pose, brings in the leg silhouettes, and does a small
  back-and-forth — all moving the UPPER shell (was the lower). Constants `BIG_ANGLE` (160°), `TRACK_AMP`,
  `ROT_SIGN` (default −1 = swing back-and-up; `#rotsign`/`#bigangle`/`#trackamp` tune them). New `settle`
  act ramps back to assembled for the dock; framing uses a computed `boxes.swung` box so the swung pose
  isn't clipped. (2) **True hinge axis** — the device has TWO pin-hole knuckles (one per arm); the old PCA
  of the whole contact was dominated by the broad concentric band-seam and tilted the axis off the real
  pin (tab/slot separated mid-swing, thigh rod missed the ring). `detectHinge()` now keeps the upper-arm
  contact, splits it into the two knuckles, and uses the **line through their centres** as the pin axis.
  `#hingedbg` overlays contact pts (red) / pivot (yellow) / axis (cyan) to verify. (3) **Leg silhouette
  rebuilt** along the real bore axis (`legAxis = tubeAxis`): shin fixed to the lower shell (threads the
  lower ring), thigh rigid with the upper shell via a hinge-pivoted group (threads the upper ring).
  Docked branch snaps to the clean assembled pose.
- **2026-06-10** — SmartPT **IMU fixes** (user re-exported the GLB → IMU groups renamed `mesh_1*`/`mesh_2*`):
  (1) `classify()` keys off the MPU **group** name (`mpu6050step1`→imu2, else `mpu6050step`→imu1) — survives
  mesh renumbering; the old `/mesh0/`,`/mesh3/` regex matched nothing so both IMUs became `'other'` and
  didn't move. (2) **Auto-bind** each IMU to the shell it's seated against (nearest surface), in
  `buildActors` — the static imu1→upper/imu2→lower guess was backwards on the new export. (3) Fixed a
  **matrix-aliasing bug**: `moverApply` reused the shared `_mm` that also held the caller's hinge matrix →
  IMUs flew off mid-flex; it now uses its own `_ap` scratch. (4) **Flip the upper shell + its IMU 180° about
  the bore/tube axis** — defined as the shell's **local +Y in world** (`shellNode.getWorldQuaternion()`
  applied to (0,1,0)), NOT a PCA ring-normal (using PCA was the "wrong axis" the user flagged twice). Done
  in `buildActors` before the movers capture base; the hinge is computed from the **pre-flip** seam so the
  flex still reads (recomputing post-flip looked broken). Tunable `#upperflip=deg`; `#dbg` colour-codes the
  vis groups. *(Replaced an earlier experimental `flipInner()` that rotated the whole upper shell + the
  wrong IMU about a PCA axis.)*
- **2026-06-09** — SmartPT **orientation**: redefined `standUpright()` so the **hinge is up** (hinge-seam
  pin axis → horizontal X so the knee flex bends in the vertical screen plane; cuff→hinge → +Y; IMU side
  faced to camera). Earlier attempt stood the *tube* axis up, leaving the hinge pointing backward (user
  flagged it). Added a **live orientation tuner**: open `viewers/smartpt/index.html#tune` → drag to
  rotate the model, `[`/`]` to roll, HUD prints a copy-pasteable `#rot=rx,ry,rz` (Euler XYZ degrees).
  `#rot=...` on the URL overrides the orientation entirely (what the tuner emits == what gets baked).
- **2026-06-09** — **Built the SmartPT viewer** (`viewers/smartpt/index.html`). The user updated the GLB
  to 14 meshes (added the 2nd IMU). Storyboard: hero → overview → **explode** (two shells slide apart,
  each IMU stays attached) → **track** (hinge flexes, live "NN° · KNEE FLEXION · IMU Δ" readout + 3D angle
  arc + translucent leg silhouette through the cuff) → settle → dock to the case study (shared
  `project.css`). Hinge axis/pivot computed live from the contact seam; part motion via world-space
  `parentInverse` movers. Wired the landing-page SmartPT card/honor/PROJECTS map to the viewer (3D badge).
  Deleted all inspector scaffolding. See §17 (incl. open polish: flex foreshortening from iso). Verified
  with headless renders of every beat — no console errors.
- **2026-06-09** — RescueVision **docked case study now uses the shared `assets/project.css`** identity
  (was a bespoke inline approximation). Restructured the `<article id="case">` markup to the standard
  `.wrap/.award/.lede/.facts/.block/.dives/.dive/.btn/footer` structure (copy preserved verbatim),
  added a reveal `IntersectionObserver`, and tuned the intro to clear the top-right docked model card.
  Verified head + mid renders match the project-page look. See §7 Dock-to-case-study.
- **2026-06-09** — Started **SmartPT viewer** scaffolding (`viewers/smartpt/`, paused pending the user
  updating the model). Copied `PTDeviceAssem.glb` + a clean palette-only `appearance.json`; analyzed the
  GLB (see §17). Decided with the user: **two IMUs** (clone the single modeled MPU-6050 into the empty
  twin pocket on the other clamshell) + a **bending leg silhouette** with an angle arc. Inspector pages
  `_inspect/_slots/_pockets/_imutest.html` are throwaway scaffolding (note: the user is replacing the
  model, so any measured constants below will need re-measuring).
- **2026-06-09** — Created this master context doc (`CLAUDE.md`).
- **2026-06-09** — RescueVision frame act, stage 2: changed second view to rotate **down** (camera below,
  looking up) and zoom in tighter. `VIEWS.iso2` set to `(0.34,-0.18,0.90)`; stage-2 chapter `fit`
  1.55 → **1.25**. Verified via headless render.
- **2026-06-08/09** — RescueVision **coordinate frames** reworked: small thin on-top gizmos derived from
  runtime PCA per `dwm_geom.h`; precise per-user axis directions (IWR X=long body / Y=boresight out the
  bump / Z=down; UWB X=flat normal / Y=thin side / Z=down); real transform values 43.18/13.97/92.43,
  dist 103.0. CS1 centered on the radar antenna bump; **CS2 auto-centered on the DWM antenna sub-body**
  (`mesh_67_2`). Added a **two-stage** frame act (iso establish → iso2 down/zoom focus) with grid/gizmos/
  legs driven off global progress so they persist across the boundary; dims overlay made neighbor-aware
  (no flicker).
- **2026-06-08/09** — RescueVision **per-sub-body coloring**: AppearanceEditor gained **Body** mode
  (vertex-adjacency flood, no angle limit) so e.g. ESP32 RF shield / sensor antenna square can be colored
  independently. Fixed multi-face/body bug via `paintFacesMulti` (single batched geometry-group rebuild).
- **2026-06-08/09** — RescueVision **orientation** fixed via PCA, driven off the **ESP32** axes (upright +
  face-to-camera), correcting an earlier wrong `ry=-45` cavity-facing attempt. Standup `rx=-90` then
  ESP_U→+Y / ESP_N→iso-azimuth. Hash-tunable `#rx/#ry/#rz`.
- **2026-06-08** — **RescueVision viewer built** (`viewers/rescuevision/`): hub.glb load, loose-part
  hiding (110/124), `classify()` vis-groups, full storyboard (intro → IWR → stepper → ESP32 → frame →
  localization finale → settle), draggable-phone finale, **dock-to-case-study** scroll. Wired into the
  landing page (featured card + honor + PROJECTS map, 3D badge).
- **2026-06-08** — **Shared viewer framework extracted** (`viewers/shared/{engine.js,appearance.js,
  viewer.css}`) from the Guadaloop prototype; **AppearanceEditor** (Part/Body/Face, palette, export JSON)
  built; Guadaloop viewer **ported** onto the engine; file structure reorganized under `viewers/`.
- **earlier** — Site moved into `personal_site/` (own git repo). Landing page, 6 project case-study pages,
  Guadaloop scroll prototype with the CAD-render lighting recipe, resume update.

---

## 13. Requests log (what the user has asked for)

✅ done · 🔄 in progress · ⬜ not started.

- ✅ Build Guadaloop-style scroll 3D viewers for the hardware projects, **starting with RescueVision**;
  first extract reusable styles/framework into a shared file and reorganize the file structure.
- ✅ RescueVision start page like Guadaloop but with the rescuevision GLB; **appearance/color picker
  scaffolding** to choose appearances per part / sub-body / face and export JSON.
- ✅ RescueVision storyboard: isolate IWR sensor → stepper → ESP32 (two segments) → gridlines + coordinate
  frames showing the sensor↔UWB transform → zoom-out localization finale with phone/person, UWB waves
  from the Qorvo module, dotted→solid ranging line, draggable phone.
- ✅ After the visualization, return to a normal scrolling case-study (model shrinks to top-right, user
  keeps scrolling).
- ✅ Fix: multi-face appearances per part; counter-clockwise tilt; backside view → face the viewer.
- ✅ Per-**sub-body** coloring (Body mode); accurately aligned coordinate frames per `dwm_geom`, with the
  exact axis directions he specified.
- ✅ Rotate to a **second perspective** while the coordinate bases are shown (extra slightly-rotated stage).
- ✅ Center CS2 on the little DWM antenna body; make the second view more intentional — **rotate down +
  zoom in**.
- ✅ This doc: a master context/style/instructions document, continuously updated.
- ✅ Make the RescueVision **docked case study match the standard project-page (TweinStein) look**, with
  the model staying docked top-right. *(Done 2026-06-09 — now uses `assets/project.css`.)*
- ✅ **SmartPT viewer** (`PTDeviceAssem.glb`): explode the brace pieces (IMUs stay attached), then a
  hinge-flexion stage with the two IMUs tracking the knee angle + a bending leg silhouette, then dock to
  the case study. *(Done 2026-06-09 — see §17. Open polish items there await the user's steer on the
  device's natural pose / flex viewing angle.)*
- ✅ **Make the site perform well on mobile** + fix the iOS Safari bug where the viewers were "stuck on the
  first storyboard frame" (couldn't scroll), and set up an iPhone test loop. *(Done 2026-06-10 — root cause
  was the interactive full-screen fixed canvas eating the touch-scroll gesture on iOS WebKit; fixed with
  canvas `pointer-events:none` on touch devices, plus a coarse-pointer render budget and a
  `@media(max-width:640px)` viewer layout. iPhone/iOS-sim/real-WebKit verification loops documented in §6.)*
- 🔄 **Confirm the coordinate-axis out-sign combo** (`#cs1y/#cs1z/#cs2x/#cs2z`) so it can be baked as
  default and the hash dropped. *(Awaiting the user's eyes on the clearer second view.)*
- ⬜ Build the **BlindMaster** viewer (`servobox.glb`). Framework is ready; copy the RescueVision template.

---

## 14. Roadmap / what remains

1. **Bake the coordinate-axis out-signs** once the user confirms the combination (then remove the
   `#cs1y/#cs1z/#cs2x/#cs2z` hash handling). — *highest priority, just needs his confirmation.*
2. **BlindMaster viewer** (`servobox.glb`) — copy `viewers/rescuevision/index.html`, write `classify()`,
   storyboard the blinds-control device, dock to its case-study. Landing card already exists (weakest
   thumbnail — candidate to swap for an app screenshot / device render).
3. **SmartPT viewer polish** (§17 open items) — if the user wants: a base model rotation / dedicated
   camera so the knee flex reads in the screen plane; a more leg-like silhouette; dress the model colours
   via the **G** editor + commit `appearance.json`.
4. **Landing-page placeholders to fill:** LinkedIn + GitHub URLs (footer + project pages currently use
   `#` with a click-note), SmartPT TestFlight link, confirm which PDF is the real résumé, hero visuals
   for the abstract-placeholder project pages.
5. Possible CS2 antenna-centering refinement toward the bottom-**right** corner if the user wants it
   tighter than bottom-center.
6. **Mobile polish (optional, after on-device pass):** ✅ the portrait off-the-left-edge `pan` is fixed
   (aspect-scaled in `frameCamera`, `PAN_FULL_ASPECT`). Remaining nice-to-haves: consider `100dvh` for
   `#c`/`#spacer` so the iOS address-bar resize doesn't jump the canvas; if the RescueVision finale
   phone-drag is wanted on mobile, give the canvas `touch-action:pan-y` + re-enable pointer-events only in
   the finale (so vertical scroll still works). The scroll/perf/layout fix itself is **verified in real
   WebKit + iOS Simulator**, but the literal finger-swipe still wants a quick **on-device confirm** (synthetic
   touch isn't scriptable here).

---

## 15. Open questions / pending decisions

- **RescueVision coordinate-axis out-signs** — which of `#cs1y / #cs1z / #cs2x / #cs2z` should be
  flipped? Defaults are best-guess; the firmware fixes the *magnitudes* (43.18/13.97/92.43, −10° tilt)
  but the visual arrow directions need the user's confirmation. Bake once confirmed.
- **BlindMaster thumbnail** — currently the inverted Flutter blinds icon (weak); maybe swap for an app
  screenshot or a `servobox` render.
- Confirm which PDF in `assets/` is the real résumé.

---

## 16. How to keep this doc updated (re-read §0 at top)

This is the closing ritual of every task:
1. Did architecture/behavior change? → update §4–§9.
2. Did you learn a new gotcha or recipe? → update §10 (and the lighting/PCA notes).
3. Did you ship something? → prepend a **Changelog** (§12) entry with the date.
4. Did the user ask for something new, or did an item finish? → update **Requests Log** (§13),
   **Roadmap** (§14), **Open Questions** (§15).
5. Bump the "Last updated" date at the top.

Keep it accurate and concrete (real file paths, real constants, real line anchors). The next agent —
possibly with no other context — relies on this being true.

---

## 17. SmartPT viewer (`viewers/smartpt/`) — BUILT 2026-06-09

**Device:** a polycentric **knee-brace hinge** (worn around the knee; confirmed by the product
screenshot). `PTDeviceAssem.glb` — **14 meshes** after the user's 2026-06-09 update (the user added the
second IMU themselves): two clamshell bodies `UpperLeg-1` + `LowerLeg-2`, and **two** MPU-6050 IMUs —
`MPU_6050step/pcbstep-1/mesh_0…mesh_0_5` and `MPU_6050step_1/pcbstep-1_1/mesh_3…mesh_3_5`.

**vis-groups (`classify()`, compacted name chain):** `imu1` (`mesh0*`), `imu2` (`mesh3*`), `upper`
(`upperleg`), `lower` (`lowerleg`). **IMU→body binding (measured by nearest-surface distance):** IMU1 →
**UpperLeg** (thigh shell), IMU2 → **LowerLeg** (shin shell). Each IMU stays rigidly with its shell.

**Hinge (computed live, robust to model changes):** in `buildActors`, sample the two shells' world verts,
find the contact seam (lower verts within `S*0.02` of an upper vert), centroid = **pivot**, longest PCA
axis of the seam = **hinge axis** (≈ world +Y on the current model, pivot ≈ the contact centroid). Flexion
= rotate `LowerLeg` + IMU2 about (pivot, axis). **Tube/leg axis** = the smallest PCA-spread axis of a
shell (ring normal); **straightDir** = tubeAxis projected ⟂ to the hinge axis.

**World-space part motion (the key technique):** the IMU meshes are nested under transformed parents, so
naïvely applying a matrix to a mesh's *local* transform warps them. `collectMovers()` snapshots each
mover's world matrix `base` + `parentInverse` once; `moverApply(list, M)` sets each `local =
parentInv · M · base` (decomposed). `setMovers('upperRot'|'rest', amt)` resets from `base` every frame so
acts don't accumulate. **`moverApply` uses its OWN scratch matrix `_ap`** (not the shared `_mm`/`_tt` that
the caller may pass in as `M` — aliasing them flung IMUs off mid-rotation). (Same idea as the Guadaloop
rails-finale movers.)

**Hinge axis (critical):** the device is a real hinge with **TWO pin-hole knuckles** (one per arm). The
PCA of the whole upper↔lower contact is dominated by the broad concentric **band seam** and tilts the axis
off the true pin → the tab/slot separate during the swing and the thigh rod misses the ring.
`detectHinge()` keeps the upper-arm contact (`y > mid`), splits it into the two knuckles, and uses the
**line through their centroids** as the pin axis (pivot = midpoint). `#hingedbg` overlays contact (red) /
pivot (yellow) / axis (cyan).

**Storyboard (`#spacer` 900vh):** intro `[0,0.07]` hero → device/overview `[0.07,0.26]` → **Two Halves**
`[0.26,0.48]` (`act:'twohalves'`: the **upper/thigh shell + its IMU swing open ~`BIG_ANGLE`(160°)** about
the pin and hold; `ROT_SIGN` −1 = back-and-up) → **Tracking** `[0.48,0.82]` (`act:'track'`: holds the
reveal pose with a small back-and-forth `TRACK_AMP`, shows the translucent **leg silhouette** — shin fixed
to the lower shell threading the lower ring, **thigh rigid with the upper shell** via a hinge-pivoted group
threading the upper ring — plus a 3D **angle arc** and the SVG **"NN° · KNEE FLEXION · IMU Δ"** readout)
→ **settle** `[0.82,1.0]` (`act:'settle'`: ramp the upper back to assembled) → dock to the case study (same
`assets/project.css` identity AND the same **opaque-card + smooth rotation hand-off** dock loop as
RescueVision §7 — its orbit branch additionally calls `setMovers('rest',0)` + hides the leg silhouette).
The moving acts frame on a computed **`boxes.swung`** box so the swung-open pose isn't clipped. Leg rods
lie along **`legAxis = tubeAxis`** (the real bore), NOT the old `straightDir`. Hash tuners:
`#bigangle`/`#trackamp`/`#rotsign`/`#upperflip`/`#dbg`/`#hingedbg`. Landing page SmartPT card / honor /
PROJECTS map point here with the 3D cube badge; appearance editor (press **G**) is wired (palette-only
`appearance.json` so far).

> **Flex retiming gotcha:** the shared `Storyboard` fades the `#dims` overlay in only over localT
> 0.45–0.65 and out after 0.88 (neighbour-aware), and `onResolve` runs BEFORE `updateOverlays`. So a flex
> that *peaks* mid-chapter leaves the angle readout faint. Fixed by **ramping the flex to a HELD value
> across the dims window** (ramp by ~0.40, hold with a small cosine wiggle, release after ~0.86).

**Orientation:** `standUpright()` rotates the model so the **hinge is up** — hinge-seam (pin) axis →
horizontal X (knee flex then bends in the vertical screen plane, not foreshortened), cuff→hinge → +Y,
IMU side faced to the iso camera (flip 180° about Y if it'd face away). The cuff hangs below, the two
uprights rise to the hinge knuckle on top. **User-tunable:** open `…/smartpt/index.html#tune` → drag to
rotate, `[`/`]` to roll, HUD prints `#rot=rx,ry,rz` (Euler XYZ deg). `#rot=…` on the URL overrides the
whole orientation (what the tuner emits == what to bake into a default if the user picks a new pose).
*(History: first tried standing the TUBE axis up — left the hinge pointing backward; user corrected.)*

**Open polish:** (1) the leg silhouette is subtle — could be more leg-like / opaque. (2) The model is one
flat colour until dressed via the **G** editor + committed `appearance.json`. (3) Confirm the final pose
with the user (the tuner is theirs to drive).

Inspector scaffolding used to derive all this (`_tree/_analyze/_hinge/_slots/_pockets/_imutest.html` +
`/private/tmp/dumpglb.cjs, shothinge.cjs, shotsp.cjs, shotcase2.cjs`) was **deleted** after the build;
recreate from this section's description if the model changes again.
