import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canManage, canWrite, looksLikeEmail, otherRoles, sortMembers } from './teams.ts';

describe('team roles', () => {
  it('lets editors and owners write, and only owners manage', () => {
    assert.deepEqual([canWrite('viewer'), canWrite('editor'), canWrite('owner')], [false, true, true]);
    assert.deepEqual([canManage('viewer'), canManage('editor'), canManage('owner')], [false, false, true]);
  });

  it('sorts owners first, then by name or email', () => {
    const sorted = sortMembers([
      { role: 'viewer' as const, name: 'Zoe', email: null },
      { role: 'editor' as const, name: null, email: 'bob@example.com' },
      { role: 'owner' as const, name: 'Ann', email: null },
      { role: 'editor' as const, name: 'Al', email: null },
    ]);
    assert.deepEqual(sorted.map((m) => m.name ?? m.email), ['Ann', 'Al', 'bob@example.com', 'Zoe']);
  });

  it('offers the roles a member is not in yet', () => {
    assert.deepEqual(otherRoles('editor'), ['owner', 'viewer']);
  });

  it('recognises plausible emails', () => {
    assert.equal(looksLikeEmail(' ann@example.com '), true);
    assert.equal(looksLikeEmail('ann@example'), false);
    assert.equal(looksLikeEmail('ann example@x.com'), false);
  });
});
