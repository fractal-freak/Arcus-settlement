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
