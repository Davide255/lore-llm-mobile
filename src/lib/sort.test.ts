import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { FileEntry, FolderEntry } from '../api/types.ts';
import { sortEntries } from './sort.ts';

const file = (name: string, size: number, updatedAt: string) => ({ kind: 'file', name, size, updatedAt }) as FileEntry;
const folder = (name: string, fileCount: number, updatedAt: string) => ({ kind: 'folder', name, fileCount, updatedAt }) as FolderEntry;

const files = [file('b.md', 20, '2026-01-02T00:00:00Z'), file('a10.md', 5, '2026-01-03T00:00:00Z'), file('a2.md', 5, '2026-01-01T00:00:00Z')];
const names = (l: { name: string }[]) => l.map((e) => e.name);

test('sorts by name, numbers naturally', () => {
  assert.deepEqual(names(sortEntries(files, 'name-asc')), ['a2.md', 'a10.md', 'b.md']);
  assert.deepEqual(names(sortEntries(files, 'name-desc')), ['b.md', 'a10.md', 'a2.md']);
});

test('sorts by date', () => {
  assert.deepEqual(names(sortEntries(files, 'date-desc')), ['a10.md', 'b.md', 'a2.md']);
  assert.deepEqual(names(sortEntries(files, 'date-asc')), ['a2.md', 'b.md', 'a10.md']);
});

test('sorts by size, ties by name; folders by file count; input untouched', () => {
  assert.deepEqual(names(sortEntries(files, 'size-desc')), ['b.md', 'a2.md', 'a10.md']);
  assert.deepEqual(names(sortEntries([folder('x', 1, ''), folder('y', 9, '')], 'size-desc')), ['y', 'x']);
  assert.equal(files[0].name, 'b.md');
});
