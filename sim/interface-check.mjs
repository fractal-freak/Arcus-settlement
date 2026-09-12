/** Verify animation continuity and drawer composition against the public snapshot. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import {finishGpuFrame} from './gpu-frame.mjs';
const root=resolve(process.argv[2]||'dist'),out=resolve(process.argv[3]||'.local/journal/review');
await mkdir(out,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.png':'image/png','.css':'text/css'};
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}const b=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'}).end(b);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:process.platform==='darwin'?'chromium':undefined});
try {
 const page=await browser.newPage({viewport:{width:1100,height:750},hasTouch:!!process.env.TOUCH_UI,isMobile:!!process.env.TOUCH_UI}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{window.requestAnimationFrame=()=>0;});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.__world);
 // Streaming and rig setup do not need hundreds of expensive GPU renders.
 await page.evaluate(()=>{const w=window.__world;w.look(24,0,0);window._render=w.stage.renderer.render;w.stage.renderer.render=()=>{};});
 for(let i=0;i<200;i++) {
   const ready=await page.evaluate(()=>{const w=window.__world;w.step(2);return w.folk.ready&&w.folk.folk.length>0&&!w.folk.workQueue?.length&&w.terrain.pendingVisible===0;});
   if(ready)break;
   await new Promise(r=>setTimeout(r,100));
 }

 await page.evaluate(()=>{const w=window.__world;w.stage.renderer.render=window._render;w.rig.autoTilt=false;});
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 const motion=await page.evaluate(()=>{
   const w=window.__world,previous=w.folk.folk.map(f=>f.char.mixer.time);let held=0;
   for(let i=0;i<120;i++){w.step(1,1000/60);w.folk.folk.forEach((f,j)=>{if(f.char.mixer.time<=previous[j])held++;previous[j]=f.char.mixer.time;});}
   return {held,count:w.folk.folk.length,samples:w.stage.composer.renderTarget1.samples};
 });
 assert(motion.count===48&&motion.held===0,'Citizen pose clock skipped a frame: '+JSON.stringify(motion));
 assert(motion.samples>0,'Scene has no geometry antialiasing');
 const only=async(id)=>{
  const visible=await page.locator('.world-panel').evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.id));
  assert(visible.length===1&&visible[0]===id,'Drawers overlap: '+visible);
  const result=await page.locator('#'+id).evaluate(panel=>{
    const r=panel.getBoundingClientRect();const dock=document.getElementById('camdock').getBoundingClientRect();
    return {fits:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      overlaps:r.left<dock.right&&r.right>dock.left&&r.top<dock.bottom&&r.bottom>dock.top,
      overflow:document.documentElement.scrollWidth>innerWidth};
  });
  assert(result.fits&&!result.overlaps&&!result.overflow,'Drawer layout failed: '+JSON.stringify(result));
 };
 for(const size of [{width:1100,height:750},{width:768,height:600},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
  await page.setViewportSize(size);
  await page.locator('#journal-toggle').click();await only('village-work-panel');
  await page.locator('#sound-settings').click();await only('sound-panel');
  assert(await page.locator('#journal-toggle').getAttribute('aria-expanded')==='false','Journal trigger stale');
  await page.keyboard.press('Escape');
  assert(await page.locator('#sound-settings').evaluate(el=>el===document.activeElement),'Sound focus not returned');
  await page.locator('#journal-toggle').click();await only('village-work-panel');
  await page.keyboard.press('Escape');
 }
 // Exercise the empty optional crew shell without loading any private session feed.
 await page.evaluate(()=>{document.getElementById('crew').hidden=false;document.getElementById('crew-menu').hidden=false;});
 await page.setViewportSize({width:390,height:844});
 await page.locator('#crew-menu').click();await only('crew-panel');
 await page.locator('#journal-toggle').click();await only('village-work-panel');
 const separated=await page.evaluate(()=>{const a=document.getElementById('title').getBoundingClientRect(),b=document.getElementById('world-tools').getBoundingClientRect();return a.right<=b.left;});
 assert(separated,'Optional crew menu overlaps the title');
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{document.getElementById('crew').hidden=true;document.getElementById('crew-menu').hidden=true;});
 await page.setViewportSize({width:1100,height:750});
 await page.locator('#walkMode').click();
 assert(!await page.locator('#player-help').isVisible(),'Help obscures entry');
 await page.locator('#player-outfit').click();await only('player-wardrobe');
 if(process.env.TOUCH_UI)await page.keyboard.press('Escape');
 await page.locator('#player-help-toggle').click();await only('player-help');
 await page.locator('#sound-settings').click();await only('sound-panel');
 await page.keyboard.press('Escape');
 assert(await page.evaluate(()=>window.__world.walk.active),'Drawer Escape exited player mode');
 await page.locator('#player-outfit').click();await page.locator('[data-kind="Mage"]').click();
 assert(!await page.locator('#player-wardrobe').isVisible(),'Outfit selection did not dismiss drawer');
 await page.locator('#journal-toggle').click();
 await page.evaluate(()=>{const w=window.__world;w.walk.hud.open(w.folk.folk[0].profile);});
 assert(await page.locator('.world-panel').evaluateAll(nodes=>nodes.every(n=>n.hidden)),'Conversation left a drawer open');
 const capture=async name=>{await page.evaluate(()=>window.__world.step(1));await finishGpuFrame(page);await page.screenshot({path:resolve(out,name+'.png')});};
 await capture('conversation');
 await page.evaluate(()=>window.__world.walk.hud.close());
 await page.locator('#walkMode').click();
 await page.locator('#journal-toggle').click();await capture('journal');
 await page.locator('#sound-settings').click();await capture('sound');
 await page.setViewportSize({width:390,height:844});await page.locator('#journal-toggle').click();await capture('mobile');
 console.log(JSON.stringify({motion,drawerSizes:5,panelExclusion:true,focus:true,keyboard:true,errors}));
 assert(errors.length===0,errors.join('\n'));
} finally {await browser.close();server.close();}
