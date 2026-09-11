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

import { Group, InstancedMesh, Object3D, Shape, ExtrudeGeometry, MeshToonMaterial } from 'three';
import { smoothHeightAt, isWater, hash2, noise } from '../app/terrain.js';
import { loadPieces } from './assets.js';
import { toonRamp } from './terrain3d.js';

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

// A quarter-unit push straight out along each corner's own diagonal. Wall
// tiles are full 1x1x1 blocks (confirmed off their own bounding box, same
// as everywhere else in this file), so the two tiles meeting at a corner
// already overlap there and completely fill it — a column placed exactly
// AT the corner point would sit fully embedded inside that already-solid
// intersection and never be seen. Pushed out along the diagonal instead,
// it stands proud of the wall the way a real corner post or pilaster
// would, rather than disappearing into masonry that doesn't need it.
const CORNER_PUSH = 0.25;

/**
 * The grand tier's one hand-added flourish: a real corner post at each of
 * a building's four corners. Grand buildings have no solid "fortified"
 * wall piece to fall back on (see the TIERS comment), so what actually
 * reads as grander here is architecture, not a different texture — four
 * posts flanking the walls the way a keep's corner turrets or pilasters
 * would, on a piece independently confirmed solid the same way the walls
 * themselves were.
 */
function placeCornerColumns(place, dummy, cx, cz, wTiles, dTiles, rot, wallHeight, h) {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const off = rotatedOffset(sx * (wTiles / 2 + CORNER_PUSH), sz * (dTiles / 2 + CORNER_PUSH), rot);
      dummy.position.set(cx + off.x, h, cz + off.z);
      dummy.scale.set(1, wallHeight, 1);
      dummy.rotation.set(0, rot, 0);
      dummy.updateMatrix();
      place('column', dummy.matrix);
    }
  }
}

const dummy = new Object3D();

// Kenney's kit is built on a 1-unit grid (verified against the loaded
// piece's own bounding box the first time this ran, not assumed from
// convention). A wall tile's own local +Z is its OUTWARD face.
const TILE = 1;

// 'roof' turned out, on loading it, to be an open decorative gable TRUSS,
// not a solid roof panel — confirmed live from a real screenshot showing
// bare timber wireframe over every building, not shingles. 'roof-side' (a
// solid shingled A-frame cross-section — it spans the FULL building width
// in one tile, both slopes meeting at a centred ridge, which is why it's
// scaled by wTiles in X below rather than also tiled across that axis) is
// the real roof surface. Its matching 'roof-side-corner' end cap turned
// out, on that same live paint-and-isolate check, to ALSO be a thin open
// ridge beam rather than a solid triangle — every gable end was standing
// open behind it, the exact "crossed beams through empty building tops"
// Kevin flagged from a real screenshot. No piece in this kit is a
// reliable solid end cap, so the gable end below is hand-built instead: a
// flat triangular prism (GABLE_GEO), scaled to roof-side's own real
// measured rise (RISE, computed in _rebuild) rather than assumed.
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
//
// wall/wall-door/wall-window and wall-paint/wall-paint-door/wall-paint-window
// are the only two genuinely SOLID full wall panels this kit turned out to
// have, of every one checked — not assumed, checked, the same way
// roof-side-corner's assumed solidity turned out wrong: a small standalone
// script flood-fills each piece's real loaded geometry by shared vertex
// position to count actual disconnected chunks. A plain box is exactly 1;
// wall and wall-paint both came back 1, wall-door/wall-window/wall-paint-
// door/wall-paint-window all came back a matching 5 (a real door or window
// opening legitimately IS several solid parts — frame, jamb, leaf — so 5
// vs 5 is agreement, not a red flag). Every single wall-fortified* and
// wall-pane* piece came back 4-6 — a genuinely fragmented, non-solid mesh
// each time, which is exactly the open, see-through look Kevin flagged
// live. No solid "fortified" wall exists in this kit, so the grand tier
// reuses plain 'wall' for its wall panel and is told apart by real
// architecture instead — corner columns (also checked solid) and its own
// already-taller wallHeight — rather than by a piece that doesn't exist.
const TIERS = [
  { key: 'humble', max: 27, wall: 'wall-paint', door: 'wall-paint-door', window: 'wall-paint-window', maxTiles: 2 },
  { key: 'plain', max: 44, wall: 'wall', door: 'wall-door', window: 'wall-window', maxTiles: 3 },
  { key: 'grand', max: Infinity, wall: 'wall', door: 'wall-door', window: 'wall-window', maxTiles: 3 },
];
function tierFor(weight) { return TIERS.find((t) => weight <= t.max) ?? TIERS[TIERS.length - 1]; }

const PIECES = [
  ...new Set(TIERS.flatMap((t) => [t.wall, t.door, t.window])),
  'roof-side', 'tower-base', 'tower-top', 'column-damaged', 'column',
];

// The gable end cap, hand-built — see the comment above PIECES for why no
// Kenney piece here works for this. A unit isoceles triangle (base -0.5 to
// 0.5, apex at (0,1)), matching roof-side's own full-width cross-section
// shape so the two meet flush; instanced and scaled per building exactly
// like every other roof piece (scale.x = wTiles, scale.y = the real RISE).
// Extruded a thin 0.15 in Z rather than left a flat plane, so it reads as
// a real infilled wall — plaster/wattle behind the timber frame, the
// actual medieval material a gable like this would be — not a paper cutout,
// and centred in Z so it sits astride the same ridge-line slot
// roof-side-corner used to.
const GABLE_GEO = (() => {
  const shape = new Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0, 1);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false, curveSegments: 1 });
  geo.translate(0, 0, -0.075);
  geo.computeVertexNormals();
  return geo;
})();
// A flat toon-shaded colour rather than a Kenney texture — this shape has
// no UVs a Kenney texture atlas would map onto correctly, and plaster
// infill is genuinely a different material from the timber/stone wall
// below it in real half-timber construction, not a compromise standing in
// for one.
const GABLE_MAT = new MeshToonMaterial({ color: 0xc9bb95, gradientMap: toonRamp });

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
    // roof-side's real measured rise, not an assumed round number — read
    // off the bounding box assets.js already captured on load, the same
    // "real data over a guess" rule the wealth tiers below already follow.
    // The gable end's own apex is scaled to this exact height so it meets
    // roof-side's real ridge line, not a guessed one.
    const RISE = A['roof-side'].box.max.y - A['roof-side'].box.min.y;
    // One InstancedMesh per PIECE NAME (walls/doors/windows across all
    // three wealth tiers, plus the two roof pieces) rather than per
    // semantic role — a 'humble' building's wall and a 'grand' one's are
    // different geometry entirely now, not just a different colour on the
    // same box, so each real piece needs its own instancing group. Counts
    // are generous fixed estimates, over-allocated rather than counted
    // exactly up front — a one-time waste of unused buffer capacity on a
    // rebuild that happens once per 20 commits, not a per-frame cost.
    this.meshes = new Map();
    // Every piece now gets the same generous n*4 — 'roof-side' used to get
    // a tighter n*3 on the assumption of at most (maxTiles-2) slices per
    // building, which broke the moment the roof loop below started tiling
    // EVERY ridge slot rather than skipping the endmost ones.
    const capFor = () => n * 4;
    // 'gable' isn't a Kenney piece loaded into A — it's the hand-built
    // GABLE_GEO/GABLE_MAT pair above — so it's added alongside PIECES here
    // rather than folded into that list, which stays exactly "the names to
    // fetch from the kit."
    const pieceNames = [...PIECES, 'gable'];
    const pieceAsset = (name) => (name === 'gable' ? { geometry: GABLE_GEO, material: GABLE_MAT } : A[name]);
    for (const name of pieceNames) {
      const piece = pieceAsset(name);
      const mesh = new InstancedMesh(piece.geometry, piece.material, capFor(name));
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.meshes.set(name, mesh);
    }
    const counts = new Map(pieceNames.map((name) => [name, 0]));
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
      if (tier.key === 'grand') placeCornerColumns(place, dummy, x, z, wTiles, dTiles, rot, wallHeight, h);

      // A real gable roof along the Z ridge (not a hip roof — there are no
      // slopes on the short ends, just the vertical gable triangle):
      // roof-side A-frame slices tile the FULL ridge, one per depth slot,
      // no exceptions at the ends — earlier this skipped the endmost slots
      // in favour of a gable there instead, which left a dTiles=2 building
      // with no roof-side at all (both its slots counted as "endmost") and
      // even a wider one with its roof-side surface simply missing above
      // the two end slots. A gable is a separate, additive thing: two thin
      // end-wall caps at the building's true ends (z=±hd exactly, not slot
      // centres), closing the vertical triangular gap under the eaves —
      // not a replacement for the roof surface above that same slot.
      const roofY = h + wallHeight;
      for (let j = 0; j < dTiles; j++) {
        const lz = -dTiles / 2 + j + 0.5;
        const off = rotatedOffset(0, lz, rot);
        dummy.position.set(x + off.x, roofY, z + off.z);
        dummy.scale.set(wTiles, 1, 1);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        place('roof-side', dummy.matrix);
      }
      for (const end of [-1, 1]) {
        const off = rotatedOffset(0, end * dTiles / 2, rot);
        dummy.position.set(x + off.x, roofY, z + off.z);
        dummy.scale.set(wTiles, RISE, 1);
        dummy.rotation.set(0, rot + (end === -1 ? Math.PI : 0), 0);
        dummy.updateMatrix();
        place('gable', dummy.matrix);
      }
    });

    // The capital: one hand-placed, larger structure near the town centre
    // rather than another spiral slot — always the 'grand' tier regardless
    // of any single building's own weight, since it represents the
    // settlement as a whole, not one commit's worth of work. A tower-base/
    // tower-top pair on its roof ridge is the one silhouette element no
    // ordinary building here has, so it reads as the seat of the town from
    // across the square, not just a bigger house.
    {
      const cx = -8, cz = -4;
      const ch = smoothHeightAt(cx, cz);
      const crot = 0.3;
      const grand = TIERS.find((t) => t.key === 'grand');
      const cwTiles = 5, cdTiles = 4;
      const cWallHeight = 2.4;
      for (const t of perimeterTiles(cwTiles, cdTiles, 777, grand)) {
        const off = rotatedOffset(t.x * TILE, t.z * TILE, crot);
        dummy.position.set(cx + off.x, ch, cz + off.z);
        dummy.scale.set(1, cWallHeight, 1);
        dummy.rotation.set(0, crot + t.facing, 0);
        dummy.updateMatrix();
        place(t.kind, dummy.matrix);
      }
      placeCornerColumns(place, dummy, cx, cz, cwTiles, cdTiles, crot, cWallHeight, ch);
      const cRoofY = ch + cWallHeight;
      for (let j = 0; j < cdTiles; j++) {
        const lz = -cdTiles / 2 + j + 0.5;
        const off = rotatedOffset(0, lz, crot);
        dummy.position.set(cx + off.x, cRoofY, cz + off.z);
        dummy.scale.set(cwTiles, 1, 1);
        dummy.rotation.set(0, crot, 0);
        dummy.updateMatrix();
        place('roof-side', dummy.matrix);
      }
      for (const end of [-1, 1]) {
        const off = rotatedOffset(0, end * cdTiles / 2, crot);
        dummy.position.set(cx + off.x, cRoofY, cz + off.z);
        dummy.scale.set(cwTiles, RISE, 1);
        dummy.rotation.set(0, crot + (end === -1 ? Math.PI : 0), 0);
        dummy.updateMatrix();
        place('gable', dummy.matrix);
      }
      // The tower, rising directly off the roof ridge. First version added
      // an extra 0.9-unit gap here before the tower even started, on top of
      // not accounting for 'tower-top' being a short 0.3-tall CAP piece,
      // not a full 1-unit tile like everything else in this kit (its real
      // bounding box, checked after the fact from a screenshot that showed
      // it floating disconnected in open sky) — together those left the
      // whole tower hanging well above the building it was meant to rise
      // from. Fixed: tower-base's own base sits exactly at the ridge, and
      // tower-top's own base sits exactly at tower-base's real (scaled) top.
      const TOWER_BASE_H = 1.8;
      dummy.position.set(cx, cRoofY, cz);
      dummy.scale.set(1.4, TOWER_BASE_H, 1.4);
      dummy.rotation.set(0, crot, 0);
      dummy.updateMatrix();
      place('tower-base', dummy.matrix);
      dummy.position.set(cx, cRoofY + TOWER_BASE_H, cz);
      dummy.scale.set(1.4, 1.4, 1.4);
      dummy.rotation.set(0, crot, 0);
      dummy.updateMatrix();
      place('tower-top', dummy.matrix);
    }

    for (const [name, mesh] of this.meshes) {
      mesh.count = counts.get(name);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.group.add(...this.meshes.values());
  }
}
