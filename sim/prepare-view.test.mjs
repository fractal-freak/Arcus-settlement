import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareView} from './prepare-view.mjs';
test('screenshot preparation streams first, restores rendering, then completes real frames',async()=>{
 const events=[];const render=()=>events.push('render');
 const w={stage:{render},terrain:{pendingVisible:3},step(){this.stage.render();this.terrain.pendingVisible=Math.max(0,this.terrain.pendingVisible-1);}};
 globalThis.window={__world:w};
 try{
  await prepareView({evaluate:async f=>f()},{finishFrame:async()=>events.push('fence')});
  assert.equal(w.stage.render,render);assert.deepEqual(events,['render','fence','render','fence']);
  assert.equal(window.__viewRender,undefined);
 }finally{delete globalThis.window;}
});
test('a failed screenshot preparation cannot leave the world renderer disabled',async()=>{
 const render=()=>{};const w={stage:{render},terrain:{pendingVisible:1},step(){throw Error('stream failed');}};
 globalThis.window={__world:w};
 try{await assert.rejects(prepareView({evaluate:async f=>f()}),/stream failed/);assert.equal(w.stage.render,render);}
 finally{delete globalThis.window;}
});
