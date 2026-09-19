import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../src/rate-limiter.js';

const NOW = new Date('2024-01-01T12:00:00.000Z');

test('a caller never seen before is allowed', () => {
  const limiter = new RateLimiter(3, 60_000);
  assert.equal(limiter.allow('caller', NOW), true);
});

test('a caller is refused once its allowance is used up', () => {
  const limiter = new RateLimiter(3, 60_000);
  assert.equal(limiter.allow('caller', NOW), true);
  assert.equal(limiter.allow('caller', NOW), true);
  assert.equal(limiter.allow('caller', NOW), true);
  assert.equal(limiter.allow('caller', NOW), true);
  assert.equal(limiter.allow('caller', NOW), false);
});

test('a caller stays refused for the rest of the window once refused', () => {
  const limiter = new RateLimiter(1, 60_000);
  limiter.allow('caller', NOW);
  limiter.allow('caller', NOW);
  assert.equal(limiter.allow('caller', NOW), false);

  const stillWithinWindow = new Date(NOW.getTime() + 30_000);
  assert.equal(limiter.allow('caller', stillWithinWindow), false);
});

test('a caller is allowed again once the window has elapsed', () => {
  const limiter = new RateLimiter(1, 60_000);
  limiter.allow('caller', NOW);
  limiter.allow('caller', NOW);
  assert.equal(limiter.allow('caller', NOW), false);

  const nextWindow = new Date(NOW.getTime() + 60_000);
  assert.equal(limiter.allow('caller', nextWindow), true);
});

test('each caller is tracked separately', () => {
  const limiter = new RateLimiter(1, 60_000);
  limiter.allow('exhausted', NOW);
  limiter.allow('exhausted', NOW);
  assert.equal(limiter.allow('exhausted', NOW), false);

  assert.equal(limiter.allow('fresh', NOW), true);
});

test('one caller exhausting its allowance does not affect another caller', () => {
  const limiter = new RateLimiter(1, 60_000);
  limiter.allow('a', NOW);
  limiter.allow('a', NOW);
  assert.equal(limiter.allow('a', NOW), false);

  assert.equal(limiter.allow('b', NOW), true);
  assert.equal(limiter.allow('b', NOW), true);
  assert.equal(limiter.allow('b', NOW), false);
});

test('rejects a negative maximum', () => {
  assert.throws(() => new RateLimiter(-1, 60_000), RangeError);
});

test('rejects a non-positive window', () => {
  assert.throws(() => new RateLimiter(3, 0), RangeError);
});
