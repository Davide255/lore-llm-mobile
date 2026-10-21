import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expiresIn } from './format.ts';

describe('expiresIn', () => {
  const now = new Date(2026, 5, 10, 15, 0).getTime();
  const at = (days: number, hour = 9) => new Date(2026, 5, 10 + days, hour, 0).toISOString();

  it('counts calendar days, not 24-hour blocks', () => {
    assert.equal(expiresIn(at(0, 23), now), 'scade oggi');
    assert.equal(expiresIn(at(1, 8), now), 'scade domani');
    assert.equal(expiresIn(at(14), now), 'scade tra 14 giorni');
  });

  it('reports invitations that are over', () => {
    assert.equal(expiresIn(at(0, 9), now), 'scaduto');
    assert.equal(expiresIn(at(-3), now), 'scaduto');
  });
});
