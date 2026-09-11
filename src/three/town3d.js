/**
 * The village: real buildings, earned by real commits.
 *
 * arcus-town.mjs raises one building per 20 commits landed on main. Nothing
 * here invents a building; this module decides only where an already-earned
 * one STANDS and what it looks like — the same division of labour
 * terrain.js/terrain3d.js already runs the landscape on.
 *
 * WHAT CHANGED, AND WHY
 *
 * This used to build every house out of Kenney's modular 1x1x1 wall tiles,
 * stacking them into a rectangle and capping it with a roof slice. That was
 * the root of nearly everything Kevin called out: identical tiles stacked the
 * same way can only ever produce identical boxes, so 133 buildings read as a
 * grey grid rather than a settlement. It is now one COMPLETE modelled
 * building per plot, from KayKit's Medieval Hexagon Pack (CC0 — see
 * public/assets/kaykit/License.txt, read in full before any of it was used).
 * A tavern is a tavern, modelled as one, not a box wearing a tavern's colour.
 *
 * WHERE they stand is village.js's problem, not this module's — a real
 * street plan, with every plot's full footprint tested against the real
 * terrain, which is what stops houses standing in the river or inside a
 * forest.
 *
 * WHICH building lands on which plot:
 *   - `trade` (the real field: 'app', 'site' or 'stores') picks the family.
 *     Dwellings for the app itself, public buildings for the marketing site,
 *     working buildings for the release plumbing.
 *   - `weight` — the real count of distinct files a building's commits
 *     touched — picks the tier inside that family, at the REAL tercile
 *     boundaries of the live data (27 and 44), not round numbers by eye.
 *   - The building shown per plot is the MEDIAN-weight one of its era, not
 *     the heaviest. `weight` is clamped at 60 by arcus-town.mjs and a lot of
 *     real work hits that ceiling, so picking each era's heaviest returned
 *     nine 60s out of seventeen and every building came out the same grand
 *     tier. The median is a representative, and it spreads.
 *   - Plots run outward from the square in build order, so the village reads
 *     outward in time: earliest era on the square, newest at the lane's end.
 *     That is arcus-town.mjs's own stated intent, finally actually true.
 */

import { Group, Vector3 } from 'three';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { PLOTS, PLOT, CIVIC, CIVIC_PLOT } from '../app/village.js';
import { loadModels } from './assets.js';

/**
 * Two colourways rather than the kit's full four. The pack ships blue/red/
 * green/yellow for versus gameplay; a village wants roofs that vary a little,
 * not four team colours, so this takes two and picks between them per plot.
 */
const COLOURS = ['red', 'green'];

const FAMILY = {
  app: ['building_home_A', 'building_home_B', 'building_tavern'],
  site: ['building_market', 'building_windmill', 'building_church'],
  stores: ['building_blacksmith', 'building_lumbermill', 'building_watermill'],
};
const CASTLE = 'building_castle';

/** The real tercile split of the live building weights. */
function tierFor(weight) {
  if (weight <= 27) return 0;
  if (weight <= 44) return 1;
  return 2;
}

function modelFor(b, i) {
  const fam = FAMILY[b.trade] ?? FAMILY.app;
  const colour = COLOURS[Math.floor(hash2(i, 3, 88) * COLOURS.length) % COLOURS.length];
  return `${fam[tierFor(b.weight ?? 20)]}_${colour}`;
}

/** Everything this module may ask for, so it can all be loaded in one pass. */
const MODELS = [
  ...Object.values(FAMILY).flatMap((f) => f.flatMap((m) => COLOURS.map((c) => `${m}_${c}`))),
  ...COLOURS.map((c) => `${CASTLE}_${c}`),
  'building_scaffolding', 'tent', 'resource_lumber', 'resource_stone',
  'crate_A_big', 'barrel',
];

/**
 * How big a KayKit building stands in this world. The kit's own models range
 * from 0.65 units wide (a well) to 2.26 (a castle) — measured out of the
 * .gltf files, not assumed — so a single multiplier would either shrink the
 * cottages to dolls' houses or burst the market out of its plot. Instead the
 * multiplier is capped by what actually fits the plot, which keeps the kit's
 * real size relationships (a market IS the widest thing on the street) while
 * guaranteeing nothing overhangs its neighbour.
 *
 * Raised from 3.2 because at that size a cottage stood barely a head above
 * the people walking past it. These are RTS-scale models — built to read at
 * a glance from a strategy camera, where a building only has to be a bit
 * bigger than a unit — and this is not an RTS camera. A person is 1.8 units;
 * at 5.0 a cottage ridge is about 4.6, roughly two and a half times a person,
 * which is what a real single-storey house with a pitched roof actually is.
 */
const BASE_SCALE = 5.0;

function scaleFor(size, plot) {
  return Math.min(BASE_SCALE, plot.w / size.x, plot.d / size.z);
}

/**
 * Every KayKit building's front is its local -Z. Established by standing one
 * on open ground at zero rotation and walking round it, not assumed.
 *
 * Turning a model to look along a direction (fx, fz) is therefore
 * atan2(-fx, -fz): rotating local -Z by a yaw gives (-sin, -cos), and setting
 * that equal to the facing vector falls out to the negated arguments. The old
 * code added a flat PI to the plan's own yaw instead, which happened to be
 * right for one side of one street and wrong everywhere else — which is why
 * houses faced whichever way they liked rather than the road.
 */
function yawToFace(face) {
  return Math.atan2(-face.x, -face.z);
}

export class Town3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    scene.add(this.group);
    this.builtCount = -1;
    this.ready = false;
    this._pending = null;
    this._loading = loadModels(MODELS).then((models) => {
      this.models = models;
      this.ready = true;
      // Build immediately from whatever the feed already delivered while
      // these were still downloading. Without this the village silently
      // stays empty: the feed's first tick is the only one that ever carries
      // a CHANGED building count, so a sync() that arrives before the models
      // are ready is the only chance there is, and dropping it means nothing
      // ever gets built. The old Kenney tiles were small enough to win that
      // race by luck; complete models are not, and luck is not a mechanism.
      if (this._pending) this.sync(this._pending);
    });
  }

  sync(town) {
    if (!town || !town.buildings) return;
    this._pending = town;
    if (!this.ready) return;
    if (town.buildings.length === this.builtCount) return;
    this.builtCount = town.buildings.length;
    this._rebuild(town.buildings);
  }

  /**
   * One representative building per era of the project's real history.
   *
   * The village has far fewer plots than the town has earned buildings (15
   * against 133 today), so something has to choose. Taking simply the oldest
   * fifteen looked wrong for a reason worth writing down: the real trades
   * cluster in TIME — every one of the first eighteen buildings is 'app' —
   * so the oldest-fifteen village was fifteen houses and not one workshop or
   * market. Splitting the whole history into one era per plot and taking a
   * representative from each keeps all three trades present, and means the
   * village is a picture of the whole project rather than only its first
   * month.
   */
  _erasFor(buildings, count) {
    const n = buildings.length;
    const out = [];
    for (let i = 0; i < count && i < n; i++) {
      const lo = Math.floor((i * n) / count);
      const hi = Math.max(lo + 1, Math.floor(((i + 1) * n) / count));
      const era = buildings.slice(lo, hi).sort((a, b) => (a.weight - b.weight) || (a.n - b.n));
      out.push(era[Math.floor(era.length / 2)]);
    }
    return out;
  }

  _place(modelName, x, z, rot, plot, extraScale = 1) {
    const model = this.models[modelName];
    if (!model) return null;
    const node = model.scene.clone(true);
    const s = scaleFor(model.size, plot) * extraScale;
    node.scale.setScalar(s);
    node.position.set(x, smoothHeightAt(x, z), z);
    node.rotation.set(0, rot, 0);
    this.group.add(node);
    return node;
  }

  _rebuild(buildings) {
    this.group.clear();

    // The last plot is never built on: it is always the settlement's active
    // building site. That is not decoration — arcus-town.mjs really is
    // partway to its next building at every moment (the HUD's "4/20 toward
    // the next"), so something genuinely IS under construction, and this is
    // where the scaffolding and the builders' tents stand. It is also where
    // the "very low income tent homes" in the brief actually belong: the
    // people putting the next house up.
    const siteIndex = PLOTS.length - 1;
    const houses = this._erasFor(buildings, Math.min(siteIndex, buildings.length));

    houses.forEach((b, i) => {
      const plot = PLOTS[i];
      if (!plot) return;
      const node = this._place(modelFor(b, i), plot.x, plot.z, yawToFace(plot.face), PLOT);
      if (node) node.userData.building = b;
    });

    this._buildSite(PLOTS[siteIndex]);

    if (CIVIC) {
      const colour = COLOURS[0];
      this._place(`${CASTLE}_${colour}`, CIVIC.x, CIVIC.z, yawToFace(CIVIC.face), CIVIC_PLOT);
    }
  }

  /** Scaffolding, two tents and the materials, on the plot being built now. */
  _buildSite(plot) {
    if (!plot) return;
    const yaw = yawToFace(plot.face);
    this._place('building_scaffolding', plot.x, plot.z, yaw, PLOT);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (lx, lz) => ({ x: plot.x + (lx * c - lz * s), z: plot.z + (lx * s + lz * c) });
    const small = { w: 1.3, d: 1.3 };
    const t1 = at(-2.2, 1.9); this._place('tent', t1.x, t1.z, yaw + 0.4, small);
    const t2 = at(2.3, 2.0); this._place('tent', t2.x, t2.z, yaw - 0.6, small);
    const l = at(-2.4, -1.6); this._place('resource_lumber', l.x, l.z, yaw + 1.1, small);
    const r = at(2.5, -1.5); this._place('resource_stone', r.x, r.z, yaw - 0.3, small);
    const cr = at(0.4, 2.3); this._place('crate_A_big', cr.x, cr.z, yaw + 0.8, small);
    const ba = at(-1.1, 2.4); this._place('barrel', ba.x, ba.z, yaw, small);
  }
}
