/**
 * The Settlement Stone: the world's own founding chart, carved into the
 * monolith in the middle of the square.
 *
 * `founding` in the feed payload (arcus-town.mjs's FOUNDING, unchanged since
 * this project began) is a REAL chart: 10 September 2026, 7:11pm EDT,
 * Pawtucket — Ascendant, Midheaven, and all eleven bodies' true ecliptic
 * longitude in degrees, baked in because a birth chart is fixed forever.
 * Nothing about the wheel on this stone is invented: every glyph sits at its
 * own body's real longitude.
 *
 * WHAT CHANGED
 *
 * The first version drew the wheel with canvas TEXT of the unicode
 * characters — "♃", "♍" — onto a flat disc pasted on the front of the shaft.
 * Two things were wrong with that, and Kevin named both.
 *
 * 1. Those characters are not glyphs, they are requests for glyphs, and a
 *    machine without an astrological font quietly answers with a colour
 *    EMOJI. The chart is now drawn from Arcus's OWN glyph outlines, lifted
 *    from the app's src/data/glyphPaths.js into app/glyphs.js and filled as
 *    Path2D. An outline cannot be substituted, so the founding chart is set
 *    in the project's own letterforms on every machine.
 *
 * 2. A texture pasted on a face is a sticker, not a carving. The wheel is
 *    now cut INTO the stone: the same artwork is rendered twice, once as the
 *    colour (grooves in shadow) and once as a height field driving a bump
 *    map, so real light catches the real edges of the cut and the whole thing
 *    turns as the sun moves across the day. The stone itself is a procedural
 *    granite rather than a flat grey.
 *
 * The chart carries what a chart carries: the twelve signs around the rim,
 * the twelve houses with their cusps and numbers, degree ticks every five
 * degrees, the Ascendant/Descendant and MC/IC axes drawn as the real angles
 * they are, and every body at its own longitude.
 */

import {
  Group, CircleGeometry, IcosahedronGeometry, TubeGeometry, CatmullRomCurve3,
  MeshStandardMaterial, Mesh, InstancedMesh, Object3D, BufferAttribute,
  CanvasTexture, SRGBColorSpace, Vector3, Color, DoubleSide,
} from 'three';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { GLYPHS, GLYPH_UPM } from '../app/glyphs.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { loadPiece } from './assets.js';

const SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
/**
 * The seven traditional planets, and only those: the bodies anyone standing
 * in this square could actually have SEEN. Uranus, Neptune and Pluto are gone
 * from the stone, and so is the Node, which is a point rather than a planet.
 * The feed still carries all eleven; the carving is a deliberate choice about
 * what belongs on a rock this old.
 */
const PLANET_GLYPH = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄',
};
const TRADITIONAL = Object.keys(PLANET_GLYPH);

// ── Glyph drawing ─────────────────────────────────────────────────────────

const boundsCache = new Map();

/**
 * A glyph's own extent in font units.
 *
 * Path2D gives no way to ask, so this reads the numbers straight out of the
 * path data. Every path in the extracted set uses ABSOLUTE commands with
 * coordinates in x,y pairs, so alternating the parsed numbers recovers the
 * box — checked against the drawn result rather than assumed, since a
 * relative command anywhere would quietly skew it.
 */
function glyphBounds(d) {
  let b = boundsCache.get(d);
  if (b) return b;
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = parseFloat(nums[i]), y = parseFloat(nums[i + 1]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  b = { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  boundsCache.set(d, b);
  return b;
}

/** Fill one glyph centred on (cx, cy), sized so its taller axis measures `size`. */
function drawGlyph(ctx, char, cx, cy, size, fill) {
  const d = GLYPHS[char];
  if (!d) return;
  const b = glyphBounds(d);
  const s = size / Math.max(b.w, b.h);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, -s); // font units are Y-up; canvas is Y-down
  ctx.translate(-(b.minX + b.w / 2), -(b.minY + b.h / 2));
  ctx.fillStyle = fill;
  ctx.fill(new Path2D(d));
  ctx.restore();
}

// ── The chart ─────────────────────────────────────────────────────────────

/**
 * Draws the founding chart at `size` square, in one ink colour on one ground
 * colour. Called twice with different palettes — once for what the stone
 * looks like, once for how deep the cut is — so the carving and the shading
 * can never drift out of register with each other.
 *
 * Orientation is real chart convention: the Ascendant at the left of the
 * wheel, longitude increasing counter-clockwise from there.
 *
 * HOUSES are equal houses measured from the Ascendant — the founding data
 * carries the Ascendant and the Midheaven but no cusp table, and equal house
 * is a real, named system rather than a guess dressed up as one. The MC is
 * still drawn where it actually falls, which in equal house is not normally
 * the tenth cusp, and that is correct rather than a mistake.
 */
/**
 * Where each body's glyph actually gets cut, given that two of them can sit
 * on nearly the same degree.
 *
 * Two rules, and they fight each other, so the order matters:
 *
 *   1. A glyph never overlaps another. Crowded bodies go SIDE BY SIDE — and
 *      not resolved with a leader line back to the true degree, which is the
 *      house rule on Arcus's own wheels and is right here too.
 *   2. A glyph never leaves its own sign. The whole point of the wheel on
 *      this stone is reading which sign a planet was in when the settlement
 *      was founded; a body nudged across a cusp to make room would be a
 *      plain lie about the chart.
 *
 * So bodies are grouped BY SIGN and spread only within their own wedge,
 * starting from their true degrees and pushed apart just far enough to clear
 * each other. The separation is capped by what the wedge can actually hold,
 * so a stellium packs tighter rather than bursting its sign.
 *
 * Founding chart today: the Sun and Moon are 0.1 degrees apart in Virgo — a
 * New Moon — which is exactly the case that was drawing them on top of one
 * another.
 */
function placeBodies(bodies) {
  const MARGIN = 3.2;     // degrees kept clear of each cusp
  const WANT_SEP = 9.0;   // degrees between glyph centres, when there is room
  const out = [];
  const bySign = new Map();
  for (const [name, lon] of bodies) {
    const sign = Math.floor(((lon % 360) + 360) % 360 / 30);
    if (!bySign.has(sign)) bySign.set(sign, []);
    bySign.get(sign).push({ name, lon });
  }
  for (const [sign, group] of bySign) {
    const s0 = sign * 30;
    const lo = s0 + MARGIN, hi = s0 + 30 - MARGIN;
    group.sort((p, q) => p.lon - q.lon);
    const k = group.length;
    const sep = k > 1 ? Math.min(WANT_SEP, (hi - lo) / (k - 1)) : 0;
    // Start from the truth, then relax apart inside the wedge.
    const show = group.map((p) => Math.min(hi, Math.max(lo, p.lon)));
    for (let pass = 0; pass < 40; pass++) {
      for (let i = 0; i < k - 1; i++) {
        const gap = show[i + 1] - show[i];
        if (gap >= sep) continue;
        const push = (sep - gap) / 2;
        show[i] -= push;
        show[i + 1] += push;
      }
      for (let i = 0; i < k; i++) show[i] = Math.min(hi, Math.max(lo, show[i]));
    }
    group.forEach((p, i) => out.push({ ...p, show: show[i], sign }));
  }
  return out;
}

function drawChart(ctx, size, founding, ink, ground, weight = 1) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.46;
  const DEG = Math.PI / 180;

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, size, size);

  // Longitude increases COUNTER-CLOCKWISE from the Ascendant at the left.
  const angleFor = (lon) => Math.PI + ((lon - founding.asc + 360) % 360) * DEG;
  const at = (lon, r) => ({
    x: cx + Math.cos(angleFor(lon)) * r,
    y: cy - Math.sin(angleFor(lon)) * r,
  });

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  /**
   * Nothing here is drawn with arc() or a straight lineTo, and that is the
   * point. A perfect circle is the loudest tell that a thing was printed
   * rather than cut — it was still reading as machine-made even under the
   * wear, because the geometry beneath the chips was flawless. Every ring and
   * division is stepped out by hand with the radius wandering and the stroke
   * breathing, the way a chisel actually tracks.
   */
  const handCircle = (r, w, jitter, seed) => {
    const steps = 190;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const n = (hash2(i % steps, seed, 3) - 0.5) + (hash2((i % steps) * 3, seed, 7) - 0.5) * 0.6;
      const rr = r * (1 + n * jitter);
      const x = cx + Math.cos(a) * rr, y = cy - Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = w * weight;
    ctx.stroke();
  };

  const handSpoke = (lon, r0, r1, w, seed) => {
    const steps = 18;
    const a = angleFor(lon);
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const rr = r0 + (r1 - r0) * t;
      const off = (hash2(i, seed, 11) - 0.5) * size * 0.0055;
      const x = cx + Math.cos(a) * rr - Math.sin(a) * off;
      const y = cy - Math.sin(a) * rr - Math.cos(a) * off;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineWidth = w * weight;
    ctx.stroke();
  };

  const rRim = R;
  const rSignIn = R * 0.78;
  const rHub = R * 0.17;
  handCircle(rRim, size * 0.0072, 0.007, 5);
  handCircle(rSignIn, size * 0.0060, 0.008, 19);

  // The twelve divisions run the WHOLE way in, rim to hub, not just across
  // the sign band. Twelve real wedges is what makes "this planet is in that
  // sign" readable at a glance — with the cut stopping at the inner ring, a
  // glyph floated in open space and you had to measure it by eye.
  for (let i = 0; i < 12; i++) {
    handSpoke(i * 30, rHub, rRim, size * 0.0050, 31 + i);
  }

  // Sign glyphs in their band.
  for (let i = 0; i < 12; i++) {
    const mid = at(i * 30 + 15, (rSignIn + rRim) / 2);
    ctx.save();
    ctx.translate(mid.x, mid.y);
    ctx.rotate((hash2(i, 41, 13) - 0.5) * 0.16);
    drawGlyph(ctx, SIGNS[i], 0, 0, size * 0.060 * (0.93 + hash2(i, 43, 17) * 0.14), ink);
    ctx.restore();
  }

  // THE ANGLES. The horizon the settlement was founded on, and the meridian
  // above it — the Ascendant/Descendant axis and the MC/IC. Drawn heavier
  // than a sign division because that is what they are: the frame the whole
  // chart hangs on, not another line in it. The Ascendant end carries a
  // cut mark, since of the four it is the one that says where this is.
  const handAxis = (lon, w, seed) => {
    handSpoke(lon, 0, rRim, w, seed);
    handSpoke(lon + 180, 0, rRim, w, seed + 5);
  };
  handAxis(founding.asc, size * 0.0082, 101);
  handAxis(founding.mc, size * 0.0070, 111);

  // The Ascendant's own mark: a short arrowhead cut into the rim, so the one
  // point that fixes the chart in place can be found without measuring.
  {
    const a = angleFor(founding.asc);
    const tip = at(founding.asc, rRim * 1.005);
    ctx.lineWidth = size * 0.0072 * weight;
    for (const side of [-1, 1]) {
      const b = {
        x: tip.x - Math.cos(a) * rRim * 0.085 - Math.sin(a) * side * rRim * 0.055,
        y: tip.y + Math.sin(a) * rRim * 0.085 - Math.cos(a) * side * rRim * 0.055,
      };
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  // Bodies, sitting just inside their own sign's wedge so the pairing reads
  // without counting round the rim.
  const rBody = rSignIn * 0.80;
  const traditional = (founding.bodies ?? []).filter(([name]) => TRADITIONAL.includes(name));
  placeBodies(traditional).forEach((p, i) => {
    const q = at(p.show, rBody);
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate((hash2(i, 47, 23) - 0.5) * 0.16);
    drawGlyph(ctx, PLANET_GLYPH[p.name] ?? '☉', 0, 0, size * 0.056 * (0.93 + hash2(i, 53, 29) * 0.14), ink);
    ctx.restore();
  });
}

/**
 * Wear. Bites irregular holes out of whatever has just been drawn, so the
 * carving reads as something cut a long time ago rather than printed this
 * morning.
 *
 * 'destination-out' is what makes this work: it erases, so the SAME eroded
 * artwork can be composited into both the colour and the height passes and
 * the two can never disagree about which stroke has worn away. Deterministic
 * from hash2, so the stone weathers the same on every load — a monument that
 * re-eroded itself on refresh would be its own kind of wrong.
 */
function erode(ctx, size) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';

  // Broad soft patches: whole areas rubbed smooth.
  for (let i = 0; i < 52; i++) {
    const x = hash2(i, 3, 71) * size, y = hash2(i, 5, 72) * size;
    const r = size * (0.035 + hash2(i, 7, 73) * 0.13);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.40 + hash2(i, 9, 74) * 0.55;
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Chips and pits: small hard bites out of the lines.
  for (let i = 0; i < 1500; i++) {
    const x = hash2(i, 11, 75) * size, y = hash2(i, 13, 76) * size;
    const r = size * 0.0016 * (0.6 + hash2(i, 17, 77) * 3.4);
    ctx.fillStyle = `rgba(0,0,0,${0.5 + hash2(i, 19, 78) * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // A few long cracks running across the face, breaking strokes as they go.
  ctx.lineCap = 'round';
  for (let i = 0; i < 11; i++) {
    let x = hash2(i, 23, 79) * size, y = hash2(i, 29, 80) * size;
    let a = hash2(i, 31, 81) * Math.PI * 2;
    ctx.strokeStyle = `rgba(0,0,0,${0.45 + hash2(i, 37, 82) * 0.4})`;
    ctx.lineWidth = size * 0.0022 * (0.7 + hash2(i, 41, 83) * 1.8);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let step = 0; step < 22; step++) {
      a += (hash2(i * 40 + step, 43, 84) - 0.5) * 0.85;
      x += Math.cos(a) * size * 0.022;
      y += Math.sin(a) * size * 0.022;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** The chart, drawn and then worn, on its own transparent layer. */
function chartLayer(size, founding, ink, weight) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  drawChart(ctx, size, founding, ink, 'rgba(0,0,0,0)', weight);
  erode(ctx, size);
  return c;
}

/** Colour and height-field passes of the same artwork, as two canvases. */
function chartTextures(founding) {
  const size = 2048;
  const make = () => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    return c;
  };

  // One worn layer, composited into both passes, so the colour and the depth
  // agree about every chip.
  const worn = chartLayer(size, founding, '#1a140e', 1.55);

  // Colour: granite with the cut lines sitting in their own shadow.
  const colour = make();
  const cctx = colour.getContext('2d');
  paintGranite(cctx, size, 0xb8b2a8);
  cctx.globalAlpha = 0.97;
  cctx.drawImage(worn, 0, 0);
  cctx.globalAlpha = 1;

  // Height: mid-grey is the uncut face, dark is the bottom of the groove.
  // three.js reads bumpMap by luminance, so darker genuinely means deeper.
  const bump = make();
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#9a9a9a';
  bctx.fillRect(0, 0, size, size);
  bctx.drawImage(chartLayer(size, founding, '#000000', 1.85), 0, 0);

  const colourTex = new CanvasTexture(colour);
  colourTex.colorSpace = SRGBColorSpace;
  colourTex.anisotropy = 8;
  const bumpTex = new CanvasTexture(bump);
  bumpTex.anisotropy = 8;
  return { colourTex, bumpTex };
}

// ── The stone ─────────────────────────────────────────────────────────────

/**
 * Procedural granite: a mottle of warm and cool greys with mineral speckle.
 * Cheap value noise rather than a downloaded texture — the whole project has
 * no texture pipeline, and a monolith only needs to read as stone, not as a
 * specific quarry.
 */
function paintGranite(ctx, size, base) {
  const r = (base >> 16) & 255, g = (base >> 8) & 255, b = base & 255;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  // Broad blotches, then finer ones, then mineral grain.
  for (const [count, radius, alpha] of [[90, size * 0.16, 0.10], [420, size * 0.05, 0.09], [2600, size * 0.012, 0.10]]) {
    for (let i = 0; i < count; i++) {
      const x = hash2(i, count, 11) * size;
      const y = hash2(i, count, 12) * size;
      const t = hash2(i, count, 13);
      const warm = t > 0.5;
      const d = Math.round((t - 0.5) * 46);
      ctx.fillStyle = warm
        ? `rgba(${r + d + 10},${g + d + 4},${b + d - 4},${alpha})`
        : `rgba(${r + d - 8},${g + d - 4},${b + d + 8},${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius * (0.4 + hash2(i, count, 14)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Dark flecks, the bit that actually reads as granite rather than concrete.
  for (let i = 0; i < 5200; i++) {
    const x = hash2(i, 7, 21) * size, y = hash2(i, 7, 22) * size;
    const s = size * 0.0016 * (0.5 + hash2(i, 7, 23) * 1.6);
    ctx.fillStyle = hash2(i, 7, 24) > 0.72 ? 'rgba(250,248,242,0.30)' : 'rgba(28,26,24,0.34)';
    ctx.fillRect(x, y, s, s);
  }
}


/**
 * The boulder's overall size. It is a rock, not a monument: wider than it is
 * tall, sunk into its own ground, and big enough that the whole square is
 * arranged around it.
 */
const ROCK_R = 3.4;

/** Smooth, seam-free lumpiness from the vertex position itself. */
function lumps(x, y, z) {
  return Math.sin(x * 1.7 + 0.6) * Math.cos(z * 1.3 - 0.2) * 0.50
    + Math.sin(y * 2.1 + x * 0.7) * 0.30
    + Math.sin((x + z) * 3.1 + y * 1.1) * 0.20
    + Math.sin((x - y) * 5.3 + z * 2.7) * 0.10;
}

/**
 * The sacred stone: one huge weathered boulder, with a single dressed panel
 * cut flat on its face for the chart.
 *
 * Layered trigonometry rather than a hash for the lumps, because a boulder is
 * a closed surface and a hash quantised on spherical coordinates splits along
 * the poles and the date line. Two vertices at the same point must always get
 * the same displacement or the rock tears open; a function of the position
 * itself cannot do otherwise.
 *
 * `dress` flattens everything facing the viewer inside the carving radius
 * onto one plane, which is what gives the chart somewhere true to sit — a
 * dressed panel on an otherwise rough rock, exactly what carving a boulder
 * actually involves.
 */
function makeBoulder(dressZ, dressR) {
  // WELDED, and that is the whole difference between a rock and a
  // twenty-sided die. IcosahedronGeometry hands back an unindexed mesh — every
  // triangle carries its own three vertices — so computeVertexNormals can only
  // give each face one flat normal, and the boulder came out as a heap of big
  // flat facets. Merging coincident vertices first lets the normals average
  // across the faces that meet at each point, so the surface shades as one
  // continuous rock, and the moss painted on those vertices blends instead of
  // stopping dead at every triangle edge.
  const geo = mergeVertices(new IcosahedronGeometry(ROCK_R, 5), 1e-4);
  const pos = geo.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().normalize();
    // Two scales of lump: broad shoulders and hollows, then a finer break-up
    // over the top of them. One octave alone came out egg-smooth.
    const broad = lumps(d.x * 1.9, d.y * 1.9, d.z * 1.9);
    const fine = lumps(d.x * 5.7 + 11, d.y * 5.7 - 4, d.z * 5.7 + 7);
    v.multiplyScalar(1 + broad * 0.34 + fine * 0.13);
    // Squat and broad, and broader still at the foot where it meets the earth.
    v.y *= 0.82;
    const sink = Math.max(0, -v.y / ROCK_R);
    v.x *= 1 + sink * 0.20;
    v.z *= 1 + sink * 0.20;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  // Dress the panel: everything on the front, within the carving, onto a plane.
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (v.z <= 0) continue;
    const inPanel = Math.hypot(v.x, v.y - dressZ.y);
    if (inPanel > dressR * 1.55) continue;
    // Fully flat out past the chart's own edge, then fading back into the
    // rock. The fade used to begin INSIDE the carving, so the outermost ring
    // of the wheel sat on ground that was still curving away and the rock
    // could bulge over it.
    const t = Math.min(1, Math.max(0, 1 - (inPanel - dressR * 1.08) / (dressR * 0.47)));
    if (t <= 0) continue;
    pos.setZ(i, v.z + (dressZ.z - v.z) * t);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Moss, painted per vertex — no UVs needed, and an icosahedron has none
  // worth using. It grows where moss grows: on what faces the sky, thicker
  // in the damp low places, and nowhere on the dressed panel, which is kept
  // clear the way a tended stone would be.
  const nor = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const stone = new Color(), moss = new Color(0x4e7031), dark = new Color(0x67635b);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const up = nor.getY(i);
    const grain = 0.5 + 0.5 * lumps(v.x * 3.1, v.y * 3.1, v.z * 3.1);
    stone.setHex(0xa9a49b).lerp(dark, grain * 0.55);
    const damp = Math.max(0, 1 - (v.y + ROCK_R * 0.5) / (ROCK_R * 1.3));
    let m = Math.max(0, (up - 0.02) / 0.55) * (0.45 + 0.55 * grain) + damp * 0.42 * grain;
    const onPanel = v.z > 0 && Math.hypot(v.x, v.y - dressZ.y) < dressR * 1.30;
    if (onPanel) m *= 0.06;
    stone.lerp(moss, Math.min(0.92, Math.max(0, m)));
    colors[i * 3] = stone.r; colors[i * 3 + 1] = stone.g; colors[i * 3 + 2] = stone.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}

/**
 * Vines draped over the rock. Each is a tube following a curve that starts up
 * near the crown, hugs the shoulder and then falls away down the side, with
 * leaves threaded along it. Kept off the front so nothing grows across the
 * chart.
 */
function makeVines(baseY) {
  const g = new Group();
  const vineMat = new MeshStandardMaterial({ color: 0x4f6b33, roughness: 0.9, metalness: 0 });
  const leafMat = new MeshStandardMaterial({ color: 0x6b8f42, roughness: 0.85, metalness: 0, side: DoubleSide });
  const leafGeo = new IcosahedronGeometry(0.13, 0);

  for (let v = 0; v < 7; v++) {
    // Start round the BACK and the sides only. The front of this rock is at
    // a = PI/2 in this parameterisation, and the first pass swept straight
    // through it — vines hanging over the chart, which is the one surface
    // that has to stay readable. The sweep now starts a good way past it and
    // runs the long way round.
    const a0 = Math.PI * 0.80 + (v / 7) * Math.PI * 1.40 + hash2(v, 3, 61) * 0.20;
    const pts = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Down from the crown, drifting round the rock as it falls.
      const phi = (0.14 + t * 1.30) * Math.PI * 0.5;
      const a = a0 + Math.sin(t * 3.1 + v) * 0.22;
      const rr = ROCK_R * (1.02 + lumps(Math.cos(a) * 2.3, Math.cos(phi) * 2.3, Math.sin(a) * 2.3) * 0.16);
      pts.push(new Vector3(
        Math.cos(a) * Math.sin(phi) * rr,
        Math.cos(phi) * rr * 0.82 + 0.06,
        Math.sin(a) * Math.sin(phi) * rr,
      ));
    }
    const curve = new CatmullRomCurve3(pts);
    const tube = new Mesh(new TubeGeometry(curve, 26, 0.045 + hash2(v, 5, 62) * 0.022, 5, false), vineMat);
    tube.castShadow = true;
    g.add(tube);

    for (let l = 0; l < 9; l++) {
      const t = 0.12 + (l / 9) * 0.86;
      const p = curve.getPoint(t);
      const leaf = new Mesh(leafGeo, leafMat);
      const off = 0.10 + hash2(v * 10 + l, 7, 63) * 0.09;
      leaf.position.set(
        p.x * (1 + off * 0.1) + (hash2(v * 10 + l, 11, 64) - 0.5) * 0.2,
        p.y + (hash2(v * 10 + l, 13, 65) - 0.5) * 0.18,
        p.z * (1 + off * 0.1) + (hash2(v * 10 + l, 17, 66) - 0.5) * 0.2,
      );
      const sc = 0.7 + hash2(v * 10 + l, 19, 67) * 0.9;
      leaf.scale.set(sc * 1.5, sc * 0.42, sc);
      leaf.rotation.set(hash2(v * 10 + l, 23, 68) * 3, hash2(v * 10 + l, 29, 69) * 6.28, hash2(v * 10 + l, 31, 70) * 3);
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  g.position.y = baseY;
  return g;
}

export class SettlementStone3D {
  constructor(scene) {
    this.scene = scene;
    this.built = false;
    this._pavingReady = loadPiece('floor-flat');
  }

  sync(founding) {
    if (this.built || !founding) return;
    this.built = true;
    this._build(founding);
  }

  async _build(founding) {
    const group = new Group();
    const h = smoothHeightAt(0, 0);

    const { colourTex, bumpTex } = chartTextures(founding);

    // Where the chart is cut: on the front of the rock, a little above the
    // middle, at about the height of someone standing in front of it.
    const panelY = ROCK_R * 0.22;
    const rChart = ROCK_R * 0.56;
    const panelZ = ROCK_R * 0.80;

    // The rock sits DOWN into its own ground, the way a boulder that has been
    // there a very long time does — there is no plinth under it, because
    // nobody built this, they found it.
    const rock = new Mesh(
      makeBoulder({ y: panelY, z: panelZ }, rChart),
      new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }),
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.position.set(0, h + ROCK_R * 0.46, 0);
    group.add(rock);

    const chart = new Mesh(
      new CircleGeometry(rChart, 96),
      new MeshStandardMaterial({
        map: colourTex,
        bumpMap: bumpTex,
        // Deep enough that the grooves catch a real edge as the sun moves
        // across the day, shallow enough to still read as cut stone.
        bumpScale: 0.30,
        roughness: 0.93,
        metalness: 0.02,
      }),
    );
    chart.position.set(0, h + ROCK_R * 0.46 + panelY, panelZ + 0.05);
    chart.receiveShadow = true;
    group.add(chart);

    group.add(makeVines(h + ROCK_R * 0.46));

    this.scene.add(group);

    // Cobblestone paving, a real Kenney tile — a ring around the stone rather
    // than a filled slab, so the monolith stands IN a plaza rather than on a
    // platform.
    // The plaza. Kenney's floor-flat is exactly one unit square and exactly
    // ZERO units thick — a plane, measured, not assumed — so two things had
    // to change for it to read as a paved square rather than scattered strips.
    //
    // It now fills a DISC instead of a ring: the old version left a hole
    // around the stone and stopped short of the square's edge, which is the
    // patchiness Kevin saw. And each tile sits at the HIGHEST of its own four
    // corners plus a hair, because a flat plane dropped at the height of its
    // centre point buries its own corners wherever the ground curves away,
    // and a half-buried plane looks exactly like a missing one.
    const paving = await this._pavingReady;
    const positions = [];
    const RING = 9;
    for (let gx = -RING; gx <= RING; gx++) {
      for (let gz = -RING; gz <= RING; gz++) {
        if (Math.hypot(gx, gz) > RING) continue;
        positions.push([gx, gz]);
      }
    }
    const tiles = new InstancedMesh(paving.geometry, paving.material, positions.length);
    tiles.receiveShadow = true;
    const dummy = new Object3D();
    positions.forEach(([gx, gz], i) => {
      const top = Math.max(
        smoothHeightAt(gx - 0.5, gz - 0.5), smoothHeightAt(gx + 0.5, gz - 0.5),
        smoothHeightAt(gx - 0.5, gz + 0.5), smoothHeightAt(gx + 0.5, gz + 0.5),
      );
      dummy.position.set(gx, top + 0.035, gz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
    });
    tiles.instanceMatrix.needsUpdate = true;
    this.scene.add(tiles);
  }
}
