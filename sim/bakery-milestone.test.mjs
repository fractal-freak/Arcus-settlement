/** Stable acceptance contract for the planned bakery chain; generated source cannot edit this. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const present=existsSync(new URL('./systems/bakery.mjs',import.meta.url));
test('bakery conserves grain equivalents, handles shortages and runs deterministically',{skip:!present},async()=>{
 const {createBakeryState,advanceBakery}=await import('./systems/bakery.mjs');
 const total=s=>s.grain+s.flour+s.bread+s.meals;
 let a=createBakeryState(),b=createBakeryState(),supply=total(a);
 assert.equal(supply,0,'new bakery must not invent supplies');
 for(let i=0;i<500;i++){
  const input={grainDelivered:i%7===0?4:0,demand:2,weather:i%5===0?'rain':'clear'};
  supply+=input.grainDelivered;
  a=advanceBakery(a,input);b=advanceBakery(b,input);
  assert.deepEqual(a,b);
  for(const k of ['grain','flour','bread','meals'])assert.ok(Number.isFinite(a[k])&&a[k]>=0,k);
  assert.ok(Math.abs(total(a)-supply)<1e-7,'resources are conserved');
 }
 assert.ok(a.meals>0,'deliveries must eventually feed people');
 let empty=createBakeryState();for(let i=0;i<30;i++)empty=advanceBakery(empty,{grainDelivered:0,demand:10,weather:'rain'});
 assert.equal(total(empty),0,'shortage cannot conjure food');
});
