import '../src/app/enchantment.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileResidents, validateCount } from './subscribers.mjs';
import { REALM, REALM_GATE, REALM_BUILDINGS, realmBlocked, realmFloor, realmPlacements } from '../src/app/realm.js';
import { blocked } from '../src/app/occupied.js';
const make=seed=>({seed,name:`Citizen ${seed}`,bonds:{},finished:[]});
test('subscriber increases create new identities; departures preserve history and crew',()=>{
  const state={tick:10,citizens:[make(1),make(2)],crew:[{id:'claude-session'}]};const crew=structuredClone(state.crew),events=[];
  const record=(...event)=>events.push(event);
  reconcileResidents(state,4,make,record);
  assert.deepEqual(state.citizens.map(c=>c.seed),[1,2,3,4]);
  assert.equal(events.filter(e=>e[0]==='birth').length,2);
  reconcileResidents(state,1,make,record);
  assert.equal(state.citizens.length,4);
  assert.deepEqual(state.citizens.filter(c=>c.residency!=='departed').map(c=>c.seed),[1]);
  reconcileResidents(state,2,make,record);
  assert.deepEqual(state.citizens.filter(c=>c.residency!=='departed').map(c=>c.seed),[1,5]);
  assert.deepEqual(state.crew,crew);
  const snapshot=structuredClone(state);
  assert.equal(reconcileResidents(state,2,make,record),false);assert.deepEqual(state,snapshot);
});
test('zero is a valid population; malformed or missing counts cannot erase residents',()=>{
  for(const count of [undefined,null,'3',-1,2.5,Infinity])assert.throws(()=>validateCount({count}));
  const state={tick:1,citizens:[make(1)]};
  reconcileResidents(state,0,make,()=>{});assert.equal(state.citizens[0].residency,'departed');
});
const point=(b,x,z)=>({x:b.x+x*Math.cos(b.rot??0)+z*Math.sin(b.rot??0),z:b.z-x*Math.sin(b.rot??0)+z*Math.cos(b.rot??0)});
test('every building has a reachable doorway and solid walls after placement and rotation',()=>{
  for(const b of REALM_BUILDINGS){
    const door=point(b,0,b.d/2),inside=point(b,0,b.d/2-.7),wall=point(b,-b.w/2,0);
    assert.equal(blocked(door.x,door.z,.3),false,`${b.id} doorway`);
    assert.equal(blocked(inside.x,inside.z,.3),false,`${b.id} entrance floor`);
    assert.equal(realmFloor(inside.x,inside.z),b.floor,`${b.id} floor height`);
    assert.equal(realmBlocked(wall.x,wall.z,.3),true,`${b.id} side wall`);
  }
  assert.equal(blocked(REALM_GATE.x,REALM_GATE.z,.3),false,'castle gate is open');
});
test('retired buildings and intrusive props are hidden without modifying saved history',()=>{
  const source=[{kind:'building_tower_A_red',x:20,z:20},{kind:'barrel',x:REALM.seat.x,z:REALM.seat.z},{kind:'rock_single_A',x:70,z:70}];
  const copy=structuredClone(source);assert.deepEqual(realmPlacements(source),[source[2]]);assert.deepEqual(source,copy);
});
test('walking crosses the relocated ramp and rotated cottage entrances',async()=>{
  const {Walk3D}=await import('../src/three/walk3d.js');
  const {Vector3}=await import('three');
  const {smoothHeightAt}=await import('../src/app/terrain.js');
  const walker=Object.create(Walk3D.prototype),gate=REALM_GATE;
  walker.position=new Vector3(gate.x,smoothHeightAt(gate.x,gate.approachZ),gate.approachZ);
  walker.move(0,-34);
  assert.ok(walker.position.z < REALM.seat.z-2,'walk through gate into hall');
  assert.equal(walker.position.y,REALM.seat.floor,'stand on courtyard floor');
  walker.move(0,-20);
  assert.ok(walker.position.z > REALM.seat.z-7.7,'high table blocks movement');
  for(const b of REALM_BUILDINGS.filter(b=>b.id.startsWith('Croft'))) {
    const start=point(b,0,b.d/2+.8);
    walker.position.set(start.x,smoothHeightAt(start.x,start.z),start.z);
    walker.move(-Math.sin(b.rot)*2,-Math.cos(b.rot)*2);
    const end=point(b,0,b.d/2-1.2);
    assert.ok(Math.hypot(walker.position.x-end.x,walker.position.z-end.z)<.15,`${b.id} reachable from outside`);
  }
  const edge=gate.x-gate.width/2;
  assert.ok(Math.abs(realmFloor(edge,gate.approachZ)-smoothHeightAt(edge,gate.approachZ))<.05,'ramp edge reaches ground');
});


test('loose equipment stays out of open land and the sacred clearing',()=>{
  const props=[{kind:'crate_open',x:70,z:70},{kind:'flag_red',x:10,z:2},{kind:'target',x:20,z:20},{kind:'waterplant_A',x:70,z:71}];
  assert.deepEqual(realmPlacements(props),[props[3]]);
});


test('the ridge stays beneath its court and the entire gate approach',async()=>{
  const {smoothHeightAt}=await import('../src/app/terrain.js');
  assert.ok(smoothHeightAt(REALM.seat.x,REALM.seat.z)>7,'castle occupies high ground');
  for(let x=REALM.seat.x-16;x<=REALM.seat.x+16;x+=2)for(let z=REALM.seat.z-13;z<=REALM.seat.z+13;z+=2)
    assert.ok(smoothHeightAt(x,z)<REALM.seat.floor,'court clears the hill');
  for(let z=REALM_GATE.z;z<=REALM_GATE.approachZ;z+=.5)
    assert.ok(smoothHeightAt(REALM_GATE.x,z)<=realmFloor(REALM_GATE.x,z)+.01,'approach is not buried');
});

test('detailed masonry stays inside the collision envelope',async()=>{
  const {masonryGeometry,traceryGeometry}=await import('../src/three/palaceKit.js');
  for(const p of [{w:4,h:3,d:.65},{w:.65,h:7,d:2}]){
    const geometry=masonryGeometry(p);geometry.computeBoundingBox();const b=geometry.boundingBox;
    assert.ok(geometry.attributes.position.count>1000,'actual modeled courses');
    for(const [axis,size] of [['x',p.w],['y',p.h],['z',p.d]]){
      assert.ok(b.min[axis]>=-size/2-.00001);assert.ok(b.max[axis]<=size/2+.00001);
    }
    geometry.dispose();
  }
  const tracery=traceryGeometry({x:0,y:0,z:0,w:1});assert.ok(tracery.attributes.position.count>1000);tracery.dispose();
});

test('palace glazing has openings through its facade and outcrop placeholders are removed',async()=>{
  const {REALM_PARTS}=await import('../src/app/realm.js');
  const {GLASS}=await import('../src/app/enchantment.js');
  assert.equal(REALM_PARTS.some(p=>p.name==='Exposed ridge rock'),false);
  for(const pane of GLASS){
    const covering=REALM_PARTS.filter(p=>p.name==='Great hall doorway' && Math.abs(pane.x-p.x)<p.w/2-.001 && Math.abs(pane.y+1-p.y)<p.h/2-.001);
    assert.equal(covering.length,0,'glass is not backed by a solid wall');
  }
});

test('gatehouse facade has geometric openings and the approach stays passable between its rails',async()=>{
  const {facadeGeometry}=await import('../src/three/gatehouse3d.js');
  const {Mesh,MeshBasicMaterial,Raycaster,Vector3,DoubleSide}=await import('three');
  const {REALM_PARTS}=await import('../src/app/realm.js');
  const spec=REALM_PARTS.find(p=>p.name==='Jupiter gatehouse front');
  const geometry=facadeGeometry(spec),mesh=new Mesh(geometry,new MeshBasicMaterial({side:DoubleSide}));
  mesh.updateMatrixWorld();
  const hits=(x,y)=>new Raycaster(new Vector3(x,y,3),new Vector3(0,0,-1)).intersectObject(mesh).length;
  assert.equal(hits(0,1.7),0,'a person can see through the portal');
  assert.equal(hits(0,8),0,'upper glazing has a genuine reveal');
  assert.ok(hits(3.6,4)>0,'stone separates the opening from its side window');
  for(let z=REALM_GATE.z;z<REALM_GATE.z+8;z+=.25){
    assert.equal(blocked(REALM_GATE.x,z,.3),false,'continuous center route');
  }
  for(const side of [-1,1])assert.equal(realmBlocked(REALM_GATE.x+side*3,REALM_GATE.z+2,.3),true,'railing claims its ground');
  geometry.dispose();mesh.material.dispose();
});

test('eroded wall courses do not leave unsupported stones above missing courses',async()=>{
  const {masonryGeometry}=await import('../src/three/palaceKit.js');
  const {Mesh,MeshBasicMaterial,Raycaster,Vector3,DoubleSide}=await import('three');
  const g=masonryGeometry({x:3,z:7,w:3.6,h:4.8,d:.7,eroded:true});
  const m=new Mesh(g,new MeshBasicMaterial({side:DoubleSide}));m.updateMatrixWorld();
  for(const x of [-1.57,-.64,.22,1.12]){
    const hits=new Raycaster(new Vector3(x,3,0),new Vector3(0,-1,0)).intersectObject(m);let exit=null;
    for(const hit of hits){
      if(hit.face.normal.y<-.5)exit=hit.point.y;
      else if(hit.face.normal.y>.5&&exit!==null){assert.ok(exit-hit.point.y<.09,'only narrow mortar joints separate supported courses');exit=null;}
    }
  }
  g.dispose();m.material.dispose();
});

test('ruined crowns are supported wall surfaces and the causeway opens through its masonry',async()=>{
  const {REALM_PARTS}=await import('../src/app/realm.js');
  const {ruinedTowerGeometry}=await import('../src/three/ruinedTower3d.js');
  const {Mesh,MeshBasicMaterial,Raycaster,Vector3,DoubleSide}=await import('three');
  assert.equal(REALM_PARTS.some(p=>p.name==='Shattered tower tooth'||p.name==='Tower broken crown'),false);
  for(const p of REALM_PARTS.filter(p=>p.shape==='ruinedDrum')){
    const g=ruinedTowerGeometry(p),m=new Mesh(g,new MeshBasicMaterial({side:DoubleSide}));m.updateMatrixWorld();
    for(let i=0;i<24;i++){
      const a=(i+.4)/24*Math.PI*2,r=p.w/2-p.thickness*.5;
      const hits=new Raycaster(new Vector3(p.x+Math.sin(a)*r,p.y+p.h+1,p.z+Math.cos(a)*r),new Vector3(0,-1,0)).intersectObject(m);
      assert.ok(hits.length,'fracture rim closes into the inner wall');
      assert.ok(hits[0].point.y>=p.y+Math.min(...p.crown)-.5,'no open seam under the rim');
    }
    g.dispose();m.material.dispose();
  }
  const sides=REALM_PARTS.filter(p=>p.shape==='causewaySide');
  assert.equal(sides.length,2);assert.ok(sides.every(p=>p.arches.length>=1),'arch openings are possible on both sides');
  assert.ok(REALM_PARTS.filter(p=>p.name==='Causeway worn paving slab').length>150,'laid surface replaces the thin ramp');
});
