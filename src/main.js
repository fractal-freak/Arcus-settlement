/**
 * Boot.
 *
 * Three.js. The 2D engine is kept under src/legacy-2d/ rather than deleted —
 * its palette and prop shapes are still the reference for what this world is
 * supposed to look like.
 *
 * What survived the swap untouched: terrain.js, iso.js and feed.js. Terrain was
 * always pure functions of a coordinate, never anything to do with how it got
 * drawn, which is the only reason a whole-engine pivot is an afternoon.
 */

import { Vector3 } from 'three';
import { Stage } from './three/stage.js';
import { Terrain3D } from './three/terrain3d.js';
import { Sky3D } from './three/sky3d.js';
import { People3D, setStrikeListener } from './three/people3d.js';
import { Town3D } from './three/town3d.js';
import { Landmarks3D } from './three/landmarks3d.js';
import { Folk3D } from './three/folk3d.js';
import { DigSite3D } from './three/digsite3d.js';
import { setPlacements, blocked } from './app/occupied.js';
import { Ambience } from './app/ambience.js';
import { SettlementStone3D } from './three/settlementStone3d.js';
import { Built3D } from './three/built3d.js';
import { Rig } from './three/controls.js';
import { Feed } from './data/feed.js';
import { Raycaster } from 'three';
import { smoothHeightAt } from './app/terrain.js';

const stage = new Stage(document.body);
const sky = new Sky3D(stage.scene);
const terrain = new Terrain3D(stage.scene);
const people = new People3D(stage.scene);
const town3d = new Town3D(stage.scene);
const landmarks = new Landmarks3D(stage.scene);
const folk = new Folk3D(stage.scene);
const digs = new DigSite3D(stage.scene);
const ambience = new Ambience();
// Every pick that hits the ground makes a noise, and how loud depends on how
// far away you are standing.
setStrikeListener((at) => ambience.clank(stage.camera.position.distanceTo(at)));
const settlementStone = new SettlementStone3D(stage.scene);
const built = new Built3D(stage.scene);
const rig = new Rig(stage.camera, stage.renderer.domElement);

rig.target.set(0, smoothHeightAt(0, 0), 0);
rig.setDistance(52);

/** How high above the ground the camera is never allowed to sink below. */
const CLEARANCE = 0.6;

/**
 * Keep the camera above the ground it is actually looking at — the real fix
 * for "do not let the camera pass below the surface," now that the surface
 * rolls. A fixed target.y works for exactly one flat height; this world no
 * longer has only one.
 *
 * Two parts. First, the orbit TARGET is kept resting on the ground beneath
 * wherever it is pointed, by moving target and camera together by the same
 * amount — that preserves distance, angle and azimuth, so it reads as the
 * ground gently rising and falling under you, not a camera correction.
 * Second, a hard floor on the camera's own height: near a steep or tall
 * slope, the orbit geometry alone can still put the camera below a hill that
 * is not directly under the target, which the first part does not reach.
 */
function clampAboveGround() {
  const groundAtTarget = smoothHeightAt(rig.target.x, rig.target.z);
  const dy = groundAtTarget - rig.target.y;
  if (dy !== 0) {
    rig.target.y += dy;
    stage.camera.position.y += dy;
  }
  const cam = stage.camera.position;
  const floor = smoothHeightAt(cam.x, cam.z) + CLEARANCE;
  if (cam.y < floor) cam.y = floor;
}

// ── Data ────────────────────────────────────────────────────────────────

/**
 * Held at a fixed daylight moment for now, on request — it is easier to see
 * what is being built without the world also going dark partway through.
 * The altitude below is deliberately LOW (real golden hour, not midday): the
 * cel-shaded pass wants long soft shadows and a warm sky, both of which only
 * happen with the sun near the horizon — stage.js's own lowness-driven
 * colour blend reads this same number, so lowering it warms the whole
 * atmosphere, not just the light. The real-sky system underneath is
 * untouched, still polling and still computing the true Pawtucket sun every
 * few seconds; only what gets HANDED to the renderer is overridden, right
 * here, nowhere else. Flip this back to false and daylight becomes real time
 * again with no other change needed.
 */
const FORCE_DAYLIGHT = true;

const hudStat = document.getElementById('stat');
const hudSky = document.getElementById('sky');
let light = 0;

const feed = new Feed((d) => {
  if (d.sky) {
    // A shallow copy with just the rendering-relevant fields pinned — the
    // HUD line below still reads d.sky directly, so the clock and moon phase
    // it shows stay real even while the lit sky itself is held still.
    const renderSky = FORCE_DAYLIGHT
      ? { ...d.sky, light: 1, sun: { ...d.sky.sun, alt: 15, az: 178 } }
      : d.sky;
    stage.applySky(renderSky);
    sky.applySky(renderSky);
    light = renderSky.light;
    const when = new Date(d.now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    hudSky.textContent =
      `${when} · ${d.sky.moonName} · ${Math.round(d.sky.moon.illum * 100)}% lit · ${d.place}` +
      (FORCE_DAYLIGHT ? ' · daylight held for building' : '');
  }
  if (d.town && d.counts) {
    hudStat.textContent =
      `${d.town.buildings.length} buildings (${d.town.toward}/${d.town.needed} toward the next) · ` +
      `${d.town.folk} living here · ${d.counts.working} working · ${d.counts.waiting} waiting on you`;
    town3d.sync(d.town);
    landmarks.sync(d.town);
    folk.sync(d.town);
  }
  if (d.life) {
    syncChronicle(d.life);
    // Everything the citizens have finished, standing where they put it.
    built.sync(d.life.placements);
    // And the same list again as ground nobody may stand in — sessions and
    // villagers alike, through the one shared test in app/occupied.js.
    setPlacements(d.life.placements);
  }
  if (d.people) {
    people.sync(d.people);
    // Once per feed tick, not once per frame: this writes DOM, and the list
    // only changes when the feed does.
    syncCrew();
  }
  if (d.founding) settlementStone.sync(d.founding);
});
feed.start();

// ── People overlay ─────────────────────────────────────────────────────
//
// The figures themselves are real 3D geometry (people3d.js); clicking and
// hovering them is a plain DOM layer on top of the canvas, positioned by
// projecting each figure's world position through the camera every frame.
// The same technique arcus-world-page.mjs already uses for the 2D page —
// simpler and more reliable than raycasting into a scene whose camera
// OrbitControls already owns pointer dragging for panning.

const peopleLayer = document.getElementById('people');
const card = document.getElementById('card');
const crew = document.getElementById('crew');
const chron = document.getElementById('chron');
const pills = new Map(); // session id -> <a>
const crewRows = new Map(); // session id -> <button>
let hoveredId = null;
let followId = null;
const tmpProj = new Vector3();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function openSession(id) {
  fetch('/world/open?session=' + encodeURIComponent(id)).catch(() => {
    location.href = 'claude://code/continue?session=' + id;
  });
}

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = m / 60;
  if (h < 24) return `${h < 2 ? '1 hour' : Math.round(h) + ' hours'} ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** 809307 -> "809k". Nobody reads the last three digits of a context window. */
function tokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function showCard(p, x, y) {
  const doing = p.state === 'working' ? 'Working right now'
    : p.state === 'waiting' ? 'Open, waiting on you' : 'Resting';
  const bits = [];
  if (p.who) bits.push(`<span class="who">${esc(p.who.name)}</span> · ${esc(p.who.temper)}`);
  bits.push(`<b>${doing}</b>`);
  if (p.doing) {
    bits.push(`<span class="doing">${esc(p.doing.verb)}${p.doing.detail ? ' — ' + esc(p.doing.detail) : ''}</span>`);
  }
  const b = p.built || {};
  bits.push(b.commits || b.files
    ? `Built: <b>${b.commits}</b> commit${b.commits === 1 ? '' : 's'}, <b>${b.files}</b> file${b.files === 1 ? '' : 's'} changed`
    : 'Nothing committed on this branch yet');
  if (p.tokens && p.tokens.context) {
    // What the session is CARRYING, not a running total. See the hub's
    // contextTokensOf: almost all of a turn's input is the same context read
    // back from cache, so summing turns would report billions.
    bits.push(`Context: <b>${tokens(p.tokens.context)}</b> tokens`);
  }
  if (p.branch) bits.push(esc(p.branch));
  bits.push(`${p.turns} turn${p.turns === 1 ? '' : 's'} · ${ago(p.idleMs)}`);
  card.innerHTML =
    `<div class="t">${esc(p.title || p.worktree || 'Untitled session')}</div>` +
    `<div class="m">${bits.join('<br>')}</div>` +
    `<div class="go">Click to open this chat</div>`;
  card.classList.add('show');
  const r = card.getBoundingClientRect();
  let top = y - r.height - 18;
  if (top < 70) top = y + 24;
  top = Math.min(top, Math.max(70, innerHeight - r.height - 8));
  card.style.left = `${Math.max(8, Math.min(x - r.width / 2, innerWidth - r.width - 8))}px`;
  card.style.top = `${top}px`;
}
function hideCard() { card.classList.remove('show'); }

/**
 * Fly the camera to one session and hold there.
 *
 * The anchors carry each figure's real world position, so this is a straight
 * look() at the ground under it rather than anything clever. `followId` is
 * remembered so the row stays lit and so a later feed tick can keep the
 * camera on a figure that has since wandered.
 */
function goTo(id) {
  const a = people.anchors().find((p) => p.id === id);
  if (!a) return;
  followId = id;
  // The same three calls the debug hook's look() makes. There is no
  // rig.look() — reaching for one is what made the first version of this
  // throw on every click and quietly do nothing at all.
  rig.target.set(a.position.x, smoothHeightAt(a.position.x, a.position.z), a.position.z);
  rig.autoTilt = true;
  rig.setDistance(18);
  syncCrew();
}

/**
 * The crew panel: every session, always on screen, sorted the way the feed
 * already sorts them — working first, then waiting on Kevin, then resting.
 *
 * This exists because a session could previously only be found by spotting
 * its pill somewhere in the landscape, which meant knowing where to look and
 * having the camera pointed that way. A list cannot be behind you.
 */
function syncCrew() {
  const list = people.anchors()
    .map((a) => a.data)
    .filter(Boolean);
  const rank = { working: 0, waiting: 1, resting: 2 };
  list.sort((a, b) => (rank[a.state] - rank[b.state]) || (a.idleMs - b.idleMs));

  if (!crew.firstChild) {
    // The header is the toggle. Kept in localStorage so a closed board stays
    // closed across reloads — a panel that reopens itself every refresh is
    // one you end up closing every refresh.
    const h = document.createElement('button');
    h.type = 'button';
    h.id = 'crewToggle';
    h.innerHTML = '<span class="arrow">▾</span><span>The settlement</span><span class="count"></span>';
    h.addEventListener('click', () => {
      const now = !crew.classList.contains('shut');
      crew.classList.toggle('shut', now);
      try { localStorage.setItem('crewShut', now ? '1' : '0'); } catch { /* private window */ }
    });
    crew.appendChild(h);
    const body = document.createElement('div');
    body.id = 'crewBody';
    crew.appendChild(body);
    try { if (localStorage.getItem('crewShut') === '1') crew.classList.add('shut'); } catch { /* private window */ }
  }
  const body = crew.querySelector('#crewBody');
  const atWork = list.filter((p) => p.state !== 'resting').length;
  crew.querySelector('.count').textContent = atWork ? `${atWork} at work` : `${list.length} here`;

  const seen = new Set();
  for (const p of list) {
    seen.add(p.id);
    let row = crewRows.get(p.id);
    if (!row) {
      row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      row.innerHTML = '<span class="n"><i class="dot"></i><span class="nm"></span></span>'
        + '<div class="job"></div><div class="sub"></div>';
      row.addEventListener('click', () => goTo(p.id));
      row.addEventListener('dblclick', () => openSession(p.id));
      row.addEventListener('pointerenter', () => { hoveredId = p.id; people.setHover(p.id); });
      row.addEventListener('pointerleave', () => {
        if (hoveredId === p.id) { hoveredId = null; people.setHover(null); hideCard(); }
      });
      crewRows.set(p.id, row);
    }
    body.appendChild(row); // re-appending also re-orders
    row.className = `row ${p.state}${followId === p.id ? ' here' : ''}`;
    row.title = `${p.who ? p.who.name + ' — ' : ''}${p.title || p.worktree || 'session'}\nClick to fly there, double-click to open the chat`;
    // The person first, the work second. They are citizens of this place who
    // happen to be working on something, not tasks that happen to have a face.
    const nm = row.querySelector('.nm');
    const who = p.who ? p.who.name : (p.title || p.worktree || 'session');
    if (nm.textContent !== who) nm.textContent = who;
    const job = row.querySelector('.job');
    const title = p.title || p.worktree || 'session';
    if (job.textContent !== title) job.textContent = title;
    const sub = row.querySelector('.sub');
    const line = [
      p.state === 'working' ? 'working' : p.state === 'waiting' ? 'waiting on you' : ago(p.idleMs),
      p.tokens && p.tokens.context ? `${tokens(p.tokens.context)} ctx` : null,
    ].filter(Boolean).join(' · ');
    if (sub.textContent !== line) sub.textContent = line;
  }
  for (const [id, row] of crewRows) {
    if (!seen.has(id)) { row.remove(); crewRows.delete(id); }
  }
}

/**
 * Which session labels are behind something solid.
 *
 * The pills are DOM, drawn over the canvas, so they know nothing about the
 * world in front of them — a session on the far side of the settlement had
 * its label sitting brightly on top of the building hiding it, which read as
 * a bug because it is one. A ray from the camera to each figure's head, and
 * anything solid closer than the figure means the label is out of sight.
 *
 * Throttled: the answer only changes when the camera or a figure moves, and
 * a ray through the terrain's chunk meshes is the most expensive thing this
 * overlay does. Every fourth frame is far faster than the eye.
 */
const ray = new Raycaster();
const tmpDir = new Vector3();
const occluded = new Set();
let occludeTick = 0;

function updateOcclusion(anchors) {
  if (occludeTick++ % 4 !== 0) return;
  // Buildings, landmarks and the stone — plus the land itself, so a figure
  // over the brow of a hill is hidden too.
  const solid = [town3d.group, ...terrain.chunks.values()];
  const from = stage.camera.position;
  for (const a of anchors) {
    tmpDir.subVectors(a.position, from);
    const reach = tmpDir.length();
    tmpDir.divideScalar(reach || 1);
    ray.set(from, tmpDir);
    ray.far = reach - 0.45; // stop just short, or the figure's own ground hits
    const hit = ray.intersectObjects(solid, true);
    if (hit.length) occluded.add(a.id); else occluded.delete(a.id);
  }
}

/**
 * The chronicle: what the settlement got up to while nobody was looking.
 *
 * Rebuilt whole on each feed tick rather than reconciled row by row. It is at
 * most sixty entries and it only changes when the hub's simulation has
 * actually advanced, so the simpler code is the right code here — unlike the
 * crew board, whose rows carry click handlers worth keeping alive.
 */
function syncChronicle(L) {
  if (!L) return;
  if (!chron.firstChild) {
    const h = document.createElement('button');
    h.type = 'button';
    h.id = 'chronToggle';
    h.innerHTML = '<span class="arrow">▾</span><span>Chronicle</span><span class="when"></span>';
    h.addEventListener('click', () => {
      const now = !chron.classList.contains('shut');
      chron.classList.toggle('shut', now);
      try { localStorage.setItem('chronShut', now ? '1' : '0'); } catch { /* private window */ }
    });
    chron.appendChild(h);
    const body = document.createElement('div');
    body.id = 'chronBody';
    chron.appendChild(body);
    try { if (localStorage.getItem('chronShut') === '1') chron.classList.add('shut'); } catch { /* private window */ }
  }
  chron.querySelector('.when').textContent = L.said || '';
  const body = chron.querySelector('#chronBody');
  const entries = L.chronicle || [];
  if (!entries.length) {
    body.innerHTML = '<div class="empty">Nothing has happened here yet. Come back in a while.</div>';
    return;
  }
  const html = standingHtml(L) + entries.slice(0, 40).map((e) => {
    // A line out of the ground gets the line itself, and who wrote it. These
    // are real quotations from real books (see arcus-finds.mjs, where every
    // one was checked back against the scan it came from), so the attribution
    // is not decoration — it is the thing that makes the quote worth anything.
    const dug = e.quote
      ? `<blockquote class="q">${esc(e.quote)}<cite>${esc(e.source || '')}</cite></blockquote>`
      : '';
    return `<div class="e ${esc(e.kind)}"><div class="d">${esc(e.at)}</div>`
      + `<div class="t">${esc(e.text)}</div>${dug}</div>`;
  }).join('');
  const sig = `${entries[0].tick}:${entries.length}:${L.quality?.overall ?? ''}`;
  if (body.dataset.sig !== sig) {
    body.innerHTML = html;
    body.dataset.sig = sig;
  }
}

/**
 * How good this place has got, as the settlement itself scores it.
 *
 * The citizens' whole job is to make this look like somewhere expensive was
 * spent, and they decide what to do next by grading themselves on seven things
 * — see arcus-quality.mjs, which holds the rubric and the reasons. Showing the
 * marks is what turns that from a hidden mechanic into something worth coming
 * back to check: the bars move overnight, and the one they are worst at is the
 * one they are all working on.
 */
function standingHtml(L) {
  const q = L.quality;
  if (!q || !Array.isArray(L.dimensions)) return '';
  const rows = L.dimensions.map((d) => {
    const v = q.scores[d.key] ?? 0;
    const on = v >= 0.999;
    return `<div class="sd${d.key === q.weakest ? ' now' : ''}${on ? ' full' : ''}" title="${esc(d.why)}">`
      + `<span class="n">${esc(d.name)}</span>`
      + `<span class="bar"><i style="width:${Math.round(v * 100)}%"></i></span></div>`;
  }).join('');
  const ask = (L.proposals || []).slice(-1)[0];
  return '<div class="standing">'
    + `<div class="sh"><span>The work</span><b>${(q.overall * 100).toFixed(0)}</b></div>${rows}`
    + (ask ? `<div class="ask">${esc(ask.text)}</div>` : '')
    + '</div>';
}

function syncPeopleOverlay() {
  const anchors = people.anchors();
  updateOcclusion(anchors);
  const seen = new Set();
  for (const a of anchors) {
    seen.add(a.id);
    let el = pills.get(a.id);
    if (!el) {
      el = document.createElement('a');
      el.className = 'who';
      el.href = `claude://code/continue?session=${a.id}`;
      el.innerHTML = '<span class="tag"></span>';
      el.addEventListener('click', (e) => { e.preventDefault(); openSession(a.id); });
      el.addEventListener('pointerenter', () => { hoveredId = a.id; people.setHover(a.id); });
      el.addEventListener('focus', () => { hoveredId = a.id; people.setHover(a.id); });
      el.addEventListener('pointerleave', () => {
        if (hoveredId === a.id) { hoveredId = null; people.setHover(null); hideCard(); }
      });
      el.addEventListener('blur', () => {
        if (hoveredId === a.id) { hoveredId = null; people.setHover(null); hideCard(); }
      });
      peopleLayer.appendChild(el);
      pills.set(a.id, el);
    }
    tmpProj.copy(a.position).project(stage.camera);
    const behind = tmpProj.z > 1;
    // Out of sight is out of sight, whether that is behind the camera or
    // behind a tavern.
    const hidden = behind || occluded.has(a.id);
    el.style.display = hidden ? 'none' : '';
    if (hidden) continue;
    const sx = (tmpProj.x * 0.5 + 0.5) * innerWidth;
    const sy = (-tmpProj.y * 0.5 + 0.5) * innerHeight;
    el.style.transform = `translate(${sx}px, ${sy}px)`;
    // Real cluttering at 36 real sessions, verified live: a wider spawn
    // radius (people3d.js) thins them out in world space, but two labels
    // can still land close together on screen from some angles. Distance
    // fade is what actually cuts through THAT — nearby sessions read at
    // full clarity, far ones recede instead of competing for the same
    // pixels, and a hovered pill always snaps back to full regardless.
    const dist = stage.camera.position.distanceTo(a.position);
    const t = Math.min(1, Math.max(0, (dist - 22) / 55));
    const focused = hoveredId === a.id;
    el.style.setProperty('--fade', focused ? '1' : (1 - t * 0.7).toFixed(2));
    el.style.setProperty('--pscale', focused ? '1' : (1 - t * 0.35).toFixed(2));
    const short = a.data.title || a.data.worktree || 'session';
    const trimmed = short.length > 22 ? `${short.slice(0, 21).trimEnd()}…` : short;
    const tag = el.querySelector('.tag');
    if (tag.textContent !== trimmed) tag.textContent = trimmed;
    el.classList.toggle('on', !!a.data.unread);
    el.classList.toggle('busy', a.data.state === 'working');
    el.classList.toggle('waiting', a.data.state === 'waiting');
    if (hoveredId === a.id) showCard(a.data, sx, sy);
  }
  for (const [id, el] of pills) {
    if (!seen.has(id)) { el.remove(); pills.delete(id); }
  }
}

// ── Frame ───────────────────────────────────────────────────────────────

const tmp = new Vector3();
let elapsed = 0;

function frame(dtMs) {
  elapsed += dtMs;
  rig.update(dtMs);
  clampAboveGround();
  people.tick(dtMs);
  folk.tick(elapsed / 1000);
  ambience.update(light, stage.camera, rig.target, elapsed / 1000);

  const t = rig.target;
  // How much DETAILED land (cliffs, trees, water) to keep loaded. Zoomed out
  // used to cap at a flat 88 tiles no matter how far back the camera pulled,
  // which is a wall you can see the top of, not a horizon — the streamed
  // chunks stopped well short of where fog would have hidden the join. Raised
  // it, and past this radius Terrain3D's own floor plane carries the ground
  // on regardless, so there is no longer an edge to see at all, at any zoom.
  const radius = Math.min(150, 32 + rig.distance * 0.62);
  const cam = stage.camera.position;
  // Milliseconds, not a chunk count — leaves headroom in a 16.7ms frame for
  // the render call after it. Measured that call alone at 9.4ms at a typical
  // zoom, which is MORE than the 8ms this used to budget for building —
  // guaranteeing an occasional overrun the moment a frame's building actually
  // used its full allowance, exactly the stutter reported while panning into
  // fresh ground continuously. 5ms leaves real room for render plus the
  // camera/sky updates around it, checked against a live sustained-pan test,
  // not assumed. See the long comment on Terrain3D.update for the rest.
  terrain.update(t.x, t.z, radius, 5, cam.x, cam.z);
  terrain.updateFades(performance.now());
  // One shared clock for every water and grass surface in the world, fed
  // from the same elapsed-time accumulator the frame loop already keeps —
  // water and grass wave together instead of each timing off Date.now().
  terrain.updateShaders(elapsed, stage.sunDir, stage.sun.color);

  sky.update(dtMs, t);
  stage.followShadow(tmp.set(t.x, t.y, t.z), rig.distance);
  stage.render();
  // After render(), not before: projecting a figure's position needs the
  // camera's matrixWorld for THIS frame, which stage.render() is what
  // actually brings current.
  syncPeopleOverlay();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(64, now - last);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/**
 * Sound, remembered.
 *
 * `resume()` has to happen inside a real gesture, so a page reloaded with
 * sound already on still cannot start it by itself — it arms instead, and the
 * next click anywhere in the world turns it on. That is one click rather than
 * hunting for the button again.
 */
const soundBtn = document.getElementById('sound');
let soundWanted = false;
try { soundWanted = localStorage.getItem('sound') === '1'; } catch { /* private window */ }

function showSound(on) {
  soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  try { localStorage.setItem('sound', on ? '1' : '0'); } catch { /* private window */ }
}
soundBtn.addEventListener('click', () => { showSound(ambience.toggle()); });
if (soundWanted) {
  const arm = () => { showSound(ambience.resume()); removeEventListener('pointerdown', arm); };
  addEventListener('pointerdown', arm);
}

addEventListener('keydown', (e) => {
  if (e.key === 'Home') {
    rig.target.set(0, smoothHeightAt(0, 0), 0);
    rig.autoTilt = true;
    rig.setDistance(52);
  }
});

/**
 * A test hook. A hidden browser pane freezes animation frames, so nothing is
 * ever built and a headless check would pass on an empty world. step() runs
 * exactly what the loop runs, not a parallel path written to pass.
 */
window.__world = {
  stage, sky, terrain, people, town3d, built, landmarks, folk, digs, ambience, settlementStone, rig, feed,
  // Exposed so a check can ask the world the same question the world asked
  // itself when it put somebody somewhere — see the note on step().
  blocked,
  step(frames = 1, ms = 16) {
    for (let i = 0; i < frames; i++) frame(ms);
    return this.stats();
  },
  look(distance, targetX = 0, targetZ = 0) {
    rig.target.set(targetX, smoothHeightAt(targetX, targetZ), targetZ);
    rig.autoTilt = true;
    rig.setDistance(distance);
  },
  stats: () => ({
    chunks: terrain.chunks.size,
    built: terrain.built,
    distance: Math.round(rig.distance),
    polarDeg: Math.round(Math.acos(
      (stage.camera.position.y - rig.target.y) / rig.distance,
    ) * 180 / Math.PI),
    camY: Math.round(stage.camera.position.y),
    drawCalls: stage.renderer.info.render.calls,
    triangles: stage.renderer.info.render.triangles,
    light: Number(light.toFixed(2)),
  }),
};
