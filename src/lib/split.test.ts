import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ancestors, isSplitLayout, sidebarSelection } from './split.ts';

describe('isSplitLayout', () => {
  it('gives an iPad the sidebar in both orientations', () => {
    assert.equal(isSplitLayout(820, 1180), true);
    assert.equal(isSplitLayout(1180, 820), true);
    assert.equal(isSplitLayout(744, 1133), true);
  });

  it('keeps phones on the tab bar, even in landscape', () => {
    assert.equal(isSplitLayout(393, 852), false);
    assert.equal(isSplitLayout(932, 430), false);
  });

  it('falls back to tabs when an iPad window is narrowed', () => {
    assert.equal(isSplitLayout(320, 1180), false);
    assert.equal(isSplitLayout(678, 1180), false);
  });
});

describe('sidebarSelection', () => {
  it('maps tab routes to their section', () => {
    assert.deepEqual(sidebarSelection('/'), { section: 'projects', path: null });
    assert.deepEqual(sidebarSelection('/search'), { section: 'search', path: null });
    assert.deepEqual(sidebarSelection('/activity'), { section: 'activity', path: null });
    assert.deepEqual(sidebarSelection('/change/42'), { section: 'activity', path: null });
    assert.deepEqual(sidebarSelection('/settings'), { section: 'settings', path: null });
    assert.deepEqual(sidebarSelection('/agent/a1'), { section: 'settings', path: null });
  });

  it('selects the file or folder being shown', () => {
    assert.deepEqual(sidebarSelection('/folder/Lore'), { section: 'projects', path: 'Lore' });
    assert.deepEqual(sidebarSelection('/file/Lore/docs/a%20b.md'), { section: 'projects', path: 'Lore/docs/a b.md' });
    assert.deepEqual(sidebarSelection('/edit/Lore/x.md'), { section: 'projects', path: 'Lore/x.md' });
  });

  it('highlights nothing for modals', () => {
    assert.deepEqual(sidebarSelection('/new-project'), { section: null, path: null });
  });
});

describe('ancestors', () => {
  it('lists the containing folders, outermost first', () => {
    assert.deepEqual(ancestors('a/b/c.md'), ['a', 'a/b']);
    assert.deepEqual(ancestors('a'), []);
  });
});
