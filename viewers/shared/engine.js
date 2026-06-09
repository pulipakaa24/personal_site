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
  iso2:  { dir: new THREE.Vector3(0.28, 0.58, 1.0).normalize(), up: new THREE.Vector3(0,1,0) }, // gentle swing off iso
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
const _c = new THREE.Vector3(), _s = new THREE.Vector3(), _right = new THREE.Vector3();
export function frameCamera(camera, box, viewKey, pan, fit, out){
  const v = VIEWS[viewKey] || VIEWS.iso;
  box.getCenter(_c); box.getSize(_s);
  const r = Math.max(_s.x, _s.y, _s.z, 1e-4) * 0.5;
  const dist = (r / Math.tan((camera.fov * Math.PI/180)/2)) * (fit || 1.6);
  out.up.copy(v.up);
  out.target.copy(_c);
  out.pos.copy(_c).addScaledVector(v.dir, dist);
  if (pan){   // move subject to screen-left: shift cam+target along camera-right
    _right.crossVectors(v.up, v.dir).normalize();
    const shift = r * pan * 1.5;
    out.pos.addScaledVector(_right, shift);
    out.target.addScaledVector(_right, shift);
  }
}
export const makeSlot = () => ({ pos:new THREE.Vector3(), target:new THREE.Vector3(), up:new THREE.Vector3() });

// Project a world point to screen pixels (for SVG overlays).
const _pp = new THREE.Vector3();
export function projectPoint(camera, v){ _pp.copy(v).project(camera); return { x:(_pp.x*0.5+0.5)*innerWidth, y:(-_pp.y*0.5+0.5)*innerHeight }; }

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

export { THREE };
