import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fromWire, parseProjectKey, projectLabel, teamOf, teamProjectKey, toWire } from './paths.ts';

describe('team project keys', () => {
  it('builds and parses keys; personal projects have no team', () => {
    assert.equal(teamProjectKey('Piano 2026', 'abc-1'), 'Piano 2026@abc-1');
    assert.deepEqual(parseProjectKey('Piano 2026@abc-1'), { name: 'Piano 2026', teamId: 'abc-1' });
    assert.deepEqual(parseProjectKey('Piano 2026'), { name: 'Piano 2026', teamId: null });
    assert.deepEqual(parseProjectKey('@x'), { name: '@x', teamId: null });
  });

  it('reads the team and label from any path inside the project', () => {
    assert.equal(teamOf('Alpha@t1/docs/a.md'), 't1');
    assert.equal(teamOf('Alpha/docs/a.md'), null);
    assert.equal(projectLabel('Alpha@t1/docs/a.md'), 'Alpha');
    assert.equal(projectLabel('Alpha/docs/a.md'), 'Alpha');
  });

  it('translates to the server owner and path, and back', () => {
    assert.deepEqual(toWire('Alpha@t1/docs/a.md'), { owner: 't:t1', path: 'Alpha/docs/a.md' });
    assert.deepEqual(toWire('Alpha@t1'), { owner: 't:t1', path: 'Alpha' });
    assert.deepEqual(toWire('Alpha/docs/a.md'), { owner: null, path: 'Alpha/docs/a.md' });
    assert.equal(fromWire('t1', 'Alpha/docs/a.md'), 'Alpha@t1/docs/a.md');
    assert.equal(fromWire(null, 'Alpha/docs/a.md'), 'Alpha/docs/a.md');
    assert.equal(fromWire('t1', toWire('Alpha@t1/x.md').path), 'Alpha@t1/x.md');
  });
});
