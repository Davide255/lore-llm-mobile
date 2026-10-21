import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';

import { applyFormat, asParagraph, continuation, toBlocks, type BlockFormat, type EditBlock } from './model';
import { Icon } from '../icon';
import { fonts, useTheme, type Theme } from '@/theme';

export interface BlockEditorHandle {
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
  ref,
}: {
  blocks: EditBlock[];
  onChange: (blocks: EditBlock[]) => void;
  ref?: Ref<BlockEditorHandle>;
}) {
  const t = useTheme();
  const inputs = useRef(new Map<string, TextInput>());
  const selections = useRef(new Map<string, Selection>());
  const [focused, setFocused] = useState<string | null>(null);
  const focusedRef = useRef<string | null>(null);

  const focusAt = (id: string, offset?: number) => {
    requestAnimationFrame(() => {
      const input = inputs.current.get(id);
      input?.focus();
      if (offset !== undefined) {
        selections.current.set(id, { start: offset, end: offset });
        input?.setSelection(offset, offset);
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
        <BlockRow
          key={b.id}
          block={b}
          first={i === 0}
          focused={focused === b.id}
          t={t}
          inputRef={(r) => {
            if (r) inputs.current.set(b.id, r);
            else inputs.current.delete(b.id);
          }}
          onChangeText={(text) => onChangeText(b, text)}
          onBackspaceAtStart={() => onBackspaceAtStart(b)}
          onSelectionChange={(s) => selections.current.set(b.id, s)}
          onFocus={() => {
            focusedRef.current = b.id;
            setFocused(b.id);
          }}
          onToggle={() => update(b.id, (x) => (x.type === 'task' ? { ...x, checked: !x.checked } : x))}
        />
      ))}
    </View>
  );
}

function BlockRow({
  block: b,
  first,
  focused,
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
  focused: boolean;
  t: Theme;
  inputRef: (r: TextInput | null) => void;
  onChangeText: (text: string) => void;
  onBackspaceAtStart: () => void;
  onSelectionChange: (s: Selection) => void;
  onFocus: () => void;
  onToggle: () => void;
}) {
  if (b.type === 'rule') {
    return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.hairline, marginVertical: 18 }} />;
  }

  const textStyle: TextStyle = (() => {
    switch (b.type) {
      case 'heading':
        return b.level === 1
          ? { fontSize: 21, lineHeight: 26, fontWeight: '700', letterSpacing: -0.6, color: t.text }
          : b.level === 2
            ? { fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.text }
            : { fontSize: 14.5, lineHeight: 20, fontWeight: '600', color: t.text };
      case 'code':
      case 'table':
        return { fontFamily: fonts.mono, fontSize: 12, lineHeight: 19, color: t.textSecondary };
      case 'quote':
        return { fontSize: 13.5, lineHeight: 21, color: t.textSecondary };
      case 'task':
        return b.checked
          ? { fontSize: 14.5, lineHeight: 21, color: t.textMuted, textDecorationLine: 'line-through' }
          : { fontSize: 14.5, lineHeight: 21, color: t.text };
      default:
        return { fontSize: 14.5, lineHeight: 21.5, color: t.textBody };
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
      {b.type === 'bullet' && <Text style={[styles.marker, { color: t.accentText }]}>•</Text>}
      {b.type === 'ordered' && <Text style={[styles.marker, { color: t.accentText, minWidth: 18 }]}>{b.n}.</Text>}
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
  input: { paddingVertical: 4, paddingHorizontal: 0, margin: 0, textAlignVertical: 'top' },
});
