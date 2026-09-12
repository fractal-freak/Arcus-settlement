import {smoothHeightAt} from './terrain.js';
export const CAUSEWAY_IVY=[];
export function causewayHeight(x,z,gate,floor){
  const t=Math.max(0,Math.min(1,(gate.approachZ-z)/(gate.approachZ-gate.z+.1)));
  return smoothHeightAt(x,gate.approachZ)*(1-t)+floor*t;
}
/** A stone bridge carries the unchanged accessible route across a drainage cutting. */
export function buildPalaceCauseway(parts,gate,floor){
  const x=gate.x,start=gate.z-.1,end=gate.approachZ,length=end-start,center=(start+end)/2;
  const height=z=>causewayHeight(x,z,gate,floor),stations=Array.from({length:49},(_,i)=>{const z=start+length*i/48;return {z,y:height(z),left:causewayHeight(x-gate.width/2,z,gate,floor),right:causewayHeight(x+gate.width/2,z,gate,floor)};});
  const add=p=>parts.push({solid:false,rot:0,section:'Jupiter gatehouse',...p});
  const box=(name,x,y,z,w,h,d,material='ashlar',solid=false,rot=0)=>add({shape:'box',name,x,y,z,w,h,d,material,solid,rot});
  add({shape:'causewayDeck',name:'Worn causeway structural deck',x,y:0,z:center,w:gate.width+.7,h:.45,d:length,stations,material:'causewayStone'});
  for(const side of [-1,1]){
    const cx=x+side*3,outline=[];
    for(let i=0;i<3;i++){
      const z=-25.6+i*4.0;
      CAUSEWAY_IVY.push({x:cx+side*.42,y:height(z)+1.04,z,width:1.3,height:1.8+i*.17,seed:130+i+side*4,rot:side*Math.PI/2,hanging:true});
    }
    for(const p of stations)outline.push({u:center-p.z,y:p.y+.04});
    for(const p of [...stations].reverse())outline.push({u:center-p.z,y:Math.min(p.y-.65,smoothHeightAt(cx,p.z)-.2)});
    const arches=[];
    for(const z of [-24.8,-20.6,-16.8]){
      const w=2.65,top=height(z)-.68,base=Math.max(smoothHeightAt(cx,z),smoothHeightAt(cx,z-w*.4),smoothHeightAt(cx,z+w*.4))+.05;
      if(top-base>.85)arches.push({x:center-z,bottom:base,w,h:top-base});
    }
    add({shape:'causewaySide',name:'Causeway arched spandrel',x:cx,y:0,z:center,w:length,h:floor,d:.72,outline,arches,rot:Math.PI/2,material:'ashlar'});
    for(const arch of arches)add({shape:'bridgeArch',name:'Causeway voussoir arch',x:cx+side*.42,y:arch.bottom,z:center-arch.x,w:arch.w,h:arch.h,d:.2,material:'carved',rot:Math.PI/2});
    for(let i=0;i<7;i++){
      const z=start+i*length/6,y=height(z);
      add({shape:'newel',name:'Moss-worn causeway pier cap',x:cx,y,z,w:.73,h:1.22,d:.73,material:'carved',solid:true});
      if(i===6)continue;
      const next=start+(i+1)*length/6,dy=height(next)-y,len=Math.hypot(next-z,dy);
      for(const [raise,width,thickness,material] of [[.22,.56,.36,'ashlar'],[1.03,.36,.21,'carved']])
        add({shape:'beam',name:raise<.5?'Causeway parapet plinth':'Causeway weathered coping',x:cx,y:(y+height(next))/2+raise,z:(z+next)/2,w:width,h:len,d:thickness,material,axis:'x',tilt:Math.acos(dy/len)});
      for(let k=1;k<6;k++){
        const zz=z+(next-z)*k/6;add({shape:'baluster',name:'Causeway carved baluster',x:cx,y:height(zz)+.36,z:zz,w:.21,h:.63,d:.21,material:'carved'});
      }
      add({shape:'box',name:'Causeway parapet collision',x:cx,y,z:(z+next)/2,w:.6,h:1,d:next-z,solid:true,collisionOnly:true});
    }
    // Splayed masonry abutments make a generous, grounded arrival from the village.
    const a={x:cx,z:end-.1},b={x:x+side*4.15,z:end+2.5},dx=b.x-a.x,dz=b.z-a.z;
    const count=5;
    for(let i=0;i<count;i++){
      const t=(i+.5)/count,px=a.x+dx*t,pz=a.z+dz*t,ground=smoothHeightAt(px,pz),h=.75+(1-t)*.35;
      box('Flared bridge abutment',px,ground+h/2-.15,pz,.64,h+.3,Math.hypot(dx,dz)/count+.04,'ashlar',true,Math.atan2(dx,dz));
      box('Abutment limestone cap',px,ground+h+.025,pz,.79,.15,Math.hypot(dx,dz)/count+.10,'carved',false,Math.atan2(dx,dz));
    }
  }
  // Individually laid slabs sit in a continuous mortar bed; slight edge wear stays grounded.
  for(let row=0;row<27;row++)for(let col=0;col<8;col++){
    const z=start+.3+row*(length-.6)/27,xp=x+(col-3.5)*.66;
    const wear=.5+.5*Math.sin(row*17+col*23),h=.10+wear*.025;
    box('Causeway worn paving slab',xp,causewayHeight(xp,z,gate,floor)-h/2+.025,z,.645,h,.56,'causewayStone',false);
    const p=parts.at(-1);p.shape='paver';p.slope=(causewayHeight(xp,z+.1,gate,floor)-causewayHeight(xp,z-.1,gate,floor))/.2;p.wear=wear;
  }
}
