import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Leaderboard } from '../src/leaderboard.js';

test('rejects a non-positive capacity', () => {
  assert.throws(() => new Leaderboard(0), RangeError);
  assert.throws(() => new Leaderboard(-1), RangeError);
});

test('rejects a non-integer capacity', () => {
  assert.throws(() => new Leaderboard(1.5), RangeError);
});

test('every submission is accepted while under capacity', () => {
  const board = new Leaderboard(3);
  assert.equal(board.submit('a', 10), true);
  assert.equal(board.submit('b', 20), true);
  assert.equal(board.size(), 2);
});

test('size reflects the number of entries currently on the board', () => {
  const board = new Leaderboard(5);
  board.submit('a', 1);
  board.submit('b', 2);
  board.submit('c', 3);
  assert.equal(board.size(), 3);
});

test('a score that strictly exceeds the lowest score is accepted at capacity', () => {
  const board = new Leaderboard(2);
  board.submit('a', 10);
  board.submit('b', 20);
  assert.equal(board.submit('c', 15), true);
  assert.equal(board.size(), 2);
});

test('accepting a new score at capacity evicts the current lowest entry', () => {
  const board = new Leaderboard(2);
  board.submit('a', 10);
  board.submit('b', 20);
  board.submit('c', 15);
  assert.deepEqual(
    board.top().map((e) => e.id),
    ['b', 'c'],
  );
});

test('a score that is strictly lower than the lowest score is rejected', () => {
  const board = new Leaderboard(2);
  board.submit('a', 10);
  board.submit('b', 20);
  assert.equal(board.submit('c', 5), false);
});

test('a rejected submission leaves the board completely unchanged', () => {
  const board = new Leaderboard(2);
  board.submit('a', 10);
  board.submit('b', 20);
  board.submit('c', 5);
  assert.deepEqual(
    board.top().map((e) => ({ id: e.id, score: e.score })),
    [
      { id: 'b', score: 20 },
      { id: 'a', score: 10 },
    ],
  );
  assert.equal(board.size(), 2);
});

test('when the lowest score is tied, the longest-standing entry is evicted first', () => {
  const board = new Leaderboard(3);
  board.submit('a', 10);
  board.submit('b', 10);
  board.submit('c', 30);
  board.submit('d', 20);
  assert.deepEqual(
    board.top().map((e) => e.id),
    ['c', 'd', 'b'],
  );
});

test('top orders entries from highest score to lowest', () => {
  const board = new Leaderboard(3);
  board.submit('a', 5);
  board.submit('b', 25);
  board.submit('c', 15);
  assert.deepEqual(
    board.top().map((e) => e.id),
    ['b', 'c', 'a'],
  );
});

test('top breaks ties on score by submission order, earliest first', () => {
  const board = new Leaderboard(3);
  board.submit('a', 10);
  board.submit('b', 10);
  board.submit('c', 10);
  assert.deepEqual(
    board.top().map((e) => e.id),
    ['a', 'b', 'c'],
  );
});

test('the same id can be submitted more than once as independent entries', () => {
  const board = new Leaderboard(3);
  board.submit('a', 10);
  board.submit('a', 20);
  assert.equal(board.size(), 2);
  assert.deepEqual(
    board.top().map((e) => e.score),
    [20, 10],
  );
});

test('a capacity of one keeps only the single best score', () => {
  const board = new Leaderboard(1);
  board.submit('a', 10);
  assert.equal(board.submit('b', 5), false);
  assert.equal(board.submit('c', 15), true);
  assert.deepEqual(
    board.top().map((e) => e.id),
    ['c'],
  );
});
