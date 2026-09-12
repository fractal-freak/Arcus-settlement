import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry, Float32BufferAttribute} from 'three';
import {indexGeometry} from '../src/three/indexGeometry.js';
import {masonryGeometry} from '../src/three/palaceKit.js';

test('indexed castle geometry reconstructs every original attribute bit, including seams',()=>{
  for(const g of [new BoxGeometry().toNonIndexed(),masonryGeometry({x:0,z:0,w:5,h:3,d:.8})]) {
    const count=g.attributes.position.count;
    const colours=new Float32Array(count*3).fill(.7);
    colours[0]=.3; // same position can carry distinct weathering
    g.setAttribute('color',new Float32BufferAttribute(colours,3));
    const before=Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,{size:a.itemSize,bits:new Uint32Array(a.array.buffer).slice()}]));
    indexGeometry(g);
    assert.equal(g.index.count,count);
    assert.ok(g.attributes.position.count<count);
    for(const [key,a] of Object.entries(g.attributes)) {
      const after=new Uint32Array(a.array.buffer),old=before[key];
      for(let i=0;i<count;i++)for(let c=0;c<a.itemSize;c++)assert.equal(after[g.index.getX(i)*a.itemSize+c],old.bits[i*a.itemSize+c]);
    }
    const first=g.index;indexGeometry(g);assert.equal(g.index,first);
    g.dispose();
  }
});
