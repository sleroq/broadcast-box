import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeStreamKey } from '../src/fork/moq/config.ts';
import { readPreference, savePreference } from '../src/fork/moq/preference.ts';
import { playerHeight } from '../src/fork/moq/layout.ts';
import { Adaptation } from '../src/fork/moq/playback.ts';

test('custom latency remains fixed and bounded while named profiles retain defaults', () => {
  assert.deepEqual(['auto', 'low', 'balanced', 'resilient', 'custom'].map(profile => new Adaptation(profile).delay), [500, 250, 750, 1500, 500]);
  assert.equal(new Adaptation('custom', 1).delay, 100);
  assert.equal(new Adaptation('custom', 5000).delay, 2000);
  const custom = new Adaptation('custom', 900);
  custom.sample(0, true, true);
  assert.equal(custom.sample(10000, true, true), 900);
});

test('player height preserves WebRTC geometry and includes MoQ controls', () => {
  assert.equal(playerHeight(1600), 900);
  assert.equal(playerHeight(1512, { aspectRatio: 1512 / 982, controlsHeight: 32 }), 982 + 32);
  assert.equal(playerHeight(756, { aspectRatio: 1512 / 982, controlsHeight: 56 }), 491 + 56);
});

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
