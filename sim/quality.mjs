/**
 * What "premium" means, written down as something the settlement can measure
 * about itself.
 *
 * THE WHOLE POINT. Kevin's ask is that the citizens' work is to make the world
 * look more expensive and more intricate, and that this gets BETTER over time
 * rather than merely different. That only compounds if "better" is a number
 * the world can check. A settlement told to make things nicer wanders; a
 * settlement that can see it scores 0.2 on lived-in-ness and 0.8 on density
 * knows exactly what to do next, and so does the next generation of it.
 *
 * So this is the rubric, and it is deliberately the boring kind: eight
 * dimensions, each measured off world state, each scored 0 to 1. Seven are the
 * things that actually separate an expensive-looking game from a cheap one —
 * not lighting tricks, which are a finish, but whether there is anything to
 * look at and whether it was placed by something with intent. The eighth is
 * the Stone, which is not about looking expensive at all: it is the reason
 * there is a settlement here, and tending it is the one job that can never be
 * undone. See SACRED.
 *
 * WHY NOT ASK A MODEL. A language model has opinions about what looks good and
 * cannot see this world, so its opinions would be about games in general. The
 * measurement here is about THIS place: how empty its ground actually is, how
 * many distinct things actually stand in it. A model earns its place reviewing
 * the result — looking at a real screenshot against this rubric and saying
 * where it disagrees — which is a job that only exists once the rubric does.
 */

import { PLOTS, CIVIC, SQUARE, propNear, pathAmountAt, landmarkNear } from '../src/app/village.js';
import { smoothHeightAt, isWater, groundAt, GROUND, STEP, WATER_LEVEL } from '../src/app/terrain.js';
import { clearance, propRadius, propHeight } from '../src/app/propSizes.js';
import { EXTRA_PROJECTS, EXTRA_DIMENSIONS } from './rulebook.mjs';

/**
 * The Stone's own ground, and the one rule that overrides every other rule
 * here.
 *
 * The settlement exists because of the Stone: its founding chart is carved into
 * it, and that chart is fixed forever. So the citizens may NEVER clear, move or
 * take anything from this circle. Everything they bring to it stays, and the
 * only work they can do here is more of it and better. `redundant` refuses to
 * touch anything standing inside this radius, which is what makes that a rule
 * of the world rather than a good intention.
 *
 * The Stone's own body is separately protected — `standable` keeps everything
 * clear of it — so tending it never means leaning a crate against the carving.
 */
export const SACRED = { r: 8.5 };

/**
 * The sightline to the carved face.
 *
 * The chart is cut into the boulder's dressed panel, which faces +Z, and that
 * carving is the whole reason the Stone matters. So the ground directly in
 * front of it stays clear of anything that would stand between a person and
 * the chart. Low things — laid stones, a kerb — are welcome there; a
 * watchtower, a grove or a market stall is not. Nothing enforces this but
 * `standable`, which is why it is written down here as a shape rather than
 * left to the projects to be careful about.
 */
const SIGHTLINE = { halfWidth: 6.0, from: 3.0, to: 26.0, maxHeight: 2.6 };

/**
 * What the settlement measures about itself. `measure` takes the placements and
 * returns 0..1.
 *
 * Each carries its own `want` — what a citizen says they are going to do about
 * it — because a dimension nobody can act on is just a complaint.
 */
export const DIMENSIONS = [
  {
    key: 'sacred',
    name: 'the Stone',
    why: 'The Stone is the reason there is a settlement here. Ground around it that nobody tends says nobody remembers.',
    measure: (p) => saturate(p.filter((x) => x.tag === 'sacred').length / 22),
  },
  {
    key: 'density',
    name: 'detail underfoot',
    why: 'Empty ground is the loudest tell of a cheap game.',
    measure: (p) => saturate(p.length / CAPACITY),
  },
  {
    key: 'variety',
    name: 'variety',
    why: 'The same object repeated reads as cheap however good the object is.',
    measure: (p) => saturate(new Set(p.map((x) => x.kind)).size / 50),
  },
  {
    key: 'livedIn',
    name: 'signs of life',
    why: 'Clutter that implies use is what separates a set from a place.',
    measure: (p) => saturate(p.filter((x) => x.tag === 'clutter').length / 110),
  },
  {
    key: 'silhouette',
    name: 'skyline',
    why: 'A flat skyline reads as flat. Height gives a place a shape from far off.',
    measure: (p) => saturate(p.filter((x) => x.tag === 'tall').length / 70),
  },
  {
    key: 'composition',
    name: 'arrangement',
    why: 'Things placed with intent — around a focal point, along a line — read as designed.',
    // How much of what stands here was put somewhere for a reason, rather than
    // sprinkled evenly, which is what a generator does and a person does not.
    //
    // Two reasons count, and the second was missing for a long while: gathered
    // AROUND something — a doorway, the Stone, the hall — or ranged ALONG
    // something, which is what the shoulder of a lane is. With only the first
    // of those measured, a settlement of eleven houses could never score well
    // however carefully its citizens worked, so they ground at arrangement
    // forever and the chronicle filled with people failing to find room.
    measure: (p) => {
      if (!p.length) return 0;
      const placed = p.filter((x) => {
        if (focalPull(x.x, x.z) < 9) return true;
        const on = pathAmountAt(x.x, x.z);
        return on > 0.12 && on < 0.9;
      }).length;
      return saturate((placed / p.length) * 1.6);
    },
  },
  {
    key: 'transitions',
    name: 'edges',
    why: 'Where the built ends and the wild begins, a hard line reads as a seam.',
    measure: (p) => saturate(p.filter((x) => x.tag === 'edge').length / 90),
  },
  {
    key: 'colour',
    name: 'colour',
    why: 'One accent colour, used sparingly, does more than five used evenly.',
    measure: (p) => saturate(p.filter((x) => x.tag === 'accent').length / 40),
  },
];

/**
 * How much this settlement can usefully hold. Doubles as the target for
 * `density`, so the world reaches full marks for detail exactly as it reaches
 * the point where more would be clutter.
 *
 * These targets were raised a long way after the first real run: at the
 * original numbers a single night away took the settlement from nothing to
 * 0.96 overall, which is the opposite of what this is for. A world that
 * finishes itself by morning has nothing to come back to. At these it takes
 * something like a week of real time to mature, and the last stretch is slow.
 */
export const CAPACITY = 420;

/**
 * The eight above, plus whatever the critic has added since.
 *
 * A generated dimension is always the same shape — count the pieces carrying
 * one tag, against a target — because that is the shape that cannot go wrong:
 * no arbitrary code runs, and a dimension nobody can act on is impossible
 * since the same pass that adds it adds the projects that serve it. Anything
 * malformed never gets here; verify.mjs refuses the whole file.
 */
for (const d of EXTRA_DIMENSIONS) {
  if (DIMENSIONS.some((x) => x.key === d.key)) continue;
  DIMENSIONS.push({
    key: d.key,
    name: d.name,
    why: d.why,
    generated: true,
    measure: (p) => saturate(p.filter((x) => x.tag === d.tag).length / d.target),
  });
}

const saturate = (n) => Math.max(0, Math.min(1, n));

/** Distance to the nearest thing worth gathering around. */
function focalPull(x, z) {
  let best = Math.hypot(x - SQUARE.x, z - SQUARE.z); // the Stone, above all
  if (CIVIC) best = Math.min(best, Math.hypot(x - CIVIC.x, z - CIVIC.z));
  for (const p of PLOTS) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
  return best;
}

/** Score every dimension, and say which one the settlement is worst at. */
export function grade(placements) {
  const scores = {};
  for (const d of DIMENSIONS) scores[d.key] = Number(d.measure(placements).toFixed(3));
  const weakest = DIMENSIONS.reduce((a, b) => (scores[a.key] <= scores[b.key] ? a : b));
  const overall = DIMENSIONS.reduce((sum, d) => sum + scores[d.key], 0) / DIMENSIONS.length;
  return { scores, weakest: weakest.key, overall: Number(overall.toFixed(3)) };
}

/**
 * What a citizen can actually DO about each dimension.
 *
 * Every project names real models from the packs already sitting in the
 * project, the ground rule for where they may go, and how many. `tag` is what
 * the piece counts as when the world next grades itself — which is what closes
 * the loop: a citizen who fences the river path raises `edges`, and the
 * settlement stops asking for fences.
 */
export const PROJECTS = [
  // Work at the Stone. Nothing put here is ever taken away again — see SACRED
  // — so these are the only jobs in the settlement that purely accumulate.
  // Everything is deliberately LOW: a sapling or a stall in front of the
  // carved face would hide the one thing this place is for.
  { key: 'kerb', dim: 'sacred', want: 'to lay a stone kerb around the Stone', needs: 50,
    place: 'shrine', tag: 'sacred', n: 4, kinds: ['fence_stone_straight', 'rock_single_C', 'rock_single_E'] },
  { key: 'votive', dim: 'sacred', want: 'to set banners at the Stone', needs: 44,
    place: 'shrine', tag: 'sacred', n: 4, kinds: ['flag_red', 'flag_yellow', 'flag_green', 'flag_blue'] },
  { key: 'cairns', dim: 'sacred', want: 'to raise cairns at the Stone', needs: 46,
    place: 'shrine', tag: 'sacred', n: 4, kinds: ['resource_stone', 'rock_single_B', 'rock_single_D'] },

  { key: 'woodpile', dim: 'livedIn', want: 'to stack firewood by the doors', needs: 34,
    place: 'byPlot', tag: 'clutter', n: 4, kinds: ['resource_lumber', 'crate_A_small', 'sack'] },
  { key: 'market', dim: 'livedIn', want: 'to set up stalls on the square', needs: 62,
    place: 'square', tag: 'clutter', n: 3, kinds: ['building_stage_A', 'building_stage_B', 'building_stage_C'] },
  { key: 'crates', dim: 'livedIn', want: 'to clear the yards and stack what is left', needs: 30,
    place: 'byPlot', tag: 'clutter', n: 5, kinds: ['crate_B_big', 'crate_B_small', 'crate_open', 'barrel', 'pallet'] },
  { key: 'tools', dim: 'livedIn', want: 'to leave the tools where the work is', needs: 26,
    place: 'byLane', tag: 'clutter', n: 4, kinds: ['wheelbarrow', 'ladder', 'bucket_empty', 'resource_stone'] },

  { key: 'lanterns', dim: 'silhouette', want: 'to raise banners along the lanes', needs: 48,
    place: 'byLane', tag: 'tall', n: 5, kinds: ['flag_red', 'flag_green', 'flag_blue', 'flag_yellow'] },
  { key: 'grove', dim: 'silhouette', want: 'to plant a grove behind the houses', needs: 56,
    place: 'outskirt', tag: 'tall', n: 6, kinds: ['tree_single_A', 'tree_single_B', 'trees_A_large', 'trees_B_large'] },
  { key: 'watchpost', dim: 'silhouette', want: 'to put up a watchpost at the edge', needs: 78,
    place: 'outskirt', tag: 'tall', n: 1, kinds: ['building_tower_base_red', 'building_tower_B_green'] },

  { key: 'hedge', dim: 'transitions', want: 'to hedge where the village meets the wild', needs: 44,
    place: 'rim', tag: 'edge', n: 7, kinds: ['trees_A_small', 'trees_B_small', 'rock_single_A', 'rock_single_C'] },
  { key: 'fences', dim: 'transitions', want: 'to fence the lanes properly', needs: 52,
    place: 'byLane', tag: 'edge', n: 6, kinds: ['fence_wood_straight', 'fence_stone_straight', 'fence_wood_straight_gate'] },
  { key: 'riverbank', dim: 'transitions', want: 'to plant the riverbank', needs: 40,
    place: 'water', tag: 'edge', n: 6, kinds: ['waterplant_A', 'waterplant_B', 'waterlily_A', 'waterlily_B'] },

  { key: 'paving', dim: 'density', want: 'to finish the paving around the square', needs: 58,
    place: 'square', tag: 'plain', n: 6, kinds: ['building_dirt', 'rock_single_D', 'rock_single_E'] },
  { key: 'garden', dim: 'density', want: 'to plant gardens by the doors', needs: 36,
    place: 'byPlot', tag: 'plain', n: 6, kinds: ['building_grain', 'trees_A_small', 'trees_B_small'] },
  { key: 'strays', dim: 'density', want: 'to tidy the odd corners nobody looks at', needs: 32,
    place: 'outskirt', tag: 'plain', n: 6, kinds: ['rock_single_B', 'rock_single_C', 'trees_A_medium'] },

  { key: 'walls', dim: 'variety', want: 'to build a proper wall and gate', needs: 88,
    place: 'rim', tag: 'plain', n: 3, kinds: ['wall_straight', 'wall_corner_A_outside', 'wall_straight_gate'] },
  { key: 'weapons', dim: 'variety', want: 'to fit out the yard for practice', needs: 42,
    place: 'byPlot', tag: 'plain', n: 3, kinds: ['weaponrack', 'target', 'bucket_arrows'] },
  { key: 'longcrates', dim: 'variety', want: 'to bring the long crates up from the river', needs: 38,
    place: 'byLane', tag: 'plain', n: 4, kinds: ['crate_long_A', 'crate_long_B', 'crate_long_C'] },

  { key: 'focal', dim: 'composition', want: 'to gather the yard around one thing', needs: 46,
    place: 'byPlot', tag: 'plain', n: 4, kinds: ['barrel', 'crate_A_big', 'resource_lumber', 'sack'] },
  { key: 'approach', dim: 'composition', want: 'to line the approach to the Stone', needs: 54,
    place: 'square', tag: 'accent', n: 6, kinds: ['flag_red', 'flag_yellow'] },
  { key: 'verges', dim: 'composition', want: 'to range the odds and ends along the lanes', needs: 40,
    place: 'byLane', tag: 'plain', n: 5, kinds: ['rock_single_E', 'crate_open', 'pallet', 'bucket_empty'] },

  { key: 'banners', dim: 'colour', want: 'to hang colour where there is none', needs: 44,
    place: 'byPlot', tag: 'accent', n: 4, kinds: ['flag_green', 'flag_blue'] },
  { key: 'roofs', dim: 'colour', want: 'to bring some colour to the far lane', needs: 50,
    place: 'outskirt', tag: 'accent', n: 3, kinds: ['flag_red', 'flag_yellow', 'building_stage_C'] },
];

// The critic's own jobs, appended after the authored ones so a generated key
// can never shadow one that was written by hand.
for (const p of EXTRA_PROJECTS) {
  if (!PROJECTS.some((x) => x.key === p.key)) PROJECTS.push({ ...p, generated: true });
}

/** Every model any project can ever ask for — what the world has to load. */
export function allKinds() {
  return [...new Set(PROJECTS.flatMap((p) => p.kinds))];
}

/** What each tag is actually doing for the settlement's score. */
const TAG_DIM = { clutter: 'livedIn', tall: 'silhouette', edge: 'transitions', accent: 'colour', plain: 'density', sacred: 'sacred' };

/**
 * Which pieces are worth pulling out.
 *
 * A settlement that can only ADD stops the day it is full, and then every
 * citizen who finishes a job has nowhere to put the result. That is not what a
 * place looks like when people keep working on it — a full town does not stop,
 * it starts REDOING things, and redoing is where the expensive look actually
 * comes from. Nobody makes a street feel costly by putting one more barrel in
 * it.
 *
 * So: when the ground is full, the worst of what stands on it comes out to make
 * room. Worst means three things, and they are the three the rubric already
 * cares about — a piece serving a score that is already full, the twentieth
 * copy of something there are already nineteen of, and anything sitting out on
 * its own where nothing gathers.
 */
export function redundant(placements, scores, want, r, n = 1, rule = null, sparing = []) {
  const counts = new Map();
  for (const p of placements) counts.set(p.kind, (counts.get(p.kind) || 0) + 1);
  const spare = new Set(sparing);

  const ranked = placements.map((p, i) => {
    const dim = TAG_DIM[p.tag] || 'density';
    // THE ONE ABSOLUTE. Nothing at the Stone is ever cleared away, whatever it
    // is and however long it has stood there. Not a low score, not a strong
    // preference — out of the running entirely.
    if (p.tag === 'sacred' || Math.hypot(p.x, p.z) < SACRED.r) return { i, score: -Infinity };
    let score = 0;
    // Doing a job the settlement no longer needs done.
    score += (scores[dim] ?? 0) * 3.0;
    // One of many. The more copies stand here, the less this one is worth.
    score += Math.min(2.0, (counts.get(p.kind) || 1) / 14);
    // Out on its own, where composition says nothing is.
    score += Math.min(2.0, focalPull(p.x, p.z) / 22);
    // In the way. Clearing ground on the far side of the valley does not help
    // somebody who is trying to set a stall on the square — and that mismatch
    // was most of the settlement's failed jobs: room was made, just never
    // where the work was.
    if (rule && inArea(rule, p.x, p.z)) score += 2.5;
    // Never pull out the thing that was just put in to fix what is worst now.
    if (dim === want) score -= 4.0;
    // And never pull out a banner to make room for a banner, which is what
    // this did before and reads as nonsense however true it is.
    if (spare.has(p.kind)) score -= 6.0;
    // A little noise, so the same piece is not always first in the queue.
    return { i, score: score + r() * 0.6 };
  });

  // Anything at the Stone scored -Infinity above and is dropped here, not
  // merely sorted to the back — a settlement with nothing else left to clear
  // must come away empty-handed rather than fall back on sacred ground.
  return ranked.filter((x) => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.i);
}

/** Roughly, is this spot the sort of place that rule puts things? */
function inArea(rule, x, z) {
  const d = Math.hypot(x, z);
  switch (rule) {
    case 'square': return d < SQUARE.r * 1.6;
    case 'byPlot': return focalPull(x, z) < 9;
    case 'byLane': { const on = pathAmountAt(x, z); return on > 0.12 && on < 0.9; }
    case 'rim': return d > SQUARE.r + 5 && d < SQUARE.r + 24;
    case 'outskirt': return d > 24 && d < 62;
    default: return false;
  }
}

/**
 * Pick what to work on next.
 *
 * Mostly the weakest dimension, because that is the whole mechanism — but not
 * always, and the exception matters. A settlement that only ever fixes its
 * worst score converges on flat mediocrity across seven numbers; one that
 * occasionally follows a citizen's own temper instead produces the odd
 * lopsided flourish, which is what a place built by people actually looks
 * like.
 */
export function chooseProject(g, r, citizen, notKey = null) {
  const scores = g?.scores ?? {};
  const weakest = g?.weakest ?? 'density';
  let free = notKey ? PROJECTS.filter((p) => p.key !== notKey) : PROJECTS;
  // Nobody adds to a job that is already done. Without this, the quarter of
  // choices that follow a citizen's own temper rather than the settlement's
  // worst score kept piling work onto dimensions already at full marks — the
  // Stone ended up ringed with forty-seven offerings, and since nothing at the
  // Stone may ever be cleared away, that would have been permanent.
  const unfinished = free.filter((p) => (scores[p.dim] ?? 0) < 0.999);
  if (unfinished.length) free = unfinished;
  const onPoint = free.filter((p) => p.dim === weakest);
  const follow = r() < 0.25 || !onPoint.length;
  const pool = follow ? free : onPoint;
  return pool[Math.floor(r() * pool.length) % pool.length];
}


// ── Where a thing may stand ─────────────────────────────────────────────────
//
// The hub imports the world's OWN village and terrain modules rather than
// carrying a copy of the rules. That is the whole reason nothing the citizens
// build can end up in the river or inside somebody's house: the test that
// decides where a cottage may stand is character-for-character the test that
// decides where a citizen may leave a barrel.

const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;

/**
 * Could a thing of this size stand here at all?
 *
 * `rad` is how far the piece reaches from its own centre, so a garden wall is
 * held further off a doorstep than a sack is. Everything here is a clearance
 * from the CENTRE outward, which is why the radius adds to each one rather
 * than replacing it.
 */
function standable(x, z, rad = 1.0, onPaving = false, height = 1.0) {
  // Nothing tall in front of the carving. See SIGHTLINE.
  if (height > SIGHTLINE.maxHeight
    && Math.abs(x) < SIGHTLINE.halfWidth + rad
    && z > SIGHTLINE.from && z < SIGHTLINE.to) return false;
  if (isWater(Math.round(x), Math.round(z))) return false;
  if (smoothHeightAt(x, z) < WATER_SURFACE + 0.15) return false;
  const g = groundAt(Math.round(x), Math.round(z));
  if (g.kind === GROUND.water || g.kind === GROUND.stone || g.kind === GROUND.snow) return false;
  // Not through a house, not through a tree, and not in the middle of the lane
  // people walk down.
  for (const p of PLOTS) if (Math.hypot(p.x - x, p.z - z) < 4.6 + rad) return false;
  if (CIVIC && Math.hypot(CIVIC.x - x, CIVIC.z - z) < 7.0 + rad) return false;
  if (Math.hypot(x, z) < 3.4 + rad) return false; // the Stone itself, never touched
  if (landmarkNear(x, z, 1.2 + rad)) return false; // the well, the tower, the gate, the keep
  if (propNear(x, z, 0.9 + rad)) return false;
  // Paving is normally a refusal — a barrel in the middle of the road is a
  // barrel in the road. The apron at the Stone is the exception: laying
  // something on the paving IS the work there.
  if (!onPaving && pathAmountAt(x, z) > 0.85) return false;
  return true;
}

/** One candidate spot for a given rule, or null if that throw missed. */
function tryRule(rule, r) {
  const a = r() * Math.PI * 2;
  switch (rule) {
    case 'byPlot': {
      // Just outside somebody's plot: a doorstep, a yard, the side of a house.
      const p = PLOTS[Math.floor(r() * PLOTS.length) % PLOTS.length];
      if (!p) return null;
      const d = 5.0 + r() * 2.6;
      return { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d };
    }
    case 'shrine': {
      // The apron around the Stone, inside the paving, clear of the Stone
      // itself. Two concentric RINGS rather than a scatter across the whole
      // apron — an inner one for what is laid down and an outer one for what
      // stands up. Things at the same distance from a centre read as placed;
      // the same things at random distances read as dropped.
      const d = r() < 0.5 ? 5.4 : 7.6;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d };
    }
    case 'square': {
      // The EDGE of the square, not the middle of it. The middle is paving
      // people cross, and `standable` rightly refuses to put a market stall in
      // the road — which used to mean every square project failed outright and
      // the citizens ground away at arrangement forever. A stall belongs where
      // the paving frays into grass, which is what this looks for.
      for (let i = 0; i < 16; i++) {
        const ang = r() * Math.PI * 2;
        const d = SQUARE.r * 0.55 + r() * (SQUARE.r * 0.9);
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        if (pathAmountAt(x, z) < 0.8) return { x, z };
      }
      return null;
    }
    case 'byLane': {
      // Along a lane but off the tread of it — pathAmountAt is high on the
      // path itself, so aiming for its shoulder puts things where a verge is.
      for (let i = 0; i < 14; i++) {
        const ang = r() * Math.PI * 2;
        const d = 12 + r() * 34;
        const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
        const on = pathAmountAt(x, z);
        if (on > 0.18 && on < 0.8) return { x, z };
      }
      return null;
    }
    case 'outskirt': {
      const d = 26 + r() * 34;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d };
    }
    case 'rim': {
      const d = SQUARE.r + 8 + r() * 14;
      return { x: Math.cos(a) * d, z: Math.sin(a) * d };
    }
    case 'water': {
      // Walk outward until the river is genuinely underfoot, then step back to
      // the last dry ground — the bank itself.
      //
      // The first version watched for the ground dropping below a height
      // threshold instead, and the threshold sat ABOVE ordinary ground level,
      // so it fired on the second step every time and returned a spot in the
      // middle of the square. Asking isWater() is asking the question that was
      // actually meant.
      for (let i = 0; i < 24; i++) {
        const ang = r() * Math.PI * 2;
        for (let d = 8; d < 70; d += 1.0) {
          const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
          if (!isWater(Math.round(x), Math.round(z))) continue;
          for (let back = d - 0.8; back > d - 5; back -= 0.6) {
            const bx = Math.cos(ang) * back, bz = Math.sin(ang) * back;
            if (standable(bx, bz)) return { x: bx, z: bz };
          }
          break; // this bearing meets the water on ground nobody can stand on
        }
      }
      return null;
    }
    default: return null;
  }
}

/**
 * A real spot for a real thing, or null if the settlement has simply run out
 * of room for that kind of work — which is itself worth knowing, and is what
 * eventually pushes a citizen onto a different project.
 *
 * `kind` is not optional in spirit: the clearance test needs to know how big
 * the thing is. The first version of this used one fixed distance for
 * everything, and a garden wall is twenty times the ground of a sack, so a
 * third of the settlement ended up standing inside itself.
 */
export function spotFor(rule, r, taken = [], kind = null) {
  const rad = propRadius(kind);
  const height = propHeight(kind);
  const onPaving = rule === 'shrine';
  for (let i = 0; i < 40; i++) {
    const s = tryRule(rule, r);
    if (!s) continue;
    if (!standable(s.x, s.z, rad, onPaving, height)) continue;
    // Never on top of something already put there, measured against what the
    // two pieces actually are.
    if (taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < clearance(kind, t.kind))) continue;
    return {
      x: Number(s.x.toFixed(2)),
      z: Number(s.z.toFixed(2)),
      rot: Number((rule === 'shrine' ? shrineAngle(s.x, s.z, kind) : r() * 6.283).toFixed(3)),
    };
  }
  return null;
}

/**
 * Which way a thing laid at the Stone should face.
 *
 * Random rotation is right for a barrel in a yard and wrong for everything
 * here: offerings scattered at every angle read as litter, and litter at the
 * Stone is the one thing this ground must never look like. A kerb stone lies
 * ALONG the circle, so three of them in a row read as a kerb; everything else
 * turns to face the Stone, the way a person setting something down would.
 */
const LIES_ALONG = new Set(['fence_stone_straight', 'fence_wood_straight', 'fence_wood_straight_gate']);

function shrineAngle(x, z, kind) {
  // These models run long on their local Z and front onto their local -Z.
  return LIES_ALONG.has(kind) ? Math.atan2(-z, x) : Math.atan2(x, z);
}
