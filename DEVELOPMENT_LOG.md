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

## September 12, 2026 — Reject camera trials and correct visual review

Hypothesis before editing: the opening camera crops the castle's upper
silhouette, weakening the landmark and the stone-to-gatehouse route. Reframe
the initial view to include the palace roofline with breathing room while
keeping the settlement stone legible in the foreground. Accept only after
matching views show this improvement and orbit, zoom and Home remain usable.
Work is isolated from the shared player, village-work and archaeology edits.
This pass addresses castle presentation; next priorities remain architectural
craft, village workplaces and meaningful citizen belongings.

Outcome: rejected all camera candidates and restored the original game camera.
The initial comparison exposed a review bug: shoot.mjs forced a close view
while labeling it opening. Design review now preserves the actual arrival
camera; ordinary performance runs retain their original close-view workload.
The capture also waits for twenty consecutive ready frames: startup first
loads a nearby patch, then expands streaming on the next frame. The old wait
could start timing before that expansion. No thresholds or timeout limits were
relaxed. The corrected camera trials still cropped the tower tip or reduced
the prominence of the stone and citizens; passing performance is insufficient.

Local evidence is in .local/design-review/castle and
.local/design-review/arrival in the isolated codex/castle-refinement checkout.
The original game code is unchanged. Retain the review correction as tooling
work only, with no claimed visible improvement. Logic tests (29), strict
rulebook validation and build passed; final ordinary frame results follow.

Release blocker discovered: the previous Hermes deployment, run 34675643006,
failed in Boot it and photograph it. SwiftShader reported a 32 ms median and
29,568.4 ms p95, then page.screenshot exceeded the existing 180-second timeout.
Do not call Hermes live on the public site based on the local build. Next pass
must investigate the CI rendering/capture stall before publishing further
changes; do not loosen the performance gate or simply extend the timeout.
After release recovery, resume castle architectural craft, then village
workplaces and owned furnishings. The schedule is now every thirty minutes.

Final ordinary frame gate passed: median 5.8 ms / p95 7.4 ms against
6.0 / 9.3 on the same M4 Pro backend, with zero pending visible terrain.
No speedup is claimed. Tooling retained locally, not pushed while the prior
release is blocked. No camera experiment or unrelated work was published.
