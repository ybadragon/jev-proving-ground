import assert from "node:assert/strict";
import { test } from "node:test";
import { RetentionSweeper } from "../src/retention-sweeper.js";

test("adding a new key stores it and makes it readable", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "first", 100);

  assert.equal(sweeper.get("a"), "first");
  assert.equal(sweeper.has("a"), true);
  assert.equal(sweeper.size(), 1);
});

test("re-adding an existing key updates its value and timestamp without moving its position", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "first", 100);
  sweeper.add("b", "second", 200);
  sweeper.add("c", "third", 300);
  sweeper.add("a", "updated", 500);

  assert.deepEqual(sweeper.keys(), ["a", "b", "c"]);
  assert.equal(sweeper.get("a"), "updated");

  // the refreshed timestamp on "a" should apply for future sweeps
  const removed = sweeper.sweep(400);
  assert.deepEqual(removed, ["b", "c"]);
  assert.equal(sweeper.has("a"), true);
});

test("pin and unpin return false for a key that is not present and do not create it", () => {
  const sweeper = new RetentionSweeper<string>();

  assert.equal(sweeper.pin("missing"), false);
  assert.equal(sweeper.unpin("missing"), false);
  assert.equal(sweeper.has("missing"), false);
  assert.equal(sweeper.size(), 0);
});

test("pin and unpin return true for a key that exists", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "value", 100);

  assert.equal(sweeper.pin("a"), true);
  assert.equal(sweeper.unpin("a"), true);
});

test("entries start unpinned, so a fresh entry is swept once it ages out", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "value", 100);

  const removed = sweeper.sweep(200);

  assert.deepEqual(removed, ["a"]);
  assert.equal(sweeper.has("a"), false);
});

test("sweep removes every unpinned entry older than the cutoff", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("old1", "a", 100);
  sweeper.add("old2", "b", 150);
  sweeper.add("fresh", "c", 500);

  const removed = sweeper.sweep(300);

  assert.deepEqual(removed, ["old1", "old2"]);
  assert.equal(sweeper.has("old1"), false);
  assert.equal(sweeper.has("old2"), false);
  assert.equal(sweeper.has("fresh"), true);
});

test("an entry whose addedAt is exactly the cutoff is not removed", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "value", 200);

  const removed = sweeper.sweep(200);

  assert.deepEqual(removed, []);
  assert.equal(sweeper.has("a"), true);
});

test("a pinned entry survives a sweep even when other entries are removed", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("old", "stale", 100);
  sweeper.add("kept", "fresh", 500);
  sweeper.pin("kept");

  const removed = sweeper.sweep(300);

  assert.deepEqual(removed, ["old"]);
  assert.equal(sweeper.has("kept"), true);
  assert.equal(sweeper.get("kept"), "fresh");
});

test("a pinned entry survives a sweep however old it is, overriding its age entirely", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("old", "stale", 100);
  sweeper.pin("old");

  const removed = sweeper.sweep(10_000);

  assert.deepEqual(removed, []);
  assert.equal(sweeper.has("old"), true);
  assert.equal(sweeper.get("old"), "stale");
});

test("an entry that is unpinned after having been pinned becomes eligible for sweeping again", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "value", 100);
  sweeper.pin("a");
  sweeper.unpin("a");

  const removed = sweeper.sweep(200);

  assert.deepEqual(removed, ["a"]);
  assert.equal(sweeper.has("a"), false);
});

test("sweep returns removed keys in insertion order", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("c", "3", 100);
  sweeper.add("a", "1", 100);
  sweeper.add("b", "2", 100);

  const removed = sweeper.sweep(200);

  assert.deepEqual(removed, ["c", "a", "b"]);
});

test("sweep returns an empty array when nothing is removed", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("a", "value", 500);

  const removed = sweeper.sweep(100);

  assert.deepEqual(removed, []);
});

test("after a sweep, size, keys, has and get all reflect the removals consistently", () => {
  const sweeper = new RetentionSweeper<string>();
  sweeper.add("old", "stale", 100);
  sweeper.add("fresh", "new", 500);

  sweeper.sweep(300);

  assert.equal(sweeper.size(), 1);
  assert.deepEqual(sweeper.keys(), ["fresh"]);
  assert.equal(sweeper.has("old"), false);
  assert.equal(sweeper.get("old"), undefined);
  assert.equal(sweeper.has("fresh"), true);
  assert.equal(sweeper.get("fresh"), "new");
});
