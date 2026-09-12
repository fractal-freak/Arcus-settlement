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
import { hash2 } from '../app/terrain.js';
import { BRIDGE, bridgeActive, bridgeRoute } from '../app/bridge.js';
import { OFFERING } from '../app/village.js';
import { blocked, onPlacementsChanged, walkingHeightAt } from '../app/occupied.js';
import { loadCharacters, makeCharacter, kindFor } from './characters.js';

/** Shorter than a session figure (1.8) — a real, readable difference at a glance. */
const HEIGHT = 1.55;

/** How many villagers' mixers get advanced per frame. */
const MIXERS_PER_FRAME = 8;

/**
 * A home near the built-up middle, and a circle of ground they can actually
 * pace without walking through anything.
 *
 * TWO REASONS THIS KEPT FAILING, both fixed here.
 *
 * The first: the clear-ground test was given `wanderR + 0.6`, but the loop
 * below is two out-of-phase sines on X and Z, so its real reach is the
 * DIAGONAL — up to 1.42 times the radius. The far corners of every villager's
 * walk were never tested, which is precisely where they were found standing
 * inside trees.
 *
 * The second: eighteen tries, and if all eighteen failed it used the last one
 * ANYWAY. That was survivable when the valley was empty; with four hundred
 * things the citizens have built standing around, a villager whose hash keeps
 * landing in the settlement ran out of tries and was simply placed inside
 * whatever it last hit. It now keeps looking, and pulls its circle in as it
 * goes: somebody in a tight corner paces a tighter round, which is what a
 * person in a tight corner does.
 */
function homeFor(i) {
  const seed = hash2(i, 41, 131);
  const want = 1.2 + (Math.floor(seed * 100000) % 7) / 4;
  for (let tries = 0; tries < 46; tries++) {
    // The circle shrinks as the search wears on, down to a shuffle on the spot.
    const wanderR = want * Math.max(0.2, 1 - tries / 34);
    // Every retry has to move this villager somewhere genuinely different, and
    // somewhere different from every OTHER villager's retry. Salting only the
    // second and third arguments made later attempts depend more on the try
    // number than on who was trying, so six people who all had a bad first
    // guess ended up standing in the same square metre.
    const angle = hash2(i * 31 + tries, 43 + tries * 7, 132 + tries * 13) * Math.PI * 2;
    const radius = 6 + hash2(i * 17 + tries, 45 + tries * 5, 133 + tries * 11) * 32;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // Cheap circle first, then the loop they will really walk. The circle is
    // only an approximation of that path and was quietly letting a few
    // through; the path itself is the actual question, so it settles it.
    if (blocked(x, z, wanderR * 1.42 + 0.9)) continue;
    if (pathBlocked(x, z, wanderR)) continue;
    return { x, z, seed, wanderR };
  }
  // Nowhere at all. Better to leave this villager out than to stand them in a
  // wall — the population is a count, and one fewer figure is invisible where
  // one figure inside the well is the first thing you see.
  return null;
}

/**
 * The wander loop itself, sampled.
 *
 * `tick` below walks two out-of-phase sines, which traces a rounded figure
 * that is not a circle and is not centred on home either. Testing a circle
 * around home approximates it; testing the path tests it.
 */
function pathBlocked(hx, hz, wanderR) {
  for (let k = 0; k < 14; k++) {
    const t = (k / 14) * Math.PI * 2 * 5;   // five loops covers the phase drift
    const x = hx + Math.sin(t) * wanderR;
    const z = hz + Math.sin(t * 0.63 + 1.7) * wanderR;
    if (blocked(x, z, 0.55)) return true;
  }
  return false;
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
    // Homes are chosen against ground that the citizens keep changing. When
    // they finish something, everyone picks their spot again — otherwise a
    // villager placed this morning is standing in a hedge planted this
    // afternoon, and nothing would ever notice.
    onPlacementsChanged(() => { this._checkHomes = [...this.folk]; });
  }

  /** Rebuilt only when the real population number changes — same rare-rebuild pattern as Town3D. */
  sync(town) {
    if (!town) return;
    this._pending = town;
    if (!this.ready) return;
    const n = town.folk ?? 0;
    const identities = town.residents?.length === n ? town.residents.map(c => c.seed) : Array.from({length:n},(_,i)=>i);
    const signature=identities.join(',')+':'+bridgeActive();
    if (n === this.count && signature === this.signature) return;
    this.identities=identities;this.signature=signature;
    this.count = n;
    this._rebuild(n);
  }

  _rebuild(n) {
    const previous = new Map(this.folk.map(f => [f.identity, f]));
    this.folk = [];

    for (let i = 0; i < n; i++) {
      const identity=this.identities?.[i] ?? i;
      const existing = previous.get(identity);
      const visitor = OFFERING.visitors[i];
      const crossing = bridgeActive() && i >= OFFERING.visitors.length && i < OFFERING.visitors.length+4;
      if (existing && !!existing.home.crossing === crossing && !!existing.home.ritual === !!visitor) {
        this.folk.push(existing); previous.delete(identity); continue;
      }
      const home = crossing ? { x:BRIDGE.from,z:BRIDGE.z,seed:hash2(identity,41,131),wanderR:0,crossing:true } : visitor && !blocked(visitor.x, visitor.z, 0.6)
        ? { ...visitor, seed: hash2(identity, 41, 131), wanderR: 0.25, ritual: true }
        : homeFor(identity);
      if (!home) {
        if (existing) { this.folk.push(existing); previous.delete(identity); }
        continue;
      }
      if (existing) {
        existing.home = home; existing.wanderR = home.wanderR;
        this.folk.push(existing); previous.delete(identity); continue;
      }
      const seedInt = Math.floor(home.seed * 100000);
      const char = makeCharacter(kindFor(seedInt + identity * 7), HEIGHT, { background: true, appearanceSeed: identity });
      if (!char) continue;
      // Staggered start times, so forty-eight people are not all mid-stride
      // on the same foot — the single clearest tell of a cloned crowd.
      char.play('Walking_C', { fade: 0, timeScale: 0.75 + (seedInt % 40) / 100 });
      char.mixer.setTime((seedInt % 997) / 997 * 2);
      this.group.add(char.root);
      this.folk.push({
        identity,
        char,
        home,
        phase: (seedInt % 1000) / 1000,
        wanderR: home.wanderR,
        speed: 0.35 + (seedInt % 11) / 40,
        lastTick: 0,
      });
    }
    for (const f of previous.values()) { f.char.dispose(); this.group.remove(f.char.root); }
    this._checkHomes = [...this.folk];
  }

  tick(elapsedS) {
    if (!this.folk.length) return;
    // Revalidate one home per frame after construction, preserving each rig.
    const check = this._checkHomes?.pop();
    if (check && !check.home.crossing && !check.home.ritual &&
        blocked(check.home.x, check.home.z, check.wanderR * 1.42 + 0.9)) {
      const home = homeFor(check.identity);
      if (home) { check.home = home; check.wanderR = home.wanderR; }
    }
    this.folk.forEach((f) => {
      if(f.home.crossing){
        const p=bridgeRoute(elapsedS,f.phase);
        f.char.root.position.set(p.x,walkingHeightAt(p.x,p.z),p.z);
        f.char.root.rotation.y=p.yaw;
        return;
      }
      if (f.home.ritual) {
        const phase = (elapsedS + f.phase * 38) % 38;
        const near = phase < 5 ? phase / 5 : phase < 14 ? 1 : phase < 19 ? 1 - (phase - 14) / 5 : 0;
        const x = f.home.x, z = f.home.z + (1 - near) * 0.8;
        f.char.root.position.set(x, walkingHeightAt(x,z) + 0.08, z);
        f.char.root.rotation.y = Math.atan2(OFFERING.x - x, OFFERING.z - z);
        const action = phase >= 5 && phase < 10 ? 'Interact' : phase < 5 || (phase >= 14 && phase < 19) ? 'Walking_C' : 'Idle_A';
        if (f.ritualAction !== action) { f.char.play(action, { fade: 0.5, timeScale: 0.65 }); f.ritualAction = action; }
        return;
      }
      const t = elapsedS * f.speed + f.phase * 20;
      // A slow organic loop around home, not a straight pace back and forth —
      // two out-of-phase sines trace a lazy, rounded path.
      const x = f.home.x + Math.sin(t) * f.wanderR;
      const z = f.home.z + Math.sin(t * 0.63 + 1.7) * f.wanderR;
      if(blocked(x,z,.55)) return;
      f.char.root.position.set(x, walkingHeightAt(x,z), z);
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
