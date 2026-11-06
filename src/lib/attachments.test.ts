import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachmentKind } from './attachments.ts';

test('attachmentKind goes by extension', () => {
  assert.equal(attachmentKind('P/img/Photo.PNG'), 'image');
  assert.equal(attachmentKind('P/a.jpeg'), 'image');
  assert.equal(attachmentKind('P/logo.svg'), 'image');
  assert.equal(attachmentKind('P/paper.pdf'), 'pdf');
  assert.equal(attachmentKind('P/notes.md'), null);
  assert.equal(attachmentKind('P/pdf'), null);
});
