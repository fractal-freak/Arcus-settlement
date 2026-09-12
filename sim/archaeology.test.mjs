import test from 'node:test';
import assert from 'node:assert/strict';
import { digSites, digFor, excavationCrew, PIT } from '../src/app/digs.js';
import { blocked } from '../src/app/occupied.js';
import { propStandsAt } from '../src/app/village.js';
import { naturalHeightAt, smoothHeightAt, WATER_LEVEL, STEP } from '../src/app/terrain.js';
import { Crowd } from '../src/app/crowd.js';

test('waiting and resting sessions stay in the excavation crew without falsifying their status', () => {
  const people = ['working', 'waiting', 'resting'].map(state => Object.freeze({ id: `test-${state}`, state }));
  assert.deepEqual(excavationCrew(people), people);
  assert.equal(excavationCrew([...people, people[0], null, { id: '' }]).length, 3);
  assert.deepEqual(excavationCrew([]), []); // Public worlds never invent private sessions.
});

test('dry trenches remain walkable below river level and cleared props do not block them', () => {
  let belowWaterline = 0;
  for (const site of digSites()) {
    assert.equal(propStandsAt(site.x, site.z), false, `${site.id}: excavated ruin is no longer standing`);
    assert.ok(naturalHeightAt(site.x, site.z) > WATER_LEVEL + STEP * .5);
    if (smoothHeightAt(site.x, site.z) < WATER_LEVEL + STEP * .5) belowWaterline++;
    const nearWater = naturalHeightAt(site.x, site.z) < WATER_LEVEL + STEP * .5 + .1;
    assert.equal(blocked(site.x, site.z, .6), nearWater, `${site.id}: only the natural water margin can block a cleared floor`);
  }
  assert.ok(belowWaterline > 0, 'exercise the water-height regression');
  assert.equal(blocked(0, -400, .6), true, 'real ocean remains blocked');
});

test('crew spawn inside their assigned cuts without overlapping or changing assignment', () => {
  const crowd = new Crowd();
  for (let i = 0; i < 64; i++) {
    const id = `excavation-test-${i}`, site = digFor(id);
    assert.deepEqual(digFor(id), site);
    const body = crowd.place(id, site, .6);
    assert.ok(body);
    assert.ok(Math.hypot(body.x - site.center.x, body.z - site.center.z) < PIT.r - .6);
    assert.equal(crowd.intersects(body.x, body.z, .6, id), false);
    assert.equal(blocked(body.x, body.z, .6), false);
  }
});
