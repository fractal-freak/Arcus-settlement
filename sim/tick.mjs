/**
 * One turn of the settlement's clock, run by the scheduled job.
 *
 * The simulation already advances off the WALL clock rather than off being
 * called — every tick that should have happened since the last run happens on
 * the next one — so this does not need to run on any particular rhythm and a
 * missed hour costs nothing but the catching up. That is why a cron every half
 * hour is enough to keep a town alive, and why the same state file works
 * whether it was last touched by Kevin's machine or by a runner.
 *
 * `folk` is the settlement's population. On Kevin's machine it comes from his
 * real commit count; here there is no local git history to read, so the number
 * that was saved last is kept. The published town does not invent citizens.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refreshSubscribers } from './subscribers.mjs';
import { life } from './life.mjs';
import { skyAt } from './sky.mjs';
import { PLACE, FOUNDING } from './place.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * TWO FILES, and conflating them wipes the settlement.
 *
 * `sim.json` is the simulation's own memory — citizens, bonds, the chronicle,
 * every placement, the tick it has reached. life.mjs loads and saves it and
 * nothing else should touch it.
 *
 * `settlement.json` is what the PAGE fetches: the same shape the hub serves,
 * so one client works against either. It is derived from the first, every run.
 *
 * Pointing life.mjs at the published file made it read a payload it did not
 * recognise, conclude the settlement had never existed, and start again from
 * nothing. Four hundred placements and a month of chronicle, gone in one run.
 */
const SIM = process.env.SETTLEMENT_STATE || join(HERE, '..', 'state', 'sim.json');
const PUBLISHED = process.env.SETTLEMENT_PUBLISHED || join(HERE, '..', 'state', 'settlement.json');
process.env.SETTLEMENT_STATE = SIM;

mkdirSync(dirname(SIM), { recursive: true });

// The buildings are EARNED, by Kevin's real commits, and that history only
// exists on his machine — so the published town carries forward whatever was
// last seeded rather than inventing any. It grows when he publishes again.
let folk = 48;
let town = null;
try {
  const before = JSON.parse(readFileSync(PUBLISHED, 'utf8'));
  folk = before.town?.folk ?? folk;
  town = before.town ?? null;
} catch { /* first run */ }

// The sky IS computed here, every run: it is a pure function of the clock and
// of where this place is, so the published settlement stands under the real
// sky over Pawtucket at the moment you open it, same as the local one.
const sky = skyAt(new Date(), PLACE.lat, PLACE.lon);

const population = await refreshSubscribers();
if (population) folk = population.count;
const out = life(folk, Date.now(), []);

/**
 * Strip the town down to what a stranger may see.
 *
 * A building is EARNED by twenty of Kevin's real commits, and it was carrying
 * the commit's subject line and, in merges, the branch name — a hundred and
 * thirty-three of them, which together are the development history of a
 * product he has not finished. The renderer only ever reads `n`, `trade` and
 * `weight`, so the rest was travelling for no reason at all.
 *
 * Done here rather than once at seeding time, so it cannot be forgotten on a
 * later run. The check runs again in the workflow.
 */
function publishable(t) {
  if (!t) return null;
  return {
    ...t,
    folk,
    buildings: (t.buildings ?? []).map(({ n, trade, weight }) => ({ n, trade, weight })),
  };
}

// The published file is shaped exactly like what the hub serves, minus the two
// things that cannot travel: `people`, and anything that says what Kevin has
// been working on. See src/data/feed.js.
const published = {
  now: Date.now(),
  place: PLACE.name,
  sky,
  town: publishable(town),
  founding: FOUNDING,
  life: out,
  population,
  people: [],
  counts: { working: 0, waiting: 0, resting: 0, unread: 0 },
};

writeFileSync(PUBLISHED, JSON.stringify(published));
console.log(`${out.said} · ${out.placements.length} placed · quality ${out.quality.overall} · weakest ${out.quality.weakest}`);
