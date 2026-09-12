# Asset licensing register

Reviewed 11 September 2026. This register separates assets shipped with the world from candidates that still need clearance. No paid licence has been purchased.

## Shipped wildlife

| Asset | Creator / source | Licence | Required action |
|---|---|---|---|
| Old Deer Male (`stag.glb`) | CDmir / TinyWorlds — [OpenGameArt](https://opengameart.org/content/old-deer-male) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | No payment or attribution required. Courtesy credit retained. |
| Deer Female (`doe.glb`) | CDmir / TinyWorlds — [OpenGameArt](https://opengameart.org/content/deer-female) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | No payment or attribution required. Courtesy credit retained. |
| Fox model | PixelMannen, © 2014 Public — [Khronos source](https://github.com/KhronosGroup/glTF-Sample-Assets/blob/main/Models/Fox/README.md) | CC0 1.0 | No payment required. |
| Fox rigging and animation | © 2014 tomkranis, same source | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Ship attribution, source and licence links, and identify modifications. |
| Fox glTF conversion | © 2017 @AsoboStudio and @scurest, same source | CC BY 4.0 | Same attribution requirements. |

Fox credits and licence links ship on `public/credits.html`, linked from the world. Keep that link and the credits when publishing. Commercial use is allowed under the listed licences; no additional commercial purchase is needed for these shipped files. Retain notices, do not imply endorsement, and do not add restrictions to the licensed material.

Deer were converted from packed Blender files, materials rebuilt, and four animation clips baked/exported. Fox GLB is unchanged; the renderer adjusts scale, orientation and playback. `tools/convert-wildlife.py` records the deer conversion. File hashes and per-asset records are in `public/assets/wildlife/licenses.json`; upstream fox notices are preserved in `FOX-SOURCE.md` beside the models.

## Candidates requiring clearance — NOT shipped

| Candidate | Current evidence | Before any use |
|---|---|---|
| [WildMesh Realistic Deer 3D Model 2.0 Demo](https://sketchfab.com/3d-models/realistic-deer-3d-model-20-demo-free-download-30bd8d8458c54b0cb2d66cc12471f1d0) | Live listing says **CC BY-NC 4.0 / personal use only**, with commercial versions sold separately. Earlier search metadata suggesting CC BY was incorrect. | Obtain a commercial licence and explicitly confirm permission to redistribute the asset in a public repository and browser-downloadable bundle. Record seller, terms, receipt and version before importing. No price approved; no licence acquired; no asset imported. |

A standard commercial game licence may prohibit public source-asset redistribution. Purchase alone does not establish permission for this repository.

Other existing assets remain documented in [ASSETS.md](ASSETS.md). Add every future imported asset here with its exact source, version/hash, licence, required credits and clearance status before shipping it.
