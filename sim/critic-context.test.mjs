import test from 'node:test';
import assert from 'node:assert/strict';
import { criticContext } from './critic-context.mjs';

test('critic receives actual scores and tag counts from the published nested feed', () => {
  const quality = { scores: { composition: 0.4 }, weakest: 'composition', overall: 0.4 };
  const life = { quality, placements: [{ tag: 'edge' }, { tag: 'edge' }, { tag: 'tall' }] };
  const expected = { quality, byTag: { edge: 2, tall: 1 } };
  assert.deepEqual(criticContext({ life, people: [{ title: 'private' }] }), expected);
  assert.deepEqual(criticContext(life), expected);
});

test('missing world facts fail explicitly instead of sending a blind design brief', () => {
  assert.throws(() => criticContext({ life: {} }), /missing settlement/);
});
