/** Original, deterministic soil grain; one seamless texture shared by all chunks. */
import { DataTexture, RGBAFormat, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter } from 'three';

export function makeGroundSurface() {
  const size = 256, data = new Uint8Array(size * size * 4);
  const hash = (x, y) => {
    let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x, y, period) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash(ix % period, iy % period), b = hash((ix + 1) % period, iy % period);
    const c = hash(ix % period, (iy + 1) % period), d = hash((ix + 1) % period, (iy + 1) % period);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const broad = noise(x / 32, y / 32, 8);
    const grain = noise(x / 4, y / 4, 64);
    const fine = hash(x, y);
    const value = Math.round(255 * (0.67 + broad * 0.17 + grain * 0.11 + fine * 0.05));
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
  }
  const texture = new DataTexture(data, size, size, RGBAFormat);
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}
