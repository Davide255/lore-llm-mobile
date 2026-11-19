import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

// Resolves the `@/` alias of model.ts under plain node.
register('../../api/cloud/test-stubs.mjs', import.meta.url);
const { settleBlock, withId } = await import('./model.ts');

const para = (text: string) => withId({ type: 'paragraph', text, line: 3 });

test('a paragraph typed as markdown settles into the block the reader shows', () => {
  const p = para('# Titolo **forte**');
  assert.deepEqual(settleBlock(p), [{ type: 'heading', level: 1, text: 'Titolo **forte**', line: 3, id: p.id }]);
  assert.equal(settleBlock(para('- voce'))?.[0].type, 'bullet');
  assert.equal(settleBlock(para('1. passo'))?.[0].type, 'ordered');
  assert.equal(settleBlock(para('> nota'))?.[0].type, 'quote');
  assert.equal(settleBlock(para('- [ ] fare'))?.[0].type, 'task');
});

test('plain paragraphs, other blocks and empty text stay as they are', () => {
  assert.equal(settleBlock(para('Testo con **grassetto**')), null);
  assert.equal(settleBlock(para('')), null);
  assert.equal(settleBlock(withId({ type: 'heading', level: 2, text: '# non toccare', line: 0 })), null);
});
