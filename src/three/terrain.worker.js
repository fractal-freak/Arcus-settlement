// Register the same excavation cuts as the main thread before generating ground.
import '../app/digs.js';
import { landGeometry, farGeometry } from './terrainGeometry.js';
self.onmessage = ({ data: { key, x, z, type } }) => {
  const mesh = type === 'far' ? farGeometry(x, z) : landGeometry(x, z);
  const attributes = Object.fromEntries(Object.entries(mesh.attributes).map(([name, a]) =>
    [name, { array: a.array, itemSize: a.itemSize }]));
  const geometry = { attributes, index: mesh.index.array };
  self.postMessage({ key, geometry, type, x, z }, [geometry.index.buffer,
    ...Object.values(attributes).map(a => a.array.buffer)]);
  mesh.dispose();
};
