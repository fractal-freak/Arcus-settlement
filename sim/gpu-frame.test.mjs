import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { finishGpuFrame } from './gpu-frame.mjs';

function renderer(statuses) {
  const calls = [];
  const fence = {};
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 1, ALREADY_SIGNALED: 2,
    CONDITION_SATISFIED: 3, TIMEOUT_EXPIRED: 4, WAIT_FAILED: 5,
    fenceSync: () => fence,
    flush: () => calls.push('flush'),
    clientWaitSync: () => statuses.shift() ?? 4,
    deleteSync: value => { assert.equal(value, fence); calls.push('delete'); },
  };
  const window = { __world: { stage: { renderer: { getContext: () => gl } } } };
  const page = { evaluate: async fn => runInNewContext(`(${fn})()`, { window }) };
  return { page, window, calls };
}

test('frame completion waits through pending work and releases its GPU fence', async () => {
  const r = renderer([4, 3]);
  await finishGpuFrame(r.page);
  assert.deepEqual(r.calls, ['flush', 'delete']);
  assert.equal('__worldFrameFence' in r.window, false);
});

test('a failed GPU fence refuses the check and still releases the resource', async () => {
  const r = renderer([5]);
  await assert.rejects(finishGpuFrame(r.page), /fence failed/);
  assert.deepEqual(r.calls, ['flush', 'delete']);
});

test('unfinished GPU work has a finite deadline and cannot silently pass', async () => {
  const r = renderer([4]);
  await assert.rejects(finishGpuFrame(r.page, { timeout: 0 }), /did not finish/);
  assert.deepEqual(r.calls, ['flush', 'delete']);
});
