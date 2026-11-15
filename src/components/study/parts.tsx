import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { QuestionResult, QuestionType } from '@/api/study/types';
import { Icon, type IconName } from '@/components/icon';
import { IconWell } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { studyKind, TYPE_LABELS } from '@/lib/study-model';
import { brand, useTheme } from '@/theme';

/** Shared pieces of the study screens (design «Modalità studio»). */

export const TYPE_ICONS: Record<QuestionType, IconName> = { mc: 'multipleChoice', tf: 'trueFalse', open: 'openAnswer' };

export function sourceIcon(path: string): IconName {
  const k = studyKind(path);
  return k === 'pdf' ? 'pdf' : k === 'image' ? 'image' : 'doc';
}

/** «− 4 +» */
export function Stepper({
  value,
  min = 0,
  max,
  step = 1,
  suffix = '',
  onChange,
  disabled,
}: {
  value: number;
  min?: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const t = useTheme();
  const btn = (icon: IconName, next: number, label: string) => {
    const off = disabled || next < min || next > max;
    return (
      <Pressable
        onPress={() => {
          haptic.select();
          onChange(next);
        }}
        disabled={off}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.stepBtn, { backgroundColor: pressed ? t.fill : 'transparent', opacity: off ? 0.35 : 1 }]}>
        <Icon name={icon} size={15} color={t.text} weight="semibold" />
      </Pressable>
    );
  };
  return (
    <View style={[styles.stepper, { backgroundColor: t.fill, opacity: disabled ? 0.5 : 1 }]}>
      {btn('minus', value - step, 'Meno')}
      <Text style={[styles.stepValue, { color: t.text }]}>
        {value}
        {suffix}
      </Text>
      {btn('add', value + step, 'Più')}
    </View>
  );
}

/** Large pill button: the one primary action of a screen. */
export function BigButton({
  label,
  icon,
  trailingIcon,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  silent,
  style,
}: {
  label: string;
  icon?: IconName;
  trailingIcon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: 'primary' | 'tinted' | 'plain';
  /** The caller plays its own haptic (e.g. a success on hand-in). */
  silent?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? (disabled ? t.fill : brand.purple) : variant === 'tinted' ? t.accentSoft : 'transparent';
  const fg = variant === 'primary' ? (disabled ? t.textMuted : '#fff') : t.accentText;
  return (
    <Pressable
      onPress={() => {
        if (silent) {
          // The caller plays its own feedback.
        } else if (variant === 'primary') haptic.tap();
        else haptic.light();
        onPress();
      }}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      style={({ pressed }) => [[styles.big, { backgroundColor: bg }, style], pressed && { opacity: 0.85 }]}>
      {busy ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={17} color={fg} weight="semibold" /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '600', letterSpacing: -0.2 }}>{label}</Text>
      {trailingIcon && !busy ? <Icon name={trailingIcon} size={17} color={fg} weight="semibold" /> : null}
    </Pressable>
  );
}

/** Bar pinned under a screen's content, above the home indicator. */
export function FooterBar({ children }: { children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [keyboardUp, setKeyboardUp] = useState(false);
  // The buttons give way to the keyboard (its return key closes it and brings them back).
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  if (keyboardUp) return null;
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: t.background, borderTopColor: t.hairline }]}>{children}</View>
  );
}

export function TypeChip({ type }: { type: QuestionType }) {
  const t = useTheme();
  return (
    <View style={[styles.chip, { backgroundColor: t.accentSoft }]}>
      <Icon name={TYPE_ICONS[type]} size={13} color={t.accentText} />
      <Text style={{ color: t.accentText, fontSize: 12, fontWeight: '600' }}>{TYPE_LABELS[type]}</Text>
    </View>
  );
}

/** «lezione-04-serie.pdf · p. 6» under a question. */
export function SourceLine({ path, locator, onPress }: { path: string; locator?: string; onPress?: () => void }) {
  const t = useTheme();
  const name = path.slice(path.lastIndexOf('/') + 1);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.source} accessibilityRole={onPress ? 'link' : undefined}>
      <Icon name={sourceIcon(path)} size={14} color={t.textMuted} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: t.textMuted, fontSize: 12.5 }}>
        {name}
        {locator ? ` · ${locator}` : ''}
      </Text>
    </Pressable>
  );
}

/** Thin progress line with a count, under a header. */
export function SessionProgress({ index, total }: { index: number; total: number }) {
  const t = useTheme();
  const pct = total ? Math.min(1, index / total) : 0;
  return (
    <View style={{ height: 3, borderRadius: 3, backgroundColor: t.track, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', experimental_backgroundImage: brand.gradient, backgroundColor: brand.purple }} />
    </View>
  );
}

/** The outcome of a question as a coloured icon well. */
export function StatusIcon({ result }: { result?: QuestionResult }) {
  const t = useTheme();
  const map: Record<string, { icon: IconName; color: string; bg: string }> = {
    correct: { icon: 'checkCircle', color: t.success, bg: t.successSoft },
    partial: { icon: 'circle', color: t.warning, bg: t.fill },
    wrong: { icon: 'cancelCircle', color: t.error, bg: t.errorSoft },
    empty: { icon: 'circle', color: t.textMuted, bg: t.fill },
  };
  const m = map[result?.status ?? 'empty']!;
  return <IconWell name={m.icon} color={m.color} background={m.bg} filled />;
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, padding: 2 },
  stepBtn: { width: 32, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 28, textAlign: 'center', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  big: { height: 50, borderRadius: 25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22, borderCurve: 'continuous' },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9999 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
});
