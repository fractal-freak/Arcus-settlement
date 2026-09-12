/** CC0 scanned timber and masonry, projected at a consistent size in kit coordinates. */
import { sanctuaryMaterials } from './sanctuaryMaterials.js';
import { makeGroundSurface } from './groundSurface.js';
import { TextureLoader, RepeatWrapping, SRGBColorSpace } from 'three';
let maps;
function textures() {
  if (maps) return maps;
  const loader=new TextureLoader();
  const load=(asset,channel)=>{
    const texture=loader.load(`${import.meta.env.BASE_URL}assets/village-materials/${asset}_${channel}_1k.jpg`);
    texture.wrapS=texture.wrapT=RepeatWrapping;texture.anisotropy=4;
    if(channel==='diff')texture.colorSpace=SRGBColorSpace;
    return texture;
  };
  maps={stone:load('medieval_blocks_03','diff'),stoneHeight:load('medieval_blocks_03','disp'),
    grain:makeGroundSurface(),wood:load('medieval_wood','diff'),woodHeight:load('medieval_wood','disp')};
  return maps;
}

export function weatheredMaterial(source, surface = 'building') {
  const material=source.clone(), t=textures();
  const rock=surface === 'rock' ? sanctuaryMaterials().rock : null;
  if (rock) { material.map=null; material.color.setHex(0xb1a99a); }
  material.roughness=.9;
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{uStone:{value:t.stone},uStoneHeight:{value:t.stoneHeight},
      uRock:{value:rock?.color ?? t.grain},uRockHeight:{value:rock?.height ?? t.grain},uGrain:{value:t.grain},uWood:{value:t.wood},uWoodHeight:{value:t.woodHeight}});
    shader.vertexShader='varying vec3 vKitPosition;\nvarying vec3 vKitNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vKitPosition=position;
      vKitNormal=normal;
    `);
    shader.fragmentShader=`varying vec3 vKitPosition;
      varying vec3 vKitNormal;
      uniform sampler2D uStone, uStoneHeight, uWood, uWoodHeight, uGrain, uRock, uRockHeight;
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec3 kitN=abs(normalize(vKitNormal));
      vec2 surfaceUV=kitN.y>max(kitN.x,kitN.z)?vKitPosition.xz:
        (kitN.x>kitN.z?vKitPosition.zy:vKitPosition.xy);
      surfaceUV*=2.5; // two-metre scans, at the kit's fixed world scale of five
      vec3 original=diffuseColor.rgb;
      float brightest=max(original.r,max(original.g,original.b));
      float chroma=brightest-min(original.r,min(original.g,original.b));
      float villageHeight=0.0;
      bool roof=${surface === 'building' ? 'true' : 'false'} && ((original.r>0.08 && original.g<original.r*.20) ||
        (original.g>0.06 && original.g>original.r*1.5 && original.g>original.b*1.2));
      bool stone=chroma<brightest*.28 && brightest>.10;
      bool timber=${surface === 'wood' ? 'true' : '(original.r>original.g*1.35 && original.g>original.r*.18 && original.g>original.b*1.15 && !roof)'};
      if(${surface === 'rock' ? 'true' : 'false'}){
        float grain=texture2D(uGrain,surfaceUV*3.0).r;
        vec3 scan=texture2D(uRock,surfaceUV).rgb;
        float luma=dot(scan,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(scan,vec3(luma),.65)*original*(.78+grain*.22);
        villageHeight=texture2D(uRockHeight,surfaceUV).r*.055;
      }else if(stone && ${surface === 'building' ? 'true' : 'false'}){
        vec3 scan=texture2D(uStone,surfaceUV).rgb;
        diffuseColor.rgb=mix(original,scan*.82,.72);
        villageHeight=texture2D(uStoneHeight,surfaceUV).r*.055;
      }else if(timber){
        vec3 scan=texture2D(uWood,surfaceUV).rgb;
        diffuseColor.rgb=mix(original,scan*.8,.78);
        villageHeight=texture2D(uWoodHeight,surfaceUV).r*.03;
      }else if(roof){
        // Fine overlapping courses give the existing roof a legible human scale.
        vec2 roofUV=vKitPosition.xz*vec2(15.0,18.0);
        float row=floor(roofUV.y);
        vec2 tile=fract(roofUV+vec2(mod(row,2.0)*.5,0.0));
        vec2 fw=max(fwidth(roofUV),vec2(.001));
        float seam=smoothstep(0.0,fw.y+.04,tile.y)*smoothstep(0.0,fw.x+.025,tile.x);
        float age=fract(sin(dot(floor(roofUV),vec2(12.9898,78.233)))*43758.5453);
        float gray=dot(original,vec3(.2126,.7152,.0722));
        diffuseColor.rgb=mix(original,vec3(gray),.32)*(.72+.24*seam)*(.9+age*.16);
        villageHeight=seam*.01;
      }
      float damp=1.0-smoothstep(-.05,.14,vKitPosition.y);
      diffuseColor.rgb*=1.0-damp*.19;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      vec3 sigmaX=dFdx(-vViewPosition), sigmaY=dFdy(-vViewPosition);
      vec3 r1=cross(sigmaY,normal), r2=cross(normal,sigmaX);
      float determinant=dot(sigmaX,r1);
      vec3 gradient=sign(determinant)*(dFdx(villageHeight)*r1+dFdy(villageHeight)*r2);
      normal=normalize(abs(determinant)*normal-gradient);
    `);
  };
  material.customProgramCacheKey=()=> `weathered-village-v2-${surface}`;
  return material;
}

/** Shared scans for world-scale masonry with explicit UVs. */
export function villageStoneMaps(){return textures();}
