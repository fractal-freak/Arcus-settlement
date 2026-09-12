/** Surviving fragments of old routes, following the existing hamlet road plan. */
import { BRIDGE, BRIDGE_PATHS } from './bridge.js';
import { REALM_ROADS, realmBlocked } from './realm.js';
import { smoothHeightAt, isWater, hash2, WATER_LEVEL, STEP } from './terrain.js';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const ANCIENT_ROUTES=[
  ...BRIDGE_PATHS.map((points,i)=>({points,width:2.5,bridge:i,fadeStart:false,fadeEnd:i===1})),
  ...REALM_ROADS.map(road=>({points:Array.from({length:Math.max(2,Math.ceil(Math.hypot(road.b[0]-road.a[0],road.b[1]-road.a[1])*2))},(_,i)=>{
    const n=Math.max(2,Math.ceil(Math.hypot(road.b[0]-road.a[0],road.b[1]-road.a[1])*2)),t=i/(n-1);
    return {x:road.a[0]+(road.b[0]-road.a[0])*t,z:road.a[1]+(road.b[1]-road.a[1])*t};
  }),width:Math.min(2.5,road.width+0.4),fadeStart:true,fadeEnd:true})),
  {points:[{x:-8,z:-6},{x:-13,z:-9},{x:-18,z:-10},{x:-23,z:-9}],width:1.7,fadeStart:false,fadeEnd:true},
  {points:[{x:-7,z:8},{x:-10,z:12},{x:-13,z:17},{x:-16,z:20}],width:1.6,fadeStart:false,fadeEnd:true},
];
const occupied=new Set();
export const PATH_STONES=[],PATH_GROWTH=[];
for(const [routeIndex,route] of ANCIENT_ROUTES.entries()){
  const points=route.points,segments=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.z-points[i].z));
  const total=segments.reduce((a,b)=>a+b,0);let traveled=0,next=0;
  for(let segment=0;segment<segments.length;segment++){
    const a=points[segment],b=points[segment+1],length=segments[segment],dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    while(next<=traveled+length){
      const progress=(next-traveled)/length,along=next/total;
      const centerX=a.x+(b.x-a.x)*progress,centerZ=a.z+(b.z-a.z)*progress;
      const endFade=(route.fadeStart?smooth(next/3):1)*(route.fadeEnd?smooth((total-next)/5):1);
      const nearLanding=route.bridge!==undefined && (route.bridge===0?total-next:next)<2;
      const island=nearLanding?1:.27+.73*smooth((Math.sin(next*.65+routeIndex*1.7)+.65)/1.3);
      const row=Math.round(next/.56);
      for(let lane=-2;lane<=2;lane++){
        const seed=routeIndex*10000+row*7+lane+2,rand=s=>hash2(seed,s,2801);
        const offset=lane*route.width/5+(rand(1)-.5)*.18;
        const x=centerX-dz*offset+dx*(lane%2*.22+(rand(2)-.5)*.12),z=centerZ+dx*offset+dz*(lane%2*.22+(rand(2)-.5)*.12);
        const edge=1-Math.abs(lane)*.15,coverage=endFade*island*edge;
        if(Math.hypot(x,z)<9.4 || isWater(x,z) || smoothHeightAt(x,z)<WATER_LEVEL+STEP*.5+.12 || realmBlocked(x,z,.35))continue;
        // Never extend the approach stones over the raised deck.
        if(x>BRIDGE.from && x<BRIDGE.to && Math.abs(z-BRIDGE.z)<BRIDGE.width/2)continue;
        const key=`${Math.round(x/.42)},${Math.round(z/.42)}`;
        if(occupied.has(key))continue;occupied.add(key);
        if(rand(3)>coverage){if(rand(4)<.23&&endFade>.1)PATH_GROWTH.push({x,z,scale:.18+rand(8)*.22});continue;}
        const wear=1-coverage,height=.14+rand(5)*.09;
        PATH_STONES.push({x,z,a:Math.atan2(dz,dx)+(rand(6)-.5)*.30,width:.57+rand(7)*.16,depth:.48+rand(8)*.14,
          height,sink:wear*.13+rand(9)*.025,tone:.78+rand(10)*.30});
        if(rand(11)<.18+wear*.4)PATH_GROWTH.push({x:x+dz*.23,z:z-dx*.23,scale:.12+wear*.22});
      }
      next+=.56;
    }
    traveled+=length;
  }
}
/** Reserve just surviving paving, leaving grass in the abandoned gaps. */
const pavedTiles=new Set();
for(const p of PATH_STONES)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)pavedTiles.add(`${Math.round(p.x)+dx},${Math.round(p.z)+dz}`);
export function ancientPavingNear(x,z){return pavedTiles.has(`${Math.round(x)},${Math.round(z)}`);}

const stoneCells=new Map();
for(const p of PATH_STONES){const key=`${Math.floor(p.x)},${Math.floor(p.z)}`;if(!stoneCells.has(key))stoneCells.set(key,[]);stoneCells.get(key).push(p);}
export function ancientStoneNear(x,z){
  if(!ancientPavingNear(x,z))return false;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of stoneCells.get(`${Math.floor(x)+dx},${Math.floor(z)+dz}`)??[])
    if(Math.hypot(x-p.x,z-p.z)<.38)return true;
  return false;
}
