/** First-person movement uses the settlement's own wall and floor facts. */
import { Vector3, Euler } from 'three';
import { REALM } from '../app/realm.js';
import { blocked, walkingHeightAt } from '../app/occupied.js';
const surface=walkingHeightAt;
export class Walk3D {
  constructor(camera,rig,canvas) {
    this.camera=camera;this.rig=rig;this.canvas=canvas;this.active=false;this.keys=new Set();
    this.position=new Vector3();this.yaw=0;this.pitch=0;this.euler=new Euler(0,0,0,'YXZ');
    this.button=document.createElement('button');this.button.id='walkMode';this.button.textContent='Walk';
    this.button.type='button';this.button.title='Walk through the kingdom';this.button.setAttribute('aria-pressed','false');
    document.getElementById('camdock').appendChild(this.button);
    this.button.addEventListener('click',()=>this.active?this.exit():this.enter());
    const editing=e=>e.target?.matches?.('input,textarea,[contenteditable=true]');
    addEventListener('keydown',e=>{
      if(!this.active||editing(e))return;
      if(e.code==='Escape'){this.exit();return;}
      if(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','ShiftLeft','ShiftRight'].includes(e.code)){this.keys.add(e.code);e.preventDefault();}
    });
    addEventListener('keyup',e=>this.keys.delete(e.code));
    addEventListener('blur',()=>this.keys.clear());
    canvas.addEventListener('click',()=>{if(this.active)canvas.requestPointerLock?.()?.catch?.(()=>{});});
    addEventListener('mousemove',e=>{if(this.active&&document.pointerLockElement===canvas){this.yaw-=e.movementX*.002;this.pitch=Math.max(-1.25,Math.min(1.25,this.pitch-e.movementY*.002));}});
  }
  enter() {
    if(this.active)return;
    this.saved={position:this.camera.position.clone(),target:this.rig.target.clone(),autoTilt:this.rig.autoTilt};
    this.active=true;this.rig.controls.enabled=false;this.keys.clear();
    this.position.set(REALM.spawn.x,surface(REALM.spawn.x,REALM.spawn.z),REALM.spawn.z);
    this.yaw=0;this.pitch=0;
    this.button.textContent='Overview';this.button.setAttribute('aria-pressed','true');
    document.getElementById('hint').textContent='WASD to walk · click scene to look · arrows to turn · Esc for overview';
    this.tick(0);
  }
  exit() {
    if(!this.active)return;
    this.active=false;this.keys.clear();
    if(document.pointerLockElement===this.canvas)document.exitPointerLock();
    this.camera.position.copy(this.saved.position);this.rig.target.copy(this.saved.target);
    this.rig.autoTilt=this.saved.autoTilt;this.rig.controls.enabled=true;this.rig.controls.update();
    this.button.textContent='Walk';this.button.setAttribute('aria-pressed','false');
    document.getElementById('hint').textContent='drag to move · shift-drag to spin · scroll to zoom';
  }
  move(dx,dz) {
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
    for(let i=0;i<steps;i++)for(const axis of ['x','z']) {
      const x=this.position.x+(axis==='x'?dx/steps:0),z=this.position.z+(axis==='z'?dz/steps:0);
      if(!blocked(x,z,.3)&&surface(x,z)-this.position.y<.42){this.position.x=x;this.position.z=z;this.position.y=surface(x,z);}
    }
  }
  tick(ms) {
    if(!this.active)return;
    const dt=Math.min(ms/1000,.064),key=k=>this.keys.has(k)?1:0;
    const pad=Array.from(navigator.getGamepads?.()??[]).find(p=>p?.connected);
    const axis=n=>Math.abs(pad?.axes[n]??0)>.16?pad.axes[n]:0;
    if(pad?.buttons[1]?.pressed){this.exit();return;}
    this.yaw+=(key('ArrowLeft')-key('ArrowRight')-axis(2))*dt*1.7;
    this.pitch=Math.max(-1.25,Math.min(1.25,this.pitch+(key('ArrowUp')-key('ArrowDown')-axis(3))*dt*1.3));
    let forward=key('KeyW')-key('KeyS')-axis(1),right=key('KeyD')-key('KeyA')+axis(0);
    const length=Math.max(1,Math.hypot(forward,right));forward/=length;right/=length;
    const speed=(key('ShiftLeft')||key('ShiftRight')||pad?.buttons[0]?.pressed)?4.2:2.5;
    this.move((-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)*dt*speed,
      (-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)*dt*speed);
    this.camera.position.copy(this.position).add(new Vector3(0,1.7,0));
    this.camera.quaternion.setFromEuler(this.euler.set(this.pitch,this.yaw,0,'YXZ'));
    this.rig.target.copy(this.position);this.camera.updateMatrixWorld();
  }
}
