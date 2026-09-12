import test from 'node:test';
import assert from 'node:assert/strict';
import { citizenProject } from '../src/app/citizenProjects.js';
import { citizenProfile, TOPICS } from '../src/app/conversations.js';

test('saved assignments reach citizen conversations and refresh on a new feed',()=>{
  const resident={name:'Calen',want:'to plant a garden',dim:'green',progress:.42,finished:3};
  const profile=citizenProfile(7,resident);
  assert.deepEqual(profile.project,{task:'plant a garden',dimension:'green',progress:.42,percent:42,finished:3});
  const reply=TOPICS.find(t=>t.id==='project').reply;
  assert.match(reply(profile),/plant a garden.*42%.*3 projects/);
  assert.match(reply(citizenProfile(7,{...resident,want:'to mend a fence',progress:0})),/mend a fence.*0%/);
});
test('missing or invalid assignments do not invent work or progress',()=>{
  assert.equal(citizenProject(),null);
  assert.equal(citizenProject({want:'  '}),null);
  assert.equal(citizenProject({want:'to plant',progress:NaN}).percent,0);
  assert.equal(citizenProject({want:'to plant',progress:2}).percent,100);
});
