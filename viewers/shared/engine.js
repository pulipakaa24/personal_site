// ============================================================================
// Shared scroll-viewer engine.
//
// Everything reusable across the project 3D viewers lives here: the studio
// lighting/IBL that makes CAD parts read like a render, camera framing, the
// per-part opacity model, and a data-driven scroll Storyboard with overlay
// (hero title / side panel / blurb / dimension) handling and per-chapter hooks.
//
// A project page (viewers/<proj>/index.html) imports these, loads its GLB,
// tags each mesh with a `userData.vis` group, defines a `chapters` array, and
// drives `storyboard.resolve(p)` from its own scroll loop.
// ============================================================================
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Touch-primary devices (phones/tablets): lighter render budget AND the full-screen
// fixed canvas must stay pointer-events:none so finger-drags scroll the page through
// it (on iOS WebKit an interactive viewport-filling fixed element swallows the scroll
// gesture → the storyboard gets stuck on frame 1). See createStudioScene + DockController.
export const COARSE = matchMedia('(pointer: coarse)').matches;

// ---------- dev mode ----------
// Gates the developer-only chrome shared by every viewer: the top-left "x%"
// progress HUD and the "press G" part-grouping / appearance editor. Casual
// visitors never see either. Enable per-browser by loading the viewer with
// `#dev` (or `?dev`) in the URL — it persists via localStorage, so you only
// type it once. Turn it back off with `#nodev` (or `?dev=0`).
// When on, <body> gets a `.dev` class (viewer.css reveals the HUD + hint off it).
export const DEV = (() => {
  let on = false;
  try {
    const q = new URLSearchParams(location.search);
    const h = new URLSearchParams(location.hash.slice(1));
    const dq = q.has('dev') ? q.get('dev') : null;            // null | '' | '1' | '0'
    const wantOn  = h.has('dev')   || dq === '' || dq === '1';
    const wantOff = h.has('nodev') || dq === '0';
    if (wantOff)     { localStorage.removeItem('viewerDev'); on = false; }
    else if (wantOn) { localStorage.setItem('viewerDev', '1'); on = true; }
    else             { on = localStorage.getItem('viewerDev') === '1'; }
  } catch (e) { on = false; }
  if (on) {
    const mark = () => document.body && document.body.classList.add('dev');
    if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mark);
    else mark();
  }
  return on;
})();

// ---------- math ----------
export const clamp01 = t => Math.max(0, Math.min(1, t));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(t){ t = clamp01(t); return t * t * (3 - 2 * t); }
export const ease = t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;   // easeInOutCubic
// Trapezoidal motion profile: integral of a trapezoidal velocity (smooth
// accel -> cruise -> smooth decel). Returns normalized position 0..1.
export function trap(s){
  s = clamp01(s);
  const ta = 0.3, vmax = 1/(1-ta);
  if (s < ta)   return 0.5*vmax/ta*s*s;
  if (s < 1-ta) return 0.5*vmax*ta + vmax*(s-ta);
  const d = 1-s; return 1 - 0.5*vmax/ta*d*d;
}
export const trapUpDown = t => t < 0.5 ? trap(t/0.5) : trap((1-t)/0.5);

// ---------- camera views ----------
export const VIEWS = {
  iso:   { dir: new THREE.Vector3(0.85, 0.5, 1.0).normalize(),  up: new THREE.Vector3(0,1,0) },
  iso2:  { dir: new THREE.Vector3(0.34, -0.18, 0.90).normalize(), up: new THREE.Vector3(0,1,0) }, // swung around + slightly below (looking up) off iso
  isoL:  { dir: new THREE.Vector3(-0.85, 0.5, 1.0).normalize(), up: new THREE.Vector3(0,1,0) },
  front: { dir: new THREE.Vector3(0.02, 0.08, 1.0).normalize(), up: new THREE.Vector3(0,1,0) },
  back:  { dir: new THREE.Vector3(0.02, 0.08, -1.0).normalize(),up: new THREE.Vector3(0,1,0) },
  side:  { dir: new THREE.Vector3(1.0, 0.1, 0.02).normalize(),  up: new THREE.Vector3(0,1,0) },
  top:   { dir: new THREE.Vector3(0.0, 1.0, 0.0001).normalize(),up: new THREE.Vector3(0,0,-1) },
};

// ---------- renderer + studio environment ----------
// The CAD parts are lit primarily by an image-based environment (metals have no
// diffuse response — they only show what they reflect). This builds a bright
// "studio softbox" surround so metal reads as bright metal and plastics aren't
// blown out. See memory: guadaloop-rig-lighting.
export function buildStudioEnv(renderer){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  // Vertical-gradient surround (bright cool top -> dark base): the chrome gradient.
  const R = 14, geo = new THREE.SphereGeometry(R, 32, 24);
  const p = geo.attributes.position, cols = [];
  const top = new THREE.Color(0xeef2f8), mid = new THREE.Color(0x9aa2ae), bot = new THREE.Color(0x232730), c = new THREE.Color();
  for (let i = 0; i < p.count; i++){
    const y = p.getY(i) / R;
    c.copy(mid).lerp(y >= 0 ? top : bot, Math.abs(y));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
  // HDR softboxes -> crisp specular streaks. Warm key + cool fill = studio look.
  const panel = (w, h, pos, intensity, color = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: intensity })
    );
    m.position.set(pos[0], pos[1], pos[2]); m.lookAt(0,0,0); env.add(m);
  };
  panel(16, 8, [0, 12, 2], 7.0, 0xffffff);    // overhead key
  panel(6, 18, [9, 5, 7], 6.0, 0xfff2e2);     // tall warm key (right)
  panel(6, 18, [-9, 4, 4], 3.2, 0xe4ecff);    // tall cool fill (left)
  panel(10, 10, [-2, 2, -11], 2.4, 0xdce6ff); // cool back rim
  const tex = pmrem.fromScene(env, 0.06).texture; // low blur -> reflections stay crisp
  return { tex, pmrem };
}

// Build the renderer/scene/camera/controls + studio lighting in one call.
// Returns the pieces plus updateHeadlights(camera) to re-aim camera-relative
// key/fill each frame.
export function createStudioScene(canvas, opts = {}){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !COARSE, alpha: true, powerPreference: 'high-performance' });
  // On phones the full-screen canvas is the heaviest cost: cap DPR lower and skip MSAA
  // (the remaining supersampling still smooths edges) to keep the storyboard at frame rate.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, COARSE ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 0.85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const { tex, pmrem } = buildStudioEnv(renderer);
  scene.environment = tex;

  scene.add(new THREE.HemisphereLight(0xc2d2f0, 0x16181f, 0.35));
  const headKey  = new THREE.DirectionalLight(0xfff1e0, 0.55);  // warm, up-right of camera
  const headFill = new THREE.DirectionalLight(0xdde8ff, 0.28);  // cool, down-left of camera
  scene.add(headKey, headKey.target, headFill, headFill.target);

  const camera = new THREE.PerspectiveCamera(opts.fov ?? 42, innerWidth/innerHeight, opts.near ?? 0.001, opts.far ?? 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enabled = false;

  const _vd = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(), _td = new THREE.Vector3();
  function updateHeadlights(){
    camera.getWorldDirection(_vd);
    _rt.crossVectors(_vd, camera.up).normalize();
    _up.crossVectors(_rt, _vd).normalize();
    _td.copy(_vd).addScaledVector(_up, -0.45).addScaledVector(_rt, -0.35).normalize();
    headKey.position.copy(_td).multiplyScalar(-50);  headKey.target.position.set(0,0,0);
    _td.copy(_vd).addScaledVector(_up, 0.35).addScaledVector(_rt, 0.40).normalize();
    headFill.position.copy(_td).multiplyScalar(-50); headFill.target.position.set(0,0,0);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  return { renderer, scene, camera, controls, pmrem, updateHeadlights };
}

// ---------- model loading ----------
export function loadGLB(url){
  return new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
}

// Give every mesh its own cloned material(s) (so opacity/colour are per-part),
// stash base colours for later restore, and run an optional per-material hook
// (used to upgrade finishes / apply an appearance map). Returns the mesh list.
export function prepareMeshes(model, onMaterial){
  const meshes = [];
  model.traverse(o => {
    if (!o.isMesh) return;
    o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m, idx) => { if (onMaterial) onMaterial(m, o, idx); });
    o.userData.curOpacity = 1;
    o.userData.baseColors = mats.map(m => m.color ? m.color.clone() : null);
    // stable, unique per-load key so the appearance editor can target individual
    // sub-meshes (CAD primitives often share/lack names).
    o.userData.key = (o.name || 'mesh') + '#' + meshes.length;
    meshes.push(o);
  });
  return meshes;
}

// Recentre a model on the origin and add it to the scene; returns its world box.
export function centerModel(model, scene){
  let box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  scene.add(model);
  model.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model);
}

// ---------- per-part opacity ----------
export function setOpacity(m, o){
  o = clamp01(o);
  m.userData.curOpacity = o;
  m.visible = o > 0.002;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mt of mats){
    const wantTransparent = o < 0.999;
    if (mt.transparent !== wantTransparent){ mt.transparent = wantTransparent; mt.needsUpdate = true; }
    mt.opacity = o;
    mt.depthWrite = true;   // keep self-occlusion so non-convex parts dim cleanly (no X-ray)
  }
}

// Build a full per-vis-group opacity map. `ALL` sets the default; named keys override.
export function makeVis(VG){
  return (spec) => { const o = {}; for (const g of VG) o[g] = (spec.ALL !== undefined ? spec.ALL : 0); for (const k in spec) if (k !== 'ALL') o[k] = spec[k]; return o; };
}

// ---------- camera framing: box + view angle + horizontal pan ----------
// `pan` slides the subject screen-left (a world-space shift) so the right-rail panels
// have room. Its ON-SCREEN effect is ~1/aspect, so on a narrow PORTRAIT phone the same
// pan throws the model ~4-5× further left (off the edge), while landscape/desktop look
// fine. So scale pan by aspect, capped at 1 — only ever REDUCING it for narrow viewports;
// at PAN_FULL_ASPECT and wider it's untouched (desktop + landscape phones stay identical).
const PAN_FULL_ASPECT = 1.6;
// The base framing only fits the model in the VERTICAL FOV, so on a narrow/portrait
// viewport (where the horizontal FOV is much smaller) a wide model spills off the sides.
// PORTRAIT_FIT zooms the camera out to also fit the width: 0 = off (current behaviour, may
// clip sides), 1 = fully fit the framed extent's width. It only kicks in for aspect < 1-ish
// (portrait); landscape/desktop are untouched. Live-tune by eye with a `#pfit=` URL hash.
let PORTRAIT_FIT = 0.8;
{ const m = (location.hash || '').match(/pfit=([\d.]+)/); if (m) PORTRAIT_FIT = parseFloat(m[1]); }
const _c = new THREE.Vector3(), _s = new THREE.Vector3(), _right = new THREE.Vector3();
export function frameCamera(camera, box, viewKey, pan, fit, out){
  const v = VIEWS[viewKey] || VIEWS.iso;
  box.getCenter(_c); box.getSize(_s);
  const r = Math.max(_s.x, _s.y, _s.z, 1e-4) * 0.5;
  const vHalf = (camera.fov * Math.PI/180) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);            // horizontal half-FOV (shrinks in portrait)
  const fitScale = 1 + Math.max(0, Math.tan(vHalf)/Math.tan(hHalf) - 1) * PORTRAIT_FIT;  // ≥1, zooms OUT on narrow screens only
  const dist = (r / Math.tan(vHalf)) * (fit || 1.6) * fitScale;
  out.up.copy(v.up);
  out.target.copy(_c);
  out.pos.copy(_c).addScaledVector(v.dir, dist);
  if (pan){   // move subject to screen-left: shift cam+target along camera-right
    _right.crossVectors(v.up, v.dir).normalize();
    const shift = r * pan * 1.5 * Math.min(1, camera.aspect / PAN_FULL_ASPECT);
    out.pos.addScaledVector(_right, shift);
    out.target.addScaledVector(_right, shift);
  }
}
export const makeSlot = () => ({ pos:new THREE.Vector3(), target:new THREE.Vector3(), up:new THREE.Vector3() });

// Project a world point to screen pixels (for SVG overlays).
const _pp = new THREE.Vector3();
export function projectPoint(camera, v){ _pp.copy(v).project(camera); return { x:(_pp.x*0.5+0.5)*innerWidth, y:(-_pp.y*0.5+0.5)*innerHeight }; }

// ---------- principal-axis analysis (PCA via Jacobi eigen-decomposition) ----------
// Used by viewers to derive coordinate frames / hinge axes / tube axes from a
// module's actual geometry. `pca(pts)` returns the centroid + principal axes
// (sorted by extent, descending) + their extents.
function eigenSym3(A){
  A = A.map(r => r.slice()); const V = [[1,0,0],[0,1,0],[0,0,1]];
  for (let it=0; it<60; it++){
    let p=0,q=1,mx=Math.abs(A[0][1]);
    for (const [i,j] of [[0,1],[0,2],[1,2]]) if (Math.abs(A[i][j])>=mx){ mx=Math.abs(A[i][j]); p=i; q=j; }
    if (mx<1e-12) break;
    const phi=0.5*Math.atan2(2*A[p][q], A[q][q]-A[p][p]), c=Math.cos(phi), s=Math.sin(phi);
    for (let k=0;k<3;k++){ const kp=A[k][p],kq=A[k][q]; A[k][p]=c*kp-s*kq; A[k][q]=s*kp+c*kq; }
    for (let k=0;k<3;k++){ const pk=A[p][k],qk=A[q][k]; A[p][k]=c*pk-s*qk; A[q][k]=s*pk+c*qk; }
    for (let k=0;k<3;k++){ const vp=V[k][p],vq=V[k][q]; V[k][p]=c*vp-s*vq; V[k][q]=s*vp+c*vq; }
  }
  return { vals:[A[0][0],A[1][1],A[2][2]], vecs:[0,1,2].map(j=>new THREE.Vector3(V[0][j],V[1][j],V[2][j])) };
}
export function pca(pts){
  const c = new THREE.Vector3(); pts.forEach(p=>c.add(p)); c.multiplyScalar(1/pts.length);
  let xx=0,yy=0,zz=0,xy=0,xz=0,yz=0;
  for (const p of pts){ const dx=p.x-c.x,dy=p.y-c.y,dz=p.z-c.z; xx+=dx*dx;yy+=dy*dy;zz+=dz*dz;xy+=dx*dy;xz+=dx*dz;yz+=dy*dz; }
  const n=pts.length, e=eigenSym3([[xx/n,xy/n,xz/n],[xy/n,yy/n,yz/n],[xz/n,yz/n,zz/n]]);
  const idx=[0,1,2].sort((a,b)=>e.vals[b]-e.vals[a]);
  return { center:c, axes:idx.map(i=>e.vecs[i].clone().normalize()), ext:idx.map(i=>2*Math.sqrt(Math.max(0,e.vals[i]))) };
}

// ============================================================================
// Storyboard: data-driven scroll resolver + overlays.
//
// chapters[i] = {
//   r:[a,b],                       scroll range (0..1)
//   box:'key'|Box3,                framing box (string -> boxes[key])
//   view:'iso'|'front'|...,        camera angle
//   pan:Number, fit:Number,        screen-left shift, distance multiplier
//   vis:{visGroup:opacity},        full per-vis-group opacity map (use makeVis)
//   fade:[a,b],                    opacity ramp window in localT (default early)
//   panel:{mode:'hero'|'side'|'none', sec, blurb, tag},
//   dims:'key',                    -> hooks.drawDims(key, ctx)
//   ...anything custom -> hooks.onResolve(ctx)
// }
// ============================================================================
const DEFAULT_FADE = [0.0, 0.3];
const HOLD = 0.62;          // camera reaches its view by this localT, then holds

export class Storyboard {
  constructor(cfg){
    this.cfg = cfg;
    this.chapters = cfg.chapters || [];
    this.boxes = cfg.boxes || {};
    this.camera = cfg.camera;
    this.meshes = cfg.meshes || [];
    this.els = cfg.els || {};
    this.sections = cfg.sections || {};
    this.hero = Object.assign({ travelVH: 80, introEnd: (this.chapters[0]?.r[1] ?? 0.07) }, cfg.hero || {});
    this.hooks = cfg.hooks || {};
    this.camTarget = new THREE.Vector3();
    this.A = makeSlot(); this.B = makeSlot();
    this._curSec = ''; this._curBlurb = '';
  }
  setChapters(ch){ this.chapters = ch; }
  resolveBox(b){ return (typeof b === 'string') ? this.boxes[b] : b; }

  opacityFor(vg, i, localT){
    const cur = this.chapters[i].vis ? this.chapters[i].vis[vg] : 1;
    const prev = i > 0 && this.chapters[i-1].vis ? this.chapters[i-1].vis[vg] : cur;
    if (prev === cur || prev === undefined) return cur ?? 1;
    const f = this.chapters[i].fade || DEFAULT_FADE;
    return lerp(prev, cur, smoothstep((localT - f[0]) / (f[1] - f[0])));
  }

  // Side panel opacity: held across a section's sub-stages, fades in late on a
  // new section, fades out near the end of the last sub-stage, black on interludes.
  panelAlphaFor(i, localT){
    const c = this.chapters[i].panel;
    if (!c || c.mode !== 'side') return 0;
    const pv = this.chapters[i-1] && this.chapters[i-1].panel, nx = this.chapters[i+1] && this.chapters[i+1].panel;
    const samePrev = pv && pv.mode === 'side' && pv.sec === c.sec;
    const sameNext = nx && nx.mode === 'side' && nx.sec === c.sec;
    let a = 1;
    if (!samePrev) a *= smoothstep((localT - 0.42) / 0.22);
    if (!sameNext) a *= 1 - smoothstep((localT - 0.72) / 0.22);
    return a;
  }

  updateOverlays(p, i, c, localT){
    const { title, panel, blurb, dims } = this.els;
    // hero title scrolls straight up out of frame (no fade) during the intro
    if (title){
      const heroExit = clamp01(p / this.hero.introEnd);
      title.style.transform = `translateY(${(-heroExit * this.hero.travelVH).toFixed(2)}vh)`;
      title.style.opacity = '1';
    }
    // side panel: swap text while invisible, then fade in
    if (panel){
      if (c.panel && c.panel.mode === 'side' && c.panel.sec && this._curSec !== c.panel.sec){
        const sec = this.sections[c.panel.sec];
        if (sec){ panel.querySelector('.kick').innerHTML = sec.kick; panel.querySelector('h2').innerHTML = sec.title; }
        this._curSec = c.panel.sec;
      }
      panel.style.opacity = this.panelAlphaFor(i, localT).toFixed(3);
    }
    // blurb: fades per chapter, dips at each boundary so text can swap
    if (blurb){
      const hasBlurb = c.panel && c.panel.mode === 'side' && c.panel.blurb;
      blurb.style.opacity = (hasBlurb ? Math.min(localT/0.3,1) * Math.min((1-localT)/0.22,1) : 0).toFixed(3);
      if (hasBlurb){
        const key = i + '|' + c.panel.blurb;
        if (this._curBlurb !== key){ blurb.innerHTML = (c.panel.tag ? `<span class="b-tag">${c.panel.tag}</span>` : '') + c.panel.blurb; this._curBlurb = key; }
      }
    }
    // dims overlay: appears once the camera has arrived (~localT 0.45) and HOLDS
    // across consecutive chapters that share the same dims kind (so a multi-stage
    // call-out doesn't flicker at the boundary).
    if (dims){
      const pv = this.chapters[i-1], nx = this.chapters[i+1];
      const samePrev = pv && pv.dims === c.dims, sameNext = nx && nx.dims === c.dims;
      let a = c.dims ? 1 : 0;
      if (c.dims){
        if (!samePrev) a *= clamp01((localT - 0.45) / 0.2);
        if (!sameNext) a *= clamp01((1 - localT) / 0.12);
      }
      dims.style.opacity = a.toFixed(3);
      if (c.dims && a > 0.001 && this.hooks.drawDims) this.hooks.drawDims(c.dims, { localT, alpha:a });
    }
  }

  resolve(p){
    if (!this.chapters.length) return;
    let i = this.chapters.findIndex(c => p <= c.r[1]);
    if (i < 0) i = this.chapters.length - 1;
    const c = this.chapters[i], prev = i > 0 ? this.chapters[i-1] : c;
    const localT = clamp01((p - c.r[0]) / (c.r[1] - c.r[0]));
    const e = ease(clamp01(localT / HOLD));

    // camera: ease from previous framing to this framing
    frameCamera(this.camera, this.resolveBox(prev.box), prev.view, prev.pan, prev.fit, this.A);
    frameCamera(this.camera, this.resolveBox(c.box),    c.view,    c.pan,    c.fit,    this.B);
    this.camera.position.lerpVectors(this.A.pos, this.B.pos, e);
    this.camTarget.lerpVectors(this.A.target, this.B.target, e);
    this.camera.up.lerpVectors(this.A.up, this.B.up, e).normalize();
    this.camera.lookAt(this.camTarget);

    // per-part opacity
    if (c.vis) for (const m of this.meshes) setOpacity(m, this.opacityFor(m.userData.vis, i, localT));

    // project-specific per-frame work (motion, custom actors, gridlines, waves…)
    if (this.hooks.onResolve) this.hooks.onResolve({ p, i, c, prev, localT, e, camera: this.camera, camTarget: this.camTarget });

    this.updateOverlays(p, i, c, localT);
    if (this.els.hud) this.els.hud.textContent = Math.round(p * 100) + '%';
  }
}

// ============================================================================
// DockController: the shared "dock-to-case-study" scroll shell.
//
// After the storyboard, the fixed canvas lerps into a top-right card and a normal
// <article id="case"> scrolls in below it. This owns: the scroll -> progress/dockK
// mapping, the canvas dock lerp (applyDock), the storyboard-overlay fade, and the
// docked rotisserie camera with a SMOOTH TWO-WAY hand-off to/from the storyboard's
// settled iso framing. It also wires the #case .reveal IntersectionObserver.
//
// Conventions it relies on (shared by every docking viewer): a #spacer that sizes
// the storyboard scroll; the canvas (#c); overlay ids #title/#panel/#blurb/#dims;
// #scrollhint/#hint/#hud-progress; an optional #dockhint; and #case .reveal blocks.
// Per-viewer specifics arrive as hooks:
//   getBox()            -> Box3 to frame the docked model (e.g. boxes.all)
//   onStory(shownProg)  -> resolve the storyboard at the smoothed scroll progress
//   onDockSettle()      -> optional; run each docked frame (e.g. reset part movers)
//
// The viewer keeps its own rAF loop (it still owns editor / tuner / render) and just
// calls dock.update() while the storyboard is active. Read dock.dockK /
// dock.shownProgress for any viewer-side logic (drag guards, editor re-resolve…).
//
// The rotisserie azimuth:  ang = ang0 + wrapPi(spin) * spinKeep
//   ang0     — the iso azimuth the storyboard settles on (docking in continues from it).
//   spin     — angle accumulated ONLY when fully docked (eased up from rest).
//   spinKeep — 1 fully docked, ramping to 0 across the band as dockK -> DOCK_SETTLE,
//              so scrolling back up returns the model to iso by the SHORTEST path.
// ============================================================================
const DOCK_SPIN_SPEED = 0.2;   // rad/s steady spin once fully docked
const DOCK_FULL = 0.999;       // dockK at/above which the model free-spins
const DOCK_SETTLE = 0.8;       // ...blending back to the storyboard iso pose down to here
const wrapPi = a => { a %= 2*Math.PI; if (a > Math.PI) a -= 2*Math.PI; if (a < -Math.PI) a += 2*Math.PI; return a; };

export class DockController {
  constructor(cfg){
    this.canvas = cfg.canvas;
    this.renderer = cfg.renderer;
    this.camera = cfg.camera;
    this.spacer = cfg.spacer;
    this.getBox = cfg.getBox;
    this.onStory = cfg.onStory || (() => {});
    this.onDockSettle = cfg.onDockSettle || null;
    this.overlayIds = cfg.overlayIds || ['title','panel','blurb','dims'];
    this.card = Object.assign({ w:380, h:280, top:54, right:24 }, cfg.card || {});

    this.progress = 0; this.shownProgress = 0; this.dockK = 0;
    this._spin = 0; this._spinV = 0; this._lastT = performance.now();
    this._storyEnd = 1;
    this._slot = makeSlot(); this._ctr = new THREE.Vector3(); this._off = new THREE.Vector3();
    this.collapsed = false;

    this._buildDockUI();
    this.layout();
    // Initialise dockK/progress from the CURRENT scroll position. Otherwise dockK is only
    // ever set by the scroll listener, so a reload (or back-nav) while scrolled into the
    // case study leaves dockK=0 → the full-screen storyboard renders "active" behind #case
    // until the user nudges the scroll. Snap shownProgress too so there's no fast-forward sweep.
    this._onScroll();
    this.shownProgress = this.progress;
    addEventListener('resize', () => this.layout());
    addEventListener('scroll', () => this._onScroll(), { passive:true });
    this.observeReveals();
  }

  layout(){ this._storyEnd = Math.max(1, this.spacer.offsetHeight - innerHeight); this._layoutDockUI(); }

  _onScroll(){
    this.progress = clamp01(scrollY / this._storyEnd);
    const start = this._storyEnd - innerHeight*0.45, span = innerHeight*0.7;   // dock begins just before the article, completes shortly after
    this.dockK = clamp01((scrollY - start) / span);
  }

  // the docked card's resting rect (top-right corner) — shared by applyDock + the controls
  _cardRect(){
    const C = this.card;
    return { w: Math.min(C.w, innerWidth - 40), h: Math.min(C.h, innerHeight * 0.34),
             top: C.top, right: Math.min(C.right, innerWidth * 0.04) };
  }

  // Build the docked-model controls once: a transparent click-catcher over the card
  // (click = replay the storyboard from the top), its minimise button, and the collapsed
  // edge tab that restores it. Created here so every docking viewer inherits them.
  _buildDockUI(){
    const win = document.createElement('div'); win.id = 'dockwin';
    win.title = 'Replay the 3D walkthrough';
    const min = document.createElement('button'); min.id = 'dockmin';
    min.setAttribute('aria-label', 'Minimise the 3D model'); min.textContent = '›';   // ›
    win.appendChild(min);
    const tab = document.createElement('button'); tab.id = 'docktab';
    tab.setAttribute('aria-label', 'Show the 3D model'); tab.innerHTML = '<span>‹</span>3D';  // ‹
    // "Skip to case study" — jumps past the 3D walkthrough straight to the dock /
    // case-study start. Shown during the walkthrough, hidden once the model docks.
    const skip = document.createElement('button'); skip.id = 'skipcase'; skip.type = 'button';
    skip.setAttribute('aria-label', 'Skip the 3D walkthrough and jump to the case study');
    skip.innerHTML = 'Skip to case study <span>↓</span>';
    document.body.appendChild(win); document.body.appendChild(tab); document.body.appendChild(skip);
    win.addEventListener('click', () => this.replay());
    min.addEventListener('click', (e) => { e.stopPropagation(); this.collapse(); });
    tab.addEventListener('click', () => this.expand());
    skip.addEventListener('click', () => this.skipToCase());
    this._win = win; this._tab = tab; this._skip = skip;
    this._layoutDockUI();
  }

  _layoutDockUI(){
    if (!this._win) return;
    const R = this._cardRect();
    Object.assign(this._win.style, { top: R.top+'px', right: R.right+'px', width: R.w+'px', height: R.h+'px' });
    this._tab.style.top = (R.top + R.h/2) + 'px';
  }

  collapse(){ this.collapsed = true; }
  expand(){ this.collapsed = false; }
  // scroll back up to the last storyboard beat, full-screen — re-enters the 3D walkthrough
  replay(){ this.expand(); scrollTo({ top: Math.max(0, this._storyEnd - innerHeight*0.5), behavior: 'smooth' }); }

  // skip the walkthrough: smooth-scroll straight to the case-study start, where the
  // model has docked into its corner card. Targets the top of #case (dockK reaches 1
  // there); falls back to the dock-complete scroll position if there's no #case.
  skipToCase(){
    this.expand();
    const el = document.getElementById('case');
    const top = el ? Math.round(el.getBoundingClientRect().top + scrollY)
                   : Math.round(this._storyEnd + innerHeight * 0.25);
    scrollTo({ top, behavior: 'smooth' });
  }

  // lerp the fixed canvas from fullscreen to the top-right card; resize renderer to match
  applyDock(k){
    const R = this._cardRect();
    const ke = ease(k);
    const w = lerp(innerWidth, R.w, ke), h = lerp(innerHeight, R.h, ke);
    const top = lerp(0, R.top, ke), right = lerp(0, R.right, ke);
    const cv = this.canvas;
    const dh = document.getElementById('dockhint'); if (dh) dh.style.top = (R.top + R.h + 8) + 'px';
    cv.style.width = w+'px'; cv.style.height = h+'px';
    cv.style.top = top+'px'; cv.style.right = right+'px'; cv.style.left = 'auto';
    cv.classList.toggle('docked', k > 0.02);
    // On touch devices keep the canvas non-interactive so drags scroll the page through it.
    cv.style.pointerEvents = (COARSE || k > 0.5) ? 'none' : 'auto';
    this.renderer.setSize(w, h, false); this.camera.aspect = w/h; this.camera.updateProjectionMatrix();
    const disp = (id, hide) => { const el = document.getElementById(id); if (el) el.style.display = hide ? 'none' : ''; };
    disp('scrollhint', k>0.03); disp('hint', k>0.03); disp('skipcase', k>0.03);
    const hp = document.getElementById('hud-progress'); if (hp) hp.style.opacity = k>0.4 ? 0 : 0.7;

    // collapse-to-edge-tab + click-to-replay: only once the card is essentially fully docked
    const docked = k >= 0.985;
    cv.classList.toggle('collapsed', docked && this.collapsed);           // CSS slides it off-screen right
    if (this._win) this._win.style.display = (docked && !this.collapsed) ? 'block' : 'none';
    if (this._tab) this._tab.style.display = (docked && this.collapsed) ? 'flex' : 'none';
    if (dh) dh.style.opacity = (k>0.85 && !this.collapsed) ? 0.55 : 0;
  }

  // one storyboard-active frame: smooth scroll, dock the canvas, run storyboard or the
  // docked rotisserie, then fade the storyboard overlays out as the model docks.
  update(){
    const now = performance.now(), dt = Math.min(0.05, (now - this._lastT)/1000); this._lastT = now;
    // scrolling back up toward the storyboard auto-restores a collapsed window
    if (this.collapsed && this.dockK < DOCK_FULL) this.collapsed = false;
    this.shownProgress += (this.progress - this.shownProgress) * 0.12;
    this.applyDock(this.dockK);
    if (this.dockK < DOCK_SETTLE){
      this.onStory(this.shownProgress);
      this._spin = 0; this._spinV = 0;          // reset so the next dock restarts from the iso azimuth
    } else {
      if (this.onDockSettle) this.onDockSettle();
      if (this.dockK >= DOCK_FULL){
        this._spinV += (DOCK_SPIN_SPEED - this._spinV) * 0.03;   // ease the spin speed up from rest
        this._spin += this._spinV * dt;
      }
      const cam = this.camera, b = this.getBox(); b.getCenter(this._ctr);
      frameCamera(cam, b, 'iso', 0, 2.0, this._slot);
      this._off.copy(this._slot.pos).sub(this._slot.target);
      const r = Math.hypot(this._off.x, this._off.z);
      const ang0 = Math.atan2(this._off.z, this._off.x);         // azimuth of the settled iso view
      const spinKeep = smoothstep(clamp01((this.dockK - DOCK_SETTLE) / (DOCK_FULL - DOCK_SETTLE)));
      const ang = ang0 + wrapPi(this._spin) * spinKeep;          // shortest-path return to iso
      cam.position.set(this._ctr.x + r*Math.cos(ang), this._slot.pos.y, this._ctr.z + r*Math.sin(ang));
      cam.up.set(0,1,0); cam.lookAt(this._ctr);
    }
    const od = 1 - smoothstep(this.dockK);
    for (const id of this.overlayIds){ const el = document.getElementById(id); if (el) el.style.opacity = ((parseFloat(el.style.opacity)||0) * od).toFixed(3); }
  }

  // reveal-on-scroll for the case-study write-up (mirrors assets/project.js)
  observeReveals(){
    const io = new IntersectionObserver((entries) => {
      for (const e of entries){ if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('#case .reveal').forEach(el => io.observe(el));
  }
}

export { THREE };
