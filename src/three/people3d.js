/**
 * The people: every open Claude Code session, standing in the world.
 *
 * This is the actual reason the whole project exists — a session you can
 * click on to reopen that exact chat — and until now it only ever worked on
 * the old 2D page. `/world/data` has always carried the full `people` array
 * (title, branch, what it is doing, whether it is waiting on Kevin); the 3D
 * feed just never read past `sky`/`town`/`counts`.
 *
 * Positions are INVENTED here, not served — buildWorld() has no notion of
 * where in the world a session stands, only what it is doing. Each one gets
 * a stable spot hashed deterministically from its own session id, the same
 * "hash the coordinate, never store it" principle the whole landscape
 * already runs on, so the same session lands in the same place every reload
 * instead of jumping around.
 *
 * Visual figures live here; screen-space interaction (hover card, click to
 * open) lives in main.js as a plain DOM overlay, exactly the technique
 * arcus-world-page.mjs already uses successfully for the 2D page — real
 * click/hover events on real elements are simpler and more reliable than
 * raycasting into a scene whose camera OrbitControls already owns pointer
 * dragging for panning.
 */

import {
  Group, IcosahedronGeometry, MeshBasicMaterial, Mesh, Vector3, TorusGeometry,
} from 'three';
import { smoothHeightAt, isWater, hash2, WATER_LEVEL, STEP } from '../app/terrain.js';
import { blocked, walkingHeightAt } from '../app/occupied.js';
import { digFor } from '../app/digs.js';
import { loadCharacters, makeCharacter, makePickaxe, DIG_CREW } from './characters.js';

/**
 * The sign above an archaeologist's head.
 *
 * A ring with a bead running round it: a body on its orbit, which is the one
 * shape this world could have and no other game would. It replaces a black
 * pill of truncated session title that sat over every figure at all times and
 * covered more of the valley than the figures did — the name is worth reading
 * when you ask for it, and worth nothing when you did not.
 *
 * It is a real object in the scene, not an overlay, which is why a building
 * hides it the way a building should. Three readings off one shape:
 *   working  the ring turns and the bead runs, quickly
 *   waiting  the ring holds still and the bead sits at the top and breathes
 *   resting  nothing at all
 * Waiting is the one state that means it is Kevin's move, so it is the one
 * that stays still while everything else moves — the eye finds a stopped thing
 * in a field of moving ones faster than the other way round.
 */
const RING_R = 0.30;
const TILT = 1.05;
const ringGeo = new TorusGeometry(RING_R, 0.022, 5, 30);
const beadGeo = new IcosahedronGeometry(0.075, 1);
const RING_WORKING = new MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.72 });
const RING_WAITING = new MeshBasicMaterial({ color: 0xffc94d, transparent: true, opacity: 0.85 });
const BEAD_WORKING = new MeshBasicMaterial({ color: 0xe8f6ff });
const BEAD_WAITING = new MeshBasicMaterial({ color: 0xfff0c0 });

/** How tall a session stands, in world units. */
const HEIGHT = 1.8;

/**
 * What each session's state looks like.
 *
 * `working` DIGS. It used to walk on the spot, which was the best a session
 * standing on the square could do; now a working session is out at a real site
 * with a real trench in front of it, so it crouches to the ground and works —
 * which is what these people have always been said to be doing.
 *
 * `waiting` stands still in the village. That is the one state Kevin is meant
 * to notice and act on, so it is deliberately the quietest thing in the world.
 */
const STATE_ANIM = {
  working: { clip: 'Interact', timeScale: 0.85 },
  waiting: { clip: 'Idle_A', timeScale: 1.0 },
  resting: { clip: 'Idle_B', timeScale: 0.6 },
};

/** A simple string hash — session ids are stable strings, not numbers. */
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * A deterministic spot for one session id: a loose ring around the calm
 * centre of the valley (see terrain.js's note on reliefAt — the origin is
 * already the geologically flattest point, which is what a town square
 * would have been if the generator were allowed to build one). Nudged off
 * water if the hash happens to land in the river, since the town's centre
 * sits right against it.
 */
/**
 * Somewhere a session genuinely cannot stand: inside a building, or below the
 * waterline. The height test matters — isWater() only asks whether a whole
 * TILE counts as river, so a figure could pass it while standing on ground
 * that is itself under the surface, which is how sessions ended up wading in
 * the river.
 */
const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;

const unstandable = (x, z) => blocked(x, z, 0.6);

/**
 * Told when somebody's pick hits the ground, so the world can make the noise.
 * A callback rather than an import, because this module has no business
 * knowing there is an audio system at all.
 */
let onStrike = null;
export function setStrikeListener(fn) { onStrike = fn; }

/**
 * Where a session stands when it is NOT working: in the village, among the
 * houses, where you can see at a glance who is waiting on you.
 */
function homeFor(id) {
  const seed = hashString(id) % 10007;
  // Sessions used to scatter across a 14-72 unit ring, which put most of them
  // alone in empty wilderness with nothing around them — fine when the whole
  // map was evenly covered in buildings, wrong now the settlement is a
  // compact village. They gather in and around it instead, on the square and
  // along the lanes, so the place reads as somewhere people actually are.
  // Still hashed off the session id alone, so the same session stands in the
  // same spot on every reload.
  // Fourteen tries and then it stood wherever the fourteenth landed, blocked
  // or not — which was survivable in an empty valley and is not now that the
  // citizens have put four hundred things in it. It keeps looking, and widens
  // its search as it goes rather than drawing from the same ring every time.
  let last = null;
  for (let tries = 0; tries < 60; tries++) {
    const angle = hash2(seed * 13 + tries, 17 + tries * 7, 61 + tries * 11) * Math.PI * 2;
    const radius = 7 + hash2(seed * 7 + tries, 19 + tries * 5, 62 + tries * 13) * (26 + tries * 0.7);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    last = { x, z };
    if (!unstandable(x, z)) return { x, z };
  }
  return last;
}

/**
 * Where a session stands when it IS working: out at its dig, a good hike past
 * the last house. See app/digs.js — the sites are the ruins the terrain
 * already has, and the same module tells the hub which site is whose, so the
 * place the chronicle names is the place the figure is standing.
 */
function siteFor(id) {
  const d = digFor(id);
  if (!d) return homeFor(id);
  return { x: d.x, z: d.z, look: d.look };
}

class Figure {
  constructor(id) {
    this.id = id;
    this.group = new Group();
    this.home = homeFor(id);
    this.site = siteFor(id);
    this.baseX = this.home.x;
    this.baseZ = this.home.z;
    this.seed = (hashString(id) % 1000) / 1000;

    // Every session wears the same outfit, on purpose. These are the dig
    // crew — the archaeologist astrologers actually working the site — and a
    // crew reads as a crew by being dressed alike. It is also the clearest
    // possible tell against a villager, who is any of the other five.
    this.char = makeCharacter(DIG_CREW, HEIGHT);
    if (this.char) {
      this.group.add(this.char.root);
      this.char.root.rotation.y = this.seed * 6.283;
      // A tool in the hand. Kevin's note was that they should be digging and
      // picking things up, and a crouching figure with empty hands reads as
      // somebody who has dropped something.
      this.pick = makePickaxe();
      this.pick.visible = false;
      this.char.hold(this.pick, 'r');
      // Held so the swing can be driven by hand — no clip in either animation
      // file is a person striking the ground, so the arm is moved here.
      this.arm = this.char.bone('upperarmr');
      this.forearm = this.char.bone('lowerarmr');
    }

    this.sign = new Group();
    this.sign.position.y = HEIGHT + 0.52;
    this.ring = new Mesh(ringGeo, RING_WORKING);
    this.ring.rotation.x = TILT;
    this.bead = new Mesh(beadGeo, BEAD_WORKING);
    this.sign.add(this.ring, this.bead);
    this.sign.visible = false;
    this.group.add(this.sign);
  }

  setState(state) {
    if (this.state === state) return;
    const was = this.state;
    this.state = state;

    this.sign.visible = state === 'working' || state === 'waiting';
    const busy = state === 'working';
    if (this.pick) this.pick.visible = busy;
    this.ring.material = busy ? RING_WORKING : RING_WAITING;
    this.bead.material = busy ? BEAD_WORKING : BEAD_WAITING;

    const anim = STATE_ANIM[state] ?? STATE_ANIM.resting;
    if (this.char) this.char.play(anim.clip, { timeScale: anim.timeScale });

    // Out to the dig, or back to the village. The two are sixty units apart,
    // so there is no honest way to WALK it — a straight line would cross the
    // river and half the forest, and a path finder is a different project. It
    // sinks into the ground here and rises there instead, which is the same
    // trick terrain3d.js uses to bring a new chunk in: no clipping, nothing
    // invented, and the change reads as a change rather than a glitch.
    const want = busy ? this.site : this.home;
    if (was !== undefined && (want.x !== this.baseX || want.z !== this.baseZ)) {
      this.moveTo = want;
      this.dip = 0;
    } else {
      this.baseX = want.x;
      this.baseZ = want.z;
      if (this.scene) this.settle();
    }
  }

  setHover(on) {
    // Deliberately does NOT resize the figure. Growing a character under the
    // pointer made it lunge at you and shoved its own neighbours' labels
    // around; the pill above its head already brightens, which is enough to
    // say which one you are pointing at.
    this.hovered = on;
  }

  place(scene) {
    this.scene = scene;
    this.settle();
    scene.add(this.group);
  }

  /** Stand on the real ground at the current spot, facing the right way. */
  settle() {
    this.h = walkingHeightAt(this.baseX, this.baseZ);
    this.group.position.set(this.baseX, this.h, this.baseZ);
    if (!this.char) return;
    // At the dig everyone faces the trench; in the village nobody has a reason
    // to face anywhere in particular, so they keep their own hashed bearing.
    const atSite = this.baseX === this.site.x && this.baseZ === this.site.z;
    this.char.root.rotation.y = atSite && this.site.look !== undefined
      ? this.site.look : this.seed * 6.283;
  }

  /**
   * Digging: a stroke of the pick into the ground, and the sound of it.
   *
   * Neither animation file has anybody striking anything — the kit ships
   * idles, walks, jumps and a crouch, and its combat clips are not in the two
   * rigs this project loads. So the stroke is driven here, applied AFTER
   * `mixer.update` because the mixer rewrites every bone it owns each frame
   * and anything set before it is simply overwritten.
   *
   * The arc is deliberately uneven: most of the cycle is the lift, the strike
   * itself is fast, and there is a beat of nothing at the bottom. An even sine
   * reads as waving, not working.
   */
  _swing(elapsedS) {
    if (!this.arm || this.state !== 'working') return;
    const period = 1.35;
    const clock = elapsedS + this.seed * 4;
    const phase = (clock % period) / period;
    // 0 at the top of the lift, 1 at the moment of impact.
    const down = phase < 0.24 ? (phase / 0.24) ** 1.9 : 1 - ((phase - 0.24) / 0.76) ** 0.85;
    // AXES, MEASURED. Rotating each bone on each axis in turn and watching
    // where the head of the pick actually went: the upper arm's X is almost
    // purely vertical (0.31 down against 0.05 sideways) and POSITIVE swings
    // it down; the forearm's Z lifts. The first version used X on both and
    // subtracted, so the stroke went up and out to the side — which is
    // exactly what Kevin described.
    this.arm.rotation.x += 1.75 * down - 0.55;
    if (this.forearm) this.forearm.rotation.z -= 0.85 * down - 0.30;
    // The body goes with it. Digging is done with the back, not the elbow.
    if (this.char) this.char.root.rotation.x = 0.30 * down - 0.06;

    // One clank per stroke, at the bottom, once. Counted off the SAME clock
    // the swing runs on — the first version floored whole seconds against a
    // 1.35-second stroke, so the two drifted and a stroke could ring twice.
    const struck = Math.floor(clock / period);
    if (phase >= 0.24 && phase < 0.42 && struck !== this._lastStrike) {
      this._lastStrike = struck;
      onStrike?.(this.group.position);
    }
  }

  dispose(scene) {
    scene.remove(this.group);
    if (this.char) this.char.dispose();
  }

  tick(elapsedS, dtS) {
    // The skeleton does the moving now; the old sine-wave bob and sway were
    // standing in for animation this had no way to do.
    if (this.char) this.char.update(dtS);
    this._swing(elapsedS);

    // Sink, change ground, rise. Half a second each way.
    if (this.moveTo) {
      this.dip += dtS / 0.5;
      if (this.dip >= 1 && this.baseX !== this.moveTo.x) {
        this.baseX = this.moveTo.x;
        this.baseZ = this.moveTo.z;
        this.settle();
      }
      if (this.dip >= 2) { this.moveTo = null; this.group.position.y = this.h; }
      else {
        const under = this.dip <= 1 ? this.dip : 2 - this.dip;
        this.group.position.y = this.h - under * (HEIGHT + 0.9);
      }
    }

    if (!this.sign.visible) return;
    const p = elapsedS + this.seed * 10;
    if (this.state === 'working') {
      // The ring turns and the bead runs its orbit — a body in motion.
      this.sign.rotation.y = p * 0.55;
      const a = p * 2.1;
      // ON the ring, not beside it. The ring is tilted by TILT about X, so a
      // point of it is (cos, sin·cos TILT, sin·sin TILT) — the last term had
      // the wrong sign and the bead floated clear of the circle it was
      // supposed to be running round.
      this.bead.position.set(Math.cos(a) * RING_R, Math.sin(a) * RING_R * Math.cos(TILT), Math.sin(a) * RING_R * Math.sin(TILT));
      this.bead.scale.setScalar(1);
    } else {
      // Stopped at the top of its orbit, breathing. Your move.
      this.sign.rotation.y = 0;
      this.bead.position.set(0, RING_R * Math.cos(TILT), RING_R * Math.sin(TILT));
      const b = 1 + Math.sin(p * 2.4) * 0.28;
      this.bead.scale.setScalar(b);
      this.sign.position.y = HEIGHT + 0.52 + Math.sin(p * 1.6) * 0.05;
    }
  }
}

export class People3D {
  constructor(scene) {
    this.scene = scene;
    this.figures = new Map(); // id -> Figure
    this.ready = false;
    this._pending = null;
    loadCharacters().then(() => {
      this.ready = true;
      // Build from whatever the feed already delivered while the characters
      // were downloading — the feed only reports a CHANGED people list, so a
      // sync that lands before the models are ready is not repeated.
      if (this._pending) this.sync(this._pending);
    });
  }

  /** Reconcile against the latest `people` array from the feed. */
  sync(people) {
    if (!people) return;
    this._pending = people;
    if (!this.ready) return;
    const seen = new Set();
    for (const p of people) {
      seen.add(p.id);
      let f = this.figures.get(p.id);
      if (!f) {
        f = new Figure(p.id);
        f.place(this.scene);
        this.figures.set(p.id, f);
      }
      f.data = p;
      f.setState(p.state);
    }
    for (const [id, f] of this.figures) {
      if (!seen.has(id)) { f.dispose(this.scene); this.figures.delete(id); }
    }
  }

  tick(dtMs) {
    const dtS = dtMs / 1000;
    this._elapsed = (this._elapsed ?? 0) + dtS;
    for (const f of this.figures.values()) f.tick(this._elapsed, dtS);
  }

  /** World-space head position of every current figure, for screen projection. */
  anchors() {
    const out = [];
    for (const f of this.figures.values()) {
      out.push({ id: f.id, data: f.data, position: new Vector3(f.group.position.x, f.h + HEIGHT + 0.2, f.group.position.z) });
    }
    return out;
  }

  setHover(id) {
    for (const [fid, f] of this.figures) f.setHover(fid === id);
  }
}
