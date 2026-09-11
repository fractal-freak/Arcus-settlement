/**
 * The part of this world an AI is allowed to write.
 *
 * Kevin's ask is that the settlement keeps getting better while he is not
 * looking, without him doing anything — that he comes back and it has gone
 * somewhere he would not have thought of. That does not come from a model
 * editing the renderer; it comes from the citizens having more KINDS of thing
 * to want and more kinds of work to do. Eight things to care about and
 * twenty-two jobs is a small vocabulary, and a town can only be as surprising
 * as its vocabulary is wide.
 *
 * So this file is the surface, and it is the ONLY surface. A critic (see
 * critic.mjs) looks at a real screenshot of the world, compares it against how
 * the settlement scores itself, and writes new entries here. Everything it
 * writes is checked before it is ever served — see verify.mjs — and a file
 * that fails any check is thrown away and the last good one kept. The engine,
 * the renderer, the terrain and the sound are not reachable from here, which
 * is what makes leaving it alone overnight survivable.
 *
 * WHAT A PROJECT IS. A job a citizen can take on, finish, and change the world
 * by finishing. Fields, all required:
 *
 *   key     a name nothing else uses
 *   dim     which of the settlement's scores it serves (see DIMENSIONS)
 *   want    what the citizen says they are going to do, starting with "to "
 *   needs   how much work it takes, 20 to 110
 *   place   the ground rule: byPlot square byLane outskirt rim water shrine
 *   tag     what the finished piece counts as: clutter tall edge accent plain sacred
 *   n       how many pieces, 1 to 8
 *   kinds   real model names — anything not in the asset folder is refused
 *
 * WHAT A DIMENSION IS. A new thing for the settlement to care about, which is
 * how the ceiling moves: the citizens top out around 96 on the eight that
 * exist, and then they are only rearranging. Fields:
 *
 *   key     a name nothing else uses
 *   name    what it is called in the panel, two or three words
 *   why     one sentence on why it separates an expensive place from a cheap one
 *   tag     which tag counts toward it
 *   target  how many of that tag is full marks, 10 to 160
 *
 * Nothing is generated yet. The first critic run fills this in.
 */

/** New jobs the citizens can take on. */
export const EXTRA_PROJECTS = [
  {
    "key": "plant_water_reeds",
    "dim": "waterfront",
    "want": "to fill the empty river edge with reeds and river flora",
    "needs": 35,
    "place": "water",
    "tag": "edge",
    "n": 4,
    "kinds": [
      "waterplant_A",
      "waterplant_B"
    ]
  },
  {
    "key": "scatter_waterlilies",
    "dim": "waterfront",
    "want": "to break up the flat blue water surface near the bank",
    "needs": 30,
    "place": "water",
    "tag": "edge",
    "n": 3,
    "kinds": [
      "waterlily_A",
      "waterlily_B"
    ]
  },
  {
    "key": "dockside_staging",
    "dim": "waterfront",
    "want": "to place freight and cargo staging along the river margin",
    "needs": 50,
    "place": "rim",
    "tag": "edge",
    "n": 3,
    "kinds": [
      "crate_long_A",
      "barrel",
      "pallet"
    ]
  },
  {
    "key": "raise_heraldic_flags",
    "dim": "heraldry",
    "want": "to give verticality and high contrast to rooftops and open lanes",
    "needs": 40,
    "place": "byLane",
    "tag": "tall",
    "n": 4,
    "kinds": [
      "flag_red",
      "flag_blue",
      "flag_yellow",
      "flag_green"
    ]
  },
  {
    "key": "skyline_scaffolding",
    "dim": "heraldry",
    "want": "to extend unfinished structures into the upper skyline",
    "needs": 60,
    "place": "byPlot",
    "tag": "tall",
    "n": 2,
    "kinds": [
      "building_scaffolding",
      "ladder"
    ]
  },
  {
    "key": "build_stone_enclosure",
    "dim": "fortification",
    "want": "to partition inner plot boundaries with low stone walls",
    "needs": 45,
    "place": "byPlot",
    "tag": "edge",
    "n": 3,
    "kinds": [
      "fence_stone_straight"
    ]
  },
  {
    "key": "assemble_goods_depot",
    "dim": "industry",
    "want": "to stack trade crates, barrels, and pallets around the craft plaza",
    "needs": 50,
    "place": "square",
    "tag": "clutter",
    "n": 5,
    "kinds": [
      "crate_A_big",
      "crate_B_small",
      "barrel",
      "pallet",
      "wheelbarrow"
    ]
  },
  {
    "key": "stockpile_resources",
    "dim": "industry",
    "want": "to lay down timber and stone stockpiles along work lanes",
    "needs": 60,
    "place": "byLane",
    "tag": "clutter",
    "n": 4,
    "kinds": [
      "resource_lumber",
      "resource_stone",
      "crate_long_A",
      "crate_open"
    ]
  },
  {
    "key": "muster_archery_range",
    "dim": "garrison",
    "want": "to set up target practice and weapon racks near the stone tower base",
    "needs": 30,
    "place": "square",
    "tag": "accent",
    "n": 4,
    "kinds": [
      "target",
      "weaponrack",
      "bucket_arrows"
    ]
  },
  {
    "key": "construct_public_stage",
    "dim": "civic_assembly",
    "want": "to build a central stage for town announcements near the crossroads",
    "needs": 60,
    "place": "square",
    "tag": "tall",
    "n": 2,
    "kinds": [
      "building_stage_A",
      "building_well_red"
    ]
  },
  {
    "key": "town_boundary_fencing",
    "dim": "civic_assembly",
    "want": "to frame open residential plots with wooden post fencing along lanes",
    "needs": 40,
    "place": "byLane",
    "tag": "tall",
    "n": 5,
    "kinds": [
      "fence_wood_straight",
      "fence_wood_straight_gate"
    ]
  }
];

/** New things for the settlement to care about. */
export const EXTRA_DIMENSIONS = [
  {
    "key": "waterfront",
    "name": "river margin",
    "why": "The riverbank drops directly into water with no reeds, lilies, or dockside edge features.",
    "tag": "edge",
    "target": 60
  },
  {
    "key": "heraldry",
    "name": "heraldic height",
    "why": "The settlement skyline is flat apart from isolated towers, lacking tall flags and scaffolding to break the roofline.",
    "tag": "tall",
    "target": 40
  },
  {
    "key": "fortification",
    "name": "fortification",
    "why": "The town features tall towers and rich halls but lacks stone perimeter walls and gated boundaries to define its edges.",
    "tag": "edge",
    "target": 80
  },
  {
    "key": "industry",
    "name": "industry",
    "why": "Lanes and yards around the craft buildings remain bare dirt, missing stored timber, stone piles, and trade crates that convey economic wealth.",
    "tag": "clutter",
    "target": 90
  },
  {
    "key": "garrison",
    "name": "Garrison Staging",
    "why": "The prominent stone tower lacks martial equipment, targets, and guard posts needed to define its defensive role.",
    "tag": "accent",
    "target": 45
  },
  {
    "key": "civic_assembly",
    "name": "Civic Assembly",
    "why": "The broad central thoroughfares offer no public gathering stages or fenced enclosure to structure civic life.",
    "tag": "tall",
    "target": 35
  }
];

/**
 * Written by the critic each time it changes something: what it saw, what it
 * added, and why. Kept so the next run can read what the last one thought and
 * stop repeating itself — this, rather than the model, is the part that
 * actually gets better over time. Newest first, capped at forty.
 */
export const JOURNAL = [
  {
    "at": "2026-09-11",
    "seen": "The red stone tower and central dirt crossroads sit exposed on empty lawn without armories, practice equipment, or civic gathering structures, leaving major spaces feeling unpurposeful.",
    "added": "garrison, civic_assembly, muster_archery_range, sentry_encampment, construct_public_stage, town_boundary_fencing"
  },
  {
    "at": "2026-09-11",
    "seen": "A dense clump of identical small trees dominates the foreground while major structures like the red tower stand exposed on bare grass without defensive stone boundaries or organized staging yards.",
    "added": "fortification, industry, build_curtain_wall, build_stone_enclosure, assemble_goods_depot, stockpile_resources"
  },
  {
    "at": "2026-09-11",
    "seen": "The river edge is completely naked turf dropping into bare water, while low foliage is densely repeated on land instead of adding vertical variety or waterfront detail.",
    "added": "waterfront, heraldry, plant_water_reeds, scatter_waterlilies, dockside_staging, raise_heraldic_flags, skyline_scaffolding"
  }
];
