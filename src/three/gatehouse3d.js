/** Modeled Gothic construction, drawn from the shared Jupiter gatehouse plan. */
import {Group,Mesh,Shape,Path,ExtrudeGeometry,ShapeGeometry,BufferGeometry,Float32BufferAttribute,
  TorusGeometry,LatheGeometry,Vector2,Vector3,TubeGeometry,CatmullRomCurve3,SphereGeometry,
  MeshStandardMaterial,MeshPhysicalMaterial,TextureLoader,RepeatWrapping,SRGBColorSpace,
  DoubleSide,CanvasTexture,Color} from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {REALM_PARTS} from '../app/realm.js';
import {sanctuaryMaterials} from './sanctuaryMaterials.js';
import {weatherPalaceMaterial} from './palaceWeathering.js';

const bevel={bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:16};
function outline(path,w,h,x=0,y=0){
  const r=w/2,s=h*.66;
  path.moveTo(x-r,y);path.lineTo(x+r,y);path.lineTo(x+r,y+s);
  path.quadraticCurveTo(x+r,y+h*.86,x,y+h);
  path.quadraticCurveTo(x-r,y+h*.86,x-r,y+s);path.closePath();return path;
}
function extrude(shape,depth){const g=new ExtrudeGeometry(shape,{...bevel,depth});g.translate(0,0,-depth/2);return g;}
function roundOpening(shape,w,h,x=0,y=0){
  shape.moveTo(x-w/2,y);shape.lineTo(x+w/2,y);shape.lineTo(x+w/2,y+h*.18);
  shape.absellipse(x,y+h*.18,w/2,h*.82,0,Math.PI,false);shape.closePath();return shape;
}
function causewayDeck(p){
  const a=[],quad=(A,B,C,D)=>a.push(...A,...B,...D,...B,...C,...D),w=p.w/2;
  for(let i=0;i<p.stations.length-1;i++){
    const u=p.stations[i],v=p.stations[i+1],z=u.z-p.z,zz=v.z-p.z;
    const A=[-w,u.left,z],B=[w,u.right,z],C=[w,v.right,zz],D=[-w,v.left,zz];
    quad(D,C,B,A);quad([-w,u.left-.42,z],[-w,v.left-.42,zz],D,A);quad(B,C,[w,v.right-.42,zz],[w,u.right-.42,z]);
    quad([-w,u.left-.42,z],[w,u.right-.42,z],[w,v.right-.42,zz],[-w,v.left-.42,zz]);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(a,3));g.computeVertexNormals();return g;
}
function merged(parts){
  const list=parts.map(g=>{const flat=g.index?g.toNonIndexed():g;for(const key of Object.keys(flat.attributes))if(!['position','normal','uv'].includes(key))flat.deleteAttribute(key);
    if(!flat.attributes.uv)flat.setAttribute('uv',new Float32BufferAttribute(new Float32Array(flat.attributes.position.count*2),2));return flat;});
  const g=mergeGeometries(list);list.forEach(p=>p.dispose());return g;
}
export function facadeGeometry(p){
  const shape=new Shape(),door=p.holes?.find(h=>h.bottom===0),w=p.w,h=p.h;
  shape.moveTo(-w/2,0);shape.lineTo(-w/2,h);shape.lineTo(w/2,h);shape.lineTo(w/2,0);
  if(door){const r=door.w/2,c=door.x,top=door.h;shape.lineTo(c+r,0);shape.lineTo(c+r,top*.66);shape.quadraticCurveTo(c+r,top*.86,c,top);shape.quadraticCurveTo(c-r,top*.86,c-r,top*.66);shape.lineTo(c-r,0);}
  shape.closePath();
  for(const hole of p.holes??[])if(hole.bottom>0)shape.holes.push(outline(new Path(),hole.w,hole.h,hole.x,hole.bottom));
  return extrude(shape,p.d);
}
function gothicFrame(p){
  const t=p.thickness??.09,shape=outline(new Shape(),p.w+2*t,p.h+t),inner=outline(new Path(),p.w,p.h);
  if(p.noSill){
    // Open bottom: the moulding returns into the floor instead of crossing the doorway.
    const r=p.w/2,s=p.h*.66;
    const open=new Shape();open.moveTo(-r-t,0);open.lineTo(-r-t,s);open.quadraticCurveTo(-r-t,p.h*.87,0,p.h+t);
    open.quadraticCurveTo(r+t,p.h*.87,r+t,s);open.lineTo(r+t,0);open.lineTo(r,0);open.lineTo(r,s);
    open.quadraticCurveTo(r,p.h*.86,0,p.h);open.quadraticCurveTo(-r,p.h*.86,-r,s);open.lineTo(-r,0);open.closePath();return extrude(open,p.d);
  }
  shape.holes.push(inner);return extrude(shape,p.d);
}
function rosette(p){
  const pieces=[],r=p.w/2,n=p.petals??6;
  for(const [radius,tube] of [[r,.055],[r*.83,.027]])pieces.push(new TorusGeometry(radius,tube,8,64));
  for(let i=0;i<n;i++){
    const a=i/n*Math.PI*2,ring=new TorusGeometry(r*.24,.029,6,24);
    ring.translate(Math.cos(a)*r*.49,Math.sin(a)*r*.49,0);pieces.push(ring);
  }
  pieces.push(new TorusGeometry(r*.18,.029,6,24));return merged(pieces);
}
function buttress(p){
  const shape=new Shape(),depth=p.d;
  // Side profile has battered toes and weather-shedding slopes between tiers.
  shape.moveTo(-depth/2,0);shape.lineTo(depth/2,0);shape.lineTo(depth/2,2.9);
  shape.lineTo(depth*.18,3.5);shape.lineTo(depth*.18,7.4);shape.lineTo(-depth*.03,8.0);
  shape.lineTo(-depth*.03,p.h);shape.lineTo(-depth/2,p.h);shape.closePath();
  const g=extrude(shape,p.w);g.rotateY(-Math.PI/2);return g;
}
function towerShell(p){
  const out=[],r=p.r,thick=p.thickness,segments=160,rows=140;
  const radius=y=>r+(1-Math.min(1,y/2.1))*.18;
  const windowAt=(a,y)=>{
    const u=((a+Math.PI/8)%(Math.PI/4)-Math.PI/8)*r;
    for(const s of p.stories){const t=y-s.y;if(t<0||t>s.h)continue;
      const width=.41*(t<s.h*.66?1:Math.sqrt(Math.max(0,1-((t/s.h-.66)/.34)**1.2)));
      if(Math.abs(u)<width)return true;
    }
    const doorAngle=Math.atan2(Math.sin(a),Math.cos(a));
    return y<3&&Math.abs(doorAngle*r)<1.1*(y<2?1:Math.sqrt(Math.max(0,3-y)));
  };
  const pos=(a,y,inner)=>[Math.sin(a)*(radius(y)-(inner?thick:0)),y,Math.cos(a)*(radius(y)-(inner?thick:0))];
  const tri=(a,b,c)=>out.push(...a,...b,...c),quad=(a,b,c,d)=>{tri(a,b,d);tri(b,c,d);};
  for(let i=0;i<segments;i++)for(let row=0;row<rows;row++){
    const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2,y=row/rows*p.h,top=(row+1)/rows*p.h;
    if(windowAt((a+b)/2,(y+top)/2))continue;
    quad(pos(a,y,false),pos(b,y,false),pos(b,top,false),pos(a,top,false));
    quad(pos(b,y,true),pos(a,y,true),pos(a,top,true),pos(b,top,true));
    if(i===0||windowAt(a-Math.PI/segments,(y+top)/2))quad(pos(a,y,true),pos(a,y,false),pos(a,top,false),pos(a,top,true));
    if(windowAt(b+Math.PI/segments,(y+top)/2))quad(pos(b,y,false),pos(b,y,true),pos(b,top,true),pos(b,top,false));
    if(row===0||windowAt((a+b)/2,y-p.h/rows/2))quad(pos(b,y,false),pos(a,y,false),pos(a,y,true),pos(b,y,true));
    if(row===rows-1||windowAt((a+b)/2,top+p.h/rows/2))quad(pos(a,top,false),pos(b,top,false),pos(b,top,true),pos(a,top,true));
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(out,3));g.computeVertexNormals();return g;
}
function moldingRing(p){
  const r=p.w/2,h=p.h,points=(p.profile==='eave'?[[r-.45,0],[r-.2,.06],[r-.15,h*.38],[r,h*.55],[r,h*.8],[r-.04,h],[r-.3,h]]:
    [[r-.19,0],[r-.02,.03],[r,h*.32],[r-.045,h*.55],[r,h*.77],[r,h],[r-.19,h]]).map(([x,y])=>new Vector2(x,y));
  return new LatheGeometry(points,96);
}
function spireRadius(p,t){
  if(p.profile==='bell')return p.w/2*Math.pow(1-t,1.2)*(1+.11*Math.exp(-t*18));
  return p.w/2*Math.pow(1-t,.96);
}
function slateRoof(p,spire=false){
  const positions=[],colors=[],rows=Math.ceil(p.h/.22),tone=new Color(),tri=(a,b,c,col)=>{positions.push(...a,...b,...c);for(let j=0;j<3;j++)colors.push(col.r,col.g,col.b);};
  const tile=(a,b,c,d,col)=>{tri(a,b,d,col);tri(b,c,d,col);const ae=[a[0],a[1]-.035,a[2]],be=[b[0],b[1]-.035,b[2]];tri(ae,be,a,col);tri(be,b,a,col);};
  for(let row=0;row<rows;row++){
    const t=row/rows,nt=Math.min(1,(row+1.1)/rows),height=t*p.h,high=nt*p.h;
    if(spire){
      const r=spireRadius(p,t),rr=spireRadius(p,nt),n=Math.max(8,Math.ceil(Math.PI*2*r/.3));
      for(let k=0;k<n;k++){
        const a=(k+(row%2)*.5)/n*Math.PI*2+.002,b=(k+1+(row%2)*.5)/n*Math.PI*2-.002;
        const at=(a,r,y)=>[Math.sin(a)*(r+.02),y,Math.cos(a)*(r+.02)];
        tone.setHSL(.57,.12,.26+Math.sin(row*83+k*37)*.024);
        tile(at(a,r,height),at(b,r,height),at(b,rr,high),at(a,rr,high),tone);
      }
    }else{
      const n=Math.ceil(p.d/.33);
      for(const side of [-1,1])for(let k=0;k<n;k++){
        const za=-p.d/2+k*p.d/n,zb=za+p.d/n-.012;
        tone.setHSL(.57,.12,.25+Math.sin(row*83+k*37)*.027);
        tile([side*p.w/2*(1-t),height,za],[side*p.w/2*(1-t),height,zb],[side*p.w/2*(1-nt),high,zb],[side*p.w/2*(1-nt),high,za],tone);
      }
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
function finial(p){
  const pts=[[.12,0],[.15,.08],[.08,.18],[.11,.24],[.065,.34],[.055,.75],[0,1]].map(([r,y])=>new Vector2(r*p.w*3,y*p.h));
  const pieces=[new LatheGeometry(pts,20)];
  for(const y of [.3,.65]){const g=new SphereGeometry(p.w*.22,12,8);g.translate(0,p.h*y,0);pieces.push(g);}return merged(pieces);
}
function stonePinnacle(p){
  const pieces=[],r=p.w/2;
  const points=[[r*.72,0],[r,.08],[r,.24],[r*.6,.31],[r*.55,.45],[r*.08,p.h*.92],[0,p.h]].map(([x,y])=>new Vector2(x,y));
  pieces.push(new LatheGeometry(points,8));
  for(let tier=1;tier<5;tier++)for(let side=0;side<4;side++){
    const t=tier/5,a=side*Math.PI/2,rr=r*.6*(1-t),leaf=new SphereGeometry(.09*(1-t*.5),8,6);
    leaf.scale(1,1.65,1);leaf.translate(Math.sin(a)*rr,p.h*t,Math.cos(a)*rr);pieces.push(leaf);
  }
  return merged(pieces);
}
function dormer(p){
  const pieces=[],w=p.w,h=p.h;
  const front=facadeGeometry({w,h,d:.19,holes:[{x:0,bottom:.18,w:w*.65,h:h*.62}]});front.translate(0,0,p.d/2);pieces.push(front);
  const top=new Shape();top.moveTo(-w/2,h);top.lineTo(w/2,h);top.lineTo(0,h+w*.72);top.closePath();const g=extrude(top,.21);g.translate(0,0,p.d/2);pieces.push(g);
  for(const sign of [-1,1]){const cheek=new RoundedBoxGeometry(.12,h,p.d,1,.025);cheek.translate(sign*w/2,h/2,0);pieces.push(cheek);}
  const ring=gothicFrame({w:w*.65,h:h*.62,thickness:.055,d:.1});ring.translate(0,.18,p.d/2+.13);pieces.push(ring);
  return merged(pieces);
}
function geometry(p){
  if(p.shape==='causewayDeck')return causewayDeck(p);
  if(p.shape==='causewaySide'){
    const s=new Shape();p.outline.forEach((q,i)=>i?s.lineTo(q.u,q.y):s.moveTo(q.u,q.y));s.closePath();
    for(const a of p.arches)s.holes.push(roundOpening(new Path(),a.w,a.h,a.x,a.bottom));return extrude(s,p.d);
  }
  if(p.shape==='bridgeArch'){
    const s=roundOpening(new Shape(),p.w+.32,p.h+.16);s.holes.push(roundOpening(new Path(),p.w,p.h));return extrude(s,p.d);
  }
  if(p.shape==='facade')return facadeGeometry(p);
  if(p.shape==='gothicFrame')return gothicFrame(p);
  if(p.shape==='pane')return new ShapeGeometry(outline(new Shape(),p.w,p.h),20);
  if(p.shape==='rosette')return rosette(p);
  if(p.shape==='disc'){const s=new Shape();s.absarc(0,0,p.w/2,0,Math.PI*2);return new ShapeGeometry(s,48);}
  if(p.shape==='buttress')return buttress(p);
  if(p.shape==='towerShell')return towerShell(p);
  if(p.shape==='moldingRing')return moldingRing(p);
  if(p.shape==='spire')return p.material==='slate'?slateRoof(p,true):stonePinnacle(p);
  if(p.shape==='slateRoof')return slateRoof(p);
  if(p.shape==='finial')return finial(p);
  if(p.shape==='newel'||p.shape==='baluster'){
    const newel=p.shape==='newel',r=p.w/2;
    const profile=(newel?[[1,0],[1,.1],[.74,.14],[.74,.74],[1,.79],[1,.86],[.72,.91],[0,1]]:
      [[1,0],[1,.09],[.6,.13],[.6,.3],[1,.43],[1,.54],[.56,.66],[.56,.84],[1,.91],[1,1]])
      .map(([x,y])=>new Vector2(r*x,p.h*y));
    const g=new LatheGeometry(profile,newel?4:16);if(newel)g.rotateY(Math.PI/4);return g;
  }
  if(p.shape==='dormer')return dormer(p);
  if(p.shape==='gableWall'){const s=new Shape();s.moveTo(-p.w/2,0);s.lineTo(p.w/2,0);s.lineTo(0,p.h);s.closePath();if(p.oculus){const hole=new Path();hole.absarc(0,p.oculus.y,p.oculus.r,0,Math.PI*2,true);s.holes.push(hole);}return extrude(s,p.d);}
  if(p.shape==='roofRib'){
    const points=[];for(let i=0;i<24;i++){const t=i/24,r=spireRadius(p,t)+.055;points.push(new Vector3(Math.sin(p.angle)*r,t*p.h,Math.cos(p.angle)*r));}
    return new TubeGeometry(new CatmullRomCurve3(points),40,.025,6,false);
  }
  if(p.shape==='vault'){
    const out=[];for(let i=0;i<40;i++){
      const a=i/40*Math.PI,b=(i+1)/40*Math.PI;
      const at=(t,z)=>[Math.cos(t)*p.w/2,Math.sin(t)*p.h,z];
      out.push(...at(a,-p.d/2),...at(b,-p.d/2),...at(a,p.d/2),...at(b,-p.d/2),...at(b,p.d/2),...at(a,p.d/2));
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(out,3));g.computeVertexNormals();return g;
  }
  if(p.shape==='corbel'){
    const points=[[0,0],[.14,.08],[.17,.2],[.29,.4],[.3,.6],[0,.6]],s=new Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();const g=extrude(s,p.w);g.rotateY(-Math.PI/2);g.translate(0,0,p.d/2);return g;
  }
  const g=new RoundedBoxGeometry(p.w,p.h,p.d,2,Math.min(.035,p.w*.16,p.h*.16,p.d*.16));
  if(p.shape==='paver'){
    const v=g.attributes.position;for(let i=0;i<v.count;i++)v.setY(i,v.getY(i)+v.getZ(i)*p.slope-.012*(.5+.5*Math.sin(v.getX(i)*24+v.getZ(i)*31+p.wear*11)));
    g.computeVertexNormals();
  }
  if(p.shape==='beam'){if(p.axis==='x')g.rotateX(p.tilt);else g.rotateZ(p.tilt);}return g;
}
function glassTexture(){
  const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#526c6b';ctx.fillRect(0,0,256,256);
  for(let row=-2;row<10;row++)for(let col=-2;col<10;col++){
    const x=col*40+(row%2)*20,y=row*32;ctx.beginPath();ctx.moveTo(x,y-32);ctx.lineTo(x+20,y);ctx.lineTo(x,y+32);ctx.lineTo(x-20,y);ctx.closePath();
    ctx.fillStyle=['#708381','#778680','#577074','#8f946f','#6c777d'][(row*7+col+30)%5];ctx.fill();ctx.strokeStyle='#293533';ctx.lineWidth=2;ctx.stroke();
  }
  const t=new CanvasTexture(c);t.wrapS=t.wrapT=RepeatWrapping;t.colorSpace=SRGBColorSpace;return t;
}
function gateMaterials(){
  const loader=new TextureLoader(),load=(channel)=>{const t=loader.load(`${import.meta.env.BASE_URL}assets/village-materials/medieval_blocks_03_${channel}_1k.jpg`);t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;if(channel==='diff')t.colorSpace=SRGBColorSpace;return t;};
  const map=load('diff'),bumpMap=load('disp');
  const ashlar=new MeshStandardMaterial({map,bumpMap,bumpScale:.04,roughness:.92,color:0xffffff,side:DoubleSide});
  ashlar.onBeforeCompile=s=>{
    s.vertexShader='varying vec3 masonryPoint;\n'+s.vertexShader;s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n masonryPoint=(modelMatrix*vec4(position,1.)).xyz;');
    s.fragmentShader='varying vec3 masonryPoint;\n'+s.fragmentShader;s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float stain=.5+.5*sin(masonryPoint.x*.57+sin(masonryPoint.z*.73))*sin(masonryPoint.y*.28+masonryPoint.x*.17);
      float damp=(1.-smoothstep(10.1,13.1,masonryPoint.y))*(.25+stain*.75);
      float luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(luminance*1.15),.72)*vec3(1.12,1.08,.96);
      diffuseColor.rgb*=.83+stain*.24;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.48,.60,.38),damp*.6);
    `);
  };ashlar.customProgramCacheKey=()=> 'gatehouse-weathered-ashlar-1';
  const grain=loader.load(`${import.meta.env.BASE_URL}assets/village-materials/medieval_wood_diff_1k.jpg`);grain.wrapS=grain.wrapT=RepeatWrapping;grain.colorSpace=SRGBColorSpace;
  const detail=sanctuaryMaterials().rock;
  const carved=new MeshStandardMaterial({map:detail.color,normalMap:detail.normal,normalScale:new Vector2(.22,.22),roughnessMap:detail.rough,roughness:.9,color:0xffffff,side:DoubleSide});
  carved.onBeforeCompile=s=>{s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float grain=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    diffuseColor.rgb=vec3(.255,.24,.207)*(.76+grain*.72);
  `);};carved.customProgramCacheKey=()=> 'carved-limestone-grain-1';
  const result={
    ashlar,dressed:ashlar,
    carved,
    slate:new MeshStandardMaterial({vertexColors:true,color:0x52606d,roughness:.78,metalness:.05,side:DoubleSide}),
    leadedGlass:new MeshPhysicalMaterial({map:glassTexture(),color:0xa2b9b4,roughness:.18,metalness:0,transmission:.38,thickness:.08,ior:1.5,envMapIntensity:1.7,side:DoubleSide}),
    copper:new MeshStandardMaterial({color:0x526a63,metalness:.65,roughness:.55}),
    gold:new MeshStandardMaterial({color:0xa48b55,metalness:.78,roughness:.32}),
    iron:new MeshStandardMaterial({color:0x272b2c,metalness:.7,roughness:.58}),
    wood:new MeshStandardMaterial({map:grain,color:0x9c8466,roughness:.88}),
    floor:new MeshStandardMaterial({map,bumpMap,bumpScale:.025,color:0xa8a499,roughness:.9}),
    causewayStone:new MeshStandardMaterial({map,bumpMap,bumpScale:.05,color:0x9eaaa0,roughness:.96,side:DoubleSide}),
  };
  weatherPalaceMaterial(ashlar,.86);weatherPalaceMaterial(carved,.72);weatherPalaceMaterial(result.causewayStone,.74,{walkway:true});return result;
}
function prepare(g,p){
  if(g.index)g=g.toNonIndexed();
  g.rotateY(p.rot??0);g.translate(p.x+(p.offsetX??0),p.y,p.z);
  const vertices=g.attributes.position,normals=g.attributes.normal,uv=[],colors=[];
  for(let i=0;i<vertices.count;i++){
    const x=vertices.getX(i),y=vertices.getY(i),z=vertices.getZ(i),nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i)),nz=Math.abs(normals.getZ(i));
    if(p.material==='leadedGlass')uv.push(((x-p.x)*Math.cos(p.rot??0)-(z-p.z)*Math.sin(p.rot??0))*.6,(y-p.y)*.6);
    else uv.push((ny>Math.max(nx,nz)?x:nx>nz?z:x)/1.9,(ny>Math.max(nx,nz)?z:y)/1.9);
    colors.push(1,1,1);
  }
  g.setAttribute('uv',new Float32BufferAttribute(uv,2));
  if(!g.attributes.color)g.setAttribute('color',new Float32BufferAttribute(colors,3));
  for(const key of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(key))g.deleteAttribute(key);
  return g;
}
export class Gatehouse3D {
  constructor(scene){
    this.group=new Group();this.group.name='Jupiter gatehouse and observatory';scene.add(this.group);
    const batches=new Map(),mats=gateMaterials();
    for(const p of REALM_PARTS.filter(p=>p.section==='Jupiter gatehouse'&&!p.collisionOnly)){
      const g=prepare(geometry(p),p);if(!batches.has(p.material))batches.set(p.material,[]);batches.get(p.material).push(g);
      if(p.shape==='dormer'){
        const roofSpec={...p,shape:'slateRoof',y:p.y+p.h,w:p.w+.25,h:p.w*.8,d:p.d+.22,material:'slate'};
        const roof=prepare(geometry(roofSpec),roofSpec);if(!batches.has('slate'))batches.set('slate',[]);batches.get('slate').push(roof);
      }
    }
    for(const [key,list] of batches){const mesh=new Mesh(mergeGeometries(list),mats[key]);mesh.name=`Gatehouse ${key}`;mesh.castShadow=key!=='leadedGlass';mesh.receiveShadow=true;this.group.add(mesh);list.forEach(g=>g.dispose());}
  }
}
