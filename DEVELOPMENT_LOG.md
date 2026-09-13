# Development journal

## September 12, 2026 — Establish the development loop

Hypothesis: the town cannot improve beyond decoration while its only AI can
write citizen jobs. A recurring developer needs real source access, a focused
player experience, comparable pictures, gameplay checks and a rejection rule.

Implemented a six-hour Codex development task attached to the original
conversation. Its first milestone is the stone-to-gatehouse approach described
in DEVELOPMENT.md. The existing half-hourly GitHub simulation remains separate.
Added sim/design-review.mjs for matching opening, overview, stone and gatehouse
captures, sharing a frozen public feed and time between before/after directories.
The evidence includes the fixture hash and measured frame costs. Captures remain
local, outside the published site. Artistic acceptance still requires inspecting
the pictures and affected interactions; it is not automated by a numerical score.

Also corrected a real critic input bug: the published feed stores scores and
placements under `life`, but the critic read the root. It now receives the actual
scores and placement tag counts; missing context is an explicit failure.
Two regression tests cover nested/raw feeds and missing facts.

The isolated
branch passes all 25 logic tests; the shared working tree contains concurrent
player/controller work and must not be staged wholesale. The latest inspected
GitHub deployment succeeded. This entry establishes the process, not a claim
that the world has already reached a higher artistic standard.

Next: inspect the gatehouse route in the baseline, choose one visible weakness,
and test an improvement. Coordinate with the player/conversation work already
underway. Watch tail frame costs: the previous CI report contained long software
rendering stalls which its median hid.

## September 12, 2026 — Quiet the foreground atmosphere

Hypothesis, recorded before editing: large bright pollen points read like snow
over the stone and gatehouse, competing with faces, masonry and the landmark.
Accept only if the same close views become clearer while retaining subtle
atmosphere and passing the existing performance gate.

Changed src/three/sky3d.js: cap pollen at six pixels, fade it near the camera,
and lower its daylight/night opacity. The particle count, terrain, collision,
lighting and meaningful magical effects remain intact. The shader also uses
ordered smoothstep edges rather than undefined reversed-edge behavior.

Accepted after inspecting the overview, stone and gatehouse before/after.
The stone carving, citizens and portal read without the bright foreground veil.
This is a modest readability improvement, not a new art style or gameplay system.
Matched captures share the public fixture hash, random seed, time and camera
specifications. Worker streaming and character animation can still vary; these
are visual review evidence, not pixel-perfect regression tests.

Checks: all 25 logic tests, rulebook verification, build and the review's full
headless boot/performance gate passed. On the same Apple M4 Pro backend the
seeded baseline measured median 6.9 ms / p95 11.7 ms; candidate 6.2 / 10.4 ms.
Terrain streaming changed visible geometry counts, so do not claim a measured
speedup from this difference. No performance regression was detected.

The capture harness now paces explicit step calls from Node, cleans up on
failure, and uses modern headless Chromium on the Mac for hardware rendering.
Linux CI retains its software-rendering configuration and regression thresholds.
Evidence: .local/design-review/2026-09-12-foundation/{before,after}.
Release: isolated candidate prepared for the existing main-branch deployment.


## September 12, 2026 — Replace the Hermes blockout with a museum scan

Kevin requested a more recognizable, photorealistic ancient Hermes being
excavated. Replaced the overlapping procedural body and horn-like helmet with
SMK KAS1161, a public-domain scan of the Belvedere Hermes cast. Removed its
modern display plinth/foot extremities, capped the ankle fracture, retained the
scanned face, hair, anatomy, cloak and ancient arm breaks, and added soil-line
staining, mineral patina and a small cluster of marble chips. This is an
archaeological game presentation of a museum cast scan, not a claimed scan of
an excavation. Full provenance is in ASSETS.md and the asset's source.json.

The derived asset is 2.4 MB / 99,999 triangles. Collision is measured from its
exposed surface, and retired arm/sandal footprints no longer block walking.
Inspected overhead, oblique and face views in the real game. The anatomy and
carved detail are substantially more convincing; the surrounding world still
uses the established stylized lighting and terrain.

Validation: 29 isolated logic tests, strict rulebook verification, build,
headless boot/performance comparison, and sim/hermes-review.mjs passed. The
combined local working tree also passed all 48 tests and the visual review.
Same-hardware opening median was 6.2 ms before and 8.6 ms after, p95 10.1/15.6 ms;
within the existing regression gate. Streaming/shadow draw counts varied, so
these measurements do not isolate the statue's GPU cost. The scan itself is
covered by a 120,000-triangle ceiling and sampled collision coverage tests.
The verifier also pruned two unreachable goals already present on remote main.

Evidence: .local/hermes-scan/{overhead,excavation,face}.png in the shared checkout.
Release: verified locally and prepared on codex/hermes-scan for publication.

## September 12, 2026 — Preserve the real frame for CI capture

The isolated Linux diagnostic 34682603315 produced a valid world screenshot
and passed the unchanged performance gate using a buffered capture. Inspected
the downloaded image: actual terrain, buildings, citizens and HUD are present.
The shell/modern-browser comparisons failed during startup; they do not prove
a rendering-speed improvement. The buffered job measured 19.4 ms median and
16,754.4 ms p95 on SwiftShader against 26 / 25,859.1 in the saved CI baseline.
Software rendering remains very slow and these numbers do not describe normal
GPU play. Changing browser channels alone was not accepted as a fix.

Added sim/capture-world.mjs: execute one real world step, read the WebGL canvas
immediately before its drawing buffer is discarded, decode those actual pixels
as an image for Chromium's page capture, then restore the original canvas.
The HUD remains in the screenshot and multi-view reviews can continue. Readback
and screenshot share the existing 180-second deadline. No scene settings,
quality thresholds, browser choices or startup limits changed. The diagnostic
workflow was deliberately excluded from this release.

All 29 isolated tests, strict rulebook verification, build and the real review
passed. Inspected all four local views to verify canvas restoration and HUD
composition. M4 Pro check: median 6.0 ms / p95 9.8 ms, no pending visible
terrain. Game source and public feed are unchanged. Release prepared on
codex/capture-release for the normal pipeline; verify that run before reporting
publication. The worked-earth candidate and concurrent local game work remain
separate. Continue with castle/village/possessions once publication recovers.

## September 12, 2026 — Repair the stalled critic/publish loop

Hypothesis: the headless harness submits WebGL frames without waiting for GPU
completion. Software-rendered work accumulates, makes occasional step() calls
block on backpressure, and leaves capture behind minutes of pending rendering.
The previous indexing diagnostic did not pass: both logs timed out at capture,
while tee masked their exit codes. Reject that experiment as a release fix.

Acceptance: explicitly finish each submitted test frame without altering the
world, sample count, existing regression ratios or timeouts; also record and
check completed-frame cost. Verify a real screenshot with HUD, all existing
checks, and a normal deployment including an actual successful critic call.
The local probe measures seconds of pending work after millisecond submission.
No game source, quality settings, private data or authored state changes planned.

Accepted locally: all 32 tests, strict rulebook verifier, build and four-view
hardware review pass. Opening, stone and gatehouse PNGs are byte-identical;
overview streaming variation was inspected. Hardware submission 6.3 ms median /
10.1 ms p95 versus 6.0 / 9.7 before. Completed-frame timings are separate and
include browser round trips; they are not advertised as pure GPU timings.
Full Mac SwiftShader check and actual screenshot pass: submission 6.9 / 11.5
ms, completion 1206.74 / 1673.72 ms, startup 52,971 ms. This backend differs
from Linux. Software rendering remains slow; pacing fixes the harness backlog,
not game speed. Evidence remains local under .local/repair and
.local/software-world.png. Linux branch validation precedes publication.

Linux branch check 34697298939 exposed an overconstraint in the initial repair:
waiting after each terrain-loading frame consumed the shared startup deadline.
Preserve the original startup stepping and its unchanged 90-second readiness
check, then drain that queue once within a separate bounded 90-second GPU wait
before warmup. Each warmup/sample frame still drains individually. This avoids
changing what the original startup gate measures. Revalidate on Linux.

Verified-commit Linux run 34697692777 reaches readiness but its accumulated
startup queue exceeds the newly added single-frame 90-second drain. Treat this
as the multi-frame workload it is: use the existing 180-second capture allowance
for that one boundary. All pre-existing startup/screenshot limits and regression
ratios remain unchanged; each measured frame retains its new 90-second bound.

Linux verification 34697957974 PASSED on commit 7405876. All 32 tests,
strict verifier, build, all 60 completed frame samples and real screenshot pass.
Inspected the downloaded screenshot: actual world and HUD, no replacement art.
Submission median/p95 20.0 / 26.8 ms; completion 4726.94 / 5406.75 ms;
startup readiness 21,069 ms; 86 chunks with no missing visible terrain.
The startup queue drained in 167.9 seconds, leaving a narrow margin on this
software renderer; future rendering optimization remains worthwhile. Existing
limits were retained. This fixes asynchronous test backlog, not game speed.
The code-only release matches the tested harness exactly; the diagnostic
workflow is excluded. Normal critic/publish run is the final release check.

## September 12, 2026 — Isolate the accepted worked-earth changes

Consolidated only the previously accepted terrain work in codex/worked-earth:
shared shallow excavation relief, low Hermes clods and spill around spoil
heaps, patchy exposed soil, localized scrapes and subtle meadow variation.
Each of the five source baselines was byte-compared with the saved pre-edit
version before applying the candidate; no citizen, player or journal code was
included. Updated the original-procedural asset credit and synchronized the
already authorized thirty-minute development priorities in DEVELOPMENT.md.

All 29 isolated logic tests, strict rulebook verification, build, matching
four-view review and close Hermes review passed. Inspected the stone and
village comparisons and close excavation result. Same M4 Pro backend: median
6.1 / p95 9.7 ms before and 6.8 / 11.0 after; startup 3.69 / 4.00 s. Existing
performance gate passed, zero pending visible terrain. Do not claim a speedup.
Evidence: .local/earth-release/{before,after,hermes} in this worktree.

Accepted as an isolated local release candidate, not published. Main's Linux
software-rendering/capture blocker still needs a demonstrated remedy. Runtime
castle indexing was rejected in the separate diagnostic worktree and is not
included. The shared local world already contains this visual work, so this
consolidation is not a new visible change for Kevin. Resume the release blocker
without repeating unchanged CI runs until they happen to pass; then publish
this tested candidate and continue castle craft, village workplaces and owned
belongings. Preserve unrelated local work throughout.

## September 12, 2026 — Validate terrain on the independently repaired loop

The shared journal revealed an active user-requested repair in the separate
loop task. Avoided duplicating its completed GPU-queue investigation. Its
code-only repair a89a912 passed Linux diagnostics; normal run 34698536765
is still in progress. Do not interrupt or supersede its final publication.

Rebased the isolated terrain candidate onto a89a912, preserving both journal
entries. Terrain commit is now 8463fe6. All 32 isolated tests, strict verifier,
build and the repaired four-view screenshot check pass. Compared the same
frozen fixture against a clean a89a912 checkout with identical hardware and
camera settings: submission median/p95 6.0/10.4 ms before, 6.6/11.2 after;
completed-frame median/p95 20.73/33.33 before, 20.93/32.95 after. All existing
CPU and completion thresholds pass; fixture hashes match. This is not a
claimed speedup. Evidence: .local/earth-repaired/comparison.json and after
views here; matching baseline is in arcus-capture-phases/.local/earth-repaired.
The latter worktree is an untouched repair checkout, not a new instrumentation
experiment. The actual world changes remain the already accepted soil pass.

Release remains local and ready. Wait for normal repair run 34698536765 to
finish; the latest snapshot was Boot it and photograph it. Then fetch main,
preserve its generated state and journal, rebase if needed, and publish only
this isolated terrain candidate through the normal gates. Do not reintroduce
indexing or diagnostic workflows, and do not stage the shared unfinished UI.
No new user-facing visual change or decision this pass.

## September 12, 2026 — Publish the isolated terrain candidate

Confirmed normal repair run 34698536765 succeeded and advanced public state;
rebased the terrain candidate onto its generated commit 2a207ad. All 32 tests
pass. Strict verification found the newly published lane_thresholds dimension
had no job producing its edge tag. Ran the existing verifier with --prune,
which removed that one unreachable dimension; strict verification then passed.
No simulation memory was edited. Include that precise verifier cleanup.

Build and the repaired standard browser/performance gate pass on the current
public feed: M4 Pro submission median/p95 6.9/11.8 ms and completed-frame
21.54/35.34 ms, compared with this candidate's prior 6.6/11.2 and 20.93/32.95.
No pending visible terrain, errors or loosened thresholds. The previously
reviewed matching scene and Hermes images remain applicable: the terrain
source did not change during rebase. All unrelated local game work is excluded.

Prepared for normal publication; verify its exact deployment before reporting
it live. Follow-up after release: inspect whether verifier pruning needs a
second dependency validation after dropping jobs, since an unreachable
critic dimension survived the preceding workflow. Keep that separate from
this already verified terrain change. Resume castle craft afterward.

## September 12, 2026 — Give the surviving hall a constructed slate roof

Hypothesis stated before editing: the hall roof reads as a smooth blue sheet
beside the detailed gatehouse. Replace the surface with staggered overlapping
slate courses, retaining its authored dimensions and the open ruined half.
Added slateGable.js and a slateGable shape/material in the shared realm plan.
Tiles have real exposed edges and ends, with their lower edges sitting proud
of the slope so each upper course overlaps cleanly. Rejected an initial
repeating high-contrast colour pattern and parallel plates that risked
coplanar overlap; final variation is restrained and courses read by geometry.

Inspected roof and courtyard before/after plus matching world views. The
surviving roof now reads as laid slate; the larger silhouette, open hall,
walking floors and ground occupancy are preserved. This is a modest detail
improvement, not a rebuilt castle or a claim of production-asset parity.
Original asset provenance recorded in ASSETS.md. No state edits or new assets.

All 33 isolated tests, strict rulebook validation, build, close castle review
and repaired world/performance review pass. A focused geometry test bounds
cost below 6,000 triangles and verifies the roof stays in the existing plan
without covering the ruined half. Existing tests cover court/gate walking.
Baseline CPU median/p95 6.0/10.6 ms and completed 20.53/32.37; final 5.8/9.6
and 19.68/33.26 on M4 Pro. No speedup claimed. No additional opening draw calls.
Evidence: .local/roof/{before,final,world-before,world-final}.

Accepted for local integration and normal isolated release, pending deployment
verification. Next castle priority: junctions between surviving roof, exposed
vault ribs and masonry; then a useful village workplace/furnishing pass so
citizens' environments receive sustained attention alongside the landmark.

## September 12 — replace recurring Codex usage with API development

User requested all recurring loops use the free API. Paused the existing
refine-the-settlement Codex heartbeat, retaining its prompt and target. The
original critic uses the Gemini endpoint/model defaults; no repository API
provider overrides were configured. The API project's billing tier is not
visible from GitHub's secret and remains unconfirmed.

Prepared a separate API-only candidate workflow with read-only permissions.
It selects source context, proposes bounded edits, validates in a job without
API/write credentials, and obtains a before/after visual review. It produces
artifacts only. The workflow is gated on FREE_API_CONFIRMED=true; no new API
calls or paid fallback were used. Owner confirmation of a Free-plan project
with billing disabled is required before activation.

Automatic approval review rejected the initial scheduled automatic-main-push
implementation because of broad write permissions. Removed all publishing
code and write permissions from this candidate; do not restore automatic
publication without an explicit decision. The draft does not by itself make
tested changes live. Existing citizen simulation/critic deployment is unchanged.

All 35 Node tests, strict verifier, build and standard headless check pass.
M4 Pro CPU median/p95 5.9/11.9ms, completed 20.94/33.08ms. Tests cover path
allowlisting, immutable preimages, all-or-nothing checks and symlink refusal.
Live API execution and scheduled release integration remain pending.
## September 12 — Stone-to-gatehouse route milestone, first landscape pass

Roof release 34704247290 succeeded; exact public bundle index-BGs4VfWv.js matches the tested roof build. Current milestone remains a coherent stone-to-gatehouse journey, then a complete village workplace. Hypothesis before editing: isolated patches of fieldstones and near-identical meadow obscure the main castle approach. A continuous worn limestone lane with intact edge courses and sheltered planting will make the journey readable from the stone, through the village bend and at the bridge landing. Preserve the existing route, door clearance, shared walking height and newer local movement/UI work. Acceptance requires matched overview plus actual walking-camera evidence, traversing the entire approach, and unchanged performance gates. This pass does not complete the courtyard/workplace milestone.

Accepted approach experiment: a 58m processional lane now connects the stone's
western departure to the causeway, following existing village junctions with
rounded bends. Low bevelled slabs follow the shared height to within 3.6cm;
missing centre stones expose worn earth, intact side courses retain direction.
Interrupted fern drifts frame the verges. Existing branch paths remain rough.
All alignment, slab and planting locations are in world data. No obstacles,
private feed data, or hand-edited simulation state were introduced.

Rejected initial right-angle junctions and a narrower scenery reservation that
regenerated unwanted roadside trees (249 additional opening draws). The final
soft verge preserves a clear route with just four additional opening draws;
rendered triangles are lower than before because heavy scattered fieldstones
are replaced along this lane. Also corrected the review harness to initialize
walking-camera elevation from the actual floor; earlier low-camera captures
are superseded by matched walk-before/walk-after images.

Reviewed every standard opening/overview/stone/gatehouse image and three actual
walking-camera comparisons. The route is clearly continuous in the overview
and around the village bend toward the bridge. The starting stone composition
is mostly unchanged; the bare castle hillside, cottage craft and courtyard
still need a substantial coherent pass. Do not call this milestone complete.
A returning player will notice the stone lane leading past the blue-roofed
croft toward the Jupiter bridge, with fern banks at its bends and landing.

All 35 isolated tests, strict rulebook verification, build and unchanged world
frame gates pass. Sampled the corridor at three lateral offsets, checking
collision and steps. The real Walk3D move method traversed the full lane and
causeway into the gatehouse with zero positional error. Matched review before
CPU median/p95 6.7/10.9ms, completed 21.95/37.79ms; final layout 6.2/11.5ms,
completed 20.53/32.64ms on M4 Pro. Final data/render separation build also
passed shoot: 7.0/11.4ms, completed 22.29/47.22ms while local integration checks
were active; no speedup claimed and no gate loosened. Evidence under
.local/approach/{before,after,walk-before,walk-after}.

NEXT milestone work: compose the exposed hill and arrival courtyard as one
place, with a readable discovery and coherent ground/material transitions.
Then develop one complete village workplace with useful owned furnishings.
Preserve the newer local player, journal, UI and occupied-waypoint fixes.
Local integration is built; isolated publication and public verification follow.

Integrated local validation: all 62 tests, strict verifier and build passed. The existing 307-second close-encounter crowd audit completed with all 48 citizens delivering, minimum separation 1.100004m, zero scenery violations and no page errors. Evidence: root .local/approach/crowd/evidence.json. Local build index-CiJA4pad.js includes the approach plus the preserved newer player/UI/navigation stack; the isolated public release contains only this approach change and the already-published base.

## September 12 — Free API activation approved

Kevin confirmed the Gemini project has billing disabled and explicitly approved
automatic publishing after validation. Added a trusted source-only publisher
with exact-base and preimage checks, isolated from candidate execution. It
uses only contents:write; workflow_run invokes the existing deployment, with
no actions:write permission. Both API loops are gated by FREE_API_CONFIRMED,
use the same pinned Gemini configuration, and have no paid fallback. The
Codex heartbeat remains paused.

## September 12 — Persistent, faster milestone development

Implemented a durable JSON progress branch, cumulative validated drafts,
rejection/failure memory, stage-specific visual/simulation review, bounded new
simulation modules and a fixed bakery behavior contract. The first milestone
is a polished square with a functioning bakery chain and visible citizen work.
Changed cadence from 30 to 15 minutes, cached exact unchanged-world baselines,
and avoided deployment/critic reruns when no stage is released. Kept full frame
gates, added matched opening/stone/gatehouse views and a shared public fixture.
Local validation and activation are recorded separately; this infrastructure
change alone does not claim a visual improvement or an implemented bakery.

Pre-release checks found a pre-existing invalid public rulebook. The existing
sim/verify.mjs --prune removed monolith_sacred_enclosure (missing measured score)
and hillside_procession (no reachable serving job). Strict verification then
passed. This repair is included so the development loop is not blocked on
invalid published input; generated development edits still cannot alter the
rulebook or its verifier.

First persistent live run 34715084501 passed the three-view baseline and memory
load, then Gemini's whole-file response was truncated. The remember job saved
the failure on codex/world-progress, verifying durable failure memory. Replaced
whole-file output for existing source with compact exact find/replace edits;
ambiguous or missing matches are rejected. New files still use full content.
Structured API errors now survive failed proposal/review steps and are fed to
the next pass. This avoids spending output capacity on unchanged source.

Also replaced the secondary orbital view with the actual village walking camera
and added the existing full approach/gatehouse traversal in the same browser.
Initial local frame comparisons failed; these were retained as failures. A
matched unchanged-control/follow-up comparison passed: completed median/p95
21.59/33.45ms before, 21.4/33.06ms after; CPU 7.9/12ms before, 7.6/12.3ms after.
No gate or frame count changed. Route error was zero. The actual walking image
was inspected. Full tests, strict rulebook verification and build pass.

## September 12 — deliver player, interface and stone-court polish

Integrated the existing player, conversation, occupation and consistent-panel
work into the public build, with continuous rig updates and solid shared crowd
bodies. The journal now calls these assignments Citizen projects and explicitly
labels percentages as simulated construction work, not development progress.
Added a laid, bevelled limestone court around the settlement stone, retaining
an irregular fieldstone edge and the existing ground/shoreline exclusions.

A 307-second crowd audit found three workers blocked at occupied intermediate
waypoints. Finer dynamic route planning resolves passages missed by the coarse
static grid. Replanned paths store only coordinates, avoiding recursive job
references. Added a regression for a passable gap between coarse grid lanes.

The free-provider loop now retries transient failures at most three times and
can publish a fully finished substantial task within a larger stage. The stage
advances only when every stage acceptance criterion is met. Unfinished tasks
remain drafts; billing, provider and generated-source permissions are unchanged.

Validation: 75 tests passed, one future bakery contract skipped; strict rulebook
and build passed. Player, five viewport/panel checks, mobile journal, search,
focus and keyboard checks passed. All 48 workers completed deliveries in 307.2
simulated seconds; minimum separation 1.099999m, zero obstructed positions.
The initial four-sample AA capture exceeded the intended cost and was reduced
to two samples. Final matched completed frames: median/p95 22.34/34.18ms before,
23.71/34.76ms after; CPU 7.4/13.5ms before, 6.3/10.1ms after. All existing gates
passed. The ground route now drives PlayerMotion instead of the removed vector
move API; frozen dynamic actors are excluded from this static ground contract,
with the full crowd audit covering their collisions separately. Route error
0.0245m, below the unchanged 0.12m limit. Actual court and journal screenshots
were inspected. No claim of a frame-rate improvement is made.

Cloud follow-up: deployment 34717978530 and API attempt 34718012887 both failed
while draining the software renderer, before frame sampling. The added MSAA
render target stalls this backend. Removed the MSAA addition entirely, retaining
the existing FXAA stack; no timeout or performance gate was weakened. This
supersedes the two-sample choice above. All movement/UI/court changes remain.
The first local capture after removal also failed a timing comparison (34.45ms
completed median). A fresh unchanged control followed immediately by the release
passed every original gate: completed median/p95 23.2/35.23ms control and
21.74/38.22ms release; CPU 8.4/13.1ms control and 6.8/11.5ms release. Full walking
route passed at 0.0245m error. Both failed and successful measurements are retained
in local evidence; this remains a compatibility repair, not a speedup claim.

## September 12 — unblock review views and avoid duplicate unchanged checks

The restored renderer passed the cloud opening-frame gate, but development run
34718496685 exhausted the separate 90-second walking-view preparation budget.
Additional screenshots now stream terrain without submitting disposable loading
frames, restore rendering in a finally block, and complete two real GPU frames
before capture. The opening startup, 60 measured frames, thresholds, final
capture and walking-route contract are unchanged. Tests cover successful frame
completion and renderer restoration after a streaming failure. Full local shoot
passes (20.55/35.31ms completed median/p95; route error 0.0245m).

Deployment now records the rulebook hash after the first full validation and
only repeats build/render validation if the critic or pruning actually changes
that validated rulebook. Changed rules still receive the full original checks
and rollback behavior. This avoids a second identical several-minute software
render after unavailable/no-change critic calls. Baseline cache keys include the
new screenshot preparation helper.


## September 13 — celestial mage integration

Approved celestial costume translated into a genuine animated mesh, replacing
Mage/Wizard appearances and available as the default Celestial Mage player.
Original tailored surfaces, separate leg-driven robe halves, lunar stole, silver
hair, modeled face and hands; measured rest-pose retargeting preserves equipment
slots and the existing animation API. Geometry and materials are shared across
instances, with separate skeletons/mixers. Other character types are unchanged.

Validation: 67 local logic tests, rulebook, build, player movement/jump/broom/
conversation/controller checks and completed-frame world check passed.
Local completed GPU frame median 34.45ms, p95 37.05ms; CPU median 6.6ms, p95 8.1ms.
Front/profile/back/face and walking views were inspected, plus the actual world
and mounted broom. Evidence: .local/mage and .local/player-review.
This is a stylized playable interpretation; facial modeling and costume drape
remain less detailed than the approved concept. Public release pending.
