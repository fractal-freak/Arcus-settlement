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
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdirSync } from 'node:fs';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

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
const browser = await chromium.launch({
  args: process.platform === 'darwin' && !process.env.CI ? []
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
// Small on purpose: every pixel of this is rasterised on a CPU.
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

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
await page.waitForFunction(() => window.__world?.stats, null, { timeout: 90_000 });

const report = await page.evaluate(async () => {
  const w = window.__world;
  // Enough to stream the ground and download every model, and no more —
  // software rendering makes each of these expensive and this has to finish
  // inside a scheduled job, not inside an afternoon.
  w.look(34, -4, 8);
  // Worker replies require an event-loop turn; synchronous batches cannot load terrain.
  const deadline = performance.now() + 90000;
  do {
    w.step(1);
    await new Promise(r => setTimeout(r, 5));
    if (performance.now() > deadline) throw new Error('The opening view did not finish loading: ' + JSON.stringify({stats:w.stats(),startup:w.startup,feedReady:!!w.feed.data,assetsReady:w.built.ready && w.folk.ready && w.people.ready && w.landmarks.ready}));
  // Background tiles continue streaming after entry. Readiness means the current
  // view is complete, matching the app's loading gate, not an empty distant queue.
  } while (!w.startup?.complete || w.terrain.pendingVisible > 0);
  for (let i = 0; i < 10; i++) { w.step(1); await new Promise(r => setTimeout(r, 0)); }

  const t = [];
  for (let i = 0; i < 60; i++) {
    const a = performance.now(); w.step(1); t.push(performance.now() - a);
    // Give the GPU and browser time to present, instead of queuing sixty frames in one task.
    await new Promise(r => setTimeout(r, 16));
  }
  t.sort((a, b) => a - b);
  const s = w.stats();
  const gl = w.stage.renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    backend: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER),
    median: +t[30].toFixed(2),
    p95: +t[57].toFixed(2),
    max: +t[59].toFixed(2),
    startupMs: Math.round(w.startup.readyAt - w.startup.startedAt),
    chunks: s.chunks,
    triangles: s.triangles,
    drawCalls: s.drawCalls,
    ready: w.startup.complete,
    terrainWorker: s.terrainWorker,
    pendingVisible: s.pendingVisible,
    placed: (w.built?._pending ?? []).length,
  };
});

console.log('Frame check:', JSON.stringify(report));
mkdirSync(join(HERE, '..', 'state'), { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });
// Generous, and no waiting on fonts: capturing a software-rendered WebGL
// frame is slow enough that Playwright's default patience runs out first.
writeFileSync(OUT, await page.screenshot({ type: 'png', timeout: 180_000, animations: 'disabled', caret: 'initial' }));

await browser.close();
server.close();

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
  process.exit(1);
}
console.log('world runs');
