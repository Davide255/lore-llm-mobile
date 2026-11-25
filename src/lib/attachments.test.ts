import assert from 'node:assert/strict';
import { test } from 'node:test';

import { attachmentKind, documentLabel, isDocumentAttachment, officeApp } from './attachments.ts';

test('attachmentKind goes by extension', () => {
  assert.equal(attachmentKind('P/img/Photo.PNG'), 'image');
  assert.equal(attachmentKind('P/a.jpeg'), 'image');
  assert.equal(attachmentKind('P/logo.svg'), 'image');
  assert.equal(attachmentKind('P/paper.pdf'), 'pdf');
  assert.equal(attachmentKind('P/notes.md'), null);
  assert.equal(attachmentKind('P/pdf'), null);
});

test('Office documents are their own kind; the legacy formats are not attachments', () => {
  assert.equal(attachmentKind('P/tesi.docx'), 'office');
  assert.equal(attachmentKind('P/voti.XLSX'), 'office');
  assert.equal(attachmentKind('P/lezione 1.pptx'), 'office');
  assert.equal(attachmentKind('P/old.doc'), null);
  assert.equal(attachmentKind('P/old.xls'), null);
  assert.equal(attachmentKind('P/old.ppt'), null);
  assert.equal(attachmentKind('P/docx'), null);
});

test('officeApp names the application of an Office document', () => {
  assert.equal(officeApp('P/tesi.docx'), 'word');
  assert.equal(officeApp('P/voti.Xlsx'), 'excel');
  assert.equal(officeApp('P/slides.pptx'), 'powerpoint');
  assert.equal(officeApp('P/paper.pdf'), null);
  assert.equal(officeApp('P/old.doc'), null);
});

test('PDFs and Office documents are documents, images and notes are not', () => {
  assert.equal(isDocumentAttachment('P/paper.pdf'), true);
  assert.equal(isDocumentAttachment('P/tesi.docx'), true);
  assert.equal(isDocumentAttachment('P/a.png'), false);
  assert.equal(isDocumentAttachment('P/a.md'), false);
});

test('documentLabel names the document in messages, never «PDF» for Office files', () => {
  assert.equal(documentLabel('P/paper.pdf'), 'il PDF');
  assert.equal(documentLabel('P/tesi.docx'), 'il documento Word');
  assert.equal(documentLabel('P/voti.xlsx'), 'il foglio Excel');
  assert.equal(documentLabel('P/lezione.pptx'), 'la presentazione PowerPoint');
  assert.equal(documentLabel('P/a.png'), 'il file');
});
