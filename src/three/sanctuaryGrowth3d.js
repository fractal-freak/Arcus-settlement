/** Soft growth in the rock's crevices and the old court's missing stones. */
import { Group, BufferGeometry, Float32BufferAttribute, InstancedMesh,
  MeshStandardMaterial, Object3D, Color, DoubleSide, IcosahedronGeometry } from 'three';
import { COURT_GROWTH } from '../app/sanctuary.js';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { sanctuaryMaterials, earthPalette } from './sanctuaryMaterials.js';

export function fernFrond() {
  const vertices=[];
  const triangle=(a,b,c)=>vertices.push(...a,...b,...c);
  const point=t=>[t*.43,Math.sin(t*Math.PI*.85)*.36,0];
  for(let j=0;j<9;j++) {
    const t=.08+j*.095, p=point(t), next=point(t+.10);
    triangle([p[0],p[1],-.006],[p[0],p[1],.006],[next[0],next[1],0]);
    for(const side of [-1,1]) {
      const length=(1-t)*.135+.014;
      const root=[p[0],p[1],0], tip=[p[0]+.08,p[1]+.02,side*length];
      const left=[p[0]+.008,p[1]+.015,side*length*.6];
      const right=[p[0]+.065,p[1]+.025,side*length*.44];
      triangle(root,left,tip);triangle(root,tip,right);
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}

export function growCourtPlants() {
  const group=new Group();group.name='Ferns and ground cover at the Stone';
  const fern=new InstancedMesh(fernFrond(),new MeshStandardMaterial({color:0xb1b4a0,roughness:.94,side:DoubleSide}),COURT_GROWTH.length*6);
  const cover=new InstancedMesh(new IcosahedronGeometry(1,2),new MeshStandardMaterial({
    map:sanctuaryMaterials().moss.color,roughness:1,color:0x969b80}),COURT_GROWTH.length);
  earthPalette(cover.material, true);
  const dummy=new Object3D(),color=new Color();let instance=0;
  COURT_GROWTH.forEach((p,i)=>{
    const y=smoothHeightAt(p.x,p.z);
    dummy.position.set(p.x,y+.045,p.z);dummy.rotation.set(0,p.seed,0);
    dummy.scale.set(p.scale*.20,p.scale*.09,p.scale*.24);dummy.updateMatrix();cover.setMatrixAt(i,dummy.matrix);
    cover.setColorAt(i,color.setScalar(.72+hash2(p.seed,8,925)*.4));
    for(let f=0;f<6;f++) {
      const yaw=f/6*Math.PI*2+hash2(p.seed,1,925)*6.28;
      dummy.position.set(p.x,y+.035,p.z);
      dummy.rotation.set((hash2(p.seed+f,2,925)-.5)*.22,yaw,(hash2(p.seed+f,3,925)-.5)*.15);
      const size=p.scale*(.75+hash2(p.seed+f,4,925)*.4);
      dummy.scale.setScalar(size);dummy.updateMatrix();fern.setMatrixAt(instance,dummy.matrix);
      color.setHSL(.18+hash2(p.seed+f,5,925)*.065,.16+hash2(p.seed,6,925)*.12,.32+hash2(p.seed+f,7,925)*.13);
      fern.setColorAt(instance++,color);
    }
  });
  for(const m of [fern,cover]){m.instanceMatrix.needsUpdate=true;m.instanceColor.needsUpdate=true;m.receiveShadow=true;m.castShadow=true;group.add(m);}
  // Windblown old leaves collect among the sheltered roots and fern patches.
  const leafGeometry=new BufferGeometry();
  leafGeometry.setAttribute('position',new Float32BufferAttribute([
    -.055,0,0, 0,.008,-.035, .065,0,0,
    -.055,0,0, .065,0,0, 0,.006,.035,
  ],3));leafGeometry.computeVertexNormals();
  const litter=new InstancedMesh(leafGeometry,new MeshStandardMaterial({color:0xa49b82,roughness:1,side:DoubleSide}),COURT_GROWTH.length*2);
  COURT_GROWTH.forEach((p,i)=>{
    for(let j=0;j<2;j++) {
      const seed=p.seed*2+j;
      const x=p.x+(hash2(seed,20,930)-.5)*.55,z=p.z+(hash2(seed,21,930)-.5)*.55;
      dummy.position.set(x,smoothHeightAt(x,z)+.028,z);dummy.rotation.set(0,hash2(seed,22,930)*6.28,0);
      dummy.scale.setScalar(.7+hash2(seed,23,930)*.8);dummy.updateMatrix();litter.setMatrixAt(i*2+j,dummy.matrix);
      litter.setColorAt(i*2+j,color.setHSL(.09+hash2(seed,24,930)*.045,.15,.28+hash2(seed,25,930)*.18));
    }
  });litter.instanceMatrix.needsUpdate=true;litter.instanceColor.needsUpdate=true;litter.receiveShadow=true;group.add(litter);
  return group;
}
