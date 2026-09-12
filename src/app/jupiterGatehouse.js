/** The gatehouse plan: openings, occupied ground, and ornament share one ruler. */
import {smoothHeightAt} from './terrain.js';
import {buildPalaceCauseway} from './palaceCauseway.js';
export function buildJupiterGatehouse(parts, floors, buildings, seat, gate) {
  const f=seat.floor, x=gate.x, z=gate.z;
  const add=p=>parts.push({solid:false,rot:0,...p,section:'Jupiter gatehouse'});
  const box=(name,x,y,z,w,h,d,material='dressed',solid=false,rot=0)=>add({shape:'box',name,x,y,z,w,h,d,material,solid,rot});
  const feature=(shape,name,x,y,z,w,h,d,material,extra={})=>add({shape,name,x,y,z,w,h,d,material,...extra});
  const facade=(name,cx,cz,w,h,holes=[],rot=0)=>{
    feature('facade',name,cx,f,cz,w,h,.72,'ashlar',{holes,rot});
    // Only the ground-level doorway changes the footprint. Upper glazing is overhead.
    const door=holes.find(p=>p.bottom===0), spans=door?[[-w/2,door.x-door.w/2],[door.x+door.w/2,w/2]]:[[-w/2,w/2]];
    for(const [a,b] of spans){const u=(a+b)/2;add({shape:'box',name:`${name} footing collision`,x:cx+u*Math.cos(rot),y:f+1,z:cz-u*Math.sin(rot),w:b-a,h:2,d:.72,material:'ashlar',solid:true,rot,collisionOnly:true});}
  };
  const frame=(name,cx,bottom,cz,w,h,rot=0,door=false)=>{
    for(let layer=0;layer<3;layer++)feature('gothicFrame',name,cx,bottom-.025*layer,cz+Math.cos(rot)*layer*.085,w+layer*.22,h+layer*.13,.12,'carved',{rot,thickness:.065+layer*.013,noSill:door,offsetX:Math.sin(rot)*layer*.085});
  };
  const window=(name,cx,bottom,cz,w,h,rot=0)=>{
    frame(`${name} archivolt`,cx,bottom,cz,w,h,rot);
    feature('pane',`${name} recessed leaded glass`,cx,bottom,cz-.25*Math.cos(rot),w,h,.02,'leadedGlass',{rot,offsetX:-.25*Math.sin(rot)});
    for(const side of [-1,1])box(`${name} mullion`,cx+Math.cos(rot)*side*w*.17,f+(bottom-f)+h*.33,cz-Math.sin(rot)*side*w*.17,.052,h*.65,.1,'carved',false,rot);
    feature('rosette',`${name} trefoil`,cx,bottom+h*.74,cz+.04,w*.49,w*.49,.075,'carved',{rot,petals:3});
    box(`${name} projecting sill`,cx,bottom-.1,cz+.12*Math.cos(rot),w+.46,.16,.62,'carved',false,rot);
  };
  const front=z+.15, back=z-5.2;
  const holes=[{x:0,bottom:0,w:5.2,h:5.9},{x:0,bottom:6.65,w:2.45,h:4.55},
    ...[-4.65,4.65].flatMap(u=>[{x:u,bottom:1.45,w:1.25,h:2.7},{x:u,bottom:6.7,w:1.35,h:3.25}])];
  facade('Jupiter gatehouse front',x,front,13.7,12.15,holes);
  facade('Jupiter gatehouse rear',x,back,13.7,12.15,[{x:0,bottom:0,w:5.2,h:5.9},{x:0,bottom:7,w:2.4,h:3.6}]);
  facade('Jupiter gatehouse west',x-6.85,(front+back)/2,5.35,12.15,[],Math.PI/2);
  facade('Jupiter gatehouse east',x+6.85,(front+back)/2,5.35,12.15,[{x:0,bottom:2,w:1.15,h:2.6},{x:0,bottom:7,w:1.3,h:3.1}],Math.PI/2);
  floors.push({x,z:(front+back)/2,w:13.7,d:5.35,y:f});
  buildings.push({id:'Jupiter gatehouse',kingdom:seat.id,x,z:(front+back)/2,w:13.7,d:5.35,floor:f,height:12.15,door:5.2});
  box('Gate passage floor',x,f-.08,(front+back)/2,13.7,.16,5.35,'floor');
  frame('Deep gate portal',x,f,front+.4,5.2,5.9,0,true);
  frame('Courtyard gate portal',x,f,back-.4,5.2,5.9,Math.PI,true);
  for(const dz of [front-.5,z-2.5,back+.5])frame('Gate passage vault rib',x,f,dz,5.2,5.9,0,true);
  feature('vault','Stone barrel vault',x,f+3.2,(front+back)/2,5.2,2.7,5.35,'carved');
  // A raised portcullis leaves full walking clearance through the arch.
  for(let i=-5;i<=5;i++)box('Raised iron portcullis bar',x+i*.43,f+5.7,front-.35,.045,2.7,.07,'iron');
  for(const y of [5.4,6.2,6.9])box('Portcullis cross strap',x,f+y,front-.35,4.6,.07,.09,'iron');
  for(const opening of holes.filter(h=>h.bottom>0))window('Gatehouse window',x+opening.x,f+opening.bottom,front+.37,opening.w,opening.h);
  window('Gatehouse courtyard window',x,f+7,back-.37,2.4,3.6,Math.PI);
  window('Gatehouse east lower window',x+7.22,f+2,(front+back)/2,1.15,2.6,Math.PI/2);
  window('Gatehouse east upper window',x+7.22,f+7,(front+back)/2,1.3,3.1,Math.PI/2);
  // Tall stepped piers carry the façade and its pinnacles, with sloping weather caps.
  for(const u of [-6.75,-3.05,3.05,6.75]) {
    feature('buttress','Gatehouse stepped buttress',x+u,f,front+.57,1.0,12.5,1.7,'ashlar');
    for(const y of [.4,3.8,6.3,9.9,12.3])box('Buttress molded course',x+u,f+y,front+.65,1.12,.16,1.85,'carved');
    feature('spire','Gatehouse crocketed pinnacle',x+u,f+12.55,front+.5,.82,2.7,.82,'carved');
    feature('finial','Pinnacle leaf finial',x+u,f+15.25,front+.5,.22,.55,.22,'carved');
  }
  for(const y of [5.95,11.65,12.15])box('Gatehouse continuous cornice',x,f+y,front+.47,13.6,.19,.35,'carved');
  // Quiet repeated blind niches give the upper frieze a rhythm at human scale.
  for(let i=-7;i<=7;i++)if(Math.abs(i)>2)frame('Gatehouse blind arcade',x+i*.79,f+10.55,front+.38,.45,.65);
  feature('gableWall','Gatehouse stone gable',x,f+12.15,front,13.7,5.2,.72,'ashlar',{oculus:{y:1.95,r:.62}});
  feature('slateRoof','Gatehouse slate roof',x,f+12.1,z-2.5,14.3,5.4,6.25,'slate');
  for(const side of [-1,1])feature('beam','Gable carved coping',x+side*3.53,f+14.84,front+.42,.19,8.85,.28,'carved',{tilt:side*Math.atan(7.05/5.4)});
  feature('rosette','Gatehouse celestial rose',x,f+14.1,front+.42,1.35,1.35,.16,'carved',{petals:8});
  feature('disc','Celestial rose dark glazing',x,f+14.1,front+.28,1.18,1.18,.03,'leadedGlass');
  for(const side of [-1,1])frame('Gable lancet carving',x+side*2.1,f+12.55,front+.39,.84,1.6);
  // Paired roof dormers and cast-metal ridge details break the uninterrupted roof planes.
  for(const side of [-1,1])for(const dz of [-1.0,-4.1]){
    const cx=x+side*4.2,cz=z+dz,rot=side*Math.PI/2;
    feature('dormer','Gatehouse roof dormer',cx,f+14.0,cz,1.1,1.6,1.3,'carved',{rot});
  }
  feature('beam','Copper roof ridge',x,f+17.55,z-2.5,.13,6.5,.14,'copper',{tilt:Math.PI/2,axis:'x'});
  feature('finial','Gatehouse Jupiter finial',x,f+17.55,front,.35,1.2,.35,'gold');

  // An inhabited observatory rises beside the gate, with a continuous circular shell.
  const tx=x-11.25,tz=z-5.8,r=2.95,th=17.4;
  feature('towerShell','Jovian observatory drum',tx,f,tz,r*2,th,r*2,'ashlar',{r,thickness:.6,stories:[{y:4.1,h:2.1},{y:8.1,h:2.5},{y:12.4,h:2.6}],door:{w:2.2,h:3}});
  floors.push({x:tx,z:tz,w:r*2,d:r*2,y:f});buildings.push({id:'Jovian observatory',kingdom:seat.id,x:tx,z:tz,w:r*2,d:r*2,floor:f,height:th,door:2.2});
  box('Observatory floor',tx,f-.09,tz,r*2,.18,r*2,'floor');
  for(let i=0;i<48;i++){
    const a=i/48*Math.PI*2;if(Math.abs(Math.sin(a)*r)<1.25&&Math.cos(a)>.8)continue;
    add({shape:'box',name:'Observatory footing collision',x:tx+Math.sin(a)*r,y:f+1,z:tz+Math.cos(a)*r,w:.42,h:2,d:.62,material:'ashlar',solid:true,rot:a,collisionOnly:true});
  }
  for(const y of [.25,3.5,7.5,11.9,16.15,17.2])feature('moldingRing','Observatory carved belt',tx,f+y,tz,r*2+.3,.28,r*2+.3,'carved',{profile:'belt'});
  for(const story of [{y:4.1,h:2.1},{y:8.1,h:2.5},{y:12.4,h:2.6}])for(let i=0;i<8;i++){
    const a=i*Math.PI/4,cx=tx+Math.sin(a)*(r+.04),cz=tz+Math.cos(a)*(r+.04);
    window('Observatory lancet',cx,f+story.y,cz,.82,story.h,a);
  }
  frame('Observatory doorway',tx,f,tz+r+.12,2.2,3,0,true);
  feature('moldingRing','Observatory corbelled eaves',tx,f+17.3,tz,r*2+.85,.55,r*2+.85,'carved',{profile:'eave'});
  for(let i=0;i<32;i++){
    const a=i*Math.PI/16;feature('corbel','Observatory carved corbel',tx+Math.sin(a)*(r+.07),f+16.7,tz+Math.cos(a)*(r+.07),.25,.7,.6,'carved',{rot:a});
  }
  feature('spire','Observatory flared slate spire',tx,f+17.85,tz,7.15,9.1,7.15,'slate',{profile:'bell'});
  for(let i=0;i<8;i++)feature('roofRib','Observatory copper roof seam',tx,f+17.85,tz,7.15,9.1,7.15,'copper',{angle:i*Math.PI/4,profile:'bell'});
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;feature('dormer','Observatory tall dormer',tx+Math.sin(a)*2.8,f+19,tz+Math.cos(a)*2.8,1.0,1.8,1.05,'carved',{rot:a});
  }
  feature('finial','Observatory celestial finial',tx,f+26.9,tz,.42,1.8,.42,'gold');

  // A sheltered, genuinely open arcade connects the observatory to the gate.
  for(let i=0;i<2;i++){
    const cx=x-8.45,cz=z-2.7-i*2.4;
    feature('gothicFrame','Observatory connecting arcade',cx,f,cz,2.05,3.7,.5,'carved',{thickness:.2,noSill:true});
  }
  for(const dx of [-9.7,-7.2])box('Arcade stone pier',x+dx,f+1.5,z-3.9,.38,3,3.0,'ashlar',true);
  feature('slateRoof','Observatory gallery canopy',x-8.45,f+3.9,z-3.9,3.1,1.4,4.0,'slate');
  // Two inhabited watch alcoves furnish the passage without narrowing the route.
  for(const side of [-1,1]){
    box('Gatekeeper oak bench',x+side*4.5,f+.45,z-2.8,1.6,.22,.65,'wood',true);
    for(const dx of [-.57,.57])box('Bench carved foot',x+side*4.5+dx,f+.2,z-2.8,.17,.4,.58,'wood');
    box('Gatekeeper oak chest',x+side*5.6,f+.42,z-4.3,1.1,.84,.7,'wood',true);
  }
  // Battered footings bridge the irregular rock and level occupied rooms.
  for(const u of [-4.85,4.85]){
    const height=Math.max(.65,f-smoothHeightAt(x+u,front)+.22);
    box('Gatehouse exposed foundation',x+u,f-height/2,front,3.8,height,.91,'ashlar',true);
  }
  buildPalaceCauseway(parts,gate,f);
}
