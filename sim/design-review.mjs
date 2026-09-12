/** Capture comparable views without advancing or editing the settlement's memory. */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { skyAt } from './sky.mjs';
import { PLACE } from './place.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, '.local/design-review/current/before'));
mkdirSync(out, { recursive: true });
const fixture = join(dirname(out), 'fixture.json');
if (!existsSync(fixture)) {
  const data = JSON.parse(readFileSync(join(root, 'state/settlement.json'), 'utf8'));
  // Same afternoon, sky and public population for both sides of a comparison.
  data.now = Date.parse('2026-09-12T20:00:00Z');
  data.sky = skyAt(new Date(data.now), PLACE.lat, PLACE.lon);
  data.people = [];
  if (data.town) data.town.buildings = (data.town.buildings || []).map(({ n, trade, weight }) => ({ n, trade, weight }));
  writeFileSync(fixture, JSON.stringify(data));
}
const result = spawnSync(process.execPath, ['sim/shoot.mjs'], {
  cwd: root, stdio: 'inherit', env: { ...process.env,
    DESIGN_REVIEW_DIR: out, DESIGN_FIXTURE: fixture,
    CRITIC_SHOT: join(out, 'opening.png'),
    CRITIC_REPORT: join(dirname(out), 'performance.json'),
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
