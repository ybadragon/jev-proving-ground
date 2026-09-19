import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWithRetry } from '../src/retry-policy.js';

/** A sleep stand-in that resolves immediately but still records what it was asked to wait. */
function instantSleep(recordedDelays: number[]): (ms: number) => Promise<void> {
  return async (ms: number) => {
    recordedDelays.push(ms);
  };
}

function failTimes(times: number, error: unknown = new Error('boom')): () => Promise<never> {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls <= times) {
      throw error;
    }
    throw new Error('failTimes called more than configured');
  };
}

test('an operation that succeeds on the first try is not retried', async () => {
  let calls = 0;
  const result = await runWithRetry(
    async () => {
      calls += 1;
      return 'ok';
    },
    { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 1000, sleep: instantSleep([]) },
  );

  assert.equal(calls, 1);
  assert.deepEqual(result, { outcome: 'succeeded', value: 'ok', attempts: 1 });
});

test('an operation that fails is retried until it succeeds', async () => {
  let calls = 0;
  const result = await runWithRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error('not yet');
      }
      return 'recovered';
    },
    { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 1000, sleep: instantSleep([]) },
  );

  assert.equal(calls, 3);
  assert.deepEqual(result, { outcome: 'succeeded', value: 'recovered', attempts: 3 });
});

test('an operation that fails every time is attempted exactly maxAttempts times', async () => {
  let calls = 0;
  await runWithRetry(
    async () => {
      calls += 1;
      throw new Error('always fails');
    },
    { maxAttempts: 4, baseDelayMs: 10, maxDelayMs: 1000, sleep: instantSleep([]) },
  );

  assert.equal(calls, 4);
});

test('giving up reports the most recent failure rather than swallowing it', async () => {
  const finalError = new Error('final failure');
  let calls = 0;
  const result = await runWithRetry(
    async () => {
      calls += 1;
      throw calls === 3 ? finalError : new Error('earlier failure');
    },
    { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 1000, sleep: instantSleep([]) },
  );

  assert.equal(result.outcome, 'gaveUp');
  assert.equal((result as { error: unknown }).error, finalError);
  assert.equal((result as { attempts: number }).attempts, 3);
});

test('the result shape distinguishes eventual success from giving up', async () => {
  const succeeded = await runWithRetry(async () => 'value', {
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 1000,
    sleep: instantSleep([]),
  });
  const gaveUp = await runWithRetry(failTimes(10), {
    maxAttempts: 2,
    baseDelayMs: 10,
    maxDelayMs: 1000,
    sleep: instantSleep([]),
  });

  assert.equal(succeeded.outcome, 'succeeded');
  assert.equal(gaveUp.outcome, 'gaveUp');
  assert.ok(!('value' in gaveUp));
  assert.ok(!('error' in succeeded));
});

test('the delay before each retry matches the documented curve: base, 2x, 4x, 8x', async () => {
  const delays: number[] = [];
  await runWithRetry(failTimes(10), {
    maxAttempts: 5,
    baseDelayMs: 100,
    maxDelayMs: 100_000,
    random: () => 1,
    sleep: instantSleep(delays),
  });

  assert.deepEqual(delays, [100, 200, 400, 800]);
});

test('the delay before each retry grows rather than staying constant', async () => {
  const delays: number[] = [];
  await runWithRetry(failTimes(10), {
    maxAttempts: 5,
    baseDelayMs: 10,
    maxDelayMs: 100_000,
    random: () => 1,
    sleep: instantSleep(delays),
  });

  assert.equal(delays.length, 4);
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(delays[i] > delays[i - 1], `expected delay ${delays[i]} to exceed ${delays[i - 1]}`);
  }
});

test('the delay never exceeds the configured maximum, even after many attempts', async () => {
  const delays: number[] = [];
  await runWithRetry(failTimes(20), {
    maxAttempts: 15,
    baseDelayMs: 10,
    maxDelayMs: 500,
    random: () => 1,
    sleep: instantSleep(delays),
  });

  assert.ok(delays.length > 0);
  for (const delay of delays) {
    assert.ok(delay <= 500, `expected delay ${delay} to be at most 500`);
  }
});

test('jitter means the delay is not the same every time under identical failures', async () => {
  const randomValues = [0.9, 0.1, 0.5];
  let index = 0;
  const delays: number[] = [];

  await runWithRetry(failTimes(10), {
    maxAttempts: 4,
    baseDelayMs: 1000,
    maxDelayMs: 1000,
    random: () => randomValues[index++],
    sleep: instantSleep(delays),
  });

  const distinctDelays = new Set(delays);
  assert.ok(distinctDelays.size > 1, 'expected jitter to produce varying delays');
});

test('a caller is notified before each retry with the attempt number and previous error', async () => {
  const notifications: Array<{ attempt: number; error: unknown }> = [];
  const secondError = new Error('second failure');
  let calls = 0;

  await runWithRetry(
    async () => {
      calls += 1;
      if (calls === 1) throw new Error('first failure');
      if (calls === 2) throw secondError;
      return 'done';
    },
    {
      maxAttempts: 5,
      baseDelayMs: 10,
      maxDelayMs: 1000,
      sleep: instantSleep([]),
      onRetry: (info) => notifications.push({ attempt: info.attempt, error: info.error }),
    },
  );

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0].attempt, 2);
  assert.equal(notifications[1].attempt, 3);
  assert.equal(notifications[1].error, secondError);
});

test('a caller is not notified before the first attempt', async () => {
  const notifications: unknown[] = [];
  await runWithRetry(async () => 'ok', {
    maxAttempts: 3,
    baseDelayMs: 10,
    maxDelayMs: 1000,
    sleep: instantSleep([]),
    onRetry: (info) => notifications.push(info),
  });

  assert.equal(notifications.length, 0);
});

test('rejects a non-positive maxAttempts', async () => {
  await assert.rejects(
    runWithRetry(async () => 'ok', { maxAttempts: 0, baseDelayMs: 10, maxDelayMs: 100 }),
    RangeError,
  );
});

test('rejects a maxDelayMs smaller than baseDelayMs', async () => {
  await assert.rejects(
    runWithRetry(async () => 'ok', { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 10 }),
    RangeError,
  );
});
