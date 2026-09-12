/** Inspect the surviving castle roof and courtyard at construction scale. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from 'playwright';
import { captureWorld } from './capture-world.mjs';
import { skyAt } from './sky.mjs';
import { PLACE } from './place.mjs';
const root=resolve('dist'),out=resolve(process.argv[2]||'.local/castle/review');
const data=JSON.parse(await readFile('state/settlement.json','utf8'));
data.people=[];data.sky=skyAt(new Date('2026-09-12T20:00:00Z'),PLACE.lat,PLACE.lon);
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
 const shots=[{name:'hall-roof',distance:36,x:-59,z:-47,polar:.45,az:-1.25},{name:'courtyard',distance:30,x:-53,z:-45,polar:.5,az:1.4}];
 for(const v of shots){
  const target={x:v.x,z:v.z};
  await page.evaluate(({v,target,rot})=>{
   const w=window.__world;w.walk.exit();w.rig.controls.minDistance=3;w.look(v.distance,target.x,target.z);w.rig.autoTilt=false;
   w.rig.setDistance(v.distance,v.polar);const t=w.rig.target,c=w.stage.camera;
   c.position.x=t.x+Math.sin(rot+v.az)*Math.sin(v.polar)*v.distance;c.position.z=t.z+Math.cos(rot+v.az)*Math.sin(v.polar)*v.distance;
   w.rig.controls.update();
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
 const stats=await page.evaluate(()=>window.__world.stats());
 await writeFile(join(out,'report.json'),JSON.stringify({stats,errors},null,2));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('Castle review passed',JSON.stringify(stats));
}finally{await browser?.close();server.close();}
