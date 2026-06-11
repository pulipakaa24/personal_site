// ============================================================================
// Appearance editor + loader.
//
// Lets you dress a raw CAD model (e.g. one exported as flat "defaultplastic")
// by painting material appearances onto parts — or onto a single planar facet —
// and exporting the result to appearance.json so the viewer loads it for real.
//
//   applyAppearance(meshes, json)   – apply a saved appearance map at load time
//   new AppearanceEditor({...})     – the interactive picker (press its toggle key)
//
// appearance.json shape:
//   { "palette":[{name,color,metalness,roughness,opacity?,emissive?}, ...],
//     "parts": { "<mesh.name>": <paletteIndex> },
//     "faces": [ { "name":"<mesh.name>", "app":<paletteIndex>, "tris":<TRIS> } ] }
// where <TRIS> is EITHER a flat list of triangle indices `[i, ...]` (legacy)
// OR a run-length-encoded list of inclusive index ranges `[[start,end], ...]`.
// Export always emits the compact range form (see compactAppearance); the reader
// transparently accepts both. expandTris() normalises either to a flat list.
// ============================================================================
import { THREE, DEV } from './engine.js';

export const DEFAULT_PALETTE = [
  { name:'PCB green',     color:'#0d5b1e', metalness:0.0, roughness:0.50 },
  { name:'Black plastic', color:'#0b0b0b', metalness:0.0, roughness:0.55 },
  { name:'Matte black',   color:'#050505', metalness:0.0, roughness:0.85 },
  { name:'White ABS',     color:'#e9e9ea', metalness:0.0, roughness:0.60 },
  { name:'Grey nylon',    color:'#6f7378', metalness:0.0, roughness:0.65 },
  { name:'Aluminium',     color:'#bcc3cb', metalness:1.0, roughness:0.38 },
  { name:'Steel',         color:'#8d8a86', metalness:1.0, roughness:0.42 },
  { name:'Copper',        color:'#c8783a', metalness:1.0, roughness:0.36 },
  { name:'Gold pin',      color:'#d6b24a', metalness:1.0, roughness:0.34 },
  { name:'Accent orange', color:'#ff6a00', metalness:0.0, roughness:0.40 },
  { name:'Signal red',    color:'#c22626', metalness:0.0, roughness:0.45 },
  { name:'Signal blue',   color:'#1f4fd1', metalness:0.0, roughness:0.45 },
];

// Apply one palette preset to a single material in place.
function applyPreset(mat, preset){
  if (!preset) return;
  if (mat.color && preset.color) mat.color.set(preset.color).convertSRGBToLinear();
  if (preset.metalness !== undefined) mat.metalness = preset.metalness;
  if (preset.roughness !== undefined) mat.roughness = preset.roughness;
  if (preset.emissive && mat.emissive){ mat.emissive.set(preset.emissive).convertSRGBToLinear(); mat.emissiveIntensity = preset.emissiveIntensity ?? 1; }
  if (preset.opacity !== undefined){ mat.opacity = preset.opacity; mat.transparent = preset.opacity < 0.999; }
  mat.needsUpdate = true;
}

// Snapshot a material's original look so the editor can reset before re-applying.
function snapshot(mat){
  return { color: mat.color ? mat.color.clone() : null, metalness: mat.metalness, roughness: mat.roughness,
           opacity: mat.opacity, transparent: mat.transparent,
           emissive: mat.emissive ? mat.emissive.clone() : null, emissiveIntensity: mat.emissiveIntensity };
}
function restore(mat, snap){
  if (!snap) return;
  if (snap.color && mat.color) mat.color.copy(snap.color);
  if (snap.metalness !== undefined) mat.metalness = snap.metalness;
  if (snap.roughness !== undefined) mat.roughness = snap.roughness;
  if (snap.emissive && mat.emissive){ mat.emissive.copy(snap.emissive); mat.emissiveIntensity = snap.emissiveIntensity; }
  mat.opacity = snap.opacity; mat.transparent = snap.transparent; mat.needsUpdate = true;
}

// ----- load-time application (no editor) -----
// Applies a saved appearance map. Stores originals on userData so the editor can
// take over later if opened.
export function applyAppearance(meshes, json){
  if (!json) return;
  const palette = json.palette || DEFAULT_PALETTE;
  const { byKey, byName } = indexMeshes(meshes);
  for (const m of meshes){
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    m.userData._snap = mats.map(snapshot);
  }
  // whole-part / sub-mesh assignments (key may be a unique key '<name>#<i>' or a bare name)
  for (const k in (json.parts || {})){
    const preset = palette[json.parts[k]];
    for (const m of resolveMeshes(k, byKey, byName))
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => applyPreset(mt, preset));
  }
  // facet / sub-body assignments — BATCH per mesh so a part can carry many
  for (const [k, assigns] of groupFaces(json.faces, palette))
    for (const m of resolveMeshes(k, byKey, byName)) paintFacesMulti(m, assigns);
}

// index meshes by unique key and by (possibly shared) name
function indexMeshes(meshes){
  const byKey = new Map(), byName = new Map();
  for (const m of meshes){
    if (m.userData.key) byKey.set(m.userData.key, m);
    if (m.name) (byName.get(m.name) || byName.set(m.name, []).get(m.name)).push(m);
  }
  return { byKey, byName };
}
// '<name>#<i>' -> that one sub-mesh; a bare name -> all meshes sharing it (legacy)
function resolveMeshes(k, byKey, byName){
  if (k.includes('#')) { const m = byKey.get(k); return m ? [m] : []; }
  return byName.get(k) || [];
}

// triangle count of a geometry (indexed or not).
function triCountFromGeo(geo){ return (geo.index ? geo.index.count : geo.attributes.position.count) / 3; }

// Normalise a tris field to a flat index list, accepting either the legacy flat
// form `[i, ...]` or the run-length form `[[start,end], ...]` (inclusive ranges).
function expandTris(tris){
  if (!tris || !tris.length) return [];
  if (!Array.isArray(tris[0])) return tris;            // legacy flat list
  const out = [];
  for (const [s, e] of tris) for (let t = s; t <= e; t++) out.push(t);
  return out;
}
// Run-length encode a SORTED, de-duplicated index list into inclusive ranges.
function encodeRuns(sorted){
  const runs = [];
  for (let i = 0; i < sorted.length; ){
    let s = sorted[i], p = sorted[i++];
    while (i < sorted.length && sorted[i] === p + 1) p = sorted[i++];
    runs.push([s, p]);
  }
  return runs;
}

// Collapse a verbose appearance map into the minimal equivalent, losslessly:
//   1. flatten overlapping/stale face layers per mesh (LATER wins per triangle,
//      matching paintFacesMulti) so re-painted bodies don't pile up;
//   2. drop face triangles whose final app == the mesh's base `part` (they render
//      identically to the base, so they can fall through);
//   3. promote a single app that covers a whole mesh to a `parts` entry (no tris);
//   4. merge the survivors by app and run-length encode them.
// `triCountOf(key)` returns a mesh's triangle count (for step 3) or null/undefined
// when unavailable (step 3 is then skipped — still fully correct, just less terse).
export function compactAppearance(json, triCountOf){
  const parts = Object.assign({}, json.parts || {});
  const byKey = new Map();
  for (const fa of (json.faces || [])){
    const k = fa.key != null ? fa.key : fa.name;
    (byKey.get(k) || byKey.set(k, []).get(k)).push(fa);
  }
  const faces = [];
  for (const [k, entries] of byKey){
    const triApp = new Map();                                    // last write wins
    for (const fa of entries) for (const t of expandTris(fa.tris)) triApp.set(t, fa.app);
    const byApp = new Map();
    for (const [t, app] of triApp) (byApp.get(app) || byApp.set(app, []).get(app)).push(t);
    const tc = triCountOf ? triCountOf(k) : null;
    if (byApp.size === 1 && tc != null){                         // whole-mesh single app -> part
      const [app, tris] = [...byApp][0];
      if (tris.length === tc){ parts[k] = app; continue; }
    }
    for (const [app, tris] of byApp){
      if (app === parts[k]) continue;                            // identical to base part
      tris.sort((a, b) => a - b);
      faces.push({ key: k, app, tris: encodeRuns(tris) });
    }
  }
  return { palette: json.palette, parts, faces };
}

// Group a faces[] list ({key|name, app, tris}) by target into
// key -> [{tris, preset}, ...] so one rebuild handles all facets of a part.
function groupFaces(faces, palette){
  const by = new Map();
  for (const fa of (faces || [])){
    const k = fa.key != null ? fa.key : fa.name;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push({ tris: expandTris(fa.tris), preset: palette[fa.app] });
  }
  return by;
}

// Make a mesh use a material ARRAY and route triangles to extra material slots.
// `assignments` = [{tris, preset}, ...]; LATER assignments win on overlap. All
// facets are baked in ONE group rebuild, so multiple faces per part coexist.
// Clones geometry first so shared instances don't get clobbered.
function paintFacesMulti(mesh, assignments){
  if (!mesh.geometry || !mesh.geometry.attributes.position || !assignments.length) return;
  if (!mesh.userData._geoCloned){ mesh.geometry = mesh.geometry.clone(); mesh.userData._geoCloned = true; }
  const geo = mesh.geometry;
  const triCount = triCountFromGeo(geo);
  // slot 0 = the part's current (base / part-assigned) material; one slot per facet
  const base0 = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const mats = [base0];
  const slotOf = new Int32Array(triCount);   // default 0 (base)
  for (const a of assignments){
    const mat = base0.clone(); applyPreset(mat, a.preset); mats.push(mat);
    const slot = mats.length - 1;
    for (const t of a.tris) if (t >= 0 && t < triCount) slotOf[t] = slot;
  }
  mesh.material = mats;
  // rebuild groups in one pass over contiguous same-slot runs
  geo.clearGroups();
  let start = 0, cur = slotOf[0];
  for (let t = 1; t <= triCount; t++){
    const mi = t < triCount ? slotOf[t] : -1;
    if (mi !== cur){ geo.addGroup(start*3, (t-start)*3, cur); start = t; cur = mi; }
  }
}

// ============================================================================
export class AppearanceEditor {
  constructor(cfg){
    this.renderer = cfg.renderer; this.scene = cfg.scene; this.camera = cfg.camera;
    this.controls = cfg.controls; this.meshes = cfg.meshes; this.boxes = cfg.boxes || {};
    this.toggleKey = (cfg.toggleKey || 'g').toLowerCase();
    this.onAfter = cfg.onAfter || (()=>{});           // re-run resolve(progress) on exit
    this.palette = (cfg.initial && cfg.initial.palette) || cfg.palette || DEFAULT_PALETTE.map(p => ({...p}));
    this.parts = Object.assign({}, (cfg.initial && cfg.initial.parts) || {});  // name -> paletteIndex
    // normalise loaded faces to flat tris so the editor works in one form; export re-compacts.
    this.faces = ((cfg.initial && cfg.initial.faces) || []).map(f => ({...f, tris: expandTris(f.tris)}));
    this.active = 0; this.mode = 'part'; this.selected = null;
    this.on = false;
    this.raycaster = new THREE.Raycaster(); this.pointer = new THREE.Vector2();

    // snapshots for reset/re-apply
    for (const m of this.meshes){
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      m.userData._snap = mats.map(snapshot);
      m.userData._baseMatCount = mats.length;
    }
    this.helper = new THREE.BoxHelper(new THREE.Object3D(), 0x19d3ff); this.helper.visible = false; this.scene.add(this.helper);

    this._buildUI();
    // G (toggleKey) only opens the editor in dev mode (see engine.js DEV).
    if (DEV) addEventListener('keydown', e => { if (e.key.toLowerCase() === this.toggleKey && !/input|textarea/i.test(document.activeElement?.tagName||'')) this.toggle(); });
    this.renderer.domElement.addEventListener('click', e => this._click(e));
    this.applyAll();
  }

  // resolve a target key: '<name>#<i>' -> that one sub-mesh; a bare name -> all
  // meshes sharing it (legacy appearance.json compatibility).
  resolve(k){ return k.includes('#') ? this.meshes.filter(m => m.userData.key === k) : this.meshes.filter(m => m.name === k); }

  applyAll(){
    // reset all to original, drop editor-added material slots/groups
    for (const m of this.meshes){
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const base = m.userData._baseMatCount;
      if (mats.length > base){ m.material = base === 1 ? mats[0] : mats.slice(0, base); }
      const cur = Array.isArray(m.material) ? m.material : [m.material];
      cur.forEach((mt, i) => restore(mt, m.userData._snap[i]));
      if (m.geometry && m.userData._geoCloned) m.geometry.clearGroups();
    }
    for (const k in this.parts){
      const preset = this.palette[this.parts[k]];
      for (const m of this.resolve(k)) (Array.isArray(m.material)?m.material:[m.material]).forEach(mt => applyPreset(mt, preset));
    }
    for (const [k, assigns] of groupFaces(this.faces, this.palette))
      for (const m of this.resolve(k)) paintFacesMulti(m, assigns);
  }

  toggle(){ this.on ? this.exit() : this.enter(); }
  enter(){
    this.on = true; document.body.classList.add('editing');
    this.controls.enabled = true;
    const b = this.boxes.all; if (b){ this.controls.target.copy(b.getCenter(new THREE.Vector3())); }
    this._syncUI();
  }
  exit(){ this.on = false; document.body.classList.remove('editing'); this.controls.enabled = false; this.helper.visible = false; this.onAfter(); }

  _click(e){
    if (!this.on) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX-r.left)/r.width)*2-1;
    this.pointer.y = -((e.clientY-r.top)/r.height)*2+1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes, false)[0];
    if (!hit) return;
    const m = hit.object;
    this.selected = m; this.helper.setFromObject(m); this.helper.visible = true;
    if (this.mode === 'part'){
      // colour the whole clicked sub-mesh
      this.parts[m.userData.key] = this.active;
      this.applyAll();
      this._pick(`${m.name || 'sub-mesh'} → ${this.palette[this.active].name}`);
    } else {
      // Body mode: the whole connected sub-body. Face mode: the coplanar facet.
      const tri = hit.faceIndex;
      if (tri == null){ this._pick('no face under cursor'); return; }
      const cos = this.mode === 'body' ? -2 : Math.cos(8*Math.PI/180);   // -2 => connect everything
      const tris = this._flood(m, tri, cos);
      this.faces.push({ key:m.userData.key, app:this.active, tris });
      this.applyAll();
      this._pick(`${m.name || 'sub-mesh'} · ${tris.length} tri(s) [${this.mode}] → ${this.palette[this.active].name}`);
    }
  }

  // Flood the triangle cluster around a seed. cos >= ... gates by coplanarity
  // (Face mode); cos = -2 connects across every shared edge => the whole
  // connected sub-body (Body mode).
  _flood(mesh, seed, cos){
    const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index;
    const triCount = (idx ? idx.count : pos.count)/3;
    const vi = (t,k) => idx ? idx.getX(t*3+k) : t*3+k;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), n2 = new THREE.Vector3();
    const triNormal = (t,out) => { a.fromBufferAttribute(pos,vi(t,0)); b.fromBufferAttribute(pos,vi(t,1)); c.fromBufferAttribute(pos,vi(t,2)); out.copy(b).sub(a).cross(n2.copy(c).sub(a)).normalize(); };
    triNormal(seed, nrm);
    // vertex-key adjacency (quantized) so we can flood across shared edges
    const key = (t,k) => { const i=vi(t,k); return `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`; };
    const vmap = new Map();
    for (let t=0;t<triCount;t++) for (let k=0;k<3;k++){ const kk=key(t,k); (vmap.get(kk)||vmap.set(kk,[]).get(kk)).push(t); }
    const out = new Set([seed]), stack = [seed];
    while (stack.length){
      const t = stack.pop();
      for (let k=0;k<3;k++) for (const nb of (vmap.get(key(t,k))||[])){
        if (out.has(nb)) continue;
        if (cos <= -1) { out.add(nb); stack.push(nb); continue; }   // body: connect all
        triNormal(nb, n2);
        if (n2.dot(nrm) >= cos){ out.add(nb); stack.push(nb); }     // face: coplanar only
      }
    }
    return [...out];
  }

  exportJSON(){
    const triCountOf = (k) => { const m = this.resolve(k)[0]; return m && m.geometry ? triCountFromGeo(m.geometry) : null; };
    const json = compactAppearance({ palette: this.palette, parts: this.parts, faces: this.faces }, triCountOf);
    const txt = JSON.stringify(json);
    navigator.clipboard?.writeText(txt).catch(()=>{});
    const dump = document.getElementById('dump'); if (dump){ document.getElementById('dumpText').value = txt; dump.style.display = 'block'; }
    return txt;
  }

  // ---- UI (built into the shared #legend shell) ----
  _buildUI(){
    const L = document.getElementById('legend'); if (!L) return;
    L.innerHTML = `<h3>Appearance editor</h3>
      <div style="display:flex;gap:6px;margin-bottom:8px">
        <button data-mode="part" class="modebtn" title="whole clicked sub-mesh">Part</button>
        <button data-mode="body" class="modebtn" title="whole connected sub-body">Body</button>
        <button data-mode="face" class="modebtn" title="coplanar facet only">Face</button>
      </div>
      <div id="ed-palette"></div>
      <div style="margin-top:8px;border-top:1px solid #2a2a2a;padding-top:8px">
        <div class="row" style="gap:6px"><input type="color" id="ed-color" style="width:28px;height:22px;border:0;background:none">
          <input id="ed-name" placeholder="name" style="flex:1;background:#000;border:1px solid #333;color:#fff;border-radius:4px;padding:3px 6px;font-size:11px"></div>
        <label class="muted" style="display:block;margin-top:6px">metalness <input type="range" id="ed-metal" min="0" max="1" step="0.01" style="width:100%"></label>
        <label class="muted" style="display:block">roughness <input type="range" id="ed-rough" min="0" max="1" step="0.01" style="width:100%"></label>
        <button id="ed-new">+ new appearance</button>
      </div>
      <div class="muted">Pick an appearance, then click. <b>Part</b>=sub-mesh · <b>Body</b>=connected sub-body · <b>Face</b>=flat facet. <b>${this.toggleKey.toUpperCase()}</b> exits.</div>
      <button id="ed-export">Export appearance JSON</button>
      <button id="ed-reset" style="background:#444;color:#fff">Reset all</button>`;
    L.querySelectorAll('.modebtn').forEach(btn => btn.onclick = () => { this.mode = btn.dataset.mode; this._syncUI(); });
    L.querySelector('#ed-new').onclick = () => { const p = {...this.palette[this.active], name:'custom '+this.palette.length}; this.palette.push(p); this.active = this.palette.length-1; this._syncUI(); };
    L.querySelector('#ed-export').onclick = () => this.exportJSON();
    L.querySelector('#ed-reset').onclick = () => { this.parts = {}; this.faces = []; this.applyAll(); this._pick('reset'); };
    const upd = () => { const p = this.palette[this.active];
      p.color = L.querySelector('#ed-color').value; p.name = L.querySelector('#ed-name').value || p.name;
      p.metalness = +L.querySelector('#ed-metal').value; p.roughness = +L.querySelector('#ed-rough').value;
      this.applyAll(); this._renderPalette(); };
    ['ed-color','ed-name','ed-metal','ed-rough'].forEach(id => L.querySelector('#'+id).addEventListener('input', upd));
    this._renderPalette();
  }
  _renderPalette(){
    const wrap = document.getElementById('ed-palette'); if (!wrap) return;
    wrap.innerHTML = this.palette.map((p,i) =>
      `<div class="row" data-i="${i}" style="cursor:pointer;padding:2px 3px;border-radius:4px;${i===this.active?'background:rgba(25,211,255,.18)':''}">
        <span class="sw" style="background:${p.color}"></span><span>${p.name}</span></div>`).join('');
    wrap.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { this.active = +el.dataset.i; this._syncUI(); });
  }
  _syncUI(){
    const L = document.getElementById('legend'); if (!L) return;
    const p = this.palette[this.active];
    L.querySelector('#ed-color').value = p.color; L.querySelector('#ed-name').value = p.name;
    L.querySelector('#ed-metal').value = p.metalness; L.querySelector('#ed-rough').value = p.roughness;
    L.querySelectorAll('.modebtn').forEach(b => b.style.outline = b.dataset.mode === this.mode ? '2px solid #19d3ff' : 'none');
    this._renderPalette();
  }
  _pick(txt){ const el = document.getElementById('picked'); if (el) el.textContent = txt; }
}
