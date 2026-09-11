/**
 * The town: real buildings, earned by real commits.
 *
 * arcus-town.mjs raises one building per 20 commits landed on main — what
 * was touched decides its trade (workshop, market stall, assay house,
 * counting house, library, granary), how much was touched decides its
 * size. Nothing here invents a building; this module only decides where an
 * already-earned one STANDS and what it looks like, the same division of
 * labour terrain.js/terrain3d.js already runs the whole landscape on:
 * data has no opinion about rendering, rendering invents nothing about data.
 *
 * Positions are a sunflower spiral (radius ∝ √n, angle stepped by the
 * golden angle) keyed on each building's own index — arcus-town.mjs's own
 * comment already states the intent this gets for free: "the oldest work
 * stands nearest the square, and the town grows outward." A spiral is also
 * naturally overlap-free at any count, which the pure-hash placement
 * people3d.js uses for session figures is not guaranteed to be — buildings
 * need that guarantee more, since they are much bigger than a person.
 *
 * GEOMETRY: real modelled, textured pieces from Kenney's Retro Fantasy Kit
 * (CC0 — see public/assets/kenney-retro-fantasy/License.txt), asked for by
 * name over the hand-built primitives this used to be. Every piece in that
 * kit is a small modular tile meant to be COMBINED — there is no single
 * "house" model to just load — so this tiles wall pieces around each
 * building's own rectangular footprint and caps it with a scaled roof
 * piece. The cap is a pragmatic simplification, not a properly mitred hip
 * roof built from the kit's own roof-corner/roof-edge/roof-side pieces —
 * said so rather than left silent, since Kevin's own instruction was to
 * get real assets in now and reconcile style/detail later.
 */

import { Group, InstancedMesh, Object3D } from 'three';
import { smoothHeightAt, isWater, hash2, noise } from '../app/terrain.js';
import { loadPieces } from './assets.js';

const GOLDEN_ANGLE = 2.399963;
// First pass, spacing 2.35 against a footprint that could reach 2.38 wide,
// guaranteed overlap at any real density — verified live at the real 133
// buildings: a packed purple wall, not a town. Spacing now comfortably
// clears the largest possible footprint.
const SPACING = 3.6;

// The same forestAt() formula terrain.js's own propAt() uses to decide
// where trees cluster (not exported itself, but built entirely from noise(),
// which is) — a building checks it for exactly the reason a tree does:
// so a house doesn't land in the middle of a real forest and end up
// poking up through the canopy.
const FOREST_CLEAR = 0.55;
const forestAt = (tx, ty) => noise(tx / 42, ty / 42, 60);

/**
 * Deterministic from the building's own index, so a rebuild never reshuffles
 * the town. A retry pushes radius outward AND jitters the angle a little
 * (hashed off n and the retry count, so still fully deterministic) — pure
 * radial pushing alone left a real fraction still landing in forest
 * (verified live: 24 of 133 real buildings); angle jitter explores a real
 * 2D neighbourhood instead of one line.
 */
function positionFor(n) {
  const baseAngle = n * GOLDEN_ANGLE;
  let angle = baseAngle;
  let radius = SPACING * Math.sqrt(n + 1);
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let tries = 0; tries < 10
    && (isWater(Math.round(x), Math.round(z)) || forestAt(x, z) > FOREST_CLEAR)
    ; tries++) {
    radius += 1.4;
    angle = baseAngle + (hash2(n, tries, 91) - 0.5) * 1.1;
    x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  return { x, z };
}

/** A local (dx, dz) offset, rotated to match a building's own yaw. */
function rotatedOffset(dx, dz, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

const dummy = new Object3D();

// Kenney's kit is built on a 1-unit grid (verified against the loaded
// piece's own bounding box the first time this ran, not assumed from
// convention). A wall tile's own local +Z is its OUTWARD face.
const TILE = 1;

// 'roof' turned out, on loading it, to be an open decorative gable TRUSS,
// not a solid roof panel — confirmed live from a real screenshot showing
// bare timber wireframe over every building, not shingles. 'roof-side'
// (a solid shingled slope) and 'roof-side-corner' (its matching solid
// triangular end cap — NOT 'roof-edge', which turned out on loading it,
// live, to be an open decorative truss with the same visual family as
// 'roof' and 'roof-corner': all three share a 4-primitive/100+-vertex
// signature, where every confirmed-solid piece here has 3 primitives and
// far fewer vertices. Confirmed by painting the loaded instances magenta
// and cyan and looking at a real screenshot, not by the preview thumbnail
// alone — a small thumbnail had already been wrong once this same pass.)
// are the actual roof surface pieces; both confirmed by their preview
// images before ever touching the tiling code below.
//
// Three wealth tiers, real data driving which one a building gets: `weight`
// is the number of distinct files its commits actually touched (clamped at
// 60 by arcus-town.mjs), the one non-arbitrary signal this data has for
// "how much work," used here as a stand-in for "how much house." Boundaries
// are the REAL tercile split of all 133 live buildings' weights (27, 44),
// not round numbers picked by eye — an even guess (10/30) checked against
// the real distribution put 79 of 133 in the top tier and only 4 in the
// bottom, nothing like the "fancy stone down to very low income" spread
// asked for.
const TIERS = [
  { key: 'humble', max: 27, wall: 'wall-pane-wood', door: 'wall-pane-wood-door', window: 'wall-pane-wood-window', maxTiles: 2 },
  { key: 'plain', max: 44, wall: 'wall', door: 'wall-door', window: 'wall-window', maxTiles: 3 },
  { key: 'grand', max: Infinity, wall: 'wall-fortified', door: 'wall-fortified-door', window: 'wall-fortified-window', maxTiles: 3 },
];
function tierFor(weight) { return TIERS.find((t) => weight <= t.max) ?? TIERS[TIERS.length - 1]; }

const PIECES = [
  ...new Set(TIERS.flatMap((t) => [t.wall, t.door, t.window])),
  'roof-side', 'roof-side-corner', 'tower-base', 'tower-top', 'column-damaged',
];

/**
 * Every wall placement around one building's rectangular footprint, in the
 * building's OWN local space (still to be rotated/translated to world).
 * One entry per perimeter tile: { x, z, facing, kind }. `facing` is the
 * local yaw that points the tile's own outward face away from the
 * building's centre — 0 for the +Z (front) edge, PI for -Z (back), ±PI/2
 * for the side edges.
 */
function perimeterTiles(wTiles, dTiles, seed, tier) {
  const out = [];
  const hw = wTiles / 2, hd = dTiles / 2;
  for (let i = 0; i < wTiles; i++) {
    const x = -hw + i + 0.5;
    out.push({ x, z: hd, facing: 0 });
    out.push({ x, z: -hd, facing: Math.PI });
  }
  for (let j = 0; j < dTiles; j++) {
    const z = -hd + j + 0.5;
    out.push({ x: hw, z, facing: Math.PI / 2 });
    out.push({ x: -hw, z, facing: -Math.PI / 2 });
  }
  // One door, roughly centred on the front edge; a couple of windows
  // scattered elsewhere; the rest plain wall — all three drawn from
  // whichever wealth tier this building belongs to.
  let door = null, bestD = Infinity;
  out.forEach((t, i) => {
    if (t.facing !== 0) return;
    const d = Math.abs(t.x);
    if (d < bestD) { bestD = d; door = i; }
  });
  return out.map((t, i) => {
    if (i === door) return { ...t, kind: tier.door };
    const r = hash2(Math.round(t.x * 4 + 17), Math.round(t.z * 4 + 31), seed);
    return { ...t, kind: r > 0.72 ? tier.window : tier.wall };
  });
}

export class Town3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    scene.add(this.group);
    this.builtCount = -1; // forces the first ready sync() to actually build
    this.ready = false;
    this._loading = loadPieces(PIECES).then((assets) => {
      this.assets = assets;
      this.ready = true;
    });
  }

  /**
   * Rebuilt only when the real building count changes — buildings land in
   * batches of 20 real commits, never per frame. Silently no-ops until the
   * Kenney pieces have finished their one-time load; the feed polls every
   * few seconds regardless, so the next tick after load completes builds
   * everything in one pass rather than needing its own callback wiring.
   */
  sync(town) {
    if (!this.ready || !town || !town.buildings || town.buildings.length === this.builtCount) return;
    this.builtCount = town.buildings.length;
    this._rebuild(town.buildings);
  }

  _rebuild(buildings) {
    if (this.meshes) {
      this.group.remove(...this.meshes.values());
      for (const m of this.meshes.values()) m.dispose();
    }

    const A = this.assets;
    const n = buildings.length;
    // One InstancedMesh per PIECE NAME (walls/doors/windows across all
    // three wealth tiers, plus the two roof pieces) rather than per
    // semantic role — a 'humble' building's wall and a 'grand' one's are
    // different geometry entirely now, not just a different colour on the
    // same box, so each real piece needs its own instancing group. Counts
    // are generous fixed estimates, over-allocated rather than counted
    // exactly up front — a one-time waste of unused buffer capacity on a
    // rebuild that happens once per 20 commits, not a per-frame cost.
    this.meshes = new Map();
    const capFor = (name) => (name.startsWith('roof') ? n * 3 : n * 4);
    for (const name of PIECES) {
      const piece = A[name];
      const mesh = new InstancedMesh(piece.geometry, piece.material, capFor(name));
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.meshes.set(name, mesh);
    }
    const counts = new Map(PIECES.map((name) => [name, 0]));
    const place = (name, matrix) => {
      const mesh = this.meshes.get(name);
      const i = counts.get(name);
      mesh.setMatrixAt(i, matrix);
      counts.set(name, i + 1);
    };

    buildings.forEach((b, i) => {
      const idx = b.n ?? i;
      const { x, z } = positionFor(idx);
      const h = smoothHeightAt(x, z);
      const seed = hash2(idx, 7, 71);
      const rot = seed * 6.283;
      const tier = tierFor(b.weight ?? 4);
      // Village-cottage footprint: 2-3 tiles a side (humble tier capped at
      // 2, so a low-weight building also reads smaller, not just plainer-
      // walled) — the same scale range the hand-built pass settled on
      // after its own live retune, kept here so the town's overall size
      // and density didn't have to be re-verified from scratch.
      const wTiles = 2 + ((hash2(idx, 3, 72) * (tier.maxTiles - 1)) | 0);
      const dTiles = 2 + ((hash2(idx, 5, 73) * (tier.maxTiles - 1)) | 0);
      const wallHeight = 0.75 + Math.min(1.7, (b.weight ?? 4) / 22);

      // Every piece in this kit is a 1x1x1 tile, PIVOTED AT ITS OWN BASE
      // (local Y 0 to 1), not centred — confirmed live off the loaded
      // geometry's real bounding box, not assumed from convention. First
      // version placed walls at h + wallHeight/2 as if they were centred
      // BoxGeometry (which is what they replaced), which floated every
      // wall's bottom half above the ground with its top poking up past
      // the roof. Fixed: a base-pivoted piece goes exactly at the height
      // its base is supposed to stand on.
      for (const t of perimeterTiles(wTiles, dTiles, idx, tier)) {
        const off = rotatedOffset(t.x * TILE, t.z * TILE, rot);
        dummy.position.set(x + off.x, h, z + off.z);
        dummy.scale.set(1, wallHeight, 1);
        dummy.rotation.set(0, rot + t.facing, 0);
        dummy.updateMatrix();
        place(t.kind, dummy.matrix);
      }

      // A real hip roof along the Z ridge: a triangular roof-side-corner
      // cap at each end, roof-side slope tiles filling anywhere between
      // them. Each tile scaled by wTiles in X to span the building's width
      // in one piece rather than also tiling across that axis — the one
      // simplification kept from the first pass, everything along the
      // ridge is now real tiled geometry.
      const roofY = h + wallHeight;
      for (let j = 0; j < dTiles; j++) {
        const lz = -dTiles / 2 + j + 0.5;
        const off = rotatedOffset(0, lz, rot);
        dummy.scale.set(wTiles, 1, 1);
        dummy.position.set(x + off.x, roofY, z + off.z);
        if (j === 0 || j === dTiles - 1) {
          dummy.rotation.set(0, rot + (j === 0 ? Math.PI : 0), 0);
          dummy.updateMatrix();
          place('roof-side-corner', dummy.matrix);
        } else {
          dummy.rotation.set(0, rot, 0);
          dummy.updateMatrix();
          place('roof-side', dummy.matrix);
        }
      }
    });

    for (const [name, mesh] of this.meshes) {
      mesh.count = counts.get(name);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.group.add(...this.meshes.values());
  }
}
