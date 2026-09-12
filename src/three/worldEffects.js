/** One full-resolution composite: antialiasing, contact shade, rays, glow and display output. */
import { Color, HalfFloatType, Matrix4, ShaderMaterial, Vector2, WebGLRenderTarget } from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { contactShadowGLSL } from './contactShadows.js';

const vertexShader = FXAAShader.vertexShader;
const fxaa = FXAAShader.fragmentShader.slice(0, FXAAShader.fragmentShader.lastIndexOf('void main()'));
const blurShader = `
  uniform sampler2D source; uniform vec2 direction; uniform float threshold;
  varying vec2 vUv;
  vec3 bright(vec2 uv) {
    vec3 c = texture2D(source, uv).rgb;
    if (threshold < 0.) return c;
    float luminance = dot(c, vec3(.299,.587,.114));
    return c * smoothstep(threshold, threshold + .01, luminance);
  }
  void main() {
    vec3 c = bright(vUv) * .227027;
    c += (bright(vUv + direction * 1.384615) + bright(vUv - direction * 1.384615)) * .316216;
    c += (bright(vUv + direction * 3.230769) + bright(vUv - direction * 3.230769)) * .070270;
    gl_FragColor = vec4(c, 1.);
  }
`;

export class WorldEffectsPass extends Pass {
  constructor(depthTexture) {
    super();
    this.uniforms = {
      tDiffuse: { value: null }, tDepth: { value: depthTexture }, tBloom: { value: null },
      resolution: { value: new Vector2() }, aoResolution: { value: new Vector2() },
      inverseProjection: { value: new Matrix4() }, projection: { value: new Matrix4() },
      radius: { value: .75 }, strength: { value: .72 },
      lightScreenPos: { value: new Vector2(.5,.5) }, rayColor: { value: new Color(0xfff2d0) },
      rayStrength: { value: 0 }, bloomStrength: { value: .12 }, toneMappingExposure: { value: 1.08 },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms, vertexShader, toneMapped: false, depthTest: false, depthWrite: false,
      fragmentShader: `${fxaa}
        uniform sampler2D tBloom;
        uniform vec2 lightScreenPos; uniform vec3 rayColor; uniform float rayStrength;
        uniform float bloomStrength;
        #include <tonemapping_pars_fragment>
        ${contactShadowGLSL}
        void main() {
          vec3 color = ApplyFXAA(tDiffuse, resolution, vUv).rgb * contactShade(vUv);
          if (rayStrength > .001) {
            vec2 deltaUv = (vUv - lightScreenPos) * (.9 / 12.);
            vec2 uv = vUv; float illum = 1.; float accum = 0.;
            for (int i = 0; i < 12; i++) {
              uv -= deltaUv;
              accum += smoothstep(.9993, 1., texture2D(tDepth, uv).r) * illum;
              illum *= .94;
            }
            color += rayColor * accum * rayStrength / 12.;
          }
          color += texture2D(tBloom, vUv).rgb * bloomStrength;
          gl_FragColor = sRGBTransferOETF(vec4(ACESFilmicToneMapping(color), 1.));
        }
      `,
    });
    this.blurMaterial = new ShaderMaterial({ vertexShader, fragmentShader: blurShader,
      uniforms: { source: { value: null }, direction: { value: new Vector2() }, threshold: { value: 1.15 } },
      toneMapped: false, depthTest: false, depthWrite: false });
    this.glowA = new WebGLRenderTarget(1, 1, { type: HalfFloatType, depthBuffer: false });
    this.glowB = this.glowA.clone();
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(w,h) {
    this.uniforms.resolution.value.set(1/w,1/h);
    this.uniforms.aoResolution.value.set(w,h);
    // Only the soft glow is low resolution. Scene colour and antialiasing remain native.
    this.glowA.setSize(Math.max(1,Math.round(w/8)),Math.max(1,Math.round(h/8)));
    this.glowB.setSize(this.glowA.width,this.glowA.height);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.blurMaterial.uniforms;
    this.quad.material = this.blurMaterial;
    u.source.value = readBuffer.texture;
    u.threshold.value = 1.15;
    u.direction.value.set(1/this.glowA.width,0);
    renderer.setRenderTarget(this.glowA); this.quad.render(renderer);
    u.source.value = this.glowA.texture;
    u.threshold.value = -1;
    u.direction.value.set(0,1/this.glowA.height);
    renderer.setRenderTarget(this.glowB); this.quad.render(renderer);
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tBloom.value = this.glowB.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    this.quad.material = this.material;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.glowA.dispose(); this.glowB.dispose(); this.material.dispose(); this.blurMaterial.dispose(); this.quad.dispose();
  }
}
