/** Focused browser evidence for occupations; never mutates settlement memory. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(process.argv[2]||'dist'),out=resolve(process.argv[3]||'.local/work-review');
await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.png':'image/png','.css':'text/css'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}const b=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.platform==='darwin'?'chromium':undefined});
try {
 const page=await browser.newPage({viewport:{width:1100,height:750}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.__world);
 // Streaming and rig setup do not need hundreds of expensive GPU renders.
 await page.evaluate(()=>{const w=window.__world;w.look(24,0,0);window._render=w.stage.renderer.render;w.stage.renderer.render=()=>{};});
 for(let i=0;i<200;i++) {
   const ready=await page.evaluate(()=>{const w=window.__world;w.step(2);return w.folk.ready&&w.folk.folk.length>0&&!w.folk.workQueue?.length&&!w.folk._planning&&w.terrain.pendingVisible===0;});
   if(ready)break;
   await new Promise(r=>setTimeout(r,100));
 }
 const result=await page.evaluate(async()=>{
   const w=window.__world,folk=w.folk;
   const start=performance.now();let minGap=Infinity,obstructed=0;
   for(let i=0;i<4800;i++) {
     folk.tick((folk._elapsed||0)+.064);
     if(folk._planning){const limit=performance.now()+15000;while(folk._planning){await new Promise(r=>setTimeout(r,1));if(performance.now()>limit)throw Error('Planner timed out');}}
     const bodies=folk.folk.map(f=>f.char.root.position);
     for(let a=0;a<bodies.length;a++) {
       const p=bodies[a];if(i%60===0&&w.blocked(p.x,p.z,.55))obstructed++;
       for(let b=a+1;b<bodies.length;b++)if(Math.abs(p.y-bodies[b].y)<1.6)minGap=Math.min(minGap,Math.hypot(p.x-bodies[b].x,p.z-bodies[b].z));
     }
   }
   if(minGap<1.099||obstructed)throw Error(JSON.stringify({minGap,obstructed}));
   console.log('Collision audit',minGap,obstructed);
   const citizens=folk.folk.map(f=>({id:f.identity,job:f.job?{x:f.job.x,z:f.job.z,phase:f.job.phase,work:f.job.work,delivery:f.job.delivery}:null,occupation:f.job?.occupation,waypoint:f.job?.waypoint,routeAge:f.routeAge,rerouted:f.rerouted,to:f.job?.[f.job?.phase==='outbound'?'route':'returnRoute']?.[f.job?.waypoint],workplace:f.job?.target.kind,phase:f.job?.phase,delivered:f.job?.delivered,animation:f.char.animation,position:f.char.root.position.toArray()}));
   w.stage.renderer.render=window._render;w.step(1);
   return {minGap,obstructed,citizens,simulationMs:performance.now()-start};
 });
 await writeFile(resolve(out,'evidence.json'),JSON.stringify({...result,errors},null,2));
 console.log('Audit',JSON.stringify({minGap:result.minGap,obstructed:result.obstructed,assigned:result.citizens.filter(c=>c.occupation).length,delivered:result.citizens.filter(c=>c.delivered>0).length}));
 for(const kind of ['Witch','Wizard','Starfarer']) {
   await page.evaluate(k=>{const w=window.__world;w.walk.enter();w.walk.setCharacter(k);w.walk.distance=3.4;w.walk.yaw=Math.PI;w.walk.pitch=.12;w.walk.tick(0,true);w.stage.renderer.render(w.stage.scene,w.stage.camera);},kind);
   await page.screenshot({path:resolve(out,kind+'.png'),timeout:180000});
 }
 await page.evaluate(()=>window.__world.walk.exit());
 for(const [name,distance,x,z] of [['stone',24,0,0],['overview',95,-22,-12]]) {
   await page.evaluate(([d,x,z])=>{const w=window.__world;w.look(d,x,z);w.step(1);},[distance,x,z]);
   await page.screenshot({path:resolve(out,name+'.png'),timeout:180000});
 }
 await writeFile(resolve(out,'evidence.json'),JSON.stringify({...result,errors},null,2));
 console.log(JSON.stringify({count:result.citizens.length,assigned:result.citizens.filter(c=>c.occupation).length,delivered:result.citizens.filter(c=>c.delivered>0).length,simulationMs:result.simulationMs,errors}));
 if(errors.length)throw Error(errors.join('\n'));
 if(result.citizens.some(c=>c.occupation)&&result.citizens.some(c=>!c.occupation||!c.delivered||(c.occupation==='farmer'&&c.workplace!=='building_grain')))throw Error('A worker did not complete a delivery');
} finally {await browser.close();server.close();}
