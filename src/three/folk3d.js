/** Named citizens with persistent occupations and visible work / delivery / rest cycles. */

import { Group, CanvasTexture, Sprite, SpriteMaterial } from 'three';
import { crowd } from '../app/crowd.js';
import { CitizenWork } from '../app/citizenWork.js';
import { occupationFor, ROLES } from '../app/livelihoods.js';
import { hash2 } from '../app/terrain.js';
import { BRIDGE, bridgeActive, bridgeRoute } from '../app/bridge.js';
import { OFFERING } from '../app/village.js';
import { blocked, onPlacementsChanged, walkingHeightAt } from '../app/occupied.js';
import { loadCharacters, makeCharacter, kindFor, makePickaxe } from './characters.js';
import { citizenProfile } from '../app/conversations.js';
import { loadModels } from './assets.js';
import { KIT_SCALE } from '../app/propSizes.js';
import { angleDelta } from '../app/player.js';

/** Shorter than a session figure (1.8) — a real, readable difference at a glance. */
const HEIGHT = 1.55;

/**
 * A home near the built-up middle, and a circle of ground they can actually
 * pace without walking through anything.
 *
 * TWO REASONS THIS KEPT FAILING, both fixed here.
 *
 * The first: the clear-ground test was given `wanderR + 0.6`, but the loop
 * below is two out-of-phase sines on X and Z, so its real reach is the
 * DIAGONAL — up to 1.42 times the radius. The far corners of every villager's
 * walk were never tested, which is precisely where they were found standing
 * inside trees.
 *
 * The second: eighteen tries, and if all eighteen failed it used the last one
 * ANYWAY. That was survivable when the valley was empty; with four hundred
 * things the citizens have built standing around, a villager whose hash keeps
 * landing in the settlement ran out of tries and was simply placed inside
 * whatever it last hit. It now keeps looking, and pulls its circle in as it
 * goes: somebody in a tight corner paces a tighter round, which is what a
 * person in a tight corner does.
 */
function homeFor(i) {
  const seed = hash2(i, 41, 131);
  const want = 1.2 + (Math.floor(seed * 100000) % 7) / 4;
  for (let tries = 0; tries < 46; tries++) {
    // The circle shrinks as the search wears on, down to a shuffle on the spot.
    const wanderR = want * Math.max(0.2, 1 - tries / 34);
    // Every retry has to move this villager somewhere genuinely different, and
    // somewhere different from every OTHER villager's retry. Salting only the
    // second and third arguments made later attempts depend more on the try
    // number than on who was trying, so six people who all had a bad first
    // guess ended up standing in the same square metre.
    const angle = hash2(i * 31 + tries, 43 + tries * 7, 132 + tries * 13) * Math.PI * 2;
    const radius = 6 + hash2(i * 17 + tries, 45 + tries * 5, 133 + tries * 11) * 32;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    // Cheap circle first, then the loop they will really walk. The circle is
    // only an approximation of that path and was quietly letting a few
    // through; the path itself is the actual question, so it settles it.
    if (blocked(x, z, wanderR * 1.42 + 0.9)) continue;
    if (pathBlocked(x, z, wanderR)) continue;
    return { x, z, seed, wanderR };
  }
  // Nowhere at all. Better to leave this villager out than to stand them in a
  // wall — the population is a count, and one fewer figure is invisible where
  // one figure inside the well is the first thing you see.
  return null;
}

/**
 * The wander loop itself, sampled.
 *
 * `tick` below walks two out-of-phase sines, which traces a rounded figure
 * that is not a circle and is not centred on home either. Testing a circle
 * around home approximates it; testing the path tests it.
 */
function pathBlocked(hx, hz, wanderR) {
  for (let k = 0; k < 14; k++) {
    const t = (k / 14) * Math.PI * 2 * 5;   // five loops covers the phase drift
    const x = hx + Math.sin(t) * wanderR;
    const z = hz + Math.sin(t * 0.63 + 1.7) * wanderR;
    if (blocked(x, z, 0.55)) return true;
  }
  return false;
}

export class Folk3D {
  constructor(scene) {
    this.scene = scene;
    this.count = -1;
    this.folk = [];
    this.group = new Group();
    scene.add(this.group);
    this.ready = false;
    this._pending = null;
    this.planner=new Worker(new URL('../app/crowd.worker.js',import.meta.url),{type:'module'});
    this.planner.onmessage=({data})=>{
      if(data.version!==this.planVersion)return;
      const f=this._planning;this._planning=null;
      if(!f||!this.folk.includes(f)||!data.result)return;
      if(data.type==='assign')this._assign(f,data.result);
      else if(f.job?.phase===data.result.phase){
        const key=f.job.phase==='outbound'?'route':'returnRoute';
        f.job[key]=data.result[key];f.job.waypoint=1;f.routeAge=0;f.routeKey=null;
      }
    };
    this.planner.onerror=()=>{if(this._planning){this.workQueue??=[];this.workQueue.push(this._planning);}this._planning=null;this.plannerFailed=true;};
    loadModels(['sack','bucket_empty']).then(models=>{this.cargoModels=models;});
    loadCharacters().then(() => {
      this.ready = true;
      if (this._pending) this.sync(this._pending);
    });
    // Homes are chosen against ground that the citizens keep changing. When
    // they finish something, everyone picks their spot again — otherwise a
    // villager placed this morning is standing in a hedge planted this
    // afternoon, and nothing would ever notice.
    onPlacementsChanged(() => { this._checkHomes = [...this.folk]; });
  }

  /** Rebuilt only when the real population number changes — same rare-rebuild pattern as Town3D. */
  sync(town) {
    if (!town) return;
    this._pending = town;
    if (!this.ready) return;
    const placements=town.placements ?? [];
    const workSignature=JSON.stringify(placements.map(p=>[p.kind,p.x,p.z,p.rot]));
    if(workSignature!==this.workSignature) {
      this.workSignature=workSignature;
      this.work=new CitizenWork(placements);
      this.planVersion=(this.planVersion||0)+1;this._planning=null;
      this.planner.postMessage({type:'init',placements,bridge:bridgeActive()});
      this._assignWork=true;
    }
    const n = town.folk ?? 0;
    const identities = town.residents?.length === n ? town.residents.map(c => c.seed) : Array.from({length:n},(_,i)=>i);
    this.residents = new Map((town.residents ?? []).map(c=>[c.seed,c]));
    for (const f of this.folk) this._profile(f);
    const signature=identities.join(',')+':'+bridgeActive();
    if (n === this.count && signature === this.signature) { if(this._assignWork)this._queueWork(); return; }
    this.identities=identities;this.signature=signature;
    this.count = n;
    this._rebuild(n);
    this._queueWork();
  }

  _rebuild(n) {
    const previous = new Map(this.folk.map(f => [f.identity, f]));
    this.folk = [];

    for (let i = 0; i < n; i++) {
      const identity=this.identities?.[i] ?? i;
      const existing = previous.get(identity);
      const visitor = null;
      const crossing = false;
      if (existing && !!existing.home.crossing === crossing && !!existing.home.ritual === !!visitor) {
        this.folk.push(existing); previous.delete(identity); continue;
      }
      const home = crossing ? { x:BRIDGE.from,z:BRIDGE.z,seed:hash2(identity,41,131),wanderR:0,crossing:true } : visitor && !blocked(visitor.x, visitor.z, 0.6)
        ? { ...visitor, seed: hash2(identity, 41, 131), wanderR: 0.25, ritual: true }
        : homeFor(identity);
      if (!home) {
        if (existing) { this.folk.push(existing); previous.delete(identity); }
        continue;
      }
      if (existing) {
        existing.home = home; existing.wanderR = home.wanderR;
        this.folk.push(existing); previous.delete(identity); continue;
      }
      const seedInt = Math.floor(home.seed * 100000);
      const char = makeCharacter(kindFor(seedInt + identity * 7), HEIGHT, { background: true, appearanceSeed: identity });
      if (!char) continue;
      // Staggered start times, so forty-eight people are not all mid-stride
      // on the same foot — the single clearest tell of a cloned crowd.
      char.play('Walking_C', { fade: 0, timeScale: 0.75 + (seedInt % 40) / 100 });
      char.mixer.setTime((seedInt % 997) / 997 * 2);
      const body=crowd.place(`folk:${identity}`,home);
      if(!body){char.dispose();continue;}
      char.root.position.set(body.x,body.y,body.z);
      this.group.add(char.root);
      this.folk.push({
        identity,
        profile: citizenProfile(identity,this.residents.get(identity),this._pending?.chronicle),
        char,
        home,
        phase: (seedInt % 1000) / 1000,
        wanderR: home.wanderR,
        speed: 0.35 + (seedInt % 11) / 40,
        lastTick: 0,
      });
    }
    for (const f of previous.values()) { crowd.remove(`folk:${f.identity}`); f.char.dispose(); this.group.remove(f.char.root); if(f.sign){f.sign.material.map.dispose();f.sign.material.dispose();this.group.remove(f.sign);} if(f.tool)f.tool.traverse(o=>{o.geometry?.dispose();o.material?.dispose();}); }
    this._checkHomes = [...this.folk];
  }

  _profile(f) {
    f.profile=citizenProfile(f.identity,this.residents.get(f.identity),this._pending?.chronicle);
    f.profile.trade=ROLES[occupationFor(f.identity)].label;
    f.profile.work=f.job?.status || 'Finding a workplace';
    f.profile.output=ROLES[occupationFor(f.identity)].output;
    if(f.sign)this._sign(f);
  }

  _queueWork() { this._assignWork=false;this.workQueue=[...this.folk]; }

  _plan(f,type) {
    this._planning=f;
    const own=`folk:${f.identity}`,y=f.char.root.position.y;
    const bodies=[...crowd.bodies].filter(([id,p])=>id!==own&&Math.abs(p.y-y)<1.6).map(([,p])=>p);
    this.planner.postMessage({type,version:this.planVersion,seed:f.identity,job:f.job,bodies});
  }

  _assign(f,planned=null) {
    if(!planned&&this._planning){this.workQueue??=[];if(!this.workQueue.includes(f))this.workQueue.push(f);return;}
    if(!planned&&!this.plannerFailed){this._plan(f,'assign');return;}
    const available=(x,z)=>!crowd.intersects(x,z,.55,`folk:${f.identity}`);
    const job=planned ?? this.work.assign(f.identity,undefined,available) ?? this.work.assign(f.identity,undefined,available,1.6);
    if(!job)return;
    const body=crowd.place(`folk:${f.identity}`,f.job ? f.char.root.position : job);
    if(!body)return;
    job.x=body.x;job.z=body.z;
    if(Math.hypot(body.x-job.work.x,body.z-job.work.z)>.01){
      job.returnRoute=this.work.nav.route(body,job.work);
      if(!job.returnRoute){crowd.place(`folk:${f.identity}`,f.char.root.position);return;}
      job.phase='return';job.waypoint=1;
    }
    f.job=job;this._profile(f);
    f.char.root.position.set(job.x,walkingHeightAt(job.x,job.z),job.z);
    this._sign(f);
    if(!f.tool && ['quarryman','woodcutter','smith','builder','farmer'].includes(job.occupation)) {
      f.tool=makePickaxe();f.char.hold(f.tool);f.arm=f.char.bone('upperarmr');f.forearm=f.char.bone('lowerarmr');
    }
  }

  _sign(f) {
    const p=f.profile.project;
    const title=f.profile.name;
    const detail=p ? `${p.percent}% · ${p.task}` : f.job?.role.label || f.profile.trade;
    const signature=title+'|'+detail;
    if(f.signText===signature)return;
    f.signText=signature;
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='rgba(20,27,24,.9)';ctx.fillRect(0,0,768,128);
    ctx.fillStyle='#eddfbc';ctx.textAlign='center';ctx.font='bold 32px sans-serif';ctx.fillText(title,384,43);
    let size=28;
    do {ctx.font=`${size}px sans-serif`;size--;}while(ctx.measureText(detail).width>732&&size>15);
    ctx.fillText(detail,384,88,732);
    if(p){ctx.fillStyle='#65745c';ctx.fillRect(18,110,732,5);ctx.fillStyle='#dcc586';ctx.fillRect(18,110,732*p.progress,5);}
    const texture=new CanvasTexture(canvas);
    if(f.sign){f.sign.material.map.dispose();f.sign.material.map=texture;}
    else {f.sign=new Sprite(new SpriteMaterial({map:texture,depthTest:true}));f.sign.scale.set(4.8,.8,1);f.sign.visible=false;this.group.add(f.sign);}
  }

  converse(f, playerPosition) {
    if (!this.folk.includes(f)) return false;
    this.conversation = { figure:f, playerPosition };
    f.char.play('Idle_A');
    if(f.tool)f.tool.visible=false;
    return true;
  }

  endConversation() {
    const f=this.conversation?.figure;
    if (f) { f.action=null; }
    this.conversation=null;
  }

  tick(elapsedS, focus = null) {
    const dt=Math.min(.064,Math.max(0,elapsedS-(this._elapsed ?? elapsedS-1/60)));
    this._elapsed=elapsedS;
    if(focus)crowd.bodies.set('player',{...focus,r:.4});else crowd.remove('player');
    for(const f of this.folk) {
      const body=crowd.bodies.get(`folk:${f.identity}`);
      if(body)body.traveling=['outbound','return'].includes(f.job?.phase)&&f!==this.conversation?.figure;
    }
    // Amortise route searches over frames, outside the animation loop.
    const pending=!this._planning&&this.workQueue?.pop();
    if(pending && pending!==this.conversation?.figure)this._assign(pending);
    if (!this.folk.length) return;
    if(!this._planning && !this.workQueue?.length && elapsedS>(this.nextReroute||0)) {
      const stalled=this.folk.find(f=>f.routeAge>4&&f!==this.conversation?.figure);
      if(stalled){
        this.nextReroute=elapsedS+.3;stalled.routeAge=0;
        if(this.plannerFailed)this.work.reroute(stalled.job,(x,z,r)=>crowd.intersects(x,z,r,`folk:${stalled.identity}`));
        else this._plan(stalled,'reroute');
      }
    }
    // Revalidate one home per frame after construction, preserving each rig.
    const check = this._checkHomes?.pop();
    if(check && blocked(check.char.root.position.x,check.char.root.position.z,.55)) {
      const body=crowd.place(`folk:${check.identity}`,check.char.root.position);
      check.char.root.visible=!!body;
      if(body){
        check.char.root.position.set(body.x,body.y,body.z);
        if(check.job){check.job.x=body.x;check.job.z=body.z;this._assign(check);}
      }
    }
    if (check && check !== this.conversation?.figure && !check.job && !check.home.crossing && !check.home.ritual &&
        blocked(check.home.x, check.home.z, check.wanderR * 1.42 + 0.9)) {
      const home = homeFor(check.identity);
      if (home) { check.home = home; check.wanderR = home.wanderR; }
    }
    this.folk.forEach((f) => {
      f.clock ??= elapsedS;
      if (f === this.conversation?.figure) {
        const p=this.conversation.playerPosition, at=f.char.root.position;
        const want=Math.atan2(p.x-at.x,p.z-at.z);
        f.char.root.rotation.y += angleDelta(f.char.root.rotation.y,want)*(1-Math.exp(-10*dt));
        return;
      }
      f.clock += dt;
      if(f.job) {
        f.avoidingPlayer=false;
        this.work.step(f.job,dt,(to,d)=>crowd.move(`folk:${f.identity}`,to,d));
        const job=f.job;
        const routeKey=`${job.phase}:${job.waypoint}`;
        const to=(job.phase==='outbound'?job.route:job.returnRoute)[job.waypoint];
        const remaining=to?Math.hypot(to.x-job.x,to.z-job.z):0;
        const progressing=routeKey!==f.routeKey || remaining<(f.routeBest??Infinity)-.2;
        f.routeAge=['outbound','return'].includes(job.phase)&&!progressing?(f.routeAge||0)+dt:0;
        if(progressing)f.routeBest=remaining;
        f.routeKey=routeKey;
        f.char.root.position.set(job.x,walkingHeightAt(job.x,job.z),job.z);
        f.char.root.rotation.y+=angleDelta(f.char.root.rotation.y,job.yaw)*(1-Math.exp(-10*dt));
        if(f.action!==job.action){f.char.play(job.action,{timeScale:job.action==='Walking_C'?1:.8});f.action=job.action;}
        if(f.tool)f.tool.visible=job.phase==='work';
        if(!f.cargo&&this.cargoModels) {
          f.cargo=this.cargoModels[job.occupation==='water_carrier'?'bucket_empty':'sack'].scene.clone(true);
          f.cargo.scale.setScalar(KIT_SCALE);f.char.hold(f.cargo,'l');
        }
        if(f.cargo)f.cargo.visible=job.phase==='outbound'||job.phase==='deliver';
        if(f.sign){f.sign.position.set(job.x,walkingHeightAt(job.x,job.z)+2.3,job.z);f.sign.visible=!!focus&&Math.hypot(job.x-focus.x,job.z-focus.z)<12;}
        f.profile.work=job.status;
        return;
      }
      f.char.play('Idle_A');
    if(f.tool)f.tool.visible=false;
      const body=crowd.bodies.get(`folk:${f.identity}`);
      if(body)f.char.root.position.set(body.x,body.y,body.z);
      return;

    });

    // Position and pose must use the same clock. Holding skeletons between
    // budget slices produced a visible six-frame staircase in the overview.
    for (const f of this.folk) {
      this._animate(f, dt);
      f.lastTick = elapsedS;
    }
  }
  _animate(f,dt) {
    f.char.update(dt);
    f.char.root.rotation.x=0;
    if(!f.tool||f.job?.phase!=='work'||f.avoidingPlayer||f===this.conversation?.figure)return;
    // Same rig and measured axes as People3D's excavation stroke.
    const arm=f.arm,forearm=f.forearm;
    const phase=((f.clock+f.identity*4)%1.8)/1.8;
    const down=phase<.24?(phase/.24)**1.9:1-((phase-.24)/.76)**.85;
    if(arm)arm.rotation.x+=1.75*down-.55;
    if(forearm)forearm.rotation.z-=.85*down-.30;
    f.char.root.rotation.x=.30*down-.06;
  }

}
