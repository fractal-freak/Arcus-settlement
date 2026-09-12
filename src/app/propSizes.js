/**
 * How big each piece of the kit actually is, measured rather than guessed.
 *
 * WHY THIS FILE EXISTS. The citizens decide where things go, and they do that
 * in the hub, in Node, with no renderer and no models loaded. So they had no
 * way to know that a garden wall is ten units long and a sack is half a unit,
 * and they spaced everything the same fixed distance apart. A third of what
 * they had put down was standing inside something else.
 *
 * HOW THESE NUMBERS WERE GOT. Not from the filenames, not from the kit's
 * documentation, and not by eye. Every model was loaded in the browser and its
 * real bounding box read off the assembled scene — transforms and all — which
 * is the same box the renderer draws to. If a model is ever replaced, these
 * have to be measured again the same way; a plausible number here is worse
 * than none, because it fails silently and only shows up as things sitting
 * through each other.
 *
 * Sizes are in the kit's own units, BEFORE the world scales it up. Multiply by
 * KIT_SCALE for world units.
 */

/**
 * The one multiplier the whole kit is drawn at. Houses stand at exactly this,
 * so everything else from the same kit does too — see built3d.js.
 */
export const KIT_SCALE = 5.0;

/** [width, height, depth] in kit units. */
export const PROP_SIZE = {
  barrel: [0.201, 0.212, 0.201],
  bucket_arrows: [0.14, 0.231, 0.142],
  bucket_empty: [0.14, 0.125, 0.14],
  building_dirt: [1.795, 0.087, 2.007],
  building_grain: [1.874, 0.394, 2.094],
  building_stage_A: [1.047, 0.286, 0.875],
  building_stage_B: [1.021, 0.636, 1.131],
  building_stage_C: [1.16, 0.986, 1.127],
  building_scaffolding: [1.9, 1.299, 2.109],
  building_tower_A_green: [0.993, 2.192, 1.153],
  building_tower_A_red: [0.993, 2.192, 1.153],
  building_tower_B_green: [1.197, 2.485, 1.383],
  building_tower_base_red: [0.93, 1.5, 1.111],
  building_windmill_green: [1.126, 1.458, 0.817],
  building_windmill_red: [1.126, 1.458, 0.817],
  crate_A_big: [0.21, 0.21, 0.21],
  crate_A_small: [0.14, 0.14, 0.14],
  crate_B_big: [0.21, 0.21, 0.21],
  crate_B_small: [0.14, 0.14, 0.14],
  crate_long_A: [0.4, 0.15, 0.2],
  crate_long_B: [0.4, 0.15, 0.2],
  crate_long_C: [0.4, 0.199, 0.2],
  crate_open: [0.332, 0.206, 0.2],
  fence_stone_straight: [0.2, 0.269, 1.155],
  fence_wood_straight: [0.1, 0.55, 1.155],
  fence_wood_straight_gate: [0.14, 0.65, 1.155],
  flag_blue: [0.055, 0.277, 0.264],
  flag_green: [0.055, 0.277, 0.264],
  flag_red: [0.055, 0.277, 0.264],
  flag_yellow: [0.055, 0.277, 0.264],
  ladder: [0.253, 0.77, 0.051],
  pallet: [0.3, 0.08, 0.3],
  resource_lumber: [0.686, 0.21, 0.33],
  resource_stone: [0.421, 0.28, 0.358],
  rock_single_A: [0.298, 0.069, 0.284],
  rock_single_B: [0.287, 0.135, 0.25],
  rock_single_C: [0.344, 0.195, 0.344],
  rock_single_D: [0.287, 0.163, 0.25],
  rock_single_E: [0.488, 0.195, 0.348],
  sack: [0.107, 0.065, 0.16],
  target: [0.239, 0.302, 0.142],
  tree_single_A: [0.574, 1.196, 0.547],
  tree_single_B: [0.685, 1.213, 0.72],
  trees_A_large: [1.945, 0.926, 1.967],
  trees_A_medium: [1.751, 1.295, 1.814],
  trees_A_small: [1.426, 1.109, 1.435],
  trees_B_large: [1.849, 1.175, 1.932],
  trees_B_small: [1.328, 0.922, 1.138],
  wall_corner_A_outside: [1.76, 1.1, 1.432],
  wall_straight: [2, 1.1, 0.8],
  wall_straight_gate: [2, 1.414, 0.896],
  waterlily_A: [0.145, 0.017, 0.145],
  waterlily_B: [0.211, 0.017, 0.211],
  waterplant_A: [0.198, 0.132, 0.216],
  waterplant_B: [0.158, 0.254, 0.103],
  weaponrack: [0.2, 0.24, 0.13],
  wheelbarrow: [0.238, 0.188, 0.506],
};

/**
 * How much ground a piece takes up, in world units, as a radius.
 *
 * The widest of its two ground dimensions, halved. That is generous for
 * anything long and thin — a fence claims a circle it does not fill — and
 * being generous is the right error here, because the thing this prevents is
 * two objects occupying the same place, which nothing in the world can explain.
 *
 * An unknown kind gets 1.0, which is roughly a barrel: small enough not to
 * block the ground, large enough that two of them will not merge.
 */
export function propRadius(kind) {
  const s = PROP_SIZE[kind];
  if (!s) return 1.0;
  return Math.max(s[0], s[2]) * KIT_SCALE * 0.5;
}

/** How tall a piece stands, in world units. Unknown kinds are treated as low. */
export function propHeight(kind) {
  const s = PROP_SIZE[kind];
  return s ? s[1] * KIT_SCALE : 1.0;
}

/**
 * How far apart two pieces must stand.
 *
 * Not quite their full radii: 0.88 of it, so a stack of crates can lean
 * together and a hedge can close up. Whole radii apart reads as a shop
 * display, every object alone in its own circle, which is its own kind of
 * cheap.
 */
export function clearance(kindA, kindB) {
  return (propRadius(kindA) + propRadius(kindB)) * 0.88;
}
