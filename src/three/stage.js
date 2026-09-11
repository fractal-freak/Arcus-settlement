/**
 * The 3D stage: renderer, scene, lights, fog.
 *
 * Why this replaced the 2D engine. In two dimensions you can have an
 * undistorted world or you can have a horizon, but not both — a flat
 * projection has nowhere to put the sky, and bending it to make room warps
 * every tile. In three dimensions a perspective camera gives both for nothing,
 * and the sun can be placed cleanly above the terrain.
 *
 * THE KEY LIGHT HOLDS AT 45°. Sky time still controls brightness and colour,
 * while the fixed elevation keeps the daylight read stable and the shadow
 * pattern useful at every time of day.
 */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, FogExp2,
  DirectionalLight, HemisphereLight, AmbientLight,
  PCFSoftShadowMap, ACESFilmicToneMapping, SRGBColorSpace, Vector3,
} from 'three';

const WORLD_UP = new Vector3(0, 1, 0);

const DEG = Math.PI / 180;
const SUN_ELEVATION = 45 * DEG;

/** Warm noon, cool night, and the amber that only happens near the horizon. */
const SUN_HIGH = new Color(0xfff3d6);
const SUN_LOW = new Color(0xff9b52);
const SKY_DAY = new Color(0x87ceeb);
const SKY_NIGHT = new Color(0x1b2350);
const GROUND_BOUNCE_DAY = new Color(0x6f8f5a);
const GROUND_BOUNCE_NIGHT = new Color(0x232a44);

export class Stage {
  constructor(canvasHost) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.outputColorSpace = SRGBColorSpace;
    canvasHost.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = SKY_DAY.clone();
    // Distance haze, matched to the sky, so far terrain softens into the
    // horizon instead of ending at a hard line.
    this.scene.fog = new FogExp2(SKY_DAY.clone(), 0.0062);

    this.camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 3000);
    this.camera.position.set(34, 26, 34);

    // The sun. Its shadow camera is an orthographic box that has to be kept
    // over whatever the player is looking at, or shadows vanish when you pan.
    this.sun = new DirectionalLight(0xfff3d6, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.04;
    // A softer penumbra. Stylised light does not want a razor edge.
    this.sun.shadow.radius = 2.5;
    this.setShadowExtent(80);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    // Where the sun actually is, held independent of its position. Kept apart
    // on purpose: see the note on followShadow below.
    this.sunDir = new Vector3(0, 1, 0);

    // Fill: sky above, bounce off the grass below. Cheap, and it is what stops
    // shadowed faces reading as black holes in a bright cartoon world. Raised
    // relative to the sun so shade reads as gentle shape, not a stencil cut
    // out of the ground — "too sensitive" was mostly this ratio.
    this.hemi = new HemisphereLight(0x87ceeb, 0x8b6a45, 1.25);
    this.scene.add(this.hemi);
    this.ambient = new AmbientLight(0xffffff, 0.24);
    this.scene.add(this.ambient);

    this.light = 1;
    // A safe default near the town, not a sentinel — applySky can run before
    // the first followShadow call and needs a real point to aim the light at.
    this._shadowAt = new Vector3(0, 1, 0);
    this._shadowMoved = true;   // forces the first followShadow to actually place it
    this._right = new Vector3();
    this._up = new Vector3();
    addEventListener('resize', () => this.resize());
  }

  /** How much ground the shadow map covers. Tight is crisp; wide is soft mush. */
  setShadowExtent(halfSize) {
    const c = this.sun.shadow.camera;
    c.left = -halfSize; c.right = halfSize;
    c.top = halfSize; c.bottom = -halfSize;
    c.updateProjectionMatrix();
    this.shadowExtent = halfSize;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Keep the key light at a stable, warm 45-degree elevation.
   *
   * The real local azimuth still chooses the compass direction. Azimuth is
   * measured north through east, and the world's +Z runs south.
   */
  applySky(sky) {
    const az = sky.sun.az * DEG;
    const horizontal = Math.cos(SUN_ELEVATION);
    // The one place this direction is computed. followShadow reads THIS, never
    // the light's own position — see the note there for why that distinction
    // is the actual fix, not a tidiness preference.
    this.sunDir.set(Math.sin(az) * horizontal, Math.sin(SUN_ELEVATION), -Math.cos(az) * horizontal);
    this.sun.position.copy(this._shadowAt).addScaledVector(this.sunDir, 240);

    const l = sky.light;
    this.light = l;

    // Colour: warm and low near the horizon, pale and high at noon.
    const lowness = Math.max(0, 1 - Math.max(0, sky.sun.alt) / 22);
    this.sun.color.copy(SUN_HIGH).lerp(SUN_LOW, lowness * 0.85);
    this.sun.intensity = 0.12 + 2.15 * l;

    const skyCol = SKY_NIGHT.clone().lerp(SKY_DAY, l);
    this.hemi.color.copy(skyCol);
    this.hemi.groundColor.copy(GROUND_BOUNCE_NIGHT.clone().lerp(GROUND_BOUNCE_DAY, l));
    this.hemi.intensity = 0.28 + 0.55 * l;
    this.ambient.intensity = 0.10 + 0.16 * l;

    this.scene.fog.color.copy(skyCol);
    this.scene.fog.density = 0.010 - 0.0042 * l;
    this.scene.background = skyCol;
  }

  /**
   * Keep the shadow box over the camera's target, and size it to the zoom.
   *
   * Two bugs used to live here together, and either alone was enough to make
   * shadows visibly crawl on a camera that was not moving at all:
   *
   * 1. The light's DIRECTION was read back off its own POSITION from the
   *    previous frame (`sun.position.clone().normalize()`), which is only
   *    ever a stand-in for direction near the world origin. Anywhere else,
   *    `target`'s own magnitude dominates that vector and the "direction"
   *    silently becomes "away from (0,0,0)" instead of the true sun bearing —
   *    and because each frame's result feeds the next, tiny floating-point
   *    error had nothing to damp it out. Fixed by keeping direction in its
   *    own field (`sunDir`, set once in applySky), never derived from a
   *    position.
   * 2. Position and target were rewritten every single frame regardless of
   *    whether anything had moved, at whatever sub-texel offset the camera
   *    happened to be at that instant. A shadow map is a fixed grid over the
   *    lit area; a light re-centred a fraction of a texel apart from one
   *    frame to the next rasterises every edge in a slightly different place,
   *    which reads as shimmer. Fixed with both a movement threshold, so an
   *    idle camera does not touch the light at all, and texel snapping, so a
   *    real move still lands on the same grid the shadow map already uses.
   */
  followShadow(target, distance) {
    const want = Math.max(36, Math.min(200, distance * 0.85));
    if (Math.abs(want - this.shadowExtent) > 6) this.setShadowExtent(want);

    if (!this._shadowMoved && this._shadowAt.distanceToSquared(target) < 0.01) return;
    this._shadowMoved = false;
    this._shadowAt.copy(target);

    // Snap the target onto the shadow map's own texel grid, measured in the
    // light's own right/up plane rather than world X/Z — the light is rarely
    // looking straight down, so a world-space snap would not line up with
    // what the map actually samples.
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.width;
    this._right.crossVectors(WORLD_UP, this.sunDir).normalize();
    if (!Number.isFinite(this._right.x)) this._right.set(1, 0, 0); // sun straight overhead
    this._up.crossVectors(this.sunDir, this._right).normalize();

    const rx = Math.round(target.dot(this._right) / texel) * texel;
    const ry = Math.round(target.dot(this._up) / texel) * texel;
    const rz = target.dot(this.sunDir);
    const snapped = this._right.clone().multiplyScalar(rx)
      .addScaledVector(this._up, ry)
      .addScaledVector(this.sunDir, rz);

    this.sun.target.position.copy(snapped);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(snapped).addScaledVector(this.sunDir, 240);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

export { Vector3 };
