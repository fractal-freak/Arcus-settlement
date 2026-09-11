/**
 * Ground that is already taken, and the one test everybody asks.
 *
 * There were three copies of this question in the project — one for the
 * sessions, one for the villagers, one for the citizens' own placements — and
 * each knew about a different subset of the world. The sessions knew about
 * houses and trees; the villagers knew about houses and trees; neither had
 * ever heard of the well, and neither had heard of the four hundred crates,
 * hedges and banners the citizens put down after they were written. So people
 * stood inside the wellhead and inside barrels, and Kevin sent screenshots of
 * it twice.
 *
 * One test now, in one place, and anything that adds a new kind of thing to
 * the world adds it HERE rather than to whichever renderer noticed first.
 */

import { PLOTS, CIVIC, propNear, landmarkNear } from './village.js';
import { smoothHeightAt, isWater, WATER_LEVEL, STEP } from './terrain.js';
import { propRadius } from './propSizes.js';

const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;

/**
 * Everything the citizens have finished, as circles to keep out of.
 *
 * Fed from the world feed a few times an hour. Kept as a flat array and
 * scanned linearly: four hundred circles against a dozen people, a handful of
 * times an hour, is not worth a spatial index and would be one more thing to
 * get wrong.
 */
let placed = [];

/** Anything that wants to know when the ground changed under it. */
const listeners = new Set();

let signature = null;

export function setPlacements(placements) {
  // The feed delivers this list every few seconds whether or not a citizen
  // has finished anything, and telling everybody the ground changed makes the
  // villagers all choose new homes — forty-odd searches with a path test each,
  // inside a frame. Checked first, so that only happens when it is true.
  const sig = `${(placements || []).length}:${(placements || []).reduce((h, p) => (h ^ ((p.x * 97 + p.z * 31) | 0)) >>> 0, 17)}`;
  if (sig === signature) return;
  signature = sig;
  placed = (placements || []).map((p) => ({ x: p.x, z: p.z, r: propRadius(p.kind) }));
  for (const fn of listeners) fn();
}

export function onPlacementsChanged(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * Can somebody of this size stand here?
 *
 * `clear` is how far the person reaches from the point being tested — for
 * somebody who paces a circle that is the whole circle, not the middle of it.
 */
export function blocked(x, z, clear = 0.6) {
  if (isWater(Math.round(x), Math.round(z))) return true;
  if (smoothHeightAt(x, z) < WATER_SURFACE + 0.1) return true;
  for (const p of PLOTS) if (Math.hypot(p.x - x, p.z - z) < 5.0 + clear) return true;
  if (CIVIC && Math.hypot(CIVIC.x - x, CIVIC.z - z) < 7.5 + clear) return true;
  if (landmarkNear(x, z, 0.9 + clear)) return true;
  if (Math.hypot(x, z) < 4.4 + clear) return true;          // the Stone's own ground
  // A tree claims its trunk plus its canopy, and propNear already allows 0.85
  // for the jitter that moves a tree off its tile centre — so the extra here
  // is the canopy ALONE (leaf blobs at 0.52 radius scaled to at most 1.3,
  // offset a little, so roughly 0.9 past the trunk, less the 0.85 already
  // counted). Allowing a further 1.5 on top double-counted the same gap twice
  // and ruled out so much ground that a fifth of the village had nowhere to
  // live.
  if (propNear(x, z, clear + 0.4)) return true;
  for (const o of placed) if (Math.hypot(o.x - x, o.z - z) < o.r + clear) return true;
  return false;
}
