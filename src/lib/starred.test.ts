import assert from 'node:assert/strict';
import { test } from 'node:test';

import { starredFirst } from './starred.ts';

test('starred items come first, order kept inside each group', () => {
  const stars = new Set(['c', 'a']);
  assert.deepEqual(starredFirst(['a', 'b', 'c', 'd'], (n) => stars.has(n)), ['a', 'c', 'b', 'd']);
});

test('no stars leaves the order alone; input untouched', () => {
  const input = ['b', 'a'];
  assert.deepEqual(starredFirst(input, () => false), ['b', 'a']);
  assert.deepEqual(input, ['b', 'a']);
});
