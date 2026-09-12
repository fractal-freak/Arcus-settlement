/** Laid stone follows the ground; low verge planting frames the shared clear lane. */
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,Vector2,InstancedMesh,Object3D,Color,DoubleSide} from 'three';
import {APPROACH_SLABS,APPROACH_GROWTH,approachPoint} from '../app/jupiterApproach.js';
import {smoothHeightAt} from '../app/terrain.js';
import {sanctuaryMaterials,earthPalette} from './sanctuaryMaterials.js';
import {fernFrond} from './sanctuaryGrowth3d.js';
export function approachSlabGeometry(slabs=APPROACH_SLABS){
 const vertices=[],uv=[],colors=[];
 const triangle=(a,b,c,tone)=>{vertices.push(...a,...c,...b);for(const p of [a,c,b]){uv.push(p[0]/1.6,p[2]/1.6);colors.push(tone,tone*.985,tone*.94);}};
 for(const s of slabs){
  const local=[[-.5,-.37],[-.39,-.5],[.39,-.5],[.5,-.38],[.5,.37],[.37,.5],[-.39,.5],[-.5,.38]];
  const at=(u,v,raise)=>{const {x,z}=approachPoint(s.along+v*s.depth,s.offset+u*s.width);return[x,smoothHeightAt(x,z)+raise,z];};
  const center=at(0,0,.033),upper=local.map(([u,v])=>at(u*.95,v*.95,.025)),lower=local.map(([u,v])=>at(u,v,.004));
  for(let i=0;i<8;i++){const j=(i+1)%8;triangle(center,upper[j],upper[i],s.tone);triangle(upper[i],upper[j],lower[j],s.tone*.82);triangle(upper[i],lower[j],lower[i],s.tone*.82);}
 }
 const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}
export function jupiterApproach(){
 const group=new Group();group.name='Worn processional lane to Jupiter';
 const maps=sanctuaryMaterials();
 const stone=earthPalette(new MeshStandardMaterial({map:maps.rock.color,normalMap:maps.rock.normal,normalScale:new Vector2(.35,.35),roughnessMap:maps.rock.rough,roughness:1,color:0xb8b4a5,vertexColors:true}));
 const paving=new Mesh(approachSlabGeometry(),stone);paving.receiveShadow=true;group.add(paving);
 const plants=APPROACH_GROWTH;
 const fern=new InstancedMesh(fernFrond(),new MeshStandardMaterial({color:0x8d986e,roughness:1,side:DoubleSide}),plants.length*5),dummy=new Object3D(),color=new Color();
 plants.forEach((p,i)=>{for(let k=0;k<5;k++){
  dummy.position.set(p.x,smoothHeightAt(p.x,p.z)+.02,p.z);dummy.rotation.set(0,p.seed+k*1.256,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();fern.setMatrixAt(i*5+k,dummy.matrix);fern.setColorAt(i*5+k,color.setHSL(.20+(i%4)*.007,.22,.36+(i%5)*.025));
 }});fern.receiveShadow=true;group.add(fern);return group;
}
