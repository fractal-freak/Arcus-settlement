/**
 * Milestones: the landmarks the settlement earns by existing long enough to
 * deserve them, not by anyone asking for them.
 *
 * arcus-town.mjs's own MILESTONES list is the authority on what has been
 * earned (`town().milestones`, gated on real building count — 10/30/60/100/
 * 150) — this module only ever renders whichever of the five keys is already
 * in that array. There is no "not yet" placeholder sitting dim in the world;
 * until 150 buildings stand, the second dome simply is not built. Same
 * "nothing invented" rule the buildings themselves follow.
 *
 * Unlike a house, each of these is a ONE-OFF, hand-placed structure — a plot
 * on a lane would not know to put the bridge across the river — so each gets
 * a real considered spot instead of a plot.
 *
 * These were hand-built primitives until Kevin pointed at the bridge and
 * asked for a real one: a flat brown slab with two rails, which is what a
 * bridge looks like when it is three boxes. They are KayKit models now (CC0,
 * see public/assets/kaykit/License.txt), the same kit the houses come from,
 * so the well on the square no longer reads as a different game from the
 * houses around it.
 */

import { Group } from 'three';
import { smoothHeightAt, isWater } from '../app/terrain.js';
import { loadModels } from './assets.js';

const MODELS = [
  'building_well_red', 'building_tower_A_red', 'building_bridge_A',
  'wall_straight_gate', 'building_castle_green',
];

/** Scale a loaded model so its widest ground axis measures `target` world units. */
function fitScale(model, target) {
  return target / Math.max(model.size.x, model.size.z);
}

/** The well — just off the square's centre, which belongs to the Settlement Stone. */
function buildWell(models) {
  const g = new Group();
  const x = 4.4, z = 3.4;
  const m = models.building_well_red;
  const node = m.scene.clone(true);
  node.scale.setScalar(fitScale(m, 2.2));
  node.position.set(x, smoothHeightAt(x, z), z);
  node.rotation.y = -0.6;
  g.add(node);
  return g;
}

/** The clock tower — the tallest thing on the square, on purpose. */
function buildTower(models) {
  const g = new Group();
  const x = -4.6, z = 3.2;
  const m = models.building_tower_A_red;
  const node = m.scene.clone(true);
  node.scale.setScalar(fitScale(m, 3.2));
  node.position.set(x, smoothHeightAt(x, z), z);
  node.rotation.y = 0.35;
  g.add(node);
  return g;
}

/**
 * The bridge — spans the REAL river, not an invented one. The wet span at
 * z=0 is scanned live off isWater() rather than hardcoded, so this keeps
 * landing correctly if the terrain generator's river maths ever changes.
 *
 * The model is one hex tile's worth of bridge, so the span is TILED along
 * its own length rather than stretched: scaling a single 1.9-unit model
 * across a nine-unit river would smear its planks and stretch its railings
 * into nonsense. Repeating the segment keeps the plank spacing and the
 * railing posts at their modelled size the whole way across, which is the
 * entire reason for using a modelled bridge instead of a box.
 */
function buildBridge(models) {
  const g = new Group();
  const z = 0;
  let lo = null, hi = null;
  for (let x = -20; x <= 40; x++) {
    if (isWater(x, z)) { if (lo === null) lo = x; hi = x; }
  }
  if (lo === null) return g; // river moved out of range — nothing to span, not an error

  const m = models.building_bridge_A;
  // Scale set by the walkway width, so the crossing stays a sensible size for
  // the people on it whatever the river happens to be doing.
  const scale = 2.6 / m.size.x;
  const segLen = m.size.z * scale;

  const margin = 1.6;
  const from = lo - margin, to = hi + 1 + margin;
  const span = to - from;

  // Segments are spaced CLOSER than their own length and never stretched.
  // The first version stretched each one to exactly fill its share of the
  // span, which should have tiled seamlessly and did not: the model's
  // bounding box is wider than its actual deck (the arch's stonework stops
  // short of the box the railings define), so spacing by the box left a real
  // gap of open air between every arch. Overlapping slightly is invisible on
  // stonework and cannot gap; stretching a modelled arch to hide it would
  // have smeared the very detail the model is here for.
  const OVERLAP = 0.84;
  const count = Math.max(1, Math.ceil(span / (segLen * OVERLAP)));
  const spacing = span / count;

  // Sit the DECK at bank level, not the model's origin: the walking surface
  // is box.max.y up from the origin, so placing the origin at the bank would
  // float the road a scaled metre above the ground it is supposed to join.
  const bankH = Math.max(smoothHeightAt(from, z), smoothHeightAt(to, z));
  const originY = bankH + 0.08 - m.box.max.y * scale;

  for (let i = 0; i < count; i++) {
    const node = m.scene.clone(true);
    node.scale.setScalar(scale);
    node.position.set(from + (i + 0.5) * spacing, originY, z);
    node.rotation.y = Math.PI / 2;
    g.add(node);
  }
  return g;
}

/** The great gate — where the road out of the village passes the settlement's edge. */
function buildGate(models) {
  const g = new Group();
  const x = -31, z = -5.1;
  const m = models.wall_straight_gate;
  const node = m.scene.clone(true);
  node.scale.setScalar(fitScale(m, 6.0));
  node.position.set(x, smoothHeightAt(x, z), z);
  node.rotation.y = Math.PI / 2;
  g.add(node);
  return g;
}

/** The keep — the furthest-off milestone, the settlement's own stronghold. */
function buildDome(models) {
  const g = new Group();
  const x = 2, z = -24;
  const m = models.building_castle_green;
  const node = m.scene.clone(true);
  node.scale.setScalar(fitScale(m, 7.0));
  node.position.set(x, smoothHeightAt(x, z), z);
  node.rotation.y = 0.8;
  g.add(node);
  return g;
}

const BUILDERS = { well: buildWell, bridge: buildBridge, tower: buildTower, gate: buildGate, dome: buildDome };

export class Landmarks3D {
  constructor(scene) {
    this.scene = scene;
    this.built = new Set();
    this.ready = false;
    this._pending = null;
    this._loading = loadModels(MODELS).then((models) => {
      this.models = models;
      this.ready = true;
      if (this._pending) this.sync(this._pending);
    });
  }

  /** Adds whichever earned milestone isn't already standing — never rebuilds one that's up. */
  sync(town) {
    if (!town || !town.milestones) return;
    this._pending = town;
    if (!this.ready) return;
    for (const m of town.milestones) {
      if (this.built.has(m.key)) continue;
      const build = BUILDERS[m.key];
      if (!build) continue;
      this.scene.add(build(this.models));
      this.built.add(m.key);
    }
  }
}
