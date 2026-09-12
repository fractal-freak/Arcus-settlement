/** Environment reflections and depth-occluded, ray-marched dust shafts at palace windows. */
import {DataTexture,RGBAFormat,FloatType,EquirectangularReflectionMapping,PMREMGenerator,Mesh,BoxGeometry,ShaderMaterial,Vector3,Matrix4,Color,BackSide,AdditiveBlending,Vector2} from 'three';
import {GLASS} from '../app/enchantment.js';
export class PalaceLighting {
  constructor(stage){
    this.stage=stage;this.volumes=[];
    const width=128,height=64,pixels=new Float32Array(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const t=y/(height-1),i=(y*width+x)*4,sky=t<.5;
      const sun=Math.exp(-((x-88)**2+(y-19)**2)/5)*9;
      pixels[i]=(sky?.32+.48*t:.16)+sun;pixels[i+1]=(sky?.46+.48*t:.19)+sun*.85;pixels[i+2]=(sky?.7+.35*t:.14)+sun*.65;pixels[i+3]=1;
    }
    const map=new DataTexture(pixels,width,height,RGBAFormat,FloatType);map.mapping=EquirectangularReflectionMapping;map.needsUpdate=true;
    const pmrem=new PMREMGenerator(stage.renderer);this.environment=pmrem.fromEquirectangular(map);stage.scene.environment=this.environment.texture;map.dispose();pmrem.dispose();
    for(const [i,g] of GLASS.entries()){
      const material=new ShaderMaterial({transparent:true,depthWrite:false,side:BackSide,blending:AdditiveBlending,
        uniforms:{sceneDepth:{value:stage.depthTarget.depthTexture},resolution:{value:new Vector2()},cameraLocal:{value:new Vector3()},clock:{value:0},tint:{value:new Color([0x8e9dcf,0xc69a7b,0x8db8ad,0xa796c8][i])}},
        vertexShader:`varying vec3 localPoint;void main(){localPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`uniform mat4 projectionMatrix;uniform mat4 modelViewMatrix;uniform sampler2D sceneDepth;uniform vec2 resolution;uniform vec3 cameraLocal;uniform vec3 tint;uniform float clock;varying vec3 localPoint;
          void main(){
            vec3 direction=normalize(localPoint-cameraLocal),inverse=1./direction;
            vec3 ta=(-vec3(.5)-cameraLocal)*inverse,tb=(vec3(.5)-cameraLocal)*inverse;
            vec3 lo=min(ta,tb),hi=max(ta,tb);float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));
            if(end<=start)discard;float light=0.;
            float depth=texture2D(sceneDepth,gl_FragCoord.xy/resolution).x;
            for(int i=0;i<24;i++){
              vec3 p=cameraLocal+direction*(start+(float(i)+.5)/24.*(end-start));
              vec4 projected=projectionMatrix*modelViewMatrix*vec4(p,1.);
              float sampleDepth=projected.z/projected.w*.5+.5;
              float spread=.13+(p.z+.5)*.32;
              float axisY=.30-(p.z+.5)*.55;
              float beam=1.-smoothstep(spread*.4,spread,length(vec2(p.x,(p.y-axisY)*.8)));
              float dust=.7+.3*sin(p.x*47.+p.y*29.+p.z*38.+clock*.3);
              if(sampleDepth<depth+.00002)light+=beam*dust;
            }
            float amount=light/24.*(end-start)*.13;gl_FragColor=vec4(tint*amount,1.);
          }`});
      const mesh=new Mesh(new BoxGeometry(1,1,1),material);mesh.position.set(g.x,g.y-.6,g.z+4.3);mesh.scale.set(2.5,5.8,8.4);mesh.layers.set(1);mesh.frustumCulled=true;stage.depthUsers.push(mesh);stage.scene.add(mesh);this.volumes.push(mesh);
    }
    this.inverse=new Matrix4();
  }
  tick(seconds){for(const mesh of this.volumes){mesh.updateMatrixWorld();this.inverse.copy(mesh.matrixWorld).invert();const u=mesh.material.uniforms;u.cameraLocal.value.copy(this.stage.camera.position).applyMatrix4(this.inverse);u.resolution.value.set(this.stage.depthTarget.width,this.stage.depthTarget.height);u.clock.value=seconds;}}
}
