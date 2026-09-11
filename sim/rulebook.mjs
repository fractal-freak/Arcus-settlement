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
export const EXTRA_PROJECTS = [];

/** New things for the settlement to care about. */
export const EXTRA_DIMENSIONS = [];

/**
 * Written by the critic each time it changes something: what it saw, what it
 * added, and why. Kept so the next run can read what the last one thought and
 * stop repeating itself — this, rather than the model, is the part that
 * actually gets better over time. Newest first, capped at forty.
 */
export const JOURNAL = [];
