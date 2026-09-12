/** Exercise the real character controller, rigs, camera and dialogue in the built world. */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root=resolve('dist'),out=resolve(process.env.PLAYER_EVIDENCE||'.local/player-review');
await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json'};
const server=createServer(async(req,res)=>{
 const path=decodeURIComponent(req.url.split('?')[0]);const file=resolve(root,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(body);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({...(process.platform==='darwin'?{channel:'chromium'}:{}),args:process.platform==='darwin'?[]:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:900,height:600}}),errors=[];
 page.on('pageerror',e=>{errors.push(String(e));console.error('Page error:',String(e));});
 await page.addInitScript(()=>{requestAnimationFrame=()=>0;});
 await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'load'});
 await page.waitForFunction(()=>window.__world?.walk, null, {timeout:90000,polling:100});
 const boot=await page.evaluate(async()=>{
  const w=window.__world,deadline=performance.now()+90000;w.look(34,-4,8);
  while(!w.startup.complete||!w.walk.ready){w.step(1);await new Promise(r=>setTimeout(r,10));if(performance.now()>deadline)throw Error('World startup timed out: '+JSON.stringify({stats:w.stats(),startup:w.startup,errors:w.startup.assetErrors,playerReady:w.walk.ready,peopleReady:w.people.ready,folkReady:w.folk.ready,builtReady:w.built.ready}));}
  return w.stats();
 });
 console.log('Boot',JSON.stringify(boot));
 await page.locator('#walkMode').click();
 const enter=await page.evaluate(()=>{
  const w=window.__world;w.step(1);return {active:w.walk.active,visible:w.walk.group.visible,animation:w.walk.char.animation,position:{...w.walk.position},blocked:w.blocked(w.walk.position.x,w.walk.position.z,.3)};
 });
 assert.equal(enter.active,true);assert.equal(enter.visible,true);assert.equal(enter.blocked,false);
 console.log('Player entry',JSON.stringify(enter));
 assert.equal(await page.locator('#player-help').isVisible(),false);
 await page.locator('#player-help-toggle').press('Space');
 assert.equal(await page.locator('#player-help').isVisible(),true);
 assert.equal(await page.evaluate(()=>window.__world.walk.motion.grounded),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#player-help').isVisible(),false);
 assert.equal(await page.locator('#player-help-toggle').evaluate(el=>el===document.activeElement),true);
 await page.locator('canvas').focus();
 const settle=async()=>page.evaluate(async()=>{const w=window.__world;for(let i=0;i<8;i++){w.step(1);await new Promise(r=>setTimeout(r,5));}});
 await settle();
 await page.screenshot({path:out+'/exploring.png',timeout:180000});
 const walk=await page.evaluate(()=>{
  const w=window.__world,p=w.walk,start={...p.position};
  dispatchEvent(new KeyboardEvent('keydown',{code:'KeyS'}));
  for(let i=0;i<40;i++)p.tick(16);
  dispatchEvent(new KeyboardEvent('keyup',{code:'KeyS'}));w.step(1);
  return {distance:Math.hypot(p.position.x-start.x,p.position.z-start.z),animation:p.char.animation,heading:p.motion.heading};
 });
 assert.ok(walk.distance>.3);assert.equal(walk.animation,'Walking_A');console.log('Walking',JSON.stringify(walk));
 const jump=await page.evaluate(()=>{
  const w=window.__world,p=w.walk;p.clearInput();const y=p.position.y;
  dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));for(let i=0;i<16;i++)p.tick(16);
  dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));w.step(1);
  return {rise:p.position.y-y,grounded:p.motion.grounded,animation:p.char.animation};
 });
 assert.ok(jump.rise>.6);assert.equal(jump.grounded,false);assert.equal(jump.animation,'Jump_Idle');
 await page.screenshot({path:out+'/jumping.png',timeout:180000});
 await page.evaluate(()=>{for(let i=0;i<60;i++)window.__world.walk.tick(16);});
 // Find an actual villager with clear, walkable ground two metres away. This moves only the test player.
 const npc=await page.evaluate(()=>{
  const w=window.__world,p=w.walk;
  for(const f of w.folk.folk)for(let i=0;i<16;i++){
   const a=i*Math.PI/8,at=f.char.root.position,x=at.x+Math.sin(a)*2,z=at.z+Math.cos(a)*2;
   if(w.blocked(x,z,.4))continue;
   p.motion.reset(x,z);p.yaw=a;p.tick(0,true);
   if(p.nearby===f){return {name:f.profile.name,id:f.profile.id,position:{...p.position}};}
  }
  throw Error('No citizen reachable for conversation');
 });
 await page.keyboard.press('e');
 assert.equal(await page.locator('#village-conversation').isVisible(),true);
 await settle();
 const conversation=await page.evaluate(()=>{
  const w=window.__world,p=w.walk,f=p.talking,before=f.char.root.position.clone();
  const start={...p.position};dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));
  for(let i=0;i<3;i++)w.step(1);
  dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));
  return {npcDrift:f.char.root.position.distanceTo(before),playerDrift:Math.hypot(p.position.x-start.x,p.position.z-start.z),choices:document.querySelectorAll('.conversation-choices button').length};
 });
 assert.equal(conversation.npcDrift,0);assert.equal(conversation.playerDrift,0);assert.equal(conversation.choices,5);
 await page.screenshot({path:out+'/conversation.png',timeout:180000});
 await page.getByRole('button',{name:'Talk about the stars',exact:true}).click();
 await page.getByRole('button',{name:'What is your sign?',exact:true}).click();assert.equal(await page.locator('.conversation-choices button').count(),3);
 await page.keyboard.press('2');assert.ok((await page.locator('.conversation-speech').innerText()).includes('birth time'));
 await page.keyboard.press('1');
 await page.getByRole('button',{name:'Talk about the stars',exact:true}).click();
 await page.getByRole('button',{name:'Tell me about the Moon',exact:true}).click();
 assert.ok((await page.locator('.conversation-speech').innerText()).includes('Moon'));
 await page.screenshot({path:out+'/moon-conversation.png',timeout:180000});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__world.step(1));
 await page.screenshot({path:out+'/conversation-mobile.png',timeout:180000});
 const fits=await page.locator('#village-conversation').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
 assert.equal(fits,true);
 await page.setViewportSize({width:900,height:600});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#village-conversation').isVisible(),false);
 const resume=await page.evaluate(()=>{
  const w=window.__world,p=w.walk,f=w.folk.folk.find(f=>f.profile.id===Object.keys(p.hud.friendships.people)[0]);
  const start=f.char.root.position.clone();w.step(1);return {active:p.active,drift:f.char.root.position.distanceTo(start),friendship:p.hud.friendships.status(f.profile.id)};
 });
 assert.equal(resume.active,true);assert.ok(resume.drift<.08);console.log('Conversation',JSON.stringify({npc,conversation,resume}));
 const controller=await page.evaluate(()=>{
  const p=window.__world.walk,original=Object.getOwnPropertyDescriptor(navigator,'getGamepads');
  const pad={connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false}))};
  Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[pad]});
  try {
   const yaw=p.yaw;pad.axes[2]=.8;p.tick(32);const turned=p.yaw!==yaw;pad.axes[2]=0;
   pad.buttons[0].pressed=true;p.tick(32);const jumped=!p.motion.grounded;
   pad.buttons[0].pressed=false;for(let i=0;i<55;i++)p.tick(16);
   pad.axes[0]=1;pad.buttons[6].pressed=true;for(let i=0;i<25;i++)p.tick(16);
   const running=p.motion.speed>3;
   pad.axes[0]=0;pad.buttons[6].pressed=false;p.clearInput();
   return {turned,jumped,running};
  }finally {if(original)Object.defineProperty(navigator,'getGamepads',original);else delete navigator.getGamepads;}
 });
 assert.equal(controller.turned,true);assert.equal(controller.jumped,true);
 console.log('Simulated controller',JSON.stringify(controller));
 await page.locator('#player-outfit').click();await page.locator('[data-kind="Mage"]').click();
 assert.ok((await page.locator('#player-activity').innerText()).includes('Mage'));
 await page.keyboard.press('Escape');assert.equal(await page.locator('#player-hud').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__world.rig.controls.enabled),true);
 assert.deepEqual(errors,[]);console.log('Character, jump, collision routes, conversations, focus, outfit and overview checks passed. Evidence:',out);
} finally { await browser.close();server.close(); }
