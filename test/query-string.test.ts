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
