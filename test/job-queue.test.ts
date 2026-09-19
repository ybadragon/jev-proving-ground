import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from '../src/job-queue.js';

const NOW = new Date('2024-01-01T12:00:00.000Z');

// --- submitting ---------------------------------------------------------

test('submitting a job returns an id', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 0);
});

test('a submitted job starts queued', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  assert.equal(queue.get(id)?.state, 'queued');
});

test('two submissions get different ids', () => {
  const queue = new JobQueue();
  const first = queue.submit('a');
  const second = queue.submit('b');
  assert.notEqual(first, second);
});

test('rejects a non-finite priority', () => {
  const queue = new JobQueue();
  assert.throws(() => queue.submit('payload', { priority: NaN }), RangeError);
  assert.throws(() => queue.submit('payload', { priority: Infinity }), RangeError);
});

test('rejects a negative retry limit', () => {
  const queue = new JobQueue();
  assert.throws(() => queue.submit('payload', { retryLimit: -1 }), RangeError);
});

test('rejects a non-integer retry limit', () => {
  const queue = new JobQueue();
  assert.throws(() => queue.submit('payload', { retryLimit: 1.5 }), RangeError);
});

// --- claiming ------------------------------------------------------------

test('claiming hands out a queued job and moves it to running', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');

  const claimed = queue.claim(NOW);

  assert.equal(claimed?.id, id);
  assert.equal(claimed?.payload, 'payload');
  assert.equal(queue.get(id)?.state, 'running');
});

test('claiming returns undefined when there is nothing queued', () => {
  const queue = new JobQueue();
  assert.equal(queue.claim(NOW), undefined);
});

test('claiming returns undefined once every job has already been claimed', () => {
  const queue = new JobQueue();
  queue.submit('payload');

  queue.claim(NOW);

  assert.equal(queue.claim(NOW), undefined);
});

test('a claimed job is never handed to a second worker', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');

  const first = queue.claim(NOW);
  const second = queue.claim(NOW);

  assert.equal(first?.id, id);
  assert.equal(second, undefined);
});

test('a higher priority job is claimed before a lower priority job', () => {
  const queue = new JobQueue();
  const low = queue.submit('low', { priority: 1 });
  const high = queue.submit('high', { priority: 5 });

  const claimed = queue.claim(NOW);

  assert.equal(claimed?.id, high);
  assert.notEqual(claimed?.id, low);
});

test('jobs of equal priority are claimed oldest first', () => {
  const queue = new JobQueue();
  const first = queue.submit('first', { priority: 3 });
  const second = queue.submit('second', { priority: 3 });

  assert.equal(queue.claim(NOW)?.id, first);
  assert.equal(queue.claim(NOW)?.id, second);
});

test('priority takes precedence over submission order', () => {
  const queue = new JobQueue();
  const submittedFirst = queue.submit('first', { priority: 0 });
  const submittedSecond = queue.submit('second', { priority: 10 });
  const submittedThird = queue.submit('third', { priority: 0 });

  assert.equal(queue.claim(NOW)?.id, submittedSecond);
  assert.equal(queue.claim(NOW)?.id, submittedFirst);
  assert.equal(queue.claim(NOW)?.id, submittedThird);
});

test('a job left queued by a retry can be claimed again ahead of newer jobs of the same priority', () => {
  const queue = new JobQueue();
  const retried = queue.submit('retried', { retryLimit: 1 });
  queue.claim(NOW);
  queue.fail(retried, new Error('boom'));

  const newer = queue.submit('newer');

  assert.equal(queue.claim(NOW)?.id, retried);
  assert.equal(queue.claim(NOW)?.id, newer);
});

// --- completing ------------------------------------------------------------

test('completing a running job records its result and moves it to done', () => {
  const queue = new JobQueue<string, number>();
  const id = queue.submit('payload');
  queue.claim(NOW);

  const ok = queue.complete(id, 42);

  assert.equal(ok, true);
  const job = queue.get(id);
  assert.equal(job?.state, 'done');
  assert.equal(job?.result, 42);
});

test('completing clears the claimed-at timestamp', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);

  queue.complete(id, 'result');

  assert.equal(queue.get(id)?.claimedAt, null);
});

test('completing an unknown id returns false', () => {
  const queue = new JobQueue();
  assert.equal(queue.complete('does-not-exist', 'result'), false);
});

test('completing a job that has not been claimed returns false and leaves it queued', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');

  const ok = queue.complete(id, 'result');

  assert.equal(ok, false);
  assert.equal(queue.get(id)?.state, 'queued');
});

test('completing an already-completed job a second time returns false', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);
  queue.complete(id, 'first');

  const ok = queue.complete(id, 'second');

  assert.equal(ok, false);
  assert.equal(queue.get(id)?.result, 'first');
});

// --- failing and retries ---------------------------------------------------

test('failing a job with no retries left moves it straight to failed', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);

  const ok = queue.fail(id, new Error('boom'));

  assert.equal(ok, true);
  const job = queue.get(id);
  assert.equal(job?.state, 'failed');
  assert.equal(job?.error instanceof Error && job.error.message, 'boom');
  assert.equal(job?.failureCount, 1);
});

test('failing a job under its retry limit sends it back to queued instead of failed', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload', { retryLimit: 2 });
  queue.claim(NOW);

  queue.fail(id, new Error('boom'));

  const job = queue.get(id);
  assert.equal(job?.state, 'queued');
  assert.equal(job?.failureCount, 1);
});

test('a retried job can be claimed and worked on again', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload', { retryLimit: 1 });
  queue.claim(NOW);
  queue.fail(id, new Error('boom'));

  const claimed = queue.claim(NOW);

  assert.equal(claimed?.id, id);
  assert.equal(queue.get(id)?.state, 'running');
});

test('a job is left failed once it has failed as many times as its retry limit allows', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload', { retryLimit: 2 });

  queue.claim(NOW);
  queue.fail(id, new Error('first'));
  queue.claim(NOW);
  queue.fail(id, new Error('second'));
  queue.claim(NOW);
  queue.fail(id, new Error('third'));

  const job = queue.get(id);
  assert.equal(job?.state, 'failed');
  assert.equal(job?.failureCount, 3);
});

test('failing records the error even on the attempt that gets retried', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload', { retryLimit: 1 });
  queue.claim(NOW);

  queue.fail(id, 'temporary glitch');

  assert.equal(queue.get(id)?.error, 'temporary glitch');
});

test('failing clears the claimed-at timestamp', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);

  queue.fail(id, new Error('boom'));

  assert.equal(queue.get(id)?.claimedAt, null);
});

test('failing an unknown id returns false', () => {
  const queue = new JobQueue();
  assert.equal(queue.fail('does-not-exist', new Error('boom')), false);
});

test('failing a job that has not been claimed returns false and leaves it queued', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');

  const ok = queue.fail(id, new Error('boom'));

  assert.equal(ok, false);
  assert.equal(queue.get(id)?.state, 'queued');
});

test('failing an already-failed job a second time returns false', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);
  queue.fail(id, new Error('first'));

  const ok = queue.fail(id, new Error('second'));

  assert.equal(ok, false);
});

// --- reading -----------------------------------------------------------

test('looking up an unknown id returns undefined rather than throwing', () => {
  const queue = new JobQueue();
  assert.equal(queue.get('does-not-exist'), undefined);
});

test('counts reports how many jobs are in each state', () => {
  const queue = new JobQueue();

  const running = queue.submit('running');
  queue.claim(NOW);

  const done = queue.submit('done');
  queue.claim(NOW);
  queue.complete(done, 'result');

  const failed = queue.submit('failed');
  queue.claim(NOW);
  queue.fail(failed, new Error('boom'));

  queue.submit('queued');

  assert.equal(queue.get(running)?.state, 'running');
  assert.deepEqual(queue.counts(), { queued: 1, running: 1, done: 1, failed: 1 });
});

test('counts on an empty queue are all zero', () => {
  const queue = new JobQueue();
  assert.deepEqual(queue.counts(), { queued: 0, running: 0, done: 0, failed: 0 });
});

test('listing jobs returns them newest first', () => {
  const queue = new JobQueue();
  const first = queue.submit('first');
  const second = queue.submit('second');
  const third = queue.submit('third');

  const ids = queue.list().map((job) => job.id);

  assert.deepEqual(ids, [third, second, first]);
});

test('list reflects the current state of every job, not just queued ones', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);
  queue.complete(id, 'result');

  const [job] = queue.list();

  assert.equal(job.state, 'done');
  assert.equal(job.result, 'result');
});

// --- housekeeping --------------------------------------------------------

test('a job claimed longer than the timeout is reaped back to queued', () => {
  const queue = new JobQueue({ claimTimeoutMs: 1000 });
  const id = queue.submit('payload');
  queue.claim(NOW);

  const later = new Date(NOW.getTime() + 2000);
  const reaped = queue.reapAbandoned(later);

  assert.deepEqual(reaped, [id]);
  const job = queue.get(id);
  assert.equal(job?.state, 'queued');
  assert.equal(job?.claimedAt, null);
});

test('a job claimed within the timeout is left running', () => {
  const queue = new JobQueue({ claimTimeoutMs: 1000 });
  const id = queue.submit('payload');
  queue.claim(NOW);

  const stillHeld = new Date(NOW.getTime() + 500);
  const reaped = queue.reapAbandoned(stillHeld);

  assert.deepEqual(reaped, []);
  assert.equal(queue.get(id)?.state, 'running');
});

test('reaping never touches a queued, done, or failed job', () => {
  const queue = new JobQueue({ claimTimeoutMs: 1000 });

  const done = queue.submit('done');
  queue.claim(NOW);
  queue.complete(done, 'result');

  const failed = queue.submit('failed');
  queue.claim(NOW);
  queue.fail(failed, new Error('boom'));

  const queued = queue.submit('queued');

  const later = new Date(NOW.getTime() + 5000);
  const reaped = queue.reapAbandoned(later);

  assert.deepEqual(reaped, []);
  assert.equal(queue.get(queued)?.state, 'queued');
  assert.equal(queue.get(done)?.state, 'done');
  assert.equal(queue.get(failed)?.state, 'failed');
});

test('a reaped job can be claimed by a different worker', () => {
  const queue = new JobQueue({ claimTimeoutMs: 1000 });
  const id = queue.submit('payload');
  queue.claim(NOW);

  const later = new Date(NOW.getTime() + 2000);
  queue.reapAbandoned(later);

  const claimedAgain = queue.claim(later);
  assert.equal(claimedAgain?.id, id);
});

test('a job can be reaped and reclaimed repeatedly', () => {
  const queue = new JobQueue({ claimTimeoutMs: 1000 });
  const id = queue.submit('payload', { retryLimit: 0 });

  for (let i = 0; i < 5; i++) {
    queue.claim(NOW);
    queue.reapAbandoned(new Date(NOW.getTime() + 2000));
  }

  assert.equal(queue.get(id)?.state, 'queued');
});

test('with no timeout configured, reaping never abandons a running job', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);

  const muchLater = new Date(NOW.getTime() + 1000 * 60 * 60 * 24 * 365);
  const reaped = queue.reapAbandoned(muchLater);

  assert.deepEqual(reaped, []);
  assert.equal(queue.get(id)?.state, 'running');
});

test('rejects a non-positive claim timeout', () => {
  assert.throws(() => new JobQueue({ claimTimeoutMs: 0 }), RangeError);
  assert.throws(() => new JobQueue({ claimTimeoutMs: -5 }), RangeError);
  assert.throws(() => new JobQueue({ claimTimeoutMs: NaN }), RangeError);
});

// --- purging ---------------------------------------------------------------

test('purging removes done and failed jobs and reports how many were removed', () => {
  const queue = new JobQueue();
  const done = queue.submit('done');
  const failed = queue.submit('failed');
  queue.claim(NOW);
  queue.complete(done, 'result');
  queue.claim(NOW);
  queue.fail(failed, new Error('boom'));

  const removed = queue.purge();

  assert.equal(removed, 2);
  assert.equal(queue.get(done), undefined);
  assert.equal(queue.get(failed), undefined);
});

test('purging never removes a queued job', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');

  queue.purge();

  assert.equal(queue.get(id)?.state, 'queued');
});

test('purging never removes a running job', () => {
  const queue = new JobQueue();
  const id = queue.submit('payload');
  queue.claim(NOW);

  queue.purge();

  assert.equal(queue.get(id)?.state, 'running');
});

test('purging an empty or already-clean queue removes nothing', () => {
  const queue = new JobQueue();
  queue.submit('payload');

  assert.equal(queue.purge(), 0);
});
