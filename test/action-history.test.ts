import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ActionHistory } from '../src/action-history.js';

// --- recording -----------------------------------------------------------

test('a fresh history has nothing to undo or redo', () => {
  const history = new ActionHistory<string>();
  assert.deepEqual(history.counts(), { undoable: 0, redoable: 0 });
});

test('recording an action makes it available to undo', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  assert.equal(history.counts().undoable, 1);
});

test('recording does not itself return anything', () => {
  const history = new ActionHistory<string>();
  const result = history.record('a');
  assert.equal(result, undefined);
});

// --- undo ------------------------------------------------------------------

test('undo reverts the most recently recorded action', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  assert.equal(history.undo(), 'a');
});

test('undo steps backward in reverse recording order', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.record('b');
  history.record('c');
  assert.equal(history.undo(), 'c');
  assert.equal(history.undo(), 'b');
  assert.equal(history.undo(), 'a');
});

test('undo with nothing recorded returns undefined and is a no-op', () => {
  const history = new ActionHistory<string>();
  assert.equal(history.undo(), undefined);
  assert.deepEqual(history.counts(), { undoable: 0, redoable: 0 });
});

test('undoing everything then undoing again returns undefined', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.undo();
  assert.equal(history.undo(), undefined);
});

// --- redo ------------------------------------------------------------------

test('redo reapplies the action that was just undone', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.undo();
  assert.equal(history.redo(), 'a');
});

test('redo steps forward in the order actions were undone', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.record('b');
  history.record('c');
  history.undo();
  history.undo();
  history.undo();
  assert.equal(history.redo(), 'a');
  assert.equal(history.redo(), 'b');
  assert.equal(history.redo(), 'c');
});

test('redo with nothing undone returns undefined', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  assert.equal(history.redo(), undefined);
});

test('redo after everything has already been redone returns undefined', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.undo();
  history.redo();
  assert.equal(history.redo(), undefined);
});

// --- recording after undo ---------------------------------------------------

test('recording a new action after an undo discards the redo history', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.undo();
  history.record('b');
  assert.equal(history.redo(), undefined);
  assert.equal(history.counts().redoable, 0);
});

test('recording after several undos discards all of the redo history, not just one entry', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.record('b');
  history.record('c');
  history.undo();
  history.undo();
  history.undo();
  history.record('d');
  assert.deepEqual(history.counts(), { undoable: 1, redoable: 0 });
  assert.equal(history.redo(), undefined);
});

test('undoing then recording the same value again is a new entry, not a redo', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.undo();
  history.record('a');
  assert.deepEqual(history.counts(), { undoable: 1, redoable: 0 });
  assert.equal(history.redo(), undefined);
  assert.equal(history.undo(), 'a');
});

// --- counts -----------------------------------------------------------------

test('counts reflect undo and redo as they happen', () => {
  const history = new ActionHistory<string>();
  history.record('a');
  history.record('b');
  assert.deepEqual(history.counts(), { undoable: 2, redoable: 0 });
  history.undo();
  assert.deepEqual(history.counts(), { undoable: 1, redoable: 1 });
  history.redo();
  assert.deepEqual(history.counts(), { undoable: 2, redoable: 0 });
});
