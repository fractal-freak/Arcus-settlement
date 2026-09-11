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
import { smoothHeightAt, isWater, hash2, noise } from '../app/terrain.js';
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

// The same forestAt() formula terrain.js's own propAt() uses to decide
// where trees cluster (not exported itself, but built entirely from noise(),
// which is) — a building checks it for exactly the reason a tree does:
// so a house doesn't land in the middle of a real forest and end up
// poking up through the canopy. Threshold set above terrain.js's own
// clearing cutoffs (0.40-0.46), comfortably inside "this is really forest,"
// not the lighter shading forestAt also produces at ordinary open ground.
const FOREST_CLEAR = 0.55;
const forestAt = (tx, ty) => noise(tx / 42, ty / 42, 60);

/**
 * Deterministic from the building's own index, so a rebuild never reshuffles
 * the town. A retry only ever pushes radius outward AND jitters the angle a
 * little (hashed off n and the retry count, so still fully deterministic) —
 * pure radial pushing alone left a real fraction still landing in forest
 * (verified: 24 of 133 real buildings), because a forest patch that happens
 * to run roughly radially just gets re-crossed at every step along the same
 * ray. Angle jitter explores a real 2D neighbourhood instead of one line,
 * which measured down to 11 of 133 — better, not perfect; a spiral this
 * tightly packed will still rarely have anywhere clear within 10 tries.
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

const bodyGeo = new BoxGeometry(1, 1, 1);
const pyramidRoofGeo = new ConeGeometry(0.82, 0.7, 4);
pyramidRoofGeo.rotateY(Math.PI / 4); // a box's corners, not its faces, is where a hip roof's ridges belong
const coneRoofGeo = new ConeGeometry(0.78, 0.9, 12); // the granary's silo cap
const awningGeo = new BoxGeometry(1.08, 0.12, 1.08); // the market stall's flat cover

// A plain box with a roof on top read as exactly that — a box with a roof
// on top. A door, two windows and (on about half) a chimney are what
// actually reads as a BUILDING rather than a shed, for barely more
// geometry: each is one more instanced primitive, not a modelled asset.
const doorGeo = new BoxGeometry(0.24, 0.42, 0.05);
const windowGeo = new BoxGeometry(0.16, 0.16, 0.05);
const chimneyGeo = new BoxGeometry(0.13, 0.55, 0.13);

// White base colour: setColorAt is the only colour source, exactly like
// terrain3d.js's rock and ruin instances — instance colour multiplies
// against the material's own, so white leaves it unmodified.
const bodyMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const pyramidMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const coneMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const awningMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
// These three never vary — one colour apiece, no instance tint needed.
const doorMat = new MeshToonMaterial({ color: 0x2b2233, gradientMap: toonRamp });
const windowMat = new MeshToonMaterial({ color: 0xf3dfa0, gradientMap: toonRamp });
const chimneyMat = new MeshToonMaterial({ color: 0x8a8088, gradientMap: toonRamp });

const dummy = new Object3D();
const tmpColor = new Color();

/** A local (dx, dz) offset, rotated to match a building's own yaw — how a door ends up on its FRONT face, not always on world +Z. */
function rotatedOffset(dx, dz, rot) {
  const c = Math.cos(rot), s = Math.sin(rot);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

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
    const groups = ['bodies', 'pyramids', 'cones', 'awnings', 'doors', 'windows', 'chimneys'];
    if (this.bodies) {
      this.group.remove(...groups.map((k) => this[k]));
      for (const k of groups) this[k].dispose();
    }

    const n = buildings.length;
    this.bodies = new InstancedMesh(bodyGeo, bodyMat, n);
    // Over-allocated to n (or 2n for windows) rather than an exact count,
    // known only after the loop below finishes — one-time waste of unused
    // instance buffer capacity on a rebuild that happens once per 20
    // commits, not a per-frame cost, so not worth a second pass just to
    // size these exactly.
    this.pyramids = new InstancedMesh(pyramidRoofGeo, pyramidMat, n);
    this.cones = new InstancedMesh(coneRoofGeo, coneMat, n);
    this.awnings = new InstancedMesh(awningGeo, awningMat, n);
    this.doors = new InstancedMesh(doorGeo, doorMat, n);
    this.windows = new InstancedMesh(windowGeo, windowMat, n * 2);
    this.chimneys = new InstancedMesh(chimneyGeo, chimneyMat, n);
    for (const k of groups) { this[k].castShadow = true; this[k].receiveShadow = true; }

    let np = 0, nc = 0, na = 0, nd = 0, nwn = 0, nch = 0;
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
      // A wider eave than the body — the roof reads as SITTING ON the
      // walls rather than a lid exactly their own size, the way a real
      // roof overhangs the walls it covers.
      if (b.trade === 'stores') {
        dummy.position.set(x, roofY + 0.45, z);
        dummy.scale.set(w * 1.15, 1, depth * 1.15);
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
        dummy.scale.set(w * 1.22, 1, depth * 1.22);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        this.pyramids.setMatrixAt(np, dummy.matrix);
        this.pyramids.setColorAt(np, tmpColor.setHex(ROOF_COLOR[b.trade] ?? ROOF_COLOR.app));
        np++;
      }

      // A door, two windows flanking it, and — on about half — a chimney.
      // A market stall skips a door (it is open-fronted, not a house), but
      // still gets its windows for a "shopfront" read.
      const front = rotatedOffset(0, depth / 2 + 0.03, rot);
      if (b.trade !== 'site') {
        dummy.position.set(x + front.x, h + 0.23, z + front.z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        this.doors.setMatrixAt(nd, dummy.matrix);
        nd++;
      }
      const winL = rotatedOffset(-w * 0.3, depth / 2 + 0.03, rot);
      dummy.position.set(x + winL.x, h + height * 0.62, z + winL.z);
      dummy.rotation.set(0, rot, 0);
      dummy.updateMatrix();
      this.windows.setMatrixAt(nwn, dummy.matrix); nwn++;
      const winR = rotatedOffset(w * 0.3, depth / 2 + 0.03, rot);
      dummy.position.set(x + winR.x, h + height * 0.62, z + winR.z);
      dummy.rotation.set(0, rot, 0);
      dummy.updateMatrix();
      this.windows.setMatrixAt(nwn, dummy.matrix); nwn++;

      if (b.trade !== 'site' && hash2(idx, 9, 74) > 0.5) {
        const chim = rotatedOffset(w * 0.26, depth * 0.18, rot);
        dummy.position.set(x + chim.x, roofY + 0.5, z + chim.z);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        this.chimneys.setMatrixAt(nch, dummy.matrix);
        nch++;
      }
    });

    this.bodies.count = n;
    this.pyramids.count = np;
    this.cones.count = nc;
    this.awnings.count = na;
    this.doors.count = nd;
    this.windows.count = nwn;
    this.chimneys.count = nch;
    for (const k of groups) {
      this[k].instanceMatrix.needsUpdate = true;
      if (this[k].instanceColor) this[k].instanceColor.needsUpdate = true;
    }
    this.group.add(...groups.map((k) => this[k]));
  }
}
