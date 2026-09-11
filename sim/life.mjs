/**
 * The living settlement: citizens who want things, fall in and out with each
 * other, and change the place while nobody is watching.
 *
 * WHAT THIS IS FOR. Kevin asked for a world that develops on its own, so that
 * coming back to it turns something up he did not put there. That is a
 * SIMULATION problem, not a language-model one. Surprise comes from a small
 * number of simple rules applied to people who want incompatible things —
 * Dwarf Fortress, RimWorld and The Sims all do it with arithmetic. A model is
 * good at naming and narrating what a simulation produced; it cannot be the
 * thing that remembers your world. So this runs on arithmetic, and a model
 * can be added later to write the results up.
 *
 * WHAT IS REAL AND WHAT IS INVENTED. The buildings in this world are earned
 * by Kevin's real commits and the figures with labels are his real Claude Code
 * sessions; none of that is touched here. `town().folk` has only ever been a
 * COUNT with nobody behind it, and that is the ground this builds on. The
 * citizens are fiction, plainly, and they live alongside the real settlement
 * rather than replacing it.
 *
 * TIME. The world runs whether or not a browser is open: every tick is
 * derived from the wall clock, so a night away is a season here, and the hub
 * being restarted or asleep costs nothing but the catching up. One tick is an
 * hour of settlement time, and an hour passes every ninety real seconds — so
 * a day turns roughly every half hour, and a night's sleep is a fortnight.
 *
 * STATE IS SAVED, and that is a real departure from the rest of this project,
 * where everything is a pure function of a coordinate and nothing is ever
 * written down. A simulation cannot work that way: history is the whole
 * point. Written beside and renamed, so a crash mid-write cannot leave a
 * torn settlement.
 */

import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { citizen, hashString } from './citizens.mjs';
import { PROJECTS, chooseProject, grade, spotFor, redundant, DIMENSIONS, CAPACITY } from './quality.mjs';
import { unearth, corpusSize } from './finds.mjs';
import { digFor } from '../src/app/digs.js';

/**
 * Where the settlement is written down.
 *
 * The same simulation runs in two places now: on Kevin's Mac inside the hub,
 * and on a GitHub runner every half hour so the town keeps living when his
 * machine is off. Those want different files, so the path is an environment
 * variable with the local one as the default — no branching, no second copy of
 * this module, and nothing to drift apart.
 */
const SAVE = process.env.SETTLEMENT_STATE || `${homedir()}/.claude/arcus-life.json`;

/** One tick is an hour of settlement time. */
const TICK_MS = 90_000;
/** Never replay more than this in one go, however long the hub was down. */
const MAX_CATCHUP = 24 * 30;

// ── Randomness ──────────────────────────────────────────────────────────────
//
// Seeded per tick rather than Math.random(), so a given tick always plays out
// the same way. That matters more than it sounds: it means the chronicle can
// be rebuilt from the clock alone if the save is ever lost, and it means a bug
// in an event can be reproduced by asking for that tick again.

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const chance = (r, p) => r() < p;

// ── What a citizen can want ─────────────────────────────────────────────────
//
// An ambition is the engine of the whole thing. It gives a citizen a reason to
// act, a reason to need other people, and something that can be finished —
// and a finished ambition is an event worth telling, which is where the
// settlement's history comes from.

/**
 * The citizens' work is now the WORLD's quality, not their own errands.
 *
 * The first version gave everyone a private ambition — plant a garden, hold a
 * feast — and those were just flavour: the chronicle said a shrine went up and
 * no shrine ever appeared. What Kevin actually asked for is that the citizens
 * are working on making the place look more expensive and more intricate, and
 * that it compounds. So a citizen's ambition is now a PROJECT out of
 * arcus-quality.mjs, aimed at whichever of the seven dimensions the settlement
 * currently scores worst on, and finishing one puts real objects on real
 * ground.
 */

/**
 * What the ground gives up. Each is used once and then gone — see the dig in
 * step(). They are deliberately unexplained: a find that came with its own
 * interpretation would close the thing it is meant to open.
 */
const FINDS = [
  'a cup of green glass, unbroken',
  'a door hinge with no door anywhere near it',
  'a second stone, face down, too heavy to turn',
  "a child's shoe, and then the other one",
  'a row of post holes running under the square',
  'a bowl of small bones, arranged deliberately',
  'a coin with a face nobody recognises',
  'charcoal in a ring, and a great deal of it',
  'a wall that stops, squarely, in the middle of a field',
  'thirty iron nails in a pouch, unused',
  'a grindstone worn through on one side only',
  'the jaw of an animal nobody can name',
  'a step, and beneath it another step',
  'a comb of bone with two teeth left',
  'a pit of oyster shells, nowhere near the sea',
  'a hearth laid on top of an older hearth',
  'a ring too small for any hand here',
  'a line of stakes running straight into the river',
];

/** What a citizen is called by what they do. Assigned once, from their own id. */
const TRADES = ['digger', 'reader of the stone', 'mason', 'carter', 'weaver', 'cook',
  'beekeeper', 'herbalist', 'roofer', 'shepherd', 'miller', 'scribe'];

// ── Building the settlement's people ────────────────────────────────────────

/**
 * A new citizen. `seed` is their permanent identity — everything about who
 * they ARE derives from it, so the same citizen is always the same person,
 * while everything that HAPPENS to them is saved.
 */
function born(seed, bornAtTick, aim = null) {
  const c = citizen(`cit:${seed}`);
  const r = rng(hashString(`born:${seed}`));
  const amb = chooseProject(aim, r, c);
  return {
    seed,
    name: c.name,
    traits: c.traits,
    temper: c.temper,
    trade: pick(r, TRADES),
    born: bornAtTick,
    mood: 0,
    ambition: { key: amb.key, want: amb.want, needs: amb.needs, done: 0, dim: amb.dim },
    finished: [],
    bonds: {},   // other seed -> affinity, -100..100
    partner: null,
  };
}

const affinity = (a, b) => a.bonds[b.seed] ?? 0;

function nudge(a, b, by) {
  a.bonds[b.seed] = Math.max(-100, Math.min(100, affinity(a, b) + by));
  b.bonds[a.seed] = Math.max(-100, Math.min(100, affinity(b, a) + by));
}

/**
 * How well two people take to each other, before anything has happened.
 *
 * Warmth pulls toward everyone. Beyond that, likeness helps and opposition
 * grates — but only on the traits that show: two proud people is a rivalry,
 * two curious people is a friendship. This is the whole social physics, and
 * it is deliberately this small. Complexity here comes from many people
 * meeting many times, not from an elaborate rule.
 */
function chemistry(a, b) {
  const warm = (a.traits.warmth + b.traits.warmth) * 18;
  const alike = 1 - Math.abs(a.traits.curiosity - b.traits.curiosity);
  const clash = Math.abs(a.traits.pride + b.traits.pride) * (a.traits.pride > 0 && b.traits.pride > 0 ? -14 : 0);
  return warm + alike * 10 + clash;
}

// ── The chronicle ───────────────────────────────────────────────────────────

const MONTHS = ['Frostmoon', 'Thawmoon', 'Seedmoon', 'Greenmoon', 'Longmoon', 'Haymoon',
  'Sunmoon', 'Harvestmoon', 'Mistmoon', 'Fallmoon', 'Huntmoon', 'Darkmoon'];

/** A tick, said as a date. Twelve months of thirty days, which a settlement would keep. */
export function dateOf(tick) {
  const day = Math.floor(tick / 24);
  const year = Math.floor(day / 360) + 1;
  const month = Math.floor((day % 360) / 30);
  return { year, month: MONTHS[month], day: (day % 30) + 1 };
}
const said = (tick) => {
  const d = dateOf(tick);
  return `${d.day} ${d.month}, year ${d.year}`;
};

/**
 * Something the settlement wants that its own hands cannot make.
 *
 * The citizens place objects, which is safe — it is only ever data, and it
 * cannot break a render. When the thing actually needed is ENGINE work (a new
 * kind of asset, a new system, better light) they write it down here instead
 * of attempting it. Kevin's call, and the right one: an agent committing
 * rendering code unsupervised overnight is how you come back to a world that
 * will not load. So the settlement keeps a list of what it needs next, and a
 * person builds it.
 */
function propose(state, tick, dim, text) {
  if (state.proposals.some((p) => p.text === text)) return;
  state.proposals.push({ at: said(tick), tick, dim, text });
  if (state.proposals.length > 40) state.proposals.shift();
}

/**
 * A model's filename in the words a person would use for it.
 *
 * The chronicle is the only part of this the reader actually reads, so it
 * cannot be a list of asset names. Anything without an entry falls back to its
 * first word, which is right far more often than not — `wheelbarrow` and
 * `ladder` need nothing.
 */
// Every word here is a PLURAL, so the sentence around it never has to guess
// whether to say "its" or "their".
const WORD = {
  resource_lumber: 'logs', resource_stone: 'stones', building_grain: 'grain beds',
  building_dirt: 'dirt patches', building_stage_A: 'stalls', building_stage_B: 'stalls',
  building_stage_C: 'stalls', building_tower_base_red: 'watchposts',
  building_tower_B_green: 'watchposts', bucket_empty: 'buckets', bucket_arrows: 'arrows',
  weaponrack: 'weapon racks', target: 'target butts', pallet: 'pallets', sack: 'sacks',
  barrel: 'barrels', ladder: 'ladders', wheelbarrow: 'barrows',
};

const plainWord = (kind) => WORD[kind]
  ?? { crate: 'crates', flag: 'banners', tree: 'saplings', trees: 'saplings', rock: 'stones',
    fence: 'fencing', wall: 'walling', waterlily: 'lilies', waterplant: 'reeds' }[kind.split('_')[0]]
  ?? kind.split('_')[0];

/** The removed pieces, said the way somebody would say them out loud. */
function listOf(kinds) {
  const words = [...new Set(kinds.map(plainWord))];
  if (words.length === 1) return `the ${words[0]}`;
  if (words.length === 2) return `the ${words[0]} and ${words[1]}`;
  return `the ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function record(state, tick, kind, text, who = [], extra = null) {
  state.chronicle.push({ tick, at: said(tick), kind, text, who, ...(extra || {}) });
  // A settlement keeps what it can carry. The newest thousand entries is
  // several real weeks of history and keeps the save from growing forever.
  if (state.chronicle.length > 1000) state.chronicle.splice(0, state.chronicle.length - 1000);
}

/**
 * Do one project: make room if the settlement is full, then put the pieces
 * down. Hands back what went in and what came out.
 *
 * MAKING ROOM IS PART OF THE JOB. A settlement can only hold so much before it
 * is clutter rather than detail, and before the world is slow to draw. Reaching
 * that point is not the end of the work, it is the point where the work
 * changes: from putting more things down to taking the weakest ones out and
 * doing them properly. `redundant` decides what has stopped earning its place,
 * and it is told the ground rule as well, so the room it clears is room where
 * the work actually is.
 */
function doProject(state, spec, worker, tick, pr) {
  const took = [];
  let put = 0;
  if (!spec) return { put, took };

  if (state.placements.length + spec.n > CAPACITY) {
    const room = Math.max(1, spec.n - Math.max(0, CAPACITY - state.placements.length));
    const out = redundant(state.placements, state.quality?.scores ?? {}, spec.dim, pr, room, spec.place, spec.kinds);
    for (const i of [...out].sort((a, b) => b - a)) {
      took.push(state.placements[i].kind);
      state.placements.splice(i, 1);
    }
  }

  for (let k = 0; k < spec.n; k++) {
    if (state.placements.length >= CAPACITY) break;
    // The kind is chosen BEFORE the spot, because how much room a piece needs
    // is the first thing the ground has to be asked about.
    const kind = spec.kinds[Math.floor(pr() * spec.kinds.length) % spec.kinds.length];
    const spot = spotFor(spec.place, pr, state.placements, kind);
    if (!spot) break;
    state.placements.push({
      kind, x: spot.x, z: spot.z, rot: spot.rot,
      tag: spec.tag, by: worker.seed, at: tick,
    });
    put++;
  }
  return { put, took };
}

// ── One hour in the settlement ──────────────────────────────────────────────

function step(state, tick) {
  const r = rng(hashString(`tick:${tick}`));
  const people = state.citizens;
  if (people.length < 2) return;

  /**
   * Who runs into whom.
   *
   * Weighted toward people who already know each other, and that weighting is
   * the difference between a settlement and a room of strangers. Picking both
   * parties uniformly meant that across a whole month barely any PAIR met
   * twice — forty-eight people make eleven hundred possible pairs — so no
   * affinity ever accumulated and nothing social ever happened. Real
   * acquaintance is lopsided: you see the same handful of people constantly
   * and most of the settlement almost never.
   */
  const meet = () => {
    const a = pick(r, people);
    const known = Object.keys(a.bonds)
      .filter((k) => !k.includes(':'))
      .map((k) => people.find((p) => String(p.seed) === k))
      .filter(Boolean);
    const b = (known.length && chance(r, 0.72)) ? pick(r, known) : pick(r, people);
    return [a, b];
  };

  for (let i = 0; i < 4; i++) {
    const [a, b] = meet();
    if (a === b) continue;

    const base = chemistry(a, b);
    const swing = base / 3.2 + (r() - 0.5) * 10;
    nudge(a, b, swing);
    const now = affinity(a, b);

    // Crossings worth remembering. Everything else is two people passing.
    if (now >= 70 && !a.bonds[`friend:${b.seed}`]) {
      a.bonds[`friend:${b.seed}`] = 1; b.bonds[`friend:${a.seed}`] = 1;
      record(state, tick, 'bond', `${a.name} and ${b.name} are thick as thieves now.`, [a.seed, b.seed]);
    }
    if (now <= -60 && !a.bonds[`feud:${b.seed}`]) {
      a.bonds[`feud:${b.seed}`] = 1; b.bonds[`feud:${a.seed}`] = 1;
      const over = pick(r, ['the well rota', 'a boundary stone', 'a debt of grain',
        'what the Stone means', 'a dog', 'the best pitch at market', 'a felled tree',
        'whose turn it was to watch the ford']);
      record(state, tick, 'feud', `${a.name} and ${b.name} fell out over ${over}.`, [a.seed, b.seed]);
    }
    if (now >= 88 && !a.partner && !b.partner && chance(r, 0.3)) {
      a.partner = b.seed; b.partner = a.seed;
      record(state, tick, 'love', `${a.name} and ${b.name} were handfasted by the Stone.`, [a.seed, b.seed]);
    }
    // A feud can cool, and an old friendship can go sour. Nothing here is
    // permanent, which is what keeps the settlement from settling.
    if (a.bonds[`feud:${b.seed}`] && now > 10) {
      delete a.bonds[`feud:${b.seed}`]; delete b.bonds[`feud:${a.seed}`];
      record(state, tick, 'peace', `${a.name} and ${b.name} are on speaking terms again.`, [a.seed, b.seed]);
    }
  }

  // Work. Several hands at it each hour, each leaning on their strongest
  // trait, with friends lending help — which is the quiet reason the social
  // side matters to the built world: a well-liked citizen finishes things, a
  // feuding one does not.
  for (let i = 0; i < 4; i++) {
    const worker = pick(r, people);
    const amb = worker.ambition;
    if (!amb || amb.done >= amb.needs) continue;
    const trait = worker.traits[amb.trait] ?? 0;
    const friends = Object.keys(worker.bonds).filter((k) => k.startsWith('friend:')).length;
    const feuds = Object.keys(worker.bonds).filter((k) => k.startsWith('feud:')).length;
    amb.done += Math.max(0.3, 1.6 + trait * 1.4 + friends * 0.7 - feuds * 0.5 + r());
    if (amb.done < amb.needs) continue;

    // FINISHED — and this is where the world actually changes. The project
    // names real models and a ground rule; every piece is placed by the same
    // test that decides where a house may stand, so nothing lands in the
    // river or through a wall.
    const spec = PROJECTS.find((x) => x.key === amb.key);
    const pr = rng(hashString(`build:${worker.seed}:${tick}`));

    // The settlement re-grades itself the moment work lands, so what anybody
    // takes on next is aimed at what is NOW worst. That is the whole
    // compounding mechanism: each finished job moves the target.
    const nr = rng(hashString(`next:${worker.seed}:${tick}`));

    // A job is taken on long before it is finished, and the settlement can
    // finish that job through somebody else's hands in the meantime. Checking
    // again at the moment the work would actually land is what stops ten people
    // all delivering the same already-finished job — which matters most at the
    // Stone, where what they bring can never be taken away again.
    const settled = spec && (state.quality?.scores?.[spec.dim] ?? 0) >= 0.999;
    let done = settled ? { put: 0, took: [] } : doProject(state, spec, worker, tick, pr);

    // Some jobs the ground simply will not take — a wall claims ten units of
    // clear ground and a mature settlement has none left in the right ring. A
    // person in either position does not stand there failing, they go and do
    // something else, so that is what happens here. The chronicle says so,
    // which is a change of plan rather than an error.
    let instead = null;
    if (!done.put && spec) {
      instead = chooseProject(state.quality, nr, worker, spec.key);
      done = doProject(state, instead, worker, tick, pr);
    }

    worker.finished.push(amb.key);
    state.works.push({ key: amb.key, by: worker.seed, name: worker.name, at: tick, put: done.put });

    const g = grade(state.placements);
    state.quality = g;

    const next = chooseProject(g, nr, worker);
    worker.ambition = { key: next.key, want: next.want, needs: next.needs, done: 0, dim: next.dim };

    const did = (instead ?? spec ?? amb).want;
    if (done.put && instead && settled) {
      record(state, tick, 'turn',
        `${worker.name} came ${amb.want} and found it already done, so went ${did} instead.`,
        [worker.seed]);
    } else if (done.put && instead) {
      record(state, tick, 'turn',
        `${worker.name} could find no ground left ${amb.want}, and went instead ${did}.`,
        [worker.seed]);
    } else if (done.put && done.took.length) {
      record(state, tick, 'rework',
        `${worker.name} took out ${listOf(done.took)} that had stopped earning their place, and used the room ${did}.`,
        [worker.seed]);
    } else if (done.put) {
      record(state, tick, 'work',
        `${worker.name} finished it: ${did.replace(/^to /, '')}. Next they mean ${next.want.replace(/^to /, '')}.`,
        [worker.seed]);
    } else {
      // Both the job and the fallback were refused, which means the ground
      // itself has run out — no bank left to plant, no verge left to fence.
      // That is the settlement telling us it has outgrown what it can do with
      // the pieces it has, and it is the one thing here worth my attention.
      record(state, tick, 'stuck',
        `${worker.name} went the length of the valley looking for room ${amb.want}, and found none.`,
        [worker.seed]);
      propose(state, tick, spec ? spec.dim : 'density',
        `Citizens have run out of ground for "${amb.want.replace(/^to /, '')}". The settlement needs new KINDS of thing here, not more of the same.`);
    }
  }

  /**
   * The dig. Rare, and never the same twice.
   *
   * Finds are drawn from a pool that is spent as it is used, because the first
   * pass rolled them independently and a month of digging turned up the same
   * child's shoe four times. A settlement's history has to be able to surprise
   * you a second time, and it cannot do that by repeating itself.
   */
  if (chance(r, 0.004)) {
    const finder = pick(r, people);
    const pool = FINDS.filter((f) => !state.found.includes(f));
    if (pool.length) {
      const find = pick(r, pool);
      state.found.push(find);
      state.finds.push({ text: find, by: finder.seed, name: finder.name, at: tick });
      record(state, tick, 'find', `${finder.name} turned up ${find}.`, [finder.seed]);
    }
  }
}

// ── The dig ─────────────────────────────────────────────────────────────────

/**
 * What the archaeologists turn up.
 *
 * This is the one part of the settlement's life that is NOT the citizens'. The
 * people digging are Kevin's own sessions — every figure in the dig crew's
 * uniform is a real Claude Code session — and when one of them is working it is
 * out at a real site, a good hike from the last house. See
 * world/src/app/digs.js for where those are; both sides import the same module,
 * so the site the chronicle names is the site the figure is standing at.
 *
 * What comes out is a genuine line from a genuine book (arcus-finds.mjs), spent
 * as it is used, so the ground can surprise you twice.
 *
 * ROLLED ONCE PER ELAPSED TICK, AND CAPPED. We only know what the crew is doing
 * right NOW, so replaying a fortnight of missed ticks against today's crew would
 * be inventing a fortnight of digging nobody did. The cap keeps a long absence
 * worth a find or two rather than the whole corpus at once.
 */
const DIG_CAP = 40;           // at most this many ticks of digging per catch-up
const DIG_CHANCE = 1 / 34;    // per tick, per person at a site

function digCrew(state, tick, crew, elapsed) {
  const workers = (crew || []).filter((p) => p && p.state === 'working');
  if (!workers.length) return;
  const rolls = Math.max(1, Math.min(DIG_CAP, elapsed));
  const r = rng(hashString(`dig:${tick}:${workers.length}`));
  for (let i = 0; i < rolls; i++) {
    for (const p of workers) {
      if (!chance(r, DIG_CHANCE)) continue;
      const got = unearth(state.found, r);
      if (!got) return; // the whole corpus is above ground
      state.found.push(got.text);
      const site = digFor(p.id);
      const who = p.who?.name || p.title || 'Someone';
      state.finds.push({ ...got, at: tick, name: who, where: site?.where ?? 'the far field' });
      record(state, tick, 'unearth',
        `${who} turned up a line at ${site?.where ?? 'the far field'}.`,
        [], { quote: got.text, source: got.source });
    }
  }
}

// ── Running the clock ───────────────────────────────────────────────────────

function blank(now) {
  return { started: now, tick: 0, lastAt: now, citizens: [], works: [], finds: [], found: [],
    placements: [], proposals: [], quality: null, chronicle: [] };
}

function load() {
  try { return JSON.parse(readFileSync(SAVE, 'utf8')); } catch { return null; }
}

function save(state) {
  const tmp = `${SAVE}.tmp`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, SAVE);
}

/**
 * Bring the settlement up to the present, and hand back what it looks like.
 *
 * `folk` is the real population number from arcus-town.mjs — people live here
 * because there is somewhere to live — so citizens are born and the roll grows
 * to match it. Nobody is ever removed: a settlement's dead stay in its
 * chronicle.
 *
 * `crew` is the real one: Kevin's own open sessions, as the world feed already
 * assembled them. The citizens never touch it. It is here because the people
 * out at the dig sites ARE those sessions, and what they turn up belongs in
 * the same chronicle as everything else that happens here.
 */
export function life(folk, now = Date.now(), crew = []) {
  let state = load();
  let dirty = false;
  if (!state || !Array.isArray(state.citizens)) { state = blank(now); dirty = true; }
  if (!Array.isArray(state.found)) state.found = [];
  if (!Array.isArray(state.placements)) state.placements = [];
  if (!Array.isArray(state.proposals)) state.proposals = [];

  // Fill out the roll to the real population.
  while (state.citizens.length < folk) {
    dirty = true;
    const seed = state.citizens.length + 1;
    // A founding generation all born before anything has been graded would
    // otherwise every one of them want the same thing — the settlement had
    // forty-eight people and one idea, and three of the seven dimensions sat
    // at zero all night because nobody was ever assigned to them. Once there
    // IS a weakest dimension it rules; until then, spread them out.
    const aim = state.quality
      || { scores: {}, weakest: DIMENSIONS[seed % DIMENSIONS.length].key };
    const c = born(seed, state.tick, aim);
    state.citizens.push(c);
    if (state.tick > 0) {
      record(state, state.tick, 'arrival', `${c.name}, ${c.trade}, came to the settlement.`, [c.seed]);
    }
  }

  // Catch the clock up. Every tick that should have happened, happens — the
  // hub being restarted or the machine asleep costs nothing but the replay.
  const owed = Math.floor((now - state.lastAt) / TICK_MS);
  const run = Math.min(Math.max(0, owed), MAX_CATCHUP);
  for (let i = 0; i < run; i++) {
    state.tick += 1;
    step(state, state.tick);
  }
  // The dig runs once for the whole catch-up rather than inside the loop —
  // what the crew is doing is only known for NOW, and replaying a fortnight
  // against today's crew would be inventing a fortnight of digging.
  if (run > 0) digCrew(state, state.tick, crew, run);
  // Saved whenever anything changed, not only when the clock moved. A brand
  // new settlement runs no ticks on its very first call — the clock has had
  // no time to owe any — so saving on ticks alone meant it was never written
  // down, and the next call started from nothing all over again. The clock
  // could never begin.
  if (run > 0) { state.lastAt = now; dirty = true; }
  if (dirty) save(state);

  return summary(state);
}

/** What the world needs to know, without handing over the whole simulation. */
function summary(state) {
  const d = dateOf(state.tick);
  return {
    date: d,
    said: said(state.tick),
    tick: state.tick,
    // What the settlement thinks of itself, and what it says it needs next.
    quality: state.quality || grade(state.placements),
    dimensions: DIMENSIONS.map((d) => ({ key: d.key, name: d.name, why: d.why })),
    placements: state.placements,
    proposals: state.proposals.slice(-12).reverse(),
    // What the dig has brought up, newest first, and how much is still buried.
    library: { found: state.finds.filter((f) => f.source).slice(-40).reverse(), of: corpusSize() },
    citizens: state.citizens.map((c) => ({
      seed: c.seed, name: c.name, trade: c.trade, temper: c.temper,
      want: c.ambition ? c.ambition.want : null,
      dim: c.ambition ? c.ambition.dim : null,
      progress: c.ambition ? Math.min(1, c.ambition.done / c.ambition.needs) : 0,
      partner: c.partner ? (state.citizens.find((o) => o.seed === c.partner)?.name ?? null) : null,
      friends: Object.keys(c.bonds).filter((k) => k.startsWith('friend:')).length,
      feuds: Object.keys(c.bonds).filter((k) => k.startsWith('feud:')).length,
      finished: c.finished.length,
    })),
    works: state.works.slice(-40),
    finds: state.finds.slice(-20),
    // Newest first, because that is the order anyone actually reads a
    // chronicle they have been away from.
    chronicle: state.chronicle.slice(-60).reverse(),
  };
}
