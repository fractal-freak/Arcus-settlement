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
import { smoothHeightAt, isWater, WATER_LEVEL, STEP } from '../app/terrain.js';
import { LANDMARKS } from '../app/village.js';

/** The height the water surface is actually drawn at — see terrain3d.js's SURFACE_Y. */
const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;
import { loadModels } from './assets.js';

const MODELS = [
  'building_well_red', 'building_tower_A_red', 'building_bridge_A',
  'wall_straight_gate', 'building_castle_green',
];

/** Scale a loaded model so its widest ground axis measures `target` world units. */
function fitScale(model, target) {
  return target / Math.max(model.size.x, model.size.z);
}

/**
 * Where a milestone stands, and how much ground it claims — read from the
 * village plan, never decided here. Everything else in the world tests against
 * that same list to keep out of its way, so a number typed into this file
 * instead would be a number only the renderer knows.
 */
const spot = (key) => LANDMARKS.find((L) => L.key === key);

/** Stand a model on its plot, sized to the ground the plan says it claims. */
function raise(models, name, key) {
  const L = spot(key);
  const m = models[name];
  const node = m.scene.clone(true);
  node.scale.setScalar(fitScale(m, L.r * 2));
  node.position.set(L.x, smoothHeightAt(L.x, L.z), L.z);
  node.rotation.y = L.rot;
  const g = new Group();
  g.add(node);
  return g;
}

/** The well — just off the square's centre, which belongs to the Settlement Stone. */
function buildWell(models) {
  return raise(models, 'building_well_red', 'well');
}

/** The clock tower — the tallest thing on the square, on purpose. */
function buildTower(models) {
  return raise(models, 'building_tower_A_red', 'tower');
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

  const margin = 1.8;
  const from = lo - margin, to = hi + 1 + margin;
  const span = to - from;

  // ONE span, stretched along its length — not a row of repeated arches.
  //
  // This used to tile the model, four copies of a single-arch hex bridge laid
  // end to end. Their decks genuinely did overlap (measured: 3.75-unit
  // segments placed 3.05 apart), so there was no gap in the road — but each
  // copy brings its own arch and its own hump, and four humps in a row reads
  // as four little bridges rather than one crossing, which is exactly how
  // Kevin described it. A single arch spanning the whole river is also just
  // the more confident piece of architecture.
  //
  // Width and height keep their modelled proportions; only the length is
  // stretched, which on a stone arch reads as a longer, shallower span rather
  // than as distortion.
  const widthScale = 3.4 / m.size.x;
  const node = m.scene.clone(true);
  node.scale.set(widthScale, widthScale, span / m.size.z);

  // Sit the DECK above the BANK, and never below the water.
  //
  // Seating it flush with the bank looked right on paper and put the arch
  // underwater in practice: the banks here shelve down to meet the river, so
  // "bank height" at the span's ends is barely above the surface itself. The
  // deck is lifted a real clearance over whichever is higher, the bank or the
  // water, which is what a bridge is for.
  const bankH = Math.max(smoothHeightAt(from, z), smoothHeightAt(to, z));
  const CLEARANCE = 1.15;
  const deckTop = Math.max(bankH + 0.35, WATER_SURFACE + CLEARANCE);
  node.position.set((from + to) / 2, deckTop - m.box.max.y * widthScale, z);
  node.rotation.y = Math.PI / 2;
  g.add(node);
  return g;
}

/** The great gate — where the road out of the village passes the settlement's edge. */
function buildGate(models) {
  return raise(models, 'wall_straight_gate', 'gate');
}

/** The keep — the furthest-off milestone, the settlement's own stronghold. */
function buildDome(models) {
  return raise(models, 'building_castle_green', 'dome');
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
