/** Original, volumetric court mage. Tailored surfaces and a measured KayKit animation rig.
 * Geometry and textile artwork are authored here; no concept-image pixels are shipped.
 */
import { Group, Vector3, Color, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, SkinnedMesh, Skeleton, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, DoubleSide, SphereGeometry, TubeGeometry, CatmullRomCurve3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(x)=>Math.max(0,Math.min(1,x));
let materials, geometryKit;
function textile(base,ornament=true) {
  const c=document.createElement('canvas');c.width=1024;c.height=1024;const x=c.getContext('2d');
  x.fillStyle=base;x.fillRect(0,0,1024,1024);
  let seed=871;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<23000;i++){x.fillStyle=random()>.5?'rgba(234,213,169,.035)':'rgba(4,11,27,.06)';x.fillRect(random()*1024,random()*1024,1+random()*5,1+random()*3);}
  if(ornament){
    x.strokeStyle='#b59a62';x.fillStyle='#cab681';x.lineWidth=3;
    for(const u of [18,68,444,492,530,578,954,1004]){x.beginPath();x.moveTo(u,0);x.lineTo(u,1024);x.stroke();}
    for(let y=10;y<1024;y+=22)for(const u of [43,467,554,979]){x.beginPath();x.ellipse(u,y,7,10,.6,0,Math.PI*2);x.stroke();}
    const star=(u,v,r)=>{x.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,rr=i%2?r*.25:r;x.lineTo(u+Math.cos(a)*rr,v+Math.sin(a)*rr);}x.closePath();x.fill();};
    for(let y=70;y<1000;y+=130)for(const u of [255,765]){star(u,y,19);x.beginPath();x.arc(u,y+60,27,0,Math.PI*2);x.fill();x.fillStyle=base;x.beginPath();x.arc(u+12,y+54,25,0,Math.PI*2);x.fill();x.fillStyle='#cab681';}
    for(let i=0;i<120;i++){const u=85+random()*340,v=random()*1024;star(u,v,2+random()*4);star(u+510,v,2+random()*4);}
    for(const y of [20,40,974,994]){x.beginPath();x.moveTo(0,y);x.lineTo(1024,y);x.stroke();}
  }
  const map=new CanvasTexture(c);map.colorSpace=SRGBColorSpace;map.anisotropy=4;return map;
}
function stoleTexture(){
  const c=document.createElement('canvas');c.width=256;c.height=1024;const x=c.getContext('2d');x.fillStyle='#253044';x.fillRect(0,0,256,1024);x.strokeStyle='#af9360';x.fillStyle='#d1c39e';x.lineWidth=3;
  for(const u of [12,22,234,244]){x.beginPath();x.moveTo(u,0);x.lineTo(u,1024);x.stroke();}
  for(let v=24;v<1024;v+=24)for(const u of [36,220]){x.beginPath();x.ellipse(u,v,6,9,0,0,Math.PI*2);x.stroke();}
  for(let n=0;n<5;n++){const y=130+n*184;x.fillStyle='#c8bb95';x.beginPath();x.arc(128,y,53,0,Math.PI*2);x.fill();
    if(n<2){x.fillStyle='#253044';x.beginPath();x.arc(147,y-10,48,0,Math.PI*2);x.fill();}
    else{x.strokeStyle='#736f61';x.lineWidth=2;for(const u of [109,145]){x.beginPath();x.moveTo(u-9,y-9);x.quadraticCurveTo(u,y-17,u+9,y-9);x.stroke();x.beginPath();x.moveTo(u-7,y-4);x.quadraticCurveTo(u,y+1,u+7,y-4);x.stroke();}x.beginPath();x.moveTo(126,y-10);x.lineTo(121,y+14);x.lineTo(132,y+15);x.moveTo(115,y+28);x.quadraticCurveTo(128,y+33,142,y+27);x.stroke();}
    x.fillStyle='#bca06a';x.beginPath();for(let i=0;i<16;i++){let a=i*Math.PI/8,r=i%2?6:22;x.lineTo(128+Math.cos(a)*r,y+89+Math.sin(a)*r);}x.closePath();x.fill();}
  const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.anisotropy=4;return t;
}
function getMaterials(){
  if(!materials)materials={
    stole:new MeshStandardMaterial({map:stoleTexture(),roughness:1,side:DoubleSide}),
    blue:new MeshStandardMaterial({map:textile('#253044'),roughness:.94,side:DoubleSide}),
    red:new MeshStandardMaterial({map:textile('#793739',false),roughness:1,side:DoubleSide}),
    ivory:new MeshStandardMaterial({map:textile('#c9b994',false),roughness:1,side:DoubleSide}),
    gold:new MeshStandardMaterial({color:0xb79a5e,roughness:.68,metalness:.34}),
    skin:new MeshStandardMaterial({color:0xc6aa91,roughness:1}),
    hair:new MeshStandardMaterial({color:0xaca998,roughness:1}),
    ink:new MeshStandardMaterial({color:0x272632,roughness:1}),
    lips:new MeshStandardMaterial({color:0x956e65,roughness:1}),
  };return materials;
}

export function tailorCelestialMage(root, {background=false}={}) {
  const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o);});
  const byName=new Map(bones.map(b=>[b.name,b]));
  const oldPositions=new Map(bones.map(b=>[b.name,b.position.clone()]));
  const points={root:[0,0,0],hips:[0,.88,0],spine:[0,1.12,0],chest:[0,1.36,0],head:[0,1.55,0]};
  for(const [side,s] of [['l',1],['r',-1]]){
    Object.assign(points,{['upperleg'+side]:[s*.105,.92,0],['lowerleg'+side]:[s*.105,.49,.008],['foot'+side]:[s*.105,.105,-.015],['toes'+side]:[s*.105,.035,.13],['upperarm'+side]:[s*.205,1.46,0],['lowerarm'+side]:[s*.49,1.46,-.014],['wrist'+side]:[s*.74,1.46,0],['hand'+side]:[s*.79,1.46,0],['handslot'+side]:[s*.845,1.425,0]});
  }
  // Parent-first conversion preserves the imported bone axes. Clip translations
  // are subsequently rebased from the measured old rest pose to this new one.
  for(const b of bones){root.updateMatrixWorld(true);b.position.copy(b.parent.worldToLocal(V(...points[b.name])));}
  root.updateMatrixWorld(true);
  const rest=new Map(bones.map(b=>[b.name,b.position.clone()]));
  const oldMeshes=[];root.traverse(o=>{if(o.isMesh)oldMeshes.push(o);});for(const m of oldMeshes)m.removeFromParent();
  const skeleton=new Skeleton(bones);skeleton.calculateInverses();
  if(!geometryKit){
  const index=new Map(bones.map((b,i)=>[b.name,i]));
  const buckets={};
  const rigid=name=>()=>[[name,1]];
  const body=p=>{const chest=clamp((p.y-1.2)/.22),hip=clamp((1.2-p.y)/.2);return [['chest',chest],['spine',1-chest-hip],['hips',hip]];};
  const skirt=p=>{const s=p.x>=0?'l':'r',leg=clamp((1.06-p.y)/.48),knee=clamp((.52-p.y)/.32);return [['hips',1-leg],['upperleg'+s,leg*(1-knee*.65)],['lowerleg'+s,leg*knee*.65]];};
  function add(g,mat,weights){
    const p=g.attributes.position,si=[],sw=[],colors=[];const color=new Color();
    for(let i=0;i<p.count;i++){
      const point=V(p.getX(i),p.getY(i),p.getZ(i)),w=weights(point);
      for(let j=0;j<4;j++){si.push(index.get(w[j]?.[0])??0);sw.push(w[j]?.[1]??0);}
      const shade=.93+.06*Math.sin(point.y*39+point.x*21)*Math.sin(point.z*43+point.y*13);color.setRGB(shade,shade,shade);colors.push(color.r,color.g,color.b);
    }
    if(!g.attributes.uv)g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(p.count*2),2));
    g.setAttribute('skinIndex',new Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new Float32BufferAttribute(sw,4));g.setAttribute('color',new Float32BufferAttribute(colors,3));
    (buckets[mat]??=[]).push(g.toNonIndexed());g.dispose();
  }
  function surface(rows,mat,weights,{start=0,end=Math.PI*2,segments=40,folds=0}={}){
    const smooth=[];for(let j=0;j<rows.length-1;j++){const a=rows[j],b=rows[j+1],steps=Math.max(1,Math.ceil((b[0]-a[0])/.04));for(let i=0;i<steps;i++)smooth.push(Array.from({length:5},(_,k)=>(a[k]||0)+((b[k]||0)-(a[k]||0))*i/steps));}smooth.push(rows.at(-1));rows=smooth;
    const pos=[],uv=[],ix=[];
    for(let j=0;j<rows.length;j++){
      const [y,rx,rz,cx=0,cz=0]=rows[j];
      for(let i=0;i<=segments;i++){const a=start+(end-start)*i/segments,f=1+folds*(Math.sin(a*12+.25)+.4*Math.sin(a*23))*(.35+.65*(1-j/(rows.length-1)));pos.push(cx+Math.sin(a)*rx*f,y,cz+Math.cos(a)*rz*f);uv.push(i/segments,j/(rows.length-1));}
    }
    for(let j=0;j<rows.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;ix.push(a,b,c,b,d,c);}
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,mat,weights);
  }
  const ellipsoid=(center,radii,mat,bone)=>{const g=new SphereGeometry(1,20,14);g.scale(...radii);g.translate(...center);add(g,mat,rigid(bone));};
  const cord=(points,r,mat,bone)=>add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>V(...p))),Math.max(8,points.length*4),r,5,false),mat,rigid(bone));
  // Separate skirt halves follow their own legs; neither foot is tied to the other.
  const robe=[[.12,.33,.22],[.25,.30,.20],[.48,.265,.18],[.72,.23,.16],[.93,.19,.135],[1.08,.155,.115]];
  surface(robe,'red',skirt,{folds:.045});
  surface(robe.map(([y,x,z])=>[y+.012,x+.009,z+.012]),'blue',skirt,{start:.17,end:Math.PI-.035,segments:28,folds:.045});
  surface(robe.map(([y,x,z])=>[y+.012,x+.009,z+.012]),'blue',skirt,{start:Math.PI+.035,end:Math.PI*2-.17,segments:28,folds:.045});
  surface([[1.02,.16,.118],[1.14,.145,.11],[1.3,.172,.12],[1.43,.205,.105],[1.49,.10,.085],[1.53,.062,.061]],'blue',body,{folds:.015});
  // Front lunar stole, slightly proud of the cloth, with a sculpted drape.
  const panel=(mat,x0,x1,y0,y1,z0,z1,weight)=>{
    const p=[],uv=[],ix=[];for(let j=0;j<=18;j++){const t=j/18,y=y0+(y1-y0)*t,z=z0+(z1-z0)*t;for(let i=0;i<=8;i++){const u=i/8;p.push(x0+(x1-x0)*u,y,z+.009*Math.cos(u*Math.PI*4));uv.push(u,t);}}
    for(let j=0;j<18;j++)for(let i=0;i<8;i++){let a=j*9+i;ix.push(a,a+1,a+9,a+1,a+10,a+9);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,mat,weight);
  };
  const stoleWeight=p=>{if(p.y>1.05)return body(p);const t=clamp((1.05-p.y)/.6)*.5;return [['hips',1-t],['upperlegl',t*.5],['upperlegr',t*.5]];};
  panel('ivory',-.105,.105,.18,1.32,.245,.13,stoleWeight);
  panel('stole',-.074,.074,.22,1.32,.26,.146,stoleWeight);
  // Shoulder mantle has its own rolled edge and a short trailing back.
  surface([[1.20,.255,.18],[1.30,.26,.165],[1.43,.25,.13],[1.52,.075,.075]],'blue',rigid('chest'),{start:.5,end:Math.PI*2-.5,folds:.025});
  surface([[1.195,.256,.182],[1.212,.26,.185]],'gold',rigid('chest'),{start:.5,end:Math.PI*2-.5});
  surface([[1.07,.164,.125],[1.103,.163,.125]],'gold',rigid('spine'));
  ellipsoid([0,1.084,.132],[.03,.027,.012],'gold','spine');
  ellipsoid([0,1.434,.109],[.028,.031,.01],'gold','chest');
  for(const [side,s] of [['l',1],['r',-1]]){
    // Sewn sleeves in T pose, weighted across the elbow; tailored cuffs conceal joints.
    ellipsoid([s*.205,1.46,0],[.09,.09,.085],'blue','upperarm'+side);
    const g=new BufferGeometry(),p=[],uv=[],ix=[];
    for(let j=0;j<=16;j++){const t=j/16,x=s*(.20+t*.545),radius=.065+.012*Math.sin(t*Math.PI)+.02*t*t;
      for(let i=0;i<=24;i++){const a=i/24*Math.PI*2;p.push(x,1.46+Math.cos(a)*radius,Math.sin(a)*radius);uv.push(i/24,t);}}
    for(let j=0;j<16;j++)for(let i=0;i<24;i++){const a=j*25+i;ix.push(a,a+25,a+1,a+1,a+25,a+26);}g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,'blue',p=>{const t=clamp((Math.abs(p.x)-.43)/.12);return [['upperarm'+side,1-t],['lowerarm'+side,t]];});
    ellipsoid([s*.78,1.455,.0],[.058,.026,.035],'skin','wrist'+side);
    for(let f=0;f<4;f++)cord([[s*.803,1.456,-.032+f*.021],[s*(.855-(f===0?.008:0)),1.445,-.032+f*.021],[s*(.881-(f===0||f===3?.018:0)),1.426,-.03+f*.021]],.008,'skin','hand'+side);
    cord([[s*.78,1.43,.035],[s*.80,1.407,.052],[s*.827,1.41,.054]],.012,'skin','wrist'+side);
    surface([[.10,.061,.061,s*.105,0],[.48,.065,.06,s*.105,0],[.91,.086,.079,s*.105,0]],'ink',p=>[[p.y>.49?'upperleg'+side:'lowerleg'+side,1]]);
    ellipsoid([s*.105,.065,.077],[.067,.052,.145],'ink','foot'+side);
    ellipsoid([s*.105,.052,.19],[.042,.033,.1],'blue','foot'+side);
    cord([[s*.055,.099,.015],[s*.105,.112,.055],[s*.15,.092,.13]],.005,'gold','foot'+side);
  }
  // Narrow modeled face, chin, cheek planes, eye sockets, lids, brows and lips.
  surface([[1.51,.04,.04],[1.57,.045,.045],[1.61,.071,.065],[1.66,.087,.079],[1.70,.09,.08],[1.76,.086,.078],[1.805,.055,.056],[1.818,0,0]],'skin',rigid('head'),{segments:40});
  ellipsoid([0,1.68,.078],[.015,.041,.023],'skin','head');ellipsoid([0,1.654,.091],[.011,.012,.013],'skin','head');
  for(const s of [-1,1]){
    ellipsoid([s*.085,1.672,-.002],[.015,.033,.02],'skin','head');
    ellipsoid([s*.039,1.696,.071],[.023,.009,.009],'ink','head');
    ellipsoid([s*.039,1.695,.079],[.018,.005,.007],'ivory','head');
    ellipsoid([s*.035,1.695,.089],[.006,.005,.003],'ink','head');
    cord([[s*.016,1.714,.078],[s*.038,1.721,.081],[s*.061,1.713,.067]],.005,'hair','head');
    cord([[s*.02,1.704,.088],[s*.039,1.708,.087],[s*.06,1.699,.077]],.003,'skin','head');
  }
  cord([[-.022,1.625,.070],[0,1.628,.082],[.022,1.625,.070]],.004,'lips','head');
  // Individual swept locks give the silver hair a real profile from behind.
  for(let i=0;i<25;i++){
    const a=.65+i/(24)*(Math.PI*2-1.3),sx=Math.sin(a),sz=Math.cos(a);
    cord([[sx*.069,1.79,sz*.068],[sx*.1,1.72,sz*.087],[sx*(.105+.013*Math.sin(i*1.7)),1.62,sz*.092],[sx*(.126+.012*Math.cos(i)),1.55,sz*.10],[sx*.12,1.49+Math.sin(i*2)*.034,sz*.12]],.008+(i%3)*.002,'hair','head');
  }
  // Cloth mitre: two soft tapered peaks, backed by a falling veil.
  surface([[1.78,.095,.083],[1.87,.10,.084],[1.98,.089,.077],[2.10,.060,.051],[2.23,.009,.012]],'blue',rigid('head'),{segments:32,folds:.02});
  surface([[1.82,.064,.063,0,-.055],[1.98,.055,.055,.028,-.06],[2.13,.038,.035,.048,-.055],[2.22,.002,.003,.065,-.05]],'blue',rigid('head'),{segments:24});
  surface([[1.79,.098,.086],[1.83,.101,.087]],'gold',rigid('head'));
  panel('blue',-.071,.071,1.42,1.90,-.15,-.086,rigid('head'));
  // Crescent ornament is an actual strip of geometry, with an open cutout.
  const cp=[],cu=[],ci=[];
  for(let i=0;i<=40;i++){const a=-Math.PI*.67+i/40*Math.PI*1.34;for(const r of [.049,.034]){cp.push(Math.cos(a)*r-.015,1.88+Math.sin(a)*r,.09);cu.push(i/40,r);}}
  for(let i=0;i<40;i++){const a=i*2;ci.push(a,a+2,a+1,a+1,a+2,a+3);}const cg=new BufferGeometry();cg.setAttribute('position',new Float32BufferAttribute(cp,3));cg.setAttribute('uv',new Float32BufferAttribute(cu,2));cg.setIndex(ci);cg.computeVertexNormals();add(cg,'gold',rigid('head'));
  geometryKit=Object.fromEntries(Object.entries(buckets).map(([key,parts])=>{const geo=mergeGeometries(parts);for(const p of parts)p.dispose();return [key,geo];}));
  }
  const kit=new Group();kit.name='Celestial mage — tailored mesh';root.add(kit);
  for(const [key,geo] of Object.entries(geometryKit)){
    const mat=getMaterials()[key];mat.vertexColors=true;
    const mesh=new SkinnedMesh(geo,mat);mesh.name='Celestial_'+key;mesh.bind(skeleton);mesh.frustumCulled=false;mesh.castShadow=!background;mesh.receiveShadow=true;if(background)mesh.layers.set(1);kit.add(mesh);
  }
  const retarget=clip=>{
    const result=clip.clone();
    for(const track of result.tracks){
      if(!track.name.endsWith('.position'))continue;
      const name=track.name.slice(0,-9),old=oldPositions.get(name),next=rest.get(name);if(!old||!next)continue;
      const ratio=name==='hips'?(.88/.40566343):old.length()>1e-5?next.length()/old.length():1;
      for(let i=0;i<track.values.length;i+=3){track.values[i]=next.x+(track.values[i]-old.x)*ratio;track.values[i+1]=next.y+(track.values[i+1]-old.y)*ratio;track.values[i+2]=next.z+(track.values[i+2]-old.z)*ratio;}
    }
    return result;
  };
  root.userData.celestialMage={bodyHeight:1.818,totalHeight:2.23,retarget,dispose:()=>{skeleton.dispose();}};
  return root.userData.celestialMage;
}
