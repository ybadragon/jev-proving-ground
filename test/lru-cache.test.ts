import assert from "node:assert/strict";
import { test } from "node:test";
import { LRUCache } from "../src/lru-cache.js";

test("get on a missing key returns undefined and counts a miss", () => {
  const cache = new LRUCache<string, number>(2);

  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.misses, 1);
});

test("get on a present key returns its value and does not count a miss", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);

  assert.equal(cache.get("a"), 1);
  assert.equal(cache.misses, 0);
});

test("set on an existing key updates the value", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);
  cache.set("a", 2);

  assert.equal(cache.get("a"), 2);
});

test("adding a new key beyond capacity evicts the least recently used entry", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3); // "a" was least recently used and gets evicted

  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("reading a key protects it from eviction as the most recently used", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.get("a"); // "a" is now more recently used than "b"
  cache.set("c", 3); // "b" is now least recently used and gets evicted

  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
});

test("writing to an existing key counts as a use and protects it from eviction", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("a", 10); // updating "a" refreshes its recency
  cache.set("c", 3); // "b" is now least recently used and gets evicted

  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 10);
  assert.equal(cache.get("c"), 3);
});

test("misses accumulate across repeated calls for keys that are not present", () => {
  const cache = new LRUCache<string, number>(1);
  cache.set("a", 1);

  cache.get("missing");
  cache.get("missing");
  cache.get("a");
  cache.get("also-missing");

  assert.equal(cache.misses, 3);
});

test("a cache with a capacity of zero stores nothing and always misses", () => {
  const cache = new LRUCache<string, number>(0);
  cache.set("a", 1);

  assert.equal(cache.size, 0);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.misses, 1);

  cache.get("a");
  assert.equal(cache.misses, 2);
});

test("size reflects the number of entries currently stored", () => {
  const cache = new LRUCache<string, number>(2);

  assert.equal(cache.size, 0);
  cache.set("a", 1);
  assert.equal(cache.size, 1);
  cache.set("b", 2);
  assert.equal(cache.size, 2);
  cache.set("c", 3); // evicts one entry, so size stays at capacity
  assert.equal(cache.size, 2);
});

test("has returns true for a present key and false for an absent one", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);

  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("missing"), false);
});

test("has does not count as a miss for an absent key", () => {
  const cache = new LRUCache<string, number>(2);

  cache.has("missing");
  cache.has("missing");

  assert.equal(cache.misses, 0);
});

test("has does not refresh a key's recency the way get does", () => {
  const cache = new LRUCache<string, number>(2);
  cache.set("a", 1);
  cache.set("b", 2);
  cache.has("a"); // must NOT protect "a" from eviction
  cache.set("c", 3); // "a" is still least recently used and should be evicted

  assert.equal(cache.has("a"), false);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("c"), 3);
});

test("has on a key evicted after a has() check reflects the eviction", () => {
  const cache = new LRUCache<string, number>(1);
  cache.set("a", 1);
  cache.set("b", 2); // evicts "a"

  assert.equal(cache.has("a"), false);
  assert.equal(cache.has("b"), true);
});

test("constructing with a negative or non-integer capacity throws", () => {
  assert.throws(() => new LRUCache<string, number>(-1), RangeError);
  assert.throws(() => new LRUCache<string, number>(1.5), RangeError);
});
