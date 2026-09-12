import { makeFieldstones } from './fieldstones3d.js';
/** Worn fieldstones, each irregular, with moss filling their recessed joints. */
import { Group, InstancedMesh, Object3D, Color, MeshStandardMaterial, IcosahedronGeometry,
  BufferGeometry, Float32BufferAttribute, Mesh, Vector2 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SANCTUARY } from '../app/village.js';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { COURT_STONES, courtCoverage, courtGroundSafe } from '../app/sanctuary.js';
import { growCourtPlants } from './sanctuaryGrowth3d.js';
import { sanctuaryMaterials, earthPalette } from './sanctuaryMaterials.js';

export function makeSacredCourt() {
  const group = new Group(); group.name = 'Ancient moss-grown court';
  const maps = sanctuaryMaterials();
  const stones = COURT_STONES;
  group.add(makeFieldstones(stones));
  // Thin damp moss bed shows through gaps, instead of bright bare-earth seams.
  const positions=[], uv=[], coverage=[];
  const step=.4, radius=SANCTUARY.pavingRadius;
  for(let x=-radius;x<radius;x+=step) for(let z=-radius;z<radius;z+=step) {
    const corners=[[x,z],[x+step,z],[x,z+step],[x+step,z+step]];
    if(!corners.every(([x,z])=>courtGroundSafe(x,z,.12)))continue;
    if(corners.every(([x,z])=>courtCoverage(x,z)===0))continue;
    for(const i of [0,2,1,1,2,3]) {
      const [px,pz]=corners[i];
      positions.push(px,smoothHeightAt(px,pz)+.012,pz);
      uv.push(px*.18,pz*.18);coverage.push(courtCoverage(px,pz));
    }
  }
  const bed=new BufferGeometry();
  bed.setAttribute('position',new Float32BufferAttribute(positions,3));
  bed.setAttribute('uv',new Float32BufferAttribute(uv,2));
  bed.setAttribute('coverage',new Float32BufferAttribute(coverage,1));
  bed.computeVertexNormals();
  const mat = new MeshStandardMaterial({map: maps.moss.color, normalMap: maps.moss.normal,
    roughness: 1, color: 0xa5aa88, transparent: true, depthWrite: false});
  mat.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute float coverage; varying float vCoverage; varying vec2 vMossPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMossPosition = position.xz; vCoverage = coverage;');
    shader.fragmentShader = 'varying float vCoverage; varying vec2 vMossPosition;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float patches = 0.78 + 0.22 * sin(vMossPosition.x * 2.3) * cos(vMossPosition.y * 1.7);
      diffuseColor.a *= vCoverage * patches;
    `);
  };
  earthPalette(mat, true);
  const mesh = new Mesh(bed, mat); mesh.receiveShadow = true; group.add(mesh);
  group.add(growCourtPlants());
  return group;
}
