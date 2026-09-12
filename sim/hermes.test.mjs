import test from 'node:test';
import assert from 'node:assert/strict';
import { HERMES, hermesWorld, hermesLocal, hermesBlocked } from '../src/app/hermes.js';
import { blocked } from '../src/app/occupied.js';
import { smoothHeightAt, naturalHeightAt } from '../src/app/terrain.js';
import '../src/app/digs.js';
import { landGeometry } from '../src/three/terrainGeometry.js';
import { CHUNK } from '../src/app/iso.js';

test('Hermes has solid exposed stone and an accessible aisle around the excavation',()=>{
  for(const [x,z] of [[0,-7],[0,-2],[-2.5,0],[-1,5]]) {
    const p=hermesWorld(x,z);assert.equal(blocked(p.x,p.z,.35),true);
    const q=hermesLocal(p.x,p.z);assert.ok(Math.hypot(q.x-x,q.z-z)<1e-10);
  }
  for(let z=-9;z<=9;z+=.5) {
    const p=hermesWorld(-6.3,z);assert.equal(hermesBlocked(p.x,p.z,.35),false);
    assert.equal(blocked(p.x,p.z,.35),false,`aisle at ${z}`);
  }
});
test('the excavation is real terrain and rendered vertex heights match the walking floor',()=>{
  assert.ok(naturalHeightAt(HERMES.x,HERMES.z)-smoothHeightAt(HERMES.x,HERMES.z)>.5);
  const cx=Math.floor(HERMES.x/CHUNK),cz=Math.floor(HERMES.z/CHUNK);
  const g=landGeometry(cx*CHUNK,cz*CHUNK),p=g.attributes.position;
  // Geometry uses absolute world coordinates.
  let seen=0;
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),z=p.getZ(i);
    if(Math.hypot(x-HERMES.x,z-HERMES.z)>7)continue;
    assert.ok(Math.abs(p.getY(i)-smoothHeightAt(x,z))<1e-5);seen++;
  }
  assert.ok(seen>0);g.dispose();
});


test('retired giant arms and detached sandal no longer create invisible barriers',()=>{
  for(const [x,z] of [[-4.8,1.5],[4.8,-3],[2,10.25]]) {
    const p=hermesWorld(x,z);assert.equal(hermesBlocked(p.x,p.z,.25),false);
  }
});

test('the actual scanned surface is covered by the shared collision plan within the mesh budget',async()=>{
  const {readFileSync}=await import('node:fs');
  const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
  const {Matrix4,Vector3}=await import('three');
  const {HERMES_SCAN}=await import('../src/app/hermes.js');
  const b=readFileSync(new URL('../public/assets/hermes/belvedere-hermes.glb',import.meta.url));
  const gltf=await new Promise((r,j)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
  gltf.scene.updateMatrixWorld(true);let checked=0,triangles=0;
  gltf.scene.traverse(o=>{
    if(!o.isMesh)return;
    triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
    const m=new Matrix4().makeTranslation(0,HERMES_SCAN.y,0).multiply(new Matrix4().makeRotationX(HERMES_SCAN.rotX)).multiply(new Matrix4().makeScale(HERMES_SCAN.scale,HERMES_SCAN.scale,HERMES_SCAN.scale)).multiply(o.matrixWorld);
    for(let i=0;i<o.geometry.attributes.position.count;i+=17){
      const v=new Vector3().fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(m),p=hermesWorld(v.x,v.z);
      if(v.y<smoothHeightAt(p.x,p.z)+.15)continue;
      assert.ok(hermesBlocked(p.x,p.z,.12),`unblocked exposed marble at ${v.x}, ${v.z}`);checked++;
    }
    o.geometry.dispose();
  });
  assert.ok(checked>500,'tested the exposed scan, not an empty placeholder');
  assert.ok(triangles<120000,`sculpture has ${triangles} triangles`);
});
