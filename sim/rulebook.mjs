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
    "key": "raise_windmills",
    "dim": "silhouette",
    "want": "to raise a mill on the high ground beyond the houses",
    "needs": 92,
    "place": "outskirt",
    "tag": "tall",
    "n": 1,
    "kinds": [
      "building_windmill_green",
      "building_windmill_red"
    ]
  },
  {
    "key": "raise_keep_towers",
    "dim": "silhouette",
    "want": "to raise taller keeps where the skyline is still flat",
    "needs": 84,
    "place": "outskirt",
    "tag": "tall",
    "n": 1,
    "kinds": [
      "building_tower_A_green",
      "building_tower_A_red"
    ]
  },
  {
    "key": "works_scaffolding",
    "dim": "silhouette",
    "want": "to put scaffolding up on unfinished yards",
    "needs": 58,
    "place": "rim",
    "tag": "tall",
    "n": 1,
    "kinds": [
      "building_scaffolding"
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
  },
  {
    "key": "shrine_votive_offerings",
    "dim": "monolith_sanctity",
    "want": "to line the sacred monolith with votive vessels and ritual markers",
    "needs": 35,
    "place": "shrine",
    "tag": "sacred",
    "n": 4,
    "kinds": [
      "bucket_water",
      "barrel",
      "resource_stone",
      "flag_yellow"
    ]
  },
  {
    "key": "monolith_stone_enclosure",
    "dim": "monolith_sanctity",
    "want": "to frame the carved monolith plaza with decorative stone boundaries",
    "needs": 50,
    "place": "shrine",
    "tag": "sacred",
    "n": 3,
    "kinds": [
      "fence_stone_straight"
    ]
  },
  {
    "key": "riverbank_boulder_accent",
    "dim": "waterfront_flourish",
    "want": "to naturalize the muddy shoreline with stone riverbank edging",
    "needs": 40,
    "place": "rim",
    "tag": "edge",
    "n": 4,
    "kinds": [
      "rock_single_A",
      "rock_single_B",
      "rock_single_C",
      "rock_single_D"
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
  },
  {
    "key": "monolith_sanctity",
    "name": "Monolith Sanctity",
    "why": "The carved stone monolith is the focal gathering point of the town, yet it lacks votive vessels, banners, or decorative stone borders to elevate it to a proper shrine.",
    "tag": "sacred",
    "target": 80
  },
  {
    "key": "waterfront_flourish",
    "name": "Waterfront Edge Detail",
    "why": "The river bank leading up to the stone bridge is stark dirt meeting bare water without reed beds or riverbank rock lining.",
    "tag": "edge",
    "target": 60
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
    "at": "2026-09-12",
    "seen": "The large runic monolith draws heavy crowd gatherings but lacks sacred ceremonial banners or ritual offerings, while the foreground tree grove sits in an artificial grid on open grass without natural stone margins or timber workings.",
    "added": "sacred_hallow, forest_boundary, monolith_hallow_banners, monolith_votive_shrine, forester_timber_stockpile, woodland_boulder_margin"
  },
  {
    "at": "2026-09-12",
    "seen": "The large carved stone monolith dominating the central plaza sits on unbordered cobbles without sacred offerings or boundary markers, while the riverbank beside the stone bridge remains a bare dirt drop into open water.",
    "added": "monolith_sanctity, waterfront_flourish, shrine_votive_offerings, monolith_stone_enclosure, bridgehead_waterplants, riverbank_boulder_accent"
  },
  {
    "at": "2026-09-11",
    "seen": "Skyline is the only score still behind, and the critic's heraldry jobs never get taken because they share the tall tag and already read as finished. The outskirts have no mills or taller keeps, only the same flags and watchposts.",
    "added": "raise_windmills, raise_keep_towers, works_scaffolding"
  },
  {
    "at": "2026-09-11",
    "seen": "The river edge is completely naked turf dropping into bare water, while low foliage is densely repeated on land instead of adding vertical variety or waterfront detail.",
    "added": "waterfront, heraldry, plant_water_reeds, scatter_waterlilies, dockside_staging, raise_heraldic_flags, skyline_scaffolding"
  },
  {
    "at": "2026-09-12",
    "seen": "The raw grey dirt clearing on the left is an empty quarry patch lacking tools or stone stockpiles, while the expansive wooden platform on the right sits unbordered and featureless.",
    "added": "quarry_workings, outpost_wayfinding, equip_stone_quarry, quarry_scaffolding_access, waypoint_banner_posts, promenade_boundary_fence"
  },
  {
    "at": "2026-09-11",
    "seen": "The red stone tower and central dirt crossroads sit exposed on empty lawn without armories, practice equipment, or civic gathering structures, leaving major spaces feeling unpurposeful.",
    "added": "garrison, civic_assembly, muster_archery_range, sentry_encampment, construct_public_stage, town_boundary_fencing"
  },
  {
    "at": "2026-09-11",
    "seen": "A dense clump of identical small trees dominates the foreground while major structures like the red tower stand exposed on bare grass without defensive stone boundaries or organized staging yards.",
    "added": "fortification, industry, build_curtain_wall, build_stone_enclosure, assemble_goods_depot, stockpile_resources"
  }
];
