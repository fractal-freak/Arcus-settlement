/** Shared solid bodies. Positions belong to the simulation, never to the renderer. */
import { blocked, walkingHeightAt } from './occupied.js';
export const CITIZEN_RADIUS = .55;
export class Crowd {
  constructor(solid=blocked, floor=walkingHeightAt) { this.solid=solid;this.floor=floor;this.bodies=new Map(); }
  remove(id) { this.bodies.delete(id); }
  intersects(x,z,r=CITIZEN_RADIUS,except=null,y=this.floor(x,z)) {
    for(const [id,p] of this.bodies) {
      if(id!==except && Math.abs(p.y-y)<1.6 && Math.hypot(p.x-x,p.z-z)<p.r+r-1e-6)return true;
    }
    return false;
  }
  clear(x,z,r=CITIZEN_RADIUS,id=null) { return !this.intersects(x,z,r,id)&&!this.solid(x,z,r); }
  place(id,origin,r=CITIZEN_RADIUS) {
    // Construction can invalidate a body; relocation is only for spawn/recovery.
    for(let ring=0;ring<=40;ring++) {
      const n=ring?Math.max(12,ring*8):1;
      for(let i=0;i<n;i++) {
        const a=i/n*Math.PI*2,x=origin.x+Math.cos(a)*ring*.3,z=origin.z+Math.sin(a)*ring*.3;
        if(this.clear(x,z,r,id)){const p={x,z,y:this.floor(x,z),r};this.bodies.set(id,p);return p;}
      }
    }
    return null;
  }
  move(id,to,distance) {
    const p=this.bodies.get(id);if(!p)return null;
    p.traveling=true;
    // A nearby waypoint occupied by a stationary body cannot be reached by steering around
    // its perimeter. Wait for it to clear or for the planner to replace it.
    // Otherwise greedy steering circles the body and flips direction each frame.
    if(Math.hypot(to.x-p.x,to.z-p.z)<p.r*3) {
      const y=this.floor(to.x,to.z);
      for(const [other,b] of this.bodies)if(other!==id&&!b.traveling&&Math.abs(b.y-y)<1.6&&Math.hypot(to.x-b.x,to.z-b.z)<p.r+b.r-1e-6)return p;
    }
    const dx=to.x-p.x,dz=to.z-p.z,d=Math.hypot(dx,dz);
    if(d<1e-6)return p;
    const length=Math.min(distance,d),angle=Math.atan2(dz,dx);
    // Consistent right-hand passing prevents two oncoming walkers mirroring each other.
    for(const turn of [0,-.4,-.8,-1.2,-Math.PI/2,.4,.8,1.2,Math.PI/2]) {
      const x=p.x+Math.cos(angle+turn)*length,z=p.z+Math.sin(angle+turn)*length;
      const n=Math.max(1,Math.ceil(length/.08));let safe=true,h=p.y;
      for(let i=1;i<=n;i++) {
        const sx=p.x+(x-p.x)*i/n,sz=p.z+(z-p.z)*i/n,y=this.floor(sx,sz);
        if(!this.clear(sx,sz,p.r,id)||Math.abs(y-h)>.3){safe=false;break;}h=y;
      }
      if(safe){Object.assign(p,{x,z,y:h});return p;}
    }
    return p;
  }
}
export const crowd = new Crowd();
