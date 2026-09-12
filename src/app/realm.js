/** The founding kingdom's architecture: floors, walls and doors are shared world facts. */
import { smoothHeightAt } from './terrain.js';
import { buildJupiterGatehouse } from './jupiterGatehouse.js';
import { ruinCrown } from './ruinedTower.js';
import { causewayHeight } from './palaceCauseway.js';

export const REALM = {
  id: 'first-kingdom', name: 'Palace of Jupiter',
  culture: { stone: 'weathered limestone', timber: 'dark oak', banner: 'oxblood and gold' },
  seat: { x: -55, z: -42, w: 32, d: 26, floor: 10.1 },
  spawn: { x: -30, z: 3 },
};
export const REALM_PARTS = [];
export const REALM_FLOORS = [];
export const REALM_BUILDINGS = [];
const parts=REALM_PARTS;
function box(name,x,y,z,w,h,d,material='stone',solid=true,rot=0) {
  parts.push({shape:'box',name,x,y,z,w,h,d,material,solid,rot});
}
function windowWall(name,x,z,length,height,floor,material,side=false) {
  const sill=height>5?2.0:1.25, head=height>5?4.0:2.25;
  const add=(offset,y,width,h,solid=true)=>box(name,x+(side?0:offset),floor+y,z+(side?offset:0),side?.55:width,h,side?width:.55,material,solid);
  add(0,sill/2,length,sill);
  add(0,head+(height-head)/2,length,height-head,false);
  const count=Math.max(1,Math.floor(length/3.2)),pitch=length/count,gap=height>5?.85:.8;
  for(let i=0;i<=count;i++) {
    const width=i===0||i===count?(pitch-gap)/2:pitch-gap;
    const offset=-length/2+i*pitch+(i===0?width/2:i===count?-width/2:0);
    add(offset,(sill+head)/2,width,head-sill);
  }
}
function room(id,x,z,w,d,floor,height,material='stone',door=2.4) {
  REALM_BUILDINGS.push({id,kingdom:REALM.id,x,z,w,d,floor,height,door});
  REALM_FLOORS.push({x,z,w,d,y:floor});
  box(`${id} floor`,x,floor-.14,z,w,.28,d,'floor',false);
  windowWall(`${id} back`,x,z-d/2,w,height,floor,material);
  windowWall(`${id} west`,x-w/2,z,d,height,floor,material,true);
  windowWall(`${id} east`,x+w/2,z,d,height,floor,material,true);
  const side=(w-door)/2;
  for(const sign of [-1,1])box(`${id} doorway`,x+sign*(door/2+side/2),floor+height/2,z+d/2,side,height,.55,material);
  const clearance=Math.min(2.7,height-.25);
  box(`${id} lintel`,x,floor+clearance+(height-clearance)/2,z+d/2,door,height-clearance,.55,material,false);
}

const c=REALM.seat, f=c.floor;
export const REALM_GATE={x:c.x,z:c.z+c.d/2,approachZ:c.z+c.d/2+16,width:5.2};
// Castle authored about its local origin, then placed as one shared plan.
const castleOffset={x:c.x+30,z:c.z+20};
REALM_FLOORS.push({x:-30,z:-20,w:c.w,d:c.d,y:f});
box('Castle court',-30,f-.23,-20,c.w,.46,c.d,'floor',false);
// Curtain walls: the gate and the western breach remain real open passages.
box('North curtain',-30,f+2.9,-33,32,5.8,1.1);
// Collapsed stretches have low, uneven remnants instead of an intact rectangle.
const eastHeights=[5.6,5.2,4.5,2.3,.65,.35,.8,1.4,3.2,4.8,5.4,4.2,2.6];
for(let i=0;i<13;i++)box('Broken east curtain',-14,f+eastHeights[i]/2,-32+i*2,1.1,eastHeights[i],2.04);
box('West curtain north',-46,f+2.5,-26,1.1,5,14);
box('West curtain remnant',-46,f+.8,-9,1.1,1.6,4);
const southHeights=[4.8,3.7,2.1,.65,.3,1.1,2.7];
for(let i=0;i<7;i++)box('Broken south curtain',-26.4+i*1.85,f+southHeights[i]/2,-7,1.9,southHeights[i],1.1);
for(let i=0;i<20;i++) {
  const x=-45.2+i*1.6;
  if(i%7!==3)box('North battlement',x,f+5.8+(i%3)*.13,-33,.8,.65+(i%3)*.26,1.2,'stone',false);
}

room('Great hall',-30,-25,15,11,f,8.6,'stone',3.2);
// Roof structure survives on the western half; the eastern hall is open to the sky.
parts.push({shape:'roof',name:'Surviving hall roof',x:-30,y:f+8.6,z:-25,w:15.8,d:7.6,h:5.2,half:true,material:'roof',solid:false});
for(let z=-30;z<=-20;z+=2.1)box('Exposed oak roof beam',-33,f+8.35,z,9,.25,.24,'wood',false);
box('Hall dais',-30,f+.12,-28.9,6,.24,2.6,'floor',false);
box('High table',-30,f+1.02,-27.7,5.1,.18,.9,'wood');
for(const x of [-32.2,-27.8])box('Table trestle',x,f+.5,-27.7,.18,1,.6,'wood');
box('Throne seat',-30,f+.6,-29.5,1.15,.18,1,'wood');
box('Throne back',-30,f+1.5,-29.95,1.2,1.8,.16,'wood');
box('Hall carpet',-30,f+.025,-24.1,2.5,.025,6.5,'cloth',false);
for(const x of [-35.7,-24.3]) {
  box('Feasting table',x,f+.88,-23.8,1.3,.16,5,'wood');
  for(const dx of [-1.05,1.05])box('Hall bench',x+dx,f+.48,-23.8,.4,.2,4.6,'wood');
}

// Round towers are hollow segmented masonry, with real doors and slit windows.
// Every segment is shared with collision; no solid cylinder conceals a room.
function roundTower(id,x,z,r,height,ruined=false,spire=false) {
  REALM_BUILDINGS.push({id,kingdom:REALM.id,x,z,w:r*2,d:r*2,floor:f,height,door:2.3});
  REALM_FLOORS.push({x,z,w:r*2,d:r*2,y:f});
  box(`${id} floor`,x,f-.1,z,r*2,.2,r*2,'floor',false);
  if(ruined){
    parts.push({shape:'ruinedDrum',name:`${id} continuous broken masonry`,x,y:f,z,w:r*2,h:height,d:r*2,thickness:.72,crown:ruinCrown(height),sills:[4.9,10.3].filter(y=>y+2<height-6.4),material:'ruinStone',solid:false});
    for(let i=0;i<48;i++){
      const angle=i/48*Math.PI*2;
      if(Math.cos(angle)>.8&&Math.abs(Math.sin(angle)*r)<1.3)continue;
      parts.push({shape:'box',name:`${id} footing`,x:x+Math.sin(angle)*r,y:f+1,z:z+Math.cos(angle)*r,w:.44,h:2,d:.75,solid:true,collisionOnly:true,rot:angle});
    }
    return;
  }
  const count=28,pitch=Math.PI*2/count,panel=2*r*Math.tan(pitch/2)+.025;
  for(let i=0;i<count;i++) {
    const angle=i*pitch,px=x+Math.sin(angle)*r,pz=z+Math.cos(angle)*r;
    const doorway=i===0||i===1||i===count-1;
    const top=height;
    const add=(bottom,h,solid=true)=>box(`${id} masonry`,px,f+bottom+h/2,pz,panel,h,.65,'stone',solid,angle);
    if(!doorway)add(0,3.6);
    else add(3.0,.6,false);
    // Recessed upper openings cut through the wall instead of painted windows.
    if(i%7===0){
      let bottom=3.6;
      for(const sill of [4.9,10.3,15.3,19.4])if(sill+1.65<top-.7){
        if(sill>bottom)add(bottom,sill-bottom,false);bottom=sill+1.65;
      }
      if(bottom<top)add(bottom,top-bottom,false);
    }else add(3.6,top-3.6,false);
    if(!ruined && i%2===0)box('Round machicolation',px,f+height-.8,pz,panel+.2,.5,.95,'stone',false,angle);
    if(!spire && i%2===0)box('Tower crown',px,f+top+.38,pz,panel*.8,.76,.85,'stone',false,angle);
  }
  for(const heightBand of [3.3,10.2,height-.5])if(heightBand<height-1)
    parts.push({shape:'ring',name:'Tower carved belt',x,y:f+heightBand,z,w:r*2+.34,d:r*2+.34,h:.24,thickness:.28,material:'trim',solid:false});
  if(spire) {
    parts.push({shape:'spire',name:'Noble tower slate spire',x,y:f+height,z,w:r*2+1,h:7.3,d:r*2+1,material:'roof',solid:false});
    for(const angle of [0,Math.PI*2/3,Math.PI*4/3]){
      const co=Math.cos(angle),si=Math.sin(angle),radius=r*.87;
      const dx=x+si*radius,dz=z+co*radius,y=f+height+1.1;
      parts.push({shape:'roof',name:'Slate turret dormer',x:dx,y:y+.65,z:dz,w:1.3,d:1.1,h:.75,material:'roof',solid:false,rot:angle});
      box('Dormer glazing',dx+si*.51,y+.33,dz+co*.51,.72,.65,.09,'window',false,angle);
      for(const side of [-1,1])box('Dormer carved jamb',dx+si*.56+co*side*.46,y+.38,dz+co*.56-si*side*.46,.14,.76,.15,'trim',false,angle);
      box('Dormer sill',dx+si*.56,y,dz+co*.56,1.1,.12,.24,'trim',false,angle);
    }
    parts.push({shape:'spire',name:'Gilded finial',x,y:f+height+7.2,z,w:.23,h:1.1,d:.23,material:'gold',solid:false});
  }
}
roundTower('West tower',-43.6,-29.8,3.05,24,true);
roundTower('Broken east tower',-16.9,-29.6,2.7,14.2,true);
// A slender inhabited turret rises from the surviving hall's corner.
roundTower('Crown turret',-25.8,-28.4,1.55,19,false,true);
function arch(name,x,y,z,w,h,depth=.55,rot=0) {
  parts.push({shape:'arch',name,x,y,z,w,h,d:depth,thickness:.4,material:'trim',solid:false,rot});
}
// Tall ribs and pointed openings make the ruined hall read as a former palace.
for(const z of [-29.5,-25,-20.5]) {
  arch('Exposed great hall vault',-30,f+7.7,z,14,5.2,.48);
  for(const x of [-37.2,-22.8]) {
    box('Gothic buttress pier',x,f+4,z,.85,8,1.2);
    parts.push({shape:'spire',name:'Buttress pinnacle',x,y:f+8,z,w:1.1,d:1.1,h:3.0,material:'stone',solid:false});
  }
}
arch('Hall carved entry',-30,f+2.65,-19.15,3.2,3.1,.75);
// Repeated blind arcades, ledges and narrow piers articulate the surviving facade.
for(const x of [-35.4,-32.8,-27.2,-24.6]) {
  arch('Hall lancet surround',x,f+5.4,-19.18,1.45,2.3,.28);
  for(const sign of [-1,1])box('Lancet slender pier',x+sign*.82,f+4.2,-19.12,.18,2.4,.28,'trim',false);
}
for(const x of [-37.65,-22.35])box('Hall string course',x,f+4.8,-25,.22,.22,11.4,'trim',false);
// An elevated ruined gallery spans the western court, open beneath its arches.
for(const z of [-23,-18])arch('Courtyard arcade',-40.1,f+3.2,z,4.4,2.8,.6);
for(const x of [-42.5,-37.7])for(const z of [-23,-18])box('Arcade support',x,f+1.7,z,.6,3.4,.7);
// Cut away the east hall's upper walls. Damage changes the actual silhouette.
for(const p of parts) {
  if(p.name==='Great hall east' && p.y>f+4) {p.h=1.1;p.y=f+4.55;}
  if(p.name==='Great hall doorway' && p.x>-30) {p.h=5.1;p.y=f+2.55;}
}
// Uneven exposed masonry, buttresses, temporary roof supports, and fallen blocks.
for(let i=0;i<10;i++)box('Hall fracture edge',-22.5,f+5.0+(i%3)*.18,-29.8+i*1.04,.7,.5+(i%3)*.3,.75,'stone',false);
for(const z of [-29,-24,-20])box('Old hall buttress',-38,f+2.3,z,1.3,4.6,1.0);
for(let i=0;i<32;i++) {
  const x=-20+(i%7)*1.5+Math.sin(i*4.3),z=-13+Math.floor(i/7)*1.35+Math.cos(i*2.1);
  box('Collapsed masonry',x,f+.2+(i%3)*.09,z,.55+(i%4)*.17,.4+(i%3)*.18,.5+(i%2)*.2,'stone',true,i*.71);
}
for(const z of [-29,-25,-21])box('Repair scaffold upright',-39,f+3,z,.18,6,.18,'wood');
for(const y of [2,4.2,5.6])box('Repair scaffold rail',-39,f+y,-25,.16,.16,8.5,'wood',false);
for(const x of [-34.8,-25.2]) {
  box('Hall banner',x,f+5.6,-30.19,1.15,3,.07,'cloth',false);
  box('Hall banner rail',x,f+7.15,-30.16,1.45,.08,.1,'gold',false);
}
// Pierced quatrefoils and exterior flying supports are shared palace assets.
for(const x of [-35.4,-32.8,-27.2,-24.6]) {
  parts.push({shape:'tracery',name:'Carved quatrefoil',x,y:f+6.95,z:-18.93,w:1.0,h:1,d:.12,material:'trim',solid:false});
  box('Window stone mullion',x,f+5.25,-18.98,.08,2.35,.16,'trim',false);
}
for(const z of [-28.8,-23.8,-19.5]) {
  parts.push({shape:'flying',name:'Flying buttress',x:-40.1,y:f+3.8,z,w:4.6,h:4.7,d:.5,material:'trim',solid:false});
  box('Flying buttress outer pier',-42.4,f+2,z,.9,4,1.25,'stone');
  parts.push({shape:'spire',name:'Carved pier finial',x:-42.4,y:f+4,z,w:1.1,h:2.4,d:1.1,material:'trim',solid:false});
}
// Cut real holes through front/back walls before moving the castle into place.
function wallHole(names,cx,bottom,width,height){
  for(let i=parts.length-1;i>=0;i--){
    const p=parts[i];if(!names.includes(p.name))continue;
    const left=p.x-p.w/2,right=p.x+p.w/2,low=p.y-p.h/2,high=p.y+p.h/2;
    const x0=Math.max(left,cx-width/2),x1=Math.min(right,cx+width/2),y0=Math.max(low,bottom),y1=Math.min(high,bottom+height);
    if(x0>=x1 || y0>=y1)continue;
    parts.splice(i,1);
    const piece=(l,r,b,t)=>{if(r-l>.005 && t-b>.005)parts.push({...p,x:(l+r)/2,y:(b+t)/2,w:r-l,h:t-b,solid:p.solid && b<f+2.5});};
    piece(left,x0,low,high);piece(x1,right,low,high);piece(x0,x1,low,y0);piece(x0,x1,y1,high);
  }
}
for(const x of [-35.4,-32.8,-27.2,-24.6])wallHole(['Great hall doorway'],x,f+4.4,1.38,3.35);
for(const x of [-40,-35,-25,-20])wallHole(['North curtain'],x,f+2.1,.8,1.7);
// A ragged opening and a climbing fissure through the curtain, with actual depth.
for(let row=0;row<7;row++)wallHole(['North curtain'],-30+Math.sin(row*.8)*.2,f+1+row*.48,2.3-Math.abs(row-3)*.37,.5);
for(let row=0;row<9;row++)wallHole(['Surviving gate wall'],-37.3+Math.sin(row*1.2)*.13,f+1.1+row*.45,.10+(row%3)*.035,.47);
for(const p of parts)if(p.material==='stone' && /curtain|crown|fracture|masonry/.test(p.name))p.eroded=true;
// Working courtyard: sheltered stores, an astronomical table, seats, and planted beds.
box('Courtyard worktable',-35.1,f+.9,-14.3,2.8,.18,1.2,'wood');
for(const x of [-36.2,-34])box('Worktable trestle',x,f+.42,-14.3,.16,.84,.85,'wood');
for(let i=0;i<4;i++)box('Bound star atlas',-35.6+i*.34,f+1.04+(i%2)*.08,-14.3,.3,.16,.5,i%2?'cloth':'wood',false,.12*i);
for(const x of [-35.8,-25])box('Courtyard bench',x,f+.48,-10.3,2.3,.32,.65,'wood');
box('Astronomer pedestal',-25.2,f+.65,-16.3,1.3,1.3,1.3,'trim');
parts.push({shape:'orb',name:'Jupiter armillary globe',x:-25.2,y:f+1.65,z:-16.3,w:1.15,h:1.15,d:1.15,material:'gold',solid:false});
parts.push({shape:'tracery',name:'Armillary engraved rings',x:-25.2,y:f+1.65,z:-16.3,w:1.85,h:1.85,d:.2,material:'gold',solid:false});
for(const x of [-35.5,-25.5]){
  box('Courtyard herb bed',x,f+.3,-8.8,2.5,.6,1.0,'stone');
  box('Herb bed soil',x,f+.61,-8.8,2.2,.06,.8,'wood',false);
  for(let i=0;i<6;i++)parts.push({shape:'orb',name:'Herb foliage',x:x-1+i*.4,y:f+.83,z:-8.8+(i%2)*.17,w:.38,h:.4,d:.4,material:'foliage',solid:false});
}
for(const item of [...parts,...REALM_FLOORS,...REALM_BUILDINGS]) {item.x+=castleOffset.x;item.z+=castleOffset.z;}
// The inhabited gatehouse replaces the old flat gate curtain and cone-roof lodge.
for(let i=parts.length-1;i>=0;i--)if(parts[i].name==='Broken south curtain'&&parts[i].x<-47)parts.splice(i,1);
buildJupiterGatehouse(parts,REALM_FLOORS,REALM_BUILDINGS,{...c,id:REALM.id},REALM_GATE);

// A hamlet grown around footpaths: different spans, materials, age, and orientation.
const homes=[
  {x:-35,z:-8,w:6.4,d:5.5,rot:.24,material:'stone',h:2.9},
  {x:-22,z:14,w:5.8,d:6.8,rot:-.27,material:'wood',h:2.65},
  {x:-46,z:5,w:8.2,d:5.4,rot:.12,material:'stone',h:3.1},
  {x:-22,z:30,w:6.8,d:5.2,rot:.38,material:'stone',h:2.7},
  {x:-47,z:24,w:5.6,d:6.3,rot:-.31,material:'wood',h:2.85},
  {x:-37,z:39,w:7.6,d:5.8,rot:-.13,material:'stone',h:2.8},
];
for(const [i,home] of homes.entries()) {
  const {x,z,w,d,rot,material,h}=home,co=Math.cos(rot),si=Math.sin(rot);
  const start=parts.length;
  let floor=0;
  for(const dx of [-w/2,0,w/2])for(const dz of [-d/2,0,d/2])floor=Math.max(floor,smoothHeightAt(x+dx*co+dz*si,z-dx*si+dz*co));
  floor+=.07;
  const id=`Croft ${i+1}`;
  room(id,x,z,w,d,floor,h,material,1.9);
  const building=REALM_BUILDINGS.at(-1);building.rot=rot;
  REALM_FLOORS.at(-1).rot=rot;
  const roofMaterial=i%3===0?'roof':'thatch';
  parts.push({shape:'roof',name:`${id} patched roof`,x,y:floor+h,z,w:w+.8,d:d+.9,h:1.75+(i%2)*.35,material:roofMaterial,solid:false,sag:.24,damaged:i===2});
  for(const sign of [-1,1])parts.push({shape:'gable',name:`${id} gable`,x,y:floor+h,z:z+sign*d/2,w,h:1.6+(i%2)*.35,material,solid:false});
  // Heavy stone footings ground the timber homes; small repairs break up the facade.
  for(const sign of [-1,1])box('Cottage stone footing',x+sign*w/2,floor+.25,z,.65,.5,d,'stone');
  for(const dx of [-w/2,w/2])box('Weathered door-side post',x+dx,floor+h/2,z+d/2+.3,.2,h,.19,'wood',false);
  box('Old oak lintel',x,floor+2.5,z+d/2+.3,2.4,.28,.3,'wood',false);
  box('Cottage eave beam',x,floor+h-.12,z+d/2+.3,w,.22,.25,'wood',false);
  const chimneyX=x-w/2+1;
  box('Rough chimney',chimneyX,floor+h+.35,z-d/2+1.0,.9,2.8,.95,'stone');
  box('Chimney cap',chimneyX,floor+h+1.85,z-d/2+1.0,1.1,.22,1.1,'stone',false);
  for(let k=0;k<5;k++)box('Reclaimed wall stone',x+w/2+.12,floor+.4+k*.39,z-d/2+.4,.35,.25,.45,'stone',false);
  box('Sleeping pallet',x-w/2+1.1,floor+.25,z-.9,1.3,.45,1.9,'wood');
  box('Straw bedding',x-w/2+1.1,floor+.52,z-.9,1.2,.12,1.8,'thatch',false);
  box('Cottage table',x+1.4,floor+.8,z-.4,1.2,.16,1,'wood');
  // Firewood and a low broken yard wall belong to this household, away from its door.
  for(let k=0;k<6;k++)box('Stacked firewood',x+w/2+.65,floor+.15+(k%2)*.23,z-1+Math.floor(k/2)*.5,.75,.2,.3,'wood',true,.08*k);
  for(let k=0;k<4;k++)box('Broken croft yard wall',x-w/2-1.2,floor+.25,z-d/2+k*1.05,.55,.5+(k%2)*.25,.85,'stone');
  for(const p of parts.slice(start)) {
    const dx=p.x-x,dz=p.z-z;p.x=x+dx*co+dz*si;p.z=z-dx*si+dz*co;p.rot=(p.rot??0)+rot;
  }
}
const lane=[[-55,-13],[-50,-8],[-43,-4],[-31,-2],[-29,8],[-32,20],[-36,30],[-35,45]];
export const REALM_ROADS = [
  {a:[REALM_GATE.x,REALM_GATE.z],b:lane[0],width:2.8},
  ...lane.slice(1).map((b,i)=>({a:lane[i],b,width:2.1})),
  {a:[-29,8],b:[-17,3],width:1.8},{a:[-17,3],b:[-10,0],width:1.8},
  ...REALM_BUILDINGS.filter(b=>b.id.startsWith('Croft')).map(b=>{
    const door=[b.x+Math.sin(b.rot)*(b.d/2+.8),b.z+Math.cos(b.rot)*(b.d/2+.8)];
    const near=lane.reduce((a,p)=>Math.hypot(p[0]-door[0],p[1]-door[1])<Math.hypot(a[0]-door[0],a[1]-door[1])?p:a);
    return {a:near,b:door,width:1.3};
  }),
];
function inside(x,z,b,margin=0) {
  const dx=x-b.x,dz=z-b.z,co=Math.cos(b.rot??0),si=Math.sin(b.rot??0);
  return Math.abs(dx*co-dz*si)<=b.w/2+margin && Math.abs(dx*si+dz*co)<=b.d/2+margin;
}
function segmentDistance(x,z,a,b) {
  const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);
}
export function realmPath(x,z) {
  let amount=0;
  for(const road of REALM_ROADS)amount=Math.max(amount,Math.max(0,Math.min(1,1-(segmentDistance(x,z,road.a,road.b)-road.width/2)/1.3)));
  return amount;
}
export function realmReserved(x,z,margin=0) {
  if(Math.abs(x-c.x)<c.w/2+margin+1 && Math.abs(z-c.z)<c.d/2+margin+1)return true;
  return REALM_BUILDINGS.some(b=>inside(x,z,b,margin+2));
}
export function realmFloor(x,z) {
  let height=null;
  for(const floor of REALM_FLOORS)if(inside(x,z,floor))height=Math.max(height??-Infinity,floor.y);
  // The gate's approach rises gently from the old road into the court.
  if(Math.abs(x-REALM_GATE.x)<=REALM_GATE.width/2+.000001 && z>=REALM_GATE.z-.1 && z<=REALM_GATE.approachZ){
    height=causewayHeight(x,z,REALM_GATE,f);
  }
  return height;
}
export function realmBlocked(x,z,r=.4) {
  for(const p of parts) {
    if(!p.solid)continue;
    const dx=x-p.x,dz=z-p.z,co=Math.cos(p.rot),si=Math.sin(p.rot);
    const lx=dx*co-dz*si,lz=dx*si+dz*co;
    const ox=Math.max(Math.abs(lx)-p.w/2,0),oz=Math.max(Math.abs(lz)-p.d/2,0);
    if(ox*ox+oz*oz<r*r)return true;
  }
  return false;
}
export function realmPlacements(placements=[]) {
  const kept=[], householdCounts=new Map();
  for(const p of placements) {
    if(/^building_|^wall_/.test(p.kind) || realmReserved(p.x,p.z,2) || realmPath(p.x,p.z)>=.25)continue;
    // Natural features remain in place. Household objects need a household;
    // training equipment belongs at the castle, not across the sacred clearing.
    const equipment=/^(crate|barrel|sack|pallet|bucket|ladder|wheelbarrow|resource_|flag_|target|weaponrack)/.test(p.kind);
    if(equipment) {
      if(Math.hypot(p.x,p.z)<15)continue;
      const military=/^(flag_|target|weaponrack|bucket_arrows)/.test(p.kind);
      const homes=military?[REALM.seat]:REALM_BUILDINGS;
      const home=homes.find(b=>Math.hypot(p.x-b.x,p.z-b.z)<Math.max(b.w,b.d)/2+7);
      if(!home)continue;
      const key=home.id??'castle',limit=military?3:4;
      if((householdCounts.get(key)??0)>=limit)continue;
      if(kept.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<2.5))continue;
      householdCounts.set(key,(householdCounts.get(key)??0)+1);
    }
    kept.push(p);
  }
  return kept;
}
