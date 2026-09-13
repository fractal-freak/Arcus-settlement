import { panelOpen } from '../app/panels.js';
import { crowd } from '../app/crowd.js';
/** Third-person exploration: one animated player, a collision-aware camera, and village company. */
import { Group, Vector3, Raycaster, Mesh, RingGeometry, MeshBasicMaterial, DoubleSide } from 'three';
import { REALM } from '../app/realm.js';
import { blocked, walkingHeightAt } from '../app/occupied.js';
import { PlayerMotion, PLAYER, safePlayerSpawn, angleDelta } from '../app/player.js';
import { PlayerHud } from '../app/playerHud.js';
import { loadCharacters, makeCharacter, KINDS } from './characters.js';

const MOVEMENT=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight','Space']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class Walk3D {
  constructor(camera,rig,canvas,{ scene,folk,occluders=[],onFootstep }={}) {
    this.camera=camera;this.rig=rig;this.canvas=canvas;this.scene=scene;this.folk=folk;this.occluders=occluders;
    this.onFootstep=onFootstep;this.stride=0;
    this.active=false;this.ready=false;this.keys=new Set();
    this.motion=new PlayerMotion({solid:(x,z,r)=>blocked(x,z,r)||crowd.intersects(x,z,r,'player',this.motion?.position.y)});
    this.position=this.motion.position;
    this.yaw=0;this.pitch=.32;this.distance=5.5;this.cameraDistance=5.5;this.kind='Celestial Mage';
    this.group=new Group();this.group.name='The Traveller';this.group.visible=false;scene.add(this.group);
    this.target=new Vector3();this.desired=new Vector3();this.direction=new Vector3();this.projection=new Vector3();
    this.ray=new Raycaster();this.ray.firstHitOnly=true;this.hits=[];
    const ringMaterial=new MeshBasicMaterial({ color:0xe9cc86,transparent:true,opacity:.7,side:DoubleSide,depthWrite:false });
    this.marker=new Mesh(new RingGeometry(.39,.42,40),ringMaterial);this.marker.rotation.x=-Math.PI/2;this.marker.layers.set(1);
    this.marker.visible=false;scene.add(this.marker);
    this.npcMarker=new Mesh(new RingGeometry(.48,.51,40),ringMaterial.clone());this.npcMarker.rotation.x=-Math.PI/2;this.npcMarker.layers.set(1);
    this.npcMarker.visible=false;scene.add(this.npcMarker);
    this.button=document.createElement('button');this.button.id='walkMode';this.button.textContent='Play';this.button.disabled=true;
    this.button.type='button';this.button.title='Explore as a character';this.button.setAttribute('aria-pressed','false');
    document.getElementById('camdock').appendChild(this.button);
    this.button.addEventListener('click',()=>this.active?this.exit():this.enter());
    this.hud=new PlayerHud({ talk:()=>this.talk(),closeTalk:()=>this.closeTalk(),recenter:()=>this.recenter(),
      character:kind=>this.setCharacter(kind),gesture:()=>this.gesture(),jump:()=>this.jump(),
      touchMove:(right,forward)=>{this.touch={right,forward};},touchRun:on=>{this.touchRunning=on;} });
    loadCharacters().then(()=>{this.ready=true;this.setCharacter(this.kind);this.button.disabled=false;}).catch(()=>{
      this.button.textContent='Character unavailable';this.button.title='Refresh to retry loading characters';
    });
    this._input();
  }

  setCharacter(kind) {
    if(!this.ready||!KINDS.includes(kind))return;
    const next=makeCharacter(kind,PLAYER.height);if(!next)return;
    if(this.char){this.group.remove(this.char.root);this.char.dispose();}
    this.char=next;this.kind=kind;this.group.add(next.root);next.play('Idle_A',{fade:0});
    this.hud.status('Exploring',this.kind);
  }
  _input() {
    const editing=e=>e.target?.matches?.('input,textarea,select,[contenteditable=true]');
    addEventListener('keydown',e=>{
      if(!this.active||editing(e)||e.metaKey||e.ctrlKey||e.altKey)return;
      // The native dialog owns focus, Escape, number shortcuts and button activation.
      if(this.talking)return;
      if(panelOpen())return;
      if(e.code==='Space'&&e.target?.closest?.('button'))return;
      if(e.code==='Escape'){e.preventDefault();this.exit();return;}
      if(e.code==='KeyE'){e.preventDefault();if(!e.repeat)this.talk();return;}
      if(e.code==='KeyH'){e.preventDefault();if(!e.repeat)this.hud.toggleHelp();return;}
      if(e.code==='KeyR'){e.preventDefault();this.recenter();return;}
      if(MOVEMENT.has(e.code)){
        this.keys.add(e.code);e.preventDefault();if(e.code==='Space'&&!e.repeat)this.jump();
      }
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('blur',()=>this.clearInput());
    document.addEventListener('world-panel-open',()=>this.clearInput());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.clearInput();});
    this.canvas.addEventListener('contextmenu',e=>{if(this.active)e.preventDefault();});
    this.canvas.addEventListener('pointerdown',e=>{
      if(!this.active||this.talking||e.button>2)return;
      this.drag={ id:e.pointerId,x:e.clientX,y:e.clientY,moved:0,button:e.button };
      this.canvas.setPointerCapture(e.pointerId);this.canvas.focus({preventScroll:true});
    });
    this.canvas.addEventListener('pointermove',e=>{
      const d=this.drag;if(!this.active||this.talking||!d||e.pointerId!==d.id)return;
      const dx=e.clientX-d.x,dy=e.clientY-d.y;d.moved+=Math.abs(dx)+Math.abs(dy);d.x=e.clientX;d.y=e.clientY;
      this.yaw-=dx*.005;this.pitch=clamp(this.pitch+dy*.004,-.12,1.15);
    });
    this.canvas.addEventListener('pointerup',e=>{
      const d=this.drag;this.drag=null;
      if(d&&d.moved<7&&d.button===0&&this.active&&!this.talking)this.clickCitizen(e.clientX,e.clientY);
    });
    this.canvas.addEventListener('lostpointercapture',()=>{this.drag=null;});
    this.canvas.addEventListener('pointercancel',()=>{this.drag=null;});
    this.canvas.addEventListener('wheel',e=>{
      if(!this.active||this.talking)return;e.preventDefault();this.distance=clamp(this.distance*Math.exp(e.deltaY*.001),2.5,9);
    },{passive:false});
  }
  clearInput() { this.keys.clear();this.touch={right:0,forward:0};this.drag=null;this.motion.stop(); }
  jump() { if(this.active&&!this.talking)this.motion.jump(); }
  recenter() { this.yaw=this.motion.heading-Math.PI;this.pitch=.32; }
  enter() {
    if(this.active||!this.ready)return;
    const spawn=safePlayerSpawn(this.hasPlayed?this.position:REALM.spawn,this.motion.solid);
    if(!spawn){this.button.title='No clear ground available yet';return;}
    this.saved={position:this.camera.position.clone(),target:this.rig.target.clone(),autoTilt:this.rig.autoTilt,near:this.camera.near,fov:this.camera.fov};
    this.rig.controls.enabled=false;this.active=true;this.clearInput();this.motion.reset(spawn.x,spawn.z);
    this.wasAirborne=false;this.stride=0;this.touchRunning=false;
    this.hud.root.querySelector('[data-touch="run"]').setAttribute('aria-pressed','false');
    this.yaw=0;this.pitch=.32;this.cameraDistance=this.distance;this.hasPlayed=true;
    this.camera.near=.08;this.camera.fov=55;this.camera.updateProjectionMatrix();
    this.group.visible=true;this.marker.visible=true;this.button.textContent='Overview';this.button.setAttribute('aria-pressed','true');
    this.hud.setActive(true);this.canvas.tabIndex=0;this.canvas.focus({preventScroll:true});this.tick(0,true);
  }
  exit() {
    if(!this.active)return;
    if(this.talking)this.closeTalk();
    this.active=false;crowd.remove('player');this.clearInput();this.group.visible=false;this.marker.visible=this.npcMarker.visible=false;
    this.hud.setActive(false);
    this.camera.near=this.saved.near;this.camera.fov=this.saved.fov;this.camera.updateProjectionMatrix();
    // Flush old OrbitControls damping before restoring the exact overview.
    const damping=this.rig.controls.enableDamping;this.rig.controls.enableDamping=false;this.rig.controls.update();
    this.camera.position.copy(this.saved.position);this.rig.target.copy(this.saved.target);
    this.rig.autoTilt=this.saved.autoTilt;this.rig.controls.update();this.rig.controls.enableDamping=damping;this.rig.controls.enabled=true;
    this.button.textContent='Play';this.button.setAttribute('aria-pressed','false');this.button.focus({preventScroll:true});
  }
  _pad() {
    const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected&&p.mapping==='standard');
    if(this.hasPad!==!!pad){this.hasPad=!!pad;this.hud.root.classList.toggle('has-controller',!!pad);}
    const pressed=pad?.buttons.map(b=>b.pressed)??[],before=this.padButtons??[];
    const edge=i=>pressed[i]&&!before[i];this.padButtons=pressed;
    const axis=i=>{const v=pad?.axes[i]??0;return Math.abs(v)>.16?Math.sign(v)*(Math.abs(v)-.16)/.84:0;};
    if(this.talking){
      if(edge(1))this.closeTalk();
      else if(edge(0))this.hud.dialog.querySelector(':focus')?.click();
      else if([12,13,14,15].some(edge)){
        const buttons=[...this.hud.dialog.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
        buttons[(i+(edge(12)||edge(14)?-1:1)+buttons.length)%buttons.length]?.focus();
      }
      return {forward:0,right:0,lookX:0,lookY:0};
    }
    if(edge(1)){this.exit();return {};}
    if(edge(0))this.jump();if(edge(2))this.talk();if(edge(9))this.hud.toggleHelp();if(edge(11))this.recenter();
    return {forward:-axis(1),right:axis(0),lookX:axis(2),lookY:axis(3),run:pressed[6]||pressed[10]};
  }
  lineOfSight(figure) {
    this.target.set(this.position.x,this.position.y+1.25,this.position.z);
    this.direction.copy(figure.char.root.position);this.direction.y+=1.1;this.direction.sub(this.target);
    const distance=this.direction.length();this.direction.normalize();
    this.ray.set(this.target,this.direction);this.ray.near=.05;this.ray.far=distance-.15;
    this.hits.length=0;this.ray.intersectObjects(this.occluders,false,this.hits);return !this.hits.length;
  }
  nearbyCitizen() {
    let closest=null,distance=3.15;
    for(const f of this.folk.folk){
      const p=f.char.root.position,d=Math.hypot(p.x-this.position.x,p.z-this.position.z);
      if(d>=distance||d<.05||Math.abs(p.y-this.position.y)>1.3)continue;
      this.projection.copy(p);this.projection.y+=1.6;this.projection.project(this.camera);
      if(this.projection.z<0||this.projection.z>1||Math.abs(this.projection.x)>.95||Math.abs(this.projection.y)>.9)continue;
      if(this.lineOfSight(f)){closest=f;distance=d;}
    }
    return closest;
  }
  clickCitizen(x,y) {
    let best=null,distance=55;
    for(const f of this.folk.folk){
      const p=f.char.root.position;if(Math.hypot(p.x-this.position.x,p.z-this.position.z)>3.15)continue;
      this.projection.copy(p);this.projection.y+=1;this.projection.project(this.camera);
      if(this.projection.z<0||this.projection.z>1)continue;
      const d=Math.hypot((this.projection.x*.5+.5)*innerWidth-x,(-this.projection.y*.5+.5)*innerHeight-y);
      if(d<distance&&this.lineOfSight(f)){best=f;distance=d;}
    }
    if(best)this.talk(best);
  }
  talk(figure=this.nearbyCitizen()) {
    if(!this.active||this.talking)return;
    if(!figure){this.hud.notify('Move closer to a villager, then press E to talk.');return;}
    if(!this.motion.grounded)return;
    const p=figure.char.root.position;
    if(Math.hypot(p.x-this.position.x,p.z-this.position.z)>3.15||!this.lineOfSight(figure))return;
    if(!this.folk.converse(figure,this.position))return;
    this.talking=figure;this.clearInput();this.preTalk={yaw:this.yaw,pitch:this.pitch,distance:this.distance};
    this.motion.heading=Math.atan2(p.x-this.position.x,p.z-this.position.z);
    // A side view keeps both faces in the conversation, with the world behind them.
    this.yaw=this.motion.heading+Math.PI/2;this.pitch=.22;this.distance=innerWidth<1000?6:4.6;
    this.cameraTransition=.4;
    this.hud.open(figure.profile);this.gesture();this.hud.nearby(null);
  }
  gesture() {
    if(!this.talking)return;
    this.talking.char.play('Interact',{fade:.25,once:true,timeScale:.75});this.gestureTime=1.8;
  }
  closeTalk() {
    if(!this.talking)return;
    const name=this.talking.profile.name.split(' ')[0];
    this.folk.endConversation();this.talking=null;this.hud.close();this.clearInput();
    this.camera.clearViewOffset();this.composition=null;
    if(this.preTalk)Object.assign(this,this.preTalk);
    this.cameraTransition=.4;
    this.hud.notify(`See you around, ${name}.`);this.canvas.focus({preventScroll:true});
  }
  _camera(dt,snap) {
    const p=this.position;
    const composition=this.talking?`${innerWidth}:${innerHeight}`:null;
    if(composition!==this.composition){
      this.composition=composition;
      // Leave the actors beside the dialogue card, or above it on a phone.
      if(this.talking)this.camera.setViewOffset(innerWidth,innerHeight,innerWidth>700?Math.min(312,innerWidth*.34):0,innerWidth<=700?innerHeight*.27:0,innerWidth,innerHeight);
      else this.camera.clearViewOffset();
    }
    this.target.set(p.x,p.y+1.1,p.z);
    if(this.talking){this.target.lerp(this.talking.char.root.position,.5);this.target.y=(p.y+this.talking.char.root.position.y)/2+1.05;}
    this.lookHeight=snap||this.lookHeight===undefined?this.target.y:this.lookHeight+(this.target.y-this.lookHeight)*(1-Math.exp(-14*dt));
    this.target.y=this.lookHeight;
    this.cameraTransition=Math.max(0,(this.cameraTransition||0)-dt);
    this.cameraYaw=this.cameraTransition&&!snap?this.cameraYaw+angleDelta(this.cameraYaw,this.yaw)*(1-Math.exp(-12*dt)):this.yaw;
    const az=this.cameraYaw;
    this.direction.set(Math.sin(az)*Math.cos(this.pitch),Math.sin(this.pitch),Math.cos(az)*Math.cos(this.pitch));
    let available=this.distance;
    this.ray.near=0;this.ray.far=this.distance+.3;
    // Centre and near-plane edges keep the camera out of walls, including when turning a corner.
    for(const side of [0,-.22,.22]){
      this.desired.copy(this.target);this.desired.x+=Math.cos(az)*side;this.desired.z-=Math.sin(az)*side;
      this.ray.set(this.desired,this.direction);this.hits.length=0;this.ray.intersectObjects(this.occluders,false,this.hits);
      if(this.hits.length)available=Math.min(available,Math.max(.25,this.hits[0].distance-.3));
    }
    for(let d=.3;d<available;d+=.3){
      this.desired.copy(this.target).addScaledVector(this.direction,d);
      if(this.desired.y<walkingHeightAt(this.desired.x,this.desired.z)+.22){available=Math.max(.25,d-.3);break;}
    }
    // Pull in immediately at an obstruction; ease out once it clears. No world-position lag on input.
    this.cameraDistance=snap||available<this.cameraDistance?available:this.cameraDistance+(available-this.cameraDistance)*(1-Math.exp(-8*dt));
    this.camera.position.copy(this.target).addScaledVector(this.direction,this.cameraDistance);
    this.camera.lookAt(this.target);this.camera.updateMatrixWorld();
    this.rig.target.set(p.x,p.y,p.z);
    this.char.root.visible=this.cameraDistance>.65;
  }
  tick(ms,snap=false) {
    if(!this.active)return;
    const dt=Math.min(ms/1000,.064),key=k=>this.keys.has(k)?1:0,pad=this._pad();
    if(!this.active)return;
    if(!this.talking){
      const turn=(key('ArrowLeft')-key('ArrowRight')-(pad.lookX||0))*dt*2.1;
      this.yaw+=turn;this.pitch=clamp(this.pitch+(pad.lookY||0)*dt*1.4,-.12,1.15);
      this.motion.update(dt,{forward:key('KeyW')-key('KeyS')+key('ArrowUp')-key('ArrowDown')+(pad.forward||0)+(this.touch?.forward||0),
        right:key('KeyD')-key('KeyA')+(pad.right||0)+(this.touch?.right||0),yaw:this.yaw,
        run:!!(key('ShiftLeft')||key('ShiftRight')||pad.run||this.touchRunning)});
      if(this.motion.speed<.05&&turn)this.motion.heading+=turn;
    }else{
      if(!this.folk.folk.includes(this.talking)){this.closeTalk();return;}
      this.gestureTime-=dt;if(this.gestureTime<=0)this.talking.char.play('Idle_A');
    }
    const m=this.motion;
    if(m.grounded&&!this.talking){
      if(this.wasAirborne){this.onFootstep?.(false,true);this.stride=0;}
      else if(m.speed>.3){
        this.stride+=m.speed*dt;
        const length=m.speed>3?1.05:.8;
        if(this.stride>=length){this.stride%=length;this.onFootstep?.(m.speed>3,false);}
      }else this.stride=0;
    }
    this.wasAirborne=!m.grounded;
    const animation=!m.grounded?(m.airTime<.12?'Jump_Start':'Jump_Idle'):m.landing>0&&m.speed<.4?'Jump_Land':m.speed>3?'Running_A':m.speed>.1?'Walking_A':'Idle_A';
    this.char.play(animation,{fade:animation.startsWith('Jump')?.1:.18,once:animation==='Jump_Start'||animation==='Jump_Land',
      timeScale:animation==='Running_A'?Math.max(.6,m.speed/3.7):animation==='Walking_A'?Math.max(.5,m.speed/1.8):animation==='Jump_Start'?2:1});
    this.char.update(dt);this.group.position.set(this.position.x,this.position.y,this.position.z);
    this.group.rotation.y=m.heading;
    this.marker.position.set(this.position.x,walkingHeightAt(this.position.x,this.position.z)+.035,this.position.z);
    this.marker.material.opacity=m.grounded?.55:.25;
    this._camera(dt,snap);
    this.hud.status(this.talking?'In conversation':!m.grounded?'Jumping':m.speed>3?'Running':m.speed>.1?'Walking':'Exploring',this.kind);
    this.nearby=this.talking?null:this.nearbyCitizen();
    const selected=this.talking||this.nearby;this.npcMarker.visible=!!selected;
    if(selected){this.npcMarker.position.copy(selected.char.root.position);this.npcMarker.position.y+=.04;}
    if(this.nearby){
      this.projection.copy(this.nearby.char.root.position);this.projection.y+=1.95;this.projection.project(this.camera);
      this.hud.nearby(this.nearby,{x:(this.projection.x*.5+.5)*innerWidth,y:(-.5*this.projection.y+.5)*innerHeight});
    }else this.hud.nearby(null);
  }
}
