import {Group,Mesh,InstancedMesh,Object3D,Color,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,DoubleSide,TubeGeometry,CatmullRomCurve3,Vector3} from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {GATEHOUSE_IVY,ivySurfacePoint} from '../app/palaceLandscape.js';
import {CAUSEWAY_IVY} from '../app/palaceCauseway.js';
function ivyLeaf(){
  const edge=[[0,0],[-.13,.29],[-.47,.32],[-.3,.56],[-.36,.79],[-.12,.73],[0,1],[.12,.73],[.36,.79],[.3,.56],[.47,.32],[.13,.29]],positions=[],colors=[];
  for(let i=0;i<edge.length;i++){
    const a=edge[i],b=edge[(i+1)%edge.length];positions.push(a[0],a[1],0,b[0],b[1],0,0,.51,.09);
    colors.push(.79,.86,.69,.86,.92,.76,1,1,1);
  }
  positions.push(-.009,.08,.025,.009,.08,.025,0,.91,.015);
  colors.push(1.12,1.15,.85,1.12,1.15,.85,1.12,1.15,.85);
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
export function palaceIvy(){
  const group=new Group(),leaves=[],stems=[];
  for(const p of [...GATEHOUSE_IVY,...CAUSEWAY_IVY]){
    const at=(u,v)=>new Vector3(...ivySurfacePoint(p,u,p.hanging?-v:v));
    const opening=(u,v)=>{
      if((p.openings??[]).some(o=>Math.abs(u-o.u)<o.w/2&&v>o.v-.15&&v<o.v+o.h))return true;
      if(p.seed===70){const angle=p.angle+u/p.r,offset=Math.abs(Math.atan2(Math.sin(angle*8),Math.cos(angle*8)))*p.r/8;
        if(offset<.58&&[[4.0,6.4],[8.0,10.8]].some(([a,b])=>v>a&&v<b))return true;}
      return false;
    };
    const random=n=>{const f=Math.sin(n*127.1+p.seed*311.7)*43758.5453;return f-Math.floor(f);};
    const leaf=(u,v,seed)=>{
      if(v<.04||v>p.height||Math.abs(u)>p.width*.54||opening(u,v))return;
      leaves.push({point:at(u,v),a:p.surface==='cylinder'?p.angle+u/p.r:p.rot??0,
        twist:(random(seed+7)-.5)*3.6,size:.19+random(seed+9)*.19,tone:Math.floor(random(seed+3)*9)});
    };
    // Woody leaders branch into leafy sprays; interrupted stems stop at openings.
    // No evenly spaced vertical trellis or grid of foliage over the stone.
    const stem=(samples,radius)=>{
      let run=[];
      const finish=()=>{if(run.length>2)stems.push(new TubeGeometry(new CatmullRomCurve3(run),Math.max(6,run.length*2),radius,4,false));run=[];};
      for(const [u,v] of samples){if(opening(u,v))finish();else run.push(at(u,v));}finish();
    };
    const count=Math.max(2,Math.ceil(p.width*1.65));
    for(let vine=0;vine<count;vine++){
      const seed=vine*83,root=(random(seed)-.5)*p.width*.82,reach=p.height*(.62+random(seed+1)*.38);
      const leader=v=>root*(1-v/p.height*.35)+Math.sin(v*(.68+random(seed+2)*.55)+seed)*p.width*.09+Math.sin(v*2.3+seed)*.045;
      const main=[];
      for(let k=0;k<=Math.ceil(reach/.12);k++){
        const v=Math.min(reach,k*.12),u=leader(v);main.push([u,v]);
        if(k%2===0)leaf(u+(random(seed+k)-.5)*.15,v,seed+k*7);
      }
      stem(main,.008);
      for(let v=.15,j=0;v<reach;v+=.23+random(seed+j+11)*.14,j++){
        const dir=j%2?1:-1,span=Math.min(.7,p.width*.37)*(.4+random(seed+j+24)*.6),branch=[];
        for(let k=0;k<7;k++){
          const t=k/6,u=leader(v)+dir*span*t,vv=v+.21*Math.sin(t*1.6)+t*.12;
          branch.push([u,vv]);
          for(let side=-1;side<=1;side+=2)leaf(u+(random(seed+j*57+k)-.5)*.13,vv+side*(.055+random(seed+k)*.06),seed+j*73+k*9+side);
        }
        stem(branch,.004);
      }
    }
  }
  const leafMat=new MeshStandardMaterial({vertexColors:true,color:0xb9c797,roughness:.88,side:DoubleSide});
  const mesh=new InstancedMesh(ivyLeaf(),leafMat,leaves.length),dummy=new Object3D(),color=new Color();
  leaves.forEach((leaf,i)=>{
    dummy.position.copy(leaf.point);dummy.rotation.set(Math.sin(i)*.22,leaf.a,leaf.twist);dummy.scale.set(leaf.size,leaf.size,leaf.size);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    color.setHex([0x547936,0x6c893f,0x3c622d,0x829750,0x526d35,0x42602e,0x587b32,0x7c843f,0x8b7940][leaf.tone]);mesh.setColorAt(i,color);
  });mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);
  if(stems.length){const g=mergeGeometries(stems);stems.forEach(p=>p.dispose());const wood=new Mesh(g,new MeshStandardMaterial({color:0x514631,roughness:1}));group.add(wood);}
  group.name='Rooted climbing ivy and hanging bridge vines';return group;
}
