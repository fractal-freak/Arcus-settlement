/** Public-domain museum scan of the Belvedere Hermes, exposed in an authored excavation. */
import { Group, Mesh, MeshStandardMaterial, BufferGeometry, Float32BufferAttribute, SphereGeometry, BoxGeometry, CatmullRomCurve3, TubeGeometry, Vector3, Color, Matrix4, IcosahedronGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { weatheredMaterial } from './villageMaterials.js';
import { HERMES, HERMES_SCAN, HERMES_CHIPS, HERMES_EARTH, hermesWorld } from '../app/hermes.js';
import { makeGroundSurface } from './groundSurface.js';
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
  const earthGrain=makeGroundSurface();
  materials.soil.map=earthGrain;materials.soil.bumpMap=earthGrain;
  materials.soil.bumpScale=.18;
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
  const scannedStone = materials.marble.onBeforeCompile;
  materials.marble.onBeforeCompile = shader => {
    scannedStone(shader);
    shader.fragmentShader = `
      float hermesHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float hermesNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hermesHash(i),hermesHash(i+vec3(1,0,0)),f.x),mix(hermesHash(i+vec3(0,1,0)),hermesHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hermesHash(i+vec3(0,0,1)),hermesHash(i+vec3(1,0,1)),f.x),mix(hermesHash(i+vec3(0,1,1)),hermesHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      // Mineral discoloration varies continuously across the stone. A few
      // larger deposits remain on the upper surface after the soil is brushed off.
      float sedimentNoise=hermesNoise(vKitPosition*.67)*.65+hermesNoise(vKitPosition*2.3)*.35;
      float sediment=smoothstep(.43,.74,sedimentNoise);
      float edgeDirt=1.0-smoothstep(.4,1.65,vKitPosition.y+sedimentNoise*.6);
      diffuseColor.rgb*=mix(vec3(1.0),vec3(.58,.43,.28),sediment*.48+edgeDirt*.25);
    `);
  };
  materials.marble.customProgramCacheKey = () => 'hermes-museum-scan-v2';
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
    if(kind==='soil') {
      const uv=[];for(let i=0;i<p.count;i++)uv.push(p.getX(i)*1.8,p.getZ(i)*1.8);
      g.setAttribute('uv',new Float32BufferAttribute(uv,2));
    }
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
  // SMK's measured scan supplies anatomy, curls, eyes, drapery and real
  // arm fractures. Face upward, with the back and lower legs still in earth.
  root.userData.ready = false;
  new GLTFLoader().load(`${import.meta.env.BASE_URL}assets/hermes/belvedere-hermes.glb`, gltf => {
    gltf.scene.updateMatrixWorld(true);
    const layDown = new Matrix4().makeTranslation(0, HERMES_SCAN.y, 0)
      .multiply(new Matrix4().makeRotationX(HERMES_SCAN.rotX))
      .multiply(new Matrix4().makeScale(HERMES_SCAN.scale, HERMES_SCAN.scale, HERMES_SCAN.scale));
    gltf.scene.traverse(part => {
      if (!part.isMesh) return;
      const g = part.geometry.clone().applyMatrix4(layDown.clone().multiply(part.matrixWorld));
      const p = g.attributes.position, ao = g.attributes.color;
      const colors = [];
      for (let i = 0; i < p.count; i++) {
        const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
        const exposed = Math.max(0, Math.min(1, (y-ground(x,z)) / 1.05));
        const dirt = (1-exposed)**1.5;
        const cavity = ao ? ao.getX(i) : 1;
        const grain = .97 + .03*Math.sin(x*11+z*7)*Math.sin(y*17-z*3);
        colors.push(cavity*grain*(1-dirt*.42), cavity*grain*(1-dirt*.51), cavity*grain*(1-dirt*.63));
      }
      g.setAttribute('color',new Float32BufferAttribute(colors,3));
      const mesh = new Mesh(g, materials.marble);
      mesh.name='Belvedere Hermes — scanned classical marble';mesh.castShadow=true;mesh.receiveShadow=true;
      root.add(mesh);
      part.geometry.dispose();
      for (const m of Array.isArray(part.material)?part.material:[part.material]) m.dispose();
    });
    root.userData.ready=true;
  }, undefined, error => { root.userData.error=String(error); console.error('Hermes scan failed to load',error); });
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
  for (const chip of HERMES_CHIPS) {
    const g=new IcosahedronGeometry(1,0);
    g.scale(chip.r,chip.r*.55,chip.r*.8);g.rotateY(chip.rot);
    g.translate(chip.x,ground(chip.x,chip.z)+chip.r*.18,chip.z);add(g);
  }
  // Angular crumbs and larger broken clods catch real shadows along the work
  // faces, rather than another smooth brown patch beneath the sculpture.
  for(const clod of HERMES_EARTH) {
    const g=new IcosahedronGeometry(1,0);
    g.scale(clod.r,clod.h,clod.r*.72);g.rotateY(clod.rot);
    g.translate(clod.x,ground(clod.x,clod.z)+clod.h*.35,clod.z);add(g,'soil');
  }
  for(const [kind,geometries] of batches) {
    const merged=mergeGeometries(geometries);const mesh=new Mesh(merged,materials[kind]);
    mesh.name=`Hermes ${kind}`;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    geometries.forEach(g=>g.dispose());
  }
  return root;
}
