import { BufferAttribute } from 'three';

/** Share bit-identical vertices without welding UV seams or softened edges. */
export function indexGeometry(geometry) {
  if (geometry.index) return geometry;
  const attributes=Object.entries(geometry.attributes);
  if(attributes.some(([,a])=>a.isInterleavedBufferAttribute||!(a.array instanceof Float32Array)))return geometry;
  const count=geometry.attributes.position.count;
  const fields=attributes.map(([,a])=>({size:a.itemSize,bits:new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length)}));
  const heads=new Map(),original=[],next=[],indices=new Uint32Array(count);
  const same=(a,b)=>fields.every(f=>{
    for(let c=0;c<f.size;c++)if(f.bits[a*f.size+c]!==f.bits[b*f.size+c])return false;
    return true;
  });
  for(let i=0;i<count;i++) {
    let hash=2166136261;
    for(const f of fields)for(let c=0;c<f.size;c++)hash=Math.imul(hash^f.bits[i*f.size+c],16777619)>>>0;
    const head=heads.get(hash);let found=head;
    // Hash collisions are checked against every attribute, never treated as
    // equality. Positions, normals, UVs and vertex colours retain exact bits.
    while(found!==undefined&&!same(i,original[found]))found=next[found];
    if(found===undefined){found=original.length;original.push(i);next.push(head);heads.set(hash,found);}
    indices[i]=found;
  }
  for(const [name,a] of attributes) {
    const bits=new Uint32Array(original.length*a.itemSize),source=new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length);
    for(let i=0;i<original.length;i++)for(let c=0;c<a.itemSize;c++)bits[i*a.itemSize+c]=source[original[i]*a.itemSize+c];
    geometry.setAttribute(name,new BufferAttribute(new Float32Array(bits.buffer),a.itemSize,a.normalized));
  }
  geometry.setIndex(new BufferAttribute(original.length<=65535?new Uint16Array(indices):indices,1));
  return geometry;
}
