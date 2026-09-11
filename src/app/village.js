/**
 * The village PLAN: where the square is, where the streets run, and which
 * plots front them.
 *
 * This exists because scattering buildings on a sunflower spiral — which is
 * what this used to do — produces a field of houses, never a village. A
 * spiral guarantees only that two buildings never overlap each other. It
 * knows nothing about the river, so houses stood in the water; nothing about
 * the forest, so houses stood in the trees; and nothing about frontage, so
 * every house faced a different way and the whole thing read as scattered
 * rubble rather than somewhere anyone lives.
 *
 * A real village is streets first, buildings second. So: a square at the
 * origin (where the Settlement Stone already stands), a handful of streets
 * leading out of it, and plots offered along both sides of each street,
 * facing it. Houses in a row, fronts aligned, is most of what makes a place
 * look designed rather than generated.
 *
 * NOTHING here is hardcoded terrain knowledge. The street directions are
 * authored — that is a composition choice, and the one thing a generator is
 * bad at — but every individual plot is accepted or rejected by testing the
 * REAL ground under its REAL footprint, tile by tile, against the same
 * terrain functions the landscape itself is built from. A plot with one
 * corner in the river is rejected, not nudged and hoped over. That is the
 * fix for "houses on top of the water": the old check tested the single
 * point at a building's centre, so a three-wide house standing one step from
 * the bank put half of itself in the river and passed.
 *
 * Pure data and pure maths — no Three.js — so terrain3d.js can ask it what
 * ground is spoken for (and keep trees and long grass off it) without either
 * module having to wait for the other, and without the feed being involved
 * at all. The plan is the same on every load.
 */

import { smoothHeightAt, isWater, groundAt, propAt, GROUND } from './terrain.js';

/** The square: open ground around the Settlement Stone, never built on. */
export const SQUARE = { x: 0, z: 0, r: 12.0 };

/**
 * Authored street skeleton. Angles are world radians, (cos, sin) → (x, z).
 * These four were chosen against the real generated landscape:
 *   - `bridge` runs east out of the square to meet the river crossing that
 *     landmarks3d.js already builds at z=0, so the main street actually
 *     leads somewhere instead of stopping in a field.
 *   - `west` runs into the large open meadow west of the square, which is
 *     the emptiest buildable ground anywhere near the centre.
 *   - `north` and `south` are the cross streets, kept shorter.
 * Lengths are generous; the ground test below is what really decides how
 * far the village actually reaches.
 */
const STREETS = [
  { key: 'bridge', angle: 0, from: 13.0, to: 20, halfWidth: 2.6 },
  { key: 'west', angle: Math.PI, from: 13.0, to: 64, halfWidth: 2.6 },
  { key: 'north', angle: -Math.PI / 2 - 0.30, from: 13.0, to: 56, halfWidth: 2.3 },
  { key: 'south', angle: Math.PI / 2 + 0.22, from: 13.0, to: 46, halfWidth: 2.3 },
];

/** How far apart plots sit along a street, and how far back from its centre. */
const PITCH = 13.0;
const SETBACK = 7.4;

/** A plot's own footprint, in world units. Houses are placed to fit inside this. */
export const PLOT = { w: 7.0, d: 7.0 };

/**
 * Ground a building can actually stand on. Deliberately strict: sand is
 * excluded as well as water, because a house pitched on the riverbank looks
 * like a mistake even when it is technically dry, and stone/snow are the
 * plateau and the peaks.
 */
function buildable(x, z) {
  if (isWater(x, z)) return false;
  const g = groundAt(Math.round(x), Math.round(z));
  if (g.kind === GROUND.water || g.kind === GROUND.sand
    || g.kind === GROUND.stone || g.kind === GROUND.snow) return false;
  return true;
}

/** Steepest step to any neighbour — a house wants ground that is nearly level. */
function slopeAt(x, z) {
  const h = smoothHeightAt(x, z);
  let m = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    m = Math.max(m, Math.abs(smoothHeightAt(x + dx, z + dz) - h));
  }
  return m;
}

const MAX_SLOPE = 0.22;

/**
 * Tests the WHOLE footprint plus a half-unit margin, on a one-unit lattice,
 * rather than the centre point. The margin is what stops a house from
 * standing with its wall flush against the waterline.
 */
function footprintOk(cx, cz, w, d, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const hw = w / 2 + 0.5, hd = d / 2 + 0.5;
  for (let lx = -hw; lx <= hw + 1e-6; lx += 1) {
    for (let lz = -hd; lz <= hd + 1e-6; lz += 1) {
      const x = cx + (lx * c - lz * s);
      const z = cz + (lx * s + lz * c);
      if (!buildable(x, z)) return false;
      if (slopeAt(x, z) > MAX_SLOPE) return false;
    }
  }
  return true;
}

/**
 * Every candidate plot along every street, nearest the square first.
 *
 * Ordering matters and is not cosmetic: arcus-town.mjs's own comment says
 * "the oldest work stands nearest the square, and the town grows outward,"
 * so the plot list is sorted by real distance from the square and filled in
 * that order. The first building a settlement ever earned is the one on the
 * square; the newest is out at the edge of the lane.
 */
/**
 * Nearest two plot centres may come. Two streets leaving the same square
 * inevitably offer plots that land almost on top of each other near the
 * junction — the first pass of this had a north-street plot and a
 * west-street plot 0.3 units apart, which is two houses in the same hole.
 * Candidates are gathered, sorted by distance from the square, then accepted
 * greedily: nearest the square wins the ground, anything too close to an
 * already-accepted plot is dropped.
 */
const MIN_GAP = 11.5;

/**
 * The civic plot: a single larger site on the rim of the square, for the
 * capital building. Hand-placed in the sense that it is deliberately ON the
 * square rather than out on a lane — a seat of government belongs facing the
 * place people gather — but WHERE on the rim is found by testing, sweeping
 * around the square and taking the first bearing whose bigger footprint sits
 * on ground as good as any house's. Its own front turns back to face the
 * Settlement Stone at the centre.
 *
 * Chosen BEFORE the house plots, and this order is the whole point: when the
 * houses were laid out first they ringed the square completely, and every
 * one of the forty-eight bearings the capital tried was either over the river
 * or already too close to somebody's cottage, so the capital silently did not
 * get built at all. The most important building in the settlement gets first
 * claim on the ground; the houses work around it.
 */
export const CIVIC_PLOT = { w: 11.0, d: 9.0 };

function findCivic() {
  const radius = SQUARE.r + CIVIC_PLOT.d / 2 + 0.5;
  // Sweep out from due north, alternating either way, and take the first
  // bearing whose full footprint stands on good ground.
  for (let step = 0; step < 48; step++) {
    const a = -Math.PI / 2 + (step % 2 ? -1 : 1) * Math.ceil(step / 2) * (Math.PI / 24);
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    // The capital looks in at the Settlement Stone in the middle of the square.
    const r = Math.hypot(x, z) || 1;
    const face = { x: -x / r, z: -z / r };
    const rot = Math.atan2(face.x, face.z);
    if (!footprintOk(x, z, CIVIC_PLOT.w, CIVIC_PLOT.d, rot)) continue;
    return { x, z, rot, face };
  }
  return null; // nowhere on the rim — the capital doesn't stand, same rule as everything else here
}

export const CIVIC = findCivic();

/** Clearance a house plot must keep from the capital's own footprint. */
const CIVIC_CLEAR = 14.0;

function buildPlan() {
  const candidates = [];
  for (const st of STREETS) {
    const c = Math.cos(st.angle), s = Math.sin(st.angle);
    for (let t = st.from; t <= st.to; t += PITCH) {
      for (const side of [-1, 1]) {
        // Perpendicular offset to the side of the street.
        const px = c * t + (-s) * side * (st.halfWidth + SETBACK);
        const pz = s * t + (c) * side * (st.halfWidth + SETBACK);
        // Which way the house must LOOK: straight back at the centreline of
        // the street it fronts. Stored as a direction rather than a yaw,
        // because a yaw only means something once you know which way the
        // model faces, and that is the renderer's business, not the plan's.
        // The plot sits at the centreline plus `side` times the perpendicular
        // (-sin, cos), so facing the street is exactly the opposite of that.
        const face = { x: -side * -Math.sin(st.angle), z: -side * Math.cos(st.angle) };
        const rot = Math.atan2(face.x, face.z);
        if (Math.hypot(px, pz) < SQUARE.r + 1.0) continue;
        if (CIVIC && Math.hypot(px - CIVIC.x, pz - CIVIC.z) < CIVIC_CLEAR) continue;
        if (!footprintOk(px, pz, PLOT.w, PLOT.d, rot)) continue;
        candidates.push({ x: px, z: pz, rot, face, street: st.key, dist: Math.hypot(px, pz) });
      }
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);

  const plots = [];
  for (const c of candidates) {
    if (plots.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < MIN_GAP)) continue;
    plots.push(c);
  }
  return plots;
}

export const PLOTS = buildPlan();

/**
 * Tiles the village has spoken for — plot footprints, street surfaces and
 * the square. Built once, as a Set of tile keys, because terrain3d.js asks
 * this question for every tile of every chunk it streams in and a per-tile
 * loop over every plot would be the one genuinely hot path in here.
 *
 * This is the other half of the "houses in the trees" fix. The old code only
 * tried to place buildings AWAY from trees and never removed one, so any
 * tree whose own roll landed inside a footprint simply grew through the
 * house. Now the ground under the village is reserved outright, and
 * terrain3d.js skips props and long grass on it.
 */
/**
 * Tile key as a NUMBER, not a string. terrain3d.js asks isReserved() for
 * every tile of every chunk it streams in, twice (once for props, once for
 * grass) — tens of thousands of calls in a burst — and a template string per
 * call is a garbage allocation per call, landing squarely inside the chunk
 * build that was already the most expensive thing in a frame. A packed
 * integer allocates nothing. The offset keeps negative coordinates positive;
 * the span is far wider than any village will ever reach.
 */
const KEY_SPAN = 4096;
const tileKey = (x, z) => (Math.round(x) + 2048) * KEY_SPAN + (Math.round(z) + 2048);

function buildReserved() {
  const set = new Set();
  const mark = (x, z) => set.add(tileKey(x, z));

  for (let x = -SQUARE.r - 1; x <= SQUARE.r + 1; x += 1) {
    for (let z = -SQUARE.r - 1; z <= SQUARE.r + 1; z += 1) {
      if (Math.hypot(x, z) <= SQUARE.r + 1) mark(SQUARE.x + x, SQUARE.z + z);
    }
  }

  for (const st of STREETS) {
    const c = Math.cos(st.angle), s = Math.sin(st.angle);
    for (let t = 0; t <= st.to; t += 0.5) {
      for (let o = -st.halfWidth - 0.5; o <= st.halfWidth + 0.5; o += 0.5) {
        mark(c * t + (-s) * o, s * t + c * o);
      }
    }
  }

  for (const p of PLOTS) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    const hw = PLOT.w / 2 + 1, hd = PLOT.d / 2 + 1;
    for (let lx = -hw; lx <= hw; lx += 0.5) {
      for (let lz = -hd; lz <= hd; lz += 0.5) {
        mark(p.x + (lx * c - lz * s), p.z + (lx * s + lz * c));
      }
    }
  }
  return set;
}

const RESERVED = buildReserved();

/** Is this tile spoken for by the village — a plot, a street or the square? */
export function isReserved(tx, tz) {
  return RESERVED.has(tileKey(tx, tz));
}

/**
 * Just the building plots, without the streets and their generous margins.
 *
 * Long grass is kept off THIS rather than off everything reserved. Clearing
 * the full reserved area — plots plus streets plus a margin round each —
 * stripped the greenery from the whole middle of the settlement, so the
 * village read as one wide bare patch with houses dropped on it rather than
 * as lanes between gardens. Grass now grows right up to the edge of a lane,
 * which is most of what makes the lane read as a lane. Trees still keep off
 * the whole reserved area: a tree through a roof is a different problem.
 */
const PLOT_TILES = (() => {
  const set = new Set();
  const mark = (x, z) => set.add(tileKey(x, z));
  const stamp = (cx, cz, w, d, rot) => {
    const c = Math.cos(rot), s2 = Math.sin(rot);
    const hw = w / 2 + 0.6, hd = d / 2 + 0.6;
    for (let lx = -hw; lx <= hw; lx += 0.5) {
      for (let lz = -hd; lz <= hd; lz += 0.5) {
        mark(cx + (lx * c - lz * s2), cz + (lx * s2 + lz * c));
      }
    }
  };
  for (const p of PLOTS) stamp(p.x, p.z, PLOT.w, PLOT.d, p.rot);
  if (CIVIC) stamp(CIVIC.x, CIVIC.z, CIVIC_PLOT.w, CIVIC_PLOT.d, CIVIC.rot);
  return set;
})();

export function isPlotTile(tx, tz) {
  return PLOT_TILES.has(tileKey(tx, tz));
}

/** Is this tile street or square surface (so it can be paved rather than grassed)? */
const PAVED = (() => {
  const set = new Set();
  const mark = (x, z) => set.add(tileKey(x, z));
  for (let x = -SQUARE.r; x <= SQUARE.r; x += 0.5) {
    for (let z = -SQUARE.r; z <= SQUARE.r; z += 0.5) {
      if (Math.hypot(x, z) <= SQUARE.r) mark(x, z);
    }
  }
  for (const st of STREETS) {
    const c = Math.cos(st.angle), s = Math.sin(st.angle);
    for (let t = 0; t <= st.to; t += 0.5) {
      for (let o = -st.halfWidth; o <= st.halfWidth; o += 0.5) {
        mark(c * t + (-s) * o, s * t + c * o);
      }
    }
  }
  return set;
})();

export function isPaved(tx, tz) {
  return PAVED.has(tileKey(tx, tz));
}

/** How far past the edge of a street the packed earth fades out. */
const PATH_EDGE = 1.7;

/**
 * How much of a worn path is underfoot at this exact point: 1 on the street
 * or the square, easing to 0 just outside it.
 *
 * Continuous, and deliberately NOT the tile-based isPaved() above. The
 * streets were being reserved — kept clear of trees and grass — but never
 * actually DRAWN, so the village had bare ground where its lanes should be
 * and read, in Kevin's words, chaotic and disorganised. terrain3d.js blends
 * this straight into the land's own vertex colours, which costs no extra
 * geometry and cannot z-fight the ground the way a decal laid on top would.
 * Distance to the real centreline, not tile membership, is what keeps the
 * path edges smooth curves instead of a staircase.
 */
export function pathAmountAt(x, z) {
  // Distance OUTSIDE the square (negative when standing on it).
  let best = Math.hypot(x - SQUARE.x, z - SQUARE.z) - SQUARE.r;
  for (const st of STREETS) {
    const c = Math.cos(st.angle), s = Math.sin(st.angle);
    // Project onto the street's own axis, clamped to its actual length, so a
    // lane stops where it stops instead of running on as an infinite line.
    const t = Math.max(0, Math.min(st.to, x * c + z * s));
    const d = Math.hypot(x - c * t, z - s * t) - st.halfWidth;
    if (d < best) best = d;
  }
  if (best <= 0) return 1;
  return Math.max(0, 1 - best / PATH_EDGE);
}


/**
 * Is there actually a tree, bush, rock or ruin standing on this tile?
 *
 * ONE source of truth for that question, because there are two answers and
 * only one of them is true on screen: propAt() says what the landscape
 * generator WANTS on a tile, but terrain3d.js skips props on village ground,
 * so inside the settlement the generator's answer is routinely overruled.
 * Anything that needs to keep out of the scenery has to ask the same question
 * the renderer answered, or it will dodge trees that were never drawn and
 * walk through ones that were.
 */
export function propStandsAt(tx, tz) {
  if (isReserved(tx, tz)) return false;
  return !!propAt(tx, tz);
}

/** Is any prop close enough to `radius` of this point to overlap something standing there? */
export function propNear(x, z, radius) {
  const r = Math.ceil(radius) + 1;
  const cx = Math.round(x), cz = Math.round(z);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const tx = cx + dx, tz = cz + dz;
      // Props are jittered off their tile centre by up to 0.31 either way
      // (terrain3d.js), so the test allows for that rather than assuming the
      // tree stands exactly in the middle of its tile.
      if (Math.hypot(tx + 0.5 - x, tz + 0.5 - z) > radius + 0.85) continue;
      if (propStandsAt(tx, tz)) return true;
    }
  }
  return false;
}
