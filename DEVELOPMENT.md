# Continuous world development

The goal is a cohesive, delightful adventure world with increasingly polished
art direction and play. Breath of the Wild is a reference for composition,
discovery and craft, not a source of assets or a claim of equivalent quality.

The original citizen critic uses the existing Gemini API configuration. The
Codex development heartbeat is paused to stop consuming Codex allowance.
The replacement API development workflow proposes source changes, runs the
existing checks without API keys or write credentials, and reviews matching
images through Gemini. An isolated trusted publisher applies only the original approved candidate,
with an exact-base check and a normal fast-forward push. It never executes
generated code with write credentials. Successful runs trigger the existing
settlement deployment through workflow_run, without actions:write access.
Generated changes cannot modify their runner, tests, workflows or state.

Kevin confirmed billing is disabled and explicitly approved automatic
publication on September 12. Both API loops require FREE_API_CONFIRMED=true. This assertion is not a technical billing cap: disable
it if billing changes. Quota exhaustion skips a pass, with no paid fallback.
The existing world simulation continues independently. Both AI activities can
use Gemini without a Codex subscription allocation; GitHub runner usage is
separate. Review artifacts expire after seven days.

## Current priorities

Kevin's September 12 direction is sustained improvement of the castle, the
village, and the things citizens own. Lead with the Jupiter castle: coherent
architecture, convincing stone and roofs, entrances, courtyards, useful
interiors, and a memorable approach. Develop the surrounding village through
better houses, streets, gardens and workplaces. Give citizens useful tools,
furniture, storage and possessions that reflect their trades and identities.
Ownership and placement belong in world data; the renderer draws those facts.
More objects alone are not progress: each addition must improve craft or use.

Track progress across all three priorities in the journal, keeping steady
attention on the village and personal belongings alongside the castle. A
half-hour wakeup is an opportunity to continue work, not a release deadline.
Larger improvements may span several passes. Finish and verify active work
before beginning an overlapping change; retain all existing quality gates.

## First milestone

Make the first minute from the settlement stone toward the Jupiter gatehouse
feel intentionally designed. Establish an inviting route, a clear landmark,
consistent scale and materials, believable contact with the ground, and one
rewarding discovery. Resolve this area before expanding the map. Coordinate
with existing player and conversation work rather than replacing it.

## Each development pass

1. Read AGENTS.md, ART_DIRECTION.md, this file and the development journal.
   Inspect the working tree and current deployment. Preserve other work;
   use an isolated checkout when files overlap. Never stage unrelated changes.
2. Build and capture the current world with
   `node sim/design-review.mjs .local/design-review/PASS/before`.
   Open every screenshot, and inspect the actual interaction if changing play.
   The matching after directory shares the same saved public feed and time.
3. Pick one observable player-facing weakness. Write the hypothesis and
   acceptance criteria before editing. Prefer composition, route clarity,
   grounded architecture, readable materials, movement and discoveries over
   more props. A frame-cost fix is valid when measurement shows a real problem.
4. Implement a bounded improvement in the real game code. Preserve the pure
   world-data/rendering boundary, shared collision rules, asset scale and CC0
   provenance. Do not change evaluation criteria to make a candidate pass.
5. Run `node --test sim/*.test.mjs`, `node sim/verify.mjs`, `npm run build`,
   and `node sim/shoot.mjs`. Capture matching after views with
   `node sim/design-review.mjs .local/design-review/PASS/after`.
   Inspect both sets. Exercise movement/collision and interactions for changes
   that affect them; screenshots do not establish gameplay quality.
6. Judge the result against the hypothesis and all of: composition and focal
   hierarchy; route readability; grounded geometry and scale; material and
   lighting cohesion; meaningful interaction; frame cost. State concrete
   evidence, remaining flaws and whether the improvement is visible. Numerical
   town scores and passing builds cannot establish artistic quality.
   Revert only this pass's changes if worse or inconclusive. Keep a good
   unchanged world over an unproven addition.
7. Record a short entry in DEVELOPMENT_LOG.md: hypothesis, files, evidence,
   checks, accepted/rejected, next priority, and release status. Evidence stays
   under .local; never publish session data, private paths or commit subjects.
   Accepted work should be committed separately. Publish verified improvements
   through the existing repository deployment, checking the exact changes to
   be pushed and the resulting workflow. Never force-push or include someone
   else's unfinished work. If publication is blocked, retain the tested change
   and report the exact blocker rather than claiming it is live.

Notify Kevin on a visible accepted improvement, a failed deployment, or a
decision requiring his input. Remain quiet on unchanged or non-actionable runs.
Do not guarantee that every visit looks different or that autonomous aesthetic
judgment is objective. Revisit priorities when Kevin gives feedback.

## September 12 visual milestone clarification

Kevin cannot see sufficient progress. Treat the stone-to-Jupiter-gatehouse
walk as one coherent visual milestone across several passes: composed terrain
and vegetation, a readable approach, coherent castle materials/architecture,
and a rewarding arrival courtyard. Hogwarts Legacy and Breath of the Wild
are references for atmosphere, composition and discovery; production parity
is not promised. Follow this with a complete village workplace and citizens'
useful belongings. Small roof/material edits are supporting steps, not proof
that the milestone is complete. Inspect actual arrival and walking views and
show matched before/after images with where the player can see the change.
Keep local and public release status explicit. Fix movement regressions first.
