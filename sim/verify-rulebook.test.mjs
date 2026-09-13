import test from 'node:test';
import assert from 'node:assert/strict';
import {check} from './verify.mjs';
const dimension={key:'waterfront',name:'River margin',why:'A coherent river edge gives the settlement a readable boundary.',tag:'edge',target:40};
const project={key:'candidate_reeds',dim:'waterfront',want:'to plant reeds beside the river',needs:30,place:'water',tag:'edge',n:1,kinds:['waterplant_A']};
test('candidate checks do not retain removed generated scores from cached quality',async()=>{
 const errors=await check(null,{EXTRA_PROJECTS:[project],EXTRA_DIMENSIONS:[]});
 assert.ok(errors.some(e=>e.includes('not something the settlement measures')));
});
test('candidate checks do not retain removed generated jobs from cached quality',async()=>{
 const errors=await check(null,{EXTRA_PROJECTS:[],EXTRA_DIMENSIONS:[dimension]});
 assert.ok(errors.some(e=>e.includes('nothing the citizens can do')));
});
test('a newly supplied dimension and its valid project are checked together',async()=>{
 const key='candidate_river';
 assert.deepEqual(await check(null,{EXTRA_PROJECTS:[{...project,dim:key}],EXTRA_DIMENSIONS:[{...dimension,key}]}),[]);
});
