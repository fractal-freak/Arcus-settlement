/** Exposed sedimentary shelves below the inhabited gate; no decorative rock blobs. */
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const EDGE=[[-85,-43],[-80,-38],[-75,-34],[-71,-29.5],[-67,-28.3],[-63,-28.9],[-59,-31]];
export function palaceCliffEdge(x){
  let z=EDGE[0][1];
  for(let i=1;i<EDGE.length;i++){const a=EDGE[i-1],b=EDGE[i];if(x>=a[0]&&x<=b[0]){const t=(x-a[0])/(b[0]-a[0]);z=a[1]+(b[1]-a[1])*t;break;}if(x>b[0])z=b[1];}
  return z+Math.sin(x*1.07)*.22+Math.sin(x*2.7)*.09;
}
export function palaceCliffMask(x,z){
  const d=z-palaceCliffEdge(x);
  return smooth(-85,-79,x)*(1-smooth(-62,-58.6,x))*smooth(-2,0,d)*(1-smooth(7,10,d));
}
export function weatherPalaceRidge(x,z,height){
  if(x<-86||x>-58||z<-48||z>-17)return height;
  const d=z-palaceCliffEdge(x),mask=palaceCliffMask(x,z);
  const fracture=Math.sin(x*1.9)*.21+Math.sin(x*4.4+.9)*.09;
  const weather=.19*Math.sin(x*.61)+.085*Math.sin(x*3.3+z*2.5);
  const shelf=9.4+weather-3.0*smooth(.15+fracture,.85+fracture,d)
    -2.5*smooth(2.25+fracture,2.9+fracture,d)-2.35*smooth(4.65+fracture,5.4+fracture,d);
  return height+(Math.min(height,shelf)-height)*mask;
}
// Planting belongs along the footings and sheltered rock shelves, clear of doors.
export const GATEHOUSE_IVY=[
  {x:-60.1,z:-28.43,y:10.1,height:7.4,width:2.15,seed:14,openings:[{u:.45,v:1.45,w:1.6,h:2.9}]},
  {x:-58.05,z:-28.28,y:10.1,height:8.1,width:.82,seed:27,surface:'buttress'},
  {x:-51.95,z:-28.28,y:10.1,height:5.2,width:.9,seed:53,surface:'buttress'},
  {x:-47.74,z:-31.5,y:10.1,height:10.2,width:4.4,seed:35,rot:Math.PI/2,openings:[{u:0,v:2,w:1.5,h:2.8},{u:0,v:7,w:1.7,h:3.3}]},
  {x:-66.25,z:-34.8,y:10.1,height:12.7,width:4.6,seed:70,surface:'cylinder',r:3.02,angle:-.72},
  {x:-68.6,z:-51.8,y:10.1,height:13,width:4.1,seed:91,surface:'cylinder',r:3.09,angle:.7},
  {x:-41.9,z:-51.6,y:10.1,height:6.3,width:4.2,seed:103,surface:'cylinder',r:2.75,angle:1.3},
];
export const CLIFF_GROWTH=Array.from({length:74},(_,i)=>{
  const x=-79+(i%25)*.72+Math.sin(i*3.1)*.25;
  return{x,z:palaceCliffEdge(x)+[1.22,3.4,6.4][Math.floor(i/25)]+Math.sin(i*2.7)*.17,scale:.25+(Math.sin(i*21)*.5+.5)*.47,seed:i};
});
export const PALACE_UNDERGROWTH=[
  ...Array.from({length:24},(_,i)=>({x:-49+Math.sin(i*2.4)*1.1,z:-30-i*.21,scale:.48+(i%4)*.12})),
  ...Array.from({length:30},(_,i)=>({x:-70+(i%10)*.68,z:-30+Math.floor(i/10)*.55,scale:.48+(i%5)*.1})),
  ...Array.from({length:26},(_,i)=>({x:-38.5+(i%3)*.42,z:-34-Math.floor(i/3)*1.5,scale:.55+(i%5)*.08})),
];
export function ivySurfacePoint(plant,u,v){
  if(plant.surface==='cylinder'){
    const angle=plant.angle+u/plant.r;
    return [plant.x+Math.sin(angle)*plant.r,plant.y+v,plant.z+Math.cos(angle)*plant.r];
  }
  let depth=0;
  if(plant.surface==='buttress'){
    depth=v<2.9?.85:v<3.5?.85-(v-2.9)/.6*.544:v<7.4?.306:v<8?.306-(v-7.4)/.6*.357:-.051;
  }
  const a=plant.rot??0;
  return [plant.x+u*Math.cos(a),plant.y+v,plant.z-u*Math.sin(a)+depth+.045];
}
