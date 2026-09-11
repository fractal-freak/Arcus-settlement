/**
 * Where this world is, and the moment it was founded.
 *
 * Both are FIXED FOREVER. The chart below was cast for a real moment Kevin
 * chose — 10 Sept 2026, 7:11 PM EDT, Pawtucket — and a birth chart does not
 * get recomputed. It lives here rather than in arcus-town.mjs because the
 * published settlement needs it too, and two copies of a chart is exactly the
 * kind of thing that quietly drifts apart.
 */

export const PLACE = { name: 'Pawtucket, Rhode Island', lat: 41.8787, lon: -71.3826 };

export const FOUNDING = {
  when: 'Thursday 10 September 2026, 7:11 PM EDT',
  where: PLACE.name,
  at: Date.UTC(2026, 8, 10, 23, 11, 0),
  asc: 353.531,
  mc: 266.665,
  moon: 'New Moon in Virgo',
  rising: 'Pisces rising',
  bodies: [
    ['Sun', 168.259, false], ['Moon', 165.988, false], ['Mercury', 180.481, false],
    ['Venus', 210.408, false], ['Mars', 109.641, false], ['Jupiter', 135.756, false],
    ['Saturn', 13.063, true], ['Uranus', 65.697, true], ['Neptune', 3.412, true],
    ['Pluto', 303.346, true], ['Node', 329.816, true],
  ],
};
