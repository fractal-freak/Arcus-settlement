/**
 * Loads and caches Kenney's Retro Fantasy Kit (CC0 — public/assets/
 * kenney-retro-fantasy/License.txt) — real modelled, textured pieces,
 * asked for by name over the hand-built primitives everything else in this
 * world still uses. Deliberately NOT re-themed to match the cel-shaded
 * pass: on request, exactly as downloaded, style reconciliation left for
 * later.
 *
 * Every piece is a small modular tile (a single wall block, a single roof
 * corner) meant to be COMBINED, the way the kit's own sample scene is one
 * elaborate structure built from dozens of them — not a library of
 * complete buildings. town3d.js is what does that combining now; this
 * module only ever loads a piece once and hands back the same cached
 * geometry/material for every further request, exactly the "load once,
 * instance many" rule the rest of this codebase already runs on for its
 * own procedural props.
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Box3, Vector3 } from 'three';

const BASE = './assets/kenney-retro-fantasy/';
const loader = new GLTFLoader();
const cache = new Map(); // name -> Promise<{geometry, material}>

/**
 * The first (and for every piece in this kit, only) real Mesh in the
 * loaded scene graph — Kenney's single-piece exports are one mesh each,
 * not a multi-part hierarchy, so there is no name to look up and no
 * ambiguity about which child is "the" model.
 */
function firstMesh(root) {
  let found = null;
  root.traverse((o) => { if (!found && o.isMesh) found = o; });
  return found;
}

/**
 * Load one named piece (no `.glb`, e.g. "wall" or "roof-corner"), cached
 * after the first call. Resolves to { geometry, material } ready to hand
 * straight to an InstancedMesh or a Mesh — never the loaded scene graph
 * itself, which GLTFLoader hands back fresh (and un-shareable) every call.
 */
export function loadPiece(name) {
  let entry = cache.get(name);
  if (entry) return entry;
  entry = new Promise((resolve, reject) => {
    loader.load(
      `${BASE}${name}.glb`,
      (gltf) => {
        const mesh = firstMesh(gltf.scene);
        if (!mesh) { reject(new Error(`no mesh in ${name}.glb`)); return; }
        mesh.geometry.computeBoundingBox();
        resolve({ geometry: mesh.geometry, material: mesh.material, box: mesh.geometry.boundingBox.clone() });
      },
      undefined,
      (err) => reject(err),
    );
  });
  cache.set(name, entry);
  return entry;
}

/** Load several pieces at once; resolves to a { name: {geometry, material, box} } map. */
export async function loadPieces(names) {
  const entries = await Promise.all(names.map((n) => loadPiece(n).then((v) => [n, v])));
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------------------
// KayKit Medieval Hexagon Pack (CC0 — public/assets/kaykit/License.txt, read
// and verified before a single file was used).
//
// A COMPLETE building per file, which is the whole reason this second loader
// exists. loadPiece() above takes the first mesh it finds and hands back its
// geometry, which is right for Kenney's kit — every tile there really is one
// mesh — and quietly wrong here: measured straight out of the .gltf, the
// windmill, watermill, lumbermill and tower-catapult are 2-3 meshes each
// (sails, wheel, and so on). firstMesh() would have loaded the mill and
// silently dropped its sails, which is the same class of mistake as assuming
// a roof cap was solid. So this path keeps the whole scene graph and clones
// it per placement.
//
// Cloning rather than instancing is a deliberate, and cheap, choice: the
// village is roughly twenty buildings of a few thousand triangles, not the
// several hundred wall tiles the Kenney path had to instance. three.js's
// clone() shares geometry and material with the original anyway, so every
// building in the village still draws from one texture atlas.
// ---------------------------------------------------------------------------

const KAYKIT = './assets/kaykit/';
const modelCache = new Map(); // name -> Promise<{ scene, box, size }>

/**
 * Load one complete model by file name (no extension), e.g.
 * "building_home_A_red". Resolves to the loaded scene plus its REAL measured
 * bounding box across every mesh in it — the callers here size and ground
 * buildings off that box rather than off any assumption about the kit's
 * scale, because the models genuinely vary (a well is 0.65 units wide, a
 * castle 2.26) and several sit with part of themselves below their own
 * origin on purpose (a watermill's wheel, a bridge's supports).
 */
export function loadModel(name) {
  let entry = modelCache.get(name);
  if (entry) return entry;
  entry = new Promise((resolve, reject) => {
    loader.load(
      `${KAYKIT}${name}.gltf`,
      (gltf) => {
        const scene = gltf.scene;
        scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
        });
        const box = new Box3().setFromObject(scene);
        resolve({ scene, box, size: box.getSize(new Vector3()) });
      },
      undefined,
      (err) => reject(new Error(`failed to load ${name}.gltf: ${err?.message ?? err}`)),
    );
  });
  modelCache.set(name, entry);
  return entry;
}

/** Load several complete models at once; resolves to a { name: {scene, box, size} } map. */
export async function loadModels(names) {
  const unique = [...new Set(names)];
  const entries = await Promise.all(unique.map((n) => loadModel(n).then((v) => [n, v])));
  return Object.fromEntries(entries);
}
