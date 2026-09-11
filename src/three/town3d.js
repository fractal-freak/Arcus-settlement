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
 */

import {
  Group, BoxGeometry, ConeGeometry, MeshToonMaterial, InstancedMesh,
  Object3D, Color,
} from 'three';
import { smoothHeightAt, isWater, hash2 } from '../app/terrain.js';
import { toonRamp } from './terrain3d.js';

const GOLDEN_ANGLE = 2.399963;
// First pass, spacing 2.35 against a footprint that could reach 2.38 wide,
// guaranteed overlap at any real density — verified live at the real 133
// buildings: a packed purple wall, not a town. Spacing now comfortably
// clears the largest possible footprint (see w/depth below).
const SPACING = 3.4;

/** Same six trades and the same body/roof colour pairs the 2D skyline already used. */
const TRADE_COLOR = { app: 0x6a5390, site: 0x8a5f6e, proof: 0x4f6a7d, vault: 0x8a7550, lore: 0x56707a, stores: 0x746f52 };
const ROOF_COLOR = { app: 0x8a6fb5, site: 0xa1707f, proof: 0x6b8ba1, vault: 0xa08c63, lore: 0x74919c, stores: 0x8f8a67 };

/** Deterministic from the building's own index, so a rebuild never reshuffles the town. */
function positionFor(n) {
  const angle = n * GOLDEN_ANGLE;
  let radius = SPACING * Math.sqrt(n + 1);
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let tries = 0; tries < 5 && isWater(Math.round(x), Math.round(z)); tries++) {
    radius += 1.6;
    x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  return { x, z };
}

const bodyGeo = new BoxGeometry(1, 1, 1);
const pyramidRoofGeo = new ConeGeometry(0.82, 0.7, 4);
pyramidRoofGeo.rotateY(Math.PI / 4); // a box's corners, not its faces, is where a hip roof's ridges belong
const coneRoofGeo = new ConeGeometry(0.78, 0.9, 12); // the granary's silo cap
const awningGeo = new BoxGeometry(1.08, 0.12, 1.08); // the market stall's flat cover

// White base colour: setColorAt is the only colour source, exactly like
// terrain3d.js's rock and ruin instances — instance colour multiplies
// against the material's own, so white leaves it unmodified.
const bodyMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const pyramidMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const coneMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const awningMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });

const dummy = new Object3D();
const tmpColor = new Color();

export class Town3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    scene.add(this.group);
    this.builtCount = -1; // forces the first sync() to actually build
  }

  /**
   * Rebuilt only when the real building count changes — buildings land in
   * batches of 20 real commits, never per frame, so a full instanced-mesh
   * rebuild on every new one is cheap in practice even though it is not
   * incremental.
   */
  sync(town) {
    if (!town || !town.buildings || town.buildings.length === this.builtCount) return;
    this.builtCount = town.buildings.length;
    this._rebuild(town.buildings);
  }

  _rebuild(buildings) {
    if (this.bodies) {
      this.group.remove(this.bodies, this.pyramids, this.cones, this.awnings);
      this.bodies.dispose(); this.pyramids.dispose(); this.cones.dispose(); this.awnings.dispose();
    }

    const n = buildings.length;
    this.bodies = new InstancedMesh(bodyGeo, bodyMat, n);
    // Over-allocated to n rather than an exact per-roof count, known only
    // after the loop below finishes — one-time waste of unused instance
    // buffer capacity on a rebuild that happens once per 20 commits, not a
    // per-frame cost, so not worth a second pass just to size these exactly.
    this.pyramids = new InstancedMesh(pyramidRoofGeo, pyramidMat, n);
    this.cones = new InstancedMesh(coneRoofGeo, coneMat, n);
    this.awnings = new InstancedMesh(awningGeo, awningMat, n);
    for (const m of [this.bodies, this.pyramids, this.cones, this.awnings]) {
      m.castShadow = true; m.receiveShadow = true;
    }

    let np = 0, nc = 0, na = 0;
    buildings.forEach((b, i) => {
      const idx = b.n ?? i;
      const { x, z } = positionFor(idx);
      const h = smoothHeightAt(x, z);
      const seed = hash2(idx, 7, 71);
      // Village-cottage scale, not tower blocks — a person figure stands
      // about 1.2 tall (people3d.js), and the tallest building here should
      // read as a real but modest hall next to one, not loom over the
      // treeline. Also toned down live, alongside the spacing fix above.
      const w = 0.9 + ((hash2(idx, 3, 72) * 5) | 0) * 0.22;
      const depth = 0.9 + ((hash2(idx, 5, 73) * 5) | 0) * 0.22;
      const height = 0.75 + Math.min(1.7, (b.weight ?? 4) / 22);
      const rot = seed * 6.283;

      dummy.position.set(x, h + height / 2, z);
      dummy.scale.set(w, height, depth);
      dummy.rotation.set(0, rot, 0);
      dummy.updateMatrix();
      this.bodies.setMatrixAt(i, dummy.matrix);
      this.bodies.setColorAt(i, tmpColor.setHex(TRADE_COLOR[b.trade] ?? TRADE_COLOR.app));

      const roofY = h + height + 0.02;
      if (b.trade === 'stores') {
        dummy.position.set(x, roofY + 0.45, z);
        dummy.scale.set(w * 1.05, 1, depth * 1.05);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        this.cones.setMatrixAt(nc, dummy.matrix);
        this.cones.setColorAt(nc, tmpColor.setHex(ROOF_COLOR.stores));
        nc++;
      } else if (b.trade === 'site') {
        dummy.position.set(x, roofY, z);
        dummy.scale.set(w, 1, depth);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        this.awnings.setMatrixAt(na, dummy.matrix);
        this.awnings.setColorAt(na, tmpColor.setHex(ROOF_COLOR.site));
        na++;
      } else {
        dummy.position.set(x, roofY + 0.32, z);
        dummy.scale.set(w * 1.08, 1, depth * 1.08);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        this.pyramids.setMatrixAt(np, dummy.matrix);
        this.pyramids.setColorAt(np, tmpColor.setHex(ROOF_COLOR[b.trade] ?? ROOF_COLOR.app));
        np++;
      }
    });

    this.bodies.count = n;
    this.pyramids.count = np;
    this.cones.count = nc;
    this.awnings.count = na;
    for (const m of [this.bodies, this.pyramids, this.cones, this.awnings]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.group.add(this.bodies, this.pyramids, this.cones, this.awnings);
  }
}
