/** Scene lighting and a restrained depth-rays, bloom, antialiasing and output stack. */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, Fog,
  DirectionalLight, HemisphereLight, AmbientLight,
  PCFShadowMap, ACESFilmicToneMapping, SRGBColorSpace, Vector3, Vector2, Frustum, Matrix4,
  WebGLRenderTarget, DepthTexture, MeshBasicMaterial,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { WorldEffectsPass } from './worldEffects.js';

const WORLD_UP = new Vector3(0, 1, 0);

const DEG = Math.PI / 180;
// Was 45°, held fixed on purpose so the light read the same at every time of
// day. Dropped to a genuine golden-hour angle on request, for the long soft
// shadows a high sun can never cast — derived from the literal vector asked
// for (Y 25, X 50, Z 50): elevation = asin(25 / len(50,25,50)) = asin(1/3) ≈
// 19.5°. Azimuth still comes from the real compass direction the sky feed
// reports, same as before — only how HIGH the sun sits is fixed, never which
// way it faces, so a hardcoded X/Z ratio would have fought that for no
// reason the reference images actually needed.
const SUN_ELEVATION = 19.5 * DEG;

/** Warm noon, cool night, and the amber that only happens near the horizon. */
const SUN_HIGH = new Color(0xfff3d6);
const SUN_LOW = new Color(0xff9b52);
// The sky/fog colour itself now blends between these on the SAME "how low is
// the sun" number everything else already uses (`lowness`), rather than a
// single fixed SKY_DAY — a golden-hour sun wants a golden-hour sky around
// it, not a blue noon one with only the light itself recoloured.
const FOG_COOL = new Color(0xaaccff);   // sun high, or nearly night
const FOG_WARM = new Color(0xe8dbb5);   // sun low — the actual golden-hour case, now the default
const SKY_NIGHT = new Color(0x1b2350);
const GROUND_BOUNCE_DAY = new Color(0x6f8f5a);
const GROUND_BOUNCE_NIGHT = new Color(0x232a44);

export class Stage {
  constructor(canvasHost) {
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.transmissionResolutionScale = 0.5;
    this.depthUsers = [];
    this._frustum = new Frustum();
    this._viewProjection = new Matrix4();
    this._lastShadowTime = -Infinity;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = SRGBColorSpace;
    // info.render normally resets at the start of every renderer.render()
    // call — fine when there was exactly one per frame, but render() below
    // now makes several (a depth pre-pass, then one per composer pass).
    // Left on auto, stats() would report only whatever the LAST internal
    // pass happened to draw (an EffectComposer pass is a single full-screen
    // triangle), not the real scene. Reset once ourselves at the top of
    // render() instead, so the count accumulates across the whole frame.
    this.renderer.info.autoReset = false;
    canvasHost.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.background = FOG_WARM.clone();
    // Linear haze, not a uniform film. Exponential fog sat on the whole
    // valley at once; this stays clear underfoot and takes over with distance,
    // the way distant hills go pale before they disappear. Near/far are set
    // from the camera distance in followShadow, so a close look still has
    // country in the back, and a high look does not milk the town.
    this.scene.fog = new Fog(FOG_WARM.clone(), 110, 210);

    this.camera = new PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.5, 3000);
    this.camera.position.set(34, 26, 34);
    // Layer 0 (default) plus layer 1 — layer 1 is only the terrain's fallback
    // floor plane (see Terrain3D's constructor). Seeing both here is what
    // keeps the floor showing normally in the real colour render; the depth
    // pre-pass below drops layer 1 for just its one render call instead.
    this.camera.layers.enable(1);

    // The sun. Its shadow camera is an orthographic box that has to be kept
    // over whatever the player is looking at, or shadows vanish when you pan.
    this.sun = new DirectionalLight(0xfff3d6, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 400;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.025;
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

    this._buildComposer();
    addEventListener('resize', () => this.resize());
  }

  /** A separate depth target avoids reading from the composer's active framebuffer. */
  _buildComposer() {
    const { w, h } = this._drawingSize();

    this.depthTarget = new WebGLRenderTarget(w, h, {
      depthTexture: new DepthTexture(w, h),
      depthBuffer: true,
    });
    this._depthOnlyMaterial = new MeshBasicMaterial({ colorWrite: false });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.effects = new WorldEffectsPass(this.depthTarget.depthTexture);
    this.composer.addPass(this.effects);
    this.contactShadows = this.effects;
    this.godRayPass = this.effects;

    this._sunFar = new Vector3();
    this._ndc = new Vector3();
  }

  /** The cheap depth-only pre-pass described above. */
  _renderDepth() {
    this.scene.overrideMaterial = this._depthOnlyMaterial;
    this.camera.layers.disable(1); // exclude the fallback floor — see its own constructor note
    const shadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    const shadowNeedsUpdate = this.renderer.shadowMap.needsUpdate;
    this.renderer.shadowMap.needsUpdate = false;
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.shadowMap.autoUpdate = shadowAutoUpdate;
    this.renderer.shadowMap.needsUpdate = shadowNeedsUpdate;
    this.camera.layers.enable(1);
    this.scene.overrideMaterial = null;
    this.renderer.setRenderTarget(null);
  }

  /** How much ground the shadow map covers. Tight is crisp; wide is soft mush. */
  setShadowExtent(halfSize) {
    const c = this.sun.shadow.camera;
    c.left = -halfSize; c.right = halfSize;
    c.top = halfSize; c.bottom = -halfSize;
    c.updateProjectionMatrix();
    this.shadowExtent = halfSize;
  }

  /** Manual render targets need physical pixels, unlike composer.setSize(). */
  _drawingSize() {
    const ratio = this.renderer.getPixelRatio();
    // Guarded to never return zero: seen live in one embedding where
    // window.innerWidth/innerHeight both read 0 (screen dimensions were
    // still real, only the viewport read empty — some host had not laid the
    // page out yet). renderer.setSize(0,0) degrades quietly; a manually
    // created WebGLRenderTarget at 0x0 does not — it throws a real
    // "Framebuffer is incomplete: Attachment has zero size" on every draw
    // until the next real resize() call fixes it. A 1x1 floor costs nothing
    // and means a stray zero read is never fatal, only briefly wrong.
    return {
      w: Math.max(1, Math.round(window.innerWidth * ratio)),
      h: Math.max(1, Math.round(window.innerHeight * ratio)),
    };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const d = this._drawingSize();
    this.depthTarget.setSize(d.w, d.h);
  }

  /**
   * Keep the key light at its stable, low elevation.
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
    // Keep sunlight below clipping so rough materials retain their detail.
    this.sun.intensity = 0.10 + 1.52 * l;

    // The sky itself, not just the light: cool blue when the sun sits high,
    // golden when it is low — the SAME lowness number driving everything
    // else here, so a low sun always means the whole atmosphere warms, not
    // just a tinted highlight dropped on an otherwise-unchanged blue sky.
    const horizon = FOG_COOL.clone().lerp(FOG_WARM, lowness);
    const skyCol = SKY_NIGHT.clone().lerp(horizon, l);
    this.hemi.color.copy(skyCol);
    this.hemi.groundColor.copy(GROUND_BOUNCE_NIGHT.clone().lerp(GROUND_BOUNCE_DAY, l));
    this.hemi.intensity = 0.28 + 0.77 * l;
    this.ambient.intensity = 0.06 + 0.14 * l;

    this.scene.fog.color.copy(skyCol);
    // How much of the far country the haze is allowed to take. Night and
    // golden hour sit closer; noon leaves more of the hills readable.
    this._haze = l;
    this.scene.background = skyCol;

    // Warm at low sun (dawn/dusk shafts), fading out near straight overhead
    // where real god rays would not read as directional anyway.
    this.godRayPass.uniforms.rayColor.value.copy(SUN_HIGH).lerp(SUN_LOW, lowness);
    this._rayBaseStrength = (0.025 + lowness * 0.07) * l;
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
    const haze = this._haze ?? 1;
    // Keep the focus and another 60 units clear at every zoom. Only the
    // distant country fades; night shortens that fade, not the clear area.
    this.scene.fog.near = distance + 60;
    this.scene.fog.far = this.scene.fog.near + 100 * (0.80 + 0.20 * haze);
    const want = Math.max(36, Math.min(200, distance * 0.85));
    if (Math.abs(want - this.shadowExtent) > 6) this.setShadowExtent(want);

    if (!this._shadowMoved && this._shadowAt.distanceToSquared(target) < 0.01) return;
    this._shadowMoved = false;
    this._shadowAt.copy(target);
    this._shadowInvalidated = true;

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

  /**
   * Where the sun sits on screen right now, for the god-ray pass — projected
   * from a point far along the real sun direction, not the (much closer)
   * light object itself, so the rays keep pointing the right way regardless
   * of shadow-camera distance. Strength fades to zero once the sun would be
   * behind the camera, or near-behind it, rather than let a radial blur
   * centred off the back of the screen smear the whole image.
   */
  _updateGodRays() {
    this._sunFar.copy(this.camera.position).addScaledVector(this.sunDir, 600);
    this._ndc.copy(this._sunFar).project(this.camera);
    const inFront = this._ndc.z < 1;
    // Rays fade out with the same zoom the fog does. They are a near-ground
    // effect: from high up the shafts have nothing to graze past and just
    // bloom into a white smear over the middle of the map, which was half of
    // what made a zoomed-out view hard to read.
    const strength = inFront ? (this._rayBaseStrength ?? 0) : 0;
    this.godRayPass.uniforms.rayStrength.value = strength;
    if (strength > 0) {
      this.godRayPass.uniforms.lightScreenPos.value.set(
        (this._ndc.x + 1) / 2,
        (this._ndc.y + 1) / 2,
      );
    }
  }

  /** Distant glazing keeps its authored texture without a second whole-scene refraction pass. */
  prepareDetail() {
    if (!this._glazing) {
      this._glazing = [];
      this.scene.traverse(mesh => {
        const material = mesh.material;
        if (!mesh.isMesh || !material?.isMeshPhysicalMaterial || !material.transmission) return;
        const distant = material.clone();
        distant.transmission = 0;
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
        this._glazing.push({ mesh, near: material, distant, center: new Vector3() });
      });
    }
    for (const glass of this._glazing) {
      glass.mesh.updateWorldMatrix(true, false);
      glass.center.copy(glass.mesh.geometry.boundingSphere.center).applyMatrix4(glass.mesh.matrixWorld);
      const distance = glass.center.distanceTo(this.camera.position);
      if (distance > 48) glass.mesh.material = glass.distant;
      else if (distance < 40) glass.mesh.material = glass.near;
    }
  }

  render(elapsedMs = performance.now()) {
    this.renderer.info.reset();
    this.camera.updateMatrixWorld();
    this._updateGodRays();
    this._viewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._viewProjection);
    const needsDepth = this.contactShadows?.enabled || this.godRayPass.uniforms.rayStrength.value > 0.001 ||
      this.depthUsers.some(mesh => mesh.visible && this._frustum.intersectsObject(mesh));
    if (needsDepth) this._renderDepth();
    if (this.contactShadows) {
      const u = this.contactShadows.uniforms;
      u.inverseProjection.value.copy(this.camera.projectionMatrixInverse);
      u.projection.value.copy(this.camera.projectionMatrix);
      u.aoResolution.value.set(this.depthTarget.width, this.depthTarget.height);
    }
    if (elapsedMs - this._lastShadowTime >= 50 || this._shadowInvalidated) {
      this.renderer.shadowMap.needsUpdate = true;
      this._lastShadowTime = elapsedMs;
      this._shadowInvalidated = false;
    }
    this.composer.render();
  }

}

export { Vector3 };
