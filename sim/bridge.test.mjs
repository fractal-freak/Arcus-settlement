import test from 'node:test';
import assert from 'node:assert/strict';
import { BRIDGE, setBridgeActive, bridgeFloor, bridgeDeckHeight, bridgeRoute, BRIDGE_PATHS, bridgePathContains } from '../src/app/bridge.js';
import { blocked, walkingHeightAt } from '../src/app/occupied.js';
import { smoothHeightAt, WATER_LEVEL, STEP } from '../src/app/terrain.js';

test('crossing exists only when earned, with a deck above water and bank-flush landings',()=>{
  const b=BRIDGE,mid=(b.from+b.to)/2;
  setBridgeActive(false);
  assert.equal(bridgeFloor(mid,b.z),null);
  assert.equal(blocked(mid,b.z,.3),true);
  setBridgeActive(true);
  assert.equal(blocked(mid,b.z,.3),false);
  assert.ok(walkingHeightAt(mid,b.z)>WATER_LEVEL+STEP*.5+1);
  for(const x of [b.from,b.to])for(const z of [b.z-.8,b.z,b.z+.8])assert.ok(Math.abs(bridgeDeckHeight(x,z)-smoothHeightAt(x,z))<1e-8);
  assert.equal(bridgeFloor(mid,b.z+b.width),null);
});

test('parapets contain the full body and crossing route stays on the deck',()=>{
  setBridgeActive(true);
  const b=BRIDGE,mid=(b.from+b.to)/2;
  assert.equal(blocked(mid,b.z+b.walkHalf-.2,.3),true);
  assert.equal(blocked(mid,b.z,.55),false);
  let previous=null,min=Infinity,max=-Infinity;
  for(let t=0;t<90;t+=.05){
    const p=bridgeRoute(t);
    assert.equal(blocked(p.x,p.z,.55),false);
    assert.equal(walkingHeightAt(p.x,p.z),bridgeDeckHeight(p.x,p.z));
    if(previous)assert.ok(Math.hypot(p.x-previous.x,p.z-previous.z)<.041);
    previous=p;min=Math.min(min,p.x);max=Math.max(max,p.x);
  }
  assert.ok(min<b.from+.25 && max>b.to-.25,'walkers reach both landings');
});


test('relocated crossing clears the court and both approaches remain on dry ground',()=>{
  assert.ok(Math.abs(BRIDGE.z)>=12);
  for(const path of BRIDGE_PATHS)for(const p of path){
    assert.ok(bridgePathContains(p.x,p.z));
    assert.equal(blocked(p.x,p.z,.3),false);
    assert.ok(smoothHeightAt(p.x,p.z)>WATER_LEVEL+STEP*.5+.1,`wet path at ${p.x},${p.z}`);
  }
});
