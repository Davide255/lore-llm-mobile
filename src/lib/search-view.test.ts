import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cleanSnippet, folderTrail, groupByProject, noteTitle, visibleSnippet } from './search-view.ts';

describe('cleanSnippet', () => {
  it('drops a heading marker and shifts highlights', () => {
    assert.deepEqual(cleanSnippet({ text: '# Pasta al pomodoro', highlights: [[2, 7]] }), { text: 'Pasta al pomodoro', highlights: [[0, 5]] });
  });
  it('drops task and list markers', () => {
    assert.deepEqual(cleanSnippet({ text: '- [x] Passaporto', highlights: [[6, 10]] }), { text: 'Passaporto', highlights: [[0, 4]] });
    assert.equal(cleanSnippet({ text: '> 1. citazione', highlights: [] }).text, 'citazione');
  });
  it('keeps a leading ellipsis and plain text untouched', () => {
    const plain = { text: '…to in autunno: pasta', highlights: [[16, 21]] as [number, number][] };
    assert.deepEqual(cleanSnippet(plain), plain);
  });
});

describe('labels', () => {
  it('titles and folders', () => {
    assert.equal(noteTitle('pasta.md'), 'pasta');
    assert.equal(folderTrail('P/a/b/n.md'), 'a / b');
    assert.equal(folderTrail('P/n.md'), '');
  });
});

describe('groupByProject', () => {
  it('keeps rank order of groups and hits', () => {
    const h = (path: string, project: string) => ({ path, project }) as never;
    const g = groupByProject([h('A/1', 'A'), h('B/1', 'B'), h('A/2', 'A')]);
    assert.deepEqual(g.map((x) => [x.project, x.hits.length]), [['A', 2], ['B', 1]]);
  });
});

describe('visibleSnippet', () => {
  it('hides a snippet that is only the file name or its title', () => {
    assert.equal(visibleSnippet({ name: 'home.md', snippet: { text: 'home.md', highlights: [] } }), null);
    assert.equal(visibleSnippet({ name: 'home.md', snippet: { text: '# Home', highlights: [] } }), null);
    assert.equal(visibleSnippet({ name: 'home.md', snippet: { text: 'Testo della home', highlights: [] } })?.text, 'Testo della home');
  });
});
