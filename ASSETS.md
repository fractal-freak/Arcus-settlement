# Everything in this world, and whether it could ever be public

This page is here because the settlement is private and might one day not be.
Every asset and every quoted text is listed with where it came from and what
its licence actually permits, so if this is ever put in front of anyone there
is a list to check rather than a memory to search.

**Short answer as of 11 Sept 2026: nothing here needs swapping.** Every model
is CC0, every quoted line is public domain, and every sound is arithmetic. The
table exists so that stays true rather than being assumed.

## How to read the status column

- **Clear** — free to use anywhere, including commercially, no credit required.
- **Credit** — free to use, but a visible attribution has to ship with it.
- **Swap** — cannot go public as it stands. Nothing is in this state.

---

## 3D models

| What | Where from | Licence | Status |
|---|---|---|---|
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
| Wind, river, leaves, birds, crickets, drone — `src/app/ambience.js` | Generated in the browser with the Web Audio API | None applies — there is no recording | Clear |

**Why there is no music from the channel Kevin likes.** It is somebody's
copyrighted work, and taking audio off YouTube breaks that site's terms
whatever the page is then used for — private or not. So the ambience is
synthesised instead, which also means it responds to the world (time of day,
how close the water is, how much forest is around) rather than looping.

**If Kevin wants a real music bed**, the ways that stay clear are: a track he
has licensed himself, dropped into `public/assets/audio/` and listed here; a
CC0 track; or a CC-BY track with a credit line on the page, which moves it to
**Credit** in the table above. Either would sit under the synthesised layers
rather than replacing them.

## Data

The buildings, the sessions, the commit counts and the sky are all Kevin's own
— his repository, his Claude Code sessions, and the real sky over Pawtucket.
The citizens, their names and their chronicle are generated. Nothing is fetched
from a third party at runtime.
