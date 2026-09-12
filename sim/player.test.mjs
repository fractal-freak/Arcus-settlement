import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerMotion, PLAYER, safePlayerSpawn, angleDelta } from '../src/app/player.js';
import { citizenProfile, Friendships, TOPICS } from '../src/app/conversations.js';
const flat=()=>new PlayerMotion({solid:()=>false,floor:()=>0});
const advance=(p,input,seconds=1,hz=60)=>{for(let i=0;i<seconds*hz;i++)p.update(1/hz,input);return p;};

test('camera-relative motion turns the avatar and normalizes diagonal speed',()=>{
 const a=advance(flat(),{forward:1}),b=advance(flat(),{forward:1,right:1});
 assert.ok(a.position.z<-2);assert.ok(Math.abs(Math.hypot(b.position.x,b.position.z)-Math.abs(a.position.z))<.001);
 const c=advance(flat(),{forward:1,yaw:Math.PI/2});assert.ok(c.position.x<-2);assert.ok(Math.abs(c.position.z)<1e-8);
 assert.ok(Math.abs(angleDelta(c.heading,-Math.PI/2))<.01);
});
test('sprinting is faster and motion agrees across 30/60/120 Hz',()=>{
 const positions=[30,60,120].map(hz=>advance(flat(),{forward:1,run:true},1,hz).position.z);
 assert.ok(Math.max(...positions)-Math.min(...positions)<.025);assert.ok(positions[0]<-4.4);
 assert.ok(PLAYER.run>PLAYER.walk*1.8);
});
test('jump has a real airborne arc, cannot double jump, and lands on the floor',()=>{
 const p=flat();p.jump();p.update(.1);assert.equal(p.grounded,false);assert.ok(p.position.y>.4);
 const vy=p.vy;p.jump();p.update(.1);assert.ok(p.vy<vy);
 let peak=p.position.y;for(let i=0;i<100;i++){p.update(1/120);peak=Math.max(peak,p.position.y);}
 assert.ok(peak>1&&peak<1.15);assert.equal(p.position.y,0);assert.equal(p.grounded,true);
});
test('a buffered press just before landing jumps again once, not on every frame',()=>{
 const p=flat();p.jump();advance(p,{},.6,120);assert.equal(p.grounded,false);p.jump();advance(p,{},.12,120);
 assert.equal(p.grounded,false);assert.ok(p.vy>0);advance(p,{},1);assert.equal(p.grounded,true);
});
test('swept collision stops a sprint at a thin wall and allows sliding',()=>{
 const p=new PlayerMotion({solid:(x,z,r)=>Math.abs(z+1)<r+.025,floor:()=>0});
 advance(p,{forward:1,right:1,run:true},2,30);assert.ok(p.position.z>-.68);assert.ok(p.position.x>5);
});
test('steps follow slopes, cliffs fall, high ledges cannot be climbed',()=>{
 const slope=new PlayerMotion({solid:()=>false,floor:(x,z)=>-z*.3});advance(slope,{forward:1});
 assert.equal(slope.grounded,true);assert.ok(Math.abs(slope.position.y+slope.position.z*.3)<.001);
 const high=new PlayerMotion({solid:()=>false,floor:(x,z)=>z<-.5?2:0});advance(high,{forward:1});assert.ok(high.position.z>=-.5);
 const cliff=new PlayerMotion({solid:()=>false,floor:(x,z)=>z<-.5?-3:0});advance(cliff,{forward:1},.5);
 assert.equal(cliff.grounded,false);assert.ok(cliff.position.y<0&&cliff.position.y>-3);
});
test('stopping clears momentum and occupied spawns move to clear ground',()=>{
 const p=advance(flat(),{forward:1});p.stop();assert.equal(p.vz,0);assert.equal(p.jumpBuffer,0);
 const spawn=safePlayerSpawn({x:0,z:0},(x,z)=>Math.hypot(x,z)<2);assert.ok(Math.hypot(spawn.x,spawn.z)>=2);
 assert.equal(safePlayerSpawn({x:0,z:0},()=>true),null);
});
test('citizen identity survives feed updates and each conversation has complete replies',()=>{
 const p=citizenProfile(14,{name:'Elin Ashridge',trade:'gardener'});assert.equal(p.name,'Elin Ashridge');
 assert.equal(p.sign,citizenProfile(14).sign);assert.equal(p.id,citizenProfile(14).id);
 for(const topic of TOPICS){assert.ok(topic.reply(p).length>40);for(const f of topic.followups)assert.ok((typeof f.text==='function'?f.text(p):f.text).length>40);}
});
test('friendship persists, does not grow by repeating one topic, and tolerates broken storage',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 const f=new Friendships(storage);for(let i=0;i<20;i++)f.meet('citizen-1','moon');
 assert.equal(f.get('citizen-1').topics.length,1);for(const t of ['venus','rising','sign'])f.meet('citizen-1',t);
 assert.equal(new Friendships(storage).status('citizen-1').label,'Friends');
 const broken=new Friendships({getItem:()=>'{',setItem:()=>{throw Error();}});broken.meet('citizen-2','moon');assert.equal(broken.get('citizen-2').met,true);
});
