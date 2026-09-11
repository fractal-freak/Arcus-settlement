/**
 * Clouds, and the dust motes drifting near the camera.
 *
 * Used to also own a big gradient shader sphere for the sky itself. That sphere
 * rendered WITHOUT fog applied (`fog: false` on its material) while every other
 * surface in the scene fogs out normally, and its own horizon colour was close
 * to but never exactly the fog's colour — the two met at the true horizon in a
 * visible seam, worse the more of the frame was sky. Reported as "a weird
 * foggy film." Removed: stage.js's own background colour plus FogExp2 already
 * does the whole job of "sky that blends into the distance," correctly and
 * once, and needs nothing layered under it. The god-ray pass added later
 * lives in stage.js's composer for the same reason — screen-space, off the
 * depth buffer, nothing that can go out of sync with the fog colour again.
 *
 * The dome and the clouds ride with the camera target, so you can travel as
 * far as you like and there is still weather overhead.
 *
 * Puff shading: a hand-written shader rather than MeshLambertMaterial, so an
 * icosahedron's facets fade toward their own silhouette (a cheap fresnel-style
 * rim fade on the view-space normal) instead of showing as a faceted gem.
 * Softer at the edges is what "volumetric-looking" comes down to without an
 * actual raymarched volume, which a chunked, already-instanced-heavy world
 * has no frame budget left to run every pixel, every frame.
 *
 * Dust motes: a Points cloud, not individual meshes — the cheapest primitive
 * three.js has for "a few hundred tiny things," and all of it drifts in the
 * VERTEX SHADER off one shared uTime uniform, same as grass and water in
 * terrain3d.js. The JS side only re-seeds a mote's base position when the
 * camera has actually wandered far enough for it to matter (mirrors how the
 * clouds above wrap around the target rather than the world origin), not
 * every frame.
 */

import {
  Group, IcosahedronGeometry, ShaderMaterial, Object3D, InstancedMesh, Color,
  Points, BufferGeometry, BufferAttribute,
} from 'three';

const puffVert = `
  varying vec3 vNormalView;
  void main() {
    vNormalView = normalize(normalMatrix * normal);
    #ifdef USE_INSTANCING
      vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    #endif
    gl_Position = projectionMatrix * mvPosition;
  }
`;
const puffFrag = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormalView;
  void main() {
    float facing = abs(vNormalView.z);
    float alpha = smoothstep(0.02, 0.55, facing) * uOpacity;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

const MOTE_COUNT = 220;
const MOTE_RADIUS = 16;   // stay within this many units of the target, in X/Z
const MOTE_HEIGHT = 7;    // and this many, centred a little above the ground, in Y

const moteVert = `
  attribute float aSeed;
  uniform float uTime;
  varying float vSeed;
  void main() {
    vSeed = aSeed;
    // A slow rise, wrapping back to the bottom of its own band, plus a lazy
    // horizontal wander — pollen catching a breeze, not snow and not rain.
    float rise = mod(uTime * (0.15 + aSeed * 0.1) + aSeed * 10.0, 1.0);
    vec3 p = position;
    p.y += rise * 2.2;
    p.x += sin(uTime * 0.4 + aSeed * 30.0) * 0.6;
    p.z += cos(uTime * 0.33 + aSeed * 30.0) * 0.6;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    // Perspective size falloff, and a fade for anything that has drifted
    // uncomfortably close to the near plane rather than a mote suddenly
    // filling the screen.
    // Clamped, not just floored — a mote can genuinely drift within a couple
    // of units of the camera (MOTE_RADIUS is 16, well inside typical camera
    // distance), and 24.0 / dist blows up hard as dist approaches zero. One
    // point sized in the thousands still only costs one draw call, but its
    // fragment shader then runs across most of the screen every frame —
    // measured live: median frame time 8ms with this line fixed, 46ms
    // without it, on a scene that was not otherwise any different.
    float dist = clamp(-mvPosition.z, 6.0, 400.0);
    gl_PointSize = min(30.0, (5.0 + aSeed * 3.0) * (24.0 / dist));
  }
`;
const moteFrag = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.05, d) * uOpacity * (0.5 + vSeed * 0.5);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export class Sky3D {
  constructor(scene) {
    this.clouds = new Group();
    scene.add(this.clouds);
    const geo = new IcosahedronGeometry(1, 1);
    this.cloudMat = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(0xffffff) },
        // Measured: at 0.95 a cloud drifting in front of anything — a lake,
        // later a building — reads as nearly solid white and washes the
        // colour behind it to grey. A light accent, not an occluding wall.
        uOpacity: { value: 0.62 },
      },
      vertexShader: puffVert,
      fragmentShader: puffFrag,
      transparent: true,
      depthWrite: false,
    });
    this.puffs = new InstancedMesh(geo, this.cloudMat, 16 * 5);
    this.puffs.castShadow = false;
    this.puffs.receiveShadow = false;
    this.puffs.frustumCulled = false;
    // Same layer-1 trick as Terrain3D's fallback floor (see its constructor
    // note): kept out of stage.js's depth-only pre-pass. That pass uses a
    // plain opaque override material with no idea a puff is supposed to be
    // soft at the edges — it wrote a hard, fully-opaque depth for the raw
    // low-poly icosahedron, and the outline pass dutifully inked every one
    // of its facets, turning a soft cloud into a jagged scribble. Depth
    // never needed to know about clouds at all; they neither want a
    // silhouette outline nor need to occlude the god-ray sky mask.
    this.puffs.layers.set(1);
    this.clouds.add(this.puffs);

    this.items = [];
    for (let i = 0; i < 16; i++) {
      this.items.push({
        x: (Math.random() - 0.5) * 900,
        // Low enough to sit in frame from a ground-level camera. At a hundred
        // units up they were overhead and out of shot at every close zoom.
        y: 38 + Math.random() * 34,
        z: (Math.random() - 0.5) * 900,
        s: 7 + Math.random() * 11,
        sp: 1.6 + Math.random() * 2.6,
        seed: Math.random() * 100,
      });
    }
    this.dummy = new Object3D();
    this.writePuffs();

    this._buildMotes(scene);
  }

  _buildMotes(scene) {
    const positions = new Float32Array(MOTE_COUNT * 3);
    const seeds = new Float32Array(MOTE_COUNT);
    this._moteBase = new Array(MOTE_COUNT);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 2 * MOTE_RADIUS;
      const y = Math.random() * MOTE_HEIGHT;
      const z = (Math.random() - 0.5) * 2 * MOTE_RADIUS;
      this._moteBase[i] = { x, y, z };
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
      seeds[i] = Math.random();
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.moteMat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0xfff3d0) },
        uOpacity: { value: 0.5 },
      },
      vertexShader: moteVert,
      fragmentShader: moteFrag,
      transparent: true,
      depthWrite: false,
    });
    this.motes = new Points(geo, this.moteMat);
    this.motes.frustumCulled = false;
    // Never wants a silhouette outline and, being pure additive haze rather
    // than solid geometry, has nothing meaningful to contribute to the
    // god-ray sky mask either — same layer-1 exclusion as clouds and the
    // fallback floor, for the same reason each of them uses it.
    this.motes.layers.set(1);
    scene.add(this.motes);
    this._moteCenter = { x: 0, z: 0 };
  }

  writePuffs() {
    const d = this.dummy;
    let n = 0;
    for (const c of this.items) {
      for (let b = 0; b < 5; b++) {
        const o = b - 2;
        d.position.set(
          c.x + o * c.s * 0.75,
          c.y + Math.sin(c.seed + b) * c.s * 0.16,
          c.z + Math.cos(c.seed * 1.7 + b) * c.s * 0.30,
        );
        const s = c.s * (1 - Math.abs(o) * 0.19);
        d.scale.set(s, s * 0.58, s * 0.82);
        d.rotation.set(c.seed + b, c.seed * 2 + b, 0);
        d.updateMatrix();
        this.puffs.setMatrixAt(n++, d.matrix);
      }
    }
    this.puffs.count = n;
    this.puffs.instanceMatrix.needsUpdate = true;
  }

  /** Re-seed every mote around a new centre — only called once the old one is too far away to matter. */
  _recentreMotes(targetX, targetZ) {
    const pos = this.motes.geometry.attributes.position;
    for (let i = 0; i < MOTE_COUNT; i++) {
      const b = this._moteBase[i];
      b.x = targetX + (Math.random() - 0.5) * 2 * MOTE_RADIUS;
      b.z = targetZ + (Math.random() - 0.5) * 2 * MOTE_RADIUS;
      pos.setXYZ(i, b.x, b.y, b.z);
    }
    pos.needsUpdate = true;
    this._moteCenter.x = targetX;
    this._moteCenter.z = targetZ;
  }

  applySky(sky) {
    const l = sky.light;
    this.cloudMat.uniforms.uColor.value.setRGB(0.28 + 0.72 * l, 0.30 + 0.70 * l, 0.36 + 0.64 * l);
    // This ran every feed tick and put the constructor's 0.62 straight back up
    // to 0.95 in daylight, which was the actual cause of a cloud washing a
    // lake to grey — not the water material. Same night/day range, capped
    // lower so a cloud never gets dense enough to blank out what is behind it.
    this.cloudMat.uniforms.uOpacity.value = 0.34 + 0.28 * l;
    this.moteMat.uniforms.uOpacity.value = 0.28 + 0.3 * l;
  }

  update(dtMs, target) {
    for (const c of this.items) {
      c.x += c.sp * (dtMs / 1000);
      // Wrap around the viewer rather than around the origin, so the sky is
      // never empty however far the camera has travelled.
      if (c.x - target.x > 520) c.x = target.x - 520;
      if (c.x - target.x < -520) c.x = target.x + 520;
      if (Math.abs(c.z - target.z) > 520) c.z = target.z + (Math.random() - 0.5) * 900;
    }
    this.writePuffs();

    this.moteMat.uniforms.uTime.value += dtMs / 1000;
    const dx = target.x - this._moteCenter.x, dz = target.z - this._moteCenter.z;
    if (dx * dx + dz * dz > MOTE_RADIUS * MOTE_RADIUS) this._recentreMotes(target.x, target.z);
  }
}
