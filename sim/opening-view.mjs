import {finishGpuFrame} from './gpu-frame.mjs';

/** Stream with one outstanding rendered frame, including on software GPUs. */
export async function waitForOpeningView(page, {timeout=270000, finishFrame=finishGpuFrame, now=Date.now}={}) {
  const deadline=now()+timeout;
  while (true) {
    const status=await page.evaluate(()=>{
      const w=window.__world;
      w.step(1);
      return {ready:w.startup?.complete,pending:w.terrain.pendingVisible,stats:w.stats()};
    });
    const remaining=deadline-now();
    if (remaining<=0) throw new Error('Opening view did not load: '+JSON.stringify(status));
    // Do not flood SwiftShader with loading frames faster than it can draw.
    // This replaces the old 90s streaming + 180s queue-drain allowance.
    await finishFrame(page,{timeout:Math.min(90000,remaining)});
    if (now()>deadline) throw new Error('Opening view exceeded its loading deadline');
    if (status.ready && status.pending===0) return;
  }
}
