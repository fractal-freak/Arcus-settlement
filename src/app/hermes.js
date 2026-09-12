import { HERMES_STONE_BANDS } from './hermesFootprint.js';
/** Authored excavation plan. Dimensions are world units, independent of rendering. */
export const HERMES = Object.freeze({ x: -68, z: 28, rot: -0.38, r: 14, name: 'The Buried Messenger' });
export const HERMES_SCAN = Object.freeze({scale:5, y:.4, rotX:-Math.PI/2});
// Broken marble near the ancient arm and cloak fractures; all ground occupancy
// is part of the plan, including the smallest newly uncovered fragments.
export const HERMES_CHIPS = [
  {x:-3.4,z:-5.5,r:.28,rot:.3},{x:-3.8,z:-5.1,r:.16,rot:1.1},
  {x:-3.1,z:-5.9,r:.11,rot:2.4},{x:-3.6,z:-4.6,r:.12,rot:.8},
  {x:4.35,z:-.8,r:.24,rot:1.8},{x:4.5,z:-.2,r:.15,rot:.2},
  {x:4.05,z:-.45,r:.09,rot:2.1},{x:4.4,z:.3,r:.12,rot:.6},
];
export const HERMES_PIT = { x: HERMES.x, z: HERMES.z, r: 12.8, depth: 0.55, wall: 3.2 };
export function hermesLocal(x, z) {
  const dx = x - HERMES.x, dz = z - HERMES.z, c = Math.cos(HERMES.rot), s = Math.sin(HERMES.rot);
  return { x: c * dx - s * dz, z: s * dx + c * dz };
}
export function hermesWorld(x, z) {
  const c = Math.cos(HERMES.rot), s = Math.sin(HERMES.rot);
  return { x: HERMES.x + c * x + s * z, z: HERMES.z - s * x + c * z };
}
export function hermesReserved(x, z, margin = 0) { return Math.hypot(x - HERMES.x, z - HERMES.z) < HERMES.r + margin; }
// Exposed stone footprints leave a continuous aisle around the discovery.
export const HERMES_SOLIDS = [
  { x: 9.5, z: -2.4, rx: 0.7, rz: 2.2 }, // finds trays
];
export function hermesBlocked(x, z, margin = 0.6) {
  if (!hermesReserved(x, z, margin)) return false;
  const p = hermesLocal(x, z);
  if(HERMES_CHIPS.some(c=>Math.hypot(p.x-c.x,p.z-c.z)<c.r+margin))return true;
  if(HERMES_STONE_BANDS.some(b=>{
    const dx=Math.max(b.minX-p.x,0,p.x-b.maxX);
    const dz=Math.max(b.z-p.z,0,p.z-b.z-.5);
    return Math.hypot(dx,dz)<=margin;
  }))return true;
  return HERMES_SOLIDS.some(b => ((p.x-b.x)/(b.rx+margin))**2 + ((p.z-b.z)/(b.rz+margin))**2 < 1);
}
