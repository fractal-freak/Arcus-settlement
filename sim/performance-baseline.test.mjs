import test from 'node:test';
import assert from 'node:assert/strict';
import {baselineScope, comparableBaseline} from './performance-baseline.mjs';
test('only matching runner jobs and backends share timing baselines', () => {
  const env = {CI:'true', GITHUB_RUN_ID:'10', GITHUB_RUN_ATTEMPT:'1', GITHUB_JOB:'live'};
  const report = {backend:'SwiftShader', scope:baselineScope(env)};
  assert.equal(comparableBaseline({...report}, report), true);
  for (const changed of [{GITHUB_RUN_ID:'11'}, {GITHUB_RUN_ATTEMPT:'2'}, {GITHUB_JOB:'validate'}]) {
    assert.equal(comparableBaseline({...report, scope:baselineScope({...env, ...changed})}, report), false);
  }
  assert.equal(comparableBaseline({backend:'SwiftShader'}, report), false);
  assert.equal(comparableBaseline({...report, backend:'Metal'}, report), false);
  assert.equal(baselineScope({}), 'local');
  assert.throws(() => baselineScope({CI:'true'}), /identity/);
});
