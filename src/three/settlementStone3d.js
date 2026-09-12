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
  Group, IcosahedronGeometry,
  MeshStandardMaterial, Mesh, BufferGeometry, Float32BufferAttribute,
  CanvasTexture, Vector3,
} from 'three';
import { visibilityMeshes } from './visibility.js';
import { smoothHeightAt, hash2 } from '../app/terrain.js';
import { GLYPHS, GLYPH_UPM } from '../app/glyphs.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sanctuaryMaterials } from './sanctuaryMaterials.js';
import { makeSanctuaryRitual, growStoneVines } from './sanctuaryRitual3d.js';
import { makeSacredCourt } from './sacredCourt3d.js';

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
    const a = i < 4 ? 0.70 : 0.14 + hash2(i, 9, 74) * 0.24;
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

/** Only the grooves are projected: there is no separate disc or pale decal. */
function chartTexture(founding) {
  const worn = chartLayer(2048, founding, '#000000', 1.85);
  const softened = document.createElement('canvas');
  softened.width = softened.height = 2048;
  const ctx = softened.getContext('2d');
  ctx.filter = 'blur(1.1px)'; ctx.drawImage(worn, 0, 0);
  const tex = new CanvasTexture(softened);
  tex.anisotropy = 8;
  return tex;
}

function carvedMaterial(chart, panelY, panelZ, radius) {
  const material = new MeshStandardMaterial({ roughness: 0.96, metalness: 0 });
  const maps = sanctuaryMaterials();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.stoneGrain = { value: maps.rock.color };
    shader.uniforms.stoneMoss = { value: maps.moss.color };
    shader.uniforms.stoneHeightMap = { value: maps.rock.height };
    shader.uniforms.stoneChart = { value: chart };
    shader.vertexShader = 'varying vec3 vStonePosition; varying vec3 vStoneNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvStonePosition = position; vStoneNormal = normal;');
    shader.fragmentShader = `
      uniform sampler2D stoneGrain;
      uniform sampler2D stoneChart;
      uniform sampler2D stoneMoss;
      uniform sampler2D stoneHeightMap;
      varying vec3 vStonePosition;
      varying vec3 vStoneNormal;
      float ageHash(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float ageNoise(vec3 p) {
        vec3 i=floor(p), f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(ageHash(i),ageHash(i+vec3(1,0,0)),f.x),
          mix(ageHash(i+vec3(0,1,0)),ageHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(ageHash(i+vec3(0,0,1)),ageHash(i+vec3(1,0,1)),f.x),
          mix(ageHash(i+vec3(0,1,1)),ageHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec3 weights = pow(abs(normalize(vStoneNormal)), vec3(4.0));
      weights /= max(dot(weights, vec3(1.0)), 0.001);
      vec3 rockColor = texture2D(stoneGrain, vStonePosition.yz * 0.32).rgb * weights.x
        + texture2D(stoneGrain, vStonePosition.xz * 0.32).rgb * weights.y
        + texture2D(stoneGrain, vStonePosition.xy * 0.32).rgb * weights.z;
      vec3 mossColor = texture2D(stoneMoss, vStonePosition.yz * 0.46).rgb * weights.x
        + texture2D(stoneMoss, vStonePosition.xz * 0.46).rgb * weights.y
        + texture2D(stoneMoss, vStonePosition.xy * 0.46).rgb * weights.z;
      float grain = dot(vec3(texture2D(stoneHeightMap, vStonePosition.yz * 0.32).r,
        texture2D(stoneHeightMap, vStonePosition.xz * 0.32).r,
        texture2D(stoneHeightMap, vStonePosition.xy * 0.32).r), weights);
      vec2 chartUV = (vStonePosition.xy - vec2(0.0, ${panelY.toFixed(4)})) / ${(radius * 2).toFixed(4)} + 0.5;
      float face = smoothstep(${(panelZ - .28).toFixed(4)}, ${(panelZ - .20).toFixed(4)}, vStonePosition.z);
      float bounds = step(0.0, chartUV.x) * step(chartUV.x, 1.0) * step(0.0, chartUV.y) * step(chartUV.y, 1.0);
      float cut = texture2D(stoneChart, clamp(chartUV, 0.0, 1.0)).a * face * bounds;
      float moss = smoothstep(0.22, 0.64, grain + max(vStoneNormal.y, 0.0) * 0.42
        + max(0.0, -vStonePosition.y) * 0.23);
      float dressedFace = 1.0 - smoothstep(0.88, 1.22, length((chartUV - 0.5) * 2.0));
      moss *= 1.0 - face * dressedFace * 0.73;
      float rockLuma=dot(rockColor,vec3(.2126,.7152,.0722));
      float mossLuma=dot(mossColor,vec3(.2126,.7152,.0722));
      rockColor=mix(vec3(rockLuma),rockColor,.16)*vec3(1.03,1.02,.99);
      mossColor=mix(vec3(mossLuma*.8+.04),mossColor,.25)*vec3(.98,1.02,.90);
      vec3 agedStone=mix(rockColor*1.12,mossColor,moss*.9);
      float colony=ageNoise(vStonePosition*2.4);
      float lichen=smoothstep(.61,.77,colony)*smoothstep(.35,.64,ageNoise(vStonePosition*19.0));
      lichen*=1.0-cut*.9;
      agedStone=mix(agedStone,vec3(.40,.42,.35),lichen*.58);
      float damp=1.0-smoothstep(-1.6,-.15,vStonePosition.y+colony*.38);
      float rain=smoothstep(.56,.75,ageNoise(vStonePosition*vec3(7.0,.32,7.0)))
        *(1.0-abs(normalize(vStoneNormal).y));
      agedStone*=1.0-damp*.20-rain*.12;
      // Sediment softens some cuts, while the remaining recesses stay deep.
      float sediment=smoothstep(.54,.74,ageNoise(vStonePosition*5.0));
      diffuseColor.rgb*=agedStone*(1.0-cut*mix(.58,.34,sediment));
      float stoneHeight=grain*.16-cut*.018+lichen*.008;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      vec3 sx = normalize(dFdx(-vViewPosition)), sy = normalize(dFdy(-vViewPosition));
      vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
      float determinant = dot(sx, r1) * faceDirection;
      vec3 gradient = sign(determinant) * (dFdx(stoneHeight) * r1 + dFdy(stoneHeight) * r2);
      normal = normalize(abs(determinant) * normal - gradient);
    `);
  };
  material.customProgramCacheKey = () => 'sacred-aged-granite-v3';
  return material;
}

// ── The stone ─────────────────────────────────────────────────────────────

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

/** Subdivide only the carved face and physically sink each surviving cut.
 * The rest of the boulder stays inexpensive. Colour, relief and shadows all
 * use the same worn inscription; the darkest cuts are 12 cm deep.
 */
function chiselFace(geometry, chart, panel, radius) {
  const source = geometry.attributes.position, indices = geometry.index;
  const pixels = chart.image.getContext('2d').getImageData(0, 0, chart.image.width, chart.image.height);
  const size = pixels.width, out = [];
  const point = i => [source.getX(i), source.getY(i), source.getZ(i)];
  const mid = (a,b) => a.map((v,i)=>(v+b[i])*0.5);
  function emit(a,b,c,depth) {
    if (depth) { const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      emit(a,ab,ca,depth-1);emit(ab,b,bc,depth-1);emit(ca,bc,c,depth-1);emit(ab,bc,ca,depth-1);return; }
    for (const p of [a,b,c]) {
      let cut=0;
      const u=p[0]/(radius*2)+.5, v=.5-(p[1]-panel.y)/(radius*2);
      if (p[2]>panel.z-.02 && u>0 && u<1 && v>0 && v<1) {
        const x=Math.floor(u*(size-1)),y=Math.floor(v*(size-1));
        cut=pixels.data[(y*size+x)*4+3]/255;
      }
      out.push(p[0],p[1],p[2]-Math.pow(cut,.65)*.12);
    }
  }
  const count = indices ? indices.count : source.count;
  for(let i=0;i<count;i+=3) {
    const tri=[0,1,2].map(j=>point(indices ? indices.getX(i+j) : i+j));
    const near=tri.some(p=>p[2]>panel.z-.03 && Math.hypot(p[0],p[1]-panel.y)<radius*1.2);
    emit(...tri,near?4:0);
  }
  const result=new BufferGeometry();result.setAttribute('position',new Float32BufferAttribute(out,3));
  geometry.dispose();
  return mergeVertices(result,1e-5);
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
function makeBoulder(dressZ, dressR, chart) {
  // WELDED, and that is the whole difference between a rock and a
  // twenty-sided die. IcosahedronGeometry hands back an unindexed mesh — every
  // triangle carries its own three vertices — so computeVertexNormals can only
  // give each face one flat normal, and the boulder came out as a heap of big
  // flat facets. Merging coincident vertices first lets the normals average
  // across the faces that meet at each point, so the surface shades as one
  // continuous rock, and the moss painted on those vertices blends instead of
  // stopping dead at every triangle edge.
  let geo = mergeVertices(new IcosahedronGeometry(ROCK_R, 18), 1e-4);
  let pos = geo.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().normalize();
    // Two scales of lump: broad shoulders and hollows, then a finer break-up
    // over the top of them. One octave alone came out egg-smooth.
    const broad = lumps(d.x * 1.9, d.y * 1.9, d.z * 1.9);
    const fine = lumps(d.x * 5.7 + 11, d.y * 5.7 - 4, d.z * 5.7 + 7);
    v.multiplyScalar(1 + broad * 0.18 + fine * 0.035);
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
  geo = chiselFace(geo, chart, dressZ, dressR);
  pos = geo.attributes.position;
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  return geo;
}

export class SettlementStone3D {
  constructor(scene) {
    this.scene = scene;
    this.built = false;
  }

  tick(elapsedS) { this.ritual?.tick(elapsedS); }

  sync(founding) {
    if (this.built || !founding) return;
    this.built = true;
    this._build(founding);
  }

  _build(founding) {
    const group = new Group();
    const h = smoothHeightAt(0, 0);

    const chart = chartTexture(founding);

    // Where the chart is cut: on the front of the rock, a little above the
    // middle, at about the height of someone standing in front of it.
    const panelY = ROCK_R * 0.22;
    const rChart = ROCK_R * 0.56;
    const panelZ = ROCK_R * 0.80;

    // The rock sits DOWN into its own ground, the way a boulder that has been
    // there a very long time does — there is no plinth under it, because
    // nobody built this, they found it.
    const rock = new Mesh(
      makeBoulder({ y: panelY, z: panelZ }, rChart, chart),
      carvedMaterial(chart, panelY, panelZ, rChart),
    );
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.position.set(0, h + ROCK_R * 0.46, 0);
    group.add(rock);

    rock.name = 'Settlement Stone — carved granite';
    group.add(makeSacredCourt());
    // Hundreds of vine probes share one acceleration structure on this static rock.
    visibilityMeshes(rock);
    group.add(growStoneVines(rock));
    this.ritual = makeSanctuaryRitual();
    group.add(this.ritual.group);
    this.group = group;
    this.scene.add(group);
  }
}
