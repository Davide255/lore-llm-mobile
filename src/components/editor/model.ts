import { parse, serializeBlock, type Block } from '@/lib/markdown';

export type EditBlock = Block & { id: string };

let seq = 0;
export const withId = (b: Block): EditBlock => ({ ...b, id: `b${++seq}` });

export function toBlocks(src: string): EditBlock[] {
  const blocks = parse(src).map(withId);
  return blocks.length ? blocks : [withId({ type: 'paragraph', text: '', line: 0 })];
}

const LISTY = new Set(['bullet', 'ordered', 'task']);

/**
 * Serialize and report where each block's editable text starts in the output,
 * so the cursor can be carried from the block editor to the source editor.
 */
export function serializeWithOffsets(blocks: EditBlock[]) {
  let out = '';
  const offsets = new Map<string, number>();
  blocks.forEach((b, i) => {
    if (i > 0) out += LISTY.has(blocks[i - 1].type) && LISTY.has(b.type) ? '\n' : '\n\n';
    const line = serializeBlock(b);
    const text = 'text' in b ? b.text : '';
    const prefix = b.type === 'code' ? line.indexOf('\n') + 1 : text ? line.lastIndexOf(text) : line.length;
    offsets.set(b.id, out.length + Math.max(0, prefix));
    out += line;
  });
  return { source: out + '\n', offsets };
}

/** Block that continues the current one after Enter. */
export function continuation(b: EditBlock, text: string): EditBlock {
  switch (b.type) {
    case 'bullet':
      return withId({ type: 'bullet', indent: b.indent, text, line: 0 });
    case 'ordered':
      return withId({ type: 'ordered', indent: b.indent, n: b.n + 1, text, line: 0 });
    case 'task':
      return withId({ type: 'task', indent: b.indent, checked: false, text, line: 0 });
    default:
      return withId({ type: 'paragraph', text, line: 0 });
  }
}

export function asParagraph(b: EditBlock): EditBlock {
  return { id: b.id, type: 'paragraph', text: 'text' in b ? b.text : '', line: b.line };
}

export type BlockFormat = 'heading' | 'bullet' | 'task' | 'quote';

/** Toolbar block formats toggle: applying the current format reverts to paragraph. */
export function applyFormat(b: EditBlock, format: BlockFormat): EditBlock {
  const text = 'text' in b ? b.text : '';
  const base = { id: b.id, line: b.line };
  switch (format) {
    case 'heading':
      // paragraph → H1 → H2 → H3 → paragraph
      if (b.type !== 'heading') return { ...base, type: 'heading', level: 1, text };
      return b.level >= 3 ? { ...base, type: 'paragraph', text } : { ...base, type: 'heading', level: b.level + 1, text };
    case 'bullet':
      return b.type === 'bullet' ? { ...base, type: 'paragraph', text } : { ...base, type: 'bullet', indent: 0, text };
    case 'task':
      return b.type === 'task' ? { ...base, type: 'paragraph', text } : { ...base, type: 'task', indent: 0, checked: false, text };
    case 'quote':
      return b.type === 'quote' ? { ...base, type: 'paragraph', text } : { ...base, type: 'quote', text };
  }
}

/**
 * A paragraph whose text reads as other markdown ("# Titolo", "- voce", "1. passo", "> nota", "---")
 * as the blocks the reader shows for it; the first keeps the paragraph's id. Null when it stays as it is.
 */
export function settleBlock(b: EditBlock): EditBlock[] | null {
  if (b.type !== 'paragraph' || !b.text.trim()) return null;
  const parsed = parse(b.text);
  if (!parsed.length || (parsed.length === 1 && parsed[0].type === 'paragraph')) return null;
  return parsed.map((p, i) => (i === 0 ? { ...p, id: b.id, line: b.line } : withId(p)));
}
