/** CC0 scanned stone. Shared texture objects keep the sanctuary's GPU cost bounded. */
import { TextureLoader, RepeatWrapping, SRGBColorSpace } from 'three';
let maps;
export function sanctuaryMaterials() {
  if (maps) return maps;
  const loader = new TextureLoader();
  const load = (asset, channel) => {
    const t = loader.load(`${import.meta.env.BASE_URL}assets/sanctuary/${asset}-${channel}.jpg`);
    t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 8;
    if (channel === 'color') t.colorSpace = SRGBColorSpace;
    return t;
  };
  maps = {};
  for (const [key, asset] of [['rock', 'rock_boulder_cracked'], ['moss', 'mossy_rock']]) {
    maps[key] = Object.fromEntries(['color', 'normal', 'height', 'rough'].map(c => [c, load(asset, c)]));
  }
  return maps;
}

/** Keep scanned detail while bringing the sanctuary into a quiet earth palette. */
export function earthPalette(material, moss = false) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    previous.call(material, shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      float earthLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      diffuseColor.rgb = ${moss
        ? 'mix(vec3(earthLuma * 0.80 + 0.045), diffuseColor.rgb, 0.23) * vec3(0.98, 1.01, 0.90)'
        : 'mix(vec3(earthLuma), diffuseColor.rgb, 0.18) * vec3(1.00, 0.99, 0.96)'};
    `);
  };
  material.customProgramCacheKey = () => `sanctuary-earth-${moss}`;
  return material;
}
