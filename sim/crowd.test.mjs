import test from 'node:test';
import assert from 'node:assert/strict';
import { Crowd } from '../src/app/crowd.js';

test('oncoming walkers pass without overlap and both reach their destinations',()=>{
  const crowd=new Crowd(()=>false,()=>0);
  crowd.place('a',{x:-4,z:0});crowd.place('b',{x:4,z:0});
  for(let i=0;i<1000;i++) {
    crowd.move('a',{x:4,z:0},.03);crowd.move('b',{x:-4,z:0},.03);
    const a=crowd.bodies.get('a'),b=crowd.bodies.get('b');
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=1.1-1e-6);
  }
  assert.ok(Math.abs(crowd.bodies.get('a').x-4)<.05);
  assert.ok(Math.abs(crowd.bodies.get('b').x+4)<.05);
});
test('swept movement cannot tunnel through thin walls or climb a cliff',()=>{
  for(const crowd of [new Crowd((x,z,r)=>Math.abs(x)<r+.02,()=>0),new Crowd(()=>false,x=>x<0?0:3)]) {
    crowd.place('a',{x:-2,z:0});
    for(let i=0;i<40;i++)crowd.move('a',{x:4,z:0},5);
    assert.ok(crowd.bodies.get('a').x<0);
  }
});
test('crowded spawns are separated and player bodies block citizens',()=>{
  const crowd=new Crowd(()=>false,()=>0);
  for(let i=0;i<30;i++)assert.ok(crowd.place(i,{x:0,z:0}));
  for(const [id,p] of crowd.bodies)assert.equal(crowd.intersects(p.x,p.z,p.r,id),false);
  crowd.bodies.clear();crowd.place('a',{x:-2,z:0});crowd.bodies.set('player',{x:0,y:0,z:0,r:.4});
  for(let i=0;i<150;i++){crowd.move('a',{x:0,z:0},.04);const a=crowd.bodies.get('a');assert.ok(Math.hypot(a.x,a.z)>=.95-1e-6);}
});

test('replanning can escape a body contact from between navigation grid points',async()=>{
  const {WorkNavigation}=await import('../src/app/citizenWork.js');
  const crowd=new Crowd(()=>false,()=>0);
  crowd.place('a',{x:-.55,z:0});crowd.place('b',{x:.55,z:0});
  const nav=new WorkNavigation((x,z,r)=>crowd.intersects(x,z,r,'a'),()=>0);
  const route=nav.route(crowd.bodies.get('a'),{x:4.5,z:0});
  assert.ok(route,'a valid standing position must have a route around the other body');
  for(let i=1;i<route.length;i++)assert.ok(nav.segment(route[i-1],route[i]));
});


test('an occupied waypoint causes a stable wait instead of orbiting and reversing',()=>{
  const crowd=new Crowd(()=>false,()=>0);
  crowd.place('walker',{x:-1.15,z:0});crowd.place('worker',{x:0,z:0});
  const start={...crowd.bodies.get('walker'),traveling:true};
  for(let i=0;i<600;i++)crowd.move('walker',{x:.1,z:0},.019);
  assert.deepEqual(crowd.bodies.get('walker'),start);
  crowd.remove('worker');
  for(let i=0;i<100;i++)crowd.move('walker',{x:.1,z:0},.019);
  assert.ok(Math.abs(crowd.bodies.get('walker').x-.1)<.001,'resume when the waypoint clears');
});
