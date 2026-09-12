/** Freeze the actual WebGL frame while Chromium captures the page and HUD. */
export async function captureWorld(page, { timeout = 180000 } = {}) {
  let timer;
  const started = Date.now();
  const capture = async () => {
    await page.evaluate(async () => {
      const w = window.__world, canvas = w.stage.renderer.domElement;
      // Read within the same task as rendering: WebGL clears its drawing
      // buffer after presentation when preserveDrawingBuffer is false.
      w.step(1);
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/png');
      image.style.cssText = canvas.style.cssText;
      image.className = canvas.className;
      image.id = canvas.id;
      image.width = canvas.width; image.height = canvas.height;
      window.__captureRestore = () => { image.replaceWith(canvas); delete window.__captureRestore; };
      canvas.replaceWith(image);
      await image.decode();
    });
    try {
      const remaining = timeout - (Date.now() - started);
      if (remaining <= 0) throw new Error('World capture exceeded its time budget');
      return await page.screenshot({type:'png', timeout:remaining, animations:'disabled', caret:'initial'});
    } finally {
      await page.evaluate(() => window.__captureRestore?.());
    }
  };
  try {
    // Readback and page capture share the original screenshot deadline.
    return await Promise.race([capture(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`World capture timed out after ${timeout}ms`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}
