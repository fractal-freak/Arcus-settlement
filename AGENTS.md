# Working on this world

A medieval settlement that builds itself. Its citizens score their own town on
a handful of things, always work on whichever score is worst, and a critic
looks at a real screenshot every half hour and writes them new work. It is
live at https://fractal-freak.github.io/Arcus-settlement/.

This file is for whoever — or whatever — edits it next.

## This is not the app

Kevin's astrology product, Arcus, lives at `~/Desktop/Arcus` and has nothing to
do with this. Different repository, different remote, no shared files, no
shared build. **Nothing you do here can affect it.** That is the point of this
folder existing: it is somewhere to be playful without watching your step.

The one connection is one-way and read-only: when the page is opened from
Kevin's own machine, a local server tells it which Claude Code sessions he has
open, and each becomes a person in the world. Off his machine that half is
simply absent. Nothing here writes to Arcus, reads its source, or shares its
dependencies.

## Run it

```
npm install
npm run build          # there is no dev server, on purpose — see below
```

Then open `dist/index.html` through any static server. On Kevin's machine the
settlement is already served at http://localhost:5199/world/next/ by a
permanent local process, which also supplies the live sessions. **Do not start
a server on port 5199 or 5173** — those belong to that process and to his app.

There is no watch mode because the world is built, not hot-reloaded: `npm run
build` takes about 300ms and the page is a single bundle.

## The shape of it

```
src/app/      pure logic that knows nothing about drawing
              terrain village digs propSizes occupied ambience
src/three/    the renderer, which invents nothing
              stage terrain3d town3d built3d people3d folk3d digsite3d …
src/data/     the feed
sim/          the settlement's own life, run by Node
              life quality citizens finds rulebook critic verify shoot tick
state/        the settlement's memory. DO NOT EDIT BY HAND
```

## Rules worth more than they look

**Data has no opinion about rendering; rendering invents nothing about data.**
Terrain is a pure function of a coordinate. The street plan decides where a
house may stand; the renderer only draws it there. This is why swapping the
whole 2D engine for Three.js took an afternoon.

**A position is a fact about the settlement, not a detail of how it is drawn.**
Five landmark positions were once typed inside the renderer, so nothing else in
the world knew the well existed — and people stood inside it. They live in
`src/app/village.js` now. If you add something that occupies ground, it goes
there, and `src/app/occupied.js` is the one test for "can somebody stand here".

**One scale for the whole kit: 5.0, no exceptions.** Every model comes from the
same pack, modelled against the same ruler. Fitting each piece to a fixed
footprint instead throws that away — a small crate and a big crate came out the
same size, both taller than a person, and a grove came out shorter than a
single tree. If something looks the wrong size, the model is wrong.

**Never assume what an asset is from its name.** A "roof side corner" turned
out to be a decorative ridge beam, so every gable stood open. A "wall pane" was
four disconnected pieces. Load it, measure it, look at it.

**Measure, do not guess, anything driven by a rig you did not author.** Three
guesses about which bone and which axis swung a pickaxe were all wrong; one
five-line probe answered all three. Rotate it, read where the thing actually
moved, then write the code.

**`window.__world.step(n)` is how you verify.** A hidden or headless browser
freezes animation frames, so waiting for the world to render measures your test
rig rather than the world. `step()` runs exactly what the real loop runs,
synchronously. Every performance number in this project was taken by timing
`performance.now()` around repeated `step(1)` calls.

## Before you push

```
node sim/verify.mjs    # the rulebook is sane
npm run build
node sim/shoot.mjs     # the world boots headlessly and is not slower
```

The scheduled job runs all three anyway and refuses anything that fails, but
finding out here is faster than finding out in twenty minutes.

## What the AI is allowed to write

`sim/rulebook.mjs`, and nothing else — new jobs for the citizens and new things
for the town to care about. It cannot reach the renderer, the terrain or the
sound. Everything it writes passes `sim/verify.mjs` first: the models it names
must exist on disk, every new score must be reachable by some job, and every
job must find real ground in fifty real attempts. Anything refused is reverted
and the last good rulebook kept.

If you want the citizens to be able to do something new, that is where it goes.
If they want something the engine cannot do yet, the engine is a human job.

## What must never be published

This repository is public. Two things have already had to be stripped out of it
and must not come back:

- **Session data.** Titles, working directories, branch names — anything about
  what Kevin is doing. The published feed carries an empty `people` array.
- **Commit subjects.** Each building is earned by twenty real commits and used
  to carry the commit's title. A hundred and thirty-three of those are the
  development history of a product he has not launched. `sim/tick.mjs` strips
  every building down to `n`, `trade`, `weight` on every run.

`ASSETS.md` records every model, text and sound with its source and licence.
Everything is CC0 or public domain. Keep it that way, and keep that file true.
