/** Original growth, fractured paving and fireflies, using existing CC0 stone scans. */
import { Group, Mesh, InstancedMesh, Object3D, Color, MeshStandardMaterial, IcosahedronGeometry,
  BufferGeometry, Float32BufferAttribute, DoubleSide, TubeGeometry, CatmullRomCurve3, Vector3,
  Points, ShaderMaterial, AdditiveBlending } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fernFrond } from './sanctuaryGrowth3d.js';
import { makeFieldstones } from './fieldstones3d.js';
import { PATH_STONES, PATH_GROWTH } from '../app/ancientPaths.js';
import { BRIDGE, BRIDGE_PATHS, bridgeDeckHeight, bridgeCopingRise } from '../app/bridge.js';
import { smoothHeightAt, hash2, isWater } from '../app/terrain.js';
import { sanctuaryMaterials, earthPalette } from './sanctuaryMaterials.js';

export function ageBridge(){
  const group=new Group();group.name='Old bridge gardens and lantern insects';
  const b=BRIDGE,maps=sanctuaryMaterials(),dummy=new Object3D(),color=new Color();
  const rand=(i,s=0)=>hash2(i,s,1703);
  const paving=makeFieldstones(PATH_STONES);paving.name='Ancient paths matching the court';group.add(paving);

  const mossLocations=[];
  for(let i=0;i<130;i++){
    const x=b.from+rand(i,5)*(b.to-b.from),sign=i%2?1:-1,z=b.z+sign*(1.20+rand(i,6)*.45);
    const wall=Math.abs(z-b.z)>b.walkHalf;
    mossLocations.push({x,z,y:bridgeDeckHeight(x,z)+(wall?bridgeCopingRise(x):.018),scale:.12+rand(i,7)*.28});
  }
  for(const p of PATH_GROWTH)mossLocations.push({...p,y:smoothHeightAt(p.x,p.z)+.01});
  const moss=new InstancedMesh(new IcosahedronGeometry(1,1),earthPalette(new MeshStandardMaterial({map:maps.moss.color,roughness:1,color:0xa0ae83}),true),mossLocations.length);
  mossLocations.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,rand(i,8)*6.28,0);dummy.scale.set(p.scale,.028,p.scale*.65);dummy.updateMatrix();moss.setMatrixAt(i,dummy.matrix);});
  moss.receiveShadow=true;group.add(moss);
  const ferns=new InstancedMesh(fernFrond(),new MeshStandardMaterial({color:0x879172,roughness:1,side:DoubleSide}),PATH_GROWTH.length*3);
  PATH_GROWTH.forEach((p,i)=>{
    for(let k=0;k<3;k++){
      dummy.position.set(p.x,smoothHeightAt(p.x,p.z)+.015,p.z);dummy.rotation.set(0,rand(i,60)*6.28+k*2.1,0);
      dummy.scale.setScalar(.22+p.scale*.6);dummy.updateMatrix();ferns.setMatrixAt(i*3+k,dummy.matrix);
    }
  });ferns.receiveShadow=true;group.add(ferns);


  const stems=[],leaves=[],leafColors=[];
  for(let vine=0;vine<26;vine++){
    const x=b.from+.5+rand(vine,20)*(b.to-b.from-1),sign=vine%2?1:-1;
    const z=b.z+sign*(b.width/2+.045),top=bridgeDeckHeight(x,z)+bridgeCopingRise(x)-.015;
    const length=.55+rand(vine,21)*1.35,points=[];
    for(let k=0;k<9;k++){
      const t=k/8,px=x+Math.sin(t*5+vine)*.15,py=top-t*length,pz=z+Math.sin(t*4)*sign*.075;
      points.push(new Vector3(px,py,pz));
      for(const side of [-1,1]){
        const size=.09+rand(vine*19+k,22)*.08;
        const a=[px,py,pz],tip=[px+side*size,py-size*.55,pz+sign*.025];
        const l=[px+side*size*.4,py+size*.27,pz+sign*.065],r=[px+side*size*.55,py-size*.7,pz+sign*.045];
        leaves.push(...a,...l,...tip,...a,...tip,...r);
        color.setHex(k%3===0?0x6c7950:0x435b37).multiplyScalar(.85+rand(vine+k,23)*.3);
        for(let j=0;j<6;j++)leafColors.push(color.r,color.g,color.b);
      }
    }
    stems.push(new TubeGeometry(new CatmullRomCurve3(points),16,.009,4,false));
  }
  const stemMesh=new Mesh(mergeGeometries(stems),new MeshStandardMaterial({color:0x514631,roughness:1}));stems.forEach(g=>g.dispose());group.add(stemMesh);
  const leafGeo=new BufferGeometry();leafGeo.setAttribute('position',new Float32BufferAttribute(leaves,3));leafGeo.setAttribute('color',new Float32BufferAttribute(leafColors,3));leafGeo.computeVertexNormals();
  const leafMesh=new Mesh(leafGeo,new MeshStandardMaterial({vertexColors:true,roughness:1,side:DoubleSide}));leafMesh.castShadow=leafMesh.receiveShadow=true;group.add(leafMesh);

  const cracks=[];
  function fracture(x,z,dx,dz,seed){
    let previous=[x,z];
    for(let k=1;k<=6;k++){
      const t=k/6,next=[x+dx*t+(rand(seed+k,30)-.5)*.065,z+dz*t+(rand(seed+k,31)-.5)*.045];
      const width=.007+rand(seed+k,32)*.009;
      const point=(p,o)=>[p[0]+o,bridgeDeckHeight(p[0]+o,p[1])+.003,p[1]];
      cracks.push(...point(previous,-width),...point(next,-width),...point(next,width),...point(previous,-width),...point(next,width),...point(previous,width));
      previous=next;
    }
  }
  for(let i=0;i<34;i++){
    const x=b.from+.5+rand(i,33)*(b.to-b.from-1),z=b.z-.9+rand(i,34)*1.3;
    fracture(x,z,(rand(i,35)-.5)*.35,.35+rand(i,36)*.4,i*10);
    if(i%3===0)fracture(x,z+.2,-.19,.22,i*17);
  }
  const crackGeo=new BufferGeometry();crackGeo.setAttribute('position',new Float32BufferAttribute(cracks,3));crackGeo.computeVertexNormals();
  const crackMesh=new Mesh(crackGeo,new MeshStandardMaterial({color:0x24251e,roughness:1,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));group.add(crackMesh);

  const anchors=[],seeds=[];
  for(let i=0;i<42;i++){const x=b.from+rand(i,40)*(b.to-b.from),z=b.z+(rand(i,41)-.5)*4.4;anchors.push(x,bridgeDeckHeight(x,z)+.65+rand(i,42)*1.3,z);seeds.push(rand(i,43)*6.28);}
  const bugsGeo=new BufferGeometry();bugsGeo.setAttribute('position',new Float32BufferAttribute(anchors,3));bugsGeo.setAttribute('phase',new Float32BufferAttribute(seeds,1));
  const bugsMat=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{time:{value:0}},
    vertexShader:`attribute float phase; uniform float time; varying float glow; varying float hue;
      void main(){vec3 p=position+vec3(sin(time*.7+phase)*.4,sin(time*1.1+phase*2.)*.22,cos(time*.8+phase)*.3);
      vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;gl_PointSize=clamp(70./-view.z,3.,10.);
      glow=.35+.65*pow(.5+.5*sin(time*2.+phase),2.);hue=phase/6.28;}`,
    fragmentShader:`varying float glow; varying float hue; void main(){float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
      vec3 tint=mix(vec3(.35,.9,.7),vec3(1.,.85,.35),step(.45,hue));gl_FragColor=vec4(tint,(pow(1.-r,2.)+.6*exp(-r*r*40.))*glow);}`});
  const bugs=new Points(bugsGeo,bugsMat);bugs.name='Bridge fireflies';bugs.frustumCulled=false;group.add(bugs);
  group.userData.bridgeTick=time=>{bugsMat.uniforms.time.value=time;};
  return group;
}
