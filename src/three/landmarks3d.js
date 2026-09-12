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
 * The well and other standing landmarks use the CC0 KayKit models. The
 * masonry bridge is built from shared settlement geometry so its rendered
 * paving and the floor beneath moving characters agree.
 */

import { buildBridge } from './bridge3d.js';
import { setBridgeActive } from '../app/bridge.js';
import { Group } from 'three';
import { smoothHeightAt } from '../app/terrain.js';
import { LANDMARKS } from '../app/village.js';

import { loadModels } from './assets.js';

const MODELS = [
  'building_well_red', 'building_tower_A_red',
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
    this.animated = [];
    this.ready = false;
    this._pending = null;
    this._loading = loadModels(MODELS).then((models) => {
      this.models = models;
      this.ready = true;
      if (this._pending) this.sync(this._pending);
    });
  }

  tick(time){for(const node of this.animated)node.userData.bridgeTick(time);}

  /** Adds whichever earned milestone isn't already standing — never rebuilds one that's up. */
  sync(town) {
    if (!town || !town.milestones) return;
    this._pending = town;
    if (!this.ready) return;
    for (const m of town.milestones) {
      if (this.built.has(m.key)) continue;
      const build = BUILDERS[m.key];
      if (!build) continue;
      const node=build(this.models);this.scene.add(node);
      if(node.userData.bridgeTick)this.animated.push(node);
      if(m.key === 'bridge')setBridgeActive(true);
      this.built.add(m.key);
    }
  }
}
