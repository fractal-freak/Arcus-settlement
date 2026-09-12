import {masonryGeometry,traceryGeometry,flyingGeometry,slateSpireGeometry} from './palaceKit.js';
/** Draw the shared architecture, including the open doorways and furnished interiors. */
import { Group, Mesh, BoxGeometry, BufferGeometry, Float32BufferAttribute,
  MeshStandardMaterial, TextureLoader, RepeatWrapping, SRGBColorSpace, DoubleSide, CanvasTexture, Vector2, SphereGeometry, ConeGeometry, LatheGeometry, IcosahedronGeometry, Shape, Path, ExtrudeGeometry } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REALM, REALM_PARTS } from '../app/realm.js';
import { makeGroundSurface } from './groundSurface.js';
import { Gatehouse3D } from './gatehouse3d.js';
import { PalaceLandscape3D } from './palaceLandscape3d.js';
import { ruinedTowerGeometry } from './ruinedTower3d.js';
import {weatherPalaceMaterial} from './palaceWeathering.js';
import {slateGableGeometry} from './slateGable.js';

function strawTexture() {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#776448';ctx.fillRect(0,0,256,256);
  let seed=12345;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<3600;i++){
    const x=rand()*256,y=rand()*256,v=75+Math.floor(rand()*85);
    ctx.strokeStyle=`rgb(${v+23},${v+10},${v-16})`;ctx.lineWidth=.5+rand();
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand()*3-1.5,y+8+rand()*25);ctx.stroke();
  }
  const texture=new CanvasTexture(canvas);texture.wrapS=texture.wrapT=RepeatWrapping;texture.colorSpace=SRGBColorSpace;return texture;
}
function materials() {
  const loader=new TextureLoader();
  const load=(name,channel)=>{
    const t=loader.load(`${import.meta.env.BASE_URL}assets/village-materials/${name}_${channel}_1k.jpg`);
    t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;
    if(channel==='diff')t.colorSpace=SRGBColorSpace;return t;
  };
  const stone=load('medieval_blocks_03','diff'),stoneBump=load('medieval_blocks_03','disp');
  const wood=load('medieval_wood','diff'),woodBump=load('medieval_wood','disp'),grain=makeGroundSurface(),straw=strawTexture();
  const pbr=channel=>{
    const t=loader.load(`${import.meta.env.BASE_URL}assets/palace-pbr/optimized/mossy_stone_wall_${channel}_2k.webp`);
    t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;if(channel==='diff')t.colorSpace=SRGBColorSpace;return t;
  };
  const scanned={map:pbr('diff'),normalMap:pbr('nor_gl'),normalScale:new Vector2(.7,.7),roughnessMap:pbr('rough'),aoMap:pbr('ao'),aoMapIntensity:.65,displacementMap:pbr('disp'),displacementScale:.022,displacementBias:-.011};
  const palaceStone=new MeshStandardMaterial({...scanned,roughness:1,color:0xffffff,envMapIntensity:.55});
  palaceStone.onBeforeCompile=shader=>{
    shader.vertexShader='varying float stoneElevation;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n stoneElevation=(modelMatrix*vec4(position,1.)).y;');
    shader.fragmentShader='varying float stoneElevation;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float luma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      vec3 limestone=vec3(.38,.36,.31)*(.32+sqrt(luma)*.95);
      float damp=(1.-smoothstep(11.,16.,stoneElevation))*.75+(1.-smoothstep(.025,.08,luma))*.3;
      diffuseColor.rgb=mix(limestone,diffuseColor.rgb,clamp(.18+damp*.8,0.,.85));
    `);
  };
  palaceStone.customProgramCacheKey=()=> 'jupiter-limestone-moss-v1';
  const result={
    stone:palaceStone,
    ruinStone:new MeshStandardMaterial({map:stone,bumpMap:stoneBump,bumpScale:.065,roughness:1,color:0xe0e0d2,side:DoubleSide}),
    rock:new MeshStandardMaterial({...scanned,color:0xaca99a,roughness:1,displacementScale:.055}),
    trim:new MeshStandardMaterial({map:stone,bumpMap:stoneBump,bumpScale:.04,roughness:.96,color:0xfff4dc}),
    floor:new MeshStandardMaterial({map:stone,bumpMap:stoneBump,bumpScale:.035,roughness:1,color:0xaaa397}),
    wood:new MeshStandardMaterial({map:wood,bumpMap:woodBump,bumpScale:.035,roughness:.92,color:0xb6a99a,side:DoubleSide}),
    plaster:new MeshStandardMaterial({map:grain,bumpMap:grain,bumpScale:.055,roughness:1,color:0xc7baa0,side:DoubleSide}),
    roof:new MeshStandardMaterial({map:grain,bumpMap:grain,bumpScale:.065,roughness:.94,color:0x404b55,side:DoubleSide}),
    slate:new MeshStandardMaterial({map:grain,bumpMap:grain,bumpScale:.025,roughness:.9,color:0x586169,vertexColors:true,side:DoubleSide}),
    thatch:new MeshStandardMaterial({map:straw,bumpMap:straw,bumpScale:.09,roughness:1,color:0xc4b68e,side:DoubleSide}),
    window:new MeshStandardMaterial({color:0x344954,roughness:.12,metalness:.2,envMapIntensity:1.4}),
    foliage:new MeshStandardMaterial({color:0x567746,roughness:1}),
    cloth:new MeshStandardMaterial({color:0x522424,roughness:1,side:DoubleSide}),
    gold:new MeshStandardMaterial({color:0xb49c61,roughness:.4,metalness:.65}),
  };
  weatherPalaceMaterial(result.ruinStone,.95);weatherPalaceMaterial(result.stone,.73);weatherPalaceMaterial(result.trim,.67);return result;
}
function roof(p) {
  const points=[],lengths=12,courses=7;
  const vertex=(side,u,v)=>{
    const sag=(p.sag??0)*Math.sin(v*Math.PI);
    return [p.x+side*p.w/2*u,p.y+p.h*(1-u)-sag+Math.sin(v*37+u*11)*.035,p.z+(v-.5)*p.d];
  };
  for(const side of p.half?[-1]:[-1,1])for(let row=0;row<courses;row++)for(let j=0;j<lengths;j++) {
    if(p.damaged && side===1 && row<3 && j>7 && j<10)continue;
    const a=vertex(side,row/courses,j/lengths),b=vertex(side,(row+1)/courses,j/lengths),
      c=vertex(side,(row+1)/courses,(j+1)/lengths),d=vertex(side,row/courses,(j+1)/lengths);
    points.push(...a,...b,...d,...b,...c,...d);
    points.push(...b,...c,c[0],c[1]-.035,c[2],...b,c[0],c[1]-.035,c[2],b[0],b[1]-.035,b[2]);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.computeVertexNormals();return g;
}
function carvedArch(p) {
  const r=p.w/2,t=p.thickness,shape=new Shape();
  shape.moveTo(-r-t,0);
  shape.quadraticCurveTo(-r-t,p.h*.6,0,p.h+t);
  shape.quadraticCurveTo(r+t,p.h*.6,r+t,0);
  shape.lineTo(r,0);
  shape.quadraticCurveTo(r,p.h*.56,0,p.h);
  shape.quadraticCurveTo(-r,p.h*.56,-r,0);
  shape.closePath();
  const g=new ExtrudeGeometry(shape,{depth:p.d,bevelEnabled:true,bevelSize:.045,bevelThickness:.045,bevelSegments:3,curveSegments:24});
  g.translate(p.x,p.y,p.z-p.d/2);return g;
}
function carvedRing(p) {
  const shape=new Shape(),hole=new Path(),r=p.w/2;
  shape.absarc(0,0,r,0,Math.PI*2,false);
  hole.absarc(0,0,r-p.thickness,0,Math.PI*2,true);shape.holes.push(hole);
  const g=new ExtrudeGeometry(shape,{depth:p.h,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:32});
  g.rotateX(-Math.PI/2);g.translate(p.x,p.y,p.z);return g;
}
function uvFor(geo) {
  const p=geo.attributes.position,n=geo.attributes.normal,uv=[];
  for(let i=0;i<p.count;i++) {
    const x=Math.abs(n.getX(i)),y=Math.abs(n.getY(i)),z=Math.abs(n.getZ(i));
    uv.push((y>Math.max(x,z)?p.getX(i):x>z?p.getZ(i):p.getX(i))/2,
      (y>Math.max(x,z)?p.getZ(i):p.getY(i))/2);
  }
  geo.setAttribute('uv',new Float32BufferAttribute(uv,2));geo.setAttribute('uv1',geo.attributes.uv.clone());return geo;
}
export class Realm3D {
  constructor(scene) {
    this.group=new Group();this.group.name=REALM.name;scene.add(this.group);
    const mats=materials(),batches=new Map();
    for(const p of REALM_PARTS) {
      if(p.section==='Jupiter gatehouse'||p.collisionOnly)continue;
      let g;
      if(p.shape==='ruinedDrum')g=ruinedTowerGeometry(p);
      else if(p.shape==='slateGable')g=slateGableGeometry(p);
      else if(p.shape==='roof')g=roof(p);
      else if(p.shape==='orb'){g=new SphereGeometry(1,20,12).toNonIndexed();g.scale(p.w/2,p.h/2,p.d/2);g.translate(p.x,p.y,p.z);}
      else if(p.shape==='crag') {
        g=new IcosahedronGeometry(1,3);
        const vertices=g.attributes.position;
        for(let i=0;i<vertices.count;i++){
          const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),wear=1+.13*Math.sin(x*7+y*4+z*8);
          vertices.setXYZ(i,x*wear,y*(1+.06*Math.sin(z*9+x*6)),z*wear);
        }
        g.computeVertexNormals();
        g.scale(p.w/2,p.h/2,p.d/2);g.translate(p.x,p.y+p.h/2,p.z);
      }
      else if(p.shape==='tracery')g=traceryGeometry(p);
      else if(p.shape==='flying')g=flyingGeometry(p);
      else if(p.shape==='arch')g=carvedArch(p);
      else if(p.shape==='ring')g=carvedRing(p);
      else if(p.shape==='spire') {
        if(p.material==='roof') {
          g=slateSpireGeometry(p);
        }else{g=new ConeGeometry(p.w/2,p.h,12).toNonIndexed();g.translate(p.x,p.y+p.h/2,p.z);}
      }
      else if(p.shape==='gable') {
        g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([
          p.x-p.w/2,p.y,p.z,p.x+p.w/2,p.y,p.z,p.x,p.y+p.h,p.z],3));g.computeVertexNormals();
      }
      else {
        g=p.material==='stone' && p.h>.8 && Math.max(p.w,p.d)>.7 ? masonryGeometry(p) : new RoundedBoxGeometry(p.w,p.h,p.d,1,Math.min(.045,p.w*.12,p.h*.12,p.d*.12));
        g.rotateY(p.rot??0);g.translate(p.x,p.y,p.z);
      }
      if(p.shape!=='box' && p.rot){g.translate(-p.x,0,-p.z);g.rotateY(p.rot);g.translate(p.x,0,p.z);}
      uvFor(g);
      // Local batches retain exact geometry while allowing offscreen buildings to cull.
      const cell=`${p.material}:${Math.floor(p.x/24)},${Math.floor(p.z/24)}`;
      if(!batches.has(cell))batches.set(cell,{ material:p.material, geometries:[] });
      batches.get(cell).geometries.push(g);
    }
    for(const {material:key,geometries} of batches.values()) {
      const mesh=new Mesh(mergeGeometries(geometries),mats[key]);mesh.name=`${REALM.name} ${key}`;
      mesh.castShadow=true;mesh.receiveShadow=true;this.group.add(mesh);geometries.forEach(g=>g.dispose());
    }
    this.gatehouse=new Gatehouse3D(this.group);
    this.landscape=new PalaceLandscape3D(this.group);
  }
}
