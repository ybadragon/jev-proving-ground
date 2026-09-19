import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDueJobs, isDue, ScheduledJob } from '../src/scheduled-job';

const NOW = new Date('2024-01-01T12:00:00.000Z');

function job(overrides: Partial<ScheduledJob> = {}): ScheduledJob {
  return {
    id: 'job',
    intervalMs: 60_000,
    enabled: true,
    lastRunAt: null,
    ...overrides,
  };
}

test('a job that has never run is due immediately', () => {
  assert.equal(isDue(job({ lastRunAt: null }), NOW), true);
});

test('a job is not due before its interval has elapsed', () => {
  const lastRunAt = new Date(NOW.getTime() - 30_000);
  assert.equal(isDue(job({ intervalMs: 60_000, lastRunAt }), NOW), false);
});

test('a job is due exactly when its interval has elapsed', () => {
  const lastRunAt = new Date(NOW.getTime() - 60_000);
  assert.equal(isDue(job({ intervalMs: 60_000, lastRunAt }), NOW), true);
});

test('a job is due once more than its interval has elapsed', () => {
  const lastRunAt = new Date(NOW.getTime() - 90_000);
  assert.equal(isDue(job({ intervalMs: 60_000, lastRunAt }), NOW), true);
});

test('a disabled job is never due, no matter how long it has waited', () => {
  const lastRunAt = new Date(NOW.getTime() - 1_000_000_000);
  assert.equal(isDue(job({ enabled: false, lastRunAt }), NOW), false);
});

test('a disabled job that has never run is still never due', () => {
  assert.equal(isDue(job({ enabled: false, lastRunAt: null }), NOW), false);
});

test('getDueJobs excludes jobs that are not due', () => {
  const notDue = job({ id: 'not-due', lastRunAt: NOW });
  const due = job({ id: 'due', lastRunAt: null });
  const result = getDueJobs([notDue, due], NOW);
  assert.deepEqual(result.map((j) => j.id), ['due']);
});

test('getDueJobs excludes disabled jobs even when overdue', () => {
  const disabled = job({ id: 'disabled', enabled: false, lastRunAt: null });
  const result = getDueJobs([disabled], NOW);
  assert.deepEqual(result, []);
});

test('getDueJobs orders due jobs by longest waiting first', () => {
  const waitedLeast = job({ id: 'waited-least', lastRunAt: new Date(NOW.getTime() - 61_000) });
  const waitedMost = job({ id: 'waited-most', lastRunAt: new Date(NOW.getTime() - 600_000) });
  const waitedMiddle = job({ id: 'waited-middle', lastRunAt: new Date(NOW.getTime() - 120_000) });

  const result = getDueJobs([waitedLeast, waitedMost, waitedMiddle], NOW);

  assert.deepEqual(result.map((j) => j.id), ['waited-most', 'waited-middle', 'waited-least']);
});

test('a job that has never run outranks one that has, even if overdue', () => {
  const neverRun = job({ id: 'never-run', lastRunAt: null });
  const overdue = job({ id: 'overdue', lastRunAt: new Date(NOW.getTime() - 1_000_000_000) });

  const result = getDueJobs([overdue, neverRun], NOW);

  assert.deepEqual(result.map((j) => j.id), ['never-run', 'overdue']);
});

test('getDueJobs does not mutate the input array', () => {
  const jobs = [
    job({ id: 'a', lastRunAt: new Date(NOW.getTime() - 200_000) }),
    job({ id: 'b', lastRunAt: new Date(NOW.getTime() - 400_000) }),
  ];
  const original = [...jobs];

  getDueJobs(jobs, NOW);

  assert.deepEqual(jobs, original);
});
