import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findHeading, parse, parseInline, plainText, serialize, toggleTaskAtLine, type Block } from './markdown.ts';
import { texToSvg } from './math.ts';

const mathOf = (src: string) => parseInline(src).filter((n) => n.type === 'math');

test('display math blocks: $$, \\[ and ```math', () => {
  const blocks = parse('Intro\n$$\n\\frac{a}{b}\n= c\n$$\n\n\\[ x^2 \\]\n\n```math\ny\n```\n');
  assert.deepEqual(
    blocks.map((b) => [b.type, 'text' in b ? b.text : '', b.type === 'code' ? b.delim : undefined]),
    [
      ['paragraph', 'Intro', undefined],
      ['code', '\\frac{a}{b}\n= c', '$$'],
      ['code', 'x^2', '\\['],
      ['code', 'y', undefined],
    ],
  );
  assert.ok(blocks.slice(1).every((b) => b.type === 'code' && b.lang === 'math'));
});

test('display math is written back with its own delimiters', () => {
  const src = 'A\n\n$$\nx = 1\n$$\n\n\\[\ny\n\\]\n\n```math\nz\n```\n';
  assert.equal(serialize(parse(src)), src);
  // A one-line block comes back on its own lines.
  assert.equal(serialize(parse('$$ e^{i\\pi} $$\n')), '$$\ne^{i\\pi}\n$$\n');
});

test('blocks after display math keep their source lines', () => {
  const src = '$$\nx\n$$\n- [ ] a';
  const task = parse(src)[1];
  assert.equal(task.type, 'task');
  assert.equal(task.line, 3);
  assert.equal(toggleTaskAtLine(src, task.line), '$$\nx\n$$\n- [x] a');
});

test('unclosed $$ stays text, without stalling the parser', () => {
  const blocks: Block[] = parse('$$ not closed\n\nnext');
  assert.deepEqual(
    blocks.map((b) => b.type),
    ['paragraph', 'paragraph'],
  );
  assert.equal(parse('$$a$$ and $$b$$')[0].type, 'paragraph');
});

test('inline math: $…$ and \\(…\\), underscores stay inside the formula', () => {
  assert.deepEqual(mathOf('loss $L = -\\sum_i y_i \\log \\hat{y}_i$ here'), [
    { type: 'math', text: 'L = -\\sum_i y_i \\log \\hat{y}_i', display: false },
  ]);
  assert.deepEqual(mathOf('Euler: \\( e^{i\\pi} + 1 = 0 \\)'), [{ type: 'math', text: 'e^{i\\pi} + 1 = 0', display: false }]);
  assert.deepEqual(mathOf('so $$x^2$$ inline'), [{ type: 'math', text: 'x^2', display: true }]);
  assert.deepEqual(mathOf('$x$'), [{ type: 'math', text: 'x', display: false }]);
  assert.equal(plainText('area $\\pi r^2$'), 'area \\pi r^2');
});

test('dollars that are not math stay text', () => {
  assert.deepEqual(mathOf('costs $5 and $10 per month'), []);
  assert.deepEqual(mathOf('between $ 3 $ and'), []);
  assert.deepEqual(mathOf('price \\$4, `$x$` in code'), []);
  assert.equal(plainText('price \\$4'), 'price $4');
});

test('TeX converts to SVG sized in em; bad TeX gives null', () => {
  const m = texToSvg('\\frac{e^{z_i}}{\\sum_j e^{z_j}}', true);
  assert.ok(m);
  assert.match(m.svg, /^<svg[^>]*viewBox=/);
  assert.doesNotMatch(m.svg.slice(0, m.svg.indexOf('>')), /width=|height=|style=/);
  assert.ok(m.width > 1 && m.ascent > 0.5 && m.depth > 0.3);
  assert.equal(texToSvg('\\frac{1}{', false), null);
});

test('wiki links: file, heading, alias and same-file anchors', () => {
  assert.deepEqual(parseInline('See [[notes#Setup|the setup]] now'), [
    { type: 'text', text: 'See ' },
    { type: 'wiki', target: 'notes', heading: 'Setup', label: 'the setup' },
    { type: 'text', text: ' now' },
  ]);
  assert.deepEqual(parseInline('[[plans/a]]'), [{ type: 'wiki', target: 'plans/a', heading: null, label: 'plans/a' }]);
  assert.deepEqual(parseInline('[[#Intro]]'), [{ type: 'wiki', target: '', heading: 'Intro', label: 'Intro' }]);
  assert.deepEqual(parseInline('[[a#b#c]]'), [{ type: 'wiki', target: 'a', heading: 'c', label: 'a > c' }]);
  // Empty links stay text; code spans and markdown links are untouched.
  assert.equal(plainText('[[]] and [x](y.md)'), '[[]] and x');
  assert.deepEqual(parseInline('`[[a]]`'), [{ type: 'code', text: '[[a]]' }]);
  assert.equal(plainText('[[my_note_x]]'), 'my_note_x');
});

test('findHeading matches heading text case-insensitively', () => {
  const blocks = parse('# Title\n\ntext\n\n## **Set**up\n');
  assert.equal(findHeading(blocks, 'setup'), 2);
  assert.equal(findHeading(blocks, 'missing'), -1);
});
