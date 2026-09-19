import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../src/session-store.js';

const NOW = new Date('2024-01-01T12:00:00.000Z');

test('creating a session returns an id that can look it up again', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const session = store.get(id, NOW);
  assert.ok(session !== undefined);
  assert.equal(session.userId, 'user-1');
});

test('each created session gets its own unique id', () => {
  const store = new SessionStore();
  const first = store.create('user-1', 60_000, NOW);
  const second = store.create('user-1', 60_000, NOW);

  assert.notEqual(first, second);
});

test('looking up an id that was never created returns nothing', () => {
  const store = new SessionStore();
  assert.equal(store.get('does-not-exist', NOW), undefined);
});

test('a session is still active just before its TTL elapses', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const justBefore = new Date(NOW.getTime() + 59_999);
  assert.notEqual(store.get(id, justBefore), undefined);
});

test('a session expires exactly when its TTL has elapsed', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const exactlyElapsed = new Date(NOW.getTime() + 60_000);
  assert.equal(store.get(id, exactlyElapsed), undefined);
});

test('a session is gone once its TTL has clearly elapsed', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const wellAfter = new Date(NOW.getTime() + 120_000);
  assert.equal(store.get(id, wellAfter), undefined);
});

test('refreshing an active session keeps it active past its original expiry', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const refreshTime = new Date(NOW.getTime() + 30_000);
  assert.equal(store.refresh(id, refreshTime), true);

  const pastOriginalExpiry = new Date(NOW.getTime() + 70_000);
  assert.notEqual(store.get(id, pastOriginalExpiry), undefined);
});

test('refreshing measures the new TTL from the refresh call, not from creation', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const refreshTime = new Date(NOW.getTime() + 30_000);
  store.refresh(id, refreshTime);

  const pastNewExpiry = new Date(refreshTime.getTime() + 60_001);
  assert.equal(store.get(id, pastNewExpiry), undefined);
});

test('refreshing an unknown session id reports nothing to refresh', () => {
  const store = new SessionStore();
  assert.equal(store.refresh('does-not-exist', NOW), false);
});

test('refreshing an already-expired session does not resurrect it', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const wellAfterExpiry = new Date(NOW.getTime() + 120_000);
  assert.equal(store.refresh(id, wellAfterExpiry), false);
  assert.equal(store.get(id, wellAfterExpiry), undefined);
});

test('refreshing at the exact instant a session expires does not resurrect it', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  const exactlyElapsed = new Date(NOW.getTime() + 60_000);
  assert.equal(store.refresh(id, exactlyElapsed), false);
  assert.equal(store.get(id, exactlyElapsed), undefined);
});

test('revoking a session makes it unavailable immediately, even before its TTL elapses', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  store.revoke(id);
  assert.equal(store.get(id, NOW), undefined);
});

test('revoking an unknown session id does not throw', () => {
  const store = new SessionStore();
  assert.doesNotThrow(() => store.revoke('does-not-exist'));
});

test('revoking an already-revoked session id does not throw', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);

  store.revoke(id);
  assert.doesNotThrow(() => store.revoke(id));
});

test('active count reflects sessions created so far', () => {
  const store = new SessionStore();
  store.create('user-1', 60_000, NOW);
  store.create('user-2', 60_000, NOW);

  assert.equal(store.activeCount(NOW), 2);
});

test('active count drops when a session is revoked', () => {
  const store = new SessionStore();
  const id = store.create('user-1', 60_000, NOW);
  store.create('user-2', 60_000, NOW);

  store.revoke(id);
  assert.equal(store.activeCount(NOW), 1);
});

test('active count drops when a session naturally expires', () => {
  const store = new SessionStore();
  store.create('user-1', 30_000, NOW);
  store.create('user-2', 60_000, NOW);

  const partway = new Date(NOW.getTime() + 45_000);
  assert.equal(store.activeCount(partway), 1);
});

test('a user can hold multiple independent sessions', () => {
  const store = new SessionStore();
  const first = store.create('user-1', 30_000, NOW);
  const second = store.create('user-1', 60_000, NOW);

  store.revoke(first);

  assert.equal(store.get(first, NOW), undefined);
  assert.notEqual(store.get(second, NOW), undefined);
  assert.equal(store.activeCount(NOW), 1);
});
