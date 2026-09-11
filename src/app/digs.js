/**
 * The dig sites, and which one each archaeologist works.
 *
 * Every session standing in this world is an archaeologist — that is what the
 * dig crew's uniform has always meant — and when a session is WORKING, it is
 * working a site, not standing about on the square. The sites are the ruins
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

import { propAt, groundAt, smoothHeightAt, isWater, hash2, GROUND, WATER_LEVEL, STEP } from './terrain.js';
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
const BAND = { from: EDGE + 22, to: 165 };

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
      if (isWater(x, z) || smoothHeightAt(x, z) < WATER_SURFACE + 0.2) continue;
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
  const a = hash2(h, 7, 41) * Math.PI * 2;
  const r = 2.2 + hash2(h, 11, 42) * 1.6;
  return {
    ...site,
    x: site.x + Math.cos(a) * r,
    z: site.z + Math.sin(a) * r,
    // Facing the trench, which is the middle of the site.
    look: Math.atan2(-Math.cos(a), -Math.sin(a)),
  };
}

function hashId(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
