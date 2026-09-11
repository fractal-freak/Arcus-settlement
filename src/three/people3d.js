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
  Group, IcosahedronGeometry, MeshBasicMaterial, Mesh, Vector3,
} from 'three';
import { smoothHeightAt, isWater, hash2 } from '../app/terrain.js';
import { PLOTS, CIVIC } from '../app/village.js';
import { loadCharacters, makeCharacter, kindFor } from './characters.js';

const markerGeo = new IcosahedronGeometry(0.1, 1);

/** How tall a session stands, in world units. */
const HEIGHT = 1.8;

/**
 * What each session's state looks like. `working` walks on the spot because
 * a busy session should read as busy from across the square; `waiting` stands
 * still under its marker, which is the one state Kevin is actually meant to
 * notice and act on.
 */
const STATE_ANIM = {
  working: { clip: 'Walking_A', timeScale: 1.0 },
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
/** Is this spot inside a building's footprint? A session standing in a wall reads as a bug. */
function insideABuilding(x, z) {
  for (const p of PLOTS) if (Math.hypot(p.x - x, p.z - z) < 3.2) return true;
  if (CIVIC && Math.hypot(CIVIC.x - x, CIVIC.z - z) < 4.5) return true;
  return false;
}

function positionFor(id) {
  const seed = hashString(id) % 10007;
  // Sessions used to scatter across a 14-72 unit ring, which put most of them
  // alone in empty wilderness with nothing around them — fine when the whole
  // map was evenly covered in buildings, wrong now the settlement is a
  // compact village. They gather in and around it instead, on the square and
  // along the lanes, so the place reads as somewhere people actually are.
  // Still hashed off the session id alone, so the same session stands in the
  // same spot on every reload.
  let angle = hash2(seed, 17, 61) * Math.PI * 2;
  let radius = 5 + hash2(seed, 19, 62) * 22;
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let tries = 0; tries < 8
    && (isWater(Math.round(x), Math.round(z)) || insideABuilding(x, z)); tries++) {
    angle = hash2(seed, 20 + tries, 63) * Math.PI * 2;
    radius = 5 + hash2(seed, 21 + tries, 64) * 24;
    x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  return { x, z };
}

class Figure {
  constructor(id) {
    this.id = id;
    this.group = new Group();
    const { x, z } = positionFor(id);
    this.baseX = x;
    this.baseZ = z;
    this.seed = (hashString(id) % 1000) / 1000;

    // Which of the six this session is — hashed off its own id, so a session
    // keeps the same face across reloads the same way it keeps the same spot.
    this.char = makeCharacter(kindFor(hashString(id)), HEIGHT);
    if (this.char) {
      this.group.add(this.char.root);
      this.char.root.rotation.y = this.seed * 6.283;
    }

    this.markerMat = new MeshBasicMaterial({ color: 0xffd76a });
    this.marker = new Mesh(markerGeo, this.markerMat);
    this.marker.position.y = HEIGHT + 0.45;
    this.marker.visible = false;
    this.group.add(this.marker);
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.marker.visible = state === 'waiting';
    const anim = STATE_ANIM[state] ?? STATE_ANIM.resting;
    if (this.char) this.char.play(anim.clip, { timeScale: anim.timeScale });
  }

  setHover(on) {
    this.hovered = on;
    this.group.scale.setScalar(on ? 1.14 : 1);
  }

  place(scene) {
    this.h = smoothHeightAt(this.baseX, this.baseZ);
    this.group.position.set(this.baseX, this.h, this.baseZ);
    scene.add(this.group);
  }

  dispose(scene) {
    scene.remove(this.group);
    if (this.char) this.char.dispose();
    this.markerMat.dispose();
  }

  tick(elapsedS, dtS) {
    // The skeleton does the moving now; the old sine-wave bob and sway were
    // standing in for animation this had no way to do.
    if (this.char) this.char.update(dtS);
    if (this.marker.visible) {
      const p = elapsedS * 3 + this.seed * 10;
      this.marker.position.y = HEIGHT + 0.45 + Math.sin(p) * 0.06;
      this.marker.scale.setScalar(1 + Math.sin(p * 1.7) * 0.22);
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
