/** Drain submitted WebGL work without blocking Chromium's event loop. */
export async function finishGpuFrame(page, { timeout = 90000 } = {}) {
  const started = Date.now();
  await page.evaluate(() => {
    const gl = window.__world.stage.renderer.getContext();
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) throw new Error('Could not create the frame completion fence');
    window.__worldFrameFence = fence;
    gl.flush();
  });
  try {
    while (true) {
      const complete = await page.evaluate(() => {
        const gl = window.__world.stage.renderer.getContext();
        const status = gl.clientWaitSync(window.__worldFrameFence, 0, 0);
        if (status === gl.WAIT_FAILED) throw new Error('Frame completion fence failed');
        return status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED;
      });
      if (complete) return;
      if (Date.now() - started >= timeout) throw new Error(`GPU frame did not finish within ${timeout}ms`);
      // Poll from Node: hidden-page timers and animation frames may be suspended.
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } finally {
    await page.evaluate(() => {
      const gl = window.__world.stage.renderer.getContext();
      gl.deleteSync(window.__worldFrameFence);
      delete window.__worldFrameFence;
    });
  }
}
