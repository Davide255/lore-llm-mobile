import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_FILES, UNSUPPORTED_TYPE, cleanName, percent, planUpload, uniqueName } from './upload-plan.ts';

const none = () => false;
const MB = 1024 * 1024;

describe('planUpload', () => {
  it('accepts notes and the attachment types under the target folder', () => {
    const plan = planUpload('Proj/docs', [
      { name: 'a.md', size: 10 },
      { name: 'Photo.PNG', size: 2 * MB },
      { name: 'scan.pdf', size: 3 * MB },
    ], none);
    assert.deepEqual(plan.ok.map((f) => [f.rel, f.kind]), [
      ['Proj/docs/a.md', 'note'],
      ['Proj/docs/Photo.PNG', 'attachment'],
      ['Proj/docs/scan.pdf', 'attachment'],
    ]);
    assert.deepEqual(plan.skipped, []);
  });

  it('skips unsupported types, empty files and files over the limits, saying why', () => {
    const plan = planUpload('P', [
      { name: 'clip.mp4', size: 5 },
      { name: 'empty.png', size: 0 },
      { name: 'long.md', size: MB + 1 },
      { name: 'noext', size: 5 },
      { name: 'unread.png', size: 5, skip: 'Non leggibile' },
    ], none);
    assert.deepEqual(plan.ok, []);
    assert.deepEqual(plan.skipped.map((s) => s.reason), [
      UNSUPPORTED_TYPE,
      'File vuoto',
      'Più grande di 1 MB',
      'Nome non valido',
      'Non leggibile',
    ]);
  });

  it('allows attachments of any size and notes up to 1 MB', () => {
    const plan = planUpload('P', [{ name: 'a.png', size: 500 * MB }, { name: 'a.md', size: MB }], none);
    assert.equal(plan.ok.length, 2);
  });

  it('renames on conflicts, with files already there and with files planned earlier', () => {
    const taken = new Set(['P/a.png']);
    const plan = planUpload('P', [
      { name: 'a.png', size: 1 },
      { name: 'a.png', size: 1 },
      { name: 'b.md', size: 1 },
      { name: 'b.md', size: 1 },
    ], (rel) => taken.has(rel));
    assert.deepEqual(plan.ok.map((f) => f.rel), ['P/a 2.png', 'P/a 3.png', 'P/b.md', 'P/b 2.md']);
  });

  it('keeps the sub-folders of a folder pick and drops hidden entries without reporting them', () => {
    const plan = planUpload('P', [
      { name: 'a.md', size: 1, dir: 'trip' },
      { name: 'b.png', size: 1, dir: 'trip/day 1' },
      { name: '.DS_Store', size: 1, dir: 'trip' },
      { name: 'c.md', size: 1, dir: 'trip/.git' },
    ], none);
    assert.deepEqual(plan.ok.map((f) => f.rel), ['P/trip/a.md', 'P/trip/day 1/b.png']);
    assert.deepEqual(plan.skipped, []);
  });

  it('stops at the file limit and reports the rest', () => {
    const files = Array.from({ length: MAX_FILES + 2 }, (_, i) => ({ name: `n${i}.md`, size: 1 }));
    const plan = planUpload('P', files, none);
    assert.equal(plan.ok.length, MAX_FILES);
    assert.equal(plan.skipped.length, 2);
    assert.match(plan.skipped[0].reason, /Oltre il limite/);
  });

  it('refuses names that are too long', () => {
    const plan = planUpload('P', [{ name: `${'x'.repeat(130)}.md`, size: 1 }], none);
    assert.deepEqual(plan.skipped.map((s) => s.reason), ['Nome troppo lungo']);
  });

  it('keeps indexes pointing at the picked files', () => {
    const plan = planUpload('P', [{ name: 'x.exe', size: 1 }, { name: 'ok.md', size: 1 }], none);
    assert.deepEqual(plan.ok.map((f) => f.index), [1]);
  });
});

describe('names and progress', () => {
  it('cleans names', () => {
    assert.equal(cleanName('a/b\\c:d?.md'), 'cd.md');
    assert.equal(cleanName('..hidden.md'), 'hidden.md');
    assert.equal(uniqueName('P', 'a.md', (r) => r === 'P/a.md'), 'a 2.md');
  });

  it('computes a clamped percentage', () => {
    assert.equal(percent(0, 100), 0);
    assert.equal(percent(50, 200), 25);
    assert.equal(percent(99.9, 100), 99);
    assert.equal(percent(150, 100), 100);
    assert.equal(percent(5, 0), 0);
  });
});
