/** Tended offerings and living growth, with all occupied ground in village.js. */
import { Group, Mesh, MeshStandardMaterial, IcosahedronGeometry, CylinderGeometry,
  TorusGeometry, SphereGeometry, TubeGeometry, CatmullRomCurve3, Vector3,
  Raycaster, InstancedMesh, Object3D, Shape, ShapeGeometry, DoubleSide,
  BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Color } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OFFERING } from '../app/village.js';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { sanctuaryMaterials, earthPalette } from './sanctuaryMaterials.js';

export function growStoneVines(rock) {
  const group = new Group(); group.name = 'Old ivy on the Stone'; group.position.copy(rock.position);
  rock.updateMatrixWorld(true);
  const ray = new Raycaster(), tubes = [], leaves = [];
  ray.firstHitOnly = true;
  for (let v = 0; v < 21; v++) {
    const a = v < 5 ? [-.05, .13, .30, 2.83, 3.03][v] : 3.20 + (v - 5) / 16 * 2.82;
    const points = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12, phi = 0.16 + t * 1.58;
      const angle = a + Math.sin(t * 5 + v) * 0.12;
      const direction = new Vector3(Math.cos(angle) * Math.sin(phi), Math.cos(phi), Math.sin(angle) * Math.sin(phi));
      ray.set(direction.clone().multiplyScalar(9).add(rock.position), direction.clone().negate());
      const hit = ray.intersectObject(rock, false)[0];
      if (hit) points.push(hit.point.clone().sub(rock.position).addScaledVector(direction, 0.055));
    }
    if (points.length < 3) continue;
    const curve = new CatmullRomCurve3(points);
    tubes.push(new TubeGeometry(curve, 40, 0.028, 4, false));
    for (let l = 0; l < 23; l++) leaves.push({ p: curve.getPoint((l + 0.3) / 23), seed: v * 23 + l });
  }
  const vine = new Mesh(mergeGeometries(tubes), new MeshStandardMaterial({color:0x4a5130,roughness:1}));
  vine.castShadow = true; group.add(vine); tubes.forEach(g=>g.dispose());
  const shape = new Shape(); shape.moveTo(0,-.5);
  shape.bezierCurveTo(-.65,-.15,-.5,.25,-.2,.16);shape.lineTo(0,.6);
  shape.lineTo(.2,.16);shape.bezierCurveTo(.5,.25,.65,-.15,0,-.5);
  const leafMaterial = new MeshStandardMaterial({color:0x90927b,roughness:.88,side:DoubleSide});
  const mesh = new InstancedMesh(new ShapeGeometry(shape,3),leafMaterial,leaves.length);
  const dummy=new Object3D(),color=new Color();
  leaves.forEach(({p,seed},i)=>{
    dummy.position.copy(p);dummy.rotation.set(hash2(seed,1,50)*2,hash2(seed,2,50)*6.28,hash2(seed,3,50)*6.28);
    const size=.20+hash2(seed,4,50)*.23;dummy.scale.setScalar(size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    mesh.setColorAt(i,color.setHSL(.18+hash2(seed,5,50)*.07,.20,.32+hash2(seed,6,50)*.15));
  });mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  return group;
}

export function makeSanctuaryRitual() {
  const group=new Group(); group.name='Tended offerings and incense';
  group.position.set(OFFERING.x,smoothHeightAt(OFFERING.x,OFFERING.z),OFFERING.z);
  const maps=sanctuaryMaterials();
  const stone=new MeshStandardMaterial({map:maps.moss.color,normalMap:maps.moss.normal,roughness:1,color:0xc4c1ab});
  earthPalette(stone, true);
  const bronze=new MeshStandardMaterial({color:0x695136,metalness:.65,roughness:.7});
  const ash=new MeshStandardMaterial({color:0x5a5044,roughness:1});
  const slab=new Mesh(new IcosahedronGeometry(1,2),stone);
  slab.scale.set(1.0,.28,.68);slab.position.y=.25;slab.castShadow=true;slab.receiveShadow=true;group.add(slab);
  const bowl=new Mesh(new SphereGeometry(.28,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2),bronze);
  bowl.position.set(0,.73,0);bowl.castShadow=true;group.add(bowl);
  const rim=new Mesh(new TorusGeometry(.28,.024,6,32),bronze);rim.rotation.x=Math.PI/2;rim.position.set(0,.73,0);group.add(rim);
  const fill=new Mesh(new CylinderGeometry(.25,.25,.015,24),ash);fill.position.set(0,.68,0);group.add(fill);
  const ember=new MeshStandardMaterial({color:0xc95719,emissive:0xc33d0a,emissiveIntensity:1.2,roughness:1});
  for(let i=0;i<5;i++) {
    const a=i*2.4,r=.06+i*.02;
    const stick=new Mesh(new CylinderGeometry(.008,.013,.4,5),ash);
    stick.position.set(Math.cos(a)*r,.87,Math.sin(a)*r);stick.rotation.z=(i-2)*.09;group.add(stick);
    const tip=new Mesh(new SphereGeometry(.014,6,4),ember);tip.position.copy(stick.position);tip.position.y+=.2;group.add(tip);
  }
  // Small offerings laid by hand: grain on one side, flowers on the other.
  const grainMat=new MeshStandardMaterial({color:0xb6a06a,roughness:1});
  const grains=new InstancedMesh(new IcosahedronGeometry(.033,1),grainMat,28),dummy=new Object3D();
  for(let i=0;i<28;i++){dummy.position.set(-.48+(hash2(i,3,810)-.5)*.23,.48+hash2(i,4,810)*.04,(hash2(i,5,810)-.5)*.23);dummy.scale.set(.6,.5,1.3);dummy.rotation.y=i;dummy.updateMatrix();grains.setMatrixAt(i,dummy.matrix);}group.add(grains);
  const petalMat=new MeshStandardMaterial({color:0xc8b9cc,roughness:.9});
  for(let i=0;i<7;i++) {
    const flower=new Mesh(new IcosahedronGeometry(.075,1),petalMat);
    flower.scale.set(1,.35,1);flower.position.set(.4+hash2(i,1,815)*.25,.48,hash2(i,2,815)*.27-.13);group.add(flower);
  }
  const smokeGeometry=new BufferGeometry();
  smokeGeometry.setAttribute('position',new Float32BufferAttribute(new Float32Array(64*3),3));
  smokeGeometry.setAttribute('phase',new Float32BufferAttribute(Array.from({length:64},(_,i)=>i/64),1));
  const smokeMaterial=new ShaderMaterial({transparent:true,depthWrite:false,
    uniforms:{time:{value:0}},
    vertexShader:`uniform float time; attribute float phase; varying float life;
      void main(){life=fract(phase+time*.09); float h=life*2.7;
        vec3 p=position+vec3(sin(life*7.+time*.3)*h*.15+sin(life*17.+phase*9.)*.035,1.1+h,cos(life*6.+time*.23)*h*.09);
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp((.11+life*.6)*550./-mv.z,1.,64.);}`,
    fragmentShader:`varying float life; void main(){float r=length(gl_PointCoord-.5)*2.;
      float alpha=exp(-r*r*4.)*(1.-smoothstep(.55,1.,r))*sin(life*3.14159)*.075;
      gl_FragColor=vec4(.76,.78,.76,alpha);}`});
  const smoke=new Points(smokeGeometry,smokeMaterial);smoke.frustumCulled=false;group.add(smoke);
  return {group,tick(t){smokeMaterial.uniforms.time.value=t;ember.emissiveIntensity=1.1+Math.sin(t*1.3)*.15;}};
}
