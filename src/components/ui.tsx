import { Children, Fragment, isValidElement, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from './icon';
import { brand, fonts, useTheme } from '@/theme';

// ─── Layout ──────────────────────────────────────────────────────────────────

/** Scroll container that cooperates with native large-title headers. */
export function Screen({
  children,
  contentContainerStyle,
  ref,
  ...rest
}: ScrollViewProps & { children: ReactNode; ref?: Ref<ScrollView> }) {
  const t = useTheme();
  return (
    <ScrollView
      ref={ref}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      style={{ flex: 1, backgroundColor: t.background }}
      contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: 48 }, contentContainerStyle]}
      {...rest}>
      {children}
    </ScrollView>
  );
}

export function Centered({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.background, padding: 32 }}>
      {children}
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return (
    <Centered>
      <ActivityIndicator color={t.textMuted} />
    </Centered>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <Centered>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '600', marginBottom: 6 }}>Impossibile caricare</Text>
      <Text style={{ color: t.textSecondary, fontSize: 13, textAlign: 'center' }}>
        {error instanceof Error ? error.message : String(error)}
      </Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={{ marginTop: 16 }}>
          <Text style={{ color: t.accentText, fontSize: 16 }}>Riprova</Text>
        </Pressable>
      )}
    </Centered>
  );
}

// ─── Grouped inset list ──────────────────────────────────────────────────────

export function SectionHeader({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.header, { color: t.textMuted }, style]}>{children}</Text>;
}

export function Section({
  header,
  footer,
  children,
  inset = 57,
  style,
}: {
  header?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  /** Left inset of hairline separators (57 = after a 32pt icon well). */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const items = Children.toArray(children).filter(isValidElement);
  if (!items.length) return null;
  return (
    <View style={style}>
      {header ? <SectionHeader>{header}</SectionHeader> : null}
      <View style={[styles.group, { backgroundColor: t.cell }]}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 && <View style={[styles.separator, { marginLeft: inset, backgroundColor: t.hairline }]} />}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? <Text style={[styles.footer, { color: t.textMuted }]}>{footer}</Text> : null}
    </View>
  );
}

export function Cell({
  icon,
  title,
  subtitle,
  mono,
  strong,
  right,
  chevron,
  onPress,
  onLongPress,
  children,
  alignTop,
  titleColor,
  disabled,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  mono?: boolean;
  strong?: boolean;
  right?: ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  children?: ReactNode;
  alignTop?: boolean;
  titleColor?: string;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || (!onPress && !onLongPress)}
      style={({ pressed }) => [
        styles.cell,
        { alignItems: alignTop ? 'flex-start' : 'center', backgroundColor: pressed ? t.fill : 'transparent' },
      ]}>
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            { color: titleColor ?? t.text },
            mono && { fontFamily: fonts.mono, fontSize: 14.5 },
            strong && { fontWeight: '500' },
          ]}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={[styles.subtitle, { color: t.textSecondary }]}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </View>
      {right}
      {chevron && <Icon name="chevronRight" size={13} weight="semibold" color={t.textMuted} />}
    </Pressable>
  );
}

export function IconWell({
  name,
  color,
  background,
  size = 32,
  filled,
}: {
  name: IconName;
  color?: string;
  background?: string;
  size?: number;
  filled?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.well, { width: size, height: size, backgroundColor: background ?? t.iconWell }]}>
      <Icon name={name} size={size * 0.56} color={color ?? t.accentText} weight={filled ? 'semibold' : 'regular'} />
    </View>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

export function ProgressBar({ value, height = 4, style }: { value: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: t.track, overflow: 'hidden' }, style]}>
      <View style={{ width: `${pct}%`, height: '100%', experimental_backgroundImage: brand.gradient, backgroundColor: brand.purple }} />
    </View>
  );
}

export function Pill({
  children,
  color,
  background,
  active,
  onPress,
  size = 'sm',
}: {
  children: ReactNode;
  color?: string;
  background?: string;
  active?: boolean;
  onPress?: () => void;
  size?: 'sm' | 'md';
}) {
  const t = useTheme();
  const bg = background ?? (active ? t.accent : t.fill);
  const fg = color ?? (active ? '#fff' : t.textSecondary);
  const padding = size === 'md' ? { paddingHorizontal: 14, paddingVertical: 7 } : { paddingHorizontal: 9, paddingVertical: 3 };
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.pill, padding, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: size === 'md' ? 13 : 11, fontWeight: size === 'md' ? '500' : '600' }}>
        {children}
      </Text>
    </Pressable>
  );
}

export function Banner({
  icon,
  tone = 'info',
  children,
  style,
}: {
  icon: IconName;
  tone?: 'info' | 'neutral';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: tone === 'info' ? t.infoSoft : t.fillSubtle },
        style,
      ]}>
      <Icon name={icon} size={17} color={tone === 'info' ? t.info : t.textMuted} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: tone === 'info' ? t.textSecondary : t.textMuted }}>
        {children}
      </Text>
    </View>
  );
}

export function Mono({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[{ fontFamily: fonts.mono }, style]}>{children}</Text>;
}

export function EmptyState({ icon, title, message }: { icon: IconName; title: string; message?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
      <Icon name={icon} size={34} color={t.textMuted} />
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>{title}</Text>
      {message ? <Text style={{ color: t.textSecondary, fontSize: 13, textAlign: 'center' }}>{message}</Text> : null}
    </View>
  );
}

/** Two-line custom header title: monospaced filename + caption. */
export function HeaderTitle({ title, subtitle, mono = true, subtitleColor }: { title: string; subtitle?: string; mono?: boolean; subtitleColor?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', maxWidth: 220 }}>
      <Text numberOfLines={1} style={{ color: t.text, fontSize: mono ? 14.5 : 15, fontWeight: '600', fontFamily: mono ? fonts.mono : undefined }}>
        {title}
      </Text>
      {subtitle ? (
        <Text numberOfLines={1} style={{ color: subtitleColor ?? t.textMuted, fontSize: 11, marginTop: 1 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 12,
    letterSpacing: 0.24,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 7,
    marginHorizontal: 6,
  },
  footer: { fontSize: 12, lineHeight: 16, marginTop: 7, marginHorizontal: 6 },
  group: { borderRadius: 16, overflow: 'hidden', borderCurve: 'continuous' },
  separator: { height: StyleSheet.hairlineWidth },
  cell: { flexDirection: 'row', gap: 12, paddingHorizontal: 13, paddingVertical: 11, minHeight: 44 },
  title: { fontSize: 15.5, lineHeight: 20, letterSpacing: -0.2 },
  subtitle: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  well: { borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderCurve: 'continuous' },
  pill: { borderRadius: 9999, alignSelf: 'flex-start' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 12 },
});
