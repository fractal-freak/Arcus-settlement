/** A ray-marched turbulent flame, with no visible polygonal flame shell. */
import {Group,Mesh,BoxGeometry,SphereGeometry,TorusGeometry,ShaderMaterial,MeshStandardMaterial,PointLight,Color,Vector3,Matrix4,BackSide,AdditiveBlending,CanvasTexture,Sprite,SpriteMaterial} from 'three';
let sparkTexture;
function glowTexture(){
  if(sparkTexture)return sparkTexture;
  const c=document.createElement('canvas');c.width=c.height=32;
  const ctx=c.getContext('2d'),g=ctx.createRadialGradient(16,16,0,16,16,16);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.9)');g.addColorStop(.55,'rgba(255,255,255,.15)');g.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);
  return sparkTexture=new CanvasTexture(c);
}
export class ArcaneFire3D {
  constructor(spec){
    this.group=new Group();this.group.position.set(spec.x,spec.y,spec.z);this.group.name='Turbulent arcane brazier';
    const metal=new MeshStandardMaterial({color:0x252c31,metalness:.82,roughness:.36});
    const bowl=new Mesh(new SphereGeometry(.5,48,24,0,Math.PI*2,Math.PI/2,Math.PI/2),metal);bowl.castShadow=true;bowl.receiveShadow=true;this.group.add(bowl);
    const rim=new Mesh(new TorusGeometry(.49,.036,10,64),metal);rim.rotation.x=Math.PI/2;this.group.add(rim);
    const coals=new Mesh(new SphereGeometry(.42,32,12),new MeshStandardMaterial({color:0x182526,roughness:.9,emissive:spec.color,emissiveIntensity:.35}));coals.scale.y=.18;coals.position.y=-.10;this.group.add(coals);
    this.material=new ShaderMaterial({transparent:true,depthWrite:false,side:BackSide,blending:AdditiveBlending,toneMapped:false,
      uniforms:{clock:{value:0},eye:{value:new Vector3()},tint:{value:new Color(spec.color)}},
      vertexShader:`varying vec3 localPoint;void main(){localPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 eye;uniform vec3 tint;uniform float clock;varying vec3 localPoint;
        float hash(vec3 p){p=fract(p*.3183099+vec3(.11,.37,.73));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
        float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
        float turbulence(vec3 p){return noise(p)*.58+noise(p*2.07+4.1)*.28+noise(p*4.13)*.14;}
        void main(){
          vec3 ray=normalize(localPoint-eye),inv=1./ray;
          vec3 ta=(-vec3(.5)-eye)*inv,tb=(vec3(.5)-eye)*inv,lo=min(ta,tb),hi=max(ta,tb);
          float start=max(0.,max(lo.x,max(lo.y,lo.z))),end=min(hi.x,min(hi.y,hi.z));if(end<=start)discard;
          vec3 radiance=vec3(0);float transmittance=1.;
          for(int i=0;i<36;i++){
            vec3 p=eye+ray*(start+(float(i)+.5)/36.*(end-start));float y=p.y+.5;
            vec3 flow=vec3(p.x*5.,y*3.8-clock*1.25,p.z*5.);
            float n=turbulence(flow),curl=turbulence(flow*.72+vec3(clock*.14,0,9.));
            vec2 warped=p.xz+vec2(sin(y*9.-clock*2.2),cos(y*8.+clock*1.7))*(.018+y*.065);
            float radius=.3*pow(1.-y,.8)+.006;
            float edge=1.-smoothstep(radius*.18,radius,length(warped));
            float tongues=smoothstep(.25+y*.27,.63,n+curl*.13);
            float density=edge*tongues*smoothstep(.04,.16,y)*(1.-smoothstep(.82,1.,y));
            float core=(1.-smoothstep(.025,.13,length(warped)))*(1.-smoothstep(.2,.65,y));
            float alpha=1.-exp(-density*(end-start)*.28);
            vec3 heat=mix(tint*2.1,vec3(2.8,3.2,3.1),core*.85);
            radiance+=transmittance*alpha*heat;transmittance*=1.-alpha;
          }
          gl_FragColor=vec4(radiance,1.);
        }`});
    this.volume=new Mesh(new BoxGeometry(1,1,1),this.material);this.volume.position.y=.66;this.volume.scale.set(1.15,1.8,1.15);this.volume.layers.set(1);this.group.add(this.volume);
    this.light=new PointLight(spec.color,6.5,6,2);this.light.position.y=.3;this.group.add(this.light);
    this.sparks=[];
    for(let i=0;i<12;i++){
      const sprite=new Sprite(new SpriteMaterial({map:glowTexture(),color:spec.color,transparent:true,depthWrite:false,blending:AdditiveBlending,toneMapped:false}));sprite.layers.set(1);this.group.add(sprite);this.sparks.push(sprite);
    }
    this.inverse=new Matrix4();this.phase=spec.x*.37;
    this.volume.onBeforeRender=(renderer,scene,camera)=>{this.inverse.copy(this.volume.matrixWorld).invert();this.material.uniforms.eye.value.copy(camera.position).applyMatrix4(this.inverse);};
  }
  tick(t){
    const time=t+this.phase;this.material.uniforms.clock.value=time;
    this.light.intensity=5.7+Math.sin(time*6.7)*.55+Math.sin(time*13.1)*.25;
    this.sparks.forEach((spark,i)=>{
      const life=(time*.26+i*.08333)%1,age=(life+1)%1,a=i*2.39996+time*.4;
      spark.position.set(Math.sin(a)*( .1+age*.2),.15+age*1.9,Math.cos(a*1.3)*(.1+age*.18));
      spark.scale.set(.025+age*.018,.055+age*.025,1);spark.material.opacity=Math.sin(age*Math.PI)*.6;
    });
  }
}
