/**
 * The critic: the thing that looks at the settlement and says what is wrong
 * with it, then writes new work for the citizens to do about it.
 *
 * WHAT IT ACTUALLY IS, SAID PLAINLY. A model with fixed weights. It does not
 * learn anything by running — it cannot. What gets better over time is the
 * JOURNAL it keeps in rulebook.mjs: what it saw, what it added, and what
 * happened to the score afterwards. Each run reads the last twelve entries
 * before deciding, so the thing that compounds is the written record, not the
 * model. Calling the model the learning part would be a lie, and it is the
 * kind of lie that stops you building the part that does work.
 *
 * WHAT IT IS ALLOWED TO TOUCH. rulebook.mjs, and nothing else. It cannot reach
 * the renderer, the terrain, the sound, or the engine, because the only thing
 * this file ever writes is that one module. Whatever it produces goes through
 * verify.mjs before the world is rebuilt, and a rulebook that fails is thrown
 * away with the last good one kept. See the workflow.
 *
 * WHERE IT RUNS. On a GitHub runner, against whichever model Kevin has given
 * it a key for — nothing against his Claude usage, and nothing installed on
 * his machine. It is handed a real screenshot of the world so its criticism is
 * about THIS place rather than about video games in general, which is the
 * whole difference between a useful note and a fortune cookie.
 *
 * NOT TIED TO ONE PROVIDER, and that is not future-proofing for its own sake:
 * the first version used GitHub Models, on the repository's own token, and the
 * very first scheduled run came back "GitHub Models is temporarily unavailable
 * as part of a scheduled retirement brownout". A service that is being retired
 * is a bad thing to hard-code. So it speaks the OpenAI chat-completions shape,
 * which every provider worth using accepts, and the endpoint, model and key
 * are three environment variables. Change provider by changing a secret.
 *
 * The known-good free ones, for whoever reads this next:
 *   Google AI Studio  https://generativelanguage.googleapis.com/v1beta/openai
 *                     model gemini-3.6-flash — free tier, sees images.
 *                     Model names there go stale fast: 2.0-flash was already
 *                     retired the day this was written, and the API says so
 *                     with a 404 that names its replacement. A 404 here means
 *                     the model, not the key; 401 or 403 means the key.
 *   Groq              https://api.groq.com/openai/v1
 *                     model meta-llama/llama-4-scout-17b-16e-instruct
 *
 * With no key it does nothing and says so. The settlement's clock does not
 * depend on it: the town lives whether or not anybody is criticising it.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULEBOOK = join(HERE, 'rulebook.mjs');

const BASE = (process.env.CRITIC_URL || 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/$/, '');
const ENDPOINT = `${BASE}/chat/completions`;
const MODEL = process.env.CRITIC_MODEL || 'gemini-3.6-flash';
const KEY = process.env.CRITIC_KEY;

/** Every model the world really has. Naming one that is not here is refused. */
function kinds() {
  return readdirSync(join(HERE, '..', 'public', 'assets', 'kaykit'))
    .filter((f) => f.endsWith('.gltf')).map((f) => f.slice(0, -5)).sort();
}

const BRIEF = `You are the design critic for a small 3D medieval settlement that builds itself.

Its citizens work to make it look like somewhere expensive was spent. They score
themselves on a handful of things and always work on whichever score is worst.
They have run out of ideas: the scores sit near full and the town has stopped
getting more interesting, only more tidy.

Your job is to look at the picture of it, look at the scores, and add work that
would make it BETTER — not busier. You may add:

  jobs        something a citizen takes on, finishes, and thereby changes the
              world by placing real objects on real ground
  dimensions  a new thing for the settlement to care about, which is how the
              ceiling moves once the existing scores are full

Be specific to what you can actually see. "More variety" is worthless. "The lane
along the river has nothing on the water side, so it reads as a wall" is worth
having, and tells you what job to write.

Rules you cannot break:
- kinds[] may ONLY name models from the list given. Anything else is refused.
- every new dimension must have at least one new job whose tag matches it.
- prefer 1 or 2 new dimensions and 3 to 6 new jobs per run. Small and considered
  beats a pile.
- do not repeat anything already in the journal unless you say why it failed.

Answer with JSON only, no prose, in this exact shape:
{"seen":"one or two sentences on what is actually wrong in the picture",
 "dimensions":[{"key":"","name":"","why":"","tag":"","target":0}],
 "projects":[{"key":"","dim":"","want":"to ...","needs":0,"place":"","tag":"","n":0,"kinds":[""]}]}

place is one of: byPlot square byLane outskirt rim water shrine
tag is one of: clutter tall edge accent plain sacred
needs 20-110, n 1-8, target 10-160.`;

async function ask(state, shot) {
  if (!KEY) {
    console.log('no CRITIC_KEY set — the town lives on, uncriticised');
    return null;
  }

  const content = [{ type: 'text', text:
    `${BRIEF}\n\nSCORES RIGHT NOW\n${JSON.stringify(state.quality, null, 1)}\n\n`
    + `WHAT STANDS THERE, BY TAG\n${JSON.stringify(state.byTag)}\n\n`
    + `MODELS YOU MAY NAME\n${kinds().join(' ')}\n\n`
    + `WHAT PREVIOUS RUNS DID\n${state.journal.map((j) => `- ${j.at}: ${j.seen} -> ${j.added}`).join('\n') || '(nothing yet)'}` }];

  if (shot) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${shot}` } });
  }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.8, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) { console.log(`critic unavailable: ${res.status} ${await res.text()}`.slice(0, 400)); return null; }
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content ?? '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(json); } catch { console.log('critic did not answer with JSON'); return null; }
}

/**
 * Rewrite rulebook.mjs with what the critic added on top of what is there.
 *
 * Written as real source rather than data because that is what it is — the
 * citizens' rulebook is a module the simulation imports — and because a diff
 * of it in the repository is a readable record of what the town decided to
 * care about and when.
 */
function write(existing, from) {
  const projects = [...existing.EXTRA_PROJECTS, ...(from.projects ?? [])];
  const dimensions = [...existing.EXTRA_DIMENSIONS, ...(from.dimensions ?? [])];
  const journal = [{
    at: new Date().toISOString().slice(0, 10),
    seen: String(from.seen ?? '').slice(0, 300),
    added: [...(from.dimensions ?? []).map((d) => d.key), ...(from.projects ?? []).map((p) => p.key)].join(', ') || 'nothing',
  }, ...existing.JOURNAL].slice(0, 40);

  const head = readFileSync(RULEBOOK, 'utf8').split('/** New jobs the citizens can take on. */')[0];
  writeFileSync(RULEBOOK,
    `${head}/** New jobs the citizens can take on. */\n`
    + `export const EXTRA_PROJECTS = ${JSON.stringify(projects, null, 2)};\n\n`
    + `/** New things for the settlement to care about. */\n`
    + `export const EXTRA_DIMENSIONS = ${JSON.stringify(dimensions, null, 2)};\n\n`
    + `/**\n * Written by the critic each time it changes something: what it saw, what it\n`
    + ` * added, and why. Kept so the next run can read what the last one thought and\n`
    + ` * stop repeating itself — this, rather than the model, is the part that\n`
    + ` * actually gets better over time. Newest first, capped at forty.\n */\n`
    + `export const JOURNAL = ${JSON.stringify(journal, null, 2)};\n`);
}

const statePath = process.env.SETTLEMENT_STATE || join(HERE, '..', 'state', 'settlement.json');
const shotPath = process.env.CRITIC_SHOT || join(HERE, '..', 'state', 'world.png');

const saved = JSON.parse(readFileSync(statePath, 'utf8'));
const byTag = {};
for (const p of saved.placements ?? []) byTag[p.tag] = (byTag[p.tag] ?? 0) + 1;

const existing = await import('./rulebook.mjs');
const shot = existsSync(shotPath) ? readFileSync(shotPath).toString('base64') : null;
if (!shot) console.log('no screenshot — the critic will be working blind');

const answer = await ask({ quality: saved.quality, byTag, journal: existing.JOURNAL.slice(0, 12) }, shot);
if (!answer) process.exit(0);                    // nothing written, nothing broken

write(existing, answer);
console.log('critic wrote:', [...(answer.dimensions ?? []).map((d) => d.key), ...(answer.projects ?? []).map((p) => p.key)].join(', ') || 'nothing');
console.log('it saw:', answer.seen);
