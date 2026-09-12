/** Exact building visibility without scanning every triangle on every label update. */
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

export function visibilityMeshes(root) {
  const meshes = [];
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || mesh.material?.transparent) return;
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    geometry.boundsTree ??= new MeshBVH(geometry, { indirect: true });
    mesh.raycast = acceleratedRaycast;
    meshes.push(mesh);
  });
  return meshes;
}

export function isOccluded(raycaster, meshes) {
  raycaster.firstHitOnly = true;
  const hits = [];
  for (const mesh of meshes) {
    if (!mesh.visible) continue;
    raycaster.intersectObject(mesh, false, hits);
    if (hits.length) return true;
  }
  return false;
}
