/**
 * The gate. Nothing the critic writes is ever served until it gets through
 * this, and anything that fails is thrown away with the last good version kept.
 *
 * WHY THIS FILE IS THE WHOLE REASON AUTONOMY IS SAFE. A model writing rules
 * unwatched will eventually write a broken one — a job asking for a model that
 * does not exist, a dimension nobody can ever score on, a hundred banners that
 * cost ten milliseconds a frame. Left alone, Kevin comes back to a world that
 * is worse or gone. Every one of those failures is cheap to DETECT, so it is
 * detected here, mechanically, before anybody sees it.
 *
 * Six checks, cheapest first, and they stop at the first failure:
 *
 *   1. shape      every field present, the right type, in range
 *   2. names      every model named is a file that actually exists
 *   3. reachable  every new dimension has at least one job that serves it
 *   4. placeable  every new job can actually find ground to stand on
 *   5. builds     the bundle compiles
 *   6. runs       the world boots headlessly, draws, and holds its frame budget
 *
 * 1 to 4 run in Node in a second. 5 and 6 need a build and a browser, so they
 * run in the scheduled job rather than on every edit — see the workflow.
 *
 * Used by the workflow; also runnable by hand:  node sim/verify.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

const PLACE_RULES = ['byPlot', 'square', 'byLane', 'outskirt', 'rim', 'water', 'shrine'];
const TAGS = ['clutter', 'tall', 'edge', 'accent', 'plain', 'sacred'];

/** Every model the world actually has, read off disk rather than from a list. */
function realKinds() {
  const dir = join(HERE, '..', 'public', 'assets', 'kaykit');
  return new Set(readdirSync(dir).filter((f) => f.endsWith('.gltf')).map((f) => f.slice(0, -5)));
}

const fail = (out, why) => { out.push(why); return out; };

/**
 * Check the rulebook against the world it claims to be about.
 *
 * With `collect`, every problem is also recorded against the entry that caused
 * it, so a caller can throw out the one bad entry instead of the whole file.
 * Returns a list of problems — empty means it may be served.
 */
export async function check(collect = null, rulebookModule = null) {
  const problems = [];
  const blame = (entry, why) => {
    if (collect) {
      if (!collect.has(entry)) collect.set(entry, []);
      collect.get(entry).push(why);
    }
    fail(problems, why);
  };
  // The caller may hand in the module it already loaded. Identity matters:
  // `collect` keys problems by the entry OBJECT, and two imports of the same
  // file under different specifiers are two different sets of objects, so
  // blaming one and pruning the other silently removes nothing at all.
  const rulebook = rulebookModule ?? await import('./rulebook.mjs');
  const quality = await import('./quality.mjs');
  const kinds = realKinds();

  const dimKeys = new Set(quality.DIMENSIONS.map((d) => d.key));
  const seenKeys = new Set(quality.PROJECTS.map((p) => p.key));

  // ── 1, 2: shape and names ────────────────────────────────────────────────
  const projects = rulebook.EXTRA_PROJECTS ?? [];
  const dims = rulebook.EXTRA_DIMENSIONS ?? [];
  if (!Array.isArray(projects) || !Array.isArray(dims)) return fail(problems, 'rulebook must export two arrays');
  if (projects.length > 60) fail(problems, `${projects.length} generated jobs is more than this world can carry`);
  if (dims.length > 10) fail(problems, `${dims.length} generated dimensions is too many to read in a panel`);

  const keys = new Set();
  for (const p of projects) {
    const at = `job "${p?.key ?? '?'}"`;
    // Underscores allowed. The first critic run wrote five perfectly good jobs
    // — plant_water_reeds, scatter_waterlilies — and every one was thrown out
    // by a pattern that only permitted letters and digits. A gate that refuses
    // good work for a reason that is not about the world is a bug in the gate.
    if (!p || typeof p.key !== 'string' || !/^[a-z][a-z0-9_]{2,29}$/.test(p.key)) { blame(p, `${at}: bad key "${p?.key}"`); continue; }
    if (keys.has(p.key)) blame(p, `${at}: two jobs share this name`);
    keys.add(p.key);
    if (typeof p.want !== 'string' || !p.want.startsWith('to ') || p.want.length > 70) blame(p, `${at}: "want" must start with "to " and be short`);
    if (!Number.isFinite(p.needs) || p.needs < 20 || p.needs > 110) blame(p, `${at}: "needs" must be 20 to 110`);
    if (!PLACE_RULES.includes(p.place)) blame(p, `${at}: "${p.place}" is not a ground rule`);
    if (!TAGS.includes(p.tag)) blame(p, `${at}: "${p.tag}" is not a tag`);
    if (!Number.isInteger(p.n) || p.n < 1 || p.n > 8) blame(p, `${at}: "n" must be 1 to 8`);
    if (!Array.isArray(p.kinds) || !p.kinds.length) { blame(p, `${at}: no models named`); continue; }
    for (const k of p.kinds) if (!kinds.has(k)) blame(p, `${at}: there is no model called "${k}"`);
    // A job aimed at a score that does not exist can never be chosen.
    if (!dimKeys.has(p.dim)) blame(p, `${at}: "${p.dim}" is not something the settlement measures`);
  }

  for (const d of dims) {
    const at = `dimension "${d?.key ?? '?'}"`;
    if (!d || typeof d.key !== 'string' || !/^[a-z][a-zA-Z0-9_]{2,23}$/.test(d.key)) { blame(d, `${at}: bad key "${d?.key}"`); continue; }
    if (typeof d.name !== 'string' || d.name.length > 24) blame(d, `${at}: "name" must fit the panel`);
    if (typeof d.why !== 'string' || d.why.length < 20 || d.why.length > 180) blame(d, `${at}: "why" must be one real sentence`);
    if (!TAGS.includes(d.tag)) blame(d, `${at}: "${d.tag}" is not a tag`);
    if (!Number.isFinite(d.target) || d.target < 10 || d.target > 160) blame(d, `${at}: "target" must be 10 to 160`);

    // ── 3: reachable ──────────────────────────────────────────────────────
    const servedBy = [...projects, ...quality.PROJECTS].filter((p) => p.dim === d.key);
    if (!servedBy.length) blame(d, `${at}: nothing the citizens can do would ever raise it`);
    if (!servedBy.some((p) => p.tag === d.tag)) blame(d, `${at}: counts "${d.tag}" but no job that serves it makes one`);
  }

  if (problems.length) return problems;   // do not run the slow checks on a broken file

  // ── 4: placeable ─────────────────────────────────────────────────────────
  //
  // A job whose ground rule can never find room is not broken, it is useless:
  // the citizen takes it on, fails, and turns to something else forever. Each
  // new one gets fifty real attempts against the real terrain.
  const rng = (seed) => { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
  for (const p of projects.filter((x) => !seenKeys.has(x.key))) {
    const r = rng(0x9e3779b9);
    let found = 0;
    for (let i = 0; i < 50 && found < 3; i++) {
      if (quality.spotFor(p.place, r, [], p.kinds[i % p.kinds.length])) found++;
    }
    if (found < 3) blame(p, `job "${p.key}": fifty tries on "${p.place}" ground found nowhere to put a ${p.kinds[0]}`);
  }

  return problems;
}

/**
 * Throw out the entries that are wrong and keep the rest.
 *
 * The first night this ran, the critic wrote two new things for the town to
 * care about and five jobs to serve them — and ONE of the five had a `want`
 * that did not start with "to ". All seven were discarded for it. A whole
 * night's thinking lost to a missing preposition is not safety, it is waste,
 * and the entries are independent of each other: a bad one costs itself.
 *
 * Two passes, because dropping a job can orphan the dimension it served —
 * leaving a score nobody can ever raise, which is worse than not adding it.
 */
async function prune() {
  const RULEBOOK = join(HERE, 'rulebook.mjs');
  const dropped = [];

  for (let pass = 0; pass < 2; pass++) {
    const rulebook = await import(`./rulebook.mjs?prune=${pass}`);
    const blamed = new Map();
    const problems = await check(blamed, rulebook);
    if (!problems.length) break;
    const keep = (list) => list.filter((e) => {
      const why = blamed.get(e);
      if (!why) return true;
      dropped.push(why[0]);
      return false;
    });
    const projects = keep(rulebook.EXTRA_PROJECTS ?? []);
    const dimensions = keep(rulebook.EXTRA_DIMENSIONS ?? []);

    // Nothing identifiable was at fault — the file itself is wrong. Refuse it.
    if (!blamed.size) return { ok: false, problems, dropped };

    const src = readFileSync(RULEBOOK, 'utf8');
    writeFileSync(RULEBOOK, src
      .replace(/export const EXTRA_PROJECTS = [\s\S]*?\n\];/, `export const EXTRA_PROJECTS = ${JSON.stringify(projects, null, 2)};`)
      .replace(/export const EXTRA_DIMENSIONS = [\s\S]*?\n\];/, `export const EXTRA_DIMENSIONS = ${JSON.stringify(dimensions, null, 2)};`));
  }

  const problems = await check(null, await import('./rulebook.mjs?final'));
  return { ok: !problems.length, problems, dropped };
}

// Run directly: `--prune` drops what is wrong and keeps the rest; without it,
// report and refuse. Either way the exit code is what the workflow reads.
if (process.argv[1] && process.argv[1].endsWith('verify.mjs')) {
  if (process.argv.includes('--prune')) {
    const { ok, problems, dropped } = await prune();
    for (const d of dropped) console.log('dropped ·', d);
    if (!ok) {
      console.error(`REFUSED — ${problems.length} left after pruning:`);
      for (const p of problems) console.error('  ·', p);
      process.exit(1);
    }
    console.log(dropped.length ? `rulebook accepted, ${dropped.length} entr${dropped.length > 1 ? 'ies' : 'y'} dropped` : 'rulebook accepted');
  } else {
    const problems = await check();
    if (problems.length) {
      console.error(`REFUSED — ${problems.length} problem${problems.length > 1 ? 's' : ''}:`);
      for (const p of problems) console.error('  ·', p);
      process.exit(1);
    }
    console.log('rulebook accepted');
  }
}
