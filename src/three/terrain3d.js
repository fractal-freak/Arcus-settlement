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
 * Natural rough surfaces use continuous lighting. Ground grain shares world-space
 * UVs across chunks; short grass receives the same sunlight and shadows.
 */

import {
  Group, Mesh, BufferGeometry, BufferAttribute, PlaneGeometry,
  CylinderGeometry, IcosahedronGeometry, BoxGeometry,
  MeshStandardMaterial, ShaderMaterial, InstancedMesh,
  Object3D, Color, Vector3, Vector2, DoubleSide, DataTexture, RedFormat, NearestFilter,
  UniformsLib, UniformsUtils, Frustum, Matrix4, Box3,
} from 'three';
import { sanctuaryMaterials, earthPalette } from './sanctuaryMaterials.js';
import { ancientStoneNear } from '../app/ancientPaths.js';
import { bridgeContains, bridgePathContains } from '../app/bridge.js';
import { broadleafCrown, broadleafTrunk } from './naturalTrees.js';
import { weatheredMaterial } from './villageMaterials.js';
import { makeGroundSurface } from './groundSurface.js';
import { CHUNK, chunkKey } from '../app/iso.js';
import { groundAt, smoothHeightAt, naturalHeightAt, digAmountAt, nearPit, anyPitWithin, propAt, GROUND, STEP, WATER_LEVEL, hash2 } from '../app/terrain.js';
import { isReserved, isPlotTile, pathAmountAt } from '../app/village.js';

import { BASE, landGeometry, farGeometry } from './terrainGeometry.js';
const SURFACE_Y = WATER_LEVEL + STEP * 0.5;
const FOAM_DEPTH = 0.45;
const FADE_MS = 700;
const tmpC = new Color();

// ── Props: shared geometry, one instanced mesh per kind per chunk ─────────

const trunkGeo = broadleafTrunk();
const leafGeo = broadleafCrown();
const rockGeo = new IcosahedronGeometry(0.5, 3);
// Deterministic erosion preserves the original half-unit rock envelope.
const rockPositions = rockGeo.attributes.position;
for (let i=0;i<rockPositions.count;i++) {
  const x=rockPositions.getX(i), y=rockPositions.getY(i), z=rockPositions.getZ(i);
  const erosion=.84+.12*Math.sin(x*8+y*5)*Math.cos(z*7-y*4);
  rockPositions.setXYZ(i,x*erosion, y*erosion*.74, z*erosion*(.85+.1*Math.sin(x*6)));
}
rockGeo.computeVertexNormals();
// A dig site: a few broken columns of varying height around a low slab,
// built from the same two-geometry-per-prop pattern as a tree's trunk and
// leaves rather than a modelled ruin asset.
const ruinsPillarGeo = new CylinderGeometry(0.14, 0.19, 1, 20, 10);
const pillarVertices=ruinsPillarGeo.attributes.position;
for(let i=0;i<pillarVertices.count;i++){
  const x=pillarVertices.getX(i),y=pillarVertices.getY(i),z=pillarVertices.getZ(i),a=Math.atan2(z,x);
  const flute=.95+.035*Math.cos(a*10),joint=Math.abs(y-.1)<.015?.93:1;
  pillarVertices.setXYZ(i,x*flute*joint,y>.49?y-.025-.04*(.5+.5*Math.sin(a*3+1)):y,z*flute*joint);
}
ruinsPillarGeo.computeVertexNormals();
const ruinsSlabGeo = new BoxGeometry(1.3, 0.12, 1.3, 4, 1, 4);

const trunkMat = weatheredMaterial(new MeshStandardMaterial({ color: 0x60513f, roughness: 0.95 }), 'wood');
const leafMat = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.95, side: DoubleSide });
const terrainStoneMaps=sanctuaryMaterials();
const rockMat = earthPalette(new MeshStandardMaterial({map:terrainStoneMaps.rock.color,
  normalMap:terrainStoneMaps.rock.normal,roughnessMap:terrainStoneMaps.rock.rough,color:0xd8d8d1,roughness:1}));
// Worked stone, not a boulder — warmer and a shade lighter than rockMat so a
// ruin reads as built even from a distance, before any pillar is distinct.
const ruinsMat = earthPalette(new MeshStandardMaterial({map:terrainStoneMaps.rock.color,
  normalMap:terrainStoneMaps.rock.normal,roughnessMap:terrainStoneMaps.rock.rough,color:0xd2d0c4,roughness:1}));
const ruinsBaseMat = earthPalette(new MeshStandardMaterial({map:terrainStoneMaps.moss.color,normalMap:terrainStoneMaps.moss.normal,color:0xb5b6a5,roughness:1}),true);

const WATER_FAR = new Color(0x315258);

// landMat's geometry DOES carry a real per-vertex `color` attribute (built by
// hand in buildLand), so this is the one material here vertexColors is for.
const groundSurface = makeGroundSurface();
const landMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.97,
  map: groundSurface, bumpMap: groundSurface, bumpScale: 0.075 });
// Same land, pushed a hair back in depth so streamed chunks win where they
// overlap it. This is the mid-distance country: real hills and river, coarse
// enough to cover the whole view, so the horizon is never a flat empty disc.
const farMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.97 });
farMat.polygonOffset = true;
farMat.polygonOffsetFactor = 1;
farMat.polygonOffsetUnits = 1;
// The coarse fallback used to protrude through the detailed river as solid
// triangles. Once the full view is built, it must only draw outside that view.
// Each completed chunk hides only its own coarse underlay, immediately. Waiting
// for an entire rectangle left coarse river triangles poking through streamed land.
const MASK_SIZE = 128;
const detailedPixels = new Uint8Array(MASK_SIZE * MASK_SIZE);
const detailedTexture = new DataTexture(detailedPixels, MASK_SIZE, MASK_SIZE, RedFormat);
detailedTexture.magFilter = detailedTexture.minFilter = NearestFilter;
detailedTexture.needsUpdate = true;
const chunkOrigin = new Vector2(-64, -64);
farMat.onBeforeCompile = (shader) => {
  shader.uniforms.uDetailedChunks = { value: detailedTexture };
  shader.uniforms.uChunkOrigin = { value: chunkOrigin };
  shader.vertexShader = 'varying vec2 vCountryXZ;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vCountryXZ = (modelMatrix * vec4(position, 1.0)).xz;
  `);
  shader.fragmentShader = 'varying vec2 vCountryXZ;\nuniform sampler2D uDetailedChunks;\nuniform vec2 uChunkOrigin;\n' + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', `
    #include <clipping_planes_fragment>
    vec2 tile = floor(vCountryXZ / ${CHUNK.toFixed(1)}) - uChunkOrigin;
    if (all(greaterThanEqual(tile, vec2(0.))) && all(lessThan(tile, vec2(${MASK_SIZE.toFixed(1)}))) &&
        texture2D(uDetailedChunks, (tile + .5) / ${MASK_SIZE.toFixed(1)}).r > .5) discard;
  `);
};
farMat.customProgramCacheKey = () => 'country-completed-chunks-v2';


// ── Water: depth colour, Fresnel reflection and restrained ripples ───────
//
// Shoreline foam has to know how close a wet vertex
// is to dry land, and this project has no normal-map texture asset (nothing
// else here is textured either — every surface is procedural), so ripple
// shading is faked the same way the terrain's own colour is: a formula, not
// an image. Both come from a small attribute baked once per chunk build
// (aFoam) and a per-frame uTime uniform this module exposes via
// Terrain3D.updateShaders(), not from anything sampled at draw time.
const waterVert = `
  #include <common>
  #include <fog_pars_vertex>
  attribute float aFoam;
  uniform float uTime;
  varying float vFoam;
  varying vec2 vWorldXZ;
  varying vec3 vWorldPos;
  float wave(vec2 xz) {
    return sin(xz.x * 1.15 + uTime * 0.62) * 0.028
      + sin(xz.y * 0.86 - uTime * 0.48) * 0.022
      + sin((xz.x + xz.y) * 2.05 + uTime * 0.95) * 0.012;
  }
  void main() {
    vFoam = aFoam;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    worldPos.y += wave(worldPos.xz);
    vWorldXZ = worldPos.xz;
    vWorldPos = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const waterFrag = `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  uniform vec3 uCameraPos;
  uniform float uTime;
  uniform float uOpacity;
  varying float vFoam;
  varying vec2 vWorldXZ;
  varying vec3 vWorldPos;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.09 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }
  vec3 rippleNormal(vec2 xz) {
    vec2 p = xz * 0.55 + vec2(uTime * 0.07, -uTime * 0.045);
    float e = 0.12;
    float h = fbm(p);
    float hx = fbm(p + vec2(e, 0.0));
    float hz = fbm(p + vec2(0.0, e));
    vec3 n = normalize(vec3((h - hx) / e * 0.4, 1.0, (h - hz) / e * 0.4));
    vec2 q = xz * 1.35 - vec2(uTime * 0.11, uTime * 0.08);
    float h2 = fbm(q);
    n = normalize(n + vec3((h2 - fbm(q + vec2(e, 0.0))) / e, 0.0, (h2 - fbm(q + vec2(0.0, e))) / e) * 0.16);
    return n;
  }

  void main() {
    vec3 N = rippleNormal(vWorldXZ);
    vec3 V = normalize(uCameraPos - vWorldPos);
    vec3 sunDir = normalize(uSunDir);
    float ndv = max(dot(N, V), 0.0);
    float fresnel = mix(0.035, 0.78, pow(1.0 - ndv, 5.0));

    float shallow = clamp(vFoam, 0.0, 1.0);
    vec3 body = mix(uDeep, uShallow, shallow * 0.72 + 0.08);
    body *= 0.72 + 0.28 * max(dot(N, sunDir), 0.0);

    vec3 R = reflect(-V, N);
    float skyAmt = 0.45 + 0.55 * max(R.y, 0.0);
    vec3 skyCol = mix(uDeep * 0.55, uSky, skyAmt);
    float spec = pow(max(dot(R, sunDir), 0.0), 220.0);
    float specWide = pow(max(dot(R, sunDir), 0.0), 28.0);
    skyCol += uSunColor * (spec * 1.15 + specWide * 0.12);

    vec3 color = mix(body, skyCol, fresnel);

    float foam = smoothstep(0.82, 0.985, vFoam);
    foam *= 0.55 + 0.45 * noise(vWorldXZ * 7.0 + uTime * 0.4);
    color = mix(color, uFoamColor, foam * 0.42);

    float alpha = mix(uOpacity, 0.96, fresnel);
    alpha = mix(alpha, 1.0, foam * 0.35);
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }
`;
const waterMat = new ShaderMaterial({
  uniforms: UniformsUtils.merge([UniformsLib.fog, {
    uTime: { value: 0 },
    uDeep: { value: new Color(0x0c3d4a) },
    uShallow: { value: new Color(0x2d7a7a) },
    uFoamColor: { value: new Color(0xe8f4f6) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color(0xfff1d6) },
    uSky: { value: new Color(0xc9dce8) },
    uCameraPos: { value: new Vector3(0, 30, 30) },
    uOpacity: { value: 0.88 },
  }]),
  vertexShader: waterVert,
  fragmentShader: waterFrag,
  transparent: true,
  depthWrite: false,
  fog: true,
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
  const w = 0.065, h = 0.48, lean = 0.16, SEGS = 3;
  const positions = [], sway = [], uvs = [], idx = [];
  const addStrip = (nx, nz) => {
    const base = positions.length / 3;
    for (let s = 0; s <= SEGS; s++) {
      const t = s / SEGS;
      const y = t * h;
      const bow = lean * t * t;
      const hw = (w / 2) * (1 - t * 0.97);
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
  geo.computeVertexNormals();
  const colors = [];
  for (const t of sway) {
    const c = new Color(0x364b25).lerp(new Color(0x899154), t);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  return geo;
}
const grassBladeGeo = makeGrassBladeGeometry();

// The standard shader supplies real sun/shadow response; only blade bending is custom.
const grassTime = { value: 0 };
const grassMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: DoubleSide });
grassMat.onBeforeCompile = (shader) => {
  shader.uniforms.uGrassTime = grassTime;
  shader.vertexShader = 'uniform float uGrassTime;\nattribute float aSway;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
    #include <begin_vertex>
    vec3 root = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float phase = root.x * 0.6 + root.z * 0.35;
    float wind = sin(uGrassTime * 1.2 + phase) * 0.065 + sin(uGrassTime * 2.4 + phase * 1.7) * 0.018;
    transformed.x += wind * aSway * aSway;
    transformed.z += wind * aSway * aSway * 0.45;
  `);
};
grassMat.customProgramCacheKey = () => 'natural-grass-v1';

const dummy = new Object3D();

export class Terrain3D {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.fading = new Map();
    this.built = 0;
    this._lastTargetChunk = null;
    this._prepared = new Map();
    this._inFlight = new Set();
    this._streamFrustum = new Frustum();
    this._streamMatrix = new Matrix4();
    this._chunkBox = new Box3();
    try {
      this._worker = new Worker(new URL('./terrain.worker.js', import.meta.url), { type: 'module' });
      this._worker.onmessage = ({ data }) => {
        if (data.type === 'far') {
          this._farPending = false;
          this._applyFarGeometry(data.geometry);
          return;
        }
        this._inFlight.delete(data.key);
        if (this._wanted?.has(data.key)) this._prepared.set(data.key, data.geometry);
      };
      this._worker.onerror = () => {
        this._worker.terminate(); this._worker = null;
        this._inFlight.clear(); this._prepared.clear(); this._farPending = false; this._farAt = null;
      };
    } catch { this._worker = null; }


    /**
     * A floor under everything, well below the real terrain's lowest point.
     * Unchanged from the blocky version — still just two triangles, still
     * what keeps zooming out from ever showing a hard edge.
     */
    const floorMat = new MeshStandardMaterial({ color: BASE.grass, roughness: 0.95 });
    this.floor = new Mesh(new PlaneGeometry(1, 1), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    // Just under the riverbed rather than six units down. It has to stay
    // below the lowest real ground or it would surface inside the river, but
    // at -6 the step where the streamed chunks ran out was a visible cliff
    // the moment the haze was thinned enough to see it.
    this.floor.position.y = -2.0;
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

    /**
     * Country beyond the streamed chunks. The floor above is a flat disc of
     * one grass colour, and at a low camera it fills half the view — hills,
     * river and trees simply stopping, then empty green. This samples the
     * same height and ground functions the chunks do, just coarser, so the
     * land that is already there is what you see, and scrolling only brings
     * in the trees and grass, not the ground itself.
     */
    this.far = new Mesh(new BufferGeometry(), farMat);
    this.far.receiveShadow = true;
    this.far.renderOrder = -1;
    this.far.frustumCulled = false;
    this.far.visible = false;
    this._farAt = null;
    scene.add(this.far);
  }

  layFloor(targetX, targetZ, radiusTiles) {
    const size = Math.max(4000, radiusTiles * 30);
    this.floor.scale.set(size, size, 1);
    this.floor.position.x = targetX;
    this.floor.position.z = targetZ;
    this.layFarField(targetX, targetZ);
  }

  /** Keep the previous country visible while the worker prepares its next position. */
  layFarField(targetX, targetZ) {
    const originX = Math.round(targetX / 20) * 20;
    const originZ = Math.round(targetZ / 20) * 20;
    if (this._farPending || (this._farAt?.x === originX && this._farAt?.z === originZ)) return;
    this._farAt = { x: originX, z: originZ };
    if (this._worker) {
      this._farPending = true;
      this._worker.postMessage({ type: 'far', x: originX, z: originZ });
    } else {
      const old = this.far.geometry;
      this.far.geometry = farGeometry(originX, originZ);
      this.far.visible = true;
      old.dispose();
    }
  }

  _applyFarGeometry(data) {
    const geometry = new BufferGeometry();
    for (const [name, a] of Object.entries(data.attributes)) {
      geometry.setAttribute(name, new BufferAttribute(a.array, a.itemSize));
    }
    geometry.setIndex(new BufferAttribute(data.index, 1));
    this.far.geometry.dispose();
    this.far.geometry = geometry;
    this.far.visible = true;
  }

  /** Shared uniforms every water and grass surface reads — updated once, felt everywhere. */
  updateShaders(elapsedMs, sunDir, sunColor, cameraPos, skyColor) {
    const t = elapsedMs / 1000;
    waterMat.uniforms.uTime.value = t;
    grassTime.value = t;
    if (sunDir) waterMat.uniforms.uSunDir.value.copy(sunDir);
    if (sunColor) waterMat.uniforms.uSunColor.value.copy(sunColor);
    if (cameraPos) waterMat.uniforms.uCameraPos.value.copy(cameraPos);
    if (skyColor) waterMat.uniforms.uSky.value.copy(skyColor);
  }

  clear() {
    for (const k of [...this.chunks.keys()]) this.drop(k);
    this._viewSignature = null;
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
    const [cx, cz] = key.split(',').map(Number);
    this.markDetailed(cx, cz, false);
    this.scene.remove(g);
    g.traverse((o) => {
      if (o.userData.sharedMat) o.material.dispose();
      if (o.isInstancedMesh) o.dispose();
      else if (o.isMesh) o.geometry.dispose();
    });
    this.chunks.delete(key);
    this.fading.delete(key);
  }

  /** The land itself: one heightmap mesh for the whole chunk. */
  buildLand(t0x, t0y, prepared) {
    const geo = prepared ? new BufferGeometry() : landGeometry(t0x, t0y);
    if (prepared) {
      for (const [name, attribute] of Object.entries(prepared.attributes)) {
        geo.setAttribute(name, new BufferAttribute(attribute.array, attribute.itemSize));
      }
      geo.setIndex(new BufferAttribute(prepared.index, 1));
    }
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
          // The NATURAL ground, not the dug one — a trench is a hole in dry
          // land and does not become a pond because somebody made it.
          if (naturalHeightAt(tx + a * 0.5, tz + b * 0.5) < SURFACE_Y) return true;
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
    const dugHere = anyPitWithin(t0x + CHUNK / 2, t0y + CHUNK / 2, CHUNK + 3);
    for (let j = 0; j < CHUNK; j++) {
      for (let i = 0; i < CHUNK; i++) {
        const tx = t0x + i, tz = t0y + j;
        const g = groundAt(tx, tz);
        if (g.kind !== GROUND.grass && g.kind !== GROUND.meadow) continue;
        // Off the lanes and off the plots, but not off the whole settlement —
        // grass growing up to a lane's edge is what gives the lane an edge.
        if (isPlotTile(tx, tz) || pathAmountAt(tx + 0.5, tz + 0.5) > 0.3) continue;
        // Nothing grows in a hole that was dug this week, or on the spoil
        // thrown out around it. The margin matters: the cut itself eases to
        // nothing at the rim, so testing only the depth left a fringe of
        // waist-high grass standing exactly where people have been walking
        // and tipping barrows for a month.
        if (dugHere && nearPit(tx + 0.5, tz + 0.5, 2.2)) continue;
        const patch = hash2(Math.floor(tx / 3), Math.floor(tz / 3), 40);
        const density = patch < 0.22 ? 1 : 3 + Math.floor(patch * 4);
        for (let b = 0; b < density; b++) {
          const jx = (hash2(tx * 4 + b, tz, 41) - 0.5) * 0.92;
          const jz = (hash2(tx, tz * 4 + b, 42) - 0.5) * 0.92;
          const x = tx + 0.5 + jx, z = tz + 0.5 + jz;
          const h = smoothHeightAt(x, z);
          if (bridgeContains(x,z) || ancientStoneNear(x,z) || pathAmountAt(x, z) > 0.25 || isPlotTile(x, z) || h < SURFACE_Y + 0.08) continue;
          blades.push({ x, z, h, r: hash2(tx * 3 + b, tz * 7 + b, 43) });
        }
      }
    }
    if (!blades.length) return null;
    const inst = new InstancedMesh(grassBladeGeo, grassMat, blades.length);
    inst.castShadow = false;
    inst.receiveShadow = true;
    // Same layer-1 exclusion as the floor and clouds (see their notes in
    // this file and sky3d.js) — kept out of stage.js's depth-only pre-pass.
    // Blades this thin were never going to want individual ink outlines
    // anyway (it would read as noise, not silhouette), and this is also
    // the single largest instance count in the whole scene — measured
    // real per-frame cost with it included in depth: a real, meaningful
    // slice of a frame that had gone from comfortably under 16.7ms before
    // this pass existed to over budget on the majority of frames.
    inst.layers.set(1);
    inst.userData.grass = true;
    blades.forEach((m, n) => {
      const s = 0.55 + m.r * 0.9;
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
    const dugNear = anyPitWithin(t0x + CHUNK / 2, t0y + CHUNK / 2, CHUNK + 2);
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
        if (dugNear && nearPit(tx + 0.5, tz + 0.5, 1.0)) continue;   // nothing standing in the cut
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
        const scale = bush ? 0.55 : (1 + t.p.variant * 0.16) * (pine ? 0.82 : 1);
        const trunkH = bush ? 0.25 : (pine ? 1.5 : 1.1) * scale;

        dummy.position.set(t.x, t.h + trunkH / 2, t.z);
        dummy.scale.set(scale, trunkH, scale);
        dummy.rotation.set(0, (t.x*2.37+t.z*.83) % (Math.PI*2), 0);
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
          // Muted foliage variation avoids bright, stacked crown bands.
          const leafColor = pine
            ? (b === 0 ? 0x3c6350 : b === 1 ? 0x4f7160 : 0x779085)
            : (b === 0 ? 0x536345 : b === 1 ? 0x5d6c4b : 0x65734f);
          leaves.setColorAt(li, tmpC.setHex(leafColor).multiplyScalar(.88+r*.19));
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
        dummy.position.set(t.x, t.h + s * 0.07, t.z);
        dummy.scale.set(s*(.8+hash2(t.x,t.z,77)*.4), s, s);
        const seed = hash2(Math.round(t.x * 4), Math.round(t.z * 4), 33);
        dummy.rotation.set(0, seed * 6.283, 0);
        dummy.updateMatrix();
        r.setMatrixAt(n, dummy.matrix);
        r.setColorAt(n, tmpC.setScalar(.8+seed*.25));
      });
      r.instanceMatrix.needsUpdate = true;
      if (r.instanceColor) r.instanceColor.needsUpdate = true;
      group.add(r);
    }

    // A dig site: meant to be found, not blended in — see the note on
    // propAt() for why these are placed roughly a hundred times rarer than
    // an ordinary rock or tree.
    if (ruins.length) {
      const slabs = new InstancedMesh(ruinsSlabGeo, ruinsBaseMat, ruins.length);
      const pillars = new InstancedMesh(ruinsPillarGeo, ruinsMat, ruins.length * 3);
      slabs.castShadow = true; slabs.receiveShadow = true;
      pillars.castShadow = true; pillars.receiveShadow = true;

      let pi = 0;
      ruins.forEach((t, n) => {
        const seed = (Math.round(t.x * 4) * 73856093) ^ (Math.round(t.z * 4) * 19349663);
        const rot = ((seed & 1023) / 1023) * 6.283;
        dummy.position.set(t.x, t.h - 0.015, t.z);
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
          const ph = 0.32 + r1 * .78;
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

  build(cx, cy, fade = false, prepared) {
    const t0x = cx * CHUNK, t0y = cy * CHUNK;
    const group = new Group();

    group.add(this.buildLand(t0x, t0y, prepared));
    const water = this.buildWater(t0x, t0y);
    if (water) group.add(water);
    const props = this.buildProps(t0x, t0y);
    if (props) group.add(props);
    const grass = this.buildGrass(t0x, t0y);
    if (grass) group.add(grass);

    group.updateMatrixWorld(true);
    group.traverse(o => { o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; });
    this.scene.add(group);
    this.chunks.set(chunkKey(cx, cy), group);
    this.markDetailed(cx, cy, true);
    this.built++;
    if (fade) this.beginFade(group, chunkKey(cx, cy));
    return group;
  }

  /**
   * New country arrives as a dissolve, not a pop. Shared materials cannot
   * fade one chunk without fading every other, so each mesh borrows a clone
   * for the duration and hands the shared one back when it is done. Clones
   * are disposed when returned; material disposal does not dispose shared textures.
   */
  beginFade(group, key) {
    const borrowed = [];
    group.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const shared = o.material;
      const m = shared.clone();
      m.userData.baseOpacity = shared.opacity ?? 1;
      m.userData.keepTransparent = !!shared.transparent;
      m.transparent = true;
      m.opacity = 0;
      m.depthWrite = m.userData.keepTransparent ? shared.depthWrite : true;
      o.userData.sharedMat = shared;
      o.material = m;
      borrowed.push(o);
    });
    this.fading.set(key, { group, borrowed, startedAt: performance.now() });
  }

  updateFades(nowMs) {
    if (!this.fading.size) return;
    for (const [key, fade] of this.fading) {
      if (!this.chunks.has(key)) { this.fading.delete(key); continue; }
      const t = Math.min(1, (nowMs - fade.startedAt) / FADE_MS);
      const eased = t * t * (3 - 2 * t);
      for (const o of fade.borrowed) {
        o.material.opacity = eased * (o.material.userData.baseOpacity ?? 1);
      }
      if (t < 1) continue;
      for (const o of fade.borrowed) {
        o.material.dispose();
        o.material = o.userData.sharedMat;
        delete o.userData.sharedMat;
      }
      this.fading.delete(key);
    }
  }

  markDetailed(cx, cz, present) {
    const x = cx - chunkOrigin.x, z = cz - chunkOrigin.y;
    if (x < 0 || z < 0 || x >= MASK_SIZE || z >= MASK_SIZE) return;
    detailedPixels[z * MASK_SIZE + x] = present ? 255 : 0;
    detailedTexture.needsUpdate = true;
  }

  /** Queue nearby chunks only when the view crosses a chunk boundary. */
  update(targetX, targetZ, radiusTiles, budgetMs = 3, camX = targetX, camZ = targetZ, camera = null) {
    this.layFloor(targetX, targetZ, radiusTiles);
    const cx0 = Math.floor(targetX / CHUNK), cy0 = Math.floor(targetZ / CHUNK);
    const ox = Math.floor(cx0 / 32) * 32 - 48, oz = Math.floor(cy0 / 32) * 32 - 48;
    if (chunkOrigin.x !== ox || chunkOrigin.y !== oz) {
      chunkOrigin.set(ox, oz); detailedPixels.fill(0);
      for (const key of this.chunks.keys()) this.markDetailed(...key.split(',').map(Number), true);
      detailedTexture.needsUpdate = true;
    }
    const camCx = Math.floor(camX / CHUNK), camCy = Math.floor(camZ / CHUNK);
    const rView = Math.max(1, Math.ceil(radiusTiles / CHUNK));
    const direction = camera ? Math.round(Math.atan2(camX-targetX,camZ-targetZ)*24) : 0;
    const elevation = camera ? Math.round(camera.position.y/4) : 0;
    const signature = `${cx0},${cy0},${camCx},${camCy},${rView},${direction},${elevation},${camera?.aspect.toFixed(2) ?? 0}`;
    this._lastTargetChunk = { cx: cx0, cy: cy0 };
    if (signature !== this._viewSignature) {
      this._viewSignature = signature;
      const bounds = r => ({ x0: Math.min(cx0, camCx) - r, x1: Math.max(cx0, camCx) + r,
        y0: Math.min(cy0, camCy) - r, y1: Math.max(cy0, camCy) + r });
      this._view = bounds(rView);
      if (camera) this._streamFrustum.setFromProjectionMatrix(
        this._streamMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const inSight = (cx,cz) => {
        if (!camera || (cx-cx0)**2+(cz-cy0)**2 <= 3**2) return true;
        // One extra chunk on every side anticipates camera motion before the
        // next queue refresh. Tall trees/hills are included in the test.
        this._chunkBox.min.set((cx-1)*CHUNK,-3,(cz-1)*CHUNK);
        this._chunkBox.max.set((cx+2)*CHUNK,35,(cz+2)*CHUNK);
        return this._streamFrustum.intersectsBox(this._chunkBox);
      };
      const want = bounds(rView + 2), keep = bounds(rView + 4);
      const inside = (x, z, b) => x >= b.x0 && x <= b.x1 && z >= b.y0 && z <= b.y1;
      this._queue = [];
      this.pendingVisible = 0;
      for (let cy = want.y0; cy <= want.y1; cy++) for (let cx = want.x0; cx <= want.x1; cx++) {
        if (this.chunks.has(chunkKey(cx, cy)) || !inSight(cx,cy)) continue;
        const visible = inside(cx, cy, this._view);
        this.pendingVisible += Number(visible);
        this._queue.push({ cx, cy, visible, d: Math.min((cx-cx0)**2+(cy-cy0)**2, (cx-camCx)**2+(cy-camCy)**2) });
      }
      this._wanted = new Set(this._queue.map(c => chunkKey(c.cx,c.cy)));
      for (const key of this._prepared.keys()) if (!this._wanted.has(key)) this._prepared.delete(key);
      this._queue.sort((a,b) => Number(b.visible)-Number(a.visible) || a.d-b.d);
      this._dropQueue = [...this.chunks.keys()].filter(key => {
        const [x,z] = key.split(',').map(Number); return !inside(x,z,keep);
      });
      // Preserve the last completed rectangle while the new edge streams in.
    }
    if (this._worker) {
      for (const c of this._queue) {
        if (this._inFlight.size >= 4) break;
        const key = chunkKey(c.cx,c.cy);
        if (this._inFlight.has(key) || this._prepared.has(key)) continue;
        this._inFlight.add(key);
        this._worker.postMessage({ key, x: c.cx*CHUNK, z: c.cy*CHUNK });
      }
    }
    const start = performance.now();
    let count = 0;
    // A budget is checked between chunks; the count cap also limits GPU uploads.
    while (this._queue.length && count < 2 && performance.now() - start < budgetMs) {
      const c = this._queue[0], key = chunkKey(c.cx,c.cy);
      if (this._worker && !this._prepared.has(key)) break;
      this._queue.shift();
      this.build(c.cx, c.cy, false, this._prepared.get(key));
      this._prepared.delete(key);
      if (c.visible) this.pendingVisible--;
      count++;
    }
    for (let i=0; i<2 && this._dropQueue.length; i++) this.drop(this._dropQueue.pop());
    const detailCell = `${Math.floor(camX/8)},${Math.floor(camZ/8)},${this.built}`;
    if (detailCell !== this._detailCell) {
      this._detailCell = detailCell;
      for (const [key, group] of this.chunks) {
        const [cx,cz] = key.split(',').map(Number);
        const near = (cx*CHUNK+CHUNK/2-camX)**2+(cz*CHUNK+CHUNK/2-camZ)**2 < 70**2;
        for (const child of group.children) if (child.userData.grass) child.visible = near;
      }
    }
    return { live: this.chunks.size, pending: this._queue.length, pendingVisible: this.pendingVisible };
  }
}
