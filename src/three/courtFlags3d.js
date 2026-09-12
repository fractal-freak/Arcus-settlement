/** Low, bevelled limestone flags. Positions come entirely from the court plan. */
import {BufferGeometry,Float32BufferAttribute,Mesh,MeshStandardMaterial,Vector2} from 'three';
import {COURT_FLAGS} from '../app/sanctuary.js';
import {smoothHeightAt} from '../app/terrain.js';
import {sanctuaryMaterials} from './sanctuaryMaterials.js';
export function makeCourtFlags(){
 const position=[],uv=[],color=[];
 const tri=(a,b,c,tone)=>{for(const p of [a,b,c]){position.push(...p);uv.push(p[0]*.35,p[2]*.35);color.push(tone,tone*.97,tone*.88);}};
 for(const f of COURT_FLAGS){
  const center=f.points.reduce((p,q)=>({x:p.x+q.x/4,z:p.z+q.z/4}),{x:0,z:0});
  const rim=f.points.map(p=>[p.x,smoothHeightAt(p.x,p.z)+.012,p.z]);
  const top=f.points.map(p=>{const x=center.x+(p.x-center.x)*.92,z=center.z+(p.z-center.z)*.92;return[x,smoothHeightAt(x,z)+.045,z];});
  tri(top[0],top[2],top[1],f.tone);tri(top[0],top[3],top[2],f.tone);
  for(let i=0;i<4;i++){const j=(i+1)%4;tri(rim[i],top[j],top[i],f.tone*.94);tri(rim[i],rim[j],top[j],f.tone*.94);}
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(position,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setAttribute('color',new Float32BufferAttribute(color,3));g.computeVertexNormals();
 const maps=sanctuaryMaterials();
 const mesh=new Mesh(g,new MeshStandardMaterial({map:maps.rock.color,normalMap:maps.rock.normal,normalScale:new Vector2(.22,.22),color:0xe1dcca,vertexColors:true,roughness:.95}));
 mesh.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))),.82);');};
 mesh.name='Laid limestone around the settlement stone';mesh.receiveShadow=true;return mesh;
}
