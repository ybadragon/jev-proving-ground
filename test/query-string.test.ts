import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQueryString } from '../src/query-string.js';

test('parses simple key-value pairs', () => {
  assert.deepEqual(parseQueryString('a=1&b=2'), { a: '1', b: '2' });
});

test('ignores a leading "?"', () => {
  assert.deepEqual(parseQueryString('?a=1&b=2'), { a: '1', b: '2' });
});

test('percent-decodes keys and values', () => {
  assert.deepEqual(parseQueryString('name=John%20Doe'), { name: 'John Doe' });
  assert.deepEqual(parseQueryString('a%26b=1'), { 'a&b': '1' });
});

test('decodes "+" as a space', () => {
  assert.deepEqual(parseQueryString('q=hello+world'), { q: 'hello world' });
});

test('a key with no "=" gets an empty string value', () => {
  assert.deepEqual(parseQueryString('a=1&flag&b=2'), { a: '1', flag: '', b: '2' });
});

test('a repeated key keeps every value, in order', () => {
  assert.deepEqual(parseQueryString('tag=a&tag=b'), { tag: ['a', 'b'] });
});

test('a key repeated three times keeps all three values', () => {
  assert.deepEqual(parseQueryString('tag=a&tag=b&tag=c'), { tag: ['a', 'b', 'c'] });
});

test('skips empty segments from consecutive or trailing "&"', () => {
  assert.deepEqual(parseQueryString('a=1&&b=2'), { a: '1', b: '2' });
  assert.deepEqual(parseQueryString('a=1&'), { a: '1' });
});

test('an empty string parses to an empty object', () => {
  assert.deepEqual(parseQueryString(''), {});
});

test('a lone "?" parses to an empty object', () => {
  assert.deepEqual(parseQueryString('?'), {});
});

test('values are never coerced away from strings', () => {
  const result = parseQueryString('count=3&active=true');
  assert.equal(result.count, '3');
  assert.equal(typeof result.count, 'string');
  assert.equal(result.active, 'true');
  assert.equal(typeof result.active, 'string');
});

test('does not throw on a stray "=" with nothing before it', () => {
  assert.doesNotThrow(() => parseQueryString('=foo'));
  assert.deepEqual(parseQueryString('=foo'), { '': 'foo' });
});

// Issue #16: the parser must degrade gracefully on malformed percent-escapes
// instead of letting decodeURIComponent's URIError propagate. Each row below
// exercises a different way a "%" can be malformed, in either the key or the
// value, plus the cases that pin down exactly how much of a component keeps
// decoding when only part of it is malformed.
test('degrades gracefully on malformed percent-escapes instead of throwing', () => {
  const cases: Array<[string, Record<string, string | string[]>]> = [
    // lone trailing "%"
    ['discount=50%', { discount: '50%' }],
    // truncated escape (one hex digit missing)
    ['a=100%A', { a: '100%A' }],
    // non-hex escape
    ['a=%zz', { a: '%zz' }],
    // malformed "%" in the KEY, not just the value
    ['50%=x', { '50%': 'x' }],
    // a valid escape and a stray "%" in the same component: only the
    // malformed run is left literal, the valid escape still decodes
    ['a=%20x%', { a: ' x%' }],
  ];

  for (const [input, expected] of cases) {
    assert.doesNotThrow(() => parseQueryString(input), `should not throw on ${JSON.stringify(input)}`);
    assert.deepEqual(parseQueryString(input), expected, `wrong result for ${JSON.stringify(input)}`);
  }
});

test('still percent-decodes valid escapes, including multi-byte UTF-8, around malformed ones', () => {
  assert.deepEqual(parseQueryString('name=John%20Doe'), { name: 'John Doe' });
  assert.deepEqual(parseQueryString('a%26b=1'), { 'a&b': '1' });
  assert.deepEqual(parseQueryString('a=%E2%9C%93'), { a: '✓' });
});

test('"+" still decodes to a space and "%2B" still decodes to a literal "+"', () => {
  assert.deepEqual(parseQueryString('q=hello+world'), { q: 'hello world' });
  assert.deepEqual(parseQueryString('a=%2B1'), { a: '+1' });
  assert.deepEqual(parseQueryString('a=50%+off'), { a: '50% off' });
});
