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
import { People3D } from './three/people3d.js';
import { Town3D } from './three/town3d.js';
import { Landmarks3D } from './three/landmarks3d.js';
import { Rig } from './three/controls.js';
import { Feed } from './data/feed.js';
import { smoothHeightAt } from './app/terrain.js';

const stage = new Stage(document.body);
const sky = new Sky3D(stage.scene);
const terrain = new Terrain3D(stage.scene);
const people = new People3D(stage.scene);
const town3d = new Town3D(stage.scene);
const landmarks = new Landmarks3D(stage.scene);
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
  }
  if (d.people) people.sync(d.people);
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
const pills = new Map(); // session id -> <a>
let hoveredId = null;
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

function showCard(p, x, y) {
  const doing = p.state === 'working' ? 'Working right now'
    : p.state === 'waiting' ? 'Open, waiting on you' : 'Resting';
  const bits = [`<b>${doing}</b>`];
  if (p.doing) {
    bits.push(`<span class="doing">${esc(p.doing.verb)}${p.doing.detail ? ' — ' + esc(p.doing.detail) : ''}</span>`);
  }
  const b = p.built || {};
  bits.push(b.commits || b.files
    ? `Built: <b>${b.commits}</b> commit${b.commits === 1 ? '' : 's'}, <b>${b.files}</b> file${b.files === 1 ? '' : 's'} changed`
    : 'Nothing committed on this branch yet');
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

function syncPeopleOverlay() {
  const seen = new Set();
  for (const a of people.anchors()) {
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
    el.style.display = behind ? 'none' : '';
    if (behind) continue;
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
  stage, sky, terrain, people, town3d, landmarks, rig, feed,
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
