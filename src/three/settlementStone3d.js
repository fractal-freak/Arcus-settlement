/**
 * The Settlement Stone: the world's own founding chart, standing in the
 * middle of the town square.
 *
 * `founding` in the feed payload (arcus-town.mjs's FOUNDING, unchanged
 * since this whole project began) is a REAL chart: 10 September 2026,
 * 7:11pm EDT, Pawtucket — Ascendant, MC, and all eleven bodies' true
 * ecliptic longitude, in degrees, baked in because a birth chart is fixed
 * forever. Nothing about the wheel drawn onto this obelisk is invented —
 * every glyph sits at its own body's real longitude, same as the real sky
 * this world's daylight is drawn from. The chart is real; a wheel drawn to
 * grid convention with the actual body positions plugged in isn't the same
 * kind of claim as an illustration made to look astrological.
 *
 * The obelisk itself and the plaza's paving stones are the one piece of
 * this landmark NOT from Kenney's kit — nothing in the Retro Fantasy Kit
 * is a tall four-sided tapering monolith, so the shaft is a plain
 * MeshToonMaterial prism (kept in the SAME toon style everything but the
 * buildings still uses); the wheel is a CanvasTexture medallion mounted
 * flush on its front face. Paving uses Kenney's own floor-flat tile.
 */

import {
  Group, CylinderGeometry, CircleGeometry, MeshToonMaterial, MeshBasicMaterial,
  Mesh, InstancedMesh, Object3D, CanvasTexture, DoubleSide,
} from 'three';
import { smoothHeightAt } from '../app/terrain.js';
import { toonRamp } from './terrain3d.js';
import { loadPiece } from './assets.js';

const ZODIAC = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
const PLANET_GLYPH = {
  Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃',
  Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇', Node: '☊',
};

/**
 * The wheel, drawn to real chart convention: Ascendant at the left
 * (9 o'clock), longitude increasing counter-clockwise from there — the
 * same orientation Kevin's own chart wheels use.
 */
function drawChartWheel(founding) {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const cx = size / 2, cy = size / 2, R = size * 0.47;

  const angleFor = (lon) => {
    const rel = ((lon - founding.asc + 360) % 360) * (Math.PI / 180);
    return Math.PI - rel;
  };

  ctx.fillStyle = '#cec4ae';
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e4dcc8';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#cec4ae';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.fill();

  ctx.strokeStyle = '#4a4335';
  ctx.fillStyle = '#332e24';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = size * 0.003;
  for (let s = 0; s < 12; s++) {
    const a = angleFor(s * 30);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R * 0.82, cy - Math.sin(a) * R * 0.82);
    ctx.lineTo(cx + Math.cos(a) * R * 0.98, cy - Math.sin(a) * R * 0.98);
    ctx.stroke();
    const mid = angleFor(s * 30 + 15);
    ctx.font = `${size * 0.036}px serif`;
    ctx.fillText(ZODIAC[s], cx + Math.cos(mid) * R * 0.92, cy - Math.sin(mid) * R * 0.92);
  }
  ctx.lineWidth = size * 0.004;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.86, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.55, 0, Math.PI * 2); ctx.stroke();

  // Ascendant/Descendant axis — the real horizon line of the chart.
  ctx.lineWidth = size * 0.005;
  const aA = angleFor(founding.asc);
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(aA) * R * 0.86, cy + Math.sin(aA) * R * 0.86);
  ctx.lineTo(cx + Math.cos(aA) * R * 0.86, cy - Math.sin(aA) * R * 0.86);
  ctx.stroke();
  // MC/IC axis.
  const aM = angleFor(founding.mc);
  ctx.beginPath();
  ctx.moveTo(cx - Math.cos(aM) * R * 0.86, cy + Math.sin(aM) * R * 0.86);
  ctx.lineTo(cx + Math.cos(aM) * R * 0.86, cy - Math.sin(aM) * R * 0.86);
  ctx.stroke();

  for (const [name, lon] of founding.bodies) {
    const a = angleFor(lon);
    const rim = { x: cx + Math.cos(a) * R * 0.86, y: cy - Math.sin(a) * R * 0.86 };
    const px = cx + Math.cos(a) * R * 0.68, py = cy - Math.sin(a) * R * 0.68;
    ctx.strokeStyle = '#5c5546'; ctx.lineWidth = size * 0.0015;
    ctx.beginPath(); ctx.moveTo(rim.x, rim.y); ctx.lineTo(px, py); ctx.stroke();
    ctx.fillStyle = '#241f18';
    ctx.font = `${size * 0.045}px serif`;
    ctx.fillText(PLANET_GLYPH[name] ?? name[0], px, py);
  }

  ctx.fillStyle = '#6b5a3f';
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.07, 0, Math.PI * 2); ctx.fill();

  const tex = new CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

const STONE = new MeshToonMaterial({ color: 0x9a978f, gradientMap: toonRamp });

export class SettlementStone3D {
  constructor(scene) {
    this.scene = scene;
    this.built = false;
    this._pavingReady = loadPiece('floor-flat');
  }

  sync(founding) {
    if (this.built || !founding) return;
    this.built = true;
    this._build(founding);
  }

  async _build(founding) {
    const group = new Group();
    const h = smoothHeightAt(0, 0);

    // The obelisk: a tall, gently tapering four-sided shaft. 4 radial
    // segments on a cylinder gives flat faces (rotated 45° so a face, not
    // an edge, points forward — the same trick terrain3d.js's pyramid roof
    // already uses) rather than a rounded column.
    const shaft = new Mesh(new CylinderGeometry(0.55, 0.85, 4.6, 4), STONE);
    shaft.rotation.y = Math.PI / 4;
    shaft.position.set(0, h + 2.3, 0);
    shaft.castShadow = true; shaft.receiveShadow = true;
    const cap = new Mesh(new CylinderGeometry(0.05, 0.55, 0.5, 4), STONE);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(0, h + 4.85, 0);
    cap.castShadow = true;
    group.add(shaft, cap);

    // The wheel itself, mounted flush on the south face (+Z, facing
    // whoever approaches from the river/bridge side of the square).
    const wheelTex = drawChartWheel(founding);
    const medallion = new Mesh(
      new CircleGeometry(0.62, 48),
      new MeshBasicMaterial({ map: wheelTex, side: DoubleSide }),
    );
    medallion.position.set(0, h + 2.6, 0.56);
    group.add(medallion);
    // A thin dark rim so the medallion reads as set INTO the stone, not
    // pasted on top of it.
    const rim = new Mesh(
      new CircleGeometry(0.68, 48),
      new MeshToonMaterial({ color: 0x2e2a22, gradientMap: toonRamp }),
    );
    rim.position.set(0, h + 2.6, 0.54);
    group.add(rim);

    this.scene.add(group);

    // Cobblestone paving, a real Kenney tile — a ring of them around the
    // stone rather than a solid filled square, so the obelisk reads as
    // standing IN a plaza rather than on a slab.
    const paving = await this._pavingReady;
    const positions = [];
    const RING = 4;
    for (let gx = -RING; gx <= RING; gx++) {
      for (let gz = -RING; gz <= RING; gz++) {
        const d = Math.hypot(gx, gz);
        if (d > RING + 0.5 || d < 1.2) continue; // a ring, not a disc — leaves room right at the shaft's base
        positions.push([gx, gz]);
      }
    }
    const tiles = new InstancedMesh(paving.geometry, paving.material, positions.length);
    tiles.receiveShadow = true;
    const dummy = new Object3D();
    positions.forEach(([gx, gz], i) => {
      const px = gx, pz = gz;
      dummy.position.set(px, smoothHeightAt(px, pz), pz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
    });
    tiles.instanceMatrix.needsUpdate = true;
    this.scene.add(tiles);
  }
}
