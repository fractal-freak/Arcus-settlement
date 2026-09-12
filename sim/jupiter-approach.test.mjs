import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROACH_LENGTH,APPROACH_GROWTH,approachPoint,approachDistance} from '../src/app/jupiterApproach.js';
import {blocked,walkingHeightAt} from '../src/app/occupied.js';
import {approachSlabGeometry} from '../src/three/jupiterApproach3d.js';
import {smoothHeightAt} from '../src/app/terrain.js';
test('the processional lane keeps a continuous walking corridor through its bends',()=>{
 for(let d=0;d<=APPROACH_LENGTH;d+=.15)for(const offset of [-.45,0,.45]){
  const p=approachPoint(d,offset),next=approachPoint(Math.min(APPROACH_LENGTH,d+.15),offset);
  assert.equal(blocked(p.x,p.z,.3),false,`clear at ${d}, ${offset}`);
  assert.ok(Math.abs(walkingHeightAt(next.x,next.z)-walkingHeightAt(p.x,p.z))<.42,'no impassable step');
 }
 for(const p of APPROACH_GROWTH)assert.ok(approachDistance(p.x,p.z)>=1.55,'verges leave the lane open');
});
test('laid slabs face upward and remain within a boot sole of the shared ground',()=>{
 const g=approachSlabGeometry(),p=g.attributes.position,n=g.attributes.normal;
 assert.ok(p.count/3<6000,'bounded geometry replaces heavier scattered fieldstones');
 for(let i=0;i<p.count;i++){
  const delta=p.getY(i)-smoothHeightAt(p.getX(i),p.getZ(i));
  assert.ok(delta>=0&&delta<.036,'slab surface follows the walking height');
  assert.ok(Number.isFinite(n.getY(i)));
 }
 assert.ok(n.getY(0)>.8,'upward surface winding');g.dispose();
});
