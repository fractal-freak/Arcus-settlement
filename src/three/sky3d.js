/**
 * Clouds.
 *
 * Used to also own a big gradient shader sphere for the sky itself. That sphere
 * rendered WITHOUT fog applied (`fog: false` on its material) while every other
 * surface in the scene fogs out normally, and its own horizon colour was close
 * to but never exactly the fog's colour — the two met at the true horizon in a
 * visible seam, worse the more of the frame was sky. Reported as "a weird
 * foggy film." Removed: stage.js's own background colour plus FogExp2 already
 * does the whole job of "sky that blends into the distance," correctly and
 * once, and needs nothing layered under it.
 *
 * The dome and the clouds ride with the camera target, so you can travel as
 * far as you like and there is still weather overhead.
 */

import { Group, IcosahedronGeometry, MeshLambertMaterial, Object3D, InstancedMesh } from 'three';

export class Sky3D {
  constructor(scene) {
    this.clouds = new Group();
    scene.add(this.clouds);
    const geo = new IcosahedronGeometry(1, 0);
    // Measured: at 0.95 a cloud drifting in front of anything — a lake, later
    // a building — reads as nearly solid white and washes the colour behind it
    // to grey. A light accent, not an occluding wall.
    this.cloudMat = new MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.62 });
    this.puffs = new InstancedMesh(geo, this.cloudMat, 16 * 5);
    this.puffs.castShadow = false;
    this.puffs.receiveShadow = false;
    this.puffs.frustumCulled = false;
    this.clouds.add(this.puffs);

    this.items = [];
    for (let i = 0; i < 16; i++) {
      this.items.push({
        x: (Math.random() - 0.5) * 900,
        // Low enough to sit in frame from a ground-level camera. At a hundred
        // units up they were overhead and out of shot at every close zoom.
        y: 38 + Math.random() * 34,
        z: (Math.random() - 0.5) * 900,
        s: 7 + Math.random() * 11,
        sp: 1.6 + Math.random() * 2.6,
        seed: Math.random() * 100,
      });
    }
    this.dummy = new Object3D();
    this.writePuffs();
  }

  writePuffs() {
    const d = this.dummy;
    let n = 0;
    for (const c of this.items) {
      for (let b = 0; b < 5; b++) {
        const o = b - 2;
        d.position.set(
          c.x + o * c.s * 0.75,
          c.y + Math.sin(c.seed + b) * c.s * 0.16,
          c.z + Math.cos(c.seed * 1.7 + b) * c.s * 0.30,
        );
        const s = c.s * (1 - Math.abs(o) * 0.19);
        d.scale.set(s, s * 0.58, s * 0.82);
        d.rotation.set(c.seed + b, c.seed * 2 + b, 0);
        d.updateMatrix();
        this.puffs.setMatrixAt(n++, d.matrix);
      }
    }
    this.puffs.count = n;
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  applySky(sky) {
    const l = sky.light;
    this.cloudMat.color.setRGB(0.28 + 0.72 * l, 0.30 + 0.70 * l, 0.36 + 0.64 * l);
    // This ran every feed tick and put the constructor's 0.62 straight back up
    // to 0.95 in daylight, which was the actual cause of a cloud washing a
    // lake to grey — not the water material. Same night/day range, capped
    // lower so a cloud never gets dense enough to blank out what is behind it.
    this.cloudMat.opacity = 0.34 + 0.28 * l;
  }

  update(dtMs, target) {
    for (const c of this.items) {
      c.x += c.sp * (dtMs / 1000);
      // Wrap around the viewer rather than around the origin, so the sky is
      // never empty however far the camera has travelled.
      if (c.x - target.x > 520) c.x = target.x - 520;
      if (c.x - target.x < -520) c.x = target.x + 520;
      if (Math.abs(c.z - target.z) > 520) c.z = target.z + (Math.random() - 0.5) * 900;
    }
    this.writePuffs();
  }
}
