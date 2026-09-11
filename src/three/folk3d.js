/**
 * Folk: the settlement's population, not its sessions.
 *
 * `town.folk` (arcus-town.mjs: `Math.floor(buildings.length / 3) + 4` — people
 * live here because there is somewhere to live, not invented separately from
 * what has been built) is a COUNT, never a list of named individuals the way
 * `people` is. There is nothing here to click, nothing to hover for a card,
 * and nothing to keep a stable identity across reloads beyond an index. No
 * name pill, no hover card, on purpose: two visually identical kinds of
 * person, one clickable and one not, is a real way for Kevin to click a
 * villager expecting a session and get nothing.
 *
 * They are real modelled people now rather than cones, from the same KayKit
 * pack the sessions use (CC0 — public/assets/kaykit-characters/License.txt).
 * What keeps them distinguishable from a session is no longer the shape: it
 * is that they are shorter, they WANDER where a session stands at its own
 * spot, and they carry no label.
 *
 * THE COST, AND WHAT IS DONE ABOUT IT. These were one instanced cone and one
 * instanced sphere for the entire population — two draw calls at any size.
 * Skinned, animated characters cannot be instanced that way: each needs its
 * own skeleton and its own animation mixer. Forty-eight mixers stepped every
 * frame is a real per-frame cost for background figures nobody looks at
 * closely, so the mixers are advanced in ROTATION — a slice of the crowd per
 * frame, each caught up by exactly the time that has passed since it was
 * last touched. Every villager still animates smoothly at its own pace; the
 * work is just spread across frames instead of landing in one.
 */

import { Group } from 'three';
import { smoothHeightAt, isWater, hash2, WATER_LEVEL, STEP } from '../app/terrain.js';
import { PLOTS, CIVIC, propNear } from '../app/village.js';
import { loadCharacters, makeCharacter, kindFor } from './characters.js';

/** Shorter than a session figure (1.8) — a real, readable difference at a glance. */
const HEIGHT = 1.55;

/** How many villagers' mixers get advanced per frame. */
const MIXERS_PER_FRAME = 8;

/**
 * Somewhere a person genuinely cannot stand: inside a house, or below the
 * waterline. The height test is the one that was missing — isWater() asks
 * whether a whole TILE counts as river, so a villager could pass it standing
 * on a bank whose actual ground sits under the surface, and end up shin-deep
 * in the water. Buildings are bigger now too, so the clearances grew with them.
 */
const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;

function unstandable(x, z, clear = 1.0) {
  if (isWater(Math.round(x), Math.round(z))) return true;
  if (smoothHeightAt(x, z) < WATER_SURFACE + 0.1) return true;
  for (const p of PLOTS) if (Math.hypot(p.x - x, p.z - z) < 5.0) return true;
  if (CIVIC && Math.hypot(CIVIC.x - x, CIVIC.z - z) < 7.5) return true;
  // And no standing inside a tree. `clear` covers the villager's whole wander
  // loop, not just the spot they start on — they pace a circle around home,
  // so testing the centre alone let them walk straight through a bush on the
  // far side of it.
  if (propNear(x, z, clear)) return true;
  return false;
}

/** A home near the built-up middle — folk live where there is somewhere to live. */
function homeFor(i) {
  const seed = hash2(i, 41, 131);
  let angle = hash2(i, 43, 132) * Math.PI * 2;
  let radius = 6 + hash2(i, 45, 133) * 32;
  // The wander radius is decided here rather than later, so the clear-ground
  // test can cover the whole loop this villager will actually walk.
  const wanderR = 1.2 + (Math.floor(seed * 100000) % 7) / 4;
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let tries = 0; tries < 18 && unstandable(x, z, wanderR + 0.6); tries++) {
    angle = hash2(i, 47 + tries, 134) * Math.PI * 2;
    radius = 6 + hash2(i, 49 + tries, 135) * 34;
    x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  return { x, z, seed, wanderR };
}

export class Folk3D {
  constructor(scene) {
    this.scene = scene;
    this.count = -1;
    this.folk = [];
    this.group = new Group();
    scene.add(this.group);
    this.ready = false;
    this._pending = null;
    this._cursor = 0;
    loadCharacters().then(() => {
      this.ready = true;
      if (this._pending) this.sync(this._pending);
    });
  }

  /** Rebuilt only when the real population number changes — same rare-rebuild pattern as Town3D. */
  sync(town) {
    if (!town) return;
    this._pending = town;
    if (!this.ready) return;
    const n = town.folk ?? 0;
    if (n === this.count) return;
    this.count = n;
    this._rebuild(n);
  }

  _rebuild(n) {
    for (const f of this.folk) if (f.char) f.char.dispose();
    this.group.clear();
    this.folk = [];

    for (let i = 0; i < n; i++) {
      const home = homeFor(i);
      const seedInt = Math.floor(home.seed * 100000);
      const char = makeCharacter(kindFor(seedInt + i * 7), HEIGHT, { background: true });
      if (!char) continue;
      // Staggered start times, so forty-eight people are not all mid-stride
      // on the same foot — the single clearest tell of a cloned crowd.
      char.play('Walking_C', { fade: 0, timeScale: 0.75 + (seedInt % 40) / 100 });
      char.mixer.setTime((seedInt % 997) / 997 * 2);
      this.group.add(char.root);
      this.folk.push({
        char,
        home,
        phase: (seedInt % 1000) / 1000,
        wanderR: home.wanderR,
        speed: 0.35 + (seedInt % 11) / 40,
        lastTick: 0,
      });
    }
  }

  tick(elapsedS) {
    if (!this.folk.length) return;
    this.folk.forEach((f) => {
      const t = elapsedS * f.speed + f.phase * 20;
      // A slow organic loop around home, not a straight pace back and forth —
      // two out-of-phase sines trace a lazy, rounded path.
      const x = f.home.x + Math.sin(t) * f.wanderR;
      const z = f.home.z + Math.sin(t * 0.63 + 1.7) * f.wanderR;
      f.char.root.position.set(x, smoothHeightAt(x, z), z);
      // Face the way it is actually moving, taken from the velocity — a
      // walking figure facing its own heading is most of what makes it read
      // as walking rather than sliding.
      const vx = Math.cos(t) * f.wanderR;
      const vz = Math.cos(t * 0.63 + 1.7) * 0.63 * f.wanderR;
      f.char.root.rotation.y = Math.atan2(vx, vz);
    });

    // Advance a slice of the mixers, each by the real time since its own last
    // advance rather than by one frame — so a villager stepped every sixth
    // frame still walks at exactly the same speed as one stepped every frame.
    const slice = Math.min(MIXERS_PER_FRAME, this.folk.length);
    for (let k = 0; k < slice; k++) {
      const f = this.folk[this._cursor % this.folk.length];
      this._cursor++;
      const dt = f.lastTick ? elapsedS - f.lastTick : 1 / 60;
      f.lastTick = elapsedS;
      f.char.update(dt);
    }
  }
}
