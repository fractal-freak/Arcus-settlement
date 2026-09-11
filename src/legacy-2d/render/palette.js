/**
 * The colour system.
 *
 * Flat, saturated fills with a darker edge underneath — the look of a drawn
 * cartoon world rather than a rendered one. Every material carries a top face
 * and a shadow side so the ground reads as solid blocks seen from above, not
 * as a flat pattern.
 *
 * These are daylight colours. Night is not a different palette: the whole world
 * layer is tinted by the real sun, so one set of colours serves every hour.
 */

export const GROUND_COLORS = {
  plaza:  [0xd8cfc0, 0xd1c7b6, 0xcabfad, 0xbfb3a0],
  road:   [0xc2a87e, 0xbba179, 0xb59a72],
  grass:  [0x6fbf5e, 0x68b857, 0x74c463, 0x63b253],
  meadow: [0x58ad55, 0x5fb45b, 0x51a54e, 0x64ba60],
  scrub:  [0x9fb95f, 0x97b158, 0xa7c067, 0x8fa951],
  stone:  [0x9a9aa6, 0x92929e, 0xa3a3af, 0x8b8b97],
  sand:   [0xe4d5a6, 0xdccc9c, 0xebdcaf],
  water:  [0x4fa8d8, 0x4a9fd0, 0x57b0e0],
};

/** The side wall under each tile, which gives the ground its thickness. */
export const GROUND_EDGE = {
  plaza:  0x9d9384,
  road:   0x8c7550,
  grass:  0x468a3a,
  meadow: 0x3b7f38,
  scrub:  0x6c8a3a,
  stone:  0x6a6a76,
  sand:   0xb5a677,
  water:  0x2f7fae,
};

export const PROP_COLORS = {
  treeTrunk: 0x7a5334,
  treeDark:  0x2f7a3d,
  treeMid:   0x3f9950,
  treeLight: 0x52b465,
  bushDark:  0x3a8a48,
  bushLight: 0x4fa85e,
  rockDark:  0x7c7c88,
  rockLight: 0x9b9ba7,
  tuft:      0x5aa64d,
};

export const OUTLINE = 0x2a2438;

/**
 * The tint the whole world wears at a given light level.
 *
 * Midday is untinted. Night is a deep blue that keeps the drawn colours
 * readable instead of crushing them to grey — a cartoon world at night is still
 * a cartoon world.
 */
export function worldTint(light) {
  const l = Math.max(0, Math.min(1, light));
  // Moonlight, not mud. Multiplying the drawn colours by something this dark
  // used to take the green out of the grass entirely.
  const night = [0x6d, 0x7d, 0xc4];
  const day = [0xff, 0xff, 0xff];
  const r = Math.round(night[0] + (day[0] - night[0]) * l);
  const g = Math.round(night[1] + (day[1] - night[1]) * l);
  const b = Math.round(night[2] + (day[2] - night[2]) * l);
  return (r << 16) | (g << 8) | b;
}
