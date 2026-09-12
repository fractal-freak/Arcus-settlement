import {sanctuaryMaterials} from './sanctuaryMaterials.js';
/** Patchy moisture, lichen, and moss sit in the stone material, underneath living ivy. */
export function weatherPalaceMaterial(material,strength=.8,{walkway=false}={}){
  const previous=material.onBeforeCompile,key=material.customProgramCacheKey.bind(material),oldKey=key();
  const moss=sanctuaryMaterials().moss.color;
  material.onBeforeCompile=shader=>{
    previous.call(material,shader);shader.uniforms.palaceMoss={value:moss};
    shader.vertexShader='varying vec3 agePoint;varying vec3 ageNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n agePoint=(modelMatrix*vec4(position,1.)).xyz;ageNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader=`varying vec3 agePoint;varying vec3 ageNormal;uniform sampler2D palaceMoss;
      float ageHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float ageNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(ageHash(i),ageHash(i+vec3(1,0,0)),f.x),mix(ageHash(i+vec3(0,1,0)),ageHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(ageHash(i+vec3(0,0,1)),ageHash(i+vec3(1,0,1)),f.x),mix(ageHash(i+vec3(0,1,1)),ageHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 ageN=abs(ageNormal);
      vec2 mossUV=ageN.y>.6?agePoint.xz:ageN.x>ageN.z?agePoint.zy:agePoint.xy;
      float palaceDamp=1.-smoothstep(10.2,19.,agePoint.y);
      float ageCoverage=ageNoise(agePoint*.62)*.72+ageNoise(agePoint*2.1)*.28;
      float ageStreak=ageNoise(vec3(agePoint.x*1.7,agePoint.y*.055,agePoint.z*1.7));
      float mossMask=smoothstep(.49,.75,ageCoverage+palaceDamp*.12+max(0.,ageNormal.y)*.09)*${strength.toFixed(3)};
      ${walkway?'mossMask*=mix(1.,smoothstep(.55,2.55,abs(agePoint.x+55.)+ageNoise(agePoint*2.)*.3),smoothstep(.5,.85,ageNormal.y));':''}
      vec3 ageScan=texture2D(palaceMoss,mossUV*.42).rgb;
      float mossDetail=dot(ageScan,vec3(.2126,.7152,.0722));
      vec3 mossTone=vec3(.063,.085,.037)*(.62+mossDetail*1.65);
      mossMask*=.63+.37*smoothstep(.06,.25,mossDetail);
      diffuseColor.rgb*=1.-palaceDamp*ageStreak*.19;
      diffuseColor.rgb=mix(diffuseColor.rgb,mossTone,mossMask);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,1.,mossMask);');
  };
  material.customProgramCacheKey=()=> `${oldKey}-living-moss-2-${strength}-${walkway}`;return material;
}
