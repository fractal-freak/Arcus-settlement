/** Broad-phase index for occupied circles. Exact collision rules stay with callers. */
export class SpatialIndex {
  constructor(cellSize = 8) { this.cellSize = cellSize; this.cells = new Map(); }
  insert(circle) {
    const s = this.cellSize;
    for (let z = Math.floor((circle.z - circle.r) / s); z <= Math.floor((circle.z + circle.r) / s); z++) {
      for (let x = Math.floor((circle.x - circle.r) / s); x <= Math.floor((circle.x + circle.r) / s); x++) {
        const key = `${x},${z}`;
        if (!this.cells.has(key)) this.cells.set(key, []);
        this.cells.get(key).push(circle);
      }
    }
  }
  intersects(x, z, radius) {
    const s = this.cellSize;
    for (let cz = Math.floor((z - radius) / s); cz <= Math.floor((z + radius) / s); cz++) {
      for (let cx = Math.floor((x - radius) / s); cx <= Math.floor((x + radius) / s); cx++) {
        for (const c of this.cells.get(`${cx},${cz}`) ?? []) {
          if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + radius) ** 2) return true;
        }
      }
    }
    return false;
  }
}
