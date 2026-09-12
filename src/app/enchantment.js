/** Locations and identities of the kingdom's magical details and wild residents. */
import {REALM,REALM_GATE,REALM_PARTS} from './realm.js';
import {smoothHeightAt} from './terrain.js';
import {causewayHeight} from './palaceCauseway.js';
export const BANNERS=[
  {x:-58.08,y:REALM.seat.floor+9.8,z:-27.2,w:1.0,h:3.2,color:0x492965},
  {x:-51.92,y:REALM.seat.floor+9.8,z:-27.2,w:1.0,h:3.2,color:0x594079},
  {x:-62,y:REALM.seat.floor+8.1,z:-40.9,w:1.2,h:3.8,color:0x38265f},
];
export const GLASS=[-60.4,-57.8,-52.2,-49.6].map((x,i)=>({x,y:REALM.seat.floor+4.4,z:-41.01,w:1.38,h:3.35,palette:i}));
export const FIRES=[-1,1].map((side,i)=>{
  const x=REALM_GATE.x+side*3.3,z=REALM_GATE.z+2.6;
  const ground=Math.min(...[-.6,0,.6].flatMap(dx=>[-.6,0,.6].map(dz=>smoothHeightAt(x+dx,z+dz))))-.45;
  const top=causewayHeight(REALM_GATE.x,z,REALM_GATE,REALM.seat.floor)+1.0;
  REALM_PARTS.push({shape:'box',name:'Runed brazier pier foundation',x,y:ground+.3,z,w:1.05,h:.6,d:1.05,material:'stone',solid:true,rot:0});
  REALM_PARTS.push({shape:'box',name:'Runed brazier pedestal',x,y:(ground+top)/2,z,w:.78,h:top-ground,d:.78,material:'trim',solid:true,rot:0});
  REALM_PARTS.push({shape:'box',name:'Runed brazier pier capital',x,y:top,z,w:.96,h:.18,d:.96,material:'trim',solid:false,rot:0});
  return {x,y:top+.34,z,color:i?0x61d7b5:0x849aff};
});
export const WILDLIFE=[
  {id:'elder-stag',x:-60,z:18,species:'deer',phase:1.4},
  {id:'young-doe',x:-57,z:20,species:'deer',phase:3.1},
  {id:'woodland-fox',x:-26,z:43,species:'fox',phase:5.2},
];
