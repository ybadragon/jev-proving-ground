import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../src/redact.js";

test("redacts a password assignment but keeps the first four characters", () => {
  const input = "config: password=Sup3rSecretValue!";
  const output = redactSecrets(input);

  assert.ok(!output.includes("Sup3rSecretValue!"));
  assert.match(output, /password=Sup3\*\*\*REDACTED\*\*\*/);
});

test("redacts an api key assignment", () => {
  const input = 'api_key: "abcd1234efgh5678"';
  const output = redactSecrets(input);

  assert.ok(!output.includes("abcd1234efgh5678"));
  assert.match(output, /abcd\*\*\*REDACTED\*\*\*/);
});

test("redacts a bearer token in an Authorization header", () => {
  const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";
  const output = redactSecrets(input);

  assert.ok(!output.includes("eyJhbGciOiJIUzI1NiJ9.payload.signature"));
  assert.match(output, /Bearer eyJh\*\*\*REDACTED\*\*\*/);
});

test("redacts known secret formats like AWS access key IDs", () => {
  const input = "aws_access_key_id = AKIAABCDEFGHIJKLMNOP";
  const output = redactSecrets(input);

  assert.ok(!output.includes("AKIAABCDEFGHIJKLMNOP"));
  assert.match(output, /AKIA\*\*\*REDACTED\*\*\*/);
});

test("redacts multiple distinct secrets in the same blob", () => {
  const input = [
    "password=first-secret-value",
    "api_key=another-secret-value",
  ].join("\n");
  const output = redactSecrets(input);

  assert.ok(!output.includes("first-secret-value"));
  assert.ok(!output.includes("another-secret-value"));
});

test("redacts every occurrence of the same secret value, not just the first", () => {
  const input = [
    "password=repeated-secret-value",
    "backup password=repeated-secret-value",
  ].join("\n");
  const output = redactSecrets(input);

  assert.ok(!output.includes("repeated-secret-value"));
  const occurrences = output.match(/repe\*\*\*REDACTED\*\*\*/g) ?? [];
  assert.equal(occurrences.length, 2);
});

test("returns text with nothing sensitive byte-identical", () => {
  const input = "User logged in successfully from 10.0.0.5 at 12:00pm.";
  const output = redactSecrets(input);

  assert.equal(output, input);
});

test("leaves ordinary key=value pairs that are not secrets untouched", () => {
  const input = "region=us-east-1 retries=3 timeout=30s";
  const output = redactSecrets(input);

  assert.equal(output, input);
});

test("never throws on non-string input", () => {
  assert.doesNotThrow(() => redactSecrets(null as unknown as string));
  assert.doesNotThrow(() => redactSecrets(undefined as unknown as string));
  assert.doesNotThrow(() => redactSecrets(12345 as unknown as string));
});

test("never throws on empty or whitespace-only input", () => {
  assert.equal(redactSecrets(""), "");
  assert.equal(redactSecrets("   \n\t  "), "   \n\t  ");
});
