/** Exercise the journal, story links and conversations against the public snapshot. */
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(process.argv[2]||'dist'),out=resolve(process.argv[3]||'.local/journal/review');
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
   const ready=await page.evaluate(()=>{const w=window.__world;w.step(2);return w.folk.ready&&w.folk.folk.length>0&&!w.folk.workQueue?.length&&w.terrain.pendingVisible===0;});
   if(ready)break;
   await new Promise(r=>setTimeout(r,100));
 }
 const check=async(ok,message)=>{if(!ok)throw Error(message);};
 const panel=page.locator('#village-work-panel');
 await page.getByRole('button',{name:'Village journal',exact:true}).click();
 await check(await panel.isVisible(),'Journal did not open');
 await check(await page.locator('.project-row').count()>0,'No project cards');
 await page.evaluate(()=>{const w=window.__world;w.stage.renderer.render=window._render;w.step(1);});
 await page.screenshot({path:resolve(out,'improvements.png'),timeout:180000});
 await page.getByRole('searchbox').fill('gather the yard around one thing');
 await check(await page.locator('.project-row').count()===0,'Old vague task remained in project search');
 await page.getByRole('searchbox').fill('barrels');
 await check(await page.locator('.project-row').count()>0,'Plain-language project search failed');
 await page.getByRole('button',{name:'Village life',exact:true}).click();
 await check(await page.locator('.citizen-row').count()>0,'No citizens');
 await page.screenshot({path:resolve(out,'village-life.png'),timeout:180000});
 await page.getByRole('button',{name:'Chronicle',exact:true}).click();
 await page.getByRole('button',{name:'Life & relationships',exact:true}).click();
 const events=await page.locator('.journal-event').allTextContents();
 await check(events.length>0&&!events.some(t=>t.includes('Replaced old work')||t.includes('Project finished')),'Story filter mixed in construction');
 await page.screenshot({path:resolve(out,'chronicle.png'),timeout:180000});
 const name=await page.locator('.journal-event .journal-person-link').first().textContent();
 await page.locator('.journal-event .journal-person-link').first().click();
 await check(await panel.getByRole('heading',{name,exact:true}).count()===1,'Story did not open its citizen');
 await page.getByRole('button',{name:'Find in village',exact:true}).click();
 await check((await page.locator('[role=status]').allTextContents()).some(t=>t.includes('Looking at '+name)),'Citizen visit failed');
 await page.evaluate(()=>window.__world.step(1));
 await page.screenshot({path:resolve(out,'citizen.png'),timeout:180000});
 await page.getByRole('button',{name:'Close village journal',exact:true}).click();
 await page.evaluate(()=>{const w=window.__world;w.walk.enter();w.walk.hud.open(w.folk.folk[0].profile);});
 await check(await page.getByRole('button',{name:'Who are you close to?',exact:true}).count()===1,'Social topic missing');
 await check(await page.getByRole('button',{name:'What is your sign?',exact:true}).count()===0,'Astrology still dominates the opening');
 await page.getByRole('button',{name:'Who are you close to?',exact:true}).click();
 await check((await page.locator('.conversation-speech').textContent()).includes('friends'),'Relationship facts missing');
 await page.screenshot({path:resolve(out,'conversation.png'),timeout:180000});
 await page.evaluate(()=>{window.__world.walk.hud.close();window.__world.walk.exit();});
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>window.__world.step(1));
 await page.getByRole('button',{name:'Village journal',exact:true}).click();
 await page.getByRole('button',{name:'Chronicle',exact:true}).click();
 await page.screenshot({path:resolve(out,'mobile.png'),timeout:180000});
 const bounds=await panel.boundingBox();await check(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844,'Mobile panel exceeds viewport');
 await page.getByRole('searchbox').fill('zzzznoevent');
 await check((await panel.textContent()).includes('No recorded stories match'),'Empty search has no explanation');
 await page.getByRole('searchbox').press('Escape');
 await check(!(await panel.isVisible()),'Escape did not close journal');
 await check(await page.locator('#journal-toggle').evaluate(e=>e===document.activeElement),'Focus not returned to journal button');
 await page.getByRole('button',{name:'Village journal',exact:true}).press('Space');
 await check(await panel.isVisible(),'Keyboard did not open journal');
 console.log(JSON.stringify({storyCount:events.length,citizen:name,search:true,filters:true,navigation:true,conversation:true,mobile:true,keyboard:true,errors}));
 if(errors.length)throw Error(errors.join('\n'));

} finally {await browser.close();server.close();}
