/** Inspect the stone-to-gatehouse route through the actual walking camera. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from 'playwright';
import {walkingHeightAt} from '../src/app/occupied.js';
import {APPROACH_LENGTH,approachPoint} from '../src/app/jupiterApproach.js';
import { captureWorld } from './capture-world.mjs';
import { skyAt } from './sky.mjs';
import { PLACE } from './place.mjs';
const root=resolve(process.env.WORLD_DIST||'dist'),out=resolve(process.argv[2]||'.local/castle/review');
const data=JSON.parse(await readFile('state/settlement.json','utf8'));
data.now=Date.parse('2026-09-12T20:00:00Z');data.people=[];data.sky=skyAt(new Date('2026-09-12T20:00:00Z'),PLACE.lat,PLACE.lon);
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(req.url.split('?')[0]);
 if(path==='/world/data'||path==='/state/settlement.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return;}
 if(path==='/favicon.ico'){res.writeHead(204).end();return;}
 const file=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{const body=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary'})[extname(file)]||'application/octet-stream');res.end(body);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({channel:process.platform==='darwin'?'chromium':undefined});
 const page=await browser.newPage({viewport:{width:1200,height:950}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;let s=1234;Math.random=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);});
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__world?.stats,null,{polling:100});
 await mkdir(out,{recursive:true});
 const shots=[{name:'stone-departure',x:-18,z:4,tx:-29,tz:7},{name:'village-turn',x:-29,z:6,tx:-36,tz:-3},{name:'castle-arrival',x:-49,z:-7,tx:-55,tz:-25}];
 for(const v of shots){
  v.y=walkingHeightAt(v.x,v.z);
  const target={x:v.x,z:v.z};
  await page.evaluate(({v,target,rot})=>{
   const w=window.__world;w.walk.exit();w.walk.enter();w.walk.position.set(v.x,v.y,v.z);w.walk.move(0,0);w.walk.yaw=Math.atan2(v.x-v.tx,v.z-v.tz);w.walk.pitch=.06;w.walk.tick(0);
  },{v,target,rot:0});
  const deadline=Date.now()+90000;let settled=0;
  while(settled<15){
   const state=await page.evaluate(()=>{const w=window.__world;w.step(1);return{ready:w.startup.complete,pending:w.terrain.pendingVisible};});
   settled=state.ready&&state.pending===0?settled+1:0;
   if(Date.now()>deadline)throw new Error('Castle did not load: '+JSON.stringify({state,errors}));
   await new Promise(r=>setTimeout(r,10));
  }
  await writeFile(join(out,v.name+'.png'),await captureWorld(page));
 }
 const route=Array.from({length:Math.ceil(APPROACH_LENGTH/.1)+1},(_,i)=>{const p=approachPoint(Math.min(APPROACH_LENGTH,i*.1));return {...p,y:walkingHeightAt(p.x,p.z)};});
 const walkCheck=await page.evaluate(points=>{
  const w=window.__world;w.walk.position.set(points[0].x,points[0].y,points[0].z);w.walk.move(0,0);
  let worst=0;
  for(const p of points){w.walk.move(p.x-w.walk.position.x,p.z-w.walk.position.z);worst=Math.max(worst,Math.hypot(p.x-w.walk.position.x,p.z-w.walk.position.z));}
  for(let z=-13;z>=-32;z-=.1){w.walk.move(-55-w.walk.position.x,z-w.walk.position.z);worst=Math.max(worst,Math.hypot(-55-w.walk.position.x,z-w.walk.position.z));}
  return{worst,end:w.walk.position.toArray()};
 },route);
 if(walkCheck.worst>.12)throw new Error('Walk blocked: '+JSON.stringify(walkCheck));
 const stats=await page.evaluate(()=>window.__world.stats());
 await writeFile(join(out,'report.json'),JSON.stringify({stats,errors,walkCheck},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Approach review passed',JSON.stringify({stats,walkCheck}));
}finally{await browser?.close();server.close();}
