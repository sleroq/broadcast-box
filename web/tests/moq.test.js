import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeStreamKey } from '../src/fork/moq/config.ts';
import { readPreference, savePreference } from '../src/fork/moq/preference.ts';

test('stream preferences persist independently using normalized keys', () => {
  const values = new Map();
  Object.assign(globalThis, { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  const main = normalizeStreamKey('ma%69n');
  const other = normalizeStreamKey('other%20stream');
  savePreference(main, 'moq');
  assert.equal(readPreference('main'), 'moq');
  assert.equal(readPreference(other), 'webrtc');
  savePreference(other, 'moq');
  savePreference(main, 'webrtc');
  assert.equal(readPreference(other), 'moq');
  assert.equal(main, 'main');
  assert.equal(normalizeStreamKey('other.hang'), 'other.hang');
  assert.equal(other, 'other_stream');
  Object.assign(globalThis, { localStorage: { getItem: () => { throw new Error('unavailable'); }, setItem: () => { throw new Error('unavailable'); } } });
  assert.equal(readPreference(main), 'webrtc');
  assert.doesNotThrow(() => savePreference(main, 'moq'));
});
