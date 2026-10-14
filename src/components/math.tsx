import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { parseInline, type Inline } from '@/lib/markdown';
import { texToSvg } from '@/lib/math';
import { fonts } from '@/theme';

// TeX glyphs have a smaller x-height than the system font: scale math up to match the text around it.
const MATH_SCALE = 1.15;
// System font metrics, in em.
const ASCENDER = 0.952;
const DESCENDER = 0.241;

/*
 * Where an inline view lands: React Native puts its bottom on the line's bottom
 * edge plus the font's descender, while the text is centered in the line, so the
 * baseline sits `CENTER_TO_BASELINE * fontSize` below the middle of the line.
 */
const CENTER_TO_BASELINE = (ASCENDER - DESCENDER) / 2;

/**
 * Line height for a block of text with inline math: each line must leave room
 * for the tallest formula above and below the baseline, or the text box clips it.
 */
export function lineHeightWithMath(source: string, fontSize: number, base: number): number {
  if (!source.includes('$') && !source.includes('\\(')) return base;
  const em = fontSize * MATH_SCALE;
  const shift = CENTER_TO_BASELINE * fontSize;
  let half = 0;
  const walk = (nodes: Inline[]) =>
    nodes.forEach((n) => {
      if (n.type === 'math') {
        const m = texToSvg(n.text, n.display);
        if (m) half = Math.max(half, m.ascent * em - shift, m.depth * em + shift);
      } else if ('children' in n) walk(n.children);
    });
  walk(parseInline(source));
  return Math.max(base, Math.ceil(2 * half) + 2);
}

/** `$…$` inside a line of text. Falls back to the TeX source when it doesn't parse. */
export function InlineMath({
  tex,
  display,
  fontSize,
  lineHeight,
  color,
}: {
  tex: string;
  display: boolean;
  fontSize: number;
  /** The line height of the text around it (from lineHeightWithMath). */
  lineHeight: number;
  color: ColorValue;
}) {
  const m = texToSvg(tex, display);
  if (!m) {
    const d = display ? '$$' : '$';
    return <Text style={{ fontFamily: fonts.mono, fontSize: fontSize - 1, color }}>{`${d}${tex}${d}`}</Text>;
  }
  const em = fontSize * MATH_SCALE;
  // From where the view lands to where the formula's baseline meets the text's.
  const offset = m.depth * em + (CENTER_TO_BASELINE + DESCENDER) * fontSize - lineHeight / 2;
  return (
    <View style={{ width: m.width * em, height: (m.ascent + m.depth) * em, transform: [{ translateY: offset }] }}>
      <SvgXml xml={m.svg} width="100%" height="100%" color={color} />
    </View>
  );
}

/** A display formula on its own line, centered; wide ones scroll sideways. `fallback` when the TeX doesn't parse. */
export function MathBlock({
  tex,
  fontSize,
  color,
  fallback,
}: {
  tex: string;
  fontSize: number;
  color: ColorValue;
  fallback: ReactNode;
}) {
  const m = texToSvg(tex, true);
  if (!m) return fallback;
  const em = fontSize * MATH_SCALE;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.block} contentContainerStyle={styles.blockContent}>
      <SvgXml xml={m.svg} width={m.width * em} height={(m.ascent + m.depth) * em} color={color} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 12 },
  blockContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 6 },
});
