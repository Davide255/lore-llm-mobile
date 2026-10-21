import assert from 'node:assert/strict';
import test from 'node:test';

import { formatOtaVersion } from './ota-version.ts';

test('formatOtaVersion shortens the date-and-sha suffix', () => {
  assert.equal(formatOtaVersion('1.0.0-ota.d20261008t0626.g7c3fc46'), '08/10 · 7c3fc46');
});

test('formatOtaVersion leaves plain versions alone', () => {
  assert.equal(formatOtaVersion('1.0.1'), '1.0.1');
});
