/** Exercise real crew rigs and navigation with synthetic sessions only. */
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { walkingHeightAt } from '../src/app/occupied.js';
import { digSites, PIT } from '../src/app/digs.js';

const root = resolve(process.env.WORLD_BUILD_DIR || 'dist');
const out = resolve(process.env.ARCHAEOLOGY_EVIDENCE || '.local/archaeology-review');
await mkdir(out, { recursive: true });
const fixture = JSON.parse(await readFile(resolve(root, 'state/settlement.json'), 'utf8'));
fixture.people = Array.from({ length: 10 }, (_, i) => ({ id: `excavation-test-${i}`,
  title: `Test archaeologist ${i + 1}`, state: i === 9 ? 'resting' : 'waiting', idleMs: 1000, turns: 1 }));
fixture.counts = { working: 0, waiting: 9, resting: 1 };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/world/data' || path === '/state/settlement.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(fixture)); return;
  }
  if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: process.platform === 'darwin' && !process.env.CI ? 'chromium' : undefined,
  args: process.platform === 'darwin' && !process.env.CI ? [] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } }), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => { requestAnimationFrame = () => 0; });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__world?.people.ready, null, { polling: 100, timeout: 90000 });
  const deadline = Date.now() + 90000;
  while (!await page.evaluate(() => { __world.step(1); return __world.startup.complete && __world.people.figures.size === 10; })) {
    assert.ok(Date.now() < deadline, 'world and synthetic crew finish loading');
    await new Promise(r => setTimeout(r, 10));
  }
  await page.evaluate(() => __world.feed.stop());
  const crew = await page.evaluate(() => [...__world.people.figures.values()].map(f => ({
    id: f.id, state: f.state, site: f.site.id, radius: Math.hypot(f.baseX-f.site.center.x, f.baseZ-f.site.center.z),
    blocked: __world.blocked(f.baseX, f.baseZ, .6), visible: f.group.visible, tool: f.pick.visible,
    animation: f.char.animation, ring: f.sign.visible, color: f.ring.material.color.getHex(),
  })));
  for (const [i, f] of crew.entries()) {
    assert.equal(f.state, fixture.people[i].state);
    assert.ok(f.visible && f.tool && !f.blocked && f.radius < PIT.r - .6, JSON.stringify(f));
    assert.equal(f.animation, 'Interact');
    assert.equal(f.ring, i !== 9); // Gold waiting rings remain truthful; resting has none.
    if (i !== 9) assert.equal(f.color, 0xffc94d);
  }
  assert.match(await page.locator('#stat').innerText(), /10 archaeologists excavating/);
  await page.locator('#camDigs').click();
  const destination = await page.evaluate(() => ({ x: __world.rig.target.x, z: __world.rig.target.z }));
  const occupied = digSites().filter(s => crew.some(f => f.site === s.id));
  assert.ok(Math.hypot(destination.x - occupied[0].x, destination.z - occupied[0].z) < 1e-6);
  for (let i = 0; i < 50; i++) { await page.evaluate(() => __world.step(1)); await new Promise(r => setTimeout(r, 5)); }
  await page.screenshot({ path: resolve(out, 'after-site.png') });
  await page.locator('#crew .pull').click();
  await page.locator('#crew .row').filter({ hasText: 'Test archaeologist 4' }).click();
  await page.locator('#crewToggle').click();
  await page.evaluate(() => __world.step(8));
  await page.screenshot({ path: resolve(out, 'after-worker.png') });
  const samples = await page.evaluate(() => {
    const w = __world, samples = [], times = [];
    for (let i = 0; i < 180; i++) {
      const t = performance.now(); w.step(1); times.push(performance.now() - t);
      for (const f of w.people.figures.values()) {
        const p = f.pick.children[1].getWorldPosition(f.group.position.clone());
        samples.push({ id: f.id, x: p.x, y: p.y, z: p.z });
      }
    }
    return { samples, times };
  });
  const strokes = crew.map(f => {
    const gaps = samples.samples.filter(p => p.id === f.id).map(p => p.y - walkingHeightAt(p.x, p.z));
    return { id: f.id, minimum: Math.min(...gaps), maximum: Math.max(...gaps) };
  });
  console.log('Actual pick-head height above terrain', JSON.stringify(strokes));
  for (const stroke of strokes) {
    assert.ok(stroke.maximum - stroke.minimum > .45, 'every waiting/resting archaeologist visibly swings');
    assert.ok(stroke.minimum < .3, 'pick reaches the soil');
  }
  const changes = await page.evaluate(() => {
    const w = __world, before = [...w.people.figures.values()].map(f => f.group.position.clone());
    const rows = w.feed.data.people.map((p, i) => ({ ...p, state: ['working', 'waiting', 'resting'][i % 3] }));
    w.people.sync(rows); w.step(70);
    return [...w.people.figures.values()].map((f, i) => ({ drift: f.group.position.distanceTo(before[i]),
      tool: f.pick.visible, state: f.state, wanted: rows[i].state, animation: f.char.animation }));
  });
  assert.ok(changes.every(f => f.drift === 0 && f.tool && f.state === f.wanted && f.animation === 'Interact'));
  await page.locator('#camDigs').click();
  const next = await page.evaluate(() => ({ x: __world.rig.target.x, z: __world.rig.target.z }));
  assert.ok(Math.hypot(next.x - occupied[1].x, next.z - occupied[1].z) < 1e-6);
  // Removed sessions release their bodies and labels; a public empty feed stays empty.
  await page.evaluate(() => { __world.feed.accept({ ...__world.feed.data, people: [] }, 'published'); __world.step(1); });
  assert.equal(await page.evaluate(() => __world.people.figures.size), 0);
  assert.equal(await page.locator('#people .who').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('#camdock').evaluate(el => {
    const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;
  }), 'Dig sites and Play controls fit a phone screen');
  assert.deepEqual(errors, []);
  const sorted = samples.times.toSorted((a, b) => a - b);
  const report = { crew: crew.length, waiting: 9, resting: 1, strokes,
    cpuFrameMs: { median: sorted[Math.floor(sorted.length*.5)], p95: sorted[Math.floor(sorted.length*.95)] } };
  await writeFile(resolve(out, 'checks.json'), JSON.stringify(report, null, 2));
  console.log('Excavation, true status, stable placement, navigation and removal checks passed.', JSON.stringify(report.cpuFrameMs));
} finally { await browser.close(); server.close(); }
