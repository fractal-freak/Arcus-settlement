import { registerPanel, setPanel } from './app/panels.js';
import { mountInterface, icon } from './app/icons.js';
import './app/interface.css';
import { PalaceLighting } from './three/palaceLighting.js';
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

import { Vector3, DefaultLoadingManager, Cache } from 'three';
import { Stage } from './three/stage.js';
import { visibilityMeshes, isOccluded } from './three/visibility.js';
import { FramePerformance } from './three/performance.js';
import { Terrain3D } from './three/terrain3d.js';
import { Sky3D } from './three/sky3d.js';
import { People3D, setStrikeListener } from './three/people3d.js';
import { Enchantment3D } from './three/enchantment3d.js';
import { Realm3D } from './three/realm3d.js';
import { REALM, REALM_BUILDINGS } from './app/realm.js';
import { Landmarks3D } from './three/landmarks3d.js';
import { WorkHud } from './app/workHud.js';
import { Folk3D } from './three/folk3d.js';
import { DigSite3D } from './three/digsite3d.js';
import { setPlacements, blocked, walkingHeightAt } from './app/occupied.js';
import { Ambience } from './app/ambience.js';
import { mountSoundControls } from './app/soundControls.js';
import { SettlementStone3D } from './three/settlementStone3d.js';
import { Built3D } from './three/built3d.js';
import { Walk3D } from './three/walk3d.js';
import { Rig } from './three/controls.js';
import { Feed } from './data/feed.js';
import { Raycaster } from 'three';
import { smoothHeightAt } from './app/terrain.js';
import { excavationCrew } from './app/digs.js';
import { HERMES } from './app/hermes.js';

// Reuse atlas images shared by the kit's separate glTF files.
Cache.enabled = true;

const loadingStatus = document.getElementById('world-loading-status');
const startup = { assetsPending: false, assetErrors: 0, complete: false,
  startedAt: performance.now(), readyAt: null, firstFrameAt: null };
DefaultLoadingManager.onStart = () => { startup.assetsPending = true; };
DefaultLoadingManager.onLoad = () => { startup.assetsPending = false; startup.assetsReadyAt = performance.now(); };
DefaultLoadingManager.onError = () => { startup.assetErrors++; };

const stage = new Stage(document.body);
const framePerformance = new FramePerformance(stage.renderer);
framePerformance.attach(stage);
framePerformance.context = () => ({ startupMs: Math.round((startup.readyAt ?? performance.now()) - startup.startedAt), firstFrameMs: Math.round(startup.firstFrameAt - startup.startedAt), ready: startup.complete, feedSource: feed.source, startup: Object.fromEntries(['assetsReadyAt','terrainReadyAt','feedReadyAt','modelsReadyAt'].map(k=>[k,Math.round((startup[k]??performance.now())-startup.startedAt)])), chunks: terrain.chunks.size, pending: terrain.pendingVisible, calls: stage.renderer.info.render.calls, triangles: stage.renderer.info.render.triangles });
const sky = new Sky3D(stage.scene);
const terrain = new Terrain3D(stage.scene);
const people = new People3D(stage.scene);
const town3d = new Realm3D(stage.scene);
const buildingOccluders = visibilityMeshes(town3d.group);
const enchantment = new Enchantment3D(stage.scene);
const palaceLighting = new PalaceLighting(stage);
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

rig.target.set(-14, smoothHeightAt(-14, -8)+2, -8);
rig.setDistance(86);
const walk = new Walk3D(stage.camera, rig, stage.renderer.domElement, {
  scene:stage.scene,folk,occluders:[...buildingOccluders],onFootstep:(running,landing)=>ambience.footstep(running,landing),
});

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
  const groundAtTarget = smoothHeightAt(rig.target.x, rig.target.z) + Math.min(8,Math.max(0,(rig.distance-30)*.16));
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

const workHud = new WorkHud(folk, f => {
  if(walk.active)walk.exit();
  const at=f.char.root.position;
  rig.target.set(at.x,walkingHeightAt(at.x,at.z),at.z);
  rig.autoTilt=false;rig.setDistance(28,.7);
});

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
      `${REALM.name} · ${REALM_BUILDINGS.length} buildings · ` +
      `${d.town.folk} citizens · ${excavationCrew(d.people).length} archaeologists excavating`;
    landmarks.sync({ ...d.town, milestones: (d.town.milestones ?? []).filter(m => m.key === 'well' || m.key === 'bridge') });
    folk.sync({ ...d.town, residents: d.life?.citizens, chronicle: d.life?.chronicle, placements: d.life?.placements });
  }
  if (d.life) {
    workHud.sync(d.life);
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
  if (d.founding) {
    settlementStone.sync(d.founding);
    const stone=settlementStone.group?.getObjectByName('Settlement Stone — carved granite');
    if(stone&&!walk.occluders.includes(stone))walk.occluders.push(stone);
  }
});

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
  const site = people.figures.get(p.id)?.site;
  if (site) bits.push(`<b>Excavating at ${esc(site.where)}</b>`);
  bits.push(`Session: ${doing}`);
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
  walk.exit();
  followId = id;
  // The same three calls the debug hook's look() makes. There is no
  // rig.look() — reaching for one is what made the first version of this
  // throw on every click and quietly do nothing at all.
  rig.target.set(a.position.x, smoothHeightAt(a.position.x, a.position.z), a.position.z);
  rig.autoTilt = false;
  rig.setDistance(12, .65);
  syncCrew();
}

/** The optional local crew uses the same drawer lifecycle as the journal. */
function mountBoard(board, { toggleId, bodyId, header, openLabel }) {
  const panel=document.createElement('section');panel.id='crew-panel';panel.hidden=true;panel.setAttribute('aria-label','Dig crew');
  const h=document.createElement('header');
  const title=document.createElement('div');title.innerHTML=header;title.id=toggleId;
  const close=document.createElement('button');close.type='button';close.setAttribute('aria-label','Close dig crew');close.innerHTML=icon('close');
  h.append(title,close);
  const body=document.createElement('div');body.id=bodyId;panel.append(h,body);
  const pull=document.createElement('button');pull.type='button';pull.id='crew-menu';pull.className='pull';pull.innerHTML=icon('person')+'<span>Crew</span>';
  pull.setAttribute('aria-label',openLabel);pull.setAttribute('aria-controls',panel.id);pull.setAttribute('aria-expanded','false');
  registerPanel(panel,pull);
  pull.onclick=()=>setPanel(panel,panel.hidden);close.onclick=()=>setPanel(panel,false);
  board.append(panel,pull);document.getElementById('world-tools')?.append(pull);
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
  crew.hidden = !list.length;
  const rank = { working: 0, waiting: 1, resting: 2 };
  list.sort((a, b) => (rank[a.state] - rank[b.state]) || (a.idleMs - b.idleMs));

  if (!crew.firstChild) {
    // The header is the toggle. Kept in localStorage so a closed board stays
    // closed across reloads — a panel that reopens itself every refresh is
    // one you end up closing every refresh.
    mountBoard(crew, {
      toggleId: 'crewToggle',
      bodyId: 'crewBody',
      header: '<span class="chev" aria-hidden="true"></span><span>Dig crew</span><span class="count"></span>',
      openLabel: 'Show the dig crew',
    });
  }
  const crewMenu=document.getElementById('crew-menu');
  if(crewMenu)crewMenu.hidden=!list.length;
  const body = crew.querySelector('#crewBody');
  crew.querySelector('.count').textContent = `${list.length} excavating`;

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
      'excavating',
      p.state === 'working' ? 'session working' : p.state === 'waiting' ? 'session waiting on you' : 'session resting',
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
let occludeCursor = 0;
let lastOcclusionAt = 0;

function updateOcclusion(anchors) {
  // Labels belong behind solid ground/buildings. Raycasting every blade and every
  // tree instance for every label caused a ~80ms stall once every four frames.
  // Land is the first mesh in each terrain chunk; foliage need not hide a label.
  if (!anchors.length || performance.now() - lastOcclusionAt < 24) return;
  lastOcclusionAt = performance.now();
  const a = anchors[occludeCursor++ % anchors.length];
  tmpProj.copy(a.position).project(stage.camera);
  if (tmpProj.z > 1 || Math.abs(tmpProj.x) > 1.1 || Math.abs(tmpProj.y) > 1.1) return;
  const solid = [...buildingOccluders];
  for (const chunk of terrain.chunks.values()) solid.push(chunk.children[0]);
  const from = stage.camera.position;
  tmpDir.subVectors(a.position, from);
  const reach = tmpDir.length();
  tmpDir.divideScalar(reach || 1);
  ray.set(from, tmpDir);
  ray.far = Math.max(0, reach - 0.45);
  if (isOccluded(ray, solid)) occluded.add(a.id); else occluded.delete(a.id);
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
const viewOrigin = new Vector3();
const viewDir = new Vector3();
const VIEW_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
let elapsed = 0;

/**
 * How far the current view actually reaches across the ground.
 *
 * Streaming a fixed ring around the orbit target left the corners of a low
 * camera looking at empty floor — the land was there, it just had not been
 * asked for yet, and a pan would pop it in. The four screen corners, plus
 * the edge midpoints, tell us how far to keep detailed chunks, and the
 * coarse country mesh covers whatever is still past that.
 */
function visibleGroundRadius(camera, target) {
  camera.updateMatrixWorld();
  let maxR = 0;
  for (const [nx, ny] of VIEW_CORNERS) {
    viewOrigin.set(nx, ny, -1).unproject(camera);
    viewDir.set(nx, ny, 1).unproject(camera).sub(viewOrigin);
    if (viewDir.y >= -1e-5) continue;
    const tHit = (target.y - viewOrigin.y) / viewDir.y;
    if (tHit < 0) continue;
    const tUse = Math.min(tHit, 1);
    const gx = viewOrigin.x + viewDir.x * tUse;
    const gz = viewOrigin.z + viewDir.z * tUse;
    maxR = Math.max(maxR, Math.min(240, Math.hypot(gx - target.x, gz - target.z)));
  }
  return maxR;
}

function frame(dtMs) {
  const frameStart = performance.now();
  elapsed += dtMs;
  if (walk.active) walk.tick(dtMs);
  else { rig.update(dtMs); clampAboveGround(); }
  people.tick(dtMs);
  folk.tick(elapsed / 1000, walk.active ? walk.position : null);
  workHud.tick(elapsed);
  enchantment.tick(elapsed / 1000);
  palaceLighting.tick(elapsed / 1000);
  landmarks.tick(elapsed / 1000);
  settlementStone.tick(elapsed / 1000);
  ambience.update(light, stage.camera, rig.target);

  const animationEnd = performance.now();
  const t = rig.target;
  // Detailed land (cliffs, trees, water) follows the VIEW, not a guess about
  // zoom. Past that, Terrain3D's coarse country mesh keeps the same hills and
  // river going, so the horizon is never a flat empty disc.
  // Update the camera even before the first render, so the requested area is
  // based on this view rather than a stale projection from startup.
  stage.camera.updateMatrixWorld();
  const seen = visibleGroundRadius(stage.camera, t);
  const fullRadius = Math.min(160, Math.max(40 + rig.distance * 0.7, seen * 0.9));
  // Start with the town under the camera's target (49 chunks), not the huge
  // rectangle spanning the camera, target and horizon. The coarse country
  // already covers the background; detail beyond town streams after entry.
  const radius = startup.complete ? fullRadius : Math.min(48, fullRadius);
  const cam = stage.camera.position;
  terrain.update(t.x, t.z, radius, 3, startup.complete ? cam.x : t.x, startup.complete ? cam.z : t.z, stage.camera);
  terrain.updateFades(performance.now());
  // One shared clock for every water and grass surface in the world, fed
  // from the same elapsed-time accumulator the frame loop already keeps —
  // water and grass wave together instead of each timing off Date.now().
  terrain.updateShaders(elapsed, stage.sunDir, stage.sun.color, stage.camera.position, stage.scene.fog.color);

  const terrainEnd = performance.now();
  sky.update(dtMs, t);
  stage.followShadow(tmp.set(t.x, t.y, t.z), rig.distance);
  stage.prepareDetail();
  const renderStart = performance.now();
  stage.render(elapsed);
  const renderEnd = performance.now();
  startup.firstFrameAt ??= performance.now();
  updateStartup();
  // After render(), not before: projecting a figure's position needs the
  // camera's matrixWorld for THIS frame, which stage.render() is what
  // actually brings current.
  syncPeopleOverlay();
  return { cpu: performance.now()-frameStart, animation: animationEnd-frameStart,
    terrain: terrainEnd-animationEnd, render: renderEnd-renderStart,
    environment: renderStart-terrainEnd, overlay: performance.now()-renderEnd };
}

function updateStartup() {
  if (startup.complete) return;
  const nearbyReady = terrain.pendingVisible === 0;
  if (nearbyReady) startup.terrainReadyAt ??= performance.now();
  if (feed.data) startup.feedReadyAt ??= performance.now();
  if (built.ready && folk.ready && people.ready && landmarks.ready) startup.modelsReadyAt ??= performance.now();
  const assetsReady = feed.data && built.ready && folk.ready && people.ready && landmarks.ready && !startup.assetsPending;
  if (nearbyReady && assetsReady) {
    startup.complete = true;
    startup.readyAt = performance.now();
    feed.beginLive();
    loadingStatus?.remove();
    return;
  }
  // This is a small status label, never an overlay or a gate on interaction.
  // A failed download also cannot leave a blocking loading screen behind.
  if (performance.now() - startup.startedAt > 10000 || startup.assetErrors) {
    loadingStatus?.remove();
  } else if (loadingStatus) {
    const message = nearbyReady ? 'Preparing buildings and citizens…' : 'Preparing the nearby valley…';
    if (loadingStatus.textContent !== message) loadingStatus.textContent = message;
  }
}

let last = performance.now();
let animationFrame = 0;
function loop(now) {
  animationFrame = 0;
  if (document.hidden) return;
  const interval = Math.max(0, now - last);
  const dt = Math.min(32, interval);
  last = now;
  const timing = frame(dt);
  framePerformance.record({ interval, ...timing });
  animationFrame = requestAnimationFrame(loop);
}
function resume() {
  if (document.hidden || animationFrame) return;
  last = performance.now();
  animationFrame = requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(animationFrame); animationFrame = 0; }
  else resume();
});
resume();

mountSoundControls(ambience);

function goToStone() {
  walk.exit();
  rig.target.set(0, smoothHeightAt(0, 0), 0);
  rig.autoTilt = true;
  rig.setDistance(52);
}

addEventListener('keydown', (e) => {
  if (e.key === 'Home' && !walk.active && !e.target?.matches?.('input,textarea,select,[contenteditable=true]')) goToStone();
});

document.getElementById('camHome').addEventListener('click', goToStone);
document.getElementById('camIn').addEventListener('click', () => rig.nudgeDistance(0.78));
document.getElementById('camOut').addEventListener('click', () => rig.nudgeDistance(1.28));
document.getElementById('camLeft').addEventListener('click', () => rig.orbit(-0.28));
document.getElementById('camRight').addEventListener('click', () => rig.orbit(0.28));

let lastDig = null;
document.getElementById('camDigs').addEventListener('click', () => {
  const occupiedSites = new Map();
  for (const f of people.figures.values()) {
    if (f.group.visible && f.site) occupiedSites.set(f.site.id, f.site);
  }
  const sites = [...occupiedSites.values()].sort((a, b) => a.d - b.d);
  // On the public world there are no private session figures. The authored
  // excavation remains a useful destination there.
  const site = sites.length ? sites[(sites.findIndex(s => s.id === lastDig) + 1) % sites.length] : null;
  lastDig = site?.id ?? null;
  const at = site?.center ?? HERMES;
  walk.exit();
  followId = null;
  rig.target.set(at.x, smoothHeightAt(at.x, at.z), at.z);
  // Look down into the cut, above the camp tents and trench walls.
  rig.autoTilt = false;
  rig.setDistance(site ? 18 : 38, .6);
  syncCrew();
});

/**
 * A test hook. A hidden browser pane freezes animation frames, so nothing is
 * ever built and a headless check would pass on an empty world. step() runs
 * exactly what the loop runs, not a parallel path written to pass.
 */
window.__world = {
  framePerformance, startup, stage, sky, terrain, people, town3d, built, landmarks, folk, digs, ambience, settlementStone, rig, feed, walk, enchantment,
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
    pendingTerrain: terrain._queue?.length ?? 0,
    pendingVisible: terrain.pendingVisible ?? null,
    terrainWorker: !!terrain._worker,
    pixelRatio: stage.renderer.getPixelRatio(),
    ready: startup.complete,
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

// Cached data is synchronous: initialize the HUD and overlay before subscribing.
feed.start();

mountInterface();
