import test from 'node:test';
import assert from 'node:assert/strict';
import { HERMES, hermesWorld, hermesLocal, hermesBlocked } from '../src/app/hermes.js';
import { blocked } from '../src/app/occupied.js';
import { smoothHeightAt, naturalHeightAt } from '../src/app/terrain.js';
import '../src/app/digs.js';
import { landGeometry } from '../src/three/terrainGeometry.js';
import { CHUNK } from '../src/app/iso.js';

test('Hermes has solid exposed stone and an accessible aisle around the excavation',()=>{
  for(const [x,z] of [[0,-7],[0,-2],[-4,0],[1.5,6]]) {
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
