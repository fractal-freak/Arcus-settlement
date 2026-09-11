/**
 * The dig camps: what makes a site read as a site.
 *
 * The archaeologists were already standing in the right places — `app/digs.js`
 * puts them at the ruins the terrain generates — and Kevin's answer was that he
 * could not see any dig sites at all, just people standing on empty ground. He
 * was right. The terrain's own ruin is a slab 1.3 units across and three
 * pillars a unit high, drawn beside a person 2.35 tall and houses at 5: from
 * any distance you would actually look from, it is a pebble.
 *
 * So each site gets a CAMP: a ruin big enough to be excavating, a tent, the
 * spoil, the crates the finds go into, a ladder down into the trench, and
 * stakes marking the edge. Nothing here is invented about WHERE — the site
 * centre comes from digs.js, the same module the hub uses to say which
 * archaeologist is at which — only about what a camp at one looks like.
 *
 * NOT CHUNKED, deliberately. Terrain props only exist while their chunk is
 * loaded, and the sites are seventy-five units out and further, so from the
 * village every one of them would be a person standing on the bare fallback
 * plane. A camp is a landmark: built once, always there, visible the moment
 * you pan far enough to see it.
 */

import { Group, Object3D, InstancedMesh, Matrix4 } from 'three';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { digSites } from '../app/digs.js';
import { loadModels } from './assets.js';
import { KIT_SCALE } from '../app/propSizes.js';

const dummy = new Object3D();

/**
 * The camp, as a ring of things around the trench.
 *
 * `at` is the bearing in turns and `out` the distance from the site centre, so
 * a camp reads as arranged around the work rather than scattered near it.
 *
 * THREE RINGS, and the distances are not free. The excavated building holds
 * the middle and is 7.7 units across, so its own ground reaches about 3.9 out;
 * the crew work the edge of the cutting at 5.0 to 6.2 (see digFor in
 * app/digs.js); the camp begins at 7 and the corner stakes stand at 9.6. Move
 * any one of those and the archaeologists end up kneeling inside a tent.
 */
const CAMP = [
  { kind: 'building_destroyed', at: 0.00, out: 0.0, face: 0.0 },
  { kind: 'tent', at: 0.62, out: 8.2, face: 0.62 },
  { kind: 'crate_open', at: 0.76, out: 7.6 },
  { kind: 'crate_B_big', at: 0.82, out: 8.0 },
  { kind: 'crate_A_small', at: 0.71, out: 8.4 },
  { kind: 'pallet', at: 0.34, out: 7.4 },
  { kind: 'resource_stone', at: 0.30, out: 7.9 },
  { kind: 'rock_single_E', at: 0.22, out: 7.2 },
  { kind: 'rock_single_C', at: 0.16, out: 7.8 },
  { kind: 'ladder', at: 0.05, out: 7.0, face: 0.05 },
  { kind: 'wheelbarrow', at: 0.46, out: 7.7 },
  { kind: 'bucket_empty', at: 0.52, out: 7.1 },
  { kind: 'sack', at: 0.88, out: 7.3 },
  // Stakes on the four corners of the cutting.
  { kind: 'flag_yellow', at: 0.125, out: 9.6 },
  { kind: 'flag_yellow', at: 0.375, out: 9.6 },
  { kind: 'flag_yellow', at: 0.625, out: 9.6 },
  { kind: 'flag_yellow', at: 0.875, out: 9.6 },
];

const KINDS = [...new Set(CAMP.map((c) => c.kind))];

/**
 * The ruin stands at the kit's own scale, like everything else from it.
 *
 * It was given its own larger multiplier first, on the reasoning that it is
 * the reason for the camp — and it came out ten units across and taller than
 * the church, which is the exact mistake the whole built layer already learned
 * once: the kit knows how big its own things are. A ruined building at 5 is a
 * ruined building.
 */
const RUIN_SCALE = KIT_SCALE;

export class DigSite3D {
  constructor(scene) {
    this.scene = scene;
    this.group = new Group();
    scene.add(this.group);
    this.ready = false;
    loadModels(KINDS).then((models) => {
      this.models = models;
      this.build();
      this.ready = true;
    }).catch(() => { /* a camp that will not load simply is not there */ });
  }

  build() {
    const sites = digSites();
    if (!sites.length) return;

    // One InstancedMesh per model mesh for the whole valley: seventeen pieces
    // across twenty-two camps is nearly four hundred objects, and they never
    // move or change once placed.
    for (const kind of KINDS) {
      const model = this.models[kind];
      if (!model) continue;
      const rows = CAMP.filter((c) => c.kind === kind);
      const meshes = [];
      model.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
      const s = kind === 'building_destroyed' ? RUIN_SCALE : KIT_SCALE;

      for (const src of meshes) {
        const inst = new InstancedMesh(src.geometry, src.material, sites.length * rows.length);
        inst.name = `dig:${kind}`;
        inst.castShadow = true;
        inst.receiveShadow = true;
        const local = new Matrix4().copy(src.matrixWorld);
        let n = 0;
        for (const site of sites) {
          for (const row of rows) {
            // Each camp is turned a different way on its own site, so twenty-two
            // of them do not read as twenty-two copies of one camp.
            const spin = hash2(site.x, site.z, 77) * Math.PI * 2;
            const a = spin + row.at * Math.PI * 2;
            const x = site.x + Math.cos(a) * row.out;
            const z = site.z + Math.sin(a) * row.out;
            dummy.position.set(x, smoothHeightAt(x, z), z);
            // A thing with a front faces the trench; everything else takes a
            // settled bearing of its own.
            dummy.rotation.set(0, row.face !== undefined
              ? Math.atan2(site.x - x, site.z - z)
              : spin + hash2(x, z, 79) * Math.PI * 2, 0);
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            inst.setMatrixAt(n++, dummy.matrix.clone().multiply(local));
          }
        }
        inst.count = n;
        inst.instanceMatrix.needsUpdate = true;
        this.group.add(inst);
      }
    }
  }
}
