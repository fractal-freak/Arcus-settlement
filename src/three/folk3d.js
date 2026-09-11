/**
 * Folk: the town's population, not its sessions.
 *
 * `town.folk` (arcus-town.mjs: `Math.floor(buildings.length / 3) + 4` — people
 * live here because there is somewhere to live, not invented separately from
 * what has been built) is a COUNT, never a list of named individuals the way
 * `people` is. There is nothing here to click, nothing to hover for a card,
 * and nothing to keep a stable identity across reloads beyond an index — so
 * this deliberately does NOT reuse people3d.js's Figure. Reusing it was the
 * first instinct and the one held off on: two visually-identical kinds of
 * "little person standing in the world," one clickable and one not, is a
 * real way for Kevin to click a villager expecting a session and get
 * nothing. Folk are smaller, plainer, muted, and — the clearest tell of
 * all — they actually WANDER, where a session figure stands in place and
 * only bobs. No name pill, no hover card, on purpose.
 *
 * One shared InstancedMesh pair (body + head) for the whole population:
 * unlike session figures, no individual ever needs its own material for a
 * hover tint or a state colour, so there is nothing instancing would cost
 * here that a per-instance Mesh would not.
 */

import {
  ConeGeometry, SphereGeometry, MeshToonMaterial, InstancedMesh, Object3D, Color,
} from 'three';
import { smoothHeightAt, isWater, hash2 } from '../app/terrain.js';
import { toonRamp } from './terrain3d.js';

const bodyGeo = new ConeGeometry(0.2, 0.56, 6);
const headGeo = new SphereGeometry(0.12, 8, 6);
const bodyMat = new MeshToonMaterial({ color: 0xffffff, gradientMap: toonRamp });
const headMat = new MeshToonMaterial({ color: 0xc7a67e, gradientMap: toonRamp });

const dummy = new Object3D();
const tmpColor = new Color();

/** Muted, close together — background life, not thirty-odd distinct characters to pick out. */
function folkColor(seed) {
  const hue = ((seed >>> 6) % 100) / 360 + 0.55; // a narrow slate/teal-to-plum band
  return new Color().setHSL(hue, 0.16, 0.4 + ((seed >>> 2) % 8) / 100);
}

/** A home near the town's built-up middle — folk live where there is somewhere to live. */
function homeFor(i) {
  const seed = hash2(i, 41, 131);
  const angle = hash2(i, 43, 132) * Math.PI * 2;
  let radius = 4 + hash2(i, 45, 133) * 34;
  let x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
  for (let tries = 0; tries < 5 && isWater(Math.round(x), Math.round(z)); tries++) {
    radius += 2;
    x = Math.cos(angle) * radius; z = Math.sin(angle) * radius;
  }
  return { x, z, seed };
}

export class Folk3D {
  constructor(scene) {
    this.scene = scene;
    this.count = -1;
    this.folk = [];
  }

  /** Rebuilt only when the real population number changes — same rare-rebuild pattern as Town3D. */
  sync(town) {
    const n = town?.folk ?? 0;
    if (n === this.count) return;
    this.count = n;
    this._rebuild(n);
  }

  _rebuild(n) {
    if (this.bodies) {
      this.scene.remove(this.bodies, this.heads);
      this.bodies.dispose(); this.heads.dispose();
    }
    this.folk = [];
    for (let i = 0; i < n; i++) {
      const home = homeFor(i);
      this.folk.push({
        home,
        h: smoothHeightAt(home.x, home.z),
        color: folkColor(home.seed),
        phase: (home.seed % 1000) / 1000,
        wanderR: 1.2 + (home.seed % 7) / 4,
        speed: 0.35 + (home.seed % 11) / 40,
      });
    }
    this.bodies = new InstancedMesh(bodyGeo, bodyMat, Math.max(1, n));
    this.heads = new InstancedMesh(headGeo, headMat, Math.max(1, n));
    this.bodies.count = n;
    this.heads.count = n;
    this.bodies.castShadow = true; this.bodies.receiveShadow = true;
    this.heads.castShadow = true;
    this.folk.forEach((f, i) => this.bodies.setColorAt(i, tmpColor.copy(f.color)));
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    this.scene.add(this.bodies, this.heads);
  }

  tick(elapsedS) {
    if (!this.bodies || !this.folk.length) return;
    this.folk.forEach((f, i) => {
      const t = elapsedS * f.speed + f.phase * 20;
      // A slow organic loop around home, not a straight pace back and
      // forth — two out-of-phase sines trace a lazy, rounded path.
      const dx = Math.sin(t) * f.wanderR;
      const dz = Math.sin(t * 0.63 + 1.7) * f.wanderR;
      const x = f.home.x + dx, z = f.home.z + dz;
      const y = smoothHeightAt(x, z);
      // Face the way it's actually moving, from the velocity direction —
      // standing figures don't need this, but a walking one facing its own
      // heading is most of what makes it read as walking rather than
      // sliding.
      const vx = Math.cos(t) * f.wanderR;
      const vz = Math.cos(t * 0.63 + 1.7) * 0.63 * f.wanderR;
      const heading = Math.atan2(vx, vz);
      const bob = Math.abs(Math.sin(t * 3)) * 0.03;

      dummy.position.set(x, y + 0.28 + bob, z);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.bodies.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, y + 0.62 + bob, z);
      dummy.updateMatrix();
      this.heads.setMatrixAt(i, dummy.matrix);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}
