/** The earned crossing's geometry and walking surface, shared by every system. */
import { propRadius } from './propSizes.js';
import { isWater, smoothHeightAt, WATER_LEVEL, STEP } from './terrain.js';
const crossingZ=-12;
const wet=[];
for(let x=-20;x<=40;x++) if(isWater(x,crossingZ)) wet.push(x);
export const BRIDGE=wet.length ? Object.freeze({
  from:wet[0]-4,to:wet.at(-1)+5,z:crossingZ,width:3.4,walkHalf:1.3,railHeight:.8,segments:48,
  rise:Math.max(1.25,WATER_LEVEL+STEP*.5+1.65-(smoothHeightAt(wet[0]-4,crossingZ)+smoothHeightAt(wet.at(-1)+5,crossingZ))/2),
}) : null;
let active=false;
export function setBridgeActive(value){active=!!value && !!BRIDGE;}
export function bridgeActive(){return active;}
export function bridgeContains(x,z,margin=0){
  return !!BRIDGE && x>=BRIDGE.from-margin && x<=BRIDGE.to+margin && Math.abs(z-BRIDGE.z)<=BRIDGE.width/2+margin;
}
function sampleHeight(x,z){
  const b=BRIDGE,t=(x-b.from)/(b.to-b.from);
  return smoothHeightAt(b.from,z)*(1-t)+smoothHeightAt(b.to,z)*t+b.rise*Math.sin(Math.PI*t)**2;
}
/** Piecewise planar longitudinal surface, exactly the renderer's tessellation. */
export function bridgeDeckHeight(x,z=BRIDGE.z){
  const b=BRIDGE,t=Math.max(0,Math.min(b.segments,(x-b.from)/(b.to-b.from)*b.segments));
  const i=Math.min(b.segments-1,Math.floor(t)),f=t-i,dx=(b.to-b.from)/b.segments;
  return sampleHeight(b.from+i*dx,z)*(1-f)+sampleHeight(b.from+(i+1)*dx,z)*f;
}
export function bridgeFloor(x,z){return active && bridgeContains(x,z) ? bridgeDeckHeight(x,z) : null;}
/** A person must fit between parapets; water is allowed only on the deck. */
export function bridgeBlocked(x,z,clear){
  if(!active || !bridgeContains(x,z,clear))return null;
  if(x<BRIDGE.from || x>BRIDGE.to) {
    return Math.abs(z-BRIDGE.z)+clear>BRIDGE.walkHalf ? true : null;
  }
  return Math.abs(z-BRIDGE.z)+clear>BRIDGE.walkHalf;
}
/** Constant-speed circuit: cross in two lanes, turn around on each landing. */
export function bridgeRoute(seconds,phase=0){
  const b=BRIDGE,r=.5,left=b.from+.7,right=b.to-.7,length=right-left;
  const perimeter=2*length+2*Math.PI*r;
  let s=((seconds*.8+phase*perimeter)%perimeter+perimeter)%perimeter;
  if(s<length)return {x:left+s,z:b.z-r,yaw:Math.PI/2};
  s-=length;
  if(s<Math.PI*r){const a=-Math.PI/2+s/r;return {x:right+Math.cos(a)*r,z:b.z+Math.sin(a)*r,yaw:-a};}
  s-=Math.PI*r;
  if(s<length)return {x:right-s,z:b.z+r,yaw:-Math.PI/2};
  const a=Math.PI/2+(s-length)/r;
  return {x:left+Math.cos(a)*r,z:b.z+Math.sin(a)*r,yaw:-a};
}


/** Cobblestone approaches: the west curve joins the court; the east leads inland. */
const curves=BRIDGE ? [
  [[-1,-7.5],[-3,-9],[-4,BRIDGE.z],[BRIDGE.from,BRIDGE.z]],
  [[BRIDGE.to,BRIDGE.z],[BRIDGE.to+4,BRIDGE.z],[BRIDGE.to+6,BRIDGE.z-3],[BRIDGE.to+8,BRIDGE.z-7]],
] : [];
export const BRIDGE_PATHS=curves.map(points=>Array.from({length:65},(_,i)=>{
  const t=i/64,u=1-t;
  const coord=k=>u*u*u*points[0][k]+3*u*u*t*points[1][k]+3*u*t*t*points[2][k]+t*t*t*points[3][k];
  return {x:coord(0),z:coord(1)};
}));
const pathBounds=BRIDGE_PATHS.map(path=>({minX:Math.min(...path.map(p=>p.x)),maxX:Math.max(...path.map(p=>p.x)),minZ:Math.min(...path.map(p=>p.z)),maxZ:Math.max(...path.map(p=>p.z))}));
export function bridgePathDistance(x,z){
  let distance=Infinity;
  for(const path of BRIDGE_PATHS)for(let i=1;i<path.length;i++){
    const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
  }
  return distance;
}
export function bridgePathContains(x,z,margin=0){
  const r=1.15+margin;
  if(!pathBounds.some(b=>x>=b.minX-r && x<=b.maxX+r && z>=b.minZ-r && z<=b.maxZ+r))return false;
  return bridgePathDistance(x,z)<r;
}

/** Existing scenery yields to the crossing and its maintained approach lanes. */
export function outsideBridgeWorks(p){
  const r=propRadius(p.kind);
  return !bridgeContains(p.x,p.z,r) && !bridgePathContains(p.x,p.z,r);
}

/** Worn coping keeps its mortar course below the surviving cap. */
export function bridgeCopingRise(x){
  const i=Math.min(BRIDGE.segments-1,Math.max(0,Math.floor((x-BRIDGE.from)/(BRIDGE.to-BRIDGE.from)*BRIDGE.segments)));
  return BRIDGE.railHeight-(i%11===3?.15:i%7===2?.07:0);
}
