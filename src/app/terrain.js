/**
 * What is underfoot, anywhere, forever.
 *
 * Terrain is a pure function of tile coordinates and a seed. Nothing is stored,
 * so a chunk can be thrown away the moment it leaves the screen and come back
 * identical hours later — which is the only way an unbounded world stays
 * affordable.
 *
 * NOTHING HERE IS BUILT. No paving, no roads, no reserved square — those are a
 * citizen's doing, not this file's, and stay that way. What changed in this
 * pass is purely the SHAPE of the land: one real river instead of a scatter of
 * disconnected channels, a coastline in one consistent direction, terrain that
 * grows from gentle to properly mountainous with distance, and trees that grow
 * in real forests with real clearings between them rather than a uniform
 * sprinkle. None of that is construction — it is geography, the kind a town
 * gets founded into, not the kind a town builds.
 *
 * One earlier line is walked back on purpose: "no bias toward gentler ground
 * nearby" is no longer quite true — amplitude now grows smoothly with distance
 * from the origin, so nearby land reads calmer than the mountains framing it
 * from far off. That is a continuous gradient with no edge to it anywhere, not
 * a flattened, reserved plot — a valley shaped by geology, not a lot cleared
 * for a foundation. Worth being honest that it is still a change of mind from
 * what this file said a day ago.
 *
 * The world still has no boundary. Mountains get taller with distance and keep
 * getting taller — climbable, not a wall — because nothing here is allowed to
 * make a tile impassable, and no coordinate is ever treated as the edge of
 * anything.
 */

import { weatherPalaceRidge } from './palaceLandscape.js';
const SEED = 0x5eed1a;

/** Cheap integer hash. Deterministic across machines and runs, which matters. */
function hash2(x, y, salt = 0) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + salt * 1442695040888963407 + SEED;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise, good enough for gentle regions and far cheaper than Perlin. */
function noise(x, y, salt = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, salt), b = hash2(xi + 1, yi, salt);
  const c = hash2(xi, yi + 1, salt), d = hash2(xi + 1, yi + 1, salt);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const clamp01 = (t) => Math.min(1, Math.max(0, t));
/** Smooth 0-1 ramp between two edges — a gentle transition, never a hard line. */
const smoothstep = (lo, hi, x) => { const t = clamp01((x - lo) / (hi - lo)); return t * t * (3 - 2 * t); };

/**
 * Kept as a compatibility no-op for the hub feed. The former island radius
 * made the settlement look like it was floating over a void. The world is now
 * unbounded, and coastline is part of the procedural terrain instead.
 */
export const setLandRadius = () => {};
export const landRadius = () => Infinity;

export const GROUND = {
  void:   'void',
  grass:  'grass',
  meadow: 'meadow',
  scrub:  'scrub',
  stone:  'stone',
  snow:   'snow',
  sand:   'sand',
  water:  'water',
};

// ── Elevation ───────────────────────────────────────────────────────────────

/** Height of one terrace step — only the blocky renderer's heightAt() still uses this. */
export const STEP = 0.55;
/** Everything below this is under water. */
export const WATER_LEVEL = 0;

/**
 * ONE river, wandering, rather than however many the old scattered-threshold
 * noise happened to carve. A river is a PATH here — a centreline that drifts
 * slowly with distance along it — not a region picked out of open noise, which
 * is what let the old version put a dozen disconnected channels anywhere in
 * the world that happened to roll the right number, chaotic by construction.
 *
 * The centreline is deliberately phased to pass close to the origin, the same
 * way a real river valley is generally what a town gets founded next to
 * rather than the other way around — geography first, settlement after.
 */
function riverCenterX(z) {
  return (noise(z / 65 + 31.4, 5, 50) - 0.5) * 100 + 6;
}
const RIVER_HALF_WIDTH = 5.5;
const RIVER_DEPTH = 2.2;

/**
 * The coastline. Open water in one consistent direction — south, decreasing
 * Z — far enough out that it is a real destination to walk to, not something
 * sitting at the edge of a map that does not have edges. Nothing on the other
 * three sides is held back to make room for it; north, east and west simply
 * keep being ordinary inland terrain for as long as anyone travels that way.
 */
const OCEAN_NEAR = -230;   // where the land starts sloping down
const OCEAN_FAR = -340;    // where it is fully open water

/**
 * How dramatic the land is, at this distance from the origin.
 *
 * 1 near the origin — a real valley, not a flattened one, still has hills and
 * water and rough ground, just modest ones — rising smoothly toward proper
 * mountains the further out it is asked about. Saturates rather than growing
 * forever, so distant terrain is tall and dramatic without becoming absurd,
 * but there is no distance at which this stops or turns into a wall: it never
 * reaches a value that makes a slope unclimbable, only steeper to look at.
 */
function reliefAt(d) {
  return 0.62 + 1.9 * smoothstep(60, 420, d);
}

/**
 * The land's shape, before any decision about how to RENDER it.
 *
 * Takes float world coordinates, not just tile integers — a heightmap mesh
 * needs to sample well inside a tile, and this is the one formula both the
 * blocky renderer's terraced heightAt() and the smooth renderer's continuous
 * smoothHeightAt() are built from, so the two can never silently disagree
 * about the shape of a hill.
 */
/** The old kingdom occupies a weather-cut ridge above the river clearing. */
export function castleReliefAt(x,z) {
  const dx=x+57,dz=z+45,angle=Math.atan2(dz,dx);
  const warp=1+.13*Math.sin(angle*3+.4)+.08*Math.sin(angle*5-1.1);
  const radius=Math.hypot(dx/29,dz/27)/warp;
  const shelf=8.2*(1-smoothstep(.69,1.25,radius));
  const spur=10*Math.exp(-((x+86)**2/450+(z+70)**2/650));
  const ridge=2.2*Math.exp(-((x+77)**2/150+(z+39)**2/500));
  const gullies=(noise(x/5.7,z/5.7,76)-.5)*2.8*smoothstep(.6,.85,radius)*(1-smoothstep(1.05,1.38,radius));
  return Math.max(0,shelf+spur+ridge+gullies);
}

function rawHeightAt(x, z) {
  const d = Math.hypot(x, z);
  const relief = reliefAt(d);

  const hills = (noise(x / 26, z / 26, 41) * 2.0 + noise(x / 11, z / 11, 42) * 0.8) * relief;
  let h = hills + castleReliefAt(x,z);

  // The one river. Distance to its centreline at this Z, carved with a smooth
  // bank rather than a hard-edged channel, width itself wandering a little so
  // it does not read as a perfectly uniform canal.
  const width = RIVER_HALF_WIDTH * (0.8 + 0.5 * noise(z / 40, 90, 51));
  const distToRiver = Math.abs(x - riverCenterX(z));
  const riverPull = 1 - smoothstep(width * 0.5, width, distToRiver);
  h -= RIVER_DEPTH * riverPull;

  // The coastline: land eases down into the sea as Z drops toward OCEAN_FAR.
  const coast = smoothstep(OCEAN_NEAR, OCEAN_FAR, z);
  h -= coast * 6;
  h = weatherPalaceRidge(x,z,h);

  // The builders cut a level court into the ridge and a long approach into
  // its southern face. Ground stays below the shared architectural floors.
  const courtEdge=Math.max(Math.abs(x+55)-16,Math.abs(z+42)-13);
  const terrace=1-smoothstep(0,4,courtEdge);
  h+=(Math.min(h,9.75)-h)*terrace;
  if(z>=-29.1 && z<-13 && Math.abs(x+55)<4.2){
    const t=Math.min(1,(-13-z)/16.1),start=rawHeightAt(x,-13);
    const road=start*(1-t)+10.1*t-.09;
    h+=(Math.min(h,road)-h)*(1-smoothstep(2.6,4.2,Math.abs(x+55)));
  }
  // A shallow drainage cutting exposes the bridge arches; the route stays on
  // the shared structural deck above, and both abutments still meet real ground.
  const bridgeCut=smoothstep(-28,-25.8,z)*(1-smoothstep(-17,-13.3,z))*(1-smoothstep(3.1,5.1,Math.abs(x+55)));
  h-=2.0*bridgeCut;

  // A river channel or a shoreline is a slope, never a chasm: the water
  // surface draws at a fixed WATER_LEVEL, so ground cut too far below that
  // leaves it floating over open space with the real bed far underneath —
  // seen at a grazing angle as a jumble of grey, streaky geometry, not a
  // lake. Clamping the floor keeps the surface and the bed close enough to
  // read as one body of water.
  return Math.max(WATER_LEVEL - STEP, h);
}

/**
 * How close a point is to the river or the coast — 0 well inland, rising to 1
 * at the waterline. Deliberately a WIDER band than the river's own carved
 * width, so the beach reads as a strip along the bank rather than just the
 * wet edge itself. Kept separate from the height carve above: this only ever
 * feeds ground classification, never the terrain's actual shape.
 */
function shoreAt(x, z) {
  const width = RIVER_HALF_WIDTH * (0.8 + 0.5 * noise(z / 40, 90, 51));
  const distToRiver = Math.abs(x - riverCenterX(z));
  const riverShore = 1 - smoothstep(width, width * 2.4, distToRiver);
  const coast = smoothstep(OCEAN_NEAR, OCEAN_FAR, z);
  return Math.max(riverShore, coast);
}

/** Every height in the blocky world lands on a shelf — the terracing that gives it cliffs. */
const snap = (h) => Math.round(h / STEP) * STEP;

/** The blocky renderer's height: terraced, and only ever asked for whole tiles. */
export const heightAt = (tx, ty) => snap(rawHeightAt(tx, ty));

/**
 * The trenches, cut into the ground by the people digging them.
 *
 * THE ONE THING THIS FILE LETS ANYONE ELSE CHANGE, and it is deliberately
 * push, not pull. A dig site is found by scanning for ruins, which asks this
 * file where the ground is — so if this file asked back where the digs are,
 * the two would chase each other forever. Instead app/digs.js does its scan
 * against the natural ground and then hands the results here, once, before
 * anything is drawn. Nothing in here imports anything.
 *
 * Registered pits change SMOOTH height only, which is the height everything
 * standing on the ground uses. `rawHeightAt` stays the natural hillside, so a
 * second scan would find the same sites in the same places.
 */
let pits = [];

export function registerPits(list) {
  pits = (list || []).map((p) => ({ x: p.x, z: p.z, r: p.r ?? 4.2, depth: p.depth ?? 1.5, wall: p.wall ?? 1.9 }));
}

function pitAt(x, z) {
  let cut = 0;
  for (const p of pits) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.r) continue;
    // Flat floor in the middle, walls easing up to ground level at the rim —
    // a cutting, not a crater.
    const t = Math.min(1, (p.r - d) / p.wall);
    cut = Math.max(cut, p.depth * t * t * (3 - 2 * t));
  }
  return cut;
}

/**
 * The smooth renderer's height: continuous, and meant to be sampled anywhere —
 * at a vertex a fraction of a tile apart from its neighbour, under a tree
 * jittered off the tile centre, under the camera. No two callers of this can
 * ever land on a different number for the same point, which is what makes
 * adjoining chunks of heightmap meet without a seam.
 */
export const smoothHeightAt = (x, z) => rawHeightAt(x, z) - (pits.length ? pitAt(x, z) : 0);

/**
 * The hillside as it was before anybody dug it.
 *
 * Water is the caller that needs this. A trench is a hole in dry ground, and
 * the renderer decides where to draw a water surface by asking how low the
 * ground is — so with the dug height it cheerfully filled every archaeological
 * cutting in the valley with a neat blue pond. Whether there is water
 * somewhere is a question about the LANDSCAPE, not about what has been done
 * to it since.
 */
export const naturalHeightAt = (x, z) => rawHeightAt(x, z);

/**
 * How much of this point is inside a cutting: 0 on undisturbed ground, 1 on
 * the floor of a trench. The renderer uses it to strip the grass off ground
 * somebody has just dug up and to paint what is left as bare earth — without
 * it a hole in a meadow is a hole full of meadow, which reads as a dent.
 */
/**
 * Is there any cutting at all in this neighbourhood?
 *
 * Asked ONCE per chunk, so the per-tile and per-vertex tests below can be
 * skipped entirely for the overwhelming majority of the valley that nobody
 * has dug. Without it, building a chunk meant thirty distance checks for
 * every tile AND every vertex of it, which is fifty thousand of them for a
 * chunk that contains no hole — and chunk builds happen while you are
 * panning, which is exactly when a frame cannot afford it.
 */
export function anyPitWithin(x, z, radius) {
  for (const p of pits) if (Math.hypot(x - p.x, z - p.z) < p.r + radius) return true;
  return false;
}

export function nearPit(x, z, margin = 0) {
  for (const p of pits) if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return true;
  return false;
}

export function digAmountAt(x, z) {
  if (!pits.length) return 0;
  let most = 0;
  for (const p of pits) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d >= p.r) continue;
    const t = Math.min(1, (p.r - d) / p.wall);
    most = Math.max(most, t * t * (3 - 2 * t));
  }
  return most;
}

/** Is this point under water? Works with either height function's own notion of a tile. */
export const isWater = (tx, ty) => rawHeightAt(tx, ty) < WATER_LEVEL + STEP * 0.5;

// ── Ground material ──────────────────────────────────────────────────────────

/**
 * The ground at one tile.
 *
 * Reads real elevation now, not just horizontal noise — sand hugs the water,
 * grass fills the valley, stone shows on steep or elevated ground, and snow
 * caps whatever gets genuinely high. A tier is still softened by ordinary 2D
 * noise underneath it, so the line between two bands is a coastline, not a
 * ruler stroke.
 */
export function groundAt(tx, ty) {
  const h = rawHeightAt(tx, ty);

  // Real elevation decides water, not a separate, disconnected noise field
  // the height formula knew nothing about.
  if (h < WATER_LEVEL + STEP * 0.5) return { kind: GROUND.water, variant: (hash2(tx, ty, 13) * 3) | 0 };

  // Snow caps the genuinely high ground. The threshold rides on reliefAt, so
  // snow appears only where the land itself has actually risen to earn it —
  // it is not a fixed height that mountains reach and the valley never does
  // by definition, it is "high for wherever this happens to be."
  const ridge=castleReliefAt(tx,ty);
  if(ridge>1.5) {
    const slope=Math.hypot(rawHeightAt(tx+.5,ty)-rawHeightAt(tx-.5,ty),rawHeightAt(tx,ty+.5)-rawHeightAt(tx,ty-.5));
    return {kind:slope>.38 || ridge>8.8?GROUND.stone:GROUND.meadow,variant:(hash2(tx,ty,14)*3)|0};
  }
  const relief = reliefAt(Math.hypot(tx, ty));
  if (h > 3.6 + 1.3 * (relief - 0.62)) {
    return { kind: GROUND.snow, variant: Math.min(2, (noise(tx / 6, ty / 6, 17) * 2.4) | 0) };
  }

  // Rocky ground on the high noise, scrub on the low, grass and meadow between.
  const rock = noise(tx / 21, ty / 21, 1);
  if (rock > 0.76 || h > 2.6) return { kind: GROUND.stone, variant: (hash2(tx, ty, 14) * 3) | 0 };

  // What is left is the low tier, and it splits into beach/riverbank versus
  // valley floor by PROXIMITY to actual water, not by absolute height. Near
  // the origin, relief is gentle enough that nearly the whole valley floor
  // sits within a narrow height band regardless of how far it is from the
  // river — a height-only sand cutoff read almost that entire band as one
  // long beach. Distance to the water's edge is what a shoreline actually is.
  if (shoreAt(tx, ty) > 0.25) return { kind: GROUND.sand, variant: (hash2(tx, ty, 13) * 3) | 0 };

  const lush = noise(tx / 15, ty / 15, 2);
  let kind = GROUND.grass;
  if (lush > 0.62) kind = GROUND.meadow;
  else if (lush < 0.34) kind = GROUND.scrub;
  // Shade from SMOOTH noise, not a per-tile hash. A hash gives a checkerboard;
  // this gives soft patches, which is most of the difference between a tile
  // grid and a meadow.
  return { kind, variant: Math.min(3, (noise(tx / 4.5, ty / 4.5, 16) * 4.2) | 0) };
}

/**
 * Scenery standing on a tile, or null.
 *
 * Kept out of the baked ground so it can sort against characters by depth —
 * a citizen has to be able to walk behind a tree.
 *
 * Trees used to roll independently on every eligible tile — every one of them
 * decided for itself, with nothing to say a stand of trees ought to hang
 * together. FOREST is a broad, slow-moving noise field layered on top of that
 * same roll: where it is high, the existing chance of a tree is left alone or
 * boosted; where it is low, trees are suppressed outright regardless of what
 * the per-tile roll would have said. The result is real forests with real
 * open ground between them, at the scale of dozens of tiles, not a texture.
 */
function forestAt(tx, ty) {
  return noise(tx / 42, ty / 42, 60);
}

/**
 * 'ruins' is the one deliberate placement in here — everything else is
 * density and clustering, but a dig site is meant to be found, not simply
 * generated densely enough to run into. Two spots only: a plateau (on stone,
 * "elevated ground") or a genuine forest clearing (low `forest`, so it is
 * ringed by real trees, not an accident of the forest field itself being
 * thin there) — both far rarer than any other prop this function places.
 *
 * The thresholds were loosened once these became the archaeologists' actual
 * WORKPLACES (see app/digs.js). At the original rarity the whole valley held
 * six sites and the nearest one beyond the village was a hundred and twenty
 * units out, so a session that went to work vanished off the edge of anything
 * you would ever look at. Still rare — about three in a thousand eligible
 * tiles — just no longer so rare that the world has nowhere to dig.
 */
export function propAt(tx, ty) {
  const g = groundAt(tx, ty);
  if (g.kind === GROUND.water || g.kind === GROUND.sand) return null;

  const r = hash2(tx, ty, 21);
  const forest = forestAt(tx, ty);

  if (g.kind === GROUND.snow) {
    // Sparse, hardy treeline growth — never dense the way a lowland forest
    // can be, and marked as 'pine' so the renderer can give it a frostier
    // tint without a whole second tree asset.
    if (forest > 0.58 && r > 0.90) return { kind: 'pine', variant: (hash2(tx, ty, 28) * 3) | 0 };
    return null;
  }
  if (g.kind === GROUND.stone) {
    // A dig site on the plateau: rarer than an ordinary boulder by two
    // orders of magnitude, and checked first so it never has to compete
    // with the much more common rock roll for the same high draw of r.
    if (r > 0.9972) return { kind: 'ruins', variant: (hash2(tx, ty, 29) * 3) | 0 };
    if (r > 0.88) return { kind: 'rock', variant: (hash2(tx, ty, 22) * 2) | 0 };
    return null;
  }
  if (g.kind === GROUND.meadow) {
    // Below the forest threshold this tile is meant to be open ground, full
    // stop — no roll for a tree happens at all, which is what leaves a
    // genuine clearing instead of merely a thinner sprinkle. A ruin only
    // ever lands inside that clearing, on purpose — "hidden" means the
    // trees around it are real trees, not a gap in the forest field itself.
    if (forest < 0.46) {
      if (r > 0.9986) return { kind: 'ruins', variant: (hash2(tx, ty, 29) * 3) | 0 };
      if (r > 0.985) return { kind: 'bush', variant: (hash2(tx, ty, 24) * 2) | 0 };
      return null;
    }
    const treeChance = forest > 0.62 ? 0.78 : 0.90;   // denser core, looser edge
    if (r > treeChance) return { kind: 'tree', variant: (hash2(tx, ty, 23) * 3) | 0 };
    if (r > 0.72) return { kind: 'bush', variant: (hash2(tx, ty, 24) * 2) | 0 };
    return null;
  }
  if (g.kind === GROUND.scrub) {
    if (r > 0.93) return { kind: 'bush', variant: (hash2(tx, ty, 25) * 2) | 0 };
    return null;
  }
  // Plain grass: the same clearing logic, a little more permissive.
  if (forest < 0.40) {
    if (r > 0.9996) return { kind: 'ruins', variant: (hash2(tx, ty, 29) * 3) | 0 };
    if (r > 0.97) return { kind: 'tuft', variant: (hash2(tx, ty, 27) * 2) | 0 };
    return null;
  }
  const treeChance = forest > 0.58 ? 0.94 : 0.975;
  if (r > treeChance) return { kind: 'tree', variant: (hash2(tx, ty, 26) * 3) | 0 };
  if (r > 0.90) return { kind: 'tuft', variant: (hash2(tx, ty, 27) * 2) | 0 };
  return null;
}

export { noise, hash2 };
