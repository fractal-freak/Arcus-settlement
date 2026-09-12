import test from 'node:test';
import assert from 'node:assert/strict';
import { Feed } from '../src/data/feed.js';

function setup(t) {
  const memory=new Map();
  for (const [key,value] of Object.entries({localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},location:{search:''}})) {
    const descriptor=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    t.after(()=>{if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
  }
  return memory;
}
const snapshot=()=>({people:[],town:{buildings:[{n:1,trade:'baker',weight:2}],folk:4}});
const response=data=>({ok:true,json:async()=>data});

test('snapshot draws while the live feed is pending, then live data takes over',async t=>{
  const memory=setup(t),received=[];
  let resolveLive;
  t.mock.method(globalThis,'fetch',async url=>url==='/world/data'
    ? new Promise(resolve=>{resolveLive=resolve;}) : response(snapshot()));
  const feed=new Feed(d=>received.push(d));
  const live=feed.once(); await feed.seed();
  assert.equal(feed.source,'published');assert.equal(received.length,1);
  resolveLive(response({...snapshot(),people:[{id:'test-session',title:'private session'}],
    town:{...snapshot().town,buildings:[{n:2,trade:'mason',weight:1,title:'private commit'}]}}));
  await live;
  assert.equal(feed.source,'live');assert.equal(received.length,2);
  const saved=JSON.parse([...memory.values()][0]).data;
  assert.deepEqual(saved.people,[]);
  assert.deepEqual(Object.keys(saved.town.buildings[0]).sort(),['n','trade','weight']);
  assert.ok(![...memory.values()][0].includes('private'));
});

test('a slow snapshot cannot overwrite the live feed',async t=>{
  setup(t); let resolveSnapshot;
  t.mock.method(globalThis,'fetch',async url=>url==='/world/data'
    ? response({...snapshot(),revision:'live'})
    : new Promise(resolve=>{resolveSnapshot=resolve;}));
  const received=[],feed=new Feed(d=>received.push(d));
  const seed=feed.seed();await feed.once();
  resolveSnapshot(response(snapshot()));await seed;
  assert.equal(received.length,1);assert.equal(feed.data.revision,'live');
});

test('a refresh can immediately seed the settlement from its local cache',async t=>{
  const memory=setup(t),first=new Feed(()=>{});
  first.accept(snapshot(),'published');
  t.mock.method(globalThis,'fetch',()=>{throw new Error('cache needs no network');});
  const received=[],feed=new Feed(d=>received.push(d));await feed.seed();
  assert.equal(feed.source,'cache');assert.equal(received.length,1);assert.equal(memory.size,1);
});

test('live collection waits until opening assets are ready',async t=>{
  setup(t);const requested=[];
  t.mock.method(globalThis,'fetch',async url=>{requested.push(url);return response(snapshot());});
  const feed=new Feed(()=>{});feed.start(10000);t.after(()=>feed.stop());
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requested,['state/settlement.json']);
  feed.beginLive();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(requested,['state/settlement.json','/world/data']);
  feed.beginLive();assert.equal(requested.length,2);
});
