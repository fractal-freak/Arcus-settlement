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
import { Rig } from './three/controls.js';
import { Feed } from './data/feed.js';
import { smoothHeightAt } from './app/terrain.js';

const stage = new Stage(document.body);
const sky = new Sky3D(stage.scene);
const terrain = new Terrain3D(stage.scene);
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
      `${d.town.buildings.length} buildings · ${d.town.folk} living here · ` +
      `${d.counts.working} working · ${d.counts.waiting} waiting on you`;
  }
});
feed.start();

// ── Frame ───────────────────────────────────────────────────────────────

const tmp = new Vector3();
let elapsed = 0;

function frame(dtMs) {
  elapsed += dtMs;
  rig.update(dtMs);
  clampAboveGround();

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
  stage, sky, terrain, rig, feed,
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
