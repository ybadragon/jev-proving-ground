import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAddress } from "../src/address-validator.js";

test("trims leading and trailing whitespace before validating", () => {
  const result = validateAddress("   123 Main St   ");
  assert.deepEqual(result, { valid: true, normalized: "123 Main St" });
});

test("collapses internal runs of whitespace to a single space", () => {
  const result = validateAddress("123    Main   St");
  assert.deepEqual(result, { valid: true, normalized: "123 Main St" });
});

test("rejects an address with no street number", () => {
  const result = validateAddress("Main St");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "address is missing a street number");
});

test("rejects a bare number with nothing after it", () => {
  const result = validateAddress("123");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "address is missing a street number");
});

test("title-cases ordinary words", () => {
  const result = validateAddress("123 main st");
  assert.deepEqual(result, { valid: true, normalized: "123 Main St" });
});

test("forces directional abbreviations to upper case regardless of input casing", () => {
  const result = validateAddress("123 ne elm st");
  assert.deepEqual(result, { valid: true, normalized: "123 NE Elm St" });
});

test("leaves an already-correct directional abbreviation unchanged", () => {
  const result = validateAddress("123 NE Elm St");
  assert.deepEqual(result, { valid: true, normalized: "123 NE Elm St" });
});

test("rejects an address containing an unsupported character", () => {
  const result = validateAddress("123 Main St!");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "address contains unsupported characters");
});

test("allows #, period, comma and hyphen alongside letters and digits", () => {
  const result = validateAddress("123 Main St, Apt #4");
  assert.deepEqual(result, { valid: true, normalized: "123 Main St, Apt #4" });
});

test("rejects an empty string", () => {
  const result = validateAddress("");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "address is empty");
});

test("rejects a whitespace-only string", () => {
  const result = validateAddress("   ");
  assert.equal(result.valid, false);
  assert.equal(result.reason, "address is empty");
});

test("never throws, even on malformed or unusual input", () => {
  assert.doesNotThrow(() => validateAddress("123 Main St 🎉"));
  assert.doesNotThrow(() => validateAddress("!!!"));
  assert.doesNotThrow(() => validateAddress("-".repeat(500)));
});

test("returns the same result for the same input across repeated calls", () => {
  const first = validateAddress("123 main st");
  const second = validateAddress("123 main st");
  assert.deepEqual(first, second);
});

test("never throws on non-string runtime input, such as data parsed from a request body", () => {
  const nonStringInputs: unknown[] = [null, undefined, 42, {}, []];
  for (const input of nonStringInputs) {
    let result: ReturnType<typeof validateAddress> | undefined;
    assert.doesNotThrow(() => {
      result = validateAddress(input as unknown as string);
    });
    assert.deepEqual(result, {
      valid: false,
      reason: "address is not a string",
    });
  }
});
