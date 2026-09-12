/** Fine rock strata and planting follow the same ridge function used for walking. */
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,DoubleSide,
  InstancedMesh,Object3D} from 'three';
import {palaceCliffMask,CLIFF_GROWTH,PALACE_UNDERGROWTH} from '../app/palaceLandscape.js';
import {smoothHeightAt} from '../app/terrain.js';
import {sanctuaryMaterials,earthPalette} from './sanctuaryMaterials.js';
import {fernFrond} from './sanctuaryGrowth3d.js';
import {palaceIvy} from './palaceIvy3d.js';
import {realmFloor,realmBlocked} from '../app/realm.js';

export class PalaceLandscape3D {
  constructor(scene){
    this.group=new Group();this.group.name='Gatehouse weathered cliff and planting';scene.add(this.group);
    const positions=[],uv=[],step=.22;
    const vertex=(x,z)=>[x,smoothHeightAt(x,z)+.025,z];
    const triangle=(a,b,c)=>{positions.push(...a,...b,...c);for(const p of [a,b,c])uv.push(p[0]/3,(p[1]+p[2]*.28)/3);};
    for(let x=-85;x<-58.5;x+=step)for(let z=-43;z<-18;z+=step){
      const m=palaceCliffMask(x+step/2,z+step/2);if(m<.01)continue;
      const a=vertex(x,z),b=vertex(x+step,z),c=vertex(x+step,z+step),d=vertex(x,z+step);
      triangle(a,d,b);triangle(b,d,c);
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const maps=sanctuaryMaterials(),mat=earthPalette(new MeshStandardMaterial({map:maps.rock.color,normalMap:maps.rock.normal,roughnessMap:maps.rock.rough,roughness:1,color:0x99988d}));
    const previous=mat.onBeforeCompile;
    mat.onBeforeCompile=s=>{
      previous(s);s.vertexShader='varying vec3 cliffPoint;varying float cliffUp;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n cliffPoint=position;cliffUp=abs(normal.y);');
      s.fragmentShader='varying vec3 cliffPoint;varying float cliffUp;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float bedding=abs(sin((cliffPoint.y+sin(cliffPoint.x*.7)*.35)*3.7));
        diffuseColor.rgb*=.84+.16*smoothstep(.025,.13,bedding);
        float green=smoothstep(.65,.97,cliffUp)*.6;
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.7,.9,.53),green);
      `);
    };mat.customProgramCacheKey=()=> 'palace-stratified-rock-1';
    const cliff=new Mesh(g,mat);cliff.castShadow=cliff.receiveShadow=true;this.group.add(cliff);
    const growth=[...CLIFF_GROWTH,...PALACE_UNDERGROWTH].filter(p=>!realmBlocked(p.x,p.z,.15));
    const fern=new InstancedMesh(fernFrond(),new MeshStandardMaterial({color:0x728153,roughness:1,side:DoubleSide}),growth.length*3),dummy=new Object3D();
    growth.forEach((p,i)=>{for(let j=0;j<3;j++){
      dummy.position.set(p.x,(realmFloor(p.x,p.z)??smoothHeightAt(p.x,p.z))+.045,p.z);dummy.rotation.set(.1,Math.sin(i*17)*6.28+j*2.09,0);dummy.scale.setScalar(p.scale);dummy.updateMatrix();fern.setMatrixAt(i*3+j,dummy.matrix);
    }});fern.castShadow=fern.receiveShadow=true;this.group.add(fern);
    this.group.add(palaceIvy());
  }
}
