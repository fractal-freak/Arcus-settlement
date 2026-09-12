import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialIndex } from '../src/app/spatialIndex.js';
import { landGeometry } from '../src/three/terrainGeometry.js';
import { smoothHeightAt } from '../src/app/terrain.js';
import { palaceCliffMask } from '../src/app/palaceLandscape.js';

test('spatial queries match a full scan at cell edges, negative coordinates and large radii', () => {
  let seed = 123;
  const random = () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0) / 4294967296);
  const circles = Array.from({length:1000}, () => ({x:random()*400-200,z:random()*400-200,r:random()*20}));
  const index = new SpatialIndex();
  for (const circle of circles) index.insert(circle);
  for (let i=0;i<2000;i++) {
    const x=random()*500-250,z=random()*500-250,r=random()*10;
    assert.equal(index.intersects(x,z,r), circles.some(c => Math.hypot(c.x-x,c.z-z)<c.r+r));
  }
  const edge = new SpatialIndex(); edge.insert({x:8,z:-8,r:1});
  assert.equal(edge.intersects(10,-8,1),false);
  assert.equal(edge.intersects(9.999,-8,1),true);
});

test('worker terrain keeps shared heights and identical adjoining chunk boundaries', () => {
  const a=landGeometry(0,0),b=landGeometry(16,0);
  const ap=a.attributes.position,bp=b.attributes.position;
  for(let row=0;row<33;row++) {
    const ai=row*33+32,bi=row*33;
    for(let axis=0;axis<3;axis++) assert.equal(ap.array[ai*3+axis],bp.array[bi*3+axis]);
    const x=ap.getX(ai),z=ap.getZ(ai);
    assert.ok(Math.abs(ap.getY(ai)-(smoothHeightAt(x,z)-palaceCliffMask(x,z)*.5))<1e-5);
  }
  for(const g of [a,b]) {
    assert.equal(g.index.count,32*32*6);
    for(const attr of Object.values(g.attributes)) assert.ok(attr.array.every(Number.isFinite));
    g.dispose();
  }
});

test('accelerated visibility agrees with exact triangle raycasts through openings and transformed solids', async () => {
  const { Group, Mesh, MeshBasicMaterial, BoxGeometry, TorusGeometry, Raycaster, Vector3, DoubleSide } = await import('three');
  const { visibilityMeshes, isOccluded } = await import('../src/three/visibility.js');
  const group = new Group(), material = new MeshBasicMaterial({side:DoubleSide});
  const ring = new Mesh(new TorusGeometry(2,.35,12,32),material);
  ring.position.set(-1,2,-3); group.add(ring);
  const box = new Mesh(new BoxGeometry(2,4,2).toNonIndexed(),material);
  box.position.set(4,1,-5); box.rotation.y=.4; group.add(box);
  group.updateMatrixWorld(true);
  const ray = new Raycaster();
  const probes=[];
  for(let x=-4;x<=6;x+=.2)for(let y=-1;y<=5;y+=.3) {
    const from=new Vector3(x,y,4),to=new Vector3(x,y,-9);
    ray.set(from,to.sub(from).normalize());ray.far=11;
    probes.push({from, expected:ray.intersectObject(group,true).length>0});
  }
  const meshes=visibilityMeshes(group);
  for(const {from,expected} of probes) {
    ray.set(from,new Vector3(0,0,-1));ray.far=11;
    assert.equal(isOccluded(ray,meshes),expected);
  }
  // The center of the ring remains an opening, rather than its bounding box hiding it.
  ray.set(new Vector3(-1,2,4),new Vector3(0,0,-1));ray.far=11;
  assert.equal(isOccluded(ray,meshes),false);
  group.traverse(o=>o.geometry?.dispose());material.dispose();
});

test('worker distant country retains exact sampled terrain and finite normals after relocation', async () => {
  const {farGeometry}=await import('../src/three/terrainGeometry.js');
  const {GROUND,groundAt,WATER_LEVEL,STEP}=await import('../src/app/terrain.js');
  const surface=WATER_LEVEL+STEP*.5;
  for(const [x,z] of [[0,0],[-100,80]]) {
    const geometry=farGeometry(x,z,12,5),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const wx=p.getX(i),wz=p.getZ(i),h=smoothHeightAt(wx,wz);
      const wet=groundAt(Math.round(wx),Math.round(wz)).kind===GROUND.water||h<surface;
      assert.ok(Math.abs(p.getY(i)-(wet?surface:h))<1e-5);
    }
    assert.ok(geometry.attributes.normal.array.every(Number.isFinite));
    geometry.dispose();
  }
});
