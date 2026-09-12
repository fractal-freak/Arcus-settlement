/** Original carved colossus, authored at monumental world scale (not a resized kit asset). */
import { Group, Mesh, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute, SphereGeometry, BoxGeometry, CatmullRomCurve3, TubeGeometry, Vector3, Color } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { weatheredMaterial } from './villageMaterials.js';
import { HERMES, hermesWorld } from '../app/hermes.js';
import { smoothHeightAt } from '../app/terrain.js';

export function buildHermes() {
  const root = new Group(); root.name = 'Hermes — The Buried Messenger';
  root.position.set(HERMES.x, 0, HERMES.z); root.rotation.y = HERMES.rot;
  const batches = new Map();
  const materials = {
    marble: new MeshStandardMaterial({ color: 0xaaa28e, roughness: 0.94, vertexColors: true }),
    dark: new MeshStandardMaterial({ color: 0x686153, roughness: 1, vertexColors: true }),
    soil: new MeshStandardMaterial({ color: 0x796044, roughness: 1, vertexColors: true }),
    wood: new MeshStandardMaterial({ color: 0x77604a, roughness: 1, vertexColors: true }),
    rope: new MeshStandardMaterial({ color: 0xbba781, roughness: 1, vertexColors: true }),
  };
  materials.marble = weatheredMaterial(materials.marble, 'rock');
  const stoneShader = materials.marble.onBeforeCompile;
  materials.marble.onBeforeCompile = shader => {
    stoneShader(shader);
    // This sculpture is authored in world units, unlike the five-times-scaled kit.
    shader.fragmentShader = shader.fragmentShader.replace('surfaceUV*=2.5;', 'surfaceUV*=0.5;')
      .replace('mix(scan,vec3(luma),.65)*original*(.78+grain*.22)',
        'original*mix(vec3(.88),vec3(luma),.28)*(.9+grain*.1)')
      .replace('texture2D(uRockHeight,surfaceUV).r*.055', 'texture2D(uRockHeight,surfaceUV).r*.012');
  };
  materials.marble.customProgramCacheKey = () => 'hermes-carved-limestone-v1';
  function add(g, kind = 'marble') {
    const p = g.attributes.position, colors = [];
    for (let i = 0; i < p.count; i++) {
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
      // Age gathers underneath the sculpture, in recesses, and along the burial line.
      const stain = Math.min(1, Math.max(0, (y-0.45)/2.6));
      const variation = 0.94 + 0.035*Math.sin(x*8+z*5)*Math.sin(y*13+z*3);
      const c = new Color().setRGB((0.70+0.30*stain)*variation,(0.67+0.33*stain)*variation,(0.62+0.38*stain)*variation);
      colors.push(c.r,c.g,c.b);
    }
    g.setAttribute('color', new Float32BufferAttribute(colors,3));
    // Keep all batch attributes identical, including geometries authored below.
    g.deleteAttribute('uv');
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push(g.index ? g.toNonIndexed() : g);
  }
  function ellipsoid(x,y,z,rx,ry,rz,kind='marble',rot=0) {
    const g=new SphereGeometry(1,24,16); if(kind==='soil') {
      const p=g.attributes.position;
      for(let i=0;i<p.count;i++) {const a=p.getX(i),b=p.getY(i),c=p.getZ(i),r=1+.12*Math.sin(a*17+c*13)*Math.sin(b*11+c*7);p.setXYZ(i,a*r,b*r,c*r);}
      g.computeVertexNormals();
    }
    g.scale(rx,ry,rz); g.rotateY(rot); g.translate(x,y,z); add(g,kind);
  }
  function box(x,y,z,w,h,d,kind='wood',rot=0) {
    const g=new BoxGeometry(w,h,d); g.rotateY(rot); g.translate(x,y,z); add(g,kind);
  }
  function stroke(points,r,kind='marble',sides=8) {
    add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),Math.max(12,points.length*6),r,sides,false),kind);
  }
  // Sculpted cross sections: broad shoulders, waist, hips, thigh and calf profiles.
  function carve(sections,segments=32) {
    const verts=[], indices=[];
    sections.forEach(([x,y,z,rx,ry],row)=>{
      for(let j=0;j<=segments;j++) {
        const a=j/segments*Math.PI*2;
        const flute=1+0.018*Math.cos(a*6+row*0.7);
        verts.push(x+Math.cos(a)*rx*flute,y+Math.sin(a)*ry*flute,z);
      }
    });
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<segments;j++) {
      const a=i*(segments+1)+j,b=a+segments+1; indices.push(a,a+1,b,b,a+1,b+1);
    }
    const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(verts,3));g.setIndex(indices);g.computeVertexNormals();add(g);
  }
  carve([[0,0.55,-5.1,.8,.7],[0,.7,-4.6,2.3,1.2],[0,.65,-3.8,3.35,1.75],[0,.55,-2.5,3.15,1.85],[0,.45,-.8,2.45,1.6],[0,.4,.9,2.25,1.35],[0,.25,2.6,2.85,1.4],[0,.1,4,2.55,1.2],[0,.05,4.3,.1,.1]]);
  // Paired pectorals and a quiet sternum give the chest a human reading.
  ellipsoid(-1.45,1.6,-2.95,1.5,.62,1.3);ellipsoid(1.45,1.6,-2.95,1.5,.62,1.3);
  stroke([[-2.8,1.65,-4],[-1.5,2,-4.1],[0,1.8,-3.95],[1.5,2,-4.1],[2.8,1.65,-4]],.16);
  carve([[-2.9,.7,-4,.6,.6],[-3.8,.5,-3,1,.95],[-4.05,.4,-1,1,.86],[-4.15,.25,.1,.72,.7],[-4.45,.1,1.8,.85,.7],[-4.2,.05,3.6,.55,.5]]);
  ellipsoid(-4.1,.25,3.8,.72,.48,1.12);
  for(let i=0;i<4;i++) stroke([[-4.6+i*.3,.56,3.8],[-4.55+i*.29,.5,4.5]],.1,'dark');
  carve([[2.8,.65,-4,.5,.5],[3.7,.7,-3.35,.94,.92],[4.5,.6,-2.1,1,.9],[4.8,.45,-.5,.7,.7],[4.6,.35,.5,.15,.3]]);
  // A fractured forearm lies beside the torso, with a dark, weathered break.
  ellipsoid(5.05,.58,1.85,.66,.52,1.1,'marble',-.45);
  ellipsoid(4.6,.52,.42,.65,.2,.32,'dark');
  for(const side of [-1,1]) {
    carve([[side*1.3,.05,3.5,1.25,1.15],[side*1.45,-.05,4.8,1.3,1.2],[side*1.55,-.15,6.4,.93,1.1],[side*1.6,-.25,7.3,.95,.98],[side*1.55,-.6,8.8,.8,.8],[side*1.5,-1.05,10.6,.5,.6]]);
  }
  // Drapery crosses the hips with irregular carved folds, partly covered in earth.
  for(let i=0;i<8;i++) {
    const z=1.2+i*.35;
    stroke([[-2.5,.65,z-.5],[-1.5,1.36,z],[0,1.6,z+.6],[1.4,1.25,z+.55],[2.7,.5,z+.15]],.17+(i%3)*.035);
  }
  // Neck and idealized classical face, looking upward out of the excavation.
  ellipsoid(0,1,-5.15,1.05,1,1.2);
  ellipsoid(0,1.35,-7.15,1.95,1.65,2.3);
  ellipsoid(0,2.1,-6.15,1.28,.95,1.1); // tapered jaw
  ellipsoid(0,2.15,-5.55,.84,.58,.55); // chin
  ellipsoid(-1,2.6,-7.0,.68,.43,.65);ellipsoid(1,2.6,-7,.68,.43,.65);
  for(const side of [-1,1]) {
    ellipsoid(side*.76,2.89,-7.55,.6,.11,.26,'dark');
    stroke([[side*.22,3,-7.66],[side*.74,3.1,-7.86],[side*1.28,2.88,-7.66]],.15);
    stroke([[side*.3,2.99,-7.42],[side*.78,3.02,-7.37],[side*1.23,2.85,-7.45]],.085);
    ellipsoid(side*1.88,1.9,-7.15,.34,.6,.68);
  }
  // Nose bridge, nostril wings and closed carved lips.
  carve([[0,2.8,-7.9,.19,.1],[0,3.17,-7.5,.26,.36],[0,3.43,-7,.35,.45],[0,3.3,-6.8,.42,.23]]);
  ellipsoid(-.32,3,-6.9,.25,.26,.24);ellipsoid(.32,3,-6.9,.25,.26,.24);
  stroke([[-.6,2.92,-6.28],[0,3,-6.35],[.6,2.92,-6.28]],.075,'dark');
  stroke([[-.56,2.94,-6.4],[0,3.03,-6.47],[.56,2.94,-6.4]],.12);
  stroke([[-.48,2.91,-6.16],[0,2.98,-6.12],[.48,2.91,-6.16]],.11);
  // Curls around the temples; a broad petasos helmet with two feathered wings.
  for(const side of [-1,1])for(let i=0;i<6;i++)ellipsoid(side*(1.72+.10*Math.sin(i)),1.7+i*.13,-6.7-i*.4,.32,.31,.36);
  ellipsoid(0,1.65,-8.7,2.7,.55,1.35);
  ellipsoid(0,1.7,-9.1,1.9,1.35,1.28);
  stroke([[-2.3,2,-8.9],[-1.3,2.65,-8.75],[0,2.8,-8.7],[1.3,2.65,-8.75],[2.3,2,-8.9]],.13);
  for(const side of [-1,1])for(let i=0;i<6;i++) {
    const x=side*(1.65+i*.22), y=2.1+i*.12, z=-8.7-i*.14;
    stroke([[x,y,z],[x+side*.7,y+.75,z-.45],[x+side*(1.15-i*.1),y+1.5-i*.1,z-1.15]],.22-i*.015);
  }
  // Discontinuous dark hairline fractures follow the stone, not random floating scratches.
  stroke([[.3,2.7,-8.72],[.6,2.78,-8.45],[.52,2.97,-8.14],[.73,3.01,-7.94]],.027,'dark');
  stroke([[-2.3,2.07,-2.7],[-1.9,2.23,-2.45],[-1.8,2.18,-2.1],[-1.4,2.05,-1.8]],.025,'dark');
  // Site furniture rests on the same excavated terrain used by walkers.
  function ground(x,z) {const p=hermesWorld(x,z);return smoothHeightAt(p.x,p.z);}
  for(const side of [-1,1]) {
    const x=side*7.7;
    for(const z of [-8,-3,2,7]) {
      const y=ground(x,z); box(x,y+.62,z,.13,1.35,.13);
      if(z<7)stroke([[x,y+1.16,z],[x,ground(x,z+2.5)+.9,z+2.5],[x,ground(x,z+5)+1.16,z+5]],.035,'rope',5);
    }
    for(let i=0;i<4;i++) {
      const z=3+i*1.2,x=side*(10.5+Math.sin(i)*.5),y=ground(x,z);
      ellipsoid(x,y-.12,z,1.3,.65+(i%2)*.25,1.2,'soil');
    }
  }
  // Survey strings across a small unexcavated square beside the shoulder.
  for(let i=0;i<4;i++)stroke([[5.8,ground(5.8,-6)+.12,-6+i],[7.4,ground(7.4,-6)+.12,-6+i]],.014,'rope',4);
  // Timber access boards, low open finds trays and a leaning measuring rod.
  for(let i=0;i<5;i++)box(-6.5,ground(-6.5,7+i*.55)+.06,7+i*.55,1.45,.12,.45);
  for(let i=0;i<3;i++) {
    const x=9.5,z=-4+i*1.6,y=ground(x,z);
    box(x,y+.08,z,1.2,.14,.9);for(const side of [-1,1])box(x+side*.56,y+.22,z,.09,.32,.9);
    for(const side of [-1,1])box(x,y+.22,z+side*.4,1.2,.32,.09);
    ellipsoid(x,y+.22,z,.25,.19,.24);
  }
  // Detached winged sandal emerging at the foot of the excavation.
  ellipsoid(2.0,.65,10.25,.95,.42,1.6,'marble',-.35);
  for(let i=0;i<3;i++)stroke([[2.7,.8,10+i*.25],[3.15,1.15,9.9+i*.25],[3.5,1.35,9.7+i*.25]],.15);
  for(const [kind,geometries] of batches) {
    const merged=mergeGeometries(geometries);const mesh=new Mesh(merged,materials[kind]);
    mesh.name=`Hermes ${kind}`;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    geometries.forEach(g=>g.dispose());
  }
  return root;
}
