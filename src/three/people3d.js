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
  Group, ConeGeometry, SphereGeometry, IcosahedronGeometry,
  MeshToonMaterial, MeshBasicMaterial, Mesh, Color, Vector3,
} from 'three';
import { smoothHeightAt, isWater, hash2 } from '../app/terrain.js';
import { toonRamp } from './terrain3d.js';

const robeGeo = new ConeGeometry(0.32, 0.9, 8);
const headGeo = new SphereGeometry(0.19, 10, 8);
// A bare cone-and-sphere read as exactly that. A hood — a second, smaller
// cone overlapping the head from above — and two angled sleeve-cones are
// what actually make it read as a hooded figure rather than a toy.
const hoodGeo = new ConeGeometry(0.27, 0.55, 8);
const armGeo = new ConeGeometry(0.07, 0.48, 6);
const markerGeo = new IcosahedronGeometry(0.1, 1);

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
function positionFor(id) {
  const seed = hashString(id) % 10007;
  // Wide enough that even three dozen sessions at once don't stand shoulder
  // to shoulder — verified live at 36 real sessions: the first, tighter
  // radius packed their screen-space labels into an unreadable cluster at
  // the default view. Spread is the fix that actually reduces overlap;
  // fading distant labels (see main.js) only softens what wasn't spread.
  let angle = hash2(seed, 17, 61) * Math.PI * 2;
  let radius = 14 + hash2(seed, 19, 62) * 58;
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let tries = 0; tries < 6 && isWater(Math.round(x), Math.round(z)); tries++) {
    angle = hash2(seed, 20 + tries, 63) * Math.PI * 2;
    radius = 10 + hash2(seed, 21 + tries, 64) * 64;
    x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  return { x, z };
}

/** Muted jewel tones for robes — a hooded traveller's palette, not a rainbow. */
function robeColor(id) {
  const seed = hashString(id);
  const hue = ((seed >>> 8) % 360) / 360;
  return new Color().setHSL(hue, 0.38, 0.34 + ((seed >>> 3) % 10) / 100);
}

class Figure {
  constructor(id) {
    this.id = id;
    this.group = new Group();
    const { x, z } = positionFor(id);
    this.baseX = x;
    this.baseZ = z;
    this.seed = (hashString(id) % 1000) / 1000;

    this.robeMat = new MeshToonMaterial({ color: 0x888888, gradientMap: toonRamp });
    const robe = new Mesh(robeGeo, this.robeMat);
    robe.position.y = 0.45;
    robe.castShadow = true;
    robe.receiveShadow = true;
    this.headMat = new MeshToonMaterial({ color: 0xd9b98a, gradientMap: toonRamp });
    const head = new Mesh(headGeo, this.headMat);
    head.position.y = 1.0;
    head.castShadow = true;
    // The hood's base sits at the head's lower half and its point rises
    // just above the crown — the head peeks out from underneath rather
    // than the two shapes merely touching.
    const hood = new Mesh(hoodGeo, this.robeMat);
    hood.position.y = 1.08;
    hood.castShadow = true;
    // Sleeves: angled out and slightly down from where the robe is already
    // wide, so they read as arms hanging at the figure's sides, not rods
    // buried inside the cone.
    const armL = new Mesh(armGeo, this.robeMat);
    armL.position.set(-0.27, 0.6, 0);
    armL.rotation.z = 0.45;
    armL.castShadow = true;
    const armR = new Mesh(armGeo, this.robeMat);
    armR.position.set(0.27, 0.6, 0);
    armR.rotation.z = -0.45;
    armR.castShadow = true;
    this.group.add(robe, head, hood, armL, armR);

    this.markerMat = new MeshBasicMaterial({ color: 0xffd76a });
    this.marker = new Mesh(markerGeo, this.markerMat);
    this.marker.position.y = 1.5;
    this.marker.visible = false;
    this.group.add(this.marker);

    this.robeMat.color.copy(robeColor(id));
    this._baseColor = this.robeMat.color.clone();
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.marker.visible = state === 'waiting';
    const dim = state === 'resting';
    this.robeMat.color.copy(this._baseColor).multiplyScalar(dim ? 0.62 : 1);
    this.headMat.color.setHex(dim ? 0xa89578 : 0xd9b98a);
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
    this.robeMat.dispose();
    this.headMat.dispose();
    this.markerMat.dispose();
  }

  tick(elapsedS) {
    const t = elapsedS * (this.state === 'working' ? 2.6 : 1.1) + this.seed * 10;
    const bob = this.state === 'resting' ? 0 : Math.sin(t) * (this.state === 'working' ? 0.05 : 0.025);
    this.group.position.y = this.h + bob;
    this.group.rotation.y = this.state === 'resting' ? this.seed * 6.283 : this.seed * 6.283 + Math.sin(t * 0.5) * 0.25;
    if (this.marker.visible) {
      const p = elapsedS * 3 + this.seed * 10;
      this.marker.position.y = 1.5 + Math.sin(p) * 0.06;
      const s = 1 + Math.sin(p * 1.7) * 0.22;
      this.marker.scale.setScalar(s);
    }
  }
}

export class People3D {
  constructor(scene) {
    this.scene = scene;
    this.figures = new Map(); // id -> Figure
  }

  /** Reconcile against the latest `people` array from the feed. */
  sync(people) {
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
    this._elapsed = (this._elapsed ?? 0) + dtMs / 1000;
    for (const f of this.figures.values()) f.tick(this._elapsed);
  }

  /** World-space head position of every current figure, for screen projection. */
  anchors() {
    const out = [];
    for (const f of this.figures.values()) {
      out.push({ id: f.id, data: f.data, position: new Vector3(f.group.position.x, f.h + 1.25, f.group.position.z) });
    }
    return out;
  }

  setHover(id) {
    for (const [fid, f] of this.figures) f.setHover(fid === id);
  }
}
