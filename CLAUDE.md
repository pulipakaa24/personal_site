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
as the template** and swap the GLB + `classify()` + `chapters`.

### `engine.js` (ES module) exports:
- **Math:** `clamp01, lerp, smoothstep, ease (easeInOutCubic), trap, trapUpDown`.
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

### The `Storyboard` chapter model
Each chapter is an object:
```js
{ r:[start,end],            // scroll-progress range it owns (0..1 over the #spacer)
  box:'<groupKey>'|'all',   // what to frame (a vis-group, or a named runtime Box3 like 'transform')
  view:'iso'|'front'|...,   // camera direction from VIEWS
  pan: 0..1,                // horizontal offset (model slides left so panels have room)
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
`nav`, `#loader`, and the editor shell (`#editor/#legend/#picked/#dump`).

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
responsive size), storyboard overlays fade out, the docked model slowly auto-rotates, and a normal-flow
`<article id="case">` (the RescueVision write-up) scrolls in below. `dockK` from
`(scrollY − (storyEnd − 0.45vh)) / 0.7vh`.

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

- **2026-06-10** — SmartPT **inner-body flip**: added `flipInner()` — rotates the inner shell
  (`LowerLeg` + `imu2`) 180° around the tube axis (the cuff bore / ring-normal axis, computed via PCA)
  before the orientation pipeline. This flips the inner body so its opening faces the opposite direction
  along the cuff bore, repositioning its IMU to the other side. Uses world-space mover pattern
  (parent-inverse decomposition) to handle nested scene-graph transforms. All downstream computations
  (standUpright, hinge seam, explode, tracking) adapt automatically since they run after the flip.
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
parentInv · M · base` (decomposed). `setMovers('explode'|'hinge'|'rest', amt)` resets from `base` every
frame so acts don't accumulate. (Same idea as the Guadaloop rails-finale movers.)

**Storyboard (`#spacer` 900vh):** intro `[0,0.07]` hero → device/overview `[0.07,0.26]` → **explode**
`[0.26,0.48]` (the two shells slide apart along the tube axis, `trapUpDown(localT)`, IMUs attached) →
**track** `[0.48,0.82]` the hinge flexes (`act:'hinge'`, ramp-to-hold flex with a gentle live wiggle to
~58°, then straighten) with a translucent **leg silhouette** through the cuff (thigh fixed + shin on a
hinge group, knee at the cuff centre), a 3D **angle arc** at the joint, and an SVG **"NN° · KNEE FLEXION ·
IMU Δ"** readout (`dims:'angle'`, drawn at the projected cuff centre) → settle `[0.82,1.0]` → dock to the
case study (same `assets/project.css` identity as RescueVision §7). Landing page SmartPT card / honor /
PROJECTS map now point here with the 3D cube badge. Appearance editor (press **G**) is wired (palette-only
`appearance.json` so far — model ships its default colour; user can dress it).

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
