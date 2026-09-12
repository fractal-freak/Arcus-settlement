/**
 * Boot the world on a machine with no screen, prove it works, and photograph it.
 *
 * TWO JOBS IN ONE, and they are the same job. The critic needs a real picture
 * of the settlement or its criticism is about video games in general rather
 * than about this place — that is the difference between a useful note and a
 * fortune cookie. And the gate needs proof that whatever was just written
 * still runs: a rulebook that compiles can still ask for two hundred banners
 * and cost ten milliseconds a frame, and nobody would know until Kevin opened
 * it.
 *
 * So: serve the built site, open it in headless Chromium, let it stream in,
 * measure real frame times through the world's own `step()`, and save a PNG.
 * Anything that fails — a script error, a world that never builds a chunk, a
 * frame budget blown — exits non-zero and the workflow throws the rulebook
 * away.
 *
 * WHY step() RATHER THAN WATCHING THE CLOCK. A headless page has no animation
 * frames worth the name and a hidden one has none at all, so waiting for the
 * world to render itself measures the test rig rather than the world. `step()`
 * runs exactly what the real loop runs, synchronously, which is the one method
 * in this project that is both deterministic and honest about time. It has
 * been the way every performance number here was taken.
 */

import { createServer } from 'node:http';
import { captureWorld } from './capture-world.mjs';
import { finishGpuFrame } from './gpu-frame.mjs';
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', 'dist');
const OUT = process.env.CRITIC_SHOT || join(HERE, '..', 'state', 'world.png');

/**
 * How the speed check works, and why it is not a stopwatch.
 *
 * A runner has no GPU: WebGL runs in software, an order of magnitude slower
 * than Kevin's Mac, and EVERY frame there misses sixteen milliseconds. So an
 * absolute budget on a runner would refuse the world as it stands today, which
 * would be a test of the hardware rather than of the change.
 *
 * What is worth catching is a REGRESSION — the rulebook asking for something
 * that costs much more than the last one did — and that is measurable on any
 * hardware as long as it is compared against the last measurement taken on the
 * SAME hardware. So each run records its own numbers and the next one is
 * refused if it is meaningfully worse. The first run has nothing to compare
 * against and is always accepted.
 */
const WORSE_BY = 1.4;     // a median this many times the last one is a regression
const AND_AT_LEAST = 4;   // ...but ignore anything under this many ms of change

// Two milliseconds was too tight to be meaningful. A good run on the laptop
// measures 3ms and an ordinary one measures 5, which is a 1.8x "regression"
// that is really just the machine having a different sort of afternoon — and
// it refused a rulebook that had nothing wrong with it. A change has to be
// both proportionally worse AND worth noticing in absolute terms before it is
// a regression rather than weather.

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream', '.glb': 'model/gltf-binary', '.txt': 'text/plain',
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  // Modern Chromium requests an optional tab icon even though the page does
  // not declare one. Serve an empty icon response; missing game assets still fail.
  if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  // Read BEFORE answering: writing the header first and then failing to find
  // the file leaves the header already sent and throws where it cannot be
  // caught usefully.
  let body;
  try { body = await readFile(file); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

// SwiftShader: a runner has no GPU, so WebGL is done in software. Slower than
// Kevin's Mac by a long way, which is why the budget check below is a share of
// frames rather than an absolute median — it catches "this got much worse",
// which is the thing worth catching, without pretending a runner is a laptop.
let browser;
try {
browser = await chromium.launch({
  // The full bundled browser uses modern headless mode on the Mac. The
  // headless shell can fall back to extremely slow software rasterisation.
  channel: process.platform === 'darwin' && !process.env.CI ? 'chromium' : undefined,
  args: process.platform === 'darwin' && !process.env.CI ? []
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
// Small on purpose: every pixel of this is rasterised on a CPU.
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const reviewDir = process.env.DESIGN_REVIEW_DIR;
let reviewFixture;
if (reviewDir) {
  reviewFixture = await readFile(process.env.DESIGN_FIXTURE, 'utf8');
  await page.route('**/state/settlement.json', route => route.fulfill({ contentType: 'application/json', body: reviewFixture }));
  // Freeze wall time only. Keep real timers/performance for worker streaming
  // and frame measurement, and leave RAF under the explicit step() harness.
  await page.addInitScript(now => {
    let seed = 0x5e771e;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
  }, JSON.parse(reviewFixture).now);
}

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  // The page asks the hub for live data first and falls back to the published
  // file when there is no hub — see src/data/feed.js. Off Kevin's machine that
  // first ask is SUPPOSED to fail, and the browser logs a 404 for it. Counting
  // that as a broken world would refuse every single run.
  // The URL is in the message's LOCATION, not its text — the text of a 404
  // is just "Failed to load resource" and says nothing about what failed.
  const where = `${m.location()?.url ?? ''} ${m.text()}`;
  if (where.includes('world/data')) return;
  errors.push(`${m.text()} ${m.location()?.url ?? ''}`.trim());
});

// Keep the animation clock deterministic; step() still runs the real frame body.
await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__world?.stats, null, { timeout: 90_000, polling: 100 });

// Pace from Node: background browsers can suspend page timers even while
// explicit evaluate/step calls still work. Time only the real frame body.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
await page.evaluate(() => window.__world.look(34, -4, 8));
const deadline = Date.now() + 90000;
while (true) {
  const status = await page.evaluate(() => {
    const w = window.__world;
    w.step(1);
    return { ready: w.startup?.complete, pending: w.terrain.pendingVisible, stats: w.stats() };
  });
  await finishGpuFrame(page, { timeout: Math.max(1, deadline - Date.now()) });
  if (status.ready && status.pending === 0) break;
  if (Date.now() > deadline) throw new Error('Opening view did not load: ' + JSON.stringify(status));
  await pause(5);
}
console.log('Opening view ready; warming up completed frames');
for (let i = 0; i < 10; i++) {
  await page.evaluate(() => window.__world.step(1));
  await finishGpuFrame(page);
  await pause(1);
}
const timings = [];
const completedTimings = [];
for (let i = 0; i < 60; i++) {
  const started = performance.now();
  timings.push(await page.evaluate(() => {
    const start = performance.now();
    window.__world.step(1);
    return performance.now() - start;
  }));
  await finishGpuFrame(page);
  completedTimings.push(performance.now() - started);
  if ((i + 1) % 20 === 0) console.log(`Completed frame samples: ${i + 1}/60`);
  await pause(16);
}
timings.sort((a, b) => a - b);
completedTimings.sort((a, b) => a - b);
const report = await page.evaluate(t => {
  const w = window.__world, s = w.stats();
  const gl = w.stage.renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    backend: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    median: +t[30].toFixed(2), p95: +t[57].toFixed(2), max: +t[59].toFixed(2),
    startupMs: Math.round(w.startup.readyAt - w.startup.startedAt),
    chunks: s.chunks, triangles: s.triangles, drawCalls: s.drawCalls,
    ready: w.startup.complete, terrainWorker: s.terrainWorker,
    pendingVisible: s.pendingVisible, placed: (w.built?._pending ?? []).length,
  };
}, timings);
// CPU submission remains comparable with the existing gate. Completion includes
// renderer execution plus browser round trips; keep it separate and gate it too.
report.completedMedian = +completedTimings[30].toFixed(2);
report.completedP95 = +completedTimings[57].toFixed(2);

console.log('Frame check:', JSON.stringify(report));
mkdirSync(join(HERE, '..', 'state'), { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
// Generous, and no waiting on fonts: capturing a software-rendered WebGL
// frame is slow enough that Playwright's default patience runs out first.
writeFileSync(OUT, await captureWorld(page));

if (reviewDir) {
  // Fixed composition, not whatever camera angle the last operator left behind.
  const views = [
    { name: 'overview', distance: 95, x: -22, z: -12, azimuth: 0.65 },
    { name: 'stone', distance: 24, x: 0, z: 0, azimuth: 0.45 },
    { name: 'gatehouse', distance: 25, x: -55, z: -29, azimuth: 0.08 },
  ];
  for (const view of views) {
    await page.evaluate(v => {
      const w = window.__world;
      w.look(v.distance, v.x, v.z);
      const camera = w.stage.camera, target = w.rig.target;
      const horizontal = Math.hypot(camera.position.x - target.x, camera.position.z - target.z);
      camera.position.x = target.x + Math.sin(v.azimuth) * horizontal;
      camera.position.z = target.z + Math.cos(v.azimuth) * horizontal;
      w.rig.controls.update();
    }, view);
    const viewDeadline = Date.now() + 90000;
    let settled = 0;
    while (settled < 20) {
      const pending = await page.evaluate(() => {
        window.__world.step(1);
        return window.__world.terrain.pendingVisible;
      });
      await finishGpuFrame(page, { timeout: Math.max(1, viewDeadline - Date.now()) });
      settled = pending === 0 ? settled + 1 : 0;
      if (Date.now() > viewDeadline) throw new Error('Review view did not load: ' + view.name);
      await pause(10);
    }
    writeFileSync(join(reviewDir, `${view.name}.png`), await captureWorld(page));
  }
  writeFileSync(join(reviewDir, 'evidence.json'), JSON.stringify({
    fixtureSha256: createHash('sha256').update(reviewFixture).digest('hex'), seed: '0x5e771e',
    viewport: { width: 900, height: 600 }, views, performance: report,
  }, null, 2));
}

/**
 * Baselines are kept PER MACHINE, and the first version was not.
 *
 * A GitHub runner has no GPU and renders in software; Kevin's Mac does not.
 * The recorded median from one is meaningless against the other — the first
 * scheduled run measured 10.7ms, compared it against 4.3ms recorded on the
 * laptop, and refused a rulebook that had nothing wrong with it. A regression
 * test that fires on a change of hardware is not a regression test.
 */
const WHERE = process.env.CI ? 'ci' : 'local';
const REPORT = process.env.CRITIC_REPORT || join(HERE, '..', 'state', 'report.json');
let reports = {};
try { reports = JSON.parse(await readFile(REPORT, 'utf8')); } catch { /* first run */ }
if (reports.median) reports = {};             // the old single-machine shape
const previous = reports[WHERE] ?? null;
// Compare matching renderer backends only; headless macOS may also use software rendering.
const before = previous?.backend === report.backend ? previous : null;

const problems = [];
if (errors.length) problems.push(`the page threw: ${errors.slice(0, 3).join(' | ')}`);
if (!report.chunks) problems.push('the ground never built');
if (report.pendingVisible) problems.push('visible terrain was still missing after the frame check');
if (before?.median && report.median > before.median * WORSE_BY
  && report.median - before.median > AND_AT_LEAST) {
  problems.push(`${report.median}ms a frame against ${before.median}ms last time — the new rules cost too much`);
}

if (before?.p95 && report.p95 > before.p95 * WORSE_BY && report.p95 - before.p95 > 8) {
  problems.push(`${report.p95}ms at the 95th percentile against ${before.p95}ms last time`);
}
for (const [key, minimum] of [['completedMedian', AND_AT_LEAST], ['completedP95', 8]]) {
  if (before?.[key] && report[key] > before[key] * WORSE_BY && report[key] - before[key] > minimum) {
    problems.push(`${key}: ${report[key]}ms against ${before[key]}ms last time`);
  }
}

console.log(`[${WHERE}] chunks ${report.chunks} · ${report.placed} placed · ${report.drawCalls} draws · median ${report.median}ms · p95 ${report.p95}ms`
  + (before?.median ? ` (was ${before.median}ms here)` : ' (first run on this machine)'));

// Recorded only if it passed — otherwise a slow run would raise the bar it is
// compared against and quietly let the next slow one through.
if (!problems.length) {
  reports[WHERE] = report;
  writeFileSync(REPORT, JSON.stringify(reports, null, 1));
}
if (problems.length) {
  console.error('REFUSED:');
  for (const p of problems) console.error('  ·', p);
  process.exitCode = 1;
}
else console.log('world runs');
} finally {
  await browser?.close();
  server.close();
}
