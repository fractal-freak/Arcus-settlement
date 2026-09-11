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

import { Group, InstancedMesh, Object3D, Vector3 } from 'three';
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
const PIECES = ['wall', 'wall-door', 'wall-window', 'roof-side', 'roof-side-corner', 'tower-base', 'tower-top', 'column-damaged'];

/**
 * Every wall placement around one building's rectangular footprint, in the
 * building's OWN local space (still to be rotated/translated to world).
 * One entry per perimeter tile: { x, z, facing, kind }. `facing` is the
 * local yaw that points the tile's own outward face away from the
 * building's centre — 0 for the +Z (front) edge, PI for -Z (back), ±PI/2
 * for the side edges.
 */
function perimeterTiles(wTiles, dTiles, seed) {
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
  // scattered elsewhere; the rest plain wall.
  let door = null, bestD = Infinity;
  out.forEach((t, i) => {
    if (t.facing !== 0) return;
    const d = Math.abs(t.x);
    if (d < bestD) { bestD = d; door = i; }
  });
  return out.map((t, i) => {
    if (i === door) return { ...t, kind: 'wall-door' };
    const r = hash2(Math.round(t.x * 4 + 17), Math.round(t.z * 4 + 31), seed);
    return { ...t, kind: r > 0.72 ? 'wall-window' : 'wall' };
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
    const groups = ['walls', 'doors', 'windows', 'roofSides', 'roofCorners'];
    if (this.walls) {
      this.group.remove(...groups.map((k) => this[k]));
      for (const k of groups) this[k].dispose();
    }

    const A = this.assets;
    // Over-allocated (a generous fixed tiles-per-building estimate) rather
    // than counted exactly up front — one-time waste of unused instance
    // buffer capacity on a rebuild that happens once per 20 commits, not a
    // per-frame cost.
    const n = buildings.length;
    const wallCap = n * 10;
    this.walls = new InstancedMesh(A.wall.geometry, A.wall.material, wallCap);
    this.doors = new InstancedMesh(A['wall-door'].geometry, A['wall-door'].material, n);
    this.windows = new InstancedMesh(A['wall-window'].geometry, A['wall-window'].material, wallCap);
    this.roofSides = new InstancedMesh(A['roof-side'].geometry, A['roof-side'].material, wallCap);
    this.roofCorners = new InstancedMesh(A['roof-side-corner'].geometry, A['roof-side-corner'].material, n * 2);
    for (const k of groups) { this[k].castShadow = true; this[k].receiveShadow = true; }

    let nw = 0, nd = 0, nwin = 0, nrs = 0, ne = 0;
    buildings.forEach((b, i) => {
      const idx = b.n ?? i;
      const { x, z } = positionFor(idx);
      const h = smoothHeightAt(x, z);
      const seed = hash2(idx, 7, 71);
      const rot = seed * 6.283;
      // Village-cottage footprint: 2-3 tiles a side, 1.7-2.9 real building
      // units wide — the same scale range the hand-built pass settled on
      // after its own live retune, kept here so the town's overall size
      // and density didn't have to be re-verified from scratch.
      const wTiles = 2 + ((hash2(idx, 3, 72) * 2) | 0);
      const dTiles = 2 + ((hash2(idx, 5, 73) * 2) | 0);
      const wallHeight = 0.75 + Math.min(1.7, (b.weight ?? 4) / 22);

      // Every piece in this kit is a 1x1x1 tile, PIVOTED AT ITS OWN BASE
      // (local Y 0 to 1), not centred — confirmed live off the loaded
      // geometry's real bounding box, not assumed from convention. First
      // version placed walls at h + wallHeight/2 as if they were centred
      // BoxGeometry (which is what they replaced), which floated every
      // wall's bottom half above the ground with its top poking up past
      // the roof. Fixed: a base-pivoted piece goes exactly at the height
      // its base is supposed to stand on.
      for (const t of perimeterTiles(wTiles, dTiles, idx)) {
        const off = rotatedOffset(t.x * TILE, t.z * TILE, rot);
        dummy.position.set(x + off.x, h, z + off.z);
        dummy.scale.set(1, wallHeight, 1);
        dummy.rotation.set(0, rot + t.facing, 0);
        dummy.updateMatrix();
        if (t.kind === 'wall-door') { this.doors.setMatrixAt(nd, dummy.matrix); nd++; }
        else if (t.kind === 'wall-window') { this.windows.setMatrixAt(nwin, dummy.matrix); nwin++; }
        else { this.walls.setMatrixAt(nw, dummy.matrix); nw++; }
      }

      // A real hip roof along the Z ridge: a triangular roof-side-corner cap at
      // each end, roof-side slope tiles filling anywhere between them.
      // Each tile scaled by wTiles in X to span the building's width in
      // one piece rather than also tiling across that axis — the one
      // simplification kept from the first pass, everything along the
      // ridge is now real tiled geometry.
      const roofY = h + wallHeight;
      for (let j = 0; j < dTiles; j++) {
        const lz = -dTiles / 2 + j + 0.5;
        const off = rotatedOffset(0, lz, rot);
        dummy.scale.set(wTiles, 1, 1);
        if (j === 0 || j === dTiles - 1) {
          dummy.position.set(x + off.x, roofY, z + off.z);
          dummy.rotation.set(0, rot + (j === 0 ? Math.PI : 0), 0);
          dummy.updateMatrix();
          this.roofCorners.setMatrixAt(ne, dummy.matrix); ne++;
        } else {
          dummy.position.set(x + off.x, roofY, z + off.z);
          dummy.rotation.set(0, rot, 0);
          dummy.updateMatrix();
          this.roofSides.setMatrixAt(nrs, dummy.matrix); nrs++;
        }
      }
    });

    this.walls.count = nw;
    this.doors.count = nd;
    this.windows.count = nwin;
    this.roofSides.count = nrs;
    this.roofCorners.count = ne;
    for (const k of groups) this[k].instanceMatrix.needsUpdate = true;
    this.group.add(...groups.map((k) => this[k]));
  }
}
