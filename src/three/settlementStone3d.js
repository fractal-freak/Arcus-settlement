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
  Group, CylinderGeometry, CircleGeometry, MeshStandardMaterial,
  Mesh, InstancedMesh, Object3D, CanvasTexture, SRGBColorSpace, RepeatWrapping,
} from 'three';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { GLYPHS, GLYPH_UPM } from '../app/glyphs.js';
import { loadPiece } from './assets.js';

const SIGNS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const PLANET_GLYPH = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃',
  Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇', Node: '☊',
};

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
function drawChart(ctx, size, founding, ink, ground, weight = 1) {
  const cx = size / 2, cy = size / 2;
  const R = size * 0.46;
  const DEG = Math.PI / 180;

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, size, size);

  // Longitude increases COUNTER-CLOCKWISE from the Ascendant at the left.
  // This ran the other way: signs and houses both climbed clockwise, which
  // put the Midheaven at the bottom of the wheel instead of the top. Adding
  // the offset rather than subtracting it is the whole fix — at ASC + 270
  // the MC now lands at twelve o'clock, where a chart puts it.
  const angleFor = (lon) => Math.PI + ((lon - founding.asc + 360) % 360) * DEG;
  const at = (lon, r) => ({
    x: cx + Math.cos(angleFor(lon)) * r,
    y: cy - Math.sin(angleFor(lon)) * r,
  });

  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineCap = 'butt';

  const ring = (r, w) => {
    ctx.lineWidth = w * weight;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  };
  const spoke = (lon, r0, r1, w) => {
    ctx.lineWidth = w * weight;
    const a = at(lon, r0), b = at(lon, r1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };

  // Rings: outer rim, sign band, house band, and the inner court.
  const rRim = R;
  const rSignIn = R * 0.845;
  const rHouseIn = R * 0.66;
  const rCourt = R * 0.60;
  ring(rRim, size * 0.006);
  ring(rSignIn, size * 0.004);
  ring(rHouseIn, size * 0.0035);
  ring(rCourt, size * 0.0025);

  // Degree ticks every 5°, longer every 10°, all the way round the sign band.
  for (let d = 0; d < 360; d += 5) {
    const long = d % 10 === 0;
    spoke(d, rSignIn, rSignIn + (rRim - rSignIn) * (long ? 0.34 : 0.20), size * (long ? 0.0022 : 0.0015));
  }

  // The twelve signs: a divider on every 30° boundary, glyph at each midpoint.
  for (let s = 0; s < 12; s++) {
    spoke(s * 30, rSignIn, rRim, size * 0.004);
    const mid = at(s * 30 + 15, (rSignIn + rRim) / 2);
    drawGlyph(ctx, SIGNS[s], mid.x, mid.y, size * 0.052, ink);
  }

  // The twelve houses: equal from the Ascendant. Cusps only — the numerals
  // are gone on request, and they were the one thing on this stone that
  // could not be carved in the project's own letterforms anyway, since
  // digits meant reaching for a system font.
  for (let h = 0; h < 12; h++) {
    const cusp = founding.asc + h * 30;
    spoke(cusp, rHouseIn, rSignIn, size * (h % 3 === 0 ? 0.0050 : 0.0030));
  }

  // The angles. Drawn heavier than a cusp because they ARE the chart's frame:
  // the horizon the settlement was founded on, and the meridian above it.
  const axis = (lon, w) => {
    ctx.lineWidth = w * weight;
    const a = at(lon, rHouseIn), b = at(lon + 180, rHouseIn);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  axis(founding.asc, size * 0.0075);
  axis(founding.mc, size * 0.0062);

  // Every body at its real longitude: a tick on the house ring, a leader in,
  // and the glyph itself standing in the court.
  const bodies = founding.bodies ?? [];
  for (const [name, lon] of bodies) {
    spoke(lon, rHouseIn - size * 0.012, rHouseIn, size * 0.0035);
    const gp = at(lon, rCourt * 0.86);
    drawGlyph(ctx, PLANET_GLYPH[name] ?? '☉', gp.x, gp.y, size * 0.050, ink);
  }

  // A small boss at the centre, so the court is not an empty hole.
  ctx.lineWidth = size * 0.004 * weight;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.055, 0, Math.PI * 2);
  ctx.stroke();
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
  for (let i = 0; i < 34; i++) {
    const x = hash2(i, 3, 71) * size, y = hash2(i, 5, 72) * size;
    const r = size * (0.03 + hash2(i, 7, 73) * 0.11);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.35 + hash2(i, 9, 74) * 0.5;
    g.addColorStop(0, `rgba(0,0,0,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // Chips and pits: small hard bites out of the lines.
  for (let i = 0; i < 900; i++) {
    const x = hash2(i, 11, 75) * size, y = hash2(i, 13, 76) * size;
    const r = size * 0.0016 * (0.6 + hash2(i, 17, 77) * 3.4);
    ctx.fillStyle = `rgba(0,0,0,${0.5 + hash2(i, 19, 78) * 0.5})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // A few long cracks running across the face, breaking strokes as they go.
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
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
  const worn = chartLayer(size, founding, '#241d16', 1.3);

  // Colour: granite with the cut lines sitting in their own shadow.
  const colour = make();
  const cctx = colour.getContext('2d');
  paintGranite(cctx, size, 0xb8b2a8);
  cctx.globalAlpha = 0.92;
  cctx.drawImage(worn, 0, 0);
  cctx.globalAlpha = 1;

  // Height: mid-grey is the uncut face, dark is the bottom of the groove.
  // three.js reads bumpMap by luminance, so darker genuinely means deeper.
  const bump = make();
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#9a9a9a';
  bctx.fillRect(0, 0, size, size);
  bctx.drawImage(chartLayer(size, founding, '#000000', 1.5), 0, 0);

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

function graniteTexture(size = 1024) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  paintGranite(c.getContext('2d'), size, 0xb3aea6);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Knocks a clean lathe-turned solid out of true, so it reads as quarried rock
 * rather than something poured in a mould.
 *
 * Only the CORNER vertices move. A four-sided cylinder's faces are defined by
 * their corners, so displacing corners tilts each face without bending it —
 * the stone gets an irregular, chipped silhouette while its faces stay broadly
 * planar, which is what the carving needs to sit on.
 *
 * The angular index wraps deliberately. A cylinder duplicates its seam
 * vertices, and hashing on raw atan2 gives -PI and +PI different noise, so the
 * two halves of the seam pull apart and open a crack down the stone. Indexing
 * the angle into whole segments and wrapping means both copies get the same
 * displacement.
 */
function roughen(geo, segments, amount, seed) {
  const pos = geo.attributes.position;
  const TAU = Math.PI * 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue; // the cap's centre pole — leave it on the axis
    const ai = ((Math.round(((Math.atan2(z, x) + Math.PI) / TAU) * segments) % segments) + segments) % segments;
    const yi = Math.round(y * 2.6);
    const n = (hash2(ai, yi, seed) - 0.5)
      + (hash2(ai * 7 + 3, yi * 3 + 1, seed + 17) - 0.5) * 0.55;
    const k = 1 + n * amount;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    pos.setY(i, y + (hash2(ai * 5 + 2, yi * 11 + 7, seed + 29) - 0.5) * amount * 0.9);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** How tall the monolith stands. It is the landmark of the square, and reads as one. */
const SHAFT_H = 9.4;
const BASE_W = 1.55;

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

    const granite = graniteTexture();
    const stoneMat = new MeshStandardMaterial({
      map: granite, roughness: 0.93, metalness: 0.02,
    });

    // A stepped plinth, a tapering four-sided shaft and a pyramidion — the
    // actual form of a raised stone, rather than a post with a cap. Four
    // radial segments give flat faces; the 45° turn puts a FACE forward
    // instead of an edge, which is what the carving needs.
    const plinth = new Mesh(roughen(new CylinderGeometry(BASE_W * 1.62, BASE_W * 1.82, 0.62, 4, 2), 4, 0.10, 5), stoneMat);
    plinth.rotation.y = Math.PI / 4;
    plinth.position.set(0, h + 0.31, 0);

    const step = new Mesh(roughen(new CylinderGeometry(BASE_W * 1.30, BASE_W * 1.54, 0.46, 4, 2), 4, 0.09, 11), stoneMat);
    step.rotation.y = Math.PI / 4;
    step.position.set(0, h + 0.62 + 0.23, 0);

    // Ten height segments give the shaft enough corners to wander off true
    // down its length; at one segment it could only ever lean, not weather.
    const shaft = new Mesh(roughen(new CylinderGeometry(BASE_W * 0.74, BASE_W, SHAFT_H, 4, 10), 4, 0.075, 23), stoneMat);
    shaft.rotation.y = Math.PI / 4;
    shaft.position.set(0, h + 1.08 + SHAFT_H / 2, 0);

    // A blunt, broken tip rather than a sharp pyramidion — this stone was
    // raised and then left out in the weather for a very long time.
    const cap = new Mesh(roughen(new CylinderGeometry(BASE_W * 0.26, BASE_W * 0.74, BASE_W * 0.95, 4, 3), 4, 0.17, 37), stoneMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(0, h + 1.08 + SHAFT_H + BASE_W * 0.475, 0);

    for (const m of [plinth, step, shaft, cap]) { m.castShadow = true; m.receiveShadow = true; }
    group.add(plinth, step, shaft, cap);

    // The carved face. A shallow sunken panel, then the chart cut into it —
    // same granite as the shaft, so it reads as the stone's own surface
    // worked rather than a disc fixed onto it.
    const { colourTex, bumpTex } = chartTextures(founding);
    // WHERE the face actually is, rather than a guessed offset. A cylinder of
    // four radial segments turned 45 degrees presents a flat face at
    // radius/root-two from the axis, and the shaft tapers, so the face plane
    // moves inward as it rises. The first attempt used a flat fraction of the
    // base width and left the carving hovering a third of a unit in front of
    // the stone it was supposed to be cut into.
    // Low enough to actually READ from the square. At 0.60 the carving sat
    // seven units up and you had to fly to see it, which is no use for the
    // one thing on this stone anybody is meant to look at.
    const FRAC = 0.34;
    const faceY = h + 1.08 + SHAFT_H * FRAC;
    const rAtFace = BASE_W + (BASE_W * 0.74 - BASE_W) * FRAC;
    const faceZ = rAtFace * Math.SQRT1_2 + 0.01;
    const rChart = rAtFace * 0.62;

    const chart = new Mesh(
      new CircleGeometry(rChart, 96),
      new MeshStandardMaterial({
        map: colourTex,
        bumpMap: bumpTex,
        // Deep enough that the grooves catch a real edge as the sun moves,
        // shallow enough that it still reads as cut stone and not corrugation.
        bumpScale: 0.16,
        roughness: 0.92,
        metalness: 0.02,
      }),
    );
    chart.position.set(0, faceY, faceZ);
    chart.receiveShadow = true;
    group.add(chart);

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
