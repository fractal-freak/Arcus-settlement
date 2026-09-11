/**
 * Air and water.
 *
 * Orthographic means looking down at the plane, so there is no horizon and
 * nowhere to hang a sky. Faking one was what bent the world in the first place.
 *
 * What an overhead view CAN show honestly is weather: open sea beyond the
 * island, and clouds drifting over the land casting soft shadows. The shadow is
 * offset from its cloud along the real sun's bearing, so on a low evening sun
 * the shadows stretch away long and in the right direction, and at noon they
 * sit almost underneath. The sky is still the real one; it just reaches the
 * world as light and weather rather than as a backdrop.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js';

const DEG = Math.PI / 180;

const SEA_NIGHT = [[16, 20, 48], [10, 13, 34]];
const SEA_DAY = [[64, 150, 200], [38, 110, 168]];
const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function seaTexture(light) {
  const c = document.createElement('canvas');
  c.width = 1; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 128);
  for (let i = 0; i < 2; i++) {
    const n = SEA_NIGHT[i], d = SEA_DAY[i];
    grad.addColorStop(i, `rgb(${lerp(n[0], d[0], light)},${lerp(n[1], d[1], light)},${lerp(n[2], d[2], light)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 128);
  return Texture.from(c);
}

/** Soft round clouds, the cosy kind rather than the meteorological kind. */
function cloudTexture(renderer, seed) {
  const g = new Graphics();
  const n = 4 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const x = 60 + i * 44 + ((seed * (i + 3)) % 19);
    const y = 58 + ((seed * (i + 7)) % 17) - 8;
    const r = 30 + ((seed * (i + 5)) % 22);
    g.ellipse(x, y, r, r * 0.70).fill({ color: 0xffffff, alpha: 1 });
  }
  const tex = renderer.generateTexture({ target: g, resolution: 1, scaleMode: 'linear' });
  g.destroy();
  return tex;
}

export class Atmosphere {
  /**
   * @param shadowLayer where cloud shadows are drawn — under the props, on the
   *        ground, so a shadow passes beneath a tree rather than over it.
   */
  constructor(renderer, w, h, shadowLayer) {
    this.w = w; this.h = h;
    this.sky = null;

    this.back = new Container();
    this.sea = new Sprite(seaTexture(0));
    this.back.addChild(this.sea);

    this.shadows = shadowLayer;
    this.front = new Container();

    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const tex = cloudTexture(renderer, 13 + i * 29);
      const body = new Sprite(tex);
      body.anchor.set(0.5);
      body.alpha = 0.9;
      this.front.addChild(body);

      const shade = new Sprite(tex);
      shade.anchor.set(0.5);
      shade.tint = 0x1b2440;
      shade.alpha = 0.16;
      shade.zIndex = -1e9;      // always beneath anything standing on the ground
      this.shadows.addChild(shade);

      this.clouds.push({
        body, shade,
        wx: 0, wy: 0, placed: false,
        sp: 2.5 + Math.random() * 5,
        sc: 0.26 + Math.random() * 0.34,
      });
    }
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.sea.width = w;
    this.sea.height = h;
  }

  setSky(sky) {
    this.sky = sky;
    this.sea.texture.destroy(true);
    this.sea.texture = seaTexture(sky.light);
  }

  update(dtMs, camera) {
    const sky = this.sky;
    const light = sky ? sky.light : 0;

    // How far a shadow falls from whatever casts it. Straight from the real
    // sun: low sun, long shadow, thrown away from its bearing.
    let offX = 0, offY = 0, shadowAlpha = 0;
    if (sky && sky.sun.alt > 0.5) {
      const len = Math.min(420, 120 / Math.tan(Math.max(4, sky.sun.alt) * DEG));
      const az = sky.sun.az * DEG;
      offX = -Math.sin(az) * len;
      offY = Math.cos(az) * len * 0.5;   // squashed, because the ground is seen at an angle
      shadowAlpha = 0.12 * Math.min(1, light * 1.4);
    }

    // Clouds live around wherever you are looking, not at fixed points in an
    // unbounded world — scattered across the whole plane they were almost never
    // on screen. They drift across the view and wrap when they leave it.
    const r = camera.visibleBounds();
    const margin = 400 / camera.zoom;
    for (const c of this.clouds) {
      if (!c.placed) {
        c.wx = r.x + Math.random() * r.width;
        c.wy = r.y + Math.random() * r.height;
        c.placed = true;
      }
      c.wx += c.sp * (dtMs / 1000) * 10;
      if (c.wx > r.x + r.width + margin) {
        c.wx = r.x - margin;
        c.wy = r.y + Math.random() * r.height;
      } else if (c.wx < r.x - margin * 2) {
        c.wx = r.x + r.width + margin;
      }
      if (c.wy < r.y - margin || c.wy > r.y + r.height + margin) {
        c.wy = r.y + Math.random() * r.height;
      }

      const g = camera.project(c.wx, c.wy);
      c.shade.x = g.x + offX * camera.zoom;
      c.shade.y = g.y + offY * camera.zoom;
      c.shade.scale.set(c.sc * camera.zoom * 1.05);
      c.shade.alpha = shadowAlpha;
      c.shade.visible = shadowAlpha > 0.01;

      c.body.x = g.x;
      c.body.y = g.y;
      c.body.scale.set(c.sc * camera.zoom);
      // Clouds dim at night rather than vanishing; a moonlit sky still has them.
      c.body.alpha = 0.20 + 0.52 * light;
    }
  }
}
