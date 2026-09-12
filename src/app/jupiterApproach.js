/** The old processional lane: shared alignment, surviving paving and soft verges. */
import {realmBlocked,realmReserved,realmFloor} from './realm.js';
export const APPROACH_VERGE_RADIUS=2.8;
// Follows the existing village junctions, ending at the causeway's splayed landing.
export const JUPITER_APPROACH = [[-10,0],[-17,3],[-29,8],[-31,-2],[-43,-4],[-50,-8],[-55,-13]];
const random=(n,s=0)=>{const v=Math.sin(n*127.1+s*311.7)*43758.5453;return v-Math.floor(v);};
const alignment=[JUPITER_APPROACH[0]];
for(let i=1;i<JUPITER_APPROACH.length-1;i++){
 const a=JUPITER_APPROACH[i-1],b=JUPITER_APPROACH[i],c=JUPITER_APPROACH[i+1];
 const back=Math.hypot(a[0]-b[0],a[1]-b[1]),forward=Math.hypot(c[0]-b[0],c[1]-b[1]);
 const radius=Math.min(1.7,back*.2,forward*.2);
 const start=b.map((v,k)=>v+(a[k]-v)*radius/back),end=b.map((v,k)=>v+(c[k]-v)*radius/forward);
 alignment.push(start);
 for(let j=1;j<=10;j++){const t=j/10;alignment.push(b.map((v,k)=>(1-t)**2*start[k]+2*(1-t)*t*v+t*t*end[k]));}
}
alignment.push(JUPITER_APPROACH.at(-1));
const segments=alignment.slice(1).map((b,i)=>{
 const a=alignment[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
 return{a,b,length,dx:(b[0]-a[0])/length,dz:(b[1]-a[1])/length};
});
export const APPROACH_LENGTH=segments.reduce((sum,s)=>sum+s.length,0);
export function approachDistance(x,z){
 let d=Infinity;
 for(const s of segments){const t=Math.max(0,Math.min(s.length,(x-s.a[0])*s.dx+(z-s.a[1])*s.dz));d=Math.min(d,Math.hypot(x-s.a[0]-t*s.dx,z-s.a[1]-t*s.dz));}
 return d;
}
export function approachPoint(distance,offset=0){
 let remaining=Math.max(0,Math.min(APPROACH_LENGTH,distance));
 for(const [i,s] of segments.entries()){
  if(remaining<=s.length || i===segments.length-1)return{x:s.a[0]+remaining*s.dx-s.dz*offset,z:s.a[1]+remaining*s.dz+s.dx*offset,dx:s.dx,dz:s.dz};
  remaining-=s.length;
 }
}
export const APPROACH_SLABS=[],APPROACH_GROWTH=[];
for(let row=0;row<Math.floor(APPROACH_LENGTH/.73);row++){
 const along=.4+row*.73;
 for(let col=-1;col<=1;col++){
  const seed=row*3+col+1,edge=Math.abs(col)===1;
  // The centre is more worn; missing slabs expose the continuous earth beneath.
  if(random(seed,1)<(edge?.035:.16))continue;
  const p=approachPoint(along+(col%2)*.12,col*.75);
  APPROACH_SLABS.push({...p,along:along+(col%2)*.12,offset:col*.75,width:.70+random(seed,2)*.04,depth:.65+random(seed,3)*.055,seed,tone:.87+random(seed,4)*.16});
 }
 for(const side of [-1,1]){
  // Broad, interrupted drifts rather than a hedge or a uniformly dotted border.
  const drift=Math.sin(along*.23+side*1.7)+Math.sin(along*.51)*.35;
  if(drift<-.2)continue;
  for(let n=0;n<3;n++){
   const seed=row*13+n+side*300;
   const p=approachPoint(along+(random(seed,2)-.5)*.6,side*(1.7+random(seed,3)*1.25));
   if(approachDistance(p.x,p.z)<1.55 || realmBlocked(p.x,p.z,.4) || realmReserved(p.x,p.z,-.5) || realmFloor(p.x,p.z)!==null)continue;
   APPROACH_GROWTH.push({...p,seed,scale:.6+random(seed,4)*.75});
  }
 }
}
