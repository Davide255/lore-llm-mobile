import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MAX_WALK, walkFolder, type WalkDir, type WalkFile } from './folder-walk.ts';
import { planUpload } from './upload-plan.ts';

const file = (name: string, size = 1): WalkFile => ({ name, uri: `file:///${name}`, size });
const dir = (name: string, ...children: (WalkFile | WalkDir)[]): WalkDir => ({ name, list: () => children });

describe('walkFolder', () => {
  it('lists every file with its folder inside the picked one, picked folder name first', () => {
    const root = dir('trip', file('b.md'), dir('day 1', file('c.png')), file('a.md'));
    assert.deepEqual(
      walkFolder(root).map((f) => `${f.dir}/${f.name}`),
      ['trip/a.md', 'trip/b.md', 'trip/day 1/c.png'],
    );
  });

  it('does not enter hidden folders or list hidden files', () => {
    let entered = false;
    const hidden: WalkDir = { name: '.git', list: () => ((entered = true), [file('x.md')]) };
    const root = dir('p', hidden, file('.DS_Store'), file('a.md'));
    assert.deepEqual(walkFolder(root).map((f) => f.name), ['a.md']);
    assert.equal(entered, false);
  });

  it('leaves out a folder it cannot read and stops at the limit', () => {
    const broken: WalkDir = { name: 'locked', list: () => { throw new Error('denied'); } };
    assert.deepEqual(walkFolder(dir('p', broken, file('a.md'))).map((f) => f.name), ['a.md']);
    const many = dir('p', ...Array.from({ length: MAX_WALK + 10 }, (_, i) => file(`n${i}.md`)));
    assert.equal(walkFolder(many).length, MAX_WALK);
  });

  it('feeds planUpload so the picked folder lands under the target', () => {
    const picked = walkFolder(dir('trip', file('a.md'), dir('pics', file('p.png'), file('clip.mp4'))));
    const plan = planUpload('Proj/docs', picked, () => false);
    assert.deepEqual(plan.ok.map((f) => f.rel), ['Proj/docs/trip/a.md', 'Proj/docs/trip/pics/p.png']);
    assert.deepEqual(plan.skipped.map((s) => s.name), ['trip/pics/clip.mp4']);
  });
});
