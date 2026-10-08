import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForOpeningView} from './opening-view.mjs';

test('startup completes each frame before submitting another, including the final ready frame',async()=>{
 const events=[];let n=0;
 const page={evaluate:async()=>{events.push('step');return {ready:++n>=3,pending:n>=3?0:1};}};
 await waitForOpeningView(page,{finishFrame:async()=>events.push('finish')});
 assert.deepEqual(events,['step','finish','step','finish','step','finish']);
});
test('startup keeps a bounded deadline even if terrain never completes',async()=>{
 let time=0;
 const page={evaluate:async()=>({ready:false,pending:1})};
 await assert.rejects(waitForOpeningView(page,{timeout:20,now:()=>time,finishFrame:async(_,opts)=>{assert.ok(opts.timeout<=20);time+=11;}}),/deadline/);
});
test('startup propagates failed rendering rather than accepting ready terrain',async()=>{
 await assert.rejects(waitForOpeningView({evaluate:async()=>({ready:true,pending:0})},{finishFrame:async()=>{throw Error('GPU failed');}}),/GPU failed/);
});
