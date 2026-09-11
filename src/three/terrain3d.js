/**
 * The land, as a smooth, continuous surface.
 *
 * Replaces the earlier blocky/voxel renderer (kept for reference at
 * src/legacy-blocky/terrain3d-blocky.js). Each chunk is now ONE real mesh — a
 * heightmap plane whose vertices are sampled from smoothHeightAt(), not a
 * swarm of instanced boxes — and computeVertexNormals() does the actual work
 * of turning "a grid of points at different heights" into rolling hills:
 * normals interpolate smoothly across a triangle, so the light falls off
 * gradually across a slope instead of snapping face to face the way a cube's
 * six flat normals always did.
 *
 * Still one mesh PER CHUNK, still streamed in around wherever the camera is
 * looking, still unbounded. A literal single plane for the whole world was
 * asked for, and would have undone the last two sessions' worth of work on
 * "no edge, ever, at any zoom" — a fixed-size mesh has an edge somewhere no
 * matter how big it is. Chunking keeps the smooth-terrain LOOK without giving
 * up the unbounded-world PROPERTY.
 *
 * Every chunk samples smoothHeightAt() at EXACT world coordinates, so two
 * neighbouring chunks compute the identical height for the vertices they
 * share along their border — the reason there is no crack at a chunk seam.
 *
 * Cel-shaded pass: every material below is MeshToonMaterial (or a hand-written
 * ShaderMaterial for water and grass, which need effects toon alone cannot
 * do) sharing ONE stepped gradient map, so a hillside reads as flat bands of
 * light and shadow rather than a smooth realistic falloff. The actual ink
 * outline is NOT a mesh here — see stage.js's composer pass, which draws it
 * once in screen space off the depth buffer instead of doubling every prop's
 * draw calls with an inverted-shell outline mesh.
 */

import {
  Group, Mesh, BufferGeometry, BufferAttribute, PlaneGeometry,
  CylinderGeometry, IcosahedronGeometry, BoxGeometry,
  MeshToonMaterial, ShaderMaterial, InstancedMesh,
  Object3D, Color, Vector3, CanvasTexture, NearestFilter, DoubleSide,
} from 'three';
import { CHUNK, chunkKey } from '../app/iso.js';
import { groundAt, smoothHeightAt, propAt, GROUND, STEP, WATER_LEVEL, hash2 } from '../app/terrain.js';
import { isReserved, isPlotTile, pathAmountAt } from '../app/village.js';

/** Vertices per tile edge. 2 is one extra vertex per tile — enough to round off a shelf into a slope. */
const SUB = 2;
const EPS = 0.4; // sample spacing for the slope estimate, in tiles
const RISE = 3;       // how far below its resting spot a new chunk starts, in world units
const RISE_MS = 260;  // how long it takes to arrive

/**
 * The stepped lighting ramp every toon material shares. Three flat bands —
 * shadow, mid, lit — with two hard transitions between them, which is the
 * entire visual difference between "lit realistically" and "cel-shaded": a
 * slope does not darken smoothly as it turns from the sun, it snaps between
 * bands the way a hand-painted cel would. NearestFilter is what keeps the
 * transition a hard line instead of the mip chain blurring it back into a
 * gradient.
 */
function makeToonRamp(stops) {
  const c = document.createElement('canvas');
  c.width = stops.length; c.height = 1;
  const ctx = c.getContext('2d');
  stops.forEach((v, i) => { ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(i, 0, 1, 1); });
  const tex = new CanvasTexture(c);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}
export const toonRamp = makeToonRamp([58, 150, 255]);

/** Warm, saturated bases. The ramp does the modelling now; these stay flat and simple. */
const BASE = {
  grass: new Color(0x7ec767), meadow: new Color(0x63b85c), scrub: new Color(0xa7bd66),
  sand: new Color(0xe8d9a8), stone: new Color(0xa6a6b2), snow: new Color(0xeef3f6),
};
const ROCKY = new Color(0x8a7058);   // what a steep slope exposes, regardless of the ground kind on it
const BEACH = new Color(0xe3d5a0);   // the rim right at the waterline
const PATH  = new Color(0x9a8362);   // packed earth, worn by everyone walking the same way

/**
 * The one height that is BOTH "this tile counts as wet" and "the water
 * surface is drawn here". These used to be two different numbers — a tile
 * counted as wet below WATER_LEVEL + STEP*0.5 (0.275) while the surface was
 * drawn at WATER_LEVEL + 0.03 — so every tile whose real ground sat between
 * those two levels was classified as river and then had its own riverbed
 * drawn standing ABOVE the water covering it. That is the "deep but not
 * filled to the top" trench: the channel is cut correctly, the water just
 * wasn't reaching it. Deriving both from one constant is what stops the two
 * drifting apart again.
 *
 * Which tiles actually get a surface is needsWater() below, not a ring of a
 * fixed width around the wet ones.
 */
const SURFACE_Y = WATER_LEVEL + STEP * 0.5;

/** How deep the water has to get before the shore foam has faded out entirely. */
const FOAM_DEPTH = 0.75;

const tmpC = new Color();

/**
 * How saturated a vertex is, blended by local slope and closeness to water.
 *
 * `kind` is passed in rather than looked up here with groundAt(Math.round(wx),
 * Math.round(wz)) — measured at 1.1-4.6ms per chunk, real chunk building was
 * slow enough that a fresh page load left visible gaps for a moment (reported
 * directly, then reproduced by timing real build() calls rather than the
 * synthetic frame-stepped test that had missed it). SUB=2 means four vertices
 * usually round to the same tile, so groundAt — several noise and hash calls
 * of its own — was running up to 4x more often than it needed to. The caller
 * now resolves it once per TILE and hands the same value to every vertex that
 * shares it.
 */
function paletteAt(wx, wz, h, kind) {
  const base = BASE[kind] ?? BASE.grass;

  const hx = smoothHeightAt(wx + EPS, wz);
  const hz = smoothHeightAt(wx, wz + EPS);
  const slope = (Math.abs(h - hx) + Math.abs(h - hz)) / EPS;
  const rocky = Math.min(1, Math.max(0, (slope - 0.35) / 1.1));

  const shore = Math.min(1, Math.max(0, 1 - (h - WATER_LEVEL) / 0.5));

  tmpC.copy(base).lerp(ROCKY, rocky).lerp(BEACH, shore * (1 - rocky) * 0.85);

  // The village's lanes and square, worn into the ground itself rather than
  // laid on top of it as separate geometry — no extra draw call, and nothing
  // to z-fight the land it sits on. pathAmountAt is a smooth distance to the
  // real street centreline, so the edges wander instead of stepping tile to
  // tile the way a per-tile test would.
  const path = pathAmountAt(wx, wz);
  if (path > 0) tmpC.lerp(PATH, path * 0.88);
  return tmpC;
}

// ── Props: shared geometry, one instanced mesh per kind per chunk ─────────

const trunkGeo = new CylinderGeometry(0.09, 0.13, 1, 6);
// Detail 1 instead of 0 — four times the faces of the original facet-flat
// icosahedron, still cheap for an instanced blob, but round enough that
// toon shading reads as a soft puff of foliage instead of a gemstone.
const leafGeo = new IcosahedronGeometry(0.52, 1);
const rockGeo = new IcosahedronGeometry(0.5, 0);
// A dig site: a few broken columns of varying height around a low slab,
// built from the same two-geometry-per-prop pattern as a tree's trunk and
// leaves rather than a modelled ruin asset.
const ruinsPillarGeo = new CylinderGeometry(0.14, 0.19, 1, 6);
const ruinsSlabGeo = new BoxGeometry(1.3, 0.12, 1.3);

const trunkMat = new MeshToonMaterial({ color: 0x8a5c3a, gradientMap: toonRamp });
// No vertexColors here: setColorAt()/instanceColor is a PER-INSTANCE
// attribute the renderer picks up on its own the moment it is first set,
// independent of the material's vertexColors flag. That flag is instead for a
// PER-VERTEX `color` attribute on the geometry itself — turning it on for a
// plain IcosahedronGeometry that never gets one would have the shader looking
// for an attribute that does not exist.
const leafMat = new MeshToonMaterial({ color: 0x3f9950, gradientMap: toonRamp });
const rockMat = new MeshToonMaterial({ color: 0x8f8f9a, gradientMap: toonRamp });
// Worked stone, not a boulder — warmer and a shade lighter than rockMat so a
// ruin reads as built even from a distance, before any pillar is distinct.
const ruinsMat = new MeshToonMaterial({ color: 0x9d9483, gradientMap: toonRamp });

// landMat's geometry DOES carry a real per-vertex `color` attribute (built by
// hand in buildLand), so this is the one material here vertexColors is for.
const landMat = new MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp });

// ── Water: a hand-written shader, not MeshToonMaterial ─────────────────────
//
// Toon alone cannot do a shoreline: foam has to know how close a wet vertex
// is to dry land, and this project has no normal-map texture asset (nothing
// else here is textured either — every surface is procedural), so ripple
// shading is faked the same way the terrain's own colour is: a formula, not
// an image. Both come from a small attribute baked once per chunk build
// (aFoam) and a per-frame uTime uniform this module exposes via
// Terrain3D.updateShaders(), not from anything sampled at draw time.
const waterVert = `
  attribute float aFoam;
  uniform float uTime;
  varying float vFoam;
  varying vec2 vWorldXZ;
  void main() {
    vFoam = aFoam;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldXZ = worldPos.xz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;
const waterFrag = `
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uOpacity;
  varying float vFoam;
  varying vec2 vWorldXZ;
  void main() {
    // Two scrolling sine fields standing in for a normal map: cheap, and the
    // only ripple technique that fits a project with no texture pipeline.
    vec2 p = vWorldXZ * 0.35;
    float n1 = sin(p.x * 1.7 + uTime * 0.9) + sin(p.y * 1.3 - uTime * 0.7);
    float n2 = sin((p.x + p.y) * 2.6 - uTime * 1.4);
    vec3 normal = normalize(vec3(n1 * 0.05, 1.0, n2 * 0.05));

    vec3 sunDir = normalize(uSunDir);
    float lit = max(0.0, dot(normal, sunDir));
    float band = lit > 0.55 ? 1.0 : (lit > 0.22 ? 0.62 : 0.38);

    // vFoam now carries real depth (1 at the waterline, 0 once it is deep),
    // so it doubles as the shallow/deep blend: a river reads light over its
    // shallows at the bank and darkens toward the channel, which is most of
    // what makes water look like water rather than a blue sheet.
    vec3 base = mix(uDeep, uShallow, clamp(vFoam, 0.0, 1.0) * 0.75 + 0.12) * band;
    float glint = pow(max(0.0, dot(normal, sunDir)), 28.0);
    base += uSunColor * glint * 0.55;

    // Foam breathes rather than sitting painted in place. Kept to a narrow
    // band right at the edge — it used to cover any tile with a few dry
    // neighbours, which at a diagonal bank meant broad white wedges.
    float breathe = 0.5 + 0.5 * sin(uTime * 1.8 + vWorldXZ.x * 0.5 + vWorldXZ.y * 0.5);
    float foamAmt = smoothstep(0.66, 0.95, vFoam + breathe * 0.10);
    vec3 color = mix(base, uFoamColor, foamAmt);

    gl_FragColor = vec4(color, mix(uOpacity, 1.0, foamAmt * 0.6));
  }
`;
const waterMat = new ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uDeep: { value: new Color(0x1f6fa8) },
    uShallow: { value: new Color(0x5fc2e0) },
    uFoamColor: { value: new Color(0xf3fbff) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color(0xffffff) },
    uOpacity: { value: 0.86 },
  },
  vertexShader: waterVert,
  fragmentShader: waterFrag,
  transparent: true,
});

// ── Grass: a cheap crossed-quad blade, instanced, swaying in a fake wind ──

/**
 * A curved, tapered blade — 4 segments up its height rather than one straight
 * quad, each level bowed forward a little more than the last (a quadratic
 * curve, so the arch happens mostly near the tip, the way a real blade
 * actually bends under its own weight) and narrowed toward the top. A single
 * straight quad read as a stiff upright stick even with wind sway on top of
 * it; the rest pose itself needed the curve, not just motion.
 */
function makeGrassBladeGeometry() {
  const w = 0.13, h = 0.66, lean = 0.22, SEGS = 3;
  const positions = [], sway = [], uvs = [], idx = [];
  const addStrip = (nx, nz) => {
    const base = positions.length / 3;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const y = t * h;
      const bow = lean * t * t;
      const hw = (w / 2) * (1 - t * 0.65);
      const cx = nx * bow, cz = nz * bow;
      positions.push(cx - hw * nx, y, cz - hw * nz); sway.push(t); uvs.push(0, t);
      positions.push(cx + hw * nx, y, cz + hw * nz); sway.push(t); uvs.push(1, t);
    }
    for (let s = 0; s < SEGS; s++) {
      const a = base + s * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b, b, c, d);
    }
  };
  addStrip(1, 0);
  addStrip(0, 1); // crossed, so a blade has silhouette from every angle, not just two
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('aSway', new BufferAttribute(new Float32Array(sway), 1));
  geo.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geo.setIndex(idx);
  return geo;
}
const grassBladeGeo = makeGrassBladeGeometry();

const grassVert = `
  attribute float aSway;
  uniform float uTime;
  varying float vShade;
  void main() {
    vec3 local = position;
    #ifdef USE_INSTANCING
      vec4 worldPos = instanceMatrix * vec4(local, 1.0);
    #else
      vec4 worldPos = vec4(local, 1.0);
    #endif
    worldPos = modelMatrix * worldPos;
    float phase = worldPos.x * 0.6 + worldPos.z * 0.35;
    float wind = (sin(uTime * 1.6 + phase) * 0.14 + sin(uTime * 3.1 + phase * 1.7) * 0.05) * aSway;
    worldPos.x += wind;
    worldPos.z += wind * 0.6;
    vShade = 0.72 + 0.28 * aSway;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;
const grassFrag = `
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  varying float vShade;
  void main() {
    gl_FragColor = vec4(mix(uColorLow, uColorHigh, vShade), 1.0);
  }
`;
const grassMat = new ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uColorLow: { value: new Color(0x2f6b34) },
    // Golden-green rather than the cooler light green this was before —
    // asked for explicitly, and it also happens to sit naturally with the
    // rest of this pass's low, warm sun.
    uColorHigh: { value: new Color(0xc8c85a) },
  },
  vertexShader: grassVert,
  fragmentShader: grassFrag,
  side: DoubleSide,
});

const dummy = new Object3D();

export class Terrain3D {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.fading = new Map();  // chunkKey -> real timestamp it started rising, for updateFades()
    this.built = 0;
    // Grass blades are a near-camera detail, not a streamed one — capped to a
    // fixed ring of chunks around wherever the camera is actually looking,
    // independent of how far the terrain itself is asked to stream (which
    // still grows with zoom). Sub-pixel blades at 150 tiles out would only
    // alias, and every one of them is an extra instanced draw.
    this.grassRadiusChunks = 3;
    this._lastTargetChunk = null;

    /**
     * A floor under everything, well below the real terrain's lowest point.
     * Unchanged from the blocky version — still just two triangles, still
     * what keeps zooming out from ever showing a hard edge.
     */
    const floorMat = new MeshToonMaterial({ color: BASE.grass, gradientMap: toonRamp });
    this.floor = new Mesh(new PlaneGeometry(1, 1), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -6;
    this.floor.receiveShadow = true;
    this.floor.renderOrder = -1;
    // Layer 1, not the default 0 — kept OUT of stage.js's depth-only
    // pre-pass (that camera drops layer 1 for the one render call it uses to
    // feed the outline/god-ray passes). The floor sits below real terrain by
    // design, so where a streamed chunk ends and the floor takes over is a
    // genuine, large depth step — invisible to the eye in the ordinary
    // shaded view, but exactly the kind of thing a depth-edge outline pass
    // is built to find, and it did: a solid black band across the whole
    // horizon the moment the floor came into frame. Hiding it from depth
    // only (stage.js's main camera still renders it normally in colour, so
    // it keeps doing its actual job of never showing a hard edge on zoom
    // out) means that boundary now reads as empty sky to both passes —
    // AT WORST a very distant, thin outline exactly like a real horizon,
    // never a nearby wall.
    this.floor.layers.set(1);
    scene.add(this.floor);
  }

  layFloor(targetX, targetZ, radiusTiles) {
    const size = Math.max(4000, radiusTiles * 30);
    this.floor.scale.set(size, size, 1);
    this.floor.position.x = targetX;
    this.floor.position.z = targetZ;
  }

  /** Shared uniforms every water and grass surface reads — updated once, felt everywhere. */
  updateShaders(elapsedMs, sunDir, sunColor) {
    const t = elapsedMs / 1000;
    waterMat.uniforms.uTime.value = t;
    grassMat.uniforms.uTime.value = t;
    if (sunDir) waterMat.uniforms.uSunDir.value.copy(sunDir);
    if (sunColor) waterMat.uniforms.uSunColor.value.copy(sunColor);
  }

  clear() {
    for (const k of [...this.chunks.keys()]) this.drop(k);
  }

  /**
   * The land and water meshes carry geometry built fresh for this one chunk —
   * safe, correct, and necessary to dispose. The tree, rock, ruins and grass
   * meshes carry geometry SHARED across every chunk (trunkGeo, leafGeo,
   * rockGeo, ruinsPillarGeo, ruinsSlabGeo, grassBladeGeo are module constants,
   * one instance each for the whole world) — disposing that here would free
   * it while every other still-loaded chunk's props are still drawing from
   * it. InstancedMesh has its own `.dispose()` for exactly this: it releases
   * only the per-instance matrix/colour buffers this one mesh owns, and
   * deliberately leaves a possibly-shared geometry alone.
   */
  drop(key) {
    const g = this.chunks.get(key);
    if (!g) return;
    this.scene.remove(g);
    g.traverse((o) => {
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh) o.geometry.dispose();
    });
    this.chunks.delete(key);
    this.fading.delete(key);
  }

  /** The land itself: one heightmap mesh for the whole chunk. */
  buildLand(t0x, t0y) {
    const n = CHUNK * SUB;
    const verts = n + 1;
    const positions = new Float32Array(verts * verts * 3);
    const colors = new Float32Array(verts * verts * 3);

    // groundAt() for whatever tile each vertex rounds to, resolved once per
    // tile rather than once per vertex — see the note on paletteAt.
    const kindCache = new Map();
    const kindAt = (wx, wz) => {
      const rx = Math.round(wx), rz = Math.round(wz);
      const key = rx * 100003 + rz;
      let k = kindCache.get(key);
      if (k === undefined) { k = groundAt(rx, rz).kind; kindCache.set(key, k); }
      return k;
    };

    let p = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const wx = t0x + i / SUB;
        const wz = t0y + j / SUB;
        const h = smoothHeightAt(wx, wz);
        positions[p] = wx; positions[p + 1] = h; positions[p + 2] = wz;
        const col = paletteAt(wx, wz, h, kindAt(wx, wz));
        colors[p] = col.r; colors[p + 1] = col.g; colors[p + 2] = col.b;
        p += 3;
      }
    }

    const idx = verts <= 256 ? new Uint16Array(n * n * 6) : new Uint32Array(n * n * 6);
    let q = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * verts + i, b = a + 1, c = a + verts, d = c + 1;
        idx[q++] = a; idx[q++] = c; idx[q++] = b;
        idx[q++] = b; idx[q++] = c; idx[q++] = d;
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    const mesh = new Mesh(geo, landMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Water, merged into one mesh per chunk from only the tiles that are
   * actually wet — flat quads at a fixed height, not the boxes the blocky
   * version used, so there are no side walls to catch stray shadows and read
   * as streaks the way the very first version of this did.
   *
   * Each vertex also carries `aFoam`: the fraction of its tile's eight
   * neighbours that are DRY land, baked once here rather than sampled from a
   * depth buffer every frame. A tile fully surrounded by water gets 0 — open
   * water — and a tile right against the bank gets a real fraction, which is
   * what lets the shader fade foam in as a band instead of painting a hard
   * ring of the same colour around every pond.
   */
  buildWater(t0x, t0y) {
    const positions = [];
    const foam = [];
    const idx = [];
    let n = 0;
    const wetAt = (tx, tz) => smoothHeightAt(tx + 0.5, tz + 0.5) < SURFACE_Y;
    /** 1 right at the waterline, easing to 0 once the water is FOAM_DEPTH deep. */
    const foamAt = (x, z) => {
      const depth = SURFACE_Y - smoothHeightAt(x, z);
      return Math.max(0, Math.min(1, 1 - depth / FOAM_DEPTH));
    };
    /**
     * A tile needs water if ANY point in it stands below the surface.
     *
     * This replaces a fixed two-tile ring around the wet tiles, and it is the
     * difference between an edge that is hidden and an edge that is merely
     * usually hidden. A blanket ring ends wherever it ends: on a broad flat
     * riverbank barely above the waterline, two tiles out was still under
     * water, so the water mesh's own square boundary sat there in plain view
     * as the stair-stepped line along the shore Kevin kept pointing at.
     *
     * Sampling the tile's own corners and midpoints instead means the surface
     * covers exactly the ground that is genuinely submerged, and stops at
     * ground that genuinely is not — so the visible waterline is always the
     * smooth curve where the LAND crosses the surface, never the square edge
     * of a quad. It also draws FEWER quads than the ring did.
     */
    const needsWater = (tx, tz) => {
      for (let a = 0; a <= 2; a++) {
        for (let b = 0; b <= 2; b++) {
          if (smoothHeightAt(tx + a * 0.5, tz + b * 0.5) < SURFACE_Y) return true;
        }
      }
      return false;
    };
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = t0x + i, tz = t0y + j;
        if (!needsWater(tx, tz)) continue;
        const y = SURFACE_Y;
        const a = n, b = n + 1, c = n + 2, d = n + 3;
        positions.push(tx, y, tz, tx + 1, y, tz, tx, y, tz + 1, tx + 1, y, tz + 1);
        // Foam per CORNER, from the real depth of water over the real bed at
        // that exact point. It used to be one value for the whole tile —
        // "how many of my eight neighbours are dry", so nine possible values,
        // constant across the quad, and with each quad carrying its own
        // unshared vertices there was nothing to interpolate between them
        // either. That is precisely the row of hard white sawtooth triangles
        // along both banks: foam snapping between flat per-tile values on a
        // square grid, under a shoreline that curves. Depth is continuous, so
        // this is too, and it follows the real waterline rather than the
        // tile edges.
        foam.push(foamAt(tx, tz), foamAt(tx + 1, tz), foamAt(tx, tz + 1), foamAt(tx + 1, tz + 1));
        idx.push(a, c, b, b, c, d);
        n += 4;
      }
    }
    if (!n) return null;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute('aFoam', new BufferAttribute(new Float32Array(foam), 1));
    geo.setIndex(idx);
    const mesh = new Mesh(geo, waterMat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * A near-field lawn of instanced grass blades across grass/meadow tiles —
   * separate from buildProps' discrete trees/bushes/rocks because this is a
   * DENSITY field, not a placement decision: every eligible tile gets a
   * handful of blades, jittered and wind-swayed, rather than any single tile
   * "deciding" whether it has grass on it the way propAt decides trees.
   */
  buildGrass(t0x, t0y) {
    const blades = [];
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = t0x + i, tz = t0y + j;
        const g = groundAt(tx, tz);
        if (g.kind !== GROUND.grass && g.kind !== GROUND.meadow) continue;
        // Off the lanes and off the plots, but not off the whole settlement —
        // grass growing up to a lane's edge is what gives the lane an edge.
        if (isPlotTile(tx, tz) || pathAmountAt(tx + 0.5, tz + 0.5) > 0.3) continue;
        const density = 3 + Math.floor(hash2(tx, tz, 40) * 3); // 3-5 blades a tile
        for (let b = 0; b < density; b++) {
          const jx = (hash2(tx * 4 + b, tz, 41) - 0.5) * 0.92;
          const jz = (hash2(tx, tz * 4 + b, 42) - 0.5) * 0.92;
          const x = tx + 0.5 + jx, z = tz + 0.5 + jz;
          const h = smoothHeightAt(x, z);
          blades.push({ x, z, h, r: hash2(tx * 3 + b, tz * 7 + b, 43) });
        }
      }
    }
    if (!blades.length) return null;
    const inst = new InstancedMesh(grassBladeGeo, grassMat, blades.length);
    inst.castShadow = false;
    inst.receiveShadow = false;
    // Same layer-1 exclusion as the floor and clouds (see their notes in
    // this file and sky3d.js) — kept out of stage.js's depth-only pre-pass.
    // Blades this thin were never going to want individual ink outlines
    // anyway (it would read as noise, not silhouette), and this is also
    // the single largest instance count in the whole scene — measured
    // real per-frame cost with it included in depth: a real, meaningful
    // slice of a frame that had gone from comfortably under 16.7ms before
    // this pass existed to over budget on the majority of frames.
    inst.layers.set(1);
    blades.forEach((m, n) => {
      const s = 0.75 + m.r * 0.6;
      dummy.position.set(m.x, m.h, m.z);
      dummy.scale.set(s, s * (0.8 + m.r * 0.5), s);
      dummy.rotation.set(0, m.r * 6.283, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
    });
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  }

  /** Trees, bushes, rocks, ruins: instanced per chunk, grounded on the same smooth surface as the land mesh. */
  buildProps(t0x, t0y) {
    const trees = [], rocks = [], ruins = [];
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = t0x + i, tz = t0y + j;
        if (smoothHeightAt(tx + 0.5, tz + 0.5) < SURFACE_Y) continue; // submerged — never mind what propAt guessed
        // Village ground is spoken for. propAt() rolls trees off a pure
        // noise field that knows nothing about the settlement, so without
        // this a tree whose roll landed inside a house simply grew through
        // the roof — which is exactly what it was doing.
        if (isReserved(tx, tz)) continue;
        const p = propAt(tx, tz);
        if (!p) continue;
        // A little jitter off the tile centre, deterministic, so a forest
        // does not read as a grid. Grounded at ITS jittered spot, not the
        // tile centre, or a tree on a slope would float or sink at the edges.
        const jx = (hash2(tx, tz, 31) - 0.5) * 0.62;
        const jz = (hash2(tx, tz, 32) - 0.5) * 0.62;
        const x = tx + 0.5 + jx, z = tz + 0.5 + jz;
        const h = smoothHeightAt(x, z);
        if (p.kind === 'tree' || p.kind === 'bush' || p.kind === 'pine') trees.push({ x, z, h, p });
        else if (p.kind === 'rock') rocks.push({ x, z, h, p });
        else if (p.kind === 'ruins') ruins.push({ x, z, h, p });
      }
    }

    const group = new Group();

    if (trees.length) {
      const trunks = new InstancedMesh(trunkGeo, trunkMat, trees.length);
      const leaves = new InstancedMesh(leafGeo, leafMat, trees.length * 3);
      trunks.castShadow = true; trunks.receiveShadow = true;
      leaves.castShadow = true; leaves.receiveShadow = true;

      let li = 0;
      trees.forEach((t, n) => {
        const bush = t.p.kind === 'bush';
        const pine = t.p.kind === 'pine';
        // Same two geometries as every other tree here — a trunk and three
        // leaf blobs — rather than a second modelled asset. A pine only
        // needs to read as a pine from a hillside away: narrower, a little
        // taller, frostier toward the top. Reusing the shape is also why one
        // still reads as a tree at all up where nothing else does.
        const scale = bush ? 0.55 : (1 + t.p.variant * 0.16) * (pine ? 0.82 : 1);
        const trunkH = bush ? 0.25 : (pine ? 1.5 : 1.1) * scale;

        dummy.position.set(t.x, t.h + trunkH / 2, t.z);
        dummy.scale.set(scale, trunkH, scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        trunks.setMatrixAt(n, dummy.matrix);

        const base = t.h + trunkH;
        const seed = (Math.round(t.x * 4) * 73856093) ^ (Math.round(t.z * 4) * 19349663);
        for (let b = 0; b < 3; b++) {
          const r = ((seed >> (b * 3)) & 7) / 7;
          dummy.position.set(
            t.x + (r - 0.5) * 0.34 * scale,
            base + (0.22 + b * 0.30) * scale,
            t.z + (((seed >> (b * 5 + 2)) & 7) / 7 - 0.5) * 0.34 * scale,
          );
          const s = (1.05 - b * 0.22) * scale * (bush ? 1.25 : pine ? 0.8 : 1);
          dummy.scale.set(s, s * (pine ? 1.35 : 0.86), s);   // taller, narrower silhouette for a conifer
          dummy.rotation.set(r * 1.4, r * 2.2, r * 0.8);
          dummy.updateMatrix();
          leaves.setMatrixAt(li, dummy.matrix);
          // Frost gathers toward the top blob rather than the colour simply
          // being uniformly paler, the way real snow actually sits on a pine.
          const leafColor = pine
            ? (b === 0 ? 0x3c6350 : b === 1 ? 0x4f7d68 : 0xcfe3de)
            : (b === 0 ? 0x357f42 : b === 1 ? 0x3f9950 : 0x52b465);
          leaves.setColorAt(li, tmpC.setHex(leafColor));
          li++;
        }
      });
      trunks.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
      leaves.count = li;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      group.add(trunks, leaves);
    }

    // Named explicitly in the ask ("trees, rocks, and foliage") and never
    // actually drawn in 3D before now — propAt has always been able to place
    // one, this just did not render it.
    if (rocks.length) {
      const r = new InstancedMesh(rockGeo, rockMat, rocks.length);
      r.castShadow = true; r.receiveShadow = true;
      rocks.forEach((t, n) => {
        const s = 0.26 + t.p.variant * 0.16;
        dummy.position.set(t.x, t.h + s * 0.38, t.z);
        dummy.scale.set(s, s * 0.7, s);
        const seed = hash2(Math.round(t.x * 4), Math.round(t.z * 4), 33);
        dummy.rotation.set(0, seed * 6.283, 0);
        dummy.updateMatrix();
        r.setMatrixAt(n, dummy.matrix);
        r.setColorAt(n, tmpC.copy(BASE.stone).lerp(ROCKY, 0.4));
      });
      r.instanceMatrix.needsUpdate = true;
      if (r.instanceColor) r.instanceColor.needsUpdate = true;
      group.add(r);
    }

    // A dig site: meant to be found, not blended in — see the note on
    // propAt() for why these are placed roughly a hundred times rarer than
    // an ordinary rock or tree.
    if (ruins.length) {
      const slabs = new InstancedMesh(ruinsSlabGeo, ruinsMat, ruins.length);
      const pillars = new InstancedMesh(ruinsPillarGeo, ruinsMat, ruins.length * 3);
      slabs.castShadow = true; slabs.receiveShadow = true;
      pillars.castShadow = true; pillars.receiveShadow = true;

      let pi = 0;
      ruins.forEach((t, n) => {
        const seed = (Math.round(t.x * 4) * 73856093) ^ (Math.round(t.z * 4) * 19349663);
        const rot = ((seed & 1023) / 1023) * 6.283;
        dummy.position.set(t.x, t.h + 0.06, t.z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, rot, 0);
        dummy.updateMatrix();
        slabs.setMatrixAt(n, dummy.matrix);

        // Three broken columns around the slab, each a different height and
        // a slight lean — a tidy ring of identical pillars would read as a
        // fence, not something that has been standing here for centuries.
        for (let b = 0; b < 3; b++) {
          const r1 = ((seed >> (b * 4)) & 15) / 15;
          const r2 = ((seed >> (b * 4 + 2)) & 15) / 15;
          const ph = 0.5 + r1 * 1.1;
          const ang = (b / 3) * 6.283 + r2 * 0.6;
          const rad = 0.42 + r2 * 0.22;
          dummy.position.set(
            t.x + Math.cos(ang) * rad,
            t.h + ph / 2,
            t.z + Math.sin(ang) * rad,
          );
          dummy.scale.set(1, ph, 1);
          dummy.rotation.set((r1 - 0.5) * 0.3, r2 * 6.283, (r2 - 0.5) * 0.3);
          dummy.updateMatrix();
          pillars.setMatrixAt(pi++, dummy.matrix);
        }
      });
      slabs.instanceMatrix.needsUpdate = true;
      pillars.instanceMatrix.needsUpdate = true;
      group.add(slabs, pillars);
    }

    return trees.length || rocks.length || ruins.length ? group : null;
  }

  build(cx, cy) {
    const t0x = cx * CHUNK, t0y = cy * CHUNK;
    const group = new Group();

    group.add(this.buildLand(t0x, t0y));
    const water = this.buildWater(t0x, t0y);
    if (water) group.add(water);
    const props = this.buildProps(t0x, t0y);
    if (props) group.add(props);

    const near = !this._lastTargetChunk ||
      Math.hypot(cx - this._lastTargetChunk.cx, cy - this._lastTargetChunk.cy) <= this.grassRadiusChunks;
    if (near) {
      const grass = this.buildGrass(t0x, t0y);
      if (grass) group.add(grass);
    }

    // Starts below its true position and rises into place over updateFades()
    // — see the note there for why a vertical offset was used rather than a
    // scale or an opacity fade.
    group.position.y = -RISE;
    this.scene.add(group);
    this.chunks.set(chunkKey(cx, cy), group);
    this.fading.set(chunkKey(cx, cy), performance.now());
    this.built++;
    return group;
  }

  /**
   * Ease every still-rising chunk a little closer to its resting position.
   *
   * A chunk used to be added to the scene complete and at full height the
   * instant it finished building — reported as ground "coming in with a
   * jolt" while panning, and it would: a whole hillside's worth of trees
   * simply existing between one frame and the next has nothing gradual about
   * it, no matter how fast the build itself was.
   *
   * Scaling the GROUP down for the same effect does not work here: every
   * vertex in it is baked in absolute world coordinates (that is what lets
   * neighbouring chunks share an edge without a seam — verified bit-exact
   * earlier), so scaling the group would shrink it toward the WORLD ORIGIN,
   * not toward its own middle, and a chunk half a map away would visibly
   * fly toward (0,0,0) as it faded in. A position offset has no such problem
   * — it moves every child by the same amount regardless of where their own
   * coordinates already point — so the chunk rises straight up out of the
   * ground it is joining, in place, which is what "coming in gently" is
   * actually supposed to look like.
   *
   * Only chunks still mid-rise are touched — `fading` is a short list, not
   * every loaded chunk, so a settled chunk costs nothing here ever again.
   */
  updateFades(nowMs) {
    if (!this.fading.size) return;
    for (const [key, startedAt] of this.fading) {
      const group = this.chunks.get(key);
      if (!group) { this.fading.delete(key); continue; }   // dropped mid-rise
      const t = Math.min(1, (nowMs - startedAt) / RISE_MS);
      const eased = 1 - (1 - t) * (1 - t);                  // ease-out: quick start, gentle settle
      group.position.y = -RISE * (1 - eased);
      if (t >= 1) this.fading.delete(key);
    }
  }

  /**
   * Keep chunks in step with where the camera is looking.
   *
   * Built with a RING of margin beyond what is strictly visible, and several
   * per frame rather than a couple — the plain heightmap chunks this replaced
   * are far cheaper than the old box swarms were, so there is headroom for
   * both. Without the ring, a chunk only entered the build queue once it was
   * already inside the visible radius, and a fast pan could ask for more of
   * them in one frame than the old budget could finish — new ground
   * appearing right where you were already looking, not safely off-screen.
   * That reads as terrain popping in out of nowhere.
   *
   * A second, distinct gap in the same spirit: a fresh jump to a new part of
   * the map (look(), or a real fast pan) starts every nearby chunk at zero
   * built, and until this fix the queue was sorted by distance to the
   * ORBIT TARGET alone. The camera itself can sit in a completely different
   * chunk from what it is looking at — confirmed live: three frames after a
   * jump, the target's chunk was built and the ground directly under the
   * camera was not, because it happened to rank behind several
   * target-adjacent chunks in the queue. That is the one patch of ground most
   * likely to fill most of the frame, and the one most important to have
   * ready first. Sorting by whichever of camera or target a chunk is nearer
   * to fixes that without changing what eventually loads, only the order.
   */
  update(targetX, targetZ, radiusTiles, budgetMs = 6, camX = targetX, camZ = targetZ) {
    this.layFloor(targetX, targetZ, radiusTiles);
    const ring = CHUNK; // one extra chunk-width of margin, in tiles
    const cx0 = Math.floor(targetX / CHUNK);
    const cy0 = Math.floor(targetZ / CHUNK);
    const camCx = Math.floor(camX / CHUNK);
    const camCy = Math.floor(camZ / CHUNK);
    const r = Math.max(1, Math.ceil((radiusTiles + ring) / CHUNK));
    this._lastTargetChunk = { cx: cx0, cy: cy0 };

    const wanted = new Set();
    const todo = [];
    for (let cy = cy0 - r; cy <= cy0 + r; cy++) {
      for (let cx = cx0 - r; cx <= cx0 + r; cx++) {
        const k = chunkKey(cx, cy);
        wanted.add(k);
        if (!this.chunks.has(k)) {
          const dTarget = (cx - cx0) ** 2 + (cy - cy0) ** 2;
          const dCam = (cx - camCx) ** 2 + (cy - camCy) ** 2;
          todo.push({ cx, cy, d: Math.min(dTarget, dCam) });
        }
      }
    }
    todo.sort((a, b) => a.d - b.d);

    /**
     * A budget in MILLISECONDS, not a flat chunk count.
     *
     * Measured a real chunk at 1.1-4.6ms depending how much water and forest
     * is in it — a fixed "5 chunks a frame" was really "somewhere between 5
     * and 23ms a frame" depending on what those five chunks happened to
     * contain, and on a fresh load, wherever the guess landed high, that is
     * real frame time lost to a still-building world with a gap left showing.
     * A time box adapts to whatever a chunk actually costs, on whatever
     * machine is running it, instead of a number picked once and never
     * checked against a clock. The count cap under it is only a safety rail
     * against one pathological frame, not the thing doing the limiting.
     */
    const start = performance.now();
    let built = 0;
    while (built < todo.length && built < 24 && performance.now() - start < budgetMs) {
      this.build(todo[built].cx, todo[built].cy);
      built++;
    }

    for (const k of [...this.chunks.keys()]) if (!wanted.has(k)) this.drop(k);
    return { live: this.chunks.size, pending: Math.max(0, todo.length - built) };
  }
}
