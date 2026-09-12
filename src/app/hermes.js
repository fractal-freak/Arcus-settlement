/** Authored excavation plan. Dimensions are world units, independent of rendering. */
export const HERMES = Object.freeze({ x: -68, z: 28, rot: -0.38, r: 14, name: 'The Buried Messenger' });
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
  { x: 2, z: 10.25, rx: 1.5, rz: 1.7 },
  { x: 9.5, z: -2.4, rx: 0.7, rz: 2.2 },
  { x: 0, z: -7.4, rx: 3.7, rz: 3.4 },
  { x: 0, z: -0.3, rx: 3.9, rz: 4.6 },
  { x: -4.1, z: 0.2, rx: 1.5, rz: 4.4 },
  { x: 4.5, z: -1.8, rx: 1.5, rz: 3.6 },
  { x: -1.3, z: 6.3, rx: 1.5, rz: 3.9 },
  { x: 1.6, z: 7.2, rx: 1.5, rz: 3.9 },
];
export function hermesBlocked(x, z, margin = 0.6) {
  if (!hermesReserved(x, z, margin)) return false;
  const p = hermesLocal(x, z);
  return HERMES_SOLIDS.some(b => ((p.x-b.x)/(b.rx+margin))**2 + ((p.z-b.z)/(b.rz+margin))**2 < 1);
}
