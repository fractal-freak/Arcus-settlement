/**
 * The ground, and the things standing on it.
 *
 * Orthographic again, so a chunk is a plain Sprite: one baked texture, placed
 * at a projected position, uniform scale. No mesh, no per-vertex reprojection,
 * no distance terms. It is both simpler and faster than the bent version, and
 * unlike that version a tile is the same shape wherever it sits on screen.
 *
 * DEPTH SORTING. Everything that stands on the ground shares one container and
 * sorts on the world Y of its FEET — its lower bound, not its centre and not
 * its top. That is what makes a citizen pass behind a tree and in front of the
 * next one without either of them tearing through the other.
 */

import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import {
  CHUNK, TILE_W, TILE_H, HALF_W, HALF_H,
  chunkBounds, chunkKey, chunksInView, tileToWorld, worldToTile,
} from '../app/iso.js';
import { groundAt, propAt, GROUND } from '../app/terrain.js';
import { GROUND_COLORS, GROUND_EDGE, PROP_COLORS } from './palette.js';

const LIP = 7;
const PAD = { x: 4, y: 8, w: 8, h: LIP + 10 };

function drawTile(g, tx, ty, ox, oy) {
  const { kind, variant } = groundAt(tx, ty);
  if (kind === GROUND.void) return;
  const shades = GROUND_COLORS[kind];
  const top = shades[variant % shades.length];
  const { x, y } = tileToWorld(tx, ty);
  const px = x - ox, py = y - oy;

  g.poly([
    px, py + HALF_H,
    px + HALF_W, py + TILE_H,
    px + TILE_W, py + HALF_H,
    px + TILE_W, py + HALF_H + LIP,
    px + HALF_W, py + TILE_H + LIP,
    px, py + HALF_H + LIP,
  ]);
  g.fill({ color: GROUND_EDGE[kind] });

  g.poly([
    px, py + HALF_H,
    px + HALF_W, py,
    px + TILE_W, py + HALF_H,
    px + HALF_W, py + TILE_H,
  ]);
  g.fill({ color: top });
}

function bakeProps(renderer) {
  const out = {};
  const make = (draw, w, h) => {
    const g = new Graphics();
    draw(g);
    const tex = renderer.generateTexture({
      target: g, frame: new Rectangle(0, 0, w, h), resolution: 2, scaleMode: 'linear',
    });
    g.destroy();
    return tex;
  };

  out.tree = [0, 1, 2].map((v) => make((g) => {
    const h = 42 + v * 7;
    g.ellipse(18, h - 2, 13, 4).fill({ color: 0x000000, alpha: 0.16 });
    g.rect(16, h - 15, 4, 14).fill({ color: PROP_COLORS.treeTrunk });
    g.ellipse(18, h - 21, 14, 12).fill({ color: PROP_COLORS.treeDark });
    g.ellipse(15, h - 27, 11, 10).fill({ color: PROP_COLORS.treeMid });
    g.ellipse(20, h - 32, 8, 7).fill({ color: PROP_COLORS.treeLight });
    g.ellipse(16, h - 35, 5, 4).fill({ color: PROP_COLORS.treeLight });
  }, 36, 58));

  out.bush = [0, 1].map((v) => make((g) => {
    g.ellipse(12, 18, 9, 3).fill({ color: 0x000000, alpha: 0.14 });
    g.ellipse(12, 13, 10, 7).fill({ color: PROP_COLORS.bushDark });
    g.ellipse(10, 10, 7, 5).fill({ color: PROP_COLORS.bushLight });
    if (v) g.ellipse(15, 11, 5, 4).fill({ color: PROP_COLORS.bushLight });
  }, 24, 20));

  out.rock = [0, 1].map((v) => make((g) => {
    const s = 7 + v * 3;
    g.ellipse(12, 18, s + 1, 3).fill({ color: 0x000000, alpha: 0.14 });
    g.ellipse(12, 13, s, s * 0.66).fill({ color: PROP_COLORS.rockDark });
    g.ellipse(11, 11, s * 0.6, s * 0.4).fill({ color: PROP_COLORS.rockLight });
  }, 24, 20));

  out.tuft = [0, 1].map(() => make((g) => {
    g.rect(4, 8, 2, 6).fill({ color: PROP_COLORS.tuft });
    g.rect(8, 5, 2, 9).fill({ color: PROP_COLORS.tuft });
    g.rect(12, 9, 2, 5).fill({ color: PROP_COLORS.tuft });
  }, 18, 16));

  return out;
}

export class GroundLayer {
  constructor(renderer) {
    this.renderer = renderer;
    this.view = new Container();
    this.view.sortableChildren = true;
    this.chunks = new Map();
    this.built = 0;
    this.tint = 0xffffff;
  }

  setTint(tint) {
    if (tint === this.tint) return;
    this.tint = tint;
    for (const c of this.chunks.values()) c.sprite.tint = tint;
  }

  clear() {
    for (const c of this.chunks.values()) c.sprite.destroy({ texture: true, textureSource: true });
    this.chunks.clear();
    this.view.removeChildren();
  }

  make(cx, cy) {
    const b = chunkBounds(cx, cy);
    const g = new Graphics();
    // A ring of neighbouring tiles is drawn too. Polygons ending exactly on the
    // texture edge leave antialiased, half-transparent pixels there, and where
    // two chunks overlap those blend into a visible diagonal seam. Bleeding the
    // ring outward means the overlap is opaque on both sides and there is
    // nothing to blend.
    const M = 1;
    for (let d = -M * 2; d <= (CHUNK - 1 + M) * 2; d++) {
      for (let i = -M; i < CHUNK + M; i++) {
        const j = d - i;
        if (j < -M || j >= CHUNK + M) continue;
        drawTile(g, b.t0x + i, b.t0y + j, b.x, b.y);
      }
    }
    const texture = this.renderer.generateTexture({
      target: g,
      frame: new Rectangle(-PAD.x, -PAD.y, b.width + PAD.w, b.height + PAD.h),
      resolution: 1,
      scaleMode: 'nearest',
    });
    g.destroy();

    const sprite = new Sprite(texture);
    sprite.tint = this.tint;
    // Sorted on the chunk's lower edge, so a nearer band of ground always
    // overlaps the one behind it and the lip never shows through.
    sprite.zIndex = b.y + b.height;
    this.view.addChild(sprite);

    const entry = { sprite, wx: b.x - PAD.x, wy: b.y - PAD.y };
    this.chunks.set(chunkKey(cx, cy), entry);
    this.built++;
    return entry;
  }

  update(camera, budget = 3) {
    const want = chunksInView(camera.visibleBounds(), 1);
    const wanted = new Set(want.map((c) => chunkKey(c.cx, c.cy)));

    let made = 0;
    for (const { cx, cy } of want) {
      if (made >= budget) break;
      const k = chunkKey(cx, cy);
      if (this.chunks.has(k)) continue;
      this.make(cx, cy);
      made++;
    }
    for (const [k, c] of this.chunks) {
      if (wanted.has(k)) continue;
      c.sprite.destroy({ texture: true, textureSource: true });
      this.chunks.delete(k);
    }

    // One projection per chunk, not per vertex.
    for (const c of this.chunks.values()) {
      const s = camera.project(c.wx, c.wy);
      // Whole pixels: a chunk landing on a half pixel resamples its own edge.
      c.sprite.x = Math.round(s.x);
      c.sprite.y = Math.round(s.y);
      c.sprite.scale.set(camera.zoom);
    }
    return { live: this.chunks.size, made };
  }
}

/**
 * Scenery, pooled into the shared grounded layer.
 *
 * Props take a zIndex from the world Y of the tile they stand on, exactly as
 * buildings and citizens will, so all three sort against each other in one
 * list rather than in three that have to be reconciled.
 */
export class PropLayer {
  constructor(renderer, grounded) {
    this.view = grounded;
    this.art = bakeProps(renderer);
    this.pool = [];
    this.used = 0;
    this.tint = 0xffffff;
  }

  setTint(tint) { this.tint = tint; }

  take() {
    if (this.used < this.pool.length) return this.pool[this.used++];
    const s = new Sprite();
    s.anchor.set(0.5, 1);           // anchored at the feet, which is what sorts
    this.view.addChild(s);
    this.pool.push(s);
    this.used++;
    return s;
  }

  update(camera) {
    this.used = 0;
    const r = camera.visibleBounds();
    const corners = [
      worldToTile(r.x, r.y), worldToTile(r.x + r.width, r.y),
      worldToTile(r.x, r.y + r.height), worldToTile(r.x + r.width, r.y + r.height),
    ];
    let minTx = Infinity, maxTx = -Infinity, minTy = Infinity, maxTy = -Infinity;
    for (const c of corners) {
      minTx = Math.min(minTx, c.tx); maxTx = Math.max(maxTx, c.tx);
      minTy = Math.min(minTy, c.ty); maxTy = Math.max(maxTy, c.ty);
    }
    minTx = Math.floor(minTx) - 2; maxTx = Math.ceil(maxTx) + 2;
    minTy = Math.floor(minTy) - 2; maxTy = Math.ceil(maxTy) + 2;

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const p = propAt(tx, ty);
        if (!p) continue;
        const w = tileToWorld(tx, ty);
        const footX = w.x + HALF_W;
        const footY = w.y + TILE_H;        // the lower bound of the tile
        const s = camera.project(footX, footY);
        if (s.x < -120 || s.x > camera.w + 120 || s.y < -160 || s.y > camera.h + 160) continue;
        const set = this.art[p.kind];
        if (!set) continue;
        const sp = this.take();
        sp.texture = set[p.variant % set.length];
        sp.x = s.x; sp.y = s.y;
        sp.scale.set(camera.zoom);
        sp.zIndex = footY;
        sp.tint = this.tint;
        sp.visible = true;
      }
    }
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
    return this.used;
  }
}
