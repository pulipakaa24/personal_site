/* =====================================================================
   build-pdf.mjs — render the personal site into a dark, aesthetic PDF dossier.

   Pipeline:
     1. serve the repo root over http (so relative assets + the viewers' GLBs load)
     2. extract content from index.html / project pages / viewer case studies
        straight from the live DOM (single source of truth — no copied prose)
     3. capture 3D model "beats" from each scroll viewer (Phase 2)
     4. assemble one dossier HTML doc (export.html) styled by dossier.css
     5. Chromium page.pdf() → assets/Aditya-Pulipaka-Portfolio.pdf  (vector text)

   Local:  CHROME_PATH defaults to macOS Chrome.   `npm run build`
   CI:     install Chrome via an action, set CHROME_PATH, run the same command.
   ===================================================================== */
import http from 'node:http';
import { writeFile, mkdir } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const MARGIN_IN = 0.48;   // top/bottom page margin → uniform per-page breathing room

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');                 // repo root (personal_site/)
const OUT  = path.join(ROOT, 'assets', 'Aditya-Pulipaka-Portfolio.pdf');
const EXPORT_HTML = path.join(ROOT, 'export.html');         // intermediate (gitignored)
const RENDER_DIR = path.join(ROOT, 'export', '.cache', 'renders');   // captured 3D beats (gitignored)
const RENDER_URL = '/export/.cache/renders';
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;

const CHROME_PATH = process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// SwiftShader (software GL) in CI / when forced — for parity with the GPU-less Linux runner.
// Locally default to the real GPU (macOS Metal via ANGLE) so capture is fast.
const SOFTWARE_GL = process.env.SOFTWARE_GL === '1' || !!process.env.CI;
const CHROME_ARGS = [
  '--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars', '--ignore-gpu-blocklist',
  // keep rAF / timers running while "hidden" so the storyboard advances
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  ...(SOFTWARE_GL
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
      : ['--use-angle=metal', '--enable-gpu']),
];

/* projects in dossier order (viewers first — they carry the 3D) */
const PROJECTS = [
  { slug:'guadaloop',   kind:'viewer', url:'/viewers/guadaloop/index.html',   title:'Guadaloop Levitation Rig', kicker:'Maglev test rig · sim env · subteam lead' },
  { slug:'rescuevision',kind:'viewer', url:'/viewers/rescuevision/index.html',title:'RescueVision',             kicker:'mmWave + UWB through-wall localization' },
  { slug:'smartpt',     kind:'viewer', url:'/viewers/smartpt/index.html',     title:'SmartPT',                  kicker:'CV + IMU sensor-fusion recovery tracking' },
  { slug:'blindmaster', kind:'viewer', url:'/viewers/blindmaster/index.html', title:'BlindMaster',              kicker:'Full-stack IoT smart blinds' },
  { slug:'tweinstein',  kind:'page',   url:'/projects/tweinstein.html',       title:'TweinStein' },
  { slug:'lidar-slam',  kind:'page',   url:'/projects/lidar-slam.html',       title:'LiDAR SLAM & Localization' },
  { slug:'harmonium',   kind:'page',   url:'/projects/harmonium.html',        title:'Harmonium' },
];

/* 3D beats per viewer — storyboard-progress samples (mid/late chapter so the camera has settled).
   `hero` is the clean assembled settle frame; `shots` become the captioned filmstrip (captions are
   read live from the viewer's own #blurb overlay, so they stay in sync with the source). */
const BEATS = {
  guadaloop:    { hero:0.985, shots:[0.12, 0.21, 0.44, 0.52, 0.74, 0.88] },
  rescuevision: { hero:0.965, shots:[0.145, 0.21, 0.345, 0.465, 0.605, 0.78] },
  smartpt:      { hero:0.90,  shots:[0.16, 0.37, 0.62] },
  blindmaster:  { hero:0.985, shots:[0.10, 0.27, 0.40, 0.55, 0.72, 0.90] },
};

/* ---------- tiny static server ---------- */
const MIME = {
  '.html':'text/html', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript',
  '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.woff2':'font/woff2',
  '.glb':'model/gltf-binary', '.ico':'image/x-icon', '.txt':'text/plain', '.pdf':'application/pdf',
};
function serve(root, port){
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
    });
    server.listen(port, () => resolve(server));
  });
}

/* ---------- helpers ---------- */
// normalize every asset reference to a root-absolute /assets/... path,
// and drop lazy-loading (offscreen lazy imgs never load in screen context → would hang the readiness wait)
function fixPaths(html){
  return html
    .replace(/(\.\.\/)+assets\//g, '/assets/')
    .replace(/(["'(=])\s*assets\//g, '$1/assets/')
    .replace(/\/\/assets\//g, '/assets/')
    .replace(/\s+loading=("|')lazy\1/g, '');
}
const esc = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

// downscale + JPEG the source photos (some are 1920px embedded at ~300px display) via a Chrome
// canvas pass → inline data URIs. Skips the 3D render cache (/export/...) so their alpha is kept.
async function downscalePhotos(browser, html){
  const urls = [...new Set([...html.matchAll(/"(\/assets\/[^"]+\.(?:jpe?g|png))"/g)].map(m => m[1]))];
  if (!urls.length) return html;
  const page = await browser.newPage();
  await page.goto(BASE + '/index.html', { waitUntil:'domcontentloaded', timeout:60000 }); // same-origin → canvas not tainted
  let out = html;
  for (const u of urls){
    try {
      const dataUri = await page.evaluate(async (src, maxW, q) => {
        const img = new Image(); img.src = src; await img.decode();
        const scale = Math.min(1, maxW / img.naturalWidth);
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        return c.toDataURL('image/jpeg', q);
      }, u, 880, 0.80);
      out = out.split(`"${u}"`).join(`"${dataUri}"`);
    } catch (e){ console.warn(`  ! downscale failed ${u}: ${e.message}`); }
  }
  await page.close();
  return out;
}

async function withPage(browser, url, waitUntil, fn){
  const page = await browser.newPage();
  await page.setViewport({ width:1440, height:900, deviceScaleFactor:2 });
  await page.goto(BASE + url, { waitUntil, timeout:60000 });
  const out = await fn(page);
  await page.close();
  return out;
}

/* ---------- extraction: landing page ---------- */
async function extractLanding(browser){
  return withPage(browser, '/index.html', 'domcontentloaded', (page) => page.evaluate(() => {
    const oh = (sel) => document.querySelector(sel)?.outerHTML || '';
    const ih = (sel) => document.querySelector(sel)?.innerHTML || '';
    const tx = (sel) => document.querySelector(sel)?.textContent.trim() || '';
    // about paragraphs (drop the .idx label + the facts block; we place facts ourselves)
    const ab = document.querySelector('#about .about-body').cloneNode(true);
    ab.querySelector('.idx')?.remove();
    const factsEl = ab.querySelector('.facts');
    const aboutFacts = factsEl ? factsEl.outerHTML : '';
    factsEl?.remove();
    return {
      lede: ih('.hero .lede'),
      roles: tx('.hero .status .status-roles') || tx('.hero .status'),
      aboutParas: ab.innerHTML,
      aboutFacts,
      skillgroups: oh('#skills .skillgroups'),
      timeline: oh('#experience .timeline'),
      quote: oh('#experience .quote'),
      honors: oh('#honors .honors'),
      testscores: oh('#honors .testscores'),
      coursegroups: oh('#coursework .coursegroups'),
      coursenote: oh('#coursework .course-note'),
    };
  }));
}

/* ---------- extraction: a regular case-study PAGE ---------- */
async function extractPage(browser, proj){
  const data = await withPage(browser, proj.url, 'domcontentloaded', (page) => page.evaluate(() => {
    const q = (s,r=document) => r.querySelector(s);
    const linkstrip = (root) => {
      const a = [...(root?.querySelectorAll('a')||[])];
      if (!a.length) return '';
      return `<div class="linkstrip">${a.map(x=>`<a href="${x.href}">${x.textContent.replace(/[↗→\s]+$/,'').trim()}</a>`).join('')}</div>`;
    };
    const blockHTML = (b) => {
      const iframes = [...b.querySelectorAll('iframe')];
      if (!iframes.length) return b.outerHTML;
      const h2 = b.querySelector('h2')?.outerHTML || '';
      const items = iframes.map(fr => {
        const fig = fr.closest('figure');
        const cap = (fig && fig.querySelector('figcaption')?.textContent.trim())
                  || fr.getAttribute('title') || 'Watch the demo';
        const src = fr.getAttribute('src') || '';
        const id = (src.match(/embed\/([\w-]+)/)||[])[1];
        const url = id ? 'youtu.be/'+id : src.replace(/^https?:\/\//,'');
        return `<a class="watch" href="https://${url}"><span class="pl">▶</span><span class="t">${cap}</span><span class="u">${url}</span></a>`;
      }).join('');
      return `<section class="block">${h2}<div class="watchlist">${items}</div></section>`;
    };
    const hero = q('.hero-media img');
    return {
      kicker: q('.phero .eyebrow')?.innerHTML || '',
      title:  q('.phero h1')?.textContent.trim() || '',
      lede:   q('.phero .lede')?.innerHTML || '',
      tags:   q('.phero .tags')?.outerHTML || '',
      links:  linkstrip(q('.phero .actions')),
      facts:  q('dl.facts')?.outerHTML || '',
      heroImg: hero ? hero.getAttribute('src') : '',
      heroAlt: hero ? (hero.getAttribute('alt')||'') : '',
      blocks: [...document.querySelectorAll('.block')].map(blockHTML).join('\n'),
    };
  }));
  return data;
}

/* ---------- extraction: a VIEWER case study (#case) ---------- */
async function extractViewer(browser, proj){
  const data = await withPage(browser, proj.url, 'domcontentloaded', (page) => page.evaluate(() => {
    const q = (s,r=document) => r.querySelector(s);
    const linkstrip = (root) => {
      const a = [...(root?.querySelectorAll('a')||[])];
      if (!a.length) return '';
      return `<div class="linkstrip">${a.map(x=>`<a href="${x.href}">${x.textContent.replace(/[↗→\s]+$/,'').trim()}</a>`).join('')}</div>`;
    };
    // convert a .block: pass through, unless it embeds video iframes → link cards
    const blockHTML = (b) => {
      const iframes = [...b.querySelectorAll('iframe')];
      if (!iframes.length) return b.outerHTML;
      const h2 = b.querySelector('h2')?.outerHTML || '';
      const items = iframes.map(fr => {
        const fig = fr.closest('figure');
        const cap = (fig && fig.querySelector('figcaption')?.textContent.trim())
                  || fr.getAttribute('title') || 'Watch the demo';
        const src = fr.getAttribute('src') || '';
        const id = (src.match(/embed\/([\w-]+)/)||[])[1];
        const url = id ? 'youtu.be/'+id : src.replace(/^https?:\/\//,'');
        return `<a class="watch" href="https://${url}"><span class="pl">▶</span><span class="t">${cap}</span><span class="u">${url}</span></a>`;
      }).join('');
      return `<section class="block">${h2}<div class="watchlist">${items}</div></section>`;
    };
    const caseEl = q('#case');
    return {
      award:  q('#case .award')?.outerHTML || '',
      lede:   q('#case .lede')?.outerHTML || '',
      tags:   q('#case .tags')?.outerHTML || '',
      links:  linkstrip(q('#case .actions')),
      facts:  q('#case dl.facts')?.outerHTML || '',
      blocks: [...caseEl.querySelectorAll('.block')].map(blockHTML).join('\n'),
    };
  }));
  return data;
}

/* ---------- 3D beats: drive each viewer's storyboard + capture the model ---------- */
// autocrop a transparent PNG to its non-transparent bounds (+ small pad) → centered model
function trimPng(buf, pad=0.045){
  const png = PNG.sync.read(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  const { width:w, height:h, data } = png;
  let minX=w, minY=h, maxX=0, maxY=0, found=false;
  for (let y=0;y<h;y+=2) for (let x=0;x<w;x+=2){
    if (data[(y*w+x)*4+3] > 16){ found=true;
      if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
  }
  if (!found) return null;   // fully transparent → blank capture
  const px=Math.round((maxX-minX)*pad), py=Math.round((maxY-minY)*pad);
  minX=Math.max(0,minX-px); minY=Math.max(0,minY-py); maxX=Math.min(w-1,maxX+px); maxY=Math.min(h-1,maxY+py);
  const cw=maxX-minX+1, ch=maxY-minY+1, out=new PNG({width:cw,height:ch});
  for (let y=0;y<ch;y++) for (let x=0;x<cw;x++){
    const si=((y+minY)*w+(x+minX))*4, di=(y*cw+x)*4;
    out.data[di]=data[si]; out.data[di+1]=data[si+1]; out.data[di+2]=data[si+2]; out.data[di+3]=data[si+3];
  }
  return PNG.sync.write(out);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function captureBeats(browser, proj){
  const cfg = BEATS[proj.slug];
  if (!cfg) return null;
  const page = await browser.newPage();
  await page.setViewport({ width:1500, height:950, deviceScaleFactor:1.5 });   // 1.5× — crisp render quality (size is not a constraint)
  try {
    await page.goto(BASE + proj.url, { waitUntil:'domcontentloaded', timeout:60000 });
    // model + storyboard ready when the loader hides
    await page.waitForFunction(() => document.getElementById('loader')?.classList.contains('hidden'),
      { timeout:60000, polling:200 });
    // strip the page to just the model: transparent backdrop, every overlay hidden
    await page.addStyleTag({ content:
      `html{scroll-behavior:auto !important}
       html,body{background:transparent !important}
       nav,#title,#panel,#blurb,#dims,#hint,#hud-progress,#dockhint,#skipcase,#scrollhint,
       #loader,#editor,#legend,#picked,#dump,#diag,.diag-lb{display:none !important}
       #c{background:transparent !important}` });
    // scroll-map (matches DockController: storyboard plays after the un-dock zone)
    const map = await page.evaluate(() => {
      const sp = document.getElementById('spacer');
      const storySpan = sp.offsetHeight - innerHeight;
      const undockSpan = Math.min(0.9*innerHeight, 0.5*storySpan);
      return { start: sp.offsetTop, storySpan, undockSpan };
    });
    const scrollFor = (p) => map.start + map.undockSpan + p*(map.storySpan - map.undockSpan);

    const canvas = await page.$('#c');
    const readCaption = () => page.evaluate(() => {
      const b = document.getElementById('blurb');
      const tag = b?.querySelector('.b-tag')?.textContent.trim() || '';
      let full = b?.textContent.trim() || '';
      if (tag && full.startsWith(tag)) full = full.slice(tag.length).trim();
      return { tag, blurb: full };
    });
    const shoot = async (p, file) => {
      const target = scrollFor(p);
      await page.evaluate(y => window.scrollTo(0, y), target);   // instant (scroll-behavior:auto)
      // wait for the eased progress to reach target, then let the camera lerp settle
      await page.waitForFunction((t) => {
        const h = document.getElementById('hud-progress');
        return !h || Math.abs((parseInt(h.textContent)||0) - t) <= 1;
      }, { timeout:7000, polling:80 }, Math.round(p*100)).catch(()=>{});
      await sleep(450);
      // force fresh renders to the canvas so the screenshot can't grab a stale composited frame
      const freshFrames = () => page.evaluate(() => new Promise(res => {
        let n = 3; const tick = () => (--n <= 0 ? res() : requestAnimationFrame(tick)); requestAnimationFrame(tick);
      }));
      await freshFrames();
      const diag = await page.evaluate(() => ({
        y: Math.round(scrollY), max: Math.round(document.documentElement.scrollHeight - innerHeight),
        hud: document.getElementById('hud-progress')?.textContent || '?' }));
      console.log(`    ${file}: p=${p} target=${Math.round(target)} landed=${diag.y}/${diag.max} hud=${diag.hud}`);
      let out = trimPng(await canvas.screenshot({ omitBackground:true, type:'png', captureBeyondViewport:false }));
      if (!out){ await sleep(700); await freshFrames(); out = trimPng(await canvas.screenshot({ omitBackground:true, type:'png', captureBeyondViewport:false })); }
      if (out){ await writeFile(path.join(RENDER_DIR, file), out); return { ok:true, ...(await readCaption()) }; }
      console.warn(`  ! blank capture: ${file} @ p=${p}`);
      return { ok:false };
    };

    // ascending progress order (capture the high-progress hero LAST, not first)
    const shots = [];
    for (let i=0;i<cfg.shots.length;i++){
      const cap = await shoot(cfg.shots[i], `${proj.slug}-b${i}.png`);
      if (!cap.ok) continue;
      // full blurb (no mid-sentence truncation) — the 2-col filmstrip has room
      shots.push({ img:`${RENDER_URL}/${proj.slug}-b${i}.png`, tag:cap.tag, blurb:(cap.blurb||'').replace(/\s+/g,' ').trim() });
    }
    const hero = await shoot(cfg.hero, `${proj.slug}-hero.png`);
    return { hero: hero.ok ? `${RENDER_URL}/${proj.slug}-hero.png` : null, shots };
  } catch (e) {
    console.warn(`  ! beat capture failed for ${proj.slug}: ${e.message}`);
    return null;
  } finally {
    await page.close();
  }
}

/* ---------- compose project section HTML ---------- */
function renderHero(beats){
  if (!beats || !beats.hero) return '';
  return `<div class="render-hero"><img src="${beats.hero}" alt=""><span class="badge">Interactive 3D walkthrough · ${beats.viewerLabel||'live on the site'}</span></div>`;
}
function renderBeats(beats){
  if (!beats || !beats.shots?.length) return '';
  const cells = beats.shots.map(s => `
    <div class="beat"><div class="shot"><img src="${s.img}" alt=""></div>
    <div class="cap"><span class="t">${esc(s.tag)}</span><span class="d">${esc(s.blurb)}</span></div></div>`).join('');
  return `<div class="beats">${cells}</div>`;
}

function projectSection(proj, data, beats, n){
  const num = String(n).padStart(2,'0');
  if (proj.kind === 'viewer'){
    return `
<section class="project avoid-head">
  <div class="p-head">
    <div class="p-kicker"><span class="n">${num}</span>${esc(proj.kicker)}</div>
    <h1 class="p-title">${esc(proj.title)}</h1>
  </div>
  ${data.lede}
  ${renderHero(beats)}
  ${data.award}
  ${data.tags}
  ${data.links}
  ${data.facts}
  ${renderBeats(beats)}
  ${data.blocks}
</section>`;
  }
  // regular case-study page — two-column hero (text left, image right), mirroring the site
  const heroImg = data.heroImg
    ? `<div class="phero-right"><img src="${fixPaths(data.heroImg)}" alt="${esc(data.heroAlt)}"></div>` : '';
  return `
<section class="project">
  <div class="phero-grid${data.heroImg ? '' : ' solo'}">
    <div class="phero-left">
      <div class="p-kicker"><span class="n">${num}</span>${data.kicker}</div>
      <h1 class="p-title">${esc(data.title)}</h1>
      ${data.lede ? `<p class="lede">${data.lede}</p>`:''}
      ${data.tags}
      ${data.links}
    </div>
    ${heroImg}
  </div>
  ${data.facts}
  ${data.blocks}
</section>`;
}

/* ---------- assemble the whole dossier ---------- */
function assemble(L, projects){
  const date = new Date().toLocaleDateString('en-US', { month:'long', year:'numeric' });
  const workList = projects.map((p,i) =>
    `<div class="toc-row"><span class="toc-n">${String(i+1).padStart(2,'0')}</span><span class="toc-t">${esc(p.proj.title)}</span><span class="toc-k">${p.proj.kind==='viewer'?esc(p.proj.kicker):(p.data.kicker||'').replace(/<[^>]+>/g,'')}</span></div>`
  ).join('');

  const projectsHTML = projects.map((p,i) => projectSection(p.proj, p.data, p.beats, i+1)).join('\n');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Aditya Pulipaka — Portfolio</title>
<link rel="stylesheet" href="export/dossier.css">
<style>
/* Work index (mini-TOC) + project-head keep-together — small one-offs */
.toc{margin-top:8px}
.toc-row{display:flex;align-items:baseline;gap:16px;padding:13px 0;border-top:1px solid var(--line)}
.toc-row:last-child{border-bottom:1px solid var(--line)}
.toc-n{font-family:var(--mono);font-size:12px;color:var(--accent);min-width:26px}
.toc-t{font-size:17px;font-weight:700;min-width:8.4em}
.toc-k{font-size:12.5px;color:var(--muted)}
.project .p-head, .project .p-head + .lede{break-after:avoid}
</style></head>
<body>

<!-- ============ COVER ============ -->
<section class="cover">
  <span class="eyebrow">ECE Honors · UT Austin</span>
  <h1>Aditya<br><span class="l2">Pulipaka</span></h1>
  <p class="lede">${L.lede}</p>
  <div class="roles"><span class="dot"></span>${esc(L.roles)}</div>
  <div class="cover-foot">
    <div class="who">Selected Engineering Portfolio · ${date}</div>
    <div class="links">
      <a href="mailto:adipu@utexas.edu">adipu@utexas.edu</a>
      <a href="https://aditya.pulipaka.com"><span>aditya.pulipaka.com</span></a>
      <a href="https://www.linkedin.com/in/aditya-pulipaka">linkedin.com/in/aditya-pulipaka</a>
    </div>
  </div>
</section>

<div class="doc">

  <!-- ============ 01 PROFILE ============ -->
  <section class="section lead">
    <div class="sec-head"><div class="idx">01 — Profile</div><h2>About</h2></div>
    <div class="profile">
      <div class="photo"><img src="/assets/profile_full.jpg" alt="Aditya Pulipaka"></div>
      <div class="about-body">${L.aboutParas}</div>
    </div>
    ${L.aboutFacts}
  </section>

  <!-- ============ 02 EXPERIENCE ============ -->
  <section class="section lead">
    <div class="sec-head"><div class="idx">02 — Experience</div><h2>Where I've worked</h2>
      <p class="tagline">Embedded software, robotics research, and controls — across industry, university labs, and student engineering teams.</p></div>
    ${L.timeline}
    ${L.quote}
  </section>

  <!-- ============ 03 SELECTED WORK ============ -->
  <section class="section lead">
    <div class="sec-head"><div class="idx">03 — Selected Work</div><h2>Things I've built</h2>
      <p class="tagline">Research, internships, and hackathon wins. The four lead projects have live, scroll-driven 3D walkthroughs on the site; their key views are captured here.</p></div>
    <div class="toc">${workList}</div>
  </section>
  ${projectsHTML}

  <!-- ============ 04 SKILLS ============ -->
  <section class="section lead">
    <div class="sec-head"><div class="idx">04 — Skills</div><h2>Toolkit</h2></div>
    ${L.skillgroups}
  </section>

  <!-- ============ 05 RECOGNITION ============ -->
  <section class="section lead">
    <div class="sec-head"><div class="idx">05 — Recognition</div><h2>Honors</h2></div>
    ${L.honors}
    ${L.testscores}
  </section>

  <!-- ============ 06 COURSEWORK ============ -->
  <section class="section lead">
    <div class="sec-head"><div class="idx">06 — Coursework</div><h2>What I've studied</h2>
      <p class="tagline">ECE Honors coursework at UT Austin — embedded systems, computing, signals &amp; circuits, and the underlying math.</p></div>
    ${L.coursegroups}
    ${L.coursenote}
  </section>
</div>

<!-- ============ CLOSING ============ -->
<section class="closing">
  <h2>Let's build<br>something</h2>
  <a class="mail" href="mailto:adipu@utexas.edu">adipu@utexas.edu</a>
  <div class="links">
    <a href="https://aditya.pulipaka.com"><span>aditya.pulipaka.com ↗</span></a>
    <a href="https://www.linkedin.com/in/aditya-pulipaka">LinkedIn ↗</a>
    <a href="https://github.com/pulipakaa24">GitHub ↗</a>
  </div>
  <div class="sign">Aditya Pulipaka · Austin, TX · ${date}</div>
</section>

</body></html>`;
}

/* ---------- post-process: black margin strips + page numbers (over the black, no white bars) ---------- */
async function stampPdf(bytes){
  const doc = await PDFDocument.load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const m = MARGIN_IN * 72;                       // margin height in pt
  const black = rgb(0,0,0), gray = rgb(0.46,0.46,0.46);
  const pages = doc.getPages();
  const N = pages.length;
  pages.forEach((pg, i) => {
    const { width:W, height:H } = pg.getSize();
    // paint the (white) top + bottom margin strips black → seamless full-bleed
    pg.drawRectangle({ x:0, y:H-m, width:W, height:m+1, color:black });
    pg.drawRectangle({ x:0, y:-1,  width:W, height:m+1, color:black });
    // footer in the bottom strip: brand left, page number right (skip on the cover)
    if (i > 0){
      const size = 6.3, y = m/2 - size/2, pad = 0.66*72;
      const brand = 'ADITYA PULIPAKA  —  PORTFOLIO', num = `${i+1} / ${N}`;
      pg.drawText(brand, { x:pad, y, size, font, color:gray });
      pg.drawText(num,   { x: W - pad - font.widthOfTextAtSize(num, size), y, size, font, color:gray });
    }
  });
  await writeFile(OUT, await doc.save());
}

/* ---------- main ---------- */
async function main(){
  await mkdir(RENDER_DIR, { recursive:true });
  const server = await serve(ROOT, PORT);
  console.log(`· serving ${ROOT} at ${BASE}`);
  console.log(`· GL backend: ${SOFTWARE_GL ? 'SwiftShader (software, CI-parity)' : 'GPU (ANGLE/Metal)'}`);
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, args: CHROME_ARGS, headless: true, protocolTimeout: 120000 });
  try {
    console.log('· extracting landing page');
    const L = await extractLanding(browser);

    const projects = [];
    for (const proj of PROJECTS){
      console.log(`· extracting ${proj.slug} (${proj.kind})`);
      const data = proj.kind === 'viewer' ? await extractViewer(browser, proj) : await extractPage(browser, proj);
      let beats = null;
      if (proj.kind === 'viewer'){ console.log(`  · capturing 3D beats for ${proj.slug}`); beats = await captureBeats(browser, proj); }
      projects.push({ proj, data, beats });
    }

    console.log('· assembling dossier');
    let html = fixPaths(assemble(L, projects));
    console.log('· downscaling photos');
    html = await downscalePhotos(browser, html);
    await writeFile(EXPORT_HTML, html);

    console.log('· rendering PDF');
    const page = await browser.newPage();
    await page.goto(`${BASE}/export.html`, { waitUntil:'load', timeout:60000 });
    // bounded readiness wait (never hang the build on a slow/broken asset)
    await Promise.race([
      page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(i => i.complete ? 0 :
          new Promise(r => { i.onload = i.onerror = r; })));
      }),
      new Promise(r => setTimeout(r, 12000)),
    ]);
    const pdfBytes = await page.pdf({
      printBackground: true,
      format: 'Letter',
      // real top/bottom margins → breathing room on every page, decoupled from section spacing.
      // left/right 0 so the dark background bleeds to the sides; the white top/bottom margin
      // strips get painted black in post (Chrome won't paint them and won't bleed content in).
      margin: { top:`${MARGIN_IN}in`, right:'0', bottom:`${MARGIN_IN}in`, left:'0' },
    });
    await page.close();
    await stampPdf(pdfBytes);
    console.log(`✓ wrote ${path.relative(ROOT, OUT)}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
