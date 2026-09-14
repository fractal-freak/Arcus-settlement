/** Original, volumetric court mage. Tailored surfaces and a measured KayKit animation rig.
 * Geometry is authored here. Original generated textile assets are recorded in ASSETS.md.
 */
import { Group, Bone, Quaternion, Vector3, Color, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, SkinnedMesh, Skeleton, MeshStandardMaterial, CanvasTexture, TextureLoader, RepeatWrapping, SRGBColorSpace, DoubleSide, SphereGeometry, TubeGeometry, CatmullRomCurve3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(x)=>Math.max(0,Math.min(1,x));
let materials, textileMaps, textilePromise, instanceCount=0;
/** Share decoded images and wait before the first material is constructed. */
export function loadMageTextiles(){
  if(!textilePromise)textilePromise=Promise.all(['brocade-v1.png','lunar-stole-v1.png'].map(name=>new TextureLoader().loadAsync('./assets/celestial-mage/'+name))).then(([brocade,stole])=>{
    for(const t of [brocade,stole]){t.colorSpace=SRGBColorSpace;t.anisotropy=4;}
    brocade.wrapS=brocade.wrapT=RepeatWrapping;
    const plain=stole.clone();plain.offset.x=.02;plain.repeat.x=.28;plain.needsUpdate=true;
    // The atlas dedicates its middle quarter to the narrow embroidered strip.
    stole.offset.x=.375;stole.repeat.x=.25;
    textileMaps={brocade,stole,plain};
  }).catch(error=>{console.warn('Celestial textiles unavailable; using the built-in cloth.',error);});
  return textilePromise;
}
const geometryKits=new Map();
function textile(base,ornament=true) {
  const c=document.createElement('canvas');c.width=1024;c.height=1024;const x=c.getContext('2d');
  x.fillStyle=base;x.fillRect(0,0,1024,1024);
  let seed=871;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<130;i++){const px=random()*1024,py=random()*1024,r=30+random()*100,g=x.createRadialGradient(px,py,0,px,py,r);g.addColorStop(0,random()>.5?'rgba(189,173,139,.13)':'rgba(5,12,25,.24)');g.addColorStop(1,'transparent');x.fillStyle=g;x.fillRect(px-r,py-r,r*2,r*2);}
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
    stole:new MeshStandardMaterial({map:textileMaps?.stole??stoleTexture(),roughness:1,side:DoubleSide}),
    blue:new MeshStandardMaterial({map:textileMaps?.brocade??textile('#253044'),roughness:.94,side:DoubleSide}),
    plain:new MeshStandardMaterial({map:textileMaps?.plain??textile('#253044',false),roughness:1,side:DoubleSide}),
    red:new MeshStandardMaterial({map:textile('#793739',false),roughness:1,side:DoubleSide}),
    ivory:new MeshStandardMaterial({map:textile('#c9b994',false),roughness:1,side:DoubleSide}),
    gold:new MeshStandardMaterial({map:textile('#b79a5e',false),roughness:.7,metalness:.3}),
    skin:new MeshStandardMaterial({color:0xc3a38f,roughness:1}),
    hair:new MeshStandardMaterial({color:0xb6b1a5,roughness:1}),
    eyeWhite:new MeshStandardMaterial({color:0xc9c2ad,roughness:.85}),
    eyeIris:new MeshStandardMaterial({color:0x647776,roughness:.65}),
    eyePupil:new MeshStandardMaterial({color:0x202b31,roughness:.6}),
    eyeLash:new MeshStandardMaterial({color:0x51443f,roughness:1}),
    ink:new MeshStandardMaterial({color:0x272632,roughness:1}),
    lips:new MeshStandardMaterial({color:0x956e65,roughness:1}),
  };return materials;
}

export function tailorCelestialMage(root, {background=false}={}) {
  const bones=[];root.traverse(o=>{if(o.isBone)bones.push(o);});
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
  const secondary=[];
  for(const [name,parent,point] of [['drapel','hips',[.1,.96,0]],['draper','hips',[-.1,.96,0]],['tressl','head',[.07,1.75,0]],['tressr','head',[-.07,1.75,0]]]){
    const bone=new Bone();bone.name=name;const anchor=bones.find(b=>b.name===parent);anchor.add(bone);bone.position.copy(anchor.worldToLocal(V(...point)));bones.push(bone);secondary.push(bone);
  }
  root.updateMatrixWorld(true);
  const skeleton=new Skeleton(bones);skeleton.calculateInverses();
  let geometryKit=geometryKits.get(background);
  if(!geometryKit){
  const index=new Map(bones.map((b,i)=>[b.name,i]));
  const buckets={};
  const rigid=name=>()=>[[name,1]];
  const body=p=>{const chest=clamp((p.y-1.2)/.22),hip=clamp((1.2-p.y)/.2);return [['chest',chest],['spine',1-chest-hip],['hips',hip]];};
  const skirt=p=>{const s=p.x>=0?'l':'r',leg=clamp((1.06-p.y)/.48),knee=clamp((.52-p.y)/.32),cloth=leg*.12;return [['hips',1-leg],['upperleg'+s,leg*(1-knee*.48)-cloth],['lowerleg'+s,leg*knee*.48],['drape'+s,cloth]];};
  function add(g,mat,weights){
    const p=g.attributes.position,si=[],sw=[],colors=[];const color=new Color();
    for(let i=0;i<p.count;i++){
      const point=V(p.getX(i),p.getY(i),p.getZ(i)),w=weights(point);
      for(let j=0;j<4;j++){si.push(index.get(w[j]?.[0])??0);sw.push(w[j]?.[1]??0);}
      const shade=.87+.10*Math.sin(point.y*39+point.x*21)*Math.sin(point.z*43+point.y*13);color.setRGB(shade,shade,shade);
      if(mat==='skin') {const cheek=Math.exp(-(((Math.abs(point.x)-.058)/.026)**2+((point.y-1.658)/.03)**2))*clamp(point.z*16);color.setRGB(.96,.94-cheek*.14,.91-cheek*.16);}
      if(mat==='hair'){const strand=.73+.24*(.5+.5*Math.sin(point.y*53+point.x*140));color.setRGB(strand,strand,strand*.99);}colors.push(color.r,color.g,color.b);
    }
    if(!g.attributes.uv)g.setAttribute('uv',new Float32BufferAttribute(new Float32Array(p.count*2),2));
    g.setAttribute('skinIndex',new Uint16BufferAttribute(si,4));g.setAttribute('skinWeight',new Float32BufferAttribute(sw,4));g.setAttribute('color',new Float32BufferAttribute(colors,3));
    if(mat.startsWith('eye')){const closed=p.clone();for(let i=0;i<p.count;i++){closed.setY(i,1.691+.008*Math.pow((Math.abs(p.getX(i))-.034)/.019,2));if(mat!=='eyeLash')closed.setZ(i,p.getZ(i)-.016);}g.morphAttributes.position=[closed];}
    (buckets[mat]??=[]).push(g.toNonIndexed());g.dispose();
  }
  function surface(rows,mat,weights,{start=0,end=Math.PI*2,segments=40,folds=0,sculpt=null,density=.04}={}){
    const smooth=[];for(let j=0;j<rows.length-1;j++){const a=rows[j],b=rows[j+1],steps=Math.max(1,Math.ceil((b[0]-a[0])/density));for(let i=0;i<steps;i++)smooth.push(Array.from({length:5},(_,k)=>{const t=i/steps,av=a[k]||0,bv=b[k]||0;if(k===0)return av+(bv-av)*t;const prev=rows[Math.max(0,j-1)][k]||0,next=rows[Math.min(rows.length-1,j+2)][k]||0;const value=(2*t*t*t-3*t*t+1)*av+(t*t*t-2*t*t+t)*(bv-prev)*.5+(-2*t*t*t+3*t*t)*bv+(t*t*t-t*t)*(next-av)*.5;return k<3?Math.max(0,value):value;}));}smooth.push(rows.at(-1));rows=smooth;
    const pos=[],uv=[],ix=[];
    const textileWidth=Math.max(...rows.map(r=>(r[1]+r[2])*.5))*(end-start)/.9;
    for(let j=0;j<rows.length;j++){
      const [y,rx,rz,cx=0,cz=0]=rows[j];
      for(let i=0;i<=segments;i++){const a=start+(end-start)*i/segments,f=1+folds*(Math.sin(a*12+.25)+.4*Math.sin(a*23))*(.35+.65*(1-j/(rows.length-1)));const point=V(cx+Math.sin(a)*rx*f,y,cz+Math.cos(a)*rz*f);sculpt?.(point,a);pos.push(point.x,point.y,point.z);uv.push(mat==='blue'?i/segments*textileWidth:i/segments,mat==='blue'?(y-rows[0][0])/.9:j/(rows.length-1));}
    }
    for(let j=0;j<rows.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;ix.push(a,b,c,b,d,c);}
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,mat,weights);
  }
  const ellipsoid=(center,radii,mat,bone)=>{const g=new SphereGeometry(1,20,14);g.scale(...radii);g.translate(...center);add(g,mat,rigid(bone));};
  const cord=(points,r,mat,bone)=>{
    const curve=new CatmullRomCurve3(points.map(p=>V(...p))),steps=Math.max(8,points.length*4),g=new TubeGeometry(curve,steps,r,8,false);
    if(mat==='skin'&&r>.005){const pos=g.attributes.position;for(let j=0;j<=steps;j++){const t=j/steps,center=curve.getPointAt(t),taper=.94-.52*t*t*t+.08*Math.sin(t*Math.PI*3);for(let k=0;k<=8;k++){const i=j*9+k;pos.setXYZ(i,center.x+(pos.getX(i)-center.x)*taper,center.y+(pos.getY(i)-center.y)*taper,center.z+(pos.getZ(i)-center.z)*taper);}}g.computeVertexNormals();ellipsoid(points.at(-1),[r*.42,r*.42,r*.42],mat,bone);}
    add(g,mat,rigid(bone));
  };
  // Separate skirt halves follow their own legs; neither foot is tied to the other.
  const robe=[[.145,.32,.235],[.25,.295,.211],[.48,.253,.181],[.72,.23,.16],[.93,.19,.135],[1.08,.155,.115]];
  surface(robe,'red',skirt,{folds:.105});
  surface(robe.map(([y,x,z])=>[y+.012,x+.009,z+.012]),'blue',skirt,{start:.17,end:Math.PI-.035,segments:background?28:52,folds:.105});
  surface(robe.map(([y,x,z])=>[y+.012,x+.009,z+.012]),'blue',skirt,{start:Math.PI+.035,end:Math.PI*2-.17,segments:background?28:52,folds:.105});
  // Sewn gold hems follow the same sculpted cut as the two outer robe panels.
  for(const [start,end] of [[.17,Math.PI-.035],[Math.PI+.035,Math.PI*2-.17]]){
    const edge=Array.from({length:65},(_,i)=>{const a=start+(end-start)*i/64,f=1+.105*(Math.sin(a*12+.25)+.4*Math.sin(a*23));return V(Math.sin(a)*.330*f,.16,Math.cos(a)*.249*f);});
    add(new TubeGeometry(new CatmullRomCurve3(edge),96,.003,5,false),'gold',skirt);
  }
  surface([[1.02,.16,.118],[1.14,.145,.11],[1.3,.172,.12],[1.43,.205,.105],[1.49,.10,.085],[1.53,.062,.061]],'blue',body,{folds:.015});
  // Front lunar stole, slightly proud of the cloth, with a sculpted drape.
  const panel=(mat,x0,x1,y0,y1,z0,z1,weight)=>{
    const p=[],uv=[],ix=[];for(let j=0;j<=18;j++){const t=j/18,y=y0+(y1-y0)*t,z=z0+(z1-z0)*t;for(let i=0;i<=8;i++){const u=i/8;p.push(x0+(x1-x0)*u,y,z+.009*Math.cos(u*Math.PI*4));uv.push(u,t);}}
    for(let j=0;j<18;j++)for(let i=0;i<8;i++){let a=j*9+i;ix.push(a,a+1,a+9,a+1,a+10,a+9);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,mat,weight);
  };
  const stoleWeight=p=>{if(p.y>1.05)return body(p);const t=clamp((1.05-p.y)/.6)*.5;return [['hips',1-t],['upperlegl',t*.5],['upperlegr',t*.5]];};
  panel('ivory',-.105,.105,.18,1.32,.245,.13,stoleWeight);
  panel('stole',-.087,.087,.22,1.36,.276,.154,stoleWeight);
  // A continuous asymmetric mantle follows the shoulder rather than sitting
  // above it like rigid armor. Red lining and a narrow rolled edge share the cut.
  const mantleWeight=p=>{const t=clamp((Math.abs(p.x)-.12)/.19)*.85;return [['chest',1-t],['upperarm'+(p.x>0?'l':'r'),t]];};
  const mantleSculpt=(p,a)=>{const t=clamp((1.53-p.y)/.32);p.y+=t*(Math.abs(Math.sin(a))*.215+.012*Math.sin(a));p.z+=.008*Math.sin(a*7)*t;};
  const mantleRows=[[1.195,.32,.194],[1.28,.295,.18],[1.4,.25,.128],[1.5,.10,.078],[1.53,.063,.068]];
  surface(mantleRows.map(([y,x,z])=>[y-.005,x-.004,z-.004]),'red',mantleWeight,{start:.39,end:Math.PI*2-.39,segments:background?36:64,folds:.035,sculpt:mantleSculpt});
  surface(mantleRows,'plain',mantleWeight,{start:.39,end:Math.PI*2-.39,segments:background?36:64,folds:.035,sculpt:mantleSculpt});
  surface([[1.19,.322,.197],[1.201,.322,.197]],'gold',mantleWeight,{start:.39,end:Math.PI*2-.39,segments:background?36:64,sculpt:mantleSculpt});
  surface([[1.07,.164,.125],[1.103,.163,.125]],'gold',rigid('spine'));
  ellipsoid([0,1.084,.132],[.03,.027,.012],'gold','spine');
  ellipsoid([0,1.434,.109],[.028,.031,.01],'gold','chest');
  const starPoints=[.145,1.435,.122],starUV=[.5,.5],starIndices=[];
  for(let i=0;i<=16;i++){const a=i*Math.PI/8,r=i%2?.013:.042;starPoints.push(.145+Math.cos(a)*r,1.435+Math.sin(a)*r,.122);starUV.push(.5+Math.cos(a)*.5,.5+Math.sin(a)*.5);if(i>0)starIndices.push(0,i,i+1);}
  const starGeometry=new BufferGeometry();starGeometry.setAttribute('position',new Float32BufferAttribute(starPoints,3));starGeometry.setAttribute('uv',new Float32BufferAttribute(starUV,2));starGeometry.setIndex(starIndices);starGeometry.computeVertexNormals();add(starGeometry,'gold',rigid('chest'));

  for(const [side,s] of [['l',1],['r',-1]]){
    // Sewn sleeves in T pose, weighted across the elbow; tailored cuffs conceal joints.
    const g=new BufferGeometry(),p=[],uv=[],ix=[];
    for(let j=0;j<=16;j++){const t=j/16,x=s*(.19+t*.555),radius=(.059+.017*Math.sin(t*Math.PI)+.035*t*t)*(j===0?.72:1);
      for(let i=0;i<=24;i++){const a=i/24*Math.PI*2;const pleat=1+.11*Math.sin(a*7+t*2)*Math.sin(t*Math.PI*.9);p.push(x,1.46+Math.cos(a)*radius*pleat-(.025*Math.sin(t*Math.PI)),Math.sin(a)*radius*pleat);uv.push(i/24*.55,t*.62);}}
    for(let j=0;j<16;j++)for(let i=0;i<24;i++){const a=j*25+i;ix.push(a,a+25,a+1,a+1,a+25,a+26);}g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,'blue',p=>{const t=clamp((Math.abs(p.x)-.43)/.12);return [['upperarm'+side,1-t],['lowerarm'+side,t]];});
    ellipsoid([s*.78,1.455,.0],[.058,.026,.035],'skin','wrist'+side);
    for(let f=0;f<4;f++)cord([[s*.803,1.456,-.032+f*.021],[s*(.855-(f===0?.008:0)),1.445,-.032+f*.021],[s*(.881-(f===0||f===3?.018:0)),1.426,-.03+f*.021]],.008,'skin','hand'+side);
    cord([[s*.78,1.43,.035],[s*.80,1.407,.052],[s*.827,1.41,.054]],.012,'skin','wrist'+side);
    surface([[.10,.061,.061,s*.105,0],[.48,.065,.06,s*.105,0],[.91,.086,.079,s*.105,0]],'ink',p=>[[p.y>.49?'upperleg'+side:'lowerleg'+side,1]]);
    ellipsoid([s*.105,.065,.077],[.067,.052,.145],'ink','foot'+side);
    ellipsoid([s*.105,.052,.19],[.042,.033,.1],'plain','foot'+side);
    cord([[s*.055,.099,.015],[s*.105,.112,.055],[s*.15,.092,.13]],.005,'gold','foot'+side);
  }
  // One sculpted facial surface: cheek planes, sockets and the bridge/tip
  // of the nose are continuous geometry, not separate balls on an oval head.
  const faceRows=[[1.515,.036,.036],[1.56,.037,.04],[1.584,.044,.051],[1.606,.065,.061],[1.636,.077,.068],[1.667,.086,.073],[1.698,.087,.077],[1.727,.086,.077],[1.762,.083,.077],[1.795,.061,.059],[1.818,0,0]];
  const gaussian=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
  surface(faceRows,'skin',rigid('head'),{segments:background?48:96,density:background?.012:.006,sculpt:(p,a)=>{
    const front=Math.max(0,Math.cos(a));
    p.z+=front**8*(.034*gaussian(p.x,0,.014)*gaussian(p.y,1.67,.037)+.016*gaussian(p.x,0,.015)*gaussian(p.y,1.65,.013));
    p.z-=front**6*.010*gaussian(Math.abs(p.x),.036,.022)*gaussian(p.y,1.695,.013);
    p.z+=front**5*.012*gaussian(Math.abs(p.x),.053,.029)*gaussian(p.y,1.661,.02);
    p.z+=front**8*.009*gaussian(p.x,0,.03)*gaussian(p.y,1.624,.014);
  }});
  for(const side of [-1,1]){
    ellipsoid([side*.083,1.67,-.003],[.012,.026,.018],'skin','head');
    ellipsoid([side*.035,1.697,.072],[.018,.0045,.005],'eyeWhite','head');
    ellipsoid([side*.033,1.697,.077],[.0054,.0042,.0018],'eyeIris','head');
    ellipsoid([side*.033,1.697,.079],[.0024,.0032,.0008],'eyePupil','head');
    cord([[side*.016,1.697,.077],[side*.033,1.704,.079],[side*.052,1.699,.068]],.0008,'eyeLash','head');
    cord([[side*.016,1.695,.077],[side*.034,1.69,.077],[side*.052,1.699,.068]],.0008,'skin','head');
    cord([[side*.017,1.716,.073],[side*.036,1.72,.075],[side*.057,1.714,.064]],.0011,'ink','head');
    cord([[side*.006,1.644,.096],[side*.012,1.643,.092]],.0007,'lips','head');
  }
  cord([[-.02,1.624,.072],[-.009,1.628,.078],[0,1.626,.081],[.01,1.628,.078],[.02,1.624,.072]],.0009,'lips','head');
  cord([[-.016,1.623,.074],[0,1.619,.08],[.016,1.623,.074]],.0011,'lips','head');
  // Flattened, tapering locks with uneven parting and S-shaped flow. Each
  // strand has a rounded cross-section, so it remains volumetric in profile.
  function lock(path,width,depth,phase){
    const curve=new CatmullRomCurve3(path.map(p=>V(...p))),pos=[],uv=[],ix=[],steps=background?12:24;
    for(let j=0;j<=steps;j++){const t=j/steps,c=curve.getPoint(t),tangent=curve.getTangent(t),normal=V(c.x,0,c.z).normalize(),across=new Vector3().crossVectors(tangent,normal).normalize(),taper=Math.max(.025,Math.sin((.13+t*.87)*Math.PI)**.6);
      for(let i=0;i<=8;i++){const a=i/8*Math.PI*2;const p=c.clone().addScaledVector(across,Math.cos(a)*width*taper).addScaledVector(normal,Math.sin(a)*depth*taper);pos.push(p.x,p.y,p.z);uv.push(i/8,t);}}
    for(let j=0;j<steps;j++)for(let i=0;i<8;i++){const a=j*9+i;ix.push(a,a+9,a+1,a+1,a+9,a+10);}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();add(g,'hair',p=>{const t=clamp((1.735-p.y)/.26)*.65;return [['head',1-t],[p.x>0?'tressl':'tressr',t]];});
  }
  surface([[1.68,.091,.079],[1.73,.09,.084],[1.77,.082,.081],[1.8,.058,.06],[1.817,0,0]],'hair',rigid('head'),{start:.66,end:Math.PI*2-.66,segments:background?32:64,density:.012});
  const lockCount=background?19:37;
  for(let i=0;i<lockCount;i++){
    const a=.64+i/(lockCount-1)*(Math.PI*2-1.28),sx=Math.sin(a),sz=Math.cos(a),wave=Math.sin(i*2.3),length=.04*Math.sin(i*1.3);
    lock([[sx*.058,1.805,sz*.06],[sx*.084,1.757,sz*.083],[sx*(.092+.006*wave),1.695,sz*.087],[sx*(.116+.012*wave),1.625,sz*.101],[sx*(.113-.009*wave),1.566,sz*.111],[sx*(.139+.013*wave),1.508+length,sz*.12],[sx*.119,1.467+length,sz*.108]],.013+(i%3)*.003,.004,i);
  }
  // Cloth mitre: two soft tapered peaks, backed by a falling veil.
  surface([[1.78,.095,.083],[1.87,.10,.084],[1.98,.089,.077],[2.10,.060,.051],[2.23,.009,.012]],'plain',rigid('head'),{segments:32,folds:.02});
  surface([[1.82,.064,.063,0,-.055],[1.98,.055,.055,.028,-.06],[2.13,.038,.035,.048,-.055],[2.22,.002,.003,.065,-.05]],'plain',rigid('head'),{segments:24});
  surface([[1.79,.098,.086],[1.83,.101,.087]],'gold',rigid('head'));
  panel('plain',-.071,.071,1.42,1.90,-.15,-.086,rigid('head'));
  // Crescent ornament is an actual strip of geometry, with an open cutout.
  const cp=[],cu=[],ci=[];
  for(let i=0;i<=40;i++){const t=i/40,outer=1.201+t*(Math.PI*2-2*1.201),inner=1.686+t*(Math.PI*2-2*1.686);cp.push(Math.cos(outer)*.049,1.88+Math.sin(outer)*.049,.09,.023+Math.cos(inner)*.046,1.88+Math.sin(inner)*.046,.09);cu.push(t,0,t,1);}
  for(let i=0;i<40;i++){const a=i*2;ci.push(a,a+2,a+1,a+1,a+2,a+3);}const cg=new BufferGeometry();cg.setAttribute('position',new Float32BufferAttribute(cp,3));cg.setAttribute('uv',new Float32BufferAttribute(cu,2));cg.setIndex(ci);cg.computeVertexNormals();add(cg,'gold',rigid('head'));
  geometryKit=Object.fromEntries(Object.entries(buckets).map(([key,parts])=>{const geo=mergeGeometries(parts);for(const p of parts)p.dispose();return [key,geo];}));
  geometryKits.set(background,geometryKit);
  }
  const kit=new Group();kit.name='Celestial mage — tailored mesh';root.add(kit);
  for(const [key,geo] of Object.entries(geometryKit)){
    const mat=getMaterials()[key];mat.vertexColors=true;
    const mesh=new SkinnedMesh(geo,mat);mesh.name='Celestial_'+key;mesh.bind(skeleton);mesh.frustumCulled=false;mesh.castShadow=!background;mesh.receiveShadow=true;if(background)mesh.layers.set(1);kit.add(mesh);
  }
  const retarget=clip=>{
    const result=clip.clone();
    for(const track of result.tracks){
      // Bake the relaxed stance into locomotion clips. Applying an offset
      // after the mixer would accumulate on constant animation tracks.
      if(/^(Idle|Walking|Running)/.test(clip.name)&&/^upperarm[lr]\.quaternion$/.test(track.name)){
        const side=track.name.slice(8,9),elbow=rest.get('lowerarm'+side),q=new Quaternion(),aim=new Quaternion(),direction=new Vector3(),target=new Vector3();
        for(let i=0;i<track.values.length;i+=4){q.fromArray(track.values,i);direction.copy(elbow).applyQuaternion(q).normalize();target.copy(direction);target.x*=.58;target.y-=.30;target.normalize();aim.setFromUnitVectors(direction,target);q.premultiply(aim).toArray(track.values,i);}
      }

      if(!track.name.endsWith('.position'))continue;
      const name=track.name.slice(0,-9),old=oldPositions.get(name),next=rest.get(name);if(!old||!next)continue;
      const ratio=name==='hips'?(.88/.40566343):old.length()>1e-5?next.length()/old.length():1;
      for(let i=0;i<track.values.length;i+=3){track.values[i]=next.x+(track.values[i]-old.x)*ratio;track.values[i+1]=next.y+(track.values[i+1]-old.y)*ratio;track.values[i+2]=next.z+(track.values[i+2]-old.z)*ratio;}
    }
    return result;
  };
  // Each character owns its expression; shared geometry is never mutated.
  const eyes=kit.children.filter(mesh=>mesh.name.startsWith('Celestial_eye'));
  const blinkPeriod=3.4+(instanceCount++%7)*.37;
  let time=0,turn=0,lastHeading=null;
  let blinkTime=(instanceCount*.713)%blinkPeriod;
  const update=(dt,animation)=>{
    dt=Math.max(0,Math.min(dt,.05));time+=dt;
    blinkTime=(blinkTime+dt)%blinkPeriod;
    const blink=blinkTime<.24?Math.sin(Math.PI*blinkTime/.24)**2:0;
    for(const eye of eyes)eye.morphTargetInfluences[0]=blink;
    const heading=root.rotation.y+(root.parent?.rotation.y||0);
    let delta=lastHeading===null?0:Math.atan2(Math.sin(heading-lastHeading),Math.cos(heading-lastHeading));lastHeading=heading;
    const wanted=dt>0?Math.max(-.10,Math.min(.10,-delta*.18/dt)):0;
    turn+=(wanted-turn)*(1-Math.exp(-dt*8));
    for(let i=0;i<secondary.length;i++){
      const bone=secondary[i],hair=i>1,moving=/Walking|Running/.test(animation||'');
      bone.rotation.z=(hair?turn*.55:turn)+Math.sin(time*(moving?5:1.5)+i*1.7)*(hair?.009:moving?.018:.006);
      bone.rotation.x=Math.sin(time*2+i)*.007;
    }

  };
  root.userData.celestialMage={bodyHeight:1.818,totalHeight:2.23,textiles:!!textileMaps,retarget,update,dispose:()=>{skeleton.dispose();}};
  return root.userData.celestialMage;
}
