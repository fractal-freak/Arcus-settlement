/**
 * The people of the settlement: who they are, before anything they do.
 *
 * This is the first piece of the living layer. The buildings and the sessions
 * in this world are REAL — earned by real commits, standing for real Claude
 * Code sessions — and that does not change. What this module adds is the part
 * that was always fiction anyway: `town().folk` has only ever been a COUNT,
 * `Math.floor(buildings/3) + 4`, with no individuals behind it. Those are the
 * citizens, and they are about to start having lives.
 *
 * WHY NO MODEL IS INVOLVED. The obvious way to make citizens "think" is to
 * ask a language model. It is also the wrong first move, and expensively so.
 * What produces a world that surprises you when you come back to it is a
 * SIMULATION — people with traits and wants, rubbing against each other under
 * rules — not prose generated on demand. Dwarf Fortress has no model in it at
 * all. A model is genuinely good at one job here, naming and telling, and
 * that job only exists once there is something to name and tell. So: the sim
 * first, and it runs on arithmetic.
 *
 * DETERMINISM. A name is derived from the citizen's own id and nothing else,
 * the same rule the whole landscape already runs on — hash the identity,
 * never store the result. A session keeps its name across reloads, restarts
 * and rebuilds, for the same reason it keeps its spot: nothing was ever
 * written down that could drift.
 */

/** A stable 32-bit hash of a string. Same one the world's 3D side uses on session ids. */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A deterministic stream of numbers from one seed — so every draw is repeatable. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];

// Names are built rather than listed, so the settlement can grow past any
// list I could write and still never repeat itself in a way that reads as a
// repeat. Sounds chosen to sit together: soft, slightly old, nothing that
// belongs to a real modern person.
const FIRST_A = ['Bre', 'Cal', 'Dor', 'El', 'Fen', 'Gil', 'Hal', 'Isa', 'Jor', 'Kel',
  'Lys', 'Mor', 'Nel', 'Ors', 'Pel', 'Rho', 'Sel', 'Tam', 'Ver', 'Wyn', 'Yra', 'Ald', 'Bran', 'Cor'];
const FIRST_B = ['a', 'en', 'ia', 'is', 'or', 'ric', 'wen', 'as', 'ith', 'un', 'ara', 'eth', 'in', 'ow'];
const FAMILY_A = ['Ash', 'Bram', 'Clay', 'Dun', 'Ever', 'Fall', 'Grey', 'Hollow', 'Iron', 'Lark',
  'Marsh', 'North', 'Oak', 'Quill', 'Reed', 'Stone', 'Thorn', 'Under', 'Vale', 'Wold'];
const FAMILY_B = ['barrow', 'brook', 'crest', 'dale', 'fell', 'gate', 'hollow', 'mere', 'ridge',
  'stead', 'wick', 'wood', 'ford', 'moor'];

/**
 * One citizen's name, from their id alone.
 *
 * Two parts each side, so the space is about twelve thousand names wide — far
 * more than a settlement will ever hold, and wide enough that two neighbours
 * sharing a name stays rare rather than becoming the thing you notice.
 */
export function nameFor(id) {
  const r = rng(hashString(`name:${id}`));
  const first = pick(r, FIRST_A) + pick(r, FIRST_B);
  const family = pick(r, FAMILY_A) + pick(r, FAMILY_B);
  return `${first} ${family}`;
}

/**
 * The axes a citizen varies on. Deliberately few, and deliberately opposed —
 * a trait only matters in a simulation if it can put someone at odds with
 * somebody else. Each runs -1 to 1.
 */
export const TRAIT_AXES = ['warmth', 'boldness', 'curiosity', 'patience', 'pride'];

/** One citizen's temperament, from their id alone. */
export function traitsFor(id) {
  const r = rng(hashString(`traits:${id}`));
  const out = {};
  for (const axis of TRAIT_AXES) {
    // Two draws averaged: most people sit near the middle and extremes are
    // rare, which is what makes an extreme worth noticing when it turns up.
    out[axis] = Number(((r() + r()) - 1).toFixed(2));
  }
  return out;
}

/** The single trait a citizen is most defined by, as a word. */
export function temperOf(traits) {
  let axis = TRAIT_AXES[0], best = 0;
  for (const a of TRAIT_AXES) {
    if (Math.abs(traits[a]) > Math.abs(best)) { best = traits[a]; axis = a; }
  }
  const words = {
    warmth: ['cold', 'warm'],
    boldness: ['cautious', 'bold'],
    curiosity: ['settled', 'curious'],
    patience: ['restless', 'patient'],
    pride: ['humble', 'proud'],
  };
  return words[axis][best >= 0 ? 1 : 0];
}

/** Everything knowable about a citizen before they have done anything. */
export function citizen(id) {
  const traits = traitsFor(id);
  return { id, name: nameFor(id), traits, temper: temperOf(traits) };
}
