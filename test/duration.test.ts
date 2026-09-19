import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDuration } from "../src/duration.js";

test("parses a single hour component", () => {
  assert.equal(parseDuration("2h"), 2 * 3_600_000);
});

test("parses a single minute component", () => {
  assert.equal(parseDuration("45m"), 45 * 60_000);
});

test("parses a single second component", () => {
  assert.equal(parseDuration("30s"), 30 * 1_000);
});

test("parses hours and minutes together", () => {
  assert.equal(parseDuration("1h30m"), 3_600_000 + 30 * 60_000);
});

test("parses hours, minutes and seconds together", () => {
  assert.equal(parseDuration("1h2m3s"), 3_600_000 + 2 * 60_000 + 3 * 1_000);
});

test("accepts components in any order", () => {
  assert.equal(parseDuration("30m1h"), parseDuration("1h30m"));
});

test("ignores whitespace around the string", () => {
  assert.equal(parseDuration("  1h30m  "), parseDuration("1h30m"));
});

test("ignores whitespace inside the string", () => {
  assert.equal(parseDuration("1h 30m"), parseDuration("1h30m"));
  assert.equal(parseDuration("1 h 30 m"), parseDuration("1h30m"));
});

test("sums repeated units instead of rejecting them", () => {
  assert.equal(parseDuration("1h1h"), 2 * 3_600_000);
});

test("returns a whole number of milliseconds", () => {
  assert.ok(Number.isInteger(parseDuration("1h2m3s")));
});

test("rejects a bare number with no unit", () => {
  assert.throws(() => parseDuration("30"));
});

test("rejects a trailing bare number after a valid component", () => {
  assert.throws(() => parseDuration("1h30"));
});

test("rejects a bare number mixed with valid components, even across whitespace", () => {
  assert.throws(() => parseDuration("30 1h"));
});

test("rejects digits split by whitespace from their own unit", () => {
  assert.throws(() => parseDuration("1 0h"));
});

test("rejects an empty string", () => {
  assert.throws(() => parseDuration(""));
});

test("rejects a whitespace-only string", () => {
  assert.throws(() => parseDuration("   "));
});

test("rejects malformed text", () => {
  assert.throws(() => parseDuration("abc"));
});

test("rejects an unsupported unit", () => {
  assert.throws(() => parseDuration("30x"));
  assert.throws(() => parseDuration("1d"));
});

test("rejects fractional units", () => {
  assert.throws(() => parseDuration("1.5h"));
});

test("rejects negative durations", () => {
  assert.throws(() => parseDuration("-1h"));
});

test("rejects trailing garbage after valid components", () => {
  assert.throws(() => parseDuration("1h30m!"));
});
