/**
 * Minimal, line-oriented markdown model used by both the reader and the
 * block editor. It covers what a knowledge base needs (headings, paragraphs,
 * bullet/ordered/task lists, quotes, fenced code, rules, TeX math, GFM tables) and round-trips:
 * `serialize(parse(src))` is a normalized but semantically equal document.
 */

export type Block =
  | { type: 'heading'; level: number; text: string; line: number }
  | { type: 'paragraph'; text: string; line: number }
  | { type: 'bullet'; indent: number; text: string; line: number }
  | { type: 'ordered'; indent: number; n: number; text: string; line: number }
  | { type: 'task'; indent: number; checked: boolean; text: string; line: number }
  | { type: 'quote'; text: string; line: number }
  | { type: 'code'; lang: string; text: string; line: number; delim?: MathDelim }
  /** GFM table. `text` is the table's source; cells come from `parseTable`. */
  | { type: 'table'; text: string; line: number }
  | { type: 'rule'; line: number };

/**
 * Display math is a `math` code block: written as a ```math fence, or between
 * `$$` / `\[` delimiters (kept in `delim` so it is written back the same way).
 */
export type MathDelim = '$$' | '\\[';

export type BlockType = Block['type'];

const HEADING = /^(#{1,6})\s+(.*)$/;
const TASK = /^(\s*)[-*+]\s+\[( |x|X)\]\s?(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)(\d+)[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```\s*([\w+-]*)\s*$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const MATH_OPEN = /^\s*(\$\$|\\\[)(.*)$/;
const MATH_CLOSE: Record<MathDelim, RegExp> = {
  // The closing delimiter ends the line, with no other `$$` before it.
  $$: /^((?:(?!\$\$).)*)\$\$\s*$/,
  '\\[': /^((?:(?!\\\]).)*)\\\]\s*$/,
};

const TABLE_DELIM = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function indentOf(ws: string) {
  const spaces = ws.replace(/\t/g, '  ').length;
  return Math.floor(spaces / 2);
}

function isSpecial(line: string) {
  return (
    HEADING.test(line) ||
    TASK.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    QUOTE.test(line) ||
    FENCE.test(line) ||
    RULE.test(line) ||
    MATH_OPEN.test(line)
  );
}

/** A display math block starting on line `start`, or null when it isn't closed before a blank line. */
function readMath(lines: string[], start: number, delim: MathDelim, first: string): { block: Block; next: number } | null {
  const close = MATH_CLOSE[delim];
  const block = (text: string, next: number) => ({ block: { type: 'code', lang: 'math', delim, text, line: start } as Block, next });
  const same = first.match(close);
  if (same) return same[1].trim() ? block(same[1].trim(), start + 1) : null;
  if (first.includes(delim)) return null; // e.g. `$$a$$ and $$b$$`: inline math in a paragraph
  const body = first.trim() ? [first.trim()] : [];
  for (let i = start + 1; i < lines.length && lines[i].trim(); i++) {
    const m = lines[i].match(close);
    if (m) {
      if (m[1].trim()) body.push(m[1].trimEnd());
      return block(body.join('\n'), i + 1);
    }
    body.push(lines[i].trimEnd());
  }
  return null;
}

export type Align = 'left' | 'center' | 'right' | null;

/** Split a table row on unescaped pipes, dropping the optional outer ones. */
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (s[i] === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/** A table starts at `i` when a row is followed by a delimiter row with as many columns. */
function isTableStart(lines: string[], i: number) {
  const head = lines[i];
  const delim = lines[i + 1];
  if (!head?.includes('|') || isSpecial(head) || delim === undefined || !TABLE_DELIM.test(delim)) return false;
  return splitRow(head).length === splitRow(delim).length;
}

const isTableRow = (line: string) => line.trim() !== '' && line.includes('|') && !isSpecial(line);

export function parseTable(src: string): { header: string[]; align: Align[]; rows: string[][] } {
  const [head = '', delim = '', ...body] = src.split('\n');
  const header = splitRow(head);
  const align = splitRow(delim).map((c): Align => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
  });
  // GFM: rows are padded or truncated to the header's width.
  const rows = body.map((l) => {
    const cells = splitRow(l).slice(0, header.length);
    while (cells.length < header.length) cells.push('');
    return cells;
  });
  return { header, align, rows };
}

export function parse(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(FENCE))) {
      const start = i;
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      blocks.push({ type: 'code', lang: m[1] ?? '', text: body.join('\n'), line: start });
      continue;
    }
    if ((m = line.match(MATH_OPEN))) {
      const math = readMath(lines, i, m[1] as MathDelim, m[2]);
      if (math) {
        blocks.push(math.block);
        i = math.next;
        continue;
      }
    }
    if (isTableStart(lines, i)) {
      const start = i;
      const body = [lines[i].trim(), lines[i + 1].trim()];
      i += 2;
      while (i < lines.length && isTableRow(lines[i])) body.push(lines[i++].trim());
      blocks.push({ type: 'table', text: body.join('\n'), line: start });
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: 'rule', line: i++ });
      continue;
    }
    if ((m = line.match(HEADING))) {
      blocks.push({ type: 'heading', level: m[1].length, text: m[2].trim(), line: i++ });
      continue;
    }
    if ((m = line.match(TASK))) {
      blocks.push({
        type: 'task',
        indent: indentOf(m[1]),
        checked: m[2] !== ' ',
        text: m[3],
        line: i++,
      });
      continue;
    }
    if ((m = line.match(BULLET))) {
      blocks.push({ type: 'bullet', indent: indentOf(m[1]), text: m[2], line: i++ });
      continue;
    }
    if ((m = line.match(ORDERED))) {
      blocks.push({ type: 'ordered', indent: indentOf(m[1]), n: Number(m[2]), text: m[3], line: i++ });
      continue;
    }
    if (QUOTE.test(line)) {
      const start = i;
      const body: string[] = [];
      while (i < lines.length && (m = lines[i].match(QUOTE))) {
        body.push(m[1]);
        i++;
      }
      blocks.push({ type: 'quote', text: body.join('\n'), line: start });
      continue;
    }
    // Paragraph: merge consecutive plain lines. Indented continuation lines of
    // a list item are folded into that item.
    const prev = blocks[blocks.length - 1];
    if (
      prev &&
      (prev.type === 'bullet' || prev.type === 'task' || prev.type === 'ordered') &&
      /^\s+\S/.test(line) &&
      i > 0 &&
      lines[i - 1].trim() !== ''
    ) {
      prev.text += ' ' + line.trim();
      i++;
      continue;
    }
    const start = i;
    // The first line always belongs to the paragraph (it may look like math that isn't closed).
    const body = [lines[i++].trim()];
    // A table can interrupt a paragraph.
    while (i < lines.length && lines[i].trim() && !isSpecial(lines[i]) && !isTableStart(lines, i)) body.push(lines[i++].trim());
    blocks.push({ type: 'paragraph', text: body.join(' '), line: start });
  }
  return blocks;
}

const LISTY: BlockType[] = ['bullet', 'ordered', 'task'];

export function serializeBlock(b: Block): string {
  const pad = (n: number) => '  '.repeat(n);
  switch (b.type) {
    case 'heading':
      return `${'#'.repeat(b.level)} ${b.text}`;
    case 'task':
      return `${pad(b.indent)}- [${b.checked ? 'x' : ' '}] ${b.text}`;
    case 'bullet':
      return `${pad(b.indent)}- ${b.text}`;
    case 'ordered':
      return `${pad(b.indent)}${b.n}. ${b.text}`;
    case 'quote':
      return b.text
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n');
    case 'code':
      if (b.delim) return `${b.delim}\n${b.text}\n${b.delim === '$$' ? '$$' : '\\]'}`;
      return '```' + b.lang + '\n' + b.text + '\n```';
    case 'table':
      return b.text;
    case 'rule':
      return '---';
    case 'paragraph':
      return b.text;
  }
}

export function serialize(blocks: Block[]): string {
  let out = '';
  blocks.forEach((b, i) => {
    if (i > 0) {
      const prev = blocks[i - 1];
      const tight = LISTY.includes(prev.type) && LISTY.includes(b.type);
      out += tight ? '\n' : '\n\n';
    }
    out += serializeBlock(b);
  });
  return out + '\n';
}

// ─── Inline ──────────────────────────────────────────────────────────────────

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'strike'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'math'; text: string; display: boolean }
  | { type: 'link'; href: string; children: Inline[] }
  /** Obsidian-style `[[target#heading|label]]`; `target` is empty for a link within the same file. */
  | { type: 'wiki'; target: string; heading: string | null; label: string }
  /** Obsidian `![[image.png|300]]`: the file is shown in place; `width` comes from a numeric alias. */
  | { type: 'embed'; target: string; heading: string | null; width: number | null; label: string };

const INLINE = new RegExp(
  [
    /(`[^`]+`)/, // 1 code
    /(\\\$)/, // 2 escaped dollar
    /(\$\$[^$]+?\$\$)/, // 3 display math inside a paragraph
    // 4 $math$, as in Pandoc: no space after the opening or before the closing
    // dollar, and no digit right after it, so "$5 and $10" stays text.
    /(\$[^\s$](?:[^$\n]*?[^\s$\\])?\$(?!\d))/,
    /(\\\(.+?\\\))/, // 5 \(math\)
    /(\*\*[^*]+?\*\*|__[^_]+?__)/, // 6 bold
    /(~~[^~]+?~~)/, // 7 strike
    /(\*[^*\s][^*]*?\*|_[^_\s][^_]*?_)/, // 8 italic
    /(!\[\[[^[\]\n|]*(?:\|[^[\]\n]*)?\]\])/, // 9 ![[embed]]
    /(\[\[[^[\]\n|]*(?:\|[^[\]\n]*)?\]\])/, // 10 [[wiki link]]
    /(\[[^\]]+\]\([^)\s]+\))/, // 11 link
  ]
    .map((r) => r.source)
    .join('|'),
);

/** The inside of `[[...]]`: `target#heading|label`. Null when it names nothing. */
function parseWikiLink(inner: string): Extract<Inline, { type: 'wiki' }> | null {
  const bar = inner.indexOf('|');
  const ref = (bar < 0 ? inner : inner.slice(0, bar)).trim();
  const alias = bar < 0 ? '' : inner.slice(bar + 1).trim();
  const hash = ref.indexOf('#');
  const target = (hash < 0 ? ref : ref.slice(0, hash)).trim();
  // `#a#b` points into nested headings: the last one is the destination.
  const heading = hash < 0 ? null : ref.slice(hash + 1).split('#').pop()!.trim() || null;
  if (!target && !heading) return null;
  const label = alias || [target, heading].filter(Boolean).join(' > ');
  return { type: 'wiki', target, heading, label };
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    const tok = m[0];
    if (m[1]) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (m[2]) out.push({ type: 'text', text: '$' });
    else if (m[3]) out.push({ type: 'math', text: tok.slice(2, -2).trim(), display: true });
    else if (m[4] || m[5]) out.push({ type: 'math', text: tok.slice(m[4] ? 1 : 2, m[4] ? -1 : -2).trim(), display: false });
    else if (m[6]) out.push({ type: 'bold', children: parseInline(tok.slice(2, -2)) });
    else if (m[7]) out.push({ type: 'strike', children: parseInline(tok.slice(2, -2)) });
    else if (m[8]) out.push({ type: 'italic', children: parseInline(tok.slice(1, -1)) });
    else if (m[9]) {
      const w = parseWikiLink(tok.slice(3, -2));
      if (!w) out.push({ type: 'text', text: tok });
      else {
        const size = /^\d+$/.test(w.label) ? Number(w.label) : null;
        out.push({ type: 'embed', target: w.target, heading: w.heading, width: size, label: size === null ? w.label : w.target });
      }
    } else if (m[10]) {
      const w = parseWikiLink(tok.slice(2, -2));
      if (w) out.push(w);
      else out.push({ type: 'text', text: tok });
    } else if (m[11]) {
      const lm = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)!;
      out.push({ type: 'link', href: lm[2], children: parseInline(lm[1]) });
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

export type Piece = { type: 'text'; text: string } | { type: 'math'; text: string };

/** A paragraph cut at its `$$…$$` formulas, which are shown as blocks of their own. */
export function splitDisplayMath(src: string): Piece[] {
  const out: Piece[] = [];
  let buf = '';
  const flush = () => {
    if (buf.trim()) out.push({ type: 'text', text: buf.trim() });
    buf = '';
  };
  let rest = src;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m || m.index === undefined) {
      buf += rest;
      break;
    }
    const tok = m[0];
    if (m[3]) {
      buf += rest.slice(0, m.index);
      flush();
      out.push({ type: 'math', text: tok.slice(2, -2).trim() });
    } else buf += rest.slice(0, m.index + tok.length);
    rest = rest.slice(m.index + tok.length);
  }
  flush();
  return out;
}

export function plainText(src: string): string {
  const walk = (nodes: Inline[]): string =>
    nodes.map((n) => ('children' in n ? walk(n.children) : n.type === 'wiki' || n.type === 'embed' ? n.label : n.text)).join('');
  return walk(parseInline(src));
}

// ─── Checklists ──────────────────────────────────────────────────────────────

export function checklistProgress(src: string) {
  let done = 0;
  let total = 0;
  for (const b of parse(src)) {
    if (b.type === 'task') {
      total++;
      if (b.checked) done++;
    }
  }
  return { done, total };
}

/** Flip the task on source line `line`, touching nothing else in the file. */
export function toggleTaskAtLine(src: string, line: number): string {
  const lines = src.split('\n');
  const l = lines[line];
  if (l === undefined) return src;
  lines[line] = l.replace(/^(\s*[-*+]\s+\[)( |x|X)(\])/, (_, a, c, b) => a + (c === ' ' ? 'x' : ' ') + b);
  return lines.join('\n');
}

/** First H1 of a document, if any. */
export function firstHeading(src: string): string | null {
  const b = parse(src).find((x) => x.type === 'heading' && x.level === 1);
  return b && b.type === 'heading' ? plainText(b.text) : null;
}

/** Index of the heading named `heading` (case-insensitive), or -1. */
export function findHeading(blocks: Block[], heading: string): number {
  const want = heading.trim().toLowerCase();
  return blocks.findIndex((b) => b.type === 'heading' && plainText(b.text).trim().toLowerCase() === want);
}
