import { test } from "node:test";
import assert from "node:assert/strict";
import { mergePreferences } from "../src/mergePreferences.js";

test("a preference the user has set wins over the default", () => {
  const defaults = { theme: "light", pageSize: 10 };
  const preferences = { theme: "dark" };

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, { theme: "dark", pageSize: 10 });
});

test("a preference the user has not set falls back to the default", () => {
  const defaults = { theme: "light", pageSize: 10 };
  const preferences = {};

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, { theme: "light", pageSize: 10 });
});

test("nested objects merge key by key instead of being replaced wholesale", () => {
  const defaults = {
    notifications: { email: true, sms: false, push: true },
  };
  const preferences = {
    notifications: { sms: true },
  };

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, {
    notifications: { email: true, sms: true, push: true },
  });
});

test("an explicit null falls back to the default value for that key", () => {
  const defaults = { theme: "light" };
  const preferences = { theme: null };

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, { theme: "light" });
});

test("an explicit null on a nested key falls back to the nested default", () => {
  const defaults = { notifications: { email: true, sms: false } };
  const preferences = { notifications: { email: null } };

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, { notifications: { email: true, sms: false } });
});

test("arrays are treated as plain values and are not merged element by element", () => {
  const defaults = { tags: ["a", "b", "c"] };
  const preferences = { tags: ["x"] };

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, { tags: ["x"] });
});

test("the defaults object is never modified", () => {
  const defaults = { theme: "light", notifications: { email: true } };
  const preferences = { theme: "dark", notifications: { email: false } };

  mergePreferences(defaults, preferences);

  assert.deepEqual(defaults, { theme: "light", notifications: { email: true } });
});

test("preferences not present in defaults are still applied", () => {
  const defaults = { theme: "light" };
  const preferences = { locale: "en-US" };

  const result = mergePreferences(defaults, preferences);

  assert.deepEqual(result, { theme: "light", locale: "en-US" });
});
