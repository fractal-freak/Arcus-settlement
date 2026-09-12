/** Prepare additional screenshot views after the unchanged measured-frame gate. */
import {finishGpuFrame} from './gpu-frame.mjs';
export async function prepareView(page,{timeout=90000,finishFrame=finishGpuFrame}={}){
 const deadline=Date.now()+timeout;
 await page.evaluate(()=>{const w=window.__world;window.__viewRender=w.stage.render;w.stage.render=()=>{};});
 try {
  let stable=0;
  while(stable<2){
   const pending=await page.evaluate(()=>{const w=window.__world;w.step(1);return w.terrain.pendingVisible;});
   stable=pending===0?stable+1:0;
   if(Date.now()>deadline)throw Error('Screenshot terrain did not settle');
   await new Promise(r=>setTimeout(r,10));
  }
 }finally{
  await page.evaluate(()=>{window.__world.stage.render=window.__viewRender;delete window.__viewRender;});
 }
 // Real completed frames prove the settled scene draws before capture. This
 // preparation never replaces the opening view's 60 measured frames.
 for(let i=0;i<2;i++){
  const pending=await page.evaluate(()=>{window.__world.step(1);return window.__world.terrain.pendingVisible;});
  await finishFrame(page,{timeout:Math.max(1,deadline-Date.now())});
  if(pending)throw Error('Screenshot terrain changed after preparation');
 }
}
