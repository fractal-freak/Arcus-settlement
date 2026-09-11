/**
 * What the citizens have built.
 *
 * The settlement's own people work on making this place look more expensive
 * and more intricate — see arcus-quality.mjs for what that means in numbers —
 * and everything they finish arrives here as a list of things and where they
 * stand. This module's whole job is to put them there.
 *
 * NOTHING IS DECIDED HERE. Where a barrel goes, what kind it is, which way it
 * faces: all of that was settled by the simulation in the hub, using the same
 * village and terrain rules this client uses, so a piece can never land in the
 * river or inside somebody's house. This is rendering, and rendering invents
 * nothing — the same division of labour the rest of the world already runs on.
 *
 * INSTANCED BY KIND. A mature settlement holds four hundred odd pieces drawn
 * from about fifty models, so one InstancedMesh per model is forty-odd draw
 * calls for the lot rather than four hundred. They also never animate and
 * rarely change — the list only moves when a citizen finishes something — so
 * the whole set is rebuilt wholesale on change and then left completely alone.
 */

import { Group, InstancedMesh, Object3D, Matrix4 } from 'three';
import { smoothHeightAt } from '../app/terrain.js';
import { loadModels } from './assets.js';

const dummy = new Object3D();

/**
 * ONE number, applied to everything, and no exceptions.
 *
 * Every piece here comes out of the same kit as the houses, modelled against
 * the same ruler: a barrel is 0.21 units, a house is 0.93, a watchtower is
 * 2.49. The houses stand at exactly 5, so anything else from the kit stands at
 * exactly 5 as well, and the kit's own sense of what is big keeps working.
 *
 * The first version of this file sized each piece to a fixed footprint
 * instead, and that quietly threw the ruler away: a small crate and a big
 * crate both came out 3.9 units tall, taller than a villager, and a grove of
 * trees ended up SHORTER than a single tree. If a thing here ever looks the
 * wrong size, the model is wrong, not this number.
 */
const KIT_SCALE = 5.0;

export class Built3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    scene.add(this.group);
    this.ready = false;
    this._pending = null;
    this._signature = '';
    this.models = {};
  }

  /**
   * Load exactly the models this settlement is actually using, not every model
   * it could ever use. A young settlement has built four things out of three
   * kinds; fetching all fifty on its behalf would be fifty requests for
   * nothing. The set grows as the citizens reach for new kinds.
   */
  async _ensure(kinds) {
    const missing = kinds.filter((k) => !this.models[k]);
    if (!missing.length) return;
    const loaded = await loadModels(missing);
    Object.assign(this.models, loaded);
  }

  sync(placements) {
    if (!Array.isArray(placements)) return;
    // Rebuilt only when the list actually changes — which is when a citizen
    // finishes something, a handful of times an hour at most.
    //
    // The whole list is hashed rather than just its length and newest entry,
    // because citizens REPLACE things as well as add them: pull five pieces
    // out of the middle and put five back, and a count would not have moved.
    // Four hundred numbers, once every few seconds, costs nothing.
    let h = 2166136261;
    for (const p of placements) {
      h ^= (p.x * 97 + p.z * 31 + p.rot * 7 + p.kind.length) | 0;
      h = Math.imul(h, 16777619);
    }
    const sig = `${placements.length}:${h >>> 0}`;
    if (sig === this._signature) return;
    this._signature = sig;
    this._pending = placements;
    const kinds = [...new Set(placements.map((p) => p.kind))];
    this._ensure(kinds).then(() => {
      // Another sync may have landed while these were downloading; only the
      // newest list is worth drawing.
      if (this._pending === placements) this._rebuild(placements);
    }).catch(() => { /* a model that will not load simply does not appear */ });
  }

  _rebuild(placements) {
    for (const m of this.group.children) m.dispose?.();
    this.group.clear();

    const byKind = new Map();
    for (const p of placements) {
      if (!this.models[p.kind]) continue;
      if (!byKind.has(p.kind)) byKind.set(p.kind, []);
      byKind.get(p.kind).push(p);
    }

    for (const [kind, list] of byKind) {
      const model = this.models[kind];
      // A kit model can be several meshes — a mill's sails are their own mesh.
      // Each gets its own instanced copy, sharing one transform per placement,
      // which is why this walks the model's meshes rather than assuming one.
      const meshes = [];
      model.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      for (const src of meshes) {
        const inst = new InstancedMesh(src.geometry, src.material, list.length);
        inst.name = kind;
        inst.castShadow = true;
        inst.receiveShadow = true;
        // The mesh's own offset inside its model, kept so a multi-part piece
        // does not collapse into itself.
        const local = new Matrix4().copy(src.matrixWorld);
        list.forEach((p, i) => {
          dummy.position.set(p.x, smoothHeightAt(p.x, p.z), p.z);
          dummy.rotation.set(0, p.rot, 0);
          dummy.scale.setScalar(KIT_SCALE);
          dummy.updateMatrix();
          inst.setMatrixAt(i, dummy.matrix.clone().multiply(local));
        });
        inst.instanceMatrix.needsUpdate = true;
        this.group.add(inst);
      }
    }
    this.ready = true;
  }
}
