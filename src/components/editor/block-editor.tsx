import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent, type TextStyle } from 'react-native';

import { applyFormat, asParagraph, continuation, toBlocks, type BlockFormat, type EditBlock } from './model';
import { Icon } from '../icon';
import { RenderedBlock } from '../markdown';
import { useTextScale } from '@/theme/text-size';
import { fonts, useTheme, type Theme } from '@/theme';

export interface BlockEditorHandle {
  /** Scrolls so that the caret of the block being edited is in view (call when the keyboard or layout changes). */
  reveal(): void;
  /** Wrap the selection in the focused block with inline markers. */
  wrap(prefix: string, suffix: string, placeholder?: string): void;
  format(format: BlockFormat): void;
  focus(blockId?: string, offset?: number): void;
  /** Focused block id and caret offset inside its text. */
  caret(): { id: string; offset: number } | null;
}

type Selection = { start: number; end: number };

/**
 * Live-preview editor (B1): each markdown block is its own TextInput styled
 * like the rendered output, with block markers (#, -, [ ], >) hidden.
 * Enter splits a block, Backspace at the start un-formats or merges it.
 */
export function BlockEditor({
  blocks,
  onChange,
  path,
  onCaret,
  ref,
}: {
  blocks: EditBlock[];
  onChange: (blocks: EditBlock[]) => void;
  /** Reports where the caret line sits (top and bottom, relative to this editor) so the screen can scroll to it. */
  onCaret?: (top: number, bottom: number) => void;
  /** The file being edited, to resolve the images and links in the blocks that are drawn. */
  path: string;
  ref?: Ref<BlockEditorHandle>;
}) {
  const t = useTheme();
  const inputs = useRef(new Map<string, TextInput>());
  const selections = useRef(new Map<string, Selection>());
  const [focused, setFocused] = useState<string | null>(null);
  /** The block whose text field is active: the others are drawn as the reader does, not typed. */
  const [editing, setEditing] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);
  const scale = useTextScale();
  const layouts = useRef(new Map<string, { y: number; height: number }>());

  /** Estimates the line of the caret from its place in the text: a text field does not report it. */
  const revealCaret = (id: string | null = focusedRef.current) => {
    const b = blocks.find((x) => x.id === id);
    const box = id ? layouts.current.get(id) : undefined;
    if (!b || !box || !onCaret) return;
    const text = 'text' in b ? b.text : '';
    const line = 24 * scale;
    const at = selections.current.get(b.id)?.start ?? text.length;
    const ratio = text.length ? Math.min(1, at / text.length) : 1;
    const top = box.y + Math.max(0, Math.min(box.height - line, ratio * box.height - line / 2));
    onCaret(top, top + line);
  };

  const focusAt = (id: string, offset?: number, tries = 0) => {
    setEditing(id);
    requestAnimationFrame(() => {
      const input = inputs.current.get(id);
      if (!input) {
        // A drawn block is turning into a text field: wait for it to mount.
        if (tries < 10) setTimeout(() => focusAt(id, offset, tries + 1), 30);
        return;
      }
      input.focus();
      if (offset !== undefined) {
        selections.current.set(id, { start: offset, end: offset });
        input.setSelection(offset, offset);
      }
    });
  };

  const update = (id: string, patch: (b: EditBlock) => EditBlock) =>
    onChange(blocks.map((b) => (b.id === id ? patch(b) : b)));

  useImperativeHandle(ref, () => ({
    wrap(prefix, suffix, placeholder = '') {
      const id = focusedRef.current;
      const b = blocks.find((x) => x.id === id);
      if (!b || !('text' in b)) return;
      const sel = selections.current.get(b.id) ?? { start: b.text.length, end: b.text.length };
      const inner = b.text.slice(sel.start, sel.end) || placeholder;
      const text = b.text.slice(0, sel.start) + prefix + inner + suffix + b.text.slice(sel.end);
      update(b.id, (x) => ({ ...x, text }) as EditBlock);
      const caret = sel.start + prefix.length + inner.length + (sel.start === sel.end && !placeholder ? 0 : suffix.length);
      focusAt(b.id, caret);
    },
    format(format) {
      const id = focusedRef.current ?? blocks[blocks.length - 1]?.id;
      if (!id) return;
      update(id, (b) => applyFormat(b, format));
      focusAt(id);
    },
    focus(id, offset) {
      focusAt(id ?? blocks[blocks.length - 1].id, offset);
    },
    reveal() {
      revealCaret();
    },
    caret() {
      const id = focusedRef.current;
      if (!id) return null;
      return { id, offset: selections.current.get(id)?.start ?? 0 };
    },
  }));

  const onChangeText = (b: EditBlock, text: string) => {
    // Code and tables are edited as raw multi-line source.
    const nl = b.type === 'code' || b.type === 'table' ? -1 : text.indexOf('\n');
    if (nl === -1) {
      update(b.id, (x) => ({ ...x, text }) as EditBlock);
      return;
    }
    const before = text.slice(0, nl);
    const after = text.slice(nl + 1);
    const i = blocks.findIndex((x) => x.id === b.id);
    // Enter on an empty list item leaves the list.
    if (!before && !after && (b.type === 'bullet' || b.type === 'task' || b.type === 'ordered')) {
      update(b.id, asParagraph);
      return;
    }
    const inserted = after.includes('\n') ? toBlocks(after) : [continuation(b, after)];
    const next = [...blocks];
    next.splice(i, 1, { ...b, text: before } as EditBlock, ...inserted);
    onChange(next);
    focusAt(inserted[0].id, 0);
  };

  const onBackspaceAtStart = (b: EditBlock) => {
    const sel = selections.current.get(b.id);
    if (sel && (sel.start !== 0 || sel.end !== 0)) return;
    if (b.type !== 'paragraph' && b.type !== 'code' && b.type !== 'table') {
      update(b.id, asParagraph);
      return;
    }
    const i = blocks.findIndex((x) => x.id === b.id);
    const prev = blocks[i - 1];
    if (!prev) return;
    const text = 'text' in b ? b.text : '';
    const next = [...blocks];
    if (prev.type === 'rule') {
      next.splice(i - 1, 1);
      onChange(next);
      return;
    }
    const joinAt = prev.text.length;
    next.splice(i - 1, 2, { ...prev, text: prev.text + text } as EditBlock);
    onChange(next);
    focusAt(prev.id, joinAt);
  };

  return (
    <View>
      {blocks.map((b, i) => (
        <View
          key={b.id}
          onLayout={(e: LayoutChangeEvent) => {
            layouts.current.set(b.id, e.nativeEvent.layout);
            // A block that grows while typing (or turns into a field) may push the caret out of view.
            if (focusedRef.current === b.id) revealCaret(b.id);
          }}>
        <BlockRow
          block={b}
          first={i === 0}
          prev={blocks[i - 1]}
          focused={focused === b.id}
          drawn={editing !== b.id && isDrawn(b)}
          path={path}
          onEdit={() => focusAt(b.id, 'text' in b ? b.text.length : 0)}
          onBlur={() => setEditing((id) => (id === b.id ? null : id))}
          t={t}
          inputRef={(r) => {
            if (r) inputs.current.set(b.id, r);
            else inputs.current.delete(b.id);
          }}
          onChangeText={(text) => onChangeText(b, text)}
          onBackspaceAtStart={() => onBackspaceAtStart(b)}
          onSelectionChange={(s) => {
            selections.current.set(b.id, s);
            revealCaret(b.id);
          }}
          onFocus={() => {
            focusedRef.current = b.id;
            setFocused(b.id);
            setEditing(b.id);
            revealCaret(b.id);
          }}
          onToggle={() => update(b.id, (x) => (x.type === 'task' ? { ...x, checked: !x.checked } : x))}
        />
        </View>
      ))}
    </View>
  );
}

/**
 * The preview draws every block as the reader does (bold, links, formulas, images, tables…) and turns
 * only the one being edited into a text field. An empty block stays a field so there is somewhere to type.
 */
const isDrawn = (b: EditBlock) => b.type !== 'rule' && !('text' in b && !b.text.trim());

function BlockRow({
  block: b,
  first,
  prev,
  focused,
  drawn,
  path,
  onEdit,
  onBlur,
  t,
  inputRef,
  onChangeText,
  onBackspaceAtStart,
  onSelectionChange,
  onFocus,
  onToggle,
}: {
  block: EditBlock;
  first: boolean;
  /** The block above, so that a drawn one is spaced as it is in the reader. */
  prev?: EditBlock;
  focused: boolean;
  /** Show the block as the reader does instead of a text field (until it is tapped). */
  drawn: boolean;
  path: string;
  onEdit: () => void;
  onBlur: () => void;
  t: Theme;
  inputRef: (r: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onBackspaceAtStart: () => void;
  onSelectionChange: (s: Selection) => void;
  onFocus: () => void;
  onToggle: () => void;
}) {
  const scale = useTextScale();
  if (b.type === 'rule') {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginVertical: 18 }} />;
  }

  if (drawn) {
    const indent = 'indent' in b ? b.indent * 20 : 0;
    return (
      <Pressable onPress={onEdit} accessibilityHint="Tocca per modificare" style={[styles.drawn, { marginLeft: indent }]}>
        <RenderedBlock block={b} prev={prev} path={path} />
      </Pressable>
    );
  }

  const textStyle: TextStyle = (() => {
    switch (b.type) {
      case 'heading':
        return b.level === 1
          ? { fontSize: 21 * scale, lineHeight: 26 * scale, fontWeight: '700', letterSpacing: -0.6, color: t.text }
          : b.level === 2
            ? { fontSize: 16 * scale, lineHeight: 21 * scale, fontWeight: '600', color: t.text }
            : { fontSize: 14.5 * scale, lineHeight: 20 * scale, fontWeight: '600', color: t.text };
      case 'code':
      case 'table':
        return { fontFamily: fonts.mono, fontSize: 12 * scale, lineHeight: 19 * scale, color: t.textSecondary };
      case 'quote':
        return { fontSize: 13.5 * scale, lineHeight: 21 * scale, color: t.textSecondary };
      case 'task':
        return b.checked
          ? { fontSize: 14.5 * scale, lineHeight: 21 * scale, color: t.textMuted, textDecorationLine: 'line-through' }
          : { fontSize: 14.5 * scale, lineHeight: 21 * scale, color: t.text };
      default:
        return { fontSize: 14.5 * scale, lineHeight: 21.5 * scale, color: t.textBody };
    }
  })();

  const spacing =
    b.type === 'heading'
      ? { marginTop: first ? 0 : b.level === 1 ? 8 : 14, marginBottom: 4 }
      : b.type === 'paragraph'
        ? { marginBottom: 6 }
        : { marginBottom: 2 };

  const input = (
    <TextInput
      ref={inputRef}
      multiline
      scrollEnabled={false}
      value={b.text}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      onSelectionChange={(e) => onSelectionChange(e.nativeEvent.selection)}
      onKeyPress={(e) => {
        if (e.nativeEvent.key === 'Backspace') onBackspaceAtStart();
      }}
      placeholder={first && !b.text ? 'Inizia a scrivere…' : undefined}
      placeholderTextColor={t.textMuted}
      selectionColor={t.accentText}
      cursorColor={t.accentText}
      autoCorrect={b.type !== 'code' && b.type !== 'table'}
      autoCapitalize={b.type === 'code' || b.type === 'table' ? 'none' : 'sentences'}
      style={[styles.input, textStyle, { flex: 1 }]}
    />
  );

  const indent = 'indent' in b ? b.indent * 20 : 0;
  return (
    <View
      style={[
        styles.row,
        spacing,
        { marginLeft: indent },
        focused && { backgroundColor: t.accentSoft },
        b.type === 'quote' && { borderLeftWidth: 3, borderLeftColor: t.accent, backgroundColor: focused ? t.accentSoft : t.cell, paddingLeft: 12 },
        (b.type === 'code' || b.type === 'table') && { backgroundColor: focused ? t.accentSoft : t.cell, paddingHorizontal: 12, paddingVertical: 8 },
      ]}>
      {b.type === 'bullet' && <Text style={[styles.marker, { color: t.accentText, fontSize: 14.5 * scale, lineHeight: 21.5 * scale }]}>•</Text>}
      {b.type === 'ordered' && <Text style={[styles.marker, { color: t.accentText, minWidth: 18, fontSize: 14.5 * scale, lineHeight: 21.5 * scale }]}>{b.n}.</Text>}
      {b.type === 'task' && (
        <Pressable onPress={onToggle} hitSlop={8} style={{ paddingTop: 5 }}>
          <Icon name={b.checked ? 'checkCircle' : 'circle'} size={19} color={b.checked ? t.accentText : t.textMuted} />
        </Pressable>
      )}
      {input}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 8, paddingHorizontal: 5, marginHorizontal: -5 },
  marker: { fontSize: 14.5, lineHeight: 21.5, paddingTop: 5 },
  drawn: { paddingHorizontal: 5, marginHorizontal: -5, paddingVertical: 2 },
  input: { paddingVertical: 4, paddingHorizontal: 0, margin: 0, textAlignVertical: 'top' },
});
