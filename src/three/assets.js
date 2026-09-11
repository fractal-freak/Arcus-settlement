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
