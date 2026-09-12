import test from 'node:test';
import assert from 'node:assert/strict';
import {REALM_PARTS} from '../src/app/realm.js';
import {slateGableGeometry} from '../src/three/slateGable.js';

test('hall slate stays within the existing roof plan and leaves the ruined half open',()=>{
  const p=REALM_PARTS.find(p=>p.name==='Surviving hall roof');
  assert.equal(p.solid,false);assert.equal(p.half,true);
  const g=slateGableGeometry(p),v=g.attributes.position,n=g.attributes.normal;
  assert.ok(v.count/3<6000,'bounded detail cost for one roof');
  for(let i=0;i<v.count;i++) {
    assert.ok(v.getX(i)>=p.x-p.w/2-1e-5&&v.getX(i)<=p.x+1e-5);
    assert.ok(Math.abs(v.getZ(i)-p.z)<=p.d/2+1e-5);
    assert.ok(v.getY(i)>=p.y-.05&&v.getY(i)<=p.y+p.h+.05);
    assert.ok(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i)));
  }
  g.dispose();
});
