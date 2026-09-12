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

import { hermesBlocked, hermesReserved } from './hermes.js';
import { bridgeFloor, bridgeBlocked, outsideBridgeWorks } from './bridge.js';
import { propNear, landmarkNear, OFFERING } from './village.js';
import { smoothHeightAt, naturalHeightAt, isWater, WATER_LEVEL, STEP } from './terrain.js';
import { realmBlocked, realmFloor } from './realm.js';
import { SpatialIndex } from './spatialIndex.js';
import { propRadius } from './propSizes.js';

const WATER_SURFACE = WATER_LEVEL + STEP * 0.5;

// Nearby placed objects only; queried by moving citizens every frame.
let placed = new SpatialIndex();

/** Anything that wants to know when the ground changed under it. */
const listeners = new Set();

let signature = null;

export function setPlacements(placements) {
  // The feed delivers this list every few seconds whether or not a citizen
  // has finished anything, and telling everybody the ground changed makes the
  // villagers all choose new homes — forty-odd searches with a path test each,
  // inside a frame. Checked first, so that only happens when it is true.
  const sig = JSON.stringify((placements ?? []).map(p => [p.kind, p.x, p.z, p.rot]));
  if (sig === signature) return;
  signature = sig;
  placed = new SpatialIndex();
  for (const p of (placements ?? []).filter(outsideBridgeWorks)) {
    placed.insert({ x: p.x, z: p.z, r: propRadius(p.kind) });
  }
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
  const crossing=bridgeBlocked(x,z,clear);
  if(crossing !== null)return crossing || placed.intersects(x,z,clear);
  if (realmBlocked(x, z, clear)) return true;
  if (realmFloor(x, z) !== null) return placed.intersects(x,z,clear);
  if (isWater(Math.round(x), Math.round(z))) return true;
  // Water follows the natural terrain, exactly as terrain3d.buildWater does.
  // A dry excavation can be below river level without becoming a pond.
  if (naturalHeightAt(x, z) < WATER_SURFACE + 0.1) return true;
  if (hermesBlocked(x, z, clear)) return true;
  if (!hermesReserved(x, z, 0.9 + clear) && landmarkNear(x, z, 0.9 + clear)) return true;
  if (Math.hypot(x - OFFERING.x, z - OFFERING.z) < OFFERING.r + clear) return true;
  if (Math.hypot(x, z) < 4.4 + clear) return true;          // the Stone's own ground
  // A tree claims its trunk plus its canopy, and propNear already allows 0.85
  // for the jitter that moves a tree off its tile centre — so the extra here
  // is the canopy ALONE (leaf blobs at 0.52 radius scaled to at most 1.3,
  // offset a little, so roughly 0.9 past the trunk, less the 0.85 already
  // counted). Allowing a further 1.5 on top double-counted the same gap twice
  // and ruled out so much ground that a fifth of the village had nowhere to
  // live.
  if (propNear(x, z, clear + 0.4)) return true;
  return placed.intersects(x, z, clear);
}

/** The actual floor under feet, including elevated walkable structures. */
export function walkingHeightAt(x,z){return bridgeFloor(x,z) ?? realmFloor(x,z) ?? smoothHeightAt(x,z);}
