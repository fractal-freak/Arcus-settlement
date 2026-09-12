/** Short-range ambient occlusion, shared by the full-resolution world composite. */
export const contactShadowGLSL = `
    uniform sampler2D tDepth;uniform mat4 inverseProjection;uniform mat4 projection;
    uniform vec2 aoResolution;uniform float radius;uniform float strength;
    vec3 point(vec2 uv){vec4 p=inverseProjection*vec4(uv*2.-1.,texture2D(tDepth,uv).r*2.-1.,1.);return p.xyz/p.w;}
    float contactShade(vec2 vUv){
      float depth=texture2D(tDepth,vUv).r;
      if(depth>.9998){return 1.;}
      vec3 p=point(vUv);vec2 pixel=1./aoResolution;
      vec3 dx1=point(vUv+vec2(pixel.x,0))-p,dx2=p-point(vUv-vec2(pixel.x,0));
      vec3 dy1=point(vUv+vec2(0,pixel.y))-p,dy2=p-point(vUv-vec2(0,pixel.y));
      vec3 dx=abs(dx1.z)<abs(dx2.z)?dx1:dx2,dy=abs(dy1.z)<abs(dy2.z)?dy1:dy2;
      vec3 n=normalize(cross(dx,dy));if(dot(n,-p)<0.)n=-n;
      vec2 spread=vec2(projection[0][0],projection[1][1])*radius/max(.5,-p.z)*.5;
      float occlusion=0.;
      for(int i=0;i<12;i++){
        float fi=float(i),a=fi*2.399963,s=sqrt((fi+.5)/12.);
        vec2 uv=vUv+vec2(cos(a),sin(a))*spread*s;
        if(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1))))continue;
        vec3 delta=point(uv)-p;float distance=length(delta);
        float facing=max(0.,dot(n,delta)/max(distance,.001)-.12);
        occlusion+=facing*(1.-smoothstep(radius*.12,radius,distance));
      }
      float ao=clamp(1.-occlusion/12.*strength*3.,.62,1.);
      return ao;
    }`;
