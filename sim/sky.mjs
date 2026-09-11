/**
 * The real sky over Kevin's desk.
 *
 * The world's day and night follow his own clock, and the moon in it is the
 * moon actually outside: same phase, same lit side, same place in the arc.
 * He is an astrologer. A moon drawn from a decorative sine wave would be the
 * one thing in this toy he would notice was a lie.
 *
 * Low-precision Meeus, which is the right tool here: about 0.3° on the Moon's
 * longitude and better on the Sun's, so the illuminated fraction is good to
 * well under a percent and the phase is never the wrong side of new or full.
 * Checked against Arcus's own Swiss Ephemeris — see arcus-sky.test.mjs.
 *
 * Pure functions, no I/O, so it can be tested on its own.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

const norm360 = (d) => ((d % 360) + 360) % 360;
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);

/** Julian Day from a JS Date (which is already UTC inside). */
export const julianDay = (date) => date.getTime() / 86400000 + 2440587.5;

/** Sun's geometric ecliptic longitude and its equatorial coordinates. */
export function sunAt(jd) {
  const n = jd - 2451545.0;
  const L = norm360(280.460 + 0.9856474 * n);        // mean longitude
  const g = norm360(357.528 + 0.9856003 * n);        // mean anomaly
  const lon = norm360(L + 1.915 * sin(g) + 0.020 * sin(2 * g));
  const obl = 23.439 - 0.0000004 * n;
  const ra = norm360(Math.atan2(cos(obl) * sin(lon), cos(lon)) * DEG);
  const dec = Math.asin(sin(obl) * sin(lon)) * DEG;
  return { lon, ra, dec };
}

/**
 * Moon's ecliptic position. The handful of largest periodic terms — enough
 * that the phase drawn is the phase in the sky.
 */
export function moonAt(jd) {
  const d = jd - 2451545.0;
  const L = norm360(218.316 + 13.176396 * d);        // mean longitude
  const M = norm360(134.963 + 13.064993 * d);        // mean anomaly
  const F = norm360(93.272 + 13.229350 * d);         // argument of latitude
  const Ms = norm360(357.529 + 0.98560028 * d);      // Sun's mean anomaly
  const D = norm360(297.850 + 12.190749 * d);        // mean elongation

  const lon = norm360(
    L
    + 6.289 * sin(M)
    + 1.274 * sin(2 * D - M)     // evection
    + 0.658 * sin(2 * D)         // variation
    + 0.214 * sin(2 * M)
    - 0.186 * sin(Ms)            // annual equation
    - 0.114 * sin(2 * F),
  );
  const lat = 5.128 * sin(F)
    + 0.281 * sin(M + F)
    - 0.278 * sin(F - M)
    - 0.173 * sin(2 * D - F);

  const obl = 23.439 - 0.0000004 * d;
  // Ecliptic to equatorial, keeping the latitude term: the Moon strays five
  // degrees off the ecliptic and dropping it visibly misplaces it in the arc.
  const sl = sin(lon), cl = cos(lon), sb = sin(lat), cb = cos(lat);
  const so = sin(obl), co = cos(obl);
  const ra = norm360(Math.atan2(sl * co - (sb / cb) * so, cl) * DEG);
  const dec = Math.asin(sb * co + cb * so * sl) * DEG;
  return { lon, lat, ra, dec };
}

/** Greenwich mean sidereal time, in degrees. */
const gmst = (jd) => norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));

/** Equatorial to what you would actually see standing at lat/lon. */
export function horizon(ra, dec, jd, lat, lon) {
  const H = norm360(gmst(jd) + lon - ra);
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) * DEG;
  const az = norm360(Math.atan2(-sin(H) * cos(dec), cos(lat) * sin(dec) - sin(lat) * cos(dec) * cos(H)) * DEG);
  return { alt, az };
}

/**
 * Everything the world needs to draw its sky at one instant.
 *
 * `light` is 0 in full night and 1 in full day, easing through twilight, which
 * is what the palette and the stars fade against.
 */
export function skyAt(date, lat, lon) {
  const jd = julianDay(date);
  const s = sunAt(jd);
  const m = moonAt(jd);
  const sunPos = horizon(s.ra, s.dec, jd, lat, lon);
  const moonPos = horizon(m.ra, m.dec, jd, lat, lon);

  // Elongation east of the Sun: 0 new, 180 full, and which side is lit.
  const elong = norm360(m.lon - s.lon);
  const illum = (1 - cos(elong)) / 2;

  // Full dark below -12°, and full daylight only once the sun is properly up.
  // Snapping to noon the instant it clears the horizon skipped the best part
  // of the day, which is the hour either side of it.
  const a = sunPos.alt;
  const light = Math.max(0, Math.min(1, (a + 12) / 20));

  return {
    jd,
    sun: { ...sunPos, lon: s.lon },
    moon: { ...moonPos, lon: m.lon, illum, waxing: elong < 180, elong },
    light: light * light * (3 - 2 * light),   // smoothstep, so dusk is not linear
    phase: a > 6 ? 'day' : a > -0.5 ? (isRising(jd, lat, lon) ? 'dawn' : 'dusk') : a > -12 ? 'twilight' : 'night',
    moonName: phaseName(elong),
  };
}

/** Is the Sun on its way up? Cheap: compare with ten minutes ago. */
function isRising(jd, lat, lon) {
  const then = sunAt(jd - 0.007);
  const now = sunAt(jd);
  return horizon(now.ra, now.dec, jd, lat, lon).alt
    > horizon(then.ra, then.dec, jd - 0.007, lat, lon).alt;
}

/** What an astrologer would call it. */
export function phaseName(elong) {
  const e = norm360(elong);
  if (e < 11.25 || e >= 348.75) return 'New Moon';
  if (e < 78.75) return 'Waxing Crescent';
  if (e < 101.25) return 'First Quarter';
  if (e < 168.75) return 'Waxing Gibbous';
  if (e < 191.25) return 'Full Moon';
  if (e < 258.75) return 'Waning Gibbous';
  if (e < 281.25) return 'Last Quarter';
  return 'Waning Crescent';
}
