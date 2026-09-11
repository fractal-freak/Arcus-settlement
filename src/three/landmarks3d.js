/**
 * Milestones: the landmarks the town earns by existing long enough to
 * deserve them, not by anyone asking for them.
 *
 * arcus-town.mjs's own MILESTONES list is the authority on what has been
 * earned (`town().milestones`, filtered by real building count — 10/30/60/
 * 100/150) — this module only ever renders whichever of the five keys is
 * already in that array. There is no "not yet" placeholder for the second
 * dome sitting dim in the world; until 150 buildings stand, it simply is
 * not built, the same "nothing invented" rule the buildings themselves
 * follow.
 *
 * Unlike a building, each of these is a ONE-OFF, hand-placed structure —
 * a sunflower-spiral slot would not know to put the bridge across the
 * river or the well at the town's actual centre, so each gets a real,
 * considered spot instead of a hashed one.
 */

import {
  Group, BoxGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, MeshToonMaterial, Mesh,
} from 'three';
import { smoothHeightAt, isWater } from '../app/terrain.js';
import { toonRamp } from './terrain3d.js';

const STONE = new MeshToonMaterial({ color: 0xa6a3ad, gradientMap: toonRamp });
const WOOD = new MeshToonMaterial({ color: 0x8a5c3a, gradientMap: toonRamp });
const ROOF = new MeshToonMaterial({ color: 0x6b5a8a, gradientMap: toonRamp });
const GOLD = new MeshToonMaterial({ color: 0xd9b463, gradientMap: toonRamp });

function group(scene) {
  const g = new Group();
  scene.add(g);
  return g;
}

/** The well — the first landmark, right at the town's actual centre. */
function buildWell() {
  const g = new Group();
  // Offset from the exact origin now — (0,0) belongs to the Settlement
  // Stone (settlementStone3d.js), the town's real founding-chart obelisk,
  // and this town square has room for both a well and a monument the same
  // way any real one does.
  const wx = 5, wz = 4;
  const h = smoothHeightAt(wx, wz);
  const wall = new Mesh(new CylinderGeometry(0.62, 0.68, 0.5, 12), STONE);
  wall.position.set(wx, h + 0.25, wz);
  const postGeo = new CylinderGeometry(0.05, 0.05, 1.1, 6);
  const postA = new Mesh(postGeo, WOOD); postA.position.set(wx - 0.5, h + 0.85, wz);
  const postB = new Mesh(postGeo, WOOD); postB.position.set(wx + 0.5, h + 0.85, wz);
  const roof = new Mesh(new ConeGeometry(0.9, 0.5, 4), ROOF);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(wx, h + 1.5, wz);
  for (const m of [wall, postA, postB, roof]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(wall, postA, postB, roof);
  return g;
}

/** The clock tower — the tallest thing near the square, on purpose. */
function buildTower() {
  const g = new Group();
  const x = -4.5, z = 2.5;
  const h = smoothHeightAt(x, z);
  const shaft = new Mesh(new BoxGeometry(1.3, 5.2, 1.3), STONE);
  shaft.position.set(x, h + 2.6, z);
  const cap = new Mesh(new ConeGeometry(1.05, 1.2, 4), ROOF);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(x, h + 5.2 + 0.6, z);
  const face = new Mesh(new CylinderGeometry(0.4, 0.4, 0.08, 16), GOLD);
  face.rotation.x = Math.PI / 2;
  face.position.set(x, h + 4.1, z + 0.66);
  for (const m of [shaft, cap, face]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(shaft, cap, face);
  return g;
}

/**
 * The bridge — spans the real river, not an invented one. The wet span at
 * z=0 near the town is scanned live off isWater() rather than a hardcoded
 * width, so this keeps landing correctly if the terrain generator's river
 * math ever changes again.
 */
function buildBridge() {
  const g = new Group();
  const z = 0;
  let lo = null, hi = null;
  for (let x = -20; x <= 30; x++) {
    if (isWater(x, z)) { if (lo === null) lo = x; hi = x; }
  }
  if (lo === null) return g; // river moved out of range — nothing to span, not an error
  const margin = 2.2;
  const spanLo = lo - margin, spanHi = hi + margin;
  const len = spanHi - spanLo;
  const cx = (spanLo + spanHi) / 2;
  const bankH = Math.max(smoothHeightAt(spanLo, z), smoothHeightAt(spanHi, z));
  const deckY = bankH + 0.5;
  const deck = new Mesh(new BoxGeometry(len, 0.3, 2.1), WOOD);
  deck.position.set(cx, deckY, z);
  const railGeo = new BoxGeometry(len, 0.28, 0.12);
  const railA = new Mesh(railGeo, WOOD); railA.position.set(cx, deckY + 0.28, z - 1.05);
  const railB = new Mesh(railGeo, WOOD); railB.position.set(cx, deckY + 0.28, z + 1.05);
  for (const m of [deck, railA, railB]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(deck, railA, railB);
  return g;
}

/** The great gate — where the road out of the square passes the edge of the town. */
function buildGate() {
  const g = new Group();
  const x = 30, z = -8;
  const h = smoothHeightAt(x, z);
  const pillarGeo = new BoxGeometry(0.9, 3.2, 0.9);
  const pA = new Mesh(pillarGeo, STONE); pA.position.set(x - 2.1, h + 1.6, z);
  const pB = new Mesh(pillarGeo, STONE); pB.position.set(x + 2.1, h + 1.6, z);
  const lintel = new Mesh(new BoxGeometry(5.4, 0.8, 1.0), STONE);
  lintel.position.set(x, h + 3.4, z);
  const cap = new Mesh(new ConeGeometry(0.75, 0.9, 4), ROOF);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(x, h + 4.2, z);
  for (const m of [pA, pB, lintel, cap]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(pA, pB, lintel, cap);
  return g;
}

/** The second dome — the furthest-off milestone, a real dome shape once it lands. */
function buildDome() {
  const g = new Group();
  const x = 6, z = -22;
  const h = smoothHeightAt(x, z);
  const base = new Mesh(new CylinderGeometry(2.4, 2.6, 1.6, 16), STONE);
  base.position.set(x, h + 0.8, z);
  // A real hemisphere — thetaLength capped at PI/2 keeps only the top half
  // of the sphere, which is what a dome actually is, not a cylinder wedge.
  const dome = new Mesh(new SphereGeometry(2.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), GOLD);
  dome.position.set(x, h + 1.6, z);
  for (const m of [base, dome]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(base, dome);
  return g;
}

const BUILDERS = { well: buildWell, bridge: buildBridge, tower: buildTower, gate: buildGate, dome: buildDome };

export class Landmarks3D {
  constructor(scene) {
    this.scene = scene;
    this.built = new Set();
  }

  /** Adds whichever earned milestone isn't already standing — never rebuilds one that's already up. */
  sync(town) {
    if (!town || !town.milestones) return;
    for (const m of town.milestones) {
      if (this.built.has(m.key)) continue;
      const build = BUILDERS[m.key];
      if (!build) continue;
      this.scene.add(build());
      this.built.add(m.key);
    }
  }
}
