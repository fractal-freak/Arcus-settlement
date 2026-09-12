# Everything in this world, and whether it could ever be public

This public repository records asset sources and licence obligations here. Most models are CC0; the fox rigging, animation and glTF conversion require **CC BY 4.0 attribution**, shipped on the world's Wildlife credits page.

See [LICENSE-REGISTER.md](LICENSE-REGISTER.md) for the wildlife sources, obligations and restricted candidates that have not been imported. Machine-readable records and file hashes ship in `public/assets/wildlife/licenses.json`.

## How to read the status column

- **Clear** — free to use anywhere, including commercially, no credit required.
- **Credit** — free to use, but a visible attribution has to ship with it.
- **Swap** — cannot go public as it stands. Nothing is in this state.

---

## 3D models

| What | Where from | Licence | Status |
|---|---|---|---|
| Stag and doe — `public/assets/wildlife/` | CDmir / TinyWorlds, OpenGameArt; see licensing register | CC0 1.0 | Clear |
| Fox — `public/assets/wildlife/fox.glb` | PixelMannen; tomkranis; @AsoboStudio and @scurest via Khronos | CC0 model; CC BY 4.0 animation/conversion | Credit — `public/credits.html` linked from world |
| Buildings, props, walls, trees, tents, crates — `public/assets/kaykit/` | KayKit Medieval Hexagon Pack 1.0, Kay Lousberg, kaylousberg.com | CC0 1.0 (licence file shipped in the folder) | Clear |
| The people — `public/assets/kaykit-characters/` | KayKit Adventurers Character Pack 2.0, Kay Lousberg | CC0 1.0 (licence file shipped) | Clear |
| `public/assets/kenney-retro-fantasy/` | Kenney Retro Fantasy Kit 2.0, kenney.nl | CC0 1.0 (licence file shipped) | Clear |
| `public/assets/kenney-mini-dungeon/` | Kenney Mini Dungeon 2.0, kenney.nl | CC0 1.0 (licence file shipped) | Clear |

Every licence file was read before the pack was used, not assumed from the
site's front page.

**Built here, not downloaded:** the pickaxe the dig crew carry
(`src/three/characters.js`, `makePickaxe`) — neither pack has a hand tool. The
Settlement Stone and its carving, the ground, the water, the sky, the clouds
and the grass are all generated in code.

## Text

| What | Where from | Licence | Status |
|---|---|---|---|
| The 28 lines the dig turns up — `~/.claude/arcus-finds.mjs` | Ptolemy, *Tetrabiblos*, tr. J. M. Ashmand 1822 (archive.org `ptolemystetrabi00procgoog`); Bonatti, *Anima Astrologiae*, tr. Henry Coley 1676, Serjeant reprint 1886 (archive.org `b24884054`) | Public domain in the US — original and translation both | Clear |

Both titles are on the CLEARED list in the Arcus repo's
`docs/DELINEATION-SOURCES.md`, which is the authority for anything quoted in
the product. Every line was checked back against its own scan character for
character; two were dropped rather than corrected because their scan was
damaged. **Nothing new gets added to that file without checking the catalogue
first** — a modern translation of an ancient text is under copyright even
though the text is not.

## Sound

| What | Where from | Licence | Status |
|---|---|---|---|
| Wind, river and birds — `public/assets/audio/{wind,river,birds}.mp3` | [Park ambiences](https://opengameart.org/content/park-ambiences), Thimras, 2022. Original 48 kHz stereo field recordings: `park_ambience_wind.wav`, `park_ambience_river.wav`, `park_ambience_birds.wav` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (individual asset page checked 2026-09-11) | Clear |
| Night insects — `public/assets/audio/crickets.mp3` | [Crickets Ambient Noise — loopable](https://opengameart.org/content/crickets-ambient-noise-loopable), Wolfgang_ / Ted Kerr, 2021; original `crickets_1.mp3` | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (individual asset page checked 2026-09-11) | Clear |
| Foliage, low hum, pick strikes — `src/app/ambience.js` | Generated here with Web Audio | No recording | Clear |
| Singing bowls — `public/assets/audio/bowls.mp3` | [singing bowl — single strike 6](https://freesound.org/people/s-light/sounds/411486/), s-light (2017), soft-mallet bowl recording; Freesound high-quality MP3 preview | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (individual asset page checked 2026-09-11) | Clear |

Recordings are bundled locally; no external service is contacted during playback.
The park recordings are Australian winter field recordings, not species-specific
medieval European sound design. The river contains incidental birds and frogs;
its wildlife is part of that recording, independent of the dedicated Birds slider.

Preparation: park excerpts start at 30 seconds and use 64 seconds of source,
with a four-second head/tail crossfade yielding a 60-second loop. Insects use
11 seconds with a 0.6-second crossfade. All have an 80 Hz high-pass, loudness
target -23 LUFS / -3 dBTP, and stereo 48 kHz 160 kbps MP3 encoding. Original
source filenames, download links and licence are also in the audio directory.
The mixer defaults to restrained birds and insects, and zero low hum.

The singing bowl is a separate optional layer, initially at 30%. Its recording
has a 65 Hz high-pass, a short softened attack, a six-second tail fade, and
-23 LUFS / -3 dBTP loudness targets. It plays once every 26–38 seconds, with
occasional 1.5× playback-rate variations and gentle stereo placement. It is
heard at full strength within the Settlement Stone sanctuary (12 units),
fading smoothly to silence at 36 units from its centre. Distance follows the
camera's ground focus, so zoom alone does not silence it. This is
a bowl-inspired ambient arrangement, not a recording of a religious ceremony.

## Sanctuary materials

| What | Where from | Licence | Status |
|---|---|---|---|
| Cracked rock colour, normal, roughness and height maps — `public/assets/sanctuary/rock_boulder_cracked-*` | [Rock Boulder Cracked, Poly Haven](https://polyhaven.com/a/rock_boulder_cracked) | CC0 1.0 | Clear |
| Mossy rock colour, normal, roughness and height maps — `public/assets/sanctuary/mossy_rock-*` | [Mossy Rock, Poly Haven](https://polyhaven.com/a/mossy_rock) | CC0 1.0 | Clear |

Original 1K JPEG maps are bundled locally. Download URLs and licence records
ship in `public/assets/sanctuary/sources.json` and `LICENSE.txt`.
The irregular paving geometry, physically recessed chart, ivy, ferns, ground cover, offering table,
flowers, grain, incense bowl and smoke are generated by this project. The
ritual uses existing KayKit `Interact`, `Idle_A` and `Walking_C` animations.

## Data

The buildings, the sessions, the commit counts and the sky are all Kevin's own
— his repository, his Claude Code sessions, and the real sky over Pawtucket.
The citizens, their names and their chronicle are generated. Nothing is fetched
from a third party at runtime.

## Procedural ground surface

`src/three/groundSurface.js` generates an original seamless soil-grain texture
at runtime, shared by terrain chunks for colour variation and bump detail.
It uses no external image or downloaded asset.
The worked-earth treatment in `terrain3d.js` and `terrainGeometry.js`, shallow
excavation relief in `app/terrain.js`, and low soil clods specified in
`app/hermes.js` are original procedural additions under the project's CC0
dedication. They reuse that grain texture; no new external assets are included.

## Village material and vegetation detail

- `public/assets/village-materials/medieval_blocks_03_{diff,disp}_1k.jpg`: [Medieval Blocks 03](https://polyhaven.com/a/medieval_blocks_03), Rob Tuytel / Poly Haven, [CC0](https://polyhaven.com/license), checked 2026-09-11.
- `public/assets/village-materials/medieval_wood_{diff,disp}_1k.jpg`: [Medieval Wood](https://polyhaven.com/a/medieval_wood), Rob Tuytel / Poly Haven, [CC0](https://polyhaven.com/license), checked 2026-09-11.
- Maps are bundled locally. `sources.json` in that directory records each download URL. No runtime request is made to Poly Haven.
- `src/three/naturalTrees.js` creates original branching conifers and broadleaf crown geometry in code. The conifers replace the existing CC0 KayKit tree geometry within each measured tree envelope, including the individual trees in groves; their world scale and simulation placements are preserved. Woodland uses open folded-leaf crowns and branching trunks throughout the streamed world, without solid spherical canopy cores.
- Small timber props share the existing CC0 wood scans; natural rocks reuse the sanctuary’s bundled CC0 cracked-boulder scans with original procedural grain and erosion geometry. No additional downloads are used.
- Roof courses and base weathering in `src/three/villageMaterials.js` are generated in the shader. They use no additional external imagery.
- `src/app/realm.js` and `src/three/realm3d.js` define original ruined-castle and cottage geometry, including an original deterministic straw texture. Their masonry and timber reuse the CC0 maps listed above; no additional third-party assets are used.
- Civilian appearances reuse the CC0 KayKit Rogue and Rogue_Hooded rigs, with cape meshes hidden and original shader-generated earth-tone clothing variants. Archaeologist appearances are unchanged. Broadleaf sprays are original procedural geometry, with no downloaded foliage imagery.

## Walkable masonry bridge

`src/three/bridge3d.js` generates original arch, paving, parapet and coping geometry from the shared crossing profile in `src/app/bridge.js`. It reuses the existing CC0 Poly Haven Medieval Blocks 03 scans. No new downloaded assets are used.

## Old kingdom enchantments

`src/app/enchantment.js` and `src/three/enchantment3d.js` define original heraldic cloth, procedural stained glass, animated arcane braziers, and deer/fox geometry. All textures and shapes are generated locally; no third-party character, artwork, or franchise assets are used. The ridge and cliff supports are original procedural terrain and geometry.

The bridge’s curved approach cobbles reuse the sanctuary rock scans. `src/three/bridgeAging3d.js` generates original crack ribbons, ivy stems and leaves, moss patches, and animated firefly particles; no new downloaded imagery or models are used. Its paths and scenery clearance are defined in `src/app/bridge.js`.

`src/three/fieldstones3d.js` now supplies the same seven eroded fieldstone shapes, scanned rock/moss materials, and colour range to the court and its paths. `src/app/ancientPaths.js` places surviving, partly buried paving along existing hamlet roads and court approaches, with irregular missing sections and fern/moss growth. All assets remain the existing CC0 sources listed above.

## Jupiter palace PBR and Gothic kit

- `public/assets/palace-pbr/mossy_stone_wall_*_2k.jpg`: [Mossy Stone Wall](https://polyhaven.com/a/mossy_stone_wall), Amal Kumar / Poly Haven, CC0-1.0. Includes diffuse, OpenGL normal, roughness, AO, and displacement maps. Official download URLs and verified MD5 checksums are in `sources.json`.
- `src/three/palaceKit.js`: original modeled masonry courses, beveled stones, quatrefoil tracery, and curved flying buttresses. No franchise or purchased architectural models are included.
- `src/three/slateGable.js`: original overlapping slate courses with exposed edges and restrained tile variation for the surviving hall roof, under the project's CC0 dedication; no external assets.
- `src/three/palaceLighting.js`: original procedural reflection environment and depth-occluded volumetric window shafts. The Jupiter banner glyph is drawn with original canvas paths, without a font dependency.

Terrain pebbles and ruin columns reuse the sanctuary’s existing CC0 cracked-boulder colour, normal, and roughness maps. Pebble erosion, fluted broken shafts, and buried mossy bases are original procedural geometry; no animal assets have been imported in this pass.

## Arcus Jupiter glyph and palace repairs

At the user's explicit request, `src/data/jupiterGlyph.js` reuses only the ♃ outline from Arcus's generated glyph data. The outline comes from Noto Sans Symbols weight 700, Copyright 2022 The Noto Project Authors, under SIL Open Font License 1.1; `public/assets/Noto-Sans-Symbols-OFL.txt` contains the license. This requested glyph is an exception to the usual CC0/public-domain asset preference. No other Arcus code or data is included, and no Arcus files were modified.

Slate courses, dormers, damaged masonry, courtyard furnishings, and the asymmetric ridge are original procedural geometry. The old egg-shaped outcrop meshes have been removed.

`src/three/arcaneFire3d.js` replaces the solid flame meshes with original ray-marched turbulent fire, procedural soft ember sprites, animated light, and smooth metal brazier geometry. No external fire textures, footage, or models are used.

## Jupiter gatehouse and cliff study

`src/app/jupiterGatehouse.js` defines the gatehouse, observatory, passage, window openings, furnishings, and balustrade footprints. `src/three/gatehouse3d.js` supplies original modeled archivolts, window tracery, corbels, dormers, slate courses, roof seams, finials, and turned stone balusters. The masonry and timber reuse the existing CC0 village material scans; the muted leaded-glass texture is original canvas artwork. The existing Arcus Jupiter glyph remains on the banners under the license documented above.

`src/app/palaceLandscape.js` and `src/three/palaceLandscape3d.js` define a shared eroded cliff surface and original ivy/fern placement. The rock uses the existing sanctuary CC0 color, normal, and roughness scans. `src/three/contactShadows.js` is an original screen-space ambient-occlusion shader using the renderer's existing depth pass. No Hogwarts artwork, models, or textures are included.

The gatehouse's carved limestone also reuses the sanctuary rock scans with restrained surface relief and a limestone color treatment.

The palace causeway, arched spandrels, flared abutments, worn paving, and connected ruined tower shells are original procedural geometry (`palaceCauseway.js`, `ruinedTower.js`, `gatehouse3d.js`, `ruinedTower3d.js`). Climbing and hanging ivy use original lobed leaf meshes and branching stems in `palaceIvy3d.js`; no foliage images were downloaded. `palaceWeathering.js` reuses the sanctuary's existing CC0 moss scan for localized damp growth and keeps a worn center route through the bridge.

- `public/assets/palace-pbr/optimized/*.webp`: same 2048 × 2048 Poly Haven
  Mossy Stone Wall maps credited above, encoded locally with libwebp (`cwebp -m 6`,
  quality 90; OpenGL normal map quality 95). Originals and their source checksums
  remain in `palace-pbr/`. No change to texture dimensions or licensing.

## The Buried Messenger — Hermes excavation

The statue is an optimized public-domain museum scan of **Hermes, Antinoos fra
Belvedere**, SMK KAS1161, from Statens Museum for Kunst (National Gallery of Denmark).
It is a scan of the museum's plaster cast of the ancient marble sculpture,
not a scan of a freshly excavated artifact. The burial scene is fictional.

- Catalogue: https://open.smk.dk/artwork/image/KAS1161
- Primary metadata: https://api.smk.dk/api/v1/art?object_number=KAS1161
- STL: https://api.smk.dk/api/v1/download-3d/0v838549t_KAS1161_small.stl
- Rights: public domain, https://creativecommons.org/publicdomain/mark/1.0/
  (the museum API explicitly marks KAS1161 public_domain=true and supplies the 3D file).
- Local derivative: `public/assets/hermes/belvedere-hermes.glb`; provenance and
  checksums: `public/assets/hermes/source.json`.

`tools/prepare-hermes.py` removes the display plinth and foot extremities, closes
and roughens the ankle break, reduces the scan to 99,999 triangles, and bakes
geometric occlusion to vertex colors. The four-unit export uses the common 5.0
world scale. `tools/measure-hermes.mjs` derives the exposed collision profile.

The statue reuses the existing CC0 sanctuary rock scans through villageMaterials.js.
Its mineral/soil patina shader, fallen placement, marble chips, ropes, boards,
finds trays and spoil heaps are original project work, dedicated to CC0. The old
procedural face/body, horn-like wings and detached sandal have been removed.
