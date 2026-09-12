/**
 * The dig sites, and which one each archaeologist works.
 *
 * Every session standing in this world is an archaeologist — that is what the
 * dig crew's uniform has always meant. Excavation continues while its coding
 * session waits; session status belongs to the ring above the character.
 * The sites are the ruins
 * `terrain.js` already places: broken columns and a fallen slab, two per ten
 * thousand tiles, on a plateau or in a real forest clearing. Nothing new is
 * invented here; this file only finds what the land already has and says who
 * is at which.
 *
 * A HIKE, DELIBERATELY. Nothing inside the settlement counts. A dig is
 * somewhere you go — out past the last house, up on the ridge or deep in the
 * trees — so the band starts well beyond the furthest plot. The reward for
 * panning out across the valley is finding your own sessions out there
 * working, which is the whole reason not to put them on the square.
 *
 * FOUND, NOT STORED. The scan is a pure function of the terrain, run once, and
 * the assignment is a hash of the session id — the same rule the rest of the
 * world runs on. A session works the same site tomorrow because nothing was
 * ever written down that could drift.
 */

import { HERMES_PIT } from './hermes.js';
import { propAt, groundAt, heightAt, isWater, hash2, registerPits, GROUND, WATER_LEVEL, STEP } from './terrain.js';
import { PLOTS, LANDMARKS, landmarkNear } from './village.js';

/**
 * How far out a dig has to be to count as a dig.
 *
 * MEASURED OFF THE VILLAGE, not typed in. The first version used a flat 34
 * units, which sounded like a hike and was not one: the furthest cottage
 * stands at 53 and the great gate at 48, so the nearest "remote" site was
 * sitting in somebody's back field. The band starts a clear walk beyond the
 * last building the settlement has, and moves out on its own if the village
 * ever grows.
 */
const EDGE = Math.max(
  ...PLOTS.map((p) => Math.hypot(p.x, p.z)),
  ...LANDMARKS.map((L) => Math.hypot(L.x, L.z) + L.r),
);
const BAND = { from: EDGE + 34, to: 180 };

/** How far apart two sites must be to be two sites rather than one. */
const APART = 14;

const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;

let cached = null;

/**
 * Every dig site in the valley, nearest first.
 *
 * Scanned once over a quarter-million tiles, which costs a few tens of
 * milliseconds and never happens again. Ruin tiles cluster — the hash that
 * places them can easily fire twice inside a few tiles — so anything within
 * `APART` of a site already found is that same site's other half, not a new
 * one.
 */
export function digSites() {
  if (cached) return cached;
  const found = [];
  const to = Math.ceil(BAND.to);
  for (let x = -to; x <= to; x++) {
    for (let z = -to; z <= to; z++) {
      const d = Math.hypot(x, z);
      if (d < BAND.from || d > BAND.to) continue;
      const p = propAt(x, z);
      if (!p || p.kind !== 'ruins') continue;
      if (isWater(x, z) || heightAt(x, z) < WATER_SURFACE + 0.2) continue;
      if (landmarkNear(x, z, 8)) continue;
      if (found.some((s) => Math.hypot(s.x - x, s.z - z) < APART)) continue;
      const g = groundAt(x, z);
      found.push({
        x, z, d,
        // What the ground says this place is, which is all the name it needs.
        where: g.kind === GROUND.stone ? 'the plateau'
          : g.kind === GROUND.meadow ? 'the clearing'
            : g.kind === GROUND.snow ? 'the snowline' : 'the far field',
      });
    }
  }
  found.sort((a, b) => a.d - b.d);
  cached = found.map((s, i) => ({ ...s, id: `dig${i}` }));
  return cached;
}

/** How big a hole the crew have dug at a site, in world units. */
export const PIT = { r: 4.6, depth: 1.6, wall: 2.1 };

/**
 * Cut the trenches, once, before anything is drawn.
 *
 * Run at import rather than on demand: the ground mesh is built from
 * `smoothHeightAt`, so a chunk built before the pits are registered would be
 * flat where the hole is and would never be rebuilt. Everything that imports
 * this module is imported from main.js, and module bodies run before the first
 * frame, so by the time a chunk is built the ground already knows it has been
 * dug.
 */
registerPits([...digSites().map((s) => ({ x: s.x, z: s.z, ...PIT })), HERMES_PIT]);

/**
 * Which site this session works, and exactly where they stand at it.
 *
 * Sites are shared when there are more archaeologists than ruins, which is the
 * right way round: three people around one trench read as a crew, and one
 * person alone at each of nine sites reads as nine lonely people. Each takes
 * their own bearing off the centre of the site so they face the work and never
 * stand in each other.
 */
export function digFor(id) {
  const sites = digSites();
  if (!sites.length) return null;
  const h = hashId(id);
  const site = sites[h % sites.length];
  // IN the trench, not beside it. They were standing on the lip looking in,
  // which is what a supervisor does; the people doing the digging are down in
  // the cut. Well inside PIT.r, so the ground under them is the dug floor and
  // the walls of the hole rise around them.
  const a = hash2(h, 7, 41) * Math.PI * 2;
  const r = 0.9 + hash2(h, 11, 42) * 1.9;
  return {
    ...site,
    center: { x: site.x, z: site.z },
    x: site.x + Math.cos(a) * r,
    z: site.z + Math.sin(a) * r,
    // Facing the trench, which is the middle of the site.
    look: Math.atan2(-Math.cos(a), -Math.sin(a)),
  };
}

/** Presence supplies the crew; coding-session activity does not stop a dig. */
export function excavationCrew(people) {
  const seen = new Set();
  return (people ?? []).filter(p => {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
