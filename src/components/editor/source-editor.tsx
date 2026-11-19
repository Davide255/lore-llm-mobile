import { useImperativeHandle, useMemo, useRef, type ComponentRef, type Ref } from 'react';
import { Platform, StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';

import { fonts, useTheme, type Theme } from '@/theme';

export interface SourceEditorHandle {
  wrap(prefix: string, suffix: string, placeholder?: string): void;
  /** Toggle a line prefix ("# ", "- ", "- [ ] ") on the caret's line. */
  toggleLinePrefix(prefix: string): void;
  focus(offset?: number): void;
  caret(): number;
}

/** Colours markdown markers, like the wireframe's source view (B2). */
function highlight(src: string, t: Theme) {
  return src.split('\n').map((line, i, all) => {
    const nl = i < all.length - 1 ? '\n' : '';
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,6}\s)(.*)$/))) {
      return (
        <Text key={i}>
          <Text style={{ color: t.accentText, fontWeight: '700' }}>{m[1]}</Text>
          <Text style={{ color: t.text, fontWeight: m[1].length === 2 ? '700' : '600' }}>{m[2]}</Text>
          {nl}
        </Text>
      );
    }
    if ((m = line.match(/^(\s*[-*+]\s(?:\[[ xX]\]\s)?|\s*\d+[.)]\s)(.*)$/))) {
      return (
        <Text key={i}>
          <Text style={{ color: t.folder }}>{m[1]}</Text>
          {m[2]}
          {nl}
        </Text>
      );
    }
    if ((m = line.match(/^(\s*>\s?)(.*)$/))) {
      return (
        <Text key={i}>
          <Text style={{ color: t.textMuted }}>{m[1]}</Text>
          {m[2]}
          {nl}
        </Text>
      );
    }
    return (
      <Text key={i}>
        {line}
        {nl}
      </Text>
    );
  });
}

/**
 * Raw markdown editor (B2). The TextInput is uncontrolled-by-value: its
 * content is given as highlighted children so markers are coloured while
 * typing.
 *
 * `fill`: the field fills its parent and scrolls itself (phones). The parent ends above the keyboard and
 * the toolbar, so the system keeps the caret's line in view right where the text is visible, without the
 * field growing inside an outer ScrollView. Otherwise it grows with the text (tablet, synced with the preview).
 */
export function SourceEditor({
  value,
  onChange,
  fill,
  style,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  fill?: boolean;
  style?: StyleProp<TextStyle>;
  ref?: Ref<SourceEditorHandle>;
}) {
  const t = useTheme();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const sel = useRef({ start: 0, end: 0 });

  const setCaret = (start: number, end = start) => {
    sel.current = { start, end };
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelection?.(start, end); // not on web
    });
  };

  useImperativeHandle(ref, () => ({
    wrap(prefix, suffix, placeholder = '') {
      const { start, end } = sel.current;
      const inner = value.slice(start, end) || placeholder;
      onChange(value.slice(0, start) + prefix + inner + suffix + value.slice(end));
      setCaret(start + prefix.length + inner.length + (start === end && !placeholder ? 0 : suffix.length));
    },
    toggleLinePrefix(prefix) {
      const { start } = sel.current;
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const rest = value.slice(lineStart);
      const existing = rest.match(/^(#{1,6}\s|\s*[-*+]\s\[[ xX]\]\s|\s*[-*+]\s|\s*\d+[.)]\s|>\s?)/)?.[0] ?? '';
      const replacement = existing === prefix ? '' : prefix;
      onChange(value.slice(0, lineStart) + replacement + rest.slice(existing.length));
      setCaret(Math.max(lineStart, start - existing.length + replacement.length));
    },
    focus(offset) {
      setCaret(offset ?? sel.current.start);
    },
    caret: () => sel.current.start,
  }));

  const children = useMemo(() => highlight(value, t), [value, t]);

  return (
    <TextInput
      ref={input}
      multiline
      scrollEnabled={!!fill}
      onChangeText={onChange}
      onSelectionChange={(e) => (sel.current = e.nativeEvent.selection)}
      autoCorrect={false}
      autoCapitalize="none"
      spellCheck={false}
      selectionColor={t.accentText}
      cursorColor={t.accentText}
      placeholder="# Titolo"
      placeholderTextColor={t.textMuted}
      style={[styles.input, fill ? styles.fill : styles.grow, { color: t.textSecondary }, style]}
      // A web <textarea> takes plain text only: no colours there.
      {...(Platform.OS === 'web' ? { value } : { children })}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.mono,
    fontSize: 12.5,
    lineHeight: 23.75,
    padding: 0,
    textAlignVertical: 'top',
  },
  grow: { minHeight: 300 },
  fill: { flex: 1 },
});
