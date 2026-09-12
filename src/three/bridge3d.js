/** Masonry crossing built directly from the same profile that supports feet. */
import { Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { BRIDGE, bridgeDeckHeight, bridgeCopingRise } from '../app/bridge.js';
import { WATER_LEVEL, STEP } from '../app/terrain.js';
import { ageBridge } from './bridgeAging3d.js';
import { earthPalette } from './sanctuaryMaterials.js';
import { villageStoneMaps } from './villageMaterials.js';

export function buildBridge(){
  const group=new Group();group.name='Stone river crossing';
  if(!BRIDGE)return group;
  const b=BRIDGE,span=b.to-b.from,dx=span/b.segments;
  const maps=villageStoneMaps();
  const batches=Array.from({length:4},()=>({positions:[],uvs:[]}));
  const materials=[0xb9b3a4,0xa5a08f,0xc4beaf,0x777569].map(color=>earthPalette(new MeshStandardMaterial({
    color,map:maps.stone,bumpMap:maps.stoneHeight,bumpScale:.035,roughness:.96,
  })));
  function quad(batch,a,c,d,e){
    const out=batches[batch];
    for(const point of [a,c,d,a,d,e])out.positions.push(...point);
    const u=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],v=[e[0]-a[0],e[1]-a[1],e[2]-a[2]];
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]].map(Math.abs);
    for(const p of [a,c,d,a,d,e])out.uvs.push(...(n[1]>Math.max(n[0],n[2])?[p[0]*.5,p[2]*.5]:n[0]>n[2]?[p[2]*.5,p[1]*.5]:[p[0]*.5,p[1]*.5]));
  }
  function block(batch,x0,x1,z0,z1,top,bottom){
    const a=[x0,bottom(x0,z0),z0],c=[x1,bottom(x1,z0),z0],d=[x1,bottom(x1,z1),z1],e=[x0,bottom(x0,z1),z1];
    const A=[x0,top(x0,z0),z0],C=[x1,top(x1,z0),z0],D=[x1,top(x1,z1),z1],E=[x0,top(x0,z1),z1];
    quad(batch,A,E,D,C);quad(batch,a,c,d,e);quad(batch,a,A,C,c);
    quad(batch,c,C,D,d);quad(batch,d,D,E,e);quad(batch,e,E,A,a);
  }
  const floor=(x,z)=>bridgeDeckHeight(x,z);
  const soffit=x=>{
    const t=(x-b.from)/span;
    return WATER_LEVEL+STEP*.5-.65+1.45*Math.sqrt(Math.max(0,1-(2*t-1)**2));
  };
  for(let i=0;i<b.segments;i++){
    const x0=b.from+i*dx,x1=x0+dx,cap=bridgeCopingRise((x0+x1)/2);
    // Continuous load-bearing arch, including its curved underside and abutments.
    block(3,x0,x1,b.z-b.width/2,b.z+b.width/2,(x,z)=>floor(x,z)-.18,soffit);
    for(let lane=0;lane<4;lane++){
      const z0=b.z-b.walkHalf+lane*b.walkHalf/2,z1=z0+b.walkHalf/2;
      block((i+lane)%3,x0+.007,x1-.007,z0+.008,z1-.008,floor,(x,z)=>floor(x,z)-.2);
    }
    for(const sign of [-1,1]){
      const z0=b.z+(sign>0?b.walkHalf:-b.width/2),z1=b.z+(sign>0?b.width/2:-b.walkHalf);
      // Mortared parapet courses and projecting, individually jointed coping stones.
      for(let row=0;row<3;row++)block((i+row)%3,x0+.006,x1-.006,z0,z1,
        (x,z)=>floor(x,z)+Math.min((row+1)*.23,cap-.11),(x,z)=>floor(x,z)+row*.23+.012);
      block(2,x0+.006,x1-.006,z0-(sign<0?.035:0),z1+(sign>0?.035:0),
        (x,z)=>floor(x,z)+cap,(x,z)=>floor(x,z)+cap-.11);
    }
  }
  batches.forEach((batch,i)=>{
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(batch.positions,3));
    geometry.setAttribute('uv',new Float32BufferAttribute(batch.uvs,2));
    geometry.computeVertexNormals();
    const mesh=new Mesh(geometry,materials[i]);mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.name=i===3?'Bridge arch barrel':'Bridge paving and parapets';group.add(mesh);
  });
  const growth=ageBridge();group.add(growth);group.userData.bridgeTick=growth.userData.bridgeTick;
  return group;
}
