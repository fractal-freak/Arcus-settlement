/** The court and ancient paths share identical eroded geometry and scanned materials. */
import { Group, InstancedMesh, Object3D, Color, MeshStandardMaterial, IcosahedronGeometry, Vector2 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { sanctuaryMaterials, earthPalette } from './sanctuaryMaterials.js';
export function makeFieldstones(stones){
  const group=new Group(),maps=sanctuaryMaterials();
  // Several eroded shapes avoid repeating the same bevel on every stone.
  for (let variant = 0; variant < 7; variant++) {
    const geo = mergeVertices(new IcosahedronGeometry(1, 3), 1e-4);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const rough = 1 + Math.sin(x * 11 + variant * 3) * Math.cos(z * 9 - variant) * 0.055;
      pos.setXYZ(i, Math.sign(x) * Math.pow(Math.abs(x), 0.55) * 0.5 * rough,
        y * 0.5 + Math.sin(x * 8 + z * 13 + variant) * 0.065,
        Math.sign(z) * Math.pow(Math.abs(z), 0.65) * 0.5 * rough);
    }
    geo.computeVertexNormals();
    const m = variant % 3 === 0 ? maps.moss : maps.rock;
    const material = new MeshStandardMaterial({ map: m.color, normalMap: m.normal,
      normalScale: new Vector2(0.7, 0.7), roughnessMap: m.rough, roughness: 1, color: 0xd8d8d1 });
    earthPalette(material, variant % 3 === 0);
    const list = stones.filter((_, i) => i % 7 === variant);
    const mesh = new InstancedMesh(geo, material, list.length);
    const dummy = new Object3D(), color = new Color();
    list.forEach((s, i) => {
      dummy.position.set(s.x, smoothHeightAt(s.x, s.z) + s.height * 0.38 - s.sink, s.z);
      dummy.rotation.set((hash2(i,variant,320)-.5)*.14, -s.a + Math.PI / 2, (hash2(i,variant,321)-.5)*.12);
      dummy.scale.set(s.width, s.height, s.depth); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, color.setScalar(s.tone));
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = true; mesh.castShadow = true; group.add(mesh);
  }
  return group;
}
