import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CitizenWork,WorkNavigation} from '../src/app/citizenWork.js';
import {setPlacements,blocked} from '../src/app/occupied.js';
import {realmPlacements} from '../src/app/realm.js';
import {settledPlacements} from '../src/app/village.js';
import {ROLES,occupationFor,advanceEconomy} from '../src/app/livelihoods.js';

test('routes go around walls, cannot cross an impassable wall, and reject steep steps',()=>{
  const nav=new WorkNavigation((x,z)=>Math.abs(x)<.6&&Math.abs(z)<4,()=>0);
  const path=nav.route({x:-3,z:0},{x:3,z:0});assert.ok(path?.length>2);
  for(let i=1;i<path.length;i++)assert.ok(nav.segment(path[i-1],path[i]));
  assert.equal(new WorkNavigation(x=>Math.abs(x)<.6,()=>0).route({x:-3,z:0},{x:3,z:0}),null);
  assert.equal(new WorkNavigation(()=>false,x=>x<0?0:3).segment({x:-1,z:0},{x:1,z:0}),false);
});

test('all 48 public citizens have distinct reachable workstations and complete deliveries',()=>{
  const d=JSON.parse(readFileSync(new URL('../state/settlement.json',import.meta.url)));
  d.life.placements=realmPlacements(settledPlacements(d.life.placements));
  setPlacements(d.life.placements);
  const system=new CitizenWork(d.life.placements);
  const jobs=Array.from({length:48},(_,i)=>system.assign(i+1));
  assert.ok(jobs.every(Boolean),`Unassigned: ${jobs.map((j,i)=>j?null:i+1).filter(Boolean)}`);
  assert.equal(new Set(jobs.map(j=>j.occupation)).size,Object.keys(ROLES).length);
  assert.equal(new Set(jobs.map(j=>`${j.work.x},${j.work.z}`)).size,48);
  for(const job of jobs){
    for(let i=0;i<4000;i++){
      const x=job.x,z=job.z;system.step(job,.1);
      assert.ok(Math.hypot(job.x-x,job.z-z)<=.11501,'no teleporting');
      assert.equal(blocked(job.x,job.z,.46),false,'feet stay on walkable ground');
    }
    assert.ok(job.delivered>0,`${job.seed} must deliver ${job.role.output}`);
  }
});

test('food and building supply chains affect growth, independent of resident order',()=>{
  const citizens=Array.from({length:48},(_,seed)=>({seed}));
  let economy;
  for(let i=0;i<20;i++)economy=advanceEconomy(economy,citizens);
  assert.equal(economy.fed,1);assert.equal(economy.watered,1);
  assert.ok(economy.building>0);assert.ok(economy.produced.cloth>0);
  assert.deepEqual(advanceEconomy(null,citizens),advanceEconomy(null,[...citizens].reverse()));
  const noFarm=citizens.filter(c=>occupationFor(c.seed)!=='farmer');
  const hungry=advanceEconomy(null,noFarm);
  assert.equal(hungry.fed,0);assert.ok(hungry.workRate<economy.workRate);
  for(const amount of Object.values(hungry.stock))assert.ok(Number.isFinite(amount)&&amount>=0);
});

test('blocked walkers hold a calm pose across intermittent movement attempts',()=>{
  const work=new CitizenWork([],new WorkNavigation(()=>false,()=>0));
  const job={seed:3,x:0,z:0,yaw:1,phase:'outbound',waypoint:1,route:[{x:0,z:0},{x:2,z:0}],role:{output:'water'}};
  for(let i=0;i<60;i++){
    work.step(job,1/60,()=>({x:job.x+(i%2?.001:0),z:0}));
    assert.equal(job.action,'Idle_A');
  }
  for(let i=0;i<30;i++)work.step(job,1/60,()=>({x:job.x+.01,z:0}));
  assert.equal(job.action,'Walking_C');
});

test('replanning a busy destination finds waiting ground without moving the destination',()=>{
  const work=new CitizenWork([],new WorkNavigation(()=>false,()=>0));
  const job={x:-3,z:0,phase:'outbound',delivery:{x:0,z:0},waypoint:1};
  const occupied=(x,z,r)=>Math.hypot(x,z)<r+.55;
  assert.equal(work.reroute(job,occupied),true);
  assert.deepEqual(job.route.at(-1),job.delivery);
  assert.ok(job.route.length>=3);
  for(const p of job.route.slice(0,-1))assert.equal(occupied(p.x,p.z,.55),false);
});

test('crowd replanning resolves walkable gaps between coarse navigation lanes',()=>{
  const wall=(x,z)=>Math.abs(x)<1&&Math.abs(z-.75)>.12;
  const work=new CitizenWork([],new WorkNavigation(wall,()=>0));
  const job={x:-3,z:0,phase:'outbound',delivery:{x:3,z:0},waypoint:1};
  assert.equal(work.nav.route(job,job.delivery),null);
  assert.equal(work.reroute(job,()=>false),true);
  for(let i=1;i<job.route.length;i++)assert.ok(work.nav.segment(job.route[i-1],job.route[i]));
  assert.doesNotThrow(()=>JSON.stringify(job),'routes contain coordinates, not their owning job');
  assert.deepEqual(Object.keys(job.route[0]).sort(),['x','z']);
});
