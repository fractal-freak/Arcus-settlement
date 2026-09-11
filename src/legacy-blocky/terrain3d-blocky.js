/**
 * The land, as blocks.
 *
 * Terrain comes from the same pure functions the 2D world used — groundAt,
 * heightAt, propAt — which is the whole reason the engine could be swapped in
 * an afternoon. Nothing about the shape of this world was tied to how it was
 * drawn.
 *
 * Each tile is a column with a cap: a dirt body and a thin slab of grass, sand,
 * stone or paving on top. Because height is terraced, neighbouring columns of
 * different heights leave exposed dirt sides, which is what reads as a cliff.
 *
 * Everything is instanced — one draw call per material per chunk, not per tile.
 * A chunk of 16x16 is five meshes whatever is in it.
 */

import {
  Group, BoxGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry,
  MeshLambertMaterial, InstancedMesh, Mesh,
  Object3D, Color, DoubleSide,
} from 'three';
import { CHUNK, chunkKey } from '../app/iso.js';
import { groundAt, heightAt, propAt, GROUND, STEP, WATER_LEVEL } from '../app/terrain.js';

/** Surface colours. Flat and saturated — lighting does the shading, not the texture. */
const CAP = {
  grass: 0x7cc65f, meadow: 0x62b45a, scrub: 0xa8c169,
  plaza: 0xd9d0bf, road: 0xc6a97c, sand: 0xe8d9a8, stone: 0xa6a6b2,
};
const DIRT = 0x8a6142;
const DIRT_DEEP = 0x6d4c34;
const WATER = 0x3fb8e8;

const CAP_H = 0.18;
/** How far a column reaches below its cap. Enough to cover the deepest cliff. */
const COL_DROP = 6;

const capGeo = new BoxGeometry(1, CAP_H, 1);
const colGeo = new BoxGeometry(1, 1, 1);
const waterGeo = new BoxGeometry(1, 1, 1);
const trunkGeo = new CylinderGeometry(0.09, 0.13, 1, 6);
const leafGeo = new IcosahedronGeometry(0.52, 0);

const capMat = new MeshLambertMaterial({ vertexColors: false });
// White, because instance colour multiplies this. A brown here and a brown
// per instance multiplied to near-black and every cliff face looked burnt.
const colMat = new MeshLambertMaterial({ color: 0xffffff });
// Lambert, matching every other surface here. Standard's specular caught the
// bright overhead sun and the pale sky fog together, and the two washed the
// blue out to grey — measured at (82,123,147), nowhere near the colour set.
// A cheerful pond is flat-shaded, not a photoreal mirror.
const waterMat = new MeshLambertMaterial({
  color: WATER, transparent: true, opacity: 0.88, side: DoubleSide,
});
const trunkMat = new MeshLambertMaterial({ color: 0x8a5c3a });
const leafMat = new MeshLambertMaterial({ color: 0x3f9950 });

const dummy = new Object3D();
const tint = new Color();
const DIRT_C = new Color(DIRT);

function capColor(kind) {
  return CAP[kind] ?? CAP.grass;
}

export class Terrain3D {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.built = 0;

    /**
     * A floor under everything, well below the real terrain's lowest point.
     *
     * Detailed chunks only stream out to a finite radius — they have to, or
     * the triangle count runs away. Past that radius there used to be nothing
     * at all, so zooming out showed the true edge of what was loaded: a hard
     * line with the flat scene background beyond it. This is not a second
     * terrain system, just one huge cheap plane (two triangles) the same
     * colour as the grass, sitting far enough down that it is never visible
     * through the real ground, only past its rim. It rides under the camera
     * target rather than sitting fixed at the origin, so it is always exactly
     * as large as it needs to be wherever you have travelled to.
     */
    const floorMat = new MeshLambertMaterial({ color: CAP.grass });
    this.floor = new Mesh(new PlaneGeometry(1, 1), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -6;
    this.floor.receiveShadow = true;
    this.floor.renderOrder = -1;
    scene.add(this.floor);
  }

  /** Keep the floor centred under wherever the camera is looking, sized to match. */
  layFloor(targetX, targetZ, radiusTiles) {
    const size = Math.max(4000, radiusTiles * 30);
    this.floor.scale.set(size, size, 1);
    this.floor.position.x = targetX;
    this.floor.position.z = targetZ;
  }

  clear() {
    for (const k of [...this.chunks.keys()]) this.drop(k);
  }

  drop(key) {
    const g = this.chunks.get(key);
    if (!g) return;
    this.scene.remove(g);
    g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
    this.chunks.delete(key);
  }

  build(cx, cy) {
    const t0x = cx * CHUNK, t0y = cy * CHUNK;

    // Count first, so each InstancedMesh is allocated exactly once.
    const land = [];
    const water = [];
    const trees = [];
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = t0x + i, ty = t0y + j;
        const g = groundAt(tx, ty);
        if (g.kind === GROUND.void) continue;
        const h = heightAt(tx, ty);
        const submerged = h < WATER_LEVEL + STEP * 0.5;
        // groundAt's own water/sand — a coastline pattern from the old 2D
        // world — runs on a different noise field than heightAt's river
        // channels, so the two rarely agree on which tiles are wet. A tile
        // heightAt actually sinks needs a lake-bed cap regardless of what
        // groundAt called it, or it shows through as plain grass under the
        // water, and 'water' itself is not a cap colour CAP even has.
        land.push({ tx, ty, h, kind: submerged ? GROUND.sand : g.kind });
        if (submerged) water.push({ tx, ty });
        else {
          const p = propAt(tx, ty);
          if (p && (p.kind === 'tree' || p.kind === 'bush')) trees.push({ tx, ty, h, p });
        }
      }
    }
    if (!land.length) {
      this.chunks.set(chunkKey(cx, cy), new Group());
      return;
    }

    const group = new Group();

    const caps = new InstancedMesh(capGeo, capMat, land.length);
    const cols = new InstancedMesh(colGeo, colMat, land.length);
    caps.castShadow = false; caps.receiveShadow = true;
    cols.castShadow = true; cols.receiveShadow = true;

    land.forEach((t, n) => {
      dummy.position.set(t.tx + 0.5, t.h - CAP_H / 2, t.ty + 0.5);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      caps.setMatrixAt(n, dummy.matrix);
      caps.setColorAt(n, tint.setHex(capColor(t.kind)));

      const top = t.h - CAP_H;
      dummy.position.set(t.tx + 0.5, top - COL_DROP / 2, t.ty + 0.5);
      dummy.scale.set(1, COL_DROP, 1);
      dummy.updateMatrix();
      cols.setMatrixAt(n, dummy.matrix);
      // Deeper ground is darker, so a tall cliff has a gradient down its face.
      // Higher ground is lighter earth, lower is damper and darker.
      cols.setColorAt(n, tint.setHex(DIRT_DEEP).lerp(DIRT_C, Math.min(1, t.h / 3.2)));
    });
    caps.instanceMatrix.needsUpdate = true;
    cols.instanceMatrix.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;
    if (cols.instanceColor) cols.instanceColor.needsUpdate = true;
    group.add(caps, cols);

    if (water.length) {
      const w = new InstancedMesh(waterGeo, waterMat, water.length);
      w.receiveShadow = true;
      water.forEach((t, n) => {
        dummy.position.set(t.tx + 0.5, WATER_LEVEL + STEP * 0.5, t.ty + 0.5);
        dummy.scale.set(1, STEP, 1);
        dummy.updateMatrix();
        w.setMatrixAt(n, dummy.matrix);
      });
      w.instanceMatrix.needsUpdate = true;
      group.add(w);
    }

    if (trees.length) {
      const trunks = new InstancedMesh(trunkGeo, trunkMat, trees.length);
      const leaves = new InstancedMesh(leafGeo, leafMat, trees.length * 3);
      trunks.castShadow = true; trunks.receiveShadow = true;
      leaves.castShadow = true; leaves.receiveShadow = true;

      let li = 0;
      trees.forEach((t, n) => {
        const bush = t.p.kind === 'bush';
        const scale = bush ? 0.55 : 1 + t.p.variant * 0.16;
        const trunkH = bush ? 0.25 : 1.1 * scale;
        const x = t.tx + 0.5, z = t.ty + 0.5;

        dummy.position.set(x, t.h + trunkH / 2, z);
        dummy.scale.set(scale, trunkH, scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(n, dummy.matrix);

        // Three blobs, offset and rotated, so no two trees look alike.
        const base = t.h + trunkH;
        const seed = (t.tx * 73856093) ^ (t.ty * 19349663);
        for (let b = 0; b < 3; b++) {
          const r = ((seed >> (b * 3)) & 7) / 7;
          dummy.position.set(
            x + (r - 0.5) * 0.34 * scale,
            base + (0.22 + b * 0.30) * scale,
            z + (((seed >> (b * 5 + 2)) & 7) / 7 - 0.5) * 0.34 * scale,
          );
          const s = (1.05 - b * 0.22) * scale * (bush ? 1.25 : 1);
          dummy.scale.set(s, s * 0.86, s);
          dummy.rotation.set(r * 1.4, r * 2.2, r * 0.8);
          dummy.updateMatrix();
          leaves.setMatrixAt(li, dummy.matrix);
          leaves.setColorAt(li, tint.setHex(b === 0 ? 0x357f42 : b === 1 ? 0x3f9950 : 0x52b465));
          li++;
        }
      });
      trunks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      leaves.count = li;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      group.add(trunks, leaves);
    }

    this.scene.add(group);
    this.chunks.set(chunkKey(cx, cy), group);
    this.built++;
  }

  /**
   * Keep chunks in step with where the camera is looking.
   *
   * Radius is in chunks, from the target on the ground plane. A couple built
   * per frame keeps a fast pan from stuttering.
   */
  update(targetX, targetZ, radiusTiles, budget = 2) {
    this.layFloor(targetX, targetZ, radiusTiles);
    const cx0 = Math.floor(targetX / CHUNK);
    const cy0 = Math.floor(targetZ / CHUNK);
    const r = Math.max(1, Math.ceil(radiusTiles / CHUNK));

    const wanted = new Set();
    const todo = [];
    for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        const k = chunkKey(cx, cy);
        wanted.add(k);
        if (!this.chunks.has(k)) {
          const d = (cx - cx0) ** 2 + (cy - cy0) ** 2;
          todo.push({ cx, cy, d });
        }
      }
    }
    // Nearest first, so what you are looking at appears before the far edges.
    todo.sort((a, b) => a.d - b.d);
    for (let i = 0; i < Math.min(budget, todo.length); i++) this.build(todo[i].cx, todo[i].cy);

    for (const k of [...this.chunks.keys()]) if (!wanted.has(k)) this.drop(k);
    return { live: this.chunks.size, pending: Math.max(0, todo.length - budget) };
  }
}
