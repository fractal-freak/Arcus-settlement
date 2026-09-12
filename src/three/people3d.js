import { crowd } from '../app/crowd.js';
/** Local coding sessions represented by archaeologists at their assigned digs.
 * Their status rings report the real session state; excavation has its own life.
 * Assignment comes from app/digs.js and collision from the shared crowd.
 */

import {
  Group, IcosahedronGeometry, MeshBasicMaterial, Mesh, Vector3, TorusGeometry,
} from 'three';
import { walkingHeightAt, onPlacementsChanged } from '../app/occupied.js';
import { digFor, excavationCrew } from '../app/digs.js';
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

/** A simple string hash — session ids are stable strings, not numbers. */
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/**
 * Told when somebody's pick hits the ground, so the world can make the noise.
 * A callback rather than an import, because this module has no business
 * knowing there is an audio system at all.
 */
let onStrike = null;
export function setStrikeListener(fn) { onStrike = fn; }

class Figure {
  constructor(id) {
    this.id = id;
    this.group = new Group();
    this.site = digFor(id);
    this.baseX = this.site?.x ?? 0;
    this.baseZ = this.site?.z ?? 0;
    this.seed = (hashString(id) % 1000) / 1000;

    // Every session wears the same outfit, on purpose. These are the dig
    // crew — the archaeologist astrologers actually working the site — and a
    // crew reads as a crew by being dressed alike. It is also the clearest
    // possible tell against a villager, who is any of the other five.
    this.char = makeCharacter(DIG_CREW, HEIGHT);
    if (this.char) {
      this.group.add(this.char.root);
      this.char.root.rotation.order = 'YXZ';
      this.char.play('Interact', { fade: 0, timeScale: 0.85 });
      this.char.update(this.seed * 4);
      // A tool in the hand. Kevin's note was that they should be digging and
      // picking things up, and a crouching figure with empty hands reads as
      // somebody who has dropped something.
      this.pick = makePickaxe();
      this.pick.visible = true;
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
    this.state = state;
    this.sign.visible = state === 'working' || state === 'waiting';
    const busy = state === 'working';
    this.ring.material = busy ? RING_WORKING : RING_WAITING;
    this.bead.material = busy ? BEAD_WORKING : BEAD_WAITING;
    // A session waiting for input is still an archaeologist. Status changes
    // never remove the tool, stop the stroke, or teleport the crew home.
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
    const body=this.site && crowd.place(`session:${this.id}`,{x:this.baseX,z:this.baseZ},.6);
    this.group.visible=!!body;
    if(!body){crowd.remove(`session:${this.id}`);return;}
    this.baseX=body.x;this.baseZ=body.z;
    this.h = walkingHeightAt(this.baseX, this.baseZ);
    this.group.position.set(this.baseX, this.h, this.baseZ);
    if (!this.char) return;
    // Collision may shift a worker around the cut. Face the actual centre,
    // even when their final position differs from the original work spot.
    this.char.root.rotation.y = Math.atan2(
      this.site.center.x - this.baseX, this.site.center.z - this.baseZ);
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
    if (!this.arm || !this.group.visible) return;
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
    crowd.remove(`session:${this.id}`);
    scene.remove(this.group);
    if (this.char) this.char.dispose();
    // Tools are created per session; the character textures and status-ring
    // geometry are shared. Release only the tool when a session disappears.
    this.pick?.traverse(o => {
      o.geometry?.dispose();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material?.dispose();
    });
  }

  tick(elapsedS, dtS) {
    // The skeleton does the moving now; the old sine-wave bob and sway were
    // standing in for animation this had no way to do.
    if (this.char) this.char.update(dtS);
    this._swing(elapsedS);

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
    onPlacementsChanged(() => { for (const f of this.figures.values()) f.settle(); });
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
    for (const p of excavationCrew(people)) {
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
      if (!f.group.visible) continue;
      out.push({ id: f.id, data: f.data, position: new Vector3(f.group.position.x, f.h + HEIGHT + 0.2, f.group.position.z) });
    }
    return out;
  }

  setHover(id) {
    for (const [fid, f] of this.figures) f.setHover(fid === id);
  }
}
