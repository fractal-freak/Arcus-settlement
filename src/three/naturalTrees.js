/** Branching replacements built inside the measured bounds of each original kit tree. */
import { Box3, Vector3, Quaternion, Group, Mesh, BufferGeometry, Float32BufferAttribute,
  MeshStandardMaterial, DoubleSide, Color, CylinderGeometry } from 'three';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const barkMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 1 });
const leafMaterial = new MeshStandardMaterial({ vertexColors: true, roughness: 0.93, side: DoubleSide });
const up = new Vector3(0, 1, 0);

// Groves contain disconnected trees. Weld duplicated face vertices before finding
// components so a tree stays one tree, rather than turning every face into a sapling.
function treeBounds(scene) {
  const boxes = [];
  scene.updateMatrixWorld(true);
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
    const parent = Array.from({length:p.count}, (_,i)=>i), welded = new Map();
    const root = i => parent[i] === i ? i : (parent[i] = root(parent[i]));
    const union = (a,b) => { parent[root(a)] = root(b); };
    for (let i=0;i<p.count;i++) {
      const key = [p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(5)).join(',');
      if (welded.has(key)) union(i,welded.get(key)); else welded.set(key,i);
    }
    const count = index?.count ?? p.count;
    for (let i=0;i<count;i+=3) {
      const a=index?index.getX(i):i, b=index?index.getX(i+1):i+1, c=index?index.getX(i+2):i+2;
      union(a,b); union(a,c);
    }
    const components = new Map(), v = new Vector3();
    for (let i=0;i<p.count;i++) {
      const r=root(i); if (!components.has(r)) components.set(r,new Box3());
      components.get(r).expandByPoint(v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld));
    }
    boxes.push(...components.values());
  });
  return boxes;
}

export function naturalTrees(original) {
  const wood=[], woodColors=[], foliage=[], foliageColors=[];
  let seed=6173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const color=new Color();
  const triangle=(out,colors,a,b,c,tone)=>{
    out.push(...a.toArray(),...b.toArray(),...c.toArray());
    for(let i=0;i<3;i++) colors.push(tone.r,tone.g,tone.b);
  };
  const limb=(a,b,r0,r1,sides=5)=>{
    const axis=b.clone().sub(a).normalize();
    const u=new Vector3().crossVectors(axis,Math.abs(axis.y)>.95?new Vector3(1,0,0):up).normalize();
    const v=new Vector3().crossVectors(axis,u);
    for(let i=0;i<sides;i++){
      const angle=i/sides*Math.PI*2, next=(i+1)/sides*Math.PI*2;
      const dir=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
      const dir2=u.clone().multiplyScalar(Math.cos(next)).addScaledVector(v,Math.sin(next));
      const a0=a.clone().addScaledVector(dir,r0), a1=a.clone().addScaledVector(dir2,r0);
      const b0=b.clone().addScaledVector(dir,r1), b1=b.clone().addScaledVector(dir2,r1);
      color.setHex(0x66513a).multiplyScalar(.72+random()*.5);
      triangle(wood,woodColors,a0,a1,b0,color);triangle(wood,woodColors,a1,b1,b0,color);
    }
  };
  const boxes=treeBounds(original);
  boxes.forEach((box,tree)=>{
    const woodStart=wood.length, foliageStart=foliage.length;
    const size=box.getSize(new Vector3()), center=box.getCenter(new Vector3());
    const h=size.y, radius=Math.min(size.x,size.z)*.46;
    const root=new Vector3(center.x,box.min.y,center.z);
    const top=root.clone().add(new Vector3(h*.012,h,0));
    limb(root,top,h*.033,h*.002,8);
    const phase=random()*6.283;
    for(let tier=0;tier<7;tier++) {
      const t=tier/7, y=h*(.2+t*.72), reach=radius*(1-t*.86);
      for(let branch=0;branch<6;branch++) {
        const angle=phase+branch/6*Math.PI*2+tier*2.4+(random()-.5)*.3;
        const direction=new Vector3(Math.cos(angle),0,Math.sin(angle));
        const side=new Vector3(-direction.z,0,direction.x);
        const start=root.clone().add(new Vector3(0,y,0));
        const length=reach*(.78+random()*.22);
        const end=start.clone().addScaledVector(direction,length).addScaledVector(up,-h*.045+random()*h*.025);
        limb(start,end,h*.008*(1-t*.65),h*.0015,4);
        for(let twig=0;twig<4;twig++) {
          const progress=.18+twig*.20;
          const origin=start.clone().lerp(end,progress);
          for(const sign of [-1,1]) {
            const twigDirection=direction.clone().multiplyScalar(.65).addScaledVector(side,sign*.76).normalize();
            const twigLength=length*(.26+random()*.07)*(1-progress*.45);
            // Tapered needle sprays overlap along the limb, leaving daylight
            // between boughs and an irregular silhouette without alpha overdraw.
            for(let needle=0;needle<3;needle++) {
              const at=origin.clone().addScaledVector(twigDirection,twigLength*needle/3);
              const needleLength=h*(.055+random()*.025)*(1-t*.35);
              const width=needleLength*.45;
              const tip=at.clone().addScaledVector(twigDirection,needleLength).addScaledVector(up,h*.012);
              color.setHex([0x34452b,0x475e35,0x617449,0x526641][(tree+tier+needle)%4]).multiplyScalar(.85+random()*.3);
              triangle(foliage,foliageColors,at.clone().addScaledVector(side,-width),tip,at.clone().addScaledVector(side,width),color);
              triangle(foliage,foliageColors,at.clone().addScaledVector(up,-width*.5),tip,at.clone().addScaledVector(up,width*.5),color);
            }
          }
        }
      }
    }
    // Cylinder rims can extend a fraction below their endpoint. Keep every
    // vertex inside the source tree's envelope, including those small rims.
    for (const [array,start] of [[wood,woodStart],[foliage,foliageStart]]) {
      for(let i=start;i<array.length;i+=3) {
        array[i]=Math.max(box.min.x,Math.min(box.max.x,array[i]));
        array[i+1]=Math.max(box.min.y,Math.min(box.max.y,array[i+1]));
        array[i+2]=Math.max(box.min.z,Math.min(box.max.z,array[i+2]));
      }
    }
  });
  const group=new Group(); group.name='Branching conifers';
  for(const [positions,colors,material] of [[wood,woodColors,barkMaterial],[foliage,foliageColors,leafMaterial]]) {
    const geometry=new BufferGeometry();
    geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
    geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
    geometry.computeVertexNormals(); geometry.computeBoundingBox();
    const mesh=new Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  group.updateMatrixWorld(true);
  return group;
}

/** Open foliage throughout the world: folded leaves, without a solid ball core. */
export function broadleafCrown() {
  const positions=[], colors=[];
  let seed=813;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let leaf=0;leaf<84;leaf++) {
    const y=random()*2-1, angle=random()*Math.PI*2;
    const normal=new Vector3(Math.sqrt(1-y*y)*Math.cos(angle),y,Math.sqrt(1-y*y)*Math.sin(angle));
    // Four overlapping branch sprays break the spherical outline without a solid core.
    const branch=leaf%4,branchAngle=branch*2.39996;
    const center=normal.clone().multiplyScalar(Math.cbrt(random())*.19);
    center.add(new Vector3(Math.cos(branchAngle)*.17,(branch%3-1)*.115,Math.sin(branchAngle)*.17));
    const u=new Vector3().crossVectors(normal,Math.abs(y)>.95?new Vector3(1,0,0):up).normalize();
    const v=new Vector3().crossVectors(normal,u);
    const length=.115+random()*.065,width=length*.58;
    const tip=center.clone().addScaledVector(v,length), base=center.clone().addScaledVector(v,-length);
    const left=center.clone().addScaledVector(u,width).addScaledVector(normal,.018);
    const right=center.clone().addScaledVector(u,-width).addScaledVector(normal,.018);
    positions.push(...tip.toArray(),...left.toArray(),...base.toArray(),...tip.toArray(),...base.toArray(),...right.toArray());
    const tone=.68+random()*.32;
    for(let i=0;i<6;i++)colors.push(tone,tone,tone);
  }
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  return geo;
}

/** Branches reach into the existing crown envelope; roots keep their old position. */
export function broadleafTrunk() {
  const parts=[new CylinderGeometry(.045,.13,1,8)];
  for(let i=0;i<5;i++) {
    const angle=i*2.39996;
    const start=new Vector3(0,.12+i*.065,0);
    const end=new Vector3(Math.cos(angle)*.23,.56+i*.075,Math.sin(angle)*.23);
    const axis=end.clone().sub(start);
    const branch=new CylinderGeometry(.009,.035,axis.length(),5);
    parts.push(branch);
    branch.applyQuaternion(new Quaternion().setFromUnitVectors(up,axis.normalize()));
    branch.translate(...start.clone().add(end).multiplyScalar(.5).toArray());
  }
  const geo=mergeGeometries(parts);parts.forEach(p=>p.dispose());return geo;
}
