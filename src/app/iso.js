/**
 * Isometric and chunk maths.
 *
 * Tiles are 2:1 diamonds — 64 wide, 32 tall — which is the ratio every
 * hand-drawn isometric game uses, because it keeps diagonals on clean pixel
 * steps instead of fuzzing them.
 *
 * The world is unbounded. Nothing here knows how big it is, and nothing may
 * ever ask: the whole point of chunking is that a civilisation can keep growing
 * outward for years without any part of this file changing.
 */

export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Tiles along one edge of a chunk. 16 keeps a baked chunk texture at 1024x512. */
export const CHUNK = 16;

/** Tile coordinates to a point on the world plane. */
export function tileToWorld(tx, ty) {
  return { x: (tx - ty) * HALF_W, y: (tx + ty) * HALF_H };
}

/** And back again, for picking. Returns fractional tiles; floor them to pick. */
export function worldToTile(x, y) {
  const a = y / HALF_H;
  const b = x / HALF_W;
  return { tx: (a + b) / 2, ty: (a - b) / 2 };
}

/** Draw order: on this projection, further away is simply a smaller tx+ty. */
export const depthOf = (tx, ty) => tx + ty;

export const chunkOf = (tx, ty) => ({
  cx: Math.floor(tx / CHUNK),
  cy: Math.floor(ty / CHUNK),
});

export const chunkKey = (cx, cy) => `${cx},${cy}`;

/**
 * The pixel box a chunk occupies on the world plane.
 *
 * A chunk of diamonds is itself a diamond, so its bounding box is wider than
 * it is tall and its left edge sits well outside the tile at its origin. Baking
 * needs the box, not the tile range.
 */
export function chunkBounds(cx, cy) {
  const t0x = cx * CHUNK;
  const t0y = cy * CHUNK;
  // The leftmost point of the chunk's diamond is the west corner of the tile
  // at (t0x, t0y + CHUNK - 1). No margin here: the box is exactly CHUNK*TILE_W
  // wide, and padding the left without widening the box clipped a half-tile off
  // the right of every chunk, which showed up as sky through the grass.
  const left = (t0x - (t0y + CHUNK - 1)) * HALF_W;
  const top = (t0x + t0y) * HALF_H;
  return {
    x: left,
    y: top,
    width: CHUNK * TILE_W,
    height: CHUNK * TILE_H,
    t0x,
    t0y,
  };
}

/** The four corners of one tile's diamond, as a flat point list for Graphics. */
export function tileDiamond(tx, ty, ox = 0, oy = 0) {
  const { x, y } = tileToWorld(tx, ty);
  return [
    x - ox, y + HALF_H - oy,
    x + HALF_W - ox, y - oy,
    x + TILE_W - ox, y + HALF_H - oy,
    x + HALF_W - ox, y + TILE_H - oy,
  ];
}

/**
 * Every chunk that touches the given world-plane rectangle, with a ring of
 * spares around it so a chunk is built before it scrolls into view rather than
 * popping in once it already has.
 */
export function chunksInView(rect, ring = 1) {
  const corners = [
    worldToTile(rect.x, rect.y),
    worldToTile(rect.x + rect.width, rect.y),
    worldToTile(rect.x, rect.y + rect.height),
    worldToTile(rect.x + rect.width, rect.y + rect.height),
  ];
  let minTx = Infinity, maxTx = -Infinity, minTy = Infinity, maxTy = -Infinity;
  for (const c of corners) {
    minTx = Math.min(minTx, c.tx); maxTx = Math.max(maxTx, c.tx);
    minTy = Math.min(minTy, c.ty); maxTy = Math.max(maxTy, c.ty);
  }
  const out = [];
  const c0 = chunkOf(minTx, minTy);
  const c1 = chunkOf(maxTx, maxTy);
  for (let cy = c0.cy - ring; cy <= c1.cy + ring; cy++) {
    for (let cx = c0.cx - ring; cx <= c1.cx + ring; cx++) out.push({ cx, cy });
  }
  return out;
}
