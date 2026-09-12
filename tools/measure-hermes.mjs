/** Regenerate the collision profile from the exposed surface of the optimized scan. */
import {readFileSync,writeFileSync} from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Matrix4,Vector3} from 'three';
import '../src/app/digs.js';
import {HERMES_SCAN,hermesWorld} from '../src/app/hermes.js';
import {smoothHeightAt} from '../src/app/terrain.js';
const b=readFileSync(new URL('../public/assets/hermes/belvedere-hermes.glb',import.meta.url));
const gltf=await new Promise((r,j)=>new GLTFLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'',r,j));
gltf.scene.updateMatrixWorld(true);
const bands=new Map();
gltf.scene.traverse(o=>{
 if(!o.isMesh)return;
 const m=new Matrix4().makeTranslation(0,HERMES_SCAN.y,0).multiply(new Matrix4().makeRotationX(HERMES_SCAN.rotX)).multiply(new Matrix4().makeScale(HERMES_SCAN.scale,HERMES_SCAN.scale,HERMES_SCAN.scale)).multiply(o.matrixWorld);
 const p=new Vector3();
 for(let i=0;i<o.geometry.attributes.position.count;i++){
  p.fromBufferAttribute(o.geometry.attributes.position,i).applyMatrix4(m);
  const world=hermesWorld(p.x,p.z);
  if(p.y<smoothHeightAt(world.x,world.z)+.10)continue;
  const z=Math.floor(p.z*2)/2;
  const row=bands.get(z)||{z,minX:Infinity,maxX:-Infinity};
  row.minX=Math.min(row.minX,p.x);row.maxX=Math.max(row.maxX,p.x);bands.set(z,row);
 }
});
const rows=[...bands.values()].sort((a,b)=>a.z-b.z).map(b=>({...b,minX:+(b.minX-.08).toFixed(3),maxX:+(b.maxX+.08).toFixed(3)}));
writeFileSync(new URL('../src/app/hermesFootprint.js',import.meta.url),'/** Measured from SMK KAS1161 after placement; regenerate with tools/measure-hermes.mjs. */\nexport const HERMES_STONE_BANDS = '+JSON.stringify(rows)+';\n');
console.log('Measured',rows.length,'exposed half-unit bands');
