/**
 * The 3D stage: renderer, scene, lights, fog, and now a small post-processing
 * stack for the cel-shaded look.
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
 *
 * Post-processing: RenderPass -> god rays -> bloom -> ink outline -> SMAA ->
 * output. The outline and the god rays both read the SAME depth texture
 * attached to the render target below rather than each paying for their own
 * extra scene pass — sky pixels are exactly the ones nothing was drawn on,
 * so raw depth already tells the god-ray pass where the sun is actually
 * visible, and depth discontinuities already tell the outline pass where a
 * silhouette is, with no separate normal-buffer render needed for either.
 */

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, FogExp2,
  DirectionalLight, HemisphereLight, AmbientLight,
  PCFSoftShadowMap, ACESFilmicToneMapping, SRGBColorSpace, Vector3, Vector2,
  WebGLRenderTarget, DepthTexture, MeshBasicMaterial,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/examples/jsm/postprocessing/FXAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

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

/**
 * Depth-only ink outline. Sobel-style, but on LINEARISED DEPTH rather than
 * colour: a colour-edge filter also draws a line at every biome/vertex-colour
 * seam (the grass/sand blend, every cel band itself), which is noise, not
 * silhouette. Depth only breaks where one object actually stands in front of
 * another, which is what an ink outline is supposed to trace. The threshold
 * is scaled by the sample's own depth because a fixed world-space gap covers
 * fewer and fewer screen pixels the further away it is — unscaled, a distant
 * hillside silhouette either never triggers or a nearby one triggers on
 * texture noise, there is no one fixed number that gets both right.
 */
const outlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    resolution: { value: new Vector2(1, 1) },
    cameraNear: { value: 0.5 },
    cameraFar: { value: 3000 },
    outlineColor: { value: new Color(0x1a1712) },
    outlineThreshold: { value: 1.1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec3 outlineColor;
    uniform float outlineThreshold;
    varying vec2 vUv;
    float linearDepth(float z) {
      float ndc = z * 2.0 - 1.0;
      return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - ndc * (cameraFar - cameraNear));
    }
    void main() {
      vec2 texel = 1.0 / resolution;
      float d0 = linearDepth(texture2D(tDepth, vUv).x);
      float dx1 = linearDepth(texture2D(tDepth, vUv + vec2(texel.x, 0.0)).x);
      float dx2 = linearDepth(texture2D(tDepth, vUv - vec2(texel.x, 0.0)).x);
      float dy1 = linearDepth(texture2D(tDepth, vUv + vec2(0.0, texel.y)).x);
      float dy2 = linearDepth(texture2D(tDepth, vUv - vec2(0.0, texel.y)).x);
      float edge = abs(dx1 - d0) + abs(dx2 - d0) + abs(dy1 - d0) + abs(dy2 - d0);
      float edgeThresh = outlineThreshold * d0 * 0.01;
      float ink = smoothstep(edgeThresh, edgeThresh * 2.2, edge);
      vec4 color = texture2D(tDiffuse, vUv);
      gl_FragColor = vec4(mix(color.rgb, outlineColor, ink), color.a);
    }
  `,
};

/**
 * Warm sun shafts, screen-space. No sky-dome geometry involved on purpose —
 * one was tried earlier for a gradient sky and pulled back out after Kevin
 * reported "a weird foggy film," because its own horizon colour could never
 * be made to match FogExp2's colour exactly and the mismatch showed as a
 * seam (see sky3d.js). Rays here are computed from the depth texture instead:
 * a pixel nothing was drawn on still holds the GL clear depth (the far
 * plane), which is already a perfect "is the sun actually visible from here"
 * mask with no extra render and no dome to go out of sync with the fog again.
 */
const godRayShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    lightScreenPos: { value: new Vector2(0.5, 0.5) },
    rayColor: { value: new Color(0xfff2d0) },
    rayStrength: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 lightScreenPos;
    uniform vec3 rayColor;
    uniform float rayStrength;
    varying vec2 vUv;
    #define NUM_SAMPLES 12
    void main() {
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      if (rayStrength <= 0.001) { gl_FragColor = vec4(base, 1.0); return; }
      vec2 deltaUv = (vUv - lightScreenPos) * (0.9 / float(NUM_SAMPLES));
      vec2 uv = vUv;
      float illum = 1.0;
      float accum = 0.0;
      for (int i = 0; i < NUM_SAMPLES; i++) {
        uv -= deltaUv;
        float sky = smoothstep(0.9993, 1.0, texture2D(tDepth, uv).x);
        accum += sky * illum;
        illum *= 0.94;
      }
      accum /= float(NUM_SAMPLES);
      gl_FragColor = vec4(base + rayColor * accum * rayStrength, 1.0);
    }
  `,
};

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
    // Distance haze, matched to the sky, so far terrain softens into the
    // horizon instead of ending at a hard line. Density raised on request —
    // a shorter effective view distance is what makes distant ground melt
    // into the sky rather than just visibly lightening toward it, which is
    // most of the difference between "hazy golden-hour atmosphere" and
    // "clear day with fog switched on."
    this.scene.fog = new FogExp2(FOG_WARM.clone(), 0.009);

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

    this._buildComposer();
    addEventListener('resize', () => this.resize());
  }

  /**
   * The post-processing stack.
   *
   * Depth for the outline and god-ray passes comes from a SEPARATE render
   * target (`depthTarget`), filled by its own explicit render() call every
   * frame — not from the composer's own colour ping-pong buffers. The first
   * version of this reused one of those buffers for depth directly (cheaper:
   * no second render call) and threw a real, repeatable WebGL error —
   * "Feedback loop formed between Framebuffer and active Texture" — because
   * EffectComposer alternates which buffer is being WRITTEN each pass, and
   * sooner or later that buffer is the exact one a later pass is also trying
   * to SAMPLE from for `tDepth`, which WebGL correctly refuses: you cannot
   * read an attachment of the framebuffer you are currently drawing into.
   * three.js's own SSAOPass hits this same need and solves it the same way
   * — a dedicated target, rendered separately — which is the tell that this
   * is not a shortcut worth re-attempting, just a real second draw of the
   * scene. `overrideMaterial` with colorWrite off keeps that draw cheap: it
   * still walks every real mesh (instancing included) to get correct depth,
   * it just skips every toon/water/grass fragment shader while doing it.
   */
  _buildComposer() {
    const { w, h } = this._drawingSize();

    this.depthTarget = new WebGLRenderTarget(w, h, {
      depthTexture: new DepthTexture(w, h),
      depthBuffer: true,
    });
    this._depthOnlyMaterial = new MeshBasicMaterial({ colorWrite: false });

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.godRayPass = new ShaderPass(godRayShader);
    this.godRayPass.uniforms.tDepth.value = this.depthTarget.depthTexture;
    this.composer.addPass(this.godRayPass);

    // Kept deliberately gentle — a soft glow on sunlit edges and water, not a
    // wash over the whole frame. Earlier work in this file already learned
    // that lesson once with cloud opacity; bloom is the same trap at a
    // bigger scale if the strength is left at a library's realistic default.
    // The resolution passed in is a QUARTER of the real drawing buffer on
    // purpose: bloom is a soft blur by nature, its own internal mip chain
    // downsamples further from here regardless, and measured real frame
    // time — median 20.6ms with 58% of frames over the 16.7ms budget at
    // full res — only came down to something reasonable once this, the
    // god-ray sample count, and SMAA (see the note below) all gave up
    // resolution or sample count they did not visibly need.
    // strength 0.55, radius 0.6, threshold 0.85 — asked for a more visible
    // painterly halo on sunlight and water than the first pass of this had;
    // resolution stays quartered (see the note above the size line below),
    // since that is what performance actually measured against, not these.
    this.bloom = new UnrealBloomPass(new Vector2(Math.round(w / 4), Math.round(h / 4)), 0.55, 0.6, 0.85);
    this.composer.addPass(this.bloom);

    this.outlinePass = new ShaderPass(outlineShader);
    this.outlinePass.uniforms.tDepth.value = this.depthTarget.depthTexture;
    this.outlinePass.uniforms.resolution.value.set(w, h);
    this.outlinePass.uniforms.cameraNear.value = this.camera.near;
    this.outlinePass.uniforms.cameraFar.value = this.camera.far;
    this.composer.addPass(this.outlinePass);

    // FXAA over SMAA — the ask named either as acceptable ("SMAAPass /
    // FXAAPass"). SMAA looks a little cleaner but is a three-pass technique
    // (edge detection, blend weights, neighbourhood blend); FXAA is one
    // pass. On a scene already paying for a depth pre-pass, god rays, bloom
    // and an outline pass every frame, the cheaper of two options the ask
    // itself offered was the right call, confirmed against measured timing.
    this.composer.addPass(new FXAAPass());
    this.composer.addPass(new OutputPass());

    this._sunFar = new Vector3();
    this._ndc = new Vector3();
  }

  /** The cheap depth-only pre-pass described above. */
  _renderDepth() {
    this.scene.overrideMaterial = this._depthOnlyMaterial;
    this.camera.layers.disable(1); // exclude the fallback floor — see its own constructor note
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.render(this.scene, this.camera);
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

  /**
   * The renderer's real drawing-buffer size — CSS size times device pixel
   * ratio. `renderer.setSize`/`composer.setSize` take CSS pixels and scale
   * internally on their own; a plain `WebGLRenderTarget` (depthTarget below)
   * does not, so sizing it off `window.innerWidth` directly left it at HALF
   * the composer's actual resolution on this 2x display — confirmed live
   * (devicePixelRatio 2, depthTarget.width 1280 against an actual 2560-pixel
   * drawing buffer). The outline pass's texel offsets were then computed for
   * a buffer four times smaller than the one they were reading, which turned
   * ordinary texel noise into what looked like a depth discontinuity on
   * nearly every pixel — not a thin ink line at real silhouettes, the entire
   * frame darkening toward outlineColor at once. Any code sizing a manual
   * render target has to multiply by this itself; nothing does it for you.
   */
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
    // composer.setSize() already calls .setSize() on every pass it holds,
    // FXAA included — sized correctly to the real drawing buffer with no
    // help needed here. Bloom is the one exception: composer.setSize would
    // hand it that same full resolution, quietly undoing the half-res
    // construction-time choice the moment a window resize ever fired. The
    // explicit call right after puts it back.
    this.composer.setSize(w, h);
    const d = this._drawingSize();
    this.bloom.setSize(Math.round(d.w / 4), Math.round(d.h / 4));
    this.outlinePass.uniforms.resolution.value.set(d.w, d.h);
    this.depthTarget.setSize(d.w, d.h);
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

    // The sky itself, not just the light: cool blue when the sun sits high,
    // golden when it is low — the SAME lowness number driving everything
    // else here, so a low sun always means the whole atmosphere warms, not
    // just a tinted highlight dropped on an otherwise-unchanged blue sky.
    const horizon = FOG_COOL.clone().lerp(FOG_WARM, lowness);
    const skyCol = SKY_NIGHT.clone().lerp(horizon, l);
    this.hemi.color.copy(skyCol);
    this.hemi.groundColor.copy(GROUND_BOUNCE_NIGHT.clone().lerp(GROUND_BOUNCE_DAY, l));
    this.hemi.intensity = 0.28 + 0.55 * l;
    this.ambient.intensity = 0.10 + 0.16 * l;

    this.scene.fog.color.copy(skyCol);
    this._fogBase = 0.013 - 0.004 * l;
    this.scene.fog.density = this._fogBase * this._fogZoomFactor();
    this.scene.background = skyCol;

    // Warm at low sun (dawn/dusk shafts), fading out near straight overhead
    // where real god rays would not read as directional anyway.
    this.godRayPass.uniforms.rayColor.value.copy(SUN_HIGH).lerp(SUN_LOW, lowness);
    this._rayBaseStrength = (0.05 + lowness * 0.16) * l;
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
    const strength = inFront ? (this._rayBaseStrength ?? 0) * this._fogZoomFactor() : 0;
    this.godRayPass.uniforms.rayStrength.value = strength;
    if (strength > 0) {
      this.godRayPass.uniforms.lightScreenPos.value.set(
        (this._ndc.x + 1) / 2,
        (this._ndc.y + 1) / 2,
      );
    }
  }

  /**
   * How much of the base fog density to actually apply, given how far out the
   * camera has pulled.
   *
   * FogExp2 thickens with DISTANCE, so a density tuned to give a pleasant haze
   * at walking height turns the whole settlement into a white sheet the moment
   * the camera pulls back — which is exactly what zooming out was doing. The
   * haze is worth keeping up close, where it gives the valley depth, so rather
   * than thinning it everywhere the density is eased down as the camera
   * retreats. Near the ground it is untouched; far out it drops to a quarter,
   * enough to still soften the horizon without hiding the town.
   */
  _fogZoomFactor() {
    const d = this.camera.position.y;
    // Ramps over the range people actually zoom through, not a long lazy
    // slope out to the stratosphere. The first version spread the falloff
    // over 130 units of camera height, so at a normal pulled-back view it had
    // thinned the haze by under a fifth — which is why it still looked as
    // foggy as before. It is most of the way thinned by the time the camera
    // is sixty up, and holds a little haze past that to soften the far edge of
    // the streamed world. Tuned twice: the first two attempts both ramped too
    // slowly and had barely touched the haze at the height people actually
    // pull back to, which is why it still looked exactly as foggy as before.
    const t = Math.min(1, Math.max(0, (d - 14) / 44));
    return 1 - t * 0.82;
  }

  render() {
    // Re-evaluated every frame because it follows the CAMERA, not the sun;
    // applySky only runs when the sky itself changes.
    if (this._fogBase && this.scene.fog) {
      this.scene.fog.density = this._fogBase * this._fogZoomFactor();
    }
    this.renderer.info.reset();
    this._renderDepth();
    this._updateGodRays();
    this.composer.render();
  }
}

export { Vector3 };
