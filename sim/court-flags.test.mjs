import test from 'node:test';import assert from 'node:assert/strict';
import {COURT_FLAGS,courtGroundSafe,courtCoverage} from '../src/app/sanctuary.js';
test('laid court stays on stable dry ground and leaves the stone clear',()=>{
 assert.ok(COURT_FLAGS.length>100);
 for(const f of COURT_FLAGS)for(const p of f.points){assert.ok(courtGroundSafe(p.x,p.z,.15));assert.ok(courtCoverage(p.x,p.z)>=.15);assert.ok(Math.hypot(p.x,p.z)>=3.84);}
});
