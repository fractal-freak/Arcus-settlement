import test from 'node:test';
import assert from 'node:assert/strict';
import {plainTask,plainEvent,eventCategory,storiesFor,socialSummary,goalFor} from '../src/app/journalData.js';
import {citizenProfile,TOPICS} from '../src/app/conversations.js';

test('vague project language becomes concrete without inventing a completion',()=>{
 assert.equal(plainTask('to gather the yard around one thing'),'group barrels, crates and supplies into a storage area in a yard');
 assert.equal(plainTask('to build a new bridge'),'build a new bridge');
 const text=plainEvent('Ana could find no ground left to gather the yard around one thing.');
 assert.match(text,/could find no ground/);assert.match(text,/barrels, crates and supplies/);
 assert.match(goalFor('composition').reason,/yards/);
 assert.equal(goalFor('future',[{key:'future',name:'New goal',why:'A future rule.'}]).reason,'A future rule.');
});
test('story filters keep relationships separate from work and preserve participant identity',()=>{
 const feud={kind:'feud',who:[2,4],text:'A and B fell out over a fence.'};
 const work={kind:'work',who:[2],text:'A finished a garden.'};
 const life={chronicle:[work,feud,{kind:'find',who:[3]}]};
 assert.deepEqual(storiesFor(life,2,'life'),[feud]);
 assert.equal(eventCategory(work),'improvements');
 assert.equal(eventCategory(life.chronicle[2]),'discoveries');
 assert.deepEqual(storiesFor(life,8),[]);
});
test('citizen social conversation uses recorded partner and story without inventing friend names',()=>{
 const e={kind:'feud',who:[7,8],text:'Cal and Fen fell out over the well rota.'};
 const p=citizenProfile(7,{name:'Cal',partner:'Jora',friends:3,feuds:1},[e]);
 assert.equal(p.relationships,'Partner: Jora · 3 friends · 1 rivalry');
 assert.match(TOPICS.find(t=>t.id==='story').reply(p),/Cal and Fen fell out over the well rota/);
 assert.match(TOPICS.find(t=>t.id==='neighbours').reply(p),/Jora/);
 assert.equal(citizenProfile(99,{},[e]).recentStory,undefined);
 assert.equal(socialSummary({}),'No partner recorded');
});
