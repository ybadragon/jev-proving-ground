import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureFlags } from '../src/feature-flags.js';

test('an undefined flag reads as false for any user', () => {
  const flags = new FeatureFlags();
  assert.equal(flags.isEnabled('missing', 'alice'), false);
});

test('setOverride on an undefined flag returns false and does not define it', () => {
  const flags = new FeatureFlags();
  assert.equal(flags.setOverride('missing', 'alice', true), false);
  assert.equal(flags.isDefined('missing'), false);
});

test('clearOverride, disableGlobally, and enableGlobally all return false for an undefined flag', () => {
  const flags = new FeatureFlags();
  assert.equal(flags.clearOverride('missing', 'alice'), false);
  assert.equal(flags.disableGlobally('missing'), false);
  assert.equal(flags.enableGlobally('missing'), false);
});

test('with no override, isEnabled returns the flag default', () => {
  const flags = new FeatureFlags();
  flags.define('flag-on', true);
  flags.define('flag-off', false);

  assert.equal(flags.isEnabled('flag-on', 'alice'), true);
  assert.equal(flags.isEnabled('flag-off', 'alice'), false);
});

test('a user override takes precedence over the default, in both directions', () => {
  const flags = new FeatureFlags();
  flags.define('flag-on', true);
  flags.define('flag-off', false);

  flags.setOverride('flag-on', 'alice', false);
  flags.setOverride('flag-off', 'bob', true);

  assert.equal(flags.isEnabled('flag-on', 'alice'), false);
  assert.equal(flags.isEnabled('flag-off', 'bob'), true);

  assert.equal(flags.isEnabled('flag-on', 'carol'), true);
  assert.equal(flags.isEnabled('flag-off', 'carol'), false);
});

test('a globally disabled flag overrides a user override set to true', () => {
  const flags = new FeatureFlags();
  flags.define('flag', false);
  flags.setOverride('flag', 'alice', true);

  flags.disableGlobally('flag');

  assert.equal(flags.isEnabled('flag', 'alice'), false);
});

test('a globally disabled flag reads as false for users with no override', () => {
  const flags = new FeatureFlags();
  flags.define('flag', true);

  flags.disableGlobally('flag');

  assert.equal(flags.isEnabled('flag', 'alice'), false);
});

test('re-enabling globally restores previous behaviour with overrides intact', () => {
  const flags = new FeatureFlags();
  flags.define('flag', true);
  flags.setOverride('flag', 'alice', false);

  flags.disableGlobally('flag');
  flags.enableGlobally('flag');

  assert.equal(flags.isEnabled('flag', 'alice'), false);
  assert.equal(flags.isEnabled('flag', 'bob'), true);
});

test('disableGlobally and enableGlobally return true for a defined flag', () => {
  const flags = new FeatureFlags();
  flags.define('flag', true);

  assert.equal(flags.disableGlobally('flag'), true);
  assert.equal(flags.enableGlobally('flag'), true);
});

test('clearOverride returns the user to the flag default', () => {
  const flags = new FeatureFlags();
  flags.define('flag', true);
  flags.setOverride('flag', 'alice', false);

  assert.equal(flags.isEnabled('flag', 'alice'), false);

  flags.clearOverride('flag', 'alice');

  assert.equal(flags.isEnabled('flag', 'alice'), true);
});

test('clearing an override that does not exist returns true as long as the flag is defined', () => {
  const flags = new FeatureFlags();
  flags.define('flag', true);

  assert.equal(flags.clearOverride('flag', 'alice'), true);
});

test('redefining an existing flag replaces its default without disturbing overrides or global state', () => {
  const flags = new FeatureFlags();
  flags.define('flag', true);
  flags.setOverride('flag', 'alice', false);
  flags.disableGlobally('flag');

  flags.define('flag', false);

  assert.equal(flags.isDefined('flag'), true);
  assert.equal(flags.isEnabled('flag', 'alice'), false);

  flags.enableGlobally('flag');
  assert.equal(flags.isEnabled('flag', 'alice'), false);
  assert.equal(flags.isEnabled('flag', 'bob'), false);
});

test('flags lists defined flag names in first-definition order', () => {
  const flags = new FeatureFlags();
  flags.define('third', true);
  flags.define('first', true);
  flags.define('second', true);
  flags.define('first', false);

  assert.deepEqual(flags.flags(), ['third', 'first', 'second']);
});

test('isDefined reflects whether a flag has been defined', () => {
  const flags = new FeatureFlags();
  assert.equal(flags.isDefined('flag'), false);

  flags.define('flag', true);
  assert.equal(flags.isDefined('flag'), true);
});
