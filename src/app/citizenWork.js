/** Citizens travel between real workplaces and stores on the shared walkable ground. */
import { CITIZEN_RADIUS } from './crowd.js';
import { blocked, walkingHeightAt } from './occupied.js';
import { outsideBridgeWorks } from './bridge.js';
import { LANDMARKS } from './village.js';
import { propRadius } from './propSizes.js';
import { ROLES, occupationFor } from './livelihoods.js';

const GAP=1.5, CLEAR=CITIZEN_RADIUS;
const key=(x,z)=>`${x},${z}`;
export class WorkNavigation {
  constructor(isBlocked=blocked, height=walkingHeightAt, gap=GAP) { this.gap=gap; this.blocked=isBlocked;this.height=height;this.nodes=new Map();this.edges=new Map();this.routes=new Map(); }
  clear(x,z) {
    const k=key(x,z);
    if(!this.nodes.has(k))this.nodes.set(k,!this.blocked(x*this.gap,z*this.gap,CLEAR));
    return this.nodes.get(k);
  }
  segment(a,b) {
    const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);
    let h=this.height(a.x,a.z);
    for(let i=0;i<=n;i++) {
      const t=n?i/n:0,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,y=this.height(x,z);
      if(this.blocked(x,z,CLEAR)||Math.abs(y-h)>.3)return false;
      h=y;
    }
    return true;
  }
  nearest(p, available=()=>true) {
    const cx=Math.round(p.x/this.gap),cz=Math.round(p.z/this.gap);
    for(let r=0;r<=9;r++)for(let x=cx-r;x<=cx+r;x++)for(let z=cz-r;z<=cz+r;z++) {
      if(r&&Math.abs(x-cx)!==r&&Math.abs(z-cz)!==r)continue;
      if(this.clear(x,z)&&available(x*this.gap,z*this.gap))return {x:x*this.gap,z:z*this.gap};
    }
    return null;
  }
  route(a,b) {
    const k=`${a.x},${a.z}:${b.x},${b.z}`;
    if(!this.routes.has(k))this.routes.set(k,this._route(a,b));
    return this.routes.get(k);
  }
  _route(a,b) {
    a={x:a.x,z:a.z};b={x:b.x,z:b.z};
    if(this.segment(a,b))return [a,b];
    const first=this.nearest(a,(x,z)=>this.segment(a,{x,z}));
    const last=this.nearest(b,(x,z)=>this.segment({x,z},b));
    if(!first||!last)return null;
    const start={x:Math.round(first.x/this.gap),z:Math.round(first.z/this.gap)},end={x:Math.round(last.x/this.gap),z:Math.round(last.z/this.gap)};
    const startKey=key(start.x,start.z),goal=key(end.x,end.z),open=[{...start,k:startKey,g:0,f:0}],best=new Map([[startKey,0]]),parents=new Map();
    for(let tries=0;open.length&&tries<2200*(GAP/this.gap)**2;tries++) {
      let bi=0;for(let i=1;i<open.length;i++)if(open[i].f<open[bi].f)bi=i;
      const p=open.splice(bi,1)[0];
      if(p.k===goal) {
        const path=[b,last];let k=goal;
        while(k!==startKey){const q=parents.get(k);path.push({x:q.x*this.gap,z:q.z*this.gap});k=q.k;}
        return [a,...path.reverse()];
      }
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x=p.x+dx,z=p.z+dz,k=key(x,z),g=p.g+1;
        if(Math.abs(x)*this.gap>120||Math.abs(z)*this.gap>120||g*this.gap>135||g>=(best.get(k)??Infinity)||!this.clear(x,z))continue;
        const ek=[p.k,k].sort().join('|');
        if(!this.edges.has(ek))this.edges.set(ek,this.segment({x:p.x*this.gap,z:p.z*this.gap},{x:x*this.gap,z:z*this.gap}));
        if(!this.edges.get(ek))continue;
        best.set(k,g);parents.set(k,p);open.push({x,z,k,g,f:g+Math.abs(x-end.x)+Math.abs(z-end.z)});
      }
    }
    return null;
  }
}

export class CitizenWork {
  constructor(placements=[],navigation=new WorkNavigation()) {this.placements=placements.filter(outsideBridgeWorks);this.nav=navigation;this.claimed=[];this.deliveryClaims=[];}
  assign(seed,occupation=occupationFor(seed),available=()=>true,spacing=2.4) {
    const role=ROLES[occupation]||ROLES.farmer;
    let candidates=this.placements.filter(p=>role.kinds.test(p.kind)&&Math.hypot(p.x,p.z)<100);
    if(occupation==='water_carrier')candidates=LANDMARKS.filter(p=>p.key==='well');
    if(!candidates.length)candidates=this.placements.filter(p=>/sack|crate|pallet/.test(p.kind));
    const offset=Math.abs(seed*7)%Math.max(1,candidates.length);
    for(let i=0;i<candidates.length*8;i++) {
      const target=candidates[(i+offset)%candidates.length];
      const radius=target.r??propRadius(target.kind);
      const angle=seed*2.3999632297+Math.floor(i/candidates.length)*Math.PI/4;
      let work;
      for(let attempt=0;attempt<12;attempt++) {
        const a=angle+attempt*Math.PI/6;
        const candidate=this.nav.nearest({x:target.x+Math.cos(a)*(radius+1.6),z:target.z+Math.sin(a)*(radius+1.6)},(x,z)=>available(x,z)&&![...this.claimed,...this.deliveryClaims].some(p=>Math.hypot(p.x-x,p.z-z)<spacing));
        if(candidate&&![...this.claimed,...this.deliveryClaims].some(p=>Math.hypot(p.x-candidate.x,p.z-candidate.z)<spacing)){work=candidate;break;}
      }
      if(!work)continue;
      const stores=this.placements.filter(p=>/crate|sack|pallet|barrel/.test(p.kind)&&Math.hypot(p.x-work.x,p.z-work.z)>5)
        .sort((a,b)=>Math.hypot(a.x-work.x,a.z-work.z)-Math.hypot(b.x-work.x,b.z-work.z));
      let delivery,route;
      for(const store of stores.slice(0,5)) {
        delivery=this.nav.nearest({x:store.x+propRadius(store.kind)+1.5,z:store.z},(x,z)=>!this.deliveryClaims.some(p=>Math.hypot(p.x-x,p.z-z)<spacing)&&!this.claimed.some(p=>Math.hypot(p.x-x,p.z-z)<spacing));
        if(delivery)route=this.nav.route(work,delivery);
        if(route)break;
      }
      if(!route)continue;
      this.claimed.push(work);this.deliveryClaims.push(delivery);
      return {seed,occupation,role,target,work,delivery,route,returnRoute:[...route].reverse(),x:work.x,z:work.z,phase:'work',remaining:3+Math.abs(seed*13)%17,waypoint:0,delivered:0,action:role.animation,yaw:Math.atan2(target.x-work.x,target.z-work.z),status:role.task};
    }
    return null;
  }
  reroute(job, occupied) {
    const nav=new WorkNavigation((x,z,r)=>this.nav.blocked(x,z,r)||occupied(x,z,r),this.nav.height,.75);
    const to=job.phase==='outbound'?job.delivery:job.work;
    let route=nav.route(job,to);
    if(!route&&occupied(to.x,to.z,CLEAR)) {
      // A busy destination has no complete route. Move to reachable waiting
      // ground instead of repeatedly requesting the same impossible route.
      const waiting=nav.nearest(to,(x,z)=>Math.hypot(x-job.x,z-job.z)>1.2&&!!nav.route(job,{x,z}));
      if(waiting){const approach=nav.route(job,waiting);if(approach)route=[...approach,to];}
    }
    if(!route)return false;
    if(job.phase==='outbound')job.route=route;else job.returnRoute=route;
    job.waypoint=1;job.waitForRoom=0;return true;
  }
  step(job,dt,move=null) {
    dt=Math.min(.1,Math.max(0,dt));
    if(job.phase==='outbound'||job.phase==='return') {
      job.waitForRoom=Math.max(0,(job.waitForRoom||0)-dt);
      const route=job.phase==='outbound'?job.route:job.returnRoute;
      const to=route[job.waypoint];
      if(!to){job.phase=job.phase==='outbound'?'deliver':'work';job.remaining=job.phase==='deliver'?4:12+job.seed%9;return;}
      const dx=to.x-job.x,dz=to.z-job.z,d=Math.hypot(dx,dz),distance=Math.min(d,dt*1.15);
      const x=job.x+(d?dx/d*distance:0),z=job.z+(d?dz/d*distance:0);
      if(!move&&this.nav.blocked(x,z,CLEAR)){job.status='Route blocked — waiting for a clear path';job.action='Idle_A';return;}
      const next=move?move(to,distance):{x,z};
      const moved=Math.hypot(next.x-job.x,next.z-job.z);
      if(moved<1e-6&&d>.01){job.waitForRoom=.25;job.status='Waiting for room to pass';job.action='Idle_A';return;}
      // Face sustained travel, not each tiny collision correction. Alternating
      // sidesteps used to swing the whole character back and forth.
      job.headingOrigin??={x:job.x,z:job.z};
      job.headingTime=(job.headingTime||0)+dt;
      if(job.headingTime>=.18){
        const hx=next.x-job.headingOrigin.x,hz=next.z-job.headingOrigin.z;
        if(Math.hypot(hx,hz)>.04)job.yaw=Math.atan2(hx,hz);
        job.headingOrigin={x:next.x,z:next.z};job.headingTime=0;
      }
      job.x=next.x;job.z=next.z;
      job.action=job.waitForRoom>0?'Idle_A':'Walking_C';job.status=job.phase==='outbound'?`Delivering ${job.role.output}`:'Returning to work';
      if(Math.hypot(to.x-job.x,to.z-job.z)<.025)job.waypoint++;
      return;
    }
    job.remaining-=dt;
    job.action=job.phase==='rest'?'Idle_A':job.role.animation;
    job.status=job.phase==='work'?job.role.task:job.phase==='deliver'?`Unloading ${job.role.output}`:'Taking a rest';
    if(job.phase==='work')job.yaw=Math.atan2(job.target.x-job.x,job.target.z-job.z);
    if(job.remaining>0)return;
    if(job.phase==='work'){job.phase='outbound';job.waypoint=1;}
    else if(job.phase==='deliver'){job.delivered++;job.phase='rest';job.remaining=4+job.seed%5;}
    else {job.phase='return';job.waypoint=1;}
  }
}
