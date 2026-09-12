import { Color, BufferGeometry, BufferAttribute } from 'three';
import { CHUNK } from '../app/iso.js';
import { groundAt, smoothHeightAt, digAmountAt, anyPitWithin, noise, STEP, WATER_LEVEL, GROUND } from '../app/terrain.js';
import { pathAmountAt } from '../app/village.js';
import { palaceCliffMask } from '../app/palaceLandscape.js';
/** Vertices per tile edge. 2 is one extra vertex per tile — enough to round off a shelf into a slope. */
const SUB = 2;
const EPS = 0.4; // sample spacing for the slope estimate, in tiles


/** Muted meadow, dry soil and mineral tones, under one lighting model. */
export const BASE = {
  grass: new Color(0x788754), meadow: new Color(0x647a48), scrub: new Color(0x929064),
  sand: new Color(0xb5a381), stone: new Color(0x96948a), snow: new Color(0xeef3f6),
};
const ROCKY = new Color(0x8a7058);   // what a steep slope exposes, regardless of the ground kind on it
const BEACH = new Color(0xa69b7f);   // the rim right at the waterline
const PATH  = new Color(0x97866c);   // packed earth, worn by everyone walking the same way
const SPOIL = new Color(0x6b5238);   // freshly turned earth at the bottom of a cutting

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
export function paletteAt(wx, wz, h, kind, dug = true) {
  const base = BASE[kind] ?? BASE.grass;

  const hx = smoothHeightAt(wx + EPS, wz);
  const hz = smoothHeightAt(wx, wz + EPS);
  const slope = (Math.abs(h - hx) + Math.abs(h - hz)) / EPS;
  const rocky = Math.min(1, Math.max(0, (slope - 0.35) / 1.1));

  const shore = Math.min(1, Math.max(0, 1 - (h - WATER_LEVEL) / 0.5));

  tmpC.copy(base).lerp(ROCKY, rocky).lerp(BEACH, shore * (1 - rocky) * 0.85);
  // Broad dry patches and cooler vegetation follow continuous world-space
  // fields, so the landscape varies without tile seams or scattered objects.
  const patch=noise(wx*.19,wz*.19,83);
  if(kind==='grass'||kind==='meadow'||kind==='scrub')
    tmpC.lerp(BASE.scrub,Math.max(0,patch-.48)*.65);
  tmpC.multiplyScalar(.92+noise(wx*.37,wz*.37,91)*.16);
  // Soil darkens at the actual waterline; it does not become a pale sand ribbon.
  const damp = Math.max(0, 1 - Math.abs(h - SURFACE_Y) / 0.35);
  tmpC.multiplyScalar(1 - damp * 0.18);

  // The village's lanes and square, worn into the ground itself rather than
  // laid on top of it as separate geometry — no extra draw call, and nothing
  // to z-fight the land it sits on. pathAmountAt is a smooth distance to the
  // real street centreline, so the edges wander instead of stepping tile to
  // tile the way a per-tile test would.
  const path = pathAmountAt(wx, wz);
  if (path > 0) tmpC.lerp(PATH, path * 0.88);

  // Turned earth, where a trench has been cut. Same idea as the lanes above —
  // worn into the ground itself rather than laid on top of it. `dug` is false
  // for the whole chunk when there is no cutting anywhere near it, which is
  // almost every chunk.
  if (dug) {
    const cut = digAmountAt(wx, wz);
    if (cut > 0) {
      const disturbed=noise(wx*1.9,wz*1.9,114);
      tmpC.lerp(SPOIL,Math.min(1,cut*(1.04+disturbed*.6)));
      tmpC.multiplyScalar(1-cut*(.08+disturbed*.26));
    }
  }
  return tmpC;
}


export function landGeometry(t0x, t0y) {
    const n = CHUNK * SUB;
    const verts = n + 1;
    const positions = new Float32Array(verts * verts * 3);
    const colors = new Float32Array(verts * verts * 3);
    const uvs = new Float32Array(verts * verts * 2);
    const excavation = new Float32Array(verts * verts);

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

    // One question for the whole chunk, instead of thirty per vertex.
    const dug = anyPitWithin(t0x + CHUNK / 2, t0y + CHUNK / 2, CHUNK);

    let p = 0;
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const wx = t0x + i / SUB;
        const wz = t0y + j / SUB;
        const h = smoothHeightAt(wx, wz);
        excavation[p/3]=dug?digAmountAt(wx,wz):0;
        // The finer cliff mesh draws the actual shared surface here. Recess this
        // coarse underlay so its interpolation cannot poke through the rock face.
        positions[p] = wx; positions[p + 1] = h - palaceCliffMask(wx,wz)*.5; positions[p + 2] = wz;
        uvs[p / 3 * 2] = wx / 6; uvs[p / 3 * 2 + 1] = wz / 6;
        const col = paletteAt(wx, wz, h, kindAt(wx, wz), dug);
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
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setAttribute('excavation', new BufferAttribute(excavation, 1));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeVertexNormals();

    return geo;
}

/** The distant country uses the same terrain truth; generated away from camera/input work. */
export function farGeometry(originX, originZ, n = 90, step = 5) {
  const verts = n + 1, half = n * step / 2;
  const positions = new Float32Array(verts * verts * 3);
  const colors = new Float32Array(positions.length);
  const water = new Color(0x315258);
  for (let j=0,p=0;j<=n;j++) for (let i=0;i<=n;i++,p+=3) {
    const x=originX-half+i*step,z=originZ-half+j*step,h=smoothHeightAt(x,z);
    const kind=groundAt(Math.round(x),Math.round(z)).kind;
    const wet=kind===GROUND.water||h<SURFACE_Y;
    positions[p]=x; positions[p+1]=wet?SURFACE_Y:h; positions[p+2]=z;
    const color=wet?water:paletteAt(x,z,h,kind,false);
    colors[p]=color.r; colors[p+1]=color.g; colors[p+2]=color.b;
  }
  const index=new Uint16Array(n*n*6);
  for(let j=0,q=0;j<n;j++) for(let i=0;i<n;i++) {
    const a=j*verts+i,b=a+1,c=a+verts,d=c+1;
    index[q++]=a;index[q++]=c;index[q++]=b;
    index[q++]=b;index[q++]=c;index[q++]=d;
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new BufferAttribute(positions,3));
  geometry.setAttribute('color',new BufferAttribute(colors,3));
  geometry.setIndex(new BufferAttribute(index,1));
  geometry.computeVertexNormals();
  return geometry;
}
